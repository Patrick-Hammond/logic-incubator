import { describe, expect, it } from "vitest";
import { CleanName, DecodeMessage, EncodeMessage, LobbyMessage, NameLength } from "./NetMessages";

describe("EncodeMessage and DecodeMessage", () => {
    const messages: LobbyMessage[] = [
        { t: "hello", version: 1, name: "Sam" },
        { t: "refused", reason: "started" },
        { t: "lobby", seats: [{ peer: 0, name: "HOST", character: "witch" }, { peer: 2, name: "Sam", character: null }] },
        { t: "pick", character: "warlock" },
        { t: "pick", character: null },
        { t: "start", seed: 1234, level: { bundle: "level1", hash: "0badf00d-10", sent: false }, seats: [{ peer: 0, name: "HOST", character: "witch" }] },
        { t: "start", seed: 5, level: { bundle: null, hash: "0badf00d-10", sent: true }, seats: [] },
        { t: "need-level" }
    ];

    messages.forEach(message => {
        it("carries " + message.t + " across as it was", () => {
            expect(DecodeMessage(EncodeMessage(message))).toEqual(message);
        });
    });

    it("carries a level's bytes as they are", () => {
        const decoded = DecodeMessage(EncodeMessage({ t: "level", packed: new Uint8Array([1, 2, 3]) }));
        expect(decoded && decoded.t === "level" && Array.from(decoded.packed)).toEqual([1, 2, 3]);
    });

    it("knows nothing of a kind it hasn't heard of, or a garbled body", () => {
        expect(DecodeMessage(new Uint8Array([200, 123]))).toBeNull();
        expect(DecodeMessage(new Uint8Array([]))).toBeNull();
        const garbled = EncodeMessage({ t: "pick", character: "witch" });
        expect(DecodeMessage(garbled.subarray(0, 5))).toBeNull();
    });

    it("turns away a body missing what it needs", () => {
        const pick = new TextEncoder().encode(JSON.stringify({ character: 7 }));
        const bytes = new Uint8Array(pick.length + 1);
        bytes[0] = EncodeMessage({ t: "pick", character: null })[0];
        bytes.set(pick, 1);
        expect(DecodeMessage(bytes)).toBeNull();
    });
});

describe("CleanName", () => {
    it("trims, squeezes spaces, drops control characters and cuts to length", () => {
        expect(CleanName("  Sir   Robin\u0007 ", "X")).toBe("Sir Robin");
        expect(CleanName("A".repeat(40), "X")).toHaveLength(NameLength);
    });

    it("falls back when nothing's left", () => {
        expect(CleanName("   ", "PLAYER 2")).toBe("PLAYER 2");
    });
});
