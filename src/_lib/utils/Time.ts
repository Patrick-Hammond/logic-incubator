import {Ticker} from "pixi.js";

export function GetInterval(ms: number, callback: () => void): () => void {

    let endTime = Date.now() + ms;
    const tick = () => {
        if(Date.now() > endTime) {
            endTime = Date.now() + ms;
            callback();
        }
    }

    Ticker.shared.add(tick);

    const cancel = () => Ticker.shared.remove(tick);
    return cancel;
}

export function Wait(ms: number, callback: () => void): () => void {
    const cancel = GetInterval(ms, () => {
        cancel();
        callback();
    });
    return cancel;
}
