import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import MonsterRoster, { MonsterType } from "@logic-incubator/engine/level/entities/MonsterRoster";
import { DataBrushValue } from "@logic-incubator/engine/level/LevelFormat";
import type { QuestDef } from "@logic-incubator/engine/story/Quests";
import { DataBrushEditorFor } from "./DataBrushEditors";
import { ChoiceOption, IsFormDialogOpen, OpenFormDialog } from "./ui/dialog/FormDialog";
import SpriteCanvas from "./ui/dom/SpriteCanvas";

const monsterImages: { [type: string]: ChoiceOption["image"] | undefined } = {};

/** First idle frame of the monster at 2x, as a data URI for the spawner's, boss's and quests' chips. Cached. */
export function MonsterImage(type: MonsterType): ChoiceOption["image"] | undefined {
    if (!(type in monsterImages)) {
        const name = MonsterRoster.inst.IdleAnimation(type);
        if (!AssetFactory.inst.IsAnimation(name)) {
            monsterImages[type] = undefined;
        } else {
            const image = new SpriteCanvas();
            image.Show([AssetFactory.inst.CreateTexture(name)], 2);
            const { canvas } = image;
            monsterImages[type] = { src: canvas.toDataURL(), width: canvas.width, height: canvas.height };
        }
    }
    return monsterImages[type];
}

/**
 * Opens the popup editor (see `DataBrushEditors`) for a value of the named data brush - the palette
 * brush's (`SelectedBrush`) or one placed on the map (the data-select tool). Resolves with the new
 * value, or null if cancelled, the brush has no editor, or a dialog is already open. `context` is
 * put before the editor's own subtitle, e.g. to say which placement is being edited. `quests` are the level's,
 * for a pickup or boss to count for and a dialog's script to name.
 */
export function OpenDataBrushDialog(name: string, value: DataBrushValue, context?: string, quests?: ReadonlyArray<QuestDef>): Promise<DataBrushValue | null> {
    const editor = DataBrushEditorFor(name);
    if (!editor || IsFormDialogOpen()) {
        return Promise.resolve(null);
    }
    const images = { monster: MonsterImage, hasSprite: (sprite: string) => AssetFactory.inst.Has(sprite), quests };
    return OpenFormDialog({
        title: editor.title,
        subtitle: context ? context + " " + editor.subtitle : editor.subtitle,
        fields: editor.fields(images),
        values: editor.toForm(value),
        validate: editor.validate ? form => editor.validate(form, images) : undefined
    }).then(form => (form ? editor.fromForm(form) : null));
}
