import { describe, expect, it } from "vitest";
import { Vec2 } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../../Constants";
import type { IPlayerInput } from "../../input/PlayerControl";
import { MoveCollider } from "../../view/helpers/PlayerMovement";
import { LightSpell } from "./LightSpell";
import { ApplyPickup, CreatePlayerState, EquippedWeapon, StepPlayer, TakePlayerShot } from "./PlayerState";
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
