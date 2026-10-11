// Builds the `ui` bundle's art from the Tiny Dungeons UI pack (design/Tiny Dungeons - UI Pack): every piece the skin draws becomes assets/ui/sprites/ui/<name>.png, and
// assets/ui/data/frames.json records each one's size and - for a frame that stretches - its nine-slice insets, found from the art itself (the longest run of identical
// columns and rows is the part that stretches; see `AutoInsets`).
//
// The pack is drawn for a 480x270 screen; the game's canvas is 1280x720 and its UI is laid out at 1x, so every piece is enlarged (2x by default, nearest neighbour - each
// pixel a block, never smoothed) and its insets with it.
//
// The pack's slate greys are turned violet, to match the game's first UI (hue 245 by default; --hue=none keeps the pack's own): each keeps its lightness, so the shading
// is the pack's, and the colours (reds, greens, the cream highlights, the near-black outline) are left alone.
//
// Most pieces are copied as they are. The looks the pack doesn't draw are made from the ones it does, and are the first thing to redraw by hand: hover (brighter) and
// disabled (greyed) states, a focused field and a selected slot (outlined in the pack's cream), the vertical slider track (the horizontal one mirrored across its diagonal,
// so its light still comes from the top left), tabs along a top edge (the side tab turned), green and amber bar fills, hearts (the heart of the health skill) and radio rings
// (the skill tree's junction rings). The window's title plate is made taller than the pack draws it (its straight-sided body grows), so the title has room round it; the dialogue's
// name plate is the pack's own.
//
// The sprites folder belongs to this tool: a PNG it doesn't write is removed (unless --keep), so a piece renamed or dropped here doesn't linger in the atlas.
//
//   node packages/ui/tools/import-pack.mjs [--pack=<dir>] [--scale=2] [--hue=245|none] [--sprites=<dir>] [--data=<dir>] [--keep]
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FrameEntry, FrameNameProblem, WriteFrames } from "./lib/frames.mjs";
import { AutoInsets, CreateImage, Crop, Recolour, Rotate90, Tint, TintNeutrals, Transpose, TrimToOpaque, UpscaleNearest } from "./lib/image.mjs";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => (args.find(a => a.startsWith("--" + name + "=")) || "").slice(name.length + 3) || fallback;
const packDir = option("pack", join(here, "../design/Tiny Dungeons - UI Pack"));
const spritesDir = option("sprites", join(here, "../assets/ui/sprites/ui"));
const dataDir = option("data", join(here, "../assets/ui/data"));
const keep = args.includes("--keep");
/** How many screen pixels each of the pack's pixels becomes. */
const scale = Number(option("scale", "2"));
if (!Number.isInteger(scale) || scale < 1) {
    console.error(`--scale must be a whole number of 1 or more, not "${option("scale", "")}".`);
    process.exit(1);
}

/** The hue the pack's greys are turned to, or null to keep them. */
const hue = option("hue", "245") === "none" ? null : Number(option("hue", "245"));
if (hue !== null && !(hue >= 0 && hue < 360)) {
    console.error(`--hue must be 0 to 359, or none, not "${option("hue", "")}".`);
    process.exit(1);
}
/** How saturated a turned grey is, by its lightness (0 to 1): the lighter, the more violet - the first UI's borders were its most colourful part. */
const Saturation = lightness => 0.15 + 0.45 * lightness;
const Violet = img => (hue === null ? img : TintNeutrals(img, hue, Saturation));

if (!existsSync(packDir)) {
    console.error(`No pack at "${packDir}": pass --pack=<the pack's folder>.`);
    process.exit(1);
}

/** A piece of the pack, its greys turned violet. */
const Read = file => {
    const png = PNG.sync.read(readFileSync(join(packDir, file)));
    return Violet({ width: png.width, height: png.height, data: new Uint8Array(png.data) });
};
const Trim = img => TrimToOpaque(img).image;

/** A colour of the pack as `Read` gives it (its greys turned). */
const Turned = hex => {
    const pixel = CreateImage(1, 1, [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(255));
    return "#" + Array.from(Violet(pixel).data.subarray(0, 3)).map(v => v.toString(16).padStart(2, "0")).join("");
};

// The pack's palette, by what it is used for.
const INK = Turned("#120a1a");
const LIGHT = Turned("#9da5ae");
const BLUE = Turned("#404863");
const DEEP = Turned("#2a2a41");
const CREAM = Turned("#feffe5");

// The looks the pack doesn't draw.
const Hover = img => Tint(img, { brightness: 1.18 });
const Pressed = img => Tint(img, { brightness: 0.82 });
const Disabled = img => Tint(img, { brightness: 0.6, saturation: 0.35 });

const frames = {};
const written = new Set();

/**
 * Writes a piece, enlarged. `insets` makes it a nine-slice frame: "auto" finds them, an object gives them, and an object with some sides missing finds just those - in the pack's
 * pixels, found and checked before enlarging (in the enlarged picture every column has a twin, so the stretchable run can't be told apart).
 */
function Put(name, image, insets = null) {
    const problem = FrameNameProblem(name);
    if (problem) throw new Error(problem);
    if (written.has(name)) throw new Error(`"${name}" is written twice.`);
    const resolved = insets ? { ...AutoInsets(image), ...(insets === "auto" ? {} : insets) } : null;
    if (resolved && (resolved.left + resolved.right >= image.width || resolved.top + resolved.bottom >= image.height)) {
        throw new Error(`"${name}": insets ${JSON.stringify(resolved)} leave nothing of a ${image.width}x${image.height} frame.`);
    }
    const big = UpscaleNearest(image, scale);
    const bigInsets = resolved && { left: resolved.left * scale, top: resolved.top * scale, right: resolved.right * scale, bottom: resolved.bottom * scale };
    writeFileSync(join(spritesDir, name + ".png"), PNG.sync.write({ width: big.width, height: big.height, data: Buffer.from(big.data) }));
    frames[name] = FrameEntry(big, bigInsets);
    written.add(name);
}

/** A piece in each of a widget's states: `looks` maps a state to its picture. */
function PutStates(prefix, looks, insets = null) {
    Object.keys(looks).forEach(state => Put(prefix + "_" + state, looks[state], insets));
}

/** The four states of a pressable piece, from its normal look and (if the pack has one) its pressed look. */
function Pressable(normal, pressed) {
    return { normal, hover: Hover(normal), pressed: pressed || Pressed(normal), disabled: Disabled(normal) };
}

mkdirSync(spritesDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });

// Buttons: the 3-slice buttons in grey, green and red; the small round ones; the HUD's square icon button.
[["primary", "component_3slices_button"], ["confirm", "component_3slices_button_green"], ["danger", "component_3slices_button_red"]].forEach(([variant, file]) => {
    PutStates("btn_" + variant, Pressable(Read(`components/${file}.png`), Read(`components/${file}_pressed.png`)), "auto");
});
["close", "reset", "validate"].forEach(kind => {
    PutStates("btn_" + kind, Pressable(Read(`components/component_button_${kind}.png`), Read(`components/component_button_${kind}_pressed.png`)), { left: 4, top: 4, right: 4, bottom: 4 });
});
PutStates("btn_icon", Pressable(Trim(Read("hud/hud_icon_button_background.png"))), "auto");

// Panels, the window's title plate (the dialogue's name plate is the same art) and the separators.
Put("panel_plain", Read("components/component_9slices_panel.png"), "auto");
Put("panel_carved", Read("components/component_9slices_panel_carved.png"), "auto");
Put("panel_carved_light", Read("components/component_9slices_panel_carved_light.png"), "auto");
Put("panel_raised", Read("components/component_9slices_panel_elevation_dark.png"), "auto");
Put("panel_raised_light", Read("components/component_9slices_panel_elevation_light.png"), "auto");
const plate = Read("components/component_3slices_window_title.png");
Put("window_title", TallerPlate(plate, 4), { top: 0, bottom: 0 });
Put("name_plate", plate, { top: 0, bottom: 0 });
[["separator", "component_5slices_panel_separation"], ["separator_light", "component_5slices_panel_separation_light"]].forEach(([style, file]) => {
    const line = Trim(Read(`components/${file}.png`));
    // Five slices: the end ornaments, the line either side (one column of it repeats) and the ornament in the middle.
    Put(`border_${style}_cap_l`, Crop(line, 0, 0, 12, line.height));
    Put(`border_${style}_mid`, Crop(line, 20, 0, 1, line.height));
    Put(`border_${style}_centre`, Crop(line, 50, 0, 12, line.height));
    Put(`border_${style}_cap_r`, Crop(line, line.width - 12, 0, 12, line.height));
});

// Bars: the health and energy troughs and their fills, and green and amber fills made from the health one.
Put("bar_hp_track", Read("hud/progress_bar/hud_progress_bar_health_background.png"), { top: 0, bottom: 0 });
Put("bar_mp_track", Read("hud/progress_bar/hud_progress_bar_energy_background.png"), { top: 0, bottom: 0 });
const healthFill = Read("hud/progress_bar/hud_progress_bar_health_overlay.png");
Put("bar_hp_fill", healthFill);
Put("bar_mp_fill", Read("hud/progress_bar/hud_progress_bar_energy_overlay.png"));
Put("bar_xp_fill", Recolour(healthFill, { "#81173f": "#29694e", "#cc1825": "#439d40", "#d49733": "#a6d86b" }));
Put("bar_gold_fill", Recolour(healthFill, { "#81173f": "#8a4b1c", "#cc1825": "#d49733", "#d49733": "#f7e08a" }));

// Toggles: the pack's checkbox is a switch; radios are the skill tree's junction rings (dark when off, cream when on).
const switchOff = Trim(Read("components/component_checkbox.png"));
const switchOn = Trim(Read("components/component_checkbox_checked.png"));
PutStates("checkbox_off", { normal: switchOff, hover: Hover(switchOff), disabled: Disabled(switchOff) });
PutStates("checkbox_on", { normal: switchOn, hover: Hover(switchOn), disabled: Disabled(switchOn) });
const paths = Read("skill_tree/skill_tree_path_tileset.png");
// The tileset is two 64-pixel halves (locked, unlocked) of rings on a 16-pixel grid; the bottom-left cell holds a ring on its own, and a link runs along row 54.
const ringLocked = Crop(paths, 4, 52, 8, 8);
const ringUnlocked = Crop(paths, 68, 52, 8, 8);
PutStates("radio_off", { normal: ringLocked, hover: Hover(ringLocked), disabled: Disabled(ringLocked) });
PutStates("radio_on", { normal: ringUnlocked, hover: Hover(ringUnlocked), disabled: Disabled(ringUnlocked) });

// Sliders and scrollbars share a track and a grip, horizontal and vertical.
const track = Read("components/component_slider_background.png");
Put("slider_track", track, { top: 0, bottom: 0 });
Put("slider_track_v", Transpose(track), { left: 0, right: 0 });
PutStates("slider_thumb", Pressable(Read("components/component_slider_cursor_horizontal.png")));
PutStates("slider_thumb_v", Pressable(Read("components/component_slider_cursor_vertical.png")));

// Tabs: the pack's are side tabs, open on the left (they hang off a panel's right edge, or flipped, its left); turned a quarter, they are tabs along a top edge.
const tab = Read("components/component_tab.png");
const tabActive = Read("components/component_tab_selected.png");
const sideTabs = { inactive: tab, active: tabActive, hover: Hover(tab), disabled: Disabled(tab) };
PutStates("tab_side", sideTabs, "auto");
PutStates("tab", { inactive: Rotate90(tab, false), active: Rotate90(tabActive, false), hover: Rotate90(sideTabs.hover, false), disabled: Rotate90(sideTabs.disabled, false) }, "auto");

// Text fields and inventory slots.
const field = Read("components/component_input.png");
PutStates("field", { normal: field, focused: Recolour(field, { [LIGHT]: CREAM }), disabled: Disabled(field) }, "auto");
const slot = Read("inventory/inventory_slot.png");
PutStates("slot", { normal: slot, hover: Recolour(slot, { [DEEP]: BLUE }), selected: Recolour(slot, { [INK]: CREAM }), disabled: Disabled(slot) }, "auto");
["boots", "chestplate", "helmet", "leggings", "ring", "shield", "sword"].forEach(kind => Put("slot_icon_" + kind, Read(`inventory/inventory_slot_icon_${kind}.png`)));

// Icons.
["up", "down", "left", "right"].forEach(way => Put("icon_arrow_" + way, Read(`icons/icon_arrow_${way}.png`)));
[["bestiary", "bestiary"], ["burger", "menu"], ["help", "help"], ["info", "info"], ["locked", "locked"], ["medals", "medals"], ["quests", "quests"], ["settings", "settings"]].forEach(([file, name]) => {
    Put("icon_" + name, Read(`icons/icon_button_${file}.png`));
});
["armor", "blood", "boost", "energy", "fire", "health", "shield", "skull", "speed", "strength", "time", "weapon"].forEach(kind => Put("status_" + kind, Read(`hud/icons/icon_status_${kind}.png`)));

// Hearts for an icon row: the heart of the health skill, outlined, in red, half red and empty.
Hearts(Read("skill_tree/skill_icons/skill_health.png"));

// The HUD's player frame (portrait, health and energy troughs) and its fills, and the ability frame.
Put("hud_player", Trim(Read("hud/hud_player_infos.png")));
Put("hud_player_health", Read("hud/hud_player_infos_health_bar.png"));
Put("hud_player_energy", Read("hud/hud_player_infos_energy_bar.png"));
Put("ability_frame", Trim(Read("hud/hud_ability_icon_border.png")));

// Pointers, and the marker that pulses round a tile under the pointer (two 48-pixel frames with the tile in the middle 16).
[["default", "default"], ["hand", "pointer"], ["hand_pressed", "pressed"], ["sword", "attack"]].forEach(([file, name]) => Put("cursor_" + name, Read(`cursor/cursor_${file}.png`)));
const marker = Read("cursor/sheet_cursor_hovered_tile.png");
Put("tile_marker_0", Crop(marker, 0, 0, 48, 48));
Put("tile_marker_1", Crop(marker, 48, 0, 48, 48));

// Button prompts: keys, pad buttons (with their pressed looks), sticks and the mouse.
readdirSync(join(packDir, "input")).filter(f => f.endsWith(".png")).sort().forEach(file => {
    const name = file
        .slice(0, -4)
        .replace(/^input_keyboard_/, "key_")
        .replace(/^input_controller_joystick_left_/, "stick_l_")
        .replace(/^input_controller_joystick_right_/, "stick_r_")
        .replace(/^input_controller_/, "pad_")
        .replace(/^input_mouse_/, "mouse_");
    Put(name, Read("input/" + file));
});

// The skill tree: the sample skills (each with a locked look), the selection frame, tier badges, and the rings and links that join skills.
["health", "inventory", "stat_boost", "strength"].forEach(skill => {
    Put("skill_" + skill, Read(`skill_tree/skill_icons/skill_${skill}.png`));
    Put("skill_" + skill + "_locked", Read(`skill_tree/skill_icons/skill_${skill}_locked.png`));
});
Put("skill_selected", Read("skill_tree/skill_selected.png"));
Put("skill_ring_locked", ringLocked);
Put("skill_ring_unlocked", ringUnlocked);
Put("skill_link_locked", Crop(paths, 30, 54, 4, 4));
Put("skill_link_unlocked", Crop(paths, 94, 54, 4, 4));
["1", "2", "3", "4", "5", "plus"].forEach(tier => {
    const file = tier === "plus" ? "icon_plus" : "icon_tier_" + tier;
    Put("tier_" + tier, Read(`skill_tree/tier_icons/${file}.png`));
    Put("tier_" + tier + "_locked", Read(`skill_tree/tier_icons/${file}_locked.png`));
});

/**
 * The title plate made `extra` pixels taller: below the row where its sides run straight, the plate's body moves down and that row is repeated to fill the gap, and the curls at
 * its two ends (the outer 11 columns, which stand clear of the body above its base) move down with it, so they stay on the base.
 */
function TallerPlate(plate, extra) {
    const body = 9;
    const curl = 11;
    const out = CreateImage(plate.width, plate.height + extra);
    const copy = (x, from, to) => out.data.set(plate.data.subarray((from * plate.width + x) * 4, (from * plate.width + x) * 4 + 4), (to * out.width + x) * 4);
    for (let x = 0; x < plate.width; x++) {
        const end = x < curl || x >= plate.width - curl;
        for (let y = 0; y < plate.height; y++) {
            copy(x, y, end || y >= body ? y + extra : y);
        }
        if (!end) {
            for (let y = body; y < body + extra; y++) copy(x, body, y);
        }
    }
    return out;
}

/** Full, half and empty hearts from the cream heart drawn on a skill icon: its shape, filled, with a dark outline round it. */
function Hearts(icon) {
    const cream = [254, 255, 229];
    const shape = CreateImage(icon.width, icon.height);
    for (let i = 0; i < icon.width * icon.height; i++) {
        if (icon.data[i * 4] === cream[0] && icon.data[i * 4 + 1] === cream[1] && icon.data[i * 4 + 2] === cream[2]) shape.data.set([255, 255, 255, 255], i * 4);
    }
    const { image: mask } = TrimToOpaque(shape);
    const fill = (colour, split, rest) => {
        const out = CreateImage(mask.width + 2, mask.height + 2);
        const paint = (x, y, hex) => out.data.set([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255], (y * out.width + x) * 4);
        const inside = (x, y) => x >= 0 && y >= 0 && x < mask.width && y < mask.height && mask.data[(y * mask.width + x) * 4 + 3] > 0;
        for (let y = 0; y < out.height; y++) {
            for (let x = 0; x < out.width; x++) {
                if (inside(x - 1, y - 1)) {
                    paint(x, y, x - 1 < split ? colour : rest);
                } else if (inside(x - 2, y - 1) || inside(x, y - 1) || inside(x - 1, y - 2) || inside(x - 1, y)) {
                    paint(x, y, INK);
                }
            }
        }
        return out;
    };
    const half = Math.ceil(mask.width / 2);
    Put("icon_heart_full", fill("#cc1825", mask.width, "#cc1825"));
    Put("icon_heart_half", fill("#cc1825", half, BLUE));
    Put("icon_heart_empty", fill(BLUE, 0, BLUE));
}

WriteFrames(join(dataDir, "frames.json"), frames);
let removed = 0;
if (!keep) {
    readdirSync(spritesDir)
        .filter(f => f.endsWith(".png") && !written.has(f.slice(0, -4)))
        .forEach(f => {
            unlinkSync(join(spritesDir, f));
            removed++;
        });
}
console.log(`Wrote ${written.size} sprites at ${scale}x to ${spritesDir}${removed ? `, removed ${removed} the pack doesn't have` : ""}, and ${join(dataDir, "frames.json")}.`);
