export default class FileUtils
{
    static ImageSequenceIndex(url:string):number
    {
        let filename = FileUtils.RemoveExtension(url);
        let result = filename.match(/[0-9]+\b/);
        if(result)
        {
            return parseInt(result[0]);
        }

        return -1;
    }

    static GetNextInImageSequence(url:string):string
    {
        let filename = FileUtils.RemoveExtension(url);
        let result = filename.match(/[0-9]+\b/);
        if(result)
        {
            let nextFrameNum = String(parseInt(result[0]) + 1);
            return filename.slice(0, -nextFrameNum.length) + nextFrameNum + FileUtils.GetExtension(url);
        }
        
        return null;
    }

    static GetExtension(url:string):string
    {
        let result = url.match(/(\.\w+$)/igm);
        return result.length ? result[0] : "";
    }

    static RemoveExtension(url:string):string
    {
        return url.replace(/\.[^/.]+$/, "");
    }
}