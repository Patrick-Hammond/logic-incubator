import { describe, expect, it } from "vitest";
import FocusManager, { FocusChange, Focusable, FocusRect } from "./FocusManager";
import { Direction } from "./UiAction";

class Item implements Focusable {
    OnDirection?: (direction: Direction) => boolean;
    enabled = true;
    visibleRect: FocusRect | null;
    focus: Array<[boolean, boolean]> = [];
    activated = 0;
    neighbours?: Partial<Record<Direction, string>>;

    constructor(readonly id: string, x: number, y: number, w = 40, h = 20) {
        this.visibleRect = { x, y, width: w, height: h };
    }
    Rect() {
        return this.visibleRect;
    }
    Enabled() {
        return this.enabled;
    }
    SetFocused(focused: boolean, visible: boolean) {
        this.focus.push([focused, visible]);
    }
    Activate() {
        this.activated++;
    }
}

/** A grid of items: columns x rows, named "c<col>r<row>", 50 apart across and 30 down. */
function grid(manager: FocusManager, cols: number, rows: number, scope?: string): Item[][] {
    const items: Item[][] = [];
    for (let c = 0; c < cols; c++) {
        items.push([]);
        for (let r = 0; r < rows; r++) {
            const item = new Item(`${scope || ""}c${c}r${r}`, c * 50, r * 30);
            manager.Register(item, scope);
            items[c].push(item);
        }
    }
    return items;
}

const press = (manager: FocusManager, ...actions: Parameters<FocusManager["Handle"]>[0][]) => actions.forEach(a => manager.Handle(a));

describe("FocusManager: the first press", () => {
    it("focuses the first item in reading order and shows the ring, without also moving", () => {
        const m = new FocusManager();
        const g = grid(m, 2, 2);
        expect(m.Focused).toBeNull();
        expect(m.Handle("down")).toBe(true);
        expect(m.Focused).toBe(g[0][0]);
        expect(m.FocusVisible).toBe(true);
        expect(g[0][0].focus).toEqual([[true, true]]);
    });

    it("skips disabled items when picking the first", () => {
        const m = new FocusManager();
        const g = grid(m, 1, 3);
        g[0][0].enabled = false;
        m.Handle("accept");
        expect(m.Focused).toBe(g[0][1]);
        expect(g[0][1].activated).toBe(0);
    });

    it("isn't handled when there is nothing to focus", () => {
        const m = new FocusManager();
        expect(m.Handle("down")).toBe(false);
    });
});

describe("FocusManager: moving", () => {
    it("moves to the nearest item in the direction pressed", () => {
        const m = new FocusManager();
        const g = grid(m, 3, 3);
        m.Handle("down"); // focus c0r0
        press(m, "right", "down", "down", "left");
        expect(m.Focused).toBe(g[0][2]);
        press(m, "up");
        expect(m.Focused).toBe(g[0][1]);
    });

    it("stays put at an edge when the scope doesn't wrap", () => {
        const m = new FocusManager();
        const g = grid(m, 2, 2);
        m.Handle("down");
        press(m, "up", "left");
        expect(m.Focused).toBe(g[0][0]);
    });

    it("prefers the item in line over a nearer one off to the side", () => {
        const m = new FocusManager();
        const a = new Item("a", 0, 0, 100, 20);
        const nearButOff = new Item("near", 140, 25); // close, but beside
        const inLine = new Item("line", 30, 80, 40, 20); // further, but straight below
        [a, nearButOff, inLine].forEach(i => m.Register(i));
        m.Focus("a");
        m.SetFocusVisible(true);
        m.Handle("down");
        expect(m.Focused).toBe(inLine);
    });

    it("doesn't jump to a far column that merely sits lower: it wraps round (or stays) instead", () => {
        const m = new FocusManager();
        const menu = [0, 1, 2].map(i => new Item("menu" + i, 300, i * 30));
        const side = [0, 1, 2, 3, 4].map(i => new Item("side" + i, 0, i * 30));
        [...menu, ...side].forEach(i => m.Register(i));
        m.Focus("menu2");
        m.SetFocusVisible(true);
        m.Handle("down"); // nothing below it nearby: side3 and side4 are lower, but 260 pixels off to the side
        expect(m.Focused).toBe(menu[2]);
        m.ConfigureScope({ wrap: true });
        m.Handle("down");
        expect(m.Focused).toBe(menu[0]);
    });

    it("still reaches an item below and a little off to the side, as in a grid whose rows don't quite line up", () => {
        const m = new FocusManager();
        const top = new Item("top", 0, 0);
        const lower = new Item("lower", 30, 30); // half its width over
        [top, lower].forEach(i => m.Register(i));
        m.Focus("top");
        m.SetFocusVisible(true);
        m.Handle("down");
        expect(m.Focused).toBe(lower);
    });

    it("steps from a tall item to the one in line with its middle", () => {
        const m = new FocusManager();
        const tall = new Item("tall", 0, 0, 40, 100);
        const top = new Item("top", 60, 0);
        const middle = new Item("middle", 60, 40);
        const bottom = new Item("bottom", 60, 80);
        [tall, top, middle, bottom].forEach(i => m.Register(i));
        m.Focus("tall");
        m.SetFocusVisible(true);
        m.Handle("right");
        // all three are beside it; the one whose middle is level with the tall item's middle (y 50) is the one reached.
        expect(m.Focused).toBe(middle);
    });

    it("skips disabled and unmeasurable items", () => {
        const m = new FocusManager();
        const g = grid(m, 1, 4);
        g[0][1].enabled = false;
        g[0][2].visibleRect = null;
        m.Handle("down");
        m.Handle("down");
        expect(m.Focused).toBe(g[0][3]);
    });

    it("lets an item name where each direction goes, over the search - but not to a disabled one", () => {
        const m = new FocusManager();
        const g = grid(m, 2, 2);
        g[0][0].neighbours = { right: "c1r1", down: "c1r0" };
        g[1][0].enabled = false;
        m.Handle("down");
        m.Handle("right");
        expect(m.Focused).toBe(g[1][1]);
        m.Focus("c0r0");
        m.Handle("down"); // the named neighbour is disabled, so the normal search applies
        expect(m.Focused).toBe(g[0][1]);
    });

    it("wraps round when the scope asks", () => {
        const m = new FocusManager();
        const g = grid(m, 2, 3);
        m.ConfigureScope({ wrap: true });
        m.Handle("down");
        press(m, "up");
        expect(m.Focused).toBe(g[0][2]);
        press(m, "down");
        expect(m.Focused).toBe(g[0][0]);
        press(m, "left");
        expect(m.Focused).toBe(g[1][0]);
        press(m, "right");
        expect(m.Focused).toBe(g[0][0]);
    });

    it("wraps to the item nearest in line, not just the last", () => {
        const m = new FocusManager();
        const g = grid(m, 2, 2);
        m.ConfigureScope({ wrap: true });
        m.Focus("c1r0");
        m.SetFocusVisible(true);
        m.Handle("up");
        expect(m.Focused).toBe(g[1][1]);
    });
});

describe("FocusManager: items that use a direction themselves", () => {
    it("offers a direction to the focused item first, and only moves focus if it doesn't take it", () => {
        const m = new FocusManager();
        const g = grid(m, 1, 3);
        const taken: Direction[] = [];
        g[0][0].OnDirection = direction => {
            taken.push(direction);
            return direction === "left" || direction === "right"; // a slider uses left and right
        };
        m.Handle("down"); // focus c0r0
        m.Handle("right");
        m.Handle("left");
        expect(m.Focused).toBe(g[0][0]);
        m.Handle("down");
        expect(m.Focused).toBe(g[0][1]);
        expect(taken).toEqual(["right", "left", "down"]);
    });
});

describe("FocusManager: accept, cancel and tabs", () => {
    it("activates the focused item on accept", () => {
        const m = new FocusManager();
        const g = grid(m, 1, 2);
        m.Handle("down");
        expect(m.Handle("accept")).toBe(true);
        expect(g[0][0].activated).toBe(1);
        m.Handle("down");
        m.Handle("accept");
        expect(g[0][1].activated).toBe(1);
    });

    it("doesn't activate a disabled item that became disabled while focused", () => {
        const m = new FocusManager();
        const g = grid(m, 1, 1);
        m.Handle("down");
        g[0][0].enabled = false;
        m.Handle("accept");
        expect(g[0][0].activated).toBe(0);
    });

    it("hands cancel and the tab keys to the active scope, and says whether anyone took them", () => {
        const m = new FocusManager();
        grid(m, 1, 1);
        expect(m.Handle("cancel")).toBe(false);
        expect(m.Handle("tabNext")).toBe(false);
        const log: string[] = [];
        m.ConfigureScope({ onCancel: () => log.push("cancel"), onTab: step => log.push("tab " + step) });
        expect(m.Handle("cancel")).toBe(true);
        expect(m.Handle("tabPrev")).toBe(true);
        expect(m.Handle("tabNext")).toBe(true);
        expect(log).toEqual(["cancel", "tab -1", "tab 1"]);
    });
});

describe("FocusManager: pointer and keyboard sharing focus", () => {
    it("focuses what is hovered without showing the ring, and keeps showing it once the keyboard is used", () => {
        const m = new FocusManager();
        const g = grid(m, 1, 3);
        m.Focus("c0r1"); // a pointer hover
        expect(g[0][1].focus).toEqual([[true, false]]);
        expect(m.FocusVisible).toBe(false);
        m.Handle("down");
        expect(m.Focused).toBe(g[0][2]);
        expect(m.FocusVisible).toBe(true);
        // told the ring is now shown (the keyboard took over), then that focus left
        expect(g[0][1].focus).toEqual([[true, false], [true, true], [false, false]]);
        expect(g[0][2].focus).toEqual([[true, true]]);
    });

    it("an accept that only brings the ring back doesn't activate", () => {
        const m = new FocusManager();
        const g = grid(m, 1, 2);
        m.Focus("c0r0");
        m.Handle("accept");
        expect(g[0][0].activated).toBe(0);
        expect(m.FocusVisible).toBe(true);
        m.Handle("accept");
        expect(g[0][0].activated).toBe(1);
    });

    it("hides the ring when the pointer takes over, telling the item and the listeners", () => {
        const m = new FocusManager();
        const g = grid(m, 1, 1);
        const changes: FocusChange[] = [];
        m.Subscribe(c => changes.push(c));
        m.Handle("down");
        m.SetFocusVisible(false);
        expect(g[0][0].focus).toEqual([[true, true], [true, false]]);
        expect(changes.map(c => [c.item && c.item.id, c.visible])).toEqual([["c0r0", true], ["c0r0", false]]);
        m.SetFocusVisible(false); // no change, no news
        expect(changes.length).toBe(2);
    });
});

describe("FocusManager: scopes", () => {
    it("lets only the pushed scope's items be focused or reached, and focuses into it", () => {
        const m = new FocusManager();
        const main = grid(m, 1, 2);
        const dialog = grid(m, 2, 1, "dlg:");
        m.Handle("down");
        m.PushScope("dlg:");
        expect(m.Focused).toBe(dialog[0][0]);
        expect(m.Focus("c0r1")).toBe(false);
        press(m, "right");
        expect(m.Focused).toBe(dialog[1][0]);
        press(m, "down", "left", "up");
        expect(main.every(col => col.every(i => i.activated === 0))).toBe(true);
        expect(m.Focused === dialog[0][0] || m.Focused === dialog[1][0]).toBe(true);
    });

    it("puts focus back where it was when the scope is popped", () => {
        const m = new FocusManager();
        const main = grid(m, 1, 3);
        grid(m, 1, 1, "dlg:");
        m.Handle("down");
        press(m, "down");
        expect(m.Focused).toBe(main[0][1]);
        m.PushScope("dlg:");
        m.PopScope("dlg:");
        expect(m.Focused).toBe(main[0][1]);
        expect(main[0][1].focus.slice(-1)).toEqual([[true, true]]);
    });

    it("sends cancel to the scope on top, and focuses its named initial item", () => {
        const m = new FocusManager();
        grid(m, 1, 1);
        const dialog = grid(m, 3, 1, "d:");
        let cancelled = 0;
        m.Handle("down");
        m.PushScope("d:", { initial: "d:c2r0", onCancel: () => cancelled++ });
        expect(m.Focused).toBe(dialog[2][0]);
        expect(m.Handle("cancel")).toBe(true);
        expect(cancelled).toBe(1);
        m.PopScope("d:");
        expect(m.Handle("cancel")).toBe(false);
    });

    it("leaves a popped scope's focus alone when what it came from is gone", () => {
        const m = new FocusManager();
        const unregister = (() => {
            const item = new Item("only", 0, 0);
            return m.Register(item);
        })();
        grid(m, 1, 1, "d:");
        m.Handle("down");
        m.PushScope("d:");
        unregister();
        m.PopScope("d:");
        expect(m.Focused).toBeNull();
    });

    it("refuses a scope pushed twice, and pops only what is pushed", () => {
        const m = new FocusManager();
        m.PushScope("a");
        expect(() => m.PushScope("a")).toThrow(/already in use/);
        expect(() => m.PushScope("")).toThrow(/already in use/);
        m.PopScope("never");
        m.PopScope("a");
        m.PushScope("a");
    });
});

describe("FocusManager: registering", () => {
    it("refuses two items with one id", () => {
        const m = new FocusManager();
        m.Register(new Item("x", 0, 0));
        expect(() => m.Register(new Item("x", 10, 10))).toThrow('There is already a focusable called "x".');
    });

    it("drops focus from an item that unregisters, telling listeners", () => {
        const m = new FocusManager();
        const item = new Item("x", 0, 0);
        const off = m.Register(item);
        const changes: Array<string | null> = [];
        m.Subscribe(c => changes.push(c.item && c.item.id));
        m.Handle("accept");
        off();
        off(); // harmless
        expect(m.Focused).toBeNull();
        expect(changes).toEqual(["x", null]);
        // its id can be used again
        m.Register(new Item("x", 0, 0));
    });

    it("stops telling a listener that has unsubscribed", () => {
        const m = new FocusManager();
        grid(m, 1, 2);
        let n = 0;
        const off = m.Subscribe(() => n++);
        m.Handle("down");
        off();
        m.Handle("down");
        expect(n).toBe(1);
    });
});
