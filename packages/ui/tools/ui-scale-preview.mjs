// How would the mockups look as pixel art at 2x, 3x and 4x? Takes the menu/HUD/panel pieces of the first mockup, rebuilds each at the grain that scale
// would have (an art pixel is `scale` game pixels, i.e. 1.2 * scale mockup pixels, as the mockup is 1536 wide and the game 1280), quantises it to a small palette
// as indexed art would be, shows it at whole-number scale over the game's real title screen at the game's 1280x720, and writes one picture per scale
// plus a side-by-side crop. A decision aid for the UI scale - the same layout each time, only the grain changes.
//
//   node packages/ui/tools/ui-scale-preview.mjs [out-dir] [--filter=nearest|mode|area] [--scales=2,3,4]
//
// The filter is how a mockup block becomes one art pixel: `nearest` (the pixel at the block's middle - crisp and clean on these mockups, the default),
// `mode` (the colour most of the block is - speckles edges where a block straddles two colours) or `area` (an average, which softens edges: what a
// bicubic/bilinear resize looks like).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DecodeImages } from "./lib/edge.mjs";
import { BorderColour, BoxDownsample, Composite, CreateImage, Crop, Dim, DownsampleMode, DownsampleNearest, Quantise, RemoveBackground, UpscaleNearest } from "./lib/image.mjs";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => (args.find(a => a.startsWith("--" + name + "=")) || "").slice(name.length + 3) || fallback;
const out = args.find(a => !a.startsWith("--")) || join(here, "out");
const FILTERS = { mode: DownsampleMode, nearest: DownsampleNearest, area: BoxDownsample };
const filterName = option("filter", "nearest");
const Downsample = FILTERS[filterName];
if (!Downsample) {
    throw new Error("--filter must be one of " + Object.keys(FILTERS).join(", "));
}
const GAME = join(here, "../../../../in-dungeons-we-dwell");
const MOCK_TO_GAME = 1280 / 1536;
const SCALES = option("scales", "2,3,4").split(",").map(Number);
const COLOURS = 40;

// Boxes in the first mockup (1536x1024), and where each goes on the 1280x720 screen (game pixels).
const PIECES = [
    { name: "banner", box: [31, 27, 370, 135], at: [486, 28] },
    { name: "new game", box: [58, 170, 316, 64], at: [508, 190] },
    { name: "continue", box: [58, 244, 316, 63], at: [508, 252] },
    { name: "options", box: [58, 316, 316, 64], at: [508, 313] },
    { name: "exit", box: [57, 389, 318, 65], at: [507, 376] },
    { name: "hud bars", box: [36, 832, 368, 142], at: [24, 24] },
    { name: "window", box: [659, 44, 349, 309], at: [940, 24] },
    { name: "inventory", box: [1026, 44, 241, 312], at: [1008, 300] },
    { name: "tooltip", box: [1284, 62, 228, 291], at: [24, 330] },
    { name: "dialogue", box: [689, 397, 317, 110], at: [508, 560] },
    { name: "gear", box: [414, 357, 70, 71], at: [24, 640] },
    { name: "speaker", box: [504, 357, 70, 71], at: [86, 640] }
];

const readPng = file => {
    const png = PNG.sync.read(readFileSync(file));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
};
const writePng = (file, img) => writeFileSync(file, PNG.sync.write({ width: img.width, height: img.height, data: Buffer.from(img.data) }));

mkdirSync(out, { recursive: true });
const [mockup] = await DecodeImages([{ bytes: readFileSync(join(here, "../design/mockup-menu.webp")), mime: "image/webp" }]);
const title = readPng(join(GAME, "assets/global/images/title.png"));
const backdrop = Crop(BoxDownsample(title, title.width / 1280), 0, 0, 1280, 720);
Dim(backdrop, 0.45);

const screens = SCALES.map(scale => {
    const screen = { width: 1280, height: 720, data: new Uint8Array(backdrop.data) };
    for (const piece of PIECES) {
        const crop = Crop(mockup, ...piece.box);
        const keyed = RemoveBackground(crop, BorderColour(crop));
        // An art pixel is `scale` game pixels = scale / MOCK_TO_GAME mockup pixels.
        const art = Quantise(Downsample(keyed, scale / MOCK_TO_GAME), COLOURS);
        Composite(screen, UpscaleNearest(art.image, scale), ...piece.at);
    }
    const file = `ui-${filterName}-${scale}x.png`;
    writePng(join(out, file), screen);
    console.log(`${scale}x (${filterName}): ${1280 / scale}x${720 / scale} art grid, wrote ${file}`);
    return screen;
});

// The menu area of each, side by side (2x, 3x, 4x from the left), at actual size.
const box = [470, 170, 340, 280];
const compare = CreateImage(box[2] * SCALES.length + (SCALES.length - 1) * 8, box[3], [255, 255, 255, 255]);
screens.forEach((screen, i) => Composite(compare, Crop(screen, ...box), i * (box[2] + 8), 0));
writePng(join(out, `ui-${filterName}-compare.png`), compare);
console.log(`wrote ui-${filterName}-compare.png (${SCALES.map(s => s + "x").join(" | ")})`);
