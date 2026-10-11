/**
 * What the host's and a guest's sessions share (see `HostSession`,
 * `GuestSession`): listening to the room for messages of play, pinging the
 * others once a second for the round trip, and stopping. Pure - no pixi - so
 * it runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { ByteWriter } from "@logic-incubator/lib/net/Bytes";
import RelaySession, { RelayEvents } from "@logic-incubator/lib/net/RelaySession";
import type { EncounterView } from "../Encounter";
import type { IPlayerInput } from "../input/PlayerControl";
import type { LobbySeat } from "./NetMessages";
import type { NetLevelContext, NetPlay } from "./NetPlay";
import { DecodePlay, EncodePlay, PlayMessage } from "./PlayMessages";

/** How often each end pings the others, in milliseconds. */
const PingEveryMs = 1000;
/** Share of the way the round trip shown moves to each new measure. */
const RttWeight = 0.3;

export type PlaySessionOptions = {
    /** This machine's clock, in milliseconds - `performance.now` by default. A test's own makes time its to set. */
    now?: () => number;
};

export default abstract class PlaySession implements NetPlay {
    abstract readonly IsHost: boolean;
    abstract readonly Entities: EncounterView | null;
    /** The hero played here. */
    readonly You: number;
    protected context: NetLevelContext | null = null;
    protected now: () => number;
    private writer = new ByteWriter(1024);
    private stops: Array<() => void> = [];
    protected ended = false;
    private pingId = 0;
    private pingAt = -Infinity;
    /** When each ping still unanswered went, by peer and id (`"2:17"`). */
    private pings = new Map<string, number>();
    private rtt = new Map<number, number>();

    /** Plays the run `session` is in, whose heroes are `seats` (the lobby's start, in hero order). */
    constructor(protected session: RelaySession, protected seats: ReadonlyArray<LobbySeat>, options: PlaySessionOptions = {}) {
        this.now = options.now || (() => performance.now());
        this.You = seats.findIndex(seat => seat.peer === session.You);
        this.Listen(session);
    }

    /** Whether it has ended - `End`, or the room closing. */
    get Ended(): boolean {
        return this.ended || !this.session.IsOpen;
    }

    /** Whether this machine is in touch with the run - always, on the host, until it ends. */
    get Connected(): boolean {
        return !this.Ended;
    }

    abstract Begin(context: NetLevelContext): void;
    abstract Step(local: ReadonlyArray<IPlayerInput | undefined>): void;
    abstract Frame(frames: number): void;
    abstract Stats(): string[];

    DrawOffset(_index: number): Vec2Like | null {
        return null;
    }

    Record(_event: string, _args: ReadonlyArray<unknown>): void {
        // Only the host sends on what happens.
    }

    Restart(): void {
        // Only the host starts a level over.
    }

    End(): void {
        if (!this.ended) {
            this.ended = true;
            this.context = null;
            this.stops.splice(0).forEach(stop => stop());
        }
    }

    /** Listens to `session` for messages of play, and for peers leaving - instead of any it listened to before. */
    protected Listen(session: RelaySession): void {
        this.stops.splice(0).forEach(stop => stop());
        this.session = session;
        const message = (from: number, payload: Uint8Array) => {
            const decoded = this.ended ? null : DecodePlay(payload);
            if (decoded) {
                this.Receive(from, decoded, payload.length);
            }
        };
        const left = (peer: number) => !this.ended && this.PeerLeft(peer);
        session.on(RelayEvents.MESSAGE, message);
        session.on(RelayEvents.PEER_LEFT, left);
        this.stops.push(() => session.off(RelayEvents.MESSAGE, message), () => session.off(RelayEvents.PEER_LEFT, left));
    }

    /** A message of play from peer `from`, `bytes` long. Pings are answered here; the rest are the session's own. */
    protected Receive(from: number, message: PlayMessage, bytes: number): void {
        if (message.t === "ping") {
            this.Send(from, { t: "pong", id: message.id });
        } else if (message.t === "pong") {
            const key = from + ":" + message.id;
            const sent = this.pings.get(key);
            if (sent !== undefined) {
                this.pings.delete(key);
                const sample = this.now() - sent;
                const was = this.rtt.get(from);
                this.rtt.set(from, was === undefined ? sample : was + (sample - was) * RttWeight);
            }
        } else {
            this.OnMessage(from, message, bytes);
        }
    }

    protected abstract OnMessage(from: number, message: PlayMessage, bytes: number): void;

    protected PeerLeft(_peer: number): void {
        // The host takes the guest's hero out; a guest hears of it from the host.
    }

    /** Sends a message to peer `to`. Returns its size in bytes. */
    protected Send(to: number, message: PlayMessage): number {
        if (this.Ended) {
            return 0;
        }
        const bytes = EncodePlay(message, this.writer);
        this.session.Send(to, bytes);
        return bytes.length;
    }

    /** Sends a message to everyone else in the room. Returns its size in bytes. */
    protected Broadcast(message: PlayMessage): number {
        if (this.Ended) {
            return 0;
        }
        const bytes = EncodePlay(message, this.writer);
        this.session.Broadcast(bytes);
        return bytes.length;
    }

    /** Pings each of `peers`, if a second has passed since the last. */
    protected PingNow(peers: ReadonlyArray<number>): void {
        const now = this.now();
        if (now - this.pingAt < PingEveryMs) {
            return;
        }
        this.pingAt = now;
        const id = this.pingId = (this.pingId + 1) & 0xffff;
        // Unanswered ones from long ago won't be.
        Array.from(this.pings.keys()).forEach(old => {
            if (now - this.pings.get(old)! > PingEveryMs * 10) {
                this.pings.delete(old);
            }
        });
        peers.forEach(peer => {
            this.pings.set(peer + ":" + id, now);
            this.Send(peer, { t: "ping", id });
        });
    }

    /** The round trip to peer `peer`, in milliseconds, smoothed - undefined before the first. */
    protected RoundTrip(peer: number): number | undefined {
        return this.rtt.get(peer);
    }
}

/** A number of bytes as a person reads it: `"840 B"`, `"1.4 KB"`. */
export function BytesText(bytes: number): string {
    return bytes < 1024 ? Math.round(bytes) + " B" : (bytes / 1024).toFixed(1) + " KB";
}

/** Bytes a second, over the last second or so. */
export class ByteRate {
    private samples: Array<{ at: number; bytes: number }> = [];
    private last = 0;

    /** The size of the last one counted. */
    get Last(): number {
        return this.last;
    }

    Add(bytes: number, now: number): void {
        this.last = bytes;
        this.samples.push({ at: now, bytes });
        this.Trim(now);
    }

    PerSecond(now: number): number {
        this.Trim(now);
        let total = 0;
        this.samples.forEach(sample => (total += sample.bytes));
        return total;
    }

    private Trim(now: number): void {
        while (this.samples.length && now - this.samples[0].at > 1000) {
            this.samples.shift();
        }
    }
}
