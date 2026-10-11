import { describe, expect, it } from "vitest";
import { Vec2 } from "@logic-incubator/lib/math/Geometry";
import type { IPlayerInput } from "../input/PlayerControl";
import RemoteInput, { MaxWaiting } from "./RemoteInput";

function Numbered(...seqs: number[]): IPlayerInput[] {
    return seqs.map(seq => ({ direction: new Vec2(seq, 0), firing: false, aimX: 0, casting: false, seq }));
}

const Seqs = (inputs: IPlayerInput[]) => inputs.map(input => input.seq);

describe("RemoteInput", () => {
    it("plays inputs one a step, in order, saying the last played", () => {
        const remote = new RemoteInput();
        expect(remote.Started).toBe(false);
        remote.Receive(Numbered(1, 2, 3));
        expect(remote.Started).toBe(true);
        expect(Seqs(remote.Take())).toEqual([1]);
        expect(Seqs(remote.Take())).toEqual([2]);
        expect(remote.Acked).toBe(2);
        expect(remote.Waiting).toBe(1);
    });

    it("holds - plays nothing - while the next hasn't come, and never guesses or skips it", () => {
        const remote = new RemoteInput();
        remote.Receive(Numbered(1));
        expect(Seqs(remote.Take())).toEqual([1]);
        expect(remote.Take()).toEqual([]);
        remote.Receive(Numbered(3));
        expect(remote.Take()).toEqual([]);
        remote.Receive(Numbered(2));
        expect(Seqs(remote.Take())).toEqual([2]);
        expect(Seqs(remote.Take())).toEqual([3]);
        expect(remote.Acked).toBe(3);
    });

    it("passes over inputs sent again - each message repeats the last few - and ones already played", () => {
        const remote = new RemoteInput();
        remote.Receive(Numbered(1, 2, 3));
        remote.Take();
        remote.Take();
        remote.Receive(Numbered(2, 3, 4));
        expect(Seqs(remote.Take())).toEqual([3]);
        expect(Seqs(remote.Take())).toEqual([4]);
        expect(remote.Take()).toEqual([]);
    });

    it("plays two a step to catch up once more than MaxWaiting are waiting - after a stall on the line", () => {
        const remote = new RemoteInput();
        const stalled = Array.from({ length: 10 }, (_, i) => i + 1);
        remote.Receive(Numbered(...stalled));
        expect(Seqs(remote.Take())).toEqual([1, 2]);
        expect(Seqs(remote.Take())).toEqual([3, 4]);
        expect(Seqs(remote.Take())).toEqual([5, 6]);
        expect(remote.Waiting).toBe(MaxWaiting);
        expect(Seqs(remote.Take())).toEqual([7]);
    });

    it("gives up on an input that never came once half a second's worth wait behind it", () => {
        const remote = new RemoteInput();
        remote.Receive(Numbered(1));
        remote.Take();
        remote.Receive(Numbered(...Array.from({ length: 31 }, (_, i) => i + 3)));
        expect(Seqs(remote.Take())).toEqual([3, 4]);
    });

    it("starts afresh on Reset", () => {
        const remote = new RemoteInput();
        remote.Receive(Numbered(5, 6));
        remote.Take();
        remote.Reset();
        expect(remote.Started).toBe(false);
        expect(remote.Acked).toBe(0);
        remote.Receive(Numbered(1));
        expect(Seqs(remote.Take())).toEqual([1]);
    });
});
