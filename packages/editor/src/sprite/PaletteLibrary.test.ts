import { describe, expect, it } from "vitest";
import { Rgb, Rgba } from "./Colour";
import { BuiltInPalettes, CheckPaletteName, MaxPaletteNameLength, PaletteLibrary, StorageKey, StorageLike, WithTransparentFirst } from "./PaletteLibrary";

class MemoryStorage implements StorageLike {
    data: { [key: string]: string } = {};
    getItem(key: string) {
        return key in this.data ? this.data[key] : null;
    }
    setItem(key: string, value: string) {
        this.data[key] = value;
    }
}

const THROWS: StorageLike = {
    getItem() {
        throw new Error("blocked");
    },
    setItem() {
        throw new Error("quota");
    }
};

const RED = Rgb(255, 0, 0);
const GREEN = Rgb(0, 255, 0);
const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };
const mine = (lib: PaletteLibrary) => lib.List().slice(BuiltInPalettes.length);

describe("the built-in palettes", () => {
    it("are sensible: named, 1..256 colours, valid bytes, no duplicate names", () => {
        const names = BuiltInPalettes.map(p => p.name.toLowerCase());
        expect(new Set(names).size).toBe(names.length);
        BuiltInPalettes.forEach(p => {
            expect(p.colours.length, p.name).toBeGreaterThan(0);
            expect(p.colours.length, p.name).toBeLessThanOrEqual(256);
            p.colours.forEach(c => [c.r, c.g, c.b, c.a].forEach(v => expect(Number.isInteger(v) && v >= 0 && v <= 255, p.name).toBe(true)));
        });
    });

    it("have the sizes they say", () => {
        const size = (name: string) => BuiltInPalettes.filter(p => p.name.startsWith(name))[0].colours.length;
        expect(size("Default")).toBe(256);
        expect(size("PICO-8")).toBe(16);
        expect(size("Game Boy")).toBe(4);
        expect(size("EGA")).toBe(16);
        expect(size("Greys")).toBe(16);
        expect(size("Web safe")).toBe(216);
    });

    it("start with the colours they're known for", () => {
        const pico = BuiltInPalettes.filter(p => p.name === "PICO-8")[0].colours;
        expect(pico[0]).toEqual(Rgb(0, 0, 0));
        expect(pico[8]).toEqual(Rgb(255, 0, 77));
        expect(pico[15]).toEqual(Rgb(255, 204, 170));
    });
});

describe("CheckPaletteName", () => {
    it("trims and collapses spaces", () => {
        expect(CheckPaletteName("  My   palette ")).toEqual({ name: "My palette" });
    });

    it("refuses empty, too long and control characters", () => {
        expect(CheckPaletteName("   ").error).toMatch(/Give the palette a name/);
        expect(CheckPaletteName("x".repeat(MaxPaletteNameLength + 1)).error).toMatch(/up to 40/);
        expect(CheckPaletteName("a\u0001b").error).toBeDefined();
        expect(CheckPaletteName("x".repeat(MaxPaletteNameLength)).name).toBeDefined();
    });
});

describe("WithTransparentFirst", () => {
    it("puts a transparent entry at the front of a palette that has none", () => {
        const out = WithTransparentFirst([RED, GREEN]);
        expect(out).toEqual([CLEAR, RED, GREEN]);
    });

    it("leaves a palette that already has one alone, copying it", () => {
        const input = [RED, CLEAR, GREEN];
        const out = WithTransparentFirst(input);
        expect(out).toEqual(input);
        out[0].r = 9;
        expect(input[0].r).toBe(255);
    });

    it("stays within 256", () => {
        const full: Rgba[] = [];
        for (let i = 0; i < 256; i++) full.push(Rgb(i, 0, 0));
        const out = WithTransparentFirst(full);
        expect(out).toHaveLength(256);
        expect(out[0].a).toBe(0);
        expect(out[255]).toEqual(Rgb(254, 0, 0));
    });
});

describe("PaletteLibrary", () => {
    it("starts with just the built-ins", () => {
        const lib = new PaletteLibrary(new MemoryStorage());
        expect(lib.List().map(p => p.name)).toEqual(BuiltInPalettes.map(p => p.name));
    });

    it("saves a palette, keeps its alpha, and lists it after the built-ins", () => {
        const lib = new PaletteLibrary(new MemoryStorage());
        const result = lib.Save("Dungeon", [CLEAR, RED, Rgb(1, 2, 3, 77)]);
        expect(result).toEqual({ ok: true, replaced: false, persisted: true });
        expect(mine(lib)).toEqual([{ name: "Dungeon", colours: [CLEAR, RED, Rgb(1, 2, 3, 77)] }]);
        expect(lib.Get("dungeon").colours[2]).toEqual(Rgb(1, 2, 3, 77));
    });

    it("keeps what it saved across a reload, via the storage", () => {
        const storage = new MemoryStorage();
        new PaletteLibrary(storage).Save("Dungeon", [CLEAR, RED]);
        const again = new PaletteLibrary(storage);
        expect(mine(again)).toEqual([{ name: "Dungeon", colours: [CLEAR, RED] }]);
        expect(JSON.parse(storage.data[StorageKey])[0].colours).toEqual(["#00000000", "#ff0000ff"]);
    });

    it("replaces a palette of the same name, ignoring case", () => {
        const lib = new PaletteLibrary(new MemoryStorage());
        lib.Save("Dungeon", [RED]);
        const result = lib.Save("DUNGEON", [GREEN]);
        expect(result.replaced).toBe(true);
        expect(mine(lib)).toEqual([{ name: "DUNGEON", colours: [GREEN] }]);
    });

    it("lists yours alphabetically, ignoring case", () => {
        const lib = new PaletteLibrary(new MemoryStorage());
        ["zeta", "Alpha", "beta"].forEach(n => lib.Save(n, [RED]));
        expect(mine(lib).map(p => p.name)).toEqual(["Alpha", "beta", "zeta"]);
    });

    it("doesn't share colours with the caller or between reads", () => {
        const lib = new PaletteLibrary(new MemoryStorage());
        const colours = [Rgb(1, 2, 3)];
        lib.Save("a", colours);
        colours[0].r = 99;
        const read = lib.Get("a");
        expect(read.colours[0].r).toBe(1);
        read.colours[0].r = 50;
        expect(lib.Get("a").colours[0].r).toBe(1);
        // The built-ins are copied out too.
        lib.List()[1].colours[0].r = 99;
        expect(lib.List()[1].colours[0].r).toBe(0);
    });

    it("refuses bad names, built-in names, and bad sizes", () => {
        const lib = new PaletteLibrary(new MemoryStorage());
        expect(lib.Save("", [RED]).ok).toBe(false);
        expect(lib.Save("pico-8", [RED])).toMatchObject({ ok: false, error: expect.stringMatching(/built-in/) });
        expect(lib.Save("empty", []).ok).toBe(false);
        expect(lib.Save("huge", new Array(257).fill(RED)).ok).toBe(false);
        expect(mine(lib)).toEqual([]);
    });

    it("clamps odd channel values it's given", () => {
        const lib = new PaletteLibrary(new MemoryStorage());
        lib.Save("odd", [{ r: -4, g: 300, b: 1.6, a: NaN }]);
        expect(lib.Get("odd").colours[0]).toEqual({ r: 0, g: 255, b: 2, a: 0 });
    });

    it("deletes one of yours but not a built-in", () => {
        const storage = new MemoryStorage();
        const lib = new PaletteLibrary(storage);
        lib.Save("mine", [RED]);
        expect(lib.Delete("MINE")).toBe(true);
        expect(lib.Delete("mine")).toBe(false);
        expect(lib.Delete("PICO-8")).toBe(false);
        expect(new PaletteLibrary(storage).List()).toHaveLength(BuiltInPalettes.length);
    });

    it("renames, refusing clashes", () => {
        const lib = new PaletteLibrary(new MemoryStorage());
        lib.Save("one", [RED]);
        lib.Save("two", [GREEN]);
        expect(lib.Rename("one", "two").ok).toBe(false);
        expect(lib.Rename("one", "Game Boy").ok).toBe(false);
        expect(lib.Rename("nope", "x").ok).toBe(false);
        expect(lib.Rename("one", " ").ok).toBe(false);
        expect(lib.Rename("one", "ONE").ok).toBe(true);
        expect(lib.Rename("one", "three").ok).toBe(true);
        expect(mine(lib).map(p => p.name)).toEqual(["three", "two"]);
        expect(lib.Get("three").colours).toEqual([RED]);
    });

    it("finds a name that isn't taken", () => {
        const lib = new PaletteLibrary(new MemoryStorage());
        expect(lib.UnusedName()).toBe("Palette");
        lib.Save("Palette", [RED]);
        lib.Save("palette 2", [RED]);
        expect(lib.UnusedName()).toBe("Palette 3");
        expect(lib.UnusedName("PICO-8")).toBe("PICO-8 2");
    });

    it("works for the session when storage is blocked or full, and says it isn't kept", () => {
        const lib = new PaletteLibrary(THROWS);
        expect(lib.List()).toHaveLength(BuiltInPalettes.length);
        const result = lib.Save("mine", [RED]);
        expect(result).toEqual({ ok: true, replaced: false, persisted: false });
        expect(lib.Get("mine").colours).toEqual([RED]);
    });

    it("works with no storage at all", () => {
        const lib = new PaletteLibrary(null);
        expect(lib.Save("mine", [RED]).persisted).toBe(false);
        expect(lib.Get("mine")).not.toBeNull();
    });

    it("ignores damaged stored data rather than failing", () => {
        const storage = new MemoryStorage();
        ["not json", "{}", "null", "[1,2]", '[{"name":"x"}]', '[{"name":"x","colours":["nope"]}]', '[{"name":"x","colours":[]}]'].forEach(raw => {
            storage.data[StorageKey] = raw;
            expect(mine(new PaletteLibrary(storage)), raw).toEqual([]);
        });
    });

    it("keeps the good palettes from a partly damaged store, dropping duplicates and built-in names", () => {
        const storage = new MemoryStorage();
        storage.data[StorageKey] = JSON.stringify([
            { name: "good", colours: ["#ff0000ff"] },
            { name: "bad", colours: ["zzz"] },
            { name: "GOOD", colours: ["#00ff00ff"] },
            { name: "pico-8", colours: ["#ff0000ff"] },
            { name: "also good", colours: ["#00ff00"] }
        ]);
        const lib = new PaletteLibrary(storage);
        expect(mine(lib).map(p => p.name)).toEqual(["also good", "good"]);
        expect(lib.Get("good").colours).toEqual([RED]);
        expect(lib.Get("also good").colours).toEqual([GREEN]);
    });

    it("uses its own key when given one, so two libraries don't mix", () => {
        const storage = new MemoryStorage();
        new PaletteLibrary(storage, "a").Save("x", [RED]);
        expect(mine(new PaletteLibrary(storage, "b"))).toEqual([]);
        expect(mine(new PaletteLibrary(storage, "a"))).toHaveLength(1);
    });
});
