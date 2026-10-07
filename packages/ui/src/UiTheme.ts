import type { Texture } from "pixi.js";
import type Assets from "@logic-incubator/lib/assets/Assets";
import type { FontId, SpriteId } from "@logic-incubator/lib/assets/AssetIds";
import { ParseSkin } from "./skin/ParseSkin";
import { FrameIndex, ResolveFrames } from "./skin/ResolveFrames";
import { Skin } from "./skin/Skin";
import { ValidateSkin } from "./skin/ValidateSkin";

/** What the kit needs from the asset system, so widgets can be given a fake of it in a test. */
export interface UiAssets {
    /** The texture of one of the skin's frames, by its bare name (`btn_primary_normal`). */
    Texture(frame: string): Texture;
    /** The name a `BitmapText` knows a skin font by. */
    FontName(fontId: string): string;
}

/** The skin's frames and fonts as the game's loaded asset bundle has them (`ui.btn_primary_normal`, `ui.body`). */
export function GameUiAssets(assets: Assets, bundle: string): UiAssets {
    return {
        Texture: frame => assets.Texture((bundle + "." + frame) as SpriteId),
        FontName: fontId => assets.FontName((bundle + "." + fontId) as FontId)
    };
}

/**
 * The skin as the data asset `<bundle>.skin` holds it, with each nine-slice's insets taken from the art's own frame index (`<bundle>.frames`, written when the Aseprite sheet is
 * sliced) unless the skin gives them itself.
 */
export function LoadSkin(assets: Assets, bundle = "ui"): Skin {
    const skin = ParseSkin(assets.Data((bundle + ".skin") as never));
    return ResolveFrames(skin, assets.Data((bundle + ".frames") as never) as unknown as FrameIndex);
}

/** What widgets need of the page they run on, beyond the asset system: the canvas the game draws on (for things that sit over it, like a text field's native input). */
export interface UiHost {
    readonly view: HTMLCanvasElement;
}

/** What is wrong with a skin, checked against the art its bundle actually has (see `ValidateSkin`): empty when it is fine. */
export function ValidateLoadedSkin(skin: Skin, assets: UiAssets): string[] {
    return ValidateSkin(skin, {
        FrameSize: frame => {
            try {
                const texture = assets.Texture(frame);
                return { width: texture.width, height: texture.height };
            } catch {
                return undefined;
            }
        },
        HasFont: id => {
            try {
                assets.FontName(id);
                return true;
            } catch {
                return false;
            }
        }
    });
}

/**
 * A skin together with the art it names: the one thing widgets are given. They read sizes, colours and fonts from `skin` and pictures from here, so the same
 * widget is a different UI under a different skin.
 */
export default class UiTheme {
    constructor(readonly skin: Skin, private readonly assets: UiAssets, readonly host?: UiHost) {}

    /** Whole screen pixels per UI pixel. */
    get Scale(): number {
        return this.skin.scale;
    }

    Texture(frame: string): Texture {
        return this.assets.Texture(frame);
    }

    /** The name `BitmapText` knows the skin's font `key` (`body`, `heading`) by. */
    FontName(key: string): string {
        return this.assets.FontName(this.Font(key).id);
    }

    FontSize(key: string): number {
        return this.Font(key).size;
    }

    /** A spacing the skin sets (see `Skin.metrics`), in UI pixels; `fallback` when it doesn't say. */
    Metric(name: string, fallback: number): number {
        const value = this.skin.metrics && this.skin.metrics[name];
        return value === undefined ? fallback : value;
    }

    Colour(name: string): number {
        const colour = this.skin.colours[name];
        if (colour === undefined) {
            throw new Error(`The "${this.skin.name}" skin has no colour "${name}".`);
        }
        return colour;
    }

    private Font(key: string) {
        const font = this.skin.fonts[key];
        if (!font) {
            throw new Error(`The "${this.skin.name}" skin has no font "${key}".`);
        }
        return font;
    }
}
