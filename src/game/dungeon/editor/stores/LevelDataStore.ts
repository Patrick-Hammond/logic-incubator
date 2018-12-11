import Store, { IAction } from "../../../../_lib/Store";
import { Brush } from "../Types";

export const enum LevelDataActions {
    PAINT, ERASE, REFRESH
};

type LevelData = Brush[];
type ActionData = Brush;

export interface ILevelDataState {
    levelData: LevelData;
}

export default class LevelDataStore extends Store<ILevelDataState, ActionData>
{
    protected DefaultState(): ILevelDataState {
        return { levelData: [] };
    }

    protected Reduce(state: ILevelDataState, action: IAction<ActionData>): ILevelDataState {
        let newState = {
            levelData: this.UpdateLevelData(state.levelData, action)
        };
        return newState as ILevelDataState;
    }

    private UpdateLevelData(levelData: LevelData, action: IAction<ActionData>): LevelData {
        switch (action.type) {
            case LevelDataActions.PAINT:
            case LevelDataActions.ERASE:
                //copy
                let levelDataCopy = levelData.concat();

                //remove existing items on same layer
                let brush = action.data;
                let existing = levelDataCopy.filter(v =>
                    (v.position.x == brush.position.x && v.position.y == brush.position.y && v.layer == brush.layer)
                );
                existing.forEach(item => levelDataCopy.splice(levelDataCopy.indexOf(item), 1));

                if (action.type == LevelDataActions.ERASE) {
                    return levelDataCopy;
                }

                return levelDataCopy.concat(brush);
            case LevelDataActions.REFRESH:
                return levelData.concat();
            default:
                return levelData || this.DefaultState().levelData;
        }
    }
}