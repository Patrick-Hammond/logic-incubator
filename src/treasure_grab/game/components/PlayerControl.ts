import GameComponent from "../../../_lib/game/GameComponent";
import GamePad from "../../../_lib/io/GamePad";
import Keyboard, {Key} from "../../../_lib/io/Keyboard";
import {Directions} from "../../../_lib/utils/Types";

export default class PlayerControl extends GameComponent {
    private keyboard: Keyboard;
    private gamePad: GamePad;

    constructor(private playerId: number) {
        super();

        this.keyboard = this.game.keyboard;
        this.gamePad = this.game.gamePad;
    }

    Get(): Directions {

        if (this.keyboard.AnyKeyPressed()) {
            if (this.keyboard.KeyPressed(Key.UpArrow)) {
                return "up";
            }
            if (this.keyboard.KeyPressed(Key.DownArrow)) {
                return "down";
            }
            if (this.keyboard.KeyPressed(Key.LeftArrow)) {
                return "left";
            }
            if (this.keyboard.KeyPressed(Key.RightArrow)) {
                return "right";
            }
        }

        if (this.gamePad.controllers[this.playerId]) {
            return this.gamePad.GetStickDirection(this.playerId, 0, 0.005);
        }

        return "none";
    }
}
