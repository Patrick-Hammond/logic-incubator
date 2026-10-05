/**
 * A skin file's JSON can't write 0xRRGGBB, so colours in it are "#rrggbb" strings (numbers are accepted too); `ParseSkin` turns the parsed JSON into a `Skin`
 * with real colour numbers, saying where a bad colour is. Everything else in the file is already the right shape - `ValidateSkin` checks it against the art.
 * Pure.
 */

import { Skin } from "./Skin";

/** "#rrggbb" (or "rrggbb") or a number up to 0xffffff as a colour number; throws a message naming `where` otherwise. */
export function ParseColour(value: unknown, where: string): number {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
        return value;
    }
    if (typeof value === "string") {
        const match = /^#?([0-9a-f]{6})$/i.exec(value);
        if (match) {
            return parseInt(match[1], 16);
        }
    }
    throw new Error(`${where}: ${JSON.stringify(value)} isn't a colour - write "#rrggbb".`);
}

/**
 * Turns every colour in a parsed skin into a number, in place: the entries of the top-level `colours`, and any value under a key that ends in "colour" (`textColour`,
 * `caretColour`...) - a single colour, or an object of them (`textColour: { normal, hover }`).
 */
function ConvertColours(node: unknown, where: string): void {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    Object.keys(record).forEach(key => {
        const value = record[key];
        const here = `${where}.${key}`;
        if (/colour$/i.test(key)) {
            if (value && typeof value === "object") {
                const inner = value as Record<string, unknown>;
                Object.keys(inner).forEach(state => (inner[state] = ParseColour(inner[state], `${here}.${state}`)));
            } else {
                record[key] = ParseColour(value, here);
            }
        } else if (value && typeof value === "object") {
            ConvertColours(value, here);
        }
    });
}

/** The skin the JSON describes, colours as numbers. The input isn't changed. */
export function ParseSkin(data: unknown): Skin {
    if (!data || typeof data !== "object") {
        throw new Error("A skin file must hold an object.");
    }
    const skin = JSON.parse(JSON.stringify(data)) as Skin;
    const named = (skin.colours || {}) as Record<string, unknown>;
    Object.keys(named).forEach(key => (named[key] = ParseColour(named[key], `colours.${key}`)));
    ConvertColours(skin, "");
    return skin;
}
