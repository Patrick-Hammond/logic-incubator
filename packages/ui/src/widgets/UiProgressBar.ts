import { Container, Sprite } from "pixi.js";
import { BarSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { FillWidth } from "./BarMath";
import NineSlice from "./NineSlice";

/** A bar (health, mana, experience...): a track with a fill that grows inside it. `Value` is the fraction filled, 0 to 1. */
export default class UiProgressBar extends Container {
    private readonly skin: BarSkin;
    private readonly track: NineSlice;
    private readonly fill: Sprite;
    private value = 0;
    private readonly size: { width: number; height: number };

    constructor(theme: UiTheme, kind: string, width: number, value = 0) {
        super();
        const skin = theme.skin.bars[kind];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no bar "${kind}".`);
        }
        this.skin = skin;
        this.size = { width, height: skin.height };
        this.track = new NineSlice(theme.Texture(skin.track.frame), skin.track, width, skin.height);
        this.fill = new Sprite(theme.Texture(skin.fill));
        this.fill.position.set(skin.fillPadding.left, skin.fillPadding.top);
        this.fill.height = skin.height - skin.fillPadding.top - skin.fillPadding.bottom;
        this.addChild(this.track, this.fill);
        this.Value = value;
    }

    get BarWidth(): number {
        return this.size.width;
    }

    get BarHeight(): number {
        return this.size.height;
    }

    get Value(): number {
        return this.value;
    }

    set Value(value: number) {
        this.value = Math.max(0, Math.min(1, value || 0));
        const room = this.size.width - this.skin.fillPadding.left - this.skin.fillPadding.right;
        const width = FillWidth(this.value, room);
        this.fill.visible = width > 0;
        this.fill.width = width;
    }
}
