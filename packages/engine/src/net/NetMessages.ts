/**
 * The dungeon's messages between players' machines, as they travel through
 * the relay (see lib's `RelaySession`): a byte for the kind, then the body -
 * JSON for the lobby's few small messages, bytes for a level. Play itself
 * (inputs, snapshots) joins them in a later version. Pure - no pixi - so it
 * runs under the plain node test runner.
 */

/** The version of these messages: a guest on another is turned away (`refused`, "version"). Raise it whenever a message changes. */
export const NetVersion = 1;

/** The most characters a player's name keeps. */
export const NameLength = 12;

/** One player in the lobby, in seat order: the host's seat is first. */
export type LobbySeat = {
    /** Their peer number on the relay: 0 for the host. */
    peer: number;
    name: string;
    /** The character they picked (a game's own id), or null while they're choosing - picking is being ready. */
    character: string | null;
};

/** Why the host turned a guest away. */
export type RefusedReason = "version" | "started" | "full";

/** The level a run plays, as the start names it. */
export type StartLevel = {
    /** The asset bundle it plays in, or null for none. */
    bundle: string | null;
    /** Its `LevelHash`. */
    hash: string;
    /** Whether the host sends it whole after the start (an editor level) - else a guest plays its own copy if the hash matches, or asks for it (`need-level`). */
    sent: boolean;
};

export type LobbyMessage =
    /** Guest to host, on joining: who they are, and what they speak. */
    | { t: "hello"; version: number; name: string }
    /** Host to guest: not in this game - they leave. */
    | { t: "refused"; reason: RefusedReason }
    /** Host to each guest, whenever anything in the lobby changes: everyone, in seat order. */
    | { t: "lobby"; seats: LobbySeat[] }
    /** Guest to host: the character they've picked, or null to take it back. */
    | { t: "pick"; character: string | null }
    /** Host to each guest: the run begins - this level, these random numbers, these heroes (in hero order). */
    | { t: "start"; seed: number; level: StartLevel; seats: LobbySeat[] }
    /** Guest to host: its copy of the level isn't the host's - send it whole. */
    | { t: "need-level" }
    /** Host to guest: the level, packed (see `PackLevel`). */
    | { t: "level"; packed: Uint8Array };

const Kinds: { [t: string]: number } = { hello: 1, refused: 2, lobby: 3, pick: 4, start: 5, "need-level": 6, level: 7 };
const KindNames: string[] = [];
Object.keys(Kinds).forEach(name => (KindNames[Kinds[name]] = name));

/** The message as bytes to send. */
export function EncodeMessage(message: LobbyMessage): Uint8Array {
    const kind = Kinds[message.t];
    let body: Uint8Array;
    if (message.t === "level") {
        body = message.packed;
    } else {
        const fields: { [key: string]: unknown } = {};
        Object.keys(message).forEach(key => {
            if (key !== "t") {
                fields[key] = (message as { [key: string]: unknown })[key];
            }
        });
        body = new TextEncoder().encode(JSON.stringify(fields));
    }
    const bytes = new Uint8Array(body.length + 1);
    bytes[0] = kind;
    bytes.set(body, 1);
    return bytes;
}

/** A message from bytes another machine sent - or null for one this version doesn't know, or that's garbled. */
export function DecodeMessage(bytes: Uint8Array): LobbyMessage | null {
    const t = bytes.length ? KindNames[bytes[0]] : undefined;
    if (!t) {
        return null;
    }
    const body = bytes.subarray(1);
    if (t === "level") {
        return { t, packed: body };
    }
    let fields: any;
    try {
        fields = JSON.parse(new TextDecoder().decode(body));
    } catch {
        return null;
    }
    if (!fields || typeof fields !== "object") {
        return null;
    }
    switch (t) {
        case "hello":
            return typeof fields.version === "number" && typeof fields.name === "string" ? { t, version: fields.version, name: fields.name } : null;
        case "refused":
            return typeof fields.reason === "string" ? { t, reason: fields.reason } : null;
        case "lobby":
            return IsSeats(fields.seats) ? { t, seats: fields.seats } : null;
        case "pick":
            return IsCharacter(fields.character) ? { t, character: fields.character } : null;
        case "start": {
            const level = fields.level;
            const valid = typeof fields.seed === "number" && IsSeats(fields.seats) && level && typeof level.hash === "string"
                && typeof level.sent === "boolean" && (level.bundle === null || typeof level.bundle === "string");
            return valid ? { t, seed: fields.seed, seats: fields.seats, level: { bundle: level.bundle, hash: level.hash, sent: level.sent } } : null;
        }
        case "need-level":
            return { t };
        default:
            return null;
    }
}

/** A name as a player's machine sent it, made fit to show: trimmed, cut to `NameLength`, and `fallback` if that leaves nothing. */
export function CleanName(name: string, fallback: string): string {
    const printable = name.split("").filter(ch => ch >= " " && ch !== "\u007f").join("");
    const clean = printable.replace(/\s+/g, " ").trim().slice(0, NameLength).trim();
    return clean || fallback;
}

function IsCharacter(value: unknown): value is string | null {
    return value === null || (typeof value === "string" && value.length > 0 && value.length <= 64);
}

function IsSeats(value: unknown): value is LobbySeat[] {
    return Array.isArray(value) && value.every(seat => !!seat && typeof seat.peer === "number" && typeof seat.name === "string" && IsCharacter(seat.character));
}
