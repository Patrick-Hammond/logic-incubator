import {IPoint} from "../../../../_lib/math/Geometry";
import Store, {IAction} from "../../../../_lib/Store";
import {AddTypes} from "../../../../_lib/utils/EnumerateTypes";

export interface IBrush {name: string; position?: IPoint; pixelOffset: IPoint, rotation: number, scale: IPoint};

export const enum LevelDataActions {
    PAINT, ERASE, REFRESH, RESET
};

export interface ILevelDataState {
    levelData: LevelData;
}

type LevelData = IBrush[];
interface IActionData {brush?: IBrush, viewOffset?: IPoint}

export default class LevelDataStore extends Store<ILevelDataState, IActionData> {
    protected DefaultState(): ILevelDataState {
        return {levelData: []};
    }

    protected Reduce(state: ILevelDataState, action: IAction<IActionData>): ILevelDataState {
        const newState = {
            levelData: this.UpdateLevelData(state.levelData, action)
        };
        return newState as ILevelDataState;
    }

    private UpdateLevelData(levelData: LevelData, action: IAction<IActionData>): LevelData {
        switch(action.type) {
            case LevelDataActions.PAINT: {
                const levelDataCopy = levelData.concat();

                // remove identical items at this position
                const brush: IBrush = {...action.data.brush};
                brush.position = AddTypes(brush.position, action.data.viewOffset);

                const existing = levelDataCopy.filter(v =>
                    (v.position.x === brush.position.x && v.position.y === brush.position.y && v.name === brush.name)
                );
                existing.forEach(item => levelDataCopy.splice(levelDataCopy.indexOf(item), 1));

                return levelDataCopy.concat(brush);
            }
            case LevelDataActions.ERASE: {
                const levelDataCopy = levelData.concat();
                const brush: IBrush = {...action.data.brush};
                brush.position = AddTypes(brush.position, action.data.viewOffset);

                // remove last item in the same location
                for(let i = levelDataCopy.length - 1; i >= 0; i--) {
                    const item = levelDataCopy[i];
                    if(item.position.x === brush.position.x && item.position.y === brush.position.y) {
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
