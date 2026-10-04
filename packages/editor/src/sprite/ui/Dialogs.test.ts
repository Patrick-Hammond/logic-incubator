import { describe, expect, it } from "vitest";
import { BundleInfo } from "../SpriteApi";
import { FieldSpec, FormDialogOptions, IsFieldVisible } from "../../ui/dialog/FormDialog";
import {
    AnchorChoices, AnchorFromValue, ApplyPaletteDialog, CheckTarget, CloneDialog, ExportPaletteDialog, ExtractDialog, LoadPaletteDialog, ManagePalettesDialog, MaxSheetLength, NewSpriteDialog,
    ReadNewSprite, ReadSaveAs, ResizeDialog, SaveAsDialog, SavePaletteDialog, ShiftDialog
} from "./Dialogs";

const bundles: BundleInfo[] = [
    { name: "global", sheets: ["dungeon", "user"], packedSheets: [], names: ["crate", "bomb", "title"] },
    { name: "level1", sheets: [], packedSheets: ["atlas"], names: ["level"] }
];
const categories = [{ id: "dungeon", name: "Dungeon" }, { id: "user", name: "User" }];

const fieldKeys = (d: FormDialogOptions) => d.fields.map(f => f.key);
const field = (d: FormDialogOptions, key: string): FieldSpec => d.fields.find(f => f.key === key);
const valid = (d: FormDialogOptions, over: object = {}) => d.validate({ ...d.values, ...over });

describe("CheckTarget", () => {
    const ok = { name: "gem", bundle: "global", sheet: "user" };

    it("accepts a fresh name in a bundle and sheet", () => {
        expect(CheckTarget(ok, bundles)).toBeNull();
        expect(CheckTarget({ ...ok, sheet: "a_new_sheet" }, bundles)).toBeNull();
    });

    it("explains a bad name first", () => {
        expect(CheckTarget({ ...ok, name: "" }, bundles)).toMatch(/Give the sprite a name/);
        expect(CheckTarget({ ...ok, name: "Gem" }, bundles)).toMatch(/lowercase/);
        expect(CheckTarget({ ...ok, name: "run_f2" }, bundles)).toMatch(/_f/);
    });

    it("refuses a name another asset in the bundle has - of any kind - but not one in another bundle", () => {
        expect(CheckTarget({ ...ok, name: "crate" }, bundles)).toMatch(/"global\.crate" is already taken/);
        expect(CheckTarget({ ...ok, name: "title" }, bundles)).toMatch(/already taken/);
        expect(CheckTarget({ ...ok, name: "crate", bundle: "level1" }, bundles)).toBeNull();
    });

    it("lets the sprite being saved over keep its own name", () => {
        expect(CheckTarget({ ...ok, name: "crate" }, bundles, "crate")).toBeNull();
        expect(CheckTarget({ ...ok, name: "bomb" }, bundles, "crate")).toMatch(/already taken/);
    });

    it("needs a bundle that exists", () => {
        expect(CheckTarget({ ...ok, bundle: "" }, bundles)).toBe("Choose a bundle.");
        expect(CheckTarget({ ...ok, bundle: "nope" }, bundles)).toBe("Choose a bundle.");
    });

    it("needs a sheet that's a plain folder name, and not a pre-packed atlas", () => {
        expect(CheckTarget({ ...ok, sheet: "" }, bundles)).toMatch(/folder name/);
        expect(CheckTarget({ ...ok, sheet: "My Sheet" }, bundles)).toMatch(/folder name/);
        expect(CheckTarget({ ...ok, sheet: "../x" }, bundles)).toMatch(/folder name/);
        expect(CheckTarget({ ...ok, sheet: "x".repeat(MaxSheetLength + 1) }, bundles)).toMatch(/folder name/);
        expect(CheckTarget({ ...ok, bundle: "level1", sheet: "atlas" }, bundles)).toMatch(/pre-packed/);
    });
});

describe("NewSpriteDialog", () => {
    const dialog = NewSpriteDialog({ bundles, categories, bundle: "global", category: "user", tileSize: 16 });

    it("starts at the tile size in the chosen bundle and category, on the user sheet", () => {
        expect(dialog.values).toMatchObject({ name: "", bundle: "global", sheet: "user", category: "user", width: 16, height: 16, frames: 1 });
        expect(fieldKeys(dialog)).toEqual(["name", "bundle", "sheet", "category", "width", "height", "frames"]);
    });

    it("won't create until the name is right", () => {
        expect(valid(dialog)).toMatch(/Give the sprite a name/);
        expect(valid(dialog, { name: "crate" })).toMatch(/already taken/);
        expect(valid(dialog, { name: "gem" })).toBeNull();
    });

    it("offers every bundle and category", () => {
        const bundleField = field(dialog, "bundle");
        expect(bundleField.type === "choice" && bundleField.options.map(o => o.value)).toEqual(["global", "level1"]);
        const categoryField = field(dialog, "category");
        expect(categoryField.type === "choice" && categoryField.options.map(o => o.label)).toEqual(["Dungeon", "User"]);
    });

    it("limits the size and frame count", () => {
        const width = field(dialog, "width");
        expect(width.type === "number" && [width.min, width.max]).toEqual([1, 512]);
        const frames = field(dialog, "frames");
        expect(frames.type === "number" && [frames.min, frames.max]).toEqual([1, 100]);
    });

    it("reads its values back with sensible fallbacks", () => {
        expect(ReadNewSprite({ name: "gem", bundle: "global", sheet: "user", category: "items", width: 8, height: 24, frames: 3 })).toEqual({ name: "gem", bundle: "global", sheet: "user", category: "items", width: 8, height: 24, frames: 3 });
        expect(ReadNewSprite({})).toEqual({ name: "", bundle: "", sheet: "", category: "", width: 16, height: 16, frames: 1 });
    });
});

describe("SaveAsDialog", () => {
    const args = { bundles, categories, name: "crate_copy", bundle: "global", sheet: "dungeon", category: "dungeon", canCopyProperties: true };

    it("offers copying tile properties only when there's an original in the same bundle to copy from", () => {
        expect(fieldKeys(SaveAsDialog(args))).toContain("copyProperties");
        expect(fieldKeys(SaveAsDialog({ ...args, canCopyProperties: false }))).not.toContain("copyProperties");
        expect(SaveAsDialog(args).values.copyProperties).toBe(true);
    });

    it("checks the target the same way", () => {
        const dialog = SaveAsDialog(args);
        expect(valid(dialog)).toBeNull();
        expect(valid(dialog, { name: "crate" })).toMatch(/already taken/);
    });

    it("reads the choice", () => {
        expect(ReadSaveAs({ name: "a", bundle: "b", sheet: "c", category: "d", copyProperties: true })).toEqual({ name: "a", bundle: "b", sheet: "c", category: "d", copyProperties: true });
        expect(ReadSaveAs({ name: "a" }).copyProperties).toBe(false);
    });
});

describe("CloneDialog", () => {
    const args = { bundles, categories, name: "crate_copy", bundle: "global", sheet: "dungeon", category: "dungeon", canCopyProperties: true };

    it("is Save as's questions under its own title, with the original's properties copied by default", () => {
        const clone = CloneDialog(args);
        const saveAs = SaveAsDialog(args);
        expect(clone.title).toBe("Clone tile");
        expect(clone.saveLabel).toBe("Clone");
        expect(clone.fields).toEqual(saveAs.fields);
        expect(clone.values).toEqual({ name: "crate_copy", bundle: "global", sheet: "dungeon", category: "dungeon", copyProperties: true });
        expect(fieldKeys(CloneDialog({ ...args, canCopyProperties: false }))).not.toContain("copyProperties");
    });

    it("won't let the copy take the original's name, or go in a pre-packed atlas", () => {
        const clone = CloneDialog(args);
        expect(valid(clone)).toBeNull();
        expect(valid(clone, { name: "crate" })).toMatch(/already taken/);
        expect(valid(clone, { bundle: "level1", sheet: "atlas" })).toMatch(/pre-packed/);
        expect(ReadSaveAs({ ...clone.values, copyProperties: false }).copyProperties).toBe(false);
    });
});

describe("anchors", () => {
    it("map the nine choices to the corner or middle they name", () => {
        expect(AnchorFromValue("tl")).toEqual({ x: 0, y: 0 });
        expect(AnchorFromValue("t")).toEqual({ x: 0.5, y: 0 });
        expect(AnchorFromValue("tr")).toEqual({ x: 1, y: 0 });
        expect(AnchorFromValue("l")).toEqual({ x: 0, y: 0.5 });
        expect(AnchorFromValue("c")).toEqual({ x: 0.5, y: 0.5 });
        expect(AnchorFromValue("r")).toEqual({ x: 1, y: 0.5 });
        expect(AnchorFromValue("bl")).toEqual({ x: 0, y: 1 });
        expect(AnchorFromValue("b")).toEqual({ x: 0.5, y: 1 });
        expect(AnchorFromValue("br")).toEqual({ x: 1, y: 1 });
    });

    it("fall back to the middle", () => {
        expect(AnchorFromValue(undefined)).toEqual({ x: 0.5, y: 0.5 });
        expect(AnchorFromValue("")).toEqual({ x: 0.5, y: 0.5 });
    });

    it("are all there in the dialog, each once", () => {
        const values = AnchorChoices.map(a => a.value);
        expect(new Set(values).size).toBe(9);
        const choice = field(ResizeDialog(16, 16), "anchor");
        expect(choice.type === "choice" && choice.options.map(o => o.value)).toEqual(values);
    });
});

describe("ResizeDialog and ShiftDialog", () => {
    it("start from the current size, centred", () => {
        expect(ResizeDialog(20, 30).values).toEqual({ width: 20, height: 30, anchor: "c" });
    });

    it("shift allows the whole canvas either way", () => {
        const dx = field(ShiftDialog(), "dx");
        expect(dx.type === "number" && [dx.min, dx.max]).toEqual([-512, 512]);
        expect(ShiftDialog().values).toEqual({ dx: 0, dy: 0, wrap: true });
    });
});

describe("ExtractDialog", () => {
    it("from the sprite asks only for colours and order", () => {
        const dialog = ExtractDialog("sprite", "");
        expect(fieldKeys(dialog)).toEqual(["colours", "sort"]);
        expect(valid(dialog)).toBeNull();
    });

    it("from an image also asks what to do with it, and a name only to keep it", () => {
        const dialog = ExtractDialog("image", "photo.png - 40 colours");
        expect(fieldKeys(dialog)).toEqual(["colours", "sort", "apply", "name"]);
        expect(dialog.subtitle).toBe("photo.png - 40 colours");
        const name = field(dialog, "name");
        expect(IsFieldVisible(name, { ...dialog.values, apply: "match" })).toBe(false);
        expect(IsFieldVisible(name, { ...dialog.values, apply: "library" })).toBe(true);
        expect(valid(dialog)).toBeNull();
        expect(valid(dialog, { apply: "library", name: "" })).toMatch(/Give the palette a name/);
        expect(valid(dialog, { apply: "library", name: "Sunset" })).toBeNull();
    });
});

describe("ApplyPaletteDialog", () => {
    const args = { title: "Load", subtitle: "x", hasTransparent: false, canSave: true, suggestedName: "Imported", existing: ["A"] };

    it("keeps a transparent entry by default only when the palette hasn't one", () => {
        expect(ApplyPaletteDialog(args).values.transparent).toBe(true);
        expect(ApplyPaletteDialog({ ...args, hasTransparent: true }).values.transparent).toBe(false);
    });

    it("offers keeping the palette, with a name that must be good only if it's being kept", () => {
        const dialog = ApplyPaletteDialog(args);
        expect(fieldKeys(dialog)).toEqual(["apply", "transparent", "save", "name"]);
        expect(valid(dialog, { name: "" })).toBeNull();
        expect(valid(dialog, { save: true, name: "" })).toMatch(/name/);
        expect(valid(dialog, { save: true, name: "Fine" })).toBeNull();
        expect(IsFieldVisible(field(dialog, "name"), { save: false })).toBe(false);
    });

    it("leaves keeping out when the palette is already one of the saved ones", () => {
        expect(fieldKeys(ApplyPaletteDialog({ ...args, canSave: false }))).toEqual(["apply", "transparent"]);
    });
});

describe("palette library dialogs", () => {
    it("save checks the name but lets a used one through (it replaces)", () => {
        const dialog = SavePaletteDialog("Palette 2", ["Palette"]);
        expect(valid(dialog, { name: "  " })).toMatch(/name/);
        expect(valid(dialog, { name: "palette" })).toBeNull();
        expect(valid(dialog, { name: "x".repeat(41) })).toMatch(/up to 40/);
    });

    it("load needs one of the offered palettes", () => {
        const dialog = LoadPaletteDialog(["PICO-8", "Mine"]);
        expect(dialog.values.palette).toBe("PICO-8");
        expect(valid(dialog)).toBeNull();
        expect(valid(dialog, { palette: "nope" })).toMatch(/Pick a palette/);
    });

    it("manage renames or deletes, a new name only for a rename", () => {
        const dialog = ManagePalettesDialog(["A", "B"]);
        expect(IsFieldVisible(field(dialog, "to"), { action: "rename" })).toBe(true);
        expect(IsFieldVisible(field(dialog, "to"), { action: "delete" })).toBe(false);
        expect(valid(dialog, { action: "rename", to: "" })).toMatch(/name/);
        expect(valid(dialog, { action: "delete", to: "" })).toBeNull();
        expect(valid(dialog, { palette: "C" })).toMatch(/Pick a palette/);
    });

    it("export needs a name and offers the three formats", () => {
        const dialog = ExportPaletteDialog("Sprite");
        expect(valid(dialog, { name: "" })).toMatch(/name/);
        expect(valid(dialog)).toBeNull();
        const format = field(dialog, "format");
        expect(format.type === "choice" && format.options.map(o => o.value)).toEqual(["json", "pal", "gpl"]);
    });
});
