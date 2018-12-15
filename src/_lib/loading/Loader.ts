import FileUtils from "../utils/FileUtils";
import AssetFactory from "./AssetFactory";

export default class Loader {
    private static _inst: Loader;
    public static get inst(): Loader {
        if(!Loader._inst) Loader._inst = new Loader();
        return Loader._inst;
    }

    private loader: PIXI.loaders.Loader;

    constructor() {
        this.loader = new PIXI.loaders.Loader();
    }


    /**
     * Loads a sprite sheet from the given url and then registers
     * sprites and animations with the AssetFactory
     *
     * @param {string} url
     * @param {RegExp} nameRegEx
     * @param {()=>void} complete
     * @memberof Loader
     */
    public LoadSpriteSheet(url: string, nameRegEx: RegExp, complete: () => void): void {
        this.loader.use((resource: PIXI.loaders.Resource, next: () => void) => {
            if(resource.data && resource.data.frames) {
                let frames = resource.data.frames;
                for(let frame in frames) {
                    if(frames.hasOwnProperty(frame)) {
                        let nameResult = nameRegEx.exec(frame);
                        if(nameResult) {
                            //animation
                            let name = nameResult[ 0 ];
                            let seqIndex = FileUtils.ImageSequenceIndex(frame);

                            if(seqIndex == 0) {
                                let nextFrame = frame;
                                let animFrames: string[] = [];
                                while(frames[ nextFrame ]) {
                                    animFrames.push(nextFrame);
                                    nextFrame = FileUtils.GetNextInImageSequence(nextFrame);
                                }

                                AssetFactory.inst.Add(name, animFrames);
                                console.log("creating amination " + name);
                            }
                        }
                        else {
                            //image
                            let name = FileUtils.RemoveExtension(frame);
                            AssetFactory.inst.Add(name, [ frame ]);
                            console.log("creating sprite " + name);
                        }
                    }
                }
            }
            next();
        });

        this.loader.add(url);
        this.loader.load(complete);
    }
}