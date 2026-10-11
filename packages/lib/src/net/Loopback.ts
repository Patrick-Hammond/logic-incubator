/**
 * Connections held in memory: a pair of transports joined to each other, and a
 * relay to connect them to, for tests and for trying the network code with no
 * server. Messages arrive a moment after they're sent - never during `Send` -
 * as over a real connection. Wrap an end in `WithLag` to make it slow. Pure -
 * no pixi - so it runs under the plain node test runner.
 */

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
