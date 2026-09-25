import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { GroupSpriteSheetFrames } from "../_lib/loading/SpriteSheetFrames";
import { AnimFrameRegex } from "./Constants";

const ASSETS_DIR = path.join(__dirname, "assets");
const frames: { [key: string]: unknown } = JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, "frames.json"), "utf8")).frames;
const meta: { [name: string]: unknown } = JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, "assets-meta.json"), "utf8"));

// every one of these was once read as an animation frame and silently dropped
const CONTAINS_F_SPRITES = [
    "wall_fountain_top_1", "wall_fountain_top_2", "wall_fountain_top_3",
    "doors_frame_left", "doors_frame_right", "doors_frame_top",
    "heart_full", "ui_heart_full",
    "wall_outer_front_left", "wall_outer_front_right"
];

function AnimName(frame: string): string | null {
    const match = AnimFrameRegex.exec(frame);
    return match ? match[0] : null;
}

describe("AnimFrameRegex", () => {
    it("names an animation from everything before a trailing _f<N>", () => {
        expect(AnimName("bomb_f0")).toBe("bomb");
        expect(AnimName("dwarf_f_hit_anim_f0")).toBe("dwarf_f_hit_anim");
        expect(AnimName("flame_1_anim_f7")).toBe("flame_1_anim");
        expect(AnimName("chest_full_open_anim_f2")).toBe("chest_full_open_anim");
        expect(AnimName("zombie_anim_f10")).toBe("zombie_anim");
    });

    it("doesn't match names that merely contain _f", () => {
        [...CONTAINS_F_SPRITES, "floor_1", "dwarf_f"].forEach(frame => expect(AnimName(frame), frame).toBeNull());
    });
});

describe("GroupSpriteSheetFrames on the dungeon's frames.json", () => {
    const assets = GroupSpriteSheetFrames(frames, AnimFrameRegex);
    const byName = new Map(assets.map(a => [a.name, a.frames]));

    it("registers every frame without a trailing _f<N> as a sprite named after itself", () => {
        const sprites = Object.keys(frames).filter(frame => !/_f\d+$/.test(frame));
        expect(sprites).toEqual(expect.arrayContaining(CONTAINS_F_SPRITES));
        sprites.forEach(frame => expect(byName.get(frame), frame).toEqual([frame]));
    });

    it("collects an animation's whole image sequence", () => {
        expect(byName.get("flame_1_anim")).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => `flame_1_anim_f${i}`));
        expect(byName.get("dwarf_f_idle_anim")).toEqual([0, 1, 2, 3].map(i => `dwarf_f_idle_anim_f${i}`));
    });
});

describe("assets-meta.json", () => {
    it("has an entry for exactly the asset names frames.json produces (see create-metadata.js)", () => {
        const names = new Set(Object.keys(frames).map(frame => AnimName(frame) ?? frame));
        expect(Object.keys(meta).sort()).toEqual(Array.from(names).sort());
    });
});
