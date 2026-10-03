import type {Container} from "pixi.js";
import GameComponent from "./GameComponent";

/**
 * The game's scenes, one on the stage at a time. A scene is initialised when it's added, shown and
 * hidden as `ShowScene` moves between them, and destroyed when it's removed - see `GameComponent`.
 */
export default class SceneManager {
    private scenes = new Map<string, GameComponent>();
    private current: string | undefined;

    constructor(private stage: Container) {}

    /** The id of the scene on the stage, if any. */
    get CurrentScene(): string | undefined {
        return this.current;
    }

    HasScene(id: string): boolean {
        return this.scenes.has(id);
    }

    GetScene(id: string): GameComponent {
        const scene = this.scenes.get(id);
        if (!scene) {
            throw new Error(`No scene "${id}" - add it with AddScene first.`);
        }
        return scene;
    }

    /** Registers `scene` under `id` and initialises it; it isn't shown until `ShowScene`. */
    AddScene(id: string, scene: GameComponent): void {
        if (this.scenes.has(id)) {
            throw new Error(`Scene "${id}" has already been added.`);
        }
        // Registered first, so the scene's own setup can find it (and its children's) by id.
        this.scenes.set(id, scene);
        scene.root.name = id;
        scene.root.interactive = scene.root.interactiveChildren = false;
        try {
            scene.Initialise();
        } catch (error) {
            this.scenes.delete(id);
            throw error;
        }
    }

    /** Puts `id` on the stage in place of the current scene. Showing the scene that's already showing does nothing. */
    ShowScene(id: string): void {
        const next = this.GetScene(id);
        if (this.current === id) {
            return;
        }
        const previous = this.current !== undefined ? this.scenes.get(this.current) : undefined;
        // Before anything runs, so a ShowScene made from inside a hook sees where things stand.
        this.current = id;

        if (previous) {
            previous.Hide();
            this.stage.removeChild(previous.root);
            previous.root.interactive = previous.root.interactiveChildren = false;
        }
        this.stage.addChild(next.root);
        next.root.interactive = next.root.interactiveChildren = true;
        next.Show();
    }

    /** Hides (if showing), destroys and forgets the scene. */
    RemoveScene(id: string): void {
        const scene = this.GetScene(id);
        if (this.current === id) {
            this.current = undefined;
        }
        this.scenes.delete(id);
        scene.Destroy();
    }

    /** Removes every scene. */
    Destroy(): void {
        Array.from(this.scenes.keys()).forEach(id => this.RemoveScene(id));
    }
}
