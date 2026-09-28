import { GetNextInImageSequence, ImageSequenceIndex, RemoveExtension } from "../io/Url";

export interface SpriteSheetAsset {
    name: string;
    frames: string[];
}

/**
 * Splits a sprite sheet's frames into named assets. A frame key matching
 * `animRegEx` is a frame of the animation the match names; the animation is
 * collected once, walking its image sequence from the index-0 frame. Any
 * other key is a single-frame sprite named after itself, minus extension.
 *
 * Kept free of pixi so the grouping can be tested under plain Node.
 *
 * @param {{[key: string]: unknown}} frames the sprite sheet's `frames` map
 * @param {RegExp} animRegEx
 * @returns {SpriteSheetAsset[]} in frame-key order
 */
export function GroupSpriteSheetFrames(frames: { [key: string]: unknown }, animRegEx: RegExp): SpriteSheetAsset[] {
    const assets: SpriteSheetAsset[] = [];
    for (const frame in frames) {
        if (Object.prototype.hasOwnProperty.call(frames, frame)) {
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

                    assets.push({ name, frames: animFrames });
                }
            } else {
                // image
                assets.push({ name: RemoveExtension(frame), frames: [frame] });
            }
        }
    }
    return assets;
}
