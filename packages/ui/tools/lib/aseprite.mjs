// Reading what Aseprite writes: `aseprite -b file.aseprite --sheet out.png --data out.json --list-slices` puts every slice in the JSON's meta.slices, each with a name and
// keys of { frame, bounds: { x, y, w, h }, center?: { x, y, w, h } } where center (a nine-patch's stretchable middle) is relative to the slice's own top-left. This turns that into
// frames: a name, a rectangle on the sheet and - for a nine-patch - the insets (the edge widths the middle leaves). Pure.
import { FrameNameProblem } from "./frames.mjs";

/**
 * The slices of an Aseprite export as `{ name, x, y, w, h, insets }` (insets null unless the slice has a nine-patch centre), from the first frame's key. `sheet` is the
 * exported image's size; a slice that falls outside it, or a nine-patch centre outside its slice, is an error naming the slice.
 */
export function ParseSlices(json, sheet) {
    const slices = json && json.meta && json.meta.slices;
    if (!Array.isArray(slices)) {
        throw new Error("That JSON has no meta.slices: export with --list-slices (or tick \"Meta: Slices\" in File > Export Sprite Sheet).");
    }
    const seen = new Set();
    return slices.map(slice => {
        const name = slice.name;
        const problem = FrameNameProblem(name);
        if (problem) {
            throw new Error("Slice " + problem + ".");
        }
        if (seen.has(name)) {
            throw new Error(`There are two slices called "${name}".`);
        }
        seen.add(name);
        const keys = slice.keys || [];
        const key = keys.find(k => k.frame === 0) || keys[0];
        if (!key || !key.bounds) {
            throw new Error(`Slice "${name}" has no bounds.`);
        }
        const { x, y, w, h } = key.bounds;
        if (w < 1 || h < 1 || x < 0 || y < 0 || x + w > sheet.width || y + h > sheet.height) {
            throw new Error(`Slice "${name}" (${x},${y} ${w}x${h}) isn't inside the ${sheet.width}x${sheet.height} sheet.`);
        }
        let insets = null;
        if (key.center) {
            const c = key.center;
            insets = { left: c.x, top: c.y, right: w - c.x - c.w, bottom: h - c.y - c.h };
            if (c.w < 1 || c.h < 1 || insets.left < 0 || insets.top < 0 || insets.right < 0 || insets.bottom < 0) {
                throw new Error(`Slice "${name}": its nine-patch centre (${c.x},${c.y} ${c.w}x${c.h}) isn't inside the ${w}x${h} slice.`);
            }
        }
        return { name, x, y, w, h, insets };
    });
}
