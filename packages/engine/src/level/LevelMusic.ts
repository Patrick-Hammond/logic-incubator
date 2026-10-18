/**
 * The music a level plays to (`DungeonMainOptions.music`): one track on a loop, heard only while the
 * dungeon is showing. It carries on through a restart and into the next level when that asks for the
 * same track, rather than starting over each time; a different track takes over from it. While a boss
 * is awake its own track (`SoundTable.bossMusic`) plays in place of the level's, which comes back from
 * the top once every boss awake has fallen. Pure - no pixi - so it runs under the plain node test runner.
 */

import type Assets from "@logic-incubator/lib/assets/Assets";
import type { SoundId } from "@logic-incubator/lib/assets/AssetIds";

/** What plays it - the game's `Assets`. */
export type MusicPlayer = Pick<Assets, "PlaySound" | "StopSound">;

export default class LevelMusic {
    /** The track the level asked for, whether or not it can be heard now. */
    private wanted: SoundId | null = null;
    /** What plays in its place while a boss is awake - null for the level's own. */
    private bossTrack: SoundId | null = null;
    /** How many bosses are awake and standing. */
    private bosses = 0;
    /** The track playing, or loading to play - null for silence. */
    private playing: SoundId | null = null;
    private shown = false;

    constructor(private readonly player: MusicPlayer) {}

    /** The track the level plays to, or null for none - asked for as each level starts - and the one a boss waking puts on in its place, if any. */
    Play(track: SoundId | null, bossTrack: SoundId | null = null): void {
        this.wanted = track;
        this.bossTrack = bossTrack;
        // A level starts with every boss asleep.
        this.bosses = 0;
        this.Update();
    }

    /** A boss woke (`BOSS_WOKE`): its track plays until it falls. */
    BossWoke(): void {
        this.bosses++;
        this.Update();
    }

    /** A boss fell (`MONSTER_KILLED`, a boss's): the level's own track comes back once none awake is left. */
    BossFell(): void {
        this.bosses = Math.max(0, this.bosses - 1);
        this.Update();
    }

    /** The dungeon is showing: the track plays, from the top if it had stopped. */
    Show(): void {
        this.shown = true;
        this.Update();
    }

    /** The dungeon has gone (the editor, the title): silence until it's back - with the level started over, so no boss is awake. */
    Hide(): void {
        this.shown = false;
        this.bosses = 0;
        this.Update();
    }

    private Update(): void {
        const track = this.shown ? (this.bosses > 0 && this.bossTrack) || this.wanted : null;
        if (track === this.playing) {
            return;
        }
        if (this.playing) {
            this.player.StopSound(this.playing);
        }
        this.playing = track;
        if (track) {
            // A track that can't be loaded leaves the level silent, not broken.
            this.player.PlaySound(track, { loop: true }).catch(error => console.warn(`Level music "${track}" can't be played:`, error));
        }
    }
}
