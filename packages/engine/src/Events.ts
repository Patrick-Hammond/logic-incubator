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
/**
 * `(type: MonsterType, x: number, y: number, hero: number, boss: boolean)` - the monster's type and pixel position when it died, the
 * slot of the hero whose shot killed it (-1 for none), and whether it was a boss (placed by a `BOSS` brush).
 */
export const MONSTER_KILLED = "monsterKilled";
/** `(type: MonsterType)` - a shot hit a monster, and it lived (`MONSTER_KILLED` when it doesn't). */
export const MONSTER_HIT = "monsterHit";
/** `(type: MonsterType)` - a spawner made a monster. */
export const MONSTER_SPAWNED = "monsterSpawned";
/** `(type: MonsterType)` - a boss woke: a hero came near it, or shot it. */
export const BOSS_WOKE = "bossWoke";
/** `(spawner: Spawner)` - a shot hit a spawner, and it stands (`SPAWNER_DESTROYED` when it doesn't). */
export const SPAWNER_HIT = "spawnerHit";
/** `(hero: number)` - hero `hero` (their slot) cast their light spell: their mage-light is lit. */
export const LIGHT_SPELL_CAST = "lightSpellCast";
/** `(shot: ShotSetup, hero: number)` - a shot was fired, by hero `hero` (their slot) or by a monster (-1). */
export const SHOT_FIRED = "shotFired";
/** `(shot: ShotSetup)` - a shot stopped against a wall, a closed door or the dark. */
export const SHOT_STOPPED = "shotStopped";
/** `(sprite: string, index: number)` - door `index` (of `Level.doors`) opened, and is drawn as `sprite` now. */
export const DOOR_OPENED = "doorOpened";
/** `(sprite: string, index: number)` - door `index` shut, and is drawn as `sprite` now. */
export const DOOR_CLOSED = "doorClosed";
/** `(hero: number, tileX: number, tileY: number)` - a hero walked into a door on that cell that no one in the team has the key for. Once, until they walk away from it. */
export const DOOR_LOCKED = "doorLocked";
/** `(spawner: Spawner)` - a spawner shot to pieces; its cells are open floor from now on. */
export const SPAWNER_DESTROYED = "spawnerDestroyed";
/**
 * `(hero: number, tileX: number, tileY: number, collected: CollectedPickup[])` - a hero picked up everything lying on that cell (see
 * `Level.CollectPickupsAt`): what that was, each with the sprite it was drawn as.
 */
export const PICKUP_COLLECTED = "pickupCollected";
/** `(hero: number, tileX: number, tileY: number)` - a hero who fell (or left) dropped the keys they carried, all on that cell, for the others to pick up. */
export const KEYS_DROPPED = "keysDropped";
/**
 * `(hero: number, fromX: number, fromY: number, toX: number, toY: number)` - a hero walked onto the portal on the first cell and came out of
 * the one on the second (see `Portals`). On a shared screen the rest of the party came too, around them, and this is the only one said.
 */
export const HERO_TELEPORTED = "heroTeleported";
/**
 * `(hero: number, tileX: number, tileY: number)` - a hero walked into an NPC (a `DIALOG` brush's cell) in a game where they can
 * talk (`World.SetTalk`: one hero, on one machine). `DungeonMain` starts the talk.
 */
export const NPC_BUMPED = "npcBumped";
/**
 * `(hero: number, index: number, tileX: number, tileY: number, sprite: string)` - a hero pushed something (see `Pushables`): which,
 * by its place in `Level.pushables`, the cell it's on now, and the sprite it is.
 */
export const OBJECT_PUSHED = "objectPushed";
/** `(hero: number, tileX: number, tileY: number)` - a talk with the NPC on that cell began: play holds still until `TALK_ENDED`. */
export const TALK_STARTED = "talkStarted";
/** The talk is over, and play goes on. */
export const TALK_ENDED = "talkEnded";
/** The talk went on to its next line (`TALK_STARTED` is its first). */
export const TALK_LINE = "talkLine";
/** `(tileX: number, tileY: number)` - the NPC on that cell called out something new, in a speech bubble (see `Shouts`). */
export const NPC_SHOUTED = "npcShouted";
/**
 * `(id: string, state: QuestState, progress: number, was: QuestState)` - one of the level's quests was given, moved on, met its
 * goal or was handed in (see `Quests`): where it is now, how far toward its target, and the state it was in before.
 */
export const QUEST_UPDATED = "questUpdated";
/**
 * `(id: string, text: string)` - a dialog script gave one of the level's quests a note, a hint or a comment on how it's going
 * (`notify`, see `QuestLog.Notify`). Only in a talk, so only in a Quest - never online.
 */
export const QUEST_NOTED = "questNoted";
