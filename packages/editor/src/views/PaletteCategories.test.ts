import { describe, expect, it } from "vitest";
import { AssetCategories, AssetCategory } from "@logic-incubator/engine/level/AssetMetadata";
import { EmptyTabHint, GroupByCategory, ShowsCategory, TakesCategory } from "./PaletteCategories";

describe("GroupByCategory", () => {
    const categories: { [name: string]: AssetCategory } = {
        wall_mid: "walls", floor_1: "floor",
        goblin_idle_anim: "entities", weapon_bow: "weapons", potion_1: "items", skull: "misc", my_tile: "user"
    };
    const categoryOf = (name: string): AssetCategory => categories[name] || "misc";

    it("makes a tab for every category, in the palette's order, even an empty one", () => {
        const sets = GroupByCategory([], categoryOf);
        expect(sets.map(set => set.id)).toEqual(["floor", "walls", "entities", "weapons", "items", "misc", "user"]);
        expect(sets.map(set => set.name)).toEqual(["Floor", "Walls", "Entities", "Weapons", "Items", "Misc", "User"]);
        expect(sets.every(set => set.brushes.length === 0)).toBe(true);
        expect(sets.map(set => set.id)).toEqual(AssetCategories.map(category => category.id));
    });

    it("files each sprite under its category", () => {
        const sets = GroupByCategory(Object.keys(categories), categoryOf);
        const brushes = (id: string) => sets.find(set => set.id === id).brushes;
        expect(brushes("floor")).toEqual(["floor_1"]);
        expect(brushes("walls")).toEqual(["wall_mid"]);
        expect(brushes("entities")).toEqual(["goblin_idle_anim"]);
        expect(brushes("weapons")).toEqual(["weapon_bow"]);
        expect(brushes("items")).toEqual(["potion_1"]);
        expect(brushes("misc")).toEqual(["skull"]);
        expect(brushes("user")).toEqual(["my_tile"]);
    });

    it("lists a sprite with no category under Misc", () => {
        const sets = GroupByCategory(["uncategorised"], categoryOf);
        expect(sets.find(set => set.id === "misc").brushes).toEqual(["uncategorised"]);
    });

    it("sorts a tab by name whatever order the names arrive in", () => {
        const names = ["wall_b", "wall_a", "wall_b_anim", "floor_1"];
        const misc = (sets: ReturnType<typeof GroupByCategory>) => sets.find(set => set.id === "misc").brushes;
        const sets = GroupByCategory(names, () => "misc");
        expect(misc(sets)).toEqual(["floor_1", "wall_a", "wall_b", "wall_b_anim"]);
        expect(misc(GroupByCategory(names.slice().reverse(), () => "misc"))).toEqual(misc(sets));
    });

    it("doesn't drop a sprite whose category isn't one of the tabs", () => {
        const sets = GroupByCategory(["odd"], () => "nonsense" as AssetCategory);
        expect(sets.find(set => set.id === "misc").brushes).toEqual(["odd"]);
    });
});

describe("EmptyTabHint", () => {
    it("tells the User tab's visitor how to fill it, and says plainly that any other tab is empty", () => {
        expect(EmptyTabHint("user")).toContain('"category": "user"');
        expect(EmptyTabHint("weapons")).toBe("No sprites in this category.");
    });

    it("points at the + when the sprite editor is there to use", () => {
        expect(EmptyTabHint("weapons", true)).toBe("No sprites in this category. Click + to draw one.");
        expect(EmptyTabHint("user", true)).toContain("Click +");
        expect(EmptyTabHint("user", true)).toContain('"category": "user"');
    });
});

describe("ShowsCategory", () => {
    it("shows a floor or walls layer only its own tab", () => {
        expect(AssetCategories.filter(c => ShowsCategory("floor", c.id)).map(c => c.id)).toEqual(["floor"]);
        expect(AssetCategories.filter(c => ShowsCategory("walls", c.id)).map(c => c.id)).toEqual(["walls"]);
    });

    it("shows any other tile layer every tab but floor and walls", () => {
        expect(AssetCategories.filter(c => ShowsCategory(undefined, c.id)).map(c => c.id)).toEqual(["entities", "weapons", "items", "misc", "user"]);
    });
});

describe("TakesCategory", () => {
    it("lets a floor or walls layer take only its own tiles", () => {
        expect(TakesCategory("floor", "floor")).toBe(true);
        expect(TakesCategory("floor", "walls")).toBe(false);
        expect(TakesCategory("floor", "misc")).toBe(false);
        expect(TakesCategory("walls", "walls")).toBe(true);
        expect(TakesCategory("walls", "floor")).toBe(false);
    });

    it("lets a layer without a kind take anything, as an older level's do", () => {
        AssetCategories.forEach(c => expect(TakesCategory(undefined, c.id), c.id).toBe(true));
    });
});
