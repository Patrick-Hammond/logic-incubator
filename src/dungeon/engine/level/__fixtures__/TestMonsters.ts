import { IMonsterRoster } from "../entities/MonsterRoster";

/** Stands in for a game's roster in tests of spawners and their editor: `MonsterRoster.inst.Load(TEST_MONSTERS)`. */
export const TEST_MONSTERS: IMonsterRoster = {
    types: ["goblin", "imp", "ogre"],
    defaultPool: ["goblin"],
    idleAnimation: type => `${type}_idle_anim`
};
