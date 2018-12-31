import Game from "../../../_lib/Game";
import {GridBounds, KeyCodes, TileSize} from "../Constants";
import EditorStore, {EditorActions, MouseButtonState} from "../stores/EditorStore";
import LevelDataStore, {LevelDataActions} from "../stores/LevelDataStore";
import {ScrollBox} from "../ui/ScrollBox";

export function RegisterMouseEvents(editorStore: EditorStore, levelDataStore: LevelDataStore, game: Game) {

    // mouse wheel zooming
    game.view.onwheel = (e: WheelEvent) => {
        if(GridBounds.contains(e.offsetX, e.offsetY)) {

            const oldScale = editorStore.state.viewScale;

            if(e.deltaY < 0) {
                editorStore.Dispatch({type: EditorActions.ZOOM_IN});
            } else if(e.deltaY > 0) {
                editorStore.Dispatch({type: EditorActions.ZOOM_OUT});
            }

            // adjust offset to zoom in and out of the cursor position
            const pos = game.interactionManager.mouse.global;
            const percentPos = {x: (pos.x - GridBounds.x) / GridBounds.width, y: (pos.y - GridBounds.y) / GridBounds.height};

            const oldScaledTileSize = TileSize * oldScale;
            const newScaledTileSize = TileSize * editorStore.state.viewScale;

            const widthDelta = (GridBounds.width / oldScaledTileSize) * newScaledTileSize - GridBounds.width;
            const heightDelta = (GridBounds.height / oldScaledTileSize) * newScaledTileSize - GridBounds.height;

            const moveDistance = {
                x: Math.round((widthDelta / oldScaledTileSize) * percentPos.x),
                y: Math.round((heightDelta / oldScaledTileSize) * percentPos.y)
            };

            editorStore.Dispatch({type: EditorActions.VIEW_MOVE, data: {move: moveDistance}});
            levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
        }
    };

    game.interactionManager.on("mousemove",  (e: PIXI.interaction.InteractionEvent) => {
        const currentBrush = editorStore.state.currentBrush;
        if(currentBrush) {
            const pos = e.data.global.clone();
            const scaledTileSize = TileSize * editorStore.state.viewScale;

            // snap to grid
            pos.x = ((pos.x - GridBounds.x) / scaledTileSize) | 0;
            pos.y = ((pos.y - GridBounds.y) / scaledTileSize) | 0;

            if(currentBrush.position.x !== pos.x || currentBrush.position.y !== pos.y) {

                editorStore.Dispatch({type: EditorActions.BRUSH_MOVED, data: {position: pos}});

                // check drag move
                const spaceDragging = editorStore.state.keyCode === KeyCodes.SPACE &&
                                      editorStore.state.mouseButtonState === MouseButtonState.LEFT_DOWN;
                const middleButtonDragging = editorStore.state.mouseButtonState === MouseButtonState.MIDDLE_DOWN;
                if(spaceDragging || middleButtonDragging) {
                    editorStore.Dispatch({type: EditorActions.VIEW_DRAG, data: {position: currentBrush.position}});
                    levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
                }

                if(e.target && e.target.parent instanceof ScrollBox) {
                    editorStore.Dispatch({data: {name: e.target.name}, type: EditorActions.BRUSH_HOVERED});
                } else {
                    editorStore.Dispatch({data: {name: currentBrush.name}, type: EditorActions.BRUSH_HOVERED});
                }
            }
        }
    });

    game.interactionManager.on("mousedown", (e: PIXI.interaction.InteractionEvent) => {
        if(e.target && e.target.parent instanceof ScrollBox && e.target.name !== editorStore.state.currentBrush.name) {
            editorStore.Dispatch({data: {name: e.target.name}, type: EditorActions.BRUSH_CHANGED});
        }
        if(e.data.button === 0) {
            editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.LEFT_DOWN}});
        } else if(e.data.button === 1) {
            editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.MIDDLE_DOWN}});
        }
    });

    game.interactionManager.on("mouseup", (e: PIXI.interaction.InteractionEvent) => {
        editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
    });
    game.interactionManager.on("mouseupoutside", (e: PIXI.interaction.InteractionEvent) => {
        editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
    });
    game.interactionManager.on("rightdown", (e: PIXI.interaction.InteractionEvent) => {
        editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.RIGHT_DOWN}});
    });
    game.interactionManager.on("rightup", (e: PIXI.interaction.InteractionEvent) => {
        editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
    });
    game.interactionManager.on("rightupoutside", (e: PIXI.interaction.InteractionEvent) => {
        editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
    });
}
