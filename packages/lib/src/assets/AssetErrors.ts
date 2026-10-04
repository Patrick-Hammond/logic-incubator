/** One asset that didn't load: which, from where, and why. */
export type LoadFailure = { id: string; url: string; message: string };

/**
 * A bundle (or part of one) failed to load. `failures` lists every asset that did - after the
 * loader's own retries - so one bad file doesn't hide the others.
 */
export class AssetLoadError extends Error {
    constructor(public bundle: string, public failures: LoadFailure[]) {
        super(`Couldn't load ${failures.length} asset${failures.length === 1 ? "" : "s"} of bundle "${bundle}":\n` + failures.map(f => `  ${f.id} (${f.url}): ${f.message}`).join("\n"));
        this.name = "AssetLoadError";
        // Extending Error under an ES5 target loses the prototype chain; without this `instanceof` is false.
        Object.setPrototypeOf(this, AssetLoadError.prototype);
    }
}

/**
 * The game was destroyed while something was loading, or something asked its assets for a thing
 * after that. Callers that await a load treat it as "the game went away" and just stop - it's
 * never a bug to report.
 */
export class AssetsDestroyedError extends Error {
    constructor() {
        super("The game was destroyed.");
        this.name = "AssetsDestroyedError";
        Object.setPrototypeOf(this, AssetsDestroyedError.prototype);
    }
}

/** Edit distance, for "did you mean" on a mistyped id. */
function Distance(a: string, b: string): number {
    let previous: number[] = [];
    for (let j = 0; j <= b.length; j++) {
        previous.push(j);
    }
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row.push(Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
        }
        previous = row;
    }
    return previous[b.length];
}

/** The closest of `candidates` to `name`, if it's near enough to be a likely typo. */
export function Suggest(name: string, candidates: string[]): string | undefined {
    let best: string | undefined;
    let bestDistance = Math.max(2, Math.floor(name.length / 3)) + 1;
    candidates.forEach(candidate => {
        const distance = Distance(name, candidate);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    });
    return best;
}
