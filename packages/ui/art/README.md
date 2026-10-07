# UI art in Aseprite

The UI atlas as one Aseprite sprite: every frame is a *slice* named as the skin names it (`btn_primary_normal`...), on an 8-pixel grid. Draw in the slices, slice the sprite back
into the game's atlas with one command. One pixel here is one screen pixel (the UI is drawn at 1x on the 1280x720 canvas).

1. **Start** (once). Open `ui-template.png` in Aseprite, then run `ui-template.lua` (File > Scripts > Open Scripts Folder, put the script there, Rescan, run it). It adds the
   slices (with nine-patch centres) and saves `ui.aseprite` beside the template. `ui-template-guide.png` is a map: each piece numbered, with a legend of names, sizes and nine-patch insets.
2. **Draw.** Work inside the slices. A slice with a nine-patch centre (Slice properties > "Is 9-slice") stretches: the corners stay as drawn and the edges and the middle stretch to fit,
   so draw each frame at full size (a whole button, a whole panel). They are stored full size for now and can be cut down to a corner, a strip of edge and a flat middle later. Move the
   centre to change how much is corner; resize a slice if the piece needs more room (leave a gap to its neighbours). The game draws the pieces at whatever size a widget needs.
3. **Slice.** `node packages/ui/tools/slice-sheet.mjs --aseprite="C:/path/to/Aseprite.exe" packages/ui/art/ui.aseprite` exports the slices with Aseprite's command line and writes
   `assets/ui/sprites/ui/<name>.png` and `assets/ui/data/frames.json` (each frame's size and nine-patch insets). Frames you delete from the sprite are removed from the atlas.
   (Or export from Aseprite yourself - File > Export Sprite Sheet, "JSON Data" and "Meta: Slices" ticked - and give the tool the PNG and JSON: `slice-sheet.mjs sheet.png sheet.json`.)
4. **See it.** The dev server picks the new frames up; the gallery (`#ui` on the page address) shows them all.

New frames: add a slice named in lowercase letters, digits and underscores (never ending in `_f` and a number); the skin (`assets/ui/data/skin.json`) says which widget uses it.
