import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import { Emitter, EmitterConfig, OldEmitterConfig } from "@logic-incubator/lib/particles";
import { LEVEL_CREATED } from "../Events";
import { Camera } from "./Camera";
import { EffectsPlacement } from "./helpers/EffectsPlacement";

/** An emitter's settings: what the particle editor exports (`OldEmitterConfig`), or the newer `EmitterConfig`. */
export type EffectConfig = EmitterConfig | OldEmitterConfig;

/**
 * Particle effects over the world. `Play` an effect at a position in world pixels - the space
 * `Monster.position`, a shot's `x`/`y` and `MONSTER_KILLED`'s `(type, x, y)` are in - and it draws
 * above the entities and shots (and below the HUD), moving and zooming with the camera.
 *
 * Its layer sits in the camera's root and is placed every frame the way `EntityRenderer` places
 * the entities layer (see `EffectsPlacement`), so the emitters need no coordinate conversion.
 * `TileMapView` rebuilds its own layers on every level load, so on `LEVEL_CREATED` this layer is
 * put back on top of them, and the level's effects are dropped.
 *
 * Emitters are updated here, from `Tick`: they run only while the scene is shown, and a finished
 * one - not emitting, no particles left - is destroyed, so a burst needs no cleanup. A continuous
 * effect (`emitterLifetime: -1`) runs until `emitter.emit = false`, then is cleaned up the same way.
 */
export default class Effects extends GameComponent {
    private emitters: Emitter[] = [];
    private warned = new Set<string>();
    private disposed = false;

    constructor(private camera: Camera) {
        super();
    }

    /**
     * Starts an effect at (`x`, `y`) in world pixels: `art` is the sprite or animation its particles
     * use (several frames: each particle takes one at random), `config` the emitter's settings.
     * Returns the emitter, so a continuous effect can be moved (`updateOwnerPos`) or stopped
     * (`emit = false`) - or undefined, after a one-off warning, when `art` isn't loaded.
     */
    Play(art: string, config: EffectConfig, x: number, y: number): Emitter | undefined {
        if (this.disposed) {
            return undefined;
        }
        const assets = AssetFactory.inst;
        if (!assets.Has(art)) {
            if (!this.warned.has(art)) {
                this.warned.add(art);
                console.warn(`"${art}" is not a loaded sprite or animation - skipping the effect that uses it.`);
            }
            return undefined;
        }
        const emitter = new Emitter(this.root, assets.CreateTextures(art), config);
        // Updated below, with the scene. An editor export can ask for autoUpdate, which would run it on the shared ticker as well.
        emitter.autoUpdate = false;
        emitter.updateOwnerPos(x, y);
        this.emitters.push(emitter);
        return emitter;
    }

    protected OnInitialise(): void {
        this.root.interactiveChildren = false;
        this.Listen(this.game.dispatcher, LEVEL_CREATED, this.OnLevelCreated);
        this.Tick(this.OnUpdate);
    }

    protected OnDestroy(): void {
        this.disposed = true;
        this.Clear();
    }

    private OnLevelCreated(): void {
        this.Clear();
        // The layers TileMapView has just added are above this one otherwise.
        this.camera.root.addChild(this.root);
    }

    private OnUpdate(): void {
        const camera = this.camera;
        const placement = EffectsPlacement(camera.ViewRect.center, camera.BaseViewWidth, camera.BaseViewHeight, camera.Scale, camera.EffectiveZoom);
        this.root.scale.set(placement.scale);
        this.root.position.set(placement.x, placement.y);

        const seconds = this.game.ticker.deltaMS / 1000;
        const emitters = this.emitters;
        let kept = 0;
        for (let i = 0; i < emitters.length; i++) {
            const emitter = emitters[i];
            emitter.update(seconds);
            if (!emitter.parent) {
                continue; // the caller destroyed it
            }
            if (emitter.emit || emitter.particleCount > 0) {
                emitters[kept++] = emitter;
            } else {
                emitter.destroy();
            }
        }
        emitters.length = kept;
    }

    private Clear(): void {
        this.emitters.forEach(emitter => emitter.destroy());
        this.emitters = [];
    }
}
