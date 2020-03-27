
import GameComponent from "../../_lib/game/GameComponent";
import { GameHeight, GameWidth, Scenes } from "../Constants";

export class Camera extends GameComponent {

    private scale: number = 1.5;

    constructor() {
        super();

        this.AddToScene(Scenes.GAME);

        this.root.scale.set(this.scale);
    }

    Follow(sprite: PIXI.DisplayObject): void {
        const halfWidth = GameWidth / 2 / this.scale;
        const halfHeight = GameHeight / 2 / this.scale;

        const x = Math.min(Math.max(sprite.x - halfWidth, 0), GameWidth / 2);
        const y = Math.min(Math.max(sprite.y - halfHeight, 0), GameHeight / 2);

        this.root.position.set(-x, -y);
    }
}
