/**
 * A `Transport` over a WebSocket - how a browser reaches the relay. Pure - no
 * pixi - so it runs under the plain node test runner (with a stand-in socket).
 */

import { Message, TransportBase } from "./Transport";

/** The parts of a browser `WebSocket` this uses - what a test stands in for. */
export interface WebSocketLike {
    binaryType: string;
    readonly readyState: number;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose: ((event: { code: number; reason: string }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    send(data: string | ArrayBufferView): void;
    close(code?: number, reason?: string): void;
}

export type WebSocketConnectOptions = {
    /** How long to wait for the connection before giving up, in milliseconds - 10 s by default. */
    timeoutMs?: number;
    /** Makes the socket - the browser's `WebSocket` by default. */
    create?: (url: string) => WebSocketLike;
};

/** `WebSocket.OPEN`. */
const Open = 1;

/** Turns a WebSocket close into a few words: the reason the other end gave, or what the code means. */
export function CloseReason(code: number, reason: string): string {
    if (reason) {
        return reason;
    }
    if (code === 1000) {
        return "closed";
    }
    if (code === 1001) {
        return "going away";
    }
    // 1006 is the browser's code for a connection that dropped without a close of its own.
    return code === 1006 ? "connection lost" : "closed (" + code + ")";
}

export default class WebSocketTransport extends TransportBase {
    private socket: WebSocketLike;

    /**
     * Connects to `url` (`ws://` or `wss://`): resolves with the transport once it's open, or rejects with an
     * `Error` if it can't be reached or doesn't answer in time.
     */
    static Connect(url: string, options: WebSocketConnectOptions = {}): Promise<WebSocketTransport> {
        const create = options.create || ((to: string) => new WebSocket(to) as unknown as WebSocketLike);
        return new Promise<WebSocketTransport>((resolve, reject) => {
            let socket: WebSocketLike;
            try {
                socket = create(url);
            } catch (error) {
                // A malformed URL throws at once.
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            socket.binaryType = "arraybuffer";
            const timer = setTimeout(() => {
                socket.onopen = socket.onclose = socket.onerror = null;
                socket.close();
                reject(new Error("No answer from " + url + "."));
            }, options.timeoutMs || 10000);
            socket.onopen = () => {
                clearTimeout(timer);
                resolve(new WebSocketTransport(socket));
            };
            // An error before opening is followed by a close; the close has the code.
            socket.onerror = () => undefined;
            socket.onclose = event => {
                clearTimeout(timer);
                reject(new Error("Couldn't connect to " + url + " (" + CloseReason(event.code, event.reason) + ")."));
            };
        });
    }

    /** Wraps a socket that's already open - see `Connect`. */
    constructor(socket: WebSocketLike) {
        super();
        this.socket = socket;
        socket.binaryType = "arraybuffer";
        socket.onopen = null;
        socket.onerror = () => undefined;
        socket.onmessage = event => this.Deliver(ToMessage(event.data));
        socket.onclose = event => this.End(CloseReason(event.code, event.reason));
    }

    get IsOpen(): boolean {
        return !this.Ended && this.socket.readyState === Open;
    }

    Send(message: Message): void {
        if (this.IsOpen) {
            this.socket.send(message);
        }
    }

    Close(): void {
        if (this.Ended) {
            return;
        }
        this.socket.onmessage = this.socket.onclose = null;
        this.socket.close(1000);
        // The socket's own close event comes later, or not at all once its handler is gone: this end is over now.
        this.End("closed");
    }
}

function ToMessage(data: unknown): Message {
    if (typeof data === "string") {
        return data;
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return String(data);
}
