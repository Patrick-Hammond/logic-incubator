// Turns a BMFont export into what the kit and Pixi 5.2.1 read: the XML form of the .fnt (the text form isn't understood by Pixi 5's loader or the asset pipeline) and
// a page whose glyphs are white, so a font is coloured by tinting (a page of black glyphs would stay black whatever the tint). The glyph shapes (the alpha
// channel), every metric and every character are carried over untouched.
//
//   node packages/ui/tools/convert-bmfont.mjs <font.fnt> [out-dir]     (default out-dir: packages/ui/assets/ui/fonts; the page PNG is found beside the .fnt)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** `key=value` pairs of one line of a text .fnt as an object (values in quotes may hold spaces). */
function Attributes(line) {
    const attributes = {};
    const pair = /(\w+)=("[^"]*"|\S+)/g;
    let match;
    while ((match = pair.exec(line))) {
        attributes[match[1]] = match[2].replace(/^"|"$/g, "");
    }
    return attributes;
}

const Escape = value => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const Tag = (name, attributes, keys) => `<${name} ` + keys.filter(k => attributes[k] !== undefined).map(k => `${k}="${Escape(attributes[k])}"`).join(" ") + " />";

/** The XML .fnt for a text-format one: info (face, size), common, pages, chars and kernings. Throws if it isn't a BMFont text file. */
export function ConvertFnt(text) {
    const info = {}, common = {}, pages = [], chars = [], kernings = [];
    text.split(/\r?\n/).forEach(line => {
        const kind = /^\s*(\w+)/.exec(line);
        if (!kind) return;
        const attributes = Attributes(line);
        if (kind[1] === "info") Object.assign(info, attributes);
        else if (kind[1] === "common") Object.assign(common, attributes);
        else if (kind[1] === "page") pages.push(attributes);
        else if (kind[1] === "char") chars.push(attributes);
        else if (kind[1] === "kerning") kernings.push(attributes);
    });
    if (!info.face || !common.lineHeight || !pages.length || !chars.length) {
        throw new Error("That isn't a BMFont text file: it needs an info line with a face, a common line, a page and chars.");
    }
    const lines = [
        "<font>",
        "\t" + Tag("info", info, ["face", "size"]),
        "\t" + Tag("common", common, ["lineHeight", "base", "scaleW", "scaleH", "pages"]),
        "\t<pages>",
        ...pages.map(page => "\t\t" + Tag("page", page, ["id", "file"])),
        "\t</pages>",
        `\t<chars count="${chars.length}">`,
        ...chars.map(c => "\t\t" + Tag("char", c, ["id", "x", "y", "width", "height", "xoffset", "yoffset", "xadvance", "page", "chnl"])),
        "\t</chars>"
    ];
    if (kernings.length) {
        lines.push(`\t<kernings count="${kernings.length}">`, ...kernings.map(k => "\t\t" + Tag("kerning", k, ["first", "second", "amount"])), "\t</kernings>");
    }
    lines.push("</font>", "");
    return { xml: lines.join("\n"), face: info.face, pages: pages.map(p => p.file) };
}

/** A copy of an RGBA image with every pixel's colour set to white, alpha as it was. */
export function Whiten(img) {
    const data = new Uint8Array(img.data);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = 255;
    }
    return { width: img.width, height: img.height, data };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const require = createRequire(import.meta.url);
    const { PNG } = require("pngjs");
    const here = dirname(fileURLToPath(import.meta.url));
    const [fntPath, outArg] = process.argv.slice(2);
    if (!fntPath) {
        console.error("usage: node convert-bmfont.mjs <font.fnt> [out-dir]");
        process.exit(1);
    }
    const out = outArg || join(here, "../assets/ui/fonts");
    mkdirSync(out, { recursive: true });
    const { xml, face, pages } = ConvertFnt(readFileSync(fntPath, "utf8"));
    writeFileSync(join(out, basename(fntPath)), xml);
    pages.forEach(page => {
        const png = PNG.sync.read(readFileSync(join(dirname(fntPath), page)));
        const white = Whiten(png);
        writeFileSync(join(out, page), PNG.sync.write({ width: white.width, height: white.height, data: Buffer.from(white.data) }));
    });
    console.log(`${basename(fntPath)}: face "${face}", ${pages.length} page(s) -> ${out}`);
}
