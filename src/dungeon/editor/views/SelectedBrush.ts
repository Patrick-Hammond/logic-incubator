import {Sprite, Text, Texture} from "pixi.js";
import { Key } from "../../../_lib/io/Keyboard";
import { GridBounds, Scenes } from "../../Constants";
import { MonsterIdleAnimation, MonsterType } from "../../game/level/entities/Monsters";
import { IsSpawnerValue } from "../../game/level/entities/Spawners";
import { IsLightValue } from "../../game/level/Lighting";
import { DataBrushEditorFor } from "../DataBrushEditors";
import EditorComponent from "../EditorComponent";
import { DataBrushValue, EditorActions, IEditorState } from "../stores/EditorStore";
import Button from "../ui/components/Button";
import { ChoiceOption, IsFormDialogOpen, OpenFormDialog } from "../ui/dialog/FormDialog";

export default class SelectedBrush extends EditorComponent {
    private brush = new Sprite();
    private brushText: Text;
    private dataText: Text;
    private editDataButton: Button;
    private monsterImages: { [type: string]: ChoiceOption["image"] | undefined } = {};

    constructor() {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {
        this.brush.position.set(GridBounds.right + 160, GridBounds.y + 10 + GridBounds.height * 0.75);
        this.brush.anchor.set(0.5, 1);
        this.brush.position.set(1218, 697);

        this.brushText = new Text("", { fontFamily: "Arial", fontSize: 11, fill: 0xeeeeee });
        this.brushText.anchor.x = 1;
        this.brushText.position.set(1270, 702);

        this.dataText = new Text("", { fontFamily: "Arial", fontSize: 16, fill: 0xeeeeee });
        this.dataText.anchor.set(0.5);
        this.dataText.position.set(1218, 647);

        this.editDataButton = new Button("icon-edit", () => this.OpenDataEditor());
        this.editDataButton.position.set(1245, 630);
        this.editDataButton.visible = false;

        this.root.addChild(this.brush, this.brushText, this.dataText, this.editDataButton);

        this.editorStore.Subscribe(this.Render, this);

        // E: same as the edit button. Keydowns typed inside the dialog never reach here (see FormDialog).
        this.game.keyboard.on("keydown", (e: KeyboardEvent) => {
            if (e.keyCode === Key.E && this.editorStore.state.currentScene === Scenes.EDITOR) {
                // Otherwise this same keypress types an "e" into the dialog field that just took focus.
                e.preventDefault();
                this.OpenDataEditor();
            }
        });
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        if (prevState.hoveredBrushName !== state.hoveredBrushName) {
            this.UpdateBrush(state.hoveredBrushName);
        }

        if (prevState.currentBrush.name !== state.currentBrush.name) {
            this.UpdateBrush(state.currentBrush.name);
        }

        const dataBrush = this.editorStore.SelectedDataBrush;
        if (dataBrush) {
            this.dataText.text = this.FormatDataValue(dataBrush.value);
            this.dataText.visible = true;
        } else {
            this.dataText.visible = false;
        }

        this.editDataButton.visible = dataBrush != null && DataBrushEditorFor(dataBrush.name) != null;
    }

    private FormatDataValue(value: DataBrushValue): string {
        if (IsLightValue(value)) {
            return `B ${value.brightness}\n#${value.tint.toString(16).padStart(6, "0")}\nR ${value.range}`;
        }
        if (IsSpawnerValue(value)) {
            const types = value.monsters.length === 1 ? value.monsters[0].replace(/_/g, " ") : `${value.monsters.length} types`;
            return `${types}\nevery ${value.interval}s\nmax ${value.maxAlive}`;
        }
        return value.toString();
    }

    /** Opens the popup editor (see `DataBrushEditors`) for the selected data brush, if it has one. Cancelling leaves the value untouched. */
    private OpenDataEditor(): void {
        const dataBrush = this.editorStore.SelectedDataBrush;
        const editor = dataBrush && DataBrushEditorFor(dataBrush.name);
        if (!editor || IsFormDialogOpen()) {
            return;
        }
        OpenFormDialog({
            title: editor.title,
            subtitle: editor.subtitle,
            fields: editor.fields({ monster: type => this.MonsterImage(type) }),
            values: editor.toForm(dataBrush.value),
            validate: editor.validate
        }).then(form => {
            // Guard against the selection having changed underneath the (modal, but async) dialog.
            if (form && this.editorStore.SelectedDataBrush === dataBrush) {
                this.editorStore.Dispatch({ type: EditorActions.SET_DATA_BRUSH_VALUE, data: { value: editor.fromForm(form) } });
            }
        });
    }

    /** First idle frame of the monster, as a data URI for the spawner dialog's chips. Cached - extracting is a GPU readback. */
    private MonsterImage(type: MonsterType): ChoiceOption["image"] | undefined {
        if (!(type in this.monsterImages)) {
            const name = MonsterIdleAnimation(type);
            if (this.assetFactory.AnimationNames.indexOf(name) === -1) {
                this.monsterImages[type] = undefined;
            } else {
                const sprite = this.assetFactory.CreateAnimatedSprite(name);
                const { width, height } = sprite.texture;
                this.monsterImages[type] = { src: this.game.renderer.plugins.extract.base64(sprite), width: width * 2, height: height * 2 };
                sprite.destroy();
            }
        }
        return this.monsterImages[type];
    }

    private UpdateBrush(name: string): void {
        this.brushText.text = name;
        if (name !== "") {
            this.brush.texture = this.assetFactory.Create(name).texture;
            this.brush.scale.set(100 / Math.max(this.brush.texture.width, this.brush.texture.height));
        } else {
            this.brush.texture = Texture.EMPTY;
        }
    }
}
