import { EventEmitter } from "eventemitter3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DisplayObject } from "pixi.js";
import { DragObject, DragOptions } from "./DragObject";

/** A parent space that is scaled and offset from the stage's, like a camera or a scaled layer. */
type Space = { scale: number; offset: { x: number; y: number } };

class FakeTarget extends EventEmitter {
    interactive = false;
    cursor = "";
    name = "";
    x = 100;
    y = 50;
    parent: Space | null = { scale: 2, offset: { x: 10, y: 20 } };
    position = { set: (x: number, y: number) => { this.x = x; this.y = y; } };
}

/** `DragObject` for the fake, which has just the parts of a display object that it uses. */
const Enable = (fake: FakeTarget, options?: DragOptions) => DragObject(fake as unknown as DisplayObject, options);

/**
 * A pointer event with the pointer at (`gx`, `gy`) on the stage. `getLocalPosition` answers in the space it is
 * asked about, as pixi does: a helper that read global coordinates would get these numbers wrong.
 */
function Ev(pointerId: number, gx: number, gy: number, button = 0) {
    return {
        data: {
            pointerId,
            button,
            getLocalPosition: (space: Space) => ({ x: (gx - space.offset.x) / space.scale, y: (gy - space.offset.y) / space.scale }),
        },
        stopPropagation: vi.fn(),
    };
}

/** The stage position of a point given in the default parent's space. */
const G = (lx: number, ly: number) => ({ x: lx * 2 + 10, y: ly * 2 + 20 });

let target: FakeTarget;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    target = new FakeTarget();
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
    vi.restoreAllMocks();
});

/** Press at parent-space (`px`, `py`), move to (`mx`, `my`), and let go. */
function Drag(px: number, py: number, mx: number, my: number, up: "pointerup" | "pointerupoutside" | "pointercancel" = "pointerup"): void {
    const press = G(px, py);
    const move = G(mx, my);
    target.emit("pointerdown", Ev(1, press.x, press.y));
    target.emit("pointermove", Ev(1, move.x, move.y));
    target.emit(up, Ev(1, move.x, move.y));
}

describe("moving", () => {
    it("moves the object by the pointer's travel in its parent's space, keeping the grabbed point under the pointer", () => {
        Enable(target);

        // Grabbed 5 left of and 5 below the object's position, in the parent's space.
        Drag(105, 55, 155, 105);

        expect(target.x).toBe(150);
        expect(target.y).toBe(100);
    });

    it("follows the pointer all the way - every move, not just the last", () => {
        Enable(target);
        const press = G(100, 50);
        target.emit("pointerdown", Ev(1, press.x, press.y));

        [[110, 60], [140, 90], [90, 40]].forEach(([x, y]) => {
            const g = G(x, y);
            target.emit("pointermove", Ev(1, g.x, g.y));
            expect(target.x).toBe(x);
            expect(target.y).toBe(y);
        });
    });

    it("rounds to whole pixels by default", () => {
        Enable(target);

        Drag(100.3, 50.3, 120.6, 70.6); // the object would land on (120.3, 70.3)

        expect(target.x).toBe(120);
        expect(target.y).toBe(70);
    });

    it("moves freely with snap 0", () => {
        Enable(target, { snap: 0 });

        Drag(100.3, 50.3, 120.6, 70.6);

        expect(target.x).toBeCloseTo(120.3, 9);
        expect(target.y).toBeCloseTo(70.3, 9);
    });

    it("snaps to a grid of any size", () => {
        Enable(target, { snap: 8 });

        Drag(100, 50, 121, 70); // (121, 70) -> (120, 72)

        expect(target.x).toBe(120);
        expect(target.y).toBe(72);
    });
});

describe("which events count", () => {
    it("ignores moves until the object has been pressed", () => {
        Enable(target);
        const g = G(300, 300);

        target.emit("pointermove", Ev(1, g.x, g.y));

        expect(target.x).toBe(100);
        expect(target.y).toBe(50);
    });

    it("ignores another pointer while one is dragging", () => {
        Enable(target);
        const press = G(100, 50);
        target.emit("pointerdown", Ev(1, press.x, press.y));

        const other = G(300, 300);
        target.emit("pointerdown", Ev(2, other.x, other.y)); // a second finger
        target.emit("pointermove", Ev(2, other.x, other.y));
        target.emit("pointerup", Ev(2, other.x, other.y));

        expect(target.x).toBe(100);
        expect(target.y).toBe(50);
        const move = G(120, 70);
        target.emit("pointermove", Ev(1, move.x, move.y)); // the first one is still dragging
        expect(target.x).toBe(120);
    });

    it("ignores a press with another button than the main one", () => {
        Enable(target);
        const press = G(100, 50);
        const rightClick = Ev(1, press.x, press.y, 2);

        target.emit("pointerdown", rightClick);
        const move = G(200, 200);
        target.emit("pointermove", Ev(1, move.x, move.y));

        expect(target.x).toBe(100);
        expect(rightClick.stopPropagation).not.toHaveBeenCalled();
    });

    it("ignores a press while the object is not on the stage", () => {
        Enable(target);
        target.parent = null;

        const press = G(100, 50);
        target.emit("pointerdown", Ev(1, press.x, press.y));
        target.parent = { scale: 2, offset: { x: 10, y: 20 } };
        const move = G(200, 200);
        target.emit("pointermove", Ev(1, move.x, move.y));

        expect(target.x).toBe(100);
    });

    it("stops the press reaching the object's ancestors, so a draggable parent doesn't move as well", () => {
        Enable(target);
        const press = G(100, 50);
        const event = Ev(1, press.x, press.y);

        target.emit("pointerdown", event);

        expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    });

    it.each(["pointerup", "pointerupoutside", "pointercancel"] as const)("ends the drag on %s", up => {
        Enable(target);
        Drag(100, 50, 120, 70, up);
        expect(target.x).toBe(120);

        const later = G(300, 300);
        target.emit("pointermove", Ev(1, later.x, later.y));

        expect(target.x).toBe(120); // let go: no longer following
    });
});

describe("logging", () => {
    it("logs the position once, on drop, under the label", () => {
        Enable(target, { label: "title" });
        const press = G(100, 50);
        const move = G(120, 70);
        target.emit("pointerdown", Ev(1, press.x, press.y));
        target.emit("pointermove", Ev(1, move.x, move.y));
        expect(log).not.toHaveBeenCalled();

        target.emit("pointerup", Ev(1, move.x, move.y));

        expect(log).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith("title: {x:120, y:70}");
    });

    it("names the object by its `name`, else its class", () => {
        Enable(target);
        Drag(100, 50, 100, 50);
        expect(log).toHaveBeenLastCalledWith("FakeTarget: {x:100, y:50}");

        target.name = "hud";
        Drag(100, 50, 100, 50);
        expect(log).toHaveBeenLastCalledWith("hud: {x:100, y:50}");
    });

    it("tidies a free drag's position to two decimals", () => {
        Enable(target, { snap: 0, label: "t" });

        Drag(100, 50, 120.123456, 70.5);

        expect(log).toHaveBeenCalledWith("t: {x:120.12, y:70.5}");
    });

    it("stays quiet with log: false", () => {
        Enable(target, { log: false });

        Drag(100, 50, 120, 70);

        expect(log).not.toHaveBeenCalled();
    });
});

describe("stopping", () => {
    it("makes the object interactive, with a move cursor, while it is on", () => {
        Enable(target);

        expect(target.interactive).toBe(true);
        expect(target.cursor).toBe("move");
    });

    it("puts back what the object had, and listens no more", () => {
        target.interactive = false;
        target.cursor = "pointer";
        const stop = Enable(target);

        stop();

        expect(target.interactive).toBe(false);
        expect(target.cursor).toBe("pointer");
        ["pointerdown", "pointermove", "pointerup", "pointerupoutside", "pointercancel"].forEach(name => expect(target.listenerCount(name)).toBe(0));

        Drag(100, 50, 200, 200);
        expect(target.x).toBe(100);
    });

    it("leaves an object that was interactive already interactive", () => {
        target.interactive = true;
        target.cursor = "pointer";

        Enable(target)();

        expect(target.interactive).toBe(true);
        expect(target.cursor).toBe("pointer");
    });

    it("drops a drag that is in progress", () => {
        const stop = Enable(target);
        const press = G(100, 50);
        target.emit("pointerdown", Ev(1, press.x, press.y));

        stop();
        const move = G(200, 200);
        target.emit("pointermove", Ev(1, move.x, move.y));

        expect(target.x).toBe(100);
    });
});
