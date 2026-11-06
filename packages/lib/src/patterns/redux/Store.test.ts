import { describe, expect, it } from "vitest";
import Store, { IAction } from "./Store";

class Counter extends Store<{ n: number }, number> {
    protected DefaultState(): { n: number } {
        return { n: 0 };
    }

    protected Reduce(state: { n: number }, action: IAction<number>): { n: number } {
        return action.type === "add" ? { n: state.n + action.data } : state.n === undefined ? this.DefaultState() : state;
    }
}

describe("Store undo", () => {
    it("steps back through the actions that asked for it", () => {
        const store = new Counter(5);
        store.Dispatch({ type: "add", data: 1, canUndo: true });
        store.Dispatch({ type: "add", data: 2, canUndo: true });
        store.Undo();
        expect(store.state.n).toBe(1);
        store.Undo();
        expect(store.state.n).toBe(0);
    });

    it("has nothing to step back to once cleared - after another document is loaded, say", () => {
        const store = new Counter(5);
        store.Dispatch({ type: "add", data: 1, canUndo: true });
        store.Dispatch({ type: "add", data: 2, canUndo: true });
        store.Load({ n: 40 });
        store.ClearUndo();
        store.Undo();
        expect(store.state.n).toBe(40);
        store.Dispatch({ type: "add", data: 2, canUndo: true });
        store.Undo();
        expect(store.state.n).toBe(40);
    });
});
