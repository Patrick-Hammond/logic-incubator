/**
 * A guest's hero's inputs as they reach the host: kept in order of `seq`, and
 * handed to the world one a step. A guest's own screen has already moved its
 * hero with each of them (see `Prediction`), so each is played exactly once, in
 * order, none skipped and none guessed: while the next is still on its way the
 * hero holds where they are, and once a stall's worth arrives at once they're
 * played two a step until the backlog is down. Either way the host ends up
 * where the guest did. Pure - no pixi - so it runs under the plain node test
 * runner.
 */

import type { IPlayerInput } from "../input/PlayerControl";

/** How many inputs may wait before they're played two a step to catch up - about 70 ms' worth. */
export const MaxWaiting = 4;
/**
 * How many may wait behind one that never came before it's given up on - half a second's worth. Over the relay nothing
 * is lost, and on a direct link each input comes again with the next few (`InputsSent`), so only a guest that skipped
 * one, or a long run of losses, gets here.
 */
const MaxGap = 30;

export default class RemoteInput {
    private waiting = new Map<number, IPlayerInput>();
    /** The `seq` of the next input to play - 0 until the first has come. */
    private next = 0;
    private played = 0;

    /** The `seq` of the last input played - 0 before the first. */
    get Acked(): number {
        return this.played;
    }

    /** How many have come and wait to be played. */
    get Waiting(): number {
        return this.waiting.size;
    }

    /** Whether any input has come yet - a guest who has sent none hasn't started the level. */
    get Started(): boolean {
        return this.next > 0;
    }

    /** Takes in inputs as they came (each with its `seq`): any already played or already here are passed over. */
    Receive(inputs: ReadonlyArray<IPlayerInput>): void {
        inputs.forEach(input => {
            const seq = input.seq;
            if (seq === undefined || seq <= 0) {
                return;
            }
            if (!this.next) {
                this.next = seq;
            }
            if (seq >= this.next && !this.waiting.has(seq)) {
                this.waiting.set(seq, input);
            }
        });
    }

    /**
     * The inputs to play this step, in order: none while the next hasn't come (the hero holds), one, or two when
     * more than `MaxWaiting` are waiting.
     */
    Take(): IPlayerInput[] {
        const taken: IPlayerInput[] = [];
        if (this.waiting.size > MaxGap && !this.waiting.has(this.next)) {
            this.next = Math.min.apply(null, Array.from(this.waiting.keys()));
        }
        const count = this.waiting.size > MaxWaiting ? 2 : 1;
        for (let i = 0; i < count; i++) {
            const input = this.waiting.get(this.next);
            if (!input) {
                break;
            }
            this.waiting.delete(this.next);
            this.played = this.next;
            this.next++;
            taken.push(input);
        }
        return taken;
    }

    /** Forgets everything - for a level starting over, when the guest numbers its inputs afresh. */
    Reset(): void {
        this.waiting.clear();
        this.next = 0;
        this.played = 0;
    }
}
