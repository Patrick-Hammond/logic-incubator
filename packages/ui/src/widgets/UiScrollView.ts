import { Container, DisplayObject, Graphics, Point } from "pixi.js";
import UiTheme from "../UiTheme";
import { ClampScroll, MaxScroll, ScrollToReveal } from "./ScrollMath";
import UiScrollbar from "./UiScrollbar";

/**
 * A window onto content taller than it, scrolled by the wheel, a scrollbar and (for the focused widget) the keyboard and pad. Add the content to `content`, then call
 * `MeasureContent()`; the view clips to its size and scrolls `content` up and down (`Scroll` is how far). The scrollbar sits beside the viewport and is hidden when everything fits.
 * The wheel is handled by `UiSystem` (it knows the page), which calls `ScrollBy` when the pointer is over the view.
 */
export default class UiScrollView extends Container {
    /** Where the scrolling content goes. */
    readonly content = new Container();
    private readonly clip = new Graphics();
    private readonly bar: UiScrollbar | null;
    private contentHeight = 0;
    private scroll = 0;
    private readonly viewWidth: number;

    constructor(theme: UiTheme, scrollbar: string | null, readonly ViewWidth: number, readonly ViewHeight: number) {
        super();
        const skin = scrollbar && theme.skin.scrollbars ? theme.skin.scrollbars[scrollbar] : null;
        const thickness = skin ? skin.thickness : 0;
        this.viewWidth = ViewWidth - (thickness ? thickness + 2 : 0);
        this.clip.beginFill(0xffffff).drawRect(0, 0, this.viewWidth, ViewHeight).endFill();
        this.content.mask = this.clip;
        this.addChild(this.content, this.clip);

        this.bar = scrollbar ? new UiScrollbar(theme, scrollbar, ViewHeight) : null;
        if (this.bar) {
            this.bar.position.set(this.viewWidth + 2, 0);
            this.bar.on("scroll", (scroll: number) => this.ApplyScroll(scroll, false));
            this.addChild(this.bar);
        }
    }

    /** The width the content has to work in: the view less its scrollbar. */
    get ContentWidth(): number {
        return this.viewWidth;
    }

    get Scroll(): number {
        return this.scroll;
    }

    /** How tall the content is. */
    get ContentHeight(): number {
        return this.contentHeight;
    }

    /** The scrollbar, if the view has one (so it can be given focus handling, or styled). */
    get Scrollbar(): UiScrollbar | null {
        return this.bar;
    }

    /** Reads the content's height from what has been added to it (its bottom edge) and updates the scrollbar. Call after changing the content. */
    MeasureContent(): void {
        const bounds = this.content.getLocalBounds();
        this.SetContentHeight(Math.ceil(bounds.y + bounds.height));
    }

    /** Sets the content's height outright (for content whose bounds don't say - a list with room at the end). */
    SetContentHeight(height: number): void {
        this.contentHeight = height;
        if (this.bar) this.bar.SetMetrics(height, this.ViewHeight);
        this.ApplyScroll(this.scroll, false);
    }

    get Scrollable(): boolean {
        return MaxScroll(this.contentHeight, this.ViewHeight) > 0;
    }

    /** Scrolls to `scroll` (clamped), moving the scrollbar's thumb to match. */
    ScrollTo(scroll: number): void {
        this.ApplyScroll(scroll, true);
    }

    /** Scrolls by a number of pixels (the wheel). */
    ScrollBy(pixels: number): void {
        this.ApplyScroll(this.scroll + pixels, true);
    }

    /** Scrolls the least that shows `item` (a child of the content), with a little room to spare: what moving focus onto an item that is out of view does. */
    EnsureVisible(item: DisplayObject, margin = 4): void {
        // The item's top and bottom in the content's own coordinates (which don't move as it scrolls).
        const bounds = item.getBounds();
        const top = this.content.toLocal(new Point(bounds.x, bounds.y)).y;
        const bottom = this.content.toLocal(new Point(bounds.x, bounds.y + bounds.height)).y;
        this.ApplyScroll(ScrollToReveal(this.scroll, this.ViewHeight, top, bottom, margin), true);
    }

    /** Whether a point in screen pixels (what `getBounds` uses) is over the viewport. */
    ContainsGlobal(x: number, y: number): boolean {
        const b = this.clip.getBounds();
        return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;
    }

    private ApplyScroll(scroll: number, updateBar: boolean): void {
        this.scroll = ClampScroll(scroll, this.contentHeight, this.ViewHeight);
        this.content.y = -this.scroll;
        if (updateBar && this.bar) this.bar.Scroll = this.scroll;
        this.emit("scrolled", this.scroll);
    }

    /** Destroys what is inside too, so the controls in it let go of their focus registrations; emits `destroyed` first (Pixi 5.2.1 doesn't) so the wheel handling lets go of it. */
    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.emit("destroyed", this);
        super.destroy({ children: true, ...options });
    }
}
