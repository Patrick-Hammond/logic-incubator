import { describe, expect, it } from "vitest";
import { LevelVersion } from "@logic-incubator/engine/level/LevelFormat";
import {
    CleanLevelName,
    DescribeSavedAt,
    DescribeSize,
    HasUnsavedWork,
    IsLevelFile,
    IsStorageFull,
    LevelFileName,
    LevelNameFromFile,
    LevelNameProblem,
    LevelStorage,
    MaxLevelNameLength,
    NamedLevelPrefix,
    NamedLevels
} from "./NamedLevels";
import { EditorSave, LevelContent, MakeEditorSave } from "./SavedLevel";
import EditorStore from "./stores/EditorStore";
import LevelDataStore from "./stores/LevelDataStore";

/** Local storage in a map, that throws like a full browser once it holds more than `limit` characters. */
function MemoryStorage(limit = Infinity): LevelStorage & { items: Map<string, string> } {
    const items = new Map<string, string>();
    const used = () => Array.from(items.entries()).reduce((n, [k, v]) => n + k.length + v.length, 0);
    return {
        items,
        get length() {
            return items.size;
        },
        key: (index: number) => Array.from(items.keys())[index] ?? null,
        getItem: (key: string) => (items.has(key) ? items.get(key) : null),
        setItem: (key: string, value: string) => {
            const before = items.get(key);
            items.set(key, value);
            if (used() > limit) {
                if (before === undefined) {
                    items.delete(key);
                } else {
                    items.set(key, before);
                }
                throw Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError", code: 22 });
            }
        },
        removeItem: (key: string) => {
            items.delete(key);
        }
    };
}

const floor = { name: "floor_1", position: { x: 1, y: 1 }, pixelOffset: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, layerId: 1, data: null };

function Level(name = "", brushes = 1): EditorSave {
    const store = new EditorStore();
    const save = MakeEditorSave({ ...store.state, levelName: name }, new LevelDataStore(1).state);
    return { ...save, levelData: { ...save.levelData, levelData: Array.from({ length: brushes }, (_, x) => ({ ...floor, position: { x, y: 1 } })) } };
}

describe("named levels", () => {
    it("are saved, listed newest first and read back, each under its own key beside the editor's own level", () => {
        const storage = MemoryStorage();
        storage.setItem("dungeonLevel", "{}");
        const levels = new NamedLevels(storage);
        expect(levels.Save("Crypt", Level("Crypt", 2), 1000)).toEqual({ ok: true, replaced: false });
        expect(levels.Save("Arena", Level("Arena", 3), 2000)).toEqual({ ok: true, replaced: false });

        expect(levels.List().map(level => [level.name, level.savedAt])).toEqual([
            ["Arena", 2000],
            ["Crypt", 1000]
        ]);
        expect(storage.items.has(NamedLevelPrefix + "Crypt")).toBe(true);
        expect(storage.items.get("dungeonLevel")).toBe("{}");
        expect(levels.Has("Crypt")).toBe(true);
        expect(levels.Read("Crypt").save.levelData.levelData).toHaveLength(2);
        expect(levels.Read("Crypt").save.version).toBe(LevelVersion);
        expect(levels.List()[0].size).toBe((NamedLevelPrefix + "Arena").length + storage.items.get(NamedLevelPrefix + "Arena").length);
    });

    it("replace a level of the same name, and say so", () => {
        const levels = new NamedLevels(MemoryStorage());
        levels.Save("Crypt", Level("Crypt", 1), 1000);
        expect(levels.Save("  Crypt ", Level("Crypt", 4), 3000)).toEqual({ ok: true, replaced: true });
        expect(levels.List()).toHaveLength(1);
        expect(levels.Read("Crypt").save.levelData.levelData).toHaveLength(4);
    });

    it("go by their names trimmed, with runs of spaces made one, and need one of up to the longest allowed", () => {
        expect(CleanLevelName("  The \t Sunken\nCrypt  ")).toBe("The Sunken Crypt");
        expect(LevelNameProblem("   ")).toMatch(/name/);
        expect(LevelNameProblem("x".repeat(MaxLevelNameLength))).toBeNull();
        expect(LevelNameProblem("x".repeat(MaxLevelNameLength + 1))).toMatch(/characters/);
        const levels = new NamedLevels(MemoryStorage());
        expect(levels.Save(" ", Level())).toMatchObject({ ok: false, full: false });
        expect(levels.List()).toEqual([]);
    });

    it("say when the browser's storage is full, leaving the level they'd have replaced as it was", () => {
        const storage = MemoryStorage(20000);
        const levels = new NamedLevels(storage);
        expect(levels.Save("Small", Level("Small", 1), 1000).ok).toBe(true);
        const result = levels.Save("Small", Level("Small", 200), 2000);
        expect(result).toMatchObject({ ok: false, full: true });
        expect(result.ok === false && result.error).toMatch(/full/);
        expect(levels.Read("Small").save.levelData.levelData).toHaveLength(1);
        expect(levels.Save("Big", Level("Big", 200)).ok).toBe(false);
        expect(levels.Has("Big")).toBe(false);
    });

    it("can't be kept without storage, and list nothing", () => {
        const levels = new NamedLevels(null);
        expect(levels.Available).toBe(false);
        expect(levels.Save("Crypt", Level())).toMatchObject({ ok: false, full: false });
        expect(levels.List()).toEqual([]);
        expect(levels.Read("Crypt").error).toMatch(/no level/);
        expect(levels.UsedSpace()).toBe(0);
    });

    it("survive storage that throws on every call, as blocked site data does", () => {
        const blocked: LevelStorage = {
            get length(): number {
                throw new Error("blocked");
            },
            key: () => {
                throw new Error("blocked");
            },
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("blocked");
            },
            removeItem: () => {
                throw new Error("blocked");
            }
        };
        const levels = new NamedLevels(blocked);
        expect(levels.List()).toEqual([]);
        expect(levels.Save("Crypt", Level())).toMatchObject({ ok: false, full: false });
        expect(() => levels.Delete("Crypt")).not.toThrow();
    });

    it("are deleted, leaving the rest", () => {
        const levels = new NamedLevels(MemoryStorage());
        levels.Save("Crypt", Level(), 1);
        levels.Save("Arena", Level(), 2);
        levels.Delete("Crypt");
        expect(levels.List().map(level => level.name)).toEqual(["Arena"]);
    });

    it("list one that can't be read last, to be deleted, and say why it can't be opened", () => {
        const storage = MemoryStorage();
        const levels = new NamedLevels(storage);
        levels.Save("Crypt", Level(), 5);
        storage.setItem(NamedLevelPrefix + "Broken", "{ not json");
        storage.setItem(NamedLevelPrefix + "Odd", JSON.stringify({ savedAt: 9, level: { hello: 1 } }));
        expect(levels.List().map(level => [level.name, !!level.unreadable])).toEqual([
            ["Crypt", false],
            ["Broken", true],
            ["Odd", true]
        ]);
        expect(levels.Read("Broken").error).toMatch(/can't be read/);
        expect(levels.FileText("Broken")).toBeNull();
    });

    it("say why one saved by a newer editor can't be opened", () => {
        const storage = MemoryStorage();
        const levels = new NamedLevels(storage);
        levels.Save("Future", { ...Level(), version: LevelVersion + 1 }, 5);
        expect(levels.Read("Future").error).toMatch(/newer/);
    });

    it("download as the level file itself, which opens as any file does", () => {
        const levels = new NamedLevels(MemoryStorage());
        const level = Level("Crypt", 3);
        levels.Save("Crypt", level, 5);
        const file = JSON.parse(levels.FileText("Crypt"));
        expect(IsLevelFile(file)).toBe(true);
        expect(file).toEqual(level);
    });

    it("count everything the site keeps in storage as the space used", () => {
        const storage = MemoryStorage();
        storage.setItem("dungeonLevel", "12345");
        const levels = new NamedLevels(storage);
        expect(levels.UsedSpace()).toBe("dungeonLevel".length + 5);
    });
});

describe("level files", () => {
    it("are named after the level, without what a file name can't have", () => {
        expect(LevelFileName("The Sunken Crypt")).toBe("The Sunken Crypt.json");
        expect(LevelFileName('a/b\\c:d*e?"f"<g>|h')).toBe("a-b-c-d-e-f-g-h.json");
        expect(LevelFileName("  ")).toBe("dungeonLevel.json");
        expect(LevelFileName("...")).toBe("dungeonLevel.json");
    });

    it("give their name to a level that doesn't carry one", () => {
        expect(LevelNameFromFile("The Sunken Crypt.json")).toBe("The Sunken Crypt");
        expect(LevelNameFromFile("C:\\levels\\dungeonLevel.txt")).toBe("dungeonLevel");
        expect(LevelNameFromFile("level")).toBe("level");
    });

    it("are told from other JSON by their layers and brushes", () => {
        expect(IsLevelFile(Level())).toBe(true);
        expect(IsLevelFile({})).toBe(false);
        expect(IsLevelFile(null)).toBe(false);
        expect(IsLevelFile({ editorData: { layers: [] }, levelData: {} })).toBe(false);
    });
});

describe("unsaved work", () => {
    const empty = MakeEditorSave(new EditorStore().state, new LevelDataStore(1).state);

    it("is none on an empty map", () => {
        expect(HasUnsavedWork(empty, undefined, new NamedLevels(MemoryStorage()))).toBe(false);
    });

    it("is a painted map that was never saved, opened or downloaded", () => {
        expect(HasUnsavedWork(Level(), undefined, new NamedLevels(MemoryStorage()))).toBe(true);
    });

    it("is none while the map is as it was last kept, or as it's saved under its name", () => {
        const levels = new NamedLevels(MemoryStorage());
        const level = Level("Crypt", 2);
        expect(HasUnsavedWork(level, LevelContent(level), levels)).toBe(false);
        levels.Save("Crypt", level, 1);
        expect(HasUnsavedWork(level, undefined, levels)).toBe(false);
        expect(HasUnsavedWork(Level("Crypt", 3), undefined, levels)).toBe(true);
        expect(HasUnsavedWork(Level("Arena", 2), undefined, levels)).toBe(true);
    });
});

describe("the list's wording", () => {
    const now = new Date(2026, 10, 6, 15, 30).getTime();

    it("says when a level was saved, nearer days more plainly", () => {
        expect(DescribeSavedAt(new Date(2026, 10, 6, 9, 5).getTime(), now)).toBe("today 09:05");
        expect(DescribeSavedAt(new Date(2026, 10, 5, 23, 59).getTime(), now)).toBe("yesterday 23:59");
        expect(DescribeSavedAt(new Date(2026, 9, 31, 14, 2).getTime(), now)).toBe("31 Oct 14:02");
        expect(DescribeSavedAt(new Date(2025, 11, 25, 8, 0).getTime(), now)).toBe("25 Dec 2025");
    });

    it("gives sizes as people read them", () => {
        expect(DescribeSize(800)).toBe("800 B");
        expect(DescribeSize(333 * 1024)).toBe("333 KB");
        expect(DescribeSize(1.25 * 1024 * 1024)).toBe("1.3 MB");
        expect(DescribeSize(5 * 1024 * 1024)).toBe("5 MB");
    });

    it("knows a full browser by any of the names it goes by", () => {
        expect(IsStorageFull({ name: "QuotaExceededError" })).toBe(true);
        expect(IsStorageFull({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
        expect(IsStorageFull({ code: 22 })).toBe(true);
        expect(IsStorageFull(new Error("blocked"))).toBe(false);
        expect(IsStorageFull(null)).toBe(false);
    });
});
