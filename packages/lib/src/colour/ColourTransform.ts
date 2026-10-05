import { RGB } from "../utils/Types";

/**
 * Colour changes on a packed `0xRRGGBB` number - the form pixi takes for a tint (`0xFFFFFF` is white). Each function returns a new
 * colour and leaves its input alone; anything above the low 24 bits of the input (an alpha byte) is ignored.
 */

const Mask = 0xFFFFFF;

function Unpack(colour: number): RGB {
    return { r: (colour >> 16) & 0xFF, g: (colour >> 8) & 0xFF, b: colour & 0xFF };
}

function Channel(value: number): number {
    return Math.min(255, Math.max(0, Math.round(value)));
}

function Pack(r: number, g: number, b: number): number {
    return (Channel(r) << 16) | (Channel(g) << 8) | Channel(b);
}

/**
 * `colour` made darker by `amount`: 0 leaves it as it is, 1 makes it black, and values between scale all three channels down together,
 * so the hue and the saturation stay (`Darken(0xFFFFFF, 0.5)` is `0x808080`, `Darken(0xFF8040, 0.25)` is `0xBF6030`). An `amount` outside
 * 0..1 counts as the nearest end of it, and one that isn't a number as 0.
 */
export function Darken(colour: number, amount: number): number {
    const factor = 1 - (amount > 0 ? Math.min(amount, 1) : 0);
    const { r, g, b } = Unpack(colour);
    return Pack(r * factor, g * factor, b * factor);
}

/**
 * `colour` with its hue turned round the colour wheel by `degrees`, keeping its saturation and brightness: from red, 60 gives yellow,
 * 120 green, 180 cyan, 240 blue and 300 magenta. A negative `degrees` turns the other way, and more than a full turn wraps. Greys (and
 * black and white) have no hue, so they come back unchanged; so does a `degrees` that isn't a number.
 */
export function ShiftHue(colour: number, degrees: number): number {
    const { r, g, b } = Unpack(colour);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    if (chroma === 0 || !isFinite(degrees)) {
        return colour & Mask;
    }

    // Where the colour is on the wheel, in sixths of a turn: 0 red, 1 yellow, 2 green, 3 cyan, 4 blue, 5 magenta.
    let hue: number;
    if (max === r) {
        hue = ((g - b) / chroma + 6) % 6;
    } else if (max === g) {
        hue = (b - r) / chroma + 2;
    } else {
        hue = (r - g) / chroma + 4;
    }

    const turned = ((((hue * 60 + degrees) % 360) + 360) % 360) / 60; // 0 <= turned < 6
    const middle = chroma * (1 - Math.abs((turned % 2) - 1)); // the channel that is neither the largest nor the smallest

    // Each sixth of the wheel has one channel at the top, one at the bottom, and `middle` between them.
    let red: number;
    let green: number;
    let blue: number;
    switch (Math.floor(turned) % 6) {
        case 0: red = chroma; green = middle; blue = 0; break;
        case 1: red = middle; green = chroma; blue = 0; break;
        case 2: red = 0; green = chroma; blue = middle; break;
        case 3: red = 0; green = middle; blue = chroma; break;
        case 4: red = middle; green = 0; blue = chroma; break;
        default: red = chroma; green = 0; blue = middle; break;
    }
    return Pack(red + min, green + min, blue + min);
}
