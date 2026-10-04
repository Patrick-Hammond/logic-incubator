/**
 * After a sprite is saved the watching build repacks the bundle and rewrites the served manifest; a bundle's `hash` in it
 * changes when anything in the bundle does. The editor reads that hash before saving and waits for it to change - that's
 * how it knows the new art is ready to load. No DOM; `fetch`, the clock and the sleep are injected so the tests are instant.
 */

/** The bundle's current hash in the served manifest, or null if the manifest or the bundle can't be read. */
export async function ReadBundleHash(manifestUrl: string, bundle: string, fetcher: typeof fetch = (input, init) => fetch(input, init)): Promise<string | null> {
    if (!manifestUrl) {
        return null;
    }
    try {
        const response = await fetcher(manifestUrl, { cache: "no-store" });
        if (!response.ok) {
            return null;
        }
        const manifest = await response.json();
        const entry = manifest && manifest.bundles && manifest.bundles[bundle];
        return entry && typeof entry.hash === "string" ? entry.hash : null;
    } catch {
        return null;
    }
}

export type WatchOptions = {
    /** Reads the hash now. */
    read: () => Promise<string | null>;
    /** The hash before the change - the wait ends when it's different. */
    before: string | null;
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    /** Return true to stop waiting early (the editor closing, say). */
    cancelled?: () => boolean;
};

/**
 * Waits for the hash to differ from `before`. "timeout" if it doesn't within `timeoutMs` (the rebuild may not change the
 * bundle - saving the same pixels in a different palette order packs the same atlas - or may have failed), and straight
 * away if the starting hash isn't known, since there's nothing to compare with.
 */
export async function WaitForBundleChange(options: WatchOptions): Promise<"changed" | "timeout"> {
    if (options.before === null) {
        return "timeout";
    }
    const timeout = options.timeoutMs === undefined ? 45000 : options.timeoutMs;
    const interval = options.intervalMs === undefined ? 400 : options.intervalMs;
    const sleep = options.sleep || (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
    const now = options.now || (() => Date.now());
    const start = now();
    for (;;) {
        const hash = await options.read();
        if (hash !== null && hash !== options.before) {
            return "changed";
        }
        if (now() - start >= timeout || (options.cancelled && options.cancelled())) {
            return "timeout";
        }
        await sleep(interval);
    }
}
