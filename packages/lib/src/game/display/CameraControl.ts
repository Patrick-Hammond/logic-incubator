import GamePad from "../../io/GamePad";
import {Vec2} from "../../math/Geometry";
import GameComponent from "../GameComponent";

export interface ICameraTransform {
    rotation: Vec2;
}

export interface ICameraControl {
    Get(): ICameraTransform;
}

export default class CameraControl extends GameComponent implements ICameraControl {

    private rotationVector = new Vec2();
    private cameraInput: ICameraTransform = { rotation: new Vec2() };
    private gamePad: GamePad;

    constructor(private playerId: number) {
        super();

        this.gamePad = this.game.gamePad;
    }

    Get(): ICameraTransform {
        this.rotationVector.Set(0, 0);

        if (this.gamePad.controllers[this.playerId]) {
            this.rotationVector.Copy(this.gamePad.GetStick(this.playerId, 0, 0.005));
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
