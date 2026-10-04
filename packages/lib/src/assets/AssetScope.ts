/**
 * Which bundle a bare sprite name means. Level files, asset metadata and the games' own setup
 * name sprites bare ("wall_top"); with bundles loaded and unloaded, that has to resolve to
 * `<bundle>.wall_top` for whichever loaded bundle has it - the nearest in the scope chain
 * (a level bundle, then `global`). A qualified id, or a name registered outside any bundle (the
 * editor's runtime-generated brushes), resolves to itself.
 *
 * Pure: it only asks `has(key)` whether a key is registered.
 */
export class ScopedNames {
    private chain: string[] = [];
    private cache = new Map<string, string | undefined>();

    constructor(private has: (key: string) => boolean) {}

    /** Bundles searched for a bare name, nearest first. */
    get Chain(): string[] {
        return this.chain.slice();
    }

    SetChain(chain: string[]): void {
        this.chain = chain.slice();
        this.cache.clear();
    }

    /** Forget what was resolved - the set of registered keys has changed. */
    Invalidate(): void {
        this.cache.clear();
    }

    /** The registered key `name` means, or undefined if nothing in scope has it. */
    Resolve(name: string): string | undefined {
        if (this.cache.has(name)) {
            return this.cache.get(name);
        }
        let found: string | undefined;
        if (this.has(name)) {
            found = name;
        } else {
            for (let i = 0; i < this.chain.length && found === undefined; i++) {
                const key = this.chain[i] + "." + name;
                if (this.has(key)) {
                    found = key;
                }
            }
        }
        this.cache.set(name, found);
        return found;
    }
}
