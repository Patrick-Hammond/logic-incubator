/**
 * The colour channel mixer: transforms palette colours the way Photoshop's does. Each output channel (red,
 * green, blue) is a weighted mix of the colour's own red, green and blue plus a constant, so a few numbers
 * can swap channels, tint, invert or desaturate a whole palette - and with the sprite indexed, the sprite
 * with it. "Monochrome" makes all three output channels one mix (the `gray` row) instead. Alpha has its own
 * scale and offset. Pure - no DOM - so it runs under the plain node test runner (see ChannelMixer.test.ts).
 */

import { ClampByte, Rgba } from "./Colour";

/**
 * One output channel: `r`, `g` and `b` weight the colour's source channels (1 = 100%, negative inverts,
 * up to +/-2), `constant` adds that fraction of 255 (-1..1).
 */
export type MixRow = { r: number; g: number; b: number; constant: number };

export type Mixer = {
    red: MixRow;
    green: MixRow;
    blue: MixRow;
    /** Used instead of the three above when `monochrome`: its result is every output channel. */
    gray: MixRow;
    monochrome: boolean;
    /** Alpha is multiplied by this, then `alphaOffset` of 255 is added. */
    alphaScale: number;
    alphaOffset: number;
};

export const WeightRange = 2;
export const ConstantRange = 1;

const Row = (r: number, g: number, b: number, constant = 0): MixRow => ({ r, g, b, constant });

export function IdentityMixer(): Mixer {
    return {
        red: Row(1, 0, 0),
        green: Row(0, 1, 0),
        blue: Row(0, 0, 1),
        // Photoshop's own default for the grey channel.
        gray: Row(0.3, 0.59, 0.11),
        monochrome: false,
        alphaScale: 1,
        alphaOffset: 0
    };
}

export function CloneMixer(mixer: Mixer): Mixer {
    return { ...mixer, red: { ...mixer.red }, green: { ...mixer.green }, blue: { ...mixer.blue }, gray: { ...mixer.gray } };
}

const RowsEqual = (a: MixRow, b: MixRow): boolean => a.r === b.r && a.g === b.g && a.b === b.b && a.constant === b.constant;

/** Whether the mixer leaves every colour as it is (the grey row doesn't count unless monochrome is on). */
export function IsIdentityMixer(mixer: Mixer): boolean {
    const identity = IdentityMixer();
    return (
        !mixer.monochrome &&
        RowsEqual(mixer.red, identity.red) &&
        RowsEqual(mixer.green, identity.green) &&
        RowsEqual(mixer.blue, identity.blue) &&
        mixer.alphaScale === 1 &&
        mixer.alphaOffset === 0
    );
}

const Apply = (row: MixRow, c: Rgba): number => ClampByte(row.r * c.r + row.g * c.g + row.b * c.b + row.constant * 255);

export function MixColour(c: Rgba, mixer: Mixer): Rgba {
    const a = ClampByte(c.a * mixer.alphaScale + mixer.alphaOffset * 255);
    if (mixer.monochrome) {
        const grey = Apply(mixer.gray, c);
        return { r: grey, g: grey, b: grey, a };
    }
    return { r: Apply(mixer.red, c), g: Apply(mixer.green, c), b: Apply(mixer.blue, c), a };
}

/**
 * The palette with the mixer applied to `indices` (every entry if left out). Fully transparent entries are left alone:
 * they're "no colour", and an alpha offset mustn't make the eraser's entry visible.
 */
export function MixPalette(palette: ReadonlyArray<Rgba>, mixer: Mixer, indices?: ReadonlyArray<number>): Rgba[] {
    const chosen = indices ? new Set(indices) : null;
    return palette.map((c, i) => (c.a === 0 || (chosen && !chosen.has(i)) ? { ...c } : MixColour(c, mixer)));
}

function Preset(name: string, make: (m: Mixer) => void): { name: string; mixer: Mixer } {
    const mixer = IdentityMixer();
    make(mixer);
    return { name, mixer };
}

/** Starting points for the mixer, from "no change" to the classic one-click transforms. */
export const MixerPresets: ReadonlyArray<{ name: string; mixer: Mixer }> = [
    Preset("No change", () => undefined),
    Preset("Greyscale", m => {
        m.monochrome = true;
        m.gray = Row(0.299, 0.587, 0.114);
    }),
    Preset("Sepia", m => {
        m.red = Row(0.393, 0.769, 0.189);
        m.green = Row(0.349, 0.686, 0.168);
        m.blue = Row(0.272, 0.534, 0.131);
    }),
    Preset("Invert", m => {
        m.red = Row(-1, 0, 0, 1);
        m.green = Row(0, -1, 0, 1);
        m.blue = Row(0, 0, -1, 1);
    }),
    Preset("Swap red and blue", m => {
        m.red = Row(0, 0, 1);
        m.blue = Row(1, 0, 0);
    }),
    Preset("Swap red and green", m => {
        m.red = Row(0, 1, 0);
        m.green = Row(1, 0, 0);
    }),
    Preset("Rotate channels (R > G > B > R)", m => {
        m.red = Row(0, 0, 1);
        m.green = Row(1, 0, 0);
        m.blue = Row(0, 1, 0);
    }),
    Preset("Darken 25%", m => {
        m.red = Row(0.75, 0, 0);
        m.green = Row(0, 0.75, 0);
        m.blue = Row(0, 0, 0.75);
    }),
    Preset("Lighten 25%", m => {
        m.red.constant = m.green.constant = m.blue.constant = 0.25;
    }),
    Preset("Warm", m => {
        m.red = Row(1.1, 0, 0);
        m.blue = Row(0, 0, 0.85);
    }),
    Preset("Cool", m => {
        m.red = Row(0.85, 0, 0);
        m.blue = Row(0, 0, 1.1);
    })
];
