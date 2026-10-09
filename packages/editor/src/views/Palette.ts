import {Container, SCALE_MODES} from "pixi.js";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import { AnimationSpeed } from "@logic-incubator/engine/Constants";
import AssetMetadataStore, { AssetCategory } from "@logic-incubator/engine/level/AssetMetadata";
import { TileLayerKind } from "@logic-incubator/engine/level/LevelFormat";
import EditorComponent from "../EditorComponent";
import { EditorIcon } from "../EditorAssets";
import { DataBrushIcon, DataBrushIcons, EditorActions, IEditorState } from "../stores/EditorStore";
import { ButtonEl, El, InjectStyles } from "../ui/dom/Dom";
import EditorOverlay from "../ui/dom/EditorOverlay";
import SpriteCanvas from "../ui/dom/SpriteCanvas";
import { EmptyTabHint, GroupByCategory, ShowsCategory } from "./PaletteCategories";

/** A tab and its own scrolling page (so each keeps its scroll position). `category`: a tile set's, not the data page's. */
type Page = { tab: HTMLButtonElement; body: HTMLElement; animated: SpriteCanvas[]; category?: AssetCategory };

/** What the selected layer can be painted with. */
type Mode = "tiles" | "data";

/** Tile thumbnails are drawn at 2x, as the Pixi palette did. */
const TILE_SCALE = 2;
/** Data brush chips show their 16px swatch at 4x, where the icons' quarter-pixel scales (DATA_ICON_FIT) land on whole pixels. */
const SWATCH_SCALE = 4;

/**
 * The brush picker: a tab per category (Floor, Walls, Dungeon, Entities, Weapons, Items, Misc, User) over a
 * scrolling grid of that category's tile brushes, or the data brushes when a data layer is selected. Only
 * the tabs the selected layer takes are shown: just Floor on a floor layer, just Walls on a walls layer, and
 * all but those two on any other tile layer (see `ShowsCategory`). A sprite's category is set in the game's
 * assets-meta.json (see `AssetCategories`); one with none is under Misc.
 * Hovering a brush previews it in `SelectedBrush`; clicking picks it.
 */
export default class Palette extends EditorComponent {
    private tabs: HTMLElement;
    private tileSetPages: Page[] = [];
    private dataPage: Page;
    private activeTileSet = 0;
    private mode: Mode = null;
    /** The selected tile layer's kind, which picks the tile tabs shown (see `ShowsCategory`). */
    private kind: TileLayerKind | undefined;
    private items: { [name: string]: HTMLElement } = {};
    private selectedItem: HTMLElement = null;
    private animTime = 0;
    private animFrame = 0;
    /** Which tile-set tab each brush is on, so picking a brush from elsewhere (the picker, a keyboard shortcut) shows its tab. */
    private tabOf: { [name: string]: number } = {};

    /** `icons`: the game's sprite over each data brush's colour, shown only in its palette chip (see `DataBrushIcons`, `RegisterDataBrushTextures`) - telling brushes apart matters there, not on the map. */
    constructor(private readonly icons: DataBrushIcons = {}) {
        super();
    }

    protected OnInitialise(): void {
        InjectStyles("pl-styles", STYLES);
        this.RegisterDataBrushTextures();

        const panel = El("div", "ed-panel pl-panel");
        this.tabs = panel.appendChild(El("div", "pl-tabs"));
        this.tabs.setAttribute("role", "tablist");
        EditorOverlay.inst.Slot("brushes").appendChild(panel);
        this.Own(() => panel.remove());

        // Data brushes are registered as sprites too (above), but aren't tiles. Which tab a sprite is under comes
        // from its metadata, so the game's metadata has to be loaded before the editor is created.
        const dataBrushNames = this.editorStore.state.dataBrushes.map(db => db.name);
        const tileSets = GroupByCategory(
            this.assetFactory.SpriteNames.concat(this.assetFactory.AnimationNames).filter(name => dataBrushNames.indexOf(name) === -1),
            name => AssetMetadataStore.inst.CategoryOf(name)
        );
        tileSets.forEach((tileSet, index) => {
            const page = this.AddPage(panel, tileSet.name, tileSet.brushes.length);
            page.category = tileSet.id;
            page.tab.addEventListener("click", () => {
                this.activeTileSet = index;
                this.ShowPages();
            });
            if (!tileSet.brushes.length) {
                page.body.appendChild(El("div", "pl-empty", EmptyTabHint(tileSet.id, true)));
            }
            const grid = page.body.appendChild(El("div", "pl-grid"));
            tileSet.brushes.forEach(name => {
                grid.appendChild(this.CreateTileItem(page, name));
                this.tabOf[name] = index;
            });
            const button = ButtonEl("pl-tile pl-add", "+", `New tile in ${tileSet.name}`);
            button.addEventListener("click", () => this.OpenSpriteEditor({ kind: "new", category: tileSet.id }));
            grid.appendChild(button);
            this.tileSetPages.push(page);
        });

        const dataBrushes = this.editorStore.state.dataBrushes;
        this.dataPage = this.AddPage(panel, "Data", dataBrushes.length);
        const chips = this.dataPage.body.appendChild(El("div", "pl-chips"));
        dataBrushes.forEach(dataBrush => {
            const chip = ButtonEl("pl-chip", undefined, dataBrush.name);
            const swatch = new SpriteCanvas();
            const iconName = DataBrushIcon(this.icons, dataBrush.name);
            swatch.ShowSwatch(dataBrush.colour, iconName ? this.assetFactory.CreateTexture(iconName) : null, SWATCH_SCALE);
            chip.append(swatch.canvas, El("span", "pl-chip-label", dataBrush.name));
            chips.appendChild(this.AddBrushEvents(chip, dataBrush.name));
        });

        this.Own(this.editorStore.Subscribe(this.Render, this));
        this.Tick(this.Animate);
        this.UpdateMode();
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        this.UpdateMode();
        if (prevState.currentBrush.name !== state.currentBrush.name) {
            this.Highlight(state.currentBrush.name);
            this.ShowTabOf(state.currentBrush.name);
        }
    }

    /** Switches to the tab a picked brush is on, if it isn't showing - and the selected layer has that tab. */
    private ShowTabOf(name: string): void {
        const tab = this.tabOf[name];
        if (this.mode === "tiles" && tab !== undefined && tab !== this.activeTileSet && this.IsTabShown(this.tileSetPages[tab])) {
            this.activeTileSet = tab;
            this.ShowPages();
        }
    }

    private UpdateMode(): void {
        const layer = this.editorStore.SelectedLayer;
        if (!layer) {
            return;
        }
        const mode: Mode = layer.isData ? "data" : "tiles";
        const kind = layer.isData ? undefined : layer.kind;
        if (mode !== this.mode || kind !== this.kind) {
            this.mode = mode;
            this.kind = kind;
            if (!this.IsTabShown(this.tileSetPages[this.activeTileSet])) {
                this.activeTileSet = this.tileSetPages.findIndex(page => this.IsTabShown(page));
            }
            this.ShowPages();
        }
    }

    /** Whether a tile set's tab is on offer for the selected tile layer. */
    private IsTabShown(page: Page | undefined): boolean {
        return page != null && ShowsCategory(this.kind, page.category);
    }

    /** Shows the tabs that apply to the selected layer, and the active one's page. */
    private ShowPages(): void {
        const active = this.ActivePage();
        const inMode = this.mode === "tiles" ? this.tileSetPages.filter(page => this.IsTabShown(page)) : [this.dataPage];
        this.tileSetPages.concat(this.dataPage).forEach(page => {
            page.tab.style.display = inMode.indexOf(page) > -1 ? "" : "none";
            page.tab.setAttribute("aria-selected", String(page === active));
            page.body.style.display = page === active ? "" : "none";
        });
    }

    private ActivePage(): Page | null {
        switch (this.mode) {
            case "tiles":
                return this.tileSetPages[this.activeTileSet] || null;
            case "data":
                return this.dataPage;
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
        if (!page || !page.animated.length) {
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
     * so the map (`Canvas`) and cursor (`Brush`) draw them like any tile: just the brush's colour at half
     * opacity, deliberately without its icon - a collision marker shaped like `wall_mid` on the map reads
     * as an actual wall tile, not a data overlay. The icon still appears in the palette chip (see the
     * `dataBrushes.forEach` in `Create`, which draws it separately), where there's no such confusion -
     * it's the one place telling brushes apart at a glance actually matters. Rendered at 4x so a texture
     * this small stays crisp when zoomed in.
     */
    private RegisterDataBrushTextures(): void {
        const swatch = new Container();
        const square = this.game.assets.Sprite(EditorIcon("square"));
        square.alpha = 0.5;
        swatch.addChild(square);

        this.editorStore.state.dataBrushes.forEach(dataBrush => {
            square.tint = dataBrush.colour;
            const texture = this.game.renderer.generateTexture(swatch, SCALE_MODES.NEAREST, 4);
            AssetFactory.inst.Add(dataBrush.name, [dataBrush.name], [texture]);
        });
    }
}

const STYLES = `
/* Six category tabs (a tile layer without a kind) don't fit the sidebar's width in one row, so they wrap onto a second. */
.pl-tabs {
    display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0 2px; flex: 0 0 auto;
    padding: 4px 8px 0; border-bottom: 1px solid var(--ed-divider);
}
.pl-tab {
    display: flex; align-items: baseline; gap: 5px; margin-bottom: -1px; padding: 5px 8px 6px;
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--ed-muted); font: inherit; font-size: 12px; font-weight: bold; white-space: nowrap; cursor: pointer;
}
.pl-tab:hover { color: var(--ed-text); }
.pl-tab[aria-selected=true] { color: var(--ed-text-strong); border-bottom-color: var(--ed-accent); }
.pl-count { font-size: 11px; font-weight: normal; color: var(--ed-faint); }
.pl-page { flex: 1 1 auto; min-height: 0; padding: 6px; box-sizing: border-box; }
.pl-empty { padding: 10px 4px; color: var(--ed-faint); font-size: 12px; line-height: 1.4; }
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
.pl-add { align-items: center; color: var(--ed-link); font: inherit; font-size: 20px; line-height: 1; }
.pl-add:hover { color: var(--ed-text-strong); }
`;
