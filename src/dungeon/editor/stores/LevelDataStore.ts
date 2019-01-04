import {PointLike, RectangleLike} from "../../../_lib/math/Geometry";
import Store, {IAction} from "../../../_lib/Store";
import {AddTypes} from "../../../_lib/utils/EnumerateTypes";

export type Brush = {
    name: string;
    position: PointLike;
    pixelOffset: PointLike,
    rotation: number,
    scale: PointLike,
    layerId: number,
    data: number
};
export type Layer = {id: number, name: string, selected: boolean, visible: boolean, isData: boolean};
export type LevelDataState = {levelData: LevelData};

export const enum LevelDataActions {
    PAINT, PAINT_RECT, ERASE, REFRESH, RESET
};

type LevelData = Brush[];
type ActionData = {
    brush?: Brush,
    viewOffset?: PointLike,
    rect?: RectangleLike
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
                    v.name === brush.name &&
                    v.layerId === brush.layerId
                );
                existing.forEach(item => levelDataCopy.splice(levelDataCopy.indexOf(item), 1));

                return levelDataCopy.concat(brush);
            }
            case LevelDataActions.PAINT_RECT: {
                const levelDataCopy = levelData.concat();
                const brush: Brush = {...action.data.brush};
                for(let x = action.data.rect.x; x < action.data.rect.x + action.data.rect.width; x++) {
                    for(let y = action.data.rect.y; y < action.data.rect.y + action.data.rect.height; y++) {
                        brush.position = AddTypes({x:x, y:y}, action.data.viewOffset);

                         // remove duplicates
                        const existing = levelDataCopy.filter(v =>
                            v.position.x === brush.position.x &&
                            v.position.y === brush.position.y &&
                            v.name === brush.name &&
                            v.layerId === brush.layerId
                        );
                        existing.forEach(item => levelDataCopy.splice(levelDataCopy.indexOf(item), 1));
                        levelDataCopy.push(brush);
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
