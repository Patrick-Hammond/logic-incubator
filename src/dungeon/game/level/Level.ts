import {AnimatedSprite, Texture} from "pixi.js";
import Game from "../../../_lib/game/Game";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import {Rectangle, Vec2Like} from "../../../_lib/math/Geometry";
import {AnimationSpeed} from "../../Constants";
import {DataBrushName, IEditorState} from "../../editor/stores/EditorStore";
import {Layer} from "../../editor/stores/LevelDataStore";
import {LEVEL_LOADED} from "../Events";
import {HeightAt} from "./Depth";
import {FindDoorGroups} from "./Doors";
import {FindRegions, Region, RegionIdsTouching} from "./Regions";

/** Sprite names swapped by `Level.UpdateDoors` - the closed leaf is what's painted in the editor, the open one only ever appears at runtime. */
const DOOR_CLOSED_SPRITE = "doors_leaf_closed";
const DOOR_OPEN_SPRITE = "doors_leaf_open";

type Brush = {
    name: string;
    position: Vec2Like;
    pixelOffset: Vec2Like;
    rotation: number;
    scale: Vec2Like;
    layerId: number;
    data: number;
};

export type Tile = Brush & {
    texture: Texture;
    /** Set for tiles painted with an animated brush; `TileMapView` reads its live `.texture` each render instead of `texture`. */
    anim?: AnimatedSprite;
};

/** One door: the cells painted with the `DOOR` data brush, and the visual tile whose texture is swapped when the player overlaps any of them. `regionIds` is the (possibly empty) set of regions this door borders - see `Regions.ts`. */
export type Door = { cells: Vec2Like[]; tile: Tile; isOpen: boolean; regionIds: number[] };

function CreateTile(brush: Brush): Tile {
    if (AssetFactory.inst.AnimationNames.indexOf(brush.name) > -1) {
        const anim = AssetFactory.inst.CreateAnimatedSprite(brush.name);
        anim.animationSpeed = AnimationSpeed;
        // Random start frame so identical brushes (e.g. several torches) don't all pulse in lockstep.
        anim.gotoAndPlay((Math.random() * anim.totalFrames) | 0);
        return {...brush, texture: anim.texture, anim};
    }
    return {...brush, texture: AssetFactory.inst.CreateTexture(brush.name)};
}

export default class Level {
    /** [layer][x][y] -> every tile painted at that cell, in paint order (later = drawn on top). */
    public levelData: Tile[][][][] = [];
    public tileLayers: Layer[] = [];
    public collisionData: boolean[][] = [];
    /** Per-cell height painted with the `Z_INDEX` (DepthBrushName) data brush. */
    public heightData: number[][] = [];
    /** Per-cell flag painted with the `DOOR` data brush. Purely a lookup for building `doors` - not consulted for movement collision, since a door must be walkable to trigger open. */
    public doorData: boolean[][] = [];
    /** One entry per connected island of `doorData` cells that has a matching door sprite tile (see `FindDoorTile`). */
    public doors: Door[] = [];
    /** [x][y] -> region id for a walkable (non-collision, non-door) cell. See `Regions.ts`. */
    public regionData: number[][] = [];
    /** [x][y] -> distinct region ids touching a wall/door cell's 4-neighbours. See `Regions.ts`. */
    public boundaryRegionData: number[][][] = [];
    /** One entry per connected walkable component of the map. */
    public regions: Region[] = [];
    /** Regions currently reachable from the player: their own region, plus any reachable through a door that is open right now. Fully dynamic - closing a door conceals what's only reachable through it again. Recomputed every frame by `UpdateVisibleRegions`. */
    public visibleRegions: Set<number> = new Set<number>();
    public boundRect: Rectangle = new Rectangle();
    public playerStartPosition: Vec2Like | undefined;
    /** Distinct painted `Z_INDEX` heights, ascending, always including the unpainted default (0). `TileMapView` builds one band per entry - sparse, so a stray tile at an extreme height doesn't force bands for every height in between. */
    public depths: number[] = [0];

    /** Height painted under the given grid cell (0 if unpainted). Drives the camera zoom. */
    HeightAt(tileX: number, tileY: number): number {
        return HeightAt(this.heightData, tileX, tileY);
    }

    /**
     * Opens/closes doors whose footprint contains the given tile - call once per
     * frame with the tile the player currently occupies (e.g. `Player`'s own
     * `HeightAt` lookup tile). A door swaps open the instant the player's tile
     * enters any of its cells and swaps closed the instant it leaves all of
     * them; nothing here blocks movement, so it always reads as "walked open".
     */
    UpdateDoors(tileX: number, tileY: number): void {
        this.doors.forEach(door => {
            const overlapping = door.cells.some(c => c.x === tileX && c.y === tileY);
            if (overlapping !== door.isOpen) {
                door.isOpen = overlapping;
                door.tile.texture = AssetFactory.inst.CreateTexture(overlapping ? DOOR_OPEN_SPRITE : DOOR_CLOSED_SPRITE);
            }
        });
    }

    /**
     * Recomputes which regions are currently reachable from the player: their
     * own region, plus every region reachable by crossing a door that is open
     * right now, chained through any number of simultaneously-open doors.
     * Call once per frame, after `UpdateDoors` (this frame's door states must
     * already be current). If the player's own tile has no region - they're
     * standing on a door cell, the common case while transiting one, since
     * door cells are deliberately excluded from the region flood fill - seed
     * from that door's own `regionIds` instead (its `isOpen` was just synced
     * by `UpdateDoors` for this exact tile, one line above the call site).
     */
    UpdateVisibleRegions(tileX: number, tileY: number): void {
        const active = new Set<number>();

        const column = this.regionData[tileX];
        const ownRegion = column ? column[tileY] : undefined;
        if (ownRegion !== undefined) {
            active.add(ownRegion);
        } else {
            this.doors.forEach(door => {
                if (door.isOpen) {
                    door.regionIds.forEach(id => active.add(id));
                }
            });
        }

        let expanded = true;
        while (expanded) {
            expanded = false;
            this.doors.forEach(door => {
                if (!door.isOpen || !door.regionIds.some(id => active.has(id))) {
                    return;
                }
                door.regionIds.forEach(id => {
                    if (!active.has(id)) {
                        active.add(id);
                        expanded = true;
                    }
                });
            });
        }

        this.visibleRegions = active;
    }

    /** Whether the given cell should currently be drawn: an open-floor cell is visible iff its own region is active, a wall/door cell is visible iff any region it touches is active. */
    IsCellVisible(tileX: number, tileY: number): boolean {
        const column = this.regionData[tileX];
        const regionId = column ? column[tileY] : undefined;
        if (regionId !== undefined) {
            return this.visibleRegions.has(regionId);
        }

        const boundaryColumn = this.boundaryRegionData[tileX];
        const touching = boundaryColumn && boundaryColumn[tileY];
        if (!touching) {
            return false;
        }
        for (let i = 0; i < touching.length; i++) {
            if (this.visibleRegions.has(touching[i])) {
                return true;
            }
        }
        return false;
    }

    /** Finds the door leaf tile (whichever sprite variant is currently painted) among the given cells, searching every tile layer. */
    private FindDoorTile(cells: Vec2Like[]): Tile | null {
        for (const cell of cells) {
            for (const layer of this.levelData) {
                const stack = layer && layer[ cell.x ] && layer[ cell.x ][ cell.y ];
                const found = stack && stack.find(t => t.name === DOOR_CLOSED_SPRITE || t.name === DOOR_OPEN_SPRITE);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    /** Stops animated tiles' sprites so reloading a level doesn't leave them ticking in the background forever. */
    private DisposeTiles(): void {
        this.levelData.forEach(layer =>
            layer.forEach(column =>
                column && column.forEach(cell => cell && cell.forEach(tile => tile.anim && tile.anim.stop()))
            )
        );
    }

    LoadEditorData(editorLevelData: {editorData: IEditorState, levelData: Brush[]}): void {

        this.DisposeTiles();

        this.tileLayers = [];
        this.collisionData = [];
        this.heightData = [];
        this.doorData = [];
        const depths = new Set<number>([0]);

        const idMap: {[ id: number ]: number} = {};
        let id = 0;
        editorLevelData.editorData.layers.forEach(layer => {
            if(!layer.isData) {
                this.tileLayers[ id ] = layer;
                idMap[ layer.id ] = id;
                id++;
            }
        });

        const levelData = editorLevelData.levelData["levelData"];

        // find map bounds
        const bounds = {x1: Number.MAX_VALUE, y1: Number.MAX_VALUE, x2: Number.MIN_VALUE, y2: Number.MIN_VALUE};
        levelData.forEach(brush => {
            bounds.x1 = Math.min(bounds.x1, brush.position.x);
            bounds.y1 = Math.min(bounds.y1, brush.position.y);
            bounds.x2 = Math.max(bounds.x2, brush.position.x);
            bounds.y2 = Math.max(bounds.y2, brush.position.y);
        });

        // normalise origin to zero
        this.boundRect = new Rectangle(0, 0, bounds.x2 - bounds.x1 + 2, bounds.y2 - bounds.y1 + 2);

        // parse data layers
        levelData.forEach(brush => {
            if(!idMap[ brush.layerId ]) {
                const posX = brush.position.x - bounds.x1;
                const posY = brush.position.y - bounds.y1;

                switch(brush.name) {
                    case DataBrushName.PLAYER_START:
                        this.playerStartPosition = {x: posX, y: posY};
                        break;
                    case DataBrushName.COLLISION:
                        if(this.collisionData[ posX ] == null) {
                            this.collisionData[ posX ] = [];
                        }
                        this.collisionData[ posX ][ posY ] = true;
                        break;
                    case DataBrushName.Z_INDEX:
                        if(this.heightData[ posX ] == null) {
                            this.heightData[ posX ] = [];
                        }
                        this.heightData[ posX ][ posY ] = brush.data;
                        depths.add(brush.data);
                        break;
                    case DataBrushName.DOOR:
                        if(this.doorData[ posX ] == null) {
                            this.doorData[ posX ] = [];
                        }
                        this.doorData[ posX ][ posY ] = true;
                        break;
                }
            }
        });

        this.tileLayers.forEach(layer => this.levelData[ idMap[ layer.id ] ] = []);

        // parse tile data
        levelData.forEach(brush => {

            const index = idMap[ brush.layerId ];
            const posX = brush.position.x - bounds.x1;
            const posY = brush.position.y - bounds.y1;

            if(index != null) {
                if(this.levelData[ index ][ posX ] == null) {
                    this.levelData[ index ][ posX ] = [];
                }
                if(this.levelData[ index ][ posX ][ posY ] == null) {
                    this.levelData[ index ][ posX ][ posY ] = [];
                }

                this.levelData[ index ][ posX ][ posY ].push(CreateTile(brush));
            } else {
                switch(brush.name) {
                    case DataBrushName.PLAYER_START:
                        this.playerStartPosition = {x: posX, y: posY};
                        break;
                    case DataBrushName.COLLISION:
                        if(this.collisionData[ posX ] == null) {
                            this.collisionData[ posX ] = [];
                        }
                        this.collisionData[ posX ][ posY ] = true;
                        break;
                    case DataBrushName.Z_INDEX:
                        if(this.heightData[ posX ] == null) {
                            this.heightData[ posX ] = [];
                        }
                        this.heightData[ posX ][ posY ] = brush.data;
                        depths.add(brush.data);
                        break;
                    case DataBrushName.DOOR:
                        if(this.doorData[ posX ] == null) {
                            this.doorData[ posX ] = [];
                        }
                        this.doorData[ posX ][ posY ] = true;
                        break;
                }
            }
        });

        this.depths = Array.from(depths).sort((a, b) => a - b);

        const regionMap = FindRegions(this.collisionData, this.doorData, this.boundRect.width, this.boundRect.height);
        this.regionData = regionMap.regionData;
        this.boundaryRegionData = regionMap.boundaryRegionData;
        this.regions = regionMap.regions;

        this.doors = FindDoorGroups(this.doorData)
            .map(cells => {
                const tile = this.FindDoorTile(cells);
                if (!tile) {
                    return null;
                }
                // A door's cells are one visibility unit regardless of which
                // cell its sprite happens to anchor on - a door painted more
                // than one cell deep would otherwise have each cell only see
                // ITS OWN side, and the sprite could vanish depending on
                // which row it's anchored to (see Regions.ts's RegionIdsTouching doc).
                const regionIds = RegionIdsTouching(this.boundaryRegionData, cells);
                cells.forEach(c => {
                    if (this.boundaryRegionData[ c.x ] == null) {
                        this.boundaryRegionData[ c.x ] = [];
                    }
                    this.boundaryRegionData[ c.x ][ c.y ] = regionIds;
                });
                return {cells, tile, isOpen: tile.name === DOOR_OPEN_SPRITE, regionIds};
            })
            .filter((door): door is Door => door != null);

        if (!this.playerStartPosition) {
            throw new Error("Player start position is not defined. Define it in the level data.");
        }

        this.UpdateVisibleRegions(this.playerStartPosition.x, this.playerStartPosition.y);

        Game.inst.dispatcher.emit(LEVEL_LOADED);
    }
}
