export function SaveTextFile(fileName: string, output: string): boolean {
    if(FileAPISupported()) {
        const file = new File([output], fileName, {type: "application/octet-stream"});
        const blobUrl = URL.createObjectURL(file);
        const a: HTMLAnchorElement = document.createElement("A") as HTMLAnchorElement;
        a.href = blobUrl;
        a.download = fileName;
        a.click();
        return true;
    } else {
        return false;
    }
}

export function LoadTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        if(FileAPISupported()) {
            const reader = new FileReader();
            reader.onload = event => resolve(reader.result as string);
            reader.onerror = error => reject(error);
            reader.readAsText(file);
        }
    });
}

export function SaveToLocalStorage(key: string, data: string): boolean {
    if(typeof (Storage) !== "undefined") {
        window.localStorage.setItem(key, data);
        return true;
    }
    return false;
}

export function LoadFromLocalStorage(key: string): string {
    if(typeof (Storage) !== "undefined") {
        return window.localStorage.getItem(key);
    }
    return null;
}

export function ImageSequenceIndex(url: string): number {
    const filename = RemoveExtension(url);
    const result = filename.match(/[0-9]+\b/);
    if(result) {
        return parseInt(result[0]);
    }

    return -1;
}

export function GetNextInImageSequence(url: string): string {
    const filename = RemoveExtension(url);
    const result = filename.match(/[0-9]+\b/);
    if(result) {
        const nextFrameNum = String(parseInt(result[0]) + 1);
        return filename.slice(0, -nextFrameNum.length) + nextFrameNum + GetExtension(url);
    }

    return null;
}

export function GetExtension(url: string): string {
    const result = url.match(/(\.\w+$)/igm);
    return result.length ? result[0] : "";
}

export function RemoveExtension(url: string): string {
    return url.replace(/\.[^/.]+$/, "");
}

export function FileAPISupported(): boolean {
    return ["File", "FileReader", "FileList", "Blob"].some(prop => window[prop] != null);
}

export function ShowOpenFileDialog(): Promise<FileList> {
    return new Promise((resolve, reject) => {
        if(FileAPISupported()) {
            const input = document.createElement("input");
            input.type = "file";
            input.addEventListener("change", (e) => {
                if(input.files.length) {
                    resolve(input.files);
                } else {
                    reject();
                }
            });
            input.click();
        } else {
            reject();
        }
    });
}
