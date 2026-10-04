import sound from "pixi-sound";
import { ISoundAdapter, SoundPlayOptions } from "./IBundleLoader";

type PixiSound = ReturnType<typeof sound.find>;

function ExtensionOf(url: string): string {
    const path = url.split("?")[0];
    return path.slice(path.lastIndexOf(".") + 1).toLowerCase();
}

/**
 * Sounds through pixi-sound - the only file in lib that imports it, and not part of the default
 * `Game`: a game with sound imports this and passes it to `game.assets.Init`, so one without
 * (importing pixi-sound touches `document` and builds an audio context) pays nothing.
 *
 * pixi-sound keeps one process-wide library, so aliases outlive a `Game`; `Assets.Destroy` removes
 * every one it registered. A sound's alias is its asset id (`global.theme`), which is also what
 * keeps two bundles' sounds from colliding in that shared library.
 *
 * The file is fetched here and handed over as bytes rather than by url: pixi-sound would read the
 * `?v=` cache-busting query as part of the file extension, and this way the fetch is ours to retry.
 *
 * A sound that's still being decoded can't be removed: pixi-sound finishes the decode into the
 * sound it then finds destroyed, and throws from inside the browser's audio callback. So `Remove`
 * of a sound that's loading waits for the decode to finish, and removes it then.
 */
export default class PixiSoundAdapter implements ISoundAdapter {
    /** Sounds registered by `Load` whose decode hasn't finished, by alias. */
    private loading = new Map<string, PixiSound>();
    /** Loading sounds that were removed meanwhile: destroyed when their decode finishes. */
    private doomed = new Set<PixiSound>();

    Pick(urls: string[]): string | undefined {
        return urls.find(url => sound.utils.supported[ExtensionOf(url)]);
    }

    async Load(alias: string, url: string): Promise<void> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }
        const source = await response.arrayBuffer();
        // pixi-sound only `console.assert`s on a duplicate alias, then leaks the old sound.
        this.Remove(alias);
        await new Promise<void>((resolve, reject) => {
            // Read by the callback, which a browser could in principle run before `add` has returned.
            const made: { sound?: PixiSound } = {};
            const added: PixiSound = made.sound = sound.add(alias, {
                source,
                preload: true,
                loaded: (error, decoded) => {
                    this.Settled(alias, decoded || made.sound);
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                }
            });
            if (added.isLoaded) {
                resolve();
            } else {
                this.loading.set(alias, added);
            }
        });
    }

    Has(alias: string): boolean {
        return sound.exists(alias);
    }

    Remove(alias: string): void {
        if (!sound.exists(alias)) {
            return;
        }
        const instance = sound.find(alias);
        if (this.loading.get(alias) === instance) {
            this.doomed.add(instance);
            return;
        }
        sound.remove(alias);
    }

    Play(alias: string, options?: SoundPlayOptions): void {
        sound.play(alias, options || {});
    }

    Stop(alias: string): void {
        if (sound.exists(alias)) {
            sound.stop(alias);
        }
    }

    /** `alias`'s decode finished (or failed): it's safe to destroy now if it was removed in the meantime. */
    private Settled(alias: string, instance: PixiSound | undefined): void {
        if (!instance) {
            return;
        }
        if (this.loading.get(alias) === instance) {
            this.loading.delete(alias);
        }
        if (this.doomed.delete(instance)) {
            if (sound.exists(alias) && sound.find(alias) === instance) {
                sound.remove(alias);
            } else {
                instance.destroy();
            }
        }
    }
}
