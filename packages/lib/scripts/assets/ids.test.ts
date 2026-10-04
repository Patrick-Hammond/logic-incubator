import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const { CompareKeys, GroupFrames, IsValidBundleName, IsValidLocalName, KindOfExtension, MakeId, NormalizeLocalName, ParseFrameName, SplitId, Suggest } = createRequire(import.meta.url)("./ids.js");

// every one of these was once read as an animation frame and silently dropped
const CONTAINS_F_SPRITES = [
    "wall_fountain_top_1", "wall_fountain_top_2", "doors_frame_left", "heart_full", "ui_heart_full",
    "wall_outer_front_left", "wall_outer_front_right", "floor_1", "dwarf_f"
];

describe("NormalizeLocalName / validity", () => {
    it("lowercases and turns '-' and spaces into '_'", () => {
        expect(NormalizeLocalName("Small-Font")).toBe("small_font");
        expect(NormalizeLocalName("hit sound")).toBe("hit_sound");
        expect(NormalizeLocalName("assets-meta")).toBe("assets_meta");
    });

    it("accepts only a-z 0-9 _ in a local name, and a leading letter in a bundle name", () => {
        expect(IsValidLocalName("wall_top_2")).toBe(true);
        expect(IsValidLocalName("wall.top")).toBe(false);
        expect(IsValidLocalName("Wall")).toBe(false);
        expect(IsValidBundleName("level1")).toBe(true);
        expect(IsValidBundleName("1level")).toBe(false);
        expect(IsValidBundleName("my-level")).toBe(false);
    });
});

describe("MakeId / SplitId", () => {
    it("qualifies a name with its bundle and splits it back", () => {
        expect(MakeId("global", "title")).toBe("global.title");
        expect(SplitId("level1.hit_sound")).toEqual({ bundle: "level1", local: "hit_sound" });
        expect(SplitId("hit_sound")).toBeNull();
    });
});

describe("ParseFrameName", () => {
    it("names an animation from everything before a trailing _f<N>", () => {
        expect(ParseFrameName("bomb_f0")).toEqual({ name: "bomb", index: 0 });
        expect(ParseFrameName("dwarf_f_hit_anim_f0")).toEqual({ name: "dwarf_f_hit_anim", index: 0 });
        expect(ParseFrameName("zombie_anim_f10")).toEqual({ name: "zombie_anim", index: 10 });
    });

    it("doesn't match names that merely contain _f", () => {
        CONTAINS_F_SPRITES.forEach(name => expect(ParseFrameName(name), name).toBeNull());
    });

    it("takes a game's own pattern", () => {
        expect(ParseFrameName("cat_fall_f0", "^(.+)_f(\\d+)")).toEqual({ name: "cat_fall", index: 0 });
    });
});

describe("GroupFrames", () => {
    it("groups an animation's frames in index order, and leaves sprites as themselves", () => {
        const { sprites, animations, diagnostics } = GroupFrames(["bomb_f1", "bomb_f0", "bomb_f2", "heart_full", "crate"]);
        expect(animations).toEqual([{ name: "bomb", frames: ["bomb_f0", "bomb_f1", "bomb_f2"] }]);
        expect(sprites.map((s: { name: string }) => s.name)).toEqual(["crate", "heart_full"]);
        expect(diagnostics).toEqual([]);
    });

    it("orders frames numerically, not alphabetically (f10 after f9)", () => {
        const names = Array.from({ length: 12 }, (_, i) => `flame_f${i}`);
        expect(GroupFrames(names.reverse()).animations[0].frames).toEqual(Array.from({ length: 12 }, (_, i) => `flame_f${i}`));
    });

    it("reports a sequence with no f0 or a hole instead of dropping it", () => {
        const missingStart = GroupFrames(["zombie_anim_f1", "zombie_anim_f2", "zombie_anim_f3", "zombie_anim_f10"]);
        expect(missingStart.animations).toEqual([]);
        expect(missingStart.diagnostics).toHaveLength(1);
        expect(missingStart.diagnostics[0].level).toBe("error");
        expect(missingStart.diagnostics[0].message).toContain("zombie_anim");

        expect(GroupFrames(["a_f0", "a_f2"]).diagnostics[0].level).toBe("error");
    });

    it("reads a lone foo_f0 as the one-frame sprite foo", () => {
        const { sprites, animations, diagnostics } = GroupFrames(["dwarf_f_hit_anim_f0"]);
        expect(sprites).toEqual([{ name: "dwarf_f_hit_anim", frames: ["dwarf_f_hit_anim_f0"] }]);
        expect(animations).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    it("gives the same result whatever order the names come in", () => {
        const names = ["b_f1", "a", "b_f0", "c_f0", "c_f1", "z"];
        expect(GroupFrames(names)).toEqual(GroupFrames(names.slice().reverse()));
    });
});

describe("KindOfExtension", () => {
    it("classifies what the pipeline knows and nothing else", () => {
        expect(KindOfExtension("PNG")).toBe("image");
        expect(KindOfExtension("ogg")).toBe("sound");
        expect(KindOfExtension("json")).toBe("data");
        expect(KindOfExtension("gif")).toBe("binary");
        expect(KindOfExtension("fnt")).toBe("font");
        expect(KindOfExtension("sbx")).toBeUndefined();
    });
});

describe("CompareKeys / Suggest", () => {
    it("orders by code unit, so uppercase sorts before lowercase on every machine", () => {
        expect(["b", "B", "a"].sort(CompareKeys)).toEqual(["B", "a", "b"]);
    });

    it("suggests the nearest name for a likely typo, and nothing for an unrelated one", () => {
        expect(Suggest("dependsOnn", ["dependsOn", "preload", "ignore"])).toBe("dependsOn");
        expect(Suggest("zzzzzzzz", ["dependsOn", "preload"])).toBeUndefined();
    });
});
