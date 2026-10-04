import { beforeEach, describe, expect, it, vi } from "vitest";
import AssetFactory from "./AssetFactory";

const pixi = vi.hoisted(() => ({ cache: {} as { [key: string]: unknown } }));

vi.mock("pixi.js", () => {
    const from = (key: string) => {
        if (!pixi.cache[key]) {
            throw new Error(`The cacheId "${key}" does not exist in TextureCache.`);
        }
        return { texture: key };
    };
    return {
        utils: { TextureCache: pixi.cache },
        Texture: { from },
        Sprite: { from: (key: string) => ({ sprite: key }) },
        AnimatedSprite: { fromFrames: (frames: string[]) => ({ anim: frames }) },
        BitmapText: class {
            constructor(public text: string, public style: unknown) {}
        },
    };
});

let factory: AssetFactory;

beforeEach(() => {
    Object.keys(pixi.cache).forEach(key => delete pixi.cache[key]);
    AssetFactory.Destroy();
    factory = AssetFactory.inst;
});

/** A bundle's sprite and animation, as `Assets` registers them, with their frames in the texture cache. */
function loadBundle(bundle: string, sprites: string[], animations: { [name: string]: number } = {}): void {
    sprites.forEach(name => {
        pixi.cache[`${bundle}.${name}`] = {};
        factory.AddBundleAsset(bundle, `${bundle}.${name}`, [`${bundle}.${name}`]);
    });
    Object.keys(animations).forEach(name => {
        const frames = Array.from({ length: animations[name] }, (_, i) => `${bundle}.${name}_f${i}`);
        frames.forEach(frame => (pixi.cache[frame] = {}));
        factory.AddBundleAsset(bundle, `${bundle}.${name}`, frames);
    });
}

describe("AssetFactory scope", () => {
    beforeEach(() => {
        loadBundle("global", ["wall", "torch"], { bomb: 3 });
        loadBundle("level1", ["torch", "lava"]);
        factory.SetScope(["level1", "global"]);
    });

    it("finds a bare name in the nearest bundle, and a qualified id as itself", () => {
        expect(factory.Resolve("torch")).toBe("level1.torch");
        expect(factory.Resolve("wall")).toBe("global.wall");
        expect(factory.Resolve("global.torch")).toBe("global.torch");
        expect(factory.Resolve("nothing")).toBeUndefined();
        expect(factory.Has("lava")).toBe(true);
        expect(factory.Has("nothing")).toBe(false);
    });

    it("makes what the resolved name's frames say: one frame a sprite, several an animation", () => {
        expect(factory.Create("wall")).toEqual({ sprite: "global.wall" });
        expect(factory.Create("bomb")).toEqual({ anim: ["global.bomb_f0", "global.bomb_f1", "global.bomb_f2"] });
        expect(factory.Create("nothing")).toBeNull();
        expect(factory.IsAnimation("bomb")).toBe(true);
        expect(factory.IsAnimation("wall")).toBe(false);
        expect(factory.IsAnimation("nothing")).toBe(false);
        expect(factory.CreateTexture("level1.torch")).toEqual({ texture: "level1.torch" });
        expect(factory.CreateTextures("bomb")).toHaveLength(3);
    });

    it("lists each visible bare name once, as what it resolves to", () => {
        expect(factory.SpriteNames.sort()).toEqual(["lava", "torch", "wall"]);
        expect(factory.AnimationNames).toEqual(["bomb"]);
        factory.SetScope(["global"]);
        expect(factory.SpriteNames.sort()).toEqual(["torch", "wall"]);
    });

    it("forgets a bundle's sprites when it unloads, and the names that only it had", () => {
        factory.RemoveBundle("level1");
        expect(factory.Has("lava")).toBe(false);
        expect(factory.Resolve("torch")).toBe("global.torch");
        expect(factory.SpriteNames.sort()).toEqual(["torch", "wall"]);
    });

    it("throws a readable error making a texture of a name it doesn't have", () => {
        expect(() => factory.CreateTexture("nothing")).toThrow('"nothing" is not a loaded sprite or animation');
    });

    it("finds one frame of an animation by its frame key, through the scope", () => {
        expect(factory.CreateFrameTexture("bomb_f1")).toEqual({ texture: "global.bomb_f1" });
        expect(() => factory.CreateFrameTexture("bomb_f9")).toThrow('No frame "bomb_f9"');
    });
});

describe("AssetFactory.Add (textures made at runtime)", () => {
    it("registers them by their own name, in no bundle, visible whatever the scope", () => {
        const texture = {} as never;
        factory.SetScope([]);
        factory.Add("collision", ["collision"], [texture]);
        expect(pixi.cache["collision"]).toBe(texture);
        expect(factory.Has("collision")).toBe(true);
        expect(factory.SpriteNames).toEqual(["collision"]);
        expect(factory.Create("collision")).toEqual({ sprite: "collision" });
    });
});

describe("AssetFactory", () => {
    it("warns once about a missing name", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        factory.WarnMissing("ghost");
        factory.WarnMissing("ghost");
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it("starts empty again after Destroy", () => {
        loadBundle("global", ["wall"]);
        AssetFactory.Destroy();
        AssetFactory.Destroy(); // safe twice
        expect(AssetFactory.inst).not.toBe(factory);
        expect(AssetFactory.inst.Has("wall")).toBe(false);
    });
});
