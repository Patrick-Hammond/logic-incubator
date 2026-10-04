import type Assets from "@logic-incubator/lib/assets/Assets";
import type { FontId, ImageId } from "@logic-incubator/lib/assets/AssetIds";

/**
 * The editor's own art - its toolbar icons and bitmap font - is the asset bundle `editor`, the
 * folder packages/editor/assets/editor. The game lists that folder's root in its
 * assets.config.json as a dev-only root (so a production build leaves it out) and loads the bundle
 * before it creates the editor scene, whose components read these in `OnInitialise`.
 */
export const EditorBundle = "editor";

/** The id of an editor icon by its file name: "arrow-up" is `editor.arrow_up`. */
export function EditorIcon(name: string): ImageId {
    return `${EditorBundle}.${name.replace(/-/g, "_")}` as ImageId;
}

/** The face of the editor's small bitmap font - what `BitmapText` is given as `font.name`. */
export function EditorFontName(assets: Assets): string {
    return assets.FontName(`${EditorBundle}.small_font_export` as FontId);
}
