export function GetInterval(ms: number, callback: () => void): () => void {

    let endTime = Date.now() + ms;
    const tick = () => {
        if(Date.now() > endTime) {
            endTime = Date.now() + ms;
            callback();
        }
    }

    PIXI.ticker.shared.add(tick);

    const cancel = () => PIXI.ticker.shared.remove(tick);
    return cancel;
}

export function Wait(ms: number, callback: () => void): () => void {
    const cancel = GetInterval(ms, () => {
        cancel();
        callback();
    });
    return cancel;
}
