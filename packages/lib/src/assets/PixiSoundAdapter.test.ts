import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PixiSoundAdapter from "./PixiSoundAdapter";

type FakeSound = { alias: string; isLoaded: boolean; destroyed: boolean; destroy: () => void };

/** pixi-sound's library, with the decode left for the test to finish - which is the moment that matters. */
const lib = vi.hoisted(() => ({
    sounds: new Map<string, any>(),
    decodes: [] as (() => void)[],
    supported: {} as { [ext: string]: boolean },
    calls: [] as string[],
}));

vi.mock("pixi-sound", () => ({
    default: {
        utils: { supported: lib.supported },
        exists: (alias: string) => lib.sounds.has(alias),
        find: (alias: string) => lib.sounds.get(alias),
        add: (alias: string, options: { loaded: (error: Error | null, sound?: unknown) => void }) => {
            const sound: FakeSound = { alias, isLoaded: false, destroyed: false, destroy: () => { sound.destroyed = true; lib.calls.push("destroy " + alias); } };
            lib.sounds.set(alias, sound);
            // the browser's decode, finishing later: it sets isLoaded on the sound it started with, which has to still exist
            lib.decodes.push(() => {
                if (sound.destroyed) {
                    throw new TypeError("Cannot set properties of null (setting 'isLoaded')");
                }
                sound.isLoaded = true;
                options.loaded(null, sound);
            });
            return sound;
        },
        remove: (alias: string) => {
            const sound = lib.sounds.get(alias);
            lib.sounds.delete(alias);
            sound.destroy();
        },
        play: (alias: string, options: unknown) => lib.calls.push(`play ${alias} ${JSON.stringify(options)}`),
        stop: (alias: string) => lib.calls.push("stop " + alias),
    },
}));

const settle = async () => {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
};

beforeEach(() => {
    lib.sounds.clear();
    lib.decodes.length = 0;
    lib.calls.length = 0;
    Object.keys(lib.supported).forEach(ext => delete lib.supported[ext]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
});
afterEach(() => vi.unstubAllGlobals());

describe("PixiSoundAdapter", () => {
    it("picks the first format the browser plays, reading the extension past a ?v= query", () => {
        lib.supported.m4a = true;
        const adapter = new PixiSoundAdapter();
        expect(adapter.Pick(["a/x.ogg", "a/x.m4a"])).toBe("a/x.m4a");
        expect(adapter.Pick(["a/x.ogg?v=1"])).toBeUndefined();
        lib.supported.ogg = true;
        expect(adapter.Pick(["a/x.ogg?v=1", "a/x.m4a"])).toBe("a/x.ogg?v=1");
    });

    it("fetches the file itself and registers it under the alias, resolving once it's decoded", async () => {
        const adapter = new PixiSoundAdapter();
        let done = false;
        const loading = adapter.Load("global.click", "assets/click.ogg?v=1").then(() => (done = true));
        await settle();
        expect(fetch).toHaveBeenCalledWith("assets/click.ogg?v=1");
        expect(adapter.Has("global.click")).toBe(true);
        expect(done).toBe(false);
        lib.decodes[0]();
        await loading;
        expect(done).toBe(true);
    });

    it("fails with the http status when the file can't be fetched", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, statusText: "Not Found" })));
        await expect(new PixiSoundAdapter().Load("global.nope", "x.ogg")).rejects.toThrow("404 Not Found");
    });

    it("replaces a sound already registered under the alias rather than leaking it", async () => {
        const adapter = new PixiSoundAdapter();
        const first = adapter.Load("global.click", "a.ogg");
        await settle();
        lib.decodes[0]();
        await first;
        const second = adapter.Load("global.click", "a.ogg");
        await settle();
        expect(lib.calls).toContain("destroy global.click");
        lib.decodes[1]();
        await second;
    });

    it("removes a loaded sound at once", async () => {
        const adapter = new PixiSoundAdapter();
        const loading = adapter.Load("global.click", "a.ogg");
        await settle();
        lib.decodes[0]();
        await loading;
        adapter.Remove("global.click");
        expect(adapter.Has("global.click")).toBe(false);
        adapter.Remove("global.click"); // safe if it isn't there
    });

    it("waits out a decode that's still running before destroying the sound - pixi-sound throws if it's destroyed under it", async () => {
        const adapter = new PixiSoundAdapter();
        adapter.Load("global.blocky", "a.ogg").catch(() => undefined);
        await settle();
        adapter.Remove("global.blocky");
        expect(lib.calls).not.toContain("destroy global.blocky");
        expect(() => lib.decodes[0]()).not.toThrow();
        expect(lib.calls).toContain("destroy global.blocky");
        expect(adapter.Has("global.blocky")).toBe(false);
    });

    it("destroys an abandoned decode's sound when a new one has taken its alias meanwhile", async () => {
        const adapter = new PixiSoundAdapter();
        adapter.Load("global.blocky", "a.ogg").catch(() => undefined);
        await settle();
        const old = lib.sounds.get("global.blocky");
        adapter.Remove("global.blocky");
        lib.sounds.delete("global.blocky"); // as if something registered the alias afresh
        lib.sounds.set("global.blocky", { alias: "new", isLoaded: true });
        lib.decodes[0]();
        expect(old.destroyed).toBe(true);
        expect(lib.sounds.get("global.blocky").alias).toBe("new");
    });

    it("plays and stops by alias, ignoring a stop for a sound it doesn't have", async () => {
        const adapter = new PixiSoundAdapter();
        const loading = adapter.Load("global.click", "a.ogg");
        await settle();
        lib.decodes[0]();
        await loading;
        adapter.Play("global.click", { loop: true });
        adapter.Stop("global.click");
        adapter.Stop("global.other");
        expect(lib.calls).toEqual(["play global.click {\"loop\":true}", "stop global.click"]);
    });
});
