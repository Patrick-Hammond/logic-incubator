import { Chase } from "../entities/Behaviours";
import { IMonsterRoster, MonsterDef } from "../entities/MonsterRoster";

function TestDef(type: string): MonsterDef {
    return {
        idle: `${type}_idle_anim`,
        run: `${type}_run_anim`,
        hitPoints: 2,
        speed: 0.5,
        contactDamage: 1,
        contactCooldown: 1,
        behaviour: () => new Chase()
    };
}

/** Stands in for a game's roster in tests of spawners and their editor: `MonsterRoster.inst.Load(TEST_MONSTERS)`. */
export const TEST_MONSTERS: IMonsterRoster = {
    types: ["goblin", "imp", "ogre"],
    defaultPool: ["goblin"],
    defs: { goblin: TestDef("goblin"), imp: TestDef("imp"), ogre: TestDef("ogre") }
};
