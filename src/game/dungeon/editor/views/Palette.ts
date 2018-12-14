
import EditorComponent from "../EditorComponent";
import {AnimationSpeed, TileSize} from "../Constants";
import {IState, EditorActions} from "../stores/EditorStore";
import {ScrollingContainer} from "../ui/ScrollingContainer";

export class Palette extends EditorComponent
{
    private brushText: PIXI.Text;
    private paletteContainer: ScrollingContainer;

    constructor()
    {
        super();

        this.Create();

        this.AddToStage();

        this.editorStore.Subscribe(this.Render, this);
    }

    private Render(prevState: IState, state: IState): void
    {
        //update text
        if(prevState.hoveredBrushName != state.hoveredBrushName) {
            this.brushText.text = state.hoveredBrushName;
        }
    }

    private Create(): void
    {
        const state = this.editorStore.state;

        let scrollBounds = new PIXI.Rectangle(state.gridBounds.right + 10, state.gridBounds.y, 260, 630);
        this.paletteContainer = new ScrollingContainer(scrollBounds, 1);
        this.root.addChild(this.paletteContainer);

        const padding = 2;
        let maxHeight = 0;
        let x = 5;
        let y = 5;

        const tileLayout = (child: PIXI.Sprite) =>
        {
            if((x + child.width + padding) > scrollBounds.width) {
                x = 5;
                y += maxHeight + padding;
                maxHeight = 0;
            }
            child.position.set(x, y);
            maxHeight = Math.max(maxHeight, child.height);
            x += child.width + padding;
        };

        const addMouseEvents = (child: PIXI.Sprite) =>
        {
            child.on("mousedown", (e: PIXI.interaction.InteractionEvent) =>
            {
                this.editorStore.Dispatch({
                    type: EditorActions.BRUSH_CHANGED,
                    data: {name: e.target.name}
                });
            });
            child.on("mouseover", (e: PIXI.interaction.InteractionEvent) =>
            {
                this.editorStore.Dispatch({
                    type: EditorActions.BRUSH_HOVERED,
                    data: {name: e.target.name}
                });
            });
        }

        this.assetFactory.SpriteNames.forEach(name =>
        {
            let s = this.assetFactory.Create(name);
            s.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            s.scale.set(2);
            s.name = name;
            s.interactive = true;

            this.paletteContainer.addChild(s);

            tileLayout(s);
            addMouseEvents(s);
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

            this.paletteContainer.addChild(a);

            tileLayout(a);
            addMouseEvents(a);
        });

        this.brushText = new PIXI.Text("", {fontFamily: "Arial", fontSize: 11, fill: 0xeeeeee});
        this.brushText.position.set(scrollBounds.x, 3);
        this.root.addChild(this.brushText);
    }
}