import { Container } from "pixi.js";
import type Game from "@logic-incubator/lib/game/Game";
import UiControl from "../widgets/UiControl";
import UiScrollView from "../widgets/UiScrollView";
import UiTabs from "../widgets/UiTabs";
import UiTheme from "../UiTheme";
import FocusManager, { Focusable, FocusScopeOptions } from "./FocusManager";
import FocusRing from "./FocusRing";
import { PadSample } from "./PadMap";
import { Direction, InputSource, UiAction } from "./UiAction";
import UiInputCore from "./UiInputCore";

const FALLBACK_FOCUS_COLOUR = 0xffd866;
const PAD = 0;
const PAD_DEAD_ZONE = 0.5;
const MAX_FRAME_MS = 250;
/** How far one wheel notch (about 100 screen pixels) scrolls a view, as a fraction of those pixels at the UI scale. */
const WHEEL_FACTOR = 0.5;
const LINE_PIXELS = 16;

/** Anything that needs to be told how much time has passed (a dialogue typing, toasts fading, a text field's caret). */
export interface UiUpdatable {
    Update(ms: number): void;
}

/**
 * Wires a UI layer to the player's hands: it feeds the keyboard, the first gamepad and the pointer into a `FocusManager`, keeps a `FocusRing` on whatever has focus
 * while the keyboard or pad is the one in use, and registers widgets with the manager. One lives for as long as the screen whose UI it drives (a scene makes it in
 * `OnInitialise` and `Destroy`s it with `Own`); a screen with a modal on top pushes a scope on `focus`.
 *
 * Keys go through lib's `Keyboard` events (it owns `document.onkeydown`), so nothing here competes for them; a key the UI uses is kept from the page (so the arrows
 * don't scroll it) only while there is something on screen to focus, and a held key is let go when the window loses focus.
 */
export default class UiSystem {
    readonly focus = new FocusManager();
    private readonly core: UiInputCore;
    private readonly ring: FocusRing;
    private readonly cleanups: Array<() => void> = [];
    private readonly tracked: UiUpdatable[] = [];
    private readonly scrolls: UiScrollView[] = [];
    private destroyed = false;
    private active = true;
    private ids = 0;

    constructor(private readonly game: Game, theme: UiTheme, layer: Container) {
        this.core = new UiInputCore((action, source) => this.OnAction(action, source));

        const colour = theme.skin.colours.focus;
        this.ring = new FocusRing(layer, colour === undefined ? FALLBACK_FOCUS_COLOUR : colour, theme.Metric("ringGap", 2), theme.Metric("ringThickness", 2));
        layer.addChild(this.ring);
        this.cleanups.push(this.ring.Follow(this.focus));

        const keyboard = game.keyboard;
        const onKeyDown = (e: KeyboardEvent) => {
            if (!this.active || e.ctrlKey || e.altKey || e.metaKey) return;
            if (this.core.KeyDown(e.keyCode) && this.focus.Active) e.preventDefault();
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (this.active) this.core.KeyUp(e.keyCode);
        };
        keyboard.on("keydown", onKeyDown);
        keyboard.on("keyup", onKeyUp);
        this.cleanups.push(() => keyboard.off("keydown", onKeyDown), () => keyboard.off("keyup", onKeyUp));

        // The wheel scrolls the scroll view under the pointer.
        const onWheel = (e: WheelEvent) => this.OnWheel(e);
        game.view.addEventListener("wheel", onWheel, { passive: false });
        this.cleanups.push(() => game.view.removeEventListener("wheel", onWheel));

        const onBlur = () => this.core.ReleaseAll();
        window.addEventListener("blur", onBlur);
        this.cleanups.push(() => window.removeEventListener("blur", onBlur));

        // The pointer taking over hides the ring; the next key or pad press brings it back.
        const view = game.view;
        const onPointer = () => this.focus.SetFocusVisible(false);
        view.addEventListener("pointermove", onPointer);
        view.addEventListener("pointerdown", onPointer);
        this.cleanups.push(() => view.removeEventListener("pointermove", onPointer), () => view.removeEventListener("pointerdown", onPointer));

        const tick = () => {
            if (!this.active) return;
            // Real time since the last frame (`deltaMS` is a constant in Pixi 5.2.1, so a slow frame rate would stretch every delay), capped so a paused tab doesn't pass a long time at once.
            const ms = Math.min(MAX_FRAME_MS, game.ticker.elapsedMS);
            this.core.Pad(this.SamplePad());
            this.core.Update(ms);
            this.ring.Update(ms);
            this.tracked.slice().forEach(widget => widget.Update(ms));
        };
        game.ticker.add(tick);
        this.cleanups.push(() => game.ticker.remove(tick));
    }

    /**
     * Whether this UI is listening. A screen's UI exists from when the screen is built, but should only take keys and pad presses while the screen is shown: turn it
     * off on hide (it lets go of anything held and hides the ring) and on again on show.
     */
    SetActive(active: boolean): void {
        if (this.active === active) return;
        this.active = active;
        if (!active) {
            this.core.ReleaseAll();
            this.focus.SetFocusVisible(false);
        }
    }

    /**
     * Makes a control (a button, checkbox, slider, tab...) focusable: reachable by the arrows and pad, activated by accept, and focused (without the ring) while the pointer is over it.
     * Returns what undoes that. A control that uses a direction itself (a slider's left and right) gets it before focus moves.
     */
    Register(button: UiControl, options: { scope?: string; neighbours?: Partial<Record<Direction, string>>; id?: string; scroll?: UiScrollView } = {}): () => void {
        const id = options.id || `control${++this.ids}`;
        const item: Focusable = {
            id,
            neighbours: options.neighbours,
            Rect: () => (button.worldVisible && button.parent ? this.GlobalRect(button) : null),
            Enabled: () => button.Enabled && button.worldVisible,
            SetFocused: (focused, visible) => {
                button.Focused = focused && visible;
                // Moving to an item that is scrolled out of view brings it in (not for the pointer hovering, which would move what is under it).
                if (focused && visible && options.scroll) options.scroll.EnsureVisible(button);
            },
            Activate: () => button.Activate(),
            OnDirection: direction => button.OnDirection(direction)
        };
        const unregister = this.focus.Register(item, options.scope);
        const onOver = () => this.focus.Focus(id);
        button.on("pointerover", onOver);
        const off = () => {
            button.off("pointerover", onOver);
            button.off("destroyed", off);
            unregister();
        };
        button.on("destroyed", off);
        return off;
    }

    /** Has `widget.Update(ms)` called every frame (real time since the last, capped) while this UI is active. Returns what stops it. */
    Track(widget: UiUpdatable): () => void {
        this.tracked.push(widget);
        return () => {
            const at = this.tracked.indexOf(widget);
            if (at >= 0) this.tracked.splice(at, 1);
        };
    }

    /** Lets the mouse wheel scroll `view` while the pointer is over it. Returns what stops it. */
    RegisterScroll(view: UiScrollView): () => void {
        this.scrolls.push(view);
        const off = () => {
            const at = this.scrolls.indexOf(view);
            if (at >= 0) this.scrolls.splice(at, 1);
            view.off("destroyed", off);
        };
        view.on("destroyed", off);
        return off;
    }

    /** Makes the tab keys (Q and E, the pad's shoulder buttons) step through `tabs` while `scope` (the screen, by default) is in charge. */
    BindTabs(tabs: UiTabs, scope?: string): void {
        this.focus.ConfigureScope({ onTab: step => tabs.Step(step) }, scope);
    }

    /** A modal (or any screen that takes over) starts: only its items can be reached until `PopScope`. */
    PushScope(id: string, options?: FocusScopeOptions): void {
        this.focus.PushScope(id, options);
    }

    PopScope(id: string): void {
        this.focus.PopScope(id);
    }

    Destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.cleanups.splice(0).forEach(cleanup => cleanup());
        this.core.ReleaseAll();
        this.ring.destroy();
    }

    private OnWheel(e: WheelEvent): void {
        if (!this.active || !this.scrolls.length) return;
        const rect = this.game.view.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        // The pointer in canvas pixels, which is what a display object's bounds are in.
        const x = (e.clientX - rect.left) * (this.game.view.width / rect.width);
        const y = (e.clientY - rect.top) * (this.game.view.height / rect.height);
        // The one drawn last is on top.
        for (let i = this.scrolls.length - 1; i >= 0; i--) {
            const view = this.scrolls[i];
            if (!view.worldVisible || !view.Scrollable || !view.ContainsGlobal(x, y)) continue;
            const pixels = e.deltaMode === 1 ? e.deltaY * LINE_PIXELS : e.deltaMode === 2 ? e.deltaY * view.ViewHeight : e.deltaY;
            view.ScrollBy((pixels / (view.worldTransform.d || 1)) * WHEEL_FACTOR);
            e.preventDefault();
            return;
        }
    }

    private OnAction(action: UiAction, source: InputSource): void {
        if (source === "pointer") return;
        this.focus.Handle(action);
    }

    private GlobalRect(button: UiControl) {
        const bounds = button.getBounds();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }

    /** The first gamepad as the kit reads it, or null when there isn't one. */
    private SamplePad(): PadSample | null {
        const pad = this.game.gamePad;
        if (!pad.controllers[PAD]) return null;
        const stick = pad.GetStick(PAD, 0, PAD_DEAD_ZONE);
        const dpad = pad.GetDPad(PAD);
        return {
            button: index => {
                const button = pad.GetButton(PAD, index);
                return !!(button && button.pressed);
            },
            stick: stick ? { x: stick.x, y: stick.y } : { x: 0, y: 0 },
            dpad: dpad || "none"
        };
    }
}
