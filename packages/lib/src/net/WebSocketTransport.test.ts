import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocketTransport, { CloseReason, WebSocketLike } from "./WebSocketTransport";

/** A socket that does what it's told: `Open`, `Receive` and `Drop` play the server's part. */
class FakeSocket implements WebSocketLike {
    binaryType = "blob";
    readyState = 0;
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    sent: Array<string | ArrayBufferView> = [];
    closed = false;

    send(data: string | ArrayBufferView): void {
        this.sent.push(data);
    }

    close(): void {
        this.closed = true;
        this.readyState = 3;
    }

    Open(): void {
        this.readyState = 1;
        if (this.onopen) {
            this.onopen({});
        }
    }

    Receive(data: unknown): void {
        if (this.onmessage) {
            this.onmessage({ data });
        }
    }

    Drop(code: number, reason = ""): void {
        this.readyState = 3;
        if (this.onclose) {
            this.onclose({ code, reason });
        }
    }
}

function Connecting(): { socket: FakeSocket; connected: Promise<WebSocketTransport> } {
    const socket = new FakeSocket();
    const connected = WebSocketTransport.Connect("ws://relay", { create: () => socket, timeoutMs: 1000 });
    return { socket, connected };
}

describe("WebSocketTransport", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("connects once the socket opens, asking for binary as array buffers", async () => {
        const { socket, connected } = Connecting();
        expect(socket.binaryType).toBe("arraybuffer");
        socket.Open();
        const transport = await connected;
        expect(transport.IsOpen).toBe(true);
    });

    it("fails to connect when the socket closes first", async () => {
        const { socket, connected } = Connecting();
        socket.Drop(1006);
        await expect(connected).rejects.toThrow("connection lost");
    });

    it("gives up when there's no answer in time", async () => {
        vi.useFakeTimers();
        const { socket, connected } = Connecting();
        const failed = expect(connected).rejects.toThrow("No answer");
        vi.advanceTimersByTime(1000);
        await failed;
        expect(socket.closed).toBe(true);
    });

    it("passes text on as text and binary as bytes", async () => {
        const { socket, connected } = Connecting();
        socket.Open();
        const transport = await connected;
        const heard: unknown[] = [];
        transport.OnMessage(message => heard.push(message));
        socket.Receive("hello");
        socket.Receive(new Uint8Array([1, 2]).buffer);
        expect(heard[0]).toBe("hello");
        expect(Array.from(heard[1] as Uint8Array)).toEqual([1, 2]);
    });

    it("sends while open and not after", async () => {
        const { socket, connected } = Connecting();
        socket.Open();
        const transport = await connected;
        transport.Send("one");
        socket.Drop(1000);
        transport.Send("two");
        expect(socket.sent).toEqual(["one"]);
        expect(transport.IsOpen).toBe(false);
    });

    it("tells its close listeners once, with the reason", async () => {
        const { socket, connected } = Connecting();
        socket.Open();
        const transport = await connected;
        const reasons: string[] = [];
        transport.OnClose(reason => reasons.push(reason));
        socket.Drop(4000, "room closed");
        socket.Drop(4000, "room closed");
        expect(reasons).toEqual(["room closed"]);
    });

    it("ends at once when closed at this end", async () => {
        const { socket, connected } = Connecting();
        socket.Open();
        const transport = await connected;
        const reasons: string[] = [];
        transport.OnClose(reason => reasons.push(reason));
        transport.Close();
        expect(socket.closed).toBe(true);
        expect(reasons).toEqual(["closed"]);
        expect(transport.IsOpen).toBe(false);
    });
});

describe("CloseReason", () => {
    it("prefers the reason given, then explains the code", () => {
        expect(CloseReason(4000, "host left")).toBe("host left");
        expect(CloseReason(1000, "")).toBe("closed");
        expect(CloseReason(1006, "")).toBe("connection lost");
        expect(CloseReason(1011, "")).toBe("closed (1011)");
    });
});
