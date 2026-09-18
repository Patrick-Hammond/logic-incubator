import {Sprite} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import {GameHeight, GameWidth, Scenes} from "../../Constants";
import sound from 'pixi-sound';
import { Tween } from "_lib/tween/Tweener";

/** Placeholder title scene: game name + a Start button leading into CharacterSelect. */
export class TitleScreen extends GameComponent {
    private _title: Sprite;
    constructor() {
        super();

        sound.add('theme', 'assets/title_theme.ogg');
        
        this._title = Sprite.from("title");
        this._title.anchor.set(0.5);
        this._title.alpha = 0;
        this._title.position.set(GameWidth / 2, GameHeight / 2);
        this._title.scale.set(Math.min(GameHeight / this._title.height, GameWidth / this._title.width));
        this._title.interactive = true;
        this.root.addChild(this._title);
    }

    OnShow() {
        sound.play('theme', { loop: true });

        this._title.once('pointerdown', () => {
            sound.stop('theme');
            this.game.sceneManager.ShowScene(Scenes.CHARACTER_SELECT);
        });

        Tween(this._title, { alpha: 1 }, 10000);
    }
}
