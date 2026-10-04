"use strict";

/**
 * The only module that touches pngjs, so everything else works on plain `{ width, height, data }`
 * images. pngjs expands palette, grayscale, 16-bit and `tRNS` colour-key images to 8-bit RGBA on
 * read, so the rest of the pipeline only ever sees RGBA.
 */

const { PNG } = require("pngjs");

/** @returns {{ width: number, height: number, data: Buffer }} */
function ReadPng(buffer) {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
}

/** @returns {Buffer} an RGBA PNG */
function WritePng(img) {
    const png = new PNG({ width: img.width, height: img.height });
    Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length).copy(png.data);
    return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
}

module.exports = { ReadPng, WritePng };
