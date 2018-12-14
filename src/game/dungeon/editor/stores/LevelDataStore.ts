import Store, {IAction} from "../../../../_lib/Store";
import {Brush} from "../Types";

export const enum LevelDataActions
{
    PAINT, ERASE, REFRESH
};

type LevelData = Brush[];
type ActionData = Brush;

export interface ILevelDataState
{
    levelData: LevelData;
}

export default class LevelDataStore extends Store<ILevelDataState, ActionData>
{
    protected DefaultState(): ILevelDataState
    {
        return {levelData: []};
    }

    protected Reduce(state: ILevelDataState, action: IAction<ActionData>): ILevelDataState
    {
        let newState = {
            levelData: this.UpdateLevelData(state.levelData, action)
        };
        return newState as ILevelDataState;
    }

    private UpdateLevelData(levelData: LevelData, action: IAction<ActionData>): LevelData
    {
        switch(action.type) {
            case LevelDataActions.PAINT: {
                let levelDataCopy = levelData.concat();

                //remove existing items on same layer
                let brush = action.data;
                let existing = levelDataCopy.filter(v =>
                    (v.position.x == brush.position.x && v.position.y == brush.position.y && v.name == brush.name)
                );
                existing.forEach(item => levelDataCopy.splice(levelDataCopy.indexOf(item), 1));

                return levelDataCopy.concat(brush);
            }
            case LevelDataActions.ERASE: {
                let levelDataCopy = levelData.concat();
                let brush = action.data;

                //remove last item in the same location
                for(let i = levelDataCopy.length - 1; i > 0; i--) {
                    let item = levelDataCopy[ i ];
                    if(item.position.x == brush.position.x && item.position.y == brush.position.y) {
                        levelDataCopy.splice(i, 1);
                        break;
                    }
                }

                return levelDataCopy;
            }
            case LevelDataActions.REFRESH: {
                return levelData.concat();
            }
            default: {
                return levelData || this.DefaultState().levelData;
            }
        }
    }
}