import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { ParseSkin } from "./ParseSkin";
import { FrameIndex, ResolveFrames } from "./ResolveFrames";
import { ValidateSkin } from "./ValidateSkin";

// The game skin as shipped: its data file and the frame index the art tools write, checked against each other and the fonts' files, so a frame that was renamed, resized
// or left out of an edit of the art is caught here and not as an error in the browser.
const assets = join(__dirname, "../../assets/ui");
const read = (file: string) => JSON.parse(readFileSync(join(assets, file), "utf8"));

describe("the game skin", () => {
    const frames = read("data/frames.json") as FrameIndex & Record<string, { width: number; height: number }>;
    const skin = ResolveFrames(ParseSkin(read("data/skin.json")), frames);

    it("is valid against the frames and fonts it ships with", () => {
        const problems = ValidateSkin(skin, {
            FrameSize: frame => (frames[frame] ? { width: frames[frame].width, height: frames[frame].height } : undefined),
            HasFont: id => existsSync(join(assets, "fonts", id + ".fnt"))
        });
        expect(problems).toEqual([]);
    });

    it("has a sprite file for every frame in the index", () => {
        const names = Object.keys(frames);
        const missing = names.filter(name => !existsSync(join(assets, "sprites/ui", name + ".png")));
        expect(missing).toEqual([]);
    });
});
