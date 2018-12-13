
import EditorComponent from "../EditorComponent";
import { AnimationSpeed, TileSize } from "../Constants";
import { IState, EditorActions } from "../stores/EditorStore";
import Game from "../../../../_lib/Game";

enum Palettes { Room, Prop, Animation }

export class Palette extends EditorComponent
{
    private brushText: PIXI.Text;
    private palettes: PIXI.Container[] = [];
    private paletteContainer = new PIXI.Container();

    constructor()
    {
        super();

        this.Create();

        this.AddToStage();

        this.root.interactive = this.root.interactiveChildren = true;
        this.root.on("mousedown", (e: PIXI.interaction.InteractionEvent) =>
        {
            this.editorStore.Dispatch({
                type: EditorActions.PALETTE_ITEM_CHANGED,
                data: { name: e.target.name, layer: this.palettes.indexOf(e.target.parent) }
            });
        });

        this.editorStore.Subscribe(this.Render, this);
    }

    private Render(prevState: IState, state: IState): void
    {

        //update palette
        let paletteChanged = prevState.paletteIndex != state.paletteIndex;
        if (paletteChanged) {
            this.paletteContainer.removeChildren();
            this.paletteContainer.addChild(this.palettes[ state.paletteIndex ]);
        }

        //update text
        if (paletteChanged || prevState.currentBrush.name != state.currentBrush.name) {
            this.brushText.text = state.currentBrush.name;
        }
    }

    private Create(): void
    {
        for (let palette in Palettes) {
            if (isNaN(Number(palette))) {
                this.palettes.push(new PIXI.Container());
            }
        }

        const roomItems = [ "floor", "wall", "hole", "edge" ];

        this.assetFactory.SpriteNames.forEach(name =>
        {
            let s = this.assetFactory.Create(name);
            s.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            s.scale.set(2);
            s.name = name;
            s.interactive = true;

            const layer = roomItems.some(v => s.name.indexOf(v) > -1) ? this.palettes[ Palettes.Room ] : this.palettes[ Palettes.Prop ];
            layer.addChild(s);
        });

        this.assetFactory.AnimationNames.forEach(name =>
        {
            let a = this.assetFactory.CreateAnimatedSprite(name);
            a.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            a.scale.set(2);
            a.animationSpeed = AnimationSpeed;
            a.play();
            a.name = name;
            a.interactive = true;

            this.palettes[ Palettes.Animation ].addChild(a);
        });

        const padding = 2;
        const layout = this.editorStore.state;
        let left = layout.gridBounds.right + 10;

        this.palettes.forEach(layer =>
        {
            let x = left;
            let y = layout.gridBounds.y;
            let maxHeight = 0;

            layer.children.forEach((child: PIXI.Sprite) =>
            {
                child.position.set(x, y);
                maxHeight = Math.max(maxHeight, child.height);
                x += child.width + padding;
                if (x > Game.inst.screen.width - 20) {
                    x = left;
                    y += maxHeight + padding;
                }
            });
        });

        this.brushText = new PIXI.Text("", { fontFamily: "Arial", fontSize: 11, fill: 0xeeeeee });
        this.brushText.position.set(left, 3);

        this.paletteContainer.addChild(this.palettes[ Palettes.Room ]);
        this.root.addChild(this.paletteContainer, this.brushText);
    }
}