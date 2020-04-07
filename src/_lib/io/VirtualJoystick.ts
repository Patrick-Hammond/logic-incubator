import { JoystickManagerOptions, JoystickManager, EventData, JoystickOutputData } from 'nipplejs';
import { create as createManager } from 'nipplejs';
import { Direction } from '_lib/utils/Types';

type JoystickState = {evt: EventData, data: JoystickOutputData, dir: string, plain: string};

export default class VirtualJoystick {

    private joysticks: Joystick[] = [];

    Create(options?: JoystickManagerOptions): void {
        this.joysticks.push(new Joystick(options));
    }

    GetDirection(id: number): Direction {
        const state = this.joysticks[id].GetState();
        if(!state.data || state.data.force < 0.6) {
            return "none";
        }
        return state.data.direction.angle as Direction;
    }
}

class Joystick {

    private manager: JoystickManager;
    private state: JoystickState = {evt: null, data: null, dir: "", plain: ""};

    constructor(options?: JoystickManagerOptions) {

        this.manager = createManager(options);

        this.manager.on("move", (evt: EventData, data: JoystickOutputData) => {
            this.state.evt = evt;
            this.state.data = data;
        });
        this.manager.on("dir", (evt: EventData, data: JoystickOutputData) => {
            this.state.dir = event.type;
        })
        this.manager.on("plain", (evt: EventData, data: JoystickOutputData) => {
            this.state.plain = evt.type;
        })
    }

    GetState(): JoystickState {
        return this.state;
    }
}
