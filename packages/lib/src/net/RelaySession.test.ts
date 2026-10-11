import { describe, expect, it } from "vitest";
import { LoopbackRelay } from "./Loopback";
import { RelayHost } from "./RelayRooms";
import RelaySession, { RelayEvents, RelayRefusedError } from "./RelaySession";

/** Lets every delivery already on its way arrive. */
function Settle(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function Heard(session: RelaySession): Array<[number, number[]]> {
    const heard: Array<[number, number[]]> = [];
    session.on(RelayEvents.MESSAGE, (from: number, payload: Uint8Array) => heard.push([from, Array.from(payload)]));
    return heard;
}

describe("RelaySession", () => {
    it("hosts a room and lets a guest join it by its code", async () => {
        const relay = new LoopbackRelay();
        const host = await RelaySession.Host(relay.Connect(), "dungeon");
        expect(host.IsHost).toBe(true);
        expect(host.You).toBe(RelayHost);
        expect(host.Code).toHaveLength(5);

        const joined: number[] = [];
        host.on(RelayEvents.PEER_JOINED, (peer: number) => joined.push(peer));
        const guest = await RelaySession.Join(relay.Connect(), "dungeon", host.Code.toLowerCase());
        await Settle();
        expect(guest.IsHost).toBe(false);
        expect(guest.You).toBe(1);
        expect(guest.Peers).toEqual([0]);
        expect(joined).toEqual([1]);
        expect(host.Peers).toEqual([1]);
    });

    it("carries bytes between peers, to one or to all", async () => {
        const relay = new LoopbackRelay();
        const host = await RelaySession.Host(relay.Connect(), "dungeon");
        const first = await RelaySession.Join(relay.Connect(), "dungeon", host.Code);
        const second = await RelaySession.Join(relay.Connect(), "dungeon", host.Code);
        const atHost = Heard(host);
        const atFirst = Heard(first);
        const atSecond = Heard(second);

        host.Send(2, new Uint8Array([1, 2]));
        first.Broadcast(new Uint8Array([3]));
        await Settle();
        expect(atSecond).toEqual([[0, [1, 2]], [1, [3]]]);
        expect(atHost).toEqual([[1, [3]]]);
        expect(atFirst).toEqual([]);
    });

    it("rejects a join the relay refuses, with why, and closes the connection", async () => {
        const relay = new LoopbackRelay();
        const transport = relay.Connect();
        const joining = RelaySession.Join(transport, "dungeon", "BCDFG");
        await expect(joining).rejects.toBeInstanceOf(RelayRefusedError);
        await expect(joining).rejects.toMatchObject({ reason: "no-room", message: "There's no game with that code." });
        expect(transport.IsOpen).toBe(false);
    });

    it("rejects when the connection ends before an answer", async () => {
        const relay = new LoopbackRelay();
        const transport = relay.Connect();
        const hosting = RelaySession.Host(transport, "dungeon");
        transport.Close();
        await expect(hosting).rejects.toThrow("Lost the relay");
    });

    it("tells the others when a guest leaves", async () => {
        const relay = new LoopbackRelay();
        const host = await RelaySession.Host(relay.Connect(), "dungeon");
        const guest = await RelaySession.Join(relay.Connect(), "dungeon", host.Code);
        const left: number[] = [];
        const closed: string[] = [];
        host.on(RelayEvents.PEER_LEFT, (peer: number) => left.push(peer));
        guest.on(RelayEvents.CLOSED, (reason: string) => closed.push(reason));
        guest.Leave();
        await Settle();
        expect(left).toEqual([1]);
        expect(host.Peers).toEqual([]);
        expect(closed).toEqual(["left"]);
        expect(guest.IsOpen).toBe(false);
    });

    it("ends every guest's session when the host leaves", async () => {
        const relay = new LoopbackRelay();
        const host = await RelaySession.Host(relay.Connect(), "dungeon");
        const guest = await RelaySession.Join(relay.Connect(), "dungeon", host.Code);
        const closed: string[] = [];
        guest.on(RelayEvents.CLOSED, (reason: string) => closed.push(reason));
        host.Leave();
        await Settle();
        expect(closed).toEqual(["host-left"]);
        expect(guest.IsOpen).toBe(false);
        expect(relay.rooms.RoomCount).toBe(0);
    });
});
