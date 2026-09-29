import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { AddTypes } from "@logic-incubator/lib/patterns/EnumerateTypes";
import Store, { IAction } from "@logic-incubator/lib/patterns/redux/Store";
import AssetMetadataStore from "@logic-incubator/engine/level/AssetMetadata";
import { OrphanedExplicitData } from "@logic-incubator/engine/level/ImplicitData";
import { Brush, DataBrushValue, LevelLayer } from "@logic-incubator/engine/level/LevelFormat";

/**
 * A level's layer (see `LevelLayer`) plus what only the editor keeps: which one is selected and
 * whether it's shown.
 */
export type Layer = LevelLayer & { selected: boolean; visible: boolean };
export type LevelDataState = { levelData: LevelData };

export const enum LevelDataActions {
    PAINT,
    /** Paints `brush` at each of `cells` (map coordinates), replacing what was on that layer there - the stamp and fill tools, as one undo step. */
    PAINT_CELLS,
    ERASE,
    ERASE_RECT,
    ERASE_LAYER,
    COPY,
    /** Sets the `data` of one placed brush (`target`, by identity) to `value` - the data-select tool's dialog. */
    SET_DATA,
    REFRESH,
    RESET
}

type LevelData = Brush[];
type ActionData = {
    brush?: Brush;
    viewOffset?: Vec2Like;
    /** Opposite corners of an ERASE_RECT, in view cells like `brush.position` - in either order, as a drag can go any way. */
    rectTopLeft?: Vec2Like;
    rectBottomRight?: Vec2Like;
    sourceLayer?: Layer;
    destLayer?: Layer;
    /** The editor's layers, for ERASE/ERASE_RECT to tell tile layers from data layers - see `EraseOrphanedData`. Without it, erasing removes only the brushes it hits. */
    layers?: Layer[];
    /** PAINT_CELLS: map coordinates, unlike the view-relative `brush.position` the other paint actions offset by `viewOffset`. */
    cells?: Vec2Like[];
    target?: Brush;
    value?: DataBrushValue;
};

export default class LevelDataStore extends Store<LevelDataState, ActionData> {
    protected DefaultState(): LevelDataState {
        return { levelData: [] };
    }

    protected Reduce(state: LevelDataState, action: IAction<ActionData>): LevelDataState {
        const newState = {
            levelData: this.UpdateLevelData(state.levelData, action)
        };
        return newState as LevelDataState;
    }

    private UpdateLevelData(levelData: LevelData, action: IAction<ActionData>): LevelData {
        switch (action.type) {
            case LevelDataActions.PAINT: {
                const levelDataCopy = levelData.concat();
                const brush: Brush = { ...action.data.brush };
                brush.position = AddTypes(brush.position, action.data.viewOffset);

                // remove duplicates
                const existing = levelDataCopy.filter(
                    v => v.position.x === brush.position.x && v.position.y === brush.position.y && v.layerId === brush.layerId
                );
                existing.forEach(item => levelDataCopy.splice(levelDataCopy.indexOf(item), 1));

                return levelDataCopy.concat(brush);
            }
            case LevelDataActions.PAINT_CELLS: {
                const layerId = action.data.brush.layerId;
                const cellKeys = new Set(action.data.cells.map(cell => cell.x + "," + cell.y));
                const kept = levelData.filter(v => v.layerId !== layerId || !cellKeys.has(v.position.x + "," + v.position.y));
                return kept.concat(action.data.cells.map(cell => ({ ...action.data.brush, position: { x: cell.x, y: cell.y } })));
            }
            case LevelDataActions.ERASE: {
                const levelDataCopy = levelData.concat();
                const brush: Brush = { ...action.data.brush };
                brush.position = AddTypes(brush.position, action.data.viewOffset);

                // remove last item in the same location
                const erased: Brush[] = [];
                for (let i = levelDataCopy.length - 1; i >= 0; i--) {
                    const item = levelDataCopy[i];
                    if (item.position.x === brush.position.x && item.position.y === brush.position.y && item.layerId === brush.layerId) {
                        erased.push(...levelDataCopy.splice(i, 1));
                        break;
                    }
                }

                return this.EraseOrphanedData(levelDataCopy, erased, action.data.layers);
            }
            case LevelDataActions.ERASE_RECT: {
                const levelDataCopy = levelData.concat();
                const erased: Brush[] = [];
                this.RectCells(action.data.rectTopLeft, action.data.rectBottomRight).forEach(cell => {
                    const brush: Brush = { ...action.data.brush };
                    brush.position = AddTypes(cell, action.data.viewOffset);

                    // remove last item in the same location
                    for (let i = levelDataCopy.length - 1; i >= 0; i--) {
                        const item = levelDataCopy[i];
                        if (item.position.x === brush.position.x && item.position.y === brush.position.y && item.layerId === brush.layerId) {
                            erased.push(...levelDataCopy.splice(i, 1));
                            break;
                        }
                    }
                });
                return this.EraseOrphanedData(levelDataCopy, erased, action.data.layers);
            }
            case LevelDataActions.ERASE_LAYER: {
                return levelData.filter(brush => brush.layerId !== action.data.destLayer.id);
            }
            case LevelDataActions.COPY: {
                const sourceData = levelData.filter(b => b.layerId === action.data.sourceLayer.id);
                const copy = sourceData.map(b => {
                    return { ...b, layerId: action.data.destLayer.id };
                });
                return levelData.concat(copy);
            }
            case LevelDataActions.SET_DATA: {
                const index = levelData.indexOf(action.data.target);
                if (index === -1) {
                    return levelData;
                }
                const copy = levelData.concat();
                copy[index] = { ...action.data.target, data: action.data.value };
                return copy;
            }
            case LevelDataActions.REFRESH: {
                return levelData.concat();
            }
            case LevelDataActions.RESET: {
                return this.DefaultState().levelData;
            }
            default: {
                return levelData || this.DefaultState().levelData;
            }
        }
    }

    /** Every cell of the rect between two opposite corners, whichever way round they come - dragging up or left gives the same cells as the reverse. */
    private RectCells(corner: Vec2Like, oppositeCorner: Vec2Like): Vec2Like[] {
        const cells: Vec2Like[] = [];
        for (let x = Math.min(corner.x, oppositeCorner.x); x <= Math.max(corner.x, oppositeCorner.x); x++) {
            for (let y = Math.min(corner.y, oppositeCorner.y); y <= Math.max(corner.y, oppositeCorner.y); y++) {
                cells.push({ x, y });
            }
        }
        return cells;
    }

    /** Erasing a tile takes the data brushes that only existed for it along with it (see `OrphanedExplicitData`), in the same undo step. */
    private EraseOrphanedData(levelData: LevelData, erased: Brush[], layers: Layer[] | undefined): LevelData {
        if (!erased.length || !layers) {
            return levelData;
        }
        const tileLayerIds = new Set(layers.filter(layer => !layer.isData).map(layer => layer.id));
        const orphans = new Set(
            OrphanedExplicitData(
                erased,
                levelData,
                layerId => tileLayerIds.has(layerId),
                name => AssetMetadataStore.inst.Get(name)
            )
        );
        return orphans.size ? levelData.filter(brush => !orphans.has(brush)) : levelData;
    }
}
