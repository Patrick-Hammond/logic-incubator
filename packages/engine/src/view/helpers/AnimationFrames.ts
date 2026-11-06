import {Texture} from "pixi.js";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";

/** Every frame of sprites and animations, by bare name, made the first time each is asked for and kept - what the figures are drawn from. */
export default class AnimationFrames {
    private frames = new Map<string, Texture[]>();

    /** Every frame of `name`, in order - one for a sprite, none (after a one-off warning) for something the sprite sheet hasn't got. */
    Get(name: string): Texture[] {
        let frames = this.frames.get(name);
        if (!frames) {
            if (AssetFactory.inst.Has(name)) {
                frames = AssetFactory.inst.CreateTextures(name);
            } else {
                AssetFactory.inst.WarnMissing(name);
                frames = [];
            }
            this.frames.set(name, frames);
        }
        return frames;
    }
}
