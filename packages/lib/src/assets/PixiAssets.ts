import type { Ticker } from "pixi.js";
import { UPDATE_PRIORITY } from "pixi.js";
import Assets from "./Assets";
import PixiBundleLoader from "./PixiBundleLoader";

/**
 * The `Assets` a `Game` owns: loading through pixi, and unloading after the frame that stopped
 * needing a bundle has been drawn (the ticker's UTILITY priority runs after the render, which is
 * LOW). `getTicker` is asked each time because `Game` may swap its ticker after construction.
 */
export function CreateAssets(getTicker: () => Ticker): Assets {
    return new Assets({
        loader: new PixiBundleLoader(),
        schedule: fn => {
            const ticker = getTicker();
            ticker.addOnce(fn, undefined, UPDATE_PRIORITY.UTILITY);
            return () => ticker.remove(fn);
        }
    });
}
