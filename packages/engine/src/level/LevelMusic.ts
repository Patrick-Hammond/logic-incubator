/**
 * The music a level plays to (`DungeonMainOptions.music`): one track on a loop, heard only while the
 * dungeon is showing. It carries on through a restart and into the next level when that asks for the
 * same track, rather than starting over each time; a different track takes over from it. Pure - no
 * pixi - so it runs under the plain node test runner.
 */

import type Assets from "@logic-incubator/lib/assets/Assets";
import type { SoundId } from "@logic-incubator/lib/assets/AssetIds";

/** What plays it - the game's `Assets`. */
export type MusicPlayer = Pick<Assets, "PlaySound" | "StopSound">;

export default class LevelMusic {
    /** The track the level asked for, whether or not it can be heard now. */
    private wanted: SoundId | null = null;
    /** The track playing, or loading to play - null for silence. */
    private playing: SoundId | null = null;
    private shown = false;

    constructor(private readonly player: MusicPlayer) {}

    /** The track the level plays to, or null for none - asked for as each level starts. */
    Play(track: SoundId | null): void {
        this.wanted = track;
        this.Update();
    }

    /** The dungeon is showing: the track plays, from the top if it had stopped. */
    Show(): void {
        this.shown = true;
        this.Update();
    }

    /** The dungeon has gone (the editor, the title): silence until it's back. */
    Hide(): void {
        this.shown = false;
        this.Update();
    }

    private Update(): void {
        const track = this.shown ? this.wanted : null;
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
