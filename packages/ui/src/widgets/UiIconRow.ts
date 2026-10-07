import { Container, Sprite, Texture } from "pixi.js";
import UiTheme from "../UiTheme";
import { IconStates } from "./IconStates";

export type UiIconRowOptions = {
    /** The game's own pictures for the icons, in place of the skin's (a game with its own hearts). A row without a `half` has none. */
    textures?: { full: Texture; half?: Texture; empty: Texture };
    /** Whole-number enlargement of the pictures; 1 by default. */
    scale?: number;
    /** Room between icons, in UI pixels; the skin's by default. */
    gap?: number;
};

/**
 * A row of icons standing for an amount: three hearts showing 5 of 6 is two full and a half. `SetValue(value, max)` says how much; the icons are full from the left, with a half
 * where there is a half icon. The pictures are the skin's, or the game's own (`textures`).
 */
export default class UiIconRow extends Container {
    private readonly icons: Sprite[] = [];
    private readonly textures: { full: Texture; half?: Texture; empty: Texture };

    constructor(theme: UiTheme, variant: string, readonly Count: number, options: UiIconRowOptions = {}) {
        super();
        const skin = theme.skin.iconRows && theme.skin.iconRows[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no icon row "${variant}".`);
        }
        this.textures = options.textures || { full: theme.Texture(skin.full), half: skin.half ? theme.Texture(skin.half) : undefined, empty: theme.Texture(skin.empty) };
        const scale = options.scale || 1;
        const gap = options.gap === undefined ? skin.gap : options.gap;
        const width = this.textures.full.width * scale;
        for (let i = 0; i < Count; i++) {
            const icon = new Sprite(this.textures.empty);
            icon.scale.set(scale);
            icon.position.set(i * (width + gap), 0);
            this.icons.push(icon);
            this.addChild(icon);
        }
        this.RowWidth = Count ? Count * width + (Count - 1) * gap : 0;
        this.RowHeight = this.textures.full.height * scale;
        this.SetValue(0, Count);
    }

    readonly RowWidth: number;
    readonly RowHeight: number;

    /** Shows `value` of `max`: the first icons full, then perhaps a half, the rest empty. */
    SetValue(value: number, max: number): void {
        IconStates(value, max, this.Count, !!this.textures.half).forEach((state, i) => {
            this.icons[i].texture = state === "full" ? this.textures.full : state === "half" ? (this.textures.half as Texture) : this.textures.empty;
        });
    }

    /** Destroys what is inside too, so the controls in it let go of their focus registrations. */
    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
