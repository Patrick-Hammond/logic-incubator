import { ListBoxEvents } from "../../ui/listbox/ListBox";
import ListItemBase from "../../ui/listbox/ListBoxItemBase";

export default class ListBoxItem extends ListItemBase {
    protected label: PIXI.Text;
    protected selection: PIXI.Graphics;
    protected eyeIcon = new PIXI.Sprite();

    constructor(bounds: PIXI.Rectangle) {
        super();

        this.selection = new PIXI.Graphics()
            .beginFill(0x3355aa, 0.4)
            .drawRect(0, 0, bounds.width - 10, 13)
            .endFill();
        this.addChild(this.selection);

        const hover = new PIXI.Graphics()
            .beginFill(0x335555, 0.3)
            .drawRect(0, 0, bounds.width - 10, 13)
            .endFill();
        hover.interactive = true;
        hover.buttonMode = true;
        hover.alpha = 0;
        this.addChild(hover);

        this.label = new PIXI.Text("", { fontFamily: "Arial", fontSize: 11, fill: 0xeeeeee });
        hover.on("pointerover", () => {
            hover.alpha = 0.3;
        });
        hover.on("pointerout", () => {
            hover.alpha = 0;
        });
        hover.on("pointerdown", () => {
            hover.alpha = 0;
            this.parent.emit(ListBoxEvents.ITEM_SELECTED, this.index);
        });
        this.addChild(this.label);

        this.eyeIcon = PIXI.Sprite.from("icon-eye");
        this.eyeIcon.anchor.set(0.5);
        this.eyeIcon.alpha = 0.7;
        this.eyeIcon.position.set(bounds.width - 20, 6);
        this.eyeIcon.buttonMode = true;
        this.eyeIcon.interactive = true;
        this.eyeIcon.on("pointerdown", () => {
            hover.alpha = 0;
            this.parent.emit(ListBoxEvents.TOGGLE_VISIBILITY, this.index);
        });
        this.addChild(this.eyeIcon);
    }

    Update(item: { id: number; name: string; selected: boolean; visible: boolean }): void {
        this.position.set(5, 5 + this.index * 20);

        this.label.text = item.name;

        this.selection.visible = item.selected;

        this.eyeIcon.texture = PIXI.Texture.from(item.visible ? "icon-eye" : "icon-eye-slash");
    }
}
