export function ImageSequenceIndex(url: string): number {
    const filename = RemoveExtension(url);
    const result = filename.match(/[0-9]+\b/);
    if (result) {
        return parseInt(result[0]);
    }

    return -1;
}

export function GetNextInImageSequence(url: string): string {
    const filename = RemoveExtension(url);
    const result = filename.match(/[0-9]+\b/);
    if (result) {
        const nextFrameNum = String(parseInt(result[0]) + 1);
        return filename.slice(0, -nextFrameNum.length) + nextFrameNum + GetExtension(url);
    }

    return null;
}

export function GetExtension(url: string): string {
    const result = url.match(/(\.\w+$)/gim);
    return result.length ? result[0] : "";
}

export function RemoveExtension(url: string): string {
    return url.replace(/\.[^/.]+$/, "");
}
