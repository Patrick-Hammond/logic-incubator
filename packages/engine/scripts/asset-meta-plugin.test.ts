import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createRequire } from "module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { afterScan } = createRequire(import.meta.url)("./asset-meta-plugin.js");

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
});
