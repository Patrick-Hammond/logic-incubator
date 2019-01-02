import {GridBounds} from "../Constants";
import EditorComponent from "../EditorComponent";
import {IState} from "../stores/EditorStore";

export default class SelectedBrush extends EditorComponent {
    private brush: PIXI.Sprite = new PIXI.Sprite();

    constructor() {
        super();

        this.brush.position.set(GridBounds.right + 145, GridBounds.y + 10 + GridBounds.height * 0.75);
        this.brush.scale.set(2);
        this.root.addChild(this.brush);

        this.AddToStage();

        this.editorStore.Subscribe(this.Render, this);
    }

    private Render(prevState: IState, state: IState): void {
        if(prevState.currentBrush.name !== state.currentBrush.name) {
            if(state.currentBrush.name !== "") {
                this.brush.texture = this.assetFactory.Create(state.currentBrush.name).texture;
            } else {
                this.brush.texture = PIXI.Texture.EMPTY;
            }
        }
    }
}
