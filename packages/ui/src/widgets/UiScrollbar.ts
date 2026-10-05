import { Container, interaction, Rectangle } from "pixi.js";
import { ScrollbarSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { PickState } from "./ButtonLook";
import NineSlice from "./NineSlice";
import { ClampScroll, ScrollFromThumb, ThumbLength, ThumbOffset } from "./ScrollMath";
import UiButton from "./UiButton";
import UiControl from "./UiControl";

const DRAG_AREA = new Rectangle(-4000, -4000, 8000, 8000);
/** Holding an arrow: how long before it repeats, then between repeats (ms). */
const REPEAT_DELAY = 350;
const REPEAT_INTERVAL = 70;

/** The draggable part of a scrollbar: a nine-slice that looks different hovered and pressed, stretched to the thumb's length. */
class ScrollThumb extends UiControl {
    private readonly frames = new Map<string, NineSlice>();
    private current: NineSlice | null = null;
    private lengthValue = 0;
    private dragging = false;

    constructor(private readonly theme: UiTheme, private readonly skin: ScrollbarSkin) {
        super();
    }

    /** Whether a drag is in progress (the thumb then takes the pointer wherever it goes). */
    get Dragging(): boolean {
        return this.dragging;
    }

    BeginDrag(): void {
        this.dragging = true;
        this.hitArea = DRAG_AREA;
    }

    EndDrag(): void {
        this.dragging = false;
        this.SetHitSize(this.skin.thickness, this.lengthValue);
    }

    /** Draws the thumb `length` long (along the bar) and as thick as the bar. */
    Resize(length: number): void {
        this.lengthValue = length;
        this.frames.forEach(frame => frame.Resize(this.skin.thickness, length));
        // While it is being dragged its hit area is the whole screen, which resizing the thumb mustn't take back.
        if (!this.dragging) {
            this.SetHitSize(this.skin.thickness, length);
        }
        this.Redraw();
    }

    protected Trigger(): void {
        // A press on the thumb is the start of a drag, not an activation.
    }

    protected Redraw(): void {
        if (!this.lengthValue) {
            return;
        }
        const spec = PickState(this.skin.thumb, this.State);
        let frame = this.frames.get(spec.frame);
        if (!frame) {
            frame = new NineSlice(this.theme.Texture(spec.frame), spec, this.skin.thickness, this.lengthValue);
            this.frames.set(spec.frame, frame);
            this.addChild(frame);
        }
        if (this.current && this.current !== frame) this.current.visible = false;
        frame.visible = true;
        this.current = frame;
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.frames.clear();
        super.destroy(options);
    }
}

export type UiScrollbarOptions = {
    /** A horizontal bar is the vertical one turned on its side. */
    horizontal?: boolean;
};

/**
 * A scrollbar: a track with a thumb sized to how much of the content is in view, and optionally an arrow at each end. Drag the thumb, click the track to page, hold an arrow to
 * keep scrolling. `Scroll` is how far the content has scrolled (0 to content less viewport); it emits `scroll` with the new value when the *player* changes it.
 */
export default class UiScrollbar extends Container {
    private readonly skin: ScrollbarSkin;
    private readonly inner = new Container();
    private readonly track: NineSlice;
    private readonly thumb: ScrollThumb;
    private readonly arrows: UiButton[] = [];
    private readonly horizontal: boolean;
    private readonly trackLength: number;
    private readonly trackStart: number;
    private content = 1;
    private viewport = 1;
    private scroll = 0;
    private grabOffset = 0;
    private repeat: ReturnType<typeof setTimeout> | null = null;

    constructor(theme: UiTheme, variant: string, readonly Length: number, options: UiScrollbarOptions = {}) {
        super();
        const skin = theme.skin.scrollbars && theme.skin.scrollbars[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no scrollbar "${variant}".`);
        }
        this.skin = skin;
        this.horizontal = !!options.horizontal;
        this.addChild(this.inner);
        if (this.horizontal) {
            // The vertical bar turned a quarter anticlockwise and dropped back into view.
            this.inner.rotation = -Math.PI / 2;
            this.inner.position.set(0, skin.thickness);
        }

        if (skin.arrows) {
            const a = skin.arrows;
            const makeArrow = (icon: string, step: number, y: number) => {
                const button = new UiButton(theme, a.button, "", { icon, width: skin.thickness, height: skin.thickness });
                button.position.set(0, y);
                button.on("pointerdown", () => this.StartRepeat(step));
                const stop = () => this.StopRepeat();
                button.on("pointerup", stop);
                button.on("pointerupoutside", stop);
                button.on("pointerout", stop);
                this.inner.addChild(button);
                this.arrows.push(button);
            };
            makeArrow(this.horizontal ? a.left : a.up, -1, 0);
            makeArrow(this.horizontal ? a.right : a.down, 1, Length - skin.thickness);
        }
        this.trackStart = skin.arrows ? skin.thickness : 0;
        this.trackLength = Length - this.trackStart * (skin.arrows ? 2 : 0);

        this.track = new NineSlice(theme.Texture(skin.track.frame), skin.track, skin.thickness, this.trackLength);
        this.track.position.set(0, this.trackStart);
        this.track.interactive = true;
        this.track.on("pointerdown", (e: interaction.InteractionEvent) => this.PageTowards(e));
        this.thumb = new ScrollThumb(theme, skin);
        this.inner.addChildAt(this.track, 0);
        this.inner.addChild(this.thumb);
        this.thumb.on("pointerdown", (e: interaction.InteractionEvent) => this.BeginDrag(e));
        this.thumb.on("pointermove", (e: interaction.InteractionEvent) => this.thumb.Dragging && this.Drag(e));
        const end = () => this.EndDrag();
        this.thumb.on("pointerup", end);
        this.thumb.on("pointerupoutside", end);
        this.Layout();
    }

    /** The bar's size on screen. */
    get BarWidth(): number {
        return this.horizontal ? this.Length : this.skin.thickness;
    }

    get BarHeight(): number {
        return this.horizontal ? this.skin.thickness : this.Length;
    }

    get Scroll(): number {
        return this.scroll;
    }

    /** Sets the scroll (clamped) from code: no `scroll` event. */
    set Scroll(scroll: number) {
        this.scroll = ClampScroll(scroll, this.content, this.viewport);
        this.Layout();
    }

    /** Tells the bar how much there is to scroll (`content`) and how much shows at once (`viewport`), in the same unit. */
    SetMetrics(content: number, viewport: number): void {
        this.content = content;
        this.viewport = viewport;
        this.scroll = ClampScroll(this.scroll, content, viewport);
        this.Layout();
    }

    /** Whether there is anything to scroll. */
    get Scrollable(): boolean {
        return this.content > this.viewport;
    }

    /** One step of scrolling when an arrow is pressed or held, in content units. */
    StepSize = 12;

    private SetFromPlayer(scroll: number): void {
        const clamped = ClampScroll(scroll, this.content, this.viewport);
        if (clamped !== this.scroll) {
            this.scroll = clamped;
            this.Layout();
            this.emit("scroll", this.scroll);
        }
    }

    private Layout(): void {
        const length = ThumbLength(this.content, this.viewport, this.trackLength, this.skin.minThumb);
        this.thumb.Resize(Math.max(1, length));
        this.thumb.position.set(0, this.trackStart + ThumbOffset(this.scroll, this.content, this.viewport, this.trackLength, length));
        this.thumb.visible = this.Scrollable;
        this.thumb.Enabled = this.Scrollable;
        this.arrows.forEach(arrow => (arrow.Enabled = this.Scrollable));
    }

    /** The pointer's distance along the bar from the start of the track, whichever way the bar lies. */
    private Along(e: interaction.InteractionEvent): number {
        const local = e.data.getLocalPosition(this);
        return (this.horizontal ? local.x : local.y) - this.trackStart;
    }

    private BeginDrag(e: interaction.InteractionEvent): void {
        if (!this.Scrollable) return;
        this.thumb.BeginDrag();
        const length = ThumbLength(this.content, this.viewport, this.trackLength, this.skin.minThumb);
        // Where on the thumb it was grabbed, so it doesn't jump to put its start under the pointer.
        this.grabOffset = this.Along(e) - ThumbOffset(this.scroll, this.content, this.viewport, this.trackLength, length);
    }

    private Drag(e: interaction.InteractionEvent): void {
        const length = ThumbLength(this.content, this.viewport, this.trackLength, this.skin.minThumb);
        this.SetFromPlayer(ScrollFromThumb(this.Along(e) - this.grabOffset, this.content, this.viewport, this.trackLength, length));
    }

    private EndDrag(): void {
        this.thumb.EndDrag();
    }

    /** A click on the track beside the thumb pages towards the click. */
    private PageTowards(e: interaction.InteractionEvent): void {
        if (!this.Scrollable) return;
        const length = ThumbLength(this.content, this.viewport, this.trackLength, this.skin.minThumb);
        const start = ThumbOffset(this.scroll, this.content, this.viewport, this.trackLength, length);
        const at = this.Along(e);
        this.SetFromPlayer(this.scroll + (at < start ? -this.viewport : this.viewport));
    }

    private StartRepeat(step: number): void {
        this.StopRepeat();
        this.SetFromPlayer(this.scroll + step * this.StepSize);
        const again = (delay: number) => {
            this.repeat = setTimeout(() => {
                this.SetFromPlayer(this.scroll + step * this.StepSize);
                again(REPEAT_INTERVAL);
            }, delay);
        };
        again(REPEAT_DELAY);
    }

    private StopRepeat(): void {
        if (this.repeat !== null) {
            clearTimeout(this.repeat);
            this.repeat = null;
        }
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.StopRepeat();
        super.destroy({ children: true, ...options });
    }
}
