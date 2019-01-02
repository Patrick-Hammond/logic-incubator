import {GridBounds} from "../Constants";
import EditorComponent from "../EditorComponent";
import {IState} from "../stores/EditorStore";
import {MakeDraggable} from "../../../_lib/utils/Debug";

export default class SelectedBrush extends EditorComponent {
    private brush: PIXI.Sprite = new PIXI.Sprite();

    constructor() {
        super();

        this.brush.position.set(GridBounds.right + 160, GridBounds.y + 10 + GridBounds.height * 0.75);
        this.brush.anchor.set(0.5);
        this.brush.position.set(1218, 602);
        this.root.addChild(this.brush);

        this.AddToStage();

        this.editorStore.Subscribe(this.Render, this);
    }

    private Render(prevState: IState, state: IState): void {
        if(prevState.currentBrush.name !== state.currentBrush.name) {
            if(state.currentBrush.name !== "") {
                this.brush.texture = this.assetFactory.Create(state.currentBrush.name).texture;
                this.brush.scale.set(100 / Math.max(this.brush.texture.width, this.brush.texture.height));
            } else {
                this.brush.texture = PIXI.Texture.EMPTY;
            }
        }
    }
}
