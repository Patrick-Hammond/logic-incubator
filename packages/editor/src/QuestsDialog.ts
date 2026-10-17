import { DefaultQuest, QuestDef } from "@logic-incubator/engine/story/Quests";
import { MonsterImage } from "./DataBrushDialog";
import { DescribeQuest, NewQuestId, QuestFields, QuestFromForm, QuestProblem, QuestToForm } from "./QuestEditor";
import { InjectFormStyles, IsFormDialogOpen, OpenFormDialog } from "./ui/dialog/FormDialog";
import { ButtonEl, El, InjectStyles } from "./ui/dom/Dom";

let openList: HTMLElement | null = null;

/** Whether the quest list is open. */
export function IsQuestsDialogOpen(): boolean {
    return openList !== null;
}

/**
 * The level's quests, in a popup over the editor: one row each, with Edit (its `FormDialog`, see `QuestEditor`) and
 * Remove, and Add quest under them. Resolves with the list as it was left on Save - one undo step for the lot - or null
 * if cancelled (Cancel or Escape), nothing changed, or a dialog is already open. Looks like the `FormDialog`'s, and
 * like it keeps its key presses from the editor's shortcuts; a click outside does nothing, so a stray one loses no edits.
 */
export function OpenQuestsDialog(quests: ReadonlyArray<QuestDef>): Promise<QuestDef[] | null> {
    if (openList || IsFormDialogOpen()) {
        return Promise.resolve(null);
    }
    InjectFormStyles();
    InjectStyles("qd-styles", STYLES);

    return new Promise(resolve => {
        let list = quests.slice();
        let changed = false;
        const overlay = El("div", "fd-overlay");
        const panel = El("div", "fd-panel");
        panel.tabIndex = -1;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        panel.setAttribute("aria-label", "Quests");
        overlay.appendChild(panel);

        const header = El("div", "fd-header");
        header.appendChild(El("h2", "fd-title", "Quests"));
        header.appendChild(
            El(
                "p",
                "fd-subtitle",
                "What the level asks of its players. An NPC's script gives one (give ID); one under way from the start is the level's own. " +
                    "A pickup or boss counts for one when its popup says so."
            )
        );
        panel.appendChild(header);

        const body = panel.appendChild(El("div", "fd-body"));
        const rows = body.appendChild(El("div", "qd-rows"));
        const add = body.appendChild(ButtonEl("ed-button qd-add", "Add quest"));

        const footer = panel.appendChild(El("div", "fd-footer"));
        footer.appendChild(El("span", "fd-error"));
        const cancelButton = footer.appendChild(ButtonEl("ed-button", "Cancel"));
        const saveButton = footer.appendChild(ButtonEl("ed-button fd-primary", "Save"));

        const render = () => {
            rows.textContent = "";
            if (!list.length) {
                rows.appendChild(El("p", "qd-empty", "No quests yet."));
            }
            list.forEach((quest, index) => {
                const row = rows.appendChild(El("div", "qd-row"));
                const info = row.appendChild(El("div", "qd-info"));
                info.appendChild(El("div", "qd-name", quest.name || quest.id));
                info.appendChild(El("div", "qd-detail", DescribeQuest(quest)));
                row.appendChild(ButtonEl("ed-button", "Edit", `Edit “${quest.name}”`)).addEventListener("click", () => edit(index));
                row.appendChild(ButtonEl("ed-button", "Remove", `Take “${quest.name}” off the level`)).addEventListener("click", () => {
                    list = list.filter((_, i) => i !== index);
                    changed = true;
                    render();
                    panel.focus();
                });
            });
        };

        /** Edits quest `index` - or a new one, added to the end on Save, for `index` past the end. */
        const edit = (index: number) => {
            const was = index < list.length ? list[index] : DefaultQuest(NewQuestId(list));
            const others = list.filter((_, i) => i !== index);
            OpenFormDialog({
                title: index < list.length ? "Quest" : "New quest",
                subtitle: "What it's called, and what meets it.",
                fields: QuestFields({ monster: MonsterImage }),
                values: QuestToForm(was),
                validate: form => QuestProblem(form, others)
            }).then(form => {
                if (form) {
                    const quest = QuestFromForm(form, was);
                    list = index < list.length ? list.map((old, i) => (i === index ? quest : old)) : list.concat([quest]);
                    changed = true;
                    render();
                }
                panel.focus();
            });
        };

        const close = (result: QuestDef[] | null) => {
            overlay.remove();
            openList = null;
            resolve(result);
        };

        add.addEventListener("click", () => edit(list.length));
        cancelButton.addEventListener("click", () => close(null));
        saveButton.addEventListener("click", () => close(changed ? list : null));
        overlay.addEventListener("pointerdown", e => {
            if (e.target === overlay) {
                // Keeps the focus in the panel, so the editor's shortcuts don't get the next key.
                e.preventDefault();
                panel.focus();
            }
        });
        overlay.addEventListener("keydown", e => {
            e.stopPropagation();
            if (e.key === "Escape") {
                e.preventDefault();
                close(null);
            }
        });
        overlay.addEventListener("contextmenu", e => e.stopPropagation());

        render();
        document.body.appendChild(overlay);
        openList = overlay;
        panel.focus();
    });
}

const STYLES = `
.qd-rows { display: flex; flex-direction: column; }
.qd-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--ed-divider-soft); }
.qd-info { flex: 1; min-width: 0; }
.qd-name { font-weight: bold; color: var(--ed-text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qd-detail { font-size: 12px; color: var(--ed-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qd-empty { margin: 10px 0; color: var(--ed-faint); }
.qd-add { margin: 10px 0 6px; }
`;
