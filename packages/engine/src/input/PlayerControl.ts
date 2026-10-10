import Game from "@logic-incubator/lib/game/Game";
import GamePad from "@logic-incubator/lib/io/GamePad";
import Keyboard, {Key} from "@logic-incubator/lib/io/Keyboard";
import {Vec2} from "@logic-incubator/lib/math/Geometry";
import {IsStickPushed} from "./StickInput";

export interface IPlayerInput {
    direction: Vec2;
    /**
     * Whether the fire control is held this frame - Space on keyboard, or a gamepad's right stick
     * past its dead zone. Tutankham-style: firing always goes left or right, in whichever the
     * player currently faces - never aimed up/down, so this is just on/off, not a direction.
     */
    firing: boolean;
    /**
     * A gamepad's right stick's raw horizontal component (0 from keyboard, which has no aim of its
     * own) - lets the stick set facing independent of movement, Robotron-style, but clamped to
     * left/right by `StepPlayer` only ever reading its sign. 0 (e.g. an up/down-only push) leaves facing
     * as it was, so firing still goes the way the player was already facing.
     */
    aimX: number;
    /** Whether the cast control is held this frame - L on keyboard, a gamepad's Y (its top face button) - which calls up the player's light spell, if they have one. */
    casting: boolean;
    /** Whether the warp control is held this frame - K on keyboard, a gamepad's X (its left face button) - which takes a hero far from the rest of the party to the nearest of them (see `World`). */
    warping?: boolean;
}

/** What one hero is played with: the keyboard, a gamepad (by its browser index, from 0), or either - the keyboard wins while any key is down. */
export type InputDevice = {
    keyboard?: boolean;
    pad?: number;
};

/** A lone hero's controls: the keyboard, or the first gamepad. */
export const DefaultInput: InputDevice = { keyboard: true, pad: 0 };

/** The gamepad button that casts: Y, the top face button, in the standard mapping. */
const CastButton = 3;
/** The gamepad button that warps to the party: X, the left face button. */
const WarpButton = 2;

/** Reads one hero's controls (see `InputDevice`) into an `IPlayerInput` - the same object each `Get`, refilled. */
export default class PlayerControl {
    private inputVector = new Vec2();
    private playerInput: IPlayerInput = { direction: new Vec2(), firing: false, aimX: 0, casting: false, warping: false };
    private keyboard: Keyboard;
    private gamePad: GamePad;

    constructor(private device: InputDevice = DefaultInput) {
        this.keyboard = Game.inst.keyboard;
        this.gamePad = Game.inst.gamePad;
    }

    Get(): IPlayerInput {
        this.inputVector.Set(0, 0);
        let firing = false;
        let aimX = 0;
        let casting = false;
        let warping = false;
        const pad = this.device.pad;

        if (this.device.keyboard && this.keyboard.AnyKeyPressed()) {
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
            firing = this.keyboard.KeyPressed(Key.Space);
            casting = this.keyboard.KeyPressed(Key.L);
            warping = this.keyboard.KeyPressed(Key.K);
        } else if (pad !== undefined) {
            if (this.gamePad.controllers[pad]) {
                // GetStick is null for a controller without that stick (too few axes) - no movement then.
                const move = this.gamePad.GetStick(pad, 0, 0.005);
                if (move) {
                    this.inputVector.Copy(move);
                }
                // A dead zone well above the move stick's - a resting right stick mustn't keep firing.
                // GetStick still hands back the (zeroed) stick while it rests, so check it's pushed, not just there.
                const aim = this.gamePad.GetStick(pad, 1, 0.3);
                if (IsStickPushed(aim)) {
                    firing = true;
                    aimX = aim.x;
                }
                const cast = this.gamePad.GetButton(pad, CastButton);
                casting = !!cast && cast.pressed;
                const warp = this.gamePad.GetButton(pad, WarpButton);
                warping = !!warp && warp.pressed;
            }
        }

        if (this.inputVector.length > 1) {
            this.playerInput.direction.Copy(this.inputVector.normalized);
        } else {
            this.playerInput.direction.Copy(this.inputVector);
        }
        this.playerInput.firing = firing;
        this.playerInput.aimX = aimX;
        this.playerInput.casting = casting;
        this.playerInput.warping = warping;

        return this.playerInput;
    }
}
