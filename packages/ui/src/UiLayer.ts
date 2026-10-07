import type Game from "@logic-incubator/lib/game/Game";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import UiSystem from "./input/UiSystem";
import UiTheme, { GameUiAssets, LoadSkin, ValidateLoadedSkin } from "./UiTheme";

const themes = new WeakMap<Game, UiTheme>();

/**
 * The theme for the game's loaded UI bundle (`ui` unless said otherwise): its skin, checked against its art, and the canvas as the host text fields sit over. Made the first time it
 * is asked for and kept for the life of the game, since every screen's UI is dressed the same.
 */
export function ThemeFor(game: Game, bundle = "ui"): UiTheme {
    const known = themes.get(game);
    if (known) {
        return known;
    }
    const assets = GameUiAssets(game.assets, bundle);
    const skin = LoadSkin(game.assets, bundle);
    const problems = ValidateLoadedSkin(skin, assets);
    if (problems.length) {
        console.error("The UI skin has problems:\n" + problems.join("\n"));
    }
    const theme = new UiTheme(skin, assets, { view: game.view });
    themes.set(game, theme);
    return theme;
}

export type UiLayerOptions = {
    /** The asset bundle the skin is in; `ui` by default. */
    bundle?: string;
    /** Whether moving off the last control goes round to the first (menus); on by default. */
    wrap?: boolean;
    /** Whether the layer takes keys, pad and pointer focus (`Ui`); off for a layer that only shows things, like a HUD. On by default. */
    input?: boolean;
};

/**
 * A layer of UI over a scene (or another component): `Attach` one and put widgets in its `root`, which is scaled to the skin's whole-number scale so everything in it is laid out in
 * UI pixels. It owns the screen's `UiSystem` - keyboard, gamepad and pointer focus - which listens only while the layer is shown (a scene's UI shouldn't answer keys while another
 * scene is up), and is destroyed with it. Widgets are made from `Theme` and registered with `Ui`.
 */
export default class UiLayer extends GameComponent {
    private theme: UiTheme;
    private system: UiSystem | undefined;

    constructor(private readonly options: UiLayerOptions = {}) {
        super();
    }

    /** The skin and art widgets are made from. Available once the layer has been initialised (attaching it to an initialised component does that). */
    get Theme(): UiTheme {
        return this.theme;
    }

    /** Focus and input: `Ui.Register(control)`, `Ui.PushScope(...)`, `Ui.Track(widget)`. A layer made with `input: false` has none. */
    get Ui(): UiSystem {
        if (!this.system) {
            throw new Error("This UI layer was made with input: false, so it has no focus or input system.");
        }
        return this.system;
    }

    protected OnInitialise(): void {
        this.theme = ThemeFor(this.game, this.options.bundle);
        this.root.scale.set(this.theme.Scale);
        if (this.options.input === false) {
            // Only for looking at: nothing in it takes the pointer either.
            this.root.interactiveChildren = false;
            return;
        }
        const system = (this.system = new UiSystem(this.game, this.theme, this.root));
        system.SetActive(false);
        system.focus.ConfigureScope({ wrap: this.options.wrap !== false });
        this.Own(() => system.Destroy());
    }

    protected OnShow(): void {
        if (this.system) this.system.SetActive(true);
    }

    protected OnHide(): void {
        if (this.system) this.system.SetActive(false);
    }
}
