import { describe, expect, it } from "vitest";
import { LoopbackRelay } from "@logic-incubator/lib/net/Loopback";
import RelaySession from "@logic-incubator/lib/net/RelaySession";
import type { LevelFile } from "../level/LevelFormat";
import { GuestLobby, HostLobby, LobbyClosedText, LobbyEvents, LobbyStart } from "./Lobby";
import { EncodeMessage, NetVersion } from "./NetMessages";

/** Lets every message already on its way arrive, and what they set off - packing a level included. */
async function Settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

function Level(name: string): LevelFile {
    return { editorData: { layers: [] }, levelData: { levelData: [{ name } as never] } };
}

const Shipped = Level("shipped");

async function Room(): Promise<{ relay: LoopbackRelay; host: HostLobby }> {
    const relay = new LoopbackRelay();
    const host = new HostLobby(await RelaySession.Host(relay.Connect(), "dungeon"), "Hostess");
    return { relay, host };
}

/** A guest whose own copy of the game's level is `own`, counting how often it's asked for it. */
async function Guest(relay: LoopbackRelay, code: string, name: string, own: LevelFile | undefined = Shipped): Promise<GuestLobby & { asked: number }> {
    const session = await RelaySession.Join(relay.Connect(), "dungeon", code);
    const guest = new GuestLobby(session, {
        name,
        shippedLevel: async bundle => {
            guest.asked++;
            return bundle === "level1" ? own : undefined;
        }
    }) as GuestLobby & { asked: number };
    guest.asked = 0;
    return guest;
}

function Started(lobby: HostLobby | GuestLobby): { start: LobbyStart | null } {
    const result: { start: LobbyStart | null } = { start: null };
    lobby.on(LobbyEvents.STARTED, (start: LobbyStart) => (result.start = start));
    return result;
}

/** The start, once the lobby has one - a level being packed and unpacked takes a little while. */
function NextStart(lobby: HostLobby | GuestLobby): Promise<LobbyStart> {
    return new Promise(resolve => lobby.once(LobbyEvents.STARTED, resolve));
}

function Closed(lobby: HostLobby | GuestLobby): string[] {
    const reasons: string[] = [];
    lobby.on(LobbyEvents.CLOSED, (reason: string) => reasons.push(reason));
    return reasons;
}

describe("HostLobby and GuestLobby", () => {
    it("let guests in after they say hello, and show everyone the same seats", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        const kit = await Guest(relay, host.Code, "");
        await Settle();
        const seats = [
            { peer: 0, name: "Hostess", character: null },
            { peer: 1, name: "Sam", character: null },
            { peer: 2, name: "PLAYER 3", character: null }
        ];
        expect(host.Seats).toEqual(seats);
        expect(sam.Seats).toEqual(seats);
        expect(kit.Seats).toEqual(seats);
        expect(sam.Joined).toBe(true);
        expect(kit.Mine).toEqual(seats[2]);
    });

    it("pass picks round, and can start once everyone has picked", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        await Settle();
        let changes = 0;
        sam.on(LobbyEvents.CHANGED, () => changes++);
        host.Pick("witch");
        expect(host.CanStart).toBe(false);
        sam.Pick("warlock");
        await Settle();
        expect(host.Seats.map(seat => seat.character)).toEqual(["witch", "warlock"]);
        expect(sam.Seats.map(seat => seat.character)).toEqual(["witch", "warlock"]);
        expect(changes).toBe(2);
        expect(host.CanStart).toBe(true);
        sam.Pick(null);
        await Settle();
        expect(host.CanStart).toBe(false);
    });

    it("start everyone on the game's own level, a guest playing its own copy", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        await Settle();
        host.Pick("witch");
        sam.Pick("warlock");
        await Settle();
        const atHost = Started(host);
        const atSam = Started(sam);
        let starting = 0;
        sam.on(LobbyEvents.STARTING, () => starting++);

        await host.Start({ bundle: "level1", file: Shipped, shipped: true }, 42);
        await Settle();
        expect(starting).toBe(1);
        expect(sam.asked).toBe(1);
        expect(atHost.start).toEqual({ seed: 42, bundle: "level1", level: Shipped, seats: host.Seats, you: 0 });
        expect(atSam.start).toEqual({ seed: 42, bundle: "level1", level: Shipped, seats: host.Seats, you: 1 });
        expect(atSam.start!.level).toBe(Shipped);
    });

    it("send the level whole to a guest whose copy differs", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam", Level("an older one"));
        const kit = await Guest(relay, host.Code, "Kit", undefined);
        await Settle();
        [host, sam, kit].forEach(lobby => lobby.Pick("witch"));
        await Settle();
        const atSam = NextStart(sam);
        const atKit = NextStart(kit);
        await host.Start({ bundle: "level1", file: Shipped, shipped: true });
        const [samStart, kitStart] = await Promise.all([atSam, atKit]);
        expect(samStart.level).toEqual(Shipped);
        expect(kitStart.level).toEqual(Shipped);
        expect(samStart.seed).toBe(kitStart.seed);
    });

    it("send an editor level whole to everyone, without asking for their own", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        await Settle();
        host.Pick("witch");
        sam.Pick("witch");
        await Settle();
        const atSam = NextStart(sam);
        const edited = Level("edited");
        await host.Start({ bundle: "level1", file: edited, shipped: false });
        expect((await atSam).level).toEqual(edited);
        expect(sam.asked).toBe(0);
    });

    it("won't start before everyone has picked, or twice", async () => {
        const { relay, host } = await Room();
        await Guest(relay, host.Code, "Sam");
        await Settle();
        host.Pick("witch");
        await expect(host.Start({ bundle: null, file: Shipped, shipped: true })).rejects.toThrow("Not everyone");
    });

    it("turn away a guest once the run has started, and one on another version", async () => {
        const { relay, host } = await Room();
        host.Pick("witch");
        await host.Start({ bundle: null, file: Shipped, shipped: true });
        const late = await Guest(relay, host.Code, "Late");
        const lateClosed = Closed(late);
        await Settle();
        expect(lateClosed).toEqual(["started"]);
        expect(late.IsOpen).toBe(false);

        const other = await Room();
        const session = await RelaySession.Join(other.relay.Connect(), "dungeon", other.host.Code);
        const refusals: number[] = [];
        session.on("message", (_from: number, payload: Uint8Array) => refusals.push(payload[0]));
        session.Send(0, EncodeMessage({ t: "hello", version: NetVersion + 1, name: "Future" }));
        await Settle();
        expect(refusals).toEqual([EncodeMessage({ t: "refused", reason: "version" })[0]]);
        expect(other.host.Seats).toHaveLength(1);
    });

    it("free a guest's seat when they leave", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        const kit = await Guest(relay, host.Code, "Kit");
        await Settle();
        sam.Leave();
        await Settle();
        expect(host.Seats.map(seat => seat.name)).toEqual(["Hostess", "Kit"]);
        expect(kit.Seats.map(seat => seat.name)).toEqual(["Hostess", "Kit"]);
    });

    it("close every guest's lobby when the host leaves", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        await Settle();
        const samClosed = Closed(sam);
        const hostClosed = Closed(host);
        host.Leave();
        await Settle();
        expect(hostClosed).toEqual(["left"]);
        expect(samClosed).toEqual(["host-left"]);
        expect(LobbyClosedText(samClosed[0])).toBe("The host has left.");
    });
});
