import { Container } from "pixi.js";
import UiTheme from "../UiTheme";
import UiButton from "./UiButton";

/**
 * A column of buttons - the main menu, a pause menu. Emits `activate` with the index when one is pressed (by the pointer or accept). Register `Buttons` with a `UiSystem`
 * (and give its scope `wrap: true`) for the arrows and pad to walk down it.
 */
export default class UiMenu extends Container {
    private readonly buttons: UiButton[] = [];
    readonly MenuWidth: number;
    readonly MenuHeight: number;

    /** `width` fixes every button's width (so they line up); by default each is as wide as the widest label needs. */
    constructor(theme: UiTheme, variant: string, labels: string[], width?: number) {
        super();
        const skin = theme.skin.menus && theme.skin.menus[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no menu "${variant}".`);
        }
        const sized = labels.map(label => new UiButton(theme, skin.button, label));
        const wide = width !== undefined ? width : Math.max(0, ...sized.map(b => b.ButtonWidth));
        let y = 0;
        labels.forEach((label, index) => {
            const button = new UiButton(theme, skin.button, label, { width: wide });
            button.position.set(0, y);
            button.on("activate", () => this.emit("activate", index, button));
            this.buttons.push(button);
            this.addChild(button);
            y += button.ButtonHeight + skin.gap;
        });
        sized.forEach(b => b.destroy());
        this.MenuWidth = wide;
        this.MenuHeight = Math.max(0, y - skin.gap);
    }

    get Buttons(): ReadonlyArray<UiButton> {
        return this.buttons;
    }

    /** Destroys what is inside too, so the controls in it let go of their focus registrations. */
    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
