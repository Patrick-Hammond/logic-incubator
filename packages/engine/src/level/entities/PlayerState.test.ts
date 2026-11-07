import { describe, expect, it } from "vitest";
import { Vec2 } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../../Constants";
import type { IPlayerInput } from "../../input/PlayerControl";
import { BareFloor, Footing, MoveCollider } from "../../view/helpers/PlayerMovement";
import { LightSpell } from "./LightSpell";
import { DefaultExperienceRules } from "./Experience";
import { ApplyPickup, CreatePlayerState, EquippedWeapon, GainExperience, StepPlayer, TakePlayerShot } from "./PlayerState";
import { WeaponDef } from "./Projectiles";

const FRAME = 1 / 60;
const BOW: WeaponDef = { icon: "bow", shot: { sprite: "arrow", speed: 6, damage: 1, range: 20, cooldown: 0.5 } };
const STAFF: WeaponDef = { icon: "staff", shot: { sprite: "bolt", speed: 4, damage: 2, range: 10, cooldown: 1 } };
const SPELL: LightSpell = { light: { brightness: 1, tint: 0xffffff, range: 5 }, seconds: 10, recharge: 5 };

/** Open floor everywhere - nothing stops them. */
const OPEN: MoveCollider = {
    TestX: () => null,
    TestY: () => null,
    GapAlignX: () => null,
    GapAlignY: () => null,
    IsHeightBlocked: () => false
};

function Input(x = 0, y = 0, extra: Partial<IPlayerInput> = {}): IPlayerInput {
    return { direction: new Vec2(x, y), firing: false, aimX: 0, casting: false, ...extra };
}

describe("PlayerState", () => {
    it("starts on its tile, in pixels, with nothing to draw between", () => {
        const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 3, y: 2 });
        expect(state.position).toEqual({ x: 3 * TileSize, y: 2 * TileSize });
        expect(state.previous).toEqual(state.position);
        expect(state.health.hitPoints).toBe(6);
        expect(EquippedWeapon(state)).toBe(BOW);
        expect(state.spell).toBeNull();
    });

    it("carries one weapon: one picked up takes the place of the one held", () => {
        const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW, STAFF] }, { x: 0, y: 0 });
        expect(state.weapons).toEqual([BOW]);
        ApplyPickup(state, { value: { kind: "weapon", weapon: STAFF }, sprite: null });
        expect(state.weapons).toEqual([STAFF]);
        expect(EquippedWeapon(state)).toBe(STAFF);
    });

    it("goes up levels with experience, each adding to their most hit points and to what they have", () => {
        const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 0, y: 0 });
        expect(state.experience).toEqual({ level: 1, xp: 0, next: 100 });
        state.health.hitPoints = 3;
        expect(GainExperience(state, DefaultExperienceRules, 120)).toBe(1);
        expect(state.experience).toEqual({ level: 2, xp: 20, next: 200 });
        expect(state.health).toMatchObject({ hitPoints: 5, max: 8 });
    });

    it("doesn't bring a hero who is down back up by a level", () => {
        const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 0, y: 0 });
        state.health.hitPoints = 0;
        GainExperience(state, DefaultExperienceRules, 100);
        expect(state.health).toMatchObject({ hitPoints: 0, max: 8 });
    });

    it("earns experience as the setup says", () => {
        const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW], experience: { perLevel: 50 } }, { x: 0, y: 0 });
        expect(state.experience.next).toBe(50);
    });

    it("keeps a weapon picked up to itself, so the next level start has the setup's loadout again", () => {
        const setup = { hitPoints: 6, weapons: [BOW] };
        const state = CreatePlayerState(setup, { x: 0, y: 0 });
        ApplyPickup(state, { value: { kind: "weapon", weapon: STAFF }, sprite: null });
        expect(EquippedWeapon(state)).toBe(STAFF);
        expect(setup.weapons).toEqual([BOW]);
        expect(EquippedWeapon(CreatePlayerState(setup, { x: 0, y: 0 }))).toBe(BOW);
    });

    it("moves with its input and remembers where it was before the step", () => {
        const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 5, y: 5 });
        const start = state.position.Clone();
        StepPlayer(state, Input(1, 0), 1, FRAME, OPEN);
        expect(state.previous).toEqual(start);
        expect(state.position.x).toBeGreaterThan(start.x);
        expect(state.position.y).toBe(start.y);
        StepPlayer(state, Input(-1, 0), 1, FRAME, OPEN);
        expect(state.facingX).toBe(-1);
    });

    it("fires the way it faces, once per cooldown, and hands each shot over once", () => {
        const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 5, y: 5 });
        StepPlayer(state, Input(-1, 0, { firing: true }), 1, FRAME, OPEN);
        expect(TakePlayerShot(state)).toEqual({ x: -1, y: 0 });
        expect(TakePlayerShot(state)).toBeNull();
        StepPlayer(state, Input(0, 0, { firing: true }), 1, FRAME, OPEN);
        expect(TakePlayerShot(state)).toBeNull();
        for (let i = 0; i < 30; i++) {
            StepPlayer(state, Input(0, 0, { firing: true }), 1, FRAME, OPEN);
        }
        expect(TakePlayerShot(state)).toEqual({ x: -1, y: 0 });
    });

    it("turns to the aim stick, whichever way it moves", () => {
        const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 5, y: 5 });
        StepPlayer(state, Input(1, 0, { firing: true, aimX: -0.5 }), 1, FRAME, OPEN);
        expect(state.facingX).toBe(-1);
        expect(TakePlayerShot(state)).toEqual({ x: -1, y: 0 });
    });

    it("calls up its mage-light behind it, where it is drawn from rather than from where it last went out", () => {
        const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 5, y: 5 }, SPELL);
        StepPlayer(state, Input(0, 0, { casting: true }), 1, FRAME, OPEN);
        expect(state.spell.lit).not.toBeNull();
        // Facing right, so it's to their left.
        expect(state.orb.x).toBeLessThan(state.position.x + TileSize / 2);
        expect(state.previousOrb).toEqual(state.orb);
    });

    describe("on a floor overlay", () => {
        /** Where they are along x after `walk` steps pushing right, then `coast` with nothing pressed - and how far they went while coasting. */
        function Walk(footing: Footing | undefined, walk: number, coast = 0): { x: number; slid: number } {
            const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 0, y: 0 });
            for (let i = 0; i < walk; i++) {
                StepPlayer(state, Input(1, 0), 1, FRAME, OPEN, footing);
            }
            const letGo = state.position.x;
            for (let i = 0; i < coast; i++) {
                StepPlayer(state, Input(), 1, FRAME, OPEN, footing);
            }
            return { x: state.position.x, slid: state.position.x - letGo };
        }

        it("moves on bare floor as it always has", () => {
            expect(Walk(BareFloor, 40, 40)).toEqual(Walk(undefined, 40, 40));
            // One step from standing: a push of 1 at PlayerSpeed, 0.8 pixels.
            expect(Walk(BareFloor, 1).x).toBeCloseTo(0.8, 10);
        });

        it("goes at the floor's speed", () => {
            expect(Walk({ speed: 0.3, slipperiness: 1 }, 60).x).toBeCloseTo(Walk(BareFloor, 60).x * 0.3, 8);
            expect(Walk({ speed: 1.5, slipperiness: 1 }, 60).x).toBeCloseTo(Walk(BareFloor, 60).x * 1.5, 8);
        });

        it("speeds up as quickly however slippery the floor - slipperiness only slows the slowing down", () => {
            expect(Walk({ speed: 1, slipperiness: 3 }, 30).x).toBe(Walk(BareFloor, 30).x);
            expect(Walk({ speed: 1, slipperiness: 0.1 }, 30).x).toBe(Walk(BareFloor, 30).x);
        });

        it("slides on further after letting go the more slippery the floor, stopping short on a sticky one", () => {
            const bare = Walk(BareFloor, 60, 300).slid;
            const slime = Walk({ speed: 1, slipperiness: 3 }, 60, 300).slid;
            const mud = Walk({ speed: 1, slipperiness: 0.1 }, 60, 300).slid;
            expect(slime).toBeGreaterThan(bare * 2.5);
            expect(mud).toBeLessThan(bare * 0.3);
            expect(Walk({ speed: 1, slipperiness: 0 }, 60, 300).slid).toBe(0);
        });

        it("skids on into a slow, slippery floor run onto at speed, and stops short in a slow, sticky one", () => {
            const into = (footing: Footing) => {
                const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 0, y: 0 });
                for (let i = 0; i < 60; i++) {
                    StepPlayer(state, Input(1, 0), 1, FRAME, OPEN);
                }
                const edge = state.position.x;
                for (let i = 0; i < 30; i++) {
                    StepPlayer(state, Input(1, 0), 1, FRAME, OPEN, footing);
                }
                return state.position.x - edge;
            };
            // Walking 30 steps at slime's pace from a standstill would take them 30 * 0.4 = 12 pixels.
            expect(into({ speed: 0.1, slipperiness: 3 })).toBeGreaterThan(40);
            expect(into({ speed: 0.3, slipperiness: 0.1 })).toBeLessThan(30 * 0.3 * 4 + 6);
        });

        it("carries on further before turning round the more slippery the floor", () => {
            const overshoot = (slipperiness: number) => {
                const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 5, y: 5 });
                const footing = { speed: 1, slipperiness };
                for (let i = 0; i < 60; i++) {
                    StepPlayer(state, Input(1, 0), 1, FRAME, OPEN, footing);
                }
                const turned = state.position.x;
                let furthest = turned;
                for (let i = 0; i < 60; i++) {
                    StepPlayer(state, Input(-1, 0), 1, FRAME, OPEN, footing);
                    furthest = Math.max(furthest, state.position.x);
                }
                return furthest - turned;
            };
            expect(overshoot(3)).toBeGreaterThan(overshoot(1) * 2.5);
            expect(overshoot(1)).toBeGreaterThan(overshoot(0.1));
        });
    });

    it("comes out the same from the same start and inputs", () => {
        const inputs = [Input(1, 0), Input(1, 1, { firing: true }), Input(0, 1, { casting: true }), Input(-1, 0, { firing: true })];
        const run = () => {
            const state = CreatePlayerState({ hitPoints: 6, weapons: [BOW] }, { x: 5, y: 5 }, SPELL);
            const shots: unknown[] = [];
            for (let i = 0; i < 120; i++) {
                StepPlayer(state, inputs[i % inputs.length], 1, FRAME, OPEN);
                shots.push(TakePlayerShot(state));
            }
            return { state, shots };
        };
        expect(run()).toEqual(run());
    });
});
