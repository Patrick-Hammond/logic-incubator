/**
 * Colours for the sprite editor: straight (non-premultiplied) 8-bit RGBA, and the few things done
 * with them everywhere - packing, hex text, brightness. Pure - no DOM - so it runs under the plain
 * node test runner (see Colour.test.ts).
 */

export type Rgba = { r: number; g: number; b: number; a: number };

export const Transparent: Readonly<Rgba> = { r: 0, g: 0, b: 0, a: 0 };

export function ClampByte(n: number): number {
    return !(n > 0) ? 0 : n > 255 ? 255 : Math.round(n); // not "n < 0": NaN is neither, and must not get through
}

export function Rgb(r: number, g: number, b: number, a = 255): Rgba {
    return { r, g, b, a };
}

/** One unsigned 32-bit number for a colour (r in the top byte, a in the bottom), for use as a map key. */
export function PackColour(c: Rgba): number {
    return ((c.r << 24) | (c.g << 16) | (c.b << 8) | c.a) >>> 0;
}

export function UnpackColour(n: number): Rgba {
    return { r: (n >>> 24) & 255, g: (n >>> 16) & 255, b: (n >>> 8) & 255, a: n & 255 };
}

export function SameColour(a: Rgba, b: Rgba): boolean {
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

const Hex2 = (n: number): string => (n < 16 ? "0" : "") + n.toString(16);

/** "#rrggbb", or "#rrggbbaa" when `withAlpha`. */
export function ColourHex(c: Rgba, withAlpha = false): string {
    return "#" + Hex2(c.r) + Hex2(c.g) + Hex2(c.b) + (withAlpha ? Hex2(c.a) : "");
}

/** Reads "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (the "#" optional, any case) - null for anything else. Without an alpha it's opaque. */
export function ParseColour(text: string): Rgba | null {
    const match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text.trim());
    if (!match) {
        return null;
    }
    let digits = match[1];
    if (digits.length <= 4) {
        digits = digits.split("").map(d => d + d).join("");
    }
    const byte = (i: number) => parseInt(digits.slice(i, i + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: digits.length === 8 ? byte(6) : 255 };
}

/** Perceived brightness, 0..255 (Rec. 601 weights) - ignores alpha. */
export function Luminance(c: Rgba): number {
    return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/** Hue in degrees, 0..360 (0 for a grey) - for sorting a palette round the colour wheel. */
export function Hue(c: Rgba): number {
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    const d = max - min;
    if (d === 0) {
        return 0;
    }
    let h: number;
    if (max === c.r) {
        h = ((c.g - c.b) / d) % 6;
    } else if (max === c.g) {
        h = (c.b - c.r) / d + 2;
    } else {
        h = (c.r - c.g) / d + 4;
    }
    h *= 60;
    return h < 0 ? h + 360 : h;
}

/** Colourfulness 0..1 (HSV saturation). */
export function Saturation(c: Rgba): number {
    const max = Math.max(c.r, c.g, c.b);
    return max === 0 ? 0 : (max - Math.min(c.r, c.g, c.b)) / max;
}
