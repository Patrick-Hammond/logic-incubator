/**
 * A lag simulator: wraps a transport so its messages take longer, by a set
 * delay plus some jitter, with now and then a stall like a lost packet being
 * sent again. Messages still arrive whole and in order, as over a WebSocket.
 * For tests, and for trying play over a slow line without one. Pure - no pixi -
 * so it runs under the plain node test runner.
 */

import { Message, Transport, TransportBase } from "./Transport";

export type LagOptions = {
    /** Added to each message, each way, in milliseconds - so one lagged end adds twice this to a round trip. */
    delayMs: number;
    /** Up to this much more, at random, in milliseconds. 0 by default. */
    jitterMs?: number;
    /** The share of messages (0 to 1) held up as if lost and sent again - and every message behind them with them. 0 by default. */
    lossChance?: number;
    /** How long such a message is held up, in milliseconds - 200 by default, about what a resend takes. */
    lossDelayMs?: number;
    /** `[0, 1)`, like `Math.random` (the default) - a seeded one makes a test repeat. */
    random?: () => number;
};

type Due = { at: number; message: Message };

/** One direction's messages, each held until its time, in the order sent. */
class Line {
    private queue: Due[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    /** When the last message queued is due - none may come out before it. */
    private last = 0;
    /** Runs once the queue is empty - see `Drain`. */
    private drained: (() => void) | null = null;

    constructor(private lag: LagOptions, private deliver: (message: Message) => void) {}

    Push(message: Message): void {
        const lag = this.lag;
        const random = lag.random || Math.random;
        let delay = lag.delayMs + (lag.jitterMs ? random() * lag.jitterMs : 0);
        if (lag.lossChance && random() < lag.lossChance) {
            delay += lag.lossDelayMs === undefined ? 200 : lag.lossDelayMs;
        }
        const at = Math.max(Date.now() + delay, this.last);
        this.last = at;
        this.queue.push({ at, message });
        if (this.queue.length === 1) {
            this.Wait();
        }
    }

    /** Runs `then` once every message queued has been passed on - at once if there are none. */
    Drain(then: () => void): void {
        if (this.queue.length) {
            this.drained = then;
        } else {
            then();
        }
    }

    Stop(): void {
        this.queue = [];
        this.drained = null;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private Wait(): void {
        this.timer = setTimeout(() => this.Pump(), Math.max(0, this.queue[0].at - Date.now()));
    }

    private Pump(): void {
        this.timer = null;
        const now = Date.now();
        while (this.queue.length && this.queue[0].at <= now) {
            this.deliver(this.queue.shift()!.message);
        }
        if (this.queue.length) {
            this.Wait();
        } else if (this.drained) {
            const drained = this.drained;
            this.drained = null;
            drained();
        }
    }
}

class LaggedTransport extends TransportBase {
    private outgoing: Line;
    private incoming: Line;
    /** Closed at this end, with messages still on their way out: they go first, as a WebSocket's would. */
    private closing = false;

    constructor(private inner: Transport, lag: LagOptions) {
        super();
        this.outgoing = new Line(lag, message => this.inner.Send(message));
        this.incoming = new Line(lag, message => this.Deliver(message));
        inner.OnMessage(message => this.incoming.Push(message));
        inner.OnClose(reason => {
            this.outgoing.Stop();
            if (this.closing) {
                this.incoming.Stop();
                this.End(reason);
            } else {
                // Closed from the other end: what it sent before closing still comes first.
                this.incoming.Drain(() => this.End(reason));
            }
        });
    }

    get IsOpen(): boolean {
        return !this.closing && this.inner.IsOpen;
    }

    Send(message: Message): void {
        if (this.IsOpen) {
            this.outgoing.Push(message);
        }
    }

    Close(): void {
        if (this.closing) {
            return;
        }
        this.closing = true;
        this.outgoing.Drain(() => this.inner.Close());
    }
}

/** `transport`, with its messages each way held up as `lag` says. Closing either closes both. */
export function WithLag(transport: Transport, lag: LagOptions): Transport {
    return new LaggedTransport(transport, lag);
}
