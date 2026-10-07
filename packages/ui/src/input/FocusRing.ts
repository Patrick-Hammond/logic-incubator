import { Container, Graphics, Point } from "pixi.js";
import FocusManager, { FocusRect } from "./FocusManager";

/**
 * The outline drawn round whatever has focus, while the keyboard or pad is in use. It sits in the UI layer (so it is in UI pixels and scales with it) and is
 * drawn as four bars on whole pixels - a stroked line would be half on and half off the pixel grid and blur. It follows the item every frame, since a
 * widget can move or animate, and pulses a little so it can be found.
 */
export default class FocusRing extends Graphics {
    private target: (() => FocusRect | null) | null = null;
    private shown = false;
    private time = 0;
    private lastKey = "";

    constructor(private readonly layer: Container, private readonly colour: number, private readonly gap = 2, private readonly thickness = 2) {
        super();
        this.visible = false;
    }

    /** Follows what focus is on now (the item's rectangle in screen pixels), or nothing; `visible` is whether the ring is wanted. */
    Follow(manager: FocusManager): () => void {
        const apply = () => {
            const item = manager.Focused;
            this.target = item ? () => item.Rect() : null;
            this.shown = manager.FocusVisible && !!item;
            this.lastKey = "";
            this.Draw();
        };
        apply();
        return manager.Subscribe(apply);
    }

    /** Once a frame: keeps the ring on its item and pulses it. `ms` is the time since the last call. */
    Update(ms: number): void {
        this.time += ms;
        this.alpha = 0.75 + 0.25 * Math.sin(this.time / 160);
        this.Draw();
    }

    private Draw(): void {
        const rect = this.shown && this.target ? this.target() : null;
        if (!rect) {
            this.visible = false;
            this.lastKey = "";
            return;
        }
        // The rectangle is in screen pixels; the layer is where the ring lives, so it is converted into its pixels.
        const a = this.layer.toLocal(new Point(rect.x, rect.y));
        const b = this.layer.toLocal(new Point(rect.x + rect.width, rect.y + rect.height));
        const x0 = Math.round(a.x) - this.gap, y0 = Math.round(a.y) - this.gap;
        const x1 = Math.round(b.x) + this.gap, y1 = Math.round(b.y) + this.gap;
        const key = [x0, y0, x1, y1].join();
        this.visible = true;
        if (key === this.lastKey) return;
        this.lastKey = key;
        this.clear();
        this.beginFill(this.colour);
        const t = this.thickness;
        this.drawRect(x0, y0, x1 - x0, t);
        this.drawRect(x0, y1 - t, x1 - x0, t);
        this.drawRect(x0, y0 + t, t, y1 - y0 - 2 * t);
        this.drawRect(x1 - t, y0 + t, t, y1 - y0 - 2 * t);
        this.endFill();
    }
}
