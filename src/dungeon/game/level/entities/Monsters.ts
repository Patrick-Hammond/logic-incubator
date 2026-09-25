/** Every monster a spawner can produce. Order is the order they're listed in the editor's spawner dialog. */
export const MonsterTypes = [
    "big_demon",
    "big_zombie",
    "chort",
    "goblin",
    "ice_zombie",
    "imp",
    "masked_orc",
    "muddy",
    "necromancer",
    "ogre",
    "orc_shaman",
    "orc_warrior",
    "pumpkin_dude",
    "skelet",
    "slug",
    "swampy",
    "tiny_zombie",
    "wogol"
] as const;

export type MonsterType = (typeof MonsterTypes)[number];

export function IsMonsterType(value: unknown): value is MonsterType {
    return typeof value === "string" && (MonsterTypes as ReadonlyArray<string>).indexOf(value) > -1;
}

/** Monsters that only ship a single `<type>_anim` loop in the spritesheet rather than separate idle/run animations. */
const SINGLE_ANIM_MONSTERS: ReadonlyArray<MonsterType> = ["ice_zombie", "muddy", "necromancer", "slug", "swampy"];

/** Name of the animation to show a monster standing still - `<type>_idle_anim`, or its only loop for the few without one. */
export function MonsterIdleAnimation(type: MonsterType): string {
    return SINGLE_ANIM_MONSTERS.indexOf(type) > -1 ? `${type}_anim` : `${type}_idle_anim`;
}

export type Monster = {
    id: string;
    name: string;
    hitPoints: number;
    attack: number;
    speed: number;
};
