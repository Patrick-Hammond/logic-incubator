import { Container, interaction, Rectangle, Sprite } from "pixi.js";
import { SliderAxisSkin } from "../skin/Skin";
import { Direction } from "../input/UiAction";
import UiTheme from "../UiTheme";
import { PickState } from "./ButtonLook";
import NineSlice from "./NineSlice";
import { NudgeValue, PositionOf, SliderRange, SnapValue, ValueAt } from "./SliderMath";
import UiControl from "./UiControl";

export type UiSliderOptions = {
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    /** A vertical slider has its minimum at the bottom. */
    vertical?: boolean;
};

/** A hit area big enough that a drag that wanders off the slider keeps going until the pointer is released. */
const DRAG_AREA = new Rectangle(-4000, -4000, 8000, 8000);

/**
 * A slider: a track with a thumb that is dragged (or clicked to) to set a value in a range, in steps. Emits `change` with the value whenever the player changes it. A focused slider
 * takes the arrow keys along its axis (left and right, or up and down for a vertical one) as steps, so focus moves off it with the other two. A vertical slider, minimum at the
 * bottom, is drawn with the skin's vertical art (`SliderSkin.vertical`), or is the horizontal one turned on its side when the skin has none.
 */
export default class UiSlider extends UiControl {
    private readonly art: SliderAxisSkin;
    private readonly inner = new Container();
    private readonly track: NineSlice;
    private readonly thumb: Sprite;
    private readonly range: SliderRange;
    private readonly vertical: boolean;
    /** Vertical with art of its own, laid out down the screen (rather than the horizontal one turned). */
    private readonly upright: boolean;
    private readonly length: number;
    private readonly extent: number;
    private value: number;
    private dragging = false;

    constructor(private readonly theme: UiTheme, variant: string, length: number, options: UiSliderOptions = {}) {
        super();
        const skin = theme.skin.sliders && theme.skin.sliders[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no slider "${variant}".`);
        }
        this.vertical = !!options.vertical;
        this.upright = this.vertical && !!skin.vertical;
        this.art = this.upright ? (skin.vertical as SliderAxisSkin) : skin;
        this.length = length;
        this.range = { min: options.min === undefined ? 0 : options.min, max: options.max === undefined ? 100 : options.max, step: options.step === undefined ? 1 : options.step };
        this.value = SnapValue(options.value === undefined ? this.range.min : options.value, this.range);

        const art = this.art;
        this.thumb = new Sprite(theme.Texture(art.thumb.normal));
        this.extent = Math.max(art.thickness, this.upright ? this.thumb.width : this.thumb.height);
        const across = Math.floor((this.extent - art.thickness) / 2);
        if (this.upright) {
            this.track = new NineSlice(theme.Texture(art.track.frame), art.track, art.thickness, length);
            this.track.position.set(across, 0);
        } else {
            this.track = new NineSlice(theme.Texture(art.track.frame), art.track, length, art.thickness);
            this.track.position.set(0, across);
        }
        this.inner.addChild(this.track, this.thumb);
        this.addChild(this.inner);
        if (this.vertical && !this.upright) {
            // The horizontal slider turned a quarter anticlockwise: its start (the minimum) is the bottom.
            this.inner.rotation = -Math.PI / 2;
            this.inner.position.set(0, length);
        }

        this.SetHitSize(this.SliderWidth, this.SliderHeight);
        this.on("pointerdown", (e: interaction.InteractionEvent) => this.Drag(e, true));
        this.on("pointermove", (e: interaction.InteractionEvent) => this.dragging && this.Drag(e, false));
        const end = () => {
            this.dragging = false;
            this.SetHitSize(this.SliderWidth, this.SliderHeight);
        };
        this.on("pointerup", end);
        this.on("pointerupoutside", end);
        this.Redraw();
    }

    get Value(): number {
        return this.value;
    }

    /** Sets the value (snapped and clamped) from code: no `change`. */
    set Value(value: number) {
        this.value = SnapValue(value, this.range);
        this.Redraw();
    }

    get SliderWidth(): number {
        return this.vertical ? this.extent : this.length;
    }

    get SliderHeight(): number {
        return this.vertical ? this.length : this.extent;
    }

    /** Offered an arrow key by the focus manager before focus moves: the ones along the slider's axis are steps. */
    OnDirection(direction: Direction): boolean {
        if (!this.Enabled) return false;
        const along: Direction[] = this.vertical ? ["up", "down"] : ["left", "right"];
        if (along.indexOf(direction) < 0) return false;
        const up = direction === "right" || direction === "up";
        this.SetFromPlayer(NudgeValue(this.value, up ? 1 : -1, this.range));
        return true;
    }

    /** What a completed press does: nothing - a slider's value was set by the press itself. */
    protected Trigger(): void {
        // no-op
    }

    /** The thumb's length along the track. */
    private get ThumbLength(): number {
        return this.upright ? this.thumb.height : this.thumb.width;
    }

    private Drag(e: interaction.InteractionEvent, start: boolean): void {
        if (!this.Enabled) return;
        if (start) {
            this.dragging = true;
            this.hitArea = DRAG_AREA;
        }
        const local = e.data.getLocalPosition(this);
        const thumbLength = this.ThumbLength;
        // The thumb's middle follows the pointer, and travels from one end of the track to the other less its own length.
        const along = this.vertical ? this.length - local.y : local.x;
        this.SetFromPlayer(ValueAt(along - thumbLength / 2, 0, this.length - thumbLength, this.range));
    }

    private SetFromPlayer(value: number): void {
        const snapped = SnapValue(value, this.range);
        if (snapped !== this.value) {
            this.value = snapped;
            this.Redraw();
            this.emit("change", this.value, this);
        }
    }

    protected Redraw(): void {
        if (!this.thumb) {
            return;
        }
        this.thumb.texture = this.theme.Texture(PickState(this.art.thumb, this.State));
        const at = PositionOf(this.value, 0, this.length - this.ThumbLength, this.range);
        if (this.upright) {
            this.thumb.position.set(Math.floor((this.extent - this.thumb.width) / 2), this.length - at - this.thumb.height);
        } else {
            this.thumb.position.set(at, Math.floor((this.extent - this.thumb.height) / 2));
        }
    }
}
