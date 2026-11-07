import {BitmapText, Container, Graphics, Sprite, Texture} from "pixi.js";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import UiTheme from "@logic-incubator/ui/UiTheme";
import UiItemSlot from "@logic-incubator/ui/widgets/UiItemSlot";
import UiProgressBar from "@logic-incubator/ui/widgets/UiProgressBar";
import {CreateMeasure, CreateText} from "@logic-incubator/ui/widgets/UiText";
import {LoopFrame, PoseRates} from "../level/entities/CharacterAnimations";
import type {Experience} from "../level/entities/Experience";
import type {Health} from "../level/entities/Health";
import {HeroAnimationSpeed} from "./HeroView";
import {FitScale, TextureOf} from "./HudArt";
import {CutToFit, OutOf} from "./HudModel";

const GoldIcon = "coin_anim";
/** The skin's heart, drawn at half its size - the kit's art is the pack's doubled, so that's the pack's own pixels. */
const SkinHeart = "icon_heart_full";
/** The skin's bars hit points and experience are shown with. */
const HealthBar = "hp";
const ExperienceBar = "xp";
/** The boxes the heart, the coin and the XP label are fitted into. */
const IconBox = 18;
const IconGap = 4;
/** Room between the portrait and the text beside it, and between a bar and its numbers. */
const Gap = 10;
const NumberGap = 6;
/** Room between the portrait and the bars under it (`compact: false`), and between the bars. */
const BarsTop = 8;
const BarGap = 6;
/** How far in from the portrait frame's edge the picture shows. */
const PortraitInset = 3;
/** Room between the top of the frame and the top of the hero's head. */
const HeadRoom = 4;

/**
 * How a header is laid out: its width, the portrait's size and how many times as big the hero is drawn in it, and
 * whether it's compact - a party's row: the bars beside the portrait, under the name, and the level by the XP bar -
 * or not: the name with the level under it beside the portrait, and the bars across the whole width under it.
 */
export type HudHeaderLayout = {
    width: number;
    portrait: number;
    portraitScale: number;
    compact: boolean;
};

/** Who a header is for: the name at its top and the animation their portrait plays. */
export type HudHeroInfo = {
    name: string;
    /** An animation (or sprite) name from the sprite sheet - their idle animation. */
    portrait: string | null;
    /** The player at this machine, among others who aren't - online, where each sees their own name stand out. */
    own: boolean;
};

/** One of the header's bars: its icon or label, the bar, and the numbers after it. */
type BarRow = {
    kind: string;
    bar: UiProgressBar | null;
    numbers: BitmapText;
    y: number;
};

/**
 * The top of a hero's part of the HUD: their portrait - their idle animation, enlarged in a frame and cut off below -
 * with their name and level, their gold in the top-right, and two bars: hit points ("5 / 6") and experience toward
 * the next level ("120 / 200", or "LV 3" when compact). `hearts` is the game's own full heart (see
 * `PlayerSetup.hearts`) for the hit points' icon - the skin's otherwise. Redrawn only where something changed.
 */
export default class HudHeader extends Container {
    private readonly portrait = new Sprite(Texture.EMPTY);
    private portraitFrames: Texture[] = [];
    private portraitName: string | null = "";
    private portraitTime = 0;
    private readonly title: BitmapText;
    private readonly level: BitmapText;
    private readonly goldIcon = new Sprite(Texture.EMPTY);
    private readonly goldText: BitmapText;
    private readonly health: BarRow;
    private readonly experience: BarRow;
    private readonly measure: (text: string) => number;
    private readonly textX: number;
    /** Where the bars' icons start across. */
    private readonly barsX: number;
    /** The room the bars' numbers are given - the widest they can be at the hero's most hit points and level. */
    private numbersRoom = -1;
    private shown = {gold: -1, health: "", experience: "", name: "", own: false};

    constructor(private readonly theme: UiTheme, private readonly layout: HudHeaderLayout, hearts?: Texture) {
        super();
        const size = layout.portrait;
        const frame = new UiItemSlot(theme, "default", size);
        frame.interactive = frame.interactiveChildren = false;
        const mask = new Graphics().beginFill(0xffffff).drawRect(PortraitInset, PortraitInset, size - PortraitInset * 2, size - PortraitInset * 2).endFill();
        this.portrait.mask = mask;
        this.portrait.scale.set(layout.portraitScale);
        this.addChild(frame, this.portrait, mask);

        this.textX = size + Gap;
        this.title = CreateText(theme, "", {font: "heading", colour: "title"});
        this.title.position.set(this.textX, layout.compact ? 0 : 4);
        this.level = CreateText(theme, "", {colour: "muted"});
        this.level.position.set(this.textX, this.title.y + theme.FontSize("heading") + 4);
        this.level.visible = !layout.compact;
        this.addChild(this.title, this.level);

        this.goldText = CreateText(theme, "0", {colour: "text"});
        this.goldText.y = this.title.y;
        this.goldIcon.anchor.set(0.5);
        this.goldIcon.y = this.title.y + Math.round(IconBox / 2);
        this.addChild(this.goldIcon, this.goldText);

        // Compact, the bars are under the name, beside the portrait, the second at its foot; else across the whole width under it.
        this.barsX = layout.compact ? this.textX : 0;
        const healthY = layout.compact ? size - this.BarHeight(ExperienceBar) - 2 - this.BarHeight(HealthBar) : size + BarsTop;
        const experienceY = layout.compact ? size - this.BarHeight(ExperienceBar) : healthY + this.BarHeight(HealthBar) + BarGap;
        this.health = this.BarRow(HealthBar, healthY);
        this.experience = this.BarRow(ExperienceBar, experienceY);

        const heart = new Sprite(hearts || theme.Texture(SkinHeart));
        heart.anchor.set(0.5);
        heart.scale.set(hearts ? FitScale(hearts, IconBox) : 0.5);
        heart.position.set(this.barsX + IconBox / 2, healthY + Math.round(this.BarHeight(HealthBar) / 2));
        const xp = CreateText(theme, "XP", {colour: "good"});
        xp.position.set(this.barsX, this.experience.numbers.y);
        this.addChild(heart, xp);
        this.measure = CreateMeasure(theme);
    }

    /** How tall it is: the portrait, and - not compact - the bars under it. */
    get HeaderHeight(): number {
        return this.experience.y + this.BarHeight(ExperienceBar);
    }

    /** Who it's for - drawn again only when something in it changed. */
    SetHero(info: HudHeroInfo): void {
        const name = info.name.toUpperCase();
        if (name !== this.shown.name || info.own !== this.shown.own) {
            this.shown.name = name;
            this.shown.own = info.own;
            this.title.tint = this.theme.Colour(info.own ? "focus" : "title");
            this.FitName();
        }
        if (info.portrait !== this.portraitName) {
            this.portraitName = info.portrait;
            this.portraitFrames = this.FramesOf(info.portrait);
            this.portraitTime = 0;
            this.PlacePortrait();
        }
    }

    /** Moves their portrait's idle animation on by `seconds`. */
    Animate(seconds: number): void {
        const frames = this.portraitFrames;
        if (frames.length < 2) {
            return;
        }
        this.portraitTime += seconds * 60;
        this.portrait.texture = frames[LoopFrame(frames.length, this.portraitTime, HeroAnimationSpeed * PoseRates.idle)];
    }

    Render(health: Health, gold: number, experience: Experience): void {
        this.RenderGold(gold);
        const healthText = OutOf(health.hitPoints, health.max);
        const experienceText = this.layout.compact ? "LV " + experience.level : OutOf(experience.xp, experience.next);
        if (healthText === this.shown.health && experienceText === this.shown.experience) {
            return;
        }
        this.shown.health = healthText;
        this.shown.experience = experienceText;
        this.level.text = "LEVEL " + experience.level;
        // As long as leaves room for the wider numbers at their longest - laid out again when that changes, with a level or more hit points.
        const widest = this.layout.compact ? experienceText : OutOf(experience.next, experience.next);
        const room = Math.ceil(Math.max(this.measure(OutOf(health.max, health.max)), this.measure(widest)));
        if (room !== this.numbersRoom) {
            this.numbersRoom = room;
            this.LayOutBars(room);
        }
        this.ShowBar(this.health, healthText, health.max > 0 ? health.hitPoints / health.max : 0);
        this.ShowBar(this.experience, experienceText, experience.next > 0 ? experience.xp / experience.next : 0);
    }

    destroy(options?: {children?: boolean; texture?: boolean; baseTexture?: boolean}): void {
        super.destroy({children: true, ...options});
    }

    private BarHeight(kind: string): number {
        const skin = this.theme.skin.bars[kind];
        return skin ? skin.height : IconBox;
    }

    private BarRow(kind: string, y: number): BarRow {
        const numbers = CreateText(this.theme, "", {colour: "text"});
        numbers.y = Math.round(y + (this.BarHeight(kind) - this.theme.FontSize("body")) / 2) + 1;
        this.addChild(numbers);
        return {kind, bar: null, numbers, y};
    }

    /** Each bar from beside its icon to `room` short of the right edge, where its numbers go. */
    private LayOutBars(room: number): void {
        const x = this.barsX + IconBox + IconGap;
        const width = Math.max(24, this.layout.width - x - NumberGap - room);
        [this.health, this.experience].forEach(row => {
            if (row.bar) {
                row.bar.destroy();
                row.bar = null;
            }
            if (this.theme.skin.bars[row.kind]) {
                row.bar = new UiProgressBar(this.theme, row.kind, width, 0);
                row.bar.position.set(x, row.y);
                this.addChild(row.bar);
            }
        });
    }

    private ShowBar(row: BarRow, text: string, fraction: number): void {
        row.numbers.text = text;
        row.numbers.x = Math.round(this.layout.width - row.numbers.textWidth);
        if (row.bar) {
            row.bar.Value = fraction;
        }
    }

    private RenderGold(amount: number): void {
        if (amount === this.shown.gold) {
            return;
        }
        this.shown.gold = amount;
        this.goldText.text = String(amount);
        this.goldText.x = Math.round(this.layout.width - this.goldText.textWidth);
        const texture = TextureOf(GoldIcon);
        this.goldIcon.visible = !!texture;
        if (texture) {
            this.goldIcon.texture = texture;
            this.goldIcon.scale.set(FitScale(texture, IconBox));
            this.goldIcon.x = Math.round(this.goldText.x - IconGap - IconBox / 2);
        }
        this.FitName();
    }

    /** Keeps a long name clear of the gold: cut short, with "..", where they'd meet. */
    private FitName(): void {
        const room = (this.goldIcon.visible ? this.goldIcon.x - IconBox / 2 : this.goldText.x) - Gap - this.textX;
        this.title.text = CutToFit(this.shown.name, room, this.measure);
    }

    /** The frames of an animation (or a sprite, as one frame) - none, with a warning, for a name the sprite sheet hasn't. */
    private FramesOf(name: string | null): Texture[] {
        if (!name) {
            return [];
        }
        if (!AssetFactory.inst.Has(name)) {
            AssetFactory.inst.WarnMissing(name);
            return [];
        }
        return AssetFactory.inst.CreateTextures(name);
    }

    /**
     * Their first frame in the frame: centred across, and with the top of their head (where their picture's trimmed
     * art starts) just under the frame's top edge, so the frame cuts them off below.
     */
    private PlacePortrait(): void {
        const first = this.portraitFrames[0];
        this.portrait.visible = !!first;
        if (!first) {
            return;
        }
        this.portrait.texture = first;
        const scale = this.layout.portraitScale;
        const top = first.trim ? first.trim.y : 0;
        this.portrait.position.set(Math.round((this.layout.portrait - first.orig.width * scale) / 2), PortraitInset + HeadRoom - top * scale);
    }
}
