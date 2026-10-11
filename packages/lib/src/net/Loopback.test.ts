import { describe, expect, it } from "vitest";
import { LoopbackPair } from "./Loopback";
import { Message } from "./Transport";

/** Lets every delivery already on its way arrive. */
function Settle(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe("LoopbackPair", () => {
    it("carries messages from each end to the other, after Send returns", async () => {
        const [a, b] = LoopbackPair();
        const atA: Message[] = [];
        const atB: Message[] = [];
        a.OnMessage(message => atA.push(message));
        b.OnMessage(message => atB.push(message));
        a.Send("to b");
        b.Send(new Uint8Array([4, 5]));
        expect(atB).toEqual([]);
        await Settle();
        expect(atB).toEqual(["to b"]);
        expect(Array.from(atA[0] as Uint8Array)).toEqual([4, 5]);
    });

    it("sends a copy of the bytes, so the sender can reuse them", async () => {
        const [a, b] = LoopbackPair();
        let heard: Uint8Array | null = null;
        b.OnMessage(message => {
            heard = message as Uint8Array;
        });
        const bytes = new Uint8Array([1]);
        a.Send(bytes);
        bytes[0] = 2;
        await Settle();
        expect(Array.from(heard!)).toEqual([1]);
    });

    it("closes both ends, after what was already sent", async () => {
        const [a, b] = LoopbackPair();
        const events: string[] = [];
        b.OnMessage(message => events.push("b heard " + message));
        a.OnClose(reason => events.push("a: " + reason));
        b.OnClose(reason => events.push("b: " + reason));
        a.Send("last");
        a.Close();
        expect(a.IsOpen).toBe(false);
        expect(b.IsOpen).toBe(false);
        b.Send("too late");
        await Settle();
        expect(events).toEqual(["b heard last", "a: closed", "b: closed by the other end"]);
    });

    it("stops a listener when asked", async () => {
        const [a, b] = LoopbackPair();
        const heard: Message[] = [];
        const stop = b.OnMessage(message => heard.push(message));
        stop();
        a.Send("unheard");
        await Settle();
        expect(heard).toEqual([]);
    });
});
