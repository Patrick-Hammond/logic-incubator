/**
 * Checks a skin against the art it names, so a typo or a bad inset is a message at start-up (and a test) rather than a missing texture or a garbled frame
 * on screen. Pure: it is told how to look a frame's size or a font up, and doesn't touch Pixi or the asset system.
 */

import { BorderStyleSkin, InsetsHeight, InsetsWidth, NineSliceSkin, Skin } from "./Skin";

export type SkinLookup = {
    /** A frame's size in pixels, or undefined if there is no such frame in the skin's bundle. */
    FrameSize(frame: string): { width: number; height: number } | undefined;
    /** Whether the skin's bundle has a font called this. */
    HasFont(id: string): boolean;
};

type Size = { width: number; height: number };

/** What is wrong with the skin: one sentence each, empty when it is fine. */
export function ValidateSkin(skin: Skin, lookup: SkinLookup): string[] {
    const problems: string[] = [];
    const note = (where: string, what: string) => problems.push(`${where}: ${what}`);

    const frame = (where: string, name: string | undefined): Size | undefined => {
        if (!name) {
            note(where, "no frame is named");
            return undefined;
        }
        const size = lookup.FrameSize(name);
        if (!size) {
            note(where, `there is no frame "${name}" in the "${skin.bundle}" bundle`);
        }
        return size;
    };

    const slice = (where: string, spec: NineSliceSkin | undefined) => {
        if (!spec) {
            note(where, "no frame is given");
            return;
        }
        const size = frame(where, spec.frame);
        if (!spec.insets) {
            if (size) note(where, `"${spec.frame}" has no nine-patch insets: draw a 9-slice around it in Aseprite (and slice the sheet), or give insets here`);
            return;
        }
        const { left, top, right, bottom } = spec.insets;
        if ([left, top, right, bottom].some(n => !Number.isInteger(n) || n < 0)) {
            note(where, "insets must be whole numbers, 0 or more");
        } else if (size && (InsetsWidth(spec.insets) >= size.width || InsetsHeight(spec.insets) >= size.height)) {
            note(where, `insets ${left},${top},${right},${bottom} leave nothing of the ${size.width}x${size.height} frame "${spec.frame}"`);
        }
    };

    /** Every state of something drawn as a picture, or as a nine-slice. */
    const pictures = (where: string, states: Record<string, string | undefined> | undefined) => Object.keys(states || {}).forEach(state => frame(`${where}.${state}`, (states as Record<string, string | undefined>)[state]));
    const slices = (where: string, states: Record<string, NineSliceSkin | undefined> | undefined) => Object.keys(states || {}).forEach(state => slice(`${where}.${state}`, (states as Record<string, NineSliceSkin | undefined>)[state]));

    const border = (where: string, name: string) => {
        if (!skin.borderStyles[name]) {
            note(where, `there is no border style "${name}"`);
        }
    };
    const font = (where: string, key: string | undefined) => {
        if (!key || !skin.fonts[key]) {
            note(where, `there is no font "${key}" in the skin's fonts`);
        }
    };
    const exists = (where: string, kind: string, found: unknown, name: string) => {
        if (!found) note(where, `there is no ${kind} "${name}"`);
    };
    const each = <T>(prefix: string, record: Record<string, T> | undefined, check: (where: string, value: T) => void) => Object.keys(record || {}).forEach(key => check(`${prefix}.${key}`, (record as Record<string, T>)[key]));

    if (!Number.isInteger(skin.scale) || skin.scale < 1) {
        note("skin", `scale must be a whole number of 1 or more, not ${skin.scale}`);
    }
    if (!skin.bundle) {
        note("skin", "it names no bundle");
    }

    Object.keys(skin.fonts).forEach(key => {
        const f = skin.fonts[key];
        if (!(f.size > 0)) {
            note(`fonts.${key}`, `size must be more than 0, not ${f.size}`);
        }
        if (!lookup.HasFont(f.id)) {
            note(`fonts.${key}`, `there is no font "${f.id}" in the "${skin.bundle}" bundle`);
        }
    });

    each("buttons", skin.buttons, (where, button) => {
        font(where, button.font);
        slices(`${where}.states`, button.states);
    });

    each("panels", skin.panels, (where, panel) => {
        slice(`${where}.frame`, panel.frame);
        if (panel.borderTop) border(`${where}.borderTop`, panel.borderTop);
    });

    each("borderStyles", skin.borderStyles, (where, style: BorderStyleSkin) => {
        const heights = [style.capLeft, style.capRight, style.mid, style.centre]
            .filter((name): name is string => !!name)
            .map(name => frame(`${where}.${name}`, name))
            .filter((size): size is Size => !!size)
            .map(size => size.height);
        if (heights.some(h => h !== heights[0])) {
            note(where, `its pieces aren't all the same height (${heights.join(", ")})`);
        }
    });

    each("bars", skin.bars, (where, bar) => {
        slice(`${where}.track`, bar.track);
        frame(`${where}.fill`, bar.fill);
        if (!Number.isInteger(bar.height) || (bar.track.insets && bar.height < InsetsHeight(bar.track.insets) + InsetsHeight(bar.fillPadding) + 1)) {
            note(where, `height ${bar.height} leaves no room for the fill inside the track`);
        }
    });

    const toggles = (prefix: string, record: Skin["checkboxes"]) =>
        each(prefix, record, (where, toggle) => {
            font(where, toggle.font);
            pictures(`${where}.off`, toggle.off);
            pictures(`${where}.on`, toggle.on);
        });
    toggles("checkboxes", skin.checkboxes);
    toggles("radios", skin.radios);

    each("sliders", skin.sliders, (where, slider) => {
        slice(`${where}.track`, slider.track);
        pictures(`${where}.thumb`, slider.thumb);
        if (slider.fill) frame(`${where}.fill`, slider.fill);
    });

    each("scrollbars", skin.scrollbars, (where, bar) => {
        slice(`${where}.track`, bar.track);
        slices(`${where}.thumb`, bar.thumb);
        if (bar.arrows) {
            exists(`${where}.arrows.button`, "button", skin.buttons[bar.arrows.button], bar.arrows.button);
            (["up", "down", "left", "right"] as const).forEach(direction => frame(`${where}.arrows.${direction}`, bar.arrows && bar.arrows[direction]));
        }
    });

    each("tabs", skin.tabs, (where, tab) => {
        font(where, tab.font);
        slices(`${where}.states`, tab.states);
    });

    each("fields", skin.fields, (where, field) => {
        font(where, field.font);
        slices(`${where}.states`, field.states);
    });

    each("slots", skin.slots, (where, slot) => {
        font(where, slot.countFont);
        slices(`${where}.states`, slot.states);
    });

    each("tooltips", skin.tooltips, (where, tip) => {
        slice(`${where}.frame`, tip.frame);
        frame(`${where}.tailDown`, tip.tailDown);
        frame(`${where}.tailUp`, tip.tailUp);
        font(where + ".titleFont", tip.titleFont);
        font(where + ".textFont", tip.textFont);
    });

    each("dialogues", skin.dialogues, (where, dialogue) => {
        slice(`${where}.frame`, dialogue.frame);
        slice(`${where}.portraitFrame`, dialogue.portraitFrame);
        frame(`${where}.arrow`, dialogue.arrow);
        font(where + ".nameFont", dialogue.nameFont);
        font(where + ".bodyFont", dialogue.bodyFont);
    });

    each("toasts", skin.toasts, (where, toast) => {
        font(where + ".titleFont", toast.titleFont);
        font(where + ".textFont", toast.textFont);
        each(`${where}.kinds`, toast.kinds, (kindWhere, kind) => {
            slice(`${kindWhere}.frame`, kind.frame);
            if (kind.icon) frame(`${kindWhere}.icon`, kind.icon);
        });
    });

    each("windows", skin.windows, (where, window) => {
        exists(`${where}.panel`, "panel", skin.panels[window.panel], window.panel);
        slice(`${where}.title`, window.title);
        font(where + ".titleFont", window.titleFont);
        if (window.close) {
            exists(`${where}.close.button`, "button", skin.buttons[window.close.button], window.close.button);
            frame(`${where}.close.icon`, window.close.icon);
        }
    });

    each("iconRows", skin.iconRows, (where, row) => {
        frame(`${where}.full`, row.full);
        frame(`${where}.empty`, row.empty);
        if (row.half) frame(`${where}.half`, row.half);
    });

    each("menus", skin.menus, (where, menu) => exists(`${where}.button`, "button", skin.buttons[menu.button], menu.button));

    return problems;
}
