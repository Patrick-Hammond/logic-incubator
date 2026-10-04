/**
 * The frames: a strip of thumbnails to pick, reorder (drag one onto another) and edit the list of - add, duplicate, delete,
 * move, reverse - with the onion skin switch, and the playback controls beside it: play, pause, stop, speed, loop / ping-pong /
 * once, and a preview that plays the animation on its own while you keep editing.
 */

import { Bitmap } from "../Bitmap";
import { Rgba } from "../Colour";
import { MaxFps, MinFps, PlayMode, Playback } from "../Playback";
import { MaxFrames, SpriteDocument, ToRgba } from "../SpriteDocument";
import { ToolController } from "../ToolController";
import { ButtonEl, El } from "../../ui/dom/Dom";
import { DrawChecker } from "./CanvasView";
import { Icon } from "./Icons";

const ThumbSize = 64;
const PreviewSize = 128;

type Item = { el: HTMLElement; canvas: HTMLCanvasElement; bitmap: Bitmap | null; palette: ReadonlyArray<Rgba> | null; label: HTMLElement };

export type TimelineHooks = {
    /** The onion skin switch was changed. */
    OnionChanged(enabled: boolean): void;
};

/** Draws a frame, scaled by whole numbers if it can be, over a checkerboard, into a canvas. */
function DrawFrame(canvas: HTMLCanvasElement, bitmap: Bitmap, palette: ReadonlyArray<Rgba>, box: number): void {
    const scale = Math.max(bitmap.width, bitmap.height) <= box ? Math.floor(box / Math.max(bitmap.width, bitmap.height)) : box / Math.max(bitmap.width, bitmap.height);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    DrawChecker(ctx, 0, 0, w, h, 6);
    const source = document.createElement("canvas");
    source.width = bitmap.width;
    source.height = bitmap.height;
    const sctx = source.getContext("2d");
    const image = sctx.createImageData(bitmap.width, bitmap.height);
    image.data.set(ToRgba(palette, bitmap));
    sctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, w, h);
}

export default class Timeline {
    readonly el: HTMLElement;
    private strip: HTMLElement;
    private items: Item[] = [];
    private playButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private onionButton: HTMLButtonElement;
    private fps: HTMLInputElement;
    private mode: HTMLSelectElement;
    private preview: HTMLCanvasElement;
    private previewLabel: HTMLElement;
    private actions: { [name: string]: HTMLButtonElement } = {};
    private previewPalette: Rgba[] | null = null;
    private raf = 0;
    private last = 0;
    private unsubscribe: () => void;

    constructor(private doc: SpriteDocument, private tool: ToolController, private playback: Playback, private hooks: TimelineHooks) {
        this.el = El("div", "se-timeline");

        const controls = this.el.appendChild(El("div", "se-frame-controls"));
        const add = (name: string, icon: string, title: string, run: () => void) => {
            const button = controls.appendChild(ButtonEl("se-tool se-small", undefined, title));
            button.appendChild(Icon(icon));
            button.addEventListener("click", () => {
                this.tool.Flush();
                run();
            });
            this.actions[name] = button;
        };
        add("add", "plus", "New blank frame after this one", () => this.doc.AddFrame(false));
        add("duplicate", "duplicate", "Duplicate this frame", () => this.doc.AddFrame(true));
        add("delete", "minus", "Delete this frame", () => this.doc.RemoveFrame());
        add("left", "left", "Move this frame earlier", () => this.doc.MoveFrame(this.doc.FrameIndex, this.doc.FrameIndex - 1));
        add("right", "right", "Move this frame later", () => this.doc.MoveFrame(this.doc.FrameIndex, this.doc.FrameIndex + 1));
        add("reverse", "reverse", "Reverse the order of the frames", () => this.doc.ReverseFrames());
        this.onionButton = controls.appendChild(ButtonEl("se-tool se-small", undefined, "Onion skin: show the neighbouring frames faintly under this one"));
        this.onionButton.appendChild(Icon("onion"));
        this.onionButton.setAttribute("aria-pressed", "false");
        this.onionButton.addEventListener("click", () => {
            const on = this.onionButton.getAttribute("aria-pressed") !== "true";
            this.onionButton.setAttribute("aria-pressed", String(on));
            this.hooks.OnionChanged(on);
        });

        this.strip = this.el.appendChild(El("div", "se-strip ed-scroll"));
        this.strip.setAttribute("role", "listbox");
        this.strip.setAttribute("aria-label", "Frames");

        const play = this.el.appendChild(El("div", "se-playback"));
        const transport = play.appendChild(El("div", "se-transport"));
        this.playButton = transport.appendChild(ButtonEl("se-tool se-small", undefined, "Play / pause (Enter)"));
        this.stopButton = transport.appendChild(ButtonEl("se-tool se-small", undefined, "Stop and go back to the first frame"));
        this.stopButton.appendChild(Icon("stop"));
        this.playButton.addEventListener("click", () => this.TogglePlay());
        this.stopButton.addEventListener("click", () => this.Stop());

        const speed = transport.appendChild(El("label", "se-speed"));
        speed.appendChild(El("span", "", "fps"));
        this.fps = speed.appendChild(document.createElement("input"));
        this.fps.type = "number";
        this.fps.min = String(MinFps);
        this.fps.max = String(MaxFps);
        this.fps.value = String(playback.Fps);
        this.fps.setAttribute("aria-label", "Playback speed in frames per second");
        this.fps.addEventListener("input", () => {
            const n = Number(this.fps.value);
            if (this.fps.value !== "" && Number.isFinite(n)) {
                this.playback.SetFps(n);
            }
        });
        this.fps.addEventListener("change", () => (this.fps.value = String(this.playback.Fps)));

        this.mode = transport.appendChild(document.createElement("select"));
        this.mode.className = "se-select";
        this.mode.setAttribute("aria-label", "Playback mode");
        ([["loop", "Loop"], ["pingpong", "Ping-pong"], ["once", "Once"]] as Array<[PlayMode, string]>).forEach(([value, label]) => this.mode.appendChild(new Option(label, value)));
        this.mode.addEventListener("change", () => this.playback.SetMode(this.mode.value as PlayMode));

        const box = play.appendChild(El("div", "se-preview-box"));
        this.preview = box.appendChild(document.createElement("canvas"));
        this.preview.className = "se-preview";
        this.previewLabel = box.appendChild(El("div", "se-preview-label"));

        this.unsubscribe = doc.Subscribe(() => this.Sync());
        this.Sync();
    }

    /** Shows the onion skin switch as on or off (the editor's View menu can change it too). */
    SetOnion(enabled: boolean): void {
        this.onionButton.setAttribute("aria-pressed", String(enabled));
    }

    // ------------------------------------------------------------------------------------------ playback

    get Playing(): boolean {
        return this.playback.Playing;
    }

    TogglePlay(): void {
        if (this.playback.Playing) {
            this.Pause();
        } else {
            this.Play();
        }
    }

    Play(): void {
        if (this.doc.FrameCount < 2) {
            return;
        }
        this.playback.Play();
        this.last = 0;
        this.raf = requestAnimationFrame(this.Tick);
        this.ShowTransport();
    }

    Pause(): void {
        this.playback.Pause();
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.ShowTransport();
    }

    Stop(): void {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.playback.Stop();
        this.ShowTransport();
        this.DrawPreview();
        this.MarkPlaying();
    }

    private Tick = (time: number): void => {
        if (!this.playback.Playing) {
            return;
        }
        const dt = this.last ? time - this.last : 0;
        this.last = time;
        if (this.playback.Advance(dt)) {
            this.DrawPreview();
            this.MarkPlaying();
        }
        if (!this.playback.Playing) {
            // "Once" reached the end.
            this.ShowTransport();
            return;
        }
        this.raf = requestAnimationFrame(this.Tick);
    };

    /** Shows these colours instead of the sprite's own (the mixer's preview); null goes back. */
    SetPreviewPalette(palette: Rgba[] | null): void {
        this.previewPalette = palette;
        this.items.forEach(item => (item.palette = null));
        this.Sync();
    }

    // ------------------------------------------------------------------------------------------ drawing

    /** Shows the document: a thumbnail per frame (redrawn only if it changed), the selection, the buttons, the preview. */
    Sync(): void {
        const frames = this.doc.Frames;
        const palette = this.previewPalette || this.doc.Palette;
        while (this.items.length > frames.length) {
            this.items.pop().el.remove();
        }
        while (this.items.length < frames.length) {
            this.items.push(this.AddItem(this.items.length));
        }
        this.items.forEach((item, i) => {
            if (item.bitmap !== frames[i] || item.palette !== palette) {
                DrawFrame(item.canvas, frames[i], palette, ThumbSize);
                item.bitmap = frames[i];
                item.palette = palette;
            }
            item.el.setAttribute("aria-selected", String(i === this.doc.FrameIndex));
        });
        this.playback.SetFrameCount(frames.length);
        const count = frames.length;
        const index = this.doc.FrameIndex;
        this.actions.add.disabled = count >= MaxFrames;
        this.actions.duplicate.disabled = count >= MaxFrames;
        this.actions.delete.disabled = count <= 1;
        this.actions.left.disabled = index <= 0;
        this.actions.right.disabled = index >= count - 1;
        this.actions.reverse.disabled = count < 2;
        this.playButton.disabled = count < 2;
        this.stopButton.disabled = count < 2;
        if (count < 2 && this.playback.Playing) {
            this.Pause();
        }
        this.ShowTransport();
        this.DrawPreview();
        this.MarkPlaying();
        const selected = this.items[index];
        if (selected && selected.el.scrollIntoView) {
            selected.el.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    }

    private AddItem(index: number): Item {
        const el = this.strip.appendChild(El("div", "se-frame"));
        el.setAttribute("role", "option");
        el.draggable = true;
        const canvas = el.appendChild(document.createElement("canvas"));
        const label = el.appendChild(El("span", "se-frame-no"));
        label.textContent = String(index + 1);
        el.addEventListener("click", () => {
            this.tool.Flush();
            this.doc.SetFrameIndex(this.items.indexOf(item));
        });
        el.addEventListener("dragstart", e => {
            e.dataTransfer.setData("text/plain", String(this.items.indexOf(item)));
            e.dataTransfer.effectAllowed = "move";
        });
        el.addEventListener("dragover", e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            el.classList.add("is-drop");
        });
        el.addEventListener("dragleave", () => el.classList.remove("is-drop"));
        el.addEventListener("drop", e => {
            e.preventDefault();
            el.classList.remove("is-drop");
            const from = Number(e.dataTransfer.getData("text/plain"));
            if (Number.isFinite(from)) {
                this.tool.Flush();
                this.doc.MoveFrame(from, this.items.indexOf(item));
            }
        });
        const item: Item = { el, canvas, bitmap: null, palette: null, label };
        return item;
    }

    private ShowTransport(): void {
        const playing = this.playback.Playing;
        this.playButton.textContent = "";
        this.playButton.appendChild(Icon(playing ? "pause" : "play"));
        this.playButton.setAttribute("aria-pressed", String(playing));
    }

    /** Outlines the frame the preview is on while it plays (the selected frame has its own highlight). */
    private MarkPlaying(): void {
        const playing = this.playback.Playing || this.playback.Frame !== 0;
        this.items.forEach((item, i) => item.el.classList.toggle("is-playing", playing && i === this.playback.Frame));
    }

    private DrawPreview(): void {
        const frame = Math.min(this.playback.Frame, this.doc.FrameCount - 1);
        const bitmap = this.doc.Frames[frame];
        DrawFrame(this.preview, bitmap, this.previewPalette || this.doc.Palette, PreviewSize);
        this.previewLabel.textContent = this.doc.FrameCount > 1 ? `Frame ${frame + 1} of ${this.doc.FrameCount}` : "1 frame";
    }

    Destroy(): void {
        cancelAnimationFrame(this.raf);
        this.unsubscribe();
        this.el.remove();
    }
}
