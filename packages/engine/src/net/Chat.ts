/**
 * The rules of the players' chat in an online game: what a typed line is
 * made into (`CleanChat`), who it goes to - everyone, or one player it's
 * whispered to with `@name` (`ParseChat`) - and how often one player may
 * speak (`ChatLimiter`). The lobbies carry the lines (see `Lobby.Say` and
 * `LobbyEvents.CHAT`): every line goes through the host, which reads it again
 * and sends a whisper only to the player it's for. Pure - no pixi - so it runs
 * under the plain node test runner.
 */

/** The most characters a chat line keeps. */
export const ChatLength = 120;

/** How many lines a lobby keeps, oldest dropped first - what a chat window opened later shows. */
export const ChatHistory = 50;

/** How many lines one player may say within `ChatBurstMs` - the host drops the rest. */
export const ChatBurst = 5;
export const ChatBurstMs = 5000;

/** One line of the chat, as everyone who hears it gets it. */
export type ChatLine = {
    /** The seat (its place in the lobby's `Seats`, which online is also the hero's slot) of who said it. */
    seat: number;
    /** Their name, as it was when they said it. */
    from: string;
    text: string;
    /** For a whisper: the seat and name of the player it was whispered to - only they and whoever said it hear it. */
    whisper?: { seat: number; name: string };
};

/** A typed line, read: what to say, and the seat it's whispered to - null for everyone. */
export type ParsedChat = { text: string; to: number | null };

/** A typed line as it's sent: control characters dropped, runs of spaces made one, trimmed, and cut to `ChatLength`. */
export function CleanChat(typed: string): string {
    const printable = typed.split("").filter(ch => ch >= " " && ch !== "\u007f").join("");
    return printable.replace(/\s+/g, " ").trim().slice(0, ChatLength).trim();
}

/**
 * Reads a typed line: a line for everyone, or - starting `@` and a player's name (`names`, by seat; any case) - a
 * whisper to that player. A name with a space in it is typed as it is: the longest name the line starts with is the
 * one meant. `self` is the seat of whoever typed it. Returns null when there's nothing to say, or why it can't be
 * said - no one has that name, a whisper to yourself or with nothing in it - as a string a player can read.
 */
export function ParseChat(typed: string, names: ReadonlyArray<string>, self: number): ParsedChat | string | null {
    const text = CleanChat(typed);
    if (!text) {
        return null;
    }
    if (text.charAt(0) !== "@") {
        return { text, to: null };
    }
    const rest = text.slice(1);
    const lower = rest.toLowerCase();
    let to = -1;
    names.forEach((name, seat) => {
        const candidate = name.toLowerCase();
        const fits = lower.slice(0, candidate.length) === candidate && (lower.length === candidate.length || lower.charAt(candidate.length) === " ");
        if (candidate && fits && (to < 0 || candidate.length > names[to].length)) {
            to = seat;
        }
    });
    if (to < 0) {
        const word = rest.split(" ")[0];
        return word ? "No one here is called " + word + "." : "Put a player's name after the @.";
    }
    if (to === self) {
        return "You can't whisper to yourself.";
    }
    const said = rest.slice(names[to].length).trim();
    if (!said) {
        return "Say something after @" + names[to] + ".";
    }
    return { text: said, to };
}

/** Who a chat line is from, as a window heads it: "SAM", or for a whisper "SAM TO ANN" - the reader's own seat, `you`, reads as YOU. */
export function ChatSpeaker(line: ChatLine, you: number): string {
    const from = line.seat === you ? "YOU" : line.from;
    if (!line.whisper) {
        return from;
    }
    return from + " TO " + (line.whisper.seat === you ? "YOU" : line.whisper.name);
}

/**
 * Keeps each player to `burst` lines within `ms` - the host's, so one player can't flood the others' windows. `now` is
 * the clock, in milliseconds (`Date.now` by default).
 */
export class ChatLimiter {
    /** By who: when each of their lines in the last `ms` was said. */
    private said = new Map<number, number[]>();

    constructor(private burst = ChatBurst, private ms = ChatBurstMs, private now: () => number = Date.now) {}

    /** Whether `who` may say a line now - counting it, if so. */
    Allow(who: number): boolean {
        const now = this.now();
        const recent = (this.said.get(who) || []).filter(at => now - at < this.ms);
        const allowed = recent.length < this.burst;
        if (allowed) {
            recent.push(now);
        }
        this.said.set(who, recent);
        return allowed;
    }
}
