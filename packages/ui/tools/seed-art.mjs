// Fills out the atlas with the frames the mockups don't show, so every widget has art to start from: the hover / pressed / disabled looks of each button, tab, field and
// slot (the normal one recoloured), a slider's track and thumb, a scrollbar's, a tooltip's pointer, the up and down arrows, a half heart, an amber bar. They are seeds - plain
// derivations to be redrawn in Aseprite - and are only written where there is no sprite yet (`--force` rewrites them), so redrawn art is never overwritten.
//
//   node packages/ui/tools/seed-art.mjs [--force] [--sprites=<dir>] [--data=<dir>]      (run after extract-components.mjs)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FrameEntry, ReadFrames, WriteFrames } from "./lib/frames.mjs";
import { Composite, CreateImage, DominantColour, FlipVertical, JoinColumns, Rotate90, Tint } from "./lib/image.mjs";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => (args.find(a => a.startsWith("--" + name + "=")) || "").slice(name.length + 3) || fallback;
const spritesDir = option("sprites", join(here, "../assets/ui/sprites/ui"));
const dataDir = option("data", join(here, "../assets/ui/data"));
const force = args.includes("--force");
const framesFile = join(dataDir, "frames.json");

const frames = ReadFrames(framesFile);
const fileOf = name => join(spritesDir, name + ".png");
const read = name => {
    const png = PNG.sync.read(readFileSync(fileOf(name)));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
};
const insetsOf = name => (frames[name] && frames[name].insets) || null;

const STATES = {
    hover: { brightness: 1.2 },
    pressed: { brightness: 0.78 },
    disabled: { brightness: 0.55, saturation: 0.45 }
};
const FOCUS_COLOUR = [255, 216, 102];

const written = [];
function Write(name, image, insets = null) {
    if (existsSync(fileOf(name)) && !force) {
        return;
    }
    writeFileSync(fileOf(name), PNG.sync.write({ width: image.width, height: image.height, data: Buffer.from(image.data) }));
    frames[name] = FrameEntry(image, insets);
    written.push(name);
}

/** A nine-slice source drawn at a given size, for building a frame (a slider's thumb) from another's corners and edges; whole pixels, nearest. */
function RenderNineSlice(source, insets, width, height) {
    const { left: l, top: t, right: r, bottom: b } = insets;
    const out = CreateImage(width, height);
    const xs = x => (x < l ? x : x >= width - r ? source.width - (width - x) : l + ((x - l) % Math.max(1, source.width - l - r)));
    const ys = y => (y < t ? y : y >= height - b ? source.height - (height - y) : t + ((y - t) % Math.max(1, source.height - t - b)));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const sx = Math.min(source.width - 1, xs(x)), sy = Math.min(source.height - 1, ys(y));
            out.data.set(source.data.subarray((sy * source.width + sx) * 4, (sy * source.width + sx) * 4 + 4), (y * width + x) * 4);
        }
    }
    return out;
}

/** The image on a bigger transparent canvas, top-left at (ox, oy). */
function Place(img, width, height, ox = 0, oy = 0) {
    const out = CreateImage(width, height);
    Composite(out, img, ox, oy);
    return out;
}

// ---- the states of everything that has a normal look ------------------------------------------------------------------
const WithStates = [
    ["btn_secondary", "normal"], ["btn_small", "normal"], ["btn_danger", "normal"], ["btn_confirm", "normal"], ["btn_icon", "normal"], ["tab", "inactive"], ["field", "normal"], ["slot", "empty"]
];
WithStates.forEach(([family, base]) => {
    const source = read(`${family}_${base}`);
    const insets = insetsOf(`${family}_${base}`);
    const states = family === "tab" ? { hover: STATES.hover, disabled: STATES.disabled } : family === "field" ? { focused: { brightness: 1.5 }, disabled: STATES.disabled } : family === "slot" ? { hover: STATES.hover, selected: { brightness: 1.25, mix: FOCUS_COLOUR, amount: 0.4 }, disabled: STATES.disabled } : STATES;
    Object.keys(states).forEach(state => Write(`${family}_${state}`, Tint(source, states[state]), insets));
});
Write("checkbox_off_disabled", Tint(read("checkbox_off"), STATES.disabled));
Write("radio_off_disabled", Tint(read("radio_off"), STATES.disabled));
["checkbox", "radio"].forEach(family => ["off", "on"].forEach(value => Write(`${family}_${value}_hover`, Tint(read(`${family}_${value}`), STATES.hover))));

// ---- sliders and scrollbars: the bar's track, a button's corners ------------------------------------------------------
const track = read("bar_track");
Write("slider_track", track, insetsOf("bar_track"));
Write("scroll_track", Rotate90(track), insetsOf("bar_track"));
const thumb = RenderNineSlice(read("btn_icon_normal"), insetsOf("btn_icon_normal"), 12, 16);
Write("slider_thumb_normal", thumb);
Object.keys(STATES).forEach(state => Write(`slider_thumb_${state}`, Tint(thumb, STATES[state])));
const grip = read("btn_small_normal");
Write("scroll_thumb_normal", grip, insetsOf("btn_small_normal"));
Object.keys(STATES).forEach(state => Write(`scroll_thumb_${state}`, Tint(grip, STATES[state]), insetsOf("btn_small_normal")));

// ---- a tooltip's pointer: a triangle in the tooltip's edge and fill colours -----------------------------------------------
{
    const tip = read("tooltip");
    const edge = DominantColour(tip, 8, 2, 2, 2) || [200, 200, 255], fill = DominantColour(tip, 10, 10, 8, 8) || [20, 20, 40];
    const down = CreateImage(11, 6);
    for (let row = 0; row < 6; row++) {
        const half = 5 - row;
        for (let x = 5 - half; x <= 5 + half; x++) {
            const onEdge = x === 5 - half || x === 5 + half || row === 5;
            down.data.set([...(onEdge ? edge : fill), 255], (row * 11 + x) * 4);
        }
    }
    Write("tooltip_tail_down", down);
    Write("tooltip_tail_up", FlipVertical(down));
}

// ---- glyphs and fills -------------------------------------------------------------------------------------------------------
Write("icon_arrow_up", Rotate90(read("icon_arrow_right"), false));
Write("icon_arrow_down", Rotate90(read("icon_arrow_right"), true));
{
    const full = Place(read("icon_heart_full"), 13, 13), empty = Place(read("icon_heart_empty"), 13, 13);
    Write("icon_heart_half", JoinColumns(full, empty, 7));
}
Write("portrait_frame", read("slot_empty"), insetsOf("slot_empty"));
{
    // An amber fill in the shape of the red one: a bright top row, a flat body, a dark bottom row.
    const rows = [[246, 210, 106], [232, 160, 32], [232, 160, 32], [232, 160, 32], [232, 160, 32], [232, 160, 32], [122, 74, 16]];
    const amber = CreateImage(2, 7);
    rows.forEach((colour, y) => [0, 1].forEach(x => amber.data.set([...colour, 255], (y * 2 + x) * 4)));
    Write("bar_fill_amber", amber);
}

WriteFrames(framesFile, frames);
console.log(written.length ? `seeded ${written.length} frame(s): ${written.join(", ")}` : "nothing to seed (everything already has a sprite; --force rewrites them)");
