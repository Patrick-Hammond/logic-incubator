import { describe, expect, it } from "vitest";
import { ApplyEmitterConfig, ConfigurableEmitter } from "./ApplyEmitterConfig";

/** Behaves as an Emitter does where it matters here: `init` throws on a bad config and resets the owner, rotation, emit and autoUpdate. */
class FakeEmitter implements ConfigurableEmitter {
    ownerPos = { x: 0, y: 0 };
    rotation = 0;
    emit = true;
    autoUpdate = false;
    originalConfig: any;
    originalArt: any;
    inits: { art: any; config: any }[] = [];

    constructor(art: any = ["own-art"], config: any = { name: "original" }) {
        this.originalArt = art;
        this.originalConfig = config;
    }
    init(art: any, config: any): void {
        this.inits.push({ art, config });
        if (config.bad) {
            this.ownerPos = { x: -1, y: -1 }; // part-way through when it failed
            throw new Error("boom: " + config.bad);
        }
        this.originalArt = art;
        this.originalConfig = config;
        this.ownerPos = { x: 0, y: 0 };
        this.rotation = 0;
        this.emit = true;
        this.autoUpdate = false;
    }
    updateOwnerPos(x: number, y: number): void {
        this.ownerPos = { x, y };
    }
    rotate(rotation: number): void {
        this.rotation = rotation;
    }
}

describe("a config that applies", () => {
    it("sets each emitter up again from it, and from the art given", () => {
        const a = new FakeEmitter();
        const b = new FakeEmitter();

        const error = ApplyEmitterConfig([a, b], { name: "new" }, ["picked"]);

        expect(error).toBeUndefined();
        [a, b].forEach(e => {
            expect(e.inits).toHaveLength(1);
            expect(e.originalConfig).toEqual({ name: "new" });
            expect(e.originalArt).toEqual(["picked"]);
        });
    });

    it("keeps each emitter's own art when none is given", () => {
        const a = new FakeEmitter(["art-a"]);
        const b = new FakeEmitter(["art-b"]);

        ApplyEmitterConfig([a, b], { name: "new" });

        expect(a.originalArt).toEqual(["art-a"]);
        expect(b.originalArt).toEqual(["art-b"]);
    });

    it("puts back what init resets: where the owner is, the rotation, whether it emits, and whether it updates itself", () => {
        const e = new FakeEmitter();
        e.ownerPos = { x: 120, y: 340 };
        e.rotation = 90;
        e.emit = false;
        e.autoUpdate = true;

        ApplyEmitterConfig([e], { name: "new" });

        expect(e.ownerPos).toEqual({ x: 120, y: 340 });
        expect(e.rotation).toBe(90);
        expect(e.emit).toBe(false);
        expect(e.autoUpdate).toBe(true);
    });

    it("gives each emitter its own copy of the config, so one changing it can't change the others' or the panel's", () => {
        const a = new FakeEmitter();
        const b = new FakeEmitter();
        const config = { name: "new", lifetime: { min: 1, max: 2 } };

        ApplyEmitterConfig([a, b], config);
        a.originalConfig.lifetime.min = 99;

        expect(b.originalConfig.lifetime.min).toBe(1);
        expect(config.lifetime.min).toBe(1);
        expect(a.originalConfig).not.toBe(config);
        expect(a.originalConfig).not.toBe(b.originalConfig);
    });

    it("does not call rotate for an emitter that is not turned", () => {
        const e = new FakeEmitter();
        let rotated = false;
        e.rotate = () => { rotated = true; };

        ApplyEmitterConfig([e], { name: "new" });

        expect(rotated).toBe(false);
    });
});

describe("a config that cannot be applied", () => {
    it("sets the emitter up again as it was - config, art, owner, rotation, emit and autoUpdate - and says what went wrong", () => {
        const e = new FakeEmitter(["own-art"], { name: "original" });
        e.ownerPos = { x: 10, y: 20 };
        e.rotation = 45;
        e.emit = false;
        e.autoUpdate = true;

        const error = ApplyEmitterConfig([e], { bad: "no spawnRect" }, ["picked"]);

        expect(error).toContain("boom: no spawnRect");
        expect(e.originalConfig).toEqual({ name: "original" });
        expect(e.originalArt).toEqual(["own-art"]);
        expect(e.ownerPos).toEqual({ x: 10, y: 20 });
        expect(e.rotation).toBe(45);
        expect(e.emit).toBe(false);
        expect(e.autoUpdate).toBe(true);
    });

    it("stops at the first emitter that fails, and leaves the rest alone", () => {
        const first = new FakeEmitter();
        const second = new FakeEmitter();

        const error = ApplyEmitterConfig([first, second], { bad: "x" });

        expect(error).toBeDefined();
        expect(second.inits).toHaveLength(0);
    });

    it("turns away an empty list of art without touching anything", () => {
        const e = new FakeEmitter();

        const error = ApplyEmitterConfig([e], { name: "new" }, []);

        expect(error).toContain("no particle image");
        expect(e.inits).toHaveLength(0);
    });

    it("reports an error that isn't an Error too", () => {
        const e = new FakeEmitter();
        e.init = () => { throw "plain text"; };

        expect(ApplyEmitterConfig([e], { name: "new" })).toBe("plain text");
    });
});
