import {GridBounds, Scenes} from "../../../Constants";
import EditorComponent from "../../EditorComponent";
import {EditorActions, IState} from "../../stores/EditorStore";
import {LevelDataActions} from "../../stores/LevelDataStore";
import Button from "../../ui/Button";
import {ListBox, ListBoxEvents} from "../../ui/listbox/ListBox";
import ListBoxItem from "./LayerListBoxItem";

export default class Layers extends EditorComponent {

    private layerContainer: ListBox<ListBoxItem>;

    constructor() {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {

        this.editorStore.Subscribe(this.Render, this);

        // list
        const scrollBounds = new PIXI.Rectangle(
            GridBounds.right + 10, GridBounds.y + 10 + GridBounds.height * 0.75, 145, GridBounds.height * 0.25 - 10
        );
        this.layerContainer = new ListBox<ListBoxItem>(() => new ListBoxItem(scrollBounds), scrollBounds, 1);
        this.layerContainer.on(ListBoxEvents.ITEM_SELECTED, (index: number) => {
            this.editorStore.Dispatch({type: EditorActions.SELECT_LAYER, data: {layer: this.editorStore.state.layers[index]}});
        });
        this.layerContainer.on(ListBoxEvents.TOGGLE_VISIBILITY, (index: number) => {
            this.editorStore.Dispatch({type: EditorActions.TOGGLE_LAYER_VISIBILITY, data: {layer: this.editorStore.state.layers[index]}});
            this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
        });
        this.root.addChild(this.layerContainer);

        // add
        const addButton = new Button("icon-plus", () => {
            if(this.editorStore.state.layers.length < 6) {
                this.editorStore.Dispatch({type: EditorActions.ADD_LAYER});
            }
        })
        addButton.position.set(GridBounds.right + 15, GridBounds.height);
        this.root.addChild(addButton);

        // remove
        const removeButton = new Button("icon-minus", () => {
            const selectedLayer = this.editorStore.state.layers.find(layer => layer.selected);
            const spriteLayers = this.editorStore.state.layers.filter(layer => layer.isData === false);
            if(spriteLayers.length > 1 || selectedLayer.isData) {
                this.editorStore.Dispatch({type: EditorActions.REMOVE_LAYER});
                this.editorStore.Dispatch({
                    type: EditorActions.SELECT_LAYER,
                    data: {layer: this.editorStore.state.layers[0]}
                });
                this.levelDataStore.Dispatch({type: LevelDataActions.ERASE_LAYER, data:{destLayer:selectedLayer}});
            }
        })
        removeButton.position.set(addButton.getBounds().right + 5, GridBounds.height);
        this.root.addChild(removeButton);

        // rename
        const renameButton = new Button("icon-edit", () => {
            if(name != null) {
                this.editorStore.Dispatch({type: EditorActions.RENAME_LAYER});
            }
        });
        renameButton.position.set(removeButton.getBounds().right + 10, GridBounds.height);
        this.root.addChild(renameButton);

        // move up
        const upButton = new Button("icon-arrow-up", () => {
            this.editorStore.Dispatch({type: EditorActions.MOVE_LAYER_UP});
            this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
        });
        upButton.position.set(renameButton.getBounds().right + 10, GridBounds.height);
        this.root.addChild(upButton);

        // move down
        const downButton = new Button("icon-arrow-down", () => {
            this.editorStore.Dispatch({type: EditorActions.MOVE_LAYER_DOWN});
            this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
        });
        downButton.position.set(upButton.getBounds().right + 5, GridBounds.height);
        this.root.addChild(downButton);

        // add data layer
        const dataButton = new Button("icon-data", () => {
            if(this.editorStore.state.layers.length < 6) {
                this.editorStore.Dispatch({type: EditorActions.ADD_DATA_LAYER});
            }
        });
        dataButton.position.set(downButton.getBounds().right + 10, GridBounds.height);
        this.root.addChild(dataButton);

        //render initial
        this.editorStore.Dispatch({type: EditorActions.REFRESH});
    }

    private Render(prevState: IState, state: IState): void {
        if(prevState.layers !== state.layers) {
            this.layerContainer.Set(state.layers);
        }

        // enforce at least 1 layer
        if(state.layers.length === 0) {
            this.editorStore.Dispatch({type: EditorActions.ADD_LAYER});
        }
    }
}
