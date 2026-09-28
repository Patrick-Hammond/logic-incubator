import {AnimatedSprite, Sprite} from "pixi.js";
import { AnimationSpeed, Scenes, TileSize } from "@logic-incubator/engine/Constants";
import { GridBounds } from "../Layout";
import EditorComponent from "../EditorComponent";
import { IEditorState } from "../stores/EditorStore";
import { ToolShowsBrush } from "./Tools";

/** The brush sprite following the cursor over the map. */
export default class BrushTool extends EditorComponent {
    private brush: Sprite | AnimatedSprite;

    constructor() {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {
        this.editorStore.Subscribe(this.Render, this);
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        // brush - (re)made first, so a new sprite gets the whole current transform below, not just what changed
        const recreated = prevState.currentBrush.name !== state.currentBrush.name;
        if (recreated) {
            if (this.brush) {
                this.brush.parent.removeChild(this.brush);
                this.brush = null;
            }

            if (state.currentBrush.name !== "") {
                this.brush = this.assetFactory.Create(state.currentBrush.name);
                if (this.brush instanceof AnimatedSprite) {
                    this.brush.play();
                    this.brush.animationSpeed = AnimationSpeed;
                }
                this.root.addChild(this.brush);
            }
        }
        if (!this.brush) {
            return;
        }

        // scale
        const scaleChanged = recreated || state.viewScale !== prevState.viewScale || prevState.currentBrush.scale !== state.currentBrush.scale;
        if (scaleChanged) {
            this.brush.scale.set(state.currentBrush.scale.x * state.viewScale, state.currentBrush.scale.y * state.viewScale);
        }

        // position
        const pos = state.currentBrush.position;
        const positionChanged = prevState.currentBrush.position.x !== pos.x || prevState.currentBrush.position.y !== pos.y;
        if (positionChanged || scaleChanged) {
            const scaledTileSize = TileSize * state.viewScale;
            const flipOffset = { x: this.brush.scale.x < 0 ? this.brush.width : 0, y: this.brush.scale.y < 0 ? this.brush.height : 0 };
            this.brush.position.set(
                pos.x * scaledTileSize + GridBounds.x + flipOffset.x,
                pos.y * scaledTileSize + GridBounds.y + flipOffset.y
            );
        }

        // rotation
        if (recreated || prevState.currentBrush.rotation !== state.currentBrush.rotation) {
            this.brush.rotation = state.currentBrush.rotation;
        }

        // offset
        if (recreated || prevState.currentBrush.pixelOffset !== state.currentBrush.pixelOffset) {
            this.brush.pivot.set(state.currentBrush.pixelOffset.x, state.currentBrush.pixelOffset.y);
        }

        // visible - only for the tools that paint with it; painting itself is done by `Tools`
        this.brush.visible = state.brushVisible && ToolShowsBrush(state.tool);
    }
}
