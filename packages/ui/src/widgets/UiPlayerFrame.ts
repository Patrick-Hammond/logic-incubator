import { Container, Graphics, Sprite, Texture, TilingSprite } from "pixi.js";
import { FrameBarSkin, PlayerFrameSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { FillWidth } from "./BarMath";
import UiStatusRow from "./UiStatusRow";

/**
 * A character's corner of the HUD: their portrait in a frame, their health and energy in the troughs beside it, and a row of status icons below. The frame is one picture (the skin's
 * `playerFrames`) that says where everything goes; the portrait is the game's own picture, centred in its box (scaled down a whole step if it is too big, never stretched) and drawn
 * behind the frame. Health and energy are fractions, 0 to 1; a fill with a pattern is repeated, not stretched.
 */
export default class UiPlayerFrame extends Container {
    private readonly skin: PlayerFrameSkin;
    private readonly portrait = new Sprite();
    private readonly portraitMask = new Graphics();
    private readonly health: TilingSprite;
    private readonly energy: TilingSprite | null;
    private readonly statuses: UiStatusRow;
    private readonly frame: Sprite;
    private healthValue = 1;
    private energyValue = 1;

    constructor(theme: UiTheme, variant: string) {
        super();
        const skin = theme.skin.playerFrames && theme.skin.playerFrames[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no player frame "${variant}".`);
        }
        this.skin = skin;
        const box = skin.portrait;
        this.portraitMask.beginFill(0xffffff).drawRect(box.x, box.y, box.width, box.height).endFill();
        this.portrait.mask = this.portraitMask;
        this.frame = new Sprite(theme.Texture(skin.frame));
        const fill = (bar: FrameBarSkin) => {
            const texture = theme.Texture(bar.fill);
            const sprite = new TilingSprite(texture, bar.width || texture.width, texture.height);
            sprite.position.set(bar.x, bar.y);
            return sprite;
        };
        this.health = fill(skin.health);
        this.energy = skin.energy ? fill(skin.energy) : null;
        this.statuses = new UiStatusRow(theme, [], skin.statuses.gap);
        this.statuses.position.set(skin.statuses.x, skin.statuses.y);
        this.addChild(this.portrait, this.portraitMask, this.frame, this.health);
        if (this.energy) this.addChild(this.energy);
        this.addChild(this.statuses);
        this.Health = 1;
        this.Energy = 1;
    }

    /** The frame's size. */
    get FrameWidth(): number {
        return this.frame.width;
    }

    get FrameHeight(): number {
        return this.frame.height;
    }

    /** Shows this picture in the portrait box, or nothing (null). */
    SetPortrait(texture: Texture | null): void {
        this.portrait.visible = !!texture;
        if (!texture) return;
        const box = this.skin.portrait;
        this.portrait.texture = texture;
        const longest = Math.max(texture.width / box.width, texture.height / box.height);
        this.portrait.scale.set(longest > 1 ? 1 / Math.ceil(longest) : 1);
        this.portrait.position.set(box.x + Math.floor((box.width - this.portrait.width) / 2), box.y + Math.floor((box.height - this.portrait.height) / 2));
    }

    get Health(): number {
        return this.healthValue;
    }

    set Health(fraction: number) {
        this.healthValue = Math.max(0, Math.min(1, fraction || 0));
        this.health.width = FillWidth(this.healthValue, this.skin.health.width || this.health.texture.width);
        this.health.visible = this.health.width > 0;
    }

    get Energy(): number {
        return this.energyValue;
    }

    /** Kept but not shown by a frame without an energy trough. */
    set Energy(fraction: number) {
        this.energyValue = Math.max(0, Math.min(1, fraction || 0));
        if (!this.energy || !this.skin.energy) return;
        this.energy.width = FillWidth(this.energyValue, this.skin.energy.width || this.energy.texture.width);
        this.energy.visible = this.energy.width > 0;
    }

    /** The status icons shown (frames of the skin's bundle: `status_fire`). */
    SetStatuses(statuses: ReadonlyArray<string>): void {
        this.statuses.SetStatuses(statuses);
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
