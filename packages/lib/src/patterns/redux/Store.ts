export interface IAction<U> {
    type: number | string;
    data?: U;
    canUndo?: boolean;
}

export default abstract class Store<T extends object, U> {
    private _state: T = {} as T;
    private _prevState: T;
    private _undoStates: T[] = [];
    private subscribers: ((prevState: T, state: T) => void)[] = [];

    constructor(private maxUndo: number = 0) {
        this._state = this.Reduce(this._state, { type: null, data: null });
    }

    get state(): T {
        return this._state;
    }

    get prevState(): T {
        return this._prevState;
    }

    Subscribe(callback: (prevState: T, state: T) => void, context: any): void {
        this.subscribers.push(callback.bind(context));
    }

    Dispatch(action: IAction<U>): void {
        if (action.canUndo) {
            this.PushUndo();
        }

        this._prevState = this._state;

        this._state = this.Reduce(this._state, action);

        if (this._prevState !== this.state) {
            this.subscribers.forEach(callback => callback(this._prevState, this._state));
        }
    }

    Load(state: T): void {
        this._prevState = this.DefaultState();
        this._state = state;
        this.subscribers.forEach(callback => callback(this._prevState, this._state));
    }

    LoadJSON(json: string): void {
        this._prevState = this.DefaultState();
        this._state = JSON.parse(json);
        this.subscribers.forEach(callback => callback(this._prevState, this._state));
    }

    SerializeJSON(): string {
        return JSON.stringify(this._state);
    }

    Undo(): void {
        if (this._undoStates.length && this.maxUndo > 0) {
            this._state = this._undoStates.pop();
            this._prevState = this._undoStates.length ? this._undoStates[this._undoStates.length - 1] : ({} as T);
            this.subscribers.forEach(callback => callback(this._prevState, this._state));
        }
    }

    protected PushUndo(): void {
        this._undoStates.push(this.state);
        if (this._undoStates.length > this.maxUndo) {
            this._undoStates.shift();
        }
    }

    protected abstract DefaultState(): T;
    protected abstract Reduce(state: T, action?: IAction<U>): T;
}
