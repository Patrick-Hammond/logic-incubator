import { AssetsDestroyedError } from "@logic-incubator/lib/assets/AssetErrors";

/** What `LevelAssets` needs of `game.assets` (and of the metadata binding), so the order it does things in tests without either. */
export interface LevelAssetsHost {
    IsReady: boolean;
    IsDev: boolean;
    UseLevelBundle(...names: string[]): Promise<void>;
}

/**
 * Gets the assets a level needs ready before it's built, each time one starts - the first time,
 * and on every restart.
 *
 * In a dev build the bundles' hand-edited metadata is fetched again first, so an edit shows up on
 * each editor -> game switch the same way a placed brush does. That goes **before** the bundle swap:
 * the swap lets go of the previous level's textures a frame later, and the old level is still on
 * screen until the new one is built - an `await` between the two would let that frame come early.
 */
export default class LevelAssets {
    constructor(private assets: LevelAssetsHost, private metadata: { Refresh(): Promise<void> }) {}

    /** Resolves true when the level can be built; false when it can't (the game went away, or its bundle won't load - already reported). */
    async Prepare(bundle: string | undefined): Promise<boolean> {
        if (!this.assets.IsReady) {
            return true;
        }
        if (this.assets.IsDev) {
            try {
                await this.metadata.Refresh();
            } catch {
                // Dev-time convenience refetch - if it fails, keep whatever metadata is already loaded
                // rather than block the scene switch on it.
            }
        }
        try {
            await this.assets.UseLevelBundle(...(bundle ? [bundle] : []));
            return true;
        } catch (error) {
            if (!(error instanceof AssetsDestroyedError)) {
                console.error(`The level's assets didn't load, so it can't start: ${(error as Error).message}`);
            }
            return false;
        }
    }
}
