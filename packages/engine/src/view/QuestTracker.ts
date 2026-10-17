import { BitmapText, Container, Graphics } from "pixi.js";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import UiLayer from "@logic-incubator/ui/UiLayer";
import UiToastHost from "@logic-incubator/ui/widgets/UiToastHost";
import { CreateText } from "@logic-incubator/ui/widgets/UiText";
import { PlayWidth } from "../Constants";
import { QUEST_UPDATED } from "../Events";
import QuestLog, { QuestState, QuestStatus } from "../story/Quests";

/** Room round the tracker and the toasts, in UI pixels. */
const Margin = 16;
/** Where the list starts down the corner: clear of the frame-rate panel a development build puts over the page's top-left. */
const ListTop = 60;
const Pad = 8;
const RowGap = 2;
const QuestGap = 8;
const ShadeAlpha = 0.55;

/**
 * The level's quests, over the play area: the ones under way and done, in the top-left corner - each one's name, how
 * far it's got ("2/3", or DONE once its goal is met) and what to do - and a toast in the top-right as each is given or
 * met, and for the level's own quests as it starts. `DungeonMain` shows it the world's log (`Render`) every frame,
 * and tells it as a level starts (`Begin`). It only shows things - nothing in it takes the pointer.
 */
export default class QuestTracker extends GameComponent {
    private layer!: UiLayer;
    private list!: Container;
    private shade!: Graphics;
    private toasts!: UiToastHost;
    private shownVersion = -1;
    private shownLog: QuestLog | null = null;

    protected OnInitialise(): void {
        this.layer = this.Attach(new UiLayer({ input: false }));
        const theme = this.layer.Theme;
        this.shade = new Graphics();
        this.list = new Container();
        this.list.position.set(Margin, ListTop);
        this.toasts = new UiToastHost(theme, "default");
        this.toasts.position.set(Math.round(PlayWidth / theme.Scale) - this.toasts.HostWidth - Margin, Margin);
        this.layer.root.addChild(this.list, this.toasts);
        this.list.addChild(this.shade);
        this.Tick(() => this.toasts.Update(this.game.ticker.deltaMS));
        this.Listen(this.game.dispatcher, QUEST_UPDATED, (id: string, state: QuestState, _progress: number, was: QuestState) => this.Toast(id, state, was));
    }

    /** A level has started with these quests: a toast for each under way from the start - the level's own. */
    Begin(log: QuestLog): void {
        this.shownLog = log;
        this.shownVersion = -1;
        log.Quests.forEach(quest => {
            if (quest.state === "active") {
                this.toasts.Push({ title: "QUEST", text: quest.def.name, kind: "good" });
            }
        });
    }

    /** Shows how `log` stands - drawn again only when it has changed. */
    Render(log: QuestLog): void {
        if (log === this.shownLog && log.Version === this.shownVersion) {
            return;
        }
        this.shownLog = log;
        this.shownVersion = log.Version;
        const theme = this.layer.Theme;
        this.list.removeChildren().forEach(child => child !== this.shade && child.destroy());
        this.list.addChild(this.shade);
        this.shade.clear();
        let y = Pad;
        let width = 0;
        const add = (text: BitmapText, x: number) => {
            text.position.set(Pad + x, y);
            this.list.addChild(text);
            width = Math.max(width, x + text.textWidth);
            return Math.ceil(text.textHeight);
        };
        const shown = log.Quests.filter(quest => quest.state === "active" || quest.state === "complete");
        shown.forEach((quest, i) => {
            if (i) {
                y += QuestGap;
            }
            const name = CreateText(theme, quest.def.name, { colour: quest.state === "complete" ? "good" : "title" });
            const height = add(name, 0);
            add(CreateText(theme, Progress(quest), { colour: quest.state === "complete" ? "good" : "muted" }), name.textWidth + 12);
            y += height + RowGap;
            if (quest.def.text) {
                y += add(CreateText(theme, quest.def.text, { colour: "muted" }), 0) + RowGap;
            }
        });
        if (shown.length) {
            this.shade.beginFill(theme.Colour("ink"), ShadeAlpha).drawRect(0, 0, width + Pad * 2, y + Pad - RowGap).endFill();
        }
    }

    private Toast(id: string, state: QuestState, was: QuestState): void {
        const quest = this.shownLog && this.shownLog.Get(id);
        const name = quest ? quest.def.name : id;
        if (state === "active" && was === "none") {
            this.toasts.Push({ title: "NEW QUEST", text: name, kind: "good" });
        } else if (state === "complete" && was !== "complete") {
            this.toasts.Push({ title: "QUEST COMPLETE", text: name, kind: "good" });
        }
    }
}

/** How far a quest has got, as the tracker says it: DONE, or "2/3" - nothing for one it's all or nothing for. */
function Progress(quest: Readonly<QuestStatus>): string {
    if (quest.state === "complete") {
        return "DONE";
    }
    return quest.target > 1 ? quest.progress + "/" + quest.target : "";
}
