/**
 * Seeded random numbers, so a run of play can be repeated: the same seed gives
 * the same numbers in the same order, on any machine. Pure - no pixi - so it
 * runs under the plain node test runner.
 */

/** A fresh seed, different every time - for play that needn't be repeated. */
export function NewSeed(): number {
    return Math.floor(Math.random() * 4294967296);
}

/** Numbers in `[0, 1)`, like `Math.random`, but the same ones every time for the same seed (mulberry32). */
export function SeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
