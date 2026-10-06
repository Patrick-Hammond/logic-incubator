# particles

Fork of [`pixi-particles`](https://github.com/pixijs/pixi-particles) 4.3.1 (commit `6008d8d` of `pixijs-userland/particle-emitter`; MIT, see `LICENSE`). Changed from upstream: the pixi v4 and canvas-renderer code is removed (pixi.js 5.2.1, WebGL only); `Emitter` takes its ticker as an optional fourth constructor argument instead of always using `Ticker.shared`, has `originalConfig` and `originalArt` getters, and `ownerPos` and `rotation` are public (the in-game debug panel, `this.debug.Emitter`, reads them); `index.ts` also exports the config types; the rest are lint fixes. The config format is unchanged, so JSON exported by the [pixi-particles editor](https://pixijs.github.io/pixi-particles-editor/) loads as is.

## Usage

```ts
import {Emitter, OldEmitterConfig} from "@logic-incubator/lib/particles";
```

An emitter adds its particles to a `Container`, at a position in that container's space:

```ts
const config: OldEmitterConfig = { /* paste the editor's JSON */ };
const textures = AssetFactory.inst.CreateTextures("spark");   // a sprite or animation from a bundle
const emitter = new Emitter(layer, textures, config);         // several textures: a random one per particle
emitter.updateOwnerPos(x, y);                                 // where it spawns, added to config.pos
```

It starts emitting at once (`emit: false` in the config to hold it) and does not update itself (`autoUpdate: false`). Either drive it yourself, with the time in **seconds**, or give it a ticker:

```ts
emitter.update(game.ticker.deltaMS / 1000);                   // once a frame

const fire = new Emitter(layer, textures, {...config, autoUpdate: true}, game.ticker);
```

Starting, stopping and cleaning up:

```ts
emitter.playOnce(() => console.log("the last particle died"));
emitter.playOnceAndDestroy();   // the same, then destroys itself (turns autoUpdate on, so it needs a ticker)
emitter.emit = false;           // no new particles; the live ones finish
emitter.cleanup();              // kill the live ones now
emitter.destroy();              // release everything, including the ticker listener
```

A one-off burst is `spawnType: "burst"` with `particlesPerWave`, and an `emitterLifetime` between `frequency` and twice it, which gives exactly one wave. The particles of a wave share one lifetime.

### Living until they leave an area

Give the config a `killRect` and its particles no longer die of age: each lives until its centre leaves the rectangle, then is destroyed. The rectangle is in the stage's (global) coordinates, so make it bigger than the screen and particles can start outside it and drift in, and one config serves emitters in containers placed or scaled differently.

```ts
const rain = { ...config, killRect: { x: -100, y: -100, w: 1480, h: 920 } };   // the 1280 x 720 screen, and 100 px beyond it on every side
const emitter = new Emitter(layer, textures, rain);

emitter.killRect = new Rectangle(0, 0, 640, 480);   // or set (or clear, with null) in code: the next init() takes it from the config again
```

`lifetime` still matters: it is how long alpha, scale, colour and speed take to reach their end values, which the particle then holds - a snowflake that fades in over a second, then stays - while it keeps moving. A particle that never leaves the area (no speed, say) never dies, so mind `maxParticles`.

## In the engine

`DungeonMain` attaches an `Effects` component (`engine/src/view/Effects.ts`) inside the camera: over the world's layers, the entities and the shots, under the HUD. A game plays effects through it, at positions in world pixels - the space of `Monster.position`, a shot's `x`/`y` and `MONSTER_KILLED(type, x, y)` - and they scroll and zoom with the camera.

```ts
const Puff: OldEmitterConfig = {
    alpha: {start: 0.8, end: 0},
    scale: {start: 0.6, end: 1.2},
    color: {start: "ffffff", end: "aaaaaa"},
    speed: {start: 40, end: 5},
    startRotation: {min: 0, max: 360},
    lifetime: {min: 0.3, max: 0.6},
    blendMode: "normal",
    spawnType: "burst",
    particlesPerWave: 12,
    frequency: 0.5,
    emitterLifetime: 0.6,          // one wave
    maxParticles: 12,
    pos: {x: 0, y: 0}
};

// in a scene of the game, with `main` its DungeonMain: a puff where a monster died
this.Listen(this.game.dispatcher, MONSTER_KILLED, (_type: string, x: number, y: number) => {
    main.Effects?.Play("dust", Puff, x + TileSize / 2, y + TileSize / 2);
});
```

`Play(art, config, x, y)` takes the sprite or animation the particles use and the emitter's config, and returns the emitter - or `undefined`, after a warning, when `art` isn't loaded. `main.Effects` is `undefined` until the scene has been initialised.

- A burst needs no cleanup: an emitter that has stopped emitting and run out of particles is destroyed.
- A continuous effect (`emitterLifetime: -1`) runs until you stop it, then finishes the same way:

  ```ts
  const torch = main.Effects.Play("flame", TorchConfig, tileX * TileSize + TileSize / 2, tileY * TileSize);
  torch.updateOwnerPos(x, y);   // move it
  torch.emit = false;           // stop it; its particles die out
  ```

- Effects update only while the scene is shown, so they stop behind the editor, and are dropped when a new level is created (a restart included).
- `Effects` places its layer the way `EntityRenderer` places the entities layer (`view/helpers/EffectsPlacement.ts`), so there is no coordinate conversion to do.
