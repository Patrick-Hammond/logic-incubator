import { Container, Graphics } from "pixi.js";
import type { Emitter } from "../particles";
import { EmitterConfigData } from "./EmitterConfigModel";
import { BuildSpawnOutline, Pt } from "./SpawnOutline";

/** What each outline is drawn in. The panel's legend shows the same. */
export const OverlayColours = {
    /** The kill area: where particles live until they leave. */
    kill: 0xff5a5a,
    /** The spawn shape: where particles appear. */
    spawn: 0x4cd9ff,
    /** The spawn point: where they are emitted from. */
    point: 0xffe14c,
};

const CrossSize = 9;

/** The container at the top of the tree `container` is in - the stage, when it is on one. */
function RootOf(container: Container): Container {
    let top = container;
    while (top.parent) {
        top = top.parent;
    }
    return top;
}

/**
 * Draws on the game's stage, over everything, where an emitter's particles come from and - if its config has one - the area they
 * live in: the spawn shape (rectangle, circle, ring, burst rays, polygon chain), the spawn point as a cross, and the kill area.
 * For tuning them by eye. Development only.
 *
 * A single `Graphics` on the stage's root, redrawn on `Update` (the panel calls it each frame). A spawn shape is in its emitter's
 * container's space, so its points are taken to the stage through that container's `worldTransform` - the outline follows the
 * container however it is placed, scaled or turned. The kill area is already in the stage's space.
 */
export class EmitterOverlay {
    /** Whether to draw at all. */
    enabled = true;

    private graphics = new Graphics();
    private emitters: Emitter[] = [];
    private getConfig: () => EmitterConfigData = () => ({});

    /** What to outline: `emitters`, with the spawn shape and kill area that `getConfig` describes - asked at each `Update`, so edits show at once. */
    Show(emitters: Emitter[], getConfig: () => EmitterConfigData): void {
        this.emitters = emitters;
        this.getConfig = getConfig;
        this.Update();
    }

    /** Draws the outlines as things stand now. */
    Update(): void {
        const g = this.graphics;
        g.clear();
        const anchor = this.emitters.filter(emitter => emitter.parent)[0];
        if (!this.enabled || !anchor) {
            this.Detach();
            return;
        }
        const root = RootOf(anchor.parent);
        if (g.parent !== root || root.children[root.children.length - 1] !== g) {
            root.addChild(g); // on top - a scene shown since has been added over it
        }

        const config = this.getConfig();
        const kill = config.killRect;
        if (kill && [kill.x, kill.y, kill.w, kill.h].every(n => typeof n === "number" && isFinite(n))) {
            this.Stroke([{ x: kill.x, y: kill.y }, { x: kill.x + kill.w, y: kill.y }, { x: kill.x + kill.w, y: kill.y + kill.h }, { x: kill.x, y: kill.y + kill.h }], true, OverlayColours.kill, 2);
        }

        this.emitters.forEach(emitter => {
            if (!emitter.parent) {
                return;
            }
            const m = emitter.parent.worldTransform;
            const toStage = (p: Pt): Pt => ({ x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty });
            const outline = BuildSpawnOutline(config, emitter.ownerPos.x, emitter.ownerPos.y, emitter.rotation);

            outline.shapes.forEach(shape => this.Stroke(shape.points.map(toStage), shape.closed, OverlayColours.spawn, 1.5));
            const o = toStage(outline.origin);
            this.Stroke([{ x: o.x - CrossSize, y: o.y }, { x: o.x + CrossSize, y: o.y }], false, OverlayColours.point, 2);
            this.Stroke([{ x: o.x, y: o.y - CrossSize }, { x: o.x, y: o.y + CrossSize }], false, OverlayColours.point, 2);
        });
    }

    /** Takes the outlines off the stage and lets go of them. */
    Destroy(): void {
        this.Detach();
        try {
            this.graphics.destroy();
        } catch {
            // the stage may have destroyed it already, with the game
        }
        this.emitters = [];
    }

    private Detach(): void {
        if (this.graphics.parent) {
            this.graphics.parent.removeChild(this.graphics);
        }
    }

    /** A line through `points` in `colour`, over a dark one a little wider, so it reads on any background. */
    private Stroke(points: Pt[], closed: boolean, colour: number, width: number): void {
        if (points.length < 2) {
            return;
        }
        const g = this.graphics;
        [[0x000000, width + 2, 0.55], [colour, width, 0.95]].forEach(([lineColour, lineWidth, alpha]) => {
            g.lineStyle(lineWidth, lineColour, alpha);
            g.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                g.lineTo(points[i].x, points[i].y);
            }
            if (closed) {
                g.lineTo(points[0].x, points[0].y);
            }
        });
    }
}
