import { beforeEach, describe, expect, it, vi } from "vitest";
import GameComponent from "./GameComponent";
import SceneManager from "./SceneManager";

vi.mock("pixi.js", () => {
    class Container {
        name = "";
        interactive = false;
        interactiveChildren = true;
        parent: Container | null = null;
        children: Container[] = [];
        destroyed = false;
        addChild(child: Container): Container {
            child.parent?.removeChild(child);
            child.parent = this;
            this.children.push(child);
            return child;
        }
        removeChild(child: Container): void {
            this.children = this.children.filter(c => c !== child);
            child.parent = null;
        }
        destroy(): void {
            this.parent?.removeChild(this);
            this.destroyed = true;
        }
    }
    return { Container };
});
vi.mock("./Game", () => ({ default: { inst: {} } }));
vi.mock("../loading/AssetFactory", () => ({ default: { inst: {} } }));

let log: string[];
let manager: SceneManager;
let stage: { children: { name: string }[]; addChild(c: unknown): unknown; removeChild(c: unknown): void };

class Scene extends GameComponent {
    constructor(private name: string, private onShow?: () => void) {
        super();
    }
    protected OnInitialise(): void {
        log.push(this.name + ".init");
    }
    protected OnShow(): void {
        log.push(this.name + ".show");
        this.onShow?.();
    }
    protected OnHide(): void {
        log.push(this.name + ".hide");
    }
    protected OnDestroy(): void {
        log.push(this.name + ".destroy");
    }
}

const onStage = () => stage.children.map(c => c.name);

beforeEach(async () => {
    log = [];
    const { Container } = await import("pixi.js");
    stage = new Container() as unknown as typeof stage;
    manager = new SceneManager(stage as never);
});

describe("AddScene", () => {
    it("initialises the scene, names its root, and leaves it off the stage and inert", () => {
        const scene = new Scene("a");
        manager.AddScene("a", scene);
        expect(log).toEqual(["a.init"]);
        expect(scene.root.name).toBe("a");
        expect(scene.root.interactive).toBe(false);
        expect(scene.root.interactiveChildren).toBe(false);
        expect(onStage()).toEqual([]);
        expect(manager.HasScene("a")).toBe(true);
        expect(manager.GetScene("a")).toBe(scene);
    });

    it("refuses a second scene under the same id", () => {
        manager.AddScene("a", new Scene("a"));
        expect(() => manager.AddScene("a", new Scene("again"))).toThrow(/already/);
    });

    it("can be found by id from its own initialisation", () => {
        let found: GameComponent | undefined;
        class Finder extends GameComponent {
            protected OnInitialise(): void {
                found = manager.GetScene("finder");
            }
        }
        const scene = new Finder();
        manager.AddScene("finder", scene);
        expect(found).toBe(scene);
    });

    it("forgets a scene whose initialisation throws", () => {
        class Broken extends GameComponent {
            protected OnInitialise(): void {
                throw new Error("boom");
            }
        }
        expect(() => manager.AddScene("broken", new Broken())).toThrow("boom");
        expect(manager.HasScene("broken")).toBe(false);
    });
});

describe("GetScene / ShowScene with an unknown id", () => {
    it("throws instead of returning nothing or blanking the stage", () => {
        manager.AddScene("a", new Scene("a"));
        manager.ShowScene("a");
        expect(() => manager.GetScene("nope")).toThrow(/nope/);
        expect(() => manager.ShowScene("nope")).toThrow(/nope/);
        expect(onStage()).toEqual(["a"]);
    });
});

describe("ShowScene", () => {
    it("puts the scene on the stage, interactive, and shows it", () => {
        const a = new Scene("a");
        manager.AddScene("a", a);
        manager.ShowScene("a");
        expect(onStage()).toEqual(["a"]);
        expect(a.root.interactive).toBe(true);
        expect(a.root.interactiveChildren).toBe(true);
        expect(manager.CurrentScene).toBe("a");
        expect(log).toEqual(["a.init", "a.show"]);
    });

    it("hides and removes the previous scene before showing the next", () => {
        const a = new Scene("a");
        manager.AddScene("a", a);
        manager.AddScene("b", new Scene("b"));
        manager.ShowScene("a");
        log.length = 0;
        manager.ShowScene("b");
        expect(log).toEqual(["a.hide", "b.show"]);
        expect(onStage()).toEqual(["b"]);
        expect(a.root.interactive).toBe(false);
        expect(a.root.interactiveChildren).toBe(false);
        expect(manager.CurrentScene).toBe("b");
    });

    it("does nothing for the scene that's already showing", () => {
        manager.AddScene("a", new Scene("a"));
        manager.ShowScene("a");
        log.length = 0;
        manager.ShowScene("a");
        expect(log).toEqual([]);
        expect(onStage()).toEqual(["a"]);
    });

    it("treats a ShowScene made from inside OnShow for the same scene as already showing", () => {
        manager.AddScene("a", new Scene("a", () => manager.ShowScene("a")));
        manager.ShowScene("a");
        expect(log.filter(entry => entry === "a.show")).toHaveLength(1);
    });

    it("lets a scene be shown again after another has had its turn", () => {
        manager.AddScene("a", new Scene("a"));
        manager.AddScene("b", new Scene("b"));
        manager.ShowScene("a");
        manager.ShowScene("b");
        manager.ShowScene("a");
        expect(log).toEqual(["a.init", "b.init", "a.show", "a.hide", "b.show", "b.hide", "a.show"]);
        expect(onStage()).toEqual(["a"]);
    });
});

describe("RemoveScene", () => {
    it("hides and destroys the showing scene and takes it off the stage", () => {
        const a = new Scene("a");
        manager.AddScene("a", a);
        manager.ShowScene("a");
        log.length = 0;
        manager.RemoveScene("a");
        expect(log).toEqual(["a.hide", "a.destroy"]);
        expect(onStage()).toEqual([]);
        expect(manager.CurrentScene).toBeUndefined();
        expect(manager.HasScene("a")).toBe(false);
    });

    it("destroys a scene that was never shown without hiding it", () => {
        manager.AddScene("a", new Scene("a"));
        log.length = 0;
        manager.RemoveScene("a");
        expect(log).toEqual(["a.destroy"]);
    });

    it("leaves the one that's showing alone when another is removed", () => {
        manager.AddScene("a", new Scene("a"));
        manager.AddScene("b", new Scene("b"));
        manager.ShowScene("a");
        manager.RemoveScene("b");
        expect(manager.CurrentScene).toBe("a");
        expect(onStage()).toEqual(["a"]);
    });

    it("frees the id for a new scene", () => {
        manager.AddScene("a", new Scene("a"));
        manager.RemoveScene("a");
        expect(() => manager.AddScene("a", new Scene("a2"))).not.toThrow();
    });
});

describe("Destroy", () => {
    it("removes every scene", () => {
        manager.AddScene("a", new Scene("a"));
        manager.AddScene("b", new Scene("b"));
        manager.ShowScene("b");
        log.length = 0;
        manager.Destroy();
        expect(log).toEqual(["a.destroy", "b.hide", "b.destroy"]);
        expect(manager.HasScene("a")).toBe(false);
        expect(manager.HasScene("b")).toBe(false);
    });
});
