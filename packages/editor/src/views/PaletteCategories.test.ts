import { describe, expect, it } from "vitest";
import { AssetCategories, AssetCategory } from "@logic-incubator/engine/level/AssetMetadata";
import { EmptyTabHint, GroupByCategory } from "./PaletteCategories";

describe("GroupByCategory", () => {
    const categories: { [name: string]: AssetCategory } = {
        wall_mid: "dungeon", floor_1: "dungeon", torch_anim: "dungeon",
        goblin_idle_anim: "entities", weapon_bow: "weapons", potion_1: "items", skull: "misc", my_tile: "user"
    };
    const categoryOf = (name: string): AssetCategory => categories[name] || "misc";

    it("makes a tab for every category, in the palette's order, even an empty one", () => {
        const sets = GroupByCategory([], categoryOf);
        expect(sets.map(set => set.id)).toEqual(["dungeon", "entities", "weapons", "items", "misc", "user"]);
        expect(sets.map(set => set.name)).toEqual(["Dungeon", "Entities", "Weapons", "Items", "Misc", "User"]);
        expect(sets.every(set => set.brushes.length === 0)).toBe(true);
        expect(sets.map(set => set.id)).toEqual(AssetCategories.map(category => category.id));
    });

    it("files each sprite under its category", () => {
        const sets = GroupByCategory(Object.keys(categories), categoryOf);
        const brushes = (id: string) => sets.find(set => set.id === id).brushes;
        expect(brushes("dungeon")).toEqual(["floor_1", "torch_anim", "wall_mid"]);
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
        const sets = GroupByCategory(names, () => "dungeon");
        expect(sets[0].brushes).toEqual(["floor_1", "wall_a", "wall_b", "wall_b_anim"]);
        expect(GroupByCategory(names.slice().reverse(), () => "dungeon")[0].brushes).toEqual(sets[0].brushes);
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
