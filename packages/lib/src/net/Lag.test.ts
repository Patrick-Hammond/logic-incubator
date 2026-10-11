import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WithLag, WithLinkLag } from "./Lag";
import { LoopbackLinks, LoopbackPair } from "./Loopback";
import type { LagOptions } from "./Lag";
import type { PeerLink } from "./PeerLink";
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

describe("WithLinkLag", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Two ends of a link in memory, the first slowed by `lag`, open and passing their signals to each other. */
    async function Linked(lag: LagOptions): Promise<[PeerLink, PeerLink]> {
        const links = new LoopbackLinks();
        const lagged = WithLinkLag(links.Make(true), lag);
        const other = links.Make(false);
        lagged.OnSignal(signal => other.Signal(signal));
        other.OnSignal(signal => lagged.Signal(signal));
        await Flush();
        expect(lagged.IsOpen && other.IsOpen).toBe(true);
        return [lagged, other];
    }

    function Heard(link: PeerLink): string[] {
        const heard: string[] = [];
        link.OnMessage((payload, fast) => heard.push((fast ? "fast " : "") + payload[0]));
        return heard;
    }

    it("holds both lanes back by the delay, each way", async () => {
        const [lagged, other] = await Linked({ delayMs: 100 });
        const atOther = Heard(other);
        const atLagged = Heard(lagged);
        lagged.Send(new Uint8Array([1]), false);
        lagged.Send(new Uint8Array([2]), true);
        other.Send(new Uint8Array([3]), true);
        await Flush();
        expect(atOther).toEqual([]);
        expect(atLagged).toEqual([]);
        await vi.advanceTimersByTimeAsync(100);
        await Flush();
        expect(atOther).toEqual(["1", "fast 2"]);
        expect(atLagged).toEqual(["fast 3"]);
    });

    it("keeps the reliable lane in order through a stall, while the fast lane loses and is overtaken", async () => {
        let n = 0;
        // The first of each lane is unlucky - stalled on the reliable lane, lost on the fast one - and the jitter shrinks
        // after it, so later ones would overtake. The reliable lane asks for jitter then loss; the fast lane, loss then jitter.
        const random = () => [0.9, 0.1, 0.5, 0.9, 0.1, 0.9, 0.1, 0.9, 0.9, 0.9, 0.1][n++];
        const [lagged, other] = await Linked({ delayMs: 10, jitterMs: 100, lossChance: 0.5, lossDelayMs: 300, random });
        const heard = Heard(other);
        [1, 2, 3].forEach(i => lagged.Send(new Uint8Array([i]), false));
        await vi.advanceTimersByTimeAsync(1000);
        await Flush();
        expect(heard).toEqual(["1", "2", "3"]);

        heard.splice(0);
        [4, 5, 6].forEach(i => lagged.Send(new Uint8Array([i]), true));
        await vi.advanceTimersByTimeAsync(1000);
        await Flush();
        expect(heard).toEqual(["fast 6", "fast 5"]);
    });

    it("closes as its link does", async () => {
        const [lagged, other] = await Linked({ delayMs: 50 });
        const closed: string[] = [];
        lagged.OnClose(reason => closed.push(reason));
        other.Close();
        await Flush();
        expect(closed).toEqual(["closed by the other end"]);
        expect(lagged.IsOpen).toBe(false);
    });
});
