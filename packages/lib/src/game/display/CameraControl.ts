import GamePad from "../../io/GamePad";
import {Vec2} from "../../math/Geometry";
import Game from "../Game";

export interface ICameraTransform {
    rotation: Vec2;
}

export interface ICameraControl {
    Get(): ICameraTransform;
}

export default class CameraControl implements ICameraControl {

    private rotationVector = new Vec2();
    private cameraInput: ICameraTransform = { rotation: new Vec2() };
    private gamePad: GamePad;

    constructor(private playerId: number) {
        this.gamePad = Game.inst.gamePad;
    }

    Get(): ICameraTransform {
        this.rotationVector.Set(0, 0);

        if (this.gamePad.controllers[this.playerId]) {
            // GetStick is null for a controller without that stick (too few axes) - no rotation then.
            const stick = this.gamePad.GetStick(this.playerId, 0, 0.005);
            if (stick) {
                this.rotationVector.Copy(stick);
            }
        }

        this.cameraInput.rotation.Copy(this.rotationVector);

        return this.cameraInput;
    }
}

/*
Note: for rotational control, set the pivot to the game's center:

 // this.game.sceneManager.GetScene(Scenes.GAME).root.pivot.set(640, 360);
 // this.game.sceneManager.GetScene(Scenes.GAME).root.position.set(640, 360);
*/
