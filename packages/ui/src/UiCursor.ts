import type { Texture } from "pixi.js";
import type { CursorSkin } from "./skin/Skin";
import type UiTheme from "./UiTheme";

/** What the cursor needs of Pixi's interaction manager: its cursor styles (a style may be a function, called when its mode comes in) and the mode it is in. */
export type CursorHost = {
    cursorStyles: Record<string, unknown>;
    currentCursorMode: string | null;
};

/**
 * How many screen pixels each of a pointer's art pixels takes: the UI's scale times how much the page enlarges the canvas, to a whole number (at least 1), so the pointer's
 * pixels match the UI's. Pure.
 */
export function CursorScale(uiScale: number, shownWidth: number, canvasWidth: number): number {
    const page = canvasWidth > 0 && shownWidth > 0 ? shownWidth / canvasWidth : 1;
    return Math.max(1, Math.round(uiScale * page));
}

/** The CSS `cursor` value for a pointer image: its hot spot scaled with it, and the browser's own arrow if the image can't be used. Pure. */
export function CursorCss(url: string, skin: CursorSkin, scale: number): string {
    return `url(${url}) ${skin.x * scale} ${skin.y * scale}, auto`;
}

/**
 * The skin's mouse pointers on the game's canvas, in place of the browser's: `default` over nothing in particular, `pointer` over anything pressable (Pixi's `buttonMode`), and
 * `pressed` while the mouse button is held over it. Any other pointer the skin has (`attack`) is shown over a display object whose `cursor` is that name, or everywhere with
 * `Default`. The pictures are CSS cursors (so they never lag the mouse), enlarged to the UI's pixel size and redrawn when the page resizes the canvas. `Destroy` gives the browser's
 * pointer back.
 */
export default class UiCursor {
    private readonly cache = new Map<string, string>();
    private readonly previous: Record<string, unknown>;
    private scale = 1;
    private pressed = false;
    private fallback = "default";

    constructor(private readonly theme: UiTheme, private readonly view: HTMLCanvasElement, private readonly host: CursorHost) {
        this.previous = { ...host.cursorStyles };
        Object.keys(this.Cursors).forEach(kind => (host.cursorStyles[kind] = () => this.Show()));
        this.Resize();
        view.addEventListener("pointerdown", this.OnDown);
        window.addEventListener("pointerup", this.OnUp);
        window.addEventListener("resize", this.Resize);
        this.Show();
    }

    private get Cursors(): Record<string, CursorSkin> {
        return this.theme.skin.cursors || {};
    }

    /** The pointer shown where nothing asks for another: the skin's `default`, or one of its own (`attack` over the dungeon). */
    get Default(): string {
        return this.fallback;
    }

    set Default(kind: string) {
        this.fallback = kind;
        this.Show();
    }

    /** The pointer to show now, from what Pixi says is under the mouse and whether a button is held. */
    private Kind(): string {
        const mode = this.host.currentCursorMode || "default";
        const cursors = this.Cursors;
        if (mode === "default") return cursors[this.fallback] ? this.fallback : "default";
        if (mode === "pointer" && this.pressed && cursors.pressed) return "pressed";
        return cursors[mode] ? mode : "default";
    }

    private Show = (): void => {
        const kind = this.Kind();
        const skin = this.Cursors[kind];
        if (!skin) return;
        const key = kind + "@" + this.scale;
        let css = this.cache.get(key);
        if (!css) {
            css = CursorCss(ImageUrl(this.theme.Texture(skin.frame), this.scale), skin, this.scale);
            this.cache.set(key, css);
        }
        this.view.style.cursor = css;
    };

    private Resize = (): void => {
        const scale = CursorScale(this.theme.Scale, this.view.clientWidth, this.view.width);
        if (scale !== this.scale) {
            this.scale = scale;
            this.Show();
        }
    };

    private OnDown = (): void => {
        this.pressed = true;
        this.Show();
    };

    private OnUp = (): void => {
        if (this.pressed) {
            this.pressed = false;
            this.Show();
        }
    };

    Destroy(): void {
        this.view.removeEventListener("pointerdown", this.OnDown);
        window.removeEventListener("pointerup", this.OnUp);
        window.removeEventListener("resize", this.Resize);
        Object.keys(this.Cursors).forEach(kind => delete this.host.cursorStyles[kind]);
        Object.assign(this.host.cursorStyles, this.previous);
        this.view.style.cursor = "";
    }
}

/** A frame of a loaded texture as an image URL, each pixel `scale` times as big and unsmoothed. */
function ImageUrl(texture: Texture, scale: number): string {
    const frame = texture.frame;
    const canvas = document.createElement("canvas");
    canvas.width = frame.width * scale;
    canvas.height = frame.height * scale;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.imageSmoothingEnabled = false;
    const resource = texture.baseTexture.resource as unknown as { source: CanvasImageSource };
    context.drawImage(resource.source, frame.x, frame.y, frame.width, frame.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
}
