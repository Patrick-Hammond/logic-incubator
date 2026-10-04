import { createRequire } from "module";
import { describe, expect, it } from "vitest";
import { FrameFileNames, MaxNameLength, NormalizeSpriteName, ParseFrameFile, SuggestSpriteName, ValidateSpriteName } from "./SpriteNames";

// The build pipeline's own rules: the editor must write names it reads back the way the editor meant.
const ids = createRequire(__filename)("../../../lib/scripts/assets/ids.js");

describe("NormalizeSpriteName", () => {
    it("matches the pipeline: lowercase, dashes and spaces to underscores", () => {
        ["Wall-Fountain Top", "ANGEL_idle", "a b-c", "already_fine", "Mixed Case-1"].forEach(raw => {
            expect(NormalizeSpriteName(raw), raw).toBe(ids.NormalizeLocalName(raw));
        });
    });
});

describe("ValidateSpriteName", () => {
    it("accepts ordinary names, including ones with _f in them", () => {
        ["brick", "wall_fountain_top_1", "heart_full", "a", "door2", "_x", "x_", "zombie_anim", "f1", "frame"].forEach(name => {
            expect(ValidateSpriteName(name), name).toBeNull();
        });
    });

    it("says what's wrong with the rest", () => {
        expect(ValidateSpriteName("")).toMatch(/Give the sprite a name/);
        expect(ValidateSpriteName("a".repeat(MaxNameLength + 1))).toMatch(/up to 48/);
        expect(ValidateSpriteName("Brick")).toMatch(/lowercase.*not "B"/);
        expect(ValidateSpriteName("my sprite")).toMatch(/not a space/);
        expect(ValidateSpriteName("a.b-c")).toMatch(/not "\.", "-"/);
        expect(ValidateSpriteName("run_f3")).toMatch(/can't end in "_f" and a number/);
        expect(ValidateSpriteName("run_f3")).toMatch(/Try "run"/);
    });

    it("agrees with the pipeline about what a valid local name is", () => {
        ["brick", "Brick", "my-sprite", "ünï", "a.b", "a_b", "9", "run_f0", "-", "a b"].forEach(name => {
            if (ValidateSpriteName(name) === null) {
                expect(ids.IsValidLocalName(name), name).toBe(true);
            }
        });
    });
});

describe("the editor and the server agree", () => {
    const names = ["brick", "Brick", "my sprite", "a-b", "run_f3", "run_f", "f1", "", "x".repeat(MaxNameLength), "x".repeat(MaxNameLength + 1), "ünï", "a.b", "_", "9", "a_f1_f2", "door_f_left"];

    it("on which names are acceptable", () => {
        names.forEach(name => {
            expect(ValidateSpriteName(name) === null, JSON.stringify(name)).toBe(ids.SpriteNameProblem(name) === null);
        });
    });

    it("on the longest name", () => {
        expect(MaxNameLength).toBe(ids.MAX_SPRITE_NAME);
    });

    it("on the files a sprite is saved as", () => {
        [1, 2, 3, 12].forEach(count => expect(FrameFileNames("flame", count)).toEqual(ids.FrameFileNames("flame", count)));
        expect(FrameFileNames("flame", 0)).toEqual(ids.FrameFileNames("flame", 0));
    });
});

describe("SuggestSpriteName", () => {
    it("turns what was typed into a valid name", () => {
        expect(SuggestSpriteName("Wall Fountain-Top")).toBe("wall_fountain_top");
        expect(SuggestSpriteName("  hello!! world  ")).toBe("hello_world");
        expect(SuggestSpriteName("run_f12")).toBe("run");
        expect(SuggestSpriteName("run_f1_f2")).toBe("run");
        expect(SuggestSpriteName("--x--")).toBe("x");
        expect(SuggestSpriteName("ünï")).toBe("n");
        expect(SuggestSpriteName("!!!")).toBe("");
        expect(SuggestSpriteName("a".repeat(100)).length).toBe(MaxNameLength);
    });

    it("always gives a name that validates, or nothing", () => {
        ["Brick", "x y z", "a_f3", "_f3", "99", "über", "run_f1_f2_f3", "a" + "_f1".repeat(30), "$$"].forEach(raw => {
            const name = SuggestSpriteName(raw);
            expect(name === "" || ValidateSpriteName(name) === null, raw + " -> " + name).toBe(true);
        });
    });
});

describe("FrameFileNames", () => {
    it("is one plain file for one frame and numbered frames for more", () => {
        expect(FrameFileNames("brick", 1)).toEqual(["brick.png"]);
        expect(FrameFileNames("brick", 0)).toEqual(["brick.png"]);
        expect(FrameFileNames("fire", 3)).toEqual(["fire_f0.png", "fire_f1.png", "fire_f2.png"]);
        expect(FrameFileNames("fire", 12)[11]).toBe("fire_f11.png");
    });

    it("is read back by the pipeline as exactly this sprite or animation - for every valid name and frame count", () => {
        const names = ["brick", "wall_fountain_top_1", "heart_full", "f1", "x", "a_f", "door_f_left", "zombie_anim_2"];
        names.forEach(name => {
            expect(ValidateSpriteName(name), name).toBeNull();
            [1, 2, 3, 10, 11, 100].forEach(count => {
                const files = FrameFileNames(name, count);
                const grouped = ids.GroupFrames(files.map(f => f.replace(/\.png$/, "")));
                const label = `${name} x${count}`;
                expect(grouped.diagnostics, label).toEqual([]);
                if (count === 1) {
                    expect(grouped.sprites.map((s: { name: string }) => s.name), label).toEqual([name]);
                    expect(grouped.animations, label).toEqual([]);
                } else {
                    expect(grouped.sprites, label).toEqual([]);
                    expect(grouped.animations).toHaveLength(1);
                    expect(grouped.animations[0].name, label).toBe(name);
                    expect(grouped.animations[0].frames, label).toEqual(files.map(f => f.replace(/\.png$/, "")));
                }
            });
        });
    });

    it("would be misread by the pipeline for a name ending in _f<N> - which is why validation refuses them", () => {
        const grouped = ids.GroupFrames(FrameFileNames("run_f3", 1).map(f => f.replace(/\.png$/, "")));
        expect(grouped.diagnostics).not.toEqual([]);
        expect(ValidateSpriteName("run_f3")).not.toBeNull();
    });
});

describe("ParseFrameFile", () => {
    it("reads a frame file as the pipeline does", () => {
        expect(ParseFrameFile("fire_f2.png")).toEqual({ name: "fire", index: 2 });
        expect(ParseFrameFile("brick.png")).toEqual({ name: "brick", index: null });
        // Names are normalised (lowercased) before the frame suffix is looked for, so the capital F still marks a frame.
        expect(ParseFrameFile("Wall-Top_F1.PNG")).toEqual({ name: "wall_top", index: 1 });
        expect(ParseFrameFile("wall_fountain_top_1.png")).toEqual({ name: "wall_fountain_top_1", index: null });
        expect(ParseFrameFile("notes.txt")).toBeNull();
        expect(ParseFrameFile("fire_f10.png")).toEqual({ name: "fire", index: 10 });
    });

    it("agrees with the pipeline, file by file", () => {
        ["a_f1_f2", "Fire_F3", "wall_fountain_top_1", "heart_full", "x-y_f0", "plain", "a_f", "a_f01"].forEach(base => {
            const reference = ids.ParseFrameName(ids.NormalizeLocalName(base));
            const expected = reference ? { name: reference.name, index: reference.index } : { name: ids.NormalizeLocalName(base), index: null };
            expect(ParseFrameFile(base + ".png"), base).toEqual(expected);
        });
    });
});
