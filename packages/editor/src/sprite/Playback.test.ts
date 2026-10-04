import { describe, expect, it } from "vitest";
import { DefaultFps, MaxFps, MinFps, Playback } from "./Playback";

/** Plays for `steps` frame-times and records the frame after each. */
function Run(playback: Playback, steps: number): number[] {
    const perFrame = 1000 / playback.Fps;
    const seen: number[] = [];
    for (let i = 0; i < steps; i++) {
        playback.Advance(perFrame);
        seen.push(playback.Frame);
    }
    return seen;
}

describe("Playback", () => {
    it("starts stopped on frame 0, and ignores time until played", () => {
        const p = new Playback(4);
        expect(p.Playing).toBe(false);
        expect(p.Frame).toBe(0);
        expect(p.Advance(5000)).toBe(false);
        expect(p.Frame).toBe(0);
    });

    it("loops: one frame per frame-time, wrapping at the end", () => {
        const p = new Playback(3);
        p.Play();
        expect(Run(p, 7)).toEqual([1, 2, 0, 1, 2, 0, 1]);
    });

    it("plays at the speed it's given", () => {
        const p = new Playback(10);
        p.SetFps(10);
        p.Play();
        expect(p.Advance(99)).toBe(false);
        expect(p.Advance(1)).toBe(true);
        expect(p.Frame).toBe(1);
        p.SetFps(20);
        p.Advance(49);
        expect(p.Frame).toBe(1);
        p.Advance(1);
        expect(p.Frame).toBe(2);
    });

    it("steps several frames when a long tick covers them", () => {
        const p = new Playback(10);
        p.SetFps(20);
        p.Play();
        expect(p.Advance(200)).toBe(true);
        expect(p.Frame).toBe(4);
    });

    it("doesn't fast-forward after a very long pause between ticks", () => {
        const p = new Playback(100);
        p.SetFps(10);
        p.Play();
        p.Advance(60000);
        expect(p.Frame).toBeLessThanOrEqual(3);
    });

    it("keeps leftover time between ticks", () => {
        const p = new Playback(10);
        p.SetFps(10);
        p.Play();
        for (let i = 0; i < 10; i++) p.Advance(30);
        expect(p.Frame).toBe(3);
    });

    it("pingpongs without repeating the end frames", () => {
        const p = new Playback(4);
        p.SetMode("pingpong");
        p.Play();
        expect(Run(p, 10)).toEqual([1, 2, 3, 2, 1, 0, 1, 2, 3, 2]);
    });

    it("plays once and stops on the last frame, then starts over from there", () => {
        const p = new Playback(3);
        p.SetMode("once");
        p.Play();
        expect(Run(p, 4)).toEqual([1, 2, 2, 2]);
        expect(p.Playing).toBe(false);
        p.Play();
        expect(p.Frame).toBe(0);
        expect(p.Playing).toBe(true);
    });

    it("never moves a one-frame sprite", () => {
        const p = new Playback(1);
        p.Play();
        expect(p.Advance(1000)).toBe(false);
        expect(p.Frame).toBe(0);
    });

    it("pauses where it is, and toggles", () => {
        const p = new Playback(5);
        p.Play();
        Run(p, 2);
        p.Pause();
        const at = p.Frame;
        p.Advance(5000);
        expect(p.Frame).toBe(at);
        p.Toggle();
        expect(p.Playing).toBe(true);
        p.Toggle();
        expect(p.Playing).toBe(false);
    });

    it("stops back at the start", () => {
        const p = new Playback(5);
        p.Play();
        Run(p, 3);
        p.Stop();
        expect(p.Frame).toBe(0);
        expect(p.Playing).toBe(false);
    });

    it("seeks within range and restarts the timer", () => {
        const p = new Playback(4);
        p.SetFps(10);
        p.Play();
        p.Advance(90);
        p.Seek(2);
        expect(p.Frame).toBe(2);
        p.Advance(50);
        expect(p.Frame).toBe(2);
        p.Seek(99);
        expect(p.Frame).toBe(3);
        p.Seek(-5);
        expect(p.Frame).toBe(0);
    });

    it("copes when frames are removed mid-play, and when they're added", () => {
        const p = new Playback(6);
        p.Play();
        p.Seek(5);
        p.SetFrameCount(3);
        expect(p.Frame).toBe(2);
        p.SetFrameCount(8);
        expect(p.Frame).toBe(2);
        expect(p.FrameCount).toBe(8);
        p.SetFrameCount(0);
        expect(p.FrameCount).toBe(1);
        expect(p.Frame).toBe(0);
    });

    it("keeps the speed within the sliders' range, and falls back to the default for nonsense", () => {
        const p = new Playback(2);
        p.SetFps(1000);
        expect(p.Fps).toBe(MaxFps);
        p.SetFps(0.1);
        expect(p.Fps).toBe(MinFps);
        p.SetFps(NaN);
        expect(p.Fps).toBe(DefaultFps);
    });

    it("starts a changed mode forwards", () => {
        const p = new Playback(4);
        p.SetMode("pingpong");
        p.Play();
        Run(p, 5);
        p.SetMode("loop");
        const at = p.Frame;
        Run(p, 1);
        expect(p.Frame).toBe((at + 1) % 4);
    });
});
