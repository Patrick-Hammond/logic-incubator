import { describe, expect, it } from "vitest";
import { CleanName, DecodeMessage, EncodeMessage, LobbyMessage, NameLength, UniqueName } from "./NetMessages";

describe("EncodeMessage and DecodeMessage", () => {
    const messages: LobbyMessage[] = [
        { t: "hello", version: 1, name: "Sam" },
        { t: "refused", reason: "started" },
        { t: "lobby", seats: [{ peer: 0, name: "HOST", character: "witch" }, { peer: 2, name: "Sam", character: null }] },
        { t: "pick", character: "warlock" },
        { t: "pick", character: null },
        { t: "start", seed: 1234, level: { bundle: "level1", hash: "0badf00d-10", sent: false }, seats: [{ peer: 0, name: "HOST", character: "witch" }] },
        { t: "start", seed: 5, level: { bundle: null, hash: "0badf00d-10", sent: true }, seats: [] },
        { t: "need-level" },
        { t: "say", text: "@Sam over here" },
        { t: "chat", line: { seat: 1, from: "Sam", text: "hello" } },
        { t: "chat", line: { seat: 0, from: "HOST", text: "psst", whisper: { seat: 2, name: "Ann" } } }
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

describe("a chat line", () => {
    it("is turned away when it's too long, or missing what it needs", () => {
        const kind = EncodeMessage({ t: "chat", line: { seat: 0, from: "A", text: "" } })[0];
        const encode = (fields: unknown) => {
            const body = new TextEncoder().encode(JSON.stringify(fields));
            const bytes = new Uint8Array(body.length + 1);
            bytes[0] = kind;
            bytes.set(body, 1);
            return bytes;
        };
        expect(DecodeMessage(encode({ line: { seat: 0, from: "A", text: "x".repeat(500) } }))).toBeNull();
        expect(DecodeMessage(encode({ line: { seat: 0, text: "hi" } }))).toBeNull();
        expect(DecodeMessage(encode({ line: { seat: 0, from: "A", text: "hi", whisper: { seat: 1 } } }))).toBeNull();
    });

    it("comes across with only its own fields", () => {
        const decoded = DecodeMessage(EncodeMessage({ t: "chat", line: { seat: 0, from: "A", text: "hi", extra: 1 } as never }));
        expect(decoded).toEqual({ t: "chat", line: { seat: 0, from: "A", text: "hi" } });
    });
});

describe("UniqueName", () => {
    it("keeps a name no one has, and numbers one that's taken, in any case", () => {
        expect(UniqueName("Sam", ["Ann"])).toBe("Sam");
        expect(UniqueName("Sam", ["SAM"])).toBe("Sam 2");
        expect(UniqueName("Sam", ["Sam", "Sam 2"])).toBe("Sam 3");
    });

    it("cuts a long name to make room for its number", () => {
        const long = "A".repeat(NameLength);
        expect(UniqueName(long, [long])).toBe("A".repeat(NameLength - 2) + " 2");
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
