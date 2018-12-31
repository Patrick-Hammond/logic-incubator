import {AnimationSpeed, GridBounds} from "../Constants";
import EditorComponent from "../EditorComponent";
import {IState} from "../stores/EditorStore";
import {ScrollBox} from "../ui/ScrollBox";

export class Palette extends EditorComponent {
    private brushText: PIXI.Text;
    private paletteContainer: ScrollBox;

    constructor() {
        super();

        this.Create();
        this.AddToStage();
        this.editorStore.Subscribe(this.Render, this);
    }

    private Render(prevState: IState, state: IState): void {
        if(prevState.hoveredBrushName !== state.hoveredBrushName) {
            this.brushText.text = state.hoveredBrushName;
        }
    }

    private Create(): void {
        const scrollBounds = new PIXI.Rectangle(GridBounds.right + 10, GridBounds.y, 260, GridBounds.height * 0.75);
        this.paletteContainer = new ScrollBox(scrollBounds, 1);
        this.root.addChild(this.paletteContainer);

        const padding = 2;
        let maxHeight = 0;
        let x = 5;
        let y = 5;

        const tileLayout = (child: PIXI.Sprite) => {
            if((x + child.width + padding) > scrollBounds.width) {
                x = 5;
                y += maxHeight + padding;
                maxHeight = 0;
            }
            child.position.set(x, y);
            maxHeight = Math.max(maxHeight, child.height);
            x += child.width + padding;
        };

        this.assetFactory.SpriteNames.forEach(name => {
            const s = this.assetFactory.Create(name);
            s.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            s.scale.set(2);
            s.name = name;
            s.interactive = true;

            this.paletteContainer.addChild(s);

            tileLayout(s);
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
        });

        this.brushText = new PIXI.Text("", {fontFamily: "Arial", fontSize: 11, fill: 0xeeeeee});
        this.brushText.position.set(scrollBounds.x, 3);
        this.root.addChild(this.brushText);
    }
}
