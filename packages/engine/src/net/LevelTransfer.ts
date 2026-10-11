/**
 * Getting the same level onto every player's machine: a hash names a level
 * (so a guest can check the copy it already has - the game's shipped one -
 * is the host's), and a level is packed small to send whole when it isn't
 * (an editor level, or a guest with another version). Pure - no pixi - so it
 * runs under the plain node test runner.
 */

import type { LevelFile } from "../level/LevelFormat";

/** How a packed level's bytes after the first are stored. */
const Plain = 0;
const Gzip = 1;

/**
 * A name for the level's content: the same for the same level on any machine - its JSON, as parsed from
 * the same file, comes out the same everywhere - and, all but certainly, different for another. FNV-1a
 * over the JSON, and its length: `"9f3c01a2-339012"`.
 */
export function LevelHash(file: LevelFile): string {
    const json = JSON.stringify(file);
    let hash = 0x811c9dc5;
    for (let i = 0; i < json.length; i++) {
        hash ^= json.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return ("0000000" + (hash >>> 0).toString(16)).slice(-8) + "-" + json.length;
}

/** The level as bytes to send: gzipped where the browser can (all current ones), as plain JSON where it can't. */
export async function PackLevel(file: LevelFile): Promise<Uint8Array> {
    const json = new TextEncoder().encode(JSON.stringify(file));
    const gzip = typeof CompressionStream === "function";
    const body = gzip ? await Pipe(json, new CompressionStream("gzip")) : json;
    const packed = new Uint8Array(body.length + 1);
    packed[0] = gzip ? Gzip : Plain;
    packed.set(body, 1);
    return packed;
}

/** A level from `PackLevel`'s bytes. Rejects if they aren't one. */
export async function UnpackLevel(packed: Uint8Array): Promise<LevelFile> {
    const body = packed.subarray(1);
    let json: Uint8Array;
    if (packed[0] === Gzip) {
        json = await Pipe(body, new DecompressionStream("gzip"));
    } else if (packed[0] === Plain && packed.length) {
        json = body;
    } else {
        throw new Error("Not a packed level.");
    }
    const file = JSON.parse(new TextDecoder().decode(json));
    if (!file || !file.levelData || !Array.isArray(file.levelData.levelData)) {
        throw new Error("The level sent isn't a level file.");
    }
    return file as LevelFile;
}

/** Runs the bytes through a compression stream. */
async function Pipe(bytes: Uint8Array, through: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(through);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
