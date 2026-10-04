import type { AssetId, DataId } from "@logic-incubator/lib/assets/AssetIds";
import type Assets from "@logic-incubator/lib/assets/Assets";
import type AssetMetadataStore from "./AssetMetadata";

/** The id of a bundle's metadata: the `assets-meta.json` in it. */
const MetaId = (bundle: string) => `${bundle}.assets_meta` as DataId;

export interface AssetMetadataBinding {
    /** Fetches every bound bundle's metadata again, bypassing the cache - so a hand edit shows up without a page reload. */
    Refresh(): Promise<void>;
    /** Stops following the assets, and takes what it added out of the store. */
    Dispose(): void;
}

/**
 * Keeps an `AssetMetadataStore` in step with the asset bundles: a bundle's `assets_meta` data file
 * goes in as the bundle loads and out as it unloads, and the store's scope follows the asset
 * scope. Bundles already loaded when this is bound (the `global` one, loaded at boot before the
 * level scene exists) are picked up straight away.
 *
 * Lives in the engine because the metadata is the engine's - lib's `Assets` knows nothing of it.
 */
export function BindAssetMetadata(assets: Assets, store: AssetMetadataStore): AssetMetadataBinding {
    const bound = new Set<string>();

    const add = (bundle: string) => {
        const id = MetaId(bundle);
        if (assets.Has(id as AssetId) && assets.IsLoaded(id as AssetId)) {
            store.Add(bundle, assets.Data(id) as never);
            bound.add(bundle);
        }
    };
    const remove = (bundle: string) => {
        if (bound.delete(bundle)) {
            store.Remove(bundle);
        }
    };
    const onReloaded = (id: string) => {
        const bundle = id.slice(0, id.indexOf("."));
        if (id === MetaId(bundle)) {
            add(bundle);
        }
    };
    const onScope = (chain: string[]) => store.SetScope(chain);

    assets.on("bundle:complete", add);
    assets.on("bundle:unloaded", remove);
    assets.on("asset:reloaded", onReloaded);
    assets.on("scope:changed", onScope);

    store.SetScope(assets.Scope);
    Object.keys(assets.Stats().bundles).filter(bundle => assets.Stats().bundles[bundle].loaded).forEach(add);

    return {
        async Refresh(): Promise<void> {
            await Promise.all(Array.from(bound).map(bundle => assets.Reload(MetaId(bundle))));
        },
        Dispose(): void {
            assets.off("bundle:complete", add);
            assets.off("bundle:unloaded", remove);
            assets.off("asset:reloaded", onReloaded);
            assets.off("scope:changed", onScope);
            Array.from(bound).forEach(remove);
        }
    };
}
