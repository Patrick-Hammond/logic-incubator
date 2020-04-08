import GameComponent from "../../../_lib/game/GameComponent";
import GamePad from "../../../_lib/io/GamePad";
import Keyboard, {Key} from "../../../_lib/io/Keyboard";
import {Direction} from "../../../_lib/utils/Types";
import VirtualJoystick from "_lib/io/VirtualJoystick";
import { utils } from "pixi.js";

export type PlayerInput =  Direction | "fire";

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

    Get(): PlayerInput[] {

        if(this.virtualJoystick) {
            const dir = this.virtualJoystick.GetDirection(0);
            return dir === "none" ? [] : [dir];
        }

        if (this.keyboard.AnyKeyPressed()) {

            const keys: PlayerInput[] = [];

            if (this.keyboard.KeyPressed(Key.UpArrow)) {
                keys.push("up");
            }
            if (this.keyboard.KeyPressed(Key.DownArrow)) {
                keys.push("down");
            }
            if (this.keyboard.KeyPressed(Key.LeftArrow)) {
                keys.push("left");
            }
            if (this.keyboard.KeyPressed(Key.RightArrow)) {
                keys.push("right");
            }
            if (this.keyboard.KeyPressedMinTime(500, Key.A)) {
                keys.push("fire");
            }

            return keys;
        }

        if (this.gamePad.controllers[this.playerId]) {
            const stick = this.gamePad.GetStickDirection(this.playerId, 0, 0.005);
            const dpad = this.gamePad.GetDPad(this.playerId);
            const button = this.gamePad.GetButtonMinTime(500, 0, 0);
            const buttonVal = !button || button.value === 0 ? "none" : "fire" as PlayerInput;
            return [stick, dpad, buttonVal].filter(f => f !== "none");
        }

        return [];
    }
}
