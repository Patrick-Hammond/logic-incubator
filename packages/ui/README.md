# @logic-incubator/ui

A skinnable UI kit for Pixi games: buttons, panels and windows, dividers, switches, radios, sliders, choice selectors, tabs, scroll views, text fields, inventory slots, tooltips,
dialogue boxes, toasts, progress bars and icon rows; HUD pieces (a character's frame, ability slots, status icons), button prompts, a skill tree, mouse pointers and a tile marker;
and the keyboard / gamepad / mouse focus navigation that drives them - all drawn from one skin so a game, or the editor later, can dress the same widgets differently. Depends on
`lib` only. The game skin is the [Tiny Dungeons UI pack](design/Tiny%20Dungeons%20-%20UI%20Pack), enlarged 2x.

| Where | What |
|---|---|
| `src/skin/` | `Skin` (the shape of a skin file), `ParseSkin` (`"#rrggbb"` colours), `ValidateSkin` (a skin against its art), `ResolveFrames` (nine-slice insets from the frame index) |
| `src/geometry/` | `SliceRects` (nine-slice maths), `BorderRects` (ornamental line layout) - pure |
| `src/widgets/` | The widgets: `NineSlice`, `UiText`, `UiBorder`, `UiPanel`, `UiWindow`, `UiButton`, `UiMenu`, `UiCheckbox`, `UiRadio` (+ group), `UiSlider`, `UiSelector`, `UiTabs`, `UiScrollbar`, `UiScrollView`, `UiTextInput`, `UiItemSlot`, `UiInventoryGrid`, `UiTooltip`, `UiDialogue`, `UiToastHost`, `UiProgressBar`, `UiIconRow`; the HUD's `UiPlayerFrame`, `UiAbilitySlot`, `UiStatusRow`; `UiInputGlyph`, `UiSkillTree` (+ `UiSkillNode`), `UiTileMarker`. `UiControl` is what every pressable one shares |
| | The pure rules behind them: `ButtonLook`, `BarMath`, `SliderMath`, `SelectorMath`, `ScrollMath`, `TextInputModel`, `Typewriter`, `TooltipPlacement`, `ToastQueue`, `IconStates`, `InputGlyphs`, `SkillTreeLayout` |
| `src/input/` | `UiAction`, `KeyMap`, `PadMap`, `InputRepeater`, `UiInputCore` (the keyboard and pad as one stream of actions) and `FocusManager` (who has focus and where an arrow goes) - all pure; `FocusRing` and `UiSystem` are the Pixi / browser side |
| `src/UiTheme.ts`, `src/UiLayer.ts`, `src/UiCursor.ts` | A skin plus the art it names - what widgets are given; `UiLayer`, a component that makes a scene's UI layer (theme, scaled root, focus and input); `UiCursor`, the skin's mouse pointers on the canvas |
| `assets/ui/` | The `ui` asset bundle: `sprites/ui/*.png` (one atlas, untrimmed), `fonts/*.fnt`, `data/skin.json`, `data/frames.json` |
| `design/` | The Tiny Dungeons UI pack the art comes from (its pieces, atlas and mockups) |
| `art/` | The Aseprite template of the whole atlas and how to use it (see "Art") |
| `tools/` | Dev tools, run by plain node (see "Art") |

## Using it in a game

Add `{ "dir": "../logic-incubator/packages/ui/assets" }` to the game's `assets.config.json` roots, a `@logic-incubator/ui/*` path to its `tsconfig.json` (and an alias to
`vitest.config.mts`), load the `ui` bundle (`await game.assets.LoadBundle("ui")`), then put a `UiLayer` over a scene:

```ts
// In a GameComponent's OnInitialise:
const layer = this.Attach(new UiLayer());
// Sizes are in UI pixels; layer.root is drawn at the skin's whole-number scale (1 in the game skin, whose art is already enlarged).
const button = new UiButton(layer.Theme, "primary", "NEW GAME", { width: 300 });
button.on("activate", () => { /* ... */ });
layer.root.addChild(button);
layer.Ui.Register(button);      // keyboard, gamepad and pointer focus
```

Without a component to attach to, `ThemeFor(game)` gives the theme and `new UiSystem(game, theme, container)` the focus and input.

The skin also has `metrics` - the few spacings no frame or font sets (a gap between a title and its text, the focus ring's thickness) - which widgets read with `theme.Metric(name, fallback)`.
Widgets are built by skin variant (`new UiSlider(theme, "default", 220, { min: 0, max: 100, step: 5 })`) and emit Pixi events: `activate` for a press, `change` for a value,
`select`, `advance`, `close`, `submit`. The game's `UiGallery` scene (dev builds, `#ui` on the page address; Q and E change page) shows every widget and is the best
reference for how each is used.

The pack's pieces and what draws them:

| Pack piece | Skin / widget |
|---|---|
| 3-slice buttons (grey, green, red) | buttons `primary` (and `secondary`, `small`), `confirm`, `danger` |
| Round close / reset / validate buttons | buttons `close`, `reset`, `validate` (the art is the glyph: no label or icon); `close` is the window's |
| HUD icon button background + `icons/` | button `icon` with an icon (`icon_help`, `icon_bestiary`, `icon_settings`, `icon_menu`, `icon_quests`, `icon_medals`, `icon_info`, `icon_locked`, the arrows) |
| 9-slice panels | panels `plain` (and `ornate`, with a divider), `carved`, `carved_light`, `raised`, `raised_light` |
| Window title / dialogue name plate | `UiWindow`'s title (on a taller plate the import makes, so the title has room round it), `UiDialogue`'s name plate (the pack's own) |
| 5-slice separations | border styles `separator`, `separator_light` (`UiBorder`, or a panel's `borderTop`) |
| Checkbox | `UiCheckbox` - the pack draws it as a switch |
| Slider background and cursors | `UiSlider` (horizontal and vertical) and `UiScrollbar` (a fixed grip on a rail) |
| Tabs | `UiTabs` `side` (a column down a panel's edge, `mirror` for its left edge) and `default` (the same art turned to stand along a top edge) |
| Input field | `UiTextInput` |
| Inventory slot, slot icons | `UiItemSlot` / `UiInventoryGrid`; `SetPlaceholder("slot_icon_helmet")` for an equipment slot |
| HUD player frame and its bars | `UiPlayerFrame` |
| HUD progress bars | bars `hp`, `mp` (and `xp`, `gold`, recoloured) - `UiProgressBar` |
| Ability border | `UiAbilitySlot` |
| Status icons | `UiStatusRow` (`status_fire`...) |
| Input prompts | `UiInputGlyph` (`key_e`, `pad_a`, `stick_l_u`, `mouse_left`; `InputGlyphs` maps key codes and pad buttons to them) |
| Skill icons, selection frame, tier badges, path tileset | `UiSkillTree` (`skill_health`, `tier_2`, the rings and links) |
| Pointers, hovered-tile sheet | `UiCursor` (`default`, `pointer`, `pressed`, `attack`), `UiTileMarker` |
| Settings mockup's "< value >" rows | `UiSelector` |
| (made) a speech bubble's points | tooltip `speech`: a speech bubble on the light raised panel, pointed at a figure with `ShowAt` (the dungeon's NPC shouts) |

## Focus and input

`UiSystem` (one per screen: make it in `OnInitialise`, `Destroy` it with `Own`, `SetActive(true/false)` from `OnShow`/`OnHide`) feeds the keyboard (arrows and WASD move,
Enter and Space accept, Escape and Backspace cancel, Q/E and Page Up/Down step through tabs), the first gamepad (d-pad, left stick, A, B, shoulder buttons) and the pointer
into a `FocusManager`. Held directions repeat (350 ms, then every 120 ms).

- `ui.Register(control, { id, scope, neighbours, scroll })` makes a control focusable. Hovering focuses it, the arrows move to the nearest enabled one in that direction
  (`ui.focus.ConfigureScope({ wrap: true })` wraps round), accept presses it, and a focus ring is drawn round it while the keyboard or pad is the one in use - the pointer
  moving hides it. A slider and a selector take left and right themselves. With `scroll`, moving focus onto a control scrolled out of view scrolls it in.
- `ui.PushScope(id, { onCancel })` / `PopScope(id)` put a modal in charge of focus and Escape; items registered with that `scope` are the only ones reachable.
- `ui.Track(widget)` calls `widget.Update(ms)` every frame (dialogue typing, toasts, a text field's caret, a tile marker). `ui.RegisterScroll(view)` lets the wheel scroll a
  `UiScrollView`. `ui.BindTabs(tabs)` makes Q/E step through a `UiTabs`.
- A `UiTextInput` is the kit's drawing over the page's own `<input>` (transparent, placed over the field while it is being edited), so typing, IME, undo and the clipboard
  are the browser's; keys typed in it are kept from `game.keyboard`.
- Pixi 5.2.1 doesn't announce a destroyed object, so `UiControl` and `UiScrollView` emit `destroyed` themselves - destroying a widget (or a panel, window or grid that
  holds it) lets go of its focus registration.

`ValidateLoadedSkin(skin, assets)` lists what's wrong with a skin (a missing frame, an inset that leaves nothing of its frame).

## Art

The art is the Tiny Dungeons UI pack. It is drawn for a 480x270 screen and the game's UI is laid out at 1x on its 1280x720 canvas (the skin's `scale` is 1), so the pieces are
stored enlarged 2x with nearest-neighbour scaling - each of the pack's pixels a 2x2 block, never smoothed. The pack's slate greys are turned violet on the way in, to match the
game's first UI: each keeps its lightness (so the shading is the pack's) and takes hue 245, more saturated the lighter it is; its reds, greens, cream and near-black are left
alone (`--hue=<0-359>` for another hue, `--hue=none` for the pack's own greys). Nine-slice frames are stored whole (a whole button, a whole panel) with the
corners marked by their insets in `data/frames.json`.

`node packages/ui/tools/import-pack.mjs` builds the bundle's sprites and `frames.json` from the pack folder, enlarged (`--scale=N`, 2 by default): it copies the pieces, finds each stretchable frame's insets from the art
itself (the longest run of identical columns and rows is the part that stretches), and makes the looks the pack doesn't draw - hover (brighter) and disabled (greyed) states, a
focused field and a selected slot (outlined in the pack's cream), the vertical slider track (the horizontal one mirrored across its diagonal so its light still comes from the top
left), tabs along a top edge (the side tab turned), green and amber bar fills, hearts (from the health skill's heart), radio rings (the skill tree's junction rings) and a speech bubble's points (in the light raised panel's edge colours). Those are
the first things to redraw by hand. It also makes the window's title plate taller than the pack draws it (`window_title`: the plate's straight-sided body grows, its end curls
stay on its base) so the title has room round it, and keeps the pack's own as the dialogue's `name_plate`. The tool owns `sprites/ui/`: a PNG it doesn't write is removed (`--keep` to leave them).

To change the art, edit the pack's files and import again - or, to draw over the whole atlas at once, use the Aseprite template in `art/` (see its README), but then don't import
the pack again, as it rewrites the sprites.

| Command (from the repo root) | What it does |
|---|---|
| `node packages/ui/tools/import-pack.mjs` | The pack (`--pack=<dir>`) into `assets/ui/sprites/ui/*.png` and `data/frames.json` |
| `node packages/ui/tools/make-template.mjs` | Lays every frame of the atlas out on one Aseprite sheet: `art/ui-template.png`, `.lua` and a numbered guide |
| `node packages/ui/tools/slice-sheet.mjs --aseprite=<Aseprite.exe> packages/ui/art/ui.aseprite` | Slices the edited sprite back into `assets/ui/sprites/ui/*.png` and `data/frames.json` |
| `node packages/ui/tools/convert-bmfont.mjs <font.fnt>` | A BMFont text export to the XML `.fnt` Pixi 5.2.1 reads, plus a white page (`assets/ui/fonts`) |

The Lua script and the command-line export follow Aseprite's documented scripting and CLI but have not been run against a real Aseprite; the slicer is tested against Aseprite's
export format.

## Fonts

The skin's fonts are the game's `wonky_small` / `wonky_medium` / `wonky_huge` (20, 60 and 120 px). A font is drawn at the skin's `size` in UI pixels - 20, 60 and 120, which is 1:1
on the canvas at the 1x UI scale - so a font made for the full-size canvas needs no other change. One size in between is `wonky_medium` drawn smaller: `subtitle` (40, a
name that needs room round it - the class name in character select). The pack's mockups use "Enter the Gungeon Big" (named in the pack's
`font.txt`); it isn't included, and would be converted with `convert-bmfont.mjs` and named in the skin's `fonts` if it were wanted. Button labels are given at run time.
