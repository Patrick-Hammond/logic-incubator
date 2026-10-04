/**
 * Where the sprite editor gets sprites from and puts them: either the dev server's disk ("disk" - the service in sprite-api.js, which
 * only answers on localhost) or, anywhere else, the page itself ("download" - sprites are read back from the atlas the page already
 * loaded, and saving hands the browser a file: a PNG for one frame, a zip of PNGs for several). The window works against this one
 * interface and only has to know the difference where the two really differ: a disk save is picked up by the build, a download is
 * something to put in the assets folder. Pure apart from the `deliver` function it's given (see SpriteStore.test.ts).
 */

import { DecodedPng, DecodePng } from "./Png";
import { BundleInfo, SaveRequest, SaveResult, SpriteApi, SpriteInfo } from "./SpriteApi";
import { FrameFileNames } from "./SpriteNames";
import { CreateZip } from "./Zip";

export type SpriteSource = { info: SpriteInfo; images: DecodedPng[] };

/** What a download save adds to the usual result: what was handed to the browser. */
export type SaveOutcome = SaveResult & { download?: Download };

export interface SpriteStore {
    readonly Kind: "disk" | "download";
    /** The bundles a sprite can go in, their sheets, and the names already taken. */
    List(): Promise<BundleInfo[]>;
    Read(bundle: string, name: string): Promise<SpriteSource>;
    Save(request: SaveRequest): Promise<SaveOutcome>;
}

// ---------------------------------------------------------------------------------------------- the dev server's disk

export class DiskStore implements SpriteStore {
    readonly Kind = "disk" as const;

    constructor(private api: SpriteApi) {}

    List(): Promise<BundleInfo[]> {
        return this.api.List();
    }

    async Read(bundle: string, name: string): Promise<SpriteSource> {
        const { info, frames } = await this.api.ReadSprite(bundle, name);
        return { info, images: await Promise.all(frames.map(f => DecodePng(f))) };
    }

    Save(request: SaveRequest): Promise<SaveOutcome> {
        return this.api.Save(request);
    }
}

// ---------------------------------------------------------------------------------------------- downloads

/** A file for the browser to download, and where each of the sprite's files belongs relative to the game's assets folder. */
export type Download = { fileName: string; mime: string; bytes: Uint8Array; files: string[] };

/** The folder the build reads a sheet's frames from, relative to the assets folder. */
export function SpriteFolder(bundle: string, sheet: string): string {
    return `${bundle}/sprites/${sheet}`;
}

/**
 * One frame is the PNG itself, named as the build expects (`gem.png`); several are a zip whose entries are laid out from the assets folder
 * down (`global/sprites/user/gem_f0.png`...), so unzipping there puts every frame in place.
 */
export function PackDownload(bundle: string, name: string, sheet: string, pngs: ReadonlyArray<Uint8Array>): Download {
    if (!pngs.length) {
        throw new Error("A sprite needs at least one frame.");
    }
    const names = FrameFileNames(name, pngs.length);
    const folder = SpriteFolder(bundle, sheet);
    const files = names.map(file => `${folder}/${file}`);
    if (pngs.length === 1) {
        return { fileName: names[0], mime: "image/png", bytes: pngs[0], files };
    }
    return { fileName: `${name}.zip`, mime: "application/zip", bytes: CreateZip(files.map((file, i) => ({ name: file, data: pngs[i] }))), files };
}

/** The files a sprite had as `before` frames that it doesn't have as `after` - the ones to delete once the new files are in (a one-frame sprite is `name.png`, not `name_f0.png`). */
export function ObsoleteFiles(bundle: string, sheet: string, name: string, before: number, after: number): string[] {
    if (before < 1) {
        return [];
    }
    const keep = new Set(FrameFileNames(name, after));
    const folder = SpriteFolder(bundle, sheet);
    return FrameFileNames(name, before).filter(file => !keep.has(file)).map(file => `${folder}/${file}`);
}

/** The line to add to a bundle's assets-meta.json for a new tile: `"gem": {"category":"user"}`. */
export function MetaSnippet(name: string, entry: object): string {
    return `${JSON.stringify(name)}: ${JSON.stringify(entry)}`;
}

const ListLimit = 6;
const list = (files: ReadonlyArray<string>) => files.slice(0, ListLimit).join(", ") + (files.length > ListLimit ? `, and ${files.length - ListLimit} more` : "");

/**
 * What to tell the user once a download has been handed over: a line for the status bar, and - when there's more to do by hand than put the
 * files in place (delete what they replace, add a new tile's assets-meta.json entry) - the whole list of steps for a dialog.
 */
export function DescribeDownload(args: { download: Download; obsolete: ReadonlyArray<string>; metaFile: string | null; metaSnippet: string | null }): { short: string; long: string | null } {
    const { download, obsolete } = args;
    const folder = download.files[0].slice(0, download.files[0].lastIndexOf("/"));
    const zipped = download.fileName.slice(-4) === ".zip";
    const place = zipped ? `extract it in your game's assets folder (it holds ${list(download.files)})` : `put it in ${folder}/ in your game's assets folder`;
    const short = `Downloaded ${download.fileName} - ${place}.`;
    if (!obsolete.length && !args.metaSnippet) {
        return { short, long: null };
    }
    const steps = [zipped ? `Extract ${download.fileName} in your game's assets folder - it holds ${list(download.files)}.` : `Put ${download.fileName} in ${folder}/ in your game's assets folder.`];
    if (obsolete.length) {
        steps.push(`Delete ${obsolete.length === 1 ? "this file, which the new one replaces" : "these files, which the new ones replace"}: ${list(obsolete)}.`);
    }
    if (args.metaSnippet) {
        steps.push(`Add this line to ${args.metaFile || "the bundle's data/assets-meta.json"} so the game knows the new tile:\n${args.metaSnippet}`);
    }
    return { short, long: steps.map((step, i) => `${i + 1}. ${step}`).join("\n") };
}

/** A PNG's pixel size, read from its header. */
export function PngSize(png: Uint8Array): { width: number; height: number } {
    const signature = [0x89, 0x50, 0x4e, 0x47];
    if (png.length < 24 || signature.some((byte, i) => png[i] !== byte)) {
        throw new Error("That isn't a PNG.");
    }
    const view = new DataView(png.buffer, png.byteOffset, png.length);
    return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** What download mode reads from: the page's own loaded assets. */
export type HostedSprites = {
    /** Every bundle a sprite could go in (not the editor's own), its sheets and the names in it. */
    Bundles(): BundleInfo[];
    /** A sprite's frames as the page has them (and the sheet they're from, if known). Rejects if it isn't loaded. */
    Read(bundle: string, name: string): Promise<{ sheet: string | null; images: DecodedPng[] }>;
};

export class DownloadStore implements SpriteStore {
    readonly Kind = "download" as const;

    constructor(private hosted: HostedSprites, private deliver: (download: Download) => void) {}

    async List(): Promise<BundleInfo[]> {
        return this.hosted.Bundles();
    }

    async Read(bundle: string, name: string): Promise<SpriteSource> {
        const { sheet, images } = await this.hosted.Read(bundle, name);
        if (!images.length) {
            throw new Error(`"${bundle}.${name}" has no frames to read.`);
        }
        const info: SpriteInfo = {
            bundle,
            name,
            kind: images.length > 1 ? "animation" : "sprite",
            frames: images.length,
            sheet,
            dir: sheet ? `sprites/${sheet}` : null,
            editable: true,
            reason: null
        };
        return { info, images };
    }

    async Save(request: SaveRequest): Promise<SaveOutcome> {
        const download = PackDownload(request.bundle, request.name, request.sheet || "user", request.frames);
        const { width, height } = PngSize(request.frames[0]);
        this.deliver(download);
        return {
            ok: true,
            bundle: request.bundle,
            name: request.name,
            kind: request.frames.length > 1 ? "animation" : "sprite",
            frames: request.frames.length,
            width,
            height,
            written: download.files,
            removed: [],
            changed: true,
            notes: [],
            download
        };
    }
}

/** The dev server's disk when its sprite service answers (on localhost, under `npm start`); otherwise downloads. */
export async function ChooseStore(api: SpriteApi, hosted: HostedSprites, deliver: (download: Download) => void): Promise<SpriteStore> {
    return (await api.Available()) ? new DiskStore(api) : new DownloadStore(hosted, deliver);
}
