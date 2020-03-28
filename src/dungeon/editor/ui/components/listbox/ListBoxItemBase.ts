import {Container} from "pixi.js";

export default abstract class ListItemBase extends Container {
    public index: number;
    abstract Update(item: { id: number; name: string; selected: boolean; visible: boolean }): void;
}
