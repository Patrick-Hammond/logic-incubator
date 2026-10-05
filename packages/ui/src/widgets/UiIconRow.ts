import { Container, Sprite } from "pixi.js";
import { IconRowSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { IconStates } from "./IconStates";

/**
 * A row of icons standing for an amount: three hearts showing 5 of 6 is two full and a half. `SetValue(value, max)` says how much; the icons are full from the left, with a half
 * where the skin has a half icon.
 */
export default class UiIconRow extends Container {
    private readonly skin: IconRowSkin;
    private readonly icons: Sprite[] = [];

    constructor(private readonly theme: UiTheme, variant: string, readonly Count: number) {
        super();
        const skin = theme.skin.iconRows && theme.skin.iconRows[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no icon row "${variant}".`);
        }
        this.skin = skin;
        const width = theme.Texture(skin.full).width;
        for (let i = 0; i < Count; i++) {
            const icon = new Sprite(theme.Texture(skin.empty));
            icon.position.set(i * (width + skin.gap), 0);
            this.icons.push(icon);
            this.addChild(icon);
        }
        this.RowWidth = Count ? Count * width + (Count - 1) * skin.gap : 0;
        this.SetValue(0, Count);
    }

    readonly RowWidth: number;

    /** Shows `value` of `max`: the first icons full, then perhaps a half, the rest empty. */
    SetValue(value: number, max: number): void {
        IconStates(value, max, this.Count, !!this.skin.half).forEach((state, i) => {
            this.icons[i].texture = this.theme.Texture(state === "full" ? this.skin.full : state === "half" ? (this.skin.half as string) : this.skin.empty);
        });
    }

    /** Destroys what is inside too, so the controls in it let go of their focus registrations. */
    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
