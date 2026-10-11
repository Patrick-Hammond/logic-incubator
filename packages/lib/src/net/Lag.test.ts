import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WithLag } from "./Lag";
import { LoopbackPair } from "./Loopback";
import { Message } from "./Transport";

/** Lets the loopback's own deliveries (promise callbacks) run. */
async function Flush(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

describe("WithLag", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("holds messages back by the delay, each way", async () => {
        const [a, b] = LoopbackPair();
        const lagged = WithLag(a, { delayMs: 100 });
        const atB: Message[] = [];
        const atA: Message[] = [];
        b.OnMessage(message => atB.push(message));
        lagged.OnMessage(message => atA.push(message));

        lagged.Send("out");
        await Flush();
        expect(atB).toEqual([]);
        await vi.advanceTimersByTimeAsync(100);
        expect(atB).toEqual(["out"]);

        b.Send("back");
        await Flush();
        expect(atA).toEqual([]);
        await vi.advanceTimersByTimeAsync(100);
        expect(atA).toEqual(["back"]);
    });

    it("keeps messages in order, whatever the jitter or a stall", async () => {
        const [a, b] = LoopbackPair();
        let n = 0;
        // Jitter that shrinks, so later messages would overtake if it were let them; the first stalls as if lost.
        const lagged = WithLag(a, { delayMs: 10, jitterMs: 100, lossChance: 0.5, lossDelayMs: 300, random: () => (n++ === 1 ? 0 : 0.99 - n * 0.1) });
        const heard: Message[] = [];
        b.OnMessage(message => heard.push(message));
        ["1", "2", "3", "4"].forEach(message => lagged.Send(message));
        await vi.advanceTimersByTimeAsync(1000);
        expect(heard).toEqual(["1", "2", "3", "4"]);
    });

    it("sends what's queued before closing at this end", async () => {
        const [a, b] = LoopbackPair();
        const lagged = WithLag(a, { delayMs: 50 });
        const heard: Message[] = [];
        const closed: string[] = [];
        b.OnMessage(message => heard.push(message));
        b.OnClose(reason => closed.push(reason));
        lagged.Send("bye");
        lagged.Close();
        expect(lagged.IsOpen).toBe(false);
        await vi.advanceTimersByTimeAsync(50);
        await Flush();
        expect(heard).toEqual(["bye"]);
        expect(closed.length).toBe(1);
    });

    it("hears what the other end sent before it closed", async () => {
        const [a, b] = LoopbackPair();
        const lagged = WithLag(a, { delayMs: 50 });
        const events: string[] = [];
        lagged.OnMessage(message => events.push("message " + message));
        lagged.OnClose(() => events.push("closed"));
        b.Send("last words");
        b.Close();
        await Flush();
        expect(events).toEqual([]);
        await vi.advanceTimersByTimeAsync(50);
        expect(events).toEqual(["message last words", "closed"]);
    });
});
