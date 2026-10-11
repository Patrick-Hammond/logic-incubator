import { describe, expect, it } from "vitest";
import { WithLag } from "./Lag";
import { LoopbackLinks, LoopbackRelay } from "./Loopback";
import type { LinkMaker } from "./PeerLink";
import { RelayHost } from "./RelayRooms";
import RelaySession, { LinkPayload, RelayEvents, RelayRefusedError } from "./RelaySession";
import type { Message, Transport } from "./Transport";

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

    it("lets go of a connection taken for lost, with its own reason, and the others hear the guest has gone", async () => {
        const relay = new LoopbackRelay();
        const host = await RelaySession.Host(relay.Connect(), "dungeon");
        const transport = relay.Connect();
        const guest = await RelaySession.Join(transport, "dungeon", host.Code);
        const left: number[] = [];
        const closed: string[] = [];
        host.on(RelayEvents.PEER_LEFT, (peer: number) => left.push(peer));
        guest.on(RelayEvents.CLOSED, (reason: string) => closed.push(reason));
        guest.Drop("quiet");
        guest.Drop("again");
        await Settle();
        expect(closed).toEqual(["quiet"]);
        expect(guest.IsOpen).toBe(false);
        expect(transport.IsOpen).toBe(false);
        expect(left).toEqual([1]);

        // The room is still there to come back to - on a new connection, in the seat that was freed.
        const back = await RelaySession.Join(relay.Connect(), "dungeon", host.Code);
        expect(back.You).toBe(1);
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

    describe("with direct links", () => {
        /** A connection to the relay that counts the bytes sent on it - those that aren't the session's own. */
        function Counted(transport: Transport): Transport & { gameBytes: number } {
            const counted = transport as Transport & { gameBytes: number };
            counted.gameBytes = 0;
            const send = transport.Send.bind(transport);
            counted.Send = (message: Message) => {
                if (typeof message !== "string" && message[1] !== LinkPayload) {
                    counted.gameBytes += message.length;
                }
                send(message);
            };
            return counted;
        }

        /** Waits until `ready` holds, a little at a time. */
        async function Until(ready: () => boolean): Promise<void> {
            for (let i = 0; i < 200 && !ready(); i++) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            expect(ready()).toBe(true);
        }

        it("sets up a link from a guest to the host, and they talk by it once it opens", async () => {
            const relay = new LoopbackRelay();
            const links = new LoopbackLinks();
            const hostLine = Counted(relay.Connect());
            const guestLine = Counted(relay.Connect());
            const host = await RelaySession.Host(hostLine, "dungeon", { links: links.Make });
            const linked: string[] = [];
            host.on(RelayEvents.LINKED, (peer: number) => linked.push("host to " + peer));
            const guest = await RelaySession.Join(guestLine, "dungeon", host.Code, { links: links.Make });
            guest.on(RelayEvents.LINKED, (peer: number) => linked.push("guest to " + peer));
            expect(guest.LinkTo(RelayHost)).toBe("linking");
            await Until(() => linked.length === 2);
            expect(linked.sort()).toEqual(["guest to 0", "host to 1"]);
            expect(host.LinkTo(1)).toBe("direct");
            expect(guest.LinkTo(RelayHost)).toBe("direct");

            const atHost = Heard(host);
            const atGuest = Heard(guest);
            guest.Send(RelayHost, new Uint8Array([1, 2]));
            guest.Send(RelayHost, new Uint8Array([3]), true);
            host.Broadcast(new Uint8Array([4]));
            await Settle();
            expect(atHost).toEqual([[1, [1, 2]], [1, [3]]]);
            expect(atGuest).toEqual([[0, [4]]]);
            expect(hostLine.gameBytes + guestLine.gameBytes).toBe(0);
        });

        it("keeps messages in order across the switch, though the relay is slower than the link", async () => {
            const relay = new LoopbackRelay();
            const links = new LoopbackLinks();
            const host = await RelaySession.Host(relay.Connect(), "dungeon", { links: links.Make });
            let guest: RelaySession | null = null;
            const make: LinkMaker = offer => {
                const link = links.Make(offer);
                // Just before the session finds it open: one more by the relay, still on its way as the next go by the link.
                link.OnOpen(() => offer && guest!.Send(RelayHost, new Uint8Array([1])));
                return link;
            };
            guest = await RelaySession.Join(WithLag(relay.Connect(), { delayMs: 40 }), "dungeon", host.Code, { links: make });
            const atHost = Heard(host);
            await Until(() => guest!.LinkTo(RelayHost) === "direct");
            guest.Send(RelayHost, new Uint8Array([2]));
            guest.Send(RelayHost, new Uint8Array([3]));
            await Settle();
            // Here by the link, and held for the one by the relay.
            expect(atHost).toEqual([]);
            await Until(() => atHost.length === 3);
            expect(atHost).toEqual([[1, [1]], [1, [2]], [1, [3]]]);
        });

        it("lets the fast lane lose what it carries, but never the reliable one", async () => {
            const relay = new LoopbackRelay();
            const links = new LoopbackLinks({ fastLoss: 1 });
            const host = await RelaySession.Host(relay.Connect(), "dungeon", { links: links.Make });
            const guest = await RelaySession.Join(relay.Connect(), "dungeon", host.Code, { links: links.Make });
            await Until(() => host.LinkTo(1) === "direct" && guest.LinkTo(RelayHost) === "direct");
            const atGuest = Heard(guest);
            host.Send(1, new Uint8Array([1]), true);
            host.Send(1, new Uint8Array([2]));
            await Settle();
            expect(atGuest).toEqual([[0, [2]]]);
        });

        it("stays with the relay when the link never opens", async () => {
            const relay = new LoopbackRelay();
            const links = new LoopbackLinks({ unreachable: true });
            const host = await RelaySession.Host(relay.Connect(), "dungeon", { links: links.Make, linkTimeoutMs: 30 });
            const guest = await RelaySession.Join(relay.Connect(), "dungeon", host.Code, { links: links.Make, linkTimeoutMs: 30 });
            const unlinked: Array<[number, boolean]> = [];
            guest.on(RelayEvents.UNLINKED, (peer: number, wasOpen: boolean) => unlinked.push([peer, wasOpen]));
            await Until(() => unlinked.length === 1);
            expect(unlinked).toEqual([[RelayHost, false]]);
            expect(guest.LinkTo(RelayHost)).toBe("relay");
            await Until(() => host.LinkTo(1) === "relay");

            const atHost = Heard(host);
            guest.Send(RelayHost, new Uint8Array([7]), true);
            await Settle();
            expect(atHost).toEqual([[1, [7]]]);
        });

        it("goes back to the relay when an open link fails, and says it was open", async () => {
            const relay = new LoopbackRelay();
            const links = new LoopbackLinks();
            const host = await RelaySession.Host(relay.Connect(), "dungeon", { links: links.Make });
            const guest = await RelaySession.Join(relay.Connect(), "dungeon", host.Code, { links: links.Make });
            await Until(() => host.LinkTo(1) === "direct" && guest.LinkTo(RelayHost) === "direct");
            const unlinked: string[] = [];
            host.on(RelayEvents.UNLINKED, (peer: number, wasOpen: boolean) => unlinked.push("host " + peer + " " + wasOpen));
            guest.on(RelayEvents.UNLINKED, (peer: number, wasOpen: boolean) => unlinked.push("guest " + peer + " " + wasOpen));
            links.CutAll();
            await Settle();
            expect(unlinked.sort()).toEqual(["guest 0 true", "host 1 true"]);

            const atHost = Heard(host);
            const atGuest = Heard(guest);
            guest.Send(RelayHost, new Uint8Array([5]));
            host.Send(1, new Uint8Array([6]), true);
            await Settle();
            expect(atHost).toEqual([[1, [5]]]);
            expect(atGuest).toEqual([[0, [6]]]);
        });

        it("broadcasts to each guest its own way: by its link, or by the relay to a guest without one", async () => {
            const relay = new LoopbackRelay();
            const links = new LoopbackLinks();
            const host = await RelaySession.Host(relay.Connect(), "dungeon", { links: links.Make });
            const linked = await RelaySession.Join(relay.Connect(), "dungeon", host.Code, { links: links.Make });
            const plain = await RelaySession.Join(relay.Connect(), "dungeon", host.Code);
            await Until(() => host.LinkTo(1) === "direct");
            expect(host.LinkTo(2)).toBe("relay");
            const atLinked = Heard(linked);
            const atPlain = Heard(plain);
            host.Broadcast(new Uint8Array([9]), true);
            await Settle();
            expect(atLinked).toEqual([[0, [9]]]);
            expect(atPlain).toEqual([[0, [9]]]);
        });

        it("lets a guest's link go when the guest leaves, and never hands on the session's own messages", async () => {
            const relay = new LoopbackRelay();
            const links = new LoopbackLinks();
            const host = await RelaySession.Host(relay.Connect(), "dungeon", { links: links.Make });
            const atHost = Heard(host);
            const guest = await RelaySession.Join(relay.Connect(), "dungeon", host.Code, { links: links.Make });
            await Until(() => host.LinkTo(1) === "direct");
            guest.Leave();
            await Settle();
            expect(host.LinkTo(1)).toBe("relay");
            expect(links.links.every(link => !link.IsOpen)).toBe(true);
            // The signals and the switch went by the relay, but none of it came out as a message.
            expect(atHost).toEqual([]);
        });
    });
});
