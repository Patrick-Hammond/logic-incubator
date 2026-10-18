/**
 * What play sounds like (`DungeonMainOptions.sounds`): one listener on the engine's events (see Events.ts) that plays
 * each one's sound - offline, on the host, and on an online guest alike, as a guest hears the host's events as its own
 * (see `GuestSession`). The thing it happens to names its own sound where it has one - a shot (`ShotSetup.sound`), a
 * kind of monster (`MonsterDef.sounds`), a pickup's or a door's sprite (`AssetMetadata.sound`) - and the game's
 * `SoundTable` has the rest. Every sound is by name, and one the build has no sound for gives way to the next, then to
 * silence (see `NamedSounds`): a game names them all before it has the files, and each is heard once its file is in.
 * Pure - no pixi - so it runs under the plain node test runner.
 */

import type NamedSounds from "@logic-incubator/lib/assets/NamedSounds";
import {
    ALL_PLAYERS_DIED, BOSS_WOKE, DOOR_CLOSED, DOOR_OPENED, GAME_PAUSED, KEYS_DROPPED, LEVEL_COMPLETED, LIGHT_SPELL_CAST, MONSTER_HIT, MONSTER_KILLED,
    MONSTER_SPAWNED, NPC_SHOUTED, PICKUP_COLLECTED, PLAYER_DAMAGED, PLAYER_DIED, QUEST_UPDATED, SHOT_FIRED, SHOT_STOPPED, SPAWNER_DESTROYED, SPAWNER_HIT,
    TALK_LINE, TALK_STARTED
} from "./Events";
import type { AssetMetadata } from "./level/AssetMetadata";
import type { MonsterDef, MonsterSounds, MonsterType } from "./level/entities/MonsterRoster";
import type { PickupKind } from "./level/entities/Pickups";
import type { ShotSetup } from "./level/entities/Projectiles";
import type { CollectedPickup } from "./level/Level";
import type { QuestState } from "./story/Quests";

/** The game's sounds for what happens in play, each by name (see `NamedSounds`) - for whatever doesn't name its own. One left out is silent. */
export type SoundTable = {
    /** A hero's shot, for a weapon whose `ShotSetup` names no `sound`. */
    heroShot?: string;
    /** A monster's shot, for one whose `ShotSetup` names no `sound`. */
    monsterShot?: string;
    /** A shot stopping against a wall, a closed door or the dark, for one whose `ShotSetup` names no `wallSound`. */
    shotWall?: string;
    heroHurt?: string;
    heroDeath?: string;
    /** A hero cast their light spell. */
    lightSpell?: string;
    /** A fallen hero dropped their keys. */
    keysDropped?: string;
    /** Every hero is down. */
    gameOver?: string;
    /** A hero is out. */
    levelComplete?: string;
    /** For a kind of monster with no `MonsterSounds` of its own for it - and so on down. */
    monsterHit?: string;
    monsterDeath?: string;
    monsterSpawn?: string;
    bossWake?: string;
    /** A boss dies - in place of its kind's own `death`. */
    bossDeath?: string;
    spawnerHit?: string;
    /** A spawner shot to pieces. */
    spawnerBreak?: string;
    /** For a door whose sprite's metadata names no `sound`. */
    doorOpen?: string;
    doorClose?: string;
    /** Picking something up, by what it is - for a pickup whose sprite's metadata names no `sound`. */
    pickup?: Partial<Record<PickupKind, string>>;
    questGiven?: string;
    /** A step toward a quest's goal. */
    questProgress?: string;
    /** A quest's goal is met, or it's handed in. */
    questDone?: string;
    talkStart?: string;
    /** Each line of a talk after its first. */
    talkLine?: string;
    /** An NPC calls out something new. */
    shout?: string;
    pause?: string;
};

/** The events a `SoundBoard` plays sounds for. */
export const SoundEvents: ReadonlyArray<string> = [
    SHOT_FIRED, SHOT_STOPPED, PLAYER_DAMAGED, PLAYER_DIED, LIGHT_SPELL_CAST, KEYS_DROPPED, ALL_PLAYERS_DIED, LEVEL_COMPLETED, MONSTER_HIT, MONSTER_KILLED,
    MONSTER_SPAWNED, BOSS_WOKE, SPAWNER_HIT, SPAWNER_DESTROYED, DOOR_OPENED, DOOR_CLOSED, PICKUP_COLLECTED, QUEST_UPDATED, TALK_STARTED, TALK_LINE,
    NPC_SHOUTED, GAME_PAUSED
];

export type SoundBoardOptions = {
    /** What plays them - `NamedSounds` over the game's assets. */
    sounds: Pick<NamedSounds, "Play">;
    table?: SoundTable;
    /** A kind of monster's def - `MonsterRoster.inst.Def`. */
    monster: (type: MonsterType) => MonsterDef | undefined;
    /** A sprite's metadata - `AssetMetadataStore.inst.Get`. */
    metadata: (sprite: string) => AssetMetadata | undefined;
};

export default class SoundBoard {
    private readonly table: SoundTable;

    constructor(private readonly options: SoundBoardOptions) {
        this.table = options.table || {};
    }

    /** Plays what `event` sounds like, if anything - `args` as it was emitted with. */
    Heard(event: string, args: ReadonlyArray<unknown>): void {
        const table = this.table;
        switch (event) {
            case SHOT_FIRED: {
                const shot = args[0] as ShotSetup;
                this.Play(shot.sound, (args[1] as number) >= 0 ? table.heroShot : table.monsterShot);
                break;
            }
            case SHOT_STOPPED:
                this.Play((args[0] as ShotSetup).wallSound, table.shotWall);
                break;
            case PLAYER_DAMAGED:
                this.Play(table.heroHurt);
                break;
            case PLAYER_DIED:
                this.Play(table.heroDeath);
                break;
            case LIGHT_SPELL_CAST:
                this.Play(table.lightSpell);
                break;
            case KEYS_DROPPED:
                this.Play(table.keysDropped);
                break;
            case ALL_PLAYERS_DIED:
                this.Play(table.gameOver);
                break;
            case LEVEL_COMPLETED:
                this.Play(table.levelComplete);
                break;
            case MONSTER_HIT:
                this.Play(this.MonsterSound(args[0], "hit"), table.monsterHit);
                break;
            case MONSTER_KILLED: {
                const death = this.MonsterSound(args[0], "death");
                if (args[4]) {
                    this.Play(table.bossDeath, death, table.monsterDeath);
                } else {
                    this.Play(death, table.monsterDeath);
                }
                break;
            }
            case MONSTER_SPAWNED:
                this.Play(this.MonsterSound(args[0], "spawn"), table.monsterSpawn);
                break;
            case BOSS_WOKE:
                this.Play(this.MonsterSound(args[0], "wake"), table.bossWake);
                break;
            case SPAWNER_HIT:
                this.Play(table.spawnerHit);
                break;
            case SPAWNER_DESTROYED:
                this.Play(table.spawnerBreak);
                break;
            case DOOR_OPENED:
                // The sprite it turns into: its open one as it opens, its closed one as it shuts.
                this.Play(this.SpriteSound(args[0] as string), table.doorOpen);
                break;
            case DOOR_CLOSED:
                this.Play(this.SpriteSound(args[0] as string), table.doorClose);
                break;
            case PICKUP_COLLECTED: {
                const kinds = table.pickup || {};
                ((args[3] as CollectedPickup[] | undefined) || []).forEach(pickup => {
                    this.Play(pickup.sprite ? this.SpriteSound(pickup.sprite) : undefined, kinds[pickup.value.kind]);
                });
                break;
            }
            case QUEST_UPDATED: {
                const state = args[1] as QuestState;
                const was = args[3] as QuestState;
                if (state === "active") {
                    this.Play(was === "active" ? table.questProgress : table.questGiven);
                } else if ((state === "complete" || state === "finished") && state !== was) {
                    this.Play(table.questDone);
                }
                break;
            }
            case TALK_STARTED:
                this.Play(table.talkStart);
                break;
            case TALK_LINE:
                this.Play(table.talkLine);
                break;
            case NPC_SHOUTED:
                this.Play(table.shout);
                break;
            case GAME_PAUSED:
                this.Play(table.pause);
                break;
        }
    }

    private Play(...names: Array<string | undefined>): void {
        this.options.sounds.Play(names);
    }

    private MonsterSound(type: unknown, which: keyof MonsterSounds): string | undefined {
        const def = this.options.monster(type as MonsterType);
        return def && def.sounds && def.sounds[which];
    }

    private SpriteSound(sprite: string): string | undefined {
        const meta = this.options.metadata(sprite);
        return meta && meta.sound;
    }
}
