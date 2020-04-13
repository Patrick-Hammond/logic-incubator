
import {DisplayObject} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import { GameHeight, GameWidth, Scenes } from "../../Constants";
import gsap from "gsap";

export class Camera extends GameComponent {

    private scale: number = 1.5;

    constructor() {
        super();

        this.AddToScene(Scenes.GAME);

        this.root.scale.set(this.scale);
    }

    Follow(sprite: DisplayObject): void {
        const halfWidth = GameWidth / 2 / this.scale;
        const halfHeight = GameHeight / 2 / this.scale;

        const x = Math.min(Math.max(sprite.x - halfWidth, 0), GameWidth / 2);
        const y = Math.min(Math.max(sprite.y - halfHeight, 0), GameHeight / 2);

        gsap.to(this.root, 0.5, {x: -x, y: -y});
    }
}
