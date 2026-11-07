import {Container, Graphics} from "pixi.js";
import UiTheme from "@logic-incubator/ui/UiTheme";
import {WrapText} from "@logic-incubator/ui/widgets/Typewriter";
import UiItemSlot from "@logic-incubator/ui/widgets/UiItemSlot";
import {CreateMeasure, CreateText} from "@logic-incubator/ui/widgets/UiText";
import type QuestLog from "../story/Quests";
import {CutToFit, JournalLine, JournalLines} from "./HudModel";
import HudSection from "./HudSection";

/** The book beside the list: a frame of the skin's, with its quests icon in. */
const BookIcon = "icon_quests";
const BookFrame = 56;
const BookGap = 10;
/** The box a quest under way is marked with, ticked once it's done, and the "!" of the one being followed. */
const MarkBox = 14;
const MarkWidth = 22;
const LineGap = 4;
const QuestGap = 8;
/** The skin's colour for the quest being followed - its "!", name and notes (amber in the kit's skin); `title` in a skin without it. */
const FollowColour = "note";

/**
 * The HUD's quest journal: a section with a book, and beside it the level's quests (see `JournalLines`) - the one being
 * followed marked "!", with what to do and its last note under it; the rest under way with an empty box, and those done
 * with a ticked one - as many as fit, then how many more there are. Drawn again only when the log changes.
 */
export default class HudJournal extends Container {
    private readonly section: HudSection;
    private readonly list = new Container();
    private readonly measure: (text: string) => number;
    private readonly listWidth: number;
    private readonly listHeight: number;
    private readonly followColour: string;
    private shown = "";

    constructor(private readonly theme: UiTheme, width: number, height: number) {
        super();
        this.section = new HudSection(theme, "QUEST JOURNAL", width, height);
        this.addChild(this.section);
        const content = this.section.content;
        let left = 0;
        if (theme.HasTexture(BookIcon)) {
            const frame = new UiItemSlot(theme, "default", BookFrame);
            frame.SetItem({texture: theme.Texture(BookIcon)});
            frame.interactiveChildren = frame.interactive = false;
            content.addChild(frame);
            left = BookFrame + BookGap;
        }
        this.list.x = left;
        content.addChild(this.list);
        this.listWidth = this.section.InnerWidth - left;
        this.listHeight = height - content.y - 12;
        this.measure = CreateMeasure(theme);
        this.followColour = theme.skin.colours[FollowColour] !== undefined ? FollowColour : "title";
    }

    /** Shows how `log` stands; `following` is the id of the quest being followed (see `JournalLines`). */
    Render(log: QuestLog, following: string | null): void {
        const lines = JournalLines(log.Quests, following);
        const signature = JSON.stringify(lines);
        if (signature === this.shown) {
            return;
        }
        this.shown = signature;
        this.list.removeChildren().forEach(child => (child as Container).destroy({children: true}));
        let y = 0;
        let shownCount = 0;
        for (let i = 0; i < lines.length; i++) {
            // The first is always shown, cut to the room there is if need be; the rest only whole.
            const quest = this.DrawQuest(lines[i], i === 0 ? this.listHeight : Infinity);
            const more = lines.length - i - 1;
            // Room for this one, and - if any come after it - for the line saying how many.
            const needed = y + quest.height + (more ? LineGap + this.theme.FontSize("body") : 0);
            if (i > 0 && needed > this.listHeight) {
                quest.destroy();
                break;
            }
            quest.y = y;
            this.list.addChild(quest);
            y += quest.height + QuestGap;
            shownCount++;
        }
        if (shownCount < lines.length) {
            const more = CreateText(this.theme, "+" + (lines.length - shownCount) + " MORE", {colour: "muted"});
            more.y = y;
            this.list.addChild(more);
        }
        if (!lines.length) {
            this.list.addChild(CreateText(this.theme, "NO QUESTS YET", {colour: "muted"}));
        }
    }

    destroy(options?: {children?: boolean; texture?: boolean; baseTexture?: boolean}): void {
        super.destroy({children: true, ...options});
    }

    /**
     * One quest: its mark, its name (wrapped) and progress, and - for the one being followed - what to do and its note,
     * with as many of their lines as fit in `room`; the last one shown is cut short ("..") if any after it aren't.
     */
    private DrawQuest(line: JournalLine, room: number): Container {
        const quest = new Container();
        const textWidth = this.listWidth - MarkWidth;
        const followed = line.mark === "current";
        const nameColour = followed ? this.followColour : line.mark === "done" ? "muted" : "text";
        const progress = line.progress ? "  " + line.progress : "";
        quest.addChild(this.Mark(line));
        let y = -LineGap;
        // Adds `text`, wrapped, below what's there - as many of its lines as fit; returns whether they all did.
        const add = (text: string, colour: string): boolean => {
            const wrapped = WrapText(text, textWidth, this.measure).split("\n");
            for (let count = wrapped.length; count > 0; count--) {
                const kept = wrapped.slice(0, count);
                if (count < wrapped.length) {
                    kept[count - 1] = CutToFit(kept[count - 1] + " " + wrapped[count], textWidth, this.measure);
                }
                const label = CreateText(this.theme, kept.join("\n"), {colour});
                // The first line goes in whatever the room, so the quest is never shown without its name.
                if (y + LineGap + label.textHeight <= room || (y < 0 && count === 1)) {
                    label.position.set(MarkWidth, y + LineGap);
                    quest.addChild(label);
                    y += LineGap + Math.ceil(label.textHeight);
                    return count === wrapped.length;
                }
                label.destroy();
            }
            return false;
        };
        const whole = add(line.name.toUpperCase() + progress, nameColour);
        if (whole && followed && line.text && add(line.text, "muted") && line.note) {
            add(line.note, this.followColour);
        }
        return quest;
    }

    /** A "!" for the quest being followed; a box for the rest, ticked once done. */
    private Mark(line: JournalLine): Container {
        if (line.mark === "current") {
            const bang = CreateText(this.theme, "!", {font: "heading", colour: this.followColour});
            bang.x = Math.round((MarkBox - bang.textWidth) / 2);
            return bang;
        }
        const box = new Graphics();
        const top = Math.round((this.theme.FontSize("body") - MarkBox) / 2);
        box.lineStyle(2, this.theme.Colour("muted"), 1, 0).drawRect(0, top, MarkBox, MarkBox);
        if (line.mark === "done") {
            // A tick, in whole pixels: down to the bottom, then up to the top-right.
            box.lineStyle(0).beginFill(this.theme.Colour("good"));
            [[3, 7], [5, 9], [7, 7], [9, 5], [11, 3]].forEach(([x, y]) => box.drawRect(x, top + y, 2, 2));
            box.drawRect(4, top + 8, 2, 2).drawRect(6, top + 8, 2, 2).endFill();
        }
        return box;
    }
}
