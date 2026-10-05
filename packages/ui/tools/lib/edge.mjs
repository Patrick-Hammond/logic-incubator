// Decodes image formats node can't (webp) by drawing them on a canvas in headless Microsoft Edge, driven over the DevTools protocol - the only decoder on
// this machine, and installing nothing is the point. The bytes go in as a data URL (so the canvas isn't tainted) and come back as a PNG, which pngjs reads.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const EDGE = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Runs `work(evaluate)` against a headless Edge page, then closes Edge. `evaluate(expression)` awaits promises and returns JSON-able values. */
export async function WithEdge(work, port = 9411) {
    const profile = mkdtempSync(join(tmpdir(), "ui-tools-edge-"));
    const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
    try {
        let wsUrl;
        for (let i = 0; i < 80 && !wsUrl; i++) {
            try {
                wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page")?.webSocketDebuggerUrl;
            } catch {
                await sleep(250);
            }
        }
        if (!wsUrl) {
            throw new Error("Edge didn't start (set EDGE_PATH if it lives elsewhere than " + EDGE + ").");
        }
        const ws = new WebSocket(wsUrl);
        await new Promise(resolve => ws.addEventListener("open", resolve));
        let id = 0;
        const pending = new Map();
        ws.addEventListener("message", e => {
            const m = JSON.parse(e.data);
            if (m.id && pending.has(m.id)) {
                pending.get(m.id)(m);
                pending.delete(m.id);
            }
        });
        const evaluate = expression =>
            new Promise((resolve, reject) => {
                const n = ++id;
                pending.set(n, m => {
                    if (m.error) return reject(new Error(JSON.stringify(m.error)));
                    if (m.result.exceptionDetails) return reject(new Error(JSON.stringify(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails)));
                    resolve(m.result.result.value);
                });
                ws.send(JSON.stringify({ id: n, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
            });
        try {
            return await work(evaluate);
        } finally {
            ws.close();
        }
    } finally {
        edge.kill();
        await sleep(300);
        try {
            rmSync(profile, { recursive: true, force: true });
        } catch {
            // Edge may still hold its profile for a moment; the temp folder is cleaned up by the OS eventually.
        }
    }
}

/** `{ width, height, data }` (straight RGBA) for image file bytes of any format Edge reads. */
export async function DecodeImages(files) {
    const { PNG } = require("pngjs");
    return WithEdge(async evaluate => {
        const out = [];
        for (const { bytes, mime } of files) {
            const url = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
            const png = await evaluate(`(async () => {
                const img = new Image();
                img.src = ${JSON.stringify(url)};
                await img.decode();
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext("2d").drawImage(img, 0, 0);
                return canvas.toDataURL("image/png");
            })()`);
            const decoded = PNG.sync.read(Buffer.from(png.split(",")[1], "base64"));
            out.push({ width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data) });
        }
        return out;
    });
}
