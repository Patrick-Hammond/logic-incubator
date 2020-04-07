import GameComponent from "../../../_lib/game/GameComponent";
import GamePad from "../../../_lib/io/GamePad";
import Keyboard, {Key} from "../../../_lib/io/Keyboard";
import {Direction} from "../../../_lib/utils/Types";
import VirtualJoystick from "_lib/io/VirtualJoystick";
import { utils } from "pixi.js";

export default class PlayerControl extends GameComponent {
    private keyboard: Keyboard;
    private gamePad: GamePad;
    private virtualJoystick: VirtualJoystick;

    constructor(private playerId: number) {
        super();

        this.keyboard = this.game.keyboard;
        this.gamePad = this.game.gamePad;

        if(utils.isMobile.any) {
            this.virtualJoystick = new VirtualJoystick();
            this.virtualJoystick.Create();
        }
    }

    Get(): Direction {

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

        if(this.virtualJoystick) {
            const dir = this.virtualJoystick.GetDirection(0);
            console.log(dir);
            return dir;
        }

        if (this.gamePad.controllers[this.playerId]) {
            const stick = this.gamePad.GetStickDirection(this.playerId, 0, 0.005);
            const dpad = this.gamePad.GetDPad(this.playerId);
            return stick !== "none" ? stick : dpad;
        }

        return "none";
    }
}
