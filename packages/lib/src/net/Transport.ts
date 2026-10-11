/**
 * A connection that carries whole messages, in order, between two ends - a
 * WebSocket to the relay (`WebSocketTransport`), or one held in memory for
 * tests (`LoopbackPair`). What sits on top (`RelaySession`, a game's lobby)
 * sees only this, so the kind of connection can change without it. Pure - no
 * pixi - so it runs under the plain node test runner.
 */

/** A message as it travels: text, or bytes. */
export type Message = string | Uint8Array;

export interface Transport {
    /** Whether messages can be sent and will arrive - from when it's connected until it closes. */
    readonly IsOpen: boolean;
    /** Sends a message to the other end. Messages arrive whole and in the order sent. Does nothing once closed. */
    Send(message: Message): void;
    /** Calls `listener` with each message that arrives, text as a string and bytes as bytes. Returns what stops it. */
    OnMessage(listener: (message: Message) => void): () => void;
    /** Calls `listener` once, when the connection ends - closed at either end, or lost - with a few words on why. Returns what stops it. */
    OnClose(listener: (reason: string) => void): () => void;
    /** Ends the connection; `OnClose` hears of it at both ends. Safe to call twice. */
    Close(): void;
}

/** The bookkeeping every transport shares: its listeners, and passing messages and its end to them. */
export abstract class TransportBase implements Transport {
    private messageListeners: Array<(message: Message) => void> = [];
    private closeListeners: Array<(reason: string) => void> = [];
    private ended = false;

    abstract get IsOpen(): boolean;
    abstract Send(message: Message): void;
    abstract Close(): void;

    /** Whether it has ended and said so - nothing arrives after that. */
    protected get Ended(): boolean {
        return this.ended;
    }

    OnMessage(listener: (message: Message) => void): () => void {
        return Add(this.messageListeners, listener);
    }

    OnClose(listener: (reason: string) => void): () => void {
        return Add(this.closeListeners, listener);
    }

    /** Hands a message that has arrived to every listener - unless the connection has already ended. */
    protected Deliver(message: Message): void {
        if (!this.ended) {
            this.messageListeners.slice().forEach(listener => listener(message));
        }
    }

    /** The connection is over: tells the close listeners, once, and drops every listener. */
    protected End(reason: string): void {
        if (this.ended) {
            return;
        }
        this.ended = true;
        const listeners = this.closeListeners.slice();
        this.messageListeners = [];
        this.closeListeners = [];
        listeners.forEach(listener => listener(reason));
    }
}

function Add<T>(list: T[], item: T): () => void {
    list.push(item);
    return () => {
        const at = list.indexOf(item);
        if (at >= 0) {
            list.splice(at, 1);
        }
    };
}
