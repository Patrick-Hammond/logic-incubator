/**
 * Reference counts for bundles. Each `Acquire` is one count and each `Release` gives one back; a
 * bundle with no counts and no pin is free to unload. `global` is pinned - it lives as long as the
 * game does. Kept apart from `Assets` so the counting rules test without any loading.
 */
export default class BundleRefs {
    private counts = new Map<string, number>();
    private pins = new Set<string>();

    Count(name: string): number {
        return this.counts.get(name) || 0;
    }

    Retain(name: string): number {
        const count = this.Count(name) + 1;
        this.counts.set(name, count);
        return count;
    }

    /** Gives one count back; returns what's left. Releasing a bundle nobody holds does nothing. */
    Release(name: string): number {
        const count = Math.max(0, this.Count(name) - 1);
        if (count === 0) {
            this.counts.delete(name);
        } else {
            this.counts.set(name, count);
        }
        return count;
    }

    Pin(name: string): void {
        this.pins.add(name);
    }

    IsPinned(name: string): boolean {
        return this.pins.has(name);
    }

    /** Whether nothing holds `name`: no counts, no pin. */
    IsFree(name: string): boolean {
        return this.Count(name) === 0 && !this.IsPinned(name);
    }

    Clear(): void {
        this.counts.clear();
        this.pins.clear();
    }
}
