import { Container, DisplayObject, Point, Sprite } from "pixi.js";
import { TooltipSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { PlaceTooltip, Rect } from "./TooltipPlacement";
import NineSlice from "./NineSlice";
import { CreateMeasure, CreateText } from "./UiText";
import { WrapText } from "./Typewriter";

export type TooltipContent = {
    title?: string;
    text?: string;
};

/**
 * A tooltip: a small framed note with an optional title and wrapped text, and a tail pointing at the thing it describes. It sits above that thing if there is room, below it
 * otherwise, and stays inside the bounds. Put it in the topmost layer, then either `ShowFor` something yourself or `Attach` it to a control, which shows it after the pointer
 * has rested there for the skin's delay (or at once when the control takes keyboard focus) and hides it when the pointer leaves or presses.
 */
export default class UiTooltip extends Container {
    private readonly skin: TooltipSkin;
    private readonly measure: (text: string) => number;
    private readonly tails: { down: Sprite; up: Sprite };
    private frame: NineSlice | null = null;
    private readonly body = new Container();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private owner: DisplayObject | null = null;

    constructor(private readonly theme: UiTheme, variant: string) {
        super();
        const skin = theme.skin.tooltips && theme.skin.tooltips[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no tooltip "${variant}".`);
        }
        this.skin = skin;
        this.measure = CreateMeasure(theme, skin.textFont);
        this.tails = { down: new Sprite(theme.Texture(skin.tailDown)), up: new Sprite(theme.Texture(skin.tailUp)) };
        this.addChild(this.body, this.tails.down, this.tails.up);
        this.visible = false;
        // A tooltip is a picture; it never takes the pointer from what is under it.
        this.interactiveChildren = false;
    }

    /** What the tooltip shows now, or null when hidden. */
    get Owner(): DisplayObject | null {
        return this.owner;
    }

    /** Shows `content` pointing at `target` (any display object; its bounds on screen). `bounds` is the room it may use in this container's parent's coordinates; the whole canvas by default. */
    ShowFor(target: DisplayObject, content: TooltipContent, bounds?: Rect): void {
        this.CancelPending();
        const parent = this.parent;
        if (!parent) {
            return;
        }
        this.owner = target;
        this.Build(content);
        const place = this.PlaceFor(target, parent, bounds);
        this.position.set(place.x, place.y);
        this.tails.down.visible = !place.below;
        this.tails.up.visible = place.below;
        const tail = place.below ? this.tails.up : this.tails.down;
        const overlap = this.theme.Metric("tailOverlap", 2);
        tail.position.set(place.tailX - Math.floor(tail.texture.width / 2), place.below ? -(tail.texture.height - overlap) : this.frame ? this.frame.SliceHeight - overlap : 0);
        this.visible = true;
    }

    Hide(): void {
        this.CancelPending();
        this.owner = null;
        this.visible = false;
    }

    /**
     * Gives `target` this tooltip: shown after the pointer rests on it for the skin's delay (or when it takes keyboard focus), hidden when the pointer leaves, presses, or the
     * control is destroyed. `content` can be a function, to say what is true when it is shown. Returns what removes it.
     */
    Attach(target: DisplayObject, content: TooltipContent | (() => TooltipContent)): () => void {
        const resolve = () => (typeof content === "function" ? content() : content);
        const show = () => this.ShowFor(target, resolve());
        const onOver = () => {
            this.CancelPending();
            this.timer = setTimeout(() => {
                this.timer = null;
                show();
            }, this.skin.delay);
        };
        const onOut = () => {
            if (this.owner === target || this.timer !== null) this.Hide();
        };
        const onFocus = (focused: boolean) => (focused ? show() : onOut());
        target.on("pointerover", onOver);
        target.on("pointerout", onOut);
        target.on("pointerdown", onOut);
        target.on("focuschange", onFocus);
        const off = () => {
            target.off("pointerover", onOver);
            target.off("pointerout", onOut);
            target.off("pointerdown", onOut);
            target.off("focuschange", onFocus);
            target.off("destroyed", off);
            onOut();
        };
        target.on("destroyed", off);
        return off;
    }

    private Build(content: TooltipContent): void {
        this.body.removeChildren().forEach(child => child.destroy());
        const pad = this.skin.padding;
        const inner = this.skin.maxWidth - pad.left - pad.right;
        let y = pad.top;
        let width = 0;
        if (content.title) {
            const title = CreateText(this.theme, content.title, { font: this.skin.titleFont, colour: this.skin.titleColour });
            title.position.set(pad.left, y);
            this.body.addChild(title);
            y += Math.ceil(title.textHeight) + this.theme.Metric("lineGap", 4);
            width = Math.max(width, title.textWidth);
        }
        if (content.text) {
            const text = CreateText(this.theme, WrapText(content.text, inner, this.measure), { font: this.skin.textFont, colour: this.skin.textColour });
            text.position.set(pad.left, y);
            this.body.addChild(text);
            y += Math.ceil(text.textHeight);
            width = Math.max(width, text.textWidth);
        }
        const frameWidth = Math.min(this.skin.maxWidth, Math.ceil(width) + pad.left + pad.right);
        const frameHeight = y + pad.bottom;
        if (this.frame) {
            this.frame.Resize(frameWidth, frameHeight);
        } else {
            this.frame = new NineSlice(this.theme.Texture(this.skin.frame.frame), this.skin.frame, frameWidth, frameHeight);
            this.addChildAt(this.frame, 0);
        }
    }

    private PlaceFor(target: DisplayObject, parent: Container, bounds?: Rect) {
        const box = target.getBounds();
        const topLeft = parent.toLocal(new Point(box.x, box.y));
        const bottomRight = parent.toLocal(new Point(box.x + box.width, box.y + box.height));
        const view = this.theme.host ? this.theme.host.view : null;
        const limit = view ? parent.toLocal(new Point(view.width, view.height)) : new Point(bottomRight.x + 1000, bottomRight.y + 1000);
        const room = bounds || { x: 0, y: 0, width: limit.x, height: limit.y };
        const frame = this.frame as NineSlice;
        return PlaceTooltip(
            { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y },
            { width: frame.SliceWidth, height: frame.SliceHeight },
            room,
            this.skin.gap,
            this.tails.down.texture.height - this.theme.Metric("tailOverlap", 2),
            this.theme.Metric("tailMargin", 12)
        );
    }

    private CancelPending(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.CancelPending();
        super.destroy({ children: true, ...options });
    }
}
