/**
 * An online guest's own hero, moved the moment its player moves: each step
 * runs the same step the host will (`Hero.Step`) on the same input, numbered
 * and kept until the host says it has played it. Each snapshot then puts the
 * hero where the host had them after the last input it played, and plays the
 * later inputs again from there - so where the guest guessed right nothing
 * changes, and where it didn't (a door, a warp the host saw otherwise) the
 * difference is drawn away over a few frames rather than jumped (`Offset`).
 * Pure - no pixi - so it runs under the plain node test runner.
 */

import { Vec2 } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import { StepSeconds } from "../FixedStep";
import type { IPlayerInput } from "../input/PlayerControl";
import type Hero from "../sim/Hero";
import { WarpTarget } from "../sim/World";
import type { MoveCollider } from "../view/helpers/PlayerMovement";
import { ApplyHeroSnapshot } from "./HeroSync";
import { HeroSnapshot, QuantiseInput } from "./PlayMessages";

/** Share of the drawn difference left after each 60th of a second - most of it gone in a quarter of a second. */
const Settle = 0.85;
/** A difference further than this, in pixels, is jumped rather than drawn away - the host warped them, say. */
const JumpDistance = 2 * TileSize;
/** A difference smaller than this, in pixels, isn't counted as a correction. */
const Unnoticed = 0.5;

export default class Prediction {
    /** How far from where they are the hero is drawn, in pixels: what's left of the last corrections, shrinking each frame. */
    readonly Offset = new Vec2();
    private pending: IPlayerInput[] = [];
    private seq = 0;
    private corrections = 0;
    private lastError = 0;

    /** How many snapshots have put the hero somewhere they hadn't guessed - by more than half a pixel - since the last `Reset`. */
    get Corrections(): number {
        return this.corrections;
    }

    /** How far, in pixels, the last snapshot moved them. */
    get LastError(): number {
        return this.lastError;
    }

    /** How many inputs the host hasn't played yet. */
    get Pending(): number {
        return this.pending.length;
    }

    /** The last few inputs, oldest first - what goes to the host each step. */
    Recent(count: number): IPlayerInput[] {
        return this.pending.slice(-count);
    }

    /** Starts the numbering again - for a level starting. */
    Reset(): void {
        this.pending = [];
        this.seq = 0;
        this.Offset.Set(0, 0);
        this.corrections = 0;
        this.lastError = 0;
    }

    /**
     * One step of `hero` with `input`, numbered and kept - the numbered input is what to send. A fallen hero doesn't
     * move, but their inputs still go, so the host's count of them keeps up. `others` are the heroes they could warp
     * to, as drawn; `collider` the world's.
     */
    Step(hero: Hero, input: IPlayerInput, others: ReadonlyArray<Hero>, collider: MoveCollider): IPlayerInput {
        const numbered = QuantiseInput(input, ++this.seq);
        this.pending.push(numbered);
        if (hero.Alive) {
            Move(hero, numbered, others, collider);
        }
        return numbered;
    }

    /**
     * The host's snapshot of `hero`: back to where the host had them after the last input it played, then every
     * input since played again. Whatever that moves them by is drawn away over the next frames (`Offset`).
     */
    Reconcile(hero: Hero, snapshot: HeroSnapshot, others: ReadonlyArray<Hero>, collider: MoveCollider): void {
        this.pending = this.pending.filter(input => (input.seq || 0) > snapshot.ack);
        const state = hero.Writable;
        const beforeX = state.position.x;
        const beforeY = state.position.y;
        const orbX = state.orb.x;
        const orbY = state.orb.y;
        ApplyHeroSnapshot(hero, snapshot);
        state.position.Set(snapshot.x, snapshot.y);
        if (snapshot.spellLit !== null) {
            state.orb.Set(snapshot.orbX, snapshot.orbY);
        }
        if (hero.Alive) {
            this.pending.forEach(input => {
                Move(hero, input, others, collider);
                // Fired again only in replay: the shot went when it was first played.
                hero.TakeShot();
            });
        }
        const dx = state.position.x - beforeX;
        const dy = state.position.y - beforeY;
        // Where they were drawn between steps moves with them, and the offset takes the difference back out.
        state.previous.Set(state.previous.x + dx, state.previous.y + dy);
        state.previousOrb.Set(state.previousOrb.x + state.orb.x - orbX, state.previousOrb.y + state.orb.y - orbY);
        const error = Math.sqrt(dx * dx + dy * dy);
        this.lastError = error;
        if (error > Unnoticed) {
            this.corrections++;
        }
        if (error > JumpDistance) {
            this.Offset.Set(0, 0);
        } else {
            this.Offset.Set(this.Offset.x - dx, this.Offset.y - dy);
        }
    }

    /** Shrinks the drawn difference, `frames` 60ths of a second on. */
    Settle(frames: number): void {
        const keep = Math.pow(Settle, frames);
        this.Offset.Set(Math.abs(this.Offset.x * keep) < 0.05 ? 0 : this.Offset.x * keep, Math.abs(this.Offset.y * keep) < 0.05 ? 0 : this.Offset.y * keep);
    }
}

/** One step, as `World.Step` takes it: a warp to the party if asked for and allowed, then the move. */
function Move(hero: Hero, input: IPlayerInput, others: ReadonlyArray<Hero>, collider: MoveCollider): void {
    const to = input.warping ? WarpTarget(hero, others) : null;
    if (to) {
        hero.WarpTo(to.Position);
    }
    hero.Step(input, 1, StepSeconds, collider);
}
