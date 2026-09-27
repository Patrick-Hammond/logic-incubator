import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { TileSize } from "../../../Constants";
import { DataBrushName } from "../../../editor/stores/EditorStore";
import { SpriteDrawPosition } from "./SpriteDrawOffset";

/**
 * Regression test for the "Y direction inaccuracy" reported against a real
 * exported level (see level/__fixtures__/dungeonLevel.json). Bisecting found
 * the bug starts at commit 852f94f ("Dungeon z-scaling, pixi-tile alpha
 * patch") - which never touches TileCollision.ts or PlayerMovement.ts.
 * ResolveMove/TileCollision resolve identically on both axes; what that
 * commit *does* change is the player sprite:
 *
 *   AssetFactory.inst.CreateAnimatedSprite("chest_full_open_anim")
 *   -> AssetFactory.inst.CreateAnimatedSprite("wizzard_m_run_anim")
 *
 * chest_full_open_anim is 16x16 (the untrimmed sourceSize in
 * the game's packed frames.json, which is what texture.height reports). The
 * new wizzard_m_run_anim frames are 16x28 - 12px taller, to fit a head/torso
 * above the character's footprint tile. Player.Render() draws
 * `this.player.texture` via `addFrame`, which is always top-left anchored
 * (no pivot support) - so with no compensation every frame renders 12px too
 * low, sunk into the tile below, on Y only (frame width still matches
 * TileSize, so X is untouched). That matches the report exactly: left/right
 * look fine, up/down look "off".
 */

function loadFixtureStartTile(): { x: number; y: number } {
    const raw = JSON.parse(
        fs.readFileSync(path.join(__dirname, "..", "..", "level", "__fixtures__", "dungeonLevel.json"), "utf8"),
    );
    const brushes: { name: string; position: { x: number; y: number } }[] = raw.levelData.levelData;

    let x1 = Number.MAX_VALUE;
    let y1 = Number.MAX_VALUE;
    brushes.forEach(b => {
        x1 = Math.min(x1, b.position.x);
        y1 = Math.min(y1, b.position.y);
    });

    const start = brushes.find(b => b.name === DataBrushName.PLAYER_START);
    return { x: start.position.x - x1, y: start.position.y - y1 };
}

describe("SpriteDrawPosition", () => {
    it("applies no correction for chest_full_open_anim (16x16, the sprite before commit 852f94f)", () => {
        const startTile = loadFixtureStartTile();
        const position = { x: startTile.x * TileSize, y: startTile.y * TileSize };
        const viewOffsetTiles = { x: 0, y: 0 };

        const draw = SpriteDrawPosition(position, viewOffsetTiles, { height: 16 });

        expect(draw.x).toBe(position.x);
        expect(draw.y).toBe(position.y);
    });

    it("at the level's own player start tile, draws wizzard_m_run_anim (16x28) feet-down on the tile, on X exactly as before", () => {
        const startTile = loadFixtureStartTile();
        const position = { x: startTile.x * TileSize, y: startTile.y * TileSize };
        const viewOffsetTiles = { x: 0, y: 0 };
        const texture = { height: 28 };

        const draw = SpriteDrawPosition(position, viewOffsetTiles, texture);

        // X is untouched - the frame's width matches TileSize, no bug there.
        expect(draw.x).toBe(position.x);

        // The frame's bottom edge (draw.y + textureHeight) must land exactly
        // on the tile's own bottom edge (position.y + TileSize), not 12px
        // further down.
        expect(draw.y + texture.height).toBe(position.y + TileSize);
    });

    it("centres a frame wider than its tile (big_demon, 32x36) across it, feet still on the tile's bottom", () => {
        const position = { x: 10 * TileSize, y: 4 * TileSize };
        const texture = { width: 32, height: 36 };

        const draw = SpriteDrawPosition(position, { x: 0, y: 0 }, texture);

        expect(draw.x + texture.width / 2).toBe(position.x + TileSize / 2);
        expect(draw.y + texture.height).toBe(position.y + TileSize);
    });

    it("leaves a one-tile-wide frame's X alone when its width is given", () => {
        expect(SpriteDrawPosition({ x: 40, y: 0 }, { x: 0, y: 0 }, { width: TileSize, height: 28 }).x).toBe(40);
    });
});
