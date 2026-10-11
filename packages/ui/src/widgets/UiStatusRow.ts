import { Container, Sprite } from "pixi.js";
import UiTheme from "../UiTheme";

/**
 * A row of status icons - burning, shielded, hasted: `SetStatuses` shows one picture for each (frames of the skin's bundle, `status_fire`), from the left, in the order given. The
 * same list again changes nothing, so it can be set every frame. `gap` is the room between icons; the skin's `statusGap` by default.
 */
export default class UiStatusRow extends Container {
    private readonly icons: Sprite[] = [];
    private shown = "";
    private readonly gap: number;

    constructor(private readonly theme: UiTheme, statuses: string[] = [], gap?: number) {
        super();
        this.gap = gap === undefined ? theme.Metric("statusGap", 2) : gap;
        this.SetStatuses(statuses);
    }

    /** How wide the row is now. */
    get RowWidth(): number {
        const visible = this.icons.filter(icon => icon.visible);
        return visible.length ? visible[visible.length - 1].x + visible[visible.length - 1].width : 0;
    }

    SetStatuses(statuses: ReadonlyArray<string>): void {
        const signature = statuses.join("|");
        if (signature === this.shown) {
            return;
        }
        this.shown = signature;
        let x = 0;
        statuses.forEach((status, i) => {
            const icon = this.icons[i] || this.addChild(new Sprite());
            this.icons[i] = icon;
            icon.texture = this.theme.Texture(status);
            icon.visible = true;
            icon.position.set(x, 0);
            x += icon.texture.width + this.gap;
        });
        for (let i = statuses.length; i < this.icons.length; i++) {
            this.icons[i].visible = false;
        }
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
