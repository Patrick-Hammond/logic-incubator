import {AnimatedSprite, Texture} from "pixi.js";
import Game from "@logic-incubator/lib/game/Game";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import {Rectangle, Vec2Like} from "@logic-incubator/lib/math/Geometry";
import { AnimationSpeed, TileSize } from "../Constants";
import {LEVEL_LOADED} from "../Events";
import AssetMetadataStore from "./AssetMetadata";
import {HeightAt} from "./Depth";
import {EffectiveDoorLock, FindDoorGroups} from "./Doors";
import MonsterRoster from "./entities/MonsterRoster";
import {IsPickupValue, PickupValue} from "./entities/Pickups";
import {SanitiseSpawnerValue, Spawner, SpawnerCells} from "./entities/Spawners";
import {EffectiveLight, FindImplicitPlacements} from "./ImplicitData";
import {Brush, DataBrushName, LevelFile, LevelLayer} from "./LevelFormat";
import {AmbientLightGrid, BakeLights, ComposeLighting, LightBake, LightBlockersFor, LightGrid, LightSource, OpenLightBlockers} from "./Lighting";
import {FindMapBounds} from "./MapBounds";
import {FindRegions, Region, RegionIdsTouching} from "./Regions";
import SceneLights, {MovingLight} from "./SceneLights";

export type Tile = Brush & {
    texture: Texture;
    /** Set for tiles painted with an animated brush; `TileMapView` reads its live `.texture` each render instead of `texture`. */
    anim?: AnimatedSprite;
    /** Set for a tile that gives off light (see `ImplicitData.EffectiveLight`): which of the level's baked lights is its own - see `SceneLights`. */
    light?: number;
};

/** One door: the cell(s) whose tile has a `door` id in its `AssetMetadata`, and the visual tile whose texture is swapped between `closedSprite`/`openSprite` (that door's own pair, resolved via `AssetMetadataStore.GetDoorPartner`) when the player overlaps any of them - if they hold a key for it. `lockId` is what that key has to match (see `EffectiveDoorLock`, `Keys.CanOpen`). `regionIds` is the (possibly empty) set of regions this door borders - see `Regions.ts`. */
export type Door = { cells: Vec2Like[]; tile: Tile; isOpen: boolean; regionIds: number[]; openSprite: string; closedSprite: string; lockId: number };

/** One pickup: a cell, what it gives, and the tile that stands for it (null for a `PICKUP` brush on an empty cell - collected the same, just nothing to hide) - see `CollectPickupsAt`. */
export type Pickup = Vec2Like & { tile: Tile | null; value: PickupValue };

/** What `CollectPickupsAt` hands back: the pickup's value, and the name of the tile it was (null if it had none) - an item or key with no sprite of its own is shown as that. */
export type CollectedPickup = { value: PickupValue; sprite: string | null };

/** Returns null (after a one-off warning) for a brush whose name isn't in the sprite sheet, so one bad name drops just its own tiles instead of throwing out of the whole level load. */
function CreateTile(brush: Brush): Tile | null {
    if (!AssetFactory.inst.Has(brush.name)) {
        AssetFactory.inst.WarnMissing(brush.name);
        return null;
    }
    if (AssetFactory.inst.IsAnimation(brush.name)) {
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
    public tileLayers: LevelLayer[] = [];
    /** Per-cell collision: `true` if any tile placed there has `collidable: true` in `AssetMetadata`, or the cell was painted with the `COLLISION` data brush (an explicit override/addition on top of the intrinsic default). */
    public collisionData: boolean[][] = [];
    /** Per-cell height painted with the `Z_INDEX` data brush. */
    public heightData: number[][] = [];
    /** Light at every tile corner, baked from point lights - both the `LIGHT` data brush and any placed tile with `light` in its `AssetMetadata` - with walls casting shadows (see `Lighting.ComposeLighting`; read it with `CellCornerLight`/`SampleLight`/`FootLight`). */
    public lightGrid: LightGrid = AmbientLightGrid(0, 0);
    /** What `lightGrid` was built from: each light's shadowed reach and the corners' ambient occlusion. Rebuild the grid from it with `ComposeLighting` to change a light's strength without casting its rays again. */
    public lightBake: LightBake = BakeLights([], OpenLightBlockers(0, 0));
    /** Keeps `lightGrid` up to date from frame to frame - flicker, lights switched off, lights that move. See `UpdateLights`. */
    public lights: SceneLights = new SceneLights(this.lightBake, this.lightGrid);
    /** Per-cell flag: `true` if the cell is covered by the sprite footprint (see `DoorFootprint`) of a tile with a `door` id in its `AssetMetadata`. Purely a lookup for building `doors` - not consulted for movement collision, since a door must be walkable to trigger open (see `IsDoorClosed` for what keeps monsters out). */
    public doorData: boolean[][] = [];
    /** One entry per connected island of `doorData` cells that has a matching door sprite tile (see `FindDoorTile`). */
    public doors: Door[] = [];
    /** [x][y] -> the door covering that cell - `doors`, by cell, for `IsDoorClosed`. */
    private doorAt: Door[][] = [];
    /** Goes up each time a door opens or closes, so anything worked out from which doors are closed (the monsters' flow field) can tell it's gone stale. */
    public doorVersion = 0;
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
    /** Every cell painted with the `SPAWNER` data brush, in normalised map coordinates. Each one's `cells` - the footprint of the roster's `spawnerSprite` - are solid (in `collisionData`) until `RemoveSpawner`. */
    public spawners: Spawner[] = [];
    /** Every tile with a `pickup` in its `AssetMetadata`, not yet collected. See `CollectPickupsAt`. */
    public pickups: Pickup[] = [];
    /** Distinct painted `Z_INDEX` heights, ascending, always including the unpainted default (0). `TileMapView` builds one band per entry - sparse, so a stray tile at an extreme height doesn't force bands for every height in between. */
    public depths: number[] = [0];

    /** Rebuilds `lightGrid` for this moment: baked lights flicker (`time` is in seconds) and `moving` ones are cast where they are now. Call once a frame, before the level is drawn - see `SceneLights.Update`. */
    UpdateLights(time: number, moving: ReadonlyArray<MovingLight>): void {
        this.lights.Update(time, moving);
    }

    /** Height painted under the given grid cell (0 if unpainted). Drives the camera zoom. */
    HeightAt(tileX: number, tileY: number): number {
        return HeightAt(this.heightData, tileX, tileY);
    }

    /** Whether nothing can move into the given cell - a wall, a spawner or anywhere off the map. */
    IsSolid(tileX: number, tileY: number): boolean {
        if (tileX < 0 || tileY < 0 || tileX >= this.boundRect.width || tileY >= this.boundRect.height) {
            return true;
        }
        const column = this.collisionData[tileX];
        return !!(column && column[tileY]);
    }

    /**
     * Whether the cell belongs to a door that's closed right now. Not part of `IsSolid`, as the player
     * has to be able to walk onto a closed door - that's what opens it - but monsters can't enter one
     * (their path and their movement both stop at it, see `Encounter`), so nothing gets through a door
     * the player isn't standing in. A cell of a door that has no sprite pair to swap (so never opens) isn't
     * in `doors`, and doesn't count: there'd be no way to ever open it.
     */
    IsDoorClosed(tileX: number, tileY: number): boolean {
        const column = this.doorAt[tileX];
        const door = column && column[tileY];
        return !!door && !door.isOpen;
    }

    /**
     * Whether the cell is a closed door the player can't open - `canOpen` is whether a given lock
     * opens for them (see `Keys.CanOpen`: it's unlocked, or they hold its key). Their collider treats
     * it as solid, so a locked door is a wall to them; a closed door that opens for them isn't (they
     * walk onto it to open it).
     */
    IsDoorLocked(tileX: number, tileY: number, canOpen: (lockId: number) => boolean): boolean {
        const column = this.doorAt[tileX];
        const door = column && column[tileY];
        return !!door && !door.isOpen && !canOpen(door.lockId);
    }

    /**
     * Opens up a destroyed spawner's cells: no longer solid, and each one joined to a region
     * it borders - without that, the player standing there would be in no region at all, and
     * `UpdateVisibleRegions` would hide everything but open doors.
     */
    RemoveSpawner(spawner: Spawner): void {
        spawner.cells.forEach(({x, y}) => {
            if (this.collisionData[ x ]) {
                this.collisionData[ x ][ y ] = false;
            }
            const touching = this.boundaryRegionData[ x ]?.[ y ];
            if (touching && touching.length) {
                if (this.regionData[ x ] == null) {
                    this.regionData[ x ] = [];
                }
                this.regionData[ x ][ y ] = touching[ 0 ];
                this.regions[ touching[ 0 ] ]?.cells.push({x, y});
                delete this.boundaryRegionData[ x ][ y ];
            }
        });

        const index = this.spawners.indexOf(spawner);
        if (index > -1) {
            this.spawners.splice(index, 1);
        }
    }

    /**
     * Collects every pickup at the given cell (call once per frame with the
     * player's tile, like `UpdateDoors`): each one's tile stops drawing and it
     * won't be offered again. Returns what was collected, for the caller to
     * apply - `Level` itself has no notion of a player's gold/inventory/weapons.
     */
    CollectPickupsAt(tileX: number, tileY: number): CollectedPickup[] {
        const here = this.pickups.filter(p => p.x === tileX && p.y === tileY);
        here.forEach(pickup => {
            this.levelData.forEach(layer => {
                const stack = layer[pickup.x] && layer[pickup.x][pickup.y];
                const index = stack && pickup.tile ? stack.indexOf(pickup.tile) : -1;
                if (index > -1) {
                    stack.splice(index, 1);
                }
            });
            this.pickups.splice(this.pickups.indexOf(pickup), 1);
            // A lit pickup - a torch on the floor - takes its light with it.
            if (pickup.tile && pickup.tile.light !== undefined) {
                this.lights.SetOn(pickup.tile.light, false);
            }
        });
        return here.map(p => ({ value: p.value, sprite: p.tile ? p.tile.name : null }));
    }

    /**
     * Opens/closes doors whose footprint contains the given tile - call once per
     * frame with the tile the player currently occupies (e.g. `Player`'s own
     * `HeightAt` lookup tile). A door swaps open the instant the player's tile
     * enters any of its cells and swaps closed the instant it leaves all of
     * them, so it reads as "walked open" - but only for a player `canOpen` (the door's
     * `lockId` is `NoLock`, or they hold its key; with none given every door opens). A
     * door they can't open stays shut, and `IsDoorLocked` is what keeps them out of it.
     */
    UpdateDoors(tileX: number, tileY: number, canOpen: (lockId: number) => boolean = () => true): void {
        this.doors.forEach(door => {
            const overlapping = door.cells.some(c => c.x === tileX && c.y === tileY) && canOpen(door.lockId);
            if (overlapping !== door.isOpen) {
                door.isOpen = overlapping;
                door.tile.texture = AssetFactory.inst.CreateTexture(overlapping ? door.openSprite : door.closedSprite);
                this.doorVersion++;
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

    /** Finds the door leaf tile (whichever sprite variant is currently painted, of whichever door type) among the given cells, searching every tile layer. */
    private FindDoorTile(cells: Vec2Like[]): Tile | null {
        for (const cell of cells) {
            for (const layer of this.levelData) {
                const stack = layer && layer[ cell.x ] && layer[ cell.x ][ cell.y ];
                const found = stack && stack.find(t => AssetMetadataStore.inst.Get(t.name)?.door != null);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    /** The tile drawn on top at the given cell - the last layer with one there, its last-painted tile - or null for an empty cell. What a `PICKUP` brush turns into a pickup. */
    private FindTopTile(x: number, y: number): Tile | null {
        for (let i = this.levelData.length - 1; i >= 0; i--) {
            const layer = this.levelData[i];
            const stack = layer && layer[x] && layer[x][y];
            if (stack && stack.length) {
                return stack[stack.length - 1];
            }
        }
        return null;
    }

    /** Finds the tile that is a pickup at the given cell - by its asset's `AssetMetadata`, or by its own placement's `data` - searching every tile layer. Null if none is. */
    private FindPickupTile(x: number, y: number): Tile | null {
        for (const layer of this.levelData) {
            const stack = layer && layer[x] && layer[x][y];
            const found = stack && stack.find(t => AssetMetadataStore.inst.Get(t.name)?.pickup != null || IsPickupValue(t.data));
            if (found) {
                return found;
            }
        }
        return null;
    }

    /** Finds a tile at the given cell that gives off light and isn't yet matched to one of the baked lights, searching every tile layer. Null if there's none. */
    private FindLightTile(x: number, y: number): Tile | null {
        for (const layer of this.levelData) {
            const stack = layer && layer[x] && layer[x][y];
            const found = stack && stack.find(t => t.light === undefined && EffectiveLight(t, AssetMetadataStore.inst.Get(t.name)) !== undefined);
            if (found) {
                return found;
            }
        }
        return null;
    }

    /** Stops animated tiles' sprites so reloading a level (or dropping it, when the scene is destroyed) doesn't leave them ticking in the background forever. */
    Dispose(): void {
        this.levelData.forEach(layer =>
            layer.forEach(column =>
                column && column.forEach(cell => cell && cell.forEach(tile => tile.anim && tile.anim.stop()))
            )
        );
    }

    LoadLevel(file: LevelFile): void {

        this.Dispose();

        this.tileLayers = [];
        this.collisionData = [];
        this.heightData = [];
        this.doorData = [];
        this.doorAt = [];
        this.spawners = [];
        this.pickups = [];
        const spawnerSprite = MonsterRoster.inst.SpawnerSprite;
        const hasSpawnerSprite = spawnerSprite != null && AssetFactory.inst.Has(spawnerSprite);
        if (spawnerSprite != null && !hasSpawnerSprite) {
            AssetFactory.inst.WarnMissing(spawnerSprite);
        }
        const spawnerSize = hasSpawnerSprite ? AssetFactory.inst.CreateTexture(spawnerSprite) : undefined;
        const depths = new Set<number>([0]);
        const lights: LightSource[] = [];
        /** Every `PICKUP` data brush, in normalised map coordinates - resolved against the tiles once they're built, below. */
        const explicitPickups: { x: number; y: number; value: PickupValue }[] = [];
        /** Per-cell door id (parallel to `doorData`, but tagged with *which* door type) - `FindDoorGroups` needs this to keep two different door types on adjacent cells from merging into one group. */
        const doorIds: (number | undefined)[][] = [];

        const idMap: {[ id: number ]: number} = {};
        let id = 0;
        file.editorData.layers.forEach(layer => {
            if(!layer.isData) {
                this.tileLayers[ id ] = layer;
                idMap[ layer.id ] = id;
                id++;
            }
        });

        const levelData = file.levelData.levelData;

        // find map bounds
        const bounds = FindMapBounds(levelData);

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
                        this.heightData[ posX ][ posY ] = brush.data as number;
                        depths.add(brush.data as number);
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
                const tile = CreateTile(brush);
                if(!tile) {
                    return;
                }
                if(this.levelData[ index ][ posX ] == null) {
                    this.levelData[ index ][ posX ] = [];
                }
                if(this.levelData[ index ][ posX ][ posY ] == null) {
                    this.levelData[ index ][ posX ][ posY ] = [];
                }

                this.levelData[ index ][ posX ][ posY ].push(tile);
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
                        this.heightData[ posX ][ posY ] = brush.data as number;
                        depths.add(brush.data as number);
                        break;
                    case DataBrushName.PICKUP:
                        // A brush saved without a (valid) value is no pickup, rather than one that gives nothing.
                        if(IsPickupValue(brush.data)) {
                            explicitPickups.push({x: posX, y: posY, value: brush.data});
                        }
                        break;
                }
            }
        });

        // Intrinsic defaults from tiles' own AssetMetadata (collision, door footprints, lights,
        // spawners) - the same list the editor's read-only implicit layer draws. Lights/spawners
        // layer on top of the explicit COLLISION/Z_INDEX brushes above rather than overwriting them;
        // a tile's own placement can override its own light/spawner (see `ImplicitData.EffectiveLight`/
        // `EffectiveSpawner`), so there's nothing left here to take precedence over.
        const implicit = FindImplicitPlacements(
            levelData,
            layerId => idMap[ layerId ] != null,
            name => AssetMetadataStore.inst.Get(name),
            name => AssetFactory.inst.CreateTexture(name),
            TileSize
        );
        implicit.collision.forEach(({x, y}) => {
            const posX = x - bounds.x1;
            const posY = y - bounds.y1;
            // A collidable sprite's footprint nudged past the map's top/left edge - nothing to mark there.
            if (posX < 0 || posY < 0) {
                return;
            }
            if(this.collisionData[ posX ] == null) {
                this.collisionData[ posX ] = [];
            }
            this.collisionData[ posX ][ posY ] = true;
        });
        // What stops light: walls and painted collision, before spawners add theirs below - a spawner is destroyed
        // in play and the light is baked once, so it would leave its shadow behind. A tile's `blocksLight` has the last word.
        const lightBlockers = LightBlockersFor(
            this.boundRect.width,
            this.boundRect.height,
            (x, y) => !!(this.collisionData[ x ] && this.collisionData[ x ][ y ]),
            (x, y) => this.HeightAt(x, y),
            implicit.lightBlocks.map(({x, y, blocks}) => ({x: x - bounds.x1, y: y - bounds.y1, blocks}))
        );
        implicit.doors.forEach(({x, y, id: doorId}) => {
            const posX = x - bounds.x1;
            const posY = y - bounds.y1;
            // A door sprite nudged past the map's top/left edge - nothing to mark there.
            if (posX < 0 || posY < 0) {
                return;
            }
            if(this.doorData[ posX ] == null) {
                this.doorData[ posX ] = [];
            }
            this.doorData[ posX ][ posY ] = true;
            if(doorIds[ posX ] == null) {
                doorIds[ posX ] = [];
            }
            doorIds[ posX ][ posY ] = doorId;
        });
        implicit.lights.forEach(({x, y, value}) => lights.push({x: x - bounds.x1, y: y - bounds.y1, value}));
        implicit.spawners.forEach(({x, y, value}) => {
            const posX = x - bounds.x1;
            const posY = y - bounds.y1;
            const cells = SpawnerCells({x: posX, y: posY}, spawnerSize, TileSize);
            this.spawners.push({x: posX, y: posY, value: SanitiseSpawnerValue(value), cells});
            cells.forEach(cell => {
                if(this.collisionData[ cell.x ] == null) {
                    this.collisionData[ cell.x ] = [];
                }
                this.collisionData[ cell.x ][ cell.y ] = true;
            });
        });
        // Resolved against `this.levelData` (built above) rather than carried through `FindImplicitPlacements`
        // itself, since collecting a pickup needs the actual `Tile` object to remove from its layer stack.
        const pickupsByCell = new Map<string, Pickup>();
        implicit.pickups.forEach(({x, y, value}) => {
            const posX = x - bounds.x1;
            const posY = y - bounds.y1;
            if (posX < 0 || posY < 0) {
                return;
            }
            const tile = this.FindPickupTile(posX, posY);
            if (tile) {
                pickupsByCell.set(posX + "," + posY, {x: posX, y: posY, tile, value});
            }
        });
        // A PICKUP brush decides what its cell gives, over whatever the tile there would on its own.
        explicitPickups.forEach(({x, y, value}) => {
            if (x >= 0 && y >= 0) {
                pickupsByCell.set(x + "," + y, {x, y, tile: this.FindTopTile(x, y), value});
            }
        });
        pickupsByCell.forEach(pickup => this.pickups.push(pickup));

        this.depths = Array.from(depths).sort((a, b) => a - b);

        this.lightBake = BakeLights(lights, lightBlockers);
        this.lightGrid = ComposeLighting(this.lightBake);
        this.lights = new SceneLights(this.lightBake, this.lightGrid);
        lights.forEach((light, i) => {
            const tile = this.FindLightTile(light.x, light.y);
            if (tile) {
                tile.light = i;
            }
        });

        const regionMap = FindRegions(this.collisionData, this.doorData, this.boundRect.width, this.boundRect.height);
        this.regionData = regionMap.regionData;
        this.boundaryRegionData = regionMap.boundaryRegionData;
        this.regions = regionMap.regions;

        this.doors = FindDoorGroups(doorIds)
            .map(cells => {
                const tile = this.FindDoorTile(cells);
                const doorValue = tile && AssetMetadataStore.inst.Get(tile.name)?.door;
                if (!tile || !doorValue) {
                    return null;
                }
                // Resolved once here, not per-frame - `UpdateDoors` (called every tick) just reads
                // these back rather than re-scanning AssetMetadata for this door's pair each time.
                const partner = AssetMetadataStore.inst.GetDoorPartner(tile.name);
                const openSprite = doorValue.open ? tile.name : partner;
                const closedSprite = doorValue.open ? partner : tile.name;
                if (!openSprite || !closedSprite) {
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
                const lockId = EffectiveDoorLock(tile, AssetMetadataStore.inst.Get(tile.name));
                return {cells, tile, isOpen: doorValue.open, regionIds, openSprite, closedSprite, lockId};
            })
            .filter((door): door is Door => door != null);
        this.doors.forEach(door => door.cells.forEach(cell => {
            if (this.doorAt[ cell.x ] == null) {
                this.doorAt[ cell.x ] = [];
            }
            this.doorAt[ cell.x ][ cell.y ] = door;
        }));

        // No PLAYER_START brush painted - land the player in the middle of the map rather than fail
        // the whole level over one missing marker. Center of `boundRect`, not of the painted extent's
        // raw bounds, since boundRect is already normalised to a zero origin like everything above.
        if (!this.playerStartPosition) {
            this.playerStartPosition = { x: Math.floor(this.boundRect.width / 2), y: Math.floor(this.boundRect.height / 2) };
        }

        this.UpdateVisibleRegions(this.playerStartPosition.x, this.playerStartPosition.y);

        Game.inst.dispatcher.emit(LEVEL_LOADED);
    }
}
