import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadFromLocalStorage, SaveToLocalStorage } from "./Storage";

describe("local storage helpers", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("store and read back a value", () => {
        const kept = new Map<string, string>();
        vi.stubGlobal("Storage", class {});
        vi.stubGlobal("window", { localStorage: { getItem: (key: string) => (kept.has(key) ? kept.get(key) : null), setItem: (key: string, value: string) => kept.set(key, value) } });
        expect(SaveToLocalStorage("k", "v")).toBe(true);
        expect(LoadFromLocalStorage("k")).toBe("v");
        expect(LoadFromLocalStorage("missing")).toBeNull();
    });

    it("say false, rather than throw, when the storage is full or blocked", () => {
        const full = Object.assign(new Error("full"), { name: "QuotaExceededError" });
        vi.stubGlobal("Storage", class {});
        vi.stubGlobal("window", {
            localStorage: {
                getItem: () => {
                    throw new Error("blocked");
                },
                setItem: () => {
                    throw full;
                }
            }
        });
        expect(SaveToLocalStorage("k", "v")).toBe(false);
        expect(LoadFromLocalStorage("k")).toBeNull();
    });

    it("say false without local storage at all", () => {
        vi.stubGlobal("Storage", undefined);
        expect(SaveToLocalStorage("k", "v")).toBe(false);
        expect(LoadFromLocalStorage("k")).toBeNull();
    });
});
