import {AnimatedSprite, BitmapText, Container, Graphics, interaction} from "pixi.js";
import { Key } from "@logic-incubator/lib/io/Keyboard";
import AssetMetadataStore from "@logic-incubator/engine/level/AssetMetadata";
import { FindImplicitPlacements, FindLights, FindSpawners } from "@logic-incubator/engine/level/ImplicitData";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import { Brush, DataBrushName, HEIGHT_LAYER_ID, IsTileLayer } from "@logic-incubator/engine/level/LevelFormat";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import { MapLabel, UnpairedPortalCells } from "../DataLabels";
import { DataBrushEditorFor } from "../DataBrushEditors";
import { BlockedEdges, HeightColour, HeightMap } from "../Heights";
import { PipRect } from "../tools/ToolGeometry";
import ObjectPool from "@logic-incubator/lib/patterns/ObjectPool";
import { AnimationSpeed, TileSize } from "@logic-incubator/engine/Constants";
import { GridBounds, InitalScale } from "../Layout";
import EditorComponent from "../EditorComponent";
import { EditorFontName } from "../EditorAssets";
import { ActiveAttributeType, EditorActions, EditorTool, IEditorState, IMPLICIT_LAYER_ID, IsHeightLayer, MouseButtonState } from "../stores/EditorStore";
import { LevelDataActions, LevelDataState } from "../stores/LevelDataStore";

/** A door isn't a paintable data brush, so it has no palette colour of its own to borrow. A pickup, a spawner and a light do have one - the PICKUP, SPAWNER or LIGHT brush's, whether it's painted or a tile's own. */
const IMPLICIT_DOOR_COLOUR = 0x4cc9f0;
/** How strongly what isn't the active attribute type is drawn on the derived-data overlay, against 1 for what is. */
const OTHER_TYPE_STRENGTH = 0.3;
/** The heatmap's fill with the height layer selected, and as an underlay while another layer is and its eye's open. */
const HEIGHT_ALPHA = 0.55;
const HEIGHT_UNDERLAY_ALPHA = 0.3;
/** The line along a step no hero can take - a height difference of more than one. */
const BLOCKED_STEP_COLOUR = 0xff3b3b;

export default class Canvas extends EditorComponent {
    private grid: Graphics = new Graphics();
    private mask: Graphics = new Graphics();
    private levelContainer = new Container();
    private layerContainers: ObjectPool<Container>;
    private textPool: ObjectPool<BitmapText>;
    /** The derived-data overlay's drawing (outlines, not the "attributes" layer's own painted brushes - see `layerDict` in `UpdateLevel`) - always on top of everything, and outside `layerContainers` so it never eats one of the (limited) editable layers' slots. */
    private implicitContainer = new Container();
    private implicitGraphics = new Graphics();
    /** The height layer's heatmap: a tint per painted cell, and its number and the steps too high to take while it's selected. */
    private heightGraphics = new Graphics();
    /** The pips standing for the attribute types other than the active one, on the selected data layer (see `ActiveAttributeType`). */
    private pipGraphics = new Graphics();

    protected OnInitialise(): void {
        this.layerContainers = new ObjectPool<Container>(
            6,
            () => new Container(),
            (item: Container) => item.removeChildren()
        );

        this.textPool = new ObjectPool<BitmapText>(
            100,
            () => {
                const b = new BitmapText("", { font: { name: EditorFontName(this.game.assets), size: 6 } });
                b.position.set(8, 8);
                b.anchor = 0.5;
                return b;
            },
            // Shared by brush sprites (sprite-local, unscaled) and the implicit layer (screen space,
            // scaled) - put each back to the brush-sprite default so neither inherits the other's.
            (b: BitmapText) => {
                b.position.set(8, 8);
                b.scale.set(1);
                b.alpha = 1;
            }
        );

        this.root.addChild(this.mask, this.grid, this.levelContainer);
        this.levelContainer.mask = this.mask;

        this.Own(this.levelDataStore.Subscribe(this.UpdateLevel, this));
        this.Own(this.editorStore.Subscribe(this.UpdateLayout, this));

        this.RedrawGrid(InitalScale);

        this.RegisterGridEvents();
    }

    private UpdateLayout(prevState: IEditorState, state: IEditorState): void {
        if (prevState.viewScale !== state.viewScale) {
            this.RedrawGrid(state.viewScale);
        }
        // What's drawn in full, and the heatmap's strength, go by the layer selected and the active attribute type.
        const prevLayer = prevState.layers && prevState.layers.find(layer => layer.selected);
        const layer = state.layers.find(l => l.selected);
        const layerChanged = (prevLayer && prevLayer.id) !== (layer && layer.id);
        if (prevState.layers && (layerChanged || ActiveAttributeType(prevState) !== ActiveAttributeType(state))) {
            this.DrawLevel(this.levelDataStore.state.levelData);
        }
    }

    private UpdateLevel(prevState: LevelDataState, state: LevelDataState): void {
        if (prevState.levelData !== state.levelData) {
            this.DrawLevel(state.levelData);
        }
    }

    private DrawLevel(levelData: Brush[]): void {
        this.levelContainer.removeChildren();

        this.layerContainers.RestoreAll();
        const state = this.editorStore.state;
        const layerDict: { [id: number]: Container } = {};
        let attributesContainer: Container | null = null;
        let heightContainer: Container | null = null;
        state.layers.forEach(layer => {
            // A divider with nothing on it - the player isn't drawn here.
            if (layer.isPlayer) {
                return;
            }
            const layerContainer = this.layerContainers.Get();
            layerDict[layer.id] = layerContainer;
            layerContainer.visible = layer.visible;
            if (layer.id === IMPLICIT_LAYER_ID) {
                // Added after every tile/data layer below, so a painted player-start/collision/
                // pickup marker stays visible over tile art instead of sitting underneath it.
                attributesContainer = layerContainer;
            } else if (IsHeightLayer(layer)) {
                // Over the tiles too, but under the attributes, which the heatmap tints from below.
                heightContainer = layerContainer;
            } else {
                this.levelContainer.addChild(layerContainer);
            }
        });
        if (heightContainer) {
            this.levelContainer.addChild(heightContainer);
        }
        if (attributesContainer) {
            this.levelContainer.addChild(attributesContainer);
        }

        const scaledTileSize = TileSize * state.viewScale;
        const viewOffset = state.viewOffset;
        const selected = state.layers.find(layer => layer.selected);
        const activeType = ActiveAttributeType(state);
        /** Each attribute type's place among the pips: its place in the palette. */
        const pipSlot = new Map<string, number>();
        state.dataBrushes.filter(db => !db.height).forEach((db, slot) => pipSlot.set(db.name, slot));
        this.pipGraphics.clear();
        if (activeType && layerDict[selected.id]) {
            layerDict[selected.id].addChild(this.pipGraphics);
        }

        this.textPool.RestoreAll();
        this.DrawImplicitLayer(levelData);
        this.DrawHeights(levelData, heightContainer);
        const unpairedPortals = UnpairedPortalCells(levelData);
        levelData.forEach(brush => {
            if (layerDict[brush.layerId] && layerDict[brush.layerId].visible && brush.layerId !== HEIGHT_LAYER_ID) {
                let posX = (brush.position.x - viewOffset.x) * scaledTileSize + GridBounds.x;
                let posY = (brush.position.y - viewOffset.y) * scaledTileSize + GridBounds.y;

                if (GridBounds.contains(posX, posY)) {
                    // Another type than the active one, on the layer it's chosen for: just its pip, in its type's place and colour.
                    if (activeType && brush.layerId === selected.id && brush.name !== activeType && pipSlot.has(brush.name)) {
                        const dataBrush = state.dataBrushes.find(db => db.name === brush.name);
                        const pip = PipRect(pipSlot.get(brush.name), scaledTileSize);
                        this.pipGraphics
                            .lineStyle(1, 0x000000, 0.6, 0)
                            .beginFill(dataBrush.colour, 0.9)
                            .drawRect(posX + pip.x, posY + pip.y, pip.size, pip.size)
                            .endFill();
                        return;
                    }
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
                        // A short tag, not the whole value - a light shows just its range, a spawner how many
                        // monster types it draws from, a pickup its kind and number (see `MapLabel`). The rest
                        // only matters once you're editing it (see SelectedBrush), not at a map-overview glance.
                        text.text = MapLabel(brush.data);
                        if (brush.name === DataBrushName.TELEPORT && unpairedPortals.has(brush.position.x + "," + brush.position.y)) {
                            text.text += "?";
                        }
                        sprite.addChild(text);
                    }
                    layerDict[brush.layerId].addChild(sprite);
                }
            }
        });
        // Over the active type's squares, so a cell that has both shows both.
        if (this.pipGraphics.parent) {
            this.pipGraphics.parent.addChild(this.pipGraphics);
        }

    }

    /**
     * The height layer as a heatmap (see `HeightColour`): each painted cell tinted for its height - strongly, with its number and a red
     * line along every step too high to take (see `BlockedEdges`), while the height layer is selected, and faintly under the others when
     * its eye's opened by hand, so the lie of the land shows while attributes or tiles are painted. Nothing at all while the layer's
     * hidden - as it is whenever another layer's selected, until then (see `WithDataLayerEyes`). Only the painted cells
     * cost anything, and a cell at an extreme height no more than any other.
     */
    private DrawHeights(levelData: Brush[], container: Container | null): void {
        this.heightGraphics.clear();
        const state = this.editorStore.state;
        const heightLayer = state.layers.find(IsHeightLayer);
        if (!container || !heightLayer || !heightLayer.visible) {
            return;
        }
        container.addChild(this.heightGraphics);
        const selected = heightLayer.selected;
        const scaledTileSize = TileSize * state.viewScale;
        const screen = (x: number, y: number) => ({
            x: (x - state.viewOffset.x) * scaledTileSize + GridBounds.x,
            y: (y - state.viewOffset.y) * scaledTileSize + GridBounds.y
        });
        const heights = HeightMap(levelData);
        heights.forEach((height, key) => {
            const comma = key.indexOf(",");
            const pos = screen(Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
            if (height === 0 || !GridBounds.contains(pos.x, pos.y)) {
                return;
            }
            this.heightGraphics
                .lineStyle(0)
                .beginFill(HeightColour(height), selected ? HEIGHT_ALPHA : HEIGHT_UNDERLAY_ALPHA)
                .drawRect(pos.x, pos.y, scaledTileSize, scaledTileSize)
                .endFill();
            if (selected) {
                const text = this.textPool.Get();
                text.text = String(height);
                text.scale.set(state.viewScale);
                text.position.set(pos.x + scaledTileSize * 0.5, pos.y + scaledTileSize * 0.5);
                container.addChild(text);
            }
        });
        if (!selected) {
            return;
        }
        this.heightGraphics.lineStyle(Math.max(1, Math.round(state.viewScale)), BLOCKED_STEP_COLOUR, 0.9, 0.5);
        BlockedEdges(heights).forEach(edge => {
            const from = screen(edge.side === "right" ? edge.x + 1 : edge.x, edge.side === "right" ? edge.y : edge.y + 1);
            const to = edge.side === "right" ? { x: from.x, y: from.y + scaledTileSize } : { x: from.x + scaledTileSize, y: from.y };
            if (GridBounds.contains(from.x, from.y) || GridBounds.contains(to.x, to.y)) {
                this.heightGraphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
            }
        });
    }

    /**
     * Outlines every placement the game derives from tiles' `AssetMetadata`
     * (see `FindImplicitPlacements`, `FindLights` and `FindSpawners` - the same functions
     * `Level` uses, so this is exactly what the game will get): collision, each cell of a door's
     * sprite footprint (labelled with its lock), lit tiles labelled with their
     * range, spawners with their monster count and pickups with their kind. Drawn
     * outlined over a faint fill, so it reads differently from the solid
     * squares of hand-painted data brushes. A lit tile with a painted light on its cell
     * isn't outlined - the painted light takes its place, and has its own square. A painted
     * spawner's square is just its own cell, so the overlay outlines the whole footprint it
     * makes solid too - the tile it turns into a spawner, or the roster's sprite. While an
     * attribute type is active, what isn't that type (doors never are) is drawn faintly.
     */
    private DrawImplicitLayer(levelData: Brush[]): void {
        this.implicitContainer.removeChildren();
        this.implicitGraphics.clear();
        this.implicitContainer.addChild(this.implicitGraphics);
        this.levelContainer.addChild(this.implicitContainer);

        const state = this.editorStore.state;
        const implicitLayer = state.layers.find(layer => layer.id === IMPLICIT_LAYER_ID);
        if (!implicitLayer || !implicitLayer.visible) {
            return;
        }

        /** Each tile layer's place in the drawing order - the game draws them in the same order. */
        const tileLayerOrder = new Map<number, number>();
        state.layers.filter(IsTileLayer).forEach((layer, order) => tileLayerOrder.set(layer.id, order));
        const placements = FindImplicitPlacements(
            levelData,
            layerId => tileLayerOrder.has(layerId),
            name => AssetMetadataStore.inst.Get(name),
            name => AssetFactory.inst.CreateTexture(name),
            TileSize
        );

        const colourOf = (name: string): number => {
            const dataBrush = state.dataBrushes.find(db => db.name === name);
            return dataBrush ? dataBrush.colour : 0xffffff;
        };
        const activeType = ActiveAttributeType(state);
        /** How strongly what stands for the `type` attribute (null: none) is drawn. */
        const strengthOf = (type: string | null): number => (activeType == null || type === activeType ? 1 : OTHER_TYPE_STRENGTH);
        const scaledTileSize = TileSize * state.viewScale;
        const drawn = new Set<string>();
        /** Returns the cell's screen top-left, or null if it's culled (off-grid) or already drawn in this colour. */
        const drawCell = (x: number, y: number, colour: number, strength: number): { x: number; y: number } | null => {
            const posX = (x - state.viewOffset.x) * scaledTileSize + GridBounds.x;
            const posY = (y - state.viewOffset.y) * scaledTileSize + GridBounds.y;
            const key = x + "," + y + "," + colour;
            if (!GridBounds.contains(posX, posY) || drawn.has(key)) {
                return null;
            }
            drawn.add(key);
            this.implicitGraphics
                .lineStyle(1, colour, 0.9 * strength)
                .beginFill(colour, 0.2 * strength)
                .drawRect(posX + 1, posY + 1, scaledTileSize - 2, scaledTileSize - 2)
                .endFill();
            return { x: posX, y: posY };
        };

        /** A tag at the middle of a cell, in the overlay's font - skipped if there's no tag, or the cell is off the grid. */
        const labelCell = (x: number, y: number, tag: string, strength: number): void => {
            if (!tag) {
                return;
            }
            const posX = (x - state.viewOffset.x) * scaledTileSize + GridBounds.x;
            const posY = (y - state.viewOffset.y) * scaledTileSize + GridBounds.y;
            if (!GridBounds.contains(posX, posY)) {
                return;
            }
            const text = this.textPool.Get();
            text.text = tag;
            text.scale.set(state.viewScale);
            text.position.set(posX + scaledTileSize * 0.5, posY + scaledTileSize * 0.5);
            text.alpha = strength;
            this.implicitContainer.addChild(text);
        };

        const collisionColour = colourOf(DataBrushName.COLLISION);
        const collisionStrength = strengthOf(DataBrushName.COLLISION);
        placements.collision.forEach(cell => drawCell(cell.x, cell.y, collisionColour, collisionStrength));
        const doorStrength = strengthOf(null);
        placements.doors.forEach(cell => drawCell(cell.x, cell.y, IMPLICIT_DOOR_COLOUR, doorStrength));
        placements.doorLocks.forEach(door => labelCell(door.x, door.y, MapLabel({ lock: door.lock }), doorStrength));
        const pickupColour = colourOf(DataBrushName.PICKUP);
        const pickupStrength = strengthOf(DataBrushName.PICKUP);
        placements.pickups.forEach(pickup => {
            drawCell(pickup.x, pickup.y, pickupColour, pickupStrength);
            labelCell(pickup.x, pickup.y, MapLabel(pickup.value), pickupStrength);
        });
        const lightColour = colourOf(DataBrushName.LIGHT);
        const lightStrength = strengthOf(DataBrushName.LIGHT);
        FindLights(levelData, layerId => tileLayerOrder.get(layerId), name => AssetMetadataStore.inst.Get(name)).forEach(light => {
            // Labelled once, by the first light on the cell - and not at all where a painted light takes the tiles' place.
            if (!light.brush && drawCell(light.x, light.y, lightColour, lightStrength)) {
                labelCell(light.x, light.y, MapLabel(light.value), lightStrength);
            }
        });
        const spawnerSprite = MonsterRoster.inst.SpawnerSprite;
        const spawnerSize = spawnerSprite && this.assetFactory.Has(spawnerSprite) ? this.assetFactory.CreateTexture(spawnerSprite) : undefined;
        const spawnerColour = colourOf(DataBrushName.SPAWNER);
        const spawnerStrength = strengthOf(DataBrushName.SPAWNER);
        const spawners = FindSpawners(
            levelData,
            layerId => tileLayerOrder.get(layerId),
            name => AssetMetadataStore.inst.Get(name),
            name => (this.assetFactory.Has(name) ? this.assetFactory.CreateTexture(name) : undefined),
            TileSize,
            spawnerSize
        );
        spawners.forEach(spawner => {
            let labelPos: { x: number; y: number } | null = null;
            spawner.cells.forEach(cell => {
                const pos = drawCell(cell.x, cell.y, spawnerColour, spawnerStrength);
                labelPos = labelPos || pos;
            });
            // A painted spawner's own square has its label already.
            if (labelPos && !spawner.brush) {
                const text = this.textPool.Get();
                text.text = spawner.value.monsters.length.toString();
                text.scale.set(state.viewScale);
                text.position.set(labelPos.x + scaledTileSize * 0.5, labelPos.y + scaledTileSize * 0.5);
                text.alpha = spawnerStrength;
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
