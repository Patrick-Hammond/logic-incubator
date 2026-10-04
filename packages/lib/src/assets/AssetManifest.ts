/**
 * The manifest `scripts/build-assets.js` writes next to the built assets: every bundle, what it
 * depends on, how it preloads, and each asset's kind and files. Pure types and a validator - no
 * pixi - so it can be tested (and used) under plain Node.
 */

/** When an asset loads: with its bundle, right after it, or only when asked for. */
export type AssetTier = "boot" | "background" | "lazy";

/** `frames` are texture keys (`<bundle>.<frame>`): one for a sprite, in order for an animation. */
export type SpriteAsset = { kind: "sprite"; frames: string[] };
export type AnimationAsset = { kind: "animation"; frames: string[] };
export type FrameAsset = SpriteAsset | AnimationAsset;
export type FileAsset = { kind: "image" | "data" | "binary"; url: string; bytes: number; tier: AssetTier };
/** `urls` are one file per encoding, most preferred first: the runtime plays the first its browser supports. */
export type SoundAsset = { kind: "sound"; urls: string[]; bytes: number; tier: AssetTier };
export type FontAsset = { kind: "font"; url: string; face: string; bytes: number; tier: AssetTier };
export type AssetEntry = FrameAsset | FileAsset | SoundAsset | FontAsset;

export type AtlasEntry = { name: string; json: string; bytes: number; scaleMode?: "nearest" | "linear" };

export type BundleEntry = {
    dependsOn: string[];
    preload: "boot" | "manual";
    /** Content hash - appended as `?v=` so a changed bundle isn't served from cache. */
    hash: string;
    bytes: number;
    atlases: AtlasEntry[];
    assets: { [id: string]: AssetEntry };
};

export type Manifest = {
    version: 1;
    /** Built without `--production`: dev conveniences (reloading data on each level start) are on. */
    dev: boolean;
    bundles: { [name: string]: BundleEntry };
};

const KINDS = ["sprite", "animation", "image", "sound", "data", "binary", "font"];
const TIERS = ["boot", "background", "lazy"];

function Fail(message: string): never {
    throw new Error(`Invalid asset manifest: ${message}`);
}

/** Checks `json` is a manifest this runtime understands, and returns it typed. Throws with what's wrong. */
export function ValidateManifest(json: unknown): Manifest {
    const manifest = json as Manifest;
    if (!manifest || typeof manifest !== "object") {
        return Fail("not an object.");
    }
    if (manifest.version !== 1) {
        return Fail(`version ${JSON.stringify(manifest.version)} - this build of the game understands version 1. Rebuild the assets (npm run assets).`);
    }
    if (!manifest.bundles || typeof manifest.bundles !== "object") {
        return Fail("no \"bundles\".");
    }
    Object.keys(manifest.bundles).forEach(name => {
        const bundle = manifest.bundles[name];
        if (!bundle || !Array.isArray(bundle.dependsOn) || !Array.isArray(bundle.atlases) || !bundle.assets || typeof bundle.hash !== "string") {
            Fail(`bundle "${name}" is malformed.`);
        }
        bundle.dependsOn.forEach(dep => {
            if (!manifest.bundles[dep]) {
                Fail(`bundle "${name}" depends on "${dep}", which isn't in the manifest.`);
            }
        });
        Object.keys(bundle.assets).forEach(id => {
            const asset = bundle.assets[id];
            if (id.indexOf(name + ".") !== 0) {
                Fail(`asset "${id}" isn't named under its bundle "${name}".`);
            }
            if (!asset || KINDS.indexOf(asset.kind) < 0) {
                Fail(`asset "${id}" has an unknown kind.`);
            }
            if (asset.kind !== "sprite" && asset.kind !== "animation" && TIERS.indexOf(asset.tier) < 0) {
                Fail(`asset "${id}" has an unknown tier.`);
            }
        });
    });
    return manifest;
}
