export const LEVEL_LOADED = "levelloaded";
export const LEVEL_CREATED = "levelCreated";
export const CAMERA_MOVED = "cameraMoved";
/** A hit landed on a hero: `(damage: number, hitPointsLeft: number, hero: number)` - `hero` is their slot, from 0. */
export const PLAYER_DAMAGED = "playerDamaged";
/** `(hero: number)` - a hero's hit points reached 0. They drop the keys they carried; the rest play on. */
export const PLAYER_DIED = "playerDied";
/** Every hero is down. `DungeonMain` restarts the level shortly after - or waits to be told to, with `manualRestart`. */
export const ALL_PLAYERS_DIED = "allPlayersDied";
/**
 * `(hero: number)` - a hero reached a way out (an `EXIT` brush): the level is over, and that slot got there first.
 * `DungeonMain` holds still, then starts whatever level `level` hands back next - shortly after, or when told to
 * (`Restart`) with `manualRestart` - with every hero back on their feet.
 */
export const LEVEL_COMPLETED = "levelCompleted";
/** `DungeonMain.Pause()` stopped play. */
export const GAME_PAUSED = "gamePaused";
/** `DungeonMain.Resume()` set play going again. */
export const GAME_RESUMED = "gameResumed";
/** `(type: MonsterType, x: number, y: number, hero: number)` - the monster's type and pixel position when it died, and the slot of the hero whose shot killed it (-1 for none). */
export const MONSTER_KILLED = "monsterKilled";
/** `(spawner: Spawner)` - a spawner shot to pieces; its cells are open floor from now on. */
export const SPAWNER_DESTROYED = "spawnerDestroyed";
/** `(hero: number, tileX: number, tileY: number)` - a hero picked up everything lying on that cell (see `Level.CollectPickupsAt`). */
export const PICKUP_COLLECTED = "pickupCollected";
/** `(hero: number, tileX: number, tileY: number)` - a hero who fell (or left) dropped the keys they carried, all on that cell, for the others to pick up. */
export const KEYS_DROPPED = "keysDropped";
/**
 * `(hero: number, tileX: number, tileY: number)` - a hero walked into an NPC (a `DIALOG` brush's cell) in a game where they can
 * talk (`World.SetTalk`: one hero, on one machine). `DungeonMain` starts the talk.
 */
export const NPC_BUMPED = "npcBumped";
/** `(hero: number, tileX: number, tileY: number)` - a talk with the NPC on that cell began: play holds still until `TALK_ENDED`. */
export const TALK_STARTED = "talkStarted";
/** The talk is over, and play goes on. */
export const TALK_ENDED = "talkEnded";
/**
 * `(id: string, state: QuestState, progress: number, was: QuestState)` - one of the level's quests was given, moved on, met its
 * goal or was handed in (see `Quests`): where it is now, how far toward its target, and the state it was in before.
 */
export const QUEST_UPDATED = "questUpdated";
