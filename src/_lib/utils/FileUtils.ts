export default class FileUtils
{
    static ImageSequenceIndex(url: string): number
    {
        let filename = FileUtils.RemoveExtension(url);
        let result = filename.match(/[0-9]+\b/);
        if(result) {
            return parseInt(result[ 0 ]);
        }

        return -1;
    }

    static GetNextInImageSequence(url: string): string
    {
        let filename = FileUtils.RemoveExtension(url);
        let result = filename.match(/[0-9]+\b/);
        if(result) {
            let nextFrameNum = String(parseInt(result[ 0 ]) + 1);
            return filename.slice(0, -nextFrameNum.length) + nextFrameNum + FileUtils.GetExtension(url);
        }

        return null;
    }

    static GetExtension(url: string): string
    {
        let result = url.match(/(\.\w+$)/igm);
        return result.length ? result[ 0 ] : "";
    }

    static RemoveExtension(url: string): string
    {
        return url.replace(/\.[^/.]+$/, "");
    }

    static FileAPISupported(): boolean
    {
        return [ "File", "FileReader", "FileList", "Blob" ].some(prop => window[ prop ] != null);
    }

    static ShowOpenFileDialog(): Promise<FileList>
    {
        return new Promise((resolve, reject) =>
        {
            if(FileUtils.FileAPISupported()) {
                let input = document.createElement("input");
                input.type = "file";
                input.addEventListener("change", (e) =>
                {
                    if(input.files.length) {
                        resolve(input.files);
                    }
                    else {
                        reject();
                    }
                });
                input.click();
            }
            else {
                reject();
            }
        });
    }

    static SaveTextFile(fileName: string, output: string): boolean
    {
        if(FileUtils.FileAPISupported()) {
            let file = new File([ output ], fileName, {type: "application/octet-stream"});
            let blobUrl = URL.createObjectURL(file);
            let a: HTMLAnchorElement = document.createElement("A") as HTMLAnchorElement;
            a.href = blobUrl;
            a.download = fileName;
            a.click();
            return true;
        } else {
            return false;
        }
    }

    static LoadTextFile(file: File): Promise<string>
    {
        return new Promise((resolve, reject) =>
        {
            if(FileUtils.FileAPISupported()) {
                let reader = new FileReader();
                reader.onload = event => resolve(reader.result as string);
                reader.onerror = error => reject(error);
                reader.readAsText(file);
            }
        });
    }
}