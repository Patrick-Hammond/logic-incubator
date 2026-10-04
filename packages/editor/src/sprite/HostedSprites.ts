/**
 * Reads sprites back from the assets the page has loaded, so the editor works without the dev server: the bundles and sheets come from
 * the asset manifest, and a sprite's frames from the atlas its textures were loaded from - fetched again (the browser has it cached) and
 * decoded exactly, then each frame cut out and put back at its full size (see AtlasFrames.ts). What the page supplies is described by
 * `HostedDeps`, so this runs under node with fakes (see HostedSprites.test.ts).
 */

import { AtlasTextureLike, AtlasUrl, ComposeAtlasFrame, SheetOfAtlasUrl } from "./AtlasFrames";
import { DecodedPng, DecodePng } from "./Png";
import { BundleInfo } from "./SpriteApi";
import { HostedSprites } from "./SpriteStore";

/** One bundle of the manifest: its atlases' names (`~atlas.<bundle>.<sheet>.<page>`) and the id of everything in it (`<bundle>.<name>`). */
export type CatalogueEntry = { name: string; atlases: string[]; ids: string[] };

export type HostedDeps = {
    catalogue(): CatalogueEntry[];
    /** A loaded sprite's frame textures by qualified id (`global.crate`), or null if it isn't loaded. */
    textures(bundle: string, name: string): AtlasTextureLike[] | null;
    /** The bytes at a url (the atlas image). */
    fetchBytes(url: string): Promise<Uint8Array>;
    /** Bundles that aren't art to edit - the editor's own. */
    exclude: ReadonlyArray<string>;
};

/** The sheet an atlas name belongs to: "~atlas.global.dungeon.0" is "dungeon". */
export function SheetOfAtlasName(atlas: string): string | null {
    const match = /^~atlas\.[^.]+\.([^.]+)\.\d+$/.exec(atlas);
    return match ? match[1] : null;
}

export function CreateHostedSprites(deps: HostedDeps): HostedSprites {
    const atlases = new Map<string, Promise<DecodedPng>>();
    const atlas = (url: string): Promise<DecodedPng> => {
        let found = atlases.get(url);
        if (!found) {
            found = deps.fetchBytes(url).then(DecodePng);
            // A failed fetch isn't remembered: the next try asks again.
            found.catch(() => atlases.delete(url));
            atlases.set(url, found);
        }
        return found;
    };

    return {
        Bundles(): BundleInfo[] {
            return deps
                .catalogue()
                .filter(entry => deps.exclude.indexOf(entry.name) < 0)
                .map(entry => ({
                    name: entry.name,
                    sheets: entry.atlases.map(SheetOfAtlasName).filter((sheet, i, all): sheet is string => sheet !== null && all.indexOf(sheet) === i),
                    packedSheets: [],
                    names: entry.ids.map(id => id.slice(entry.name.length + 1))
                }));
        },

        async Read(bundle: string, name: string): Promise<{ sheet: string | null; images: DecodedPng[] }> {
            const textures = deps.textures(bundle, name);
            if (!textures || !textures.length) {
                throw new Error(`"${bundle}.${name}" isn't loaded in this page, so its pixels can't be read.`);
            }
            const urls = textures.map(texture => {
                const url = AtlasUrl(texture);
                if (!url) {
                    throw new Error(`Can't tell which atlas image "${bundle}.${name}" was loaded from.`);
                }
                return url;
            });
            const images: DecodedPng[] = [];
            for (let i = 0; i < textures.length; i++) {
                const frame = ComposeAtlasFrame(await atlas(urls[i]), textures[i]);
                images.push({ width: frame.width, height: frame.height, rgba: frame.rgba });
            }
            return { sheet: SheetOfAtlasUrl(urls[0]), images };
        }
    };
}
