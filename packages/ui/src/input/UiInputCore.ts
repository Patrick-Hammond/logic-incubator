/**
 * The keyboard and the gamepad as one stream of UI actions. It is fed key events and a pad snapshot each frame (by `UiSystem`, which knows Pixi and the
 * browser) and called every frame to say what fired: `emit(action, source)` for each step, with `source` saying whether the keyboard or the pad asked, so the
 * focus ring can follow whoever was used last. Everything held (a key and the pad at once count as one hold) is repeated by an `InputRepeater`.
 * Pure - no browser - so the timing and the merging are tested under node.
 */

import { ActionForKeyCode } from "./KeyMap";
import InputRepeater, { DefaultRepeat, RepeatOptions } from "./InputRepeater";
import { ActionsFromPad, PadSample } from "./PadMap";
import { InputSource, UiAction } from "./UiAction";

export default class UiInputCore {
    private readonly repeater: InputRepeater;
    /** Key codes held down, in the order they went down. */
    private readonly keys: number[] = [];
    private pad: UiAction[] = [];
    private readonly padPressed = new Set<UiAction>();
    private readonly keyPressed = new Set<UiAction>();
    private lastPadHeld = new Set<UiAction>();

    constructor(private readonly emit: (action: UiAction, source: InputSource) => void, options: RepeatOptions = DefaultRepeat) {
        this.repeater = new InputRepeater(options);
    }

    /** A key went down. True if the UI uses that key (so the caller can keep the page from also acting on it); the browser's own auto-repeat is ignored. */
    KeyDown(keyCode: number): boolean {
        const action = ActionForKeyCode(keyCode);
        if (!action) {
            return false;
        }
        if (this.keys.indexOf(keyCode) < 0) {
            this.keys.push(keyCode);
            this.keyPressed.add(action);
        }
        return true;
    }

    /** A key came up. True if the UI uses that key. */
    KeyUp(keyCode: number): boolean {
        const at = this.keys.indexOf(keyCode);
        if (at >= 0) {
            this.keys.splice(at, 1);
        }
        return ActionForKeyCode(keyCode) !== null;
    }

    /** The pad's state this frame, or null when there isn't one (no pad connected). */
    Pad(sample: PadSample | null): void {
        const held = sample ? ActionsFromPad(sample) : [];
        const now = new Set<UiAction>(held);
        held.forEach(action => {
            if (!this.lastPadHeld.has(action)) this.padPressed.add(action);
        });
        this.lastPadHeld = now;
        this.pad = held;
    }

    /** Whether anything is held right now. */
    get Busy(): boolean {
        return this.keys.length > 0 || this.pad.length > 0;
    }

    /** Advances time and emits what fired. Call once a frame, after `Pad`. */
    Update(deltaMs: number): void {
        const keyHeld = new Set<UiAction>();
        this.keys.forEach(code => {
            const action = ActionForKeyCode(code);
            if (action) keyHeld.add(action);
        });
        const held = new Set<UiAction>(keyHeld);
        this.pad.forEach(action => held.add(action));
        const pressed = new Set<UiAction>(this.keyPressed);
        this.padPressed.forEach(action => pressed.add(action));

        const fired = this.repeater.Update(held, pressed, deltaMs);
        fired.forEach(action => {
            // Whoever pressed it, or - when it is repeating - whoever is holding it.
            const fromKeys = this.keyPressed.has(action) || (keyHeld.has(action) && !this.padPressed.has(action));
            this.emit(action, fromKeys ? "keyboard" : "pad");
        });
        this.keyPressed.clear();
        this.padPressed.clear();
    }

    /** Lets go of everything (the window lost focus, so key-ups may never arrive). */
    ReleaseAll(): void {
        this.keys.length = 0;
        this.pad = [];
        this.lastPadHeld = new Set();
        this.keyPressed.clear();
        this.padPressed.clear();
        this.repeater.Reset();
    }
}
