/**
 * The sprite editor's dialogs, as descriptions for the editor's `FormDialog`: what's asked, with its limits and its check.
 * Building them here (rather than inline in the editor window) keeps the rules - what makes a name acceptable, which
 * corner an anchor is - in one place a test can reach without a DOM.
 */

import { FieldSpec, FormDialogOptions, FormValues } from "../../ui/dialog/FormDialog";
import { CheckPaletteName } from "../PaletteLibrary";
import { MaxPaletteSize } from "../Palette";
import { BundleInfo } from "../SpriteApi";
import { Anchor, MaxCanvasSize, MaxFrames } from "../SpriteDocument";
import { SuggestSpriteName, ValidateSpriteName } from "../SpriteNames";

export type Category = { id: string; name: string };

/** The longest folder name the server accepts for a sheet. */
export const MaxSheetLength = 32;

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

// ---------------------------------------------------------------------------------------------- where a sprite goes

/** What's wrong with where `values` would put a sprite (name, bundle, sheet), or null. `ignoreName` is the sprite being saved over, which isn't a clash. */
export function CheckTarget(values: FormValues, bundles: ReadonlyArray<BundleInfo>, ignoreName?: string): string | null {
    const name = text(values.name);
    const problem = ValidateSpriteName(name);
    if (problem) {
        return problem;
    }
    const bundle = bundles.find(b => b.name === values.bundle);
    if (!bundle) {
        return "Choose a bundle.";
    }
    if (name !== ignoreName && bundle.names.indexOf(name) >= 0) {
        return `"${bundle.name}.${name}" is already taken by something in that bundle.`;
    }
    const sheet = text(values.sheet);
    if (!sheet || SuggestSpriteName(sheet) !== sheet || sheet.length > MaxSheetLength) {
        return `The sheet is a folder name: lowercase letters, digits and underscores, up to ${MaxSheetLength}.`;
    }
    if (bundle.packedSheets.indexOf(sheet) >= 0) {
        return `"${sheet}" is a pre-packed atlas, so nothing can be added to it - use another sheet.`;
    }
    return null;
}

function TargetFields(bundles: ReadonlyArray<BundleInfo>, categories: ReadonlyArray<Category>): FieldSpec[] {
    return [
        { key: "name", label: "Name", type: "text", placeholder: "lowercase_name", hint: "What the sprite is called in level files and in code." },
        { key: "bundle", label: "Bundle", type: "choice", options: bundles.map(b => ({ value: b.name, label: b.name })) },
        { key: "sheet", label: "Sheet", type: "text", placeholder: "user", hint: "The folder under sprites/ the file goes in." },
        { key: "category", label: "Palette tab", type: "choice", options: categories.map(c => ({ value: c.id, label: c.name })) }
    ];
}

export type NewSpriteChoice = { name: string; bundle: string; sheet: string; category: string; width: number; height: number; frames: number };

export function NewSpriteDialog(args: { bundles: BundleInfo[]; categories: Category[]; bundle: string; category: string; tileSize: number }): FormDialogOptions {
    return {
        title: "New sprite",
        subtitle: "A blank sprite with a 256-colour palette to draw on. Nothing is written until you save.",
        fields: [
            ...TargetFields(args.bundles, args.categories),
            { key: "width", label: "Width", type: "number", min: 1, max: MaxCanvasSize, sliderMin: 1, sliderMax: 128, unit: "px" },
            { key: "height", label: "Height", type: "number", min: 1, max: MaxCanvasSize, sliderMin: 1, sliderMax: 128, unit: "px" },
            { key: "frames", label: "Frames", type: "number", min: 1, max: MaxFrames, sliderMin: 1, sliderMax: 16, hint: "More than one makes an animation (name_f0, name_f1...)." }
        ],
        values: { name: "", bundle: args.bundle, sheet: "user", category: args.category, width: args.tileSize, height: args.tileSize, frames: 1 },
        saveLabel: "Create",
        validate: values => CheckTarget(values, args.bundles)
    };
}

export function ReadNewSprite(values: FormValues): NewSpriteChoice {
    return {
        name: text(values.name),
        bundle: text(values.bundle),
        sheet: text(values.sheet),
        category: text(values.category),
        width: num(values.width, 16),
        height: num(values.height, 16),
        frames: num(values.frames, 1)
    };
}

export type SaveAsChoice = { name: string; bundle: string; sheet: string; category: string; copyProperties: boolean };

export function SaveAsDialog(args: { bundles: BundleInfo[]; categories: Category[]; name: string; bundle: string; sheet: string; category: string; canCopyProperties: boolean }): FormDialogOptions {
    const fields = TargetFields(args.bundles, args.categories);
    if (args.canCopyProperties) {
        fields.push({ key: "copyProperties", label: "Copy tile properties", type: "toggle", hint: "Collision, light, pickup and the rest of what the game knows about the original." });
    }
    return {
        title: "Save as",
        subtitle: "Saves a copy under a new name; the original stays as it is.",
        fields,
        values: { name: args.name, bundle: args.bundle, sheet: args.sheet, category: args.category, copyProperties: args.canCopyProperties },
        saveLabel: "Save",
        validate: values => CheckTarget(values, args.bundles)
    };
}

export function ReadSaveAs(values: FormValues): SaveAsChoice {
    return { name: text(values.name), bundle: text(values.bundle), sheet: text(values.sheet), category: text(values.category), copyProperties: values.copyProperties === true };
}

// ---------------------------------------------------------------------------------------------- the picture

/** The nine places the old picture can sit on a resized canvas, as the choice values the dialog uses. */
export const AnchorChoices: ReadonlyArray<{ value: string; label: string }> = [
    { value: "tl", label: "↖" }, { value: "t", label: "↑" }, { value: "tr", label: "↗" },
    { value: "l", label: "←" }, { value: "c", label: "●" }, { value: "r", label: "→" },
    { value: "bl", label: "↙" }, { value: "b", label: "↓" }, { value: "br", label: "↘" }
];

/** 0 = left/top, 0.5 = centre, 1 = right/bottom, from a choice value ("c" if it's none of them). */
export function AnchorFromValue(value: unknown): Anchor {
    const v = text(value);
    return { x: v.indexOf("l") >= 0 ? 0 : v.indexOf("r") >= 0 ? 1 : 0.5, y: v.indexOf("t") >= 0 ? 0 : v.indexOf("b") >= 0 ? 1 : 0.5 };
}

export function ResizeDialog(width: number, height: number): FormDialogOptions {
    return {
        title: "Resize canvas",
        subtitle: "Changes the size of every frame. The picture stays where you anchor it; what falls outside is cut off, and new space is transparent.",
        fields: [
            { key: "width", label: "Width", type: "number", min: 1, max: MaxCanvasSize, sliderMin: 1, sliderMax: 128, unit: "px" },
            { key: "height", label: "Height", type: "number", min: 1, max: MaxCanvasSize, sliderMin: 1, sliderMax: 128, unit: "px" },
            { key: "anchor", label: "Anchor", type: "choice", options: AnchorChoices.map(a => ({ value: a.value, label: a.label })) }
        ],
        values: { width, height, anchor: "c" },
        saveLabel: "Resize"
    };
}

export function ShiftDialog(): FormDialogOptions {
    return {
        title: "Shift picture",
        subtitle: "Slides every frame's picture.",
        fields: [
            { key: "dx", label: "Across", type: "number", min: -MaxCanvasSize, max: MaxCanvasSize, sliderMin: -32, sliderMax: 32, unit: "px (+ is right)" },
            { key: "dy", label: "Down", type: "number", min: -MaxCanvasSize, max: MaxCanvasSize, sliderMin: -32, sliderMax: 32, unit: "px (+ is down)" },
            { key: "wrap", label: "Wrap round", type: "toggle", hint: "What goes off one edge comes back on the other, instead of being cut off." }
        ],
        values: { dx: 0, dy: 0, wrap: true },
        saveLabel: "Shift"
    };
}

// ---------------------------------------------------------------------------------------------- palettes

export const SortChoices = [
    { value: "luminance", label: "Brightness" },
    { value: "hue", label: "Hue" },
    { value: "frequency", label: "Most used" },
    { value: "none", label: "As found" }
];

export function ExtractDialog(source: "sprite" | "image", detail: string): FormDialogOptions {
    const fields: FieldSpec[] = [
        { key: "colours", label: "Colours", type: "number", min: 2, max: MaxPaletteSize, sliderMin: 2, sliderMax: MaxPaletteSize, hint: "At most this many; fewer if there aren't that many colours. Over the limit, similar ones are merged." },
        { key: "sort", label: "Order", type: "choice", options: SortChoices }
    ];
    if (source === "image") {
        fields.push({
            key: "apply",
            label: "Use it to",
            type: "choice",
            options: [
                { value: "match", label: "Re-match the sprite to it" },
                { value: "load", label: "Fill the palette slots (sprite recolours)" },
                { value: "library", label: "Only save it to my palettes" }
            ]
        });
        fields.push({ key: "name", label: "Palette name", type: "text", placeholder: "My palette", visibleWhen: v => v.apply === "library" });
    }
    return {
        title: source === "sprite" ? "Extract palette from sprite" : "Extract palette from image",
        subtitle: source === "sprite" ? "Rebuilds the palette from the colours the sprite actually uses - unused entries go - and keeps the picture as it is." : detail,
        fields,
        values: { colours: MaxPaletteSize, sort: "luminance", apply: "match", name: "" },
        saveLabel: "Extract",
        validate: values => (values.apply === "library" ? CheckName(text(values.name)) : null)
    };
}

function CheckName(name: string): string | null {
    return CheckPaletteName(name).error || null;
}

/** How a palette from outside is put to use. */
export function ApplyPaletteDialog(args: { title: string; subtitle: string; hasTransparent: boolean; canSave: boolean; suggestedName: string; existing: string[] }): FormDialogOptions {
    const fields: FieldSpec[] = [
        {
            key: "apply",
            label: "Use it to",
            type: "choice",
            options: [
                { value: "load", label: "Fill the palette slots (sprite recolours)" },
                { value: "match", label: "Re-match the sprite to it" }
            ]
        },
        { key: "transparent", label: "Keep a transparent entry first", type: "toggle", hint: "Slot 0 is what the eraser paints; a palette from elsewhere usually has none." }
    ];
    if (args.canSave) {
        fields.push({ key: "save", label: "Also keep in my palettes", type: "toggle" });
        fields.push({ key: "name", label: "Palette name", type: "text", visibleWhen: v => v.save === true, hint: args.existing.length ? "Using a name you've used replaces that palette." : undefined });
    }
    return {
        title: args.title,
        subtitle: args.subtitle,
        fields,
        values: { apply: "load", transparent: !args.hasTransparent, save: false, name: args.suggestedName },
        saveLabel: "Use",
        validate: values => (args.canSave && values.save === true ? CheckName(text(values.name)) : null)
    };
}

export function SavePaletteDialog(suggestedName: string, existing: ReadonlyArray<string>): FormDialogOptions {
    return {
        title: "Save palette",
        subtitle: "Keeps the sprite's palette in this browser, ready to load into any sprite.",
        fields: [{ key: "name", label: "Name", type: "text", placeholder: "My palette", hint: existing.length ? "A name you've used before replaces that palette." : undefined }],
        values: { name: suggestedName },
        saveLabel: "Save",
        validate: values => CheckName(text(values.name))
    };
}

export function LoadPaletteDialog(names: string[]): FormDialogOptions {
    return {
        title: "Load palette",
        subtitle: "Pick one of the built-in palettes or one you've saved.",
        fields: [{ key: "palette", label: "Palette", type: "choice", options: names.map(n => ({ value: n, label: n })) }],
        values: { palette: names[0] || "" },
        saveLabel: "Next",
        validate: values => (names.indexOf(text(values.palette)) >= 0 ? null : "Pick a palette.")
    };
}

export function ManagePalettesDialog(names: string[]): FormDialogOptions {
    return {
        title: "My palettes",
        subtitle: "Rename or delete a palette you saved.",
        fields: [
            { key: "palette", label: "Palette", type: "choice", options: names.map(n => ({ value: n, label: n })) },
            {
                key: "action",
                label: "Do",
                type: "choice",
                options: [
                    { value: "rename", label: "Rename" },
                    { value: "delete", label: "Delete" }
                ]
            },
            { key: "to", label: "New name", type: "text", visibleWhen: v => v.action === "rename" }
        ],
        values: { palette: names[0] || "", action: "rename", to: names[0] || "" },
        saveLabel: "Do it",
        validate: values => {
            if (names.indexOf(text(values.palette)) < 0) {
                return "Pick a palette.";
            }
            if (values.action === "rename") {
                const checked = CheckPaletteName(text(values.to));
                return checked.error || null;
            }
            return null;
        }
    };
}

export function ExportPaletteDialog(suggestedName: string): FormDialogOptions {
    return {
        title: "Export palette",
        subtitle: "Saves the palette as a file other tools can open. Only JSON keeps transparency.",
        fields: [
            { key: "name", label: "Name", type: "text" },
            {
                key: "format",
                label: "Format",
                type: "choice",
                options: [
                    { value: "json", label: "JSON (with alpha)" },
                    { value: "pal", label: "JASC .pal" },
                    { value: "gpl", label: "GIMP .gpl" }
                ]
            }
        ],
        values: { name: suggestedName, format: "json" },
        saveLabel: "Export",
        validate: values => CheckName(text(values.name))
    };
}
