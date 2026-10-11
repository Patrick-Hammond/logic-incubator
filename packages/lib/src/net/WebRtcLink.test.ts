import { beforeEach, describe, expect, it } from "vitest";
import type { PeerLink } from "./PeerLink";
import WebRtcLink, { PieceBytes, StunServers } from "./WebRtcLink";

/** Lets every promise and delivery already on its way finish. */
function Settle(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/** A stand-in for a browser's data channel: what's sent arrives at the channel with the same id at the other end. */
class FakeChannel {
    readyState = "connecting";
    binaryType = "blob";
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
    other: FakeChannel | null = null;
    sends = 0;

    constructor(readonly init: RTCDataChannelInit) {}

    send(data: ArrayBufferView): void {
        if (this.readyState !== "open") {
            throw new Error("not open");
        }
        this.sends++;
        const copy = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
        const other = this.other;
        Promise.resolve().then(() => other && other.onmessage && other.onmessage({ data: copy.buffer }));
    }

    Open(): void {
        this.readyState = "open";
        Promise.resolve().then(() => this.onopen && this.onopen());
    }

    close(): void {
        if (this.readyState === "closed") {
            return;
        }
        this.readyState = "closed";
        Promise.resolve().then(() => this.onclose && this.onclose());
        if (this.other) {
            this.other.close();
        }
    }
}

/**
 * A stand-in for a browser's RTCPeerConnection. Two find each other by their descriptions (each names its maker), and
 * connect - opening their channels - once each has the other's description and at least one of its addresses.
 */
class FakeConnection {
    static made: FakeConnection[] = [];
    readonly name = "pc" + FakeConnection.made.length;
    channels: FakeChannel[] = [];
    localDescription: (RTCSessionDescriptionInit & { toJSON(): RTCSessionDescriptionInit }) | null = null;
    remote: RTCSessionDescriptionInit | null = null;
    reached = 0;
    connected = false;
    connectionState = "new";
    onicecandidate: ((event: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;

    constructor(readonly config: RTCConfiguration) {
        FakeConnection.made.push(this);
    }

    createDataChannel(_label: string, init: RTCDataChannelInit): FakeChannel {
        const channel = new FakeChannel(init);
        this.channels.push(channel);
        return channel;
    }

    async createOffer(): Promise<RTCSessionDescriptionInit> {
        return { type: "offer", sdp: this.name };
    }

    async createAnswer(): Promise<RTCSessionDescriptionInit> {
        return { type: "answer", sdp: this.name };
    }

    async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
        this.localDescription = { ...description, toJSON: () => ({ type: description.type, sdp: description.sdp }) };
        // Its addresses, found a moment later - then the end of them.
        Promise.resolve().then(() => {
            if (this.onicecandidate) {
                this.onicecandidate({ candidate: { toJSON: () => ({ candidate: "candidate:" + this.name }) } });
                this.onicecandidate({ candidate: null });
            }
        });
    }

    async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
        this.remote = description;
        this.Connect();
    }

    async addIceCandidate(_candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.remote) {
            throw new Error("an address before the description");
        }
        this.reached++;
        this.Connect();
    }

    close(): void {
        this.connectionState = "closed";
        this.channels.forEach(channel => channel.close());
    }

    Fail(): void {
        this.connectionState = "failed";
        if (this.onconnectionstatechange) {
            this.onconnectionstatechange();
        }
    }

    private Connect(): void {
        const other = FakeConnection.made.find(pc => this.remote !== null && pc.name === this.remote.sdp);
        if (!other || this.connected || !this.reached || !other.reached || !other.remote) {
            return;
        }
        this.connected = other.connected = true;
        this.channels.forEach(channel => {
            const twin = other.channels.find(each => each.init.id === channel.init.id)!;
            channel.other = twin;
            twin.other = channel;
            channel.Open();
            twin.Open();
        });
    }
}

const Options = { peerConnection: FakeConnection as unknown as typeof RTCPeerConnection };

/** Two links, signalling each other directly; `hold` keeps the offering end's signals back until let go. */
function Pair(hold = false): { offer: WebRtcLink; answer: WebRtcLink; release(): void } {
    const offer = new WebRtcLink(true, Options);
    const answer = new WebRtcLink(false, Options);
    const held: string[] = [];
    offer.OnSignal(signal => (hold ? held.push(signal) : answer.Signal(signal)));
    answer.OnSignal(signal => offer.Signal(signal));
    return { offer, answer, release: () => held.splice(0).reverse().forEach(signal => answer.Signal(signal)) };
}

function Heard(link: PeerLink): string[] {
    const heard: string[] = [];
    link.OnMessage((payload, fast) => heard.push((fast ? "fast " : "") + Array.from(payload.subarray(0, 3)).join(",") + (payload.length > 3 ? " (" + payload.length + ")" : "")));
    return heard;
}

describe("WebRtcLink", () => {
    beforeEach(() => {
        FakeConnection.made = [];
    });

    it("opens its two lanes once the offer, the answer and the addresses have gone between the ends", async () => {
        const { offer, answer } = Pair();
        const opened: string[] = [];
        offer.OnOpen(() => opened.push("offer"));
        answer.OnOpen(() => opened.push("answer"));
        await Settle();
        expect(opened.sort()).toEqual(["answer", "offer"]);
        expect(offer.IsOpen && answer.IsOpen).toBe(true);
        expect(FakeConnection.made[0].config.iceServers).toEqual([{ urls: StunServers }]);
        const [reliable, fast] = FakeConnection.made[0].channels;
        expect(reliable.init).toMatchObject({ negotiated: true, ordered: true });
        expect(fast.init).toMatchObject({ negotiated: true, ordered: false, maxRetransmits: 0 });
        expect(reliable.binaryType).toBe("arraybuffer");

        const atAnswer = Heard(answer);
        const atOffer = Heard(offer);
        offer.Send(new Uint8Array([1, 2]), false);
        offer.Send(new Uint8Array([3]), true);
        answer.Send(new Uint8Array([4]), false);
        await Settle();
        expect(atAnswer).toEqual(["1,2", "fast 3"]);
        expect(atOffer).toEqual(["4"]);
    });

    it("keeps addresses that come before the description until it has, and still opens", async () => {
        const { offer, answer, release } = Pair(true);
        await Settle();
        // Let go in reverse: the offering end's address first, its description after.
        release();
        await Settle();
        expect(offer.IsOpen && answer.IsOpen).toBe(true);
    });

    it("sends a long message in pieces on the reliable lane, and puts it back together", async () => {
        const { offer, answer } = Pair();
        await Settle();
        const atAnswer = Heard(answer);
        const long = new Uint8Array(PieceBytes * 2 + 100).map((_, i) => i % 251);
        offer.Send(long, false);
        offer.Send(new Uint8Array([9]), false);
        await Settle();
        expect(atAnswer).toEqual(["0,1,2 (" + long.length + ")", "9"]);
        expect(FakeConnection.made[0].channels[0].sends).toBe(4);
    });

    it("closes at both ends when either closes, and sends nothing after", async () => {
        const { offer, answer } = Pair();
        await Settle();
        const closed: string[] = [];
        offer.OnClose(reason => closed.push("offer " + reason));
        answer.OnClose(reason => closed.push("answer " + reason));
        answer.Close();
        await Settle();
        expect(closed.sort()).toEqual(["answer closed", "offer closed"]);
        expect(offer.IsOpen || answer.IsOpen).toBe(false);
        expect(() => offer.Send(new Uint8Array([1]), false)).not.toThrow();
    });

    it("ends when its connection fails", async () => {
        const { offer } = Pair();
        await Settle();
        const closed: string[] = [];
        offer.OnClose(reason => closed.push(reason));
        FakeConnection.made[0].Fail();
        expect(closed).toEqual(["failed"]);
        expect(offer.IsOpen).toBe(false);
    });

    it("never opens without the other end's answer", async () => {
        const offer = new WebRtcLink(true, Options);
        const signals: string[] = [];
        offer.OnSignal(signal => signals.push(signal));
        await Settle();
        expect(offer.IsOpen).toBe(false);
        expect(signals.map(signal => JSON.parse(signal))).toContainEqual({ sdp: { type: "offer", sdp: "pc0" } });
    });
});
