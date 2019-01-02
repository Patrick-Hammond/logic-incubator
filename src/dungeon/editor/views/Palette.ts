import {AnimationSpeed, GridBounds} from "../Constants";
import EditorComponent from "../EditorComponent";
import {EditorActions, IState} from "../stores/EditorStore";
import {ScrollBox} from "../ui/ScrollBox";

export default class Palette extends EditorComponent {
    private paletteContainer: ScrollBox;

    constructor() {
        super();

        this.Create();
        this.AddToStage();
    }

    private Create(): void {
        const scrollBounds = new PIXI.Rectangle(GridBounds.right + 10, GridBounds.y, 260, GridBounds.height * 0.75);
        this.paletteContainer = new ScrollBox(scrollBounds, 1);
        this.paletteContainer.interactive = true;
        this.root.addChild(this.paletteContainer);

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

        const addRollOver = (s:PIXI.DisplayObject)=> {
            s.on("pointerover", (e: PIXI.interaction.InteractionEvent) => {
                this.editorStore.Dispatch({type: EditorActions.BRUSH_HOVERED, data: {name: e.target.name}});
            });
        }

        this.paletteContainer.on("pointerdown", (e: PIXI.interaction.InteractionEvent) => {
            if(e.target.name !== this.editorStore.state.currentBrush.name) {
                const selectedLayer = this.editorStore.state.layers.find(layer => layer.selected);
                this.editorStore.Dispatch({type: EditorActions.BRUSH_CHANGED, data: {name: e.target.name, layer: selectedLayer}});
            }
        });
        this.paletteContainer.on("pointerout", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.BRUSH_HOVERED, data: {name: this.editorStore.state.currentBrush.name}});
        });

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
    }
}