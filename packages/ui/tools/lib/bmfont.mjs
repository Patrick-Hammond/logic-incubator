// Just enough of a BMFont renderer to label images in the art tools: reads the XML .fnt the kit's fonts are in and draws text from the page PNG into an RGBA image, in a colour.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export function LoadFont(fntPath) {
    const { PNG } = require("pngjs");
    const xml = readFileSync(fntPath, "utf8");
    const lineHeight = +/<common\b[^>]*\blineHeight="(\d+)"/.exec(xml)[1];
    const pageFile = /<page\b[^>]*\bfile="([^"]+)"/.exec(xml)[1];
    const page = PNG.sync.read(readFileSync(join(dirname(fntPath), pageFile)));
    const chars = new Map();
    for (const m of xml.matchAll(/<char\b([^>]*)\/>/g)) {
        const get = key => +new RegExp(`\\b${key}="(-?\\d+)"`).exec(m[1])[1];
        chars.set(get("id"), { x: get("x"), y: get("y"), width: get("width"), height: get("height"), xoffset: get("xoffset"), yoffset: get("yoffset"), xadvance: get("xadvance") });
    }
    return { lineHeight, page: { width: page.width, height: page.height, data: page.data }, chars };
}

/** How wide `text` is in the font, in pixels. */
export function MeasureText(font, text) {
    let width = 0;
    for (const ch of text) {
        const c = font.chars.get(ch.charCodeAt(0)) || font.chars.get(63);
        width += c ? c.xadvance : 0;
    }
    return width;
}

/** Draws `text` into `img` with its top-left at (x, y) in `colour` ([r, g, b]), blending by the glyphs' alpha; characters the font lacks are drawn as "?". Returns the width used. */
export function DrawText(img, font, text, x, y, colour) {
    let pen = x;
    for (const ch of text) {
        const c = font.chars.get(ch.charCodeAt(0)) || font.chars.get(63);
        if (!c) continue;
        for (let gy = 0; gy < c.height; gy++) {
            for (let gx = 0; gx < c.width; gx++) {
                const px = pen + c.xoffset + gx, py = y + c.yoffset + gy;
                if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
                const s = ((c.y + gy) * font.page.width + c.x + gx) * 4, d = (py * img.width + px) * 4;
                const a = font.page.data[s + 3] / 255;
                if (a <= 0) continue;
                const da = img.data[d + 3] / 255;
                const oa = a + da * (1 - a);
                for (let k = 0; k < 3; k++) img.data[d + k] = Math.round((colour[k] * a + img.data[d + k] * da * (1 - a)) / oa);
                img.data[d + 3] = Math.round(oa * 255);
            }
        }
        pen += c.xadvance;
    }
    return pen - x;
}
