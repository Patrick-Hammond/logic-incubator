import { Container, Rectangle } from "pixi.js";
import { Direction } from "../input/UiAction";
import { ButtonState } from "../skin/Skin";
import { ButtonStateOf } from "./ButtonLook";

/**
 * The part every pressable widget shares: pointer hover, press and release, a disabled state that ignores all of it, focus from the keyboard or pad, and the brief pressed
 * look when it is activated without the pointer. It decides the *state* (see `ButtonStateOf`) and calls `Redraw` when it changes; a subclass draws it, and decides what a press
 * does by overriding `Trigger` (a button emits `activate`, a checkbox toggles, a tab selects). Releasing the pointer outside the widget, or pressing a disabled one, does nothing.
 *
 * Events are `activate` (a press completed, by pointer or accept - not `click`, which Pixi emits itself on every interactive object, disabled ones included) and `focuschange`
 * (with whether it now has the keyboard or pad focus; a pointer hovering does not count) and `destroyed` (as it goes).
 */
export default abstract class UiControl extends Container {
    private hover = false;
    private pressed = false;
    private disabled = false;
    private focused = false;
    /** Showing the pressed look for a moment after a keyboard or pad activation (a pointer press shows it while held). */
    private flash = false;
    private flashTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        super();
        this.interactive = true;
        this.buttonMode = true;
        this.on("pointerover", () => this.Change({ hover: true }));
        this.on("pointerout", () => this.Change({ hover: false }));
        this.on("pointerdown", () => this.Change({ pressed: true }));
        this.on("pointerupoutside", () => this.Change({ pressed: false }));
        this.on("pointerup", () => {
            const completed = this.pressed && !this.disabled;
            this.Change({ pressed: false });
            if (completed) {
                this.Trigger();
            }
        });
    }

    /** Draws the widget for `State`. Called whenever it changes (and by the subclass once it has built itself). */
    protected abstract Redraw(): void;

    /** What a completed press does. By default: emit `activate`. */
    protected Trigger(): void {
        this.emit("activate", this);
    }

    /** Offered a direction by the focus manager before focus moves; return true to take it (a slider's steps). Most widgets don't. */
    OnDirection(_direction: Direction): boolean {
        return false;
    }

    /** The area that takes the pointer, in the widget's own pixels. */
    protected SetHitSize(width: number, height: number): void {
        this.hitArea = new Rectangle(0, 0, width, height);
    }

    get State(): ButtonState {
        return ButtonStateOf({ disabled: this.disabled, pressed: this.flash || (this.pressed && this.hover), hover: this.hover, focused: this.focused });
    }

    /** Whether the pointer is over it. */
    get Hovered(): boolean {
        return this.hover;
    }

    get Enabled(): boolean {
        return !this.disabled;
    }

    set Enabled(enabled: boolean) {
        this.Change({ disabled: !enabled });
    }

    get Focused(): boolean {
        return this.focused;
    }

    set Focused(focused: boolean) {
        this.Change({ focused });
    }

    /**
     * Presses it without the pointer - what accept does on a focused widget: it shows the pressed look for a moment and does what a press does. Nothing happens when disabled.
     */
    Activate(): void {
        if (this.disabled) {
            return;
        }
        this.flash = true;
        this.Redraw();
        if (this.flashTimer !== null) {
            clearTimeout(this.flashTimer);
        }
        this.flashTimer = setTimeout(() => {
            this.flashTimer = null;
            this.flash = false;
            this.Redraw();
        }, 110);
        this.Trigger();
    }

    /** Redraws, for a subclass whose look depends on something besides the state (a checkbox's value). */
    protected Refresh(): void {
        this.Redraw();
    }

    private Change(change: { hover?: boolean; pressed?: boolean; disabled?: boolean; focused?: boolean }): void {
        const wasFocused = this.focused;
        this.hover = change.hover === undefined ? this.hover : change.hover;
        this.pressed = change.pressed === undefined ? this.pressed : change.pressed;
        this.disabled = change.disabled === undefined ? this.disabled : change.disabled;
        this.focused = change.focused === undefined ? this.focused : change.focused;
        this.interactive = !this.disabled;
        this.buttonMode = !this.disabled;
        this.Redraw();
        if (this.focused !== wasFocused) {
            this.emit("focuschange", this.focused);
        }
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        // Pixi 5.2.1 doesn't announce a destroyed object, and the focus system and tooltips need to know it has gone.
        this.emit("destroyed", this);
        if (this.flashTimer !== null) {
            clearTimeout(this.flashTimer);
            this.flashTimer = null;
        }
        super.destroy({ children: true, ...options });
    }
}
