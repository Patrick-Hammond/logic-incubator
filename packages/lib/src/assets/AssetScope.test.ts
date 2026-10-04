import { describe, expect, it } from "vitest";
import { ScopedNames } from "./AssetScope";
import BundleRefs from "./BundleRefs";
import { ValidateManifest } from "./AssetManifest";

describe("ScopedNames", () => {
    const registered = new Set(["global.wall", "global.torch", "level1.torch", "level1.lava", "collision"]);
    const names = new ScopedNames(key => registered.has(key));

    it("resolves a bare name through the chain, nearest bundle first", () => {
        names.SetChain(["level1", "global"]);
        expect(names.Resolve("torch")).toBe("level1.torch");
        expect(names.Resolve("wall")).toBe("global.wall");
        expect(names.Resolve("lava")).toBe("level1.lava");
    });

    it("leaves a bundle out of reach when it isn't in the chain", () => {
        names.SetChain(["global"]);
        expect(names.Resolve("torch")).toBe("global.torch");
        expect(names.Resolve("lava")).toBeUndefined();
    });

    it("takes a qualified id, or a name registered outside any bundle, as itself", () => {
        names.SetChain(["global"]);
        expect(names.Resolve("level1.lava")).toBe("level1.lava");
        expect(names.Resolve("collision")).toBe("collision");
    });

    it("remembers answers until told the registry changed - or the chain does", () => {
        const live = new Set<string>();
        const scoped = new ScopedNames(key => live.has(key));
        scoped.SetChain(["global"]);
        expect(scoped.Resolve("rock")).toBeUndefined();
        live.add("global.rock");
        expect(scoped.Resolve("rock")).toBeUndefined(); // cached
        scoped.Invalidate();
        expect(scoped.Resolve("rock")).toBe("global.rock");
        live.add("level9.rock");
        scoped.SetChain(["level9", "global"]);
        expect(scoped.Resolve("rock")).toBe("level9.rock");
    });

    it("hands out copies of its chain", () => {
        names.SetChain(["a", "b"]);
        names.Chain.push("c");
        expect(names.Chain).toEqual(["a", "b"]);
    });
});

describe("BundleRefs", () => {
    it("counts holders, and is free only with none and no pin", () => {
        const refs = new BundleRefs();
        expect(refs.IsFree("a")).toBe(true);
        expect(refs.Retain("a")).toBe(1);
        expect(refs.Retain("a")).toBe(2);
        expect(refs.IsFree("a")).toBe(false);
        expect(refs.Release("a")).toBe(1);
        expect(refs.Release("a")).toBe(0);
        expect(refs.IsFree("a")).toBe(true);
        refs.Pin("a");
        expect(refs.IsFree("a")).toBe(false);
    });

    it("doesn't go below zero", () => {
        const refs = new BundleRefs();
        expect(refs.Release("never")).toBe(0);
        expect(refs.Count("never")).toBe(0);
    });
});

describe("ValidateManifest", () => {
    const bundle = { dependsOn: [] as string[], preload: "boot", hash: "abc", bytes: 1, atlases: [], assets: {} as object };
    const valid = () => ({ version: 1, dev: false, bundles: { global: { ...bundle, assets: { "global.a": { kind: "image", url: "x.png", bytes: 1, tier: "boot" } } } } });

    it("accepts what the build writes", () => {
        expect(ValidateManifest(valid()).bundles.global.hash).toBe("abc");
    });

    it("rejects another version, telling the developer to rebuild", () => {
        expect(() => ValidateManifest({ ...valid(), version: 2 })).toThrow("npm run assets");
    });

    it("rejects malformed bundles, unknown dependencies, assets outside their bundle, unknown kinds and tiers", () => {
        expect(() => ValidateManifest(null)).toThrow("not an object");
        expect(() => ValidateManifest({ version: 1, bundles: { a: {} } })).toThrow('bundle "a" is malformed');
        expect(() => ValidateManifest({ version: 1, bundles: { a: { ...bundle, dependsOn: ["b"] } } })).toThrow('depends on "b"');
        expect(() => ValidateManifest({ version: 1, bundles: { a: { ...bundle, assets: { "b.x": { kind: "image", tier: "boot" } } } } })).toThrow("isn't named under its bundle");
        expect(() => ValidateManifest({ version: 1, bundles: { a: { ...bundle, assets: { "a.x": { kind: "mesh" } } } } })).toThrow("unknown kind");
        expect(() => ValidateManifest({ version: 1, bundles: { a: { ...bundle, assets: { "a.x": { kind: "image", tier: "soon" } } } } })).toThrow("unknown tier");
    });
});
