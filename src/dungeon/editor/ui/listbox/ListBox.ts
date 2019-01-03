import ObjectPool from "../../../../_lib/utils/ObjectPool";
import BaseContainer from "../BaseContainer";
import ListItemBase from "./ListBoxItemBase";

export const enum ListBoxEvents {
    ITEM_SELECTED = "item_selected", TOGGLE_VISIBILITY = "toggleVisibility"
}

export class ListBox<T extends ListItemBase> extends BaseContainer {

    private selections: ObjectPool<T>;

    constructor(itemCtor: () => T, bounds: PIXI.Rectangle, borderWidth: number = 0) {
        super(bounds, borderWidth);

        this.selections = new ObjectPool<T>(5, () => itemCtor());
    }

    Set(items: {id: number, name: string, selected: boolean, visible: boolean}[]): void {

        this.selections.Popped.forEach(item => this.removeChild(item));
        this.selections.Restore();

        items.forEach((item, index) => {
            const listItem = this.selections.Get();
            listItem.index = index;
            listItem.Update(item);
            this.addChild(listItem);
        });
    }
}
