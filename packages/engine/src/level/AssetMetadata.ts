/**
 * Per-asset-name defaults for tile behaviour that would otherwise have to be
 * hand-painted on a data layer every time that sprite is placed - a wall's
 * collision, a door's door-ness, a torch's light, a marker's spawner, a gold
 * sack's pickup. Each asset bundle's `assets-meta.json` is added as the bundle
 * loads and removed as it unloads (see `AssetMetadataBinding`), and consulted by
 * `Level.LoadLevel` when building `collisionData`/`doorData`/the light, spawner
 * and pickup lists, so painting a torch, a spawner marker or a gold sack tile is
 * enough on its own; a specific placement can still override its light or
 * spawner value (see `ImplicitData.EffectiveLight`/`EffectiveSpawner`), and an
 * explicit `COLLISION` brush at the same cell still adds to a tile's own
 * collision for one-off cases.
 *
 * Names are bare (what level files store), looked up in the asset scope: the
 * level's bundle first, then `global` - so a level can restyle a tile without
 * the level data changing.
 */

import { PickupValue } from "./entities/Pickups";
import { SpawnerValue } from "./entities/Spawners";
import { IsCompleteLightValue, LightValue } from "./Lighting";

/** `id` pairs a door's two sprites (e.g. a wooden door's closed/open leaf) so multiple door types can coexist - `open` says which half of the pair this particular asset is. */
export type DoorValue = { id: number; open: boolean };

export type AssetMetadata = {
    collidable?: boolean;
    door?: DoorValue;
    light?: LightValue;
    spawner?: SpawnerValue;
    /** What the player gets for walking over this tile - it then disappears (see `Level.CollectPickupsAt`). */
    pickup?: PickupValue;
};

export type AssetMetadataMap = { [assetName: string]: AssetMetadata };

/** The bucket `Load` fills: metadata that belongs to no bundle, always searched after the scope's. */
const Unscoped = "";

export default class AssetMetadataStore {
    private static _inst: AssetMetadataStore;
    static get inst(): AssetMetadataStore {
        if (!AssetMetadataStore._inst) {
            AssetMetadataStore._inst = new AssetMetadataStore();
        }
        return AssetMetadataStore._inst;
    }

    /** Forgets the shared instance and the metadata it was loaded with: the next `AssetMetadataStore.inst` starts empty. Safe to call when there's no instance, or twice. */
    static Destroy(): void {
        AssetMetadataStore._inst = undefined;
    }

    private bundles = new Map<string, AssetMetadataMap>();
    /** Bundles searched for a name, nearest first - the asset scope, then the unscoped bucket. A name is looked up per tile, so it's kept built. */
    private order: string[] = [Unscoped];

    /**
     * Adds (or replaces) a bundle's metadata. `assets-meta.json` is hand-edited, so unlike everything
     * else that reaches this store, it's not trusted - a `light` entry missing a field (or with the wrong
     * type for one) would otherwise flow silently into `BakeLighting` as `NaN`/`undefined` and bake to a
     * black tint instead of failing loudly. Drop just the bad `light` (keeping `collidable`/`door` on the
     * same entry) and warn with the asset name, rather than reject the whole file over one typo.
     */
    Add(bundle: string, map: AssetMetadataMap): void {
        const clean: AssetMetadataMap = {};
        const source = map || {};
        for (const name in source) {
            const meta = source[name];
            if (meta.light && !IsCompleteLightValue(meta.light)) {
                console.warn(
                    `assets-meta.json: "${name}" has an incomplete light value (needs brightness, tint and range, all numbers) - ignoring it until fixed:`,
                    meta.light
                );
                clean[name] = { ...meta, light: undefined };
            } else {
                clean[name] = meta;
            }
        }
        this.bundles.set(bundle, clean);
    }

    /** Drops a bundle's metadata - as it unloads. */
    Remove(bundle: string): void {
        this.bundles.delete(bundle);
    }

    /** The bundles a name is looked up in, nearest first - the asset scope (`Assets.Scope`). */
    SetScope(chain: string[]): void {
        this.order = chain.concat(Unscoped);
    }

    /** Replaces everything with one map that belongs to no bundle - for a game or test with metadata but no asset bundles. */
    Load(map: AssetMetadataMap): void {
        this.bundles.clear();
        this.Add(Unscoped, map);
    }

    Get(assetName: string): AssetMetadata | undefined {
        const found = this.Find(assetName);
        return found ? found.meta : undefined;
    }

    /** Given one sprite of a door pair (open or closed), finds the asset name of the other half - same `door.id`, opposite `open` - or `undefined` if it's not a door or its pair isn't defined. The pair is looked for in the bundle that defines this half first. */
    GetDoorPartner(assetName: string): string | undefined {
        const found = this.Find(assetName);
        const door = found && found.meta.door;
        if (!found || !door) {
            return undefined;
        }
        const order = [found.bundle].concat(this.order.filter(bundle => bundle !== found.bundle));
        for (const bundle of order) {
            const map = this.bundles.get(bundle);
            for (const name in map) {
                const candidate = map[name].door;
                if (candidate && candidate.id === door.id && candidate.open !== door.open) {
                    return name;
                }
            }
        }
        return undefined;
    }

    private Find(assetName: string): { bundle: string; meta: AssetMetadata } | undefined {
        for (const bundle of this.order) {
            const map = this.bundles.get(bundle);
            if (map && Object.prototype.hasOwnProperty.call(map, assetName)) {
                return { bundle, meta: map[assetName] };
            }
        }
        return undefined;
    }
}
