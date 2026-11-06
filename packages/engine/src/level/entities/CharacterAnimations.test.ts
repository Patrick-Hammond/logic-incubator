import { describe, expect, it } from "vitest";
import { AllAnimations, AnimationFor, CharacterAnimations, IsMoving, LoopFrame, PoseClock, PoseOf } from "./CharacterAnimations";

const Knight: CharacterAnimations = { idle: "knight_idle_anim", run: "knight_run_anim" };
const Slime: CharacterAnimations = { idle: "slime_anim", run: "slime_anim" };

describe("CharacterAnimations", () => {
    it("draws a character idle while it stands, and running while it moves", () => {
        expect(AnimationFor(Knight, PoseOf({ moving: false }))).toBe("knight_idle_anim");
        expect(AnimationFor(Knight, PoseOf({ moving: true }))).toBe("knight_run_anim");
    });

    it("draws a pose a character has no animation for with its idle one", () => {
        const still = { idle: "statue" } as unknown as CharacterAnimations;
        expect(AnimationFor(still, "run")).toBe("statue");
    });

    it("counts a character as moving only while it's going faster than a crawl, either way", () => {
        expect(IsMoving({ x: 0, y: 0 })).toBe(false);
        expect(IsMoving({ x: 0.05, y: -0.04 })).toBe(false);
        expect(IsMoving({ x: 0, y: -0.5 })).toBe(true);
        expect(IsMoving({ x: -0.06, y: 0.06 })).toBe(true);
    });

    it("lists each of a character's animations once, idle first", () => {
        expect(AllAnimations(Knight)).toEqual(["knight_idle_anim", "knight_run_anim"]);
        expect(AllAnimations(Slime)).toEqual(["slime_anim"]);
    });

    it("loops through a pose's frames, none for an animation with none", () => {
        expect([0, 9, 10, 39, 40, 45].map(time => LoopFrame(4, time, 0.1))).toEqual([0, 0, 1, 3, 0, 0]);
        expect(LoopFrame(0, 12, 0.1)).toBe(0);
    });

    it("starts a pose's animation from its first frame each time the pose changes", () => {
        const clock = new PoseClock();
        expect(clock.Pose).toBe("idle");
        clock.Update("idle", 25);
        expect(clock.Time).toBe(25);
        clock.Update("run", 3);
        expect(clock.Pose).toBe("run");
        expect(clock.Time).toBe(0);
        clock.Update("run", 3);
        expect(clock.Time).toBe(3);
        clock.Update("idle", 3);
        expect(clock.Time).toBe(0);
        clock.Update("run", 1);
        clock.Reset();
        expect(clock.Pose).toBe("idle");
        expect(clock.Time).toBe(0);
    });
});
