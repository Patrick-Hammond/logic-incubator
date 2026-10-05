# @logic-incubator/ui

A skinnable UI kit for Pixi games: buttons, panels and windows, ornamental borders and dividers, checkboxes, radios, sliders, tabs, scroll views, text fields, inventory
slots, tooltips, dialogue boxes, toasts, progress bars and icon rows, and the keyboard / gamepad / mouse focus navigation that drives them - all drawn from one skin so a
game, or the editor later, can dress the same widgets differently. Depends on `lib` only.

| Where | What |
|---|---|
| `src/skin/` | `Skin` (the shape of a skin file), `ParseSkin` (`"#rrggbb"` colours), `ValidateSkin` (a skin against its art), `ResolveFrames` (nine-slice insets from the frame index) |
| `src/geometry/` | `SliceRects` (nine-slice maths), `BorderRects` (ornamental line layout) - pure |
| `src/widgets/` | The widgets: `NineSlice`, `UiText`, `UiBorder`, `UiPanel`, `UiWindow`, `UiButton`, `UiMenu`, `UiCheckbox`, `UiRadio` (+ group), `UiSlider`, `UiTabs`, `UiScrollbar`, `UiScrollView`, `UiTextInput`, `UiItemSlot`, `UiInventoryGrid`, `UiTooltip`, `UiDialogue`, `UiToastHost`, `UiProgressBar`, `UiIconRow`. `UiControl` is what every pressable one shares |
| | The pure rules behind them: `ButtonLook`, `BarMath`, `SliderMath`, `ScrollMath`, `TextInputModel`, `Typewriter`, `TooltipPlacement`, `ToastQueue`, `IconStates` |
| `src/input/` | `UiAction`, `KeyMap`, `PadMap`, `InputRepeater`, `UiInputCore` (the keyboard and pad as one stream of actions) and `FocusManager` (who has focus and where an arrow goes) - all pure; `FocusRing` and `UiSystem` are the Pixi / browser side |
| `src/UiTheme.ts` | A skin plus the art it names - what widgets are given |
| `assets/ui/` | The `ui` asset bundle: `sprites/ui/*.png` (one atlas, untrimmed), `fonts/*.fnt`, `data/skin.json`, `data/frames.json` |
| `art/` | The Aseprite template and how to use it (see "Art") |
| `design/` | The mockups the art was first rebuilt from |
| `tools/` | Dev tools, run by plain node (see "Art") |

## Using it in a game

Add `{ "dir": "../logic-incubator/packages/ui/assets" }` to the game's `assets.config.json` roots, a `@logic-incubator/ui/*` path to its `tsconfig.json` (and an alias to
`vitest.config.mts`), load the `ui` bundle, then:

```ts
const assets = GameUiAssets(game.assets, "ui");
// The host ({ view }) is only needed by UiTextInput.
const theme = new UiTheme(LoadSkin(game.assets), assets, { view: game.view });
const layer = new Container();
// Sizes are in UI pixels; the layer is drawn at the skin's whole-number scale.
layer.scale.set(theme.Scale);
const button = new UiButton(theme, "primary", "NEW GAME", { width: 150 });
button.on("activate", () => { /* ... */ });
layer.addChild(button);
```

Widgets are built by skin variant (`new UiSlider(theme, "default", 110, { min: 0, max: 100, step: 5 })`) and emit Pixi events: `activate` for a press, `change` for a value,
`select`, `advance`, `close`, `submit`. The game's `UiGallery` scene (dev builds, `#ui` on the page address; Q and E change page) shows every widget and is the best
reference for how each is used.

## Focus and input

`UiSystem` (one per screen: make it in `OnInitialise`, `Destroy` it with `Own`, `SetActive(true/false)` from `OnShow`/`OnHide`) feeds the keyboard (arrows and WASD move,
Enter and Space accept, Escape and Backspace cancel, Q/E and Page Up/Down step through tabs), the first gamepad (d-pad, left stick, A, B, shoulder buttons) and the pointer
into a `FocusManager`. Held directions repeat (350 ms, then every 120 ms).

- `ui.Register(control, { id, scope, neighbours, scroll })` makes a control focusable. Hovering focuses it, the arrows move to the nearest enabled one in that direction
  (`ui.focus.ConfigureScope({ wrap: true })` wraps round), accept presses it, and a focus ring is drawn round it while the keyboard or pad is the one in use - the pointer
  moving hides it. A slider takes left and right itself. With `scroll`, moving focus onto a control scrolled out of view scrolls it in.
- `ui.PushScope(id, { onCancel })` / `PopScope(id)` put a modal in charge of focus and Escape; items registered with that `scope` are the only ones reachable.
- `ui.Track(widget)` calls `widget.Update(ms)` every frame (dialogue typing, toasts, a text field's caret). `ui.RegisterScroll(view)` lets the wheel scroll a
  `UiScrollView`. `ui.BindTabs(tabs)` makes Q/E step through a `UiTabs`.
- A `UiTextInput` is the kit's drawing over the page's own `<input>` (transparent, placed over the field while it is being edited), so typing, IME, undo and the clipboard
  are the browser's; keys typed in it are kept from `game.keyboard`.
- Pixi 5.2.1 doesn't announce a destroyed object, so `UiControl` and `UiScrollView` emit `destroyed` themselves - destroying a widget (or a panel, window or grid that
  holds it) lets go of its focus registration.

`ValidateLoadedSkin(skin, assets)` lists what's wrong with a skin (a missing frame, an inset that leaves nothing of its frame).

## Art

The art is meant to be drawn by hand: the pieces extracted from the mockups are a starting point (some are rough), and a hand-drawn `ui.aseprite` is the real source. One
pixel is one UI pixel (the UI is drawn at 2x).

Open `art/ui-template.png` in Aseprite, run `art/ui-template.lua` (it adds a named slice, with a nine-patch centre where the frame stretches, for each piece and saves
`ui.aseprite`), draw inside the slices, then slice it back. `art/README.md` has the detail. The Lua script and the command-line export follow Aseprite's documented
scripting and CLI but have not been run against a real Aseprite; the slicer is tested against Aseprite's export format.

| Command (from the repo root) | What it does |
|---|---|
| `node packages/ui/tools/make-template.mjs` | Lays every frame of the atlas out on one Aseprite sheet: `art/ui-template.png`, `.lua` and a numbered guide |
| `node packages/ui/tools/slice-sheet.mjs --aseprite=<Aseprite.exe> packages/ui/art/ui.aseprite` | Slices the edited sprite back into `assets/ui/sprites/ui/*.png` and `data/frames.json` |

The tools that produced the first art:

| Command | What it does |
|---|---|
| `node packages/ui/tools/extract-components.mjs --review` | Contact sheets of the raw art with a pixel grid, to choose slice insets |
| `node packages/ui/tools/extract-components.mjs` | Writes `assets/ui/sprites/ui/*.png` from `tools/mockup-regions.json` (`--only=a,b` for just those) |
| `node packages/ui/tools/seed-art.mjs` | Adds the frames the mockups don't show (hover / pressed / disabled looks, thumbs, arrows...) where there is no sprite yet |
| `node packages/ui/tools/ui-scale-preview.mjs` | The 2x / 3x / 4x comparison previews (`tools/out/`) |
| `node packages/ui/tools/convert-bmfont.mjs <font.fnt>` | A BMFont text export to the XML `.fnt` Pixi 5.2.1 reads, plus a white page (`assets/ui/fonts`) |

`extract-components` crops each region, floods the page background away, keeps the piece, shrinks it with nearest-neighbour sampling, maps everything onto one shared palette
and reduces frames to small nine-slice sources (corners, a strip per edge, a flat middle) and dividers to caps / repeating middle / ornament. Decoding the webp needs
headless Microsoft Edge (`EDGE_PATH` to point elsewhere). Re-running it overwrites the PNGs, so once you are drawing in Aseprite, stop using it for those pieces (take them
out of `mockup-regions.json`).

## Fonts

The skin's fonts are the game's `wonky_small` / `wonky_medium` / `wonky_huge` (20, 60 and 120 px). A font is drawn at the skin's `size` in UI pixels - 10, 30 and 60, which is
1:1 on a 1280x720 canvas at the 2x UI scale - so a font made for the full-size canvas needs no other change. Button labels are given at run time; none of the mockups'
baked-in text is used (frames are built from corners and edge strips only, and a frame's flat middle is sampled away from any label - see `centreFrom` in
`mockup-regions.json`).
