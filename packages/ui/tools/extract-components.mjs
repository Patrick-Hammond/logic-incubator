// Rebuilds the mockups' components as native pixel art for the UI bundle (see ../../../../.claude plan / the user guide's UI chapter): crops each region in
// mockup-regions.json, floods the page background away, keeps the piece itself, shrinks it with nearest-neighbour sampling to the grain of the chosen UI
// scale (an art pixel = scale game pixels = scale / mockupToGame mockup pixels), puts every piece on one shared palette and, where the region says how to slice
// it, reduces a frame to a small nine-slice source. The PNGs it writes are a starting point to tidy by hand in the sprite editor.
//
//   node packages/ui/tools/extract-components.mjs --review            contact sheets of the raw art with a pixel grid (to choose slice insets); writes nothing else
//   node packages/ui/tools/extract-components.mjs                    writes assets/ui/sprites/ui/<name>.png
//   options: --only=a,b (write just these regions)  --out=<dir>  --sheets=<dir for the contact sheets, default tools/out>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DecodeImages } from "./lib/edge.mjs";
import { FrameEntry, ReadFrames, WriteFrames } from "./lib/frames.mjs";
import { ApplyPalette, BorderColour, BuildNineSlice, BuildPalette, ContactSheet, Crop, DownsampleNearest, KeepLargestComponent, RemoveBackground, TilePeriod, TrimToOpaque } from "./lib/image.mjs";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes("--" + name);
const option = (name, fallback) => (args.find(a => a.startsWith("--" + name + "=")) || "").slice(name.length + 3) || fallback;

const config = JSON.parse(readFileSync(join(here, "mockup-regions.json"), "utf8"));
const only = option("only", "") ? option("only", "").split(",") : null;
const outDir = option("out", join(here, "../assets/ui/sprites/ui"));
const dataDir = option("data", join(here, "../assets/ui/data"));
const sheetDir = option("sheets", join(here, "out"));
// `--only` limits what is written, not what is worked out: the palette is shared by every piece, so it is always built from all of them.
const regions = config.regions;
const factor = config.scale / config.mockupToGame;

const writePng = (file, img) => writeFileSync(file, PNG.sync.write({ width: img.width, height: img.height, data: Buffer.from(img.data) }));

const sources = { menu: "design/mockup-menu.webp", sheet: "design/mockup-sheet.webp" };
const names = Object.keys(sources);
const decoded = await DecodeImages(names.map(name => ({ bytes: readFileSync(join(here, "..", sources[name])), mime: "image/webp" })));
const mockups = Object.fromEntries(names.map((name, i) => [name, decoded[i]]));

const raw = regions.filter(region => !region.from).map(region => {
    const [x, y, w, h] = region.box;
    const crop = Crop(mockups[region.source], x - config.pad, y - config.pad, w + config.pad * 2, h + config.pad * 2);
    let keyed = RemoveBackground(crop, BorderColour(crop));
    if (!region.whole) keyed = KeepLargestComponent(keyed);
    return { region, art: DownsampleNearest(TrimToOpaque(keyed).image, factor) };
});

const palette = BuildPalette(raw.map(r => r.art), config.palette);
const pieces = raw.map(({ region, art }) => ({ region, art: ApplyPalette(art, palette) }));
// Pieces cut out of another piece (a bar's fill out of the bar), in art pixels, so they share its palette and its grain.
regions.filter(region => region.from).forEach(region => {
    const base = pieces.find(p => p.region.name === region.from);
    if (!base) throw new Error(region.name + ": there is no region called " + region.from + " to cut it from.");
    pieces.push({ region, art: Crop(base.art, ...region.artBox) });
});

mkdirSync(sheetDir, { recursive: true });
writePng(join(sheetDir, "components-raw.png"), ContactSheet(pieces.map(p => p.art), { scale: 4, cols: 3, grid: 4 }));
console.log(`${pieces.length} pieces on a ${palette.length}-colour palette (art pixel = ${factor.toFixed(2)} mockup pixels):`);
pieces.forEach((p, i) => console.log(`  ${String(i).padStart(2)} ${p.region.name.padEnd(22)} ${p.art.width}x${p.art.height}${p.region.slice ? "  slice " + p.region.slice.insets.join(",") : ""}`));
if (flag("review")) {
    console.log("wrote components-raw.png (numbered as above, grid every 4 art pixels, stronger every 20)");
} else {
    mkdirSync(outDir, { recursive: true });
    const finals = [];
    pieces.forEach(({ region, art }) => {
        if (region.internal || (only && only.indexOf(region.name) < 0)) {
            return;
        } else if (region.border) {
            // A divider: left cap, a repeating middle, the centre ornament, right cap.
            const { cap, centre, mid } = region.border;
            const period = TilePeriod(art, mid[0], mid[1]);
            finals.push({ name: region.name + "_cap_l", image: Crop(art, 0, 0, cap, art.height) });
            finals.push({ name: region.name + "_mid", image: Crop(art, mid[0], 0, period, art.height) });
            finals.push({ name: region.name + "_centre", image: Crop(art, centre[0], 0, centre[1], art.height) });
            finals.push({ name: region.name + "_cap_r", image: Crop(art, art.width - cap, 0, cap, art.height) });
            console.log(`  ${region.name}: caps ${cap}, centre ${centre[1]} wide at ${centre[0]}, middle repeats every ${period}`);
        } else if (region.slice) {
            const [left, top, right, bottom] = region.slice.insets;
            finals.push({ name: region.name, image: BuildNineSlice(art, { left, top, right, bottom }, region.slice.band || 2, region.slice.samples || {}, region.slice.centreFrom || null), insets: { left, top, right, bottom } });
        } else {
            finals.push({ name: region.name, image: art });
        }
    });
    finals.forEach(f => writePng(join(outDir, f.name + ".png"), f.image));
    // The frame index says each sprite's size and, for a nine-slice source, where its edges are.
    mkdirSync(dataDir, { recursive: true });
    const framesFile = join(dataDir, "frames.json");
    const index = ReadFrames(framesFile);
    finals.forEach(f => (index[f.name] = FrameEntry(f.image, f.insets || null)));
    WriteFrames(framesFile, index);
    writePng(join(sheetDir, "components-final.png"), ContactSheet(finals.map(f => f.image), { scale: 6, cols: 4, grid: 4 }));
    console.log(`wrote ${finals.length} PNGs to ${outDir} and components-final.png`);
}
