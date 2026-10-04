import { describe, expect, it } from "vitest";
import { ReadBundleHash, WaitForBundleChange } from "./ManifestWatch";

const manifest = { version: 1, bundles: { global: { hash: "abc123" }, level1: { hash: "def456" }, broken: {} } };
const fetching = (response: () => Response | Promise<Response>) => ((() => Promise.resolve(response())) as unknown as typeof fetch);

describe("ReadBundleHash", () => {
    it("reads a bundle's hash from the manifest, uncached", async () => {
        let init: RequestInit | undefined;
        const fetcher = ((_: string, i: RequestInit) => {
            init = i;
            return Promise.resolve(new Response(JSON.stringify(manifest)));
        }) as unknown as typeof fetch;
        expect(await ReadBundleHash("assets/manifest.json", "global", fetcher)).toBe("abc123");
        expect(await ReadBundleHash("assets/manifest.json", "level1", fetcher)).toBe("def456");
        expect(init.cache).toBe("no-store");
    });

    it("is null for a bundle that isn't there or has no hash, a bad response, a network failure, or no url", async () => {
        const ok = fetching(() => new Response(JSON.stringify(manifest)));
        expect(await ReadBundleHash("m.json", "nope", ok)).toBeNull();
        expect(await ReadBundleHash("m.json", "broken", ok)).toBeNull();
        expect(await ReadBundleHash("m.json", "global", fetching(() => new Response("", { status: 404 })))).toBeNull();
        expect(await ReadBundleHash("m.json", "global", fetching(() => new Response("not json")))).toBeNull();
        expect(await ReadBundleHash("m.json", "global", fetching(() => new Response("null")))).toBeNull();
        expect(await ReadBundleHash("m.json", "global", (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toBeNull();
        expect(await ReadBundleHash("", "global", ok)).toBeNull();
    });
});

describe("WaitForBundleChange", () => {
    /** A clock the fake sleep moves along. */
    function Clock() {
        let t = 0;
        return { now: () => t, sleep: (ms: number) => Promise.resolve().then(() => void (t += ms)) };
    }

    it("returns as soon as the hash is different", async () => {
        const clock = Clock();
        const hashes = ["a", "a", "a", "b"];
        let reads = 0;
        const result = await WaitForBundleChange({ before: "a", read: () => Promise.resolve(hashes[reads++]), ...clock });
        expect(result).toBe("changed");
        expect(reads).toBe(4);
    });

    it("polls at the interval", async () => {
        const clock = Clock();
        let reads = 0;
        await WaitForBundleChange({ before: "a", read: () => Promise.resolve(reads++ < 5 ? "a" : "b"), intervalMs: 250, ...clock });
        expect(clock.now()).toBe(250 * 5);
    });

    it("gives up after the timeout", async () => {
        const clock = Clock();
        const result = await WaitForBundleChange({ before: "a", read: () => Promise.resolve("a"), timeoutMs: 1000, intervalMs: 300, ...clock });
        expect(result).toBe("timeout");
        expect(clock.now()).toBeGreaterThanOrEqual(1000);
        expect(clock.now()).toBeLessThan(1000 + 300);
    });

    it("doesn't take an unreadable manifest for a change, and keeps trying through it", async () => {
        const clock = Clock();
        const hashes: Array<string | null> = [null, null, "a", null, "b"];
        let reads = 0;
        expect(await WaitForBundleChange({ before: "a", read: () => Promise.resolve(hashes[reads++]), ...clock })).toBe("changed");
        expect(reads).toBe(5);
    });

    it("doesn't wait at all when it doesn't know what to compare with", async () => {
        let reads = 0;
        expect(await WaitForBundleChange({ before: null, read: () => Promise.resolve("x" + reads++) })).toBe("timeout");
        expect(reads).toBe(0);
    });

    it("stops when cancelled", async () => {
        const clock = Clock();
        let reads = 0;
        const result = await WaitForBundleChange({ before: "a", read: () => Promise.resolve("a"), cancelled: () => reads++ >= 2, ...clock });
        expect(result).toBe("timeout");
        expect(reads).toBe(3);
    });

    it("checks once even with no time allowed", async () => {
        expect(await WaitForBundleChange({ before: "a", read: () => Promise.resolve("b"), timeoutMs: 0 })).toBe("changed");
        expect(await WaitForBundleChange({ before: "a", read: () => Promise.resolve("a"), timeoutMs: 0 })).toBe("timeout");
    });
});
