import {EventEmitter} from "eventemitter3"
import Game from "../game/Game";
import {Vec2Like, Vec2} from "../math/Geometry";
import {LowerLimit} from "../math/Utils";

export enum GamePadEvents {
  CONNECTED = "connected", DISCONNECTED = "disconnected"
}

export default class GamePad extends EventEmitter {
  
  public controllers: Gamepad[] = [];
  private button:{touched:boolean, pressed:boolean, value:number} = {touched:false, pressed:false, value:0};
  private stick = new Vec2();
  private debugLog: boolean = false;
  
  constructor() {
    
    super();
    
    const haveEvents = 'GamepadEvent' in window;
    const haveWebkitEvents = 'WebKitGamepadEvent' in window;
    
    if(haveEvents) {
      window.addEventListener("gamepadconnected", (e) => this.ConnectHandler(e));
      window.addEventListener("gamepaddisconnected", (e) => this.DisconnectHandler(e));
    } else if(haveWebkitEvents) {
      window.addEventListener("webkitgamepadconnected", (e) => this.ConnectHandler(e));
      window.addEventListener("webkitgamepaddisconnected", (e) => this.DisconnectHandler(e));
    } else {
      setInterval(this.ScanGamePads, 500);
    }
  }
  
  private ConnectHandler(e) {
    this.AddGamePad(e.gamepad);
  }
  
  private DisconnectHandler(e) {
    this.RemoveGamePad(e.gamepad);
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
  
  public IsConnected():boolean {
    return this.controllers.some(e => e != null);
  }

  public GetButton(controllerId:number, buttonId:number):GamepadButton {

    const controller = this.controllers[controllerId];

    if(!controller) {
      return null;
    }

    let val = controller.buttons[buttonId] as any;
    this.button.pressed = val === 1;
    if(typeof (val) == "object") {
      this.button.pressed = val.pressed;
      val = val.value;
    }

    this.button.value = val;

    return this.button;
  }

  public GetStick(controllerId:number, stickId:number, threshold:number):Vec2 {

    const controller = this.controllers[controllerId];

    if(!controller) {
      return null;
    }

    if(stickId * 2 > controller.axes.length) {
      return null;
    }

    this.stick.Set(
      LowerLimit(controller.axes[stickId * 2], threshold),
      LowerLimit(controller.axes[stickId * 2 + 1], threshold)
      );
    return this.stick;
  }


  private ScanGamePads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : (navigator["webkitGetGamepads"] ? navigator["webkitGetGamepads"]() : []);
    for(let i = 0; i < gamepads.length; i++) {
      if(gamepads[i]) {
        if(!(gamepads[i].index in this.controllers)) {
          this.AddGamePad(gamepads[i]);
        } else {
          this.controllers[gamepads[i].index] = gamepads[i];
        }
      }
    }
  }
  
  private Log(val: string) {
    if(this.debugLog) {
      this.Log(val);
    }
  }
}
