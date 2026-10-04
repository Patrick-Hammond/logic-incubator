/**
 * Saving a sprite changes the game's assets, and an open page doesn't pick those up until it reloads. So when the sprite
 * editor is closed after a save, it leaves a note in session storage - "come back to the level editor with this sprite
 * picked" - and the page reloads; the editor finds the note on the way back up, shows itself and picks the sprite. The note
 * is read once and removed, and a stale one (a reload that never came) is ignored. Pure apart from the storage it's
 * handed (see Resume.test.ts).
 */

export type ResumeNote = {
    /** The sprite (or animation) that was saved, and its bundle. */
    bundle: string;
    name: string;
    /** The palette tab it's listed under, if known. */
    category?: string | null;
};

export type StorageLike = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};

export const ResumeKey = "sprite-editor.resume";
/** A note older than this is from a reload that never happened. */
export const ResumeMaxAgeMs = 2 * 60 * 1000;

/** Leaves the note; false if the browser wouldn't store it (then the sprite just won't reopen by itself). */
export function WriteResumeNote(storage: StorageLike | null, note: ResumeNote, now: number = Date.now()): boolean {
    if (!storage) {
        return false;
    }
    try {
        storage.setItem(ResumeKey, JSON.stringify({ ...note, at: now }));
        return true;
    } catch {
        return false;
    }
}

/** Takes the note, if there is a fresh, well-formed one: it's removed either way. */
export function TakeResumeNote(storage: StorageLike | null, now: number = Date.now()): ResumeNote | null {
    return ReadNote(storage, now, true);
}

/** The note as `TakeResumeNote` would give it, but left in place - for asking "is there one?" before the editor is ready to act on it. */
export function PeekResumeNote(storage: StorageLike | null, now: number = Date.now()): ResumeNote | null {
    return ReadNote(storage, now, false);
}

function ReadNote(storage: StorageLike | null, now: number, remove: boolean): ResumeNote | null {
    if (!storage) {
        return null;
    }
    let raw: string | null;
    try {
        raw = storage.getItem(ResumeKey);
        if (raw !== null && remove) {
            storage.removeItem(ResumeKey);
        }
    } catch {
        return null;
    }
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.bundle !== "string" || typeof parsed.name !== "string" || !parsed.bundle || !parsed.name || typeof parsed.at !== "number") {
            return null;
        }
        if (now - parsed.at > ResumeMaxAgeMs || parsed.at - now > ResumeMaxAgeMs) {
            return null;
        }
        return { bundle: parsed.bundle, name: parsed.name, category: typeof parsed.category === "string" ? parsed.category : null };
    } catch {
        return null;
    }
}
