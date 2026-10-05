import { Container, Rectangle, Sprite, Texture, TilingSprite } from "pixi.js";
import { Insets, SliceMode } from "../skin/Skin";
import { Slice, SlicePart, SliceRects } from "../geometry/SliceRects";

export type NineSliceOptions = {
    insets: Insets;
    /** How the four edges fill their room (stretched by default). */
    edges?: SliceMode;
    centre?: SliceMode;
};

const EDGES: SlicePart[] = ["top", "bottom", "left", "right"];

/**
 * A frame drawn at any size: the corners as they are, the edges and the middle stretched or tiled to fit. Built from nine sprites on whole pixels (see
 * `SliceRects`) rather than Pixi's `NineSlicePlane`, which stretches only, sizes itself from the untrimmed size and goes uneven at fractional sizes - a pattern
 * on an ornate edge can't tile there. The frame must be untrimmed (the kit's sheet is built with `trim: false`) and unrotated, or its slices would be cut from the
 * wrong place; that is checked here, with a message saying how to fix it.
 */
export default class NineSlice extends Container {
    private readonly parts = new Map<SlicePart, Sprite | TilingSprite>();
    private readonly textures: Texture[] = [];
    private readonly frameSize: { width: number; height: number };
    private widthValue = 0;
    private heightValue = 0;

    constructor(texture: Texture, private readonly options: NineSliceOptions, width: number, height: number) {
        super();
        if (texture.trim || texture.rotate || texture.orig.width !== texture.frame.width || texture.orig.height !== texture.frame.height) {
            throw new Error("A nine-slice frame must be untrimmed and unrotated: put its sheet under `atlas.sheets` in the bundle's bundle.json with `trim: false`.");
        }
        const frame = { width: texture.frame.width, height: texture.frame.height };
        // The source rectangles don't depend on the size drawn, so every part is made once, here, and only moved and sized afterwards.
        SliceRects(frame, options.insets, { width: frame.width, height: frame.height }).forEach(slice => {
            const part = new Texture(texture.baseTexture, new Rectangle(texture.frame.x + slice.src.x, texture.frame.y + slice.src.y, slice.src.width, slice.src.height));
            this.textures.push(part);
            const tiled = (EDGES.indexOf(slice.part) >= 0 ? options.edges : slice.part === "centre" ? options.centre : undefined) === "tile";
            const sprite = tiled ? new TilingSprite(part, slice.src.width, slice.src.height) : new Sprite(part);
            this.parts.set(slice.part, sprite);
            this.addChild(sprite);
        });
        this.frameSize = frame;
        this.Resize(width, height);
    }

    get SliceWidth(): number {
        return this.widthValue;
    }

    get SliceHeight(): number {
        return this.heightValue;
    }

    /** Draws the frame at this size (raised to what the corners need). */
    Resize(width: number, height: number): void {
        const slices = SliceRects(this.frameSize, this.options.insets, { width, height });
        const placed = new Map<SlicePart, Slice>();
        slices.forEach(slice => placed.set(slice.part, slice));
        this.widthValue = Math.max(...slices.map(s => s.dst.x + s.dst.width));
        this.heightValue = Math.max(...slices.map(s => s.dst.y + s.dst.height));
        this.parts.forEach((display, part) => {
            const slice = placed.get(part);
            display.visible = !!slice;
            if (!slice) {
                return;
            }
            display.position.set(slice.dst.x, slice.dst.y);
            display.width = slice.dst.width;
            display.height = slice.dst.height;
        });
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
        // The pieces are windows onto the sheet's texture, which isn't ours to destroy.
        this.textures.forEach(texture => texture.destroy(false));
        this.textures.length = 0;
    }
}
