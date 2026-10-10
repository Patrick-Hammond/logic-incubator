/**
 * How the one camera frames a party of heroes on a shared screen: centred on the box round them, and
 * zoomed out - from the usual close-up down to half of it - as they spread, so everyone stays in view.
 * Past that the screen's edge holds them back (see `sim/Leash` and `PartySpan`). Pure - no pixi - so it
 * runs under the plain node test runner.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../../Constants";

/** The furthest the camera zooms out for a party: half its usual zoom - 1x, where a lone hero gets 2x. */
export const MinPartyZoom = 0.5;
/** Tiles kept clear between the outermost heroes and the screen's edge. */
export const PartyMargin = 3;

/** A box round the heroes' top-lefts, in world pixels. */
export type PartyBox = { minX: number; minY: number; maxX: number; maxY: number };

/** The box round these top-lefts, in pixels - into `out` if given. Every side is 0 for none. */
export function PartyBounds(positions: ReadonlyArray<Vec2Like>, out: PartyBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 }): PartyBox {
    if (!positions.length) {
        out.minX = out.minY = out.maxX = out.maxY = 0;
        return out;
    }
    out.minX = out.maxX = positions[0].x;
    out.minY = out.maxY = positions[0].y;
    for (let i = 1; i < positions.length; i++) {
        const p = positions[i];
        out.minX = Math.min(out.minX, p.x);
        out.maxX = Math.max(out.maxX, p.x);
        out.minY = Math.min(out.minY, p.y);
        out.maxY = Math.max(out.maxY, p.y);
    }
    return out;
}

/**
 * The zoom (1 down to `MinPartyZoom`, multiplying the camera's own - see `Camera.EffectiveZoom`) that fits
 * the whole box, each hero's tile and `PartyMargin` round it, into a view `view` tiles across at zoom 1.
 */
export function PartyZoom(box: PartyBox, view: { width: number; height: number }): number {
    const width = (box.maxX - box.minX) / TileSize + 1 + PartyMargin * 2;
    const height = (box.maxY - box.minY) / TileSize + 1 + PartyMargin * 2;
    return Math.max(MinPartyZoom, Math.min(1, view.width / width, view.height / height));
}

/**
 * The furthest apart, in tiles between top-lefts, the party may spread across and down: what fills a
 * view `view` tiles across at zoom 1 once zoomed out all the way, less the margin - so a party held to it
 * (see `Leash`) always fits on screen.
 */
export function PartySpan(view: { width: number; height: number }): { width: number; height: number } {
    return {
        width: Math.max(0, view.width / MinPartyZoom - 1 - PartyMargin * 2),
        height: Math.max(0, view.height / MinPartyZoom - 1 - PartyMargin * 2)
    };
}
