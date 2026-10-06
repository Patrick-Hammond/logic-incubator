import { EmitterConfigData } from "./EmitterConfigModel";

/**
 * Where an emitter's particles appear, as lines to draw - with no pixi in it. Works the way the emitter's own spawn functions do:
 * everything is relative to the emission point, and each shape's offsets are turned about that point by the emitter's `rotation`,
 * in degrees, by the same formula as `ParticleUtils.rotatePoint`. The emission point is the owner's position plus the config's `pos`
 * - and `rotate()` turns `pos` about the owner along with the shapes, so the whole emitter swings round the owner.
 */

export interface Pt {
    x: number;
    y: number;
}

/** A line to draw, through `points`; `closed` joins the last back to the first. */
export interface Polyline {
    points: Pt[];
    closed: boolean;
}

export interface SpawnOutline {
    /** Where particles are emitted from - the owner's position plus `config.pos`, which turns with the emitter - in the emitter's container's space. */
    origin: Pt;
    /** The area they appear in, in the same space: nothing for a point. */
    shapes: Polyline[];
}

/** How many sides a circle is drawn with. */
export const CircleSides = 48;
/** How long a burst's rays are, in the container's own units. */
export const RayLength = 40;
/** The most rays drawn for a burst - a wave of hundreds is not made clearer by drawing them. */
export const MaxRays = 72;

/** `point` turned by `degrees` about (0, 0), as `ParticleUtils.rotatePoint` does. */
export function Rotate(point: Pt, degrees: number): Pt {
    if (!degrees) {
        return { x: point.x, y: point.y };
    }
    const angle = (degrees * Math.PI) / 180;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
}

function Number0(value: any, fallback = 0): number {
    const number = typeof value === "number" ? value : parseFloat(value);
    return isFinite(number) ? number : fallback;
}

/** A circle of `radius` about `centre`, as a closed line. */
function Circle(centre: Pt, radius: number): Polyline {
    const points: Pt[] = [];
    for (let i = 0; i < CircleSides; i++) {
        const angle = (i / CircleSides) * Math.PI * 2;
        points.push({ x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) });
    }
    return { points, closed: true };
}

/**
 * The outline of where `config` makes particles appear, for an emitter whose owner is at (`ownerX`, `ownerY`) and which is turned by
 * `rotation` degrees. Reads `spawnType` and the shape it needs (`spawnRect`, `spawnCircle`, `spawnPolygon`, `particleSpacing`...);
 * a shape the config doesn't have is left out rather than failing.
 */
export function BuildSpawnOutline(config: EmitterConfigData, ownerX: number, ownerY: number, rotation: number): SpawnOutline {
    // `Emitter.rotate` turns spawnPos (the config's pos) about the owner as well as the shapes, so the origin turns too.
    const pos = Rotate({ x: Number0(config.pos && config.pos.x), y: Number0(config.pos && config.pos.y) }, rotation);
    const origin: Pt = { x: ownerX + pos.x, y: ownerY + pos.y };
    /** A point given as an offset from the origin, turned with the emitter, as a point in the container's space. */
    const place = (x: number, y: number): Pt => {
        const turned = Rotate({ x, y }, rotation);
        return { x: origin.x + turned.x, y: origin.y + turned.y };
    };
    const shapes: Polyline[] = [];

    switch (config.spawnType) {
        case "rect": {
            const r = config.spawnRect;
            if (r) {
                const x = Number0(r.x), y = Number0(r.y), w = Number0(r.w), h = Number0(r.h);
                shapes.push({ points: [place(x, y), place(x + w, y), place(x + w, y + h), place(x, y + h)], closed: true });
            }
            break;
        }
        case "circle":
        case "ring": {
            const c = config.spawnCircle;
            if (c) {
                const centre = place(Number0(c.x), Number0(c.y));
                const radius = Math.max(0, Number0(c.r));
                shapes.push(Circle(centre, radius));
                const inner = Number0(c.minR);
                if (config.spawnType === "ring" && inner > 0 && inner !== radius) {
                    shapes.push(Circle(centre, Math.min(inner, radius)));
                }
            }
            break;
        }
        case "burst": {
            const spacing = Number0(config.particleSpacing);
            if (spacing === 0) {
                // each particle goes off in a random direction: a ring round the origin says "all of them"
                shapes.push(Circle(origin, RayLength / 2));
            } else {
                const start = Number0(config.angleStart);
                const count = Math.min(MaxRays, Math.max(1, Math.floor(Number0(config.particlesPerWave, 1))));
                for (let i = 0; i < count; i++) {
                    const angle = ((start + spacing * i + rotation) * Math.PI) / 180;
                    shapes.push({ points: [origin, { x: origin.x + RayLength * Math.cos(angle), y: origin.y + RayLength * Math.sin(angle) }], closed: false });
                }
            }
            break;
        }
        case "polygonalChain": {
            const data = config.spawnPolygon;
            const chains: Pt[][] = Array.isArray(data) ? (Array.isArray(data[0]) ? data : [data]) : [];
            chains.forEach(chain => {
                if (chain.length) {
                    shapes.push({ points: chain.map(p => place(Number0(p.x), Number0(p.y))), closed: false });
                }
            });
            break;
        }
        default:
            break; // a point: just the origin
    }
    return { origin, shapes };
}
