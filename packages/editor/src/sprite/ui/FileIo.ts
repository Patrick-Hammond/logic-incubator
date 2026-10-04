/**
 * The sprite editor's file chores: asking for a file (and not hanging when the dialog is cancelled), reading it, decoding an
 * image of any format the browser knows into RGBA, and handing the user a file to keep.
 */

import { DecodePng } from "../Png";

/** The file the user picks, or null if they cancel. `accept` is the input's own filter (".pal,.gpl,.json" or "image/*"). */
export function ChooseFile(accept: string): Promise<File | null> {
    return new Promise(resolve => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.addEventListener("change", () => resolve(input.files && input.files.length ? input.files[0] : null));
        // Browsers that report a cancelled dialog say so with this event; the others leave the promise hanging, which is harmless.
        input.addEventListener("cancel", () => resolve(null));
        input.click();
    });
}

export function ReadFileBytes(file: Blob): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error || new Error("Couldn't read the file."));
        reader.readAsArrayBuffer(file);
    });
}

export function ReadFileText(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("Couldn't read the file."));
        reader.readAsText(file);
    });
}

export type RgbaImage = { width: number; height: number; rgba: Uint8Array };

/** An image file as RGBA: a PNG by our own decoder (exact, whatever its bit depth), anything else (JPEG, GIF, WebP...) by the browser's. */
export async function ImageFileToRgba(file: Blob): Promise<RgbaImage> {
    const bytes = await ReadFileBytes(file);
    const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (isPng) {
        const png = await DecodePng(bytes);
        return { width: png.width, height: png.height, rgba: png.rgba };
    }
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) {
        throw new Error("That file isn't an image the browser can read.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    return { width: bitmap.width, height: bitmap.height, rgba: new Uint8Array(data.buffer, data.byteOffset, data.length).slice() };
}

/** Offers `text` to the user as a downloaded file. */
export function DownloadText(fileName: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
