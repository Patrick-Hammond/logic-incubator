import {Container, Sprite, Texture} from "pixi.js";
import {CompositeTilemap} from "@logic-incubator/lib/tilemap";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import { TileSize } from "../Constants";
import Encounter from "../Encounter";
import MonsterRoster from "../level/entities/MonsterRoster";
import Level from "../level/Level";
import {Camera} from "./Camera";
import {ViewOrigin} from "./helpers/CameraWindow";
import {CentreTile} from "./helpers/PlayerMovement";
import {SpriteDrawPosition} from "./helpers/SpriteDrawOffset";
import {Player} from "./Player";
import {EntitiesLayer, LightTint, ProjectilesLayer, TileGD8Rotation} from "./TileMap";

/** Monsters' animation frames per ticker frame - see `AnimationSpeed` for tiles'. */
const MonsterAnimationSpeed = 0.15;
/** Multiplied into a monster's or spawner's light while it shows a hit - a tint can only darken, so red it is. */
const HitTint = 0xff4040;
/** How fast the player blinks while invulnerable after a hit, in blinks per second. */
const BlinkRate = 12;

/** One sprite to draw into the entities layer: `x`/`y` on screen (already offset by the view), `feet` its bottom edge in the world, which is what the draw order sorts by. */
type Drawable = {x: number; y: number; feet: number; texture: Texture; facingX: number; tint: number; alpha: number};

/** Each channel of two packed RGB tints multiplied together. */
function MultiplyTint(a: number, b: number): number {
    const r = (((a >> 16) & 0xff) * ((b >> 16) & 0xff)) / 255;
    const g = (((a >> 8) & 0xff) * ((b >> 8) & 0xff)) / 255;
    const bl = ((a & 0xff) * (b & 0xff)) / 255;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/**
 * Draws everything that moves - the player, monsters and spawners into the
 * entities layer, sorted by their feet so whoever's lower on screen is in
 * front; shots into the projectiles layer as sprites, turned to face their
 * flight. Skips whatever stands where the player can't see (`IsCellVisible`),
 * and lights each one by the cell it's on.
 */
export default class EntityRenderer {
    private entities: CompositeTilemap | null = null;
    private projectiles: Container | null = null;
    private sprites: Sprite[] = [];
    private frames = new Map<string, Texture[]>();
    private drawables: Drawable[] = [];

    constructor(private camera: Camera, private level: Level) {}

    /** Picks up the layers `TileMapView` has just (re)built - call on every `LEVEL_CREATED`. */
    Reset(): void {
        this.entities = this.camera.root.getChildByName(EntitiesLayer) as CompositeTilemap;
        this.projectiles = this.camera.root.getChildByName(ProjectilesLayer) as Container;
        // The old projectiles layer took its sprites with it when it was destroyed.
        this.sprites = [];
    }

    Render(player: Player, encounter: Encounter): void {
        if (!this.entities || !this.projectiles) {
            return;
        }

        // The entities layer is scaled by camera.EffectiveZoom like the player's own z band (see
        // TileMapView), so its window origin must be computed the exact same way - not the raw
        // ViewRect, which ignores that zoom and would drift sprites off their tiles the moment
        // EffectiveZoom moves off 1.
        const origin = ViewOrigin(this.camera.ViewRect.center, this.camera.BaseViewWidth, this.camera.BaseViewHeight, this.camera.EffectiveZoom);
        const drawables = this.drawables;
        drawables.length = 0;

        this.AddSpawners(encounter, origin);
        this.AddMonsters(encounter, origin);
        this.AddPlayer(player, origin);

        drawables.sort((a, b) => a.feet - b.feet);
        this.entities.clear();
        drawables.forEach(d => {
            this.entities.tile(d.texture, d.x, d.y, {tint: d.tint, alpha: d.alpha});
            if (d.facingX < 0) {
                this.entities.tileRotate(TileGD8Rotation(0, d.facingX, 1));
            }
        });

        this.RenderProjectiles(encounter, origin);
    }

    private AddSpawners(encounter: Encounter, origin: {x: number; y: number}): void {
        const name = MonsterRoster.inst.SpawnerSprite;
        const frames = name != null ? this.Frames(name) : [];
        if (!frames.length) {
            return;
        }
        encounter.spawners.forEach(state => {
            const {x, y} = state.spawner;
            if (state.destroyed || !this.level.IsCellVisible(x, y)) {
                return;
            }
            const texture = frames[0];
            const light = LightTint(this.level.LightAt(x, y));
            // Drawn top-left on its own cell, over the footprint that makes it solid (see `SpawnerCells`).
            this.drawables.push({
                x: (x - origin.x) * TileSize,
                y: (y - origin.y) * TileSize,
                feet: y * TileSize + texture.height,
                texture,
                facingX: 1,
                tint: encounter.spawnerFlash.has(state) ? MultiplyTint(light, HitTint) : light,
                alpha: 1
            });
        });
    }

    private AddMonsters(encounter: Encounter, origin: {x: number; y: number}): void {
        encounter.monsters.forEach(m => {
            const tile = CentreTile(m.position);
            if (!this.level.IsCellVisible(tile.x, tile.y)) {
                return;
            }
            const frames = this.Frames(m.moving ? m.def.run : m.def.idle);
            if (!frames.length) {
                return;
            }
            const texture = frames[Math.floor(m.animTime * MonsterAnimationSpeed) % frames.length];
            const light = LightTint(this.level.LightAt(tile.x, tile.y));
            const draw = SpriteDrawPosition(m.position, origin, texture);
            this.drawables.push({
                x: draw.x,
                y: draw.y,
                feet: m.position.y + TileSize,
                texture,
                facingX: m.facingX,
                tint: m.hitFlash > 0 ? MultiplyTint(light, HitTint) : light,
                alpha: 1
            });
        });
    }

    private AddPlayer(player: Player, origin: {x: number; y: number}): void {
        const tile = player.Tile;
        const texture = player.Texture;
        const draw = SpriteDrawPosition(player.Position, origin, texture);
        const {invulnerable} = player.Health;
        this.drawables.push({
            x: draw.x,
            y: draw.y,
            feet: player.Position.y + TileSize,
            texture,
            facingX: player.FacingX,
            tint: LightTint(this.level.LightAt(tile.x, tile.y)),
            alpha: invulnerable > 0 && Math.floor(invulnerable * BlinkRate) % 2 === 0 ? 0.25 : 1
        });
    }

    private RenderProjectiles(encounter: Encounter, origin: {x: number; y: number}): void {
        const projectiles = encounter.projectiles;
        while (this.sprites.length < projectiles.length) {
            const sprite = new Sprite(Texture.EMPTY);
            sprite.anchor.set(0.5);
            this.projectiles.addChild(sprite);
            this.sprites.push(sprite);
        }
        this.sprites.forEach((sprite, i) => {
            const p = projectiles[i];
            const frames = p ? this.Frames(p.sprite) : [];
            const cellX = p ? Math.floor(p.x / TileSize) : 0;
            const cellY = p ? Math.floor(p.y / TileSize) : 0;
            sprite.visible = frames.length > 0 && this.level.IsCellVisible(cellX, cellY);
            if (!sprite.visible) {
                return;
            }
            sprite.texture = frames[0];
            sprite.position.set(p.x - origin.x * TileSize, p.y - origin.y * TileSize);
            sprite.rotation = p.spriteAngle != null ? Math.atan2(p.vy, p.vx) - p.spriteAngle : 0;
            sprite.tint = LightTint(this.level.LightAt(cellX, cellY));
        });
    }

    /** Every frame of a sprite or animation, cached - none (after a one-off warning) if the sprite sheet hasn't got it. */
    private Frames(name: string): Texture[] {
        let frames = this.frames.get(name);
        if (!frames) {
            if (AssetFactory.inst.Has(name)) {
                frames = AssetFactory.inst.CreateTextures(name);
            } else {
                AssetFactory.inst.WarnMissing(name);
                frames = [];
            }
            this.frames.set(name, frames);
        }
        return frames;
    }
}
