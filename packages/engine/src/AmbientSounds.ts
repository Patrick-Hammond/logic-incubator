/**
 * The sounds a level makes all the time, each on a loop while the dungeon is showing: its ambience (`SoundTable.ambience`), heard
 * the same everywhere, and the sound of every tile whose `AssetMetadata` names a `loop` - a torch's crackle - heard the louder the
 * closer a hero played here stands to the nearest such tile, and not at all from its range away. Each sound is one loop however
 * many tiles make it, and fades rather than jumps as a hero walks about. A sound the build has no file for is silent (see
 * `NamedSounds`). Pure - no pixi - so it runs under the plain node test runner.
 */

import type { SoundId } from "@logic-incubator/lib/assets/AssetIds";
import type { SoundInstance, SoundPlayOptions } from "@logic-incubator/lib/assets/IBundleLoader";
import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** What plays them: `NamedSounds.Find` for the sound a name plays as, the game's `Assets` to play and stop it. */
export type AmbientPlayer = {
    Find(name: string): ReadonlyArray<SoundId>;
    PlaySound(id: SoundId, options?: SoundPlayOptions): Promise<SoundInstance | undefined>;
    StopSound(id: SoundId): void;
};

/** A tile that makes a sound (see `Level.SoundLoop`): where it is, in tiles, how far it's heard, and the tile, which is `gone` once taken out of the level. */
export type LoopSource = Vec2Like & { sound: string; range?: number; tile: { gone?: boolean } };

/** How far a tile's loop is heard, in tiles, when its metadata doesn't say. */
export const DefaultLoopRange = 4;
/** How fast a loop gets louder or quieter, in volume (0 to 1) a second. */
const Fade = 2;

/**
 * One sound's loop: how loud it is now, the sound it plays as once started (`id`), and the play - none while it's `starting`, or for
 * an adapter that hands none back, when it goes on at the volume it started at. `missing`: the build has no file for it.
 */
type Loop = { volume: number; id?: SoundId; play?: SoundInstance; starting: boolean; missing: boolean };

export default class AmbientSounds {
    private ambience: string | undefined;
    private sources: ReadonlyArray<LoopSource> = [];
    private loops = new Map<string, Loop>();
    private shown = false;
    /** Bumped by every `Hide` and `Begin` that stops loops: a play that was still starting when it changed is stopped as it arrives. */
    private visit = 0;

    constructor(private readonly player: AmbientPlayer) {}

    /** A level started: `ambience` (a sound's name, or none) and the tiles that make their own (`Level.soundLoops`). A loop both levels have plays on. */
    Begin(ambience: string | undefined, sources: ReadonlyArray<LoopSource>): void {
        this.ambience = ambience || undefined;
        this.sources = sources;
        const names = new Set<string>(sources.map(source => source.sound));
        if (this.ambience) {
            names.add(this.ambience);
        }
        Array.from(this.loops.keys()).forEach(name => {
            if (!names.has(name)) {
                this.Stop(name);
            }
        });
        // The level's bundle may have files the last one hadn't.
        this.loops.forEach(loop => (loop.missing = false));
        names.forEach(name => {
            if (!this.loops.has(name)) {
                this.loops.set(name, { volume: 0, starting: false, missing: false });
            }
        });
    }

    /** The dungeon is showing: the loops start as the next `Update` asks for them. */
    Show(): void {
        this.shown = true;
    }

    /** The dungeon has gone (the editor, the title): every loop stops. */
    Hide(): void {
        this.shown = false;
        this.visit++;
        this.loops.forEach(loop => {
            this.Silence(loop);
            loop.volume = 0;
        });
    }

    /** Once a frame: the centres of the heroes played here who are still standing, in tiles, and the seconds since the last. */
    Update(hearers: ReadonlyArray<Vec2Like>, seconds: number): void {
        if (!this.shown) {
            return;
        }
        this.loops.forEach((loop, name) => {
            const target = name === this.ambience ? 1 : this.Nearness(name, hearers);
            const step = Fade * seconds;
            loop.volume = Math.max(0, Math.min(1, loop.volume + Math.max(-step, Math.min(step, target - loop.volume))));
            if (loop.play) {
                loop.play.SetVolume(loop.volume);
            } else if (loop.volume > 0 && !loop.id && !loop.missing) {
                this.Start(name, loop);
            }
        });
    }

    /** How loud `name`'s tiles are to the nearest hearer: 1 on the tile, falling away to nothing at its range. */
    private Nearness(name: string, hearers: ReadonlyArray<Vec2Like>): number {
        let best = 0;
        this.sources.forEach(source => {
            if (source.sound !== name || source.tile.gone) {
                return;
            }
            const range = source.range || DefaultLoopRange;
            hearers.forEach(hearer => {
                const near = 1 - Math.sqrt((hearer.x - source.x) * (hearer.x - source.x) + (hearer.y - source.y) * (hearer.y - source.y)) / range;
                // Squared, so it swells as a hero closes in rather than being half as loud halfway across the room.
                best = Math.max(best, near > 0 ? near * near : 0);
            });
        });
        return best;
    }

    private Start(name: string, loop: Loop): void {
        const id = this.player.Find(name)[0];
        if (!id) {
            loop.missing = true;
            return;
        }
        const visit = this.visit;
        loop.id = id;
        loop.starting = true;
        this.player
            .PlaySound(id, { loop: true, volume: loop.volume })
            .then(play => {
                if (this.visit !== visit || this.loops.get(name) !== loop) {
                    if (play) {
                        play.Stop();
                    } else {
                        this.player.StopSound(id);
                    }
                    return;
                }
                loop.starting = false;
                loop.play = play;
                if (play) {
                    play.SetVolume(loop.volume);
                }
            })
            .catch(error => {
                if (this.visit === visit && this.loops.get(name) === loop) {
                    loop.starting = false;
                    loop.id = undefined;
                    loop.missing = true;
                }
                console.warn(`Sound "${id}" can't be played:`, error);
            });
    }

    /** Stops `loop`'s play, if it has one going (or starting: that one is stopped as it arrives - see `visit`). */
    private Silence(loop: Loop): void {
        if (loop.play) {
            loop.play.Stop();
        } else if (loop.id && !loop.starting) {
            this.player.StopSound(loop.id);
        }
        loop.play = loop.id = undefined;
        loop.starting = false;
    }

    private Stop(name: string): void {
        const loop = this.loops.get(name);
        if (loop) {
            this.Silence(loop);
        }
        this.loops.delete(name);
    }
}
