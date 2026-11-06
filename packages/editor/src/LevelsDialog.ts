import { LoadTextFile, SaveTextFile, ShowOpenFileDialog } from "@logic-incubator/lib/io/Storage";
import {
    CleanLevelName,
    DescribeSavedAt,
    DescribeSize,
    IsLevelFile,
    LevelFileName,
    LevelNameFromFile,
    MaxLevelNameLength,
    NamedLevel,
    NamedLevels,
    StorageBudget
} from "./NamedLevels";
import { IsQuestsDialogOpen } from "./QuestsDialog";
import { EditorSave, OpenEditorSave } from "./SavedLevel";
import { InjectFormStyles, IsFormDialogOpen } from "./ui/dialog/FormDialog";
import { ButtonEl, El, InjectStyles } from "./ui/dom/Dom";

/** What Save did: kept the level in the browser, or downloaded it - `save` as it went, named `name` ("" for a file downloaded without one). */
export type SavedLevelChoice = { name: string; save: EditorSave; to: "browser" | "file" };
/** The level Load picked, brought up to date (see `OpenEditorSave`), and the name it goes by - from the browser, or a file. */
export type OpenedLevel = { name: string; save: EditorSave; from: "browser" | "file" };

let openDialog: HTMLElement | null = null;

/** Whether the Save or Load popup is up. */
export function IsLevelsDialogOpen(): boolean {
    return openDialog !== null;
}

/** What a file picker offers for a level: the JSON the editor downloads, or the `.txt` it used to. */
const LevelFileTypes = ".json,.txt,application/json,text/plain";

/**
 * Save (S): names the level and keeps it in the browser (see `NamedLevels`), or downloads it as a file. Its levels are listed
 * under the name - a click on one takes its name, to save over it - with Delete, to make room when the storage is full. Resolves
 * with what was done, or null if cancelled (Cancel, Escape, a click outside) or a popup is already open. A save the browser
 * refuses keeps the popup up, saying why.
 */
export function OpenSaveLevelDialog(levels: NamedLevels, save: EditorSave): Promise<SavedLevelChoice | null> {
    const shell = OpenShell("Save level", "Keep it in this browser under a name - several levels can be kept - or download it as a file.");
    if (!shell) {
        return Promise.resolve(null);
    }
    const { body, footer, message } = shell;

    return new Promise(resolve => {
        const nameRow = body.appendChild(El("div", "fd-field ld-name"));
        const label = nameRow.appendChild(El("label", "fd-label", "Name"));
        label.htmlFor = "ld-name";
        const input = nameRow.appendChild(document.createElement("input"));
        input.type = "text";
        input.id = "ld-name";
        input.maxLength = MaxLevelNameLength;
        input.placeholder = "The Sunken Crypt";
        input.spellcheck = false;
        input.value = save.editorData.levelName || "";

        const listHeader = body.appendChild(El("div", "ld-list-header"));
        listHeader.appendChild(El("span", "ld-list-title", "In this browser"));
        const usage = listHeader.appendChild(El("span", "ld-usage"));
        const rows = body.appendChild(El("div", "ld-rows ld-pick"));

        const download = footer.appendChild(ButtonEl("ed-button", "Download file", "Download the level as a .json file - to keep, share, or ship as a game level"));
        const cancel = footer.appendChild(ButtonEl("ed-button", "Cancel"));
        const confirmButton = footer.appendChild(ButtonEl("ed-button fd-primary", "Save"));

        let failure = "";
        // Read when the list is drawn, not on every key typed: listing reads every level kept.
        let listed: NamedLevel[] = [];
        const named = (): EditorSave => ({ ...save, editorData: { ...save.editorData, levelName: CleanLevelName(input.value) } });

        const refresh = () => {
            const name = CleanLevelName(input.value);
            const existing = listed.find(level => level.name === name);
            confirmButton.textContent = existing ? "Replace" : "Save";
            confirmButton.disabled = !levels.Available || !name;
            Array.from(rows.children).forEach(row => row.classList.toggle("ld-current", (row as HTMLElement).dataset.name === name));
            if (failure) {
                SetMessage(message, failure, true);
            } else if (!levels.Available) {
                SetMessage(message, "This browser isn't letting the editor keep anything (a private window, or site data turned off) - download the level instead.", true);
            } else if (existing) {
                SetMessage(message, existing.unreadable ? "Replaces what's saved under that name." : `Replaces the one saved ${DescribeSavedAt(existing.savedAt)}.`, false);
            } else {
                SetMessage(message, "", false);
            }
        };

        const render = () => {
            listed = levels.List();
            ShowUsage(usage, levels);
            FillRows(rows, listed, "Nothing saved here yet.", (level, row) => {
                row.title = `Save over “${level.name}”`;
                row.addEventListener("click", () => {
                    input.value = level.name;
                    failure = "";
                    refresh();
                    input.focus();
                });
                row.appendChild(DeleteButton(level, () => {
                    levels.Delete(level.name);
                    failure = "";
                    render();
                }));
            });
            refresh();
        };

        const close = (result: SavedLevelChoice | null) => {
            CloseShell(shell.overlay);
            resolve(result);
        };
        const keep = () => {
            if (confirmButton.disabled) {
                return;
            }
            const level = named();
            const result = levels.Save(level.editorData.levelName, level);
            if (result.ok === false) {
                failure = result.error;
                render();
                return;
            }
            close({ name: level.editorData.levelName, save: level, to: "browser" });
        };

        input.addEventListener("input", () => {
            failure = "";
            refresh();
        });
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                keep();
            }
        });
        confirmButton.addEventListener("click", keep);
        cancel.addEventListener("click", () => close(null));
        download.addEventListener("click", () => {
            const level = named();
            if (!SaveTextFile(LevelFileName(level.editorData.levelName), JSON.stringify(level))) {
                failure = "This browser can't download files.";
                refresh();
                return;
            }
            close({ name: level.editorData.levelName, save: level, to: "file" });
        });
        shell.onCancel = () => close(null);

        render();
        ShowShell(shell.overlay);
        input.focus();
        input.select();
    });
}

/**
 * Load (L): the levels kept in this browser, newest first, each with Load (or a double-click), Download (to a file, without
 * opening it) and Delete - or Load file, for a level downloaded or shipped. `editing` is the name of the editor's level, marked
 * in the list. With `unsaved` work on the map (see `HasUnsavedWork`), opening asks first. Resolves with the level, or null if
 * cancelled or a popup is already open. One that can't be opened (damaged, or from a newer editor) keeps the popup up, saying why.
 */
export function OpenLoadLevelDialog(levels: NamedLevels, editing: string, unsaved: boolean): Promise<OpenedLevel | null> {
    const shell = OpenShell("Load level", "A level kept in this browser, or a level file.");
    if (!shell) {
        return Promise.resolve(null);
    }
    const { body, footer, message } = shell;

    return new Promise(resolve => {
        const listHeader = body.appendChild(El("div", "ld-list-header"));
        listHeader.appendChild(El("span", "ld-list-title", "In this browser"));
        const usage = listHeader.appendChild(El("span", "ld-usage"));
        const rows = body.appendChild(El("div", "ld-rows"));

        const openFile = footer.appendChild(ButtonEl("ed-button", "Load file…", "Load a level file - one downloaded from the editor, or a game's level.json"));
        const cancel = footer.appendChild(ButtonEl("ed-button", "Cancel"));

        let closed = false;
        const close = (result: OpenedLevel | null) => {
            closed = true;
            CloseShell(shell.overlay);
            resolve(result);
        };
        const fail = (text: string) => SetMessage(message, text, true);
        /** Whether to go ahead and open `what` over the editor's level. */
        const mayReplace = (what: string) => !unsaved || confirm(`The level you're editing has changes that aren't saved. Load “${what}” anyway, and lose them?`);

        const open = (level: NamedLevel) => {
            const read = levels.Read(level.name);
            if (read.error !== undefined) {
                fail(`“${level.name}” can't be opened. ${read.error}`);
                return;
            }
            if (mayReplace(level.name)) {
                close({ name: level.name, save: read.save, from: "browser" });
            }
        };

        const render = () => {
            ShowUsage(usage, levels);
            const list = levels.List();
            FillRows(rows, list, levels.Available ? "No levels saved in this browser yet - save one with S." : "This browser isn't letting the editor keep anything (a private window, or site data turned off).", (level, row) => {
                if (level.name === editing) {
                    row.classList.add("ld-current");
                    row.querySelector(".ld-detail").textContent += " · open now";
                }
                if (!level.unreadable) {
                    row.addEventListener("dblclick", () => open(level));
                    row.appendChild(ButtonEl("ed-button", "Load", `Load “${level.name}” into the editor`)).addEventListener("click", () => open(level));
                    row.appendChild(ButtonEl("ed-button", "Download", `Download “${level.name}” as a file`)).addEventListener("click", () => {
                        const text = levels.FileText(level.name);
                        if (text === null || !SaveTextFile(LevelFileName(level.name), text)) {
                            fail(`“${level.name}” couldn't be downloaded.`);
                        }
                    });
                }
                row.appendChild(DeleteButton(level, () => {
                    levels.Delete(level.name);
                    SetMessage(message, "", false);
                    render();
                }));
            });
            const first = rows.querySelector<HTMLButtonElement>("button");
            (first || shell.panel).focus();
        };

        openFile.addEventListener("click", () => {
            let fileName = "";
            ShowOpenFileDialog(LevelFileTypes)
                .then(files => {
                    fileName = files[0].name;
                    return LoadTextFile(files[0]);
                })
                .then(text => {
                    if (closed) {
                        return;
                    }
                    let file: unknown;
                    try {
                        file = JSON.parse(text);
                    } catch {
                        file = null;
                    }
                    if (!IsLevelFile(file)) {
                        fail(`“${fileName}” isn't a level file.`);
                        return;
                    }
                    const opened = OpenEditorSave(file);
                    if (opened.error !== undefined) {
                        fail(`“${fileName}” can't be opened. ${opened.error}`);
                        return;
                    }
                    if (mayReplace(fileName)) {
                        close({ name: CleanLevelName(opened.save.editorData.levelName || "") || LevelNameFromFile(fileName), save: opened.save, from: "file" });
                    }
                })
                .catch(() => {
                    // No file picked, or it couldn't be read: the popup stays as it was.
                });
        });
        cancel.addEventListener("click", () => close(null));
        shell.onCancel = () => close(null);

        ShowShell(shell.overlay);
        render();
    });
}

type Shell = { overlay: HTMLElement; panel: HTMLElement; body: HTMLElement; footer: HTMLElement; message: HTMLElement; onCancel: () => void };

/**
 * The popup both share - the editor's `FormDialog` look, and like it keeping its key presses from the editor's shortcuts (S would
 * save again, Enter would play) - or null if one of the editor's popups is already up.
 */
function OpenShell(title: string, subtitle: string): Shell | null {
    if (openDialog || IsFormDialogOpen() || IsQuestsDialogOpen()) {
        return null;
    }
    InjectFormStyles();
    InjectStyles("ld-styles", STYLES);

    const overlay = El("div", "fd-overlay");
    const panel = overlay.appendChild(El("div", "fd-panel ld-panel"));
    panel.tabIndex = -1;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", title);
    const header = panel.appendChild(El("div", "fd-header"));
    header.appendChild(El("h2", "fd-title", title));
    header.appendChild(El("p", "fd-subtitle", subtitle));
    const body = panel.appendChild(El("div", "fd-body"));
    const footer = panel.appendChild(El("div", "fd-footer"));
    const message = footer.appendChild(El("span", "ld-message"));
    const shell: Shell = { overlay, panel, body, footer, message, onCancel: () => undefined };

    overlay.addEventListener("pointerdown", e => {
        if (e.target === overlay) {
            shell.onCancel();
        }
    });
    overlay.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Escape") {
            e.preventDefault();
            shell.onCancel();
        }
    });
    // The editor turns the context menu off on the page; the name box wants it back (paste).
    overlay.addEventListener("contextmenu", e => e.stopPropagation());
    openDialog = overlay;
    return shell;
}

function ShowShell(overlay: HTMLElement): void {
    document.body.appendChild(overlay);
}

function CloseShell(overlay: HTMLElement): void {
    overlay.remove();
    if (openDialog === overlay) {
        openDialog = null;
    }
}

/** One row per level - its name, and when it was saved and its size - for `fill` to add its buttons to; `empty` when there are none. */
function FillRows(rows: HTMLElement, levels: NamedLevel[], empty: string, fill: (level: NamedLevel, row: HTMLElement) => void): void {
    rows.textContent = "";
    if (!levels.length) {
        rows.appendChild(El("p", "ld-empty", empty));
    }
    levels.forEach(level => {
        const row = rows.appendChild(El("div", "ld-row" + (level.unreadable ? " ld-unreadable" : "")));
        row.dataset.name = level.name;
        const info = row.appendChild(El("div", "ld-info"));
        info.appendChild(El("div", "ld-level-name", level.name));
        info.appendChild(El("div", "ld-detail", (level.unreadable ? "can't be read" : DescribeSavedAt(level.savedAt)) + " · " + DescribeSize(level.size)));
        fill(level, row);
    });
}

/** Delete, asking first - a level deleted from the browser is gone. */
function DeleteButton(level: NamedLevel, onDelete: () => void): HTMLButtonElement {
    const button = ButtonEl("ed-button ld-delete", "Delete", `Delete “${level.name}” from this browser`);
    button.addEventListener("click", e => {
        e.stopPropagation();
        if (confirm(`Delete “${level.name}” from this browser? It can't be undone.`)) {
            onDelete();
        }
    });
    return button;
}

/** How full the browser's storage for this site is getting - every level, the editor's own level and anything else kept there. */
function ShowUsage(usage: HTMLElement, levels: NamedLevels): void {
    const used = levels.UsedSpace();
    usage.textContent = `${DescribeSize(used)} of about ${DescribeSize(StorageBudget)} used`;
    usage.classList.toggle("ld-usage-high", used > StorageBudget * 0.8);
}

function SetMessage(message: HTMLElement, text: string, isError: boolean): void {
    message.textContent = text;
    message.classList.toggle("ld-error", isError);
}

const STYLES = `
.ld-panel .fd-body { min-height: 120px; }
.ld-name { border-bottom: none; }
.ld-name input { width: 100%; box-sizing: border-box; }
.ld-list-header { display: flex; align-items: baseline; justify-content: space-between; margin: 6px 0 2px; }
.ld-list-title { font-weight: bold; color: var(--ed-label); }
.ld-usage { font-size: 12px; color: var(--ed-faint); }
.ld-usage-high { color: var(--ed-error); }
.ld-rows { display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--ed-button-border) transparent; }
.ld-row { display: flex; align-items: center; gap: 8px; padding: 7px 6px; border-bottom: 1px solid var(--ed-divider-soft); border-radius: 4px; }
.ld-pick .ld-row { cursor: pointer; }
.ld-row:hover { background: var(--ed-well); }
.ld-row.ld-current { background: var(--ed-accent-bg); }
.ld-info { flex: 1; min-width: 0; }
.ld-level-name { font-weight: bold; color: var(--ed-text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ld-detail { font-size: 12px; color: var(--ed-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ld-unreadable .ld-level-name { color: var(--ed-muted); font-style: italic; }
.ld-row .ed-button { padding: 4px 10px; }
.ld-delete:hover { border-color: var(--ed-error); color: var(--ed-error); }
.ld-empty { margin: 10px 0; color: var(--ed-faint); }
.ld-message { flex: 1; font-size: 12px; color: var(--ed-muted); }
.ld-message.ld-error { color: var(--ed-error); }
`;
