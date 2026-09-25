import {Container, SCALE_MODES, Sprite} from "pixi.js";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import { AnimationSpeed, Scenes } from "../../Constants";
import EditorComponent from "../EditorComponent";
import { EditorActions, IEditorState } from "../stores/EditorStore";
import { ButtonEl, El, InjectStyles } from "../ui/dom/Dom";
import EditorOverlay from "../ui/dom/EditorOverlay";
import SpriteCanvas, { DATA_ICON_FIT, DATA_SWATCH_SIZE, FitIcon, VisibleBounds } from "../ui/dom/SpriteCanvas";

/** A tab of tile brushes. There's only the one sprite sheet for now; another sheet becomes another entry. */
type TileSet = { name: string; brushes: string[] };

/** A tab and its own scrolling page (so each keeps its scroll position). */
type Page = { tab: HTMLButtonElement; body: HTMLElement; animated: SpriteCanvas[] };

/** What the selected layer can be painted with. */
type Mode = "tiles" | "data" | "read-only";

/** Tile thumbnails are drawn at 2x, as the Pixi palette did. */
const TILE_SCALE = 2;
/** Data brush chips show their 16px swatch at 4x, where the icons' quarter-pixel scales (DATA_ICON_FIT) land on whole pixels. */
const SWATCH_SCALE = 4;

/**
 * The brush picker: tile-set tabs over a scrolling grid of tile brushes, or
 * the data brushes when a data layer is selected. Hovering a brush previews
 * it in `SelectedBrush`; clicking picks it.
 */
export default class Palette extends EditorComponent {
    private tabs: HTMLElement;
    private tileSetPages: Page[] = [];
    private dataPage: Page;
    private readOnlyPage: Page;
    private activeTileSet = 0;
    private mode: Mode = null;
    private items: { [name: string]: HTMLElement } = {};
    private selectedItem: HTMLElement = null;
    private animTime = 0;
    private animFrame = 0;

    constructor() {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {
        InjectStyles("pl-styles", STYLES);
        this.RegisterDataBrushTextures();

        const panel = El("div", "ed-panel pl-panel");
        this.tabs = panel.appendChild(El("div", "pl-tabs"));
        this.tabs.setAttribute("role", "tablist");
        EditorOverlay.inst.Slot("brushes").appendChild(panel);

        // Data brushes are registered as sprites too (above), but aren't tiles.
        const dataBrushNames = this.editorStore.state.dataBrushes.map(db => db.name);
        const tileSets: TileSet[] = [
            {
                name: "Dungeon",
                brushes: this.assetFactory.SpriteNames.concat(this.assetFactory.AnimationNames).filter(name => dataBrushNames.indexOf(name) === -1)
            }
        ];
        tileSets.forEach((tileSet, index) => {
            const page = this.AddPage(panel, tileSet.name, tileSet.brushes.length);
            page.tab.addEventListener("click", () => {
                this.activeTileSet = index;
                this.ShowPages();
            });
            const grid = page.body.appendChild(El("div", "pl-grid"));
            tileSet.brushes.forEach(name => grid.appendChild(this.CreateTileItem(page, name)));
            this.tileSetPages.push(page);
        });

        const dataBrushes = this.editorStore.state.dataBrushes;
        this.dataPage = this.AddPage(panel, "Data", dataBrushes.length);
        const chips = this.dataPage.body.appendChild(El("div", "pl-chips"));
        dataBrushes.forEach(dataBrush => {
            const chip = ButtonEl("pl-chip", undefined, dataBrush.name);
            const swatch = new SpriteCanvas();
            swatch.ShowSwatch(dataBrush.colour, dataBrush.icon ? this.assetFactory.CreateTexture(dataBrush.icon) : null, SWATCH_SCALE);
            chip.append(swatch.canvas, El("span", "pl-chip-label", dataBrush.name));
            chips.appendChild(this.AddBrushEvents(chip, dataBrush.name));
        });

        this.readOnlyPage = this.AddPage(panel, "Read-only");
        this.readOnlyPage.body.appendChild(
            El("p", "pl-empty", "Nothing to paint here: this layer shows what the game works out from the tiles themselves. Select another layer to paint.")
        );

        this.editorStore.Subscribe(this.Render, this);
        this.game.ticker.add(this.Animate, this);
        this.UpdateMode();
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        this.UpdateMode();
        if (prevState.currentBrush.name !== state.currentBrush.name) {
            this.Highlight(state.currentBrush.name);
        }
    }

    private UpdateMode(): void {
        const layer = this.editorStore.SelectedLayer;
        if (!layer) {
            return;
        }
        const mode: Mode = layer.readOnly ? "read-only" : layer.isData ? "data" : "tiles";
        if (mode !== this.mode) {
            this.mode = mode;
            this.ShowPages();
        }
    }

    /** Shows the tabs that apply to the selected layer, and the active one's page. */
    private ShowPages(): void {
        const active = this.ActivePage();
        const inMode = this.mode === "tiles" ? this.tileSetPages : this.mode === "data" ? [this.dataPage] : [this.readOnlyPage];
        this.tileSetPages.concat(this.dataPage, this.readOnlyPage).forEach(page => {
            page.tab.style.display = inMode.indexOf(page) > -1 ? "" : "none";
            page.tab.setAttribute("aria-selected", String(page === active));
            page.body.style.display = page === active ? "" : "none";
        });
    }

    private ActivePage(): Page | null {
        switch (this.mode) {
            case "tiles":
                return this.tileSetPages[this.activeTileSet];
            case "data":
                return this.dataPage;
            case "read-only":
                return this.readOnlyPage;
            default:
                return null;
        }
    }

    private AddPage(panel: HTMLElement, name: string, count?: number): Page {
        const tab = ButtonEl("pl-tab", name);
        tab.setAttribute("role", "tab");
        if (count != null) {
            tab.appendChild(El("span", "pl-count", String(count)));
        }
        this.tabs.appendChild(tab);

        const body = panel.appendChild(El("div", "pl-page ed-scroll"));
        body.style.display = "none";
        // Leaving the list goes back to previewing the brush actually picked.
        body.addEventListener("pointerleave", () => {
            this.editorStore.Dispatch({ type: EditorActions.BRUSH_HOVERED, data: { name: this.editorStore.state.currentBrush.name } });
        });
        return { tab, body, animated: [] };
    }

    private CreateTileItem(page: Page, name: string): HTMLElement {
        const frames = this.assetFactory.CreateTextures(name);
        // The map (Canvas, Brush) draws these same textures, and nothing else asks for nearest-neighbour
        // on the sprite sheet (the Game isn't made with `pixelArt`) - without this, the map goes blurry.
        frames[0].baseTexture.scaleMode = SCALE_MODES.NEAREST;

        const thumb = new SpriteCanvas();
        thumb.Show(frames, TILE_SCALE);
        if (thumb.Animated) {
            page.animated.push(thumb);
        }
        const item = ButtonEl("pl-tile", undefined, name);
        item.appendChild(thumb.canvas);
        return this.AddBrushEvents(item, name);
    }

    private AddBrushEvents(item: HTMLElement, name: string): HTMLElement {
        item.addEventListener("pointerenter", () => {
            this.editorStore.Dispatch({ type: EditorActions.BRUSH_HOVERED, data: { name } });
        });
        item.addEventListener("click", () => {
            if (name !== this.editorStore.state.currentBrush.name) {
                this.editorStore.Dispatch({ type: EditorActions.BRUSH_CHANGED, data: { name } });
            }
        });
        this.items[name] = item;
        return item;
    }

    private Highlight(name: string): void {
        if (this.selectedItem) {
            this.selectedItem.setAttribute("aria-pressed", "false");
        }
        this.selectedItem = this.items[name] || null;
        if (this.selectedItem) {
            this.selectedItem.setAttribute("aria-pressed", "true");
        }
    }

    /** Steps the showing page's animated thumbnails at the same rate `AnimatedSprite` plays on the map. */
    private Animate(delta: number): void {
        const page = this.ActivePage();
        if (!page || !page.animated.length || !EditorOverlay.inst.Visible) {
            return;
        }
        this.animTime += delta * AnimationSpeed;
        const frame = Math.floor(this.animTime);
        if (frame !== this.animFrame) {
            this.animFrame = frame;
            page.animated.forEach(thumb => thumb.SetFrame(frame));
        }
    }

    /**
     * Paintable textures for the data brushes, registered with the AssetFactory under each brush's name
     * so the map (`Canvas`) and cursor (`Brush`) draw them like any tile: the brush's colour at half
     * opacity with its icon on top - the same picture `DrawDataBrushSwatch` draws in the DOM. Rendered
     * at 4x, so icons shrunk to quarter-pixel scales (DATA_ICON_FIT) stay crisp when zoomed in.
     */
    private RegisterDataBrushTextures(): void {
        const swatch = new Container();
        const square = Sprite.from("data-square");
        square.alpha = 0.5;
        swatch.addChild(square);

        this.editorStore.state.dataBrushes.forEach(dataBrush => {
            square.tint = dataBrush.colour;
            let icon: Sprite = null;
            if (dataBrush.icon) {
                icon = new Sprite(this.assetFactory.CreateTexture(dataBrush.icon));
                const fit = FitIcon(VisibleBounds(icon.texture), DATA_SWATCH_SIZE, DATA_ICON_FIT);
                icon.scale.set(fit.scale);
                icon.position.set(fit.x, fit.y);
                swatch.addChild(icon);
            }
            const texture = this.game.renderer.generateTexture(swatch, SCALE_MODES.NEAREST, 4);
            AssetFactory.inst.Add(dataBrush.name, [dataBrush.name], [texture]);
            if (icon) {
                swatch.removeChild(icon);
                icon.destroy();
            }
        });
    }
}

const STYLES = `
.pl-tabs {
    display: flex; align-items: flex-end; gap: 2px; flex: 0 0 auto;
    padding: 4px 8px 0; border-bottom: 1px solid var(--ed-divider);
    overflow-x: auto; scrollbar-width: none;
}
.pl-tabs::-webkit-scrollbar { display: none; }
.pl-tab {
    display: flex; align-items: baseline; gap: 6px; margin-bottom: -1px; padding: 5px 10px 6px;
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--ed-muted); font: inherit; font-size: 12px; font-weight: bold; white-space: nowrap; cursor: pointer;
}
.pl-tab:hover { color: var(--ed-text); }
.pl-tab[aria-selected=true] { color: var(--ed-text-strong); border-bottom-color: var(--ed-accent); }
.pl-count { font-size: 11px; font-weight: normal; color: var(--ed-faint); }
.pl-page { flex: 1 1 auto; min-height: 0; padding: 6px; box-sizing: border-box; }
.pl-grid { display: flex; flex-wrap: wrap; align-items: flex-end; align-content: flex-start; gap: 3px; }
.pl-tile {
    display: flex; align-items: flex-end; justify-content: center; box-sizing: border-box;
    min-width: 38px; min-height: 38px; padding: 2px;
    background: var(--ed-well); border: 1px solid transparent; border-radius: 3px; cursor: pointer;
}
.pl-chips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.pl-chip {
    display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; padding: 6px 2px 5px;
    background: var(--ed-well); color: var(--ed-chip-text); border: 1px solid var(--ed-divider); border-radius: 5px;
    font: inherit; font-size: 11px; cursor: pointer;
}
.pl-tile:hover, .pl-chip:hover { border-color: var(--ed-hover-border); }
.pl-tile[aria-pressed=true], .pl-chip[aria-pressed=true] { background: var(--ed-accent-bg); border-color: var(--ed-accent); color: var(--ed-text-strong); }
.pl-tile canvas, .pl-chip canvas { display: block; image-rendering: pixelated; }
.pl-chip-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-empty { margin: 0; padding: 18px 14px; color: var(--ed-faint); font-size: 12px; text-align: center; }
`;
