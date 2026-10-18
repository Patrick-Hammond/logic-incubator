import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundId } from "./AssetIds";
import NamedSounds, { NamedSoundPlayer } from "./NamedSounds";

/** The sounds the build has, by id. */
let have: Set<string>;
let played: string[];
let scope: string[];
let time: number;
let roll: number;
let player: NamedSoundPlayer;
let sounds: NamedSounds;

beforeEach(() => {
    have = new Set();
    played = [];
    scope = ["level1", "global"];
    time = 0;
    roll = 0;
    player = {
        get Scope() {
            return scope;
        },
        CanPlaySound: (id: string): id is SoundId => have.has(id),
        PlaySound: async id => {
            played.push(id);
            return undefined;
        }
    };
    sounds = new NamedSounds(player, { random: () => roll, now: () => time });
});

describe("NamedSounds", () => {
    it("plays a bare name from the nearest bundle in scope that has it", () => {
        have.add("global.coin").add("level1.coin");
        expect(sounds.Play("coin")).toBe(true);
        expect(played).toEqual(["level1.coin"]);
        have.delete("level1.coin");
        time += 100;
        sounds.Play("coin");
        expect(played).toEqual(["level1.coin", "global.coin"]);
    });

    it("skips quietly a name the build has no sound for", () => {
        expect(sounds.Play("arrow_shot")).toBe(false);
        expect(sounds.Has("arrow_shot")).toBe(false);
        expect(played).toEqual([]);
    });

    it("plays a name with its bundle from only that bundle", () => {
        have.add("ui.confirm").add("global.confirm");
        sounds.Play("ui.confirm");
        expect(played).toEqual(["ui.confirm"]);
        expect(sounds.Find("ui.back")).toEqual([]);
    });

    it("falls back along a list to the first name the build has", () => {
        have.add("global.small_death");
        expect(sounds.Play(["boss_death", undefined, "small_death"])).toBe(true);
        expect(played).toEqual(["global.small_death"]);
        expect(sounds.Play([undefined, "big_death"])).toBe(false);
    });

    it("finds a sound's takes, counted from 1 to the first missing", () => {
        have.add("global.arrow_shot_1").add("global.arrow_shot_2").add("global.arrow_shot_4");
        expect(sounds.Find("arrow_shot")).toEqual(["global.arrow_shot_1", "global.arrow_shot_2"]);
        have.add("global.arrow_shot");
        expect(sounds.Find("arrow_shot")).toEqual(["global.arrow_shot", "global.arrow_shot_1", "global.arrow_shot_2"]);
    });

    it("picks a take at random, never the one it just played", () => {
        have.add("global.coin_1").add("global.coin_2").add("global.coin_3");
        roll = 0.5;
        sounds.Play("coin");
        time += 100;
        sounds.Play("coin");
        roll = 0.99;
        time += 100;
        sounds.Play("coin");
        expect(played).toEqual(["global.coin_2", "global.coin_3", "global.coin_1"]);
    });

    it("plays a name once for many at the same moment", () => {
        have.add("global.monster_hit");
        sounds.Play("monster_hit");
        sounds.Play("monster_hit");
        time += 39;
        expect(sounds.Play("monster_hit")).toBe(true);
        time += 1;
        sounds.Play("monster_hit");
        expect(played).toEqual(["global.monster_hit", "global.monster_hit"]);
    });

    it("warns once, rather than throws, about a sound that won't play", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        have.add("global.coin");
        player.PlaySound = () => Promise.reject(new Error("404 Not Found"));
        sounds.Play("coin");
        time += 100;
        sounds.Play("coin");
        await Promise.resolve();
        await Promise.resolve();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('Sound "global.coin" can\'t be played:', expect.any(Error));
        warn.mockRestore();
    });
});
