import { describe, expect, it } from "vitest";
import { AllFields, CloneConfig, DefaultKillRect, EmitterConfigModel, EmitterSections, Field, ParseEmitterConfig, SpawnTypes } from "./EmitterConfigModel";

/** An editor export, in the old `{ start, end }` shape - like the game's fire_particles.json. */
const Fire = () => ({
    alpha: { start: 0.9, end: 0 },
    scale: { start: 1.5, end: 0.3, minimumScaleMultiplier: 1 },
    color: { start: "ffdf8a", end: "ff3b1a" },
    speed: { start: 90, end: 30, minimumSpeedMultiplier: 1 },
    acceleration: { x: 0, y: -20 },
    maxSpeed: 0,
    startRotation: { min: 250, max: 290 },
    noRotation: true,
    rotationSpeed: { min: 0, max: 0 },
    lifetime: { min: 0.6, max: 1.2 },
    blendMode: "add",
    frequency: 0.01,
    emitterLifetime: -1,
    maxParticles: 300,
    pos: { x: 0, y: 0 },
    addAtBack: false,
    spawnType: "circle",
    spawnCircle: { x: 0, y: 0, r: 12 },
}) as any;

const Min = () => ({ lifetime: { min: 1, max: 2 }, frequency: 0.1, pos: { x: 0, y: 0 } }) as any;

const field = (id: string): Field => {
    const found = AllFields().filter(f => f.id === id)[0];
    if (!found) {
        throw new Error("no field " + id);
    }
    return found;
};

const row = (label: string) => EmitterSections().reduce((all, s) => all.concat(s.rows), [] as ReturnType<typeof EmitterSections>[0]["rows"]).filter(r => r.label === label)[0];

describe("reading", () => {
    it("reads values from an editor export", () => {
        const fire = Fire();

        expect(field("alpha.start").read(fire)).toBe(0.9);
        expect(field("alpha.end").read(fire)).toBe(0);
        expect(field("scale.start").read(fire)).toBe(1.5);
        expect(field("speed.end").read(fire)).toBe(30);
        expect(field("acceleration.y").read(fire)).toBe(-20);
        expect(field("startRotation.max").read(fire)).toBe(290);
        expect(field("lifetime.min").read(fire)).toBe(0.6);
        expect(field("blendMode").read(fire)).toBe("add");
        expect(field("spawnType").read(fire)).toBe("circle");
        expect(field("spawnCircle.r").read(fire)).toBe(12);
        expect(field("noRotation").read(fire)).toBe(true);
        expect(field("maxParticles").read(fire)).toBe(300);
    });

    it("gives a colour as #rrggbb, whichever way the config writes it", () => {
        expect(field("color.start").read({ color: { start: "ffdf8a", end: "000000" } })).toBe("#ffdf8a");
        expect(field("color.start").read({ color: { start: "#FFDF8A", end: "000000" } })).toBe("#ffdf8a");
        expect(field("color.start").read({ color: { start: "0xFFDF8A", end: "000000" } })).toBe("#ffdf8a");
        expect(field("color.start").read({ color: { start: "fff", end: "000000" } })).toBe("#000fff"); // short forms are padded as numbers are
    });

    it("gives a default for what the config leaves out", () => {
        const config = Min();

        // A property that is left out is a constant in the emitter: 1 for alpha and scale, 0 for speed, white.
        expect(field("alpha.start").read(config)).toBe(1);
        expect(field("alpha.end").read(config)).toBe(1);
        expect(field("scale.start").read(config)).toBe(1);
        expect(field("scale.end").read(config)).toBe(1);
        expect(field("speed.start").read(config)).toBe(0);
        expect(field("speed.end").read(config)).toBe(0);
        expect(field("color.start").read(config)).toBe("#ffffff");
        expect(field("minimumScaleMultiplier").read(config)).toBe(1);
        expect(field("spawnType").read(config)).toBe("point");
        expect(field("blendMode").read(config)).toBe("normal");
        expect(field("emitterLifetime").read(config)).toBe(-1);
        expect(field("maxParticles").read(config)).toBe(1000);
        expect(field("addAtBack").read(config)).toBe(false);
    });

    it("reads the first and last values of the list shape", () => {
        const config = { ...Min(), alpha: { list: [{ value: 1, time: 0 }, { value: 0.5, time: 0.5 }, { value: 0.1, time: 1 }] }, color: { list: [{ value: "ff0000", time: 0 }, { value: "0000ff", time: 1 }] } };

        expect(field("alpha.start").read(config)).toBe(1);
        expect(field("alpha.end").read(config)).toBe(0.1);
        expect(field("color.end").read(config)).toBe("#0000ff");
    });

    it("shows what the emitter would use for a number the config has as something else: null, empty text, words", () => {
        const odd = { ...Min(), maxParticles: null, particlesPerWave: "", frequency: "soon", scale: { start: "2.5", end: null }, speed: { start: 5, end: 5, minimumSpeedMultiplier: "x" } };

        expect(field("maxParticles").read(odd)).toBe(1000);
        expect(field("particlesPerWave").read(odd)).toBe(1);
        expect(field("frequency").read(odd)).toBe(0.1);
        expect(field("scale.start").read(odd)).toBe(2.5); // a numeric string is a number
        expect(field("scale.end").read(odd)).toBe(1);
        expect(field("minimumSpeedMultiplier").read(odd)).toBe(1);
    });

    it("finds a minimum multiplier beside its property, or at the top level", () => {
        expect(field("minimumScaleMultiplier").read({ scale: { start: 1, end: 1, minimumScaleMultiplier: 0.5 } })).toBe(0.5);
        expect(field("minimumScaleMultiplier").read({ minimumScaleMultiplier: 0.25, scale: { list: [{ value: 1, time: 0 }] } })).toBe(0.25);
        expect(field("minimumSpeedMultiplier").read({ speed: { start: 1, end: 1, minimumSpeedMultiplier: 3 } })).toBe(3);
    });
});

describe("writing", () => {
    it("changes just the one value and leaves the rest of the config as it was", () => {
        const fire = Fire();
        const before = JSON.stringify(fire);

        field("alpha.start").write(fire, 0.5);

        expect(fire.alpha).toEqual({ start: 0.5, end: 0 });
        expect(JSON.stringify({ ...fire, alpha: undefined })).toBe(JSON.stringify({ ...JSON.parse(before), alpha: undefined }));
    });

    it("writes the first or last value of a list and keeps the steps between", () => {
        const config = { ...Min(), alpha: { list: [{ value: 1, time: 0 }, { value: 0.5, time: 0.5 }, { value: 0.1, time: 1 }], isStepped: true } };

        field("alpha.start").write(config, 0.8);
        field("alpha.end").write(config, 0.2);

        expect(config.alpha).toEqual({ list: [{ value: 0.8, time: 0 }, { value: 0.5, time: 0.5 }, { value: 0.2, time: 1 }], isStepped: true });
    });

    it("makes a property that isn't there, with both ends at its default, then sets the one asked for", () => {
        const config = Min();

        field("alpha.end").write(config, 0.3);
        field("color.start").write(config, "#ff8800");

        expect(config.alpha).toEqual({ start: 1, end: 0.3 });
        expect(config.color).toEqual({ start: "ff8800", end: "ffffff" });
    });

    it("writes a colour as rrggbb, the way the editor's JSON has it", () => {
        const config = Fire();

        field("color.end").write(config, "#AABBCC");

        expect(config.color.end).toBe("aabbcc");
    });

    it("makes the objects on the way to a nested value", () => {
        const config = Min();

        field("startRotation.min").write(config, 45);
        field("acceleration.y").write(config, 10);

        expect(config.startRotation).toEqual({ min: 45 });
        expect(config.acceleration).toEqual({ y: 10 });
    });

    it("keeps a minimum multiplier where the config has it, and puts a new one beside its property", () => {
        const old = { ...Min(), scale: { start: 1, end: 1, minimumScaleMultiplier: 1 } };
        const top = { ...Min(), minimumScaleMultiplier: 1, scale: { start: 1, end: 1 } };
        const none = Min();

        field("minimumScaleMultiplier").write(old, 0.5);
        field("minimumScaleMultiplier").write(top, 0.5);
        field("minimumSpeedMultiplier").write(none, 2);

        expect(old.scale.minimumScaleMultiplier).toBe(0.5);
        expect((old as any).minimumScaleMultiplier).toBeUndefined();
        expect(top.minimumScaleMultiplier).toBe(0.5);
        expect((none as any).speed).toEqual({ minimumSpeedMultiplier: 2 });
    });

    it("writes ticks, choices and numbers as the types they are", () => {
        const config = Min();

        field("noRotation").write(config, true);
        field("blendMode").write(config, "screen");
        field("frequency").write(config, 0.5);

        expect(config.noRotation).toBe(true);
        expect(config.blendMode).toBe("screen");
        expect(config.frequency).toBe(0.5);
    });
});

describe("the spawn shape", () => {
    it("leaves what the new shape needs in the config - without it the emitter could not be set up", () => {
        const rect = Min();
        const circle = Min();
        const ring = Min();
        const burst = Min();

        field("spawnType").write(rect, "rect");
        field("spawnType").write(circle, "circle");
        field("spawnType").write(ring, "ring");
        field("spawnType").write(burst, "burst");

        expect(rect.spawnRect).toEqual({ x: -50, y: -50, w: 100, h: 100 });
        expect(circle.spawnCircle).toEqual({ x: 0, y: 0, r: 50 });
        expect(ring.spawnCircle).toEqual({ x: 0, y: 0, r: 50, minR: 25 });
        expect(burst.particleSpacing).toBe(0);
        expect(burst.angleStart).toBe(0);
    });

    it("does not overwrite a shape that is there already", () => {
        const fire = Fire();

        field("spawnType").write(fire, "ring");

        expect(fire.spawnCircle.r).toBe(12);
        expect(fire.spawnCircle.minR).toBe(6);

        field("spawnType").write(fire, "circle");
        expect(fire.spawnCircle).toEqual({ x: 0, y: 0, r: 12, minR: 6 });
    });

    it("shows a shape's own settings only while that shape is chosen", () => {
        const visible = (config: any) => EmitterSections().reduce((all, s) => all.concat(s.rows), [] as any[])
            .filter(r => !r.visible || r.visible(config)).map(r => r.label);
        const withType = (type: string) => ({ ...Min(), spawnType: type });

        expect(visible(withType("point"))).not.toContain("Rectangle");
        expect(visible(withType("rect"))).toContain("Rectangle");
        expect(visible(withType("rect"))).not.toContain("Circle");
        expect(visible(withType("circle"))).toContain("Circle");
        expect(visible(withType("circle"))).not.toContain("Ring inner radius");
        expect(visible(withType("ring"))).toEqual(expect.arrayContaining(["Circle", "Ring inner radius"]));
        expect(visible(withType("burst"))).toEqual(expect.arrayContaining(["Particle spacing", "Start angle"]));
    });

    it("offers the shapes the panel can set up", () => {
        expect(field("spawnType").options).toEqual(SpawnTypes);
    });
});

describe("the kill area (live until outside it)", () => {
    it("is off for a config without a killRect, and on for one with it", () => {
        expect(field("killRect.enabled").read(Min())).toBe(false);
        expect(field("killRect.enabled").read({ ...Min(), killRect: { x: 0, y: 0, w: 10, h: 10 } })).toBe(true);
    });

    it("adds the area when ticked, from the context's default, and takes it out when cleared", () => {
        const config = Min();
        const area = { x: -10, y: -20, w: 300, h: 400 };

        field("killRect.enabled").write(config, true, { killRect: area });
        expect(config.killRect).toEqual(area);
        expect(config.killRect).not.toBe(area); // its own copy: editing one doesn't edit the default

        field("killRect.enabled").write(config, false, { killRect: area });
        expect("killRect" in config).toBe(false);
    });

    it("keeps an area that is there when ticked again", () => {
        const config = { ...Min(), killRect: { x: 1, y: 2, w: 3, h: 4 } };

        field("killRect.enabled").write(config, true, { killRect: { x: 0, y: 0, w: 99, h: 99 } });

        expect(config.killRect).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    });

    it("starts from a default of 1280 x 720 plus a margin all round when the context says nothing", () => {
        const config = Min();

        field("killRect.enabled").write(config, true);

        expect(config.killRect).toEqual({ x: -100, y: -100, w: 1480, h: 920 });
    });

    it("reads and writes the four numbers of the area", () => {
        const config = { ...Min(), killRect: { x: 0, y: 0, w: 100, h: 100 } };

        field("killRect.w").write(config, 640);
        field("killRect.x").write(config, -50);

        expect(config.killRect).toEqual({ x: -50, y: 0, w: 640, h: 100 });
        expect(field("killRect.w").read(config)).toBe(640);
    });

    it("shows the area's row only while there is an area, and a note on the lifetime row that says what it now means", () => {
        const area = row("Area");
        const lifetime = row("Lifetime");
        const withArea = { ...Min(), killRect: { x: 0, y: 0, w: 1, h: 1 } };

        expect(area.visible!(Min())).toBe(false);
        expect(area.visible!(withArea)).toBe(true);
        expect(lifetime.note!(Min())).toBeUndefined();
        expect(lifetime.note!(withArea)).toContain("end values");
    });

    it("makes a model's tick box use the screen it was given", () => {
        const model = new EmitterConfigModel(Min(), { killRect: DefaultKillRect({ width: 640, height: 360 }, 50) });

        model.Write(field("killRect.enabled"), true);

        expect(model.Config.killRect).toEqual({ x: -50, y: -50, w: 740, h: 460 });
    });

    it("survives Reset and Load like any other setting", () => {
        const model = new EmitterConfigModel(Min());
        model.Write(field("killRect.enabled"), true);
        expect(model.Changed).toBe(true);

        model.Reset();

        expect("killRect" in model.Config).toBe(false);
    });
});

describe("DefaultKillRect", () => {
    it("is the screen with a margin on every side", () => {
        expect(DefaultKillRect({ width: 1280, height: 720 })).toEqual({ x: -100, y: -100, w: 1480, h: 920 });
        expect(DefaultKillRect({ width: 800, height: 600 }, 25)).toEqual({ x: -25, y: -25, w: 850, h: 650 });
    });

    it("assumes 1280 x 720 when the screen is not known or has no size", () => {
        expect(DefaultKillRect()).toEqual({ x: -100, y: -100, w: 1480, h: 920 });
        expect(DefaultKillRect({ width: 0, height: 0 })).toEqual({ x: -100, y: -100, w: 1480, h: 920 });
    });
});

describe("notes", () => {
    it("says when the end speed is ignored", () => {
        expect(row("Speed").note!({ acceleration: { x: 0, y: -20 } })).toContain("ignored");
        expect(row("Speed").note!({ acceleration: { x: 5, y: 0 } })).toContain("ignored");
        expect(row("Speed").note!({ acceleration: { x: 0, y: 0 } })).toBeUndefined();
        expect(row("Speed").note!(Min())).toBeUndefined();
    });
});

describe("the fields", () => {
    it("have unique ids", () => {
        const ids = AllFields().map(f => f.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it("have sensible ranges, and every slider a full one", () => {
        AllFields().forEach(f => {
            if (f.min !== undefined && f.max !== undefined) {
                expect(f.min).toBeLessThanOrEqual(f.max);
            }
            if (f.kind === "slider") {
                expect(f.min).toBeDefined();
                expect(f.max).toBeDefined();
            }
            if (f.kind === "select") {
                expect(f.options!.length).toBeGreaterThan(0);
            }
        });
    });

    it("read back what they write, for every kind", () => {
        AllFields().forEach(f => {
            const config = Min();
            const value = f.kind === "check" ? true : f.kind === "colour" ? "#123456" : f.kind === "select" ? f.options![f.options!.length - 1] : 7;

            f.write(config, value);

            expect(f.read(config)).toBe(value);
        });
    });
});

describe("CloneConfig", () => {
    it("copies objects and arrays all the way down", () => {
        const original = { a: { b: [1, { c: 2 }] } };

        const copy = CloneConfig(original);
        (copy.a.b[1] as any).c = 99;

        expect(original.a.b[1]).toEqual({ c: 2 });
        expect(copy).not.toBe(original);
    });

    it("keeps a function, such as a custom ease, as it is", () => {
        const ease = (t: number) => t * t;

        expect(CloneConfig({ ease }).ease).toBe(ease);
    });
});

describe("EmitterConfigModel", () => {
    it("edits a copy: the config it was given, which may be shared data, is never changed", () => {
        const shared = Fire();
        const before = JSON.stringify(shared);
        const model = new EmitterConfigModel(shared);

        model.Write(field("speed.start"), 500);

        expect(model.Read(field("speed.start"))).toBe(500);
        expect(JSON.stringify(shared)).toBe(before);
    });

    it("says whether anything has changed, and goes back to how it started", () => {
        const model = new EmitterConfigModel(Fire());
        expect(model.Changed).toBe(false);

        model.Write(field("lifetime.max"), 5);
        expect(model.Changed).toBe(true);

        model.Reset();
        expect(model.Changed).toBe(false);
        expect(model.Read(field("lifetime.max"))).toBe(1.2);
    });

    it("loads another config, and Reset still goes back to the one it started with", () => {
        const model = new EmitterConfigModel(Fire());

        model.Load({ ...Min(), frequency: 0.5 });
        expect(model.Read(field("frequency"))).toBe(0.5);
        expect(model.Changed).toBe(true);

        model.Reset();
        expect(model.Read(field("frequency"))).toBe(0.01);
    });

    it("writes its config as JSON that reads back the same", () => {
        const model = new EmitterConfigModel(Fire());
        model.Write(field("color.start"), "#112233");

        const text = model.ToJson();

        expect(ParseEmitterConfig(text)).toEqual(model.Config);
        expect(JSON.parse(text).color.start).toBe("112233");
    });

    it("carries through what it has no control for", () => {
        const model = new EmitterConfigModel({ ...Fire(), extraData: { path: "sin(x)" }, spawnPolygon: [{ x: 0, y: 0 }, { x: 5, y: 5 }] });

        model.Write(field("speed.start"), 1);

        expect(model.Config.extraData).toEqual({ path: "sin(x)" });
        expect(model.Config.spawnPolygon).toHaveLength(2);
    });
});

describe("ParseEmitterConfig", () => {
    it("accepts an emitter config", () => {
        expect(ParseEmitterConfig(JSON.stringify(Fire())).frequency).toBe(0.01);
    });

    it("says what is missing from something that is not one", () => {
        expect(() => ParseEmitterConfig(JSON.stringify({ lifetime: { min: 1, max: 2 } }))).toThrow("no frequency, pos");
        expect(() => ParseEmitterConfig("[1, 2]")).toThrow("JSON object");
        expect(() => ParseEmitterConfig("null")).toThrow("JSON object");
    });

    it("says which shape a spawn type is missing, rather than leaving the emitter to fail setting up", () => {
        const base = { lifetime: { min: 1, max: 2 }, frequency: 0.1, pos: { x: 0, y: 0 } };

        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, spawnType: "rect" }))).toThrow('spawnType "rect" needs spawnRect');
        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, spawnType: "circle" }))).toThrow("needs spawnCircle");
        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, spawnType: "ring" }))).toThrow("needs spawnCircle");
        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, spawnType: "polygonalChain" }))).toThrow("needs spawnPolygon");
    });

    it("accepts a spawn type that has its shape, and one that needs none", () => {
        const base = { lifetime: { min: 1, max: 2 }, frequency: 0.1, pos: { x: 0, y: 0 } };

        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, spawnType: "rect", spawnRect: { x: 0, y: 0, w: 1, h: 1 } }))).not.toThrow();
        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, spawnType: "point" }))).not.toThrow();
        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, spawnType: "burst" }))).not.toThrow();
        expect(() => ParseEmitterConfig(JSON.stringify(base))).not.toThrow();
    });

    it("needs the four numbers of a killRect, and says which are missing", () => {
        const base = { lifetime: { min: 1, max: 2 }, frequency: 0.1, pos: { x: 0, y: 0 } };

        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, killRect: { x: 0, y: 0 } }))).toThrow("killRect needs numbers for w, h");
        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, killRect: null }))).toThrow("killRect needs numbers for x, y, w, h");
        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, killRect: { x: "0", y: 0, w: 1, h: 1 } }))).toThrow("for x");
        expect(() => ParseEmitterConfig(JSON.stringify({ ...base, killRect: { x: 0, y: 0, w: 1, h: 1 } }))).not.toThrow();
    });

    it("lets the parser's own error through for text that is not JSON", () => {
        expect(() => ParseEmitterConfig("{ nope")).toThrow();
    });
});
