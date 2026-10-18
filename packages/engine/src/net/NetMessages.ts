/**
 * The dungeon's messages between players' machines, as they travel through
 * the relay (see lib's `RelaySession`): a byte for the kind, then the body -
 * JSON for the lobby's few small messages and the chat, bytes for a level. Play itself
 * (inputs, snapshots) has kinds of its own, in `PlayMessages`. Pure - no pixi -
 * so it runs under the plain node test runner.
 */

import { ChatLength, ChatLine } from "./Chat";

/** The version of these messages: a guest on another is turned away (`refused`, "version"). Raise it whenever a message changes, or how a level sent in one is read - a guest has to build the same spawners and the rest as the host. */
export const NetVersion = 7;

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

/** Why the host turned a guest away: another version; a run already going (or a `rejoin` it doesn't know); no seat left; or one coming back too late. */
export type RefusedReason = "version" | "started" | "full" | "gone";

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
    /**
     * Guest to host, on joining: who they are, and what they speak - and, coming back into a run after their
     * connection went, the `token` their `start` gave them.
     */
    | { t: "hello"; version: number; name: string; rejoin?: string }
    /** Host to guest: not in this game - they leave. */
    | { t: "refused"; reason: RefusedReason }
    /** Host to each guest, whenever anything in the lobby changes: everyone, in seat order. */
    | { t: "lobby"; seats: LobbySeat[] }
    /** Guest to host: the character they've picked, or null to take it back. */
    | { t: "pick"; character: string | null }
    /**
     * Host to each guest: the run begins - this level, these random numbers, these heroes (in hero order) - and a
     * `token` of that guest's own, to come back into the run with if their connection goes.
     */
    | { t: "start"; seed: number; level: StartLevel; seats: LobbySeat[]; token?: string }
    /** Guest to host: its copy of the level isn't the host's - send it whole. */
    | { t: "need-level" }
    /** Host to guest: the level, packed (see `PackLevel`). */
    | { t: "level"; packed: Uint8Array }
    /** Host to a guest who said hello with a `rejoin` token it knows: they're back in the run, as the hero they were. */
    | { t: "rejoined" }
    /** Guest to host: a line its player typed in the chat, as they typed it - the host reads it (see `ParseChat`) and passes it on. */
    | { t: "say"; text: string }
    /** Host to a guest: a line of the chat for them - said to everyone, or whispered to or by them. */
    | { t: "chat"; line: ChatLine };

const Kinds: { [t: string]: number } = { hello: 1, refused: 2, lobby: 3, pick: 4, start: 5, "need-level": 6, level: 7, rejoined: 8, say: 9, chat: 10 };
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
        case "hello": {
            if (typeof fields.version !== "number" || typeof fields.name !== "string" || (fields.rejoin !== undefined && !IsToken(fields.rejoin))) {
                return null;
            }
            const hello: LobbyMessage = { t, version: fields.version, name: fields.name };
            if (fields.rejoin !== undefined) {
                hello.rejoin = fields.rejoin;
            }
            return hello;
        }
        case "refused":
            return typeof fields.reason === "string" ? { t, reason: fields.reason } : null;
        case "lobby":
            return IsSeats(fields.seats) ? { t, seats: fields.seats } : null;
        case "pick":
            return IsCharacter(fields.character) ? { t, character: fields.character } : null;
        case "start": {
            const level = fields.level;
            const valid = typeof fields.seed === "number" && IsSeats(fields.seats) && level && typeof level.hash === "string"
                && typeof level.sent === "boolean" && (level.bundle === null || typeof level.bundle === "string")
                && (fields.token === undefined || IsToken(fields.token));
            if (!valid) {
                return null;
            }
            const start: LobbyMessage = { t, seed: fields.seed, seats: fields.seats, level: { bundle: level.bundle, hash: level.hash, sent: level.sent } };
            if (fields.token !== undefined) {
                start.token = fields.token;
            }
            return start;
        }
        case "need-level":
        case "rejoined":
            return { t };
        case "say":
            // Room for a whisper's @name on top of a whole line.
            return typeof fields.text === "string" && fields.text.length <= ChatLength * 2 ? { t, text: fields.text } : null;
        case "chat":
            return IsChatLine(fields.line) ? { t, line: ChatLineOf(fields.line) } : null;
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

/**
 * `name` made different from every one of `taken` (any case) - "SAM 2", "SAM 3"... cut to keep within `NameLength` - so
 * a whisper's `@name` always means one player.
 */
export function UniqueName(name: string, taken: ReadonlyArray<string>): string {
    const used = (candidate: string) => taken.some(other => other.toLowerCase() === candidate.toLowerCase());
    if (!used(name)) {
        return name;
    }
    for (let n = 2; ; n++) {
        const suffix = " " + n;
        const candidate = name.slice(0, NameLength - suffix.length).trim() + suffix;
        if (!used(candidate)) {
            return candidate;
        }
    }
}

function IsChatLine(value: any): value is ChatLine {
    const whisper = value && value.whisper;
    return !!value && typeof value.seat === "number" && typeof value.from === "string" && typeof value.text === "string" && value.text.length <= ChatLength
        && (whisper === undefined || (!!whisper && typeof whisper.seat === "number" && typeof whisper.name === "string"));
}

/** Just a chat line's own fields - nothing more that came with it. */
function ChatLineOf(value: ChatLine): ChatLine {
    const line: ChatLine = { seat: value.seat, from: value.from, text: value.text };
    if (value.whisper) {
        line.whisper = { seat: value.whisper.seat, name: value.whisper.name };
    }
    return line;
}

function IsToken(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function IsCharacter(value: unknown): value is string | null {
    return value === null || (typeof value === "string" && value.length > 0 && value.length <= 64);
}

function IsSeats(value: unknown): value is LobbySeat[] {
    return Array.isArray(value) && value.every(seat => !!seat && typeof seat.peer === "number" && typeof seat.name === "string" && IsCharacter(seat.character));
}
