import {AnimatedSprite, Sprite, Texture, utils, BitmapText} from "pixi.js";

export default class AssetFactory {
    private static _inst: AssetFactory;
    public static get inst(): AssetFactory {
        if (!AssetFactory._inst) {
            AssetFactory._inst = new AssetFactory();
        }
        return AssetFactory._inst;
    }

    private names: { sprites: string[]; anims: string[] } = { sprites: [], anims: [] };
    private registry: { [name: string]: string[] } = {};

    get SpriteNames(): string[] {
        return this.names.sprites;
    }

    get AnimationNames(): string[] {
        return this.names.anims;
    }

    Add(name: string, frameNames: string[], textures?: Texture[]): void {
        if (textures) {
            frameNames.forEach((frameName, index) => (utils.TextureCache[frameName] = textures[index]));
        }
        this.registry[name] = frameNames;
        frameNames.length === 1 ? this.names.sprites.push(name) : this.names.anims.push(name);
    }

    Create(name: string): Sprite | AnimatedSprite {
        if (this.SpriteNames.indexOf(name) > -1) {
            return this.CreateSprite(name);
        } else if (this.AnimationNames.indexOf(name) > -1) {
            return this.CreateAnimatedSprite(name);
        }

        return null;
    }

    CreateTexture(name: string): Texture {
        return Texture.from(this.registry[name][0]);
    }

    CreateSprite(name: string): Sprite {
        return Sprite.from(this.registry[name][0]);
    }

    CreateAnimatedSprite(name: string): AnimatedSprite {
        return AnimatedSprite.fromFrames(this.registry[name]);
    }

    CreateBitmapText(name: string, size: number): BitmapText {
        return new BitmapText("", { font: { name, size } });
    }

    CreateDTS(): void {
        const sprites = this.names.sprites.map(s => `${s} = "${s}"`).join(", ");
        const animations = this.names.anims.map(a => `${a} = "${a}"`).join(", ");
        const dts = `
            export const enum Sprites {${sprites}}
            export const enum Animations {${animations}};
        `;
        console.log(dts);
    }
}
