/**
 * A direct link between two browsers (see `PeerLink`): a WebRTC connection
 * with a data channel for each lane, set up through signals the relay carries
 * - the offer, the answer, and the network addresses each end finds, with the
 * help of public STUN servers, which tell a browser its address as the
 * internet sees it. The reliable lane is an ordered channel that resends; the
 * fast lane is one that neither resends nor waits. On the reliable lane a
 * message over 16 KB goes in pieces, as some browsers take no more at once.
 * When two machines can't reach each other this way (some mobile networks and
 * offices) the link never opens, and the relay carries on (see
 * `RelaySession`). No pixi; it needs the page's `RTCPeerConnection`, or one
 * given (a test's).
 */

import { PeerLinkBase } from "./PeerLink";

/** Free public STUN servers, which tell a browser the address the internet sees it at - more than one, in case one is down. */
export const StunServers = ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"];
/** The most bytes the reliable lane sends in one go. */
export const PieceBytes = 16 * 1024;

/** What leads a message on the reliable lane: the whole of it, or a piece of one with more to come, or its last piece. */
const Whole = 0;
const Piece = 1;
const LastPiece = 2;

export type WebRtcLinkOptions = {
    /** The STUN (and any TURN) servers to find addresses with - `StunServers` by default. */
    iceServers?: RTCIceServer[];
    /** The `RTCPeerConnection` to make the connection with - the page's by default. */
    peerConnection?: typeof RTCPeerConnection;
};

/** A data channel as this sends on it: any bytes will do (the page's types ask for bytes that can't be shared memory). */
type Sender = { send(data: ArrayBufferView): void };

/** A signal, as it goes to the other end: a description of this end's connection, or an address it can be reached at (null when there are no more). */
type Said = { sdp: RTCSessionDescriptionInit } | { ice: RTCIceCandidateInit | null };

export default class WebRtcLink extends PeerLinkBase {
    /** Whether this page can make links - it has WebRTC. */
    static get Supported(): boolean {
        return typeof RTCPeerConnection === "function";
    }

    private pc: RTCPeerConnection;
    private reliable: RTCDataChannel;
    private fast: RTCDataChannel;
    /** Whether the other end's description has been taken: addresses that come before it wait. */
    private described = false;
    private waiting: RTCIceCandidateInit[] = [];
    /** The pieces so far of a message coming in pieces on the reliable lane. */
    private pieces: Uint8Array[] = [];

    /** Starts a link: `offer` for the end that starts it, which says so at once (see `OnSignal`); the other waits for that. */
    constructor(offer: boolean, options: WebRtcLinkOptions = {}) {
        super();
        const Connection = options.peerConnection || RTCPeerConnection;
        const pc = this.pc = new Connection({ iceServers: options.iceServers || [{ urls: StunServers }] });
        // Agreed beforehand at both ends (`negotiated`), so neither waits to be told of the other's.
        this.reliable = pc.createDataChannel("reliable", { negotiated: true, id: 0, ordered: true });
        this.fast = pc.createDataChannel("fast", { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
        [this.reliable, this.fast].forEach(channel => {
            channel.binaryType = "arraybuffer";
            channel.onopen = () => {
                if (this.reliable.readyState === "open" && this.fast.readyState === "open") {
                    this.Opened();
                }
            };
            channel.onclose = () => this.Shut("closed");
        });
        this.reliable.onmessage = event => this.Arrived(new Uint8Array(event.data as ArrayBuffer));
        this.fast.onmessage = event => this.Deliver(new Uint8Array(event.data as ArrayBuffer), true);
        pc.onicecandidate = event => this.Say({ ice: event.candidate ? event.candidate.toJSON() : null });
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed" || pc.connectionState === "closed") {
                this.Shut(pc.connectionState);
            }
        };
        if (offer) {
            pc.createOffer()
                .then(description => pc.setLocalDescription(description))
                .then(() => this.Say({ sdp: pc.localDescription!.toJSON() }))
                .catch((error: Error) => this.Shut("couldn't offer: " + error.message));
        }
    }

    Signal(signal: string): void {
        let said: Said;
        try {
            said = JSON.parse(signal);
        } catch {
            return;
        }
        if (this.Ended) {
            return;
        }
        const pc = this.pc;
        if ("sdp" in said) {
            const description = said.sdp;
            pc.setRemoteDescription(description)
                .then(() => {
                    this.described = true;
                    this.waiting.splice(0).forEach(candidate => this.Reach(candidate));
                    if (description.type === "offer") {
                        return pc.createAnswer()
                            .then(answer => pc.setLocalDescription(answer))
                            .then(() => this.Say({ sdp: pc.localDescription!.toJSON() }));
                    }
                    return undefined;
                })
                .catch((error: Error) => this.Shut("couldn't answer: " + error.message));
        } else if (said.ice) {
            if (this.described) {
                this.Reach(said.ice);
            } else {
                this.waiting.push(said.ice);
            }
        }
    }

    Send(payload: Uint8Array, fast: boolean): void {
        if (!this.IsOpen) {
            return;
        }
        try {
            const reliable: Sender = this.reliable;
            if (fast) {
                (this.fast as Sender).send(payload);
            } else if (payload.length <= PieceBytes) {
                reliable.send(Led(Whole, payload));
            } else {
                for (let at = 0; at < payload.length; at += PieceBytes) {
                    const end = Math.min(payload.length, at + PieceBytes);
                    reliable.send(Led(end === payload.length ? LastPiece : Piece, payload.subarray(at, end)));
                }
            }
        } catch (error) {
            // A channel that throws on send has failed under us.
            this.Shut("couldn't send: " + (error as Error).message);
        }
    }

    Close(): void {
        this.Shut("closed");
    }

    /** Passes `said` to the other end. */
    private Say(said: Said): void {
        this.Emit(JSON.stringify(said));
    }

    /** Tries an address the other end can be reached at. */
    private Reach(candidate: RTCIceCandidateInit): void {
        // One this browser can't use is passed over: others may do.
        this.pc.addIceCandidate(candidate).catch(() => undefined);
    }

    /** A message on the reliable lane: whole, or a piece to keep until the last comes. */
    private Arrived(bytes: Uint8Array): void {
        const body = bytes.subarray(1);
        if (bytes[0] === Whole) {
            this.Deliver(body, false);
        } else if (bytes[0] === Piece) {
            this.pieces.push(body.slice());
        } else if (bytes[0] === LastPiece) {
            const pieces = this.pieces.splice(0).concat([body]);
            const whole = new Uint8Array(pieces.reduce((total, piece) => total + piece.length, 0));
            let at = 0;
            pieces.forEach(piece => {
                whole.set(piece, at);
                at += piece.length;
            });
            this.Deliver(whole, false);
        }
    }

    /** Ends the link for `reason`, once, and lets go of the connection. */
    private Shut(reason: string): void {
        if (this.Ended) {
            return;
        }
        this.End(reason);
        [this.reliable, this.fast].forEach(channel => {
            channel.onopen = channel.onclose = channel.onmessage = null;
            channel.close();
        });
        this.pc.onicecandidate = this.pc.onconnectionstatechange = null;
        this.pc.close();
    }
}

/** `body`, led by the byte that says what it is. */
function Led(lead: number, body: Uint8Array): Uint8Array {
    const bytes = new Uint8Array(body.length + 1);
    bytes[0] = lead;
    bytes.set(body, 1);
    return bytes;
}
