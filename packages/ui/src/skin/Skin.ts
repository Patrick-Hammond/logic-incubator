/**
 * What a skin is: the one place a UI's look lives. Widgets take every size, colour, font and picture from here and hard-code none of them, which is what lets
 * the same widgets be dressed as the game's chunky 2x UI, a compact tool UI for the editor, or a game's own re-skin. A skin is plain data (the `ui.skin`
 * data asset, `assets/ui/data/skin.json`); this file is its shape. Pure - no Pixi - so it, and the checks on it (`ValidateSkin`), run under the plain
 * node test runner.
 *
 * Sizes are in **UI pixels** (art pixels): the UI layer is drawn at the skin's integer `scale`, so a 6-pixel inset is 12 screen pixels at 2x and every
 * widget lands on whole art pixels. Frames are names of sprites in the skin's bundle (`btn_primary_normal` is the asset `ui.btn_primary_normal`).
 */

export type Insets = { left: number; top: number; right: number; bottom: number };

/** How a part of a nine-slice fills the room it is given: stretched, or repeated whole (for edges and middles that have a pattern). */
export type SliceMode = "stretch" | "tile";

/** A frame cut into nine at `insets`: the corners stay as drawn, the edges and the middle grow. */
export type NineSliceSkin = {
    frame: string;
    insets: Insets;
    /** The four edges; stretched by default. */
    edges?: SliceMode;
    centre?: SliceMode;
};

export type ButtonState = "normal" | "hover" | "pressed" | "disabled" | "focused";

/** A kind of button (primary, danger...): its look in each state, and how its label sits in it. A state it doesn't draw falls back to `normal`. */
export type ButtonSkin = {
    states: { normal: NineSliceSkin } & Partial<Record<Exclude<ButtonState, "normal">, NineSliceSkin>>;
    /** Room between the frame's edge and the label. */
    padding: Insets;
    /** The label's colour in each state (0xRRGGBB); a state it doesn't give uses `normal`'s. */
    textColour: { normal: number } & Partial<Record<Exclude<ButtonState, "normal">, number>>;
    /** How far the label moves while pressed. */
    pressedOffset: { x: number; y: number };
    /** The key into the skin's `fonts`. */
    font: string;
    /** Smallest size, so a short label doesn't make a tiny button. */
    minWidth?: number;
    minHeight?: number;
};

/**
 * An ornamental horizontal line, built from four pieces: a cap at each end, a middle that repeats, and an ornament in the centre. It is used on its
 * own as a divider and laid along the top of a panel as its border, from the same art.
 */
export type BorderStyleSkin = {
    capLeft: string;
    capRight: string;
    /** The repeating middle; without it the gaps are left empty. */
    mid?: string;
    centre?: string;
};

export type PanelSkin = {
    frame: NineSliceSkin;
    /** Room between the frame's edge and what is put in it. */
    padding: Insets;
    /** The border style laid along the panel's top edge, if it has one. */
    borderTop?: string;
    /** How far the border sits below the frame's top edge (negative to overlap the frame's own edge). */
    borderOffset?: number;
};

/** A bar (health, mana, experience...): a track with a fill that grows inside it. */
export type BarSkin = {
    track: NineSliceSkin;
    /** The track's height in UI pixels: its frame is a small nine-slice source, so its own height says nothing about the bar's. */
    height: number;
    /** The fill: a picture stretched to the filled width. */
    fill: string;
    /** Where the fill sits inside the track. */
    fillPadding: Insets;
};

export type FontSkin = {
    /** The font asset: `wonky_small` is the asset `ui.wonky_small`, a bitmap font (.fnt) in the skin's bundle. */
    id: string;
    /**
     * The size to draw it at, in UI pixels - the font's own size (the `size` in its .fnt) scaled by this over that. A font made for the full-size canvas is
     * 1:1 on screen at half its size in a 2x UI (a 20-pixel font is drawn at 10), while one made for the UI grid is drawn at its own size.
     */
    size: number;
};

/** Frame names for each state of something drawn as a plain picture (a checkbox's box, a slider's thumb); a state not given uses `normal`'s. */
export type FrameStates = { normal: string } & Partial<Record<Exclude<ButtonState, "normal">, string>>;

/** A colour for each state (0xRRGGBB); a state not given uses `normal`'s. */
export type StateColours = { normal: number } & Partial<Record<Exclude<ButtonState, "normal">, number>>;

/** A checkbox or a radio button: a box (or ring) in two states of the same look - off and on - with a label beside it. */
export type ToggleSkin = {
    off: FrameStates;
    on: FrameStates;
    /** Between the box and its label. */
    gap: number;
    font: string;
    textColour: StateColours;
};

export type SliderSkin = {
    track: NineSliceSkin;
    /** The track's thickness (its length is the slider's). */
    thickness: number;
    thumb: FrameStates;
    /** A picture stretched from the start of the track to the thumb, if the track fills as it goes. */
    fill?: string;
    fillPadding?: Insets;
};

export type ScrollbarSkin = {
    /** How wide a vertical scrollbar is (how tall a horizontal one). */
    thickness: number;
    track: NineSliceSkin;
    thumb: { normal: NineSliceSkin } & Partial<Record<Exclude<ButtonState, "normal">, NineSliceSkin>>;
    /** The shortest the thumb gets, however much there is to scroll. */
    minThumb: number;
    /** The arrow buttons at the ends, if it has them: a button variant, and the glyph frames. */
    arrows?: { button: string; up: string; down: string; left: string; right: string };
};

/** A row of tabs: the look of each state, and how a label sits in a tab. */
export type TabSkin = {
    states: { inactive: NineSliceSkin; active: NineSliceSkin; hover?: NineSliceSkin; disabled?: NineSliceSkin };
    padding: Insets;
    font: string;
    textColour: { inactive: number; active: number; hover?: number; disabled?: number };
    /** Between neighbouring tabs. */
    gap: number;
    height: number;
    minWidth?: number;
};

/** A text field: its frame in each state, how its text sits, and the colours of its text, placeholder, caret and selection. */
export type FieldSkin = {
    states: { normal: NineSliceSkin; focused?: NineSliceSkin; disabled?: NineSliceSkin };
    padding: Insets;
    height: number;
    font: string;
    textColour: number;
    placeholderColour: number;
    caretColour: number;
    selectionColour: number;
};

/** An inventory slot: its frame in each state, and how an item and its count sit in it. */
export type SlotSkin = {
    states: { normal: NineSliceSkin; hover?: NineSliceSkin; selected?: NineSliceSkin; disabled?: NineSliceSkin };
    /** The slot's width and height. */
    size: number;
    /** Room between the slot's edge and the item. */
    iconInset: number;
    countFont: string;
    countColour: number;
};

export type TooltipSkin = {
    frame: NineSliceSkin;
    padding: Insets;
    /** The pointer when the tooltip is above what it points at (it points down), and below it. */
    tailDown: string;
    tailUp: string;
    /** Between the tooltip's tail and what it points at. */
    gap: number;
    /** Lines wrap at this width. */
    maxWidth: number;
    titleFont: string;
    titleColour: number;
    textFont: string;
    textColour: number;
    /** How long the pointer rests on something before its tooltip shows (ms). */
    delay: number;
};

export type DialogueSkin = {
    frame: NineSliceSkin;
    padding: Insets;
    portraitFrame: NineSliceSkin;
    /** The portrait's width and height. */
    portraitSize: number;
    /** Between the portrait and the text. */
    gap: number;
    nameFont: string;
    nameColour: number;
    bodyFont: string;
    bodyColour: number;
    /** The marker shown when all the text is out and there is more to come. */
    arrow: string;
    charactersPerSecond: number;
};

export type ToastKindSkin = { frame: NineSliceSkin; titleColour: number; icon?: string };

export type ToastSkin = {
    kinds: Record<string, ToastKindSkin>;
    padding: Insets;
    width: number;
    /** Between stacked toasts. */
    gap: number;
    titleFont: string;
    textFont: string;
    textColour: number;
    /** How long one stays (seconds). */
    seconds: number;
};

/** A window: a panel with a title pill across its top edge and, if it has one, a close button. */
export type WindowSkin = {
    /** The panel variant it is built on. */
    panel: string;
    title: NineSliceSkin;
    /** The pill's height (its frame is a small nine-slice source, so its own height says nothing about the pill's). */
    titleHeight: number;
    titleFont: string;
    titleColour: number;
    /** Room each side of the title text inside the pill. */
    titlePadding: number;
    /** How far the pill sits above (negative: below) the panel's top edge. */
    titleOffset: number;
    close?: { button: string; icon: string; offset: { x: number; y: number } };
};

/** A row of icons standing for an amount: hearts, orbs. */
export type IconRowSkin = { full: string; half?: string; empty: string; gap: number };

/** A column of buttons. */
export type MenuSkin = { button: string; gap: number };

export type Skin = {
    name: string;
    /** The bundle the frames and fonts are in. */
    bundle: string;
    /** Whole screen pixels per UI pixel. */
    scale: number;
    /**
     * Spacings the widgets use that no frame or font says (a gap between a title and its text, the focus ring's thickness, a slide distance), in UI pixels. A widget asks for one
     * by name with `UiTheme.Metric` and has a default for a skin that leaves it out: iconGap, lineGap, slotGap, scrollGap, scrollMargin, scrollStep, caretWidth, caretMargin,
     * tailMargin, tailOverlap, slide, bob, ringGap, ringThickness.
     */
    metrics?: Record<string, number>;
    fonts: Record<string, FontSkin>;
    /** Named colours for text and tints (0xRRGGBB). */
    colours: Record<string, number>;
    buttons: Record<string, ButtonSkin>;
    panels: Record<string, PanelSkin>;
    borderStyles: Record<string, BorderStyleSkin>;
    bars: Record<string, BarSkin>;
    checkboxes?: Record<string, ToggleSkin>;
    radios?: Record<string, ToggleSkin>;
    sliders?: Record<string, SliderSkin>;
    scrollbars?: Record<string, ScrollbarSkin>;
    tabs?: Record<string, TabSkin>;
    fields?: Record<string, FieldSkin>;
    slots?: Record<string, SlotSkin>;
    tooltips?: Record<string, TooltipSkin>;
    dialogues?: Record<string, DialogueSkin>;
    toasts?: Record<string, ToastSkin>;
    windows?: Record<string, WindowSkin>;
    iconRows?: Record<string, IconRowSkin>;
    menus?: Record<string, MenuSkin>;
};

export function InsetsWidth(insets: Insets): number {
    return insets.left + insets.right;
}

export function InsetsHeight(insets: Insets): number {
    return insets.top + insets.bottom;
}
