import { BitmapText, Sprite, Texture } from "pixi.js";
import { DialogueSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import NineSlice from "./NineSlice";
import { Typewriter, WrapText } from "./Typewriter";
import UiControl from "./UiControl";
import { CreateMeasure, CreateText } from "./UiText";

export type Line = {
    /** Who is speaking; no name when absent. */
    speaker?: string;
    text: string;
    /** The speaker's picture; the portrait is left out when absent. */
    portrait?: Texture;
    /** How many times as big the picture is drawn - a whole number, for pixel art (a 16 pixel tile at 5 fills an 80 pixel portrait); 1 when absent. */
    portraitScale?: number;
};

const ARROW_BOB_MS = 450;

/**
 * A dialogue box: a framed box across the bottom of a scene with an optional portrait and the speaker's name, the text coming out a few characters at a time. A press (or accept)
 * while it is still typing shows the rest of the line; a press after that emits `advance` - what comes next (another `Say`, closing the box) is the owner's, and the box shows
 * a bobbing arrow while it waits. Drive it with `Update(ms)` (`UiSystem.Track` does).
 *
 * The skin says where the portrait and the name go: the portrait in a frame inside the box, or in a frame of its own beside it (`portraitBeside`, bottom-aligned and as tall as
 * it needs - it may stand above the box); the name as the first line of the text, or on a plate across the box's top edge (`nameFrame`, which stands above the box).
 */
export default class UiDialogue extends UiControl {
    private readonly skin: DialogueSkin;
    private readonly frame: NineSlice;
    private readonly portraitFrame: NineSlice;
    private readonly nameFrame: NineSlice | null;
    private readonly portrait = new Sprite();
    private readonly speakerName: BitmapText;
    private readonly body: BitmapText;
    private readonly arrow: Sprite;
    private readonly measure: (text: string) => number;
    private typewriter = new Typewriter(0, 1);
    private wrapped = "";
    private clock = 0;
    /** Where the box's frame starts (after a portrait standing beside it). */
    private boxLeft = 0;

    constructor(private readonly theme: UiTheme, variant: string, readonly BoxWidth: number, readonly BoxHeight: number) {
        super();
        const skin = theme.skin.dialogues && theme.skin.dialogues[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no dialogue "${variant}".`);
        }
        this.skin = skin;
        this.measure = CreateMeasure(theme, skin.bodyFont);
        this.frame = new NineSlice(theme.Texture(skin.frame.frame), skin.frame, BoxWidth, BoxHeight);
        const portraitBox = this.PortraitFrameSize;
        this.portraitFrame = new NineSlice(theme.Texture(skin.portraitFrame.frame), skin.portraitFrame, portraitBox, portraitBox);
        this.nameFrame = skin.nameFrame ? new NineSlice(theme.Texture(skin.nameFrame.frame), skin.nameFrame, 1, skin.nameHeight || 16) : null;
        this.speakerName = CreateText(theme, "", { font: skin.nameFont, colour: skin.nameColour });
        this.body = CreateText(theme, "", { font: skin.bodyFont, colour: skin.bodyColour });
        this.arrow = new Sprite(theme.Texture(skin.arrow));
        this.arrow.visible = false;
        this.addChild(this.frame, this.portraitFrame, this.portrait);
        if (this.nameFrame) this.addChild(this.nameFrame);
        this.addChild(this.speakerName, this.body, this.arrow);
        this.SetHitSize(BoxWidth, BoxHeight);
        this.Redraw();
    }

    /** The portrait's frame's size: the picture's box, and the padding round it when the frame stands beside the box. */
    private get PortraitFrameSize(): number {
        return this.skin.portraitSize + (this.skin.portraitBeside ? (this.skin.portraitPadding || 0) * 2 : 0);
    }

    /** Starts a line: clears what was said and begins typing this. */
    Say(line: Line): void {
        const skin = this.skin;
        const pad = skin.padding;
        const hasPortrait = !!line.portrait;
        if (line.portrait) {
            this.portrait.texture = line.portrait;
        }
        const scale = Math.max(1, Math.floor(line.portraitScale || 1));
        this.portrait.scale.set(scale);
        this.portrait.visible = this.portraitFrame.visible = hasPortrait;

        // The box, and the portrait: beside the box (bottom-aligned, the box tucked under its edge) or inside it.
        const beside = hasPortrait && !!skin.portraitBeside;
        const frameSize = this.PortraitFrameSize;
        this.boxLeft = beside ? frameSize - (skin.portraitOverlap || 0) : 0;
        this.frame.position.set(this.boxLeft, 0);
        this.frame.Resize(this.BoxWidth - this.boxLeft, this.BoxHeight);
        this.portraitFrame.position.set(beside ? 0 : pad.left, beside ? this.BoxHeight - frameSize : pad.top);
        // The picture sits inside its frame, centred, at its own size (whole pixels, so it stays crisp).
        const inner = { x: this.portraitFrame.x + (frameSize - skin.portraitSize) / 2, y: this.portraitFrame.y + (frameSize - skin.portraitSize) / 2 };
        this.portrait.position.set(Math.floor(inner.x + (skin.portraitSize - this.portrait.texture.width * scale) / 2), Math.floor(inner.y + (skin.portraitSize - this.portrait.texture.height * scale) / 2));

        const left = this.boxLeft + pad.left + (hasPortrait && !beside ? skin.portraitSize + skin.gap : 0);
        const width = this.BoxWidth - left - pad.right;
        let top = pad.top;
        this.speakerName.text = line.speaker || "";
        this.speakerName.visible = !!line.speaker;
        if (this.nameFrame) {
            // On a plate across the box's top edge, the name in the middle of it.
            this.nameFrame.visible = !!line.speaker;
            const plateWidth = Math.ceil(this.speakerName.textWidth) + (skin.namePadding || 0) * 2;
            const plateHeight = skin.nameHeight || 16;
            this.nameFrame.Resize(plateWidth, plateHeight);
            this.nameFrame.position.set(this.boxLeft + (skin.nameInset || 0), -(skin.nameOffset || 0));
            this.speakerName.position.set(
                this.nameFrame.x + Math.floor((this.nameFrame.SliceWidth - this.speakerName.textWidth) / 2),
                this.nameFrame.y + Math.floor((plateHeight - this.speakerName.textHeight) / 2) - (skin.nameRaise || 0)
            );
        } else {
            this.speakerName.position.set(left, top);
            if (line.speaker) {
                top += Math.ceil(this.speakerName.textHeight) + this.theme.Metric("lineGap", 4);
            }
        }
        this.wrapped = WrapText(line.text, width, this.measure);
        this.body.text = "";
        this.body.position.set(left, top);
        this.typewriter = new Typewriter(this.wrapped.length, skin.charactersPerSecond);
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
            this.arrow.y = this.BoxHeight - pad.bottom - this.arrow.texture.height + (Math.floor(this.clock / ARROW_BOB_MS) % 2) * this.theme.Metric("bob", 2);
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
