import { beforeEach, describe, expect, it } from "vitest";
import {
    ALL_PLAYERS_DIED, BOSS_WOKE, DOOR_CLOSED, DOOR_OPENED, MONSTER_HIT, MONSTER_KILLED, MONSTER_SPAWNED, NPC_SHOUTED, PICKUP_COLLECTED, PLAYER_DAMAGED,
    QUEST_UPDATED, SHOT_FIRED, SHOT_STOPPED, SPAWNER_DESTROYED, TALK_LINE
} from "./Events";
import type { AssetMetadata } from "./level/AssetMetadata";
import type { MonsterDef } from "./level/entities/MonsterRoster";
import type { ShotSetup } from "./level/entities/Projectiles";
import SoundBoard, { SoundEvents, SoundTable } from "./SoundBoard";

/** The sound names the build has. */
let have: Set<string>;
let played: string[];
let board: SoundBoard;

const Table: SoundTable = {
    heroShot: "arrow_shot",
    monsterShot: "caster_throw",
    shotWall: "shot_wall",
    heroHurt: "hero_hurt",
    gameOver: "game_over",
    monsterHit: "monster_hit",
    monsterDeath: "small_death",
    monsterSpawn: "monster_spawn",
    bossWake: "boss_wake",
    bossDeath: "boss_death",
    spawnerBreak: "spawner_break",
    doorOpen: "door_open",
    doorClose: "door_close",
    pickup: { gold: "coin", key: "key_pickup" },
    questGiven: "quest_given",
    questProgress: "quest_progress",
    questDone: "quest_done",
    talkLine: "dialog_blip",
    shout: "shout"
};

const Monsters: { [type: string]: Partial<MonsterDef> } = {
    orc: { sounds: { death: "big_death", hit: "orc_grunt" } },
    goblin: {}
};

const Metadata: { [sprite: string]: AssetMetadata } = {
    sack_gold: { sound: "gold_sack" },
    doors_leaf_open: { sound: "heavy_door_open" }
};

const Arrow: ShotSetup = { sprite: "arrow", speed: 6, damage: 1, range: 20 };

function Hear(event: string, ...args: unknown[]): string[] {
    played = [];
    board.Heard(event, args);
    return played;
}

beforeEach(() => {
    have = new Set(Object.keys(Table).map(key => Table[key as keyof SoundTable]).filter(name => typeof name === "string") as string[]);
    have.add("coin").add("key_pickup").add("big_death").add("gold_sack");
    board = new SoundBoard({
        sounds: {
            Play: names => {
                const list = Array.isArray(names) ? names : [names];
                const name = list.find(n => !!n && have.has(n));
                if (name) {
                    played.push(name);
                }
                return !!name;
            }
        },
        table: Table,
        monster: type => Monsters[type] as MonsterDef | undefined,
        metadata: sprite => Metadata[sprite]
    });
});

describe("SoundBoard", () => {
    it("plays a shot's own sound, else the game's for whoever fired it", () => {
        have.add("axe_throw");
        expect(Hear(SHOT_FIRED, { ...Arrow, sound: "axe_throw" }, 0)).toEqual(["axe_throw"]);
        expect(Hear(SHOT_FIRED, Arrow, 1)).toEqual(["arrow_shot"]);
        expect(Hear(SHOT_FIRED, Arrow, -1)).toEqual(["caster_throw"]);
    });

    it("falls back to the game's sound for a shot whose own isn't in the build", () => {
        expect(Hear(SHOT_FIRED, { ...Arrow, sound: "axe_throw" }, 0)).toEqual(["arrow_shot"]);
        expect(Hear(SHOT_STOPPED, { ...Arrow, wallSound: "flask_smash" })).toEqual(["shot_wall"]);
    });

    it("plays a kind of monster's own sounds, else the game's", () => {
        // Its own not in the build yet: the game's for any monster.
        expect(Hear(MONSTER_HIT, "orc")).toEqual(["monster_hit"]);
        have.add("orc_grunt");
        expect(Hear(MONSTER_HIT, "orc")).toEqual(["orc_grunt"]);
        expect(Hear(MONSTER_HIT, "goblin")).toEqual(["monster_hit"]);
        expect(Hear(MONSTER_KILLED, "orc", 0, 0, 1, false)).toEqual(["big_death"]);
        expect(Hear(MONSTER_KILLED, "goblin", 0, 0, 1, false)).toEqual(["small_death"]);
        expect(Hear(MONSTER_SPAWNED, "ghost")).toEqual(["monster_spawn"]);
    });

    it("gives a boss the game's boss sounds", () => {
        expect(Hear(BOSS_WOKE, "orc")).toEqual(["boss_wake"]);
        expect(Hear(MONSTER_KILLED, "orc", 0, 0, 1, true)).toEqual(["boss_death"]);
        have.delete("boss_death");
        expect(Hear(MONSTER_KILLED, "orc", 0, 0, 1, true)).toEqual(["big_death"]);
    });

    it("plays a pickup's sprite's sound, else the game's for its kind - one for each thing picked up", () => {
        const collected = [
            { value: { kind: "gold", amount: 10 }, sprite: "sack_gold" },
            { value: { kind: "key", id: 1 }, sprite: "key_silver" },
            { value: { kind: "health", amount: 1 }, sprite: null }
        ];
        expect(Hear(PICKUP_COLLECTED, 0, 4, 3, collected)).toEqual(["gold_sack", "key_pickup"]);
    });

    it("plays a door's sound for the sprite it turns into, else the game's", () => {
        have.add("heavy_door_open");
        expect(Hear(DOOR_OPENED, "doors_leaf_open", 0)).toEqual(["heavy_door_open"]);
        expect(Hear(DOOR_CLOSED, "doors_leaf_closed", 0)).toEqual(["door_close"]);
    });

    it("tells a quest given from a step toward it and from its end", () => {
        expect(Hear(QUEST_UPDATED, "rats", "active", 0, "none")).toEqual(["quest_given"]);
        expect(Hear(QUEST_UPDATED, "rats", "active", 2, "active")).toEqual(["quest_progress"]);
        expect(Hear(QUEST_UPDATED, "rats", "complete", 5, "active")).toEqual(["quest_done"]);
        expect(Hear(QUEST_UPDATED, "rats", "finished", 5, "complete")).toEqual(["quest_done"]);
    });

    it("plays the game's sounds for heroes, the level and the story", () => {
        expect(Hear(PLAYER_DAMAGED, 1, 3, 0)).toEqual(["hero_hurt"]);
        expect(Hear(ALL_PLAYERS_DIED)).toEqual(["game_over"]);
        expect(Hear(SPAWNER_DESTROYED, {})).toEqual(["spawner_break"]);
        expect(Hear(TALK_LINE)).toEqual(["dialog_blip"]);
        expect(Hear(NPC_SHOUTED, 3, 4)).toEqual(["shout"]);
    });

    it("is silent for what the game names no sound for", () => {
        board = new SoundBoard({ sounds: { Play: () => false }, monster: () => undefined, metadata: () => undefined });
        SoundEvents.forEach(event => expect(() => board.Heard(event, [Arrow, 0, 0, 0, false])).not.toThrow());
    });
});
