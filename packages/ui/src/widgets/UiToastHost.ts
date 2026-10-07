import { Container } from "pixi.js";
import { ToastSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import NineSlice from "./NineSlice";
import ToastQueue, { ToastOpacity } from "./ToastQueue";
import { WrapText } from "./Typewriter";
import { CreateMeasure, CreateText } from "./UiText";

export type ToastRequest = {
    title: string;
    text?: string;
    /** One of the skin's toast kinds (`good`, `bad`); the first by default. */
    kind?: string;
    /** How long it stays (seconds); the skin's by default; 0 or less stays until it is pressed. */
    seconds?: number;
};

type ToastView = { request: ToastRequest; view: Container; height: number };

const FADE_MS = 220;

/**
 * Where toast notifications appear: a column of small framed notes at its origin, newest at the bottom, each sliding in and fading out. `Push` adds one (the rest wait if
 * `max` are showing); pressing a toast dismisses it. Drive it with `Update(ms)` (`UiSystem.Track` does). `HostWidth` is the toasts' width.
 */
export default class UiToastHost extends Container {
    private readonly skin: ToastSkin;
    private readonly queue: ToastQueue<ToastView>;
    private readonly measure: (text: string) => number;
    private readonly views = new Map<number, ToastView>();

    constructor(private readonly theme: UiTheme, variant: string, max = 4) {
        super();
        const skin = theme.skin.toasts && theme.skin.toasts[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no toasts "${variant}".`);
        }
        this.skin = skin;
        this.queue = new ToastQueue<ToastView>({ showMs: skin.seconds * 1000, fadeMs: FADE_MS, max });
        this.measure = CreateMeasure(theme, skin.textFont);
    }

    get HostWidth(): number {
        return this.skin.width;
    }

    /** Adds a toast; returns what dismisses it. */
    Push(request: ToastRequest): () => void {
        const toast = this.Build(request);
        const id = this.queue.Push(toast, request.seconds === undefined ? undefined : request.seconds * 1000);
        this.views.set(id, toast);
        toast.view.on("pointerdown", () => this.Dismiss(id));
        this.Layout();
        return () => this.Dismiss(id);
    }

    private Dismiss(id: number): void {
        const toast = this.views.get(id);
        // One still waiting its turn is dropped and was never drawn; one showing fades out and is cleaned up when it has gone.
        if (this.queue.Dismiss(id) && toast && !toast.view.parent) {
            toast.view.destroy({ children: true });
            this.views.delete(id);
        }
    }

    /** How many are showing or waiting. */
    get Count(): number {
        return this.queue.Active.length + this.queue.Waiting;
    }

    Update(ms: number): void {
        this.queue.Update(ms).forEach(toast => {
            toast.view.destroy({ children: true });
            this.views.forEach((v, id) => {
                if (v === toast) this.views.delete(id);
            });
        });
        this.Layout();
    }

    private Layout(): void {
        let y = 0;
        this.queue.Active.forEach(active => {
            const { view, height } = active.item;
            if (view.parent !== this) this.addChild(view);
            const shown = ToastOpacity(active.phase, active.progress);
            view.alpha = shown;
            // Slides in from the right as it appears and drifts back the way as it leaves.
            view.position.set(Math.round((1 - shown) * this.theme.Metric("slide", 24)), y);
            y += height + this.skin.gap;
        });
    }

    private Build(request: ToastRequest): ToastView {
        const kinds = this.skin.kinds;
        const kind = kinds[request.kind || Object.keys(kinds)[0]];
        if (!kind) {
            throw new Error(`The "${this.theme.skin.name}" skin has no toast kind "${request.kind}".`);
        }
        const pad = this.skin.padding;
        const inner = this.skin.width - pad.left - pad.right;
        const view = new Container();
        const title = CreateText(this.theme, request.title, { font: this.skin.titleFont, colour: kind.titleColour });
        title.position.set(pad.left, pad.top);
        let y = pad.top + Math.ceil(title.textHeight);
        const parts: Container[] = [title];
        if (request.text) {
            const text = CreateText(this.theme, WrapText(request.text, inner, this.measure), { font: this.skin.textFont, colour: this.skin.textColour });
            const gap = this.theme.Metric("lineGap", 4);
            text.position.set(pad.left, y + gap);
            y += gap + Math.ceil(text.textHeight);
            parts.push(text);
        }
        const height = y + pad.bottom;
        view.addChild(new NineSlice(this.theme.Texture(kind.frame.frame), kind.frame, this.skin.width, height), ...parts);
        view.interactive = true;
        view.buttonMode = true;
        return { request, view, height };
    }
}
