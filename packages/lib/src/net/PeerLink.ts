/**
 * A direct connection between two peers in a room, alongside the relay - a
 * WebRTC data channel pair in a browser (`WebRtcLink`), or one held in memory
 * for tests (`LoopbackLinks`). It carries bytes in two lanes: the reliable
 * lane, whole and in order with nothing lost, as the relay does; and the fast
 * lane, which may lose a message or deliver it out of order, so a lost packet
 * never holds up the ones behind it - for what is sent again soon anyway. The
 * two ends set it up by passing signals to each other, which `RelaySession`
 * carries over the relay. Pure - no pixi - so it runs under the plain node
 * test runner.
 */

export interface PeerLink {
    /** Whether both lanes are open: from `OnOpen` until it closes. */
    readonly IsOpen: boolean;
    /** Sends `payload` to the other end, by the fast lane or the reliable one. Does nothing unless it's open. */
    Send(payload: Uint8Array, fast: boolean): void;
    /** Hands it a signal from the other end's link (see `OnSignal`). */
    Signal(signal: string): void;
    /** Calls `listener` with each signal to pass to the other end's link - an offer, an answer, a network address. Returns what stops it. */
    OnSignal(listener: (signal: string) => void): () => void;
    /** Calls `listener` once, when both lanes have opened. Returns what stops it. */
    OnOpen(listener: () => void): () => void;
    /** Calls `listener` with each message that arrives, and the lane it came by. Returns what stops it. */
    OnMessage(listener: (payload: Uint8Array, fast: boolean) => void): () => void;
    /** Calls `listener` once, when the link ends - closed at either end, failed, or never got going - with a few words on why. Returns what stops it. */
    OnClose(listener: (reason: string) => void): () => void;
    /** Ends the link; `OnClose` hears of it. Safe to call twice. */
    Close(): void;
}

/** Makes a link to another peer: the end that starts it (`offer`, a guest's to the host) and the end that answers. */
export type LinkMaker = (offer: boolean) => PeerLink;

/** How messages to and from a peer go: by the relay, by the relay while a link is being set up, or by the link. */
export type LinkState = "relay" | "linking" | "direct";

/** The bookkeeping every link shares: its listeners, and passing signals, messages and its ends to them. */
export abstract class PeerLinkBase implements PeerLink {
    private signalListeners: Array<(signal: string) => void> = [];
    private openListeners: Array<() => void> = [];
    private messageListeners: Array<(payload: Uint8Array, fast: boolean) => void> = [];
    private closeListeners: Array<(reason: string) => void> = [];
    private opened = false;
    private ended = false;

    abstract Send(payload: Uint8Array, fast: boolean): void;
    abstract Signal(signal: string): void;
    abstract Close(): void;

    get IsOpen(): boolean {
        return this.opened && !this.ended;
    }

    /** Whether it has ended and said so - nothing arrives after that. */
    protected get Ended(): boolean {
        return this.ended;
    }

    OnSignal(listener: (signal: string) => void): () => void {
        return Add(this.signalListeners, listener);
    }

    OnOpen(listener: () => void): () => void {
        return Add(this.openListeners, listener);
    }

    OnMessage(listener: (payload: Uint8Array, fast: boolean) => void): () => void {
        return Add(this.messageListeners, listener);
    }

    OnClose(listener: (reason: string) => void): () => void {
        return Add(this.closeListeners, listener);
    }

    /** Passes a signal for the other end on to whoever carries it. */
    protected Emit(signal: string): void {
        if (!this.ended) {
            this.signalListeners.slice().forEach(listener => listener(signal));
        }
    }

    /** Both lanes are open: tells the open listeners, once. */
    protected Opened(): void {
        if (this.opened || this.ended) {
            return;
        }
        this.opened = true;
        const listeners = this.openListeners.slice();
        this.openListeners = [];
        listeners.forEach(listener => listener());
    }

    /** Hands a message that has arrived to every listener - unless the link has ended. */
    protected Deliver(payload: Uint8Array, fast: boolean): void {
        if (!this.ended) {
            this.messageListeners.slice().forEach(listener => listener(payload, fast));
        }
    }

    /** The link is over: tells the close listeners, once, and drops every listener. */
    protected End(reason: string): void {
        if (this.ended) {
            return;
        }
        this.ended = true;
        const listeners = this.closeListeners.slice();
        this.signalListeners = [];
        this.openListeners = [];
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
