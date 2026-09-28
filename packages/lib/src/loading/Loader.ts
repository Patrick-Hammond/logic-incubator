import {Loader as PixiLoader} from "pixi.js";
import {LoaderResource} from "pixi.js";
import AssetFactory from "./AssetFactory";
import { GroupSpriteSheetFrames } from "./SpriteSheetFrames";

export default class Loader {
    private static _inst: Loader;
    public static get inst(): Loader {
        if (!Loader._inst) {
            Loader._inst = new Loader();
        }
        return Loader._inst;
    }

    private loader: PixiLoader;

    constructor() {
        this.loader = new PixiLoader();
    }

    /**
     * Loads a sprite sheet from the given url and then registers
     * sprites and animations with the AssetFactory
     *
     * @param {string} url
     * @param {RegExp} animRegEx
     * @param {()=>void} onComplete
     * @memberof Loader
     */
    LoadSpriteSheet(url: string, animRegEx: RegExp, onComplete: () => void): void {

        this.loader.use((resource: LoaderResource, next: (...params: any[]) => any) => {
            if (resource.data && resource.data.frames) {
                GroupSpriteSheetFrames(resource.data.frames, animRegEx).forEach(asset => AssetFactory.inst.Add(asset.name, asset.frames));
            }
            next();
        });

        this.loader.add(url);
        this.loader.load(onComplete);
    }
}
