/**
 * Shots - the player's and monsters' - and the box tests for who touches whom.
 * Pure - no pixi - so it runs under the plain node test runner, same as
 * Spawners.ts.
 */

import { RectangleLike, Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { LightValue } from "../Lighting";

export type ProjectileOwner = "player" | "monster";

/** What a shot is: the player's is set by the game (see `DungeonMain`), a monster's by its `MonsterDef.ranged`. */
export type ShotSetup = {
    /** Sprite (or animation) name. */
    sprite: string;
    /** Direction the sprite's art points, in radians (0 = right, -PI/2 = up), so it's turned to face its flight. Leave out to draw it upright whichever way it flies. */
    spriteAngle?: number;
    /** Pixels per step (a 60th of a second). */
    speed: number;
    damage: number;
    /** Tiles it flies before fizzling out. */
    range: number;
    /** A light it carries as it flies - a fireball, a glowing bolt. Leave out for a shot that gives no light. */
    light?: LightValue;
    /** The sound it's fired with, by name (see `SoundBoard`) - left out, the game's `SoundTable.heroShot` or `monsterShot`. */
    sound?: string;
    /** The sound it makes stopping against a wall - left out, the game's `SoundTable.shotWall`. */
    wallSound?: string;
};

/** A `ShotSetup` that fires repeatedly - the player's while fire is held, a monster's `MonsterDef.ranged` at will. */
export type Weapon = ShotSetup & {
    /** Seconds between shots. */
    cooldown: number;
};

/** A `Weapon` plus the icon the HUD shows in the active-weapon slot while it's equipped - see `Hero.EquippedWeapon`. */
export type WeaponDef = {
    icon: string;
    shot: Weapon;
};

export type Projectile = {
    /** Which shot it is, for as long as it flies - unique in its encounter until the encounter's next `Reset` (see `Encounter.Fire`). */
    id: number;
    /** Centre, in pixels. */
    x: number;
    y: number;
    /** Where its centre was before the last step - what drawing between steps starts from. */
    px: number;
    py: number;
    /** Pixels per step (a 60th of a second). */
    vx: number;
    vy: number;
    owner: ProjectileOwner;
    /** The index of the hero who fired it - -1 for a monster's. */
    hero: number;
    /** Online, the `seq` of the hero's input that fired it (see `IPlayerInput.seq`) - -1 for none: how a guest knows its own shots, which it draws ahead of the host's (see `Replica`). */
    seq: number;
    /** What it was fired as: the weapon's shot, or the monster's. */
    setup: ShotSetup;
    damage: number;
    sprite: string;
    spriteAngle?: number;
    /** Pixels left to fly. */
    range: number;
    dead: boolean;
    /** The light it carries, from its `ShotSetup` - none for most shots. */
    light?: LightValue;
};

/** Side of the square a shot hits with, in pixels - smaller than its art, so near misses stay misses. */
export const ProjectileSize = 6;

/** How far a touch box sits inside an entity's one-tile box on each side, so only a real overlap counts. */
export const ContactInset = 2;

/** Fired from `from` (a centre) along `direction` (any length - it's normalised). */
export function CreateProjectile(from: Vec2Like, direction: Vec2Like, shot: ShotSetup, owner: ProjectileOwner, tileSize: number, id = 0, hero = -1, seq = -1): Projectile {
    const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y) || 1;
    return {
        id,
        x: from.x,
        y: from.y,
        px: from.x,
        py: from.y,
        vx: (direction.x / length) * shot.speed,
        vy: (direction.y / length) * shot.speed,
        owner,
        hero,
        seq,
        setup: shot,
        damage: shot.damage,
        sprite: shot.sprite,
        spriteAngle: shot.spriteAngle,
        range: shot.range * tileSize,
        dead: false,
        light: shot.light
    };
}

/**
 * Moves a shot one frame (`dt` frames' worth), in steps of under half a tile so a fast one
 * can't skip over a wall. It dies on reaching a cell `isBlocked` says it can't enter - which
 * is returned, so the caller can tell what it hit - or on running out of range (returns null).
 */
export function StepProjectile(
    projectile: Projectile,
    dt: number,
    isBlocked: (tileX: number, tileY: number) => boolean,
    tileSize: number
): Vec2Like | null {
    if (projectile.dead) {
        return null;
    }
    projectile.px = projectile.x;
    projectile.py = projectile.y;
    const dx = projectile.vx * dt;
    const dy = projectile.vy * dt;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(distance / (tileSize * 0.5)));
    for (let i = 0; i < steps; i++) {
        projectile.x += dx / steps;
        projectile.y += dy / steps;
        const cell = { x: Math.floor(projectile.x / tileSize), y: Math.floor(projectile.y / tileSize) };
        if (isBlocked(cell.x, cell.y)) {
            projectile.dead = true;
            return cell;
        }
    }
    projectile.range -= distance;
    if (projectile.range <= 0) {
        projectile.dead = true;
    }
    return null;
}

export function ProjectileBox(projectile: Projectile): RectangleLike {
    const half = ProjectileSize / 2;
    return { x: projectile.x - half, y: projectile.y - half, width: ProjectileSize, height: ProjectileSize };
}

/** The part of an entity's one-tile box (top-left `position`, like the player's) that counts for touching. */
export function ContactBox(position: Vec2Like, tileSize: number): RectangleLike {
    const size = tileSize - 1 - ContactInset * 2;
    return { x: position.x + ContactInset, y: position.y + ContactInset, width: size, height: size };
}

/**
 * What a shot hits on a monster: the frame it's drawn with (see `SpriteDrawPosition` - feet
 * on the bottom of its one-tile box at `position`, centred across it), inset like `ContactBox`.
 * Bigger than the box it walks with, so a tall monster can be shot in the head.
 */
export function SpriteBox(position: Vec2Like, size: { width: number; height: number }, tileSize: number): RectangleLike {
    return {
        x: position.x + (tileSize - size.width) * 0.5 + ContactInset,
        y: position.y + tileSize - size.height + ContactInset,
        width: Math.max(1, size.width - ContactInset * 2),
        height: Math.max(1, size.height - ContactInset * 2)
    };
}

/**
 * A sprite's frame size, in pixels, and the part of it that isn't see-through, if that's known (`trim`, from its frame's
 * top-left) - a pixi `Texture` from a trimmed atlas is one. Without `trim`, the whole frame counts.
 */
export type SpriteSize = { width: number; height: number; trim?: RectangleLike | null };

/**
 * One `SpriteSize` for every frame of an animation: the largest frame, and every pixel any frame draws (the union of
 * their `trim`s - a frame without one counts whole). Undefined for no frames.
 */
export function ArtBounds(frames: ReadonlyArray<SpriteSize>): SpriteSize | undefined {
    if (!frames.length) {
        return undefined;
    }
    let width = 0;
    let height = 0;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    frames.forEach(frame => {
        width = Math.max(width, frame.width);
        height = Math.max(height, frame.height);
        const art = frame.trim || { x: 0, y: 0, width: frame.width, height: frame.height };
        left = Math.min(left, art.x);
        top = Math.min(top, art.y);
        right = Math.max(right, art.x + art.width);
        bottom = Math.max(bottom, art.y + art.height);
    });
    const whole = left <= 0 && top <= 0 && right >= width && bottom >= height;
    return whole ? { width, height } : { width, height, trim: { x: left, y: top, width: right - left, height: bottom - top } };
}

/**
 * The pixels a sprite of `size` draws for an entity whose one-tile box is at `position`: its frame placed as
 * `SpriteDrawPosition` places it - feet on the bottom of the box, centred across it - less what's see-through
 * round it (`trim`). What a hero picks things up with (see `Hero.Figure`).
 */
export function FigureBox(position: Vec2Like, size: SpriteSize, tileSize: number): RectangleLike {
    const x = position.x + (tileSize - size.width) * 0.5;
    const y = position.y + tileSize - size.height;
    const art = size.trim;
    return art ? { x: x + art.x, y: y + art.y, width: art.width, height: art.height } : { x, y, width: size.width, height: size.height };
}

export function Overlaps(a: RectangleLike, b: RectangleLike): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
