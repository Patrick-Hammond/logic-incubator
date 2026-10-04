/**
 * Opening the sprite editor: for an existing sprite (read from the dev server's source PNGs) or a new one (asks where it
 * goes and how big, first). Either way it resolves, once the window is closed, with whether anything was saved - though
 * a save reloads the page when the window closes, so the caller usually won't be around to hear.
 */

import { OpenFormDialog } from "../ui/dialog/FormDialog";
import { CreateBitmap } from "./Bitmap";
import { Recovery } from "./Recovery";
import { SpriteApi } from "./SpriteApi";
import { BlankState, SpriteState, StateFromImages } from "./SpriteDocument";
import SpriteEditor, { SpriteEditorContext, SpriteOrigin } from "./SpriteEditor";
import { ChooseStore, Download, HostedSprites } from "./SpriteStore";
import { Category, NewSpriteDialog, ReadNewSprite } from "./ui/Dialogs";
import { DownloadBytes } from "./ui/FileIo";

/**
 * What a page supplies to open the editor: the context, except that it brings both ways of reaching sprites - the dev server's service
 * (used when it answers) and the page's own loaded art (used otherwise, with saves as downloads) - and the editor picks.
 */
export type SpriteEditorHost = Omit<SpriteEditorContext, "store" | "deliver"> & { api: SpriteApi; hosted: HostedSprites };

async function Resolve(host: SpriteEditorHost): Promise<SpriteEditorContext> {
    const deliver = (download: Download) => DownloadBytes(download.fileName, download.bytes, download.mime);
    const { api, hosted, ...rest } = host;
    return { ...rest, store: await ChooseStore(api, hosted, deliver), deliver };
}

export type SpriteEditorRequest =
    | { kind: "edit"; bundle: string; name: string; category?: string }
    /** A new sprite, offered under this palette tab. */
    | { kind: "new"; category: string };

export type SpriteEditorDefaults = {
    /** The size a new sprite starts at - the game's tile size. */
    tileSize: number;
    /** The bundle a new sprite is offered in (if it's one the server will let you save into). */
    bundle: string;
};

let opening = false;

function Problem(title: string, error: unknown): Promise<unknown> {
    const message = error instanceof Error ? error.message : String(error);
    return OpenFormDialog({ title, subtitle: message, fields: [], values: {}, saveLabel: "OK", cancelLabel: null });
}

/** Whether a sprite editor is open or being opened - there's only ever one. */
export function IsSpriteEditorOpen(): boolean {
    return opening || SpriteEditor.Active !== null;
}

/** Puts the editor back after the page reloaded under it (see Recovery.ts); resolves when it's closed, like `OpenSpriteEditor`. */
export async function RecoverSpriteEditor(host: SpriteEditorHost, recovery: Recovery): Promise<boolean> {
    if (IsSpriteEditorOpen()) {
        return false;
    }
    opening = true;
    let ctx: SpriteEditorContext;
    try {
        ctx = await Resolve(host);
    } finally {
        opening = false;
    }
    return new Promise<boolean>(resolve => {
        const editor = new SpriteEditor(ctx, recovery.state, recovery.origin, applied => resolve(applied));
        editor.Restore(recovery.frameIndex, recovery.dirty);
    });
}

/** Opens the editor; resolves when it's closed (true if it saved anything), or straight away with false if it couldn't open. */
export async function OpenSpriteEditor(host: SpriteEditorHost, request: SpriteEditorRequest, defaults: SpriteEditorDefaults): Promise<boolean> {
    if (IsSpriteEditorOpen()) {
        return false;
    }
    opening = true;
    let ctx: SpriteEditorContext;
    let state: SpriteState;
    let origin: SpriteOrigin;
    let notice = "";
    try {
        ctx = await Resolve(host);
        if (request.kind === "edit") {
            const { info, images } = await ctx.store.Read(request.bundle, request.name);
            const imported = StateFromImages(images);
            state = imported.state;
            origin = { bundle: request.bundle, name: request.name, mode: "overwrite", sheet: info.sheet || "user", category: request.category || ctx.categories[0].id, applied: false, savedFrames: info.frames };
            if (imported.reduced) {
                notice = "That sprite used more than 256 colours, so similar ones were merged to fit the palette.";
            } else if (ctx.store.Kind === "download") {
                notice = "Read from the art this page has loaded, so its palette was extracted again. Download saves it as a file to put in your game's assets folder.";
            }
        } else {
            const bundles = await ctx.store.List();
            if (!bundles.length) {
                throw new Error("The dev server has no bundles to save a sprite into.");
            }
            const bundle = bundles.some(b => b.name === defaults.bundle) ? defaults.bundle : bundles[0].name;
            const values = await OpenFormDialog(NewSpriteDialog({ bundles, categories: ctx.categories as Category[], bundle, category: request.category, tileSize: defaults.tileSize }));
            if (!values) {
                return false;
            }
            const choice = ReadNewSprite(values);
            const blank = BlankState(choice.width, choice.height);
            state = { ...blank, frames: Array.from({ length: choice.frames }, () => CreateBitmap(choice.width, choice.height, 0)) };
            origin = { bundle: choice.bundle, name: choice.name, mode: "create", sheet: choice.sheet, category: choice.category, applied: false, savedFrames: 0 };
        }
    } catch (error) {
        await Problem(request.kind === "edit" ? "Can't edit that sprite" : "Can't start a new sprite", error);
        return false;
    } finally {
        opening = false;
    }

    return new Promise<boolean>(resolve => {
        const editor = new SpriteEditor(ctx, state, origin, applied => resolve(applied));
        if (notice) {
            editor.Notify(notice);
        }
    });
}
