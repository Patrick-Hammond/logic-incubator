import { describe, expect, it } from "vitest";
import { MonsterTypes } from "../game/level/entities/Monsters";
import { DEFAULT_SPAWNER_VALUE } from "../game/level/entities/Spawners";
import { DataBrushEditorFor } from "./DataBrushEditors";
import { DataBrushName } from "./stores/EditorStore";

const noImages = { monster: () => undefined };

describe("DataBrushEditors", () => {
    it("only offers an editor for brushes whose value the game reads", () => {
        expect(DataBrushEditorFor(DataBrushName.SPAWNER)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.LIGHT)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.Z_INDEX)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.COLLISION)).toBeUndefined();
        expect(DataBrushEditorFor(DataBrushName.PLAYER_START)).toBeUndefined();
    });

    it("round-trips a spawner through the form", () => {
        const editor = DataBrushEditorFor(DataBrushName.SPAWNER);
        const value = { monsters: ["imp", "ogre"], interval: 2.5, maxAlive: 6, total: 0, activationRange: 0, hitPoints: 20 };
        expect(editor.fromForm(editor.toForm(value as never))).toEqual(value);
    });

    it("lists every monster type in the spawner dialog, and refuses an empty pool", () => {
        const editor = DataBrushEditorFor(DataBrushName.SPAWNER);
        const monsters = editor.fields(noImages).find(f => f.key === "monsters");
        expect(monsters.type === "multi-choice" && monsters.options.map(o => o.value)).toEqual([...MonsterTypes]);
        expect(editor.validate({ ...editor.toForm(DEFAULT_SPAWNER_VALUE), monsters: [] })).toMatch(/at least one/);
        expect(editor.validate(editor.toForm(DEFAULT_SPAWNER_VALUE))).toBeNull();
    });

    it("gives every form field a value, so no control starts blank", () => {
        [DataBrushName.SPAWNER, DataBrushName.LIGHT, DataBrushName.Z_INDEX].forEach(name => {
            const editor = DataBrushEditorFor(name);
            const form = editor.toForm(0);
            editor.fields(noImages).forEach(field => expect(form, `${name}.${field.key}`).toHaveProperty(field.key));
        });
    });

    it("round-trips a light and a height", () => {
        const light = DataBrushEditorFor(DataBrushName.LIGHT);
        const value = { brightness: 0.8, tint: 0x123456, range: 7.5 };
        expect(light.fromForm(light.toForm(value))).toEqual(value);
        const height = DataBrushEditorFor(DataBrushName.Z_INDEX);
        expect(height.fromForm(height.toForm(-3))).toBe(-3);
    });
});
