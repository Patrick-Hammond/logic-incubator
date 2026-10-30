import { describe, expect, it } from "vitest";
import Portals, { DefaultTeleportValue, IsTeleportValue, MaxPortalId, Portal, SanitiseTeleportValue } from "./Portals";

const P = (x: number, y: number, portal: number, arrivalOnly = false): Portal => ({ x, y, value: arrivalOnly ? { portal, arrivalOnly } : { portal } });
const Anywhere = () => true;
const Cell = (portal: Portal | null) => (portal ? { x: portal.x, y: portal.y } : null);

describe("Portals", () => {
    it("sends someone who walks onto a portal to the other one with its id - and back again", () => {
        const portals = new Portals([P(2, 1, 1), P(9, 4, 1), P(5, 5, 2)]);
        expect(Cell(portals.Jump({ x: 1, y: 1 }, { x: 2, y: 1 }, Anywhere))).toEqual({ x: 9, y: 4 });
        expect(Cell(portals.Jump({ x: 9, y: 3 }, { x: 9, y: 4 }, Anywhere))).toEqual({ x: 2, y: 1 });
    });

    it("sends no one who was already standing on it - one who came out there stays put", () => {
        const portals = new Portals([P(2, 1, 1), P(9, 4, 1)]);
        expect(portals.Jump({ x: 9, y: 4 }, { x: 9, y: 4 }, Anywhere)).toBeNull();
        expect(portals.Jump({ x: 3, y: 3 }, { x: 4, y: 3 }, Anywhere)).toBeNull();
    });

    it("leads round a ring, in reading order, where more than two share an id", () => {
        // Painted in any order: read along each row, top row first.
        const portals = new Portals([P(1, 8, 3), P(6, 2, 3), P(2, 2, 3)]);
        expect(portals.All.map(Cell)).toEqual([{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 1, y: 8 }]);
        expect(Cell(portals.Jump({ x: 2, y: 1 }, { x: 2, y: 2 }, Anywhere))).toEqual({ x: 6, y: 2 });
        expect(Cell(portals.Jump({ x: 6, y: 1 }, { x: 6, y: 2 }, Anywhere))).toEqual({ x: 1, y: 8 });
        expect(Cell(portals.Jump({ x: 1, y: 7 }, { x: 1, y: 8 }, Anywhere))).toEqual({ x: 2, y: 2 });
    });

    it("lets an arrival-only portal be come out of, but not gone into", () => {
        const portals = new Portals([P(2, 1, 1), P(9, 4, 1, true)]);
        expect(Cell(portals.Jump({ x: 1, y: 1 }, { x: 2, y: 1 }, Anywhere))).toEqual({ x: 9, y: 4 });
        expect(portals.Jump({ x: 9, y: 3 }, { x: 9, y: 4 }, Anywhere)).toBeNull();
    });

    it("passes over a portal no one can stand on, and goes nowhere if that's all there is", () => {
        const portals = new Portals([P(1, 1, 1), P(5, 1, 1), P(9, 1, 1)]);
        const notAt5 = (x: number) => x !== 5;
        expect(Cell(portals.Jump({ x: 0, y: 1 }, { x: 1, y: 1 }, notAt5))).toEqual({ x: 9, y: 1 });
        expect(portals.Jump({ x: 0, y: 1 }, { x: 1, y: 1 }, x => x === 1)).toBeNull();
    });

    it("keeps one portal a cell - the last painted - and says which can never send anyone anywhere", () => {
        const portals = new Portals([P(1, 1, 1), P(1, 1, 2), P(4, 4, 2), P(7, 7, 5), P(8, 8, 6, true)]);
        expect(portals.At(1, 1)!.value).toEqual({ portal: 2 });
        expect(portals.At(2, 2)).toBeNull();
        // 5 has no partner; 6 is only somewhere to come out, so it isn't counted.
        expect(portals.Unpaired().map(Cell)).toEqual([{ x: 7, y: 7 }]);
    });
});

describe("TeleportValue", () => {
    it("is told apart by its shape", () => {
        expect(IsTeleportValue(DefaultTeleportValue())).toBe(true);
        expect(IsTeleportValue({ portal: 3, arrivalOnly: true })).toBe(true);
        expect(IsTeleportValue({ lock: 3 })).toBe(false);
        expect(IsTeleportValue(3)).toBe(false);
        expect(IsTeleportValue(null)).toBe(false);
    });

    it("is read as a whole id in range, arrival only only where it's set", () => {
        expect(SanitiseTeleportValue({ portal: 2.6, arrivalOnly: false })).toEqual({ portal: 3 });
        expect(SanitiseTeleportValue({ portal: -4, arrivalOnly: true })).toEqual({ portal: 0, arrivalOnly: true });
        expect(SanitiseTeleportValue({ portal: 1e9 })).toEqual({ portal: MaxPortalId });
    });
});
