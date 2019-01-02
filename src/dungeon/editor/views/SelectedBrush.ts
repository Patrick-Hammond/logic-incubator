import {GridBounds} from "../Constants";
import EditorComponent from "../EditorComponent";
import {IState} from "../stores/EditorStore";

export default class SelectedBrush extends EditorComponent {
    private brush: PIXI.Sprite = new PIXI.Sprite();
    private brushText: PIXI.Text;

    constructor() {
        super();

        this.brush.position.set(GridBounds.right + 160, GridBounds.y + 10 + GridBounds.height * 0.75);
        this.brush.anchor.set(0.5, 1);
        this.brush.position.set(1218, 697);

        this.brushText = new PIXI.Text("", {fontFamily: "Arial", fontSize: 11, fill: 0xeeeeee});
        this.brushText.anchor.x = 1;
        this.brushText.position.set(1270, 702);

        this.root.addChild(this.brush, this.brushText);
        this.AddToStage();

        this.editorStore.Subscribe(this.Render, this);
    }

    private Render(prevState: IState, state: IState): void {
        if(prevState.hoveredBrushName !== state.hoveredBrushName) {
            this.UpdateBrush(state.hoveredBrushName);
        }

        if(prevState.currentBrush.name !== state.currentBrush.name) {
            this.UpdateBrush(state.currentBrush.name);
        }
    }

    private UpdateBrush(name: string): void{
        this.brushText.text = name;
        if(name !== "") {
            this.brush.texture = this.assetFactory.Create(name).texture;
            this.brush.scale.set(100 / Math.max(this.brush.texture.width, this.brush.texture.height));
        } else {
            this.brush.texture = PIXI.Texture.EMPTY;
        }
    }
}
