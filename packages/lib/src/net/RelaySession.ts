/**
 * A place in a room on the relay (see `RelayRooms` for the protocol): open a
 * room as its host or join one by its code, then send bytes to the others by
 * peer number and hear theirs. An eventemitter3, so a component can `Listen`
 * to it. Pure - no pixi - so it runs under the plain node test runner.
 */

import { EventEmitter } from "eventemitter3";
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
    /** (reason: string) - this session is over: `"left"` (see `Leave`), `"host-left"`, or the connection's own reason for ending. Emitted once. */
    CLOSED: "closed"
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
};

export default class RelaySession extends EventEmitter {
    private peers: number[];
    private over = false;

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
        peers: number[]
    ) {
        super();
        this.peers = peers.slice();
        transport.OnMessage(message => this.Receive(message));
        transport.OnClose(reason => this.Over(reason));
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

    /** Sends `payload` to peer `to`. Does nothing once closed, or if no such peer is in the room. */
    Send(to: number, payload: Uint8Array): void {
        if (this.over) {
            return;
        }
        const bytes = new Uint8Array(payload.length + 1);
        bytes[0] = to;
        bytes.set(payload, 1);
        this.transport.Send(bytes);
    }

    /** Sends `payload` to everyone else in the room. */
    Broadcast(payload: Uint8Array): void {
        this.Send(RelayBroadcast, payload);
    }

    /** Leaves the room - which closes it, for the host - and the connection with it. */
    Leave(): void {
        if (!this.over) {
            this.Over("left");
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
                    finish(null, new RelaySession(transport, notice.code, notice.you, notice.t === "joined" ? notice.peers : []));
                }
            }));
            stops.push(transport.OnClose(reason => finish(new Error("Lost the relay (" + reason + ")."))));
            transport.Send(JSON.stringify(request));
        });
    }

    private Receive(message: Message): void {
        if (typeof message !== "string") {
            if (message.length) {
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
        this.emit(RelayEvents.CLOSED, reason);
        this.removeAllListeners();
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
