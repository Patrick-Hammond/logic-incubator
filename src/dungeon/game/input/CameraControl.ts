import GameComponent from "../../../_lib/game/GameComponent";
import GamePad from "../../../_lib/io/GamePad";
import Keyboard, {Key} from "../../../_lib/io/Keyboard";
import {Vec2} from "../../../_lib/math/Geometry";

export interface CameraInput {
    rotation: Vec2;
}

export default class CameraControl extends GameComponent {

    private rotationVector = new Vec2();
    private cameraInput: CameraInput = { rotation: new Vec2() };
    private keyboard: Keyboard;
    private gamePad: GamePad;

    constructor(private playerId: number) {
        super();

        this.keyboard = this.game.keyboard;
        this.gamePad = this.game.gamePad;
    }

    Get(): CameraInput {
        this.rotationVector.Set(0, 0);

        if (this.gamePad.controllers[this.playerId]) {
            this.rotationVector.Copy(this.gamePad.GetStick(this.playerId, 0, 0.005));
        }
      
        this.cameraInput.rotation.Copy(this.rotationVector);

        return this.cameraInput;
    }
}
