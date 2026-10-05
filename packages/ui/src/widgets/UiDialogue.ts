import { BitmapText, Sprite, Texture } from "pixi.js";
import { DialogueSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import NineSlice from "./NineSlice";
import { Typewriter, WrapText } from "./Typewriter";
import UiControl from "./UiControl";
import { CreateMeasure, CreateText } from "./UiText";

export type Line = {
    /** Who is speaking; no name plate when absent. */
    speaker?: string;
    text: string;
    /** The speaker's picture; the portrait box is left out when absent. */
    portrait?: Texture;
};

const ARROW_BOB_MS = 450;

/**
 * A dialogue box: a framed box across the bottom of a scene with an optional portrait and the speaker's name, the text coming out a few characters at a time. A press (or accept)
 * while it is still typing shows the rest of the line; a press after that emits `advance` - what comes next (another `Say`, closing the box) is the owner's, and the box shows
 * a bobbing arrow while it waits. Drive it with `Update(ms)` (`UiSystem.Track` does).
 */
export default class UiDialogue extends UiControl {
    private readonly skin: DialogueSkin;
    private readonly frame: NineSlice;
    private readonly portraitFrame: NineSlice;
    private readonly portrait = new Sprite();
    private readonly speakerName: BitmapText;
    private readonly body: BitmapText;
    private readonly arrow: Sprite;
    private readonly measure: (text: string) => number;
    private typewriter = new Typewriter(0, 1);
    private wrapped = "";
    private clock = 0;
    private hasPortrait = false;

    constructor(theme: UiTheme, variant: string, readonly BoxWidth: number, readonly BoxHeight: number) {
        super();
        const skin = theme.skin.dialogues && theme.skin.dialogues[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no dialogue "${variant}".`);
        }
        this.skin = skin;
        this.measure = CreateMeasure(theme, skin.bodyFont);
        this.frame = new NineSlice(theme.Texture(skin.frame.frame), skin.frame, BoxWidth, BoxHeight);
        this.portraitFrame = new NineSlice(theme.Texture(skin.portraitFrame.frame), skin.portraitFrame, skin.portraitSize, skin.portraitSize);
        this.speakerName = CreateText(theme, "", { font: skin.nameFont, colour: skin.nameColour });
        this.body = CreateText(theme, "", { font: skin.bodyFont, colour: skin.bodyColour });
        this.arrow = new Sprite(theme.Texture(skin.arrow));
        this.arrow.visible = false;
        this.addChild(this.frame, this.portraitFrame, this.portrait, this.speakerName, this.body, this.arrow);
        this.SetHitSize(BoxWidth, BoxHeight);
        this.Redraw();
    }

    /** Starts a line: clears what was said and begins typing this. */
    Say(line: Line): void {
        const pad = this.skin.padding;
        this.hasPortrait = !!line.portrait;
        if (line.portrait) {
            this.portrait.texture = line.portrait;
        }
        this.portrait.visible = this.portraitFrame.visible = this.hasPortrait;
        this.portraitFrame.position.set(pad.left, pad.top);
        // The picture sits inside its frame, centred, at its own size (whole pixels, so it stays crisp).
        const inner = this.skin.portraitSize;
        this.portrait.position.set(pad.left + Math.floor((inner - this.portrait.texture.width) / 2), pad.top + Math.floor((inner - this.portrait.texture.height) / 2));

        const left = pad.left + (this.hasPortrait ? this.skin.portraitSize + this.skin.gap : 0);
        const width = this.BoxWidth - left - pad.right;
        let top = pad.top;
        this.speakerName.text = line.speaker || "";
        this.speakerName.visible = !!line.speaker;
        this.speakerName.position.set(left, top);
        if (line.speaker) {
            top += Math.ceil(this.speakerName.textHeight) + 2;
        }
        this.wrapped = WrapText(line.text, width, this.measure);
        this.body.text = "";
        this.body.position.set(left, top);
        this.typewriter = new Typewriter(this.wrapped.length, this.skin.charactersPerSecond);
        this.clock = 0;
        this.arrow.visible = false;
        this.arrow.position.set(this.BoxWidth - pad.right - this.arrow.texture.width, this.BoxHeight - pad.bottom - this.arrow.texture.height);
    }

    /** Whether the whole line is showing. */
    get Done(): boolean {
        return this.typewriter.Done;
    }

    /** Shows the rest of the line at once. */
    Skip(): void {
        this.typewriter.Skip();
        this.Show();
    }

    Update(ms: number): void {
        if (!this.typewriter.Done) {
            if (this.typewriter.Update(ms)) {
                this.Show();
            }
            return;
        }
        // Waiting to be told to go on: the arrow bobs a pixel.
        this.clock += ms;
        if (this.arrow.visible) {
            const pad = this.skin.padding;
            this.arrow.y = this.BoxHeight - pad.bottom - this.arrow.texture.height + (Math.floor(this.clock / ARROW_BOB_MS) % 2);
        }
    }

    protected Trigger(): void {
        if (!this.typewriter.Done) {
            this.Skip();
            return;
        }
        this.emit("advance", this);
    }

    protected Redraw(): void {
        // The box looks the same in every state.
    }

    private Show(): void {
        this.body.text = this.wrapped.slice(0, this.typewriter.Visible);
        this.arrow.visible = this.typewriter.Done && this.wrapped.length > 0;
        if (this.arrow.visible) {
            this.clock = 0;
        }
    }
}
