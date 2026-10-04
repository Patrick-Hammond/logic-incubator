import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createRequire } from "module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { BuildAssets } = require("./build.js");
const { GenerateDts, IsDtsStale } = require("./dts.js");
const { StableStringify } = require("./manifest.js");
const { NewImage } = require("./image.js");
const { WritePng } = require("./png.js");

let dir: string;

/** A frame PNG: a w*h image with an opaque box, so trimming has something to do. */
function framePng(w: number, h: number, shade: number): Buffer {
    const img = NewImage(w, h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            img.data.set([shade, 0, 0, 255], (y * w + x) * 4);
        }
    }
    return WritePng(img);
}

function write(rel: string, data: string | Buffer): void {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
}

function build(options: object = {}) {
    return BuildAssets({ configPath: path.join(dir, "assets.config.json"), ...options });
}

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "assets-"));
    write("assets.config.json", JSON.stringify({ roots: ["assets", { dir: "editor", devOnly: true }], out: ".assets", dts: "gen/assets.d.ts" }));
    write("assets/global/sprites/dungeon/bomb_f0.png", framePng(16, 16, 10));
    write("assets/global/sprites/dungeon/bomb_f1.png", framePng(16, 16, 20));
    write("assets/global/sprites/dungeon/crate.png", framePng(16, 16, 30));
    write("assets/global/images/title.png", framePng(8, 8, 40));
    write("assets/global/sounds/click.ogg", "ogg-bytes");
    write("assets/global/sounds/click.m4a", "m4a-bytes");
    write("assets/global/data/assets-meta.json", JSON.stringify({ crate: { collidable: true } }));
    write("assets/level1/bundle.json", JSON.stringify({ dependsOn: ["global"], assets: { music: { tier: "lazy" } } }));
    write("assets/level1/sounds/music.ogg", "music-bytes");
    write("assets/level1/data/level.json", JSON.stringify({ tiles: [] }));
    write("editor/editor/images/square.png", framePng(8, 8, 50));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("BuildAssets", () => {
    it("builds a manifest, atlas, copies and declarations from the folders", () => {
        const result = build();
        expect(result.diagnostics.filter((d: { level: string }) => d.level === "error")).toEqual([]);
        expect(result.ok).toBe(true);

        const manifest = JSON.parse(fs.readFileSync(path.join(dir, ".assets/public/manifest.json"), "utf8"));
        expect(manifest.version).toBe(1);
        expect(manifest.dev).toBe(true);
        expect(Object.keys(manifest.bundles)).toEqual(["editor", "global", "level1"]);
        const global = manifest.bundles.global;
        expect(global.preload).toBe("boot");
        expect(global.hash).toMatch(/^[0-9a-f]{10}$/);
        expect(global.assets["global.bomb"]).toEqual({ kind: "animation", frames: ["global.bomb_f0", "global.bomb_f1"] });
        expect(global.assets["global.crate"]).toEqual({ kind: "sprite", frames: ["global.crate"] });
        expect(global.assets["global.click"].urls).toEqual(["global/sounds/click.ogg", "global/sounds/click.m4a"]);
        expect(global.assets["global.title"].url).toBe("global/images/title.png");
        expect(global.atlases).toHaveLength(1);
        expect(manifest.bundles.level1.dependsOn).toEqual(["global"]);
        expect(manifest.bundles.level1.assets["level1.music"].tier).toBe("lazy");

        const atlas = JSON.parse(fs.readFileSync(path.join(dir, ".assets/public", global.atlases[0].json), "utf8"));
        expect(Object.keys(atlas.frames)).toEqual(["global.bomb_f0", "global.bomb_f1", "global.crate"]);
        expect(fs.existsSync(path.join(dir, ".assets/public/global/atlases/dungeon_0.png"))).toBe(true);
        expect(fs.readFileSync(path.join(dir, ".assets/public/global/sounds/click.m4a"), "utf8")).toBe("m4a-bytes");

        const dts = fs.readFileSync(path.join(dir, "gen/assets.d.ts"), "utf8");
        expect(dts).toContain('"global.bomb": "animation";');
        expect(dts).toContain('"level1.music": "sound";');
        expect(dts).toContain('"editor.square": "image";');
    });

    it("does no work the second time: nothing is written, whatever the clock says", () => {
        build();
        const second = build();
        expect(second.written).toEqual([]);
        expect(second.removed).toEqual([]);
    });

    it("rebuilds only what changed, and busts only that bundle's hash", () => {
        const before = build().manifest.bundles;
        write("assets/level1/sounds/music.ogg", "different-music");
        const result = build();
        expect(result.written).toEqual(["level1/sounds/music.ogg", "manifest.json"]);
        expect(result.manifest.bundles.level1.hash).not.toBe(before.level1.hash);
        expect(result.manifest.bundles.global.hash).toBe(before.global.hash);
    });

    it("repacks when a frame changes, and removes files that are no longer produced", () => {
        build();
        write("assets/global/sprites/dungeon/crate.png", framePng(16, 16, 99));
        fs.rmSync(path.join(dir, "assets/global/sounds/click.m4a"));
        const result = build();
        expect(result.written).toContain("global/atlases/dungeon_0.png");
        expect(result.removed).toEqual(["global/sounds/click.m4a"]);
    });

    it("leaves dev-only roots out of a production build, but keeps their ids in the declarations", () => {
        const dev = build();
        const devDts = dev.dts;
        const prod = build({ production: true });
        expect(prod.manifest.dev).toBe(false);
        expect(Object.keys(prod.manifest.bundles)).toEqual(["global", "level1"]);
        expect(fs.existsSync(path.join(dir, ".assets/public/editor"))).toBe(false);
        expect(prod.dts).toBe(devDts);
    });

    it("fails the build, and writes nothing, on an error", () => {
        write("assets/global/images/click.png", framePng(4, 4, 1));
        const result = build();
        expect(result.ok).toBe(false);
        expect(result.diagnostics.some((d: { message: string }) => d.message.includes("global.click"))).toBe(true);
        expect(fs.existsSync(path.join(dir, ".assets"))).toBe(false);
    });

    it("rejects a dependency on a bundle that doesn't exist, with a suggestion", () => {
        write("assets/level1/bundle.json", JSON.stringify({ dependsOn: ["globl"] }));
        const result = build();
        expect(result.ok).toBe(false);
        expect(result.diagnostics.map((d: { message: string }) => d.message).join("\n")).toContain('did you mean "global"');
    });

    it("rejects dependency cycles and invalid data files", () => {
        write("assets/global/bundle.json", JSON.stringify({ dependsOn: ["level1"] }));
        expect(build().diagnostics.some((d: { message: string }) => d.message.includes("cycle"))).toBe(true);
        write("assets/global/bundle.json", "{}");
        write("assets/level1/data/level.json", "{ not json");
        expect(build().diagnostics.some((d: { message: string }) => d.message.includes("level.json"))).toBe(true);
    });

    it("warns when a bundle's sprite shadows one it loads with, unless it's declared an override", () => {
        write("assets/level1/sprites/tiles/crate.png", framePng(16, 16, 77));
        const shadowed = build();
        expect(shadowed.ok).toBe(true);
        expect(shadowed.diagnostics.some((d: { message: string }) => d.message.includes("shadows"))).toBe(true);
        write("assets/level1/bundle.json", JSON.stringify({ dependsOn: ["global"], overrides: ["crate"], assets: { music: { tier: "lazy" } } }));
        expect(build().diagnostics.some((d: { message: string }) => d.message.includes("shadows"))).toBe(false);
    });

    it("re-keys an already-packed sheet into the bundle's namespace", () => {
        write("assets/level1/sprites/old.json", JSON.stringify({ frames: { "cat_f0.png": { frame: { x: 0, y: 0, w: 4, h: 4 } }, "cat_f1.png": { frame: { x: 4, y: 0, w: 4, h: 4 } } }, meta: { image: "old.png" } }));
        write("assets/level1/sprites/old.png", framePng(8, 4, 5));
        const result = build();
        expect(result.ok).toBe(true);
        expect(result.manifest.bundles.level1.assets["level1.cat"]).toEqual({ kind: "animation", frames: ["level1.cat_f0", "level1.cat_f1"] });
        const atlas = JSON.parse(fs.readFileSync(path.join(dir, ".assets/public/level1/atlases/old_0.json"), "utf8"));
        expect(Object.keys(atlas.frames)).toEqual(["level1.cat_f0", "level1.cat_f1"]);
        expect(atlas.meta.image).toBe("old_0.png");
    });

    it("--check passes when the declarations are current and fails when they're stale, writing nothing", () => {
        expect(build({ check: true }).ok).toBe(false); // no d.ts yet
        build();
        expect(build({ check: true }).ok).toBe(true);
        write("assets/global/images/extra.png", framePng(4, 4, 1));
        const stale = build({ check: true });
        expect(stale.ok).toBe(false);
        expect(stale.diagnostics[0].message).toContain("out of date");
        expect(fs.readFileSync(path.join(dir, "gen/assets.d.ts"), "utf8")).not.toContain("extra");
        // CRLF checkouts (autocrlf) don't count as stale
        fs.writeFileSync(path.join(dir, "gen/assets.d.ts"), build().dts.replace(/\n/g, "\r\n"));
        expect(build({ check: true }).ok).toBe(true);
    });

    it("runs plugins after the scan, then classifies again (they may write source files)", () => {
        const plugin = path.join(dir, "plugin.js");
        fs.writeFileSync(plugin, `exports.afterScan = ctx => { require("fs").writeFileSync(${JSON.stringify(path.join(dir, "assets/global/data/generated.json"))}, JSON.stringify({ bundles: ctx.bundles.map(b => b.name) })); };`);
        write("assets.config.json", JSON.stringify({ roots: ["assets"], out: ".assets", dts: "gen/assets.d.ts", plugins: ["plugin.js"] }));
        const result = build();
        expect(result.ok).toBe(true);
        expect(result.manifest.bundles.global.assets["global.generated"]).toBeDefined();
    });
});

describe("GenerateDts", () => {
    const bundles = [
        { name: "level1", assets: [{ id: "level1.b", kind: "sound" }] },
        { name: "global", assets: [{ id: "global.z", kind: "image" }, { id: "global.a", kind: "sprite" }] }
    ];

    it("is sorted, LF only, and augments the lib's registries", () => {
        const dts = GenerateDts(bundles, "@logic-incubator/lib/assets/AssetIds");
        expect(dts).not.toContain("\r");
        expect(dts).toContain("export {};");
        expect(dts).toContain('declare module "@logic-incubator/lib/assets/AssetIds" {');
        expect(dts.indexOf('"global.a"')).toBeLessThan(dts.indexOf('"global.z"'));
        expect(dts.indexOf('"global.z"')).toBeLessThan(dts.indexOf('"level1.b"'));
        expect(dts.indexOf('"global": true')).toBeLessThan(dts.indexOf('"level1": true'));
    });

    it("is the same whatever order the bundles come in, and detects staleness ignoring line endings", () => {
        const a = GenerateDts(bundles, "m");
        expect(GenerateDts(bundles.slice().reverse(), "m")).toBe(a);
        expect(IsDtsStale(a.replace(/\n/g, "\r\n"), a)).toBe(false);
        expect(IsDtsStale(a + "x", a)).toBe(true);
        expect(IsDtsStale(undefined, a)).toBe(true);
    });

    it("writes an empty registry as an empty interface", () => {
        expect(GenerateDts([], "m")).toContain("interface AssetRegistry {}");
    });
});

describe("StableStringify", () => {
    it("sorts keys at every depth and ends with a newline", () => {
        expect(StableStringify({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } })).toBe('{\n\t"a": {\n\t\t"c": [\n\t\t\t{\n\t\t\t\t"y": 2,\n\t\t\t\t"z": 1\n\t\t\t}\n\t\t],\n\t\t"d": 1\n\t},\n\t"b": 1\n}\n');
    });
});
