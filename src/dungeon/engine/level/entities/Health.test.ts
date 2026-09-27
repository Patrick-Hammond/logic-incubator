import { describe, expect, it } from "vitest";
import { CreateHealth, DamageHealth, InvulnerableTime, IsDead, TickHealth } from "./Health";

describe("Health", () => {
    it("takes a hit, then shrugs off more until its invulnerability wears off", () => {
        const health = CreateHealth(6);
        expect(DamageHealth(health, 1)).toBe(true);
        expect(health.hitPoints).toBe(5);
        expect(DamageHealth(health, 1)).toBe(false);

        TickHealth(health, InvulnerableTime - 0.1);
        expect(DamageHealth(health, 1)).toBe(false);
        TickHealth(health, 0.1);
        expect(DamageHealth(health, 2)).toBe(true);
        expect(health.hitPoints).toBe(3);
    });

    it("dies at 0, never below, and takes no more hits once dead", () => {
        const health = CreateHealth(2);
        expect(DamageHealth(health, 5, 0)).toBe(true);
        expect(health.hitPoints).toBe(0);
        expect(IsDead(health)).toBe(true);
        expect(DamageHealth(health, 1, 0)).toBe(false);
    });

    it("ignores a hit for nothing", () => {
        const health = CreateHealth(2);
        expect(DamageHealth(health, 0)).toBe(false);
        expect(health.invulnerable).toBe(0);
    });
});
