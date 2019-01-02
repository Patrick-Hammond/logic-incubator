import {AdjustmentFilter} from "pixi-filters";
import {ListBoxEvents} from "./ListBox";
import ListItemBase from "./ListBoxItemBase";

export default class ListBoxItem extends ListItemBase {

    protected label: PIXI.Text;
    protected selection: PIXI.Graphics;
    protected eyeIcon = new PIXI.Sprite();

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

        this.eyeIcon = PIXI.Sprite.from("icon_eye");
        this.eyeIcon.anchor.set(0.5);
        this.eyeIcon.scale.set(0.1);
        this.eyeIcon.alpha = 0.7;
        this.eyeIcon.position.set(bounds.width - 20, 6);
        this.eyeIcon.buttonMode = true;
        this.eyeIcon.interactive = true;
        this.eyeIcon.on("pointerdown", () => {
            removeHover();
            this.parent.emit(ListBoxEvents.TOGGLE_VISIBILITY, this.index);
        });
        this.addChild(this.eyeIcon);
    }

    Update(item: {id: number, name: string, selected: boolean, visible: boolean}): void {
        this.position.set(5, 5 + this.index * 20);

        this.label.text = item.name;
        this.label.interactive = true;
        this.label.buttonMode = true;

        this.selection.visible = item.selected;

        this.eyeIcon.texture = PIXI.Texture.from(item.visible ? "icon_eye" : "icon_eye_slash");
    }
}
