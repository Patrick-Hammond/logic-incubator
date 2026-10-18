/**
 * Plays sounds by name, and quietly skips any name the build has no sound for - so a game can name every sound it means
 * to have before the files exist, and each one is heard as soon as its file is added, with no code change. A bare name
 * (`arrow_shot`) is looked up in the asset scope, nearest bundle first (see `Assets.Scope`), so a level's bundle can give
 * a sound of its own; one with its bundle (`ui.confirm`) only there. A sound heard often can come as takes -
 * `arrow_shot_1`, `arrow_shot_2`... counted from 1 to the first one missing - and one is picked at random each time, never
 * the one just played, so it doesn't wear. Pure - no pixi - so it runs under the plain node test runner.
 */

import type Assets from "./Assets";
import type { SoundId } from "./AssetIds";
import type { SoundPlayOptions } from "./IBundleLoader";

/** What plays them - the game's `Assets`. */
export type NamedSoundPlayer = Pick<Assets, "Scope" | "CanPlaySound" | "PlaySound">;

export type NamedSoundsOptions = {
    /** 0 up to 1, as `Math.random` - which take plays. */
    random?: () => number;
    /** Milliseconds, as `performance.now` - see `gapMs`. */
    now?: () => number;
    /** How soon a name can be played again: a dozen things happening at once sound once, not as a roar. 40 by default. */
    gapMs?: number;
};

export default class NamedSounds {
    private readonly random: () => number;
    private readonly now: () => number;
    private readonly gapMs: number;
    /** When each name last played, and which of its takes. */
    private readonly last = new Map<string, { at: number; id: string }>();
    /** Sounds that failed to play, warned about once each. */
    private readonly failed = new Set<string>();

    constructor(private readonly player: NamedSoundPlayer, options: NamedSoundsOptions = {}) {
        this.random = options.random || Math.random;
        this.now = options.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
        this.gapMs = options.gapMs === undefined ? 40 : options.gapMs;
    }

    /** The sounds `name` plays as - itself and its takes - from the nearest bundle that has any; empty when none does. */
    Find(name: string): SoundId[] {
        const bundles = name.indexOf(".") > 0 ? [""] : this.player.Scope;
        for (let i = 0; i < bundles.length; i++) {
            const id = bundles[i] ? bundles[i] + "." + name : name;
            const found: SoundId[] = this.player.CanPlaySound(id) ? [id] : [];
            for (let take = 1; this.player.CanPlaySound(id + "_" + take); take++) {
                found.push((id + "_" + take) as SoundId);
            }
            if (found.length) {
                return found;
            }
        }
        return [];
    }

    /** Whether the build has a sound for `name`. */
    Has(name: string | undefined): boolean {
        return !!name && this.Find(name).length > 0;
    }

    /**
     * Plays the first of `names` the build has a sound for - a thing's own sound, say, then the game's for anything of its
     * kind - and says whether one was. A name left undefined is passed over. Nothing plays if that name played a moment ago (see `gapMs`).
     */
    Play(names: string | undefined | ReadonlyArray<string | undefined>, options?: SoundPlayOptions): boolean {
        const list: ReadonlyArray<string | undefined> = Array.isArray(names) ? names : [names as string | undefined];
        for (let i = 0; i < list.length; i++) {
            const name = list[i];
            const ids = name ? this.Find(name) : [];
            if (name && ids.length) {
                this.Start(name, ids, options);
                return true;
            }
        }
        return false;
    }

    private Start(name: string, ids: SoundId[], options?: SoundPlayOptions): void {
        const now = this.now();
        const last = this.last.get(name);
        if (last && now - last.at < this.gapMs) {
            return;
        }
        let pick = Math.min(ids.length - 1, Math.floor(this.random() * ids.length));
        if (last && ids.length > 1 && ids[pick] === last.id) {
            pick = (pick + 1) % ids.length;
        }
        const id = ids[pick];
        this.last.set(name, { at: now, id });
        // A file that won't load leaves its moment silent, not broken.
        this.player.PlaySound(id, options).catch(error => {
            if (!this.failed.has(id)) {
                this.failed.add(id);
                console.warn(`Sound "${id}" can't be played:`, error);
            }
        });
    }
}
