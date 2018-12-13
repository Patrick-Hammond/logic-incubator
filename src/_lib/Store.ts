export interface IAction<U>
{
    type: number | string;
    data?: U;
    canUndo?: boolean;
}

export default abstract class Store<T extends object, U>
{
    protected _state: T = {} as T;
    protected _prevState: T;
    protected _undoStates: T[] = [];
    protected subscribers: ((prevState: T, state: T) => void)[] = [];

    constructor(private maxUndo: number = 0)
    {
        this._state = this.Reduce(this._state, {type: null, data: null});
    }

    public get state(): T
    {
        return this._state;
    }

    public get prevState(): T
    {
        return this._prevState;
    }

    public Subscribe(callback: (prevState: T, state: T) => void, context: any): void
    {
        this.subscribers.push(callback.bind(context));
    };

    public Dispatch(action: IAction<U>): void
    {
        if(action.canUndo) {
            this.PushUndo();
        }

        this._prevState = this._state;

        this._state = this.Reduce(this._state, action);

        if(this._prevState != this.state) {
            this.subscribers.forEach(callback => callback(this._prevState, this._state));
        }
    };

    public Load(data: string): void
    {
        this._prevState = this.DefaultState();
        this._state = JSON.parse(data);
        this.subscribers.forEach(callback => callback(this._prevState, this._state));
    }

    public Serialize(): string
    {
        return JSON.stringify(this._state);
    }

    public Undo(): void
    {
        if(this._undoStates.length && this.maxUndo > 0) {
            this._state = this._undoStates.pop();
            this._prevState = this._undoStates.length ? this._undoStates[ this._undoStates.length - 1 ] : {} as T;
            this.subscribers.forEach(callback => callback(this._prevState, this._state));
        }
    }

    protected PushUndo(): void
    {
        this._undoStates.push(this.state);
        if(this._undoStates.length > this.maxUndo) {
            this._undoStates.shift();
        }
    }

    protected abstract DefaultState(): T;
    protected abstract Reduce(state: T, action?: IAction<U>): T;
}