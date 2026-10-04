import {AnimatedSprite, Sprite, Texture, utils, BitmapText} from "pixi.js";
import { ScopedNames } from "../assets/AssetScope";

/** A registered sprite or animation: the texture keys of its frames, and which bundle it came from (none for a runtime-made one). */
type Entry = { frames: string[]; bundle?: string; local: string };

/**
 * Makes sprites and animations by name. The names a game uses - in level files, asset metadata,
 * its own setup - are bare ("wall_top", "knight_m_idle_anim"); what's registered, for the sprites
 * a bundle loads, is the qualified id (`global.wall_top`). `Resolve` bridges them through the
 * asset scope: a bare name means the nearest loaded bundle that has it (see `Assets.SetScope`),
 * and a qualified id means itself. Textures a game makes at runtime (`Add`) belong to no bundle
 * and are found by their own name.
 */
export default class AssetFactory {
    private static _inst: AssetFactory;
    public static get inst(): AssetFactory {
        if (!AssetFactory._inst) {
            AssetFactory._inst = new AssetFactory();
        }
        return AssetFactory._inst;
    }

    /**
     * Forgets the shared instance and every sprite and animation registered with it: the next
     * `AssetFactory.inst` starts empty. (The textures themselves are Pixi's to free - see
     * `Game.destroy`.) Safe to call when there's no instance, or twice.
     */
    public static Destroy(): void {
        AssetFactory._inst = undefined;
    }

    private entries = new Map<string, Entry>();
    private scope = new ScopedNames(key => this.entries.has(key));
    private visible: { sprites: string[]; anims: string[] } | undefined;
    private warnedMissing = new Set<string>();

    /** The bare names of the sprites in scope (a one-frame asset), each once. */
    get SpriteNames(): string[] {
        return this.Visible().sprites;
    }

    /** The bare names of the animations in scope, each once. */
    get AnimationNames(): string[] {
        return this.Visible().anims;
    }

    /** Whether `name` is a loaded sprite or animation - `Create` returns null, and `CreateTexture` throws, for anything else. */
    Has(name: string): boolean {
        return this.scope.Resolve(name) !== undefined;
    }

    /** Whether `name` is an animation (several frames) rather than a sprite. False for a name nothing in scope has. */
    IsAnimation(name: string): boolean {
        const entry = this.EntryOf(name);
        return !!entry && entry.frames.length > 1;
    }

    /** The registered key `name` means - itself for a qualified id - or undefined if nothing in scope has it. */
    Resolve(name: string): string | undefined {
        return this.scope.Resolve(name);
    }

    /** Which bundles a bare name is looked up in, nearest first. Set by `Assets`. */
    SetScope(chain: string[]): void {
        this.scope.SetChain(chain);
        this.visible = undefined;
    }

    ScopeChain(): string[] {
        return this.scope.Chain;
    }

    /** Warns that `name` isn't in the sprite sheet and is being skipped - once per name, however many tiles use it. */
    WarnMissing(name: string): void {
        if (!this.warnedMissing.has(name)) {
            this.warnedMissing.add(name);
            console.warn(`"${name}" is not in the sprite sheet - skipping every tile that uses it.`);
        }
    }

    /**
     * Registers a sprite or animation that belongs to no bundle - one a game makes at runtime. With
     * `textures`, each frame's texture is put in Pixi's cache under its frame name; without, the
     * frames must already be there.
     */
    Add(name: string, frameNames: string[], textures?: Texture[]): void {
        if (textures) {
            frameNames.forEach((frameName, index) => (utils.TextureCache[frameName] = textures[index]));
        }
        this.entries.set(name, { frames: frameNames, local: name });
        this.Changed();
    }

    /** Registers a bundle's sprite or animation under its qualified `id` (`global.wall_top`); `Assets` calls this as a bundle loads. */
    AddBundleAsset(bundle: string, id: string, frameKeys: string[]): void {
        this.entries.set(id, { frames: frameKeys, bundle, local: id.slice(bundle.length + 1) });
        this.Changed();
    }

    Remove(id: string): void {
        if (this.entries.delete(id)) {
            this.Changed();
        }
    }

    /** Forgets everything a bundle registered - as it unloads. */
    RemoveBundle(bundle: string): void {
        const owned: string[] = [];
        this.entries.forEach((entry, key) => {
            if (entry.bundle === bundle) {
                owned.push(key);
            }
        });
        owned.forEach(key => this.entries.delete(key));
        if (owned.length) {
            this.Changed();
        }
    }

    Create(name: string): Sprite | AnimatedSprite {
        const entry = this.EntryOf(name);
        if (!entry) {
            return null;
        }
        return entry.frames.length > 1 ? this.CreateAnimatedSprite(name) : this.CreateSprite(name);
    }

    CreateTexture(name: string): Texture {
        return Texture.from(this.Frames(name)[0]);
    }

    /** Every frame's texture, in order - one for a sprite. */
    CreateTextures(name: string): Texture[] {
        return this.Frames(name).map(frameName => Texture.from(frameName));
    }

    /**
     * One frame's texture by its frame key ("knight_m_idle_anim_f2" - the name inside an animation),
     * looked up through the scope like a sprite name. For art that wants a specific frame of a sheet,
     * a portrait say, rather than a sprite.
     */
    CreateFrameTexture(frameKey: string): Texture {
        const keys = [frameKey].concat(this.scope.Chain.map(bundle => bundle + "." + frameKey));
        const found = keys.find(key => !!utils.TextureCache[key]);
        if (!found) {
            throw new Error(`No frame "${frameKey}" in the loaded sprite sheets.`);
        }
        return Texture.from(found);
    }

    CreateSprite(name: string): Sprite {
        return Sprite.from(this.Frames(name)[0]);
    }

    CreateAnimatedSprite(name: string): AnimatedSprite {
        return AnimatedSprite.fromFrames(this.Frames(name));
    }

    CreateBitmapText(name: string, size: number): BitmapText {
        return new BitmapText("", { font: { name, size } });
    }

    private EntryOf(name: string): Entry | undefined {
        const key = this.scope.Resolve(name);
        return key === undefined ? undefined : this.entries.get(key);
    }

    private Frames(name: string): string[] {
        const entry = this.EntryOf(name);
        if (!entry) {
            throw new Error(`"${name}" is not a loaded sprite or animation.`);
        }
        return entry.frames;
    }

    private Changed(): void {
        this.scope.Invalidate();
        this.visible = undefined;
    }

    /** The bare names in scope, split into sprites and animations by what each resolves to - so a level's sprite hiding a global one is listed once, as the level's. */
    private Visible(): { sprites: string[]; anims: string[] } {
        if (!this.visible) {
            const chain = this.scope.Chain;
            const bare = new Set<string>();
            this.entries.forEach((entry, key) => {
                if (!entry.bundle) {
                    bare.add(key);
                } else if (chain.indexOf(entry.bundle) >= 0) {
                    bare.add(entry.local);
                }
            });
            const sprites: string[] = [];
            const anims: string[] = [];
            bare.forEach(name => {
                const entry = this.EntryOf(name);
                if (entry) {
                    (entry.frames.length > 1 ? anims : sprites).push(name);
                }
            });
            this.visible = { sprites, anims };
        }
        return this.visible;
    }
}
