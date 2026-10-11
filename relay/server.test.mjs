import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import RelaySession, { RelayEvents } from "../packages/lib/src/net/RelaySession.ts";
import WebSocketTransport from "../packages/lib/src/net/WebSocketTransport.ts";
import { StartRelay } from "./server.mjs";

const relays = [];

async function Relay(options = {}) {
    const relay = await StartRelay({ port: 0, host: "127.0.0.1", ...options });
    relays.push(relay);
    return relay;
}

function Connect(relay) {
    // Node's own WebSocket, standing in for a browser's.
    return WebSocketTransport.Connect("ws://127.0.0.1:" + relay.port, { create: url => new globalThis.WebSocket(url) });
}

function Next(session, event) {
    return new Promise(resolve => session.once(event, (...args) => resolve(args)));
}

describe("relay server", () => {
    afterEach(async () => {
        await Promise.all(relays.splice(0).map(relay => relay.close()));
    });

    it("puts a host and a guest in a room and passes their bytes along", async () => {
        const relay = await Relay();
        const host = await RelaySession.Host(await Connect(relay), "dungeon");
        const joined = Next(host, RelayEvents.PEER_JOINED);
        const guest = await RelaySession.Join(await Connect(relay), "dungeon", host.Code);
        expect(guest.You).toBe(1);
        expect(await joined).toEqual([1]);

        const atHost = Next(host, RelayEvents.MESSAGE);
        guest.Send(0, new Uint8Array([1, 2, 3]));
        const [from, payload] = await atHost;
        expect(from).toBe(1);
        expect(Array.from(payload)).toEqual([1, 2, 3]);

        const atGuest = Next(guest, RelayEvents.MESSAGE);
        host.Broadcast(new Uint8Array([9]));
        expect((await atGuest)[0]).toBe(0);
    });

    it("closes a guest's session when the host leaves", async () => {
        const relay = await Relay();
        const host = await RelaySession.Host(await Connect(relay), "dungeon");
        const guest = await RelaySession.Join(await Connect(relay), "dungeon", host.Code);
        const closed = Next(guest, RelayEvents.CLOSED);
        host.Leave();
        expect(await closed).toEqual(["host-left"]);
    });

    it("refuses a code with no room", async () => {
        const relay = await Relay();
        await expect(RelaySession.Join(await Connect(relay), "dungeon", "BCDFG")).rejects.toMatchObject({ reason: "no-room" });
    });

    it("reports its rooms at /health", async () => {
        const relay = await Relay();
        await RelaySession.Host(await Connect(relay), "dungeon");
        const response = await fetch("http://127.0.0.1:" + relay.port + "/health");
        expect(await response.json()).toEqual({ ok: true, rooms: 1, peers: 1 });
    });

    it("drops a connection that stops answering its heartbeat, freeing the seat", async () => {
        const relay = await Relay({ heartbeatMs: 50 });
        const host = await RelaySession.Host(await Connect(relay), "dungeon");
        const left = Next(host, RelayEvents.PEER_LEFT);
        // A client that never answers a ping, as one whose network has gone would.
        const silent = new WebSocket("ws://127.0.0.1:" + relay.port, { autoPong: false });
        await new Promise(resolve => silent.once("open", resolve));
        silent.send(JSON.stringify({ t: "join", v: 1, game: "dungeon", code: host.Code }));
        expect(await left).toEqual([1]);
    });

    it("turns away pages from origins it wasn't told to allow", async () => {
        // Written as someone might type it into the settings: browsers send it lower case, with no slash.
        const relay = await Relay({ origins: ["https://Example.org/"] });
        const url = "ws://127.0.0.1:" + relay.port;
        const allowed = new WebSocket(url, { origin: "https://example.org" });
        await new Promise((resolve, reject) => {
            allowed.once("open", resolve);
            allowed.once("error", reject);
        });
        allowed.close();
        const refused = new WebSocket(url, { origin: "https://elsewhere.org" });
        await expect(new Promise((resolve, reject) => {
            refused.once("open", resolve);
            refused.once("error", reject);
        })).rejects.toThrow("401");
    });

    it("starts as `npm start` runs it, with Node's own type stripping", async () => {
        const child = spawn(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "server.mjs"], {
            cwd: fileURLToPath(new URL(".", import.meta.url)),
            env: { ...process.env, PORT: "0", HOST: "127.0.0.1" }
        });
        try {
            const port = await new Promise((resolve, reject) => {
                let output = "";
                child.stdout.on("data", data => {
                    output += data;
                    const match = /listening on port (\d+)/.exec(output);
                    if (match) {
                        resolve(Number(match[1]));
                    }
                });
                child.stderr.on("data", data => {
                    output += data;
                });
                child.once("exit", code => reject(new Error("relay exited (" + code + "): " + output)));
            });
            const transport = await WebSocketTransport.Connect("ws://127.0.0.1:" + port, { create: url => new globalThis.WebSocket(url) });
            const host = await RelaySession.Host(transport, "dungeon");
            expect(host.Code).toHaveLength(5);
            host.Leave();
        } finally {
            child.kill();
        }
    });
});
