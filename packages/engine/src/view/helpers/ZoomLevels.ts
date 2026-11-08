/**
 * The camera's zoom levels - what keys 1, 2, 3... pick in play (see `DungeonMainOptions.zoomLevels`) - and the short,
 * eased jump from one to another (`ZoomJump`). Pure - no pixi - so it runs under the plain node test runner.
 */

/**
 * The levels a game gets without its own `zoomLevels`, each times the camera's usual zoom (`Camera.Scale`, 16-pixel
 * tiles drawn 32 across): play as it has always looked, then tiles 48 and 64 across - a whole number of canvas pixels
 * to each pixel of art, so the art stays crisp once a jump has settled. The closest is for a talk with an NPC.
 */
export const DefaultZoomLevels: ReadonlyArray<number> = [1, 1.5, 2];

/** As many levels as there are number keys to pick them with, 1 to 9. */
export const MaxZoomLevels = 9;

/** Seconds a jump from one level to another takes. */
export const ZoomJumpSeconds = 0.3;

/**
 * The levels to use for `levels` as a game gave them: each zoom that's a number above 0, in its order, up to
 * `MaxZoomLevels` - or `DefaultZoomLevels` when that leaves none, or it gave none.
 */
export function UsableZoomLevels(levels?: ReadonlyArray<number>): ReadonlyArray<number> {
    const usable = (levels || []).filter(zoom => typeof zoom === "number" && isFinite(zoom) && zoom > 0).slice(0, MaxZoomLevels);
    return usable.length ? usable : DefaultZoomLevels;
}

/**
 * The camera's zoom level, and where it is in a jump to it: quick at first and settling gently (eased out), and even
 * in scale - each step of the way grows the view by the same share, as a zoom looks right. A jump asked for midway
 * sets off from wherever the last one had got to, so the zoom never snaps.
 */
export default class ZoomJump {
    /** The zooms it picks between (see `UsableZoomLevels`). */
    readonly Levels: ReadonlyArray<number>;
    /** The closest of them - as far in as a party's zoom (see `PartyFrame.PartyZoom`) is let go. */
    readonly Max: number;

    private level = 0;
    private from: number;
    private to: number;
    private elapsed = ZoomJumpSeconds;

    /** Starts settled at the first of `levels` (see `UsableZoomLevels`). */
    constructor(levels?: ReadonlyArray<number>) {
        this.Levels = UsableZoomLevels(levels);
        this.Max = Math.max.apply(null, this.Levels as number[]);
        this.from = this.to = this.Levels[0];
    }

    /** The level picked, from 0 (key 1) - the one the zoom is at, or heading for. */
    get Level(): number {
        return this.level;
    }

    /** The zoom now, times the camera's usual one. */
    get Value(): number {
        const t = Math.min(1, this.elapsed / ZoomJumpSeconds);
        const eased = 1 - Math.pow(1 - t, 3);
        return this.from * Math.pow(this.to / this.from, eased);
    }

    /** Heads for `level` (from 0, held to the levels there are), from where the zoom is now. Asking for the level it's at, or heading for, changes nothing. */
    To(level: number): void {
        const to = Math.max(0, Math.min(this.Levels.length - 1, Math.floor(level)));
        if (to === this.level) {
            return;
        }
        this.from = this.Value;
        this.to = this.Levels[to];
        this.level = to;
        this.elapsed = 0;
    }

    /** Moves the jump on by `seconds`. */
    Step(seconds: number): void {
        this.elapsed = Math.min(ZoomJumpSeconds, this.elapsed + seconds);
    }
}
