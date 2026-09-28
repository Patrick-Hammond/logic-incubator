import { describe, expect, it } from "vitest";
import { TEST_MONSTERS } from "@logic-incubator/engine/level/__fixtures__/TestMonsters";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import { DefaultSpawnerValue } from "@logic-incubator/engine/level/entities/Spawners";
import { DataBrushName } from "@logic-incubator/engine/level/LevelFormat";
import { DataBrushEditorFor } from "./DataBrushEditors";

MonsterRoster.inst.Load(TEST_MONSTERS);

const noImages = { monster: () => undefined };

describe("DataBrushEditors", () => {
    it("only offers an editor for a value the game reads - collision and player-start have none, light and spawner keep theirs though neither is a paintable data brush any more", () => {
        expect(DataBrushEditorFor("spawner")).toBeDefined();
        expect(DataBrushEditorFor("light")).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.Z_INDEX)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.COLLISION)).toBeUndefined();
        expect(DataBrushEditorFor(DataBrushName.PLAYER_START)).toBeUndefined();
    });

    it("round-trips a spawner through the form", () => {
        const editor = DataBrushEditorFor("spawner");
        const value = { monsters: ["imp", "ogre"], interval: 2.5, maxAlive: 6, total: 0, activationRange: 0, hitPoints: 20 };
        expect(editor.fromForm(editor.toForm(value as never))).toEqual(value);
    });

    it("lists every monster type in the spawner dialog, and refuses an empty pool", () => {
        const editor = DataBrushEditorFor("spawner");
        const monsters = editor.fields(noImages).find(f => f.key === "monsters");
        expect(monsters.type === "multi-choice" && monsters.options.map(o => o.value)).toEqual([...TEST_MONSTERS.types]);
        expect(editor.validate({ ...editor.toForm(DefaultSpawnerValue()), monsters: [] })).toMatch(/at least one/);
        expect(editor.validate(editor.toForm(DefaultSpawnerValue()))).toBeNull();
    });

    it("gives every form field a value, so no control starts blank", () => {
        ["spawner", "light", DataBrushName.Z_INDEX].forEach(name => {
            const editor = DataBrushEditorFor(name);
            const form = editor.toForm(0);
            editor.fields(noImages).forEach(field => expect(form, `${name}.${field.key}`).toHaveProperty(field.key));
        });
    });

    it("round-trips a light and a height", () => {
        const light = DataBrushEditorFor("light");
        const value = { brightness: 0.8, tint: 0x123456, range: 7.5 };
        expect(light.fromForm(light.toForm(value))).toEqual(value);
        const height = DataBrushEditorFor(DataBrushName.Z_INDEX);
        expect(height.fromForm(height.toForm(-3))).toBe(-3);
    });
});
