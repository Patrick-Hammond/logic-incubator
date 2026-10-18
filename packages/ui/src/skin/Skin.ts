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
    /**
     * How far the frame is drawn beyond the widget's box on each side: a selected tab that stands taller than the others, or a highlight round a slot. The widget's size, and
     * where its content sits, don't change.
     */
    outset?: Insets;
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
    /** The fill: a picture stretched (or repeated) to the filled width. */
    fill: string;
    /** "tile" repeats the fill's picture along the bar - for a fill with a pattern, which stretching would smear; stretched by default. */
    fillMode?: SliceMode;
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

/** A slider's art along one axis: the track (stretched along it) and the thumb (a picture at its own size). */
export type SliderAxisSkin = {
    track: NineSliceSkin;
    /** The track's thickness (its length is the slider's). */
    thickness: number;
    thumb: FrameStates;
};

export type SliderSkin = SliderAxisSkin & {
    /** A picture stretched from the start of the track to the thumb, if the track fills as it goes. */
    fill?: string;
    fillPadding?: Insets;
    /** The art of a vertical slider; without it a vertical slider is the horizontal one turned on its side. */
    vertical?: SliderAxisSkin;
};

/** A scrollbar's art along one axis: the track, and the thumb in each state. */
export type ScrollbarAxisSkin = {
    track: NineSliceSkin;
    thumb: { normal: NineSliceSkin } & Partial<Record<Exclude<ButtonState, "normal">, NineSliceSkin>>;
};

export type ScrollbarSkin = ScrollbarAxisSkin & {
    /** How wide a vertical scrollbar is (how tall a horizontal one). */
    thickness: number;
    /** The track's own thickness, centred in the bar's, when it is thinner than the thumb (a rail for a grip); the bar's by default. */
    trackThickness?: number;
    /** The shortest the thumb gets, however much there is to scroll. */
    minThumb: number;
    /** A thumb this long whatever is in view - a grip rather than a gauge of how much shows; by default it is as long as the share of the content in view. */
    thumbLength?: number;
    /** The arrow buttons at the ends, if it has them: a button variant, and the glyph frames. */
    arrows?: { button: string; up: string; down: string; left: string; right: string };
    /** The art of a horizontal scrollbar; without it a horizontal bar is the vertical one turned on its side. */
    horizontal?: ScrollbarAxisSkin;
};

/** A row (or column) of tabs: the look of each state, and how a label or icon sits in a tab. */
export type TabSkin = {
    states: { inactive: NineSliceSkin; active: NineSliceSkin; hover?: NineSliceSkin; disabled?: NineSliceSkin };
    padding: Insets;
    font: string;
    textColour: { inactive: number; active: number; hover?: number; disabled?: number };
    /** Between neighbouring tabs. */
    gap: number;
    height: number;
    /** A fixed width, for tabs of one size whatever they hold; by default the label's (or icon's) width and the padding, at least `minWidth`. */
    width?: number;
    minWidth?: number;
    /** Tabs down the side of a panel rather than along its top: the strip is a column. */
    vertical?: boolean;
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
    /** The pointer when the tooltip is above what it points at (it points down), and below it; a tooltip without them is just the note. */
    tailDown?: string;
    tailUp?: string;
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
    /**
     * Whether the portrait's frame stands beside the box, on its left and as tall as it needs, rather than inside it; the box then starts where the frame ends, less
     * `portraitOverlap` (the box tucks under the frame's edge).
     */
    portraitBeside?: boolean;
    /** Room between the portrait's frame and the picture, when the frame stands beside the box. */
    portraitPadding?: number;
    portraitOverlap?: number;
    /** Between the portrait and the text, when the portrait is inside the box. */
    gap: number;
    /** A plate the speaker's name sits on, across the box's top edge (like a window's title); without it the name is the first line of the text. */
    nameFrame?: NineSliceSkin;
    /**
     * The plate's height, the room each side of the name in it, how far its left end is from the box's left edge, how far above the box's top edge its top is, and how far the
     * name sits above the middle of the plate.
     */
    nameHeight?: number;
    namePadding?: number;
    nameInset?: number;
    nameOffset?: number;
    nameRaise?: number;
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

/** A window: a panel with a title plate across its top edge and, if it has one, a close button. */
export type WindowSkin = {
    /** The panel variant it is built on. */
    panel: string;
    title: NineSliceSkin;
    /** The plate's height (its frame is a small nine-slice source, so its own height says nothing about the plate's). */
    titleHeight: number;
    titleFont: string;
    titleColour: number;
    /** Room each side of the title text inside the plate. */
    titlePadding: number;
    /** How far the plate sits above (negative: below) the panel's top edge. */
    titleOffset: number;
    /** How far the title text sits above the middle of the plate (a plate whose lower rows are its base). */
    titleRaise?: number;
    /** A button variant, the glyph drawn in it (none for a button whose art is the glyph), and where it sits from the top-right corner. */
    close?: { button: string; icon?: string; offset: { x: number; y: number } };
};

/** A row of icons standing for an amount: hearts, orbs. */
export type IconRowSkin = { full: string; half?: string; empty: string; gap: number };

/** A column of buttons. */
export type MenuSkin = { button: string; gap: number };

/** A choice stepped through with arrows either side of it (a language, a screen size): the arrows' pictures, and how the value is written between them. */
export type SelectorSkin = {
    left: string;
    right: string;
    font: string;
    /** The value's colour in each state (`disabled` also dims the arrows). */
    textColour: StateColours;
    /** The arrows' tint in each state; an arrow at the end of the choices (when they don't go round) is drawn `disabled`. */
    arrowColour: StateColours;
    /** Room between an arrow and the value. */
    gap: number;
    /** How far an arrow nudges outwards while it is pressed. */
    nudge?: number;
};

/** A mouse pointer: its picture, and the pixel in it that points (from its top-left). */
export type CursorSkin = { frame: string; x: number; y: number };

/** A bar inside a fixed frame (`PlayerFrameSkin`): the fill's picture, where its left end sits in the frame, and its length when full (the picture's width by default). */
export type FrameBarSkin = { fill: string; x: number; y: number; width?: number };

/** A HUD frame for one character: a picture with a box for their portrait and troughs for their health and energy, and a row of status icons. */
export type PlayerFrameSkin = {
    frame: string;
    /** Where the portrait goes in the frame (it is drawn centred in this box, behind the frame). */
    portrait: { x: number; y: number; width: number; height: number };
    health: FrameBarSkin;
    energy?: FrameBarSkin;
    /** Where the first status icon goes, and the room between them. */
    statuses: { x: number; y: number; gap: number };
};

/** An ability on the HUD: a frame round its icon, with the button that uses it shown above. */
export type AbilitySkin = {
    frame: string;
    /** Room between the frame's edge and the icon's box. */
    iconInset: number;
    /** Between the frame's top and the button prompt above it. */
    glyphGap: number;
    /** The shade drawn over the icon while the ability recharges (colour and opacity). */
    cooldownColour: number;
    cooldownAlpha: number;
};

/** A skill tree: skills on a grid, joined by links through junction rings. */
export type SkillTreeSkin = {
    /** The grid's pitch: skills and rings sit at the middle of their cells. */
    cell: number;
    /** A skill's picture is this size (and its locked look the same). */
    nodeSize: number;
    /** Drawn round the selected skill, `selectedOutset` beyond it on every side. */
    selected: string;
    selectedOutset: number;
    rings: { locked: string; unlocked: string };
    /** A link's picture (stretched along it) and its thickness. */
    links: { locked: string; unlocked: string };
    linkThickness: number;
    /** Between a ring and the links that meet it. */
    ringGap: number;
    /** A skill's tier badge (`tier_2`) and its locked look (`tier_2_locked`) are frames with this prefix; it sits at the skill's bottom-right corner, `tierInset` in. */
    tierPrefix: string;
    tierInset: number;
};

/** The marker that pulses round a tile under the pointer: its frames (played in a loop), how long each shows, and where the tile sits in a frame (its top-left). */
export type TileMarkerSkin = { frames: string[]; frameMs: number; tileX: number; tileY: number };

/**
 * The sounds a UI makes: `focus` as focus moves to another control (or tab), `confirm` as a button is pressed, `back` as a screen is backed out of, `slider` as a slider or
 * selector steps, `toggle` as a checkbox or radio button is pressed, and `denied` as the player presses what can't be pressed now (a focused control that's disabled, or
 * what a game refuses - `UiTheme.Sound`).
 */
export type UiSound = "focus" | "confirm" | "back" | "slider" | "toggle" | "denied";

export type Skin = {
    name: string;
    /** The bundle the frames and fonts are in. */
    bundle: string;
    /** Whole screen pixels per UI pixel. */
    scale: number;
    /**
     * Spacings the widgets use that no frame or font says (a gap between a title and its text, the focus ring's thickness, a slide distance), in UI pixels. A widget asks for one
     * by name with `UiTheme.Metric` and has a default for a skin that leaves it out: iconGap, lineGap, slotGap, scrollGap, scrollMargin, scrollStep, caretWidth, caretMargin,
     * tailMargin, tailOverlap, slide, bob, ringGap, ringThickness, statusGap.
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
    selectors?: Record<string, SelectorSkin>;
    /** Mouse pointers by what they are for: `default`, `pointer` (over something pressable), `pressed`, and a game's own (`attack`). */
    cursors?: Record<string, CursorSkin>;
    playerFrames?: Record<string, PlayerFrameSkin>;
    abilities?: Record<string, AbilitySkin>;
    skillTrees?: Record<string, SkillTreeSkin>;
    tileMarkers?: Record<string, TileMarkerSkin>;
    /**
     * What the UI sounds like (see `UiSound`): each a sound's name in the skin's bundle (`confirm` is `ui.confirm`). One left out, or with no file in the bundle yet, is
     * silent - so a skin can name its sounds before they exist.
     */
    sounds?: Partial<Record<UiSound, string>>;
};

export function InsetsWidth(insets: Insets): number {
    return insets.left + insets.right;
}

export function InsetsHeight(insets: Insets): number {
    return insets.top + insets.bottom;
}
