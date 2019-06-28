import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2} from "../../../_lib/math/Geometry";
import Keyboard, {Key} from "../../../_lib/io/Keyboard";
import GamePad, {GamePadEvents} from "../../../_lib/io/GamePad";

export interface PlayerInput {
    direction:Vec2;
}

export default class PlayerControls extends GameComponent {

    private inputVector = new Vec2();
    private playerInput:PlayerInput = {direction:new Vec2()};
    private keyboard:Keyboard;
    private gamePad:GamePad;

    constructor(
        private playerId:number
        ){

        super();

        this.keyboard = this.game.keyboard;
        this.gamePad = this.game.gamePad;

        if(this.game.gamePad.IsConnected() && this.game.gamePad.controllers[0])
        {
            this.gamePad = this.game.gamePad;
        }

        this.gamePad.on(GamePadEvents.CONNECTED, (index:number) =>
        {
            if(index === 0) {
                this.gamePad = this.game.gamePad;
            }
        });

        this.gamePad.on(GamePadEvents.DISCONNECTED, (index:number) =>
        {
            if(index === 0) {
                this.gamePad = null;
            }
        });
    }

    Get():PlayerInput {

        this.inputVector.Set(0, 0);

        if(this.keyboard.AnyKeyPressed()) {

            if(this.keyboard.KeyPressed(Key.UpArrow)) {
                this.inputVector.Offset(0, -1);
            }
            if(this.keyboard.KeyPressed(Key.DownArrow)) {
                this.inputVector.Offset(0, 1);
            }
            if(this.keyboard.KeyPressed(Key.LeftArrow)) {
                this.inputVector.Offset(-1, 0);
            }
            if(this.keyboard.KeyPressed(Key.RightArrow)) {
                this.inputVector.Offset(1, 0);
            }
           
        } else {
            if(this.gamePad) {
                this.inputVector.Copy(this.gamePad.GetStick(this.playerId, 1, 0.005))
            }
        }

        if(this.inputVector.length > 1)
        {
            this.playerInput.direction.Copy(this.inputVector.normalized);
        }
        else
        {
            this.playerInput.direction.Copy(this.inputVector);
        }
        
        return this.playerInput;
    }
}