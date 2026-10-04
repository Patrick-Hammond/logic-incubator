/**
 * Getting a sprite's pixels back from the page's own packed atlas, for an editor that can't reach the dev server's source PNGs
 * (opened from another machine, or from a build that was never served by one). The asset build keeps the atlas exact - straight RGBA,
 * never rotated - and each frame's texture knows where it sits in the atlas and how much transparent border was trimmed off, so a
 * frame can be put back at its full size pixel for pixel. What an atlas can't give back is the original file's palette: the editor
 * extracts a new one. Pure - the textures are described by the few fields used (see `AtlasTextureLike`), so it runs under node.
 */

export type RectLike = { x: number; y: number; width: number; height: number };

/** The part of a pixi `Texture` this needs. */
export type AtlasTextureLike = {
    /** Where the frame is in the atlas image. */
    frame: RectLike;
    /** Where the trimmed frame sits in the full-size one, or null if nothing was trimmed. */
    trim: RectLike | null;
    /** The full size. */
    orig: { width: number; height: number };
    /** Pixi's rotation code for the frame: 0 is unrotated. */
    rotate: number;
    baseTexture: { resource?: { url?: string } | null };
};

export type RgbaFrame = { width: number; height: number; rgba: Uint8Array };

/** The url of the atlas image a frame came from, if the texture says. */
export function AtlasUrl(texture: AtlasTextureLike): string | null {
    const resource = texture.baseTexture && texture.baseTexture.resource;
    return resource && typeof resource.url === "string" && resource.url ? resource.url : null;
}

/**
 * The sheet an atlas image belongs to: the build names them `<sheet>_<page>.png`, so "https://host/assets/global/atlases/dungeon_0.png?v=ab12"
 * is "dungeon". Null for a name that doesn't follow that.
 */
export function SheetOfAtlasUrl(url: string): string | null {
    const match = /([^/?#]+?)_\d+\.png(?:[?#].*)?$/i.exec(url);
    return match ? match[1] : null;
}

/** One frame at its full size, cut out of the decoded atlas and put back where the trim took it from. */
export function ComposeAtlasFrame(atlas: RgbaFrame, texture: AtlasTextureLike): RgbaFrame {
    if (texture.rotate) {
        throw new Error("This sprite's atlas stores it rotated, which the editor can't read back.");
    }
    const { frame, trim, orig } = texture;
    if (frame.x < 0 || frame.y < 0 || frame.x + frame.width > atlas.width || frame.y + frame.height > atlas.height) {
        throw new Error("A frame lies outside its atlas image - is the page's atlas out of date?");
    }
    const width = Math.round(orig.width);
    const height = Math.round(orig.height);
    const dx = trim ? Math.round(trim.x) : 0;
    const dy = trim ? Math.round(trim.y) : 0;
    if (width < 1 || height < 1 || dx < 0 || dy < 0 || dx + frame.width > width || dy + frame.height > height) {
        throw new Error("A frame's size and trim don't fit together.");
    }
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < frame.height; y++) {
        const from = ((frame.y + y) * atlas.width + frame.x) * 4;
        rgba.set(atlas.rgba.subarray(from, from + frame.width * 4), ((dy + y) * width + dx) * 4);
    }
    return { width, height, rgba };
}
