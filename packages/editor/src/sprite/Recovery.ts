/**
 * The page can reload under the sprite editor without being asked to - the dev server does it when a rebuild takes long enough to
 * drop its connection, and F5 does it - and that must not cost the sprite you're drawing. So as the page unloads the editor
 * snapshots the sprite (its pictures, palette and where it's to be saved) into session storage, and the next page load puts
 * the window back. Undo history isn't kept. A snapshot is read once and removed; a stale or damaged one is ignored. Pure apart
 * from the storage it's handed (see Recovery.test.ts).
 */

import { Bitmap } from "./Bitmap";
import { ColourHex, ParseColour } from "./Colour";
import { MaxPaletteSize } from "./Palette";
import { MaxCanvasSize, MaxFrames, SpriteState } from "./SpriteDocument";
import { StorageLike } from "./Resume";

/** The sprite the window is editing: where it lives, and what saving it means. */
export type SpriteOrigin = {
    bundle: string;
    name: string;
    /** "overwrite" once it exists on disk; "create" for a new one (its first save makes it). */
    mode: "overwrite" | "create";
    sheet: string;
    category: string;
    /** For the first save of a "save as": the sprite whose tile properties to copy. */
    copyMetaFrom?: string;
    /** True once a save has changed files - closing then reloads the page so the level editor sees the art. */
    applied: boolean;
    /** The bundle's hash in the served manifest from before the last save that changed files: the rebuild is done when it's different. */
    buildFrom?: string;
    /** How many frames the sprite has as far as the assets go (what it was opened with, or what was last saved) - a download needs it to say which files it makes obsolete. */
    savedFrames?: number;
};

export type Recovery = {
    origin: SpriteOrigin;
    state: SpriteState;
    frameIndex: number;
    /** Whether there were edits not yet saved. */
    dirty: boolean;
};

export const RecoveryKey = "sprite-editor.recovery";
/** A snapshot older than this is from a session that's long gone. */
export const RecoveryMaxAgeMs = 10 * 60 * 1000;

function ToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + 0x8000)));
    }
    return btoa(binary);
}

function FromBase64(text: string): Uint8Array | null {
    try {
        const binary = atob(text);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            out[i] = binary.charCodeAt(i);
        }
        return out;
    } catch {
        return null;
    }
}

/** The snapshot as text. */
export function SerializeRecovery(recovery: Recovery, now: number = Date.now()): string {
    const { origin, state } = recovery;
    return JSON.stringify({
        at: now,
        origin,
        width: state.width,
        height: state.height,
        palette: state.palette.map(c => ColourHex(c, true)),
        frames: state.frames.map(f => ToBase64(f.data)),
        frameIndex: recovery.frameIndex,
        dirty: recovery.dirty
    });
}

const IsText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** The snapshot from its text, or null if it's damaged, impossible or stale. */
export function ParseRecovery(text: string, now: number = Date.now()): Recovery | null {
    let raw: any;
    try {
        raw = JSON.parse(text);
    } catch {
        return null;
    }
    if (!raw || typeof raw.at !== "number" || Math.abs(now - raw.at) > RecoveryMaxAgeMs) {
        return null;
    }
    const o = raw.origin;
    if (!o || !IsText(o.bundle) || !IsText(o.name) || (o.mode !== "overwrite" && o.mode !== "create") || typeof o.sheet !== "string" || typeof o.category !== "string") {
        return null;
    }
    const { width, height } = raw;
    const sizeOk = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MaxCanvasSize;
    if (!sizeOk(width) || !sizeOk(height) || !Array.isArray(raw.palette) || !raw.palette.length || raw.palette.length > MaxPaletteSize) {
        return null;
    }
    const palette = raw.palette.map((h: unknown) => (typeof h === "string" ? ParseColour(h) : null));
    if (palette.some((c: unknown) => !c)) {
        return null;
    }
    if (!Array.isArray(raw.frames) || !raw.frames.length || raw.frames.length > MaxFrames) {
        return null;
    }
    const frames: Bitmap[] = [];
    for (let i = 0; i < raw.frames.length; i++) {
        const data = typeof raw.frames[i] === "string" ? FromBase64(raw.frames[i]) : null;
        if (!data || data.length !== width * height || data.some(v => v >= palette.length)) {
            return null;
        }
        frames.push({ width, height, data });
    }
    const frameIndex = typeof raw.frameIndex === "number" && Number.isInteger(raw.frameIndex) ? Math.max(0, Math.min(frames.length - 1, raw.frameIndex)) : 0;
    return {
        origin: {
            bundle: o.bundle,
            name: o.name,
            mode: o.mode,
            sheet: o.sheet,
            category: o.category,
            copyMetaFrom: IsText(o.copyMetaFrom) ? o.copyMetaFrom : undefined,
            applied: o.applied === true,
            buildFrom: IsText(o.buildFrom) ? o.buildFrom : undefined,
            savedFrames: typeof o.savedFrames === "number" && Number.isInteger(o.savedFrames) && o.savedFrames >= 0 && o.savedFrames <= MaxFrames ? o.savedFrames : undefined
        },
        state: { width, height, palette, frames },
        frameIndex,
        dirty: raw.dirty === true
    };
}

/** Leaves the snapshot; false if the browser wouldn't keep it (blocked, or too big for session storage). */
export function WriteRecovery(storage: StorageLike | null, recovery: Recovery, now: number = Date.now()): boolean {
    if (!storage) {
        return false;
    }
    try {
        storage.setItem(RecoveryKey, SerializeRecovery(recovery, now));
        return true;
    } catch {
        return false;
    }
}

function Read(storage: StorageLike | null, now: number, remove: boolean): Recovery | null {
    if (!storage) {
        return null;
    }
    let text: string | null;
    try {
        text = storage.getItem(RecoveryKey);
        if (text !== null && remove) {
            storage.removeItem(RecoveryKey);
        }
    } catch {
        return null;
    }
    return text ? ParseRecovery(text, now) : null;
}

/** Takes the snapshot, if there's a fresh, sound one: it's removed either way. */
export function TakeRecovery(storage: StorageLike | null, now: number = Date.now()): Recovery | null {
    return Read(storage, now, true);
}

/** Whether there's a snapshot `TakeRecovery` would give, leaving it there. */
export function PeekRecovery(storage: StorageLike | null, now: number = Date.now()): Recovery | null {
    return Read(storage, now, false);
}

/** Throws away any snapshot (the window closed on purpose). */
export function ClearRecovery(storage: StorageLike | null): void {
    if (!storage) {
        return;
    }
    try {
        storage.removeItem(RecoveryKey);
    } catch {
        // Nothing to clear if storage is blocked.
    }
}
