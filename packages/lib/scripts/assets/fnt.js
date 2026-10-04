"use strict";

/**
 * Just enough of the XML bitmap-font format (`.fnt`) for the pipeline: the font's `face` - the name
 * `BitmapText` looks it up by, which is process-wide in pixi 5 - and the page images it points at.
 * Pixi 5.2.1's loader reads the XML form only, and resolves each page relative to the `.fnt`.
 */

/** @returns {{ face: string | undefined, pages: string[] }} */
function ParseFnt(text) {
    const info = /<info\b[^>]*\bface="([^"]*)"/.exec(text);
    const pages = [];
    const pageTag = /<page\b[^>]*\bfile="([^"]*)"/g;
    let match;
    while ((match = pageTag.exec(text))) {
        pages.push(match[1]);
    }
    return { face: info ? info[1] : undefined, pages };
}

/** `text` with each `<page file="...">` renamed through `renames` (old file -> new file); files not in it are left alone. */
function RewritePages(text, renames) {
    return text.replace(/(<page\b[^>]*\bfile=")([^"]*)(")/g, (all, before, file, after) =>
        Object.prototype.hasOwnProperty.call(renames, file) ? before + renames[file] + after : all
    );
}

module.exports = { ParseFnt, RewritePages };
