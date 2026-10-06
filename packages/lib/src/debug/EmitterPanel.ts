import { Texture } from "pixi.js";
import type { Cancel } from "../game/Timing";
import AssetFactory from "../loading/AssetFactory";
import type { Emitter } from "../particles";
import { ApplyEmitterConfig } from "./ApplyEmitterConfig";
import { CloneConfig, DefaultKillRect, EmitterConfigData, EmitterConfigModel, EmitterSections, Field, ParseEmitterConfig, Row } from "./EmitterConfigModel";
import { EmitterOverlay, OverlayColours } from "./EmitterOverlay";

export interface EmitterPanelOptions {
    /** Name in the panel's list of emitters. Default `Emitter 1`, `Emitter 2`... */
    label?: string;
    /** The config to start from. Default: the one the (first) emitter was set up with. */
    config?: EmitterConfigData;
    /** The size of the game's screen, which a new kill area starts around (`DebugTools` supplies it). Default 1280 x 720. */
    screen?: { width: number; height: number };
}

/** The emitters that one set of settings drives - one emitter, or several that were made from the same config. */
interface Group {
    label: string;
    emitters: Emitter[];
    model: EmitterConfigModel;
    /** The textures the particles use; undefined while each emitter still has its own. */
    art: any;
    artName: string;
}

const NoOp: Cancel = () => undefined;
const ApplyDelayMs = 120;
const MinWidth = 340;
/** How see-through the panel is while it is minimised - until the pointer is over it. */
const CollapsedAlpha = 0.3;

/** How wide the panel is, kept for the next time it opens in this session. */
let panelWidth = 460;

/** The one panel on the page, if it is open. */
let panel: EmitterPanel | undefined;

/**
 * Opens (or adds to) the emitter debug panel for `target`: a side panel with the emitter's settings as controls - changes show
 * at once - a picker for the particle image, and the config as JSON to copy out. Several emitters made from one config
 * (`target` an array) share one set of controls. Returns a function that takes it out of the panel again.
 */
export function OpenEmitterPanel(target: Emitter | Emitter[], options: EmitterPanelOptions = {}): Cancel {
    const emitters = Array.isArray(target) ? target.slice() : [target];
    const config = options.config || (emitters[0] && emitters[0].originalConfig);
    if (!emitters.length || !config) {
        console.warn("this.debug.Emitter needs an emitter that has been set up with a config.");
        return NoOp;
    }
    if (!panel) {
        panel = new EmitterPanel();
    }
    const group: Group = {
        label: options.label || `Emitter ${panel.GroupCount + 1}`,
        emitters,
        model: new EmitterConfigModel(config, { killRect: DefaultKillRect(options.screen) }),
        art: undefined,
        artName: "(as the emitter has it)",
    };
    return panel.Add(group);
}

function El<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

function Button(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = El("button", "emdbg-button", text);
    button.type = "button";
    button.title = title;
    button.addEventListener("click", onClick);
    return button;
}

class EmitterPanel {
    private groups: Group[] = [];
    private current!: Group;
    private rows: { row: Row; element: HTMLElement; note: HTMLElement }[] = [];
    private controls: { field: Field; sync: () => void }[] = [];
    private applyTimer: number | undefined;
    /** Draws the spawn shape, spawn point and kill area over the game. */
    private overlay = new EmitterOverlay();
    private frame = 0;

    private root = El("div", "emdbg");
    private groupSelect = El("select", "emdbg-select");
    private modified = El("span", "emdbg-modified", "");
    private body = El("div", "emdbg-body");
    private status = El("div", "emdbg-status");
    private preview = El("canvas", "emdbg-preview");
    private artLabel = El("div", "emdbg-art-name");

    constructor() {
        this.InjectStyles();

        const header = El("div", "emdbg-head");
        header.appendChild(El("span", "emdbg-title", "Emitter debug"));
        header.appendChild(this.modified);
        this.groupSelect.addEventListener("change", () => this.Show(this.groups[this.groupSelect.selectedIndex]));
        header.appendChild(this.groupSelect);
        const collapse = Button("–", "Collapse or expand the panel", () => this.root.classList.toggle("collapsed"));
        header.appendChild(collapse);
        header.appendChild(Button("×", "Close the panel", () => this.Destroy()));

        this.root.appendChild(this.BuildGrip());
        this.root.appendChild(header);
        this.root.appendChild(this.body);
        this.root.appendChild(this.status);
        this.SetWidth(panelWidth);

        // The game reads the keyboard from the document: what is typed into a control here mustn't move the player.
        ["keydown", "keyup", "keypress"].forEach(type => this.root.addEventListener(type, event => event.stopPropagation()));

        document.body.appendChild(this.root);

        // The outlines follow their emitters' containers, which can move: redrawn every frame the page draws.
        const redraw = () => {
            this.overlay.Update();
            this.frame = window.requestAnimationFrame(redraw);
        };
        this.frame = window.requestAnimationFrame(redraw);
    }

    get GroupCount(): number {
        return this.groups.length;
    }

    /** The strip on the panel's left edge that is dragged to make the panel wider or narrower. */
    private BuildGrip(): HTMLElement {
        const grip = El("div", "emdbg-grip");
        grip.title = "Drag to resize";
        let dragging = false;
        grip.addEventListener("pointerdown", event => {
            dragging = true;
            grip.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        grip.addEventListener("pointermove", event => {
            if (dragging) {
                this.SetWidth(window.innerWidth - event.clientX, true);
            }
        });
        const stop = (event: PointerEvent) => {
            dragging = false;
            if (grip.hasPointerCapture(event.pointerId)) {
                grip.releasePointerCapture(event.pointerId);
            }
        };
        grip.addEventListener("pointerup", stop);
        grip.addEventListener("pointercancel", stop);
        return grip;
    }

    /**
     * Sets the panel's width in pixels, kept between a readable minimum and most of the window. `remember` keeps it as the width the panel
     * opens at next time - only for a width the user chose by dragging: a narrow window that merely limits it must not become the preference.
     */
    private SetWidth(width: number, remember = false): void {
        const clamped = Math.round(Math.max(MinWidth, Math.min(width, window.innerWidth * 0.94)));
        this.root.style.width = `${clamped}px`;
        if (remember) {
            panelWidth = clamped;
        }
    }

    /** Adds `group` to the panel and shows it. Returns what takes it out again; the last one out closes the panel. */
    Add(group: Group): Cancel {
        this.groups.push(group);
        this.RefreshGroupList();
        this.Show(group);
        return () => {
            const index = this.groups.indexOf(group);
            if (index < 0) {
                return;
            }
            this.groups.splice(index, 1);
            if (!this.groups.length) {
                this.Destroy();
                return;
            }
            this.RefreshGroupList();
            if (this.current === group) {
                this.Show(this.groups[Math.max(0, index - 1)]);
            }
        };
    }

    Destroy(): void {
        window.clearTimeout(this.applyTimer);
        window.cancelAnimationFrame(this.frame);
        this.overlay.Destroy();
        if (this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        const style = document.getElementById("emdbg-style");
        if (style && style.parentNode) {
            style.parentNode.removeChild(style);
        }
        this.groups = [];
        if (panel === this) {
            panel = undefined;
        }
    }

    private RefreshGroupList(): void {
        this.groupSelect.innerHTML = "";
        this.groups.forEach(group => {
            const option = El("option", "", group.emitters.length > 1 ? `${group.label} (${group.emitters.length})` : group.label);
            this.groupSelect.appendChild(option);
        });
        this.groupSelect.style.display = this.groups.length > 1 ? "" : "none";
        this.groupSelect.selectedIndex = Math.max(0, this.groups.indexOf(this.current));
    }

    private Show(group: Group): void {
        window.clearTimeout(this.applyTimer);
        this.current = group;
        this.groupSelect.selectedIndex = this.groups.indexOf(group);
        this.overlay.Show(group.emitters, () => group.model.Config);
        this.Render();
    }

    // ---- building the controls ---------------------------------------------------------------------------------------------

    private Render(): void {
        const group = this.current;
        this.body.innerHTML = "";
        this.rows = [];
        this.controls = [];

        this.body.appendChild(this.BuildActions(group));
        this.body.appendChild(this.BuildOutlineRow());
        this.body.appendChild(this.BuildArt(group));
        EmitterSections().forEach(section => {
            this.body.appendChild(El("h4", "", section.title));
            section.rows.forEach(row => this.body.appendChild(this.BuildRow(group, row)));
        });
        this.UpdateRows();
        this.UpdateModified();
        this.SetStatus("Changes apply at once. Copy JSON when it looks right.");
    }

    /** The switch for the outlines drawn over the game, and what their colours mean. */
    private BuildOutlineRow(): HTMLElement {
        const bar = El("div", "emdbg-outlines");

        const show = El("input");
        show.type = "checkbox";
        show.checked = this.overlay.enabled;
        show.addEventListener("change", () => {
            this.overlay.enabled = show.checked;
            this.overlay.Update();
        });
        const label = El("label", "emdbg-check-label");
        label.appendChild(show);
        label.appendChild(document.createTextNode(" Outlines"));
        bar.appendChild(label);

        const key = (colour: number, text: string) => {
            const item = El("span", "emdbg-key");
            const swatch = El("span", "emdbg-swatch");
            swatch.style.background = `#${("000000" + colour.toString(16)).slice(-6)}`;
            item.appendChild(swatch);
            item.appendChild(document.createTextNode(text));
            return item;
        };
        bar.appendChild(key(OverlayColours.kill, "kill area"));
        bar.appendChild(key(OverlayColours.spawn, "spawn shape"));
        bar.appendChild(key(OverlayColours.point, "spawn point"));
        return bar;
    }

    private BuildActions(group: Group): HTMLElement {
        const bar = El("div", "emdbg-actions");

        const emitting = El("input");
        emitting.type = "checkbox";
        emitting.checked = group.emitters[0].emit;
        emitting.addEventListener("change", () => group.emitters.forEach(emitter => (emitter.emit = emitting.checked)));
        const emittingLabel = El("label", "emdbg-check-label");
        emittingLabel.appendChild(emitting);
        emittingLabel.appendChild(document.createTextNode(" Emitting"));
        bar.appendChild(emittingLabel);

        bar.appendChild(Button("Restart", "Set the emitter up again from these settings, ending its live particles", () => this.ApplyNow()));
        bar.appendChild(Button("Copy JSON", "Copy the settings as the editor's JSON", () => this.CopyJson()));
        bar.appendChild(Button("Download", "Save the settings as a .json file", () => this.DownloadJson()));
        bar.appendChild(Button("Load", "Load settings from a .json file", () => this.LoadJson()));
        bar.appendChild(Button("Reset", "Go back to the settings the panel opened with", () => {
            group.model.Reset();
            this.Render();
            this.ApplyNow();
        }));
        return bar;
    }

    private BuildArt(group: Group): HTMLElement {
        const wrap = El("div", "emdbg-art");
        wrap.appendChild(El("h4", "", "Particle image"));

        const line = El("div", "emdbg-art-line");
        this.preview.width = 48;
        this.preview.height = 48;
        line.appendChild(this.preview);

        const column = El("div", "emdbg-art-column");
        column.appendChild(this.artLabel);

        const names = El("datalist");
        names.id = "emdbg-art-names";
        const factory = AssetFactory.inst;
        factory.SpriteNames.concat(factory.AnimationNames).forEach(name => {
            const option = El("option");
            option.value = name;
            names.appendChild(option);
        });
        const input = El("input", "emdbg-text");
        input.type = "text";
        input.placeholder = "sprite or animation name";
        input.setAttribute("list", names.id);
        input.addEventListener("change", () => {
            const name = input.value.trim();
            if (!name) {
                return;
            }
            if (!factory.Has(name)) {
                this.SetStatus(`There is no sprite or animation called "${name}".`, true);
                return;
            }
            this.SetArt(group, factory.CreateTextures(name), name);
        });
        column.appendChild(input);
        column.appendChild(names);

        const upload = El("input");
        upload.type = "file";
        upload.accept = "image/*";
        upload.style.display = "none";
        upload.addEventListener("change", () => this.UseUploadedImage(group, upload));
        column.appendChild(upload);
        column.appendChild(Button("Upload an image…", "Use a picture from your computer (this session only)", () => upload.click()));

        line.appendChild(column);
        wrap.appendChild(line);
        this.ShowArt(group);
        return wrap;
    }

    private BuildRow(group: Group, row: Row): HTMLElement {
        const element = El("div", "emdbg-row");
        const label = El("div", "emdbg-label", row.label);
        label.title = row.help; // what it does, on hover
        element.appendChild(label);

        const controls = El("div", "emdbg-controls");
        row.fields.forEach(field => controls.appendChild(this.BuildControl(group, field)));
        element.appendChild(controls);

        const note = El("div", "emdbg-note");
        element.appendChild(note);
        this.rows.push({ row, element, note });
        return element;
    }

    private BuildControl(group: Group, field: Field): HTMLElement {
        const cell = El("label", "emdbg-cell");
        if (field.label) {
            cell.appendChild(El("span", "emdbg-sub", field.label));
        }
        const value = group.model.Read(field);
        const onValue = (next: number | string | boolean) => {
            group.model.Write(field, next);
            this.Changed(field);
        };
        const registerSync = (sync: () => void) => this.controls.push({ field, sync });

        if (field.kind === "select") {
            const select = El("select", "emdbg-select");
            const options = field.options!.slice();
            if (options.indexOf(String(value)) < 0) {
                options.push(String(value)); // a value the panel can't choose, such as polygonalChain, stays as it is
            }
            options.forEach(name => {
                const option = El("option", "", name);
                option.value = name;
                select.appendChild(option);
            });
            select.value = String(value);
            select.addEventListener("change", () => {
                onValue(select.value);
                this.Render(); // the spawn shape decides which rows there are
            });
            cell.appendChild(select);
            registerSync(() => (select.value = String(group.model.Read(field))));
        } else if (field.kind === "check") {
            const box = El("input");
            box.type = "checkbox";
            box.checked = !!value;
            box.addEventListener("change", () => onValue(box.checked));
            cell.appendChild(box);
            registerSync(() => (box.checked = !!group.model.Read(field)));
        } else if (field.kind === "colour") {
            const picker = El("input", "emdbg-colour");
            picker.type = "color";
            picker.value = String(value);
            const hex = El("span", "emdbg-hex", picker.value);
            picker.addEventListener("input", () => {
                hex.textContent = picker.value;
                onValue(picker.value);
            });
            cell.appendChild(picker);
            cell.appendChild(hex);
            registerSync(() => {
                picker.value = String(group.model.Read(field));
                hex.textContent = picker.value;
            });
        } else {
            const input = El("input", field.kind === "slider" ? "emdbg-range" : "emdbg-number");
            input.type = field.kind === "slider" ? "range" : "number";
            if (field.min !== undefined) {
                input.min = String(field.min);
            }
            if (field.max !== undefined) {
                input.max = String(field.max);
            }
            input.step = field.step === undefined ? "any" : String(field.step);
            input.value = String(value);
            const readout = field.kind === "slider" ? El("span", "emdbg-hex", input.value) : undefined;
            input.addEventListener("input", () => {
                const number = parseFloat(input.value);
                if (isNaN(number)) {
                    return;
                }
                if (readout) {
                    readout.textContent = input.value;
                }
                onValue(number);
            });
            input.addEventListener("change", () => {
                if (isNaN(parseFloat(input.value))) {
                    // Left empty (or not a number): the config kept its old value, so show that rather than a blank that looks like none.
                    input.value = String(group.model.Read(field));
                    if (readout) {
                        readout.textContent = input.value;
                    }
                }
            });
            cell.appendChild(input);
            if (readout) {
                cell.appendChild(readout);
            }
            registerSync(() => {
                input.value = String(group.model.Read(field));
                if (readout) {
                    readout.textContent = input.value;
                }
            });
        }
        return cell;
    }

    /** Shows what the config really has in every control but `except`, the one being edited. */
    private SyncControls(except?: Field): void {
        this.controls.forEach(control => {
            if (control.field !== except) {
                control.sync();
            }
        });
    }

    /** Shows or hides each row as the config decides (the spawn shape's own settings), and what each note says. */
    private UpdateRows(): void {
        const config = this.current.model.Config;
        this.rows.forEach(entry => {
            entry.element.style.display = !entry.row.visible || entry.row.visible(config) ? "" : "none";
            entry.note.textContent = (entry.row.note && entry.row.note(config)) || "";
        });
    }

    private UpdateModified(): void {
        this.modified.textContent = this.current.model.Changed ? "● changed" : "";
    }

    // ---- applying ----------------------------------------------------------------------------------------------------------

    /** A control was changed: update what depends on it, and apply to the emitters shortly - not on every step of a drag. */
    private Changed(source?: Field): void {
        // A change can add settings the other controls haven't shown yet (ticking the kill area gives it x, y, w and h), so they all catch up.
        this.SyncControls(source);
        this.UpdateRows();
        this.UpdateModified();
        this.overlay.Update(); // the outlines follow the controls at once, ahead of the emitters' own re-setup below
        window.clearTimeout(this.applyTimer);
        this.applyTimer = window.setTimeout(() => this.ApplyNow(), ApplyDelayMs);
    }

    private ApplyNow(): void {
        window.clearTimeout(this.applyTimer);
        const group = this.current;
        const error = ApplyEmitterConfig(group.emitters, group.model.Config, group.art);
        this.SetStatus(error ? `Not applied: ${error}` : "Applied.", !!error);
        this.overlay.Update();
    }

    // ---- the image ---------------------------------------------------------------------------------------------------------

    private SetArt(group: Group, art: Texture[], name: string): void {
        group.art = art;
        group.artName = name;
        this.ShowArt(group);
        this.ApplyNow();
    }

    /** The current image's name, how many frames it has, and a thumbnail. */
    private ShowArt(group: Group): void {
        const art = group.art !== undefined ? group.art : group.emitters[0].originalArt;
        const textures: Texture[] = (Array.isArray(art) ? art : [art]).filter((item: any) => item instanceof Texture);
        this.artLabel.textContent = `${group.artName}${textures.length > 1 ? ` - ${textures.length} frames, one at random per particle` : ""}`;
        this.DrawPreview(textures[0]);
    }

    private DrawPreview(texture: Texture | undefined): void {
        const context = this.preview.getContext("2d");
        if (!context) {
            return;
        }
        context.clearRect(0, 0, this.preview.width, this.preview.height);
        try {
            const source = texture && (texture.baseTexture.resource as any) && (texture.baseTexture.resource as any).source;
            if (!texture || !source) {
                return;
            }
            const frame = texture.frame;
            const scale = Math.min(this.preview.width / frame.width, this.preview.height / frame.height);
            context.imageSmoothingEnabled = false;
            context.drawImage(source, frame.x, frame.y, frame.width, frame.height,
                (this.preview.width - frame.width * scale) / 2, (this.preview.height - frame.height * scale) / 2, frame.width * scale, frame.height * scale);
        } catch {
            // a thumbnail is a nicety: a texture that can't be drawn just has none
        }
    }

    private UseUploadedImage(group: Group, input: HTMLInputElement): void {
        const file = input.files && input.files[0];
        input.value = "";
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const texture = Texture.from(String(reader.result));
            const use = () => this.SetArt(group, [texture], file.name);
            if (texture.baseTexture.valid) {
                use();
            } else {
                texture.baseTexture.once("loaded", use);
                texture.baseTexture.once("error", () => this.SetStatus(`Could not read "${file.name}" as an image.`, true));
            }
        };
        reader.onerror = () => this.SetStatus(`Could not read "${file.name}".`, true);
        reader.readAsDataURL(file);
    }

    // ---- JSON in and out ---------------------------------------------------------------------------------------------------

    private CopyJson(): void {
        const text = this.current.model.ToJson();
        const done = () => this.SetStatus(`Copied ${text.length} characters of JSON.`);
        const fallback = () => {
            const area = El("textarea");
            area.value = text;
            document.body.appendChild(area);
            area.select();
            let copied: boolean;
            try {
                copied = document.execCommand("copy");
            } catch {
                copied = false;
            }
            document.body.removeChild(area);
            if (copied) {
                done();
            } else {
                this.SetStatus("Could not copy - use Download instead.", true);
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else {
            fallback();
        }
    }

    private DownloadJson(): void {
        const group = this.current;
        const url = URL.createObjectURL(new Blob([group.model.ToJson()], { type: "application/json" }));
        const link = El("a");
        link.href = url;
        link.download = `${group.label.replace(/[^\w.-]+/g, "_") || "emitter"}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.SetStatus(`Saved ${link.download}.`);
    }

    private LoadJson(): void {
        const input = El("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.addEventListener("change", () => {
            const file = input.files && input.files[0];
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const group = this.current;
                const previous = CloneConfig(group.model.Config);
                try {
                    group.model.Load(ParseEmitterConfig(String(reader.result)));
                } catch (error) {
                    this.SetStatus(`${file.name}: ${error instanceof Error ? error.message : error}`, true);
                    return;
                }
                const error = ApplyEmitterConfig(group.emitters, group.model.Config, group.art);
                if (error) {
                    // It parsed but the emitters can't take it: keep what the panel and the emitters had, so they still agree.
                    group.model.Load(previous);
                    this.Render();
                    this.SetStatus(`${file.name}: not applied - ${error}`, true);
                    return;
                }
                this.Render();
                this.SetStatus(`Loaded ${file.name} and applied it.`);
            };
            reader.readAsText(file);
        });
        input.click();
    }

    private SetStatus(text: string, error = false): void {
        this.status.textContent = text;
        this.status.classList.toggle("error", error);
    }

    // ---- look --------------------------------------------------------------------------------------------------------------

    private InjectStyles(): void {
        if (document.getElementById("emdbg-style")) {
            return;
        }
        const style = El("style");
        style.id = "emdbg-style";
        style.textContent = Styles;
        document.head.appendChild(style);
    }
}

const Styles = `
.emdbg { position: fixed; top: 0; right: 0; bottom: 0; width: 460px; max-width: 94vw; z-index: 100000; box-sizing: border-box; display: flex; flex-direction: column;
    background: rgba(30, 30, 34, 0.96); color: #e6e6e6; font: 12px/1.4 Arial, Helvetica, sans-serif; border-left: 1px solid #4a4a50; }
.emdbg { transition: opacity 0.15s; }
.emdbg.collapsed { bottom: auto; width: auto !important; opacity: ${CollapsedAlpha}; border-bottom: 1px solid #4a4a50; }
.emdbg.collapsed:hover { opacity: 1; }
.emdbg.collapsed .emdbg-body, .emdbg.collapsed .emdbg-status { display: none; }
.emdbg * { box-sizing: border-box; }
.emdbg-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid #3a3a40; }
.emdbg-title { font-size: 11px; font-weight: bold; letter-spacing: 0.06em; text-transform: uppercase; color: #d0d0d6; }
.emdbg-modified { flex: 1; color: #ffb454; font-size: 11px; }
.emdbg-body { flex: 1; overflow-y: auto; padding: 0 8px 12px; scrollbar-width: thin; }
.emdbg-status { padding: 5px 8px; border-top: 1px solid #3a3a40; color: #a0a0a8; font-size: 11px; min-height: 24px; }
.emdbg-status.error { color: #ff7b7b; }
.emdbg h4 { margin: 12px 0 4px; padding-bottom: 2px; border-bottom: 1px solid #3a3a40; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #a0a0a8; }
.emdbg-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 8px 0 2px; }
.emdbg-button { padding: 3px 8px; border: 1px solid #55555c; border-radius: 3px; background: #38383e; color: #eee; font: inherit; cursor: pointer; }
.emdbg-button:hover { background: #44444b; }
.emdbg-check-label { margin-right: 6px; color: #d0d0d6; }
.emdbg-outlines { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 4px 0 2px; font-size: 11px; color: #a0a0a8; }
.emdbg-key { display: inline-flex; align-items: center; gap: 4px; }
.emdbg-swatch { display: inline-block; width: 10px; height: 10px; border: 1px solid #000; }
.emdbg-row { display: grid; grid-template-columns: 128px 1fr; column-gap: 8px; align-items: center; padding: 3px 0; }
.emdbg-label { color: #d0d0d6; cursor: help; }
.emdbg-controls { display: flex; flex-wrap: wrap; gap: 4px 8px; min-width: 0; }
.emdbg-cell { display: flex; flex: 1 1 120px; align-items: center; gap: 4px; min-width: 0; }
.emdbg-sub { flex: 0 0 auto; min-width: 16px; color: #8c8c94; font-size: 11px; }
.emdbg-note { grid-column: 2; color: #ffb454; font-size: 10px; }
.emdbg-note:empty { display: none; }
.emdbg input[type=number], .emdbg-text, .emdbg-select { flex: 1; min-width: 56px; padding: 3px 6px; border: 1px solid #55555c; border-radius: 3px; background: #1c1c1f; color: #eee; font: inherit; }
.emdbg-range { flex: 1; min-width: 60px; }
.emdbg-colour { width: 36px; height: 20px; padding: 0; border: 1px solid #55555c; background: none; }
.emdbg-hex { color: #8c8c94; font-size: 10px; }
.emdbg-art-line { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; }
.emdbg-preview { flex: 0 0 auto; width: 48px; height: 48px; border: 1px solid #55555c; background: repeating-conic-gradient(#2a2a2e 0% 25%, #35353a 0% 50%) 50% / 12px 12px; image-rendering: pixelated; }
.emdbg-art-column { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.emdbg-art-name { color: #d0d0d6; word-break: break-word; }
.emdbg-grip { position: absolute; top: 0; bottom: 0; left: -4px; width: 9px; cursor: ew-resize; z-index: 1; }
.emdbg-grip:hover { background: rgba(155, 93, 229, 0.35); }
`;
