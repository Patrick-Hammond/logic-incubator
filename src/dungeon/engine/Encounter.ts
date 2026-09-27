/**
 * Everything alive in a level besides the player: spawners producing monsters,
 * monsters hunting the player, and everyone's shots. `DungeonMain` runs it one
 * frame at a time; `EntityRenderer` draws it. No pixi in here - events go out
 * through an injected `emit`, sprite sizes come in through `sizeFor` - so it
 * runs under the plain node test runner too (see Encounter.test.ts).
 */

import { RectangleLike, Vec2, Vec2Like } from "../../_lib/math/Geometry";
import { PlayerSpeed, TileSize } from "../Constants";
import { MONSTER_KILLED, PLAYER_DAMAGED, PLAYER_DIED, SPAWNER_DESTROYED } from "./Events";
import { IMonsterBehaviour, Separation } from "./level/entities/Behaviours";
import FlowField, { UNREACHABLE } from "./level/entities/FlowField";
import { Health, IsDead } from "./level/entities/Health";
import MonsterRoster, { MonsterDef, MonsterType } from "./level/entities/MonsterRoster";
import { ContactBox, CreateProjectile, Overlaps, Projectile, ProjectileBox, ProjectileOwner, ShotSetup, SpriteBox, StepProjectile } from "./level/entities/Projectiles";
import { CreateSpawnerState, DamageSpawner, RecordDeath, RecordSpawn, SpawnCell, Spawner, SpawnerState, StepSpawner } from "./level/entities/Spawners";
import TileCollision from "./level/TileCollision";
import { BoxCentre, CentreTile, ResolveMove } from "./view/helpers/PlayerMovement";

/** Most monsters alive at once, across every spawner - spawners wait while the level is at it. */
export const MaxMonsters = 150;
/** Seconds a monster or spawner shows it's been hit. */
export const HitFlashTime = 0.15;
/** How close (px) monsters get before pushing each other apart - see `Separation`. */
const SeparationRadius = TileSize * 0.8;

/** The parts of `Level` an encounter uses. */
export interface EncounterLevel {
    spawners: Spawner[];
    collisionData: boolean[][];
    boundRect: { width: number; height: number };
    IsSolid(tileX: number, tileY: number): boolean;
    IsCellVisible(tileX: number, tileY: number): boolean;
    RemoveSpawner(spawner: Spawner): void;
}

/** The parts of `Player` an encounter uses. */
export interface EncounterPlayer {
    readonly Position: Vec2Like;
    readonly Centre: Vec2Like;
    readonly Tile: Vec2Like;
    readonly Health: Health;
    Damage(damage: number): boolean;
}

export type EncounterOptions = {
    /** Where the encounter's events (see Events.ts) go - the game's dispatcher. */
    emit: (event: string, ...args: unknown[]) => void;
    /** Pixel size of a sprite or animation, or undefined if there's no such thing - what a monster's shootable box is sized from. */
    sizeFor: (name: string) => { width: number; height: number } | undefined;
    /** `[0, 1)`, like `Math.random` - which monster a spawner picks, where wanderers wander. */
    random?: () => number;
};

export type Monster = {
    type: MonsterType;
    def: MonsterDef;
    behaviour: IMonsterBehaviour;
    /** Top-left of its one-tile collision box, in pixels - like the player's. */
    position: Vec2;
    velocity: Vec2;
    hitPoints: number;
    /** Size of its idle frame - see `SpriteBox`. */
    size: { width: number; height: number };
    facingX: number;
    moving: boolean;
    /** Frames it's been animating - offset at random so a crowd doesn't step in lockstep. */
    animTime: number;
    /** Seconds before its touch can hurt again. */
    contactCooldown: number;
    /** Seconds before it can shoot again. */
    rangedCooldown: number;
    /** Seconds left showing it's been hit. */
    hitFlash: number;
    spawner: SpawnerState | null;
    dead: boolean;
};

export default class Encounter {
    monsters: Monster[] = [];
    projectiles: Projectile[] = [];
    spawners: SpawnerState[] = [];
    /** Seconds left showing a spawner's been hit. */
    readonly spawnerFlash = new Map<SpawnerState, number>();

    private flow: FlowField;
    private collision: TileCollision;
    private random: () => number;
    private positions: Vec2Like[] = [];

    constructor(private level: EncounterLevel, private options: EncounterOptions) {
        this.random = options.random || Math.random;
        this.collision = new TileCollision(level);
        this.Reset();
    }

    /** Starts over from the level's spawners, as just loaded. Call on every `LEVEL_CREATED`. */
    Reset(): void {
        this.monsters = [];
        this.projectiles = [];
        this.spawners = this.level.spawners.map(CreateSpawnerState);
        this.spawnerFlash.clear();
        this.flow = new FlowField(this.level.boundRect.width, this.level.boundRect.height, (x, y) => this.level.IsSolid(x, y));
    }

    /** Walking distances to the player, as of the last `Update`. */
    get Flow(): FlowField {
        return this.flow;
    }

    /** Fires a shot from `from` (a centre, in pixels) along `direction`. */
    Fire(from: Vec2Like, direction: Vec2Like, shot: ShotSetup, owner: ProjectileOwner): void {
        this.projectiles.push(CreateProjectile(from, direction, shot, owner, TileSize));
    }

    /** One frame: `dt` in frames (the ticker's delta, which movement is tuned to), `seconds` of real time for timers. */
    Update(dt: number, seconds: number, player: EncounterPlayer): void {
        const tile = player.Tile;
        this.flow.Update(tile.x, tile.y);

        this.StepSpawners(seconds);
        this.StepMonsters(dt, seconds, player);
        this.StepProjectiles(dt, player);

        this.spawnerFlash.forEach((time, state) => {
            if (time <= seconds) {
                this.spawnerFlash.delete(state);
            } else {
                this.spawnerFlash.set(state, time - seconds);
            }
        });
        if (this.monsters.some(m => m.dead)) {
            this.monsters = this.monsters.filter(m => !m.dead);
        }
        if (this.projectiles.some(p => p.dead)) {
            this.projectiles = this.projectiles.filter(p => !p.dead);
        }
    }

    private StepSpawners(seconds: number): void {
        const isOpen = (x: number, y: number) => !this.level.IsSolid(x, y);
        const distanceAt = (x: number, y: number) => this.flow.DistanceAt(x, y);
        this.spawners.forEach(state => {
            if (state.destroyed) {
                return;
            }
            const cell = SpawnCell(state.spawner.cells, isOpen, distanceAt);
            const type = StepSpawner(state, seconds, cell ? this.flow.DistanceAt(cell.x, cell.y) : UNREACHABLE, this.random);
            const def = type != null ? MonsterRoster.inst.Def(type) : undefined;
            if (cell && def && this.monsters.length < MaxMonsters) {
                this.monsters.push(this.CreateMonster(type, def, cell, state));
                RecordSpawn(state);
            }
        });
    }

    private CreateMonster(type: MonsterType, def: MonsterDef, cell: Vec2Like, spawner: SpawnerState | null): Monster {
        return {
            type,
            def,
            behaviour: def.behaviour(),
            position: new Vec2(cell.x * TileSize, cell.y * TileSize),
            velocity: new Vec2(),
            hitPoints: def.hitPoints,
            size: this.options.sizeFor(def.idle) || { width: TileSize, height: TileSize },
            facingX: 1,
            moving: false,
            animTime: this.random() * 100,
            contactCooldown: 0,
            // Staggered, so a pack of casters doesn't volley in unison.
            rangedCooldown: def.ranged ? def.ranged.cooldown * this.random() : 0,
            hitFlash: 0,
            spawner,
            dead: false
        };
    }

    private StepMonsters(dt: number, seconds: number, player: EncounterPlayer): void {
        const positions = this.positions;
        positions.length = 0;
        this.monsters.forEach(m => positions.push(m.position));

        const playerPosition = player.Position;
        const playerBox = ContactBox(playerPosition, TileSize);
        const playerCentre = player.Centre;

        this.monsters.forEach((m, index) => {
            const tile = CentreTile(m.position);
            const steer = m.behaviour.Steer({
                position: m.position,
                tile,
                player: playerPosition,
                flow: this.flow,
                tileSize: TileSize,
                dt: seconds,
                random: this.random
            });
            const push = Separation(index, positions, SeparationRadius);
            let x = steer.x + push.x;
            let y = steer.y + push.y;
            const length = Math.sqrt(x * x + y * y);
            if (length > 1) {
                x /= length;
                y /= length;
            }
            m.velocity.Offset(x, y);
            ResolveMove(m.position, m.velocity, dt, this.collision, PlayerSpeed * m.def.speed);

            // Faces where it means to go - or at the player while it holds still.
            const faceX = Math.abs(steer.x) > 0.1 ? steer.x : playerPosition.x - m.position.x;
            if (faceX !== 0) {
                m.facingX = faceX < 0 ? -1 : 1;
            }
            m.moving = Math.abs(m.velocity.x) + Math.abs(m.velocity.y) > 0.1;
            m.animTime += dt;
            m.contactCooldown = Math.max(0, m.contactCooldown - seconds);
            m.rangedCooldown = Math.max(0, m.rangedCooldown - seconds);
            m.hitFlash = Math.max(0, m.hitFlash - seconds);

            if (m.def.contactDamage > 0 && m.contactCooldown === 0 && Overlaps(ContactBox(m.position, TileSize), playerBox)) {
                m.contactCooldown = m.def.contactCooldown;
                this.HurtPlayer(player, m.def.contactDamage);
            }

            const ranged = m.def.ranged;
            if (ranged && m.rangedCooldown === 0 && this.level.IsCellVisible(tile.x, tile.y)) {
                const centre = BoxCentre(m.position);
                const toPlayer = { x: playerCentre.x - centre.x, y: playerCentre.y - centre.y };
                if (Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.y * toPlayer.y) <= ranged.range * TileSize) {
                    this.Fire(centre, toPlayer, ranged, "monster");
                    m.rangedCooldown = ranged.cooldown;
                }
            }
        });
    }

    private StepProjectiles(dt: number, player: EncounterPlayer): void {
        // Nothing flies into a room the player can't see (or through a closed door into one).
        const blocked = (x: number, y: number) => this.level.IsSolid(x, y) || !this.level.IsCellVisible(x, y);
        const playerBox = ContactBox(player.Position, TileSize);

        this.projectiles.forEach(p => {
            const hitCell = StepProjectile(p, dt, blocked, TileSize);
            if (p.dead) {
                if (hitCell && p.owner === "player") {
                    this.HitSpawnerAt(hitCell, p.damage);
                }
                return;
            }
            const box = ProjectileBox(p);
            if (p.owner === "player") {
                const target = this.monsters.find(m => !m.dead && Overlaps(box, this.MonsterHitBox(m)));
                if (target) {
                    this.HurtMonster(target, p.damage);
                    p.dead = true;
                }
            } else if (Overlaps(box, playerBox)) {
                this.HurtPlayer(player, p.damage);
                p.dead = true;
            }
        });
    }

    private MonsterHitBox(m: Monster): RectangleLike {
        return SpriteBox(m.position, m.size, TileSize);
    }

    private HurtMonster(m: Monster, damage: number): void {
        m.hitPoints -= damage;
        m.hitFlash = HitFlashTime;
        if (m.hitPoints <= 0) {
            m.dead = true;
            if (m.spawner) {
                RecordDeath(m.spawner);
            }
            this.options.emit(MONSTER_KILLED, m.type, m.position.x, m.position.y);
        }
    }

    private HitSpawnerAt(cell: Vec2Like, damage: number): void {
        const state = this.spawners.find(s => !s.destroyed && s.spawner.cells.some(c => c.x === cell.x && c.y === cell.y));
        // An indestructible one doesn't flinch - so it reads as such.
        if (!state || state.spawner.value.hitPoints === 0) {
            return;
        }
        this.spawnerFlash.set(state, HitFlashTime);
        if (DamageSpawner(state, damage)) {
            this.spawnerFlash.delete(state);
            this.level.RemoveSpawner(state.spawner);
            this.flow.MarkDirty();
            this.options.emit(SPAWNER_DESTROYED, state.spawner);
        }
    }

    private HurtPlayer(player: EncounterPlayer, damage: number): void {
        if (!player.Damage(damage)) {
            return;
        }
        this.options.emit(PLAYER_DAMAGED, damage, player.Health.hitPoints);
        if (IsDead(player.Health)) {
            this.options.emit(PLAYER_DIED);
        }
    }
}
