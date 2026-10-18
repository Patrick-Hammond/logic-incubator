import { beforeEach, describe, expect, it } from "vitest";
import type { SoundId } from "@logic-incubator/lib/assets/AssetIds";
import AmbientSounds, { AmbientPlayer, LoopSource } from "./AmbientSounds";

/** A play: how loud it was last set, and whether it was stopped. */
type FakePlay = { id: string; volume: number; stopped: boolean };

let have: Set<string>;
let plays: FakePlay[];
let stopped: string[];
let ambient: AmbientSounds;

const settle = async () => {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
};

const Torch = (x: number, y: number, range?: number): LoopSource => ({ sound: "torch_crackle", x, y, range, tile: {} });
const Playing = (id: string) => plays.filter(play => play.id === id && !play.stopped);

beforeEach(() => {
    have = new Set(["global.ambience", "global.torch_crackle"]);
    plays = [];
    stopped = [];
    const player: AmbientPlayer = {
        Find: name => (have.has("global." + name) ? ["global." + name as SoundId] : []),
        PlaySound: async (id, options) => {
            const play: FakePlay = { id, volume: (options && options.volume) || 0, stopped: false };
            plays.push(play);
            return {
                SetVolume: volume => (play.volume = volume),
                Stop: () => (play.stopped = true)
            };
        },
        StopSound: id => stopped.push(id)
    };
    ambient = new AmbientSounds(player);
});

describe("AmbientSounds", () => {
    it("loops the ambience while the dungeon shows, fading in, and stops it as it goes", async () => {
        ambient.Begin("ambience", []);
        ambient.Update([], 1);
        expect(plays).toEqual([]);
        ambient.Show();
        ambient.Update([], 0.25);
        await settle();
        expect(Playing("global.ambience")).toHaveLength(1);
        ambient.Update([], 0.25);
        expect(plays[0].volume).toBe(1);
        ambient.Hide();
        expect(plays[0].stopped).toBe(true);
    });

    it("plays a tile's loop the louder the nearer a hero is, and not at all out of its range", async () => {
        ambient.Begin(undefined, [Torch(10, 10)]);
        ambient.Show();
        ambient.Update([{ x: 20, y: 10 }], 1);
        await settle();
        expect(plays).toEqual([]);
        // Two tiles off, halfway out of four: a quarter.
        for (let i = 0; i < 10; i++) {
            ambient.Update([{ x: 12, y: 10 }], 0.1);
            await settle();
        }
        expect(Playing("global.torch_crackle")).toHaveLength(1);
        expect(plays[0].volume).toBeCloseTo(0.25);
        // The nearest of several heroes, and of several torches, counts - still one loop.
        ambient.Begin(undefined, [Torch(10, 10), Torch(30, 10, 8)]);
        for (let i = 0; i < 10; i++) {
            ambient.Update([{ x: 12, y: 10 }, { x: 30, y: 10 }], 0.1);
        }
        expect(plays).toHaveLength(1);
        expect(plays[0].volume).toBe(1);
    });

    it("fades rather than jumps as a hero walks off", async () => {
        ambient.Begin(undefined, [Torch(0, 0)]);
        ambient.Show();
        for (let i = 0; i < 10; i++) {
            ambient.Update([{ x: 0, y: 0 }], 0.1);
            await settle();
        }
        expect(plays[0].volume).toBe(1);
        ambient.Update([{ x: 50, y: 50 }], 0.1);
        expect(plays[0].volume).toBeCloseTo(0.8);
    });

    it("is silent for a tile taken out of the level", async () => {
        const torch = Torch(0, 0);
        ambient.Begin(undefined, [torch]);
        ambient.Show();
        torch.tile.gone = true;
        ambient.Update([{ x: 0, y: 0 }], 1);
        await settle();
        expect(plays).toEqual([]);
    });

    it("is silent for a sound the build has no file for, until a level whose bundle may have it", async () => {
        have.clear();
        ambient.Begin("ambience", []);
        ambient.Show();
        ambient.Update([], 1);
        await settle();
        expect(plays).toEqual([]);
        have.add("global.ambience");
        ambient.Begin("ambience", []);
        ambient.Update([], 1);
        await settle();
        expect(Playing("global.ambience")).toHaveLength(1);
    });

    it("keeps a loop the next level has too, and stops one it hasn't", async () => {
        ambient.Begin("ambience", [Torch(0, 0)]);
        ambient.Show();
        ambient.Update([{ x: 0, y: 0 }], 1);
        await settle();
        expect(plays).toHaveLength(2);
        ambient.Begin("ambience", []);
        expect(Playing("global.ambience")).toHaveLength(1);
        expect(Playing("global.torch_crackle")).toEqual([]);
        ambient.Update([], 1);
        await settle();
        expect(plays).toHaveLength(2);
    });

    it("stops a loop that was still starting when the dungeon went", async () => {
        ambient.Begin("ambience", []);
        ambient.Show();
        ambient.Update([], 1);
        ambient.Hide();
        await settle();
        expect(plays).toHaveLength(1);
        expect(plays[0].stopped).toBe(true);
    });
});
