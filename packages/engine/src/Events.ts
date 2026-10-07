export const LEVEL_LOADED = "levelloaded";
export const LEVEL_CREATED = "levelCreated";
export const CAMERA_MOVED = "cameraMoved";
/** A hit landed on the player: `(damage: number, hitPointsLeft: number)`. */
export const PLAYER_DAMAGED = "playerDamaged";
/** The player's hit points reached 0. `DungeonMain` restarts the level shortly after - or waits to be told to, with `manualRestart`. */
export const PLAYER_DIED = "playerDied";
/** `DungeonMain.Pause()` stopped play. */
export const GAME_PAUSED = "gamePaused";
/** `DungeonMain.Resume()` set play going again. */
export const GAME_RESUMED = "gameResumed";
/** `(type: MonsterType, x: number, y: number)` - the monster's type and pixel position when it died. */
export const MONSTER_KILLED = "monsterKilled";
/** `(spawner: Spawner)` - a spawner shot to pieces; its cells are open floor from now on. */
export const SPAWNER_DESTROYED = "spawnerDestroyed";
