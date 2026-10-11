/**
 * The relay's rules: players meet in rooms by a five-letter code - one host
 * and up to three guests - and the relay passes their messages along, with
 * no game rules of its own. This is the whole of it bar the sockets: the
 * relay server (`relay/server.mjs`) runs this file with Node's own type
 * stripping, and `LoopbackRelay` runs it in memory for tests. So it imports
 * nothing and uses only TypeScript that strips away (no enums, no parameter
 * properties). Pure - no pixi - so it runs under the plain node test runner.
 *
 * The protocol, on one connection:
 * - The first message is text, JSON: `{"t": "host", "v": 1, "game": "..."}` to open a room, or
 *   `{"t": "join", "v": 1, "game": "...", "code": "BCDFG"}` to join one. The relay answers
 *   `{"t": "hosted", "code", "you": 0}` or `{"t": "joined", "code", "you", "peers"}`, or
 *   `{"t": "error", "error"}` and closes the connection.
 * - From then on the relay sends text notices - `peer-joined` and `peer-left` (with `peer`), and
 *   `closed` (with `reason`) just before it closes the room - and passes bytes along: a message
 *   `[to][payload...]` from a peer reaches peer `to` (or everyone else, for `RelayBroadcast`)
 *   as `[from][payload...]`. The host is peer 0; guests are 1 to 3.
 */

/** The protocol's version: a request with another is refused (`version`). */
export const RelayVersion = 1;
/** The host's peer number. */
export const RelayHost = 0;
/** The `to` that sends a message to everyone else in the room. */
export const RelayBroadcast = 255;
/** Peers in a room, the host included. */
export const RoomSeats = 4;
/**
 * What a room code is made of: consonants only, so no code spells a word, and none that a blocky pixel font draws like
 * another letter or a digit (B 8, D O, S 5, V U, Z 2), so a code read off a screen is typed as it was meant.
 */
export const RoomCodeLetters = "CFGHJKLMNPQRTWX";
export const RoomCodeLength = 5;

/** Why a request was refused. */
export type RelayError =
    /** Not a request the relay understands. */
    | "bad-request"
    /** Made for another version of the protocol (`RelayVersion`). */
    | "version"
    /** No room has that code (for that game). */
    | "no-room"
    /** The room has its four already. */
    | "room-full"
    /** The relay has as many rooms open as it will hold. */
    | "busy";

export type RelayRequest =
    | { t: "host"; v: number; game: string }
    | { t: "join"; v: number; game: string; code: string };

export type RelayNotice =
    | { t: "hosted"; code: string; you: number }
    | { t: "joined"; code: string; you: number; peers: number[] }
    | { t: "peer-joined"; peer: number }
    | { t: "peer-left"; peer: number }
    | { t: "error"; error: RelayError }
    | { t: "closed"; reason: "host-left" };

/** One connection, as the rooms reach it: text and bytes out, and a way to end it. */
export interface RelayLink {
    SendText(text: string): void;
    SendBytes(bytes: Uint8Array): void;
    Close(): void;
}

/** What the rooms are told of a connection: each message that comes in on it, and its end. */
export interface RelayConnection {
    Text(text: string): void;
    Bytes(bytes: Uint8Array): void;
    /** The connection has ended, from either end - safe to call more than once. */
    Closed(): void;
}

export type RelayRoomsOptions = {
    /** `[0, 1)`, like `Math.random` (the default) - what codes are drawn with. */
    random?: () => number;
    /** The most rooms open at once - 1000 by default. */
    maxRooms?: number;
};

/** A code as typed - any case, with spaces or dashes - as the relay knows it: capitals only, or "" if it can't be one. */
export function NormaliseRoomCode(text: string): string {
    const code = text.toUpperCase().replace(/[\s-]/g, "");
    if (code.length !== RoomCodeLength) {
        return "";
    }
    for (let i = 0; i < code.length; i++) {
        if (RoomCodeLetters.indexOf(code.charAt(i)) < 0) {
            return "";
        }
    }
    return code;
}

type Member = { peer: number; link: RelayLink; room: Room };
type Room = { code: string; game: string; seats: Array<Member | undefined> };

export class RelayRooms {
    private rooms = new Map<string, Room>();
    private random: () => number;
    private maxRooms: number;

    constructor(options: RelayRoomsOptions = {}) {
        this.random = options.random || Math.random;
        this.maxRooms = options.maxRooms || 1000;
    }

    /** How many rooms are open. */
    get RoomCount(): number {
        return this.rooms.size;
    }

    /** How many connections are in a room. */
    get PeerCount(): number {
        let count = 0;
        this.rooms.forEach(room => room.seats.forEach(member => {
            count += member ? 1 : 0;
        }));
        return count;
    }

    /** Takes on a new connection: its first message must be a request (see the protocol above). */
    Connect(link: RelayLink): RelayConnection {
        let member: Member | null = null;
        let over = false;
        const refuse = (error: RelayError) => {
            over = true;
            Notify(link, { t: "error", error });
            link.Close();
        };
        return {
            Text: text => {
                // Text once in a room is kept for later versions; for now there's nothing to say.
                if (over || member) {
                    return;
                }
                const request = ParseRequest(text);
                if (!request) {
                    refuse("bad-request");
                } else if (request.v !== RelayVersion) {
                    refuse("version");
                } else if (request.t === "host") {
                    if (this.rooms.size >= this.maxRooms) {
                        refuse("busy");
                        return;
                    }
                    const room: Room = { code: this.NewCode(), game: request.game, seats: [] };
                    this.rooms.set(room.code, room);
                    member = { peer: RelayHost, link, room };
                    room.seats[RelayHost] = member;
                    Notify(link, { t: "hosted", code: room.code, you: RelayHost });
                } else {
                    const room = this.rooms.get(NormaliseRoomCode(request.code));
                    if (!room || room.game !== request.game) {
                        refuse("no-room");
                        return;
                    }
                    let peer = 1;
                    while (peer < RoomSeats && room.seats[peer]) {
                        peer++;
                    }
                    if (peer >= RoomSeats) {
                        refuse("room-full");
                        return;
                    }
                    const peers = Members(room).map(other => other.peer);
                    member = { peer, link, room };
                    room.seats[peer] = member;
                    Notify(link, { t: "joined", code: room.code, you: peer, peers });
                    Members(room).forEach(other => {
                        if (other !== member) {
                            Notify(other.link, { t: "peer-joined", peer });
                        }
                    });
                }
            },
            Bytes: bytes => {
                // Bytes before a room are a broken client: there's no one to pass them to.
                if (over || !member || bytes.length < 1) {
                    return;
                }
                const from = member;
                const to = bytes[0];
                const out = new Uint8Array(bytes.length);
                out.set(bytes);
                out[0] = from.peer;
                if (to === RelayBroadcast) {
                    Members(from.room).forEach(other => {
                        if (other !== from) {
                            other.link.SendBytes(out);
                        }
                    });
                } else {
                    const other = from.room.seats[to];
                    if (other && other !== from) {
                        other.link.SendBytes(out);
                    }
                }
            },
            Closed: () => {
                over = true;
                if (member) {
                    const leaving = member;
                    member = null;
                    this.Leave(leaving);
                }
            }
        };
    }

    /** A peer has gone: a guest's seat is freed and the rest told; the host's going closes the room. */
    private Leave(member: Member): void {
        const room = member.room;
        if (room.seats[member.peer] !== member) {
            return;
        }
        room.seats[member.peer] = undefined;
        if (member.peer === RelayHost) {
            this.rooms.delete(room.code);
            const guests = Members(room);
            room.seats = [];
            guests.forEach(guest => {
                Notify(guest.link, { t: "closed", reason: "host-left" });
                guest.link.Close();
            });
        } else {
            Members(room).forEach(other => Notify(other.link, { t: "peer-left", peer: member.peer }));
        }
    }

    /** A code no open room has. */
    private NewCode(): string {
        for (;;) {
            let code = "";
            for (let i = 0; i < RoomCodeLength; i++) {
                code += RoomCodeLetters.charAt(Math.floor(this.random() * RoomCodeLetters.length));
            }
            if (!this.rooms.has(code)) {
                return code;
            }
        }
    }
}

function Members(room: Room): Member[] {
    return room.seats.filter((member): member is Member => !!member);
}

function Notify(link: RelayLink, notice: RelayNotice): void {
    link.SendText(JSON.stringify(notice));
}

/** A request, or null if the text isn't one. */
export function ParseRequest(text: string): RelayRequest | null {
    let value: any;
    try {
        value = JSON.parse(text);
    } catch {
        return null;
    }
    if (!value || typeof value !== "object" || typeof value.v !== "number" || typeof value.game !== "string" || !value.game) {
        return null;
    }
    if (value.t === "host") {
        return { t: "host", v: value.v, game: value.game };
    }
    if (value.t === "join" && typeof value.code === "string") {
        return { t: "join", v: value.v, game: value.game, code: value.code };
    }
    return null;
}
