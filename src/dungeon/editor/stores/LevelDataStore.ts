import {Vec2Like} from "../../../_lib/math/Geometry";
import {AddTypes} from "../../../_lib/patterns/EnumerateTypes";
import Store, {IAction} from "../../../_lib/patterns/redux/Store";

export type Brush = {
    name: string;
    position: Vec2Like;
    pixelOffset: Vec2Like,
    rotation: number,
    scale: Vec2Like,
    layerId: number,
    data: number
};
export type Layer = {id: number, name: string, selected: boolean, visible: boolean, isData: boolean};
export type LevelDataState = {levelData: LevelData};

export const enum LevelDataActions {
    PAINT, PAINT_RECT, ERASE, ERASE_RECT, ERASE_LAYER, COPY, REFRESH, RESET
};

type LevelData = Brush[];
type ActionData = {
    brush?: Brush,
    viewOffset?: Vec2Like,
    rectTopLeft?: Vec2Like,
    rectBottomRight?: Vec2Like,
    sourceLayer?: Layer,
    destLayer?: Layer,
};

export default class LevelDataStore extends Store<LevelDataState, ActionData> {
    protected DefaultState(): LevelDataState {
        return {levelData: []};
    }

    protected Reduce(state: LevelDataState, action: IAction<ActionData>): LevelDataState {
        const newState = {
            levelData: this.UpdateLevelData(state.levelData, action)
        };
        return newState as LevelDataState;
    }

    private UpdateLevelData(levelData: LevelData, action: IAction<ActionData>): LevelData {
        switch(action.type) {
            case LevelDataActions.PAINT: {
                const levelDataCopy = levelData.concat();
                const brush: Brush = {...action.data.brush};
                brush.position = AddTypes(brush.position, action.data.viewOffset);

                // remove duplicates
                const existing = levelDataCopy.filter(v =>
                    v.position.x === brush.position.x &&
                    v.position.y === brush.position.y &&
                    v.layerId === brush.layerId
                );
                existing.forEach(item => levelDataCopy.splice(levelDataCopy.indexOf(item), 1));

                return levelDataCopy.concat(brush);
            }
            case LevelDataActions.PAINT_RECT: {
                const levelDataCopy = levelData.concat();
                for(let x = action.data.rectTopLeft.x; x <= action.data.rectBottomRight.x; x++) {
                    for(let y = action.data.rectTopLeft.y; y <= action.data.rectBottomRight.y; y++) {
                        const brush: Brush = {...action.data.brush};
                        brush.position = AddTypes({x, y}, action.data.viewOffset);
                        const existing = levelDataCopy.some(v =>
                            v.position.x === brush.position.x &&
                            v.position.y === brush.position.y &&
                            v.layerId === brush.layerId
                        );
                        if(!existing) {
                            levelDataCopy.push(brush);
                        }
                    }
                }
                return levelDataCopy;
            }
            case LevelDataActions.ERASE: {
                const levelDataCopy = levelData.concat();
                const brush: Brush = {...action.data.brush};
                brush.position = AddTypes(brush.position, action.data.viewOffset);

                // remove last item in the same location
                for(let i = levelDataCopy.length - 1; i >= 0; i--) {
                    const item = levelDataCopy[i];
                    if(item.position.x === brush.position.x &&
                        item.position.y === brush.position.y &&
                        item.layerId === brush.layerId) {
                        levelDataCopy.splice(i, 1);
                        break;
                    }
                }

                return levelDataCopy;
            }
            case LevelDataActions.ERASE_RECT: {
                const levelDataCopy = levelData.concat();
                for(let x = action.data.rectTopLeft.x; x <= action.data.rectBottomRight.x; x++) {
                    for(let y = action.data.rectTopLeft.y; y <= action.data.rectBottomRight.y; y++) {
                        const brush: Brush = {...action.data.brush};
                        brush.position = AddTypes({x, y}, action.data.viewOffset);

                        // remove last item in the same location
                        for(let i = levelDataCopy.length - 1; i >= 0; i--) {
                            const item = levelDataCopy[i];
                            if(item.position.x === brush.position.x &&
                                item.position.y === brush.position.y &&
                                item.layerId === brush.layerId) {
                                levelDataCopy.splice(i, 1);
                                break;
                            }
                        }
                    }
                }
                return levelDataCopy;
            }
            case LevelDataActions.ERASE_LAYER: {
                return levelData.filter(brush => brush.layerId != action.data.destLayer.id);
            }
            case LevelDataActions.COPY: {
                const sourceData = levelData.filter(b => b.layerId === action.data.sourceLayer.id);
                const copy = sourceData.map(b => {
                    return {...b, layerId: action.data.destLayer.id}
                });
                return levelData.concat(copy);
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
}
