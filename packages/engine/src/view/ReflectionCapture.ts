import { Container, Rectangle, Renderer, RenderTexture } from "pixi.js";

/**
 * What the reflective floor overlays mirror (see `Overlays.Reflects`): its children - the heroes, monsters and walls standing over
 * them, drawn upside down below where they stand (see `TileMapView`, `EntityRenderer`) - drawn not to the screen but into
 * `texture`, the screen's size, which each `OverlayLayer` samples wherever it's water or a shiny floor. Put it in the scene before
 * the overlays, so the texture is drawn each frame before they read it, and laid out as what it mirrors is (it adds no transform
 * of its own). It's drawn only while `active` - while a reflective overlay is on screen - so a level without one costs nothing.
 */
export default class ReflectionCapture extends Container {
    /** Whether to draw the reflections this frame - set by whoever draws the overlays, each frame. An overlay doesn't read the texture while it's off. */
    active = false;
    private target: RenderTexture | null = null;
    private readonly sourceFrame = new Rectangle();
    private readonly destinationFrame = new Rectangle();

    constructor() {
        super();
        this.interactive = this.interactiveChildren = false;
    }

    /** What the reflections were drawn into - null until they first are. It covers the screen, as the stage is laid out on it. */
    get Texture(): RenderTexture | null {
        return this.target;
    }

    render(renderer: Renderer): void {
        if (!this.visible || !this.renderable || !this.active) {
            return;
        }
        const screen = renderer.screen;
        if (!this.target) {
            this.target = RenderTexture.create({ width: screen.width, height: screen.height, resolution: renderer.resolution });
        } else if (this.target.width !== screen.width || this.target.height !== screen.height) {
            this.target.resize(screen.width, screen.height, true);
        }

        // Whatever's being drawn to now - the screen - is put back after, as a filter or `cacheAsBitmap` does.
        renderer.batch.flush();
        const textures = renderer.renderTexture;
        const previous = textures.current;
        const resolution = previous ? previous.baseTexture.resolution : renderer.resolution;
        this.sourceFrame.copyFrom(textures.sourceFrame);
        this.destinationFrame.copyFrom(textures.destinationFrame);
        // `destinationFrame` is kept in the stage's units, but taken in the target's pixels.
        this.destinationFrame.x *= resolution;
        this.destinationFrame.y *= resolution;
        this.destinationFrame.width *= resolution;
        this.destinationFrame.height *= resolution;
        const projection = renderer.projection.transform;

        textures.bind(this.target);
        textures.clear([0, 0, 0, 0]);
        for (let i = 0, n = this.children.length; i < n; i++) {
            this.children[i].render(renderer);
        }
        renderer.batch.flush();

        renderer.projection.transform = projection;
        textures.bind(previous, this.sourceFrame, previous ? this.destinationFrame : undefined);
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        if (this.target) {
            this.target.destroy(true);
            this.target = null;
        }
        super.destroy(options);
    }
}
