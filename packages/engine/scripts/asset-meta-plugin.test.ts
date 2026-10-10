import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createRequire } from "module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AssetCategories } from "../src/level/AssetMetadata";

const { afterScan, onSpriteSaved, CATEGORIES } = createRequire(import.meta.url)("./asset-meta-plugin.js");

type Report = { level: string; message: string; bundle?: string };
let dir: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "asset-meta-"));
    fs.mkdirSync(path.join(dir, "data"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const metaFile = () => path.join(dir, "data", "assets-meta.json");

/** A scanned bundle with these sprites, animations and (optionally) an assets-meta.json holding `meta`. */
function run(sprites: string[], animations: string[], meta: object | null, check = false): Report[] {
    if (meta) {
        fs.writeFileSync(metaFile(), JSON.stringify(meta, null, "\t") + "\n");
    }
    const assets = [
        ...sprites.map(local => ({ kind: "sprite", local })),
        ...animations.map(local => ({ kind: "animation", local })),
        ...(meta ? [{ kind: "data", local: "assets_meta", files: [{ rel: "data/assets-meta.json" }] }] : []),
    ];
    const reports: Report[] = [];
    afterScan({
        bundles: [{ name: "global", dir, assets }],
        check,
        Report: (level: string, message: string, bundle: string) => reports.push({ level, message, bundle }),
    });
    return reports;
}
const read = () => JSON.parse(fs.readFileSync(metaFile(), "utf8"));

describe("asset-meta plugin", () => {
    it("adds an empty entry for a sprite or animation the file doesn't have, keeping keys sorted", () => {
        run(["wall", "crate"], ["torch_anim"], { wall: { collidable: true } });
        expect(Object.keys(read())).toEqual(["crate", "torch_anim", "wall"]);
        expect(read().crate).toEqual({});
        expect(read().wall).toEqual({ collidable: true });
    });

    it("never touches an existing entry's values", () => {
        const meta = { door: { door: { id: 1, open: false } }, torch: { light: { brightness: 1, tint: 2, range: 3 } } };
        run(["door", "torch"], [], meta);
        expect(read()).toEqual(meta);
    });

    it("removes an entry whose sprite is gone, warning if it held anything", () => {
        const reports = run(["wall"], [], { wall: {}, gone_empty: {}, gone_full: { collidable: true } });
        expect(Object.keys(read())).toEqual(["wall"]);
        expect(reports.some(r => r.level === "warning" && r.message.includes("gone_full"))).toBe(true);
        expect(reports.some(r => r.message.includes("gone_empty"))).toBe(false);
    });

    it("leaves a bundle with no assets-meta.json alone", () => {
        expect(run(["wall"], [], null)).toEqual([]);
        expect(fs.existsSync(metaFile())).toBe(false);
    });

    it("says nothing and writes nothing when the file is already in step", () => {
        run(["a", "b"], [], { a: {}, b: {} });
        const before = fs.statSync(metaFile()).mtimeMs;
        expect(run(["a", "b"], [], { a: {}, b: {} })).toEqual([]);
        expect(fs.statSync(metaFile()).mtimeMs).toBeGreaterThanOrEqual(before);
    });

    it("with check, reports an out-of-date file as an error and doesn't write", () => {
        const reports = run(["a", "b"], [], { a: {} }, true);
        expect(reports).toHaveLength(1);
        expect(reports[0].level).toBe("error");
        expect(Object.keys(read())).toEqual(["a"]);
    });

    it("reports a file that isn't valid JSON", () => {
        fs.writeFileSync(metaFile(), "{ nope");
        const reports: Report[] = [];
        afterScan({
            bundles: [{ name: "global", dir, assets: [{ kind: "data", local: "assets_meta", files: [{ rel: "data/assets-meta.json" }] }] }],
            check: false,
            Report: (level: string, message: string) => reports.push({ level, message }),
        });
        expect(reports[0].level).toBe("error");
    });

    it("keeps the categories it accepts in step with the editor's", () => {
        expect(CATEGORIES).toEqual(AssetCategories.map(category => category.id));
    });

    it("leaves a known category alone, and reports an unknown one as an error naming the sprite", () => {
        expect(run(["a"], [], { a: { category: "weapons" } })).toEqual([]);
        const reports = run(["a", "b"], [], { a: { category: "weapons" }, b: { category: "Weapon" } });
        const errors = reports.filter(r => r.level === "error");
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('"b"');
        expect(errors[0].message).toContain('"Weapon"');
        expect(read().a).toEqual({ category: "weapons" });
    });

    it("keeps a category through a sync that adds and removes other entries", () => {
        run(["a", "new_one"], [], { a: { category: "items", pickup: { kind: "gold", amount: 1 } }, gone: {} });
        expect(read().a).toEqual({ category: "items", pickup: { kind: "gold", amount: 1 } });
        expect(read().new_one).toEqual({});
    });
});

describe("asset-meta plugin: a sprite saved by the editor", () => {
    const bundle = (withMeta = true) => ({
        name: "global",
        dir,
        assets: withMeta ? [{ kind: "data", local: "assets_meta", files: [{ rel: "data/assets-meta.json" }] }] : []
    });
    const saved = (extra: object, withMeta = true): Report[] => {
        const reports: Report[] = [];
        onSpriteSaved({ bundle: bundle(withMeta), name: "gem", isNew: true, Report: (level: string, message: string) => reports.push({ level, message }), ...extra });
        return reports;
    };
    const start = (meta: object) => fs.writeFileSync(metaFile(), JSON.stringify(meta, null, "\t") + "\n");

    it("gets an entry carrying the category it was made under, the keys staying sorted", () => {
        start({ wall: { collidable: true }, apple: {} });
        expect(saved({ category: "items" })).toEqual([]);
        expect(Object.keys(read())).toEqual(["apple", "gem", "wall"]);
        expect(read().gem).toEqual({ category: "items" });
        expect(read().wall).toEqual({ collidable: true });
    });

    it("gets a copy of another sprite's entry - a copy, not the same object - and the chosen category wins", () => {
        start({ wall: { category: "walls", collidable: true, light: { brightness: 1, tint: 2, range: 3 } } });
        saved({ copyMetaFrom: "wall" });
        expect(read().gem).toEqual(read().wall);
        saved({ name: "gem2", copyMetaFrom: "wall", category: "user" });
        expect(read().gem2).toEqual({ category: "user", collidable: true, light: { brightness: 1, tint: 2, range: 3 } });
        expect(read().wall.category).toBe("walls");
    });

    it("copies nothing from a sprite it doesn't know", () => {
        start({ wall: { collidable: true } });
        saved({ copyMetaFrom: "nope" });
        expect(read().gem).toEqual({});
    });

    it("gets an empty entry if nothing was asked", () => {
        start({});
        saved({});
        expect(read()).toEqual({ gem: {} });
    });

    it("leaves an existing entry alone, and does nothing for an overwrite", () => {
        start({ gem: { collidable: true } });
        saved({ category: "items" });
        expect(read().gem).toEqual({ collidable: true });
        start({});
        saved({ isNew: false, category: "items" });
        expect(read()).toEqual({});
    });

    it("warns about a category it doesn't know, and adds the entry without one", () => {
        start({});
        const reports = saved({ category: "Weapon" });
        expect(reports).toHaveLength(1);
        expect(reports[0].level).toBe("warning");
        expect(reports[0].message).toContain('"Weapon"');
        expect(read().gem).toEqual({});
    });

    it("leaves a bundle with no assets-meta.json alone", () => {
        expect(saved({ category: "items" }, false)).toEqual([]);
        expect(fs.existsSync(metaFile())).toBe(false);
    });

    it("reports a file that isn't valid JSON and doesn't overwrite it", () => {
        fs.writeFileSync(metaFile(), "{ nope");
        const reports = saved({ category: "items" });
        expect(reports[0].level).toBe("error");
        expect(fs.readFileSync(metaFile(), "utf8")).toBe("{ nope");
    });
});
