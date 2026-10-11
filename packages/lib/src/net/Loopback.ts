/**
 * Connections held in memory: a pair of transports joined to each other, a
 * relay to connect them to, and direct links between peers (`LoopbackLinks`),
 * for tests and for trying the network code with no server. Messages arrive a
 * moment after they're sent - never during `Send` - as over a real connection.
 * Wrap an end in `WithLag` to make it slow. Pure - no pixi - so it runs under
 * the plain node test runner.
 */

import { LinkMaker, PeerLinkBase } from "./PeerLink";
import { RelayConnection, RelayRooms, RelayRoomsOptions } from "./RelayRooms";
import { Message, Transport, TransportBase } from "./Transport";

class LoopbackEnd extends TransportBase {
    other: LoopbackEnd | null = null;
    private open = true;

    get IsOpen(): boolean {
        return this.open;
    }

    Send(message: Message): void {
        const other = this.other;
        if (!this.open || !other) {
            return;
        }
        // A copy, so the sender can reuse its bytes, as it could after a WebSocket's send.
        const copy = typeof message === "string" ? message : message.slice();
        Later(() => other.Deliver(copy));
    }

    Close(): void {
        if (!this.open) {
            return;
        }
        this.open = false;
        const other = this.other;
        Later(() => this.End("closed"));
        if (other) {
            other.open = false;
            Later(() => other.End("closed by the other end"));
        }
    }
}

/** Runs `fn` once what's running now has finished - after the promise callbacks already waiting, in the order asked. */
function Later(fn: () => void): void {
    Promise.resolve().then(fn);
}

/** Two transports joined to each other: what's sent on one arrives on the other. */
export function LoopbackPair(): [Transport, Transport] {
    const a = new LoopbackEnd();
    const b = new LoopbackEnd();
    a.other = b;
    b.other = a;
    return [a, b];
}

/** A relay in memory, with the real one's rules (`RelayRooms`): each `Connect` is a new connection to it, like `WebSocketTransport.Connect`'s to the real one. */
export class LoopbackRelay {
    readonly rooms: RelayRooms;

    constructor(options: RelayRoomsOptions = {}) {
        this.rooms = new RelayRooms(options);
    }

    Connect(): Transport {
        const [client, server] = LoopbackPair();
        const connection: RelayConnection = this.rooms.Connect({
            SendText: text => server.Send(text),
            SendBytes: bytes => server.Send(bytes),
            Close: () => server.Close()
        });
        server.OnMessage(message => (typeof message === "string" ? connection.Text(message) : connection.Bytes(message)));
        server.OnClose(() => connection.Closed());
        return client;
    }
}

export type LoopbackLinkOptions = {
    /** Links never open, as between two machines that can't reach each other directly. */
    unreachable?: boolean;
    /** The share of the fast lane's messages lost on the way, 0 to 1 - 0 by default. */
    fastLoss?: number;
    /** `[0, 1)`, like `Math.random` (the default) - a seeded one makes a test repeat. */
    random?: () => number;
};

/**
 * Direct links in memory (see `PeerLink`): `Make` is the `LinkMaker` for every peer of a room, and the links it makes
 * find each other by their signals, as WebRTC's do - so they must be carried between the ends (`RelaySession` does).
 */
export class LoopbackLinks {
    /** Every link made, in the order made. */
    readonly links: LoopbackLink[] = [];
    private offers = new Map<number, LoopbackLink>();
    private nextOffer = 1;

    constructor(readonly options: LoopbackLinkOptions = {}) {}

    readonly Make: LinkMaker = (offer: boolean) => {
        const link = new LoopbackLink(this, offer);
        this.links.push(link);
        return link;
    };

    /** Fails every link that's open, as a network that stops letting them through - the relay is left be. */
    CutAll(): void {
        this.links.forEach(link => link.Cut());
    }

    /** Keeps an offering link to be found by the signal it sends. */
    Offer(link: LoopbackLink): number {
        const id = this.nextOffer++;
        this.offers.set(id, link);
        return id;
    }

    /** The link that offered as `id`, once - undefined if there's none. */
    TakeOffer(id: number): LoopbackLink | undefined {
        const link = this.offers.get(id);
        this.offers.delete(id);
        return link;
    }
}

class LoopbackLink extends PeerLinkBase {
    private other: LoopbackLink | null = null;
    /** Closed at this end, and saying so in a moment: nothing more goes. */
    private closing = false;

    constructor(private links: LoopbackLinks, offer: boolean) {
        super();
        if (offer) {
            const id = links.Offer(this);
            Later(() => this.Emit(JSON.stringify({ offer: id })));
        }
    }

    Signal(signal: string): void {
        const said = JSON.parse(signal) as { offer?: number; answer?: boolean };
        if (said.offer !== undefined) {
            const other = this.links.TakeOffer(said.offer);
            if (!other || this.Ended) {
                return;
            }
            this.other = other;
            other.other = this;
            Later(() => this.Emit(JSON.stringify({ answer: true })));
        } else if (said.answer && !this.links.options.unreachable) {
            const other = this.other;
            Later(() => {
                this.Opened();
                if (other) {
                    other.Opened();
                }
            });
        }
    }

    Send(payload: Uint8Array, fast: boolean): void {
        const other = this.other;
        if (!this.IsOpen || this.closing || !other) {
            return;
        }
        const options = this.links.options;
        if (fast && options.fastLoss && (options.random || Math.random)() < options.fastLoss) {
            return;
        }
        const copy = payload.slice();
        Later(() => other.Deliver(copy, fast));
    }

    Close(): void {
        this.Finish("closed", "closed by the other end");
    }

    /** Fails at both ends. */
    Cut(): void {
        if (this.IsOpen) {
            this.Finish("failed", "failed");
        }
    }

    private Finish(here: string, there: string): void {
        if (this.Ended || this.closing) {
            return;
        }
        this.closing = true;
        const other = this.other;
        if (other) {
            other.closing = true;
        }
        Later(() => this.End(here));
        if (other) {
            Later(() => other.End(there));
        }
    }
}
