import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "@logic-incubator/engine/Constants";
import AssetMetadataStore from "@logic-incubator/engine/level/AssetMetadata";
import { DoorFootprint } from "@logic-incubator/engine/level/Doors";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import { FindSpawners } from "@logic-incubator/engine/level/ImplicitData";
import { Brush, DataBrushName, IsTileLayer } from "@logic-incubator/engine/level/LevelFormat";
import { CellEntriesAt, CellEntry, CellLookups } from "../CellEntries";
import { Layer } from "../stores/LevelDataStore";

/**
 * The footprints and metadata `CellEntriesAt` needs, from the loaded art: a tile covers every cell of its sprite
 * (the same footprint the engine gives a door or a collidable tile - see `DoorFootprint`), and a spawner brush
 * the footprint it makes solid in play - the tile on its cell it turns into the spawner, or the roster's sprite
 * (see `FindSpawners`). A sprite the sheet hasn't got covers just its own cell.
 */
export function EditorCellLookups(levelData: ReadonlyArray<Brush>, layers: ReadonlyArray<Layer>): CellLookups {
    const assets = AssetFactory.inst;
    const tileFootprint = (brush: Brush): Vec2Like[] =>
        assets.Has(brush.name) ? DoorFootprint(brush.position, assets.CreateTexture(brush.name), brush.pixelOffset, TileSize) : [brush.position];

    let tileLayerOrder: Map<number, number> | null = null;
    const dataFootprint = (brush: Brush): ReadonlyArray<Vec2Like> => {
        if (brush.name !== DataBrushName.SPAWNER) {
            return [brush.position];
        }
        if (!tileLayerOrder) {
            const order = new Map<number, number>();
            layers.filter(IsTileLayer).forEach((layer, index) => order.set(layer.id, index));
            tileLayerOrder = order;
        }
        const tileOrder = tileLayerOrder;
        const { x, y } = brush.position;
        const tilesHere = levelData.filter(b => b.position.x === x && b.position.y === y && tileOrder.has(b.layerId));
        const sprite = MonsterRoster.inst.SpawnerSprite;
        const [spawner] = FindSpawners(
            tilesHere.concat([brush]),
            layerId => tileOrder.get(layerId),
            name => AssetMetadataStore.inst.Get(name),
            name => (assets.Has(name) ? assets.CreateTexture(name) : undefined),
            TileSize,
            sprite && assets.Has(sprite) ? assets.CreateTexture(sprite) : undefined
        );
        return spawner ? spawner.cells : [brush.position];
    };

    return { tileFootprint, dataFootprint, metaFor: name => AssetMetadataStore.inst.Get(name) };
}

/** Everything on `cell` of the level being edited (see `CellEntriesAt`). */
export function EditorCellEntries(levelData: ReadonlyArray<Brush>, layers: ReadonlyArray<Layer>, cell: Vec2Like): CellEntry[] {
    return CellEntriesAt(levelData, layers, cell, EditorCellLookups(levelData, layers));
}
