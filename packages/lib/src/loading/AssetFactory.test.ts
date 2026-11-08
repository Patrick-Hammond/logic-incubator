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
    /** Records what a piece's texture is cut as (see `AssetFactory.KeyOf`). */
    class Texture {
        static from = from;
        destroyed = false;
        constructor(
            public baseTexture: unknown,
            public frame: unknown,
            public orig: unknown,
            public trim?: unknown
        ) {}
        destroy(): void {
            this.destroyed = true;
        }
    }
    class Rectangle {
        constructor(
            public x: number,
            public y: number,
            public width: number,
            public height: number
        ) {}
    }
    return {
        utils: { TextureCache: pixi.cache },
        Texture,
        Rectangle,
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

describe("AssetFactory pieces", () => {
    type Cut = { baseTexture: unknown; frame: object; orig: object; trim?: object; destroyed: boolean };
    const sheet = { sheet: "global" };

    /** A sprite's frame on the sheet, as pixi's spritesheet makes it. */
    function frame(x: number, y: number, width: number, height: number, trim: object | null = null) {
        return { baseTexture: sheet, frame: { x, y, width, height }, orig: { x: 0, y: 0, width: trim ? 32 : width, height: trim ? 32 : height }, trim };
    }

    beforeEach(() => {
        loadBundle("global", ["rug", "door"], { pool: 2 });
        pixi.cache["global.rug"] = frame(0, 0, 32, 32);
        pixi.cache["global.door"] = frame(40, 0, 21, 32);
        pixi.cache["global.pool_f0"] = frame(0, 40, 32, 16);
        pixi.cache["global.pool_f1"] = frame(40, 40, 32, 16);
        factory.SetScope(["global"]);
    });

    it("cuts a piece the first time it's asked for, on the same sheet, and keeps it", () => {
        expect(factory.Has("rug@1,1")).toBe(true);
        expect(factory.Resolve("rug@1,1")).toBe("global.rug@1,1");
        const cut = pixi.cache["global.rug@1,1"] as Cut;
        expect(cut.baseTexture).toBe(sheet);
        expect(cut.frame).toEqual({ x: 16, y: 16, width: 16, height: 16 });
        expect(cut.orig).toEqual({ x: 0, y: 0, width: 16, height: 16 });
        expect(cut.trim).toBeUndefined();
        expect(factory.Create("rug@1,1")).toEqual({ sprite: "global.rug@1,1" });
        expect(factory.Has("rug@1,1")).toBe(true);
        expect(pixi.cache["global.rug@1,1"]).toBe(cut);
    });

    it("cuts every frame of an animation, so the piece animates too", () => {
        expect(factory.IsAnimation("pool@1,0")).toBe(true);
        expect(factory.Create("pool@1,0")).toEqual({ anim: ["global.pool_f0@1,0", "global.pool_f1@1,0"] });
        expect((pixi.cache["global.pool_f1@1,0"] as Cut).frame).toEqual({ x: 56, y: 40, width: 16, height: 16 });
    });

    it("has no piece outside its sprite, nor of a sprite that isn't whole cells, nor of a piece", () => {
        expect(factory.Has("rug@2,0")).toBe(false);
        expect(factory.Has("door@0,0")).toBe(false);
        expect(factory.Has("ghost@0,0")).toBe(false);
        expect(factory.Has("rug@0,0@0,0")).toBe(false);
    });

    it("never lists a piece among the sprites", () => {
        factory.Has("rug@0,0");
        factory.Has("pool@0,0");
        expect(factory.SpriteNames.sort()).toEqual(["door", "rug"]);
        expect(factory.AnimationNames).toEqual(["pool"]);
    });

    it("tells a piece the sheet trimmed away", () => {
        pixi.cache["global.rug"] = frame(0, 0, 16, 32, { x: 0, y: 0, width: 16, height: 32 });
        expect(factory.IsEmptyPiece("rug@1,0")).toBe(true);
        expect(factory.IsEmptyPiece("rug@0,0")).toBe(false);
        expect(factory.IsEmptyPiece("rug")).toBe(false);
        expect(factory.IsEmptyPiece("ghost@0,0")).toBe(false);
    });

    it("lets a piece go with its sprite's bundle, and cuts it afresh once that's back", () => {
        factory.Has("rug@0,1");
        const cut = pixi.cache["global.rug@0,1"] as Cut;
        factory.RemoveBundle("global");
        expect(cut.destroyed).toBe(true);
        expect(pixi.cache["global.rug@0,1"]).toBeUndefined();
        expect(factory.Has("rug@0,1")).toBe(false);
        loadBundle("global", ["rug"]);
        pixi.cache["global.rug"] = frame(0, 0, 32, 32);
        expect(factory.Has("rug@0,1")).toBe(true);
        expect(pixi.cache["global.rug@0,1"]).not.toBe(cut);
    });

    it("lets a piece go with its sprite when that's removed", () => {
        factory.Has("rug@0,0");
        factory.Remove("global.rug");
        expect(factory.Has("rug@0,0")).toBe(false);
        expect(pixi.cache["global.rug@0,0"]).toBeUndefined();
    });
});
