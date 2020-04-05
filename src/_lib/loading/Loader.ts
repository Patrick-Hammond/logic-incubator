import {Loader as PixiLoader} from "pixi.js";
import {LoaderResource} from "pixi.js";
import { GetNextInImageSequence, ImageSequenceIndex, RemoveExtension } from "../io/Url";
import AssetFactory from "./AssetFactory";

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
                const frames = resource.data.frames;
                for (const frame in frames) {
                    if (frames.hasOwnProperty(frame)) {
                        const nameResult = animRegEx.exec(frame);
                        if (nameResult) {
                            // animation
                            const name = nameResult[0];
                            const seqIndex = ImageSequenceIndex(frame);

                            if (seqIndex === 0) {
                                let nextFrame = frame;
                                const animFrames: string[] = [];
                                while (frames[nextFrame]) {
                                    animFrames.push(nextFrame);
                                    nextFrame = GetNextInImageSequence(nextFrame);
                                }

                                AssetFactory.inst.Add(name, animFrames);
                                // console.log("creating amination " + name);
                            }
                        } else {
                            // image
                            const name = RemoveExtension(frame);
                            AssetFactory.inst.Add(name, [frame]);
                            // console.log("creating sprite " + name);
                        }
                    }
                }
            }
            next();
        });

        this.loader.add(url);
        this.loader.load(onComplete);
    }
}
