/**
 * Floor overlays: dirt, mud, water, slime, blood, moss or a shiny floor, painted with the `OVERLAY` data brush and drawn over the
 * floor by a shader (see `view/OverlayLayer`). Nothing about an overlay is stored but its kind and, if they're not the kind's
 * own, how the heroes move over it, its colour and how much it mirrors: the shape and the look are made up as it's drawn, from
 * where it is, the same on every machine and in the editor. The cells of one kind side by side, at one height, make a patch,
 * edged where it meets anything else (`OverlayCell.joins`), so a pool painted over six cells is one pool with a ragged shore
 * inside them. A hero on an overlay moves at its pace and slides as far as it lets them (`Overlays.FootingAt`). A cell whose
 * overlay has any reflectivity mirrors what stands over it - the heroes, the monsters, a wall at its edge (see
 * `Overlays.Reflects`). Pure - no pixi - so it runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { BareFloor, Footing } from "../view/helpers/PlayerMovement";
import { DataBrushName } from "./LevelFormat";

/** What an overlay is of. Each draws its own way (see `view/overlay.frag`); `shiny` has no colour of its own, only the reflection. */
export type OverlayKind = "dirt" | "mud" | "water" | "slime" | "blood" | "moss" | "shiny";

/** Every kind, in the order the editor offers them - and the number the shader knows each by (its place here). */
export const OverlayKinds: ReadonlyArray<OverlayKind> = ["dirt", "mud", "water", "slime", "blood", "moss", "shiny"];

/** How a kind looks unless its brush says otherwise: its colour, and how strongly it mirrors what stands over it, from 0 to 1. */
export type OverlayLook = { tint: number; reflectivity: number };

/** Each kind's own look - see `OverlayLook`. */
export const OverlayLooks: { readonly [K in OverlayKind]: OverlayLook } = {
    dirt: { tint: 0x86603b, reflectivity: 0 },
    mud: { tint: 0x5a3d24, reflectivity: 0.15 },
    water: { tint: 0x2f7fb0, reflectivity: 0.55 },
    slime: { tint: 0x5cb83c, reflectivity: 0.2 },
    blood: { tint: 0x7a0c0c, reflectivity: 0.15 },
    moss: { tint: 0x5f9136, reflectivity: 0 },
    shiny: { tint: 0xffffff, reflectivity: 0.35 }
};

/**
 * How each kind is to walk on unless its brush says otherwise (see `Footing`): mud and water slow the heroes and stop them short,
 * slime all but holds them and lets them slide on, a shiny floor or blood is a little slippery.
 */
export const OverlayFootings: { readonly [K in OverlayKind]: Footing } = {
    dirt: { speed: 0.95, slipperiness: 1 },
    mud: { speed: 0.3, slipperiness: 0.1 },
    water: { speed: 0.4, slipperiness: 0.5 },
    slime: { speed: 0.1, slipperiness: 6},
    blood: { speed: 0.95, slipperiness: 2 },
    moss: { speed: 0.9, slipperiness: 0.9 },
    shiny: { speed: 1, slipperiness: 3 }
};

/** The slowest and fastest an overlay can make the heroes go, as a multiple of their pace on bare floor (`Footing.speed`). */
export const MinOverlaySpeed = 0.05;
export const MaxOverlaySpeed = 1.5;
/** The most slippery an overlay can be, as a multiple of how long bare floor takes to stop them (`Footing.slipperiness`); 0 stops them dead. */
export const MaxOverlaySlipperiness = 5;

/**
 * How an overlay is laid over the floor: `normal` over it; `add` adding its light; `multiply` darkening the floor by its colour,
 * as a stain would; `screen` lightening it. Each is the GPU's own blending, so none costs more than another.
 */
export type OverlayBlend = "normal" | "add" | "multiply" | "screen";

/** Every blend, in the order the editor offers them - and the number `OverlayLayer` knows each by (its place here). */
export const OverlayBlends: ReadonlyArray<OverlayBlend> = ["normal", "add", "multiply", "screen"];

/** Whether `blend` is one of `OverlayBlends`. */
export function IsOverlayBlend(blend: unknown): blend is OverlayBlend {
    return OverlayBlends.indexOf(blend as OverlayBlend) > -1;
}

/**
 * An `OVERLAY` brush's value: its kind (`overlay`) and, only where they aren't the kind's own (see `OverlayFootings`, `OverlayLooks`),
 * how fast the heroes go over it (`speed`, from `MinOverlaySpeed` to `MaxOverlaySpeed` - 1 as on bare floor), how long they take to slow
 * down on it (`slipperiness`, 0 to `MaxOverlaySlipperiness` - 1 as on bare floor), its colour (`tint`, 0xRRGGBB) and how much it mirrors
 * (`reflectivity`, 0 to 1). `alpha`, from 0 to 1, fades the whole overlay, its reflection too, for the floor to show through - left out, 1:
 * as its kind draws it. `blend` is how it's laid over the floor (see `OverlayBlend`) - left out, `normal`. A level saved before overlays
 * changed how the heroes move has a `seed` in each, which is let go: the pattern comes from where the overlay is.
 */
export type OverlayValue = {
    overlay: OverlayKind;
    speed?: number;
    slipperiness?: number;
    tint?: number;
    reflectivity?: number;
    alpha?: number;
    blend?: OverlayBlend;
};

/** Whether `value` is an `OverlayValue` - told apart, like every data value, by its shape: its `overlay`. */
export function IsOverlayValue(value: unknown): value is OverlayValue {
    return value != null && typeof value === "object" && typeof (value as OverlayValue).overlay === "string";
}

/** Whether `kind` is one of `OverlayKinds`. */
export function IsOverlayKind(kind: unknown): kind is OverlayKind {
    return OverlayKinds.indexOf(kind as OverlayKind) > -1;
}

/** What a new overlay brush starts as: water, as water is. */
export function DefaultOverlayValue(): OverlayValue {
    return { overlay: "water" };
}

/** `n` kept from `min` to `max`, to a hundredth - as fine as the editor's sliders go, so a kind's own value that's been through one is still seen to be. */
function Hundredths(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

/**
 * `value` as the game reads it - null for a kind it doesn't know, which draws nothing. The speed is from `MinOverlaySpeed` to
 * `MaxOverlaySpeed` and the slipperiness from 0 to `MaxOverlaySlipperiness`, each to a hundredth; a tint a whole 0xRRGGBB and a
 * reflectivity from 0 to 1; each is kept only where it's set and isn't the kind's own. The alpha, from 0 to 1, is kept only where
 * it's under 1, and the blend only where it's one the game knows other than `normal`. Anything else - an old level's `seed` - is let go.
 */
export function SanitiseOverlayValue(value: OverlayValue): OverlayValue | null {
    if (!IsOverlayKind(value.overlay)) {
        return null;
    }
    const footing = OverlayFootings[value.overlay];
    const look = OverlayLooks[value.overlay];
    const out: OverlayValue = { overlay: value.overlay };
    if (typeof value.speed === "number" && isFinite(value.speed)) {
        const speed = Hundredths(value.speed, MinOverlaySpeed, MaxOverlaySpeed);
        if (speed !== footing.speed) {
            out.speed = speed;
        }
    }
    if (typeof value.slipperiness === "number" && isFinite(value.slipperiness)) {
        const slipperiness = Hundredths(value.slipperiness, 0, MaxOverlaySlipperiness);
        if (slipperiness !== footing.slipperiness) {
            out.slipperiness = slipperiness;
        }
    }
    if (typeof value.tint === "number" && isFinite(value.tint)) {
        const tint = Math.min(0xffffff, Math.max(0, Math.round(value.tint)));
        if (tint !== look.tint) {
            out.tint = tint;
        }
    }
    if (typeof value.reflectivity === "number" && isFinite(value.reflectivity)) {
        const reflectivity = Math.min(1, Math.max(0, value.reflectivity));
        if (reflectivity !== look.reflectivity) {
            out.reflectivity = reflectivity;
        }
    }
    if (typeof value.alpha === "number" && isFinite(value.alpha) && value.alpha < 1) {
        out.alpha = Math.max(0, value.alpha);
    }
    if (IsOverlayBlend(value.blend) && value.blend !== "normal") {
        out.blend = value.blend;
    }
    return out;
}

/** How fast the heroes go over `value`, as a multiple of their pace on bare floor: its own speed, or its kind's. */
export function OverlaySpeed(value: OverlayValue): number {
    return value.speed != null ? value.speed : IsOverlayKind(value.overlay) ? OverlayFootings[value.overlay].speed : 1;
}

/** How long the heroes take to slow down on `value`, as a multiple of bare floor's: its own slipperiness, or its kind's. */
export function OverlaySlipperiness(value: OverlayValue): number {
    return value.slipperiness != null ? value.slipperiness : IsOverlayKind(value.overlay) ? OverlayFootings[value.overlay].slipperiness : 1;
}

/** How the heroes move over `value` (see `Footing`): its speed and slipperiness, each its own or its kind's. */
export function OverlayFootingOf(value: OverlayValue): Footing {
    return { speed: OverlaySpeed(value), slipperiness: OverlaySlipperiness(value) };
}

/** The colour `value` is drawn in: its own tint, or its kind's. */
export function OverlayTint(value: OverlayValue): number {
    return value.tint != null ? value.tint : IsOverlayKind(value.overlay) ? OverlayLooks[value.overlay].tint : 0xffffff;
}

/** How strongly `value` mirrors what stands over it: its own reflectivity, or its kind's. */
export function OverlayReflectivity(value: OverlayValue): number {
    return value.reflectivity != null ? value.reflectivity : IsOverlayKind(value.overlay) ? OverlayLooks[value.overlay].reflectivity : 0;
}

/** How solid `value` is drawn, from 0 to 1: its own alpha, or 1. */
export function OverlayAlpha(value: OverlayValue): number {
    return value.alpha != null ? value.alpha : 1;
}

/** How `value` is laid over the floor: its own blend, or `normal`. */
export function OverlayBlendOf(value: OverlayValue): OverlayBlend {
    return IsOverlayBlend(value.blend) ? value.blend : "normal";
}

/** The bits of `OverlayCell.joins`: one for each of the eight cells round it, clockwise from the one above. */
export const enum OverlayJoin {
    N = 1,
    NE = 2,
    E = 4,
    SE = 8,
    S = 16,
    SW = 32,
    W = 64,
    NW = 128
}

/** The eight cells round one, with their `OverlayJoin` bit. */
const Neighbours: ReadonlyArray<{ dx: number; dy: number; bit: number }> = [
    { dx: 0, dy: -1, bit: OverlayJoin.N },
    { dx: 1, dy: -1, bit: OverlayJoin.NE },
    { dx: 1, dy: 0, bit: OverlayJoin.E },
    { dx: 1, dy: 1, bit: OverlayJoin.SE },
    { dx: 0, dy: 1, bit: OverlayJoin.S },
    { dx: -1, dy: 1, bit: OverlayJoin.SW },
    { dx: -1, dy: 0, bit: OverlayJoin.W },
    { dx: -1, dy: -1, bit: OverlayJoin.NW }
];

/** One painted overlay cell, as it's drawn. */
export type OverlayCell = Vec2Like & {
    /** Its value, sanitised (see `SanitiseOverlayValue`). */
    value: OverlayValue;
    /** Its kind's place in `OverlayKinds` - what the shader knows it by. */
    kind: number;
    /** How the heroes move over it (see `OverlayFootingOf`). */
    footing: Footing;
    tint: number;
    reflectivity: number;
    /** How solid it's drawn, its reflection too (see `OverlayAlpha`). */
    alpha: number;
    /** Its blend's place in `OverlayBlends` (see `OverlayBlendOf`). */
    blend: number;
    /**
     * Which of the eight cells round it are in the same patch - the same kind, at the same height - as `OverlayJoin` bits.
     * The patch is edged where a bit is missing.
     */
    joins: number;
    /** The cell in the level file's own coordinates (its brush's `position`), which its pattern is laid out on - so the editor draws it as the game does. */
    patternX: number;
    patternY: number;
};

/** An overlay to place: its cell and its brush's value, as `FindOverlays` lists them. */
export type OverlayPlacement = Vec2Like & { value: OverlayValue };

/**
 * Every `OVERLAY` brush in `brushes` that `isData` says is on a data layer, one a cell (the last, where there are more), with a value
 * the game can read (see `SanitiseOverlayValue`) - in the brushes' own coordinates.
 */
export function FindOverlays<B extends { name: string; position: Vec2Like; layerId: number; data: unknown }>(
    brushes: ReadonlyArray<B>,
    isData: (layerId: number) => boolean
): OverlayPlacement[] {
    const byCell = new Map<string, OverlayPlacement>();
    brushes.forEach(brush => {
        if (brush.name !== DataBrushName.OVERLAY || !isData(brush.layerId) || !IsOverlayValue(brush.data)) {
            return;
        }
        const key = brush.position.x + "," + brush.position.y;
        const value = SanitiseOverlayValue(brush.data);
        if (value) {
            // Re-added so the last one painted is listed where it was painted.
            byCell.delete(key);
            byCell.set(key, { x: brush.position.x, y: brush.position.y, value });
        } else {
            byCell.delete(key);
        }
    });
    return Array.from(byCell.values());
}

/**
 * Which of a level's tile layers (in drawing order) the overlays are drawn just over: the last floor layer (`kind` "floor") under
 * the figures (the first `playerLayer` - see `LevelFormat.TileLayerOrder`), so they lie on the floor and under the walls and
 * whatever stands on it. With no floor layer, the first layer, taken to be the floor, if it's under the figures; else -1, under them all.
 */
export function OverlayLayerIndex(tileLayers: ReadonlyArray<{ kind?: string }>, playerLayer: number): number {
    let index = -1;
    for (let i = 0; i < tileLayers.length && i < playerLayer; i++) {
        if (tileLayers[i].kind === "floor") {
            index = i;
        }
    }
    return index < 0 && tileLayers.length > 0 && playerLayer > 0 ? 0 : index;
}

/** Whether a cell mirrors anything: it has some reflectivity, and isn't faded away to nothing. */
function Mirrors(cell: OverlayCell): boolean {
    return cell.reflectivity > 0 && cell.alpha > 0;
}

/** A cell as one number, for the lookup - room for anything from -32768 to 32767 each way. */
function Key(x: number, y: number): number {
    return (x + 32768) * 65536 + (y + 32768);
}

/**
 * A level's overlays, by cell. Built once, as the level loads - nothing in play changes them. `heightAt` is each cell's height (a
 * patch doesn't run up or down a step); `pattern` is where the cells' own coordinates (the level's, normalised in play) are in
 * the level file's, so the pattern is laid out alike wherever the map starts.
 */
export default class Overlays {
    private cells: OverlayCell[] = [];
    private at = new Map<number, OverlayCell>();
    private reflective = false;

    constructor(placements: ReadonlyArray<OverlayPlacement> = [], heightAt: (x: number, y: number) => number = () => 0, pattern: Vec2Like = { x: 0, y: 0 }) {
        placements.forEach(({ x, y, value }) => {
            const cell: OverlayCell = {
                x,
                y,
                value,
                kind: OverlayKinds.indexOf(value.overlay),
                footing: OverlayFootingOf(value),
                tint: OverlayTint(value),
                reflectivity: OverlayReflectivity(value),
                alpha: OverlayAlpha(value),
                blend: OverlayBlends.indexOf(OverlayBlendOf(value)),
                joins: 0,
                patternX: x + pattern.x,
                patternY: y + pattern.y
            };
            const key = Key(x, y);
            const before = this.at.get(key);
            if (before) {
                this.cells.splice(this.cells.indexOf(before), 1);
            }
            this.at.set(key, cell);
            this.cells.push(cell);
        });
        this.cells.forEach(cell => {
            const height = heightAt(cell.x, cell.y);
            Neighbours.forEach(({ dx, dy, bit }) => {
                const other = this.At(cell.x + dx, cell.y + dy);
                if (other && other.value.overlay === cell.value.overlay && heightAt(other.x, other.y) === height) {
                    cell.joins |= bit;
                }
            });
            this.reflective = this.reflective || Mirrors(cell);
        });
    }

    /** Every overlay cell, in the order painted. */
    get All(): ReadonlyArray<OverlayCell> {
        return this.cells;
    }

    /** Whether the level has any overlay at all. */
    get Any(): boolean {
        return this.cells.length > 0;
    }

    /** Whether any overlay mirrors what stands over it (see `Reflects`) - if none does, nothing need be drawn mirrored. */
    get AnyReflective(): boolean {
        return this.reflective;
    }

    /** The overlay on the cell, or null. */
    At(x: number, y: number): OverlayCell | null {
        return this.at.get(Key(x, y)) || null;
    }

    /** How the heroes move on the cell (see `Footing`): as its overlay lets them, or as on bare floor where there's none. */
    FootingAt(x: number, y: number): Footing {
        const cell = this.at.get(Key(x, y));
        return cell ? cell.footing : BareFloor;
    }

    /** Whether the cell's overlay mirrors what stands over it - it has some reflectivity, and shows at all. */
    Reflects(x: number, y: number): boolean {
        const cell = this.at.get(Key(x, y));
        return !!cell && Mirrors(cell);
    }

    /**
     * Whether something standing with its bottom edge at `feet` (world pixels down), across `left` to `right` (world pixels along,
     * `right` not included), shows in a reflective overlay: one on a cell it stands on along that edge, or on the cell just below it -
     * the floor at its feet, or the water at the foot of a wall. `tileSize` is a cell's size in pixels.
     */
    ReflectsAt(left: number, right: number, feet: number, tileSize: number): boolean {
        if (!this.reflective) {
            return false;
        }
        const row = Math.floor((feet - 1) / tileSize);
        for (let x = Math.floor(left / tileSize), last = Math.floor((right - 1) / tileSize); x <= last; x++) {
            if (this.Reflects(x, row) || this.Reflects(x, row + 1)) {
                return true;
            }
        }
        return false;
    }
}
