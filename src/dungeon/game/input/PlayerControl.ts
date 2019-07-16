import GameComponent from "../../../_lib/game/GameComponent";
import GamePad from "../../../_lib/io/GamePad";
import Keyboard, {Key} from "../../../_lib/io/Keyboard";
import {Vec2} from "../../../_lib/math/Geometry";

export interface PlayerInput {
    direction: Vec2;
}

export default class PlayerControl extends GameComponent {
    private inputVector = new Vec2();
    private playerInput: PlayerInput = { direction: new Vec2() };
    private keyboard: Keyboard;
    private gamePad: GamePad;

    constructor(private playerId: number) {
        super();

        this.keyboard = this.game.keyboard;
        this.gamePad = this.game.gamePad;
    }

    Get(): PlayerInput {
        this.inputVector.Set(0, 0);

        if (this.keyboard.AnyKeyPressed()) {
            if (this.keyboard.KeyPressed(Key.UpArrow)) {
                this.inputVector.Offset(0, -1);
            }
            if (this.keyboard.KeyPressed(Key.DownArrow)) {
                this.inputVector.Offset(0, 1);
            }
            if (this.keyboard.KeyPressed(Key.LeftArrow)) {
                this.inputVector.Offset(-1, 0);
            }
            if (this.keyboard.KeyPressed(Key.RightArrow)) {
                this.inputVector.Offset(1, 0);
            }
        } else {
            if (this.gamePad.controllers[this.playerId]) {
                this.inputVector.Copy(this.gamePad.GetStick(this.playerId, 1, 0.005));
            }
        }

        if (this.inputVector.length > 1) {
            this.playerInput.direction.Copy(this.inputVector.normalized);
        } else {
            this.playerInput.direction.Copy(this.inputVector);
        }

        return this.playerInput;
    }
}
