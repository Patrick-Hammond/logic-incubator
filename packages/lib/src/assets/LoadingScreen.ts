import { Graphics, Text } from "pixi.js";
import GameComponent from "../game/GameComponent";
import { AssetLoadError } from "./AssetErrors";
import { BundleProgress } from "./Assets";

export interface LoadingScreenOptions {
    width: number;
    height: number;
    /** Called when the player clicks the error screen's "Retry". Without it, a failure is just shown. */
    onRetry?: () => void;
}

/**
 * A plain loading scene: a progress bar for everything loading (it listens to every bundle's
 * `bundle:progress`, so a level's bundle and what it depends on add up), and the failure - with a
 * Retry, if the game says what that does - when a bundle can't load. Add it to the SceneManager
 * and show it before the first `LoadBundle`; a game that wants its own look builds its own scene
 * from the same events.
 */
export default class LoadingScreen extends GameComponent {
    private bar: Graphics;
    private message: Text;
    private loaded = new Map<string, BundleProgress>();

    constructor(private options: LoadingScreenOptions) {
        super();
    }

    protected OnInitialise(): void {
        this.bar = new Graphics();
        this.message = new Text("Loading", { fill: 0xcccccc, fontSize: 20, fontFamily: "Arial" });
        this.message.anchor.set(0.5);
        this.message.position.set(this.options.width / 2, this.options.height / 2 - 30);
        this.root.addChild(this.bar, this.message);

        this.Listen(this.game.assets, "bundle:start", this.OnStart);
        this.Listen(this.game.assets, "bundle:progress", this.OnProgress);
        this.Listen(this.game.assets, "bundle:error", this.OnError);
        this.Draw(0);
    }

    protected OnShow(): void {
        this.loaded.clear();
        this.Reset();
    }

    /** A load is starting - the first, or the retry after a failure: back to showing progress. */
    private OnStart(): void {
        this.Reset();
    }

    private Reset(): void {
        this.message.text = "Loading";
        this.message.interactive = false;
        this.message.buttonMode = false;
        this.message.removeAllListeners("pointerdown");
        this.Draw(0);
    }

    private OnProgress(progress: BundleProgress): void {
        this.loaded.set(progress.bundle, progress);
        let loaded = 0;
        let total = 0;
        this.loaded.forEach(p => {
            loaded += p.loaded;
            total += p.total;
        });
        this.Draw(total ? loaded / total : 0);
    }

    private OnError(bundle: string, error: Error): void {
        const count = error instanceof AssetLoadError ? error.failures.length : 1;
        this.message.text = `Couldn't load "${bundle}" (${count} file${count === 1 ? "" : "s"})` + (this.options.onRetry ? " - click to retry" : "");
        if (this.options.onRetry) {
            this.message.interactive = true;
            this.message.buttonMode = true;
            this.message.once("pointerdown", () => this.options.onRetry());
        }
    }

    private Draw(fraction: number): void {
        const width = Math.min(480, this.options.width * 0.6);
        const x = (this.options.width - width) / 2;
        const y = this.options.height / 2;
        this.bar.clear();
        this.bar.beginFill(0x333333).drawRect(x, y, width, 8).endFill();
        this.bar.beginFill(0xcccccc).drawRect(x, y, width * Math.max(0, Math.min(1, fraction)), 8).endFill();
    }
}
