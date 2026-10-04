import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import { TileSize } from "@logic-incubator/engine/Constants";
import AssetMetadataStore, { AssetCategories } from "@logic-incubator/engine/level/AssetMetadata";
import { EditorBundle } from "./EditorAssets";
import { MakeEditorSave, SaveLevel } from "./SavedLevel";
import { BrowserStorage } from "./sprite/SpriteEditor";
import { AtlasTextureLike } from "./sprite/AtlasFrames";
import { CreateHostedSprites } from "./sprite/HostedSprites";
import { OpenSpriteEditor, RecoverSpriteEditor, SpriteEditorHost, SpriteEditorRequest } from "./sprite/OpenSpriteEditor";
import { Recovery } from "./sprite/Recovery";
import { SharedSpriteApi } from "./sprite/SpriteApi";
import EditorStore from "./stores/EditorStore";
import LevelDataStore from "./stores/LevelDataStore";

/** A piece of the editor: a `GameComponent` with the editor's shared stores to hand. Its setup goes in `OnInitialise`, like any other component's. */
export default abstract class EditorComponent extends GameComponent {
    private static _editorStore: EditorStore;
    private static _levelDataStore: LevelDataStore;

    /** Forgets the shared stores and what they hold: the next editor starts from a blank map and the default settings. Safe to call twice. */
    static DestroyStores(): void {
        EditorComponent._editorStore = undefined;
        EditorComponent._levelDataStore = undefined;
    }

    protected get editorStore(): EditorStore {
        if (!EditorComponent._editorStore) {
            EditorComponent._editorStore = new EditorStore();
        }
        return EditorComponent._editorStore;
    }
    protected get levelDataStore(): LevelDataStore {
        if (!EditorComponent._levelDataStore) {
            EditorComponent._levelDataStore = new LevelDataStore(20);
        }
        return EditorComponent._levelDataStore;
    }

    /**
     * Opens the sprite editor over the level editor (see sprite/SpriteEditor.ts): for an existing sprite, or a new one under a
     * palette tab. When it's closed after a save the page reloads to pick up the new art - so the level being edited is kept
     * first, the way Enter keeps it for play.
     */
    protected OpenSpriteEditor(request: SpriteEditorRequest): Promise<boolean> {
        const scope = this.game.assets.Scope;
        // New sprites go in the bundle every level shares, unless the game has no such thing.
        return OpenSpriteEditor(this.SpriteEditorHost(), request, { tileSize: TileSize, bundle: scope.length ? scope[scope.length - 1] : "global" });
    }

    /** Puts the sprite editor back after the page reloaded under it (the snapshot comes from `TakeRecovery`). */
    protected RecoverSpriteEditor(recovery: Recovery): Promise<boolean> {
        return RecoverSpriteEditor(this.SpriteEditorHost(), recovery);
    }

    /** What the sprite editor needs of this page: the dev server's service if there is one, and otherwise the art the page has loaded. */
    private SpriteEditorHost(): SpriteEditorHost {
        return {
            api: SharedSpriteApi,
            hosted: CreateHostedSprites({
                catalogue: () => this.game.assets.Catalogue(),
                textures: (bundle, name) => {
                    const id = bundle + "." + name;
                    return AssetFactory.inst.Has(id) ? (AssetFactory.inst.CreateTextures(id) as unknown as AtlasTextureLike[]) : null;
                },
                fetchBytes: async url => {
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`Couldn't read ${url} (${response.status}).`);
                    }
                    return new Uint8Array(await response.arrayBuffer());
                },
                exclude: [EditorBundle]
            }),
            metaOf: name => AssetMetadataStore.inst.Get(name),
            manifestUrl: this.game.assets.ManifestUrl,
            categories: AssetCategories,
            persistLevel: () => SaveLevel(MakeEditorSave(this.editorStore.state, this.levelDataStore.state)),
            reload: () => window.location.reload(),
            localStorage: BrowserStorage(() => window.localStorage),
            sessionStorage: BrowserStorage(() => window.sessionStorage)
        };
    }
}
