/**
 * What `DungeonMain` plays an online run through - a `HostSession` on the
 * host's machine, a `GuestSession` on each guest's - and what it hands one as
 * each level starts. Pure - no pixi - so it runs under the plain node test
 * runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import type { EncounterView } from "../Encounter";
import type { IPlayerInput } from "../input/PlayerControl";
import type World from "../sim/World";
import type { WorldLevel } from "../sim/World";
import GuestSession from "./GuestSession";
import HostSession from "./HostSession";
import { GuestLobby, HostLobby, LobbyEvents, LobbyStart } from "./Lobby";
import type { PlaySessionOptions } from "./PlaySession";

/** The parts of `Level` an online session uses, on top of what the world does. */
export interface NetLevel extends WorldLevel {
    /** Every door, in the level's order - what a snapshot's door bits follow. */
    readonly doors: ReadonlyArray<{ readonly isOpen: boolean }>;
    SetDoorOpen(index: number, open: boolean): void;
}

/** What a session plays a level with, handed over as it starts (see `NetPlay.Begin`). */
export type NetLevelContext = {
    /** The level's world, just `Reset` - stepped by the host's session, copied into by a guest's. */
    world: World;
    level: NetLevel;
    /** The game's dispatcher - where a guest's copies of the host's events go (see Events.ts). */
    emit: (event: string, ...args: unknown[]) => void;
    /** Starts the level over on this machine - what a guest does when the host does. */
    restart: () => void;
    /** Pixel size of a sprite - see `EncounterOptions.sizeFor`. */
    sizeFor: (name: string) => { width: number; height: number } | undefined;
};

export interface NetPlay {
    /** Whether this machine is the host - whose world is the run's. */
    readonly IsHost: boolean;
    /** The hero played on this machine. */
    readonly You: number;
    /** Whether this machine is in touch with the run - false on a guest while its connection is gone and it's trying to get back in (see `GuestLobby`). */
    readonly Connected: boolean;
    /** What to draw of the monsters, shots and spawners: the world's own encounter on the host, the copy of it on a guest. */
    readonly Entities: EncounterView | null;
    /** A level has started on this machine (every `LEVEL_CREATED`). */
    Begin(context: NetLevelContext): void;
    /** One step of play (a 60th of a second): `local` is what each hero played on this machine does, by slot. */
    Step(local: ReadonlyArray<IPlayerInput | undefined>): void;
    /** One display frame, `frames` 60ths of a second after the last, before anything is drawn. */
    Frame(frames: number): void;
    /** How far from where they are hero `index` is drawn, in pixels - a guest's own hero, while a correction is drawn away (see `Prediction`) - or null. */
    DrawOffset(index: number): Vec2Like | null;
    /** An event of the world's, as it's emitted - what the host sends on with its next snapshot. */
    Record(event: string, args: ReadonlyArray<unknown>): void;
    /** The host is starting the level over: so is everyone. Only the host's does anything. */
    Restart(): void;
    /** A few lines on how the connection is doing, for a developer's eye. */
    Stats(): string[];
    /** The run is over on this machine: stops listening and sending. */
    End(): void;
}

/**
 * The run that `lobby` has just started (its `STARTED` event's `start`), played on this machine: a `HostSession` for
 * the host, a `GuestSession` for a guest, in the lobby's room - and kept there when a guest's connection goes and it
 * gets back in (the host's lobby asks the host's session whether it may; a guest's moves its session to the new
 * connection). Hand it to `DungeonMain` (`DungeonMainOptions.net`), and `End` it when the run is over here.
 */
export function CreateNetPlay(lobby: HostLobby | GuestLobby, start: LobbyStart, options?: PlaySessionOptions): NetPlay {
    if (lobby instanceof HostLobby) {
        const host = new HostSession(lobby.Session, start.seats, options);
        lobby.SetRejoin(host);
        return host;
    }
    const guest = new GuestSession(lobby.Session, start.seats, options);
    lobby.on(LobbyEvents.REJOINED, () => guest.Rejoin(lobby.Session));
    return guest;
}
