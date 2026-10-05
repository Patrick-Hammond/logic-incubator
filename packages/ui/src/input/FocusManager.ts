/**
 * Who has focus in a UI, and where an arrow key (or a pad's d-pad) takes it next. Widgets register as `Focusable`s; the manager keeps one focused, moves it
 * to the nearest enabled one in the direction pressed (or to the one a widget names as its neighbour), hands `accept` to the focused one, and lets a screen
 * claim `cancel` and the tab keys. Pure - it only sees rectangles - so every rule is tested without Pixi.
 *
 * Scopes keep a modal in charge: while a scope is pushed only its items can be focused or reached, `cancel` goes to it, and popping it puts focus back where
 * it was. Pointer and keyboard share one focus: hovering an item focuses it (without showing the ring), and the ring is only shown while the keyboard or pad
 * is the one being used (`SetFocusVisible`).
 */

import { Direction, IsDirection, UiAction } from "./UiAction";

export type FocusRect = { x: number; y: number; width: number; height: number };

export interface Focusable {
    /** Unique among everything registered. */
    readonly id: string;
    /** Where it is on screen (any one coordinate space, the same for every item), or null if it can't be measured now (hidden). */
    Rect(): FocusRect | null;
    Enabled(): boolean;
    /** Called as focus arrives and leaves; `visible` says whether to show a focus indication (false while the pointer is what's being used). */
    SetFocused(focused: boolean, visible: boolean): void;
    /** `accept` while focused. */
    Activate(): void;
    /** Where each direction goes from here, overriding the nearest-neighbour search. A neighbour that is disabled or not in the active scope is ignored. */
    neighbours?: Partial<Record<Direction, string>>;
    /**
     * Offered a direction before focus moves: return true if the item used it (a slider nudging its value on left and right), and focus stays. Items that don't care leave it out.
     */
    OnDirection?(direction: Direction): boolean;
}

export type FocusScopeOptions = {
    /** Moving off the last item in a direction goes round to the other side. */
    wrap?: boolean;
    /** What `cancel` does here (a modal closing); without it, `cancel` isn't handled. */
    onCancel?: () => void;
    /** What the tab keys do here; step is -1 or 1. */
    onTab?: (step: -1 | 1) => void;
    /** The item to focus when the scope is pushed (the first enabled one by default). */
    initial?: string;
};

export type FocusChange = { item: Focusable | null; visible: boolean };

const ROOT = "";
/** How much an item off to the side of the way being moved counts against it, per pixel, compared with distance along it. */
const SIDEWAYS = 3;
/**
 * How far to the side an item may be and still count as "in that direction": its gap to the side may be this many times the gap along the way (plus a little slack
 * for rows and columns that don't quite line up). Without it, pressing down on the last button of a column would jump to a button in a far column that merely sits lower.
 */
const CONE = 1.5;

type Entry = { item: Focusable; scope: string };
type Scope = { id: string; options: FocusScopeOptions; returnTo: string | null };

const center = (r: FocusRect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export default class FocusManager {
    private readonly entries: Entry[] = [];
    private readonly scopes: Scope[] = [{ id: ROOT, options: {}, returnTo: null }];
    private readonly listeners: Array<(change: FocusChange) => void> = [];
    private focused: Entry | null = null;
    private visible = false;

    /** Registers an item (in the root scope unless one is named); returns what unregisters it. */
    Register(item: Focusable, scope: string = ROOT): () => void {
        if (this.entries.some(e => e.item.id === item.id)) {
            throw new Error(`There is already a focusable called "${item.id}".`);
        }
        const entry: Entry = { item, scope };
        this.entries.push(entry);
        return () => {
            const at = this.entries.indexOf(entry);
            if (at < 0) return;
            this.entries.splice(at, 1);
            if (this.focused === entry) {
                this.focused = null;
                this.Notify();
            }
        };
    }

    get Focused(): Focusable | null {
        return this.focused ? this.focused.item : null;
    }

    get FocusVisible(): boolean {
        return this.visible;
    }

    /** Whether the scope in charge has anything registered - whether there is a UI on screen to navigate. */
    get Active(): boolean {
        const scope = this.ActiveScope.id;
        return this.entries.some(e => e.scope === scope);
    }

    /** Who is told when focus moves (or its visibility changes). Returns what stops it. */
    Subscribe(listener: (change: FocusChange) => void): () => void {
        this.listeners.push(listener);
        return () => {
            const at = this.listeners.indexOf(listener);
            if (at >= 0) this.listeners.splice(at, 1);
        };
    }

    /** Shows or hides the focus indication on the focused item - on for the keyboard and pad, off when the pointer is in use. */
    SetFocusVisible(visible: boolean): void {
        if (this.visible === visible) return;
        this.visible = visible;
        if (this.focused) this.focused.item.SetFocused(true, visible);
        this.Notify();
    }

    /** Focuses an item (by id), or nothing for null. False if there is no such item, it is disabled, or it isn't in the active scope. */
    Focus(id: string | null): boolean {
        if (id === null) {
            this.SetFocusEntry(null);
            return true;
        }
        const entry = this.entries.find(e => e.item.id === id);
        if (!entry || !entry.item.Enabled() || entry.scope !== this.ActiveScope.id) {
            return false;
        }
        this.SetFocusEntry(entry);
        return true;
    }

    /** The scope that is in charge: the last one pushed, or the root. */
    private get ActiveScope(): Scope {
        return this.scopes[this.scopes.length - 1];
    }

    /** Puts a scope in charge (a dialog opening): its items only can be reached, and focus moves into it. */
    PushScope(id: string, options: FocusScopeOptions = {}): void {
        if (id === ROOT || this.scopes.some(s => s.id === id)) {
            throw new Error(`The focus scope "${id}" is already in use.`);
        }
        this.scopes.push({ id, options, returnTo: this.focused ? this.focused.item.id : null });
        this.SetFocusEntry(null);
        const initial = options.initial !== undefined ? this.EntryIn(id, options.initial) : this.FirstIn(id);
        if (initial && this.visible) this.SetFocusEntry(initial);
    }

    /** Takes the scope out (the dialog closing) and puts focus back on what had it before, if that is still there. */
    PopScope(id: string): void {
        const at = this.scopes.findIndex(s => s.id === id);
        if (at <= 0) return;
        const scope = this.scopes[at];
        this.scopes.splice(at, this.scopes.length - at);
        this.SetFocusEntry(null);
        const back = scope.returnTo === null ? null : this.entries.find(e => e.item.id === scope.returnTo && e.scope === this.ActiveScope.id && e.item.Enabled());
        if (back) this.SetFocusEntry(back);
    }

    /** Changes how the active scope (or a named one) behaves. */
    ConfigureScope(options: FocusScopeOptions, id?: string): void {
        const scope = id === undefined ? this.ActiveScope : this.scopes.find(s => s.id === id);
        if (scope) scope.options = { ...scope.options, ...options };
    }

    /** Moves focus one step in a direction. False if nothing is there to move to. */
    Move(direction: Direction): boolean {
        const current = this.focused;
        if (!current) return false;
        const scope = this.ActiveScope;
        if (current.item.OnDirection && current.item.OnDirection(direction)) return true;

        const named = current.item.neighbours && current.item.neighbours[direction];
        if (named) {
            const target = this.EntryIn(scope.id, named);
            if (target && target.item.Enabled()) {
                this.SetFocusEntry(target);
                return true;
            }
        }

        const from = current.item.Rect();
        if (!from) return false;
        const candidates = this.entries.filter(e => e !== current && e.scope === scope.id && e.item.Enabled() && e.item.Rect());
        let best = this.Nearest(from, direction, candidates);
        if (!best && scope.options.wrap) {
            best = this.Farthest(from, direction, candidates);
        }
        if (!best) return false;
        this.SetFocusEntry(best);
        return true;
    }

    /**
     * Does what an action asks. Returns whether the UI used it (so the caller can stop the key reaching the page). With nothing focused, the first press focuses the
     * first item (and shows the ring) instead of acting. When the pointer had been in use, the first press brings the ring back: a direction also moves from the
     * item that was focused, an accept does only that - it doesn't activate something the player may not have noticed was focused.
     */
    Handle(action: UiAction): boolean {
        const scope = this.ActiveScope;
        if (action === "cancel") {
            if (!scope.options.onCancel) return false;
            scope.options.onCancel();
            return true;
        }
        if (action === "tabPrev" || action === "tabNext") {
            if (!scope.options.onTab) return false;
            scope.options.onTab(action === "tabPrev" ? -1 : 1);
            return true;
        }

        const items = this.entries.filter(e => e.scope === scope.id);
        if (!items.length) return false;

        if (!this.focused) {
            const first = scope.options.initial !== undefined ? this.EntryIn(scope.id, scope.options.initial) : this.FirstIn(scope.id);
            if (!first) return false;
            this.visible = true;
            this.SetFocusEntry(first);
            return true;
        }

        const wasVisible = this.visible;
        this.SetFocusVisible(true);
        if (action === "accept") {
            // A press that only brought the ring back isn't also an activation.
            if (wasVisible && this.focused.item.Enabled()) this.focused.item.Activate();
            return true;
        }
        if (IsDirection(action)) {
            this.Move(action);
            return true;
        }
        return false;
    }

    // ---------------------------------------------------------------------------------------------- search

    private EntryIn(scope: string, id: string): Entry | undefined {
        return this.entries.find(e => e.item.id === id && e.scope === scope);
    }

    /** The first enabled item of a scope in reading order: top to bottom, then left to right. */
    private FirstIn(scope: string): Entry | undefined {
        const items = this.entries.filter(e => e.scope === scope && e.item.Enabled() && e.item.Rect());
        items.sort((a, b) => {
            const ra = a.item.Rect() as FocusRect, rb = b.item.Rect() as FocusRect;
            return ra.y - rb.y || ra.x - rb.x;
        });
        return items[0];
    }

    /** The best of `candidates` strictly in `direction` from `from`: nearest along it, with a penalty for being off to the side. */
    private Nearest(from: FocusRect, direction: Direction, candidates: Entry[]): Entry | undefined {
        const a = center(from);
        let best: Entry | undefined;
        let bestScore = Infinity;
        candidates.forEach(entry => {
            const r = entry.item.Rect() as FocusRect;
            const c = center(r);
            const vertical = direction === "up" || direction === "down";
            const sign = direction === "down" || direction === "right" ? 1 : -1;
            // It must be beyond the current item's middle in the direction asked.
            if ((vertical ? c.y - a.y : c.x - a.x) * sign <= 0) return;
            const gap = vertical ? (sign > 0 ? r.y - (from.y + from.height) : from.y - (r.y + r.height)) : sign > 0 ? r.x - (from.x + from.width) : from.x - (r.x + r.width);
            const side = vertical ? Math.abs(c.x - a.x) - (from.width + r.width) / 2 : Math.abs(c.y - a.y) - (from.height + r.height) / 2;
            const slack = 0.5 * Math.min(from.width, from.height, r.width, r.height);
            if (Math.max(0, side) > CONE * Math.max(0, gap) + slack) return;
            const score = Math.max(0, gap) + SIDEWAYS * Math.max(0, side) + 0.001 * Math.hypot(c.x - a.x, c.y - a.y);
            if (score < bestScore) {
                bestScore = score;
                best = entry;
            }
        });
        return best;
    }

    /** Going round: the item on the opposite side, the one that is nearest in line with where we are. */
    private Farthest(from: FocusRect, direction: Direction, candidates: Entry[]): Entry | undefined {
        if (!candidates.length) return undefined;
        const a = center(from);
        const vertical = direction === "up" || direction === "down";
        const sign = direction === "down" || direction === "right" ? 1 : -1;
        // How far each is from the opposite edge of the whole set, along the axis, plus the sideways penalty.
        const along = (entry: Entry) => (vertical ? center(entry.item.Rect() as FocusRect).y : center(entry.item.Rect() as FocusRect).x) * sign;
        const edge = Math.min(...candidates.map(along));
        let best: Entry | undefined;
        let bestScore = Infinity;
        candidates.forEach(entry => {
            const r = entry.item.Rect() as FocusRect;
            const c = center(r);
            const side = vertical ? Math.abs(c.x - a.x) - (from.width + r.width) / 2 : Math.abs(c.y - a.y) - (from.height + r.height) / 2;
            const score = along(entry) - edge + SIDEWAYS * Math.max(0, side);
            if (score < bestScore) {
                bestScore = score;
                best = entry;
            }
        });
        return best;
    }

    private SetFocusEntry(entry: Entry | null): void {
        if (this.focused === entry) return;
        const previous = this.focused;
        this.focused = entry;
        if (previous) previous.item.SetFocused(false, false);
        if (entry) entry.item.SetFocused(true, this.visible);
        this.Notify();
    }

    private Notify(): void {
        const change: FocusChange = { item: this.Focused, visible: this.visible };
        this.listeners.slice().forEach(listener => listener(change));
    }
}
