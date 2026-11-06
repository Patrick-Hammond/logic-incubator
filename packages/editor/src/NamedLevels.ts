/**
 * Levels kept in the browser by name, so one browser can hold several. Each is its own local storage key - `dungeonLevels/`
 * and its name - so saving one rewrites only that one, and one that's damaged spoils none of the others. These are apart from
 * the editor's own level (`dungeonLevel`, see SavedLevel.ts), the one Enter plays and a reload comes back to: they're only
 * written by Save and read by Load (see LevelsDialog.ts), and they share the browser's storage with it.
 *
 * Pure - no pixi, no DOM - apart from the storage it's handed, so it runs under the plain node test runner.
 */

import { EditorSave, LevelContent, OpenEditorSave } from "./SavedLevel";

/** The part of `Storage` the named levels use. */
export type LevelStorage = {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};

/** What every named level's key starts with; the rest is its name. */
export const NamedLevelPrefix = "dungeonLevels/";
export const MaxLevelNameLength = 60;
/**
 * About as much as a browser lets one site keep in local storage, counted in characters (keys and values) - Chrome and Firefox
 * both stop near this. Only for showing how full it's getting: the browser's own refusal is what's acted on.
 */
export const StorageBudget = 5 * 1024 * 1024;

/** A level in the list. */
export type NamedLevel = {
    name: string;
    /** When it was saved, in ms since 1970 - 0 if it can't be read. */
    savedAt: number;
    /** What it takes up, in characters: near enough its size in bytes as a file, a level being plain JSON. */
    size: number;
    /** What's stored under its name isn't a named level (damaged, or written by something else): it can only be deleted. */
    unreadable?: boolean;
};

/** How a named level is stored: its name and time beside the save, which is exactly what a downloaded file holds. */
type StoredLevel = { name: string; savedAt: number; level: EditorSave };

export type LevelSaveResult = { ok: true; replaced: boolean } | { ok: false; error: string; full: boolean };
export type LevelReadResult = { save: EditorSave; error?: undefined } | { save?: undefined; error: string };

/** A name as it's kept: its ends trimmed, runs of spaces made one, and nothing that isn't printable. */
export function CleanLevelName(name: string): string {
    const printable = name
        .replace(/\s+/g, " ")
        .split("")
        .filter(c => c >= " " && c !== "\u007f")
        .join("");
    return printable.trim();
}

/** Why `name` can't be a level's name, or null when it can. */
export function LevelNameProblem(name: string): string | null {
    const clean = CleanLevelName(name);
    if (!clean) {
        return "Give the level a name.";
    }
    if (clean.length > MaxLevelNameLength) {
        return `Keep the name to ${MaxLevelNameLength} characters.`;
    }
    return null;
}

/** The file a level downloads as: its name, without what a file name can't have, as JSON - or `dungeonLevel.json` without one. */
export function LevelFileName(name: string): string {
    const safe = CleanLevelName(name)
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/^[.\s]+|[.\s]+$/g, "");
    return (safe || "dungeonLevel") + ".json";
}

/** A name for a level opened from a file that doesn't carry one: the file's name, less its folder and extension. */
export function LevelNameFromFile(fileName: string): string {
    const base = fileName.replace(/^.*[\\/]/, "");
    const dot = base.lastIndexOf(".");
    return CleanLevelName(dot > 0 ? base.slice(0, dot) : base).slice(0, MaxLevelNameLength);
}

/** Whether `error`, thrown by `setItem`, is the browser saying its storage is full (each names it its own way). */
export function IsStorageFull(error: unknown): boolean {
    const e = error as { name?: string; code?: number } | null;
    return !!e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014);
}

export class NamedLevels {
    /** `storage`: the browser's local storage, or null if it wouldn't give it (a private window, site data blocked). */
    constructor(private readonly storage: LevelStorage | null) {}

    /** Whether there's storage to keep levels in at all. */
    get Available(): boolean {
        return this.storage !== null;
    }

    /** Every named level, the most recently saved first (then by name); ones that can't be read last. */
    List(): NamedLevel[] {
        const levels: NamedLevel[] = [];
        this.Keys().forEach(key => {
            const text = this.Get(key);
            if (text === null) {
                return;
            }
            const name = key.slice(NamedLevelPrefix.length);
            const stored = ParseStored(text);
            levels.push(stored ? { name, savedAt: stored.savedAt, size: key.length + text.length } : { name, savedAt: 0, size: key.length + text.length, unreadable: true });
        });
        return levels.sort((a, b) => b.savedAt - a.savedAt || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    }

    /** Whether a level is saved as `name` (as `CleanLevelName` has it). */
    Has(name: string): boolean {
        return this.Get(NamedLevelPrefix + CleanLevelName(name)) !== null;
    }

    /** The level saved as `name`, brought up to date as any save is (see `OpenEditorSave`) - or why it can't be opened. */
    Read(name: string): LevelReadResult {
        const text = this.Get(NamedLevelPrefix + CleanLevelName(name));
        if (text === null) {
            return { error: `There's no level saved as “${CleanLevelName(name)}” in this browser.` };
        }
        const stored = ParseStored(text);
        if (!stored) {
            return { error: `What's saved as “${CleanLevelName(name)}” can't be read as a level.` };
        }
        return OpenEditorSave(stored.level);
    }

    /** What the level saved as `name` holds, as it's stored - for downloading it without opening it. Null if there isn't one that can be read. */
    FileText(name: string): string | null {
        const text = this.Get(NamedLevelPrefix + CleanLevelName(name));
        const stored = text === null ? null : ParseStored(text);
        return stored ? JSON.stringify(stored.level) : null;
    }

    /**
     * Saves `save` as `name`, replacing any level of that name. When the browser won't take it - its storage is full, or blocked -
     * says so, and a level it replaced is still there as it was.
     */
    Save(name: string, save: EditorSave, now: number = Date.now()): LevelSaveResult {
        const clean = CleanLevelName(name);
        const problem = LevelNameProblem(clean);
        if (problem) {
            return { ok: false, error: problem, full: false };
        }
        if (!this.storage) {
            return { ok: false, error: "This browser isn't letting the editor keep anything (a private window, or site data turned off).", full: false };
        }
        const key = NamedLevelPrefix + clean;
        const replaced = this.Get(key) !== null;
        const stored: StoredLevel = { name: clean, savedAt: now, level: save };
        try {
            this.storage.setItem(key, JSON.stringify(stored));
        } catch (e) {
            if (IsStorageFull(e)) {
                return {
                    ok: false,
                    full: true,
                    error: "The browser's storage for this site is full. Delete a level you don't need, or download this one as a file."
                };
            }
            return { ok: false, full: false, error: "The browser wouldn't keep the level" + (e instanceof Error && e.message ? ": " + e.message : ".") };
        }
        return { ok: true, replaced };
    }

    /** Takes the level saved as `name` out of the browser. */
    Delete(name: string): void {
        try {
            if (this.storage) {
                this.storage.removeItem(NamedLevelPrefix + CleanLevelName(name));
            }
        } catch {
            // Blocked storage has nothing to delete.
        }
    }

    /** What this site keeps in local storage altogether - the named levels, the editor's own level and anything else - in characters, as `StorageBudget` counts. */
    UsedSpace(): number {
        let used = 0;
        this.AllKeys().forEach(key => {
            const text = this.Get(key);
            used += key.length + (text === null ? 0 : text.length);
        });
        return used;
    }

    private Keys(): string[] {
        return this.AllKeys().filter(key => key.indexOf(NamedLevelPrefix) === 0 && key.length > NamedLevelPrefix.length);
    }

    private AllKeys(): string[] {
        const keys: string[] = [];
        try {
            if (this.storage) {
                for (let i = 0; i < this.storage.length; i++) {
                    const key = this.storage.key(i);
                    if (key !== null) {
                        keys.push(key);
                    }
                }
            }
        } catch {
            // Blocked storage lists nothing.
        }
        return keys;
    }

    private Get(key: string): string | null {
        try {
            return this.storage ? this.storage.getItem(key) : null;
        } catch {
            return null;
        }
    }
}

/** A stored named level, or null if `text` isn't one. */
function ParseStored(text: string): StoredLevel | null {
    try {
        const stored = JSON.parse(text) as StoredLevel;
        return stored && typeof stored === "object" && typeof stored.savedAt === "number" && IsLevelFile(stored.level) ? stored : null;
    } catch {
        return null;
    }
}

/** Whether `value` has the shape of a level file - its layers and its brushes - before anything is made of it. */
export function IsLevelFile(value: unknown): value is EditorSave {
    const file = value as EditorSave;
    return (
        !!file &&
        typeof file === "object" &&
        !!file.editorData &&
        Array.isArray(file.editorData.layers) &&
        !!file.levelData &&
        Array.isArray(file.levelData.levelData)
    );
}

/**
 * Whether opening another level over `now`, the editor's, would lose work: it has something on it (a brush or a quest), and it's
 * neither `kept` - the `LevelContent` it had when last saved, downloaded or opened - nor the level saved under its name.
 */
export function HasUnsavedWork(now: EditorSave, kept: string | undefined, levels: NamedLevels): boolean {
    const data = now.levelData;
    if (!data || ((!data.levelData || !data.levelData.length) && (!data.quests || !data.quests.length))) {
        return false;
    }
    const content = LevelContent(now);
    if (content === kept) {
        return false;
    }
    const name = now.editorData && now.editorData.levelName;
    const stored = name ? levels.Read(name).save : undefined;
    return !stored || LevelContent(stored) !== content;
}

const Months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** When a level was saved, for its row: "today 14:02", "yesterday 09:30", "5 Nov 14:02", or "5 Nov 2025" from another year. */
export function DescribeSavedAt(savedAt: number, now: number = Date.now()): string {
    const when = new Date(savedAt);
    const today = new Date(now);
    const time = Pad(when.getHours()) + ":" + Pad(when.getMinutes());
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const daysAgo = Math.round((day(today) - day(when)) / 86400000);
    if (daysAgo === 0) {
        return "today " + time;
    }
    if (daysAgo === 1) {
        return "yesterday " + time;
    }
    const date = when.getDate() + " " + Months[when.getMonth()];
    return when.getFullYear() === today.getFullYear() ? date + " " + time : date + " " + when.getFullYear();
}

/** A size in characters (near enough bytes) as people read it: "800 B", "312 KB", "1.2 MB", "5 MB". */
export function DescribeSize(size: number): string {
    if (size < 1024) {
        return size + " B";
    }
    if (size < 1024 * 1024) {
        return Math.round(size / 1024) + " KB";
    }
    return (size / (1024 * 1024)).toFixed(1).replace(/\.0$/, "") + " MB";
}

function Pad(n: number): string {
    return (n < 10 ? "0" : "") + n;
}
