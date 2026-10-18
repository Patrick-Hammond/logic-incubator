import { BitmapText, interaction, Sprite } from "pixi.js";
import { Direction } from "../input/UiAction";
import { SelectorSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { PickState } from "./ButtonLook";
import UiControl from "./UiControl";
import { StepChoice } from "./SelectorMath";
import { CreateText } from "./UiText";

export type UiSelectorOptions = {
    /** The choice shown at first; the first by default. */
    selected?: number;
    /** Whether stepping past the last choice comes back to the first (and back from the first to the last); on by default. Without it the arrow at an end is dimmed. */
    wrap?: boolean;
};

/**
 * A choice stepped through with an arrow either side of it - a language, a screen size, a difficulty: the settings-screen alternative to a drop-down. Pressing an arrow (or, when
 * it has focus, left and right) steps to the previous or next choice; accept steps on. Emits `change` with the index and the choice whenever the player changes it; `Selected`
 * sets it from code without that. `width` is the whole widget's, arrows included; the choice is written centred between them.
 */
export default class UiSelector extends UiControl {
    private readonly skin: SelectorSkin;
    private readonly left: Sprite;
    private readonly right: Sprite;
    private readonly label: BitmapText;
    private readonly wrap: boolean;
    private readonly boxHeight: number;
    private choices: string[];
    private selected: number;
    /** The arrow the pointer pressed (-1 left, 1 right), until the press completes. */
    private pressSide = 0;

    constructor(theme: UiTheme, variant: string, readonly SelectorWidth: number, choices: string[], options: UiSelectorOptions = {}) {
        super();
        const skin = theme.skin.selectors && theme.skin.selectors[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no selector "${variant}".`);
        }
        this.skin = skin;
        this.wrap = options.wrap !== false;
        this.choices = choices.slice();
        this.selected = choices.length ? Math.max(0, Math.min(choices.length - 1, options.selected || 0)) : -1;
        this.left = new Sprite(theme.Texture(skin.left));
        this.right = new Sprite(theme.Texture(skin.right));
        this.label = CreateText(theme, "Mg", { font: skin.font });
        this.boxHeight = Math.max(this.left.height, this.right.height, Math.ceil(this.label.textHeight));
        this.addChild(this.left, this.right, this.label);
        this.SetHitSize(SelectorWidth, this.boxHeight);
        this.on("pointerdown", (e: interaction.InteractionEvent) => {
            this.pressSide = e.data.getLocalPosition(this).x < SelectorWidth / 2 ? -1 : 1;
            this.Refresh();
        });
        this.on("pointerupoutside", () => {
            this.pressSide = 0;
            this.Refresh();
        });
        this.Redraw();
    }

    get SelectorHeight(): number {
        return this.boxHeight;
    }

    get Selected(): number {
        return this.selected;
    }

    /** Shows a choice (clamped) from code: no `change`. */
    set Selected(index: number) {
        this.selected = this.choices.length ? Math.max(0, Math.min(this.choices.length - 1, index)) : -1;
        this.Refresh();
    }

    /** The choice shown, or "" when there are none. */
    get Value(): string {
        return this.selected >= 0 ? this.choices[this.selected] : "";
    }

    /** Replaces the choices (and shows `selected` of them): no `change`. */
    SetChoices(choices: string[], selected = 0): void {
        this.choices = choices.slice();
        this.Selected = selected;
    }

    /** Offered an arrow key by the focus manager before focus moves: left and right step, up and down move focus on. */
    OnDirection(direction: Direction): boolean {
        if (!this.Enabled || (direction !== "left" && direction !== "right")) return false;
        this.Step(direction === "left" ? -1 : 1);
        return true;
    }

    /** A completed press steps the way of the arrow it landed on; accept steps on. */
    protected Trigger(): void {
        const side = this.pressSide || 1;
        this.pressSide = 0;
        this.Step(side);
        super.Trigger();
    }

    /** A press is a step, which makes its own sound. */
    protected get PressSound(): null {
        return null;
    }

    private Step(step: number): void {
        const next = StepChoice(this.selected, step, this.choices.length, this.wrap);
        if (next !== this.selected) {
            this.selected = next;
            this.Refresh();
            this.Sound("slider");
            this.emit("change", next, this.choices[next], this);
        }
    }

    protected Redraw(): void {
        if (!this.label) {
            return;
        }
        const state = this.State;
        const skin = this.skin;
        this.label.text = this.Value;
        this.label.tint = PickState(skin.textColour, state);
        const atStart = !this.wrap && this.selected <= 0;
        const atEnd = !this.wrap && this.selected >= this.choices.length - 1;
        this.left.tint = PickState(skin.arrowColour, atStart && state !== "disabled" ? "disabled" : state === "pressed" && this.pressSide > 0 ? "normal" : state);
        this.right.tint = PickState(skin.arrowColour, atEnd && state !== "disabled" ? "disabled" : state === "pressed" && this.pressSide < 0 ? "normal" : state);
        // The pressed arrow nudges outwards.
        const nudge = state === "pressed" ? skin.nudge || 0 : 0;
        this.left.position.set(-(this.pressSide < 0 ? nudge : 0), Math.floor((this.boxHeight - this.left.height) / 2));
        this.right.position.set(this.SelectorWidth - this.right.width + (this.pressSide > 0 ? nudge : 0), Math.floor((this.boxHeight - this.right.height) / 2));
        const room = this.SelectorWidth - this.left.width - this.right.width - skin.gap * 2;
        this.label.position.set(this.left.width + skin.gap + Math.floor((room - this.label.textWidth) / 2), Math.floor((this.boxHeight - this.label.textHeight) / 2));
    }
}
