import {GridBounds} from "../Constants";
import EditorComponent from "../EditorComponent";
import {EditorActions, IState} from "../stores/EditorStore";
import {LevelDataActions} from "../stores/LevelDataStore";
import {ListBox, ListBoxEvents} from "../ui/listbox/ListBox";
import ListBoxItem from "../ui/listbox/ListBoxItem";
import Button from "../ui/Button";

export default class Layers extends EditorComponent {

    private layerContainer: ListBox<ListBoxItem>;

    constructor() {
        super();

        this.Create();
        this.AddToStage();

        this.editorStore.Subscribe(this.Render, this);
    }

    private Render(prevState: IState, state: IState): void {
        if(prevState.layers !== state.layers) {
            this.layerContainer.Set(state.layers);
        }

        if(state.layers.length === 0) {
            this.editorStore.Dispatch({
                type: EditorActions.ADD_LAYER,
                data: {layer: {id: 0, name: "layer 0", selected: true, visible: true}}
            });
        }
    }

    private Create(): void {

        // list
        const scrollBounds = new PIXI.Rectangle(
            GridBounds.right + 10, GridBounds.y + 10 + GridBounds.height * 0.75, 130, GridBounds.height * 0.25 - 10
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
                const nextId = this.editorStore.state.layers.reduce((prev, curr) => curr.id > prev.id ? curr : prev).id + 1;
                this.editorStore.Dispatch({
                    type: EditorActions.ADD_LAYER,
                    data: {
                        layer: {id: nextId, name: "layer " + nextId, selected: false, visible: true}
                    }
                });
            }
        })
        addButton.position.set(GridBounds.right + 15, GridBounds.height);
        this.root.addChild(addButton);

        // remove
        const removeButton = new Button("icon-minus", () => {
            if(this.editorStore.state.layers.length > 1) {
                this.editorStore.Dispatch({type: EditorActions.REMOVE_LAYER});
                this.editorStore.Dispatch({type: EditorActions.SELECT_LAYER, data: {layer: this.editorStore.state.layers[0]}});
            }
        })
        removeButton.position.set(addButton.getBounds().right + 5, GridBounds.height);
        this.root.addChild(removeButton);

        // rename
        const renameButton = new Button("icon-edit", () => {
            const selectedLayer = this.editorStore.state.layers.find(layer => layer.selected);
            const name = prompt("Rename layer", selectedLayer.name);
            if(name != null) {
                this.editorStore.Dispatch({type: EditorActions.RENAME_LAYER, data: {layer: selectedLayer, name}});
            }
        });
        renameButton.position.set(removeButton.getBounds().right + 15, GridBounds.height);
        this.root.addChild(renameButton);

        // move up
        const upButton = new Button("icon-arrow-up", () => {
            this.editorStore.Dispatch({type: EditorActions.MOVE_LAYER_UP});
            this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
        });
        upButton.position.set(renameButton.getBounds().right + 15, GridBounds.height);
        this.root.addChild(upButton);

        // move down
        const downButton = new Button("icon-arrow-down", () => {
            this.editorStore.Dispatch({type: EditorActions.MOVE_LAYER_DOWN});
            this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
        });
        downButton.position.set(upButton.getBounds().right + 5, GridBounds.height);
        this.root.addChild(downButton);
    }
}
