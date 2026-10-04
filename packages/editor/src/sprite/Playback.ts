/**
 * Which frame of an animation to show, and when to move on. The editor feeds it the time since its last tick and shows
 * `Frame`. Pure - no DOM, no timers - so it runs under the plain node test runner (see Playback.test.ts).
 */

export type PlayMode = "loop" | "pingpong" | "once";

/** The speed tiles animate at in the game (AnimationSpeed 0.2 per 60Hz tick). */
export const DefaultFps = 12;
export const MinFps = 1;
export const MaxFps = 60;
/** A tick longer than this (the tab was hidden, say) counts as this long - a pause shouldn't fast-forward the animation. */
const MaxStepMs = 250;

export class Playback {
    private frame = 0;
    private direction = 1;
    private elapsed = 0;
    private playing = false;
    private count: number;
    private fps = DefaultFps;
    private mode: PlayMode = "loop";

    constructor(frameCount: number) {
        this.count = Math.max(1, Math.floor(frameCount));
    }

    get Frame(): number {
        return this.frame;
    }
    get Playing(): boolean {
        return this.playing;
    }
    get Fps(): number {
        return this.fps;
    }
    get Mode(): PlayMode {
        return this.mode;
    }
    get FrameCount(): number {
        return this.count;
    }

    SetFps(fps: number): void {
        this.fps = Math.max(MinFps, Math.min(MaxFps, fps || DefaultFps));
    }

    SetMode(mode: PlayMode): void {
        this.mode = mode;
        this.direction = 1;
    }

    /** Frames were added or removed: stay where we are, within the new range. */
    SetFrameCount(count: number): void {
        this.count = Math.max(1, Math.floor(count));
        if (this.frame >= this.count) {
            this.frame = this.count - 1;
        }
    }

    /** Jumps to a frame (clamped) and starts the next one's timer afresh. */
    Seek(frame: number): void {
        this.frame = Math.max(0, Math.min(this.count - 1, Math.floor(frame)));
        this.elapsed = 0;
        this.direction = 1;
    }

    /** Starts playing; from the last frame in "once" mode it starts over. */
    Play(): void {
        if (this.mode === "once" && this.frame >= this.count - 1) {
            this.Seek(0);
        }
        this.playing = true;
        this.elapsed = 0;
    }

    Pause(): void {
        this.playing = false;
    }

    Toggle(): void {
        if (this.playing) {
            this.Pause();
        } else {
            this.Play();
        }
    }

    /** Stops and goes back to the first frame. */
    Stop(): void {
        this.playing = false;
        this.Seek(0);
    }

    /** Moves time on by `ms`; returns true if the frame changed. */
    Advance(ms: number): boolean {
        if (!this.playing || this.count < 2 || !(ms > 0)) {
            return false;
        }
        this.elapsed += Math.min(ms, MaxStepMs);
        const perFrame = 1000 / this.fps;
        const before = this.frame;
        while (this.elapsed >= perFrame && this.playing) {
            this.elapsed -= perFrame;
            this.Step();
        }
        return this.frame !== before;
    }

    private Step(): void {
        const last = this.count - 1;
        switch (this.mode) {
            case "loop":
                this.frame = this.frame >= last ? 0 : this.frame + 1;
                break;
            case "pingpong":
                if (this.frame + this.direction > last || this.frame + this.direction < 0) {
                    this.direction = -this.direction;
                }
                this.frame += this.direction;
                break;
            case "once":
                this.frame = Math.min(last, this.frame + 1);
                if (this.frame >= last) {
                    this.playing = false;
                    this.elapsed = 0;
                }
                break;
        }
    }
}
