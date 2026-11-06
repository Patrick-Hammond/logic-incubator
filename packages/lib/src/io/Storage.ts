export function SaveTextFile(fileName: string, output: string): boolean {
    if (FileAPISupported()) {
        const file = new File([output], fileName, { type: "application/octet-stream" });
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
        if (FileAPISupported()) {
            const reader = new FileReader();
            reader.onload = event => resolve(reader.result as string);
            reader.onerror = error => reject(error);
            reader.readAsText(file);
        }
    });
}

/**
 * Stores `data` under `key`. False when it couldn't be kept: no local storage, storage full (the browser's quota, about
 * 5 MB a site) or blocked (site data turned off). Never throws.
 */
export function SaveToLocalStorage(key: string, data: string): boolean {
    if (typeof Storage !== "undefined") {
        try {
            window.localStorage.setItem(key, data);
            return true;
        } catch {
            return false;
        }
    }
    return false;
}

/** What's stored under `key`, or null if nothing is, or local storage is missing or blocked. Never throws. */
export function LoadFromLocalStorage(key: string): string {
    if (typeof Storage !== "undefined") {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    }
    return null;
}

export function FileAPISupported(): boolean {
    return ["File", "FileReader", "FileList", "Blob"].some(prop => window[prop] != null);
}

/** The browser's file picker. `accept` narrows what it offers, as the input's own attribute does (".json,.txt"). */
export function ShowOpenFileDialog(accept?: string): Promise<FileList> {
    return new Promise((resolve, reject) => {
        if (FileAPISupported()) {
            const input = document.createElement("input");
            input.type = "file";
            if (accept) {
                input.accept = accept;
            }
            input.addEventListener("change", e => {
                if (input.files.length) {
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
