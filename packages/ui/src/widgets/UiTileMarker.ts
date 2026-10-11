import { Sprite, Texture } from "pixi.js";
import { TileMarkerSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";

/**
 * The brackets that pulse round the tile under the pointer (or the one a cursor has picked): the skin's frames played in a loop. `SetTile` puts it round the tile whose top-left is
 * there, in its parent's pixels - usually the map's own layer, so it moves and zooms with the map rather than the UI. Drive it with `Update(ms)` (`UiSystem.Track` does, or the
 * game's own tick); it doesn't take the pointer.
 */
export default class UiTileMarker extends Sprite {
    private readonly skin: TileMarkerSkin;
    private readonly frames: Texture[];
    private clock = 0;

    constructor(theme: UiTheme, variant: string) {
        super();
        const skin = theme.skin.tileMarkers && theme.skin.tileMarkers[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no tile marker "${variant}".`);
        }
        this.skin = skin;
        this.frames = skin.frames.map(frame => theme.Texture(frame));
        this.texture = this.frames[0];
    }

    /** Puts the marker round the tile whose top-left corner is at (x, y). */
    SetTile(x: number, y: number): void {
        this.position.set(x - this.skin.tileX, y - this.skin.tileY);
    }

    /** Starts the loop again from its first frame (when the marker jumps to another tile, say). */
    Restart(): void {
        this.clock = 0;
        this.texture = this.frames[0];
    }

    Update(ms: number): void {
        this.clock += ms;
        this.texture = this.frames[Math.floor(this.clock / this.skin.frameMs) % this.frames.length];
    }
}
