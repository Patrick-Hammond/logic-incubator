import {AnimatedSprite, BitmapText, Container, Graphics, interaction} from "pixi.js";
import { Key } from "@logic-incubator/lib/io/Keyboard";
import AssetMetadataStore from "@logic-incubator/engine/level/AssetMetadata";
import { FindImplicitPlacements } from "@logic-incubator/engine/level/ImplicitData";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import { IsSpawnerValue, SpawnerCells } from "@logic-incubator/engine/level/entities/Spawners";
import { IsLightValue } from "@logic-incubator/engine/level/Lighting";
import { Brush, DataBrushName } from "@logic-incubator/engine/level/LevelFormat";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import { DataBrushEditorFor } from "../DataBrushEditors";
import ObjectPool from "@logic-incubator/lib/patterns/ObjectPool";
import { AnimationSpeed, Scenes, TileSize } from "@logic-incubator/engine/Constants";
import { GridBounds, InitalScale } from "../Layout";
import EditorComponent from "../EditorComponent";
import { EditorActions, EditorTool, IEditorState, MouseButtonState } from "../stores/EditorStore";
import { LevelDataActions, LevelDataState } from "../stores/LevelDataStore";

/** Doors, lights and spawners aren't paintable data brushes any more, so they have no palette colour of their own to borrow - these match their old ones (LIGHT's/SPAWNER's former swatch colours) so the map looks the same as before the change. */
const IMPLICIT_DOOR_COLOUR = 0x4cc9f0;
const IMPLICIT_LIGHT_COLOUR = 0xff8100;
const IMPLICIT_SPAWNER_COLOUR = 0x9b5de5;

export default class Canvas extends EditorComponent {
    private grid: Graphics = new Graphics();
    private mask: Graphics = new Graphics();
    private levelContainer = new Container();
    private layerContainers: ObjectPool<Container>;
    private textPool: ObjectPool<BitmapText>;
    /** The read-only implicit layer's drawing - always on top of every real layer, and outside `layerContainers` so it never eats one of the (limited) editable layers' slots. */
    private implicitContainer = new Container();
    private implicitGraphics = new Graphics();

    constructor() {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {
        this.layerContainers = new ObjectPool<Container>(
            6,
            () => new Container(),
            (item: Container) => item.removeChildren()
        );

        this.textPool = new ObjectPool<BitmapText>(
            100,
            () => {
                const b = new BitmapText("", { font: { name: "small-font", size: 6 } });
                b.position.set(8, 8);
                b.anchor = 0.5;
                return b;
            },
            // Shared by brush sprites (sprite-local, unscaled) and the implicit layer (screen space,
            // scaled) - put each back to the brush-sprite default so neither inherits the other's.
            (b: BitmapText) => {
                b.position.set(8, 8);
                b.scale.set(1);
            }
        );

        this.root.addChild(this.mask, this.grid, this.levelContainer);
        this.levelContainer.mask = this.mask;

        this.levelDataStore.Subscribe(this.UpdateLevel, this);
        this.editorStore.Subscribe(this.UpdateLayout, this);

        this.RedrawGrid(InitalScale);

        this.RegisterGridEvents();
    }

    private UpdateLayout(prevState: IEditorState, state: IEditorState): void {
        if (prevState.viewScale !== state.viewScale) {
            this.RedrawGrid(state.viewScale);
        }
    }

    private UpdateLevel(prevState: LevelDataState, state: LevelDataState): void {
        if (prevState.levelData !== state.levelData) {
            this.levelContainer.removeChildren();

            this.layerContainers.RestoreAll();
            const layerDict: { [id: number]: Container } = {};
            this.editorStore.state.layers.forEach(layer => {
                if (layer.readOnly) {
                    return;
                }
                const layerContainer = this.layerContainers.Get();
                layerDict[layer.id] = layerContainer;
                layerContainer.visible = layer.visible;
                this.levelContainer.addChild(layerContainer);
            });

            const scaledTileSize = TileSize * this.editorStore.state.viewScale;
            const viewOffset = this.editorStore.state.viewOffset;

            this.textPool.RestoreAll();
            this.DrawImplicitLayer(state.levelData);
            state.levelData.forEach(brush => {
                if (layerDict[brush.layerId] && layerDict[brush.layerId].visible) {
                    let posX = (brush.position.x - viewOffset.x) * scaledTileSize + GridBounds.x;
                    let posY = (brush.position.y - viewOffset.y) * scaledTileSize + GridBounds.y;

                    if (GridBounds.contains(posX, posY)) {
                        const sprite = this.assetFactory.Create(brush.name);
                        // A name the atlas doesn't have (e.g. from a generator style or an old save) - skip just that brush rather than throw and leave the rest of the map undrawn.
                        if (!sprite) {
                            this.assetFactory.WarnMissing(brush.name);
                            return;
                        }
                        const scaleX = brush.scale.x * this.editorStore.state.viewScale;
                        const scaleY = brush.scale.y * this.editorStore.state.viewScale;
                        const flipOffsetX = scaleX < 0 ? sprite.width * this.editorStore.state.viewScale : 0;
                        const flipOffsetY = scaleY < 0 ? sprite.height * this.editorStore.state.viewScale : 0;
                        posX += flipOffsetX;
                        posY += flipOffsetY;
                        sprite.position.set(posX, posY);
                        sprite.rotation = brush.rotation;
                        sprite.pivot.set(brush.pixelOffset.x, brush.pixelOffset.y);
                        sprite.scale.set(scaleX, scaleY);
                        if (sprite instanceof AnimatedSprite) {
                            sprite.play();
                            sprite.animationSpeed = AnimationSpeed;
                        }
                        // Player-start and collision values mean nothing (no editor for them), and a "0" would sit over their icons.
                        if (brush.data !== null && DataBrushEditorFor(brush.name)) {
                            const text = this.textPool.Get();
                            // A LightValue is shown as just its range, matching every other data brush's
                            // convention of a single bare number - brightness/tint are only relevant once
                            // you're editing the light (see SelectedBrush), not at a map-overview glance.
                            // Likewise a spawner shows how many monster types it draws from.
                            text.text = IsLightValue(brush.data)
                                ? brush.data.range.toString()
                                : IsSpawnerValue(brush.data)
                                  ? brush.data.monsters.length.toString()
                                  : brush.data.toString();
                            sprite.addChild(text);
                        }
                        layerDict[brush.layerId].addChild(sprite);
                    }
                }
            });
        }
    }

    /**
     * Outlines every placement the game derives from tiles' `AssetMetadata`
     * (see `FindImplicitPlacements` - the same function `Level` uses, so this
     * is exactly what the game will get): collision, each cell of a door's
     * sprite footprint, and intrinsic lights labelled with their range. Drawn
     * outlined over a faint fill, so it reads differently from the solid
     * squares of hand-painted data brushes.
     */
    private DrawImplicitLayer(levelData: Brush[]): void {
        this.implicitContainer.removeChildren();
        this.implicitGraphics.clear();
        this.implicitContainer.addChild(this.implicitGraphics);
        this.levelContainer.addChild(this.implicitContainer);

        const state = this.editorStore.state;
        const implicitLayer = state.layers.find(layer => layer.readOnly);
        if (!implicitLayer || !implicitLayer.visible) {
            return;
        }

        const tileLayerIds = new Set(state.layers.filter(layer => !layer.isData).map(layer => layer.id));
        const placements = FindImplicitPlacements(
            levelData,
            layerId => tileLayerIds.has(layerId),
            name => AssetMetadataStore.inst.Get(name),
            name => AssetFactory.inst.CreateTexture(name),
            TileSize
        );

        const colourOf = (name: string): number => {
            const dataBrush = state.dataBrushes.find(db => db.name === name);
            return dataBrush ? dataBrush.colour : 0xffffff;
        };
        const scaledTileSize = TileSize * state.viewScale;
        const drawn = new Set<string>();
        /** Returns the cell's screen top-left, or null if it's culled (off-grid) or already drawn in this colour. */
        const drawCell = (x: number, y: number, colour: number): { x: number; y: number } | null => {
            const posX = (x - state.viewOffset.x) * scaledTileSize + GridBounds.x;
            const posY = (y - state.viewOffset.y) * scaledTileSize + GridBounds.y;
            const key = x + "," + y + "," + colour;
            if (!GridBounds.contains(posX, posY) || drawn.has(key)) {
                return null;
            }
            drawn.add(key);
            this.implicitGraphics
                .lineStyle(1, colour, 0.9)
                .beginFill(colour, 0.2)
                .drawRect(posX + 1, posY + 1, scaledTileSize - 2, scaledTileSize - 2)
                .endFill();
            return { x: posX, y: posY };
        };

        const collisionColour = colourOf(DataBrushName.COLLISION);
        placements.collision.forEach(cell => drawCell(cell.x, cell.y, collisionColour));
        placements.doors.forEach(cell => drawCell(cell.x, cell.y, IMPLICIT_DOOR_COLOUR));
        placements.lights.forEach(light => {
            const pos = drawCell(light.x, light.y, IMPLICIT_LIGHT_COLOUR);
            if (pos) {
                const text = this.textPool.Get();
                text.text = light.value.range.toString();
                text.scale.set(state.viewScale);
                text.position.set(pos.x + scaledTileSize * 0.5, pos.y + scaledTileSize * 0.5);
                this.implicitContainer.addChild(text);
            }
        });
        const spawnerSprite = MonsterRoster.inst.SpawnerSprite;
        const spawnerSize = spawnerSprite && this.assetFactory.Has(spawnerSprite) ? this.assetFactory.CreateTexture(spawnerSprite) : undefined;
        placements.spawners.forEach(spawner => {
            const cells = SpawnerCells(spawner, spawnerSize, TileSize);
            let labelPos: { x: number; y: number } | null = null;
            cells.forEach(cell => {
                const pos = drawCell(cell.x, cell.y, IMPLICIT_SPAWNER_COLOUR);
                labelPos = labelPos || pos;
            });
            if (labelPos) {
                const text = this.textPool.Get();
                text.text = spawner.value.monsters.length.toString();
                text.scale.set(state.viewScale);
                text.position.set(labelPos.x + scaledTileSize * 0.5, labelPos.y + scaledTileSize * 0.5);
                this.implicitContainer.addChild(text);
            }
        });
    }

    private RedrawGrid(scale: number): void {
        const margin = GridBounds.x;
        const scaledTileSize = TileSize * scale;

        this.grid
            .clear()
            .beginFill(0x222222, 0.5)
            .drawShape(GridBounds);
        this.mask
            .clear()
            .beginFill(0xff)
            .drawShape(GridBounds);

        for (let col = 0; col <= GridBounds.width; col += scaledTileSize) {
            this.grid.lineStyle(1, 0x999999, 0.1);
            this.grid.moveTo(col + margin, margin).lineTo(col + margin, GridBounds.height + margin);
        }

        for (let row = 0; row <= GridBounds.height; row += scaledTileSize) {
            this.grid.lineStyle(1, 0x999999, 0.1);
            this.grid.moveTo(margin, row + margin).lineTo(GridBounds.width + margin, row + margin);
        }
    }

    private RegisterGridEvents(): void {
        this.grid.interactive = true;
        this.grid.on("mouseover", (e: interaction.InteractionEvent) => {
            this.editorStore.Dispatch({ type: EditorActions.BRUSH_VISIBLE, data: { visible: true } });
        });
        this.grid.on("mouseout", (e: interaction.InteractionEvent) => {
            this.editorStore.Dispatch({ type: EditorActions.BRUSH_VISIBLE, data: { visible: false } });
        });

        this.grid.on("pointermove", (e: interaction.InteractionEvent) => {
            const currentBrush = this.editorStore.state.currentBrush;
            if (currentBrush) {
                const pos = e.data.global.clone();
                if (GridBounds.contains(pos.x, pos.y)) {
                    const scaledTileSize = TileSize * this.editorStore.state.viewScale;

                    // snap to grid
                    pos.x = ((pos.x - GridBounds.x) / scaledTileSize) | 0;
                    pos.y = ((pos.y - GridBounds.y) / scaledTileSize) | 0;

                    if (currentBrush.position.x !== pos.x || currentBrush.position.y !== pos.y) {
                        this.editorStore.Dispatch({ type: EditorActions.BRUSH_MOVED, data: { position: pos } });

                        // check drag move - painting, erasing and the other tools are handled by `Tools`
                        const state = this.editorStore.state;
                        const spaceDragging = this.game.keyboard.KeyPressed(Key.Space) && state.mouseButtonState === MouseButtonState.LEFT_DOWN;
                        const middleButtonDragging = state.mouseButtonState === MouseButtonState.MIDDLE_DOWN;
                        const moveToolDragging = state.tool === EditorTool.MOVE && state.mouseButtonState === MouseButtonState.LEFT_DOWN;
                        if (spaceDragging || middleButtonDragging || moveToolDragging) {
                            this.editorStore.Dispatch({ type: EditorActions.VIEW_DRAG, data: { position: currentBrush.position } });
                            this.levelDataStore.Dispatch({ type: LevelDataActions.REFRESH });
                        }
                    }
                }
            }
        });

        this.grid.on("pointerdown", (e: interaction.InteractionEvent) => {
            if (e.data.button === 0) {
                this.editorStore.Dispatch({ type: EditorActions.MOUSE_BUTTON, data: { mouseButtonState: MouseButtonState.LEFT_DOWN } });
            } else if (e.data.button === 1) {
                this.editorStore.Dispatch({ type: EditorActions.MOUSE_BUTTON, data: { mouseButtonState: MouseButtonState.MIDDLE_DOWN } });
            } else if (e.data.button === 2) {
                this.editorStore.Dispatch({ type: EditorActions.MOUSE_BUTTON, data: { mouseButtonState: MouseButtonState.RIGHT_DOWN } });
            }
        });
        this.grid.on("pointerup", (e: interaction.InteractionEvent) => {
            this.editorStore.Dispatch({ type: EditorActions.MOUSE_BUTTON, data: { mouseButtonState: MouseButtonState.UP } });
        });
        this.grid.on("pointerupoutside", (e: interaction.InteractionEvent) => {
            this.editorStore.Dispatch({ type: EditorActions.MOUSE_BUTTON, data: { mouseButtonState: MouseButtonState.UP } });
        });

        // mouse wheel zooming
        this.game.view.onwheel = (e: WheelEvent) => {
            if (GridBounds.contains(e.offsetX, e.offsetY)) {
                const oldScale = this.editorStore.state.viewScale;

                if (e.deltaY < 0) {
                    this.editorStore.Dispatch({ type: EditorActions.ZOOM_IN });
                } else if (e.deltaY > 0) {
                    this.editorStore.Dispatch({ type: EditorActions.ZOOM_OUT });
                }

                // adjust offset to zoom in and out of the cursor position
                const pos = this.game.interactionManager.mouse.global;
                const percentPos = { x: (pos.x - GridBounds.x) / GridBounds.width, y: (pos.y - GridBounds.y) / GridBounds.height };

                const oldScaledTileSize = TileSize * oldScale;
                const newScaledTileSize = TileSize * this.editorStore.state.viewScale;

                const widthDelta = (GridBounds.width / oldScaledTileSize) * newScaledTileSize - GridBounds.width;
                const heightDelta = (GridBounds.height / oldScaledTileSize) * newScaledTileSize - GridBounds.height;

                const moveDistance = {
                    x: Math.round((widthDelta / oldScaledTileSize) * percentPos.x),
                    y: Math.round((heightDelta / oldScaledTileSize) * percentPos.y)
                };

                this.editorStore.Dispatch({ type: EditorActions.VIEW_MOVE, data: { move: moveDistance } });
                this.levelDataStore.Dispatch({ type: LevelDataActions.REFRESH });
            }
        };
    }
}
