export function RemoveFromParent(displayObject: PIXI.DisplayObject): PIXI.DisplayObject {
    if (displayObject && displayObject.parent) {
        displayObject.parent.removeChild(displayObject);
    }
    return displayObject;
}

export function CallbackDone(onComplete: () => void, context?: any): void {
    if(onComplete) {
        onComplete.call(context);
    }
}
