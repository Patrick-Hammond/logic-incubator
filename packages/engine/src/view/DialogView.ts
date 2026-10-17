import { Texture } from "pixi.js";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import UiLayer from "@logic-incubator/ui/UiLayer";
import UiDialogue from "@logic-incubator/ui/widgets/UiDialogue";
import UiMenu from "@logic-incubator/ui/widgets/UiMenu";
import { GameHeight, PlayWidth } from "../Constants";
import type { DialogLine } from "../story/DialogRunner";

/** Room round the box, in UI pixels. */
const Margin = 24;
const BoxHeight = 112;
/** Between the choices and the box - clear of the name plate standing above its top edge. */
const MenuGap = 36;
const Scope = "dialog";

/** What a player does in a talk - see `DialogView`. */
export type DialogViewEvents = {
    /** Go on from a line with no choices. */
    next(): void;
    /** Choice `index` of those offered was picked. */
    choose(index: number): void;
    /** The player ended the talk (cancel). */
    end(): void;
};

/**
 * A talk with an NPC, over the play area: what's said in a dialogue box across the bottom, the NPC's tile beside it as
 * their portrait, and - once a line with choices has come out in full - the choices in a menu above it. Accept (or a
 * press on the box) shows the rest of a line still coming, then goes on; the arrows and accept pick a choice; cancel
 * ends the talk. `DungeonMain` opens it with what the talk says first (`Open`) and gives it each line after (`Say`);
 * what the player does comes back through `events`, a frame later - never in the middle of the key press that did it,
 * which would reach whatever takes the keys once the talk is over.
 */
export default class DialogView extends GameComponent {
    private layer!: UiLayer;
    private box!: UiDialogue;
    private menu: UiMenu | null = null;
    /** The choices waiting for the line to come out in full. */
    private choices: string[] = [];
    private portrait: Texture | undefined;
    private portraitScale = 1;
    private open = false;
    /** What the player did, to be told on the next frame. */
    private pending: (() => void) | null = null;

    constructor(private readonly events: DialogViewEvents) {
        super();
    }

    get IsOpen(): boolean {
        return this.open;
    }

    protected OnInitialise(): void {
        this.layer = this.Attach(new UiLayer());
        const theme = this.layer.Theme;
        const scale = theme.Scale;
        this.box = new UiDialogue(theme, "default", Math.round(PlayWidth / scale) - Margin * 2, BoxHeight);
        this.box.position.set(Margin, Math.round(GameHeight / scale) - Margin - BoxHeight);
        this.box.on("advance", () => {
            if (!this.choices.length) {
                this.Later(() => this.events.next());
            }
        });
        this.layer.root.addChild(this.box);
        this.layer.Ui.Track(this.box);
        this.root.visible = false;
        this.Tick(() => {
            const pending = this.pending;
            this.pending = null;
            if (pending) {
                pending();
            }
            if (this.open && this.choices.length && !this.menu && this.box.Done) {
                this.ShowChoices();
            }
        });
    }

    protected OnHide(): void {
        this.Close();
    }

    /** Starts a talk with its first line - `portrait` is the NPC's picture, drawn as big as fits. */
    Open(line: DialogLine, portrait?: Texture): void {
        if (!this.open) {
            this.open = true;
            this.root.visible = true;
            this.layer.Ui.PushScope(Scope, { wrap: true, onAccept: () => this.box.Activate(), onCancel: () => this.Later(() => this.events.end()) });
        }
        this.portrait = portrait;
        const size = this.layer.Theme.skin.dialogues!.default.portraitSize;
        this.portraitScale = portrait ? Math.max(1, Math.floor(size / Math.max(portrait.width, portrait.height, 1))) : 1;
        this.Say(line);
    }

    /** The next line - its choices, if any, shown once it has come out in full. */
    Say(line: DialogLine): void {
        this.HideChoices();
        this.choices = line.choices.slice();
        this.box.Say({ speaker: line.speaker || undefined, text: line.text, portrait: this.portrait, portraitScale: this.portraitScale });
    }

    /** Ends the talk on screen. */
    Close(): void {
        if (!this.open) {
            return;
        }
        this.open = false;
        this.pending = null;
        this.HideChoices();
        this.choices = [];
        this.layer.Ui.PopScope(Scope);
        this.root.visible = false;
    }

    private ShowChoices(): void {
        const theme = this.layer.Theme;
        const menu = (this.menu = new UiMenu(theme, "main", this.choices));
        menu.position.set(this.box.x + this.box.BoxWidth - menu.MenuWidth, this.box.y - MenuGap - menu.MenuHeight);
        this.layer.root.addChild(menu);
        menu.Buttons.forEach((button, i) => this.layer.Ui.Register(button, { scope: Scope, id: "dialog-choice-" + i }));
        menu.on("activate", (index: number) => this.Later(() => this.events.choose(index)));
        // The first is ready to pick - with the ring on it, for the keys or pad.
        this.layer.Ui.focus.SetFocusVisible(true);
        this.layer.Ui.focus.Focus("dialog-choice-0");
    }

    private HideChoices(): void {
        if (this.menu) {
            // Its buttons let go of their focus as they go.
            this.menu.destroy();
            this.menu = null;
        }
    }

    private Later(action: () => void): void {
        this.pending = action;
    }
}
