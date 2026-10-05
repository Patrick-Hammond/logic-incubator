/**
 * Text coming out a few characters at a time, as in a dialogue box, and wrapping text to a width. The typewriter counts characters by time; `WrapText` breaks lines
 * (on spaces, and at the width a measuring function gives) *before* anything is revealed, so words don't jump a line as they appear. Pure.
 */

export class Typewriter {
    private shown = 0;
    private carry = 0;

    constructor(private readonly length: number, private readonly charactersPerSecond: number) {}

    /** How many characters are showing. */
    get Visible(): number {
        return this.shown;
    }

    get Done(): boolean {
        return this.shown >= this.length;
    }

    /** Lets `ms` pass; returns how many characters appeared. */
    Update(ms: number): number {
        if (this.Done || !(this.charactersPerSecond > 0)) {
            return 0;
        }
        this.carry += (ms / 1000) * this.charactersPerSecond;
        const whole = Math.floor(this.carry);
        this.carry -= whole;
        const before = this.shown;
        this.shown = Math.min(this.length, this.shown + whole);
        return this.shown - before;
    }

    /** Shows everything at once. */
    Skip(): void {
        this.shown = this.length;
        this.carry = 0;
    }
}

/**
 * `text` broken into lines no wider than `maxWidth` by `measure`, joined with newlines. Existing newlines are kept; words are never split unless one alone is wider than the line,
 * in which case it gets a line to itself (and overflows).
 */
export function WrapText(text: string, maxWidth: number, measure: (text: string) => number): string {
    return text
        .split("\n")
        .map(paragraph => {
            const lines: string[] = [];
            let line = "";
            paragraph.split(" ").forEach(word => {
                const candidate = line ? line + " " + word : word;
                if (line && measure(candidate) > maxWidth) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            });
            lines.push(line);
            return lines.join("\n");
        })
        .join("\n");
}
