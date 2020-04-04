import { EventEmitter } from "eventemitter3";
import { Vec2 } from "../math/Geometry";
import { LowerLimit } from "../math/Utils";
import {Directions} from "../utils/Types";

export enum GamePadEvents {
    CONNECTED = "connected",
    DISCONNECTED = "disconnected"
}

export default class GamePad extends EventEmitter {
    controllers: Gamepad[] = [];
    private button: { touched: boolean; pressed: boolean; value: number } = {
        touched: false,
        pressed: false,
        value: 0
    };
    private stick = new Vec2();
    private debugLog: boolean = true;

    constructor() {
        super();

        const haveEvents = "GamepadEvent" in window;
        const haveWebkitEvents = "WebKitGamepadEvent" in window;
        const connectHandler = e => this.AddGamePad(e.gamepad);
        const disconnectHandler = e => this.RemoveGamePad(e.gamepad);

        if (haveEvents) {
            window.addEventListener("gamepadconnected", e => connectHandler(e));
            window.addEventListener("gamepaddisconnected", e => disconnectHandler(e));
        } else if (haveWebkitEvents) {
            window.addEventListener("webkitgamepadconnected", e => connectHandler(e));
            window.addEventListener("webkitgamepaddisconnected", e => disconnectHandler(e));
        } else {
            setInterval(this.ScanGamePads, 500);
        }
    }

    IsConnected(): boolean {
        return this.controllers.some(e => e != null);
    }

    GetButton(controllerId: number, buttonId: number): GamepadButton {
        const controller = this.controllers[controllerId];

        if (!controller) {
            return null;
        }

        let val = controller.buttons[buttonId] as any;
        this.button.pressed = val === 1;
        if (typeof val === "object") {
            this.button.pressed = val.pressed;
            val = val.value;
        }

        this.button.value = val;

        return this.button;
    }

    GetStick(controllerId: number, stickId: number, threshold: number): Vec2 {
        const controller = this.controllers[controllerId];

        if (!controller) {
            return null;
        }

        if (stickId * 2 + 1 > controller.axes.length) {
            return null;
        }

        this.stick.Set(LowerLimit(controller.axes[stickId * 2], threshold), LowerLimit(controller.axes[stickId * 2 + 1], threshold));

        return this.stick;
    }

    GetStickDirection(controllerId: number, stickId: number, threshold: number): Directions {
        const controller = this.controllers[controllerId];

        if (!controller) {
            return null;
        }

        if (stickId * 2 + 1 > controller.axes.length) {
            return null;
        }

        this.stick.Set(LowerLimit(controller.axes[stickId * 2], threshold), LowerLimit(controller.axes[stickId * 2 + 1], threshold));

        if(this.stick.IsZero()) {
            return "none";
        }

        if(Math.abs(this.stick.x) > Math.abs(this.stick.y)) {
            return this.stick.x > 0 ? "right" : "left";
        }

        return this.stick.y > 0 ? "down" : "up";
    }

    GetDPad(controllerId: number): Directions {

        // my 2563-0526-HJD-X reports the dpad as axis 9

        const controller = this.controllers[controllerId];

        if (!controller) {
            return null;
        }

        const axis = controller.axes[9];
        if(axis == null || axis === 0 || axis > 1) {
            return "none";
        }

        if(axis < 0) {
            return axis === -1 ? "up" : "right";
        } else {
            return axis > 0.5 ? "left" : "down";
        }
    }

    private AddGamePad(gamepad: Gamepad) {
        this.Log("connected! " + gamepad.index);
        this.Log("gamepad: " + gamepad.id);
        this.Log("button count " + gamepad.buttons.length);
        this.Log("axes count " + gamepad.axes.length);

        this.controllers[gamepad.index] = gamepad;

        this.emit(GamePadEvents.CONNECTED, gamepad.index);
    }

    private RemoveGamePad(gamepad) {
        this.Log("disconnected! " + gamepad.index);

        this.emit(GamePadEvents.DISCONNECTED, gamepad.index);

        this.controllers[gamepad.index] = null;
    }

    private ScanGamePads() {
        const gamepads = navigator.getGamepads
            ? navigator.getGamepads()
            : navigator["webkitGetGamepads"]
            ? navigator["webkitGetGamepads"]()
            : [];

        // tslint:disable-next-line: prefer-for-of
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                if (!(gamepads[i].index in this.controllers)) {
                    this.AddGamePad(gamepads[i]);
                } else {
                    this.controllers[gamepads[i].index] = gamepads[i];
                }
            }
        }
    }

    private Log(msg: string) {
        if (this.debugLog) {
            console.log(msg);
        }
    }
}
