import { describe, expect, it } from "vitest";
import { ChatLength, ChatLimiter, ChatSpeaker, CleanChat, ParseChat } from "./Chat";

describe("CleanChat", () => {
    it("drops control characters, squeezes spaces, trims and cuts to length", () => {
        expect(CleanChat("  hello\u0007   there\n ")).toBe("hello there");
        expect(CleanChat("x".repeat(500))).toHaveLength(ChatLength);
    });
});

describe("ParseChat", () => {
    const names = ["Hostess", "Sam", "Big Bob", "Big"];

    it("reads a plain line as one for everyone", () => {
        expect(ParseChat(" hello all ", names, 1)).toEqual({ text: "hello all", to: null });
    });

    it("has nothing to say for a blank line", () => {
        expect(ParseChat("   ", names, 1)).toBeNull();
    });

    it("reads @name as a whisper to that seat, in any case", () => {
        expect(ParseChat("@sam over here", names, 0)).toEqual({ text: "over here", to: 1 });
        expect(ParseChat("@HOSTESS hi", names, 1)).toEqual({ text: "hi", to: 0 });
    });

    it("takes the longest name the line starts with, so a name with a space in it works", () => {
        expect(ParseChat("@Big Bob run!", names, 0)).toEqual({ text: "run!", to: 2 });
        expect(ParseChat("@Big run!", names, 0)).toEqual({ text: "run!", to: 3 });
    });

    it("doesn't take a name that's only the start of a word", () => {
        expect(ParseChat("@Samantha hi", names, 0)).toBe("No one here is called Samantha.");
    });

    it("says why a whisper can't be sent", () => {
        expect(ParseChat("@nobody hi", names, 0)).toBe("No one here is called nobody.");
        expect(ParseChat("@", names, 0)).toBe("Put a player's name after the @.");
        expect(ParseChat("@Sam hi", names, 1)).toBe("You can't whisper to yourself.");
        expect(ParseChat("@Sam   ", names, 0)).toBe("Say something after @Sam.");
    });
});

describe("ChatSpeaker", () => {
    it("heads a line with who said it, and a whisper with who it was to - the reader as YOU", () => {
        const line = { seat: 1, from: "Sam", text: "hi" };
        expect(ChatSpeaker(line, 0)).toBe("Sam");
        expect(ChatSpeaker(line, 1)).toBe("YOU");
        const whisper = { ...line, whisper: { seat: 2, name: "Ann" } };
        expect(ChatSpeaker(whisper, 0)).toBe("Sam TO Ann");
        expect(ChatSpeaker(whisper, 1)).toBe("YOU TO Ann");
        expect(ChatSpeaker(whisper, 2)).toBe("Sam TO YOU");
    });
});

describe("ChatLimiter", () => {
    it("lets each player say so many lines in a while, then more as the earliest age out", () => {
        let now = 0;
        const limiter = new ChatLimiter(3, 1000, () => now);
        expect([1, 2, 3, 4].map(() => limiter.Allow(7))).toEqual([true, true, true, false]);
        expect(limiter.Allow(8)).toBe(true);
        now = 999;
        expect(limiter.Allow(7)).toBe(false);
        now = 1000;
        expect(limiter.Allow(7)).toBe(true);
    });
});
