import { describe, expect, it } from "vitest";
import ChatLog, { WrapChat } from "./ChatLog";

/** Every character is 1 wide. */
const measure = (text: string) => text.length;

describe("WrapChat", () => {
    it("heads the first row with who said it, and runs the text on after", () => {
        expect(WrapChat("SAM", "hi there", 20, measure)).toEqual([{ head: "SAM: ", text: "hi there" }]);
    });

    it("breaks between words, the head only on the first row", () => {
        expect(WrapChat("SAM", "one two three four", 12, measure)).toEqual([
            { head: "SAM: ", text: "one two" },
            { head: "", text: "three four" }
        ]);
    });

    it("breaks a word too long for a row of its own", () => {
        expect(WrapChat("", "abcdefghij", 4, measure)).toEqual([
            { head: "", text: "abcd" },
            { head: "", text: "efgh" },
            { head: "", text: "ij" }
        ]);
    });

    it("leaves a head alone on its row when the first word only fits on a row of its own", () => {
        expect(WrapChat("SAM", "abcdefgh", 9, measure)).toEqual([
            { head: "SAM: ", text: "" },
            { head: "", text: "abcdefgh" }
        ]);
    });

    it("makes nothing of extra spaces", () => {
        expect(WrapChat("", "  a  b ", 10, measure)).toEqual([{ head: "", text: "a b" }]);
    });
});

describe("ChatLog", () => {
    const timing = { showMs: 1000, fadeMs: 500, keep: 3 };

    it("keeps the last few lines", () => {
        const log = new ChatLog(timing);
        ["a", "b", "c", "d"].forEach(text => log.Add({ text }));
        expect(log.Entries.map(entry => entry.text)).toEqual(["b", "c", "d"]);
    });

    it("shows a closed box's lines for a while, then fades them out - where an open box shows them all", () => {
        const log = new ChatLog(timing);
        log.Add({ text: "old" });
        log.Update(1250);
        log.Add({ text: "new" });
        const closed = log.Rows(20, 5, measure, false);
        expect(closed.map(row => [row.text, row.alpha])).toEqual([["old", 0.5], ["new", 1]]);
        log.Update(500);
        expect(log.Rows(20, 5, measure, false).map(row => row.text)).toEqual(["new"]);
        expect(log.Rows(20, 5, measure, true).map(row => [row.text, row.alpha])).toEqual([["old", 1], ["new", 1]]);
    });

    it("gives the last rows that fit, oldest first, a long line's last rows among them", () => {
        const log = new ChatLog(timing);
        log.Add({ head: "A", text: "first" });
        log.Add({ head: "B", text: "one two three" });
        const rows = log.Rows(8, 2, measure, true);
        expect(rows.map(row => row.head + row.text)).toEqual(["two", "three"]);
        expect(rows[0].entry.head).toBe("B");
    });
});

describe("ChatLog's lines said before", () => {
    it("keeps a line added as long since said for an open box only", () => {
        const log = new ChatLog({ showMs: 1000, fadeMs: 500, keep: 3 });
        log.Add({ text: "before" }, Infinity);
        log.Add({ text: "now" });
        expect(log.Rows(20, 5, measure, false).map(row => row.text)).toEqual(["now"]);
        expect(log.Rows(20, 5, measure, true).map(row => row.text)).toEqual(["before", "now"]);
    });
});
