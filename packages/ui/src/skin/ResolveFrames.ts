/**
 * The art says where its own edges are: each nine-patch frame's insets are in the frame index (`assets/ui/data/frames.json`, written when the Aseprite sheet is sliced), so the skin
 * only has to say which frame a widget draws. `ResolveFrames` fills in the insets of every nine-slice in a skin (an object with a `frame` and no `insets`) from the index; an
 * `insets` written in the skin itself wins, so one frame can be cut differently in one place. Pure.
 */

import { Insets, Skin } from "./Skin";

export type FrameIndex = Record<string, { width: number; height: number; insets?: Insets }>;

/** A copy of the skin with the missing insets filled in from the frame index (a frame that isn't a nine-patch there is left as it is; `ValidateSkin` says what is still missing). */
export function ResolveFrames(skin: Skin, frames: FrameIndex): Skin {
    const copy = JSON.parse(JSON.stringify(skin)) as Skin;
    const walk = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        const record = node as Record<string, unknown>;
        if (typeof record.frame === "string" && record.insets === undefined) {
            const entry = frames[record.frame];
            if (entry && entry.insets) {
                record.insets = { ...entry.insets };
            }
        }
        Object.keys(record).forEach(key => walk(record[key]));
    };
    walk(copy);
    return copy;
}
