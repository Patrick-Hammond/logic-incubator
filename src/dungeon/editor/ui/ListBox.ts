import ObjectPool from "../../../_lib/utils/ObjectPool";
import {BaseContainer} from "./BaseContainer";

export const enum ListBoxEvents {
    ITEM_SELECTED = "item_selected"
}

export class ListBox extends BaseContainer {

    private selections: ObjectPool<ListItem>;

    constructor(bounds: PIXI.Rectangle, borderWidth: number = 0) {
        super(bounds, borderWidth);

        this.selections = new ObjectPool<ListItem>(5, () => new ListItem(bounds));
    }

    Set(items: {id: number, name: string, selected: boolean}[]): void {

        this.selections.Popped.forEach(item => this.removeChild(item));
        this.selections.Restore();

        items.forEach((item, index) => {
            this.selections.Get().Init(this, index, item);
        });
    }
}

class ListItem extends PIXI.Container {

    private label: PIXI.Text;
    private selection: PIXI.Graphics;
    private index: number;

    constructor(bounds: PIXI.Rectangle) {
        super();

        this.selection = new PIXI.Graphics().beginFill(0x3355AA, 0.4).drawRect(0, 0, bounds.width - 10, 13).endFill();
        this.addChild(this.selection);

        const hover = new PIXI.Graphics().beginFill(0x335555, 0.3).drawRect(0, 0, bounds.width - 10, 13).endFill();

        const removeHover = () => {
            if(hover.parent) {
                this.removeChild(hover);
            }
        }

        this.label = new PIXI.Text("", {fontFamily: "Arial", fontSize: 11, fill: 0xeeeeee});
        this.label.on("pointerover", () => {
            this.addChild(hover);
        });
        this.label.on("pointerout", () => {
           removeHover();
        });
        this.label.on("pointerdown", () => {
            removeHover();
            this.parent.emit(ListBoxEvents.ITEM_SELECTED, this.index);
        });
        this.addChild(this.label);
    }

    Init(parent: PIXI.Container, index: number, item: {id: number, name: string, selected: boolean}): void {
        this.index = index;
        this.label.text = item.name;
        this.label.interactive = true;
        this.label.buttonMode = true;
        this.position.set(5, 5 + index * 20);
        this.selection.visible = item.selected;
        parent.addChild(this);
    }
}
