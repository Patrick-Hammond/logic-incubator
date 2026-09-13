interface Handler<T, U> {
    SetNext(handler: Handler<T, U>): Handler<T, U>;
    Handle(request: T): U;
}

export abstract class AbstractHandler<T, U> implements Handler<T, U> {
    private nextHandler: Handler<T, U>;

    public SetNext(handler: Handler<T, U>): Handler<T, U> {
        this.nextHandler = handler;
        return handler;
    }

    public Handle(request: T): U {
        if (this.nextHandler) {
            return this.nextHandler.Handle(request);
        }
        return null;
    }
}

export function Chain<T, U>(...handlers: Handler<T, U>[]): Handler<T, U>  {
    for (let i = 0; i < handlers.length - 1; i++) {
        handlers[i].SetNext(handlers[i + 1]);
    }
    return handlers[0];
}
