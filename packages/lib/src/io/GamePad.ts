import { EventEmitter } from "eventemitter3";
import { Vec2 } from "../math/Geometry";
import { LowerLimit } from "../math/Utils";
import {Direction} from "../utils/Types";
import { Cancel, Wait } from "../game/Timing";

export enum GamePadEvents {
    CONNECTED = "connected",
    DISCONNECTED = "disconnected"
}

export default class GamePad extends EventEmitter {
    controllers: Gamepad[] = [];
    private timestampMap: { [buttonId: string]: Cancel } = {};
    private button: { touched: boolean; pressed: boolean; value: number } = {
        touched: false,
        pressed: false,
        value: 0
    };
    private stick = new Vec2();
    private debugLog: boolean = true;
    /** Undoes each window listener (or the polling timer) the constructor set up. */
    private stopListening: (() => void)[] = [];
    /** When the controllers were last read back from the browser (ms, `performance.now`). */
    private refreshedAt = -Infinity;

    constructor() {
        super();

        const haveEvents = "GamepadEvent" in window;
        const haveWebkitEvents = "WebKitGamepadEvent" in window;
        const listen = (type: string, handler: (e: GamepadEvent) => void) => {
            const listener = (e: Event) => handler(e as GamepadEvent);
            window.addEventListener(type, listener);
            this.stopListening.push(() => window.removeEventListener(type, listener));
        };
        const connectHandler = (e: GamepadEvent) => this.AddGamePad(e.gamepad);
        const disconnectHandler = (e: GamepadEvent) => this.RemoveGamePad(e.gamepad);

        if (haveEvents) {
            listen("gamepadconnected", connectHandler);
            listen("gamepaddisconnected", disconnectHandler);
        } else if (haveWebkitEvents) {
            listen("webkitgamepadconnected", connectHandler);
            listen("webkitgamepaddisconnected", disconnectHandler);
        } else {
            // An arrow, not `this.ScanGamePads` - handed over bare, the scan ran with the wrong `this`.
            const timer = setInterval(() => this.ScanGamePads(), 500);
            this.stopListening.push(() => clearInterval(timer));
        }
    }

    /** Stops listening for (or polling for) controllers, and lets go of everyone listening on this. Safe to call twice. */
    Destroy(): void {
        this.stopListening.forEach(stop => stop());
        this.stopListening = [];
        this.removeAllListeners();
        this.controllers = [];
        Object.keys(this.timestampMap).forEach(id => {
            const cancel = this.timestampMap[id];
            if (cancel) {
                cancel();
            }
        });
        this.timestampMap = {};
    }

    IsConnected(): boolean {
        return this.controllers.some(e => e != null);
    }

    GetButton(controllerId: number, buttonId: number): GamepadButton {
        const controller = this.Controller(controllerId);

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

    GetButtonMinTime(ms: number, controllerId: number, buttonId: number): GamepadButton {
        const id = controllerId.toString() + buttonId.toString();
        const button = this.GetButton(controllerId, buttonId);
        if(button && button.value === 1 && !this.timestampMap[id]) {
            this.timestampMap[id] = Wait(ms, () => this.timestampMap[id] = null);
            return button;
        }

        return null;
    }

    GetStick(controllerId: number, stickId: number, threshold: number): Vec2 {
        const controller = this.Controller(controllerId);

        if (!controller) {
            return null;
        }

        // Stick N reads axes N*2 and N*2 + 1, so the controller needs both.
        if (stickId * 2 + 2 > controller.axes.length) {
            return null;
        }

        this.stick.Set(LowerLimit(controller.axes[stickId * 2], threshold), LowerLimit(controller.axes[stickId * 2 + 1], threshold));

        return this.stick;
    }

    GetStickDirection(controllerId: number, stickId: number, threshold: number): Direction {
        const controller = this.Controller(controllerId);

        if (!controller) {
            return null;
        }

        // Stick N reads axes N*2 and N*2 + 1, so the controller needs both.
        if (stickId * 2 + 2 > controller.axes.length) {
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

    GetDPad(controllerId: number): Direction {

        // my 2563-0526-HJD-X reports the dpad as axis 9

        const controller = this.Controller(controllerId);

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

    /** The controller in a slot as the browser reports it now, or null. */
    private Controller(controllerId: number): Gamepad | null {
        this.Refresh();
        return this.controllers[controllerId] || null;
    }

    /**
     * What a browser hands over for a controller - the `gamepadconnected` event's included - is a snapshot that never changes afterwards, so the
     * state has to be asked for again (MDN: read `navigator.getGamepads()` each frame). Done here, at most once a frame however many buttons and
     * sticks are read, and only for controllers already known: connecting and disconnecting stay with the events (or the polling scan).
     */
    private Refresh(): void {
        if (typeof navigator === "undefined" || typeof performance === "undefined") {
            return;
        }
        const now = performance.now();
        if (now - this.refreshedAt < 8) {
            return;
        }
        this.refreshedAt = now;
        const current = navigator.getGamepads ? navigator.getGamepads() : navigator["webkitGetGamepads"] ? navigator["webkitGetGamepads"]() : null;
        if (!current) {
            return;
        }
        for (let i = 0; i < current.length; i++) {
            const pad = current[i];
            if (pad && this.controllers[pad.index]) {
                this.controllers[pad.index] = pad;
            }
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

    private RemoveGamePad(gamepad : Gamepad) {
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
