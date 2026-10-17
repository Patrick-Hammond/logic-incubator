/**
 * The lobby an online run starts from, on top of a room on the relay (lib's
 * `RelaySession`): who's in, who they picked, and the start - the level, the
 * random numbers and the heroes every machine plays. The host's lobby
 * (`HostLobby`) decides everything and tells the guests; a guest's
 * (`GuestLobby`) asks and shows what it's told. Picking a character is being
 * ready, as in couch co-op. Both are eventemitter3s (see `LobbyEvents`), so
 * a component can `Listen` to them. Pure - no pixi - so it runs under the
 * plain node test runner.
 *
 * A guest says hello first; only then does the host count them in and tell
 * them anything, so nothing reaches a guest before it's listening.
 *
 * The players can talk the whole time, before the run and during it: `Say` a
 * line, and every lobby that hears one emits `CHAT` (and keeps the last few, in
 * `Chat`). Every line goes through the host, which reads it (see `ParseChat`)
 * and passes it on - to everyone, or whispered to one player.
 *
 * Once the run has begun (`STARTED`), a guest whose connection goes - closed,
 * quiet for `QuietForMs`, or its direct link to the host failed under it, with
 * what was on its way - tries to get back in (see
 * `GuestLobbyOptions.reconnect`) for as long as the host keeps its hero
 * (`HoldAwayMs`): a new place in the room, and a hello with the token its start
 * gave it. The host's lobby asks the run (`SetRejoin`) and lets it back in as
 * the hero it was (`rejoined`).
 */

import { EventEmitter } from "eventemitter3";
import RelaySession, { RelayEvents, RelayRefusedError } from "@logic-incubator/lib/net/RelaySession";
import { RelayHost, RoomSeats } from "@logic-incubator/lib/net/RelayRooms";
import type { LevelFile } from "../level/LevelFormat";
import { NewSeed } from "../Random";
import { ChatHistory, ChatLimiter, ChatLine, CleanChat, ParseChat } from "./Chat";
import { HoldAwayMs } from "./HostSession";
import { LevelHash, PackLevel, UnpackLevel } from "./LevelTransfer";
import { CleanName, DecodeMessage, EncodeMessage, LobbyMessage, LobbySeat, NetVersion, StartLevel, UniqueName } from "./NetMessages";

/** Events a lobby emits. */
export const LobbyEvents = {
    /** () - someone joined, left or picked: `Seats` has changed. */
    CHANGED: "changed",
    /** () - a guest's: the host has started, and the level is being made ready (it may have to be sent). */
    STARTING: "starting",
    /** (start: LobbyStart) - the run begins: everything a machine needs to start the same level as the rest. */
    STARTED: "started",
    /** (reason: string) - the lobby is over before or after a start: see `LobbyClosedText`. Emitted once. */
    CLOSED: "closed",
    /** () - a guest's, during the run: its connection has gone, and it's trying to get back in (see `GuestLobby.Reconnecting`). */
    DROPPED: "dropped",
    /** () - a guest's: it's back in the run after `DROPPED`, in the room as `Session` now. */
    REJOINED: "rejoined",
    /** (line: ChatLine) - a line of the chat this player hears: said to everyone, or whispered to or by them (see `Say`). */
    CHAT: "chat"
};

/** How long a guest whose connection has gone keeps trying to get back into the run, in milliseconds - as long as the host keeps its hero. */
export const ReconnectForMs = HoldAwayMs;
/** How long a guest in a run may hear nothing from the room before it takes its connection for lost, in milliseconds - the host pings every second. */
export const QuietForMs = 8000;
/** The waits between a guest's tries to get back in, in milliseconds - the last over and over. */
const RetryDelaysMs = [500, 1000, 2000, 4000];
/** How long a guest back in the room waits for the host to let it back into the run before trying again, in milliseconds. */
const RejoinAnswerMs = 5000;

/** What a host's lobby asks of the run when a guest comes back into it (see `HostLobby.SetRejoin`) - its `HostSession`. */
export interface RejoinHandler {
    /** Whether the player of hero `index` may come back: they're not gone for good. */
    CanRejoin(index: number): boolean;
    /** The player of hero `index` is back, as peer `peer`. */
    Rejoin(index: number, peer: number): void;
}

/** What every machine starts the run with - the same on each but for `you`. */
export type LobbyStart = {
    /** What the run's random numbers come from (see `DungeonMainOptions.seed`). */
    seed: number;
    /** The asset bundle the level plays in, or null for none. */
    bundle: string | null;
    level: LevelFile;
    /** The heroes, in hero order: the host's first. */
    seats: LobbySeat[];
    /** Which of `seats` is played on this machine. */
    you: number;
};

/** The level a host starts with. */
export type HostLevel = {
    bundle: string | null;
    file: LevelFile;
    /**
     * Whether it's the game's own, which every copy of the game has in `bundle`: guests then play their own
     * copy, if its hash matches. False for anything else - an editor level - which is sent whole.
     */
    shipped: boolean;
};

/** Why a lobby closed, in words a player can read. */
export function LobbyClosedText(reason: string): string {
    switch (reason) {
        case "host-left":
            return "The host has left.";
        case "left":
            return "You left.";
        case "version":
            return "The host is playing another version of the game.";
        case "started":
            return "That game has already started.";
        case "full":
            return "That game is full.";
        case "gone":
            return "You were away too long.";
        case "quiet":
            return "Lost touch with the host.";
        case "lost":
            return "Lost the connection, and couldn't get back in.";
        case "link":
            return "Lost the direct link to the host.";
        default:
            return "Lost the connection (" + reason + ").";
    }
}

/** The fallback name for a seat's player who gave none. */
function SeatName(index: number): string {
    return "PLAYER " + (index + 1);
}

/** A random token for a guest to come back into a run with - unguessable enough to keep a stranger with the room code out of their seat. */
function NewToken(): string {
    let token = "";
    while (token.length < 16) {
        token += Math.random().toString(36).slice(2);
    }
    return token.slice(0, 16);
}

/** What the two lobbies share: the room, the seats, the chat, and leaving. */
abstract class Lobby extends EventEmitter {
    protected seats: LobbySeat[] = [];
    /** The chat lines this player has heard, oldest first - the last `ChatHistory`. */
    private chat: ChatLine[] = [];
    /** When anything last came from the room, by `Date.now`. */
    protected heardAt = Date.now();
    private over = false;
    /** What stops this listening to its session. */
    private stops: Array<() => void> = [];

    constructor(protected session: RelaySession) {
        super();
        this.Bind(session);
    }

    /** The room's code, for the host to share. */
    get Code(): string {
        return this.session.Code;
    }

    /** The room on the relay - which play goes on in once the run has begun (see `CreateNetPlay`). */
    get Session(): RelaySession {
        return this.session;
    }

    /** Everyone in the lobby, the host first. */
    get Seats(): ReadonlyArray<LobbySeat> {
        return this.seats;
    }

    /** This machine's seat - undefined for a guest until the host has let it in. */
    get Mine(): LobbySeat | undefined {
        return this.seats.find(seat => seat.peer === this.session.You);
    }

    get IsHost(): boolean {
        return this.session.IsHost;
    }

    /** The last `ChatHistory` lines of the chat this player has heard, oldest first - what a chat window opened now starts with. */
    get Chat(): ReadonlyArray<ChatLine> {
        return this.chat;
    }

    /** This player's seat - their place in `Seats` - or -1 for a guest the host hasn't let in yet. What a `ChatLine.seat` is. */
    get MySeat(): number {
        return this.seats.findIndex(seat => seat.peer === this.session.You);
    }

    /**
     * Says `typed` to everyone in the game - or, starting `@` and a player's name, whispers it to them (see `ParseChat`).
     * The line comes back as `CHAT` once the host has passed it on. Returns null once it's on its way (or there was
     * nothing to say), or why it can't be said, as a player reads it: no one has that name, or this player isn't in
     * touch with the host just now.
     */
    abstract Say(typed: string): string | null;

    /** Whether it's still open: not left, closed by the host, or cut off. */
    get IsOpen(): boolean {
        return !this.over;
    }

    /** Leaves the room - which closes it for everyone, from the host. */
    Leave(): void {
        this.session.Leave();
        // Its session may have closed already: a guest's whose connection went, trying to get back in.
        this.Close("left");
    }

    protected abstract OnMessage(from: number, message: LobbyMessage): void;
    protected abstract OnPeerLeft(peer: number): void;

    /** The direct link to `peer` has ended (see `RelayEvents.UNLINKED`) - after being open, if `wasOpen`. The relay carries on. */
    protected OnUnlinked(_peer: number, _wasOpen: boolean): void {
        // The host lets the guest say: it's the guest that gets back in.
    }

    /** The session has closed, for `reason` (see `RelayEvents.CLOSED`): so does the lobby - unless a guest's tries to get back in. */
    protected OnSessionClosed(reason: string): void {
        this.Close(reason);
    }

    /** Listens to `session` - a guest's new place in the room, after its connection went - instead of the one before. */
    protected Bind(session: RelaySession): void {
        this.stops.splice(0).forEach(stop => stop());
        this.session = session;
        const message = (from: number, payload: Uint8Array) => {
            this.heardAt = Date.now();
            const decoded = DecodeMessage(payload);
            if (decoded && !this.over) {
                this.OnMessage(from, decoded);
            }
        };
        const left = (peer: number) => this.OnPeerLeft(peer);
        const closed = (reason: string) => this.OnSessionClosed(reason);
        const unlinked = (peer: number, wasOpen: boolean) => this.OnUnlinked(peer, wasOpen);
        session.on(RelayEvents.MESSAGE, message);
        session.on(RelayEvents.PEER_LEFT, left);
        session.on(RelayEvents.CLOSED, closed);
        session.on(RelayEvents.UNLINKED, unlinked);
        this.stops.push(() => {
            session.off(RelayEvents.MESSAGE, message);
            session.off(RelayEvents.PEER_LEFT, left);
            session.off(RelayEvents.CLOSED, closed);
            session.off(RelayEvents.UNLINKED, unlinked);
        });
    }

    protected Send(to: number, message: LobbyMessage): void {
        this.session.Send(to, EncodeMessage(message));
    }

    /** A line of the chat for this player: kept, and told (`CHAT`). */
    protected Hear(line: ChatLine): void {
        this.chat.push(line);
        if (this.chat.length > ChatHistory) {
            this.chat.splice(0, this.chat.length - ChatHistory);
        }
        this.emit(LobbyEvents.CHAT, line);
    }

    /** `typed` read as a line `seat` says (see `ParseChat`), against everyone's names. */
    protected Parse(typed: string, seat: number): ReturnType<typeof ParseChat> {
        return ParseChat(typed, this.seats.map(other => other.name), seat);
    }

    /** The start as this machine plays it. */
    protected StartFor(seed: number, bundle: string | null, level: LevelFile, seats: LobbySeat[]): LobbyStart {
        return { seed, bundle, level, seats, you: seats.findIndex(seat => seat.peer === this.session.You) };
    }

    protected Close(reason: string): void {
        if (this.over) {
            return;
        }
        this.over = true;
        this.emit(LobbyEvents.CLOSED, reason);
        this.removeAllListeners();
        this.session.Leave();
    }
}

/** The host's lobby: lets guests in, keeps their picks, starts the run, and lets a guest whose connection went back into it. */
export class HostLobby extends Lobby {
    /** The start, once it's been made - guests who come after are turned away. */
    private start: StartLevel | null = null;
    private level: LevelFile | null = null;
    /** The level packed to send, made once when first needed. */
    private packed: Promise<Uint8Array> | null = null;
    /** Each hero's token to come back into the run with, by slot, once it's begun - "" for the host's own. */
    private tokens: string[] = [];
    private rejoin: RejoinHandler | null = null;
    /** Keeps each guest from saying too much too fast. */
    private limiter = new ChatLimiter();

    /** Hosts in the room `session` has opened (see `RelaySession.Host`), as the player called `name`. */
    constructor(session: RelaySession, name: string) {
        super(session);
        this.seats = [{ peer: session.You, name: CleanName(name, SeatName(0)), character: null }];
    }

    /** Whether the run can start: everyone has picked, and it hasn't already. */
    get CanStart(): boolean {
        return !this.start && this.IsOpen && this.seats.every(seat => !!seat.character);
    }

    /** Whether the run has started. */
    get Started(): boolean {
        return !!this.start;
    }

    /** The host's own pick (a character id), or null to take it back. Not after the start. */
    Pick(character: string | null): void {
        if (this.start || !this.IsOpen) {
            return;
        }
        this.seats[0].character = character;
        this.Changed();
    }

    Say(typed: string): string | null {
        if (!this.IsOpen) {
            return "You're not in a game.";
        }
        const parsed = this.Parse(typed, this.MySeat);
        if (typeof parsed === "string") {
            return parsed;
        }
        if (parsed) {
            this.Pass(this.MySeat, parsed.text, parsed.to);
        }
        return null;
    }

    /**
     * What decides whether a guest whose connection went may come back into the run, and hears that they have - the
     * run's `HostSession` (see `CreateNetPlay`). Until there's one, or with null, a guest coming back is turned away.
     */
    SetRejoin(handler: RejoinHandler | null): void {
        this.rejoin = handler;
    }

    /**
     * Starts the run - when `CanStart` - on `level`, with random numbers from `seed` (a new one by default): tells every
     * guest, with a token of their own to come back with, sends the level to them if it isn't the game's own, and
     * emits `STARTED` here.
     */
    async Start(level: HostLevel, seed: number = NewSeed()): Promise<LobbyStart> {
        if (!this.CanStart) {
            throw new Error(this.start ? "The run has already started." : "Not everyone has picked a character.");
        }
        const seats = this.seats.map(seat => ({ ...seat }));
        const start = this.start = { bundle: level.bundle, hash: LevelHash(level.file), sent: !level.shipped };
        this.level = level.file;
        this.tokens = seats.map(seat => (seat.peer === RelayHost ? "" : NewToken()));
        this.Guests().forEach(seat => {
            const token = this.tokens[seats.findIndex(other => other.peer === seat.peer)];
            this.Send(seat.peer, { t: "start", seed, level: start, seats, token });
        });
        if (start.sent) {
            const packed = await this.Packed();
            this.Guests().forEach(seat => this.Send(seat.peer, { t: "level", packed }));
        }
        const begun = this.StartFor(seed, level.bundle, level.file, seats);
        this.emit(LobbyEvents.STARTED, begun);
        return begun;
    }

    protected OnMessage(from: number, message: LobbyMessage): void {
        const seat = this.seats.find(other => other.peer === from);
        if (message.t === "hello" && message.rejoin !== undefined && this.start) {
            // Before anything else: back in the room, a guest may well have its old peer number again.
            this.Rejoin(from, message.version, message.rejoin);
        } else if (message.t === "hello") {
            if (seat) {
                // Said twice: they've missed what was said, so say it again.
                this.Send(from, { t: "lobby", seats: this.seats });
            } else if (message.version !== NetVersion) {
                this.Send(from, { t: "refused", reason: "version" });
            } else if (this.start) {
                this.Send(from, { t: "refused", reason: "started" });
            } else if (this.seats.length >= RoomSeats) {
                this.Send(from, { t: "refused", reason: "full" });
            } else {
                // Every name its own, so a whisper's @name always means one player.
                const name = UniqueName(CleanName(message.name, SeatName(this.seats.length)), this.seats.map(other => other.name));
                this.seats.push({ peer: from, name, character: null });
                this.seats.sort((a, b) => a.peer - b.peer);
                this.Changed();
            }
        } else if (message.t === "pick" && seat && !this.start) {
            seat.character = message.character;
            this.Changed();
        } else if (message.t === "need-level" && seat && this.start) {
            this.Packed().then(packed => this.Send(from, { t: "level", packed }));
        } else if (message.t === "say" && seat && this.limiter.Allow(from)) {
            const index = this.seats.indexOf(seat);
            // What can't be said was already told the guest, by its own lobby reading it first: nothing to send back.
            const parsed = this.Parse(message.text, index);
            if (parsed && typeof parsed !== "string") {
                this.Pass(index, parsed.text, parsed.to);
            }
        }
    }

    protected OnPeerLeft(peer: number): void {
        // Once the run has begun, a seat is kept: whoever had it may come back (see `Rejoin`).
        if (this.start) {
            return;
        }
        const before = this.seats.length;
        this.seats = this.seats.filter(seat => seat.peer !== peer);
        if (this.seats.length !== before) {
            this.Changed();
        }
    }

    /** Peer `from` says hello with the `token` a guest's start gave it: back in the run as that guest's hero, if the run will have them. */
    private Rejoin(from: number, version: number, token: string): void {
        const index = this.tokens.indexOf(token);
        if (version !== NetVersion) {
            this.Send(from, { t: "refused", reason: "version" });
        } else if (index <= 0 || !this.rejoin) {
            this.Send(from, { t: "refused", reason: "started" });
        } else if (!this.rejoin.CanRejoin(index)) {
            this.Send(from, { t: "refused", reason: "gone" });
        } else {
            this.seats = this.seats.map((seat, i) => (i === index ? { ...seat, peer: from } : seat));
            // Told first, so it's listening as the run's catch-up comes.
            this.Send(from, { t: "rejoined" });
            this.rejoin.Rejoin(index, from);
            this.emit(LobbyEvents.CHANGED);
        }
    }

    /** A line said by the player in seat `seat`: to everyone - or whispered to seat `to`, and heard only there and by who said it. */
    private Pass(seat: number, text: string, to: number | null): void {
        const speaker = this.seats[seat];
        const target = to === null ? undefined : this.seats[to];
        const line: ChatLine = { seat, from: speaker.name, text: CleanChat(text) };
        if (target) {
            line.whisper = { seat: to!, name: target.name };
        }
        const hearers = target ? [speaker, target] : this.seats;
        hearers.forEach(hearer => {
            if (hearer.peer === RelayHost) {
                this.Hear(line);
            } else {
                this.Send(hearer.peer, { t: "chat", line });
            }
        });
    }

    /** Everyone let in but the host. */
    private Guests(): LobbySeat[] {
        return this.seats.filter(seat => seat.peer !== RelayHost);
    }

    /** Tells every guest let in how the lobby stands, and this machine that it's changed. */
    private Changed(): void {
        // To each guest let in, not a broadcast: one still saying hello isn't listening yet.
        this.Guests().forEach(seat => this.Send(seat.peer, { t: "lobby", seats: this.seats }));
        this.emit(LobbyEvents.CHANGED);
    }

    private Packed(): Promise<Uint8Array> {
        if (!this.packed) {
            this.packed = PackLevel(this.level!);
        }
        return this.packed;
    }
}

export type GuestLobbyOptions = {
    /** What the player calls themselves. */
    name: string;
    /**
     * This machine's own copy of the game's level in `bundle` (loaded for it), or undefined for none - played
     * if it's the host's. The host's is sent whole when it isn't.
     */
    shippedLevel: (bundle: string | null) => Promise<LevelFile | undefined>;
    /**
     * A new place in the same room (`RelaySession.Join` with its `Code`), on a new connection - how a guest whose
     * connection goes during the run gets back in. Undefined, and the lobby closes when the connection does.
     */
    reconnect?: () => Promise<RelaySession>;
};

/** A guest's lobby: says hello, shows what the host says, picks, starts when the host does, and gets back into the run if its connection goes. */
export class GuestLobby extends Lobby {
    /** The start the host sent, while its level is made ready. */
    private start: { seed: number; level: StartLevel; seats: LobbySeat[] } | null = null;
    /** Whether the level is coming whole from the host. */
    private awaitingLevel = false;
    /** What the host's start gave to come back into the run with - null before then, or from a host that gave none. */
    private token: string | null = null;
    /** Whether the run has begun here (`STARTED`) - only then does it try to get back in when its connection goes. */
    private begun = false;
    /** This guest's hero, by slot, once the run has begun. */
    private you = -1;
    /** Whether the connection has gone, and it's trying to get back in. */
    private reconnecting = false;
    /** While a try to get back in waits for the host's answer: what takes it - "rejoined", a refusal's reason, or "lost". */
    private answer: ((answer: string) => void) | null = null;
    /** What stops it listening for the room going quiet. */
    private watch: ReturnType<typeof setInterval> | null = null;

    /** Joins the lobby in the room `session` has joined (see `RelaySession.Join`). */
    constructor(session: RelaySession, private options: GuestLobbyOptions) {
        super(session);
        this.Send(RelayHost, { t: "hello", version: NetVersion, name: CleanName(options.name, "") });
    }

    /** Whether the host has let this guest in. */
    get Joined(): boolean {
        return !!this.Mine;
    }

    /** Whether the host has started - the level may still be on its way. */
    get Started(): boolean {
        return !!this.start;
    }

    /** Whether its connection has gone during the run and it's trying to get back in - see `DROPPED`, `REJOINED`. */
    get Reconnecting(): boolean {
        return this.reconnecting;
    }

    /** Asks the host for this pick (a character id), or null to take it back. `Seats` shows it once the host has it. */
    Pick(character: string | null): void {
        if (this.IsOpen && !this.start) {
            this.Send(RelayHost, { t: "pick", character });
        }
    }

    Say(typed: string): string | null {
        if (!this.IsOpen || !this.Joined) {
            return "You're not in a game.";
        }
        if (this.reconnecting) {
            return "Not connected to the host - say it again once you're back.";
        }
        // Read here first, so what can't be said is told at once; the host reads it again.
        const parsed = this.Parse(typed, this.MySeat);
        if (typeof parsed === "string") {
            return parsed;
        }
        if (parsed) {
            this.Send(RelayHost, { t: "say", text: CleanChat(typed) });
        }
        return null;
    }

    protected OnMessage(from: number, message: LobbyMessage): void {
        // Only the host speaks to guests.
        if (from !== RelayHost) {
            return;
        }
        if (this.answer && (message.t === "rejoined" || message.t === "refused")) {
            this.answer(message.t === "rejoined" ? "rejoined" : message.reason);
        } else if (message.t === "chat") {
            this.Hear(message.line);
        } else if (message.t === "lobby" && !this.start) {
            this.seats = message.seats;
            this.emit(LobbyEvents.CHANGED);
        } else if (message.t === "refused") {
            this.Close(message.reason);
        } else if (message.t === "start" && !this.start) {
            this.start = { seed: message.seed, level: message.level, seats: message.seats };
            this.seats = message.seats;
            this.token = message.token || null;
            this.you = message.seats.findIndex(seat => seat.peer === this.session.You);
            this.emit(LobbyEvents.STARTING);
            this.awaitingLevel = message.level.sent;
            if (!message.level.sent) {
                this.UseOwnLevel(message.level);
            }
        } else if (message.t === "level" && this.start && this.awaitingLevel) {
            this.awaitingLevel = false;
            UnpackLevel(message.packed).then(
                file => this.Begin(file),
                error => this.Close("the level sent couldn't be read: " + (error as Error).message)
            );
        }
    }

    protected OnPeerLeft(_peer: number): void {
        // The host says how the lobby stands; the host leaving closes the room, and with it this.
    }

    /**
     * The direct link to the host has failed: what was on its way over it may be lost. During the run that's taken as
     * the connection gone - it gets back in, and is told what it missed. Before, the relay carries on.
     */
    protected OnUnlinked(peer: number, wasOpen: boolean): void {
        if (peer === RelayHost && wasOpen && this.begun && !this.reconnecting) {
            this.session.Drop("link");
        }
    }

    /** Its connection has gone: during the run, it tries to get back in - else, or when it left, or the host did, it closes. */
    protected OnSessionClosed(reason: string): void {
        if (this.answer) {
            // A try to get back in has lost its connection too.
            this.answer("lost");
        } else if (this.reconnecting) {
            return;
        } else if (reason === "left" || reason === "host-left" || !this.begun || !this.token || !this.options.reconnect || !this.IsOpen) {
            this.Close(reason);
        } else {
            this.Reconnect();
        }
    }

    protected Close(reason: string): void {
        if (this.watch !== null) {
            clearInterval(this.watch);
            this.watch = null;
        }
        this.reconnecting = false;
        if (this.answer) {
            this.answer("lost");
        }
        super.Close(reason);
    }

    /** Takes the connection for lost if nothing comes from the room for `QuietForMs` - one that has died without closing. */
    private WatchForQuiet(): void {
        if (this.watch !== null || !this.options.reconnect) {
            return;
        }
        this.heardAt = Date.now();
        this.watch = setInterval(() => {
            if (!this.reconnecting && Date.now() - this.heardAt > QuietForMs) {
                this.session.Drop("quiet");
            }
        }, 1000);
    }

    /**
     * Tries to get back into the run, after its connection went: a new place in the room, then a hello with its token -
     * again and again, a little longer apart each time, for up to `ReconnectForMs`. Closes when it can't: the room is
     * gone (`host-left`), the host won't have it back (its reason), or time's up (`lost`).
     */
    private async Reconnect(): Promise<void> {
        const since = Date.now();
        this.reconnecting = true;
        this.emit(LobbyEvents.DROPPED);
        for (let tries = 0; this.IsOpen; tries++) {
            await new Promise(resolve => setTimeout(resolve, RetryDelaysMs[Math.min(tries, RetryDelaysMs.length - 1)]));
            if (!this.IsOpen) {
                return;
            }
            if (Date.now() - since >= ReconnectForMs) {
                this.Close("lost");
                return;
            }
            let session: RelaySession;
            try {
                session = await this.options.reconnect!();
            } catch (error) {
                if (error instanceof RelayRefusedError && error.reason === "no-room") {
                    this.Close("host-left");
                    return;
                }
                continue;
            }
            if (!this.IsOpen) {
                session.Leave();
                return;
            }
            const answer = await this.AskBack(session);
            if (answer === "rejoined") {
                return;
            }
            if (answer !== "lost") {
                this.Close(answer);
                return;
            }
        }
    }

    /**
     * Says hello in `session` - a new place in the room - with its token, and waits for the host's answer: "rejoined"
     * (and it's back), a refusal's reason, or "lost".
     */
    private AskBack(session: RelaySession): Promise<string> {
        return new Promise<string>(resolve => {
            const finish = (answer: string) => {
                clearTimeout(timer);
                if (this.answer === finish) {
                    this.answer = null;
                }
                if (answer === "rejoined") {
                    this.Back(session);
                } else if (answer === "lost") {
                    session.Leave();
                }
                resolve(answer);
            };
            const timer = setTimeout(() => finish("lost"), RejoinAnswerMs);
            this.answer = finish;
            this.Bind(session);
            this.Send(RelayHost, { t: "hello", version: NetVersion, name: CleanName(this.options.name, ""), rejoin: this.token! });
        });
    }

    /**
     * Back in the run, as `session`. Said at once, as the host's answer comes - not a moment later - so the run is
     * listening there for what the host sends straight after it (see `CreateNetPlay`).
     */
    private Back(session: RelaySession): void {
        this.reconnecting = false;
        this.heardAt = Date.now();
        this.seats = this.seats.map((seat, i) => (i === this.you ? { ...seat, peer: session.You } : seat));
        this.emit(LobbyEvents.REJOINED);
    }

    /** Plays this machine's own copy of the level if it's the host's - or asks for the host's. */
    private async UseOwnLevel(level: StartLevel): Promise<void> {
        let file: LevelFile | undefined;
        try {
            file = await this.options.shippedLevel(level.bundle);
        } catch {
            file = undefined;
        }
        if (!this.IsOpen) {
            return;
        }
        if (file && LevelHash(file) === level.hash) {
            this.Begin(file);
        } else {
            this.awaitingLevel = true;
            this.Send(RelayHost, { t: "need-level" });
        }
    }

    private Begin(file: LevelFile): void {
        const start = this.start;
        if (start && this.IsOpen) {
            this.begun = true;
            this.WatchForQuiet();
            this.emit(LobbyEvents.STARTED, this.StartFor(start.seed, start.level.bundle, file, start.seats));
        }
    }
}
