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

    /** Calls `callback` (with `context` as `this`) on every state change. Returns the function that stops it. */
    Subscribe(callback: (prevState: T, state: T) => void, context: any): () => void {
        const bound = callback.bind(context);
        this.subscribers.push(bound);
        return () => {
            const index = this.subscribers.indexOf(bound);
            if (index >= 0) {
                this.subscribers.splice(index, 1);
            }
        };
    }

    Dispatch(action: IAction<U>): void {
        if (action.canUndo) {
            this.PushUndo();
        }

        this._prevState = this._state;

        this._state = this.Reduce(this._state, action);

        if (this._prevState !== this.state) {
            this.Notify();
        }
    }

    Load(state: T): void {
        this._prevState = this.DefaultState();
        this._state = state;
        this.Notify();
    }

    LoadJSON(json: string): void {
        this._prevState = this.DefaultState();
        this._state = JSON.parse(json);
        this.Notify();
    }

    SerializeJSON(): string {
        return JSON.stringify(this._state);
    }

    Undo(): void {
        if (this._undoStates.length && this.maxUndo > 0) {
            this._state = this._undoStates.pop();
            this._prevState = this._undoStates.length ? this._undoStates[this._undoStates.length - 1] : ({} as T);
            this.Notify();
        }
    }

    /** Over a copy, so a subscriber that unsubscribes (itself or another) mid-notification doesn't make the next one get skipped. */
    private Notify(): void {
        this.subscribers.slice().forEach(callback => callback(this._prevState, this._state));
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
