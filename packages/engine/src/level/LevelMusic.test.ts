import { beforeEach, describe, expect, it, vi } from "vitest";
import LevelMusic, { MusicPlayer } from "./LevelMusic";

/** What was asked of the player, in order: "play x" or "stop x". */
let calls: string[];
let player: MusicPlayer;
let music: LevelMusic;

beforeEach(() => {
    calls = [];
    player = {
        PlaySound: async (id, options) => {
            calls.push("play " + id + (options && options.loop ? " (loop)" : ""));
        },
        StopSound: id => {
            calls.push("stop " + id);
        }
    };
    music = new LevelMusic(player);
});

describe("LevelMusic", () => {
    it("plays the level's track on a loop while the dungeon is showing", () => {
        music.Show();
        music.Play("level1.secret_door");
        expect(calls).toEqual(["play level1.secret_door (loop)"]);
    });

    it("waits for the dungeon to show before playing a track asked for while hidden", () => {
        music.Play("level1.secret_door");
        expect(calls).toEqual([]);
        music.Show();
        expect(calls).toEqual(["play level1.secret_door (loop)"]);
    });

    it("carries on through a restart that asks for the same track", () => {
        music.Show();
        music.Play("level1.secret_door");
        music.Play("level1.secret_door");
        expect(calls).toEqual(["play level1.secret_door (loop)"]);
    });

    it("stops the old track for a new one", () => {
        music.Show();
        music.Play("level1.secret_door");
        music.Play("level2.crypt");
        expect(calls).toEqual(["play level1.secret_door (loop)", "stop level1.secret_door", "play level2.crypt (loop)"]);
    });

    it("goes quiet for a level with no track", () => {
        music.Show();
        music.Play("level1.secret_door");
        music.Play(null);
        expect(calls).toEqual(["play level1.secret_door (loop)", "stop level1.secret_door"]);
    });

    it("stops while hidden, and plays again when shown", () => {
        music.Show();
        music.Play("level1.secret_door");
        music.Hide();
        music.Show();
        expect(calls).toEqual(["play level1.secret_door (loop)", "stop level1.secret_door", "play level1.secret_door (loop)"]);
    });

    it("doesn't start a track a level asked for after the dungeon was hidden", () => {
        music.Show();
        music.Hide();
        music.Play("level1.secret_door");
        expect(calls).toEqual([]);
    });

    it("warns, rather than throws, when the track can't be played", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        player.PlaySound = () => Promise.reject(new Error("404 Not Found"));
        music.Show();
        music.Play("level1.secret_door");
        await Promise.resolve();
        await Promise.resolve();
        expect(warn).toHaveBeenCalledWith('Level music "level1.secret_door" can\'t be played:', expect.any(Error));
        warn.mockRestore();
    });
});
