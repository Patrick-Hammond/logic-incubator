/**
 * A place in a room on the relay (see `RelayRooms` for the protocol): open a
 * room as its host or join one by its code, then send bytes to the others by
 * peer number and hear theirs. Given a `LinkMaker`, each guest also sets up a
 * direct link to the host (see `PeerLink`), the relay carrying the setting up,
 * and the two talk over that once it opens - with the relay still there for
 * when it doesn't. An eventemitter3, so a component can `Listen` to it. Pure -
 * no pixi - so it runs under the plain node test runner.
 */

import { EventEmitter } from "eventemitter3";
import type { LinkMaker, LinkState, PeerLink } from "./PeerLink";
import { RelayBroadcast, RelayError, RelayHost, RelayNotice, RelayRequest, RelayVersion } from "./RelayRooms";
import { Message, Transport } from "./Transport";

/** Events a `RelaySession` emits. */
export const RelayEvents = {
    /** (from: number, payload: Uint8Array) - bytes from another peer. */
    MESSAGE: "message",
    /** (peer: number) - someone has joined the room. */
    PEER_JOINED: "peer-joined",
    /** (peer: number) - someone has left it. */
    PEER_LEFT: "peer-left",
    /** (reason: string) - this session is over: `"left"` (see `Leave`), `"host-left"`, `Drop`'s reason, or the connection's own reason for ending. Emitted once. */
    CLOSED: "closed",
    /** (peer: number) - messages to and from `peer` go by a direct link from now on (see `RelayJoinOptions.links`). */
    LINKED: "linked",
    /**
     * (peer: number, wasOpen: boolean) - the direct link to `peer` has ended, or never opened: messages go by the relay
     * again. One that was open may have lost what was on its way over it.
     */
    UNLINKED: "unlinked"
};

/**
 * The first byte of a payload that is the session's own - setting up a direct link - and never handed on: what's sent
 * through a session starts with any other.
 */
export const LinkPayload = 0xff;
/** After `LinkPayload`: a signal for the other end's link, as text. */
const LinkSignal = 1;
/** After `LinkPayload`: the sender's link has opened, and nothing more comes by the relay that the link could carry. */
const LinkSwitch = 2;
/** How long a direct link may take to open before it's given up on, and the relay carries everything, in milliseconds. */
export const LinkTimeoutMs = 10000;

/** A direct link to a peer, and how messages go by it. */
type Route = {
    link: PeerLink;
    /** Whether this end sends by the link: it has opened, and the switch has gone by the relay ahead of anything else. */
    sending: boolean;
    /** Whether the other end's switch has come by the relay: what the reliable lane brings is held until it has, as older messages may still be on their way by the relay. */
    switched: boolean;
    /** What the reliable lane brought before the switch came, in the order it came. */
    held: Uint8Array[];
    /** Whether it has ended. */
    closed: boolean;
    timer: ReturnType<typeof setTimeout> | null;
};

/** Why the relay turned a `Host` or `Join` away. */
export class RelayRefusedError extends Error {
    constructor(readonly reason: RelayError) {
        super(RefusalText(reason));
        // ES5 output loses the subclass otherwise, and `instanceof` with it.
        Object.setPrototypeOf(this, RelayRefusedError.prototype);
    }
}

/** A refusal in words a player can read. */
export function RefusalText(reason: RelayError): string {
    switch (reason) {
        case "no-room":
            return "There's no game with that code.";
        case "room-full":
            return "That game is full.";
        case "version":
            return "The relay runs another version of the game.";
        case "busy":
            return "The relay is too busy just now - try again later.";
        default:
            return "The relay didn't understand the request.";
    }
}

export type RelayJoinOptions = {
    /** How long to wait for the relay's answer, in milliseconds - 10 s by default. */
    timeoutMs?: number;
    /**
     * Makes direct links between peers (see `PeerLink`). With it a guest sets one up to the host as it joins, and the
     * host answers any guest's; once one opens, what they send each other goes by it - by the relay still if it
     * never does, or after it ends (`UNLINKED`). Both ends need it; a guest's link is to the host alone.
     */
    links?: LinkMaker;
    /** How long a link may take to open, in milliseconds - `LinkTimeoutMs` by default. */
    linkTimeoutMs?: number;
};

export default class RelaySession extends EventEmitter {
    private peers: number[];
    private over = false;
    /** Direct links, by peer. */
    private routes = new Map<number, Route>();

    /**
     * Opens a room on the relay at the other end of `transport`, for `game` (a name the relay keeps rooms
     * apart by): resolves with this session as its host once the relay has given it a code. Rejects with a
     * `RelayRefusedError`, or an `Error` if the connection ends or there's no answer; the transport is closed then.
     */
    static Host(transport: Transport, game: string, options: RelayJoinOptions = {}): Promise<RelaySession> {
        return RelaySession.Ask(transport, { t: "host", v: RelayVersion, game }, options);
    }

    /** Joins the room with `code` (as typed: any case, spaces allowed) - as `Host`, but as a guest. */
    static Join(transport: Transport, game: string, code: string, options: RelayJoinOptions = {}): Promise<RelaySession> {
        return RelaySession.Ask(transport, { t: "join", v: RelayVersion, game, code }, options);
    }

    private constructor(
        private transport: Transport,
        /** The room's code, for the host to share. */
        readonly Code: string,
        /** This end's peer number: 0 for the host (`RelayHost`), 1 to 3 for guests. */
        readonly You: number,
        peers: number[],
        private options: RelayJoinOptions
    ) {
        super();
        this.peers = peers.slice();
        transport.OnMessage(message => this.Receive(message));
        transport.OnClose(reason => this.Over(reason));
        if (options.links && You !== RelayHost) {
            this.Link(RelayHost, true);
        }
    }

    get IsHost(): boolean {
        return this.You === RelayHost;
    }

    /** Whether it's still in the room. */
    get IsOpen(): boolean {
        return !this.over;
    }

    /** Everyone else in the room, by peer number. */
    get Peers(): ReadonlyArray<number> {
        return this.peers;
    }

    /**
     * Sends `payload` to peer `to` (or everyone else, `RelayBroadcast`) - by a direct link if there's one open, else by
     * the relay. `fast` lets it go by a link's fast lane (see `PeerLink`): it may then be lost, or overtaken, so it's for
     * what's sent again soon anyway. Does nothing once closed, or if no such peer is in the room.
     */
    Send(to: number, payload: Uint8Array, fast = false): void {
        if (this.over) {
            return;
        }
        if (to === RelayBroadcast) {
            // One copy by the relay for everyone - unless some are reached directly, when each goes their own way.
            if (this.peers.some(peer => this.LinkTo(peer) === "direct")) {
                this.peers.forEach(peer => this.Send(peer, payload, fast));
            } else {
                this.ByRelay(to, payload);
            }
            return;
        }
        const route = this.routes.get(to);
        if (route && route.sending && route.link.IsOpen) {
            route.link.Send(payload, fast);
        } else {
            this.ByRelay(to, payload);
        }
    }

    /** Sends `payload` to everyone else in the room - see `Send`. */
    Broadcast(payload: Uint8Array, fast = false): void {
        this.Send(RelayBroadcast, payload, fast);
    }

    /** How messages to and from `peer` go now: by the relay, by the relay while a link is set up, or directly. */
    LinkTo(peer: number): LinkState {
        const route = this.routes.get(peer);
        if (!route || route.closed) {
            return "relay";
        }
        return route.sending && route.link.IsOpen ? "direct" : "linking";
    }

    /** Leaves the room - which closes it, for the host - and the connection with it. */
    Leave(): void {
        if (!this.over) {
            this.Over("left");
            this.transport.Close();
        }
    }

    /**
     * Lets go of a connection taken for lost - one that has gone quiet - without leaving the room as such: `CLOSED`
     * hears `reason`, as it would the connection's own, so whoever is listening may try to get back in.
     */
    Drop(reason: string): void {
        if (!this.over) {
            this.Over(reason);
            this.transport.Close();
        }
    }

    /** Sends the opening request and waits for the relay's answer. */
    private static Ask(transport: Transport, request: RelayRequest, options: RelayJoinOptions): Promise<RelaySession> {
        return new Promise<RelaySession>((resolve, reject) => {
            const stops: Array<() => void> = [];
            let timer: ReturnType<typeof setTimeout> | null = null;
            const finish = (fail: Error | null, session?: RelaySession) => {
                if (timer === null) {
                    return;
                }
                clearTimeout(timer);
                timer = null;
                stops.forEach(stop => stop());
                if (fail) {
                    transport.Close();
                    reject(fail);
                } else {
                    resolve(session!);
                }
            };
            timer = setTimeout(() => finish(new Error("The relay didn't answer.")), options.timeoutMs || 10000);
            stops.push(transport.OnMessage(message => {
                const notice = typeof message === "string" ? ParseNotice(message) : null;
                if (!notice) {
                    return;
                }
                if (notice.t === "error") {
                    finish(new RelayRefusedError(notice.error));
                } else if (notice.t === "hosted" || notice.t === "joined") {
                    // Made here, in the same moment as the answer, so it hears whatever comes next on the connection.
                    finish(null, new RelaySession(transport, notice.code, notice.you, notice.t === "joined" ? notice.peers : [], options));
                }
            }));
            stops.push(transport.OnClose(reason => finish(new Error("Lost the relay (" + reason + ")."))));
            transport.Send(JSON.stringify(request));
        });
    }

    private Receive(message: Message): void {
        if (typeof message !== "string") {
            if (message.length > 1 && message[1] === LinkPayload) {
                this.LinkSays(message[0], message.subarray(2));
            } else if (message.length) {
                this.emit(RelayEvents.MESSAGE, message[0], message.subarray(1));
            }
            return;
        }
        const notice = ParseNotice(message);
        if (!notice) {
            return;
        }
        if (notice.t === "peer-joined") {
            if (this.peers.indexOf(notice.peer) < 0) {
                this.peers.push(notice.peer);
                this.peers.sort((a, b) => a - b);
            }
            this.emit(RelayEvents.PEER_JOINED, notice.peer);
        } else if (notice.t === "peer-left") {
            this.peers = this.peers.filter(peer => peer !== notice.peer);
            this.Unlink(notice.peer);
            this.emit(RelayEvents.PEER_LEFT, notice.peer);
        } else if (notice.t === "closed") {
            this.Over(notice.reason);
        }
    }

    private Over(reason: string): void {
        if (this.over) {
            return;
        }
        this.over = true;
        this.peers = [];
        Array.from(this.routes.keys()).forEach(peer => this.Unlink(peer));
        this.emit(RelayEvents.CLOSED, reason);
        this.removeAllListeners();
    }

    /** Sends `payload` to `to` by the relay, whatever links there are. */
    private ByRelay(to: number, payload: Uint8Array): void {
        const bytes = new Uint8Array(payload.length + 1);
        bytes[0] = to;
        bytes.set(payload, 1);
        this.transport.Send(bytes);
    }

    /** Sends the other end of the link to `peer` one of the session's own messages about it, by the relay. */
    private SayToLink(peer: number, kind: number, text = ""): void {
        const body = new TextEncoder().encode(text);
        const payload = new Uint8Array(body.length + 2);
        payload[0] = LinkPayload;
        payload[1] = kind;
        payload.set(body, 2);
        this.ByRelay(peer, payload);
    }

    /** One of the session's own messages from `from`, about the link between them (after its `LinkPayload`). */
    private LinkSays(from: number, said: Uint8Array): void {
        if (this.over || !said.length) {
            return;
        }
        if (said[0] === LinkSignal) {
            let route = this.routes.get(from);
            if (!route) {
                // Only the host answers, and only a guest's offer: links run between a guest and the host.
                if (!this.options.links || !this.IsHost || this.peers.indexOf(from) < 0) {
                    return;
                }
                route = this.Link(from, false);
            }
            route.link.Signal(new TextDecoder().decode(said.subarray(1)));
        } else if (said[0] === LinkSwitch) {
            const route = this.routes.get(from);
            if (route && !route.switched) {
                route.switched = true;
                route.held.splice(0).forEach(payload => this.emit(RelayEvents.MESSAGE, from, payload));
            }
        }
    }

    /** Sets up a direct link to `peer`: as the end that offers it (a guest, to the host), or that answers. */
    private Link(peer: number, offer: boolean): Route {
        const link = this.options.links!(offer);
        const route: Route = { link, sending: false, switched: false, held: [], closed: false, timer: null };
        this.routes.set(peer, route);
        const current = () => !this.over && this.routes.get(peer) === route;
        link.OnSignal(signal => current() && this.SayToLink(peer, LinkSignal, signal));
        link.OnOpen(() => {
            if (!current()) {
                return;
            }
            Stop(route);
            // By the relay, ahead of anything by the link: the other end holds what the link brings till this comes.
            this.SayToLink(peer, LinkSwitch);
            route.sending = true;
            this.emit(RelayEvents.LINKED, peer);
        });
        link.OnMessage((payload, fast) => {
            if (!current()) {
                return;
            }
            if (fast || route.switched) {
                this.emit(RelayEvents.MESSAGE, peer, payload);
            } else {
                route.held.push(payload);
            }
        });
        link.OnClose(() => {
            if (!current() || route.closed) {
                return;
            }
            const wasOpen = route.sending;
            route.closed = true;
            route.sending = false;
            Stop(route);
            this.emit(RelayEvents.UNLINKED, peer, wasOpen);
        });
        route.timer = setTimeout(() => {
            route.timer = null;
            if (!link.IsOpen) {
                link.Close();
            }
        }, this.options.linkTimeoutMs || LinkTimeoutMs);
        return route;
    }

    /** Lets go of the link to `peer`, if there is one - they've left, or this session is over. */
    private Unlink(peer: number): void {
        const route = this.routes.get(peer);
        if (route) {
            this.routes.delete(peer);
            route.closed = true;
            Stop(route);
            route.link.Close();
        }
    }
}

function Stop(route: Route): void {
    if (route.timer !== null) {
        clearTimeout(route.timer);
        route.timer = null;
    }
}

function ParseNotice(text: string): RelayNotice | null {
    try {
        const notice = JSON.parse(text);
        return notice && typeof notice.t === "string" ? notice : null;
    } catch {
        return null;
    }
}
