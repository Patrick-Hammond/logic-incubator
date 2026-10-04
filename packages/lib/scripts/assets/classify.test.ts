import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const { ClassifyBundle, GlobToRegExp } = createRequire(import.meta.url)("./classify.js");

type Diag = { level: string; message: string };

/** A bundle from a list of `rel` paths (size = path length) and the few file bodies classify reads. */
function classify(name: string, rels: string[], config: object | null = null, texts: { [rel: string]: string } = {}) {
    return ClassifyBundle({
        name,
        files: rels.map(rel => ({ rel, bytes: rel.length })),
        config,
        readText: (rel: string) => texts[rel] ?? ""
    });
}
const errors = (model: { diagnostics: Diag[] }) => model.diagnostics.filter(d => d.level === "error").map(d => d.message);
const ids = (model: { assets: { id: string }[] }) => model.assets.map(a => a.id);
const kindOf = (model: { assets: { id: string; kind: string }[] }, id: string) => model.assets.find(a => a.id === id)?.kind;

describe("ClassifyBundle", () => {
    it("reads each file's kind from its extension, wherever it sits, with the bundle as namespace", () => {
        const model = classify("global", ["images/Title Screen.png", "deep/er/click.ogg", "data/assets-meta.json", "binary/fire.gif"]);
        expect(ids(model)).toEqual(["global.assets_meta", "global.click", "global.fire", "global.title_screen"]);
        expect(kindOf(model, "global.assets_meta")).toBe("data");
        expect(kindOf(model, "global.click")).toBe("sound");
        expect(kindOf(model, "global.fire")).toBe("binary");
        expect(kindOf(model, "global.title_screen")).toBe("image");
        expect(errors(model)).toEqual([]);
    });

    it("turns each sprites/<sheet>/ folder into a sheet, and its frames into sprites and animations", () => {
        const model = classify("global", ["sprites/dungeon/bomb_f0.png", "sprites/dungeon/bomb_f1.png", "sprites/dungeon/crate.png", "sprites/ui/heart_full.png"]);
        expect(model.sheets.map((s: { name: string }) => s.name)).toEqual(["dungeon", "ui"]);
        expect(kindOf(model, "global.bomb")).toBe("animation");
        expect(kindOf(model, "global.crate")).toBe("sprite");
        expect(model.assets.find((a: { id: string }) => a.id === "global.bomb").frames).toEqual(["bomb_f0", "bomb_f1"]);
        expect(errors(model)).toEqual([]);
    });

    it("folds encodings of one sound into one id, most preferred first, and rejects two of the same encoding", () => {
        const model = classify("level1", ["sounds/hit.m4a", "sounds/hit.ogg", "sounds/Hit.ogg"]);
        expect(errors(model)).toHaveLength(1);
        const folded = classify("level1", ["sounds/hit.m4a", "sounds/hit.ogg"]);
        const sound = folded.assets.find((a: { id: string }) => a.id === "level1.hit");
        expect(sound.files.map((f: { ext: string }) => f.ext)).toEqual(["ogg", "m4a"]);
    });

    it("rejects the same id from two kinds (an image and a sound called enter)", () => {
        const model = classify("global", ["images/enter.png", "sounds/enter.ogg"]);
        expect(errors(model)).toHaveLength(1);
        expect(errors(model)[0]).toContain("global.enter");
    });

    it("rejects the same base name in two folders", () => {
        expect(errors(classify("global", ["a/click.ogg", "b/click.ogg"]))).toHaveLength(1);
        expect(errors(classify("global", ["images/x.png", "other/x.png"]))).toHaveLength(1);
    });

    it("rejects an image named like a sprite frame (both are texture ids)", () => {
        expect(errors(classify("global", ["sprites/s/foo_f0.png", "sprites/s/foo_f1.png", "images/foo_f0.png"])).length).toBeGreaterThan(0);
    });

    it("rejects a frame defined in two sheets", () => {
        expect(errors(classify("global", ["sprites/a/crate.png", "sprites/b/crate.png"]))).toHaveLength(1);
    });

    it("reports animation gaps, and 'ignore' drops the strays", () => {
        const rels = ["sprites/s/zombie_f1.png", "sprites/s/zombie_f2.png", "sprites/s/crate.png"];
        expect(errors(classify("global", rels))).toHaveLength(1);
        const ignored = classify("global", rels, { ignore: ["**/zombie_f*"] });
        expect(errors(ignored)).toEqual([]);
        expect(ids(ignored)).toEqual(["global.crate"]);
    });

    it("warns about, and doesn't copy, files it doesn't know - but silently skips known source files", () => {
        const model = classify("global", ["notes.xyz", "art/Bitmap Font.sbx", "readme.md", "images/ok.png"]);
        expect(ids(model)).toEqual(["global.ok"]);
        expect(model.diagnostics.map((d: Diag) => d.message).join("\n")).toContain("notes.xyz");
        expect(model.diagnostics.map((d: Diag) => d.message).join("\n")).not.toContain("sbx");
    });

    it("owns a font's page images, so they aren't images in their own right", () => {
        const fnt = `<font><info face="numbers-export" /><pages><page id="0" file="numbers-export.png" /></pages></font>`;
        const model = classify("global", ["fonts/numbers-export.fnt", "fonts/numbers-export.png"], null, { "fonts/numbers-export.fnt": fnt });
        expect(ids(model)).toEqual(["global.numbers_export"]);
        expect(model.assets[0].face).toBe("numbers-export");
        expect(model.assets[0].pages).toEqual([{ file: "numbers-export.png", rel: "fonts/numbers-export.png" }]);
        expect(errors(model)).toEqual([]);
    });

    it("reports a font whose page image is missing", () => {
        const fnt = `<font><info face="f" /><pages><page id="0" file="gone.png" /></pages></font>`;
        expect(errors(classify("global", ["fonts/f.fnt"], null, { "fonts/f.fnt": fnt }))).toHaveLength(1);
    });

    it("takes an already-packed <sheet>.json + <sheet>.png as a sheet, its frame names minus extensions", () => {
        const json = JSON.stringify({ frames: { "cat_fall_f0.png": {}, "cat_fall_f1.png": {}, "spring.png": {} } });
        const model = classify("global", ["sprites/spritesheet.json", "sprites/spritesheet.png"], null, { "sprites/spritesheet.json": json });
        expect(model.sheets[0].prepacked.json).toBe("sprites/spritesheet.json");
        expect(ids(model)).toEqual(["global.cat_fall", "global.spring"]);
        expect(errors(model)).toEqual([]);
    });

    it("validates bundle.json keys and tiers, suggesting the nearest key", () => {
        const typo = classify("global", ["images/a.png"], { dependsOnn: [] });
        expect(errors(typo)[0]).toContain("dependsOn");
        expect(errors(classify("global", ["sounds/a.ogg"], { assets: { a: { tier: "later" } } }))).toHaveLength(1);
        expect(errors(classify("global", ["sounds/a.ogg"], { assets: { b: { tier: "lazy" } } }))).toHaveLength(1);
        expect(errors(classify("global", ["sprites/s/x.png"], { assets: { x: { tier: "lazy" } } }))).toHaveLength(1);
    });

    it("applies tiers, defaulting to boot, and preload defaults by bundle name", () => {
        const global = classify("global", ["sounds/a.ogg", "sounds/b.ogg"], { assets: { b: { tier: "background" } } });
        expect(global.assets.map((a: { tier: string }) => a.tier)).toEqual(["boot", "background"]);
        expect(global.preload).toBe("boot");
        expect(classify("level1", []).preload).toBe("manual");
    });

    it("rejects bad names", () => {
        expect(errors(classify("Level 1", []))).toHaveLength(1);
        expect(errors(classify("global", ["images/a.b.png"]))).toHaveLength(1);
    });

    it("lists assets in id order whatever order the files arrive in", () => {
        const rels = ["sounds/z.ogg", "images/a.png", "data/m.json"];
        expect(ids(classify("g", rels))).toEqual(ids(classify("g", rels.slice().reverse())));
    });
});

describe("GlobToRegExp", () => {
    it("matches a bare name at any depth, and * and ** as expected", () => {
        expect(GlobToRegExp("*.sbx").test("a/b/font.sbx")).toBe(true);
        expect(GlobToRegExp("sprites/*/zombie*").test("sprites/dungeon/zombie_f1.png")).toBe(true);
        expect(GlobToRegExp("sprites/*/zombie*").test("sprites/a/b/zombie_f1.png")).toBe(false);
        expect(GlobToRegExp("**/zombie_anim_f*").test("sprites/dungeon/zombie_anim_f1.png")).toBe(true);
        expect(GlobToRegExp("**/zombie_anim_f*").test("zombie_anim_f1.png")).toBe(true);
        expect(GlobToRegExp("a?.png").test("ab.png")).toBe(true);
        expect(GlobToRegExp("a.png").test("axpng")).toBe(false);
    });
});
