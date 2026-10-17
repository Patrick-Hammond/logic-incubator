/**
 * What a chat box shows: the lines said, newest last, each headed with who said it, wrapped to the box's width; and how long each stays in
 * view while the box is closed - shown for a while, then fading out - where an open box shows them all. Time comes in as the `ms` of each
 * `Update`. Pure.
 */

/** One line of a chat: who said it (`head`, left out for a notice) and what. Colours are 0xRRGGBB or the name of one of the skin's. */
export type ChatEntry = {
    head?: string;
    text: string;
    headColour?: number | string;
    textColour?: number | string;
};

/** One row of a chat box, as drawn: the head (only on an entry's first row) and the text after it, and how faded it is (1 is fully shown). */
export type ChatRow<T extends ChatEntry = ChatEntry> = { entry: T; head: string; text: string; alpha: number };

export type ChatTiming = {
    /** How long a line stays in a closed box before it starts to fade (ms). */
    showMs: number;
    /** How long it then takes to fade out (ms). */
    fadeMs: number;
    /** How many lines are kept, oldest dropped first. */
    keep: number;
};

/** What goes between a line's head and its text. */
export const HeadSeparator = ": ";

/**
 * A line's rows at `width` (in the units `measure` gives): `head` and its separator start the first row, and the text runs on after it, a
 * row at a time, broken between words - or inside a word too long for a row of its own.
 */
export function WrapChat(head: string, text: string, width: number, measure: (text: string) => number): Array<{ head: string; text: string }> {
    const first = { head: head ? head + HeadSeparator : "", text: "" };
    const rows = [first];
    const fits = (row: { head: string }, candidate: string) => measure(row.head + candidate) <= width;
    text.split(" ").forEach(word => {
        if (!word) {
            return;
        }
        let row = rows[rows.length - 1];
        const joined = row.text ? row.text + " " + word : word;
        if (fits(row, joined)) {
            row.text = joined;
            return;
        }
        if (row.text || row.head) {
            row = { head: "", text: "" };
            rows.push(row);
            if (fits(row, word)) {
                row.text = word;
                return;
            }
        }
        for (let i = 0; i < word.length; i++) {
            if (row.text && !fits(row, row.text + word.charAt(i))) {
                row = { head: "", text: "" };
                rows.push(row);
            }
            row.text += word.charAt(i);
        }
    });
    return rows;
}

export default class ChatLog<T extends ChatEntry = ChatEntry> {
    private entries: Array<{ entry: T; age: number }> = [];

    constructor(private readonly timing: ChatTiming) {}

    /** Every line kept, oldest first. */
    get Entries(): T[] {
        return this.entries.map(kept => kept.entry);
    }

    /** Adds a line, newest - dropping the oldest past `keep`. `ageMs` is how long ago it was said: a line said long enough ago is in the log without being shown in a closed box. */
    Add(entry: T, ageMs = 0): void {
        this.entries.push({ entry, age: ageMs });
        if (this.entries.length > this.timing.keep) {
            this.entries.splice(0, this.entries.length - this.timing.keep);
        }
    }

    Clear(): void {
        this.entries = [];
    }

    /** Lets time pass. */
    Update(ms: number): void {
        this.entries.forEach(kept => (kept.age += ms));
    }

    /** How faded a line of this age is in a closed box: 1 while shown, down to 0 over the fade, 0 after. */
    AlphaAt(age: number): number {
        const { showMs, fadeMs } = this.timing;
        if (age <= showMs) {
            return 1;
        }
        return fadeMs > 0 ? Math.max(0, 1 - (age - showMs) / fadeMs) : 0;
    }

    /**
     * The last `rows` rows to draw at `width`, oldest first: every line's while the box is `open`, else only those still in view, with how
     * faded each is.
     */
    Rows(width: number, rows: number, measure: (text: string) => number, open: boolean): Array<ChatRow<T>> {
        const out: Array<ChatRow<T>> = [];
        for (let i = this.entries.length - 1; i >= 0 && out.length < rows; i--) {
            const kept = this.entries[i];
            const alpha = open ? 1 : this.AlphaAt(kept.age);
            if (alpha <= 0) {
                // Older lines have faded too.
                break;
            }
            const wrapped = WrapChat(kept.entry.head || "", kept.entry.text, width, measure);
            for (let j = wrapped.length - 1; j >= 0 && out.length < rows; j--) {
                out.push({ entry: kept.entry, head: wrapped[j].head, text: wrapped[j].text, alpha });
            }
        }
        return out.reverse();
    }
}
