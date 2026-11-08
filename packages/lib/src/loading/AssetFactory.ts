import {AnimatedSprite, Rectangle, Sprite, Texture, utils, BitmapText} from "pixi.js";
import { ScopedNames } from "../assets/AssetScope";
import { IsEmptyPiece, ParsePieceName, PieceFrame, PieceGridOf, PieceName, PieceRect } from "./SpritePieces";

/**
 * A registered sprite or animation: the texture keys of its frames, and which bundle it came from (none for a runtime-made one).
 * `piece` marks one cut from a bigger sprite (see `SpritePieces`) - made by asking for it, never listed.
 */
type Entry = { frames: string[]; bundle?: string; local: string; piece?: boolean };

/**
 * Makes sprites and animations by name. The names a game uses - in level files, asset metadata,
 * its own setup - are bare ("wall_top", "knight_m_idle_anim"); what's registered, for the sprites
 * a bundle loads, is the qualified id (`global.wall_top`). `Resolve` bridges them through the
 * asset scope: a bare name means the nearest loaded bundle that has it (see `Assets.SetScope`),
 * and a qualified id means itself. Textures a game makes at runtime (`Add`) belong to no bundle
 * and are found by their own name.
 *
 * A sprite bigger than one cell can also be asked for a piece at a time, by a piece name (`floor_rug@1,0` - see
 * `SpritePieces`): the first time one is, every frame is cut at that place into a texture on the same sheet, which
 * is kept and given out from then on. A piece belongs to its sprite's bundle and goes with it.
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
        return this.KeyOf(name) !== undefined;
    }

    /** Whether `name` is an animation (several frames) rather than a sprite. False for a name nothing in scope has. */
    IsAnimation(name: string): boolean {
        const entry = this.EntryOf(name);
        return !!entry && entry.frames.length > 1;
    }

    /** The registered key `name` means - itself for a qualified id - or undefined if nothing in scope has it. */
    Resolve(name: string): string | undefined {
        return this.KeyOf(name);
    }

    /**
     * Whether `name` is a piece with no art: its sprite is clear all over that cell, so the sheet trimmed it away (see
     * `SpritePieces.PieceFrame`). False for anything else, a piece that isn't loaded included.
     */
    IsEmptyPiece(name: string): boolean {
        const entry = ParsePieceName(name) ? this.EntryOf(name) : undefined;
        const texture = entry && (utils.TextureCache[entry.frames[0]] as Texture);
        return !!texture && entry.frames.every(frame => IsEmptyPiece((utils.TextureCache[frame] as Texture).frame));
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

    /** Forgets a sprite or animation, and any pieces cut from it. */
    Remove(id: string): void {
        const pieces = this.DropPieces((entry, key) => key.lastIndexOf(id + "@", 0) === 0);
        if (this.entries.delete(id) || pieces) {
            this.Changed();
        }
    }

    /** Forgets everything a bundle registered - as it unloads. */
    RemoveBundle(bundle: string): void {
        this.DropPieces(entry => entry.bundle === bundle);
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
        const key = this.KeyOf(name);
        return key === undefined ? undefined : this.entries.get(key);
    }

    /**
     * The registered key `name` means, or undefined if nothing in scope has it. A piece's is its sprite's key with the
     * piece's place after it - the sprite is resolved first, so the piece is always of the sprite the name means now - and
     * it's cut and registered the first time it's asked for. A piece that's out of its sprite, or of a sprite that isn't
     * a whole number of cells, is nothing.
     */
    private KeyOf(name: string): string | undefined {
        const piece = ParsePieceName(name);
        if (!piece) {
            return this.scope.Resolve(name);
        }
        const baseKey = this.scope.Resolve(piece.base);
        const base = baseKey === undefined ? undefined : this.entries.get(baseKey);
        if (!base || base.piece) {
            return undefined;
        }
        const suffix = PieceName("", piece.column, piece.row);
        const key = baseKey + suffix;
        if (this.entries.has(key)) {
            return key;
        }
        const sources = base.frames.map(frame => utils.TextureCache[frame] as Texture);
        if (sources.some(source => !source)) {
            return undefined;
        }
        const grids = sources.map(source => PieceGridOf(source.orig.width, source.orig.height));
        const grid = grids[0];
        if (!grid || piece.column >= grid.columns || piece.row >= grid.rows || grids.some(g => !g || g.columns !== grid.columns || g.rows !== grid.rows)) {
            return undefined;
        }
        const frames = base.frames.map((frame, index) => {
            const source = sources[index];
            const cut = PieceFrame(source.frame, source.orig, source.trim || null, piece.column, piece.row);
            const pieceKey = frame + suffix;
            utils.TextureCache[pieceKey] = new Texture(source.baseTexture, ToRectangle(cut.frame), ToRectangle(cut.orig), cut.trim ? ToRectangle(cut.trim) : undefined);
            return pieceKey;
        });
        this.entries.set(key, { frames, bundle: base.bundle, local: base.local + suffix, piece: true });
        this.Changed();
        return key;
    }

    /** Forgets the pieces `which` picks, with the textures cut for them (not their sheet, which is their sprite's). Whether there were any. */
    private DropPieces(which: (entry: Entry, key: string) => boolean): boolean {
        const dropped: string[] = [];
        this.entries.forEach((entry, key) => {
            if (entry.piece && which(entry, key)) {
                dropped.push(key);
            }
        });
        dropped.forEach(key => {
            this.entries.get(key).frames.forEach(frame => {
                const texture = utils.TextureCache[frame] as Texture;
                delete utils.TextureCache[frame];
                if (texture) {
                    texture.destroy(false);
                }
            });
            this.entries.delete(key);
        });
        return dropped.length > 0;
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
                if (entry.piece) {
                    return;
                }
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

function ToRectangle(rect: PieceRect): Rectangle {
    return new Rectangle(rect.x, rect.y, rect.width, rect.height);
}
