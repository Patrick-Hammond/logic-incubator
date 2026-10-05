import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { ConvertFnt, Whiten } from "./convert-bmfont.mjs";

const require = createRequire(import.meta.url);
// The asset pipeline's own reader, so what is written is what the build will see.
const { ParseFnt } = require("../../lib/scripts/assets/fnt.js");

const text = [
    'info face="wonky-small" size=20 bold=0 italic=0 charset="32-59,61" unicode=1 stretchH=100 smooth=1 aa=1 padding=1,1,1,1 spacing=1,1 outline=0',
    "common lineHeight=20 base=17 scaleW=150 scaleH=150 pages=1 packed=0 alphaChnl=0 redChnl=4 greenChnl=4 blueChnl=4",
    'page id=0 file="wonky_small.png"',
    "chars count=2",
    "char id=32 x=0 y=0 width=0 height=0 xoffset=0 yoffset=0 xadvance=9 page=0 chnl=15",
    "char id=33 x=136 y=78 width=7 height=18 xoffset=-1 yoffset=1 xadvance=6 page=0 chnl=15",
    "kernings count=1",
    "kerning first=33 second=32 amount=-2",
    ""
].join("\r\n");

describe("ConvertFnt", () => {
    it("writes the XML form, which the asset pipeline reads: the face and the page", () => {
        const { xml, face, pages } = ConvertFnt(text);
        expect(face).toBe("wonky-small");
        expect(pages).toEqual(["wonky_small.png"]);
        expect(ParseFnt(xml)).toEqual({ face: "wonky-small", pages: ["wonky_small.png"] });
    });

    it("carries over the size, line height and every character's metrics", () => {
        const { xml } = ConvertFnt(text);
        expect(xml).toContain('<info face="wonky-small" size="20" />');
        expect(xml).toContain('<common lineHeight="20" base="17" scaleW="150" scaleH="150" pages="1" />');
        expect(xml).toContain('<chars count="2">');
        expect(xml).toContain('<char id="33" x="136" y="78" width="7" height="18" xoffset="-1" yoffset="1" xadvance="6" page="0" chnl="15" />');
        expect(xml).toContain('<char id="32" x="0" y="0" width="0" height="0" xoffset="0" yoffset="0" xadvance="9" page="0" chnl="15" />');
    });

    it("keeps kerning pairs", () => {
        expect(ConvertFnt(text).xml).toContain('<kerning first="33" second="32" amount="-2" />');
    });

    it("refuses what isn't a BMFont text file", () => {
        expect(() => ConvertFnt("<font></font>")).toThrow(/isn't a BMFont text file/);
        expect(() => ConvertFnt("")).toThrow(/isn't a BMFont text file/);
    });
});

describe("Whiten", () => {
    it("makes every pixel white and keeps its alpha - including the colour of fully transparent ones", () => {
        const img = { width: 2, height: 1, data: new Uint8Array([0, 0, 0, 255, 10, 20, 30, 0]) };
        expect(Array.from(Whiten(img).data)).toEqual([255, 255, 255, 255, 255, 255, 255, 0]);
        expect(Array.from(img.data)).toEqual([0, 0, 0, 255, 10, 20, 30, 0]);
    });
});
