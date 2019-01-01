import {GridBounds} from "../Constants";
import EditorComponent from "../EditorComponent";
import {EditorActions, IState} from "../stores/EditorStore";
import {ListBox, ListBoxEvents} from "../ui/ListBox";
import TextButton from "../ui/TextButton";

export class Layers extends EditorComponent {

    private layerContainer: ListBox;

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
            this.editorStore.Dispatch({type: EditorActions.ADD_LAYER, data: {layer: {id: 0, name: "layer 0", selected: true}}});
        }
    }

    private Create(): void {

        // list
        const scrollBounds = new PIXI.Rectangle(
            GridBounds.right + 10, GridBounds.y + 10 + GridBounds.height * 0.75, 130, GridBounds.height * 0.25 - 10
            );
        this.layerContainer = new ListBox(scrollBounds, 1);
        this.layerContainer.on(ListBoxEvents.ITEM_SELECTED, (index: number) => {
            this.editorStore.Dispatch({type: EditorActions.SELECT_LAYER, data: {layer: this.editorStore.state.layers[index]}});
        })
        this.root.addChild(this.layerContainer);

        // add
        const addButton = new TextButton("ADD" , () => {
            const layerCount = this.editorStore.state.layers.length;
            if(layerCount < 6) {
                this.editorStore.Dispatch(
                    {type: EditorActions.ADD_LAYER, data: {layer: {id: layerCount, name: "layer " + layerCount, selected: false}}}
                );
            }
        })
        addButton.position.set(GridBounds.right + 15, GridBounds.height);
        this.root.addChild(addButton);

        // remove
        const removeButton = new TextButton("DEL" , () => {
            if(this.editorStore.state.layers.length > 1) {
                this.editorStore.Dispatch({type: EditorActions.REMOVE_LAYER});
                this.editorStore.Dispatch({type: EditorActions.SELECT_LAYER, data: {layer: this.editorStore.state.layers[0]}});
            }
        })
        removeButton.position.set(GridBounds.right + 45, GridBounds.height);
        this.root.addChild(removeButton);

        // rename
        const renameButton = new TextButton("REN" , () => {
            const selectedLayer = this.editorStore.state.layers.find(layer => layer.selected);
            const name = prompt("Rename layer", selectedLayer.name);
            if(name != null) {
                this.editorStore.Dispatch({type: EditorActions.RENAME_LAYER, data: {layer: selectedLayer, name}});
            }
        });
        renameButton.position.set(GridBounds.right + 73, GridBounds.height);
        this.root.addChild(renameButton);
    }
}
