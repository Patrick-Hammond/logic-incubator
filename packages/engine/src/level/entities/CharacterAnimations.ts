/**
 * Which animation a character - a hero or a monster - is drawn with: the pose it's in (`PoseOf`), that pose's
 * animation from the character's own (`AnimationFor`), how fast it plays (`PoseRates`), and the frame of it to
 * show (`LoopFrame`, `PoseClock`). Two poses so far, `idle` and `run`. Another - attack, die - is a name added
 * to `Pose`, `Poses` and `PoseRates`, an optional animation for it in `CharacterAnimations` (a character without
 * one is drawn `idle` in its place), and whatever puts a character in it in `PoseOf`. Pure - no pixi - so it runs
 * under the plain node test runner.
 */

/** What a character is doing, as far as how it's drawn goes. */
export type Pose = "idle" | "run";

/** Every pose. */
export const Poses: ReadonlyArray<Pose> = ["idle", "run"];

/**
 * How fast each pose's animation plays, as a share of the character's own frame rate. Standing still breathes at half
 * the pace of running, so the two read apart even where the art barely differs (as the 0x72 heroes' idle bob and run
 * hop do).
 */
export const PoseRates: Readonly<Record<Pose, number>> = { idle: 0.5, run: 1 };

/** A character's animations, each by its bare name in the sprite sheet: one for each pose. A character with a single loop gives it for both. */
export type CharacterAnimations = {
    /** Shown standing still - and for any pose the character has no animation of its own for. */
    idle: string;
    /** Shown while moving. */
    run: string;
};

/** What `PoseOf` goes by. */
export type PoseFacts = {
    /** Moving this step - see `IsMoving`. */
    moving: boolean;
};

/** How fast, in the units its velocity is in, a character has to be going to be drawn running: |x| + |y| over this. */
export const MovingSpeed = 0.1;

/**
 * Whether a character going at `velocity` is moving, as far as its animation goes - the same for a hero and a monster. A
 * character pushing into a wall has that axis of its velocity stopped (see `ResolveMove`), so it stands; one coasting to
 * a stop runs until it has all but stopped.
 */
export function IsMoving(velocity: { x: number; y: number }): boolean {
    return Math.abs(velocity.x) + Math.abs(velocity.y) > MovingSpeed;
}

/** The pose a character is in. */
export function PoseOf(facts: PoseFacts): Pose {
    return facts.moving ? "run" : "idle";
}

/** The animation `animations` has for `pose` - its `idle` one, for a pose it has none for. */
export function AnimationFor(animations: CharacterAnimations, pose: Pose): string {
    return animations[pose] || animations.idle;
}

/** Each of `animations`' animations once, idle first - what's measured to size a character's figure, whatever its pose (see `Hero.SetFigure`). */
export function AllAnimations(animations: CharacterAnimations): string[] {
    const names: string[] = [];
    Poses.forEach(pose => {
        const name = AnimationFor(animations, pose);
        if (names.indexOf(name) < 0) {
            names.push(name);
        }
    });
    return names;
}

/** Which of a loop's `count` frames to show `time` into it, at `speed` frames for each unit of `time` - 0 for a loop with none. */
export function LoopFrame(count: number, time: number, speed: number): number {
    return count > 0 ? Math.floor(time * speed) % count : 0;
}

/**
 * A character's pose and how long it's been in it: changing pose starts the new pose's animation from its first frame,
 * rather than wherever the old one had got to.
 */
export class PoseClock {
    private pose: Pose = "idle";
    private time = 0;

    /** The pose it's in. */
    get Pose(): Pose {
        return this.pose;
    }

    /** How long it's been in it, in whatever `Update` was given. */
    get Time(): number {
        return this.time;
    }

    /** `elapsed` on, in `pose` now - from its start, if that's a change. */
    Update(pose: Pose, elapsed: number): void {
        if (pose !== this.pose) {
            this.pose = pose;
            this.time = 0;
        } else {
            this.time += elapsed;
        }
    }

    /** Standing again, from the start - a level starting over. */
    Reset(): void {
        this.pose = "idle";
        this.time = 0;
    }
}
