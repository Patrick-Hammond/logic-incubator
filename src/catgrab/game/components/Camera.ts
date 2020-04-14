
import {DisplayObject} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import { GameHeight, GameWidth, Scenes } from "../../Constants";
import gsap from "gsap";
import { ROUND_FINISHED, NEXT_ROUND } from "../Events";
import { KawaseBlurFilter } from "pixi-filters";

export default class Camera extends GameComponent {

    private scale: number = 1.5;
    private blur = new KawaseBlurFilter(4, 5);

    constructor() {
        super();

        this.AddToScene(Scenes.GAME);
        this.root.scale.set(this.scale);

        this.game.dispatcher.on(ROUND_FINISHED, this.OnRoundFinished, this);
        this.game.dispatcher.on(NEXT_ROUND, this.OnNextRound, this);
    }

    Follow(sprite: DisplayObject): void {
        const halfWidth = GameWidth / 2 / this.scale;
        const halfHeight = GameHeight / 2 / this.scale;

        const x = Math.min(Math.max(sprite.x - halfWidth, 0), GameWidth / 2);
        const y = Math.min(Math.max(sprite.y - halfHeight, 0), GameHeight / 2);

        gsap.to(this.root, 0.5, {x: -x, y: -y});
    }

    private OnRoundFinished(): void {
        this.root.filters = [this.blur];
    }

    private OnNextRound(): void {
        this.root.filters = null;
    }
}
