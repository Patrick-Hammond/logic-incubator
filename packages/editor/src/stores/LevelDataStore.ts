import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { AddTypes } from "@logic-incubator/lib/patterns/EnumerateTypes";
import Store, { IAction } from "@logic-incubator/lib/patterns/redux/Store";
import AssetMetadataStore from "@logic-incubator/engine/level/AssetMetadata";
import { OrphanedExplicitData } from "@logic-incubator/engine/level/ImplicitData";
import { Brush, DataBrushValue, IsTileLayer, LevelLayer } from "@logic-incubator/engine/level/LevelFormat";
import type { QuestDef } from "@logic-incubator/engine/story/Quests";
import { HeightChange, WithHeights } from "../Heights";

/**
 * A level's layer (see `LevelLayer`) plus what only the editor keeps: which one is selected and
 * whether it's shown.
 */
export type Layer = LevelLayer & { selected: boolean; visible: boolean };
/** The level as painted, and its quests (see `Quests`) - what the level file's `levelData` is. */
export type LevelDataState = { levelData: LevelData; quests: QuestDef[] };

/**
 * What painting replaces and erasing takes depends on the layer (given as `layers`): on a tile layer, a brush replaces whatever was on
 * its cell there, and erasing takes the last one painted; on a data layer, where a cell holds one of each data brush, a brush replaces
 * only one of its own name, and erasing with a data brush picked (the active type) takes only one of that name. Without `layers`, every
 * layer is treated as a tile layer.
 */
export const enum LevelDataActions {
    PAINT,
    /** Paints `brush` at each of `cells` (map coordinates), replacing what was on that layer there - the stamp and fill tools, as one undo step. */
    PAINT_CELLS,
    ERASE,
    ERASE_RECT,
    ERASE_LAYER,
    COPY,
    /** Sets the `data` of one placed brush (`target`, by identity) to `value` - the inspector's Edit. */
    SET_DATA,
    REFRESH,
    RESET,
    /** Sets the level's quests to `quests` - the quest list's. */
    SET_QUESTS,
    /** Takes one placed brush (`target`, by identity) off the map - the inspector's Delete. */
    REMOVE,
    /** Sets each of `cells` (map coordinates) to `heightChange`'s height, or moves it by its delta, on the height layer - every way of painting heights (see `WithHeights`). */
    SET_HEIGHT
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
    /** The editor's layers, to tell tile layers from data layers - see `LevelDataActions` and `EraseOrphanedData`. */
    layers?: Layer[];
    /** PAINT_CELLS: map coordinates, unlike the view-relative `brush.position` the other paint actions offset by `viewOffset`. */
    cells?: Vec2Like[];
    target?: Brush;
    value?: DataBrushValue;
    quests?: QuestDef[];
    heightChange?: HeightChange;
};

export default class LevelDataStore extends Store<LevelDataState, ActionData> {
    protected DefaultState(): LevelDataState {
        return { levelData: [], quests: [] };
    }

    /** A level saved before it had quests - or a generated map - has none. */
    Load(state: LevelDataState): void {
        super.Load({ ...state, quests: state && Array.isArray(state.quests) ? state.quests : [] });
    }

    protected Reduce(state: LevelDataState, action: IAction<ActionData>): LevelDataState {
        const newState = {
            levelData: this.UpdateLevelData(state.levelData, action),
            quests: this.UpdateQuests(state.quests, action)
        };
        return newState as LevelDataState;
    }

    private UpdateQuests(quests: QuestDef[] | undefined, action: IAction<ActionData>): QuestDef[] {
        switch (action.type) {
            case LevelDataActions.SET_QUESTS:
                return action.data.quests.slice();
            case LevelDataActions.RESET:
                return [];
            default:
                return quests || [];
        }
    }

    private UpdateLevelData(levelData: LevelData, action: IAction<ActionData>): LevelData {
        switch (action.type) {
            case LevelDataActions.PAINT: {
                const brush: Brush = { ...action.data.brush };
                brush.position = AddTypes(brush.position, action.data.viewOffset);
                const replaces = this.Replaces(brush, action.data.layers);
                return levelData.filter(v => !(SameCell(v, brush.position) && replaces(v))).concat(brush);
            }
            case LevelDataActions.PAINT_CELLS: {
                const replaces = this.Replaces(action.data.brush, action.data.layers);
                const cellKeys = new Set(action.data.cells.map(cell => cell.x + "," + cell.y));
                const kept = levelData.filter(v => !(cellKeys.has(v.position.x + "," + v.position.y) && replaces(v)));
                return kept.concat(action.data.cells.map(cell => ({ ...action.data.brush, position: { x: cell.x, y: cell.y } })));
            }
            case LevelDataActions.ERASE: {
                const levelDataCopy = levelData.concat();
                const brush: Brush = { ...action.data.brush };
                brush.position = AddTypes(brush.position, action.data.viewOffset);
                const erased = this.EraseLast(levelDataCopy, brush, action.data.layers);
                return this.EraseOrphanedData(levelDataCopy, erased, action.data.layers);
            }
            case LevelDataActions.ERASE_RECT: {
                const levelDataCopy = levelData.concat();
                const erased: Brush[] = [];
                this.RectCells(action.data.rectTopLeft, action.data.rectBottomRight).forEach(cell => {
                    const brush: Brush = { ...action.data.brush };
                    brush.position = AddTypes(cell, action.data.viewOffset);
                    erased.push(...this.EraseLast(levelDataCopy, brush, action.data.layers));
                });
                return this.EraseOrphanedData(levelDataCopy, erased, action.data.layers);
            }
            case LevelDataActions.REMOVE: {
                const index = levelData.indexOf(action.data.target);
                return index === -1 ? levelData : levelData.filter(brush => brush !== action.data.target);
            }
            case LevelDataActions.SET_HEIGHT: {
                return WithHeights(levelData, action.data.cells, action.data.heightChange);
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

    /**
     * Which of the brushes on `brush`'s cell painting it replaces: on its layer, anything if that's a tile layer, but only one of the
     * same name on a data layer - a cell there holds one of each data brush.
     */
    private Replaces(brush: Brush, layers: Layer[] | undefined): (other: Brush) => boolean {
        const data = IsDataLayerId(layers, brush.layerId);
        return other => other.layerId === brush.layerId && (!data || other.name === brush.name);
    }

    /**
     * Takes the last brush painted on `brush`'s cell and layer out of `levelData`, and returns it (or nothing, if there's none) - on a
     * data layer, the last of `brush`'s name, if it has one: erasing with a data brush picked takes only that kind.
     */
    private EraseLast(levelData: Brush[], brush: Brush, layers: Layer[] | undefined): Brush[] {
        const onlyName = IsDataLayerId(layers, brush.layerId) && brush.name ? brush.name : null;
        for (let i = levelData.length - 1; i >= 0; i--) {
            const item = levelData[i];
            if (SameCell(item, brush.position) && item.layerId === brush.layerId && (onlyName == null || item.name === onlyName)) {
                return levelData.splice(i, 1);
            }
        }
        return [];
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
        const tileLayerIds = new Set(layers.filter(IsTileLayer).map(layer => layer.id));
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

function SameCell(brush: Brush, cell: Vec2Like): boolean {
    return brush.position.x === cell.x && brush.position.y === cell.y;
}

/** Whether `layerId` is a data layer's, among `layers` - false without them. */
function IsDataLayerId(layers: Layer[] | undefined, layerId: number): boolean {
    return !!layers && layers.some(layer => layer.id === layerId && layer.isData);
}
