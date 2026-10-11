import { describe, expect, it } from "vitest";
import { NormaliseRoomCode, ParseRequest, RelayBroadcast, RelayConnection, RelayLink, RelayNotice, RelayRooms, RelayVersion, RoomCodeLetters } from "./RelayRooms";

/** A connection as the rooms see it, keeping what they send it. */
class Peer implements RelayLink {
    texts: RelayNotice[] = [];
    bytes: number[][] = [];
    closed = false;
    readonly connection: RelayConnection;

    constructor(rooms: RelayRooms) {
        this.connection = rooms.Connect(this);
    }

    SendText(text: string): void {
        this.texts.push(JSON.parse(text));
    }

    SendBytes(bytes: Uint8Array): void {
        this.bytes.push(Array.from(bytes));
    }

    Close(): void {
        this.closed = true;
    }

    Request(request: object): RelayNotice {
        this.connection.Text(JSON.stringify(request));
        return this.texts[this.texts.length - 1];
    }

    Send(to: number, ...payload: number[]): void {
        this.connection.Bytes(new Uint8Array([to].concat(payload)));
    }
}

function Host(rooms: RelayRooms, game = "dungeon"): { peer: Peer; code: string } {
    const peer = new Peer(rooms);
    const notice = peer.Request({ t: "host", v: RelayVersion, game });
    if (notice.t !== "hosted") {
        throw new Error("not hosted: " + JSON.stringify(notice));
    }
    return { peer, code: notice.code };
}

function Join(rooms: RelayRooms, code: string, game = "dungeon"): Peer {
    const peer = new Peer(rooms);
    peer.Request({ t: "join", v: RelayVersion, game, code });
    return peer;
}

describe("RelayRooms", () => {
    it("opens a room with a five-consonant code, the host as peer 0", () => {
        const rooms = new RelayRooms();
        const { peer, code } = Host(rooms);
        expect(code).toMatch(new RegExp("^[" + RoomCodeLetters + "]{5}$"));
        expect(peer.texts).toEqual([{ t: "hosted", code, you: 0 }]);
        expect(rooms.RoomCount).toBe(1);
    });

    it("never hands out a code that's in use", () => {
        // The first draw repeats the first room's code; the second must not use it.
        const draws = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5];
        const rooms = new RelayRooms({ random: () => draws.shift()! });
        expect(Host(rooms).code).toBe("CCCCC");
        expect(Host(rooms).code).toBe("MMMMM");
    });

    it("seats guests 1 to 3, telling each who's there and the rest who came", () => {
        const rooms = new RelayRooms();
        const { peer: host, code } = Host(rooms);
        const first = Join(rooms, code);
        const second = Join(rooms, code.toLowerCase());
        expect(first.texts[0]).toEqual({ t: "joined", code, you: 1, peers: [0] });
        expect(second.texts).toEqual([{ t: "joined", code, you: 2, peers: [0, 1] }]);
        expect(host.texts.slice(1)).toEqual([{ t: "peer-joined", peer: 1 }, { t: "peer-joined", peer: 2 }]);
        expect(first.texts.slice(1)).toEqual([{ t: "peer-joined", peer: 2 }]);
        expect(rooms.PeerCount).toBe(3);
    });

    it("turns a fifth away, and fills a freed seat", () => {
        const rooms = new RelayRooms();
        const { code } = Host(rooms);
        const guests = [Join(rooms, code), Join(rooms, code), Join(rooms, code)];
        const fifth = Join(rooms, code);
        expect(fifth.texts).toEqual([{ t: "error", error: "room-full" }]);
        expect(fifth.closed).toBe(true);
        guests[0].connection.Closed();
        expect(Join(rooms, code).texts[0]).toEqual({ t: "joined", code, you: 1, peers: [0, 2, 3] });
    });

    it("refuses a code that isn't open, or is another game's", () => {
        const rooms = new RelayRooms();
        const { code } = Host(rooms, "dungeon");
        expect(Join(rooms, "ZZZZZ").texts).toEqual([{ t: "error", error: "no-room" }]);
        expect(Join(rooms, code, "catgrab").texts).toEqual([{ t: "error", error: "no-room" }]);
    });

    it("refuses another version, a garbled request, and more rooms than it holds", () => {
        const rooms = new RelayRooms({ maxRooms: 1 });
        const old = new Peer(rooms);
        expect(old.Request({ t: "host", v: RelayVersion + 1, game: "dungeon" })).toEqual({ t: "error", error: "version" });
        const garbled = new Peer(rooms);
        garbled.connection.Text("{not json");
        expect(garbled.texts).toEqual([{ t: "error", error: "bad-request" }]);
        expect(garbled.closed).toBe(true);
        Host(rooms);
        expect(new Peer(rooms).Request({ t: "host", v: RelayVersion, game: "dungeon" })).toEqual({ t: "error", error: "busy" });
    });

    it("passes bytes to one peer, marked with who sent them", () => {
        const rooms = new RelayRooms();
        const { peer: host, code } = Host(rooms);
        const first = Join(rooms, code);
        const second = Join(rooms, code);
        host.Send(2, 7, 8);
        first.Send(0, 9);
        expect(second.bytes).toEqual([[0, 7, 8]]);
        expect(first.bytes).toEqual([]);
        expect(host.bytes).toEqual([[1, 9]]);
    });

    it("passes broadcast bytes to everyone but the sender", () => {
        const rooms = new RelayRooms();
        const { peer: host, code } = Host(rooms);
        const first = Join(rooms, code);
        const second = Join(rooms, code);
        first.Send(RelayBroadcast, 5);
        expect(host.bytes).toEqual([[1, 5]]);
        expect(second.bytes).toEqual([[1, 5]]);
        expect(first.bytes).toEqual([]);
    });

    it("drops bytes for an empty seat, for the sender itself, and before a room", () => {
        const rooms = new RelayRooms();
        const { peer: host, code } = Host(rooms);
        const guest = Join(rooms, code);
        host.Send(3, 1);
        guest.Send(1, 1);
        const stranger = new Peer(rooms);
        stranger.Send(0, 1);
        expect(host.bytes).toEqual([]);
        expect(guest.bytes).toEqual([]);
    });

    it("tells the rest when a guest leaves", () => {
        const rooms = new RelayRooms();
        const { peer: host, code } = Host(rooms);
        const first = Join(rooms, code);
        const second = Join(rooms, code);
        first.connection.Closed();
        first.connection.Closed();
        expect(host.texts.slice(-1)).toEqual([{ t: "peer-left", peer: 1 }]);
        expect(second.texts.slice(-1)).toEqual([{ t: "peer-left", peer: 1 }]);
        expect(rooms.PeerCount).toBe(2);
    });

    it("closes the room, and every guest's connection, when the host leaves", () => {
        const rooms = new RelayRooms();
        const { peer: host, code } = Host(rooms);
        const guest = Join(rooms, code);
        host.connection.Closed();
        expect(guest.texts.slice(-1)).toEqual([{ t: "closed", reason: "host-left" }]);
        expect(guest.closed).toBe(true);
        // The guest's connection then reports its own end, which changes nothing.
        guest.connection.Closed();
        expect(rooms.RoomCount).toBe(0);
        expect(Join(rooms, code).texts).toEqual([{ t: "error", error: "no-room" }]);
    });
});

describe("NormaliseRoomCode", () => {
    it("takes any case, spaces and dashes, and nothing that can't be a code", () => {
        expect(NormaliseRoomCode(" cfg-hj ")).toBe("CFGHJ");
        expect(NormaliseRoomCode("CFGH")).toBe("");
        expect(NormaliseRoomCode("ACFGH")).toBe("");
        // Letters that read as others in a pixel font are never in a code.
        expect(NormaliseRoomCode("CFGHV")).toBe("");
    });
});

describe("ParseRequest", () => {
    it("knows a host and a join request, and nothing else", () => {
        expect(ParseRequest(JSON.stringify({ t: "host", v: 1, game: "g", extra: 1 }))).toEqual({ t: "host", v: 1, game: "g" });
        expect(ParseRequest(JSON.stringify({ t: "join", v: 1, game: "g", code: "BCDFG" }))).toEqual({ t: "join", v: 1, game: "g", code: "BCDFG" });
        expect(ParseRequest(JSON.stringify({ t: "join", v: 1, game: "g" }))).toBeNull();
        expect(ParseRequest(JSON.stringify({ t: "host", v: 1, game: "" }))).toBeNull();
        expect(ParseRequest("null")).toBeNull();
        expect(ParseRequest("")).toBeNull();
    });
});
