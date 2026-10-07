import { BitmapText, Container, Graphics, interaction } from "pixi.js";
import { ButtonState, FieldSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import NineSlice from "./NineSlice";
import { CaretScroll, CaretX, Sanitise, SameState, SelectionSpan, TextRules, TextState } from "./TextInputModel";
import UiControl from "./UiControl";
import { CreateMeasure, CreateText } from "./UiText";

export type TextInputOptions = TextRules & {
    /** Shown, dimmed, while the field is empty. */
    placeholder?: string;
    /** What a screen reader calls the field. */
    label?: string;
    /** The text it starts with. */
    value?: string;
};

const BLINK_MS = 530;

/**
 * A one-line text field. The kit draws it - the frame, the text in the skin's bitmap font, the selection and the caret - and the page's own `<input>` does the editing: while the
 * field is being edited a transparent native input sits over it, so typing, IME, selection, undo and the clipboard are the browser's, and the kit only follows its value and
 * selection. Keys typed there are kept from the game (`game.keyboard` never sees them).
 *
 * Pressing the field (or accept on it) starts editing; Enter or leaving it ends it (Enter also emits `submit`; Escape emits `cancel`). Events: `change` with the new value on
 * every edit. Drive it with `Update(ms)` (`UiSystem.Track` does). Without a page to put the input in (a test) it is just a drawing of a value.
 */
export default class UiTextInput extends UiControl {
    private readonly skin: FieldSkin;
    private readonly rules: TextRules;
    private readonly measure: (text: string) => number;
    private readonly frames = new Map<string, NineSlice>();
    private current: NineSlice | null = null;
    private readonly layer = new Container();
    private readonly clip = new Graphics();
    private readonly selection = new Graphics();
    private readonly caret = new Graphics();
    private readonly text: BitmapText;
    private readonly placeholder: BitmapText;
    private readonly lineHeight: number;
    private readonly innerWidth: number;
    private native: HTMLInputElement | null = null;
    private editing = false;
    private state: TextState = { value: "", start: 0, end: 0 };
    /** Where the selection's caret end is (it is the start for a selection made backwards). */
    private caretIndex = 0;
    private scrollX = 0;
    private clock = 0;
    private anchor: number | null = null;
    private readonly label: string;
    private readonly cleanups: Array<() => void> = [];
    /** Where the press that is being released landed, so the caret goes there when editing starts; null when it was accept on a focused field. */
    private pressIndex: number | null = null;

    constructor(private readonly theme: UiTheme, variant: string, readonly FieldWidth: number, options: TextInputOptions = {}) {
        super();
        const skin = theme.skin.fields && theme.skin.fields[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no field "${variant}".`);
        }
        this.skin = skin;
        this.rules = { maxLength: options.maxLength, allowed: options.allowed };
        this.label = options.label || options.placeholder || "Text";
        this.measure = CreateMeasure(theme, skin.font);
        this.innerWidth = FieldWidth - skin.padding.left - skin.padding.right;

        this.text = CreateText(theme, "Mg", { font: skin.font, colour: skin.textColour });
        this.lineHeight = Math.ceil(this.text.textHeight);
        this.text.text = "";
        this.placeholder = CreateText(theme, options.placeholder || "", { font: skin.font, colour: skin.placeholderColour });

        this.clip.beginFill(0xffffff).drawRect(0, 0, this.innerWidth, skin.height).endFill();
        this.clip.position.set(skin.padding.left, 0);
        this.layer.mask = this.clip;
        this.layer.position.set(skin.padding.left, 0);
        this.layer.addChild(this.selection, this.placeholder, this.text, this.caret);
        this.addChild(this.layer, this.clip);
        this.SetHitSize(FieldWidth, skin.height);

        this.on("pointerdown", (e: interaction.InteractionEvent) => this.OnPress(e));
        this.on("pointermove", (e: interaction.InteractionEvent) => this.OnDrag(e));
        const release = () => (this.anchor = null);
        this.on("pointerup", release);
        this.on("pointerupoutside", release);

        if (options.value) {
            this.state = Sanitise({ value: options.value, start: options.value.length, end: options.value.length }, this.rules);
            this.caretIndex = this.state.end;
        }
        this.Redraw();
    }

    get FieldHeight(): number {
        return this.skin.height;
    }

    get Value(): string {
        return this.state.value;
    }

    /** Sets the text (cut to the field's rules), with the caret at its end. Doesn't emit `change`. */
    set Value(value: string) {
        this.Apply(Sanitise({ value, start: value.length, end: value.length }, this.rules), true);
    }

    set Placeholder(text: string) {
        this.placeholder.text = text;
        this.Redraw();
    }

    /** Whether the page's input is taking keys for it now. */
    get Editing(): boolean {
        return this.editing;
    }

    /** Starts editing: the caret goes to `index` (the end by default). Does nothing when disabled, or when there is no page to edit on. */
    Edit(index?: number): void {
        const input = this.Native();
        if (!input || !this.Enabled) {
            return;
        }
        const at = index === undefined ? this.state.value.length : Math.max(0, Math.min(this.state.value.length, index));
        input.value = this.state.value;
        input.setSelectionRange(at, at);
        this.editing = true;
        this.Place();
        input.focus({ preventScroll: true });
        this.Sync();
        this.clock = 0;
        this.Redraw();
    }

    /** Stops editing. */
    EndEdit(): void {
        if (!this.editing) {
            return;
        }
        this.editing = false;
        if (this.native) {
            this.native.blur();
        }
        this.Redraw();
        this.emit("blur", this);
    }

    /** Follows the page's input while editing (it can change without an event: a selection made with the mouse, an IME) and blinks the caret. */
    Update(ms: number): void {
        if (!this.editing) {
            return;
        }
        this.Sync();
        this.Place();
        const before = Math.floor(this.clock / BLINK_MS) % 2;
        this.clock += ms;
        if (Math.floor(this.clock / BLINK_MS) % 2 !== before) {
            this.DrawCaret();
        }
    }

    protected Trigger(): void {
        // A press that started on the field puts the caret where it landed; accept on the focused field puts it at the end.
        this.Edit(this.pressIndex === null ? undefined : this.pressIndex);
        this.pressIndex = null;
    }

    protected Redraw(): void {
        if (!this.text) {
            return;
        }
        const state: ButtonState = this.State;
        const looks = this.skin.states;
        const spec = state === "disabled" ? looks.disabled || looks.normal : this.editing || state === "focused" ? looks.focused || looks.normal : looks.normal;
        let frame = this.frames.get(spec.frame);
        if (!frame) {
            frame = new NineSlice(this.theme.Texture(spec.frame), spec, this.FieldWidth, this.skin.height);
            this.frames.set(spec.frame, frame);
            this.addChildAt(frame, 0);
        }
        if (this.current && this.current !== frame) this.current.visible = false;
        frame.visible = true;
        this.current = frame;

        const y = Math.floor((this.skin.height - this.lineHeight) / 2);
        this.text.text = this.state.value;
        this.text.position.set(-this.scrollX, y);
        this.placeholder.position.set(-this.scrollX, y);
        this.placeholder.visible = this.state.value === "";
        this.text.alpha = this.placeholder.alpha = state === "disabled" ? 0.5 : 1;

        this.selection.clear();
        const span = SelectionSpan(this.state, this.measure);
        if (span) {
            this.selection.beginFill(this.skin.selectionColour).drawRect(span.x0 - this.scrollX, y, span.x1 - span.x0, this.lineHeight).endFill();
        }
        this.DrawCaret();
    }

    private DrawCaret(): void {
        this.caret.clear();
        const on = this.editing && this.Enabled && Math.floor(this.clock / BLINK_MS) % 2 === 0;
        if (on) {
            const x = CaretX({ value: this.state.value, start: this.caretIndex, end: this.caretIndex }, this.measure) - this.scrollX;
            const y = Math.floor((this.skin.height - this.lineHeight) / 2);
            this.caret.beginFill(this.skin.caretColour).drawRect(x, y, this.theme.Metric("caretWidth", 2), this.lineHeight).endFill();
        }
    }

    /** Takes a new state for the field: scrolls to keep the caret in view, redraws, and (when `toNative`) tells the page's input. */
    private Apply(next: TextState, toNative: boolean, caret?: number): void {
        const changed = next.value !== this.state.value;
        if (SameState(next, this.state) && (caret === undefined || caret === this.caretIndex)) {
            return;
        }
        this.state = next;
        this.caretIndex = caret === undefined ? next.end : caret;
        this.scrollX = CaretScroll(CaretX({ value: next.value, start: this.caretIndex, end: this.caretIndex }, this.measure), this.innerWidth, this.scrollX, this.theme.Metric("caretMargin", 4));
        this.clock = 0;
        if (toNative && this.native) {
            this.native.value = next.value;
            this.native.setSelectionRange(next.start, next.end);
        }
        this.Redraw();
        if (changed) {
            this.emit("change", next.value, this);
        }
    }

    /** Reads the page's input; an edit the rules forbid is cut back there too. */
    private Sync(): void {
        const input = this.native;
        if (!input) {
            return;
        }
        const raw: TextState = { value: input.value, start: input.selectionStart === null ? 0 : input.selectionStart, end: input.selectionEnd === null ? 0 : input.selectionEnd };
        const clean = Sanitise(raw, this.rules);
        const backwards = input.selectionDirection === "backward";
        if (!SameState(clean, raw)) {
            // The rules cut something back: the page's input must say the same, even if the field's own text is as it was.
            input.value = clean.value;
            input.setSelectionRange(clean.start, clean.end);
        }
        this.Apply(clean, false, backwards ? clean.start : clean.end);
    }

    private OnPress(e: interaction.InteractionEvent): void {
        if (!this.Enabled) {
            return;
        }
        const index = this.IndexAt(e.data.getLocalPosition(this).x);
        this.pressIndex = index;
        this.anchor = index;
        // The caret goes where the press landed now (the page's input takes focus when the press is released: the click's own default would otherwise take it straight back).
        const input = this.Native();
        if (input) {
            input.value = this.state.value;
            input.setSelectionRange(index, index);
            this.Sync();
        }
    }

    private OnDrag(e: interaction.InteractionEvent): void {
        if (this.anchor === null || !this.native) {
            return;
        }
        const index = this.IndexAt(e.data.getLocalPosition(this).x);
        this.native.setSelectionRange(Math.min(this.anchor, index), Math.max(this.anchor, index), index < this.anchor ? "backward" : "forward");
        this.Sync();
    }

    /** The character boundary nearest to an x in the field's own pixels. */
    private IndexAt(x: number): number {
        const local = x - this.skin.padding.left + this.scrollX;
        const value = this.state.value;
        let best = 0;
        let bestDistance = Math.abs(local);
        for (let i = 1; i <= value.length; i++) {
            const width = this.measure(value.slice(0, i));
            const distance = Math.abs(local - width);
            if (distance < bestDistance) {
                best = i;
                bestDistance = distance;
            }
            if (width > local) {
                break;
            }
        }
        return best;
    }

    /** The page's input, made the first time it is needed; null when there is no page. */
    private Native(): HTMLInputElement | null {
        if (this.native) {
            return this.native;
        }
        const host = this.theme.host;
        if (!host || typeof document === "undefined") {
            return null;
        }
        const input = document.createElement("input");
        input.type = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("aria-label", this.label);
        // Invisible but live: it must not be `display: none` or it can't take focus. 16px keeps phones from zooming the page when it focuses.
        Object.assign(input.style, {
            position: "fixed",
            opacity: "0",
            border: "0",
            padding: "0",
            margin: "0",
            outline: "none",
            background: "transparent",
            pointerEvents: "none",
            fontSize: "16px",
            zIndex: "1000"
        });
        const onKeyDown = (e: KeyboardEvent) => {
            // What is typed here is the field's, not the game's.
            e.stopPropagation();
            if (e.isComposing) {
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                this.Sync();
                this.emit("submit", this.state.value, this);
                this.EndEdit();
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.emit("cancel", this);
                this.EndEdit();
            } else if (e.key === "Tab") {
                e.preventDefault();
                this.EndEdit();
            }
        };
        const onInput = () => this.Sync();
        const onBlur = () => {
            if (this.editing) {
                this.EndEdit();
            }
        };
        input.addEventListener("keydown", onKeyDown);
        input.addEventListener("keypress", stop);
        input.addEventListener("input", onInput);
        input.addEventListener("blur", onBlur);
        this.cleanups.push(() => {
            input.removeEventListener("keydown", onKeyDown);
            input.removeEventListener("keypress", stop);
            input.removeEventListener("input", onInput);
            input.removeEventListener("blur", onBlur);
            if (input.parentNode) input.parentNode.removeChild(input);
        });
        document.body.appendChild(input);
        this.native = input;
        this.Place();
        return input;
    }

    /** Puts the page's input over the field (so the browser's own caret and the mobile keyboard's scrolling find it where it is drawn). */
    private Place(): void {
        const input = this.native;
        const host = this.theme.host;
        if (!input || !host) {
            return;
        }
        const box = this.getBounds();
        const canvas = host.view.getBoundingClientRect();
        const sx = host.view.width ? canvas.width / host.view.width : 1;
        const sy = host.view.height ? canvas.height / host.view.height : 1;
        input.style.left = `${canvas.left + box.x * sx}px`;
        input.style.top = `${canvas.top + box.y * sy}px`;
        input.style.width = `${Math.max(1, box.width * sx)}px`;
        input.style.height = `${Math.max(1, box.height * sy)}px`;
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.editing = false;
        this.cleanups.splice(0).forEach(cleanup => cleanup());
        this.native = null;
        this.frames.clear();
        super.destroy(options);
    }
}

function stop(e: Event): void {
    e.stopPropagation();
}
