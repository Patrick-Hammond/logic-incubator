import GameComponent from "@logic-incubator/lib/game/GameComponent";
import GamePad from "@logic-incubator/lib/io/GamePad";
import Keyboard, {Key} from "@logic-incubator/lib/io/Keyboard";
import {Vec2} from "@logic-incubator/lib/math/Geometry";

export interface IPlayerInput {
    direction: Vec2;
    /** Which way to shoot - zero when not shooting. Robotron-style: WASD (arrows move), or a gamepad's right stick. */
    fire: Vec2;
}

export default class PlayerControl extends GameComponent {
    private inputVector = new Vec2();
    private fireVector = new Vec2();
    private playerInput: IPlayerInput = { direction: new Vec2(), fire: new Vec2() };
    private keyboard: Keyboard;
    private gamePad: GamePad;

    constructor(private playerId: number) {
        super();

        this.keyboard = this.game.keyboard;
        this.gamePad = this.game.gamePad;
    }

    Get(): IPlayerInput {
        this.inputVector.Set(0, 0);
        this.fireVector.Set(0, 0);

        if (this.keyboard.AnyKeyPressed()) {
            if (this.keyboard.KeyPressed(Key.UpArrow) || this.keyboard.KeyPressed(Key.W)) {
                this.inputVector.Offset(0, -1);
            }
            if (this.keyboard.KeyPressed(Key.DownArrow) || this.keyboard.KeyPressed(Key.S)) {
                this.inputVector.Offset(0, 1);
            }
            if (this.keyboard.KeyPressed(Key.LeftArrow) || this.keyboard.KeyPressed(Key.A)) {
                this.inputVector.Offset(-1, 0);
            }
            if (this.keyboard.KeyPressed(Key.RightArrow) || this.keyboard.KeyPressed(Key.D)) {
                this.inputVector.Offset(1, 0);
            }
        } else {
            if (this.gamePad.controllers[this.playerId]) {
                this.inputVector.Copy(this.gamePad.GetStick(this.playerId, 0, 0.005));
                // A dead zone well above the move stick's - a resting right stick mustn't keep firing.
                const aim = this.gamePad.GetStick(this.playerId, 1, 0.3);
                if (aim) {
                    this.fireVector.Copy(aim);
                }
            }
        }

        if (this.inputVector.length > 1) {
            this.playerInput.direction.Copy(this.inputVector.normalized);
        } else {
            this.playerInput.direction.Copy(this.inputVector);
        }
        this.playerInput.fire.Copy(this.fireVector.normalized);

        return this.playerInput;
    }
}
