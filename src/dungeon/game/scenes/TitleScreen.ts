import {Container, Sprite} from "pixi.js";
import {AnimatedGIF} from "@pixi/gif";
import GameComponent from "../../../_lib/game/GameComponent";
import {GameHeight, GameWidth, Scenes} from "../../Constants";
import sound from 'pixi-sound';
import {OldFilmFilter} from '@pixi/filter-old-film';
import { Tween, TweenWithOptions } from "_lib/tween/Tweener";
import { OverlayBlendFilter } from "_lib/filters/OverlayBlendFilter";
import { Easing } from "_lib/tween/Easing";

/** Placeholder title scene: game name + a Start button leading into CharacterSelect. */
export class TitleScreen extends GameComponent {
    /** Title + fire, so the fade and old film effect cover the blended result rather than just the title. */
    private _titleLayer: Container;
    private _title: Sprite;
    /** @pixi/gif's typings extend the untyped @pixi/sprite; at runtime that's the same Sprite pixi.js exports. */
    private _fire: AnimatedGIF & Sprite;
    private _fire2: AnimatedGIF & Sprite;
    private _fire3: AnimatedGIF & Sprite;
    private _oldFilmFilter: OldFilmFilter;
    constructor() {
        super();

        sound.add('theme', 'assets/title_theme.ogg');

        this._oldFilmFilter = new OldFilmFilter();
        this._oldFilmFilter.sepia = 0.602;
        this._oldFilmFilter.noise = 0.078;
        this._oldFilmFilter.noiseSize = 0.1899995803833;
        this._oldFilmFilter.scratch = 0.8;
        this._oldFilmFilter.scratchDensity = 0.5;
        this._oldFilmFilter.scratchWidth = 0.3;
        this._oldFilmFilter.vignetting = 1;
        this._oldFilmFilter.vignettingAlpha = 1;
        this._oldFilmFilter.vignettingBlur = 0.5;

        this._titleLayer = new Container();
        this._titleLayer.alpha = 0;
        this._titleLayer.filters = [this._oldFilmFilter];
        this.root.addChild(this._titleLayer);

        this._title = Sprite.from("title");
        this._title.anchor.set(0.5);
        this._title.position.set(GameWidth / 2, GameHeight / 2);
        this._title.scale.set(Math.min(GameHeight / this._title.height, GameWidth / this._title.width));
        this._title.interactive = true;
        this._titleLayer.addChild(this._title);

        // Stretched (not aspect-fit) to cover the title exactly.
        this._fire = AnimatedGIF.fromBuffer(this.game.loader.resources["fire"].data, { autoPlay: false }) as AnimatedGIF & Sprite;
        this._fire.anchor.set(0.5);
        this._fire.animationSpeed = 1;
        this._fire.position.copyFrom(this._title.position);
        this._fire.width = this._title.width;
        this._fire.height = this._title.height;
        this._fire.filters = [new OverlayBlendFilter(this._title)];
        this._titleLayer.addChild(this._fire);
        
        this._fire2 = AnimatedGIF.fromBuffer(this.game.loader.resources["fire"].data, { autoPlay: false }) as AnimatedGIF & Sprite;
        this._fire2.anchor.set(0.5);
        this._fire2.animationSpeed = 0.6;
        this._fire2.position.copyFrom(this._title.position);
        this._fire2.width = this._title.width;
        this._fire2.height = this._title.height*1.2;
        this._fire2.filters = [new OverlayBlendFilter(this._title)];
        this._titleLayer.addChild(this._fire2);

        this._fire3 = AnimatedGIF.fromBuffer(this.game.loader.resources["fire"].data, { autoPlay: false }) as AnimatedGIF & Sprite;
        this._fire3.anchor.set(0.5);
        this._fire3.alpha = 0;
        this._fire3.tint = 0xff0000;
        this._fire3.animationSpeed = 1.2;
        this._fire3.position.copyFrom(this._title.position);
        this._fire3.width = this._title.width;
        this._fire3.height = this._title.height*1.1;
        this._fire3.filters = [new OverlayBlendFilter(this._title)];
        this.root.addChild(this._fire3);
    }

    OnShow() {
        sound.play('theme', { loop: true });
        this._fire.play();
        this._fire2.play();
        this._fire3.play();

        this._title.once('pointerdown', () => {
            sound.stop('theme');
            this._fire.stop();
            this._fire2.stop();
            this._fire3.stop();
            tweenCancel();
            this.game.ticker.remove(this.OnUpdate, this);
            this.game.sceneManager.ShowScene(Scenes.CHARACTER_SELECT);
        });

        Tween(this._titleLayer, { alpha: 1 }, 3000);
        Tween(this._oldFilmFilter, { vignetting: 0.1 }, 3000);
        const tweenCancel = TweenWithOptions(this._fire3, { alpha: 0.6 }, 10000, {
            pingPong: true,
            repeat: Infinity,
            easing: Easing.Sine.InOut,
        });

        this.game.ticker.add(this.OnUpdate, this);
    }

    OnUpdate(delta: number) {
        this._oldFilmFilter.seed = Math.random();
    }
}
