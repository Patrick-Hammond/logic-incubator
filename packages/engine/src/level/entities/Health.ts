/**
 * The player's hit points, with a moment of invulnerability after each hit so
 * a crowd can't drain them in a handful of frames. Pure - no pixi - so it runs
 * under the plain node test runner, same as Spawners.ts.
 */

/** Seconds the player can't be hurt again after taking a hit. */
export const InvulnerableTime = 1;

export type Health = {
    hitPoints: number;
    max: number;
    /** Seconds of invulnerability left - see `TickHealth`. */
    invulnerable: number;
};

export function CreateHealth(max: number): Health {
    return { hitPoints: max, max, invulnerable: 0 };
}

export function IsDead(health: Health): boolean {
    return health.hitPoints <= 0;
}

/** Returns whether the hit landed: nothing does while invulnerable or already dead. A hit that lands starts `invulnerableTime` of invulnerability. */
export function DamageHealth(health: Health, damage: number, invulnerableTime = InvulnerableTime): boolean {
    if (damage <= 0 || health.invulnerable > 0 || IsDead(health)) {
        return false;
    }
    health.hitPoints = Math.max(0, health.hitPoints - damage);
    health.invulnerable = invulnerableTime;
    return true;
}

/** Restores up to `amount` hit points, never past the maximum - nothing for the dead, or for no amount. Returns whether any came back. */
export function HealHealth(health: Health, amount: number): boolean {
    if (amount <= 0 || IsDead(health) || health.hitPoints >= health.max) {
        return false;
    }
    health.hitPoints = Math.min(health.max, health.hitPoints + amount);
    return true;
}

/** Counts invulnerability down by `dt` seconds. */
export function TickHealth(health: Health, dt: number): void {
    health.invulnerable = Math.max(0, health.invulnerable - dt);
}
