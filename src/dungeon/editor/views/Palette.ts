import AssetFactory from "../../../_lib/loading/AssetFactory";
import {AnimationSpeed, GridBounds, Scenes} from "../Constants";
import EditorComponent from "../EditorComponent";
import {EditorActions, IState} from "../stores/EditorStore";
import ScrollBox from "../ui/ScrollBox";

export default class Palette extends EditorComponent {
    private paletteContainer: ScrollBox;
    private dataContainer: ScrollBox;

    constructor() {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {

        this.editorStore.Subscribe(this.Render, this);

        const padding = 2;
        let maxHeight = 0;
        let x = 5;
        let y = 5;

        const tileLayout = (s: PIXI.Sprite) => {
            if((x + s.width + padding) > scrollBounds.width) {
                x = 5;
                y += maxHeight + padding;
                maxHeight = 0;
            }
            s.position.set(x, y);
            maxHeight = Math.max(maxHeight, s.height);
            x += s.width + padding;
        };

        const addRollOver = (s: PIXI.DisplayObject) => {
            s.on("pointerover", (e: PIXI.interaction.InteractionEvent) => {
                this.editorStore.Dispatch({type: EditorActions.BRUSH_HOVERED, data: {name: e.target.name}});
            });
        }

        const addSelect = (s: PIXI.DisplayObject) => {
            s.interactive = true;
            s.on("pointerdown", (e: PIXI.interaction.InteractionEvent) => {
                if(e.target.name !== this.editorStore.state.currentBrush.name) {
                    this.editorStore.Dispatch({
                        type: EditorActions.BRUSH_CHANGED,
                        data: {name: e.target.name}
                    });
                }
            });
            s.on("pointerout", (e: PIXI.interaction.InteractionEvent) => {
                this.editorStore.Dispatch({type: EditorActions.BRUSH_HOVERED, data: {name: this.editorStore.state.currentBrush.name}});
            });
        };

        const scrollBounds = new PIXI.Rectangle(GridBounds.right + 10, GridBounds.y, 260, GridBounds.height * 0.75);
        this.paletteContainer = new ScrollBox(scrollBounds, 1);
        this.root.addChild(this.paletteContainer);
        addSelect(this.paletteContainer);

        this.assetFactory.SpriteNames.forEach(name => {
            const s = this.assetFactory.Create(name);
            s.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            s.scale.set(2);
            s.name = name;
            s.interactive = true;
            this.paletteContainer.addChild(s);

            tileLayout(s);
            addRollOver(s);
        });

        this.assetFactory.AnimationNames.forEach(name => {
            const a = this.assetFactory.CreateAnimatedSprite(name);
            a.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            a.scale.set(2);
            a.animationSpeed = AnimationSpeed;
            a.play();
            a.name = name;
            a.interactive = true;
            this.paletteContainer.addChild(a);

            tileLayout(a);
            addRollOver(a);
        });

        this.dataContainer = new ScrollBox(scrollBounds, 1);
        addSelect(this.dataContainer);

        maxHeight = 0;
        x = 5;
        y = 5;

        const square = PIXI.Sprite.from("data-square");
        square.alpha = 0.5;
        this.editorStore.state.dataBrushes.forEach(dataBrush => {
            square.tint = dataBrush.colour;
            const tex = this.game.renderer.generateTexture(square, PIXI.SCALE_MODES.NEAREST, 1);
            const s = new PIXI.Sprite(tex);
            s.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            s.scale.set(2);
            s.name = dataBrush.name;
            s.interactive = true;

            this.dataContainer.addChild(s);
            AssetFactory.inst.Add(s.name, [s.name], [tex]);

            tileLayout(s);
        });
    }

    private Render(prevState: IState, state: IState): void {
        const selectedLayer = this.editorStore.SelectedLayer;
        if(selectedLayer) {
            this.root.removeChildren();
            if(selectedLayer.isData) {
                this.root.addChild(this.dataContainer);
            } else {
                this.root.addChild(this.paletteContainer);
            }
        }
    }

}
