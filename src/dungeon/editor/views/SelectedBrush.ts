import {Sprite, Text, Texture} from "pixi.js";
import { GridBounds, Scenes } from "../../Constants";
import { IsLightValue, LightValue } from "../../game/level/Lighting";
import EditorComponent from "../EditorComponent";
import { DataBrushName, EditorActions, IEditorState } from "../stores/EditorStore";
import Button from "../ui/components/Button";

const DEFAULT_LIGHT_VALUE: LightValue = { brightness: 0.5, tint: 0xff8100, range: 5 };

export default class SelectedBrush extends EditorComponent {
    private brush = new Sprite();
    private brushText: Text;
    private dataText: Text;
    private editLightButton: Button;

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

        this.editLightButton = new Button("icon-edit", () => this.OpenLightEditor());
        this.editLightButton.position.set(1245, 630);
        this.editLightButton.visible = false;

        this.root.addChild(this.brush, this.brushText, this.dataText, this.editLightButton);

        this.editorStore.Subscribe(this.Render, this);
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
            this.dataText.text = IsLightValue(dataBrush.value) ? this.FormatLightValue(dataBrush.value) : dataBrush.value.toString();
            this.dataText.visible = true;
        } else {
            this.dataText.visible = false;
        }

        this.editLightButton.visible = dataBrush != null && dataBrush.name === DataBrushName.LIGHT;
    }

    private FormatLightValue(value: LightValue): string {
        return `B ${value.brightness}\n#${value.tint.toString(16).padStart(6, "0")}\nR ${value.range}`;
    }

    /**
     * Chained native `prompt()` dialogs, matching this editor's existing text-entry convention (see
     * `Layers.RENAME_LAYER`) rather than building a bespoke Pixi modal + text-input widget just for
     * three numbers. Cancelling any step aborts the whole edit - no partial changes are dispatched.
     */
    private OpenLightEditor(): void {
        const dataBrush = this.editorStore.SelectedDataBrush;
        if (!dataBrush) {
            return;
        }
        const current = IsLightValue(dataBrush.value) ? dataBrush.value : DEFAULT_LIGHT_VALUE;

        const brightnessStr = prompt("Light brightness (0-1)", current.brightness.toString());
        if (brightnessStr === null) {
            return;
        }
        const tintStr = prompt("Light tint (hex colour, e.g. ff8100)", current.tint.toString(16).padStart(6, "0"));
        if (tintStr === null) {
            return;
        }
        const rangeStr = prompt("Light range (tiles)", current.range.toString());
        if (rangeStr === null) {
            return;
        }

        const brightness = Math.max(0, Math.min(1, parseFloat(brightnessStr)));
        const tint = parseInt(tintStr.replace(/^#/, ""), 16);
        const range = Math.max(0, parseFloat(rangeStr));

        if (Number.isNaN(brightness) || Number.isNaN(tint) || Number.isNaN(range)) {
            alert("Invalid light value - not saved.");
            return;
        }

        this.editorStore.Dispatch({
            type: EditorActions.SET_DATA_BRUSH_VALUE,
            data: { value: { brightness, tint, range } }
        });
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
