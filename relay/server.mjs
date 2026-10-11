// The relay: a WebSocket server where online players meet in rooms by code and their
// messages are passed along. The rules - rooms, codes, who gets what - are
// packages/lib/src/net/RelayRooms.ts, run here through Node's own type stripping, so the
// games' in-memory relay and this one can't drift apart. This file only adds the sockets,
// a heartbeat that drops connections gone quiet, and a health check at /health.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { RelayRooms } from "../packages/lib/src/net/RelayRooms.ts";

/**
 * Starts a relay. Resolves once it's listening, with the port it got (pass port 0 for any free one)
 * and `close()`, which ends every connection and stops it.
 */
export function StartRelay(options = {}) {
    const port = options.port === undefined ? 8787 : options.port;
    const heartbeatMs = options.heartbeatMs || 15000;
    const log = options.log || (() => undefined);
    // Origins allowed to connect (a page's https://host), or none listed for any.
    const origins = (options.origins || []).map(NormaliseOrigin);
    const rooms = new RelayRooms({ maxRooms: options.maxRooms });

    const http = createServer((request, response) => {
        if (request.url === "/health") {
            response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
            response.end(JSON.stringify({ ok: true, rooms: rooms.RoomCount, peers: rooms.PeerCount }));
        } else {
            response.writeHead(404, { "content-type": "text/plain" });
            response.end("Relay: connect with a WebSocket.\n");
        }
    });

    const server = new WebSocketServer({
        server: http,
        // An editor level, compressed, is the biggest thing sent: well under this.
        maxPayload: options.maxPayload || 1024 * 1024,
        verifyClient: info => !origins.length || origins.indexOf(NormaliseOrigin(info.origin || "")) >= 0
    });

    // Connections pinged and not yet answered.
    const quiet = new Set();

    server.on("connection", (socket, request) => {
        socket.on("pong", () => quiet.delete(socket));
        const connection = rooms.Connect({
            SendText: text => {
                if (socket.readyState === socket.OPEN) {
                    socket.send(text);
                }
            },
            SendBytes: bytes => {
                if (socket.readyState === socket.OPEN) {
                    socket.send(bytes, { binary: true });
                }
            },
            Close: () => socket.close(1000)
        });
        socket.on("message", (data, isBinary) => {
            if (isBinary) {
                connection.Bytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
            } else {
                connection.Text(data.toString());
            }
        });
        socket.on("close", () => {
            quiet.delete(socket);
            connection.Closed();
        });
        socket.on("error", error => log("connection error from " + request.socket.remoteAddress + ": " + error.message));
    });

    // Browsers answer pings by themselves; a connection that missed one since the last is gone, whatever its socket thinks.
    const heartbeat = setInterval(() => {
        server.clients.forEach(socket => {
            if (quiet.has(socket)) {
                socket.terminate();
            } else {
                quiet.add(socket);
                socket.ping();
            }
        });
    }, heartbeatMs);

    return new Promise((resolve, reject) => {
        http.once("error", reject);
        http.listen(port, options.host, () => {
            const address = http.address();
            log("relay listening on port " + address.port);
            resolve({
                port: address.port,
                rooms,
                close: () => new Promise(done => {
                    clearInterval(heartbeat);
                    server.clients.forEach(socket => socket.terminate());
                    server.close(() => http.close(() => done()));
                })
            });
        });
    });
}

/** An origin as browsers send it - lower case, no trailing slash - so `https://Me.github.io/` in the settings still matches. */
function NormaliseOrigin(origin) {
    return origin.trim().toLowerCase().replace(/\/+$/, "");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const env = process.env;
    StartRelay({
        port: env.PORT ? Number(env.PORT) : 8787,
        host: env.HOST || undefined,
        origins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim()).filter(Boolean) : [],
        maxRooms: env.MAX_ROOMS ? Number(env.MAX_ROOMS) : undefined,
        log: message => console.log(new Date().toISOString() + " " + message)
    }).then(relay => {
        const stop = () => relay.close().then(() => process.exit(0));
        process.on("SIGTERM", stop);
        process.on("SIGINT", stop);
    }, error => {
        console.error("relay failed to start: " + error.message);
        process.exit(1);
    });
}
