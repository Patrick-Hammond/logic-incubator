import { describe, expect, it } from "vitest";
import { SpriteApi, SpriteApiError, ToBase64 } from "./SpriteApi";

type Call = { url: string; init: RequestInit };

/** A fetch that answers from `routes` (matched on path+query prefix) and records what it was asked. */
function FakeFetch(routes: { [prefix: string]: () => Response | Promise<Response> }) {
    const calls: Call[] = [];
    const fetcher = ((input: string, init: RequestInit) => {
        calls.push({ url: input, init });
        const key = Object.keys(routes).find(prefix => input.indexOf("/__sprite-api" + prefix) === 0);
        if (!key) {
            return Promise.reject(new TypeError("Failed to fetch"));
        }
        return Promise.resolve(routes[key]());
    }) as unknown as typeof fetch;
    return { fetcher, calls };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("ToBase64", () => {
    it("encodes bytes the way the server decodes them, including long ones", () => {
        expect(ToBase64(Uint8Array.from([104, 105]))).toBe("aGk=");
        expect(ToBase64(new Uint8Array(0))).toBe("");
        const big = new Uint8Array(100000);
        for (let i = 0; i < big.length; i++) big[i] = (i * 31) & 255;
        expect(Uint8Array.from(Buffer.from(ToBase64(big), "base64"))).toEqual(big);
    });
});

describe("SpriteApi", () => {
    it("sends every request with the header the server insists on, uncached", async () => {
        const { fetcher, calls } = FakeFetch({ "/list": () => json({ bundles: [] }) });
        await new SpriteApi(fetcher).List();
        expect(calls[0].init.headers).toMatchObject({ "X-Sprite-Editor": "1" });
        expect(calls[0].init.cache).toBe("no-store");
    });

    it("lists bundles", async () => {
        const bundles = [{ name: "global", sheets: ["dungeon"], packedSheets: [], names: ["crate"] }];
        const { fetcher } = FakeFetch({ "/list": () => json({ bundles }) });
        expect(await new SpriteApi(fetcher).List()).toEqual(bundles);
    });

    it("is available when the service answers, and remembers - unavailable when it doesn't, without asking again", async () => {
        const up = FakeFetch({ "/list": () => json({ bundles: [] }) });
        const api = new SpriteApi(up.fetcher);
        expect(await api.Available()).toBe(true);
        expect(await api.Available()).toBe(true);
        expect(up.calls).toHaveLength(1);

        const down = FakeFetch({});
        const gone = new SpriteApi(down.fetcher);
        expect(await gone.Available()).toBe(false);
        expect(await gone.Available()).toBe(false);
        expect(down.calls).toHaveLength(1);

        const notFound = FakeFetch({ "/list": () => new Response("<html>nope</html>", { status: 404 }) });
        expect(await new SpriteApi(notFound.fetcher).Available()).toBe(false);
    });

    it("describes a sprite and escapes what goes in the query", async () => {
        const info = { bundle: "global", name: "a b", kind: "sprite", frames: 1, sheet: "x", dir: "sprites/x", editable: true, reason: null };
        const { fetcher, calls } = FakeFetch({ "/sprite": () => json(info) });
        expect(await new SpriteApi(fetcher).Describe("global", "a b&c")).toEqual(info);
        expect(calls[0].url).toBe("/__sprite-api/sprite?bundle=global&name=a%20b%26c");
    });

    it("reads a sprite's frames in order", async () => {
        const info = { bundle: "global", name: "bomb", kind: "animation", frames: 3, sheet: "d", dir: "sprites/d", editable: true, reason: null };
        const { fetcher, calls } = FakeFetch({
            "/sprite": () => json(info),
            "/frame": () => new Response(Uint8Array.from([calls.length]), { status: 200 })
        });
        const { frames } = await new SpriteApi(fetcher).ReadSprite("global", "bomb");
        expect(frames).toHaveLength(3);
        expect(frames.map(f => f[0])).toEqual([2, 3, 4]);
        expect(calls.slice(1).map(c => c.url)).toEqual([
            "/__sprite-api/frame?bundle=global&name=bomb&index=0",
            "/__sprite-api/frame?bundle=global&name=bomb&index=1",
            "/__sprite-api/frame?bundle=global&name=bomb&index=2"
        ]);
    });

    it("refuses to read a sprite the server says can't be edited, with the reason", async () => {
        const info = { bundle: "cat", name: "pk", kind: "sprite", frames: 1, sheet: "a", dir: null, editable: false, reason: "It's in a pre-packed sheet." };
        const { fetcher, calls } = FakeFetch({ "/sprite": () => json(info) });
        await expect(new SpriteApi(fetcher).ReadSprite("cat", "pk")).rejects.toMatchObject({ message: expect.stringContaining("pre-packed") });
        expect(calls).toHaveLength(1);
    });

    it("posts a save with base64 frames and returns what the server said", async () => {
        const result = { ok: true, bundle: "global", name: "gem", kind: "sprite", frames: 1, width: 4, height: 4, written: ["sprites/user/gem.png"], removed: [], changed: true, notes: [] };
        const { fetcher, calls } = FakeFetch({ "/save": () => json(result) });
        const out = await new SpriteApi(fetcher).Save({ bundle: "global", name: "gem", mode: "create", sheet: "user", category: "items", frames: [Uint8Array.from([1, 2, 3])] });
        expect(out).toEqual(result);
        expect(calls[0].init.method).toBe("POST");
        expect(calls[0].init.headers).toMatchObject({ "Content-Type": "application/json", "X-Sprite-Editor": "1" });
        expect(JSON.parse(calls[0].init.body as string)).toEqual({ bundle: "global", name: "gem", mode: "create", sheet: "user", category: "items", frames: ["AQID"] });
    });

    it("turns a server error into a SpriteApiError with its message, status and details", async () => {
        const { fetcher } = FakeFetch({ "/save": () => json({ error: "That would leave it with errors.", details: ["a", "b"] }, 422) });
        const error = await new SpriteApi(fetcher).Save({ bundle: "g", name: "x", mode: "create", frames: [new Uint8Array(1)] }).catch(e => e);
        expect(error).toBeInstanceOf(SpriteApiError);
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({ status: 422, message: "That would leave it with errors.", details: ["a", "b"], name: "SpriteApiError" });
    });

    it("falls back to the status line when the error isn't JSON, and explains a server that's not there", async () => {
        const html = FakeFetch({ "/list": () => new Response("<html>", { status: 502, statusText: "Bad Gateway" }) });
        await expect(new SpriteApi(html.fetcher).List()).rejects.toMatchObject({ status: 502, message: "502 Bad Gateway" });
        const none = FakeFetch({});
        await expect(new SpriteApi(none.fetcher).List()).rejects.toMatchObject({ status: 0, message: expect.stringContaining("npm start") });
    });
});
