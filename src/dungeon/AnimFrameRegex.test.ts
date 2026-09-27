import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { AnimFrameRegex } from "./Constants";

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

    it("is the same rule create-metadata.js groups a game's frames.json by", () => {
        const script = fs.readFileSync(path.join(__dirname, "..", "_lib", "scripts", "create-metadata.js"), "utf8");
        expect(script).toContain(`const ANIM_NAME_REGEX = ${AnimFrameRegex};`);
    });
});
