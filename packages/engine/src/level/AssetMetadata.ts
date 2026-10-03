/**
 * Per-asset-name defaults for tile behaviour that would otherwise have to be
 * hand-painted on a data layer every time that sprite is placed - a wall's
 * collision, a door's door-ness, a torch's light, a marker's spawner, a gold
 * sack's pickup. Loaded once at boot from `assets-meta.json` (by the game's
 * boot code) and consulted by `Level.LoadLevel` when building
 * `collisionData`/`doorData`/the light, spawner and pickup lists, so painting
 * a torch, a spawner marker or a gold sack tile is enough on its own; a
 * specific placement can still override its light or spawner value (see
 * `ImplicitData.EffectiveLight`/`EffectiveSpawner`), and an explicit `COLLISION`
 * brush at the same cell still adds to a tile's own collision for one-off cases.
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

    private map: AssetMetadataMap = {};

    /**
     * `assets-meta.json` is hand-edited, so unlike everything else that reaches this store, it's not
     * trusted - a `light` entry missing a field (or with the wrong type for one) would otherwise flow
     * silently into `BakeLighting` as `NaN`/`undefined` and bake to a black tint instead of failing
     * loudly. Drop just the bad `light` (keeping `collidable`/`door` on the same entry) and warn with
     * the asset name, rather than reject the whole file over one typo.
     */
    Load(map: AssetMetadataMap): void {
        this.map = map || {};
        for (const name in this.map) {
            const meta = this.map[name];
            if (meta.light && !IsCompleteLightValue(meta.light)) {
                console.warn(
                    `assets-meta.json: "${name}" has an incomplete light value (needs brightness, tint and range, all numbers) - ignoring it until fixed:`,
                    meta.light
                );
                this.map[name] = { ...meta, light: undefined };
            }
        }
    }

    Get(assetName: string): AssetMetadata | undefined {
        return this.map[assetName];
    }

    /** Given one sprite of a door pair (open or closed), finds the asset name of the other half - same `door.id`, opposite `open` - or `undefined` if it's not a door or its pair isn't defined. */
    GetDoorPartner(assetName: string): string | undefined {
        const door = this.Get(assetName)?.door;
        if (!door) {
            return undefined;
        }
        for (const name in this.map) {
            const candidate = this.map[name].door;
            if (candidate && candidate.id === door.id && candidate.open !== door.open) {
                return name;
            }
        }
        return undefined;
    }
}
