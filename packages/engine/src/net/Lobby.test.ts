import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoopbackLinks, LoopbackRelay } from "@logic-incubator/lib/net/Loopback";
import { RelayHost } from "@logic-incubator/lib/net/RelayRooms";
import RelaySession, { RelayJoinOptions } from "@logic-incubator/lib/net/RelaySession";
import type { Transport } from "@logic-incubator/lib/net/Transport";
import type { LevelFile } from "../level/LevelFormat";
import { GuestLobby, HostLobby, LobbyClosedText, LobbyEvents, LobbyStart, QuietForMs, ReconnectForMs } from "./Lobby";
import type { ChatLine } from "./Chat";
import { DecodeMessage, EncodeMessage, NetVersion } from "./NetMessages";
import { CreateNetPlay } from "./NetPlay";

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

/** Every chat line `lobby` hears from now on. */
function Heard(lobby: HostLobby | GuestLobby): ChatLine[] {
    const lines: ChatLine[] = [];
    lobby.on(LobbyEvents.CHAT, (line: ChatLine) => lines.push(line));
    return lines;
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

describe("the chat", () => {
    it("passes a line to everyone - its speaker included, once the host has it - and keeps it", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        const kit = await Guest(relay, host.Code, "Kit");
        await Settle();
        const [toHost, toSam, toKit] = [Heard(host), Heard(sam), Heard(kit)];
        expect(sam.Say("  hello   all ")).toBeNull();
        await Settle();
        expect(host.Say("welcome")).toBeNull();
        await Settle();
        const lines = [{ seat: 1, from: "Sam", text: "hello all" }, { seat: 0, from: "Hostess", text: "welcome" }];
        expect(toHost).toEqual(lines);
        expect(toSam).toEqual(lines);
        expect(toKit).toEqual(lines);
        expect(kit.Chat).toEqual(lines);
        expect(sam.MySeat).toBe(1);
    });

    it("whispers a line only to who it's for, and back to who said it", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        const kit = await Guest(relay, host.Code, "Kit");
        await Settle();
        const [toHost, toSam, toKit] = [Heard(host), Heard(sam), Heard(kit)];
        sam.Say("@kit behind you");
        await Settle();
        host.Say("@SAM psst");
        await Settle();
        const toKitLine = { seat: 1, from: "Sam", text: "behind you", whisper: { seat: 2, name: "Kit" } };
        const toSamLine = { seat: 0, from: "Hostess", text: "psst", whisper: { seat: 1, name: "Sam" } };
        expect(toKit).toEqual([toKitLine]);
        expect(toSam).toEqual([toKitLine, toSamLine]);
        expect(toHost).toEqual([toSamLine]);
    });

    it("tells the player at once why a line can't be said, and sends nothing", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        await Settle();
        const toHost = Heard(host);
        expect(sam.Say("@nobody hi")).toBe("No one here is called nobody.");
        expect(host.Say("@Hostess hi")).toBe("You can't whisper to yourself.");
        expect(sam.Say("   ")).toBeNull();
        await Settle();
        expect(toHost).toEqual([]);
    });

    it("keeps a guest from flooding the others", async () => {
        const { relay, host } = await Room();
        const sam = await Guest(relay, host.Code, "Sam");
        await Settle();
        const toHost = Heard(host);
        for (let i = 0; i < 8; i++) {
            sam.Say("spam " + i);
        }
        await Settle();
        expect(toHost.map(line => line.text)).toEqual(["spam 0", "spam 1", "spam 2", "spam 3", "spam 4"]);
    });

    it("gives two players with one name different ones, so a whisper means one of them", async () => {
        const { relay, host } = await Room();
        await Guest(relay, host.Code, "Sam");
        await Guest(relay, host.Code, "sam");
        await Settle();
        expect(host.Seats.map(seat => seat.name)).toEqual(["Hostess", "Sam", "sam 2"]);
    });

    it("is turned away from a player not let in", async () => {
        const { relay, host } = await Room();
        const session = await RelaySession.Join(relay.Connect(), "dungeon", host.Code);
        await Settle();
        const toHost = Heard(host);
        session.Send(RelayHost, EncodeMessage({ t: "say", text: "let me in" }));
        await Settle();
        expect(toHost).toEqual([]);
        const stranger = new GuestLobby(await RelaySession.Join(relay.Connect(), "dungeon", host.Code), { name: "X", shippedLevel: async () => undefined });
        expect(stranger.Say("hi")).toBe("You're not in a game.");
    });
});

describe("a guest whose connection goes during the run", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Lets what's on its way arrive, `ms` on. */
    async function Wait(ms = 10): Promise<void> {
        await vi.advanceTimersByTimeAsync(ms);
    }

    /**
     * A run under way between a host and Sam, whose connections to the relay are kept to cut. The host's lobby
     * asks `run` whether a guest may come back, as a `HostSession` would be asked. Every session is opened with
     * `options` - direct links, say.
     */
    async function Running(reconnect?: (relay: LoopbackRelay, code: string) => Promise<RelaySession>, options: RelayJoinOptions = {}) {
        const relay = new LoopbackRelay();
        const lines: Transport[] = [];
        const connect = () => {
            const line = relay.Connect();
            lines.push(line);
            return line;
        };
        const host = new HostLobby(await RelaySession.Host(relay.Connect(), "dungeon", options), "Hostess");
        const run = { allowed: true, rejoined: [] as Array<[number, number]> };
        host.SetRejoin({ CanRejoin: () => run.allowed, Rejoin: (index, peer) => run.rejoined.push([index, peer]) });
        const tries = { count: 0 };
        const sam = new GuestLobby(await RelaySession.Join(connect(), "dungeon", host.Code, options), {
            name: "Sam",
            shippedLevel: async () => Shipped,
            reconnect: () => {
                tries.count++;
                return reconnect ? reconnect(relay, host.Code) : RelaySession.Join(connect(), "dungeon", host.Code, options);
            }
        });
        await Wait();
        host.Pick("witch");
        sam.Pick("warlock");
        await Wait();
        const started = NextStart(sam);
        const hostStart = await host.Start({ bundle: "level1", file: Shipped, shipped: true });
        await Wait();
        const samStart = await started;
        const events: string[] = [];
        [LobbyEvents.DROPPED, LobbyEvents.REJOINED, LobbyEvents.CLOSED].forEach(name => sam.on(name, (reason?: string) => events.push(reason ? name + " " + reason : name)));
        return { relay, host, sam, hostStart, samStart, run, tries, events, cut: () => lines[lines.length - 1].Close() };
    }

    it("gets back into the room, says hello with the token its start gave it, and is let back in as the hero it was", async () => {
        const { host, sam, run, events, cut } = await Running();
        const before = sam.Session;
        let changed = 0;
        host.on(LobbyEvents.CHANGED, () => changed++);
        cut();
        await Wait();
        expect(events).toEqual([LobbyEvents.DROPPED]);
        expect(sam.Reconnecting).toBe(true);
        expect(sam.IsOpen).toBe(true);

        await Wait(600);
        expect(events).toEqual([LobbyEvents.DROPPED, LobbyEvents.REJOINED]);
        expect(sam.Reconnecting).toBe(false);
        expect(sam.Session).not.toBe(before);
        expect(sam.Session.IsOpen).toBe(true);
        expect(run.rejoined).toEqual([[1, sam.Session.You]]);
        expect(host.Seats[1]).toEqual({ peer: sam.Session.You, name: "Sam", character: "warlock" });
        expect(sam.Mine).toEqual(host.Seats[1]);
        expect(changed).toBe(1);
    });

    it("keeps the chat going after getting back in, and says it can't be heard while it's away", async () => {
        const { host, sam, cut } = await Running();
        const toSam = Heard(sam);
        cut();
        await Wait();
        expect(sam.Say("anyone?")).toBe("Not connected to the host - say it again once you're back.");
        await Wait(600);
        host.Say("welcome back");
        expect(sam.Say("thanks")).toBeNull();
        await Wait();
        expect(toSam.map(line => line.text)).toEqual(["welcome back", "thanks"]);
    });

    it("moves the run to its new place in the room in time to hear what the host sends straight after letting it back", async () => {
        const { host, sam, hostStart, samStart, cut } = await Running();
        const hostPlay = CreateNetPlay(host, hostStart);
        const samPlay = CreateNetPlay(sam, samStart);
        cut();
        await Wait();
        expect(samPlay.Connected).toBe(false);
        await Wait(600);
        // Connected again only once the host's catch-up, sent with its answer, has come.
        expect(samPlay.Connected).toBe(true);
        hostPlay.End();
        samPlay.End();
    });

    it("keeps trying, further apart, while the relay can't be reached - and gives up once the host has let its hero go", async () => {
        const { sam, tries, events, cut } = await Running(() => Promise.reject(new Error("No network.")));
        cut();
        await Wait();
        await Wait(500 + 1000 + 2000);
        expect(tries.count).toBe(3);
        await Wait(ReconnectForMs);
        expect(events).toEqual([LobbyEvents.DROPPED, LobbyEvents.CLOSED + " lost"]);
        expect(LobbyClosedText("lost")).toBe("Lost the connection, and couldn't get back in.");
        expect(sam.IsOpen).toBe(false);
        expect(sam.Reconnecting).toBe(false);
        const count = tries.count;
        await Wait(10000);
        expect(tries.count).toBe(count);
    });

    it("closes when the host won't have it back, or the room has gone", async () => {
        const away = await Running();
        away.run.allowed = false;
        away.cut();
        await Wait(600);
        expect(away.events).toEqual([LobbyEvents.DROPPED, LobbyEvents.CLOSED + " gone"]);
        expect(LobbyClosedText("gone")).toBe("You were away too long.");
        expect(away.run.rejoined).toEqual([]);

        const left = await Running();
        left.cut();
        await Wait();
        left.host.Leave();
        await Wait(600);
        expect(left.events).toEqual([LobbyEvents.DROPPED, LobbyEvents.CLOSED + " host-left"]);
    });

    it("turns away a hello with a token it never gave, or before there's a run to come back to", async () => {
        const { relay, host } = await Running();
        const stranger = await RelaySession.Join(relay.Connect(), "dungeon", host.Code);
        const heard: Array<{ t: string }> = [];
        stranger.on("message", (_from: number, payload: Uint8Array) => heard.push(DecodeMessage(payload)!));
        stranger.Send(0, EncodeMessage({ t: "hello", version: NetVersion, name: "Mallory", rejoin: "not-a-token" }));
        await Wait();
        expect(heard).toEqual([{ t: "refused", reason: "started" }]);

        host.SetRejoin(null);
        const sam = new GuestLobby(await RelaySession.Join(relay.Connect(), "dungeon", host.Code), { name: "Sam", shippedLevel: async () => Shipped });
        const closed = Closed(sam);
        await Wait();
        expect(closed).toEqual(["started"]);
    });

    it("takes a connection that has gone quiet for lost, and gets back in", async () => {
        const { events } = await Running();
        // The host's session pings every second; with nothing at all, the line is taken for dead.
        await Wait(QuietForMs - 1000);
        expect(events).toEqual([]);
        await Wait(2000);
        expect(events).toEqual([LobbyEvents.DROPPED]);
        expect(LobbyClosedText("quiet")).toBe("Lost touch with the host.");
        await Wait(600);
        expect(events).toEqual([LobbyEvents.DROPPED, LobbyEvents.REJOINED]);
    });

    it("doesn't try to get back in when it leaves, or before the run has begun", async () => {
        const { sam, tries, events } = await Running();
        sam.Leave();
        await Wait(5000);
        expect(events).toEqual([LobbyEvents.CLOSED + " left"]);
        expect(tries.count).toBe(0);

        const relay = new LoopbackRelay();
        const host = new HostLobby(await RelaySession.Host(relay.Connect(), "dungeon"), "Hostess");
        const line = relay.Connect();
        const kit = new GuestLobby(await RelaySession.Join(line, "dungeon", host.Code), {
            name: "Kit",
            shippedLevel: async () => Shipped,
            reconnect: () => Promise.reject(new Error("never asked"))
        });
        const dropped: number[] = [];
        kit.on(LobbyEvents.DROPPED, () => dropped.push(1));
        const closed = Closed(kit);
        await Wait();
        line.Close();
        await Wait(5000);
        expect(dropped).toEqual([]);
        expect(closed).toEqual(["closed"]);
    });

    it("takes its direct link to the host failing for lost, as what was on its way may be, and gets back in - linked again", async () => {
        const links = new LoopbackLinks();
        const { host, sam, events } = await Running(undefined, { links: links.Make });
        const before = sam.Session;
        expect(before.LinkTo(RelayHost)).toBe("direct");
        expect(host.Session.LinkTo(before.You)).toBe("direct");
        links.CutAll();
        await Wait();
        expect(events).toEqual([LobbyEvents.DROPPED]);
        expect(LobbyClosedText("link")).toBe("Lost the direct link to the host.");
        await Wait(600);
        expect(events).toEqual([LobbyEvents.DROPPED, LobbyEvents.REJOINED]);
        expect(sam.Session).not.toBe(before);
        expect(sam.Session.LinkTo(RelayHost)).toBe("direct");
        expect(host.Session.LinkTo(sam.Session.You)).toBe("direct");
    });

    it("carries on by the relay when its link never opens", async () => {
        const { sam, events } = await Running(undefined, { links: new LoopbackLinks({ unreachable: true }).Make, linkTimeoutMs: 2000 });
        expect(sam.Session.LinkTo(RelayHost)).toBe("linking");
        await Wait(2000);
        expect(sam.Session.LinkTo(RelayHost)).toBe("relay");
        expect(events).toEqual([]);
    });

    it("carries on by the relay when its link fails before the run, and starts as usual", async () => {
        const links = new LoopbackLinks();
        const relay = new LoopbackRelay();
        const host = new HostLobby(await RelaySession.Host(relay.Connect(), "dungeon", { links: links.Make }), "Hostess");
        const kit = new GuestLobby(await RelaySession.Join(relay.Connect(), "dungeon", host.Code, { links: links.Make }), {
            name: "Kit",
            shippedLevel: async () => Shipped,
            reconnect: () => Promise.reject(new Error("never asked"))
        });
        const dropped: number[] = [];
        kit.on(LobbyEvents.DROPPED, () => dropped.push(1));
        const closed = Closed(kit);
        await Wait();
        expect(kit.Session.LinkTo(RelayHost)).toBe("direct");
        links.CutAll();
        await Wait();
        expect(kit.Session.LinkTo(RelayHost)).toBe("relay");
        host.Pick("witch");
        kit.Pick("warlock");
        await Wait();
        const started = NextStart(kit);
        await host.Start({ bundle: "level1", file: Shipped, shipped: true });
        await Wait();
        expect((await started).seats.map(seat => seat.character)).toEqual(["witch", "warlock"]);
        expect(dropped).toEqual([]);
        expect(closed).toEqual([]);
    });
});
