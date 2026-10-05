/**
 * The life of toast notifications: each one slides in, stays, and fades out; a limit on how many show at once makes the rest wait their turn. Time comes in as the `ms` of each
 * `Update`; what the host draws is `Active` (each toast's phase and how far through it is). Pure.
 */

export type ToastPhase = "in" | "show" | "out";

export type ActiveToast<T> = {
    id: number;
    item: T;
    phase: ToastPhase;
    /** How far through the phase, 0 to 1. */
    progress: number;
};

export type ToastTiming = {
    /** How long one stays fully shown (ms); 0 or less stays until dismissed. */
    showMs: number;
    /** How long sliding in and fading out each take (ms). */
    fadeMs: number;
    /** How many show at once; the rest wait. */
    max: number;
};

type Entry<T> = { id: number; item: T; age: number; showMs: number; dismissed: boolean };

export default class ToastQueue<T> {
    private readonly waiting: Array<{ id: number; item: T; showMs: number }> = [];
    private readonly showing: Array<Entry<T>> = [];
    private nextId = 1;

    constructor(private readonly timing: ToastTiming) {}

    /** Adds a toast (`showMs` overrides how long this one stays); returns its id. */
    Push(item: T, showMs?: number): number {
        const id = this.nextId++;
        this.waiting.push({ id, item, showMs: showMs === undefined ? this.timing.showMs : showMs });
        this.Promote();
        return id;
    }

    /** Starts a toast fading out now, whatever phase it is in. False if there isn't one with that id (it has gone, or it is still waiting - which is then dropped). */
    Dismiss(id: number): boolean {
        const waiting = this.waiting.findIndex(w => w.id === id);
        if (waiting >= 0) {
            this.waiting.splice(waiting, 1);
            return true;
        }
        const entry = this.showing.find(e => e.id === id);
        if (!entry || entry.dismissed) {
            return false;
        }
        entry.dismissed = true;
        // Leaves from wherever it is: straight to the start of its fade-out.
        entry.age = Math.max(entry.age, this.timing.fadeMs + Math.max(0, entry.showMs));
        return true;
    }

    /** Lets time pass; returns the toasts that finished and left. */
    Update(ms: number): T[] {
        const gone: T[] = [];
        this.showing.forEach(entry => (entry.age += ms));
        for (let i = this.showing.length - 1; i >= 0; i--) {
            const entry = this.showing[i];
            if (entry.age >= this.Lifetime(entry)) {
                this.showing.splice(i, 1);
                gone.unshift(entry.item);
            }
        }
        this.Promote();
        return gone;
    }

    /** Everything on screen, oldest first. */
    get Active(): Array<ActiveToast<T>> {
        return this.showing.map(entry => {
            const fade = Math.max(1, this.timing.fadeMs);
            if (entry.age < this.timing.fadeMs) {
                return { id: entry.id, item: entry.item, phase: "in" as const, progress: entry.age / fade };
            }
            const hold = this.timing.fadeMs + Math.max(0, entry.showMs);
            if (entry.showMs <= 0 && !entry.dismissed) {
                return { id: entry.id, item: entry.item, phase: "show" as const, progress: 1 };
            }
            if (entry.age < hold) {
                return { id: entry.id, item: entry.item, phase: "show" as const, progress: (entry.age - this.timing.fadeMs) / Math.max(1, entry.showMs) };
            }
            return { id: entry.id, item: entry.item, phase: "out" as const, progress: Math.min(1, (entry.age - hold) / fade) };
        });
    }

    /** How many are waiting for room. */
    get Waiting(): number {
        return this.waiting.length;
    }

    private Lifetime(entry: Entry<T>): number {
        // A toast with no time limit stays until dismissed.
        if (entry.showMs <= 0 && !entry.dismissed) {
            return Infinity;
        }
        return this.timing.fadeMs + Math.max(0, entry.showMs) + this.timing.fadeMs;
    }

    private Promote(): void {
        while (this.waiting.length && this.showing.length < this.timing.max) {
            const next = this.waiting.shift() as { id: number; item: T; showMs: number };
            this.showing.push({ id: next.id, item: next.item, age: 0, showMs: next.showMs, dismissed: false });
        }
    }
}

/** How visible a toast is: 0 to 1 sliding in, 1 while shown, 1 to 0 fading out (eased, so it doesn't start or stop abruptly). */
export function ToastOpacity(phase: ToastPhase, progress: number): number {
    const ease = (t: number) => t * t * (3 - 2 * t);
    return phase === "in" ? ease(progress) : phase === "out" ? 1 - ease(progress) : 1;
}
