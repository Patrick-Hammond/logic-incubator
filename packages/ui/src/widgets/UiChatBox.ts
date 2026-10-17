import { BitmapText, Container, Graphics } from "pixi.js";
import UiTheme from "../UiTheme";
import ChatLog, { ChatEntry, ChatRow } from "./ChatLog";
import UiTextInput from "./UiTextInput";
import { CreateMeasure, CreateText, ResolveColour } from "./UiText";

export type ChatBoxOptions = {
    /** The box's width, in UI pixels. */
    width: number;
    /** How many rows of text it shows. */
    rows: number;
    /** How long a line stays in view while the box is closed before it fades, in seconds; 8 by default. */
    showSeconds?: number;
    /** How many lines it keeps; 50 by default. */
    keep?: number;
    /** The most characters a line typed in it can have; 120 by default. */
    maxLength?: number;
    /** What the field says while it's empty. */
    placeholder?: string;
    /** The skin's field the line is typed in; `default` by default. */
    field?: string;
    /** The skin's font the lines are in; `body` by default. */
    font?: string;
};

const FADE_MS = 1500;
const GAP = 4;
/** Room round the rows on the shade behind them. */
const PAD = 6;
const SHADE_ALPHA = 0.55;

/**
 * A chat box: the lines said, newest at the bottom, each headed with who said it in a colour of its own; and, while it's open, a field to
 * type the next one in. Closed, it shows only the last few lines for a while (`showSeconds`), each fading out, so it stays out of the way of
 * play; open, it shows its last `rows` rows over a shade, and the field takes the keys (the game's keyboard doesn't see them). `Open` and
 * `Close` it - typically from a key; Enter in the field emits `send` with the line (unless it's blank) and closes it, Escape just closes it,
 * and either way it emits `close`. `Add` a line to show. A character the font has no glyph for is shown as `?`. Drive it with `Update(ms)`
 * (`UiSystem.Track` does).
 */
export default class UiChatBox extends Container {
    private readonly log: ChatLog;
    private readonly measure: (text: string) => number;
    private readonly lineHeight: number;
    private readonly shade = new Graphics();
    private readonly heads: BitmapText[] = [];
    private readonly texts: BitmapText[] = [];
    private readonly field: UiTextInput;
    private readonly glyphs: { [code: number]: unknown } | null;
    private open = false;
    /** Whether what it shows has to be laid out again - a line added, time passed while closed. */
    private dirty = true;

    constructor(private readonly theme: UiTheme, private readonly options: ChatBoxOptions) {
        super();
        const font = options.font || "body";
        this.log = new ChatLog({ showMs: (options.showSeconds === undefined ? 8 : options.showSeconds) * 1000, fadeMs: FADE_MS, keep: options.keep || 50 });
        this.measure = CreateMeasure(theme, font);
        const probe = CreateText(theme, "Mg", { font });
        this.lineHeight = Math.ceil(probe.textHeight) + 2;
        probe.destroy();
        const fonts = (BitmapText as unknown as { fonts: { [name: string]: { chars: { [code: number]: unknown } } } }).fonts;
        const data = fonts && fonts[theme.FontName(font)];
        this.glyphs = data ? data.chars : null;

        this.addChild(this.shade);
        for (let i = 0; i < options.rows; i++) {
            const head = CreateText(theme, "", { font });
            const text = CreateText(theme, "", { font });
            head.y = text.y = PAD + i * this.lineHeight;
            this.heads.push(head);
            this.texts.push(text);
            this.addChild(head, text);
        }
        this.field = new UiTextInput(theme, options.field || "default", options.width, { maxLength: options.maxLength || 120, placeholder: options.placeholder, label: "Chat" });
        this.field.y = this.RowsHeight + GAP;
        this.field.visible = false;
        this.field.on("submit", (text: string) => {
            const line = text.trim();
            this.field.Value = "";
            if (line) {
                this.emit("send", line);
            }
            this.Close();
        });
        this.field.on("cancel", () => this.Close());
        // Clicking away from the field ends typing, and with it the box's turn.
        this.field.on("blur", () => this.Close());
        this.addChild(this.field);
        this.Layout();
    }

    /** The box's whole height when open - its rows and the field under them - in UI pixels. */
    get BoxHeight(): number {
        return this.RowsHeight + GAP + this.field.FieldHeight;
    }

    get IsOpen(): boolean {
        return this.open;
    }

    /** Every line it keeps, oldest first. */
    get Entries(): ChatEntry[] {
        return this.log.Entries;
    }

    /** Adds a line at the bottom - shown for a while if `show`, else only there to read when the box is opened (a line said before it was put up). */
    Add(entry: ChatEntry, show = true): void {
        this.log.Add({ ...entry, head: entry.head && this.Printable(entry.head), text: this.Printable(entry.text) }, show ? 0 : Infinity);
        this.dirty = true;
    }

    /** Forgets every line. */
    Clear(): void {
        this.log.Clear();
        this.dirty = true;
    }

    /** Opens it, ready to type in - starting with `text`, if given (an `@name ` to whisper back, say). */
    Open(text = ""): void {
        if (this.open) {
            return;
        }
        this.open = true;
        this.field.visible = true;
        this.field.Value = text;
        this.field.Edit();
        this.dirty = true;
    }

    /** Closes it: the field goes, and the lines fade as they would. Emits `close`. */
    Close(): void {
        if (!this.open) {
            return;
        }
        this.open = false;
        this.field.EndEdit();
        this.field.visible = false;
        this.dirty = true;
        this.emit("close");
    }

    Update(ms: number): void {
        this.log.Update(ms);
        this.field.Update(ms);
        // Closed, the lines fade as they age.
        if (this.dirty || !this.open) {
            this.Layout();
        }
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.field.EndEdit();
        super.destroy(options);
    }

    private get RowsHeight(): number {
        return this.options.rows * this.lineHeight + PAD * 2;
    }

    private Layout(): void {
        this.dirty = false;
        const width = this.options.width - PAD * 2;
        const rows: ChatRow[] = this.log.Rows(width, this.options.rows, this.measure, this.open);
        // Newest at the bottom: the rows fill from the last one up.
        const first = this.options.rows - rows.length;
        this.shade.clear();
        const ink = this.theme.Colour("ink");
        if (this.open) {
            this.shade.beginFill(ink, SHADE_ALPHA).drawRect(0, 0, this.options.width, this.RowsHeight).endFill();
        }
        for (let i = 0; i < this.options.rows; i++) {
            const head = this.heads[i];
            const text = this.texts[i];
            const row = rows[i - first];
            if (!row) {
                head.visible = text.visible = false;
                continue;
            }
            head.visible = text.visible = true;
            head.text = row.head;
            head.tint = ResolveColour(this.theme, row.entry.headColour === undefined ? "muted" : row.entry.headColour);
            text.text = row.text;
            text.tint = ResolveColour(this.theme, row.entry.textColour === undefined ? "text" : row.entry.textColour);
            head.x = PAD;
            text.x = PAD + this.measure(row.head);
            head.alpha = text.alpha = row.alpha;
            if (!this.open) {
                // A strip of shade behind each line keeps it readable over the game, fading with it.
                this.shade.beginFill(ink, SHADE_ALPHA * row.alpha).drawRect(0, head.y - 1, PAD * 2 + this.measure(row.head + row.text), this.lineHeight).endFill();
            }
        }
    }

    /** `text` with every character the font can't draw made a `?`. */
    private Printable(text: string): string {
        const glyphs = this.glyphs;
        if (!glyphs) {
            return text;
        }
        let out = "";
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            out += code === 32 || glyphs[code] ? text.charAt(i) : "?";
        }
        return out;
    }
}
