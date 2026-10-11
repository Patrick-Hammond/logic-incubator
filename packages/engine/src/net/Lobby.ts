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
 */

import { EventEmitter } from "eventemitter3";
import RelaySession, { RelayEvents } from "@logic-incubator/lib/net/RelaySession";
import { RelayHost, RoomSeats } from "@logic-incubator/lib/net/RelayRooms";
import type { LevelFile } from "../level/LevelFormat";
import { NewSeed } from "../Random";
import { LevelHash, PackLevel, UnpackLevel } from "./LevelTransfer";
import { CleanName, DecodeMessage, EncodeMessage, LobbyMessage, LobbySeat, NetVersion, StartLevel } from "./NetMessages";

/** Events a lobby emits. */
export const LobbyEvents = {
    /** () - someone joined, left or picked: `Seats` has changed. */
    CHANGED: "changed",
    /** () - a guest's: the host has started, and the level is being made ready (it may have to be sent). */
    STARTING: "starting",
    /** (start: LobbyStart) - the run begins: everything a machine needs to start the same level as the rest. */
    STARTED: "started",
    /** (reason: string) - the lobby is over before or after a start: see `LobbyClosedText`. Emitted once. */
    CLOSED: "closed"
};

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
        default:
            return "Lost the connection (" + reason + ").";
    }
}

/** The fallback name for a seat's player who gave none. */
function SeatName(index: number): string {
    return "PLAYER " + (index + 1);
}

/** What the two lobbies share: the room, the seats, and leaving. */
abstract class Lobby extends EventEmitter {
    protected seats: LobbySeat[] = [];
    private over = false;

    constructor(protected session: RelaySession) {
        super();
        session.on(RelayEvents.MESSAGE, (from: number, payload: Uint8Array) => {
            const message = DecodeMessage(payload);
            if (message && !this.over) {
                this.OnMessage(from, message);
            }
        });
        session.on(RelayEvents.PEER_LEFT, (peer: number) => this.OnPeerLeft(peer));
        session.on(RelayEvents.CLOSED, (reason: string) => this.Close(reason));
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

    /** Whether it's still open: not left, closed by the host, or cut off. */
    get IsOpen(): boolean {
        return !this.over;
    }

    /** Leaves the room - which closes it for everyone, from the host. */
    Leave(): void {
        this.session.Leave();
    }

    protected abstract OnMessage(from: number, message: LobbyMessage): void;
    protected abstract OnPeerLeft(peer: number): void;

    protected Send(to: number, message: LobbyMessage): void {
        this.session.Send(to, EncodeMessage(message));
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

/** The host's lobby: lets guests in, keeps their picks, and starts the run. */
export class HostLobby extends Lobby {
    /** The start, once it's been made - guests who come after are turned away. */
    private start: StartLevel | null = null;
    private level: LevelFile | null = null;
    /** The level packed to send, made once when first needed. */
    private packed: Promise<Uint8Array> | null = null;

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

    /**
     * Starts the run - when `CanStart` - on `level`, with random numbers from `seed` (a new one by default): tells every
     * guest, sends the level to them if it isn't the game's own, and emits `STARTED` here.
     */
    async Start(level: HostLevel, seed: number = NewSeed()): Promise<LobbyStart> {
        if (!this.CanStart) {
            throw new Error(this.start ? "The run has already started." : "Not everyone has picked a character.");
        }
        const seats = this.seats.map(seat => ({ ...seat }));
        const start = this.start = { bundle: level.bundle, hash: LevelHash(level.file), sent: !level.shipped };
        this.level = level.file;
        this.Guests().forEach(seat => this.Send(seat.peer, { t: "start", seed, level: start, seats }));
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
        if (message.t === "hello") {
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
                this.seats.push({ peer: from, name: CleanName(message.name, SeatName(this.seats.length)), character: null });
                this.seats.sort((a, b) => a.peer - b.peer);
                this.Changed();
            }
        } else if (message.t === "pick" && seat && !this.start) {
            seat.character = message.character;
            this.Changed();
        } else if (message.t === "need-level" && seat && this.start) {
            this.Packed().then(packed => this.Send(from, { t: "level", packed }));
        }
    }

    protected OnPeerLeft(peer: number): void {
        const before = this.seats.length;
        this.seats = this.seats.filter(seat => seat.peer !== peer);
        if (this.seats.length !== before) {
            this.Changed();
        }
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
};

/** A guest's lobby: says hello, shows what the host says, picks, and starts when the host does. */
export class GuestLobby extends Lobby {
    /** The start the host sent, while its level is made ready. */
    private start: { seed: number; level: StartLevel; seats: LobbySeat[] } | null = null;
    /** Whether the level is coming whole from the host. */
    private awaitingLevel = false;

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

    /** Asks the host for this pick (a character id), or null to take it back. `Seats` shows it once the host has it. */
    Pick(character: string | null): void {
        if (this.IsOpen && !this.start) {
            this.Send(RelayHost, { t: "pick", character });
        }
    }

    protected OnMessage(from: number, message: LobbyMessage): void {
        // Only the host speaks to guests.
        if (from !== RelayHost) {
            return;
        }
        if (message.t === "lobby" && !this.start) {
            this.seats = message.seats;
            this.emit(LobbyEvents.CHANGED);
        } else if (message.t === "refused") {
            this.Close(message.reason);
        } else if (message.t === "start" && !this.start) {
            this.start = { seed: message.seed, level: message.level, seats: message.seats };
            this.seats = message.seats;
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
            this.emit(LobbyEvents.STARTED, this.StartFor(start.seed, start.level.bundle, file, start.seats));
        }
    }
}
