export default abstract class ListItemBase extends PIXI.Container {
    public index: number;
    abstract Update(item: { id: number; name: string; selected: boolean; visible: boolean }): void;
}
