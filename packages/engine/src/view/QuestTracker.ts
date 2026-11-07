import GameComponent from "@logic-incubator/lib/game/GameComponent";
import UiLayer from "@logic-incubator/ui/UiLayer";
import UiToastHost from "@logic-incubator/ui/widgets/UiToastHost";
import { PlayWidth } from "../Constants";
import { QUEST_NOTED, QUEST_UPDATED } from "../Events";
import QuestLog, { QuestNoteSeconds, QuestState } from "../story/Quests";

/** Room round the toasts, in UI pixels. */
const Margin = 16;
/** The skin's toast kind for a quest's note - the kit's skin has it; another skin without it gets a `good` toast. */
const NoteToast = "note";

/**
 * Toasts for the level's quests, in the top-right corner of the play area: one as each is given or met, for each note
 * a dialog gives one (`notify`), and for the level's own quests as it starts. The quests themselves are listed in the
 * HUD's journal (see `HudJournal`). `DungeonMain` tells it as a level starts (`Begin`). It only shows things - nothing
 * in it takes the pointer.
 */
export default class QuestTracker extends GameComponent {
    private layer!: UiLayer;
    private toasts!: UiToastHost;
    private shownLog: QuestLog | null = null;
    private noteToast = "good";

    protected OnInitialise(): void {
        this.layer = this.Attach(new UiLayer({ input: false }));
        const theme = this.layer.Theme;
        this.toasts = new UiToastHost(theme, "default");
        this.toasts.position.set(Math.round(PlayWidth / theme.Scale) - this.toasts.HostWidth - Margin, Margin);
        this.layer.root.addChild(this.toasts);
        const skin = theme.skin;
        if (skin.toasts && skin.toasts.default && skin.toasts.default.kinds[NoteToast]) {
            this.noteToast = NoteToast;
        }
        this.Tick(() => this.toasts.Update(this.game.ticker.deltaMS));
        this.Listen(this.game.dispatcher, QUEST_UPDATED, (id: string, state: QuestState, _progress: number, was: QuestState) => this.Toast(id, state, was));
        this.Listen(this.game.dispatcher, QUEST_NOTED, (id: string, text: string) => this.Note(id, text));
    }

    /** A level has started with these quests: a toast for each under way from the start - the level's own. */
    Begin(log: QuestLog): void {
        this.shownLog = log;
        log.Quests.forEach(quest => {
            if (quest.state === "active") {
                this.toasts.Push({ title: "QUEST", text: quest.def.name, kind: "good" });
            }
        });
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

    /** A dialog gave a quest a note: a toast headed with the quest's name, up for long enough to read. */
    private Note(id: string, text: string): void {
        const quest = this.shownLog && this.shownLog.Get(id);
        this.toasts.Push({ title: quest ? quest.def.name : id, text, kind: this.noteToast, seconds: QuestNoteSeconds(text) });
    }
}
