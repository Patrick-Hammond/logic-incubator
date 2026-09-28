/**
 * A modal form popup for editing structured values - text, numbers (slider +
 * exact box), colours, toggles and multi-select chip grids - described by a
 * list of `FieldSpec`s rather than hand-built per use.
 *
 * Plain DOM layered over the Pixi canvas rather than Pixi widgets: the browser
 * already gives us focus, text entry, IME, native colour pickers and range
 * sliders, none of which this editor's Pixi UI kit has. Replaces the chains of
 * native `prompt()`s the editor used before, which couldn't show more than one
 * field at a time, validate as you type, or offer anything but free text.
 *
 * Keydowns inside the dialog are stopped from reaching `document`, where the
 * editor's `Keyboard` listens - otherwise typing "s" into a field would save
 * the map and Enter would switch to the game. Keyups are let through so the
 * shared key map never gets stuck with a key held down.
 */

import { El, InjectStyles, InjectTheme } from "../dom/Dom";

export type ChoiceOption = {
    value: string;
    label: string;
    /** Optional picture for the chip - a URL/data URI and the size to draw it at (CSS px). */
    image?: { src: string; width: number; height: number };
};

type FieldBase = { key: string; label: string; hint?: string };

export type NumberField = FieldBase & {
    type: "number";
    /** Hard bounds - typed values are clamped to these on save. */
    min: number;
    max: number;
    step?: number;
    /** Narrower slider span for the common case, when `min`..`max` is too wide to drag precisely. The number box still accepts the full range. */
    sliderMin?: number;
    sliderMax?: number;
    unit?: string;
    /** Shown beside the value when it's 0, for fields where 0 means something special ("unlimited", "always"). */
    zeroLabel?: string;
};
export type TextField = FieldBase & { type: "text"; placeholder?: string };
/** Value is a 0xRRGGBB number, same as Pixi tints. */
export type ColourField = FieldBase & { type: "colour" };
export type ToggleField = FieldBase & { type: "toggle" };
export type MultiChoiceField = FieldBase & { type: "multi-choice"; options: ChoiceOption[] };

export type FieldSpec = NumberField | TextField | ColourField | ToggleField | MultiChoiceField;

export type FormValue = number | string | boolean | string[];
export type FormValues = { [key: string]: FormValue };

export type FormDialogOptions = {
    title: string;
    subtitle?: string;
    fields: FieldSpec[];
    values: FormValues;
    /** Return an error message to disable Save (shown in the footer), or null when the values are acceptable. Re-run on every change. */
    validate?: (values: FormValues) => string | null;
};

let openDialog: HTMLElement | null = null;

export function IsFormDialogOpen(): boolean {
    return openDialog !== null;
}

/** Resolves with the edited values on Save, or `null` if cancelled (Escape, Cancel, or a click outside the panel). */
export function OpenFormDialog(options: FormDialogOptions): Promise<FormValues | null> {
    InjectTheme();
    InjectStyles("fd-styles", STYLES);
    if (openDialog) {
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        const values: FormValues = { ...options.values };
        const overlay = El("div", "fd-overlay");
        const panel = El("div", "fd-panel");
        panel.tabIndex = -1;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        panel.setAttribute("aria-label", options.title);
        overlay.appendChild(panel);

        const header = El("div", "fd-header");
        header.appendChild(El("h2", "fd-title", options.title));
        if (options.subtitle) {
            header.appendChild(El("p", "fd-subtitle", options.subtitle));
        }
        panel.appendChild(header);

        const body = El("div", "fd-body");
        panel.appendChild(body);

        const footer = El("div", "fd-footer");
        const error = El("span", "fd-error");
        const cancelButton = El("button", "ed-button", "Cancel");
        const saveButton = El("button", "ed-button fd-primary", "Save");
        cancelButton.type = saveButton.type = "button";
        footer.append(error, cancelButton, saveButton);
        panel.appendChild(footer);

        const revalidate = () => {
            const message = options.validate ? options.validate(values) : null;
            error.textContent = message || "";
            saveButton.disabled = message != null;
        };
        const onChange = (key: string, value: FormValue) => {
            values[key] = value;
            revalidate();
        };
        options.fields.forEach(field => body.appendChild(BuildField(field, values[field.key], onChange)));

        const close = (result: FormValues | null) => {
            overlay.remove();
            openDialog = null;
            resolve(result);
        };
        const save = () => {
            if (!saveButton.disabled) {
                close(ClampValues(options.fields, values));
            }
        };

        cancelButton.addEventListener("click", () => close(null));
        saveButton.addEventListener("click", save);
        overlay.addEventListener("pointerdown", e => {
            if (e.target === overlay) {
                close(null);
            }
        });
        overlay.addEventListener("keydown", e => {
            e.stopPropagation();
            if (e.key === "Escape") {
                e.preventDefault();
                close(null);
            } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
                // Buttons (chips, Cancel) keep Enter as "press me"; anywhere else it saves.
                e.preventDefault();
                save();
            }
        });
        // The editor disables the context menu on body; the dialog's text fields want it back (paste).
        overlay.addEventListener("contextmenu", e => e.stopPropagation());

        revalidate();
        document.body.appendChild(overlay);
        openDialog = overlay;
        const firstInput = panel.querySelector<HTMLInputElement>("input[type=text], input[type=number]");
        if (firstInput) {
            // Selected, so typing replaces the value rather than appending to it.
            firstInput.focus();
            firstInput.select();
        } else {
            panel.focus();
        }
    });
}

function BuildField(field: FieldSpec, value: FormValue, onChange: (key: string, value: FormValue) => void): HTMLElement {
    const row = El("div", "fd-field fd-" + field.type);
    const id = "fd-" + field.key;
    const label = El("label", "fd-label", field.label);
    label.htmlFor = id;
    row.appendChild(label);

    const control = El("div", "fd-control");
    row.appendChild(control);

    switch (field.type) {
        case "number": {
            const num = typeof value === "number" ? value : field.min;
            const slider = Input("range", id + "-slider");
            slider.min = String(field.sliderMin != null ? field.sliderMin : field.min);
            slider.max = String(field.sliderMax != null ? field.sliderMax : field.max);
            slider.step = String(field.step || 1);
            slider.value = String(num);
            slider.setAttribute("aria-label", field.label);

            const box = Input("number", id);
            box.min = String(field.min);
            box.max = String(field.max);
            box.step = String(field.step || 1);
            box.value = String(num);

            const suffix = El("span", "fd-suffix");
            const updateSuffix = (n: number) => {
                suffix.textContent = n === 0 && field.zeroLabel ? field.zeroLabel : field.unit || "";
            };
            updateSuffix(num);

            slider.addEventListener("input", () => {
                box.value = slider.value;
                updateSuffix(Number(slider.value));
                onChange(field.key, Number(slider.value));
            });
            box.addEventListener("input", () => {
                const n = parseFloat(box.value);
                if (Number.isFinite(n)) {
                    slider.value = String(n);
                    updateSuffix(n);
                    onChange(field.key, n);
                }
            });
            // Snap the box to what will actually be saved once the user's done typing.
            box.addEventListener("change", () => {
                const n = Clamp(parseFloat(box.value), field);
                box.value = slider.value = String(n);
                updateSuffix(n);
                onChange(field.key, n);
            });
            control.append(slider, box, suffix);
            break;
        }
        case "text": {
            const input = Input("text", id);
            input.value = typeof value === "string" ? value : "";
            if (field.placeholder) {
                input.placeholder = field.placeholder;
            }
            input.addEventListener("input", () => onChange(field.key, input.value));
            control.appendChild(input);
            break;
        }
        case "colour": {
            const colour = typeof value === "number" ? value : 0xffffff;
            const picker = Input("color", id);
            picker.value = HexString(colour);
            const hex = Input("text", id + "-hex");
            hex.className = "fd-hex";
            hex.value = HexString(colour);
            hex.maxLength = 7;
            hex.setAttribute("aria-label", field.label + " hex");
            picker.addEventListener("input", () => {
                hex.value = picker.value;
                onChange(field.key, parseInt(picker.value.slice(1), 16));
            });
            hex.addEventListener("input", () => {
                const match = /^#?([0-9a-f]{6})$/i.exec(hex.value.trim());
                if (match) {
                    picker.value = "#" + match[1].toLowerCase();
                    onChange(field.key, parseInt(match[1], 16));
                }
            });
            hex.addEventListener("change", () => (hex.value = picker.value));
            control.append(picker, hex);
            break;
        }
        case "toggle": {
            const box = Input("checkbox", id);
            box.checked = value === true;
            box.addEventListener("change", () => onChange(field.key, box.checked));
            control.appendChild(box);
            break;
        }
        case "multi-choice": {
            const selected = new Set(Array.isArray(value) ? value : []);
            const emit = () => onChange(field.key, field.options.map(o => o.value).filter(v => selected.has(v)));
            const chips: HTMLButtonElement[] = [];
            const grid = El("div", "fd-chips");
            grid.id = id;
            field.options.forEach(option => {
                const chip = El("button", "fd-chip");
                chip.type = "button";
                chip.title = option.label;
                if (option.image) {
                    const img = document.createElement("img");
                    img.src = option.image.src;
                    img.width = option.image.width;
                    img.height = option.image.height;
                    img.alt = "";
                    chip.appendChild(El("span", "fd-chip-art")).appendChild(img);
                }
                chip.appendChild(El("span", "fd-chip-label", option.label));
                const sync = () => chip.setAttribute("aria-pressed", String(selected.has(option.value)));
                sync();
                chip.addEventListener("click", () => {
                    if (selected.has(option.value)) {
                        selected.delete(option.value);
                    } else {
                        selected.add(option.value);
                    }
                    sync();
                    emit();
                });
                chips.push(chip);
                grid.appendChild(chip);
            });

            const bulk = El("div", "fd-bulk");
            const setAll = (on: boolean) => {
                if (on) {
                    field.options.forEach(o => selected.add(o.value));
                } else {
                    selected.clear();
                }
                chips.forEach(c => c.setAttribute("aria-pressed", String(on)));
                emit();
            };
            const all = El("button", "fd-link", "All");
            const none = El("button", "fd-link", "None");
            all.type = none.type = "button";
            all.addEventListener("click", () => setAll(true));
            none.addEventListener("click", () => setAll(false));
            bulk.append(all, none);
            label.appendChild(bulk);

            control.appendChild(grid);
            break;
        }
    }

    if (field.hint) {
        row.appendChild(El("p", "fd-hint", field.hint));
    }
    return row;
}

/** Numbers can still be out of bounds (or half-typed) if the user hits Enter without leaving the box. */
function ClampValues(fields: FieldSpec[], values: FormValues): FormValues {
    const out: FormValues = { ...values };
    fields.forEach(field => {
        if (field.type === "number") {
            out[field.key] = Clamp(Number(values[field.key]), field);
        }
    });
    return out;
}

function Clamp(n: number, field: NumberField): number {
    if (!Number.isFinite(n)) {
        return field.min;
    }
    const step = field.step || 1;
    const snapped = Math.round((n - field.min) / step) * step + field.min;
    // Round away float noise from the step maths (0.1 + 0.2 ...).
    return Math.max(field.min, Math.min(field.max, parseFloat(snapped.toFixed(6))));
}

function HexString(colour: number): string {
    return "#" + colour.toString(16).padStart(6, "0");
}

function Input(type: string, id: string): HTMLInputElement {
    const input = document.createElement("input");
    input.type = type;
    input.id = id;
    return input;
}

const STYLES = `
.fd-overlay {
    position: fixed; inset: 0; z-index: 1000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    font: var(--ed-font); color: var(--ed-text);
}
.fd-panel {
    width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    display: flex; flex-direction: column;
    background: var(--ed-panel); border: 1px solid var(--ed-panel-border); border-radius: 6px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6); outline: none;
}
.fd-header { padding: 14px 18px 10px; border-bottom: 1px solid var(--ed-divider); }
.fd-title { margin: 0; font-size: 16px; font-weight: bold; color: var(--ed-text-strong); }
.fd-subtitle { margin: 4px 0 0; color: var(--ed-muted); }
.fd-body { padding: 8px 18px; overflow-y: auto; }
.fd-field { padding: 10px 0; border-bottom: 1px solid var(--ed-divider-soft); }
.fd-field:last-child { border-bottom: none; }
.fd-label { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; font-weight: bold; color: var(--ed-label); }
.fd-control { display: flex; align-items: center; gap: 10px; }
.fd-hint { margin: 5px 0 0; font-size: 12px; color: var(--ed-faint); }
.fd-panel input[type=range] { flex: 1; accent-color: var(--ed-accent); }
.fd-panel input[type=number], .fd-panel input[type=text] {
    background: var(--ed-input); color: var(--ed-text-strong); border: 1px solid var(--ed-panel-border); border-radius: 4px;
    padding: 5px 7px; font: inherit;
}
.fd-panel input[type=number] { width: 72px; }
.fd-panel input[type=text] { flex: 1; }
.fd-panel input.fd-hex { flex: 0 0 84px; font-family: monospace; }
.fd-panel input[type=color] { width: 44px; height: 30px; padding: 0; border: 1px solid var(--ed-panel-border); border-radius: 4px; background: none; cursor: pointer; }
.fd-panel input:focus-visible, .fd-panel button:focus-visible { outline: 2px solid var(--ed-accent); outline-offset: 1px; }
.fd-suffix { min-width: 88px; color: var(--ed-muted); font-size: 12px; }
.fd-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; width: 100%; }
.fd-chip {
    display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px;
    padding: 6px 4px; min-height: 84px;
    background: var(--ed-well); color: var(--ed-chip-text); border: 1px solid var(--ed-divider); border-radius: 5px;
    font: inherit; font-size: 11px; cursor: pointer;
}
.fd-chip:hover { border-color: var(--ed-hover-border); }
.fd-chip[aria-pressed=true] { background: var(--ed-accent-bg); border-color: var(--ed-accent); color: var(--ed-text-strong); }
.fd-chip[aria-pressed=false] img { opacity: 0.45; filter: grayscale(0.7); }
.fd-chip-art { flex: 1; display: flex; align-items: flex-end; justify-content: center; }
.fd-chip img { image-rendering: pixelated; }
.fd-chip-label { overflow-wrap: anywhere; text-align: center; }
.fd-bulk { display: flex; gap: 10px; font-weight: normal; }
.fd-link { background: none; border: none; padding: 0; color: var(--ed-link); font: inherit; font-size: 12px; cursor: pointer; }
.fd-link:hover { text-decoration: underline; }
.fd-footer { display: flex; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--ed-divider); }
.fd-error { flex: 1; color: var(--ed-error); font-size: 12px; }
.fd-primary { background: var(--ed-accent-strong); border-color: var(--ed-accent); color: var(--ed-text-strong); }
.fd-primary:hover { background: var(--ed-accent-hover); }
`;
