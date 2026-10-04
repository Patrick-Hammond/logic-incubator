/**
 * The colour channel mixer, laid out as Photoshop's is: pick an output channel (red, green, blue - or grey, with Monochrome
 * on) and say how much of the colour's own red, green and blue it's made of, plus a constant. Alpha has its own scale and
 * offset. It works on the palette, so the whole sprite recolours with it. Changes only preview - the canvas, the palette
 * grid and the frames show the mixed colours - until Apply makes them one undoable step; a preset is a starting point.
 */

import { CloneMixer, ConstantRange, IdentityMixer, IsIdentityMixer, MixPalette, MixerPresets, Mixer, MixRow, WeightRange } from "../ChannelMixer";
import { Rgba } from "../Colour";
import { SpriteDocument } from "../SpriteDocument";
import { ButtonEl, El } from "../../ui/dom/Dom";

type Output = "red" | "green" | "blue" | "gray";
const Outputs: ReadonlyArray<{ key: Output; label: string }> = [
    { key: "red", label: "Red" },
    { key: "green", label: "Green" },
    { key: "blue", label: "Blue" },
    { key: "gray", label: "Gray" }
];

type Slider = { range: HTMLInputElement; box: HTMLInputElement };

export default class MixerPanel {
    readonly el: HTMLElement;
    private mixer: Mixer = IdentityMixer();
    private output: Output = "red";
    private target: "all" | "selected" = "all";
    private preset: HTMLSelectElement;
    private outputButtons: { [key: string]: HTMLButtonElement } = {};
    private weights: { [key: string]: Slider } = {};
    private constant: Slider;
    private alphaScale: Slider;
    private alphaOffset: Slider;
    private mono: HTMLInputElement;
    private targetAll: HTMLInputElement;
    private targetSelected: HTMLInputElement;
    private selectedLabel: HTMLElement;
    private applyButton: HTMLButtonElement;
    private resetButton: HTMLButtonElement;
    private unsubscribe: () => void;

    /**
     * `selected()` says which palette entries are selected (for "Selected colours"); `Preview` gets the mixed palette to show,
     * or null when there's nothing to preview.
     */
    constructor(private doc: SpriteDocument, private selected: () => number[], private hooks: { Preview(palette: Rgba[] | null): void }) {
        this.el = El("div", "se-mixer");

        const presetRow = this.el.appendChild(El("div", "se-mixer-row"));
        presetRow.appendChild(El("label", "se-opt-label", "Preset"));
        this.preset = presetRow.appendChild(document.createElement("select"));
        this.preset.className = "se-select";
        MixerPresets.forEach((p, i) => this.preset.appendChild(new Option(p.name, String(i))));
        this.preset.addEventListener("change", () => {
            this.mixer = CloneMixer(MixerPresets[Number(this.preset.value)].mixer);
            if (this.mixer.monochrome) {
                this.output = "gray";
            } else if (this.output === "gray") {
                this.output = "red";
            }
            this.Changed();
        });

        const outputRow = this.el.appendChild(El("div", "se-mixer-row"));
        outputRow.appendChild(El("label", "se-opt-label", "Output channel"));
        const group = outputRow.appendChild(El("div", "se-seg"));
        Outputs.forEach(o => {
            const button = ButtonEl("se-seg-button", o.label, o.key === "gray" ? "Used instead of the three colours when Monochrome is on" : undefined);
            button.addEventListener("click", () => {
                this.output = o.key;
                this.Refresh();
            });
            this.outputButtons[o.key] = group.appendChild(button);
        });

        const sources: Array<{ key: "r" | "g" | "b"; label: string }> = [
            { key: "r", label: "Source red" },
            { key: "g", label: "Source green" },
            { key: "b", label: "Source blue" }
        ];
        sources.forEach(source => {
            this.weights[source.key] = this.AddSlider(source.label, -WeightRange * 100, WeightRange * 100, value => {
                this.Row()[source.key] = value / 100;
                this.Changed();
            });
        });
        this.constant = this.AddSlider("Constant", -ConstantRange * 100, ConstantRange * 100, value => {
            this.Row().constant = value / 100;
            this.Changed();
        });

        const monoRow = this.el.appendChild(El("label", "se-opt se-check"));
        this.mono = monoRow.appendChild(document.createElement("input"));
        this.mono.type = "checkbox";
        monoRow.appendChild(El("span", "", "Monochrome"));
        this.mono.addEventListener("change", () => {
            this.mixer.monochrome = this.mono.checked;
            this.output = this.mono.checked ? "gray" : this.output === "gray" ? "red" : this.output;
            this.Changed();
        });

        this.el.appendChild(El("div", "se-mixer-sub", "Alpha"));
        this.alphaScale = this.AddSlider("Scale", 0, 200, value => {
            this.mixer.alphaScale = value / 100;
            this.Changed();
        });
        this.alphaOffset = this.AddSlider("Offset", -100, 100, value => {
            this.mixer.alphaOffset = value / 100;
            this.Changed();
        });

        const targets = this.el.appendChild(El("div", "se-mixer-targets"));
        const mk = (label: string, value: "all" | "selected") => {
            const row = targets.appendChild(El("label", "se-opt se-check"));
            const input = row.appendChild(document.createElement("input"));
            input.type = "radio";
            input.name = "se-mixer-target";
            const text = row.appendChild(El("span", "", label));
            input.addEventListener("change", () => {
                if (input.checked) {
                    this.target = value;
                    this.Changed();
                }
            });
            return { input, text };
        };
        this.targetAll = mk("All colours", "all").input;
        const selectedRow = mk("Selected colours", "selected");
        this.targetSelected = selectedRow.input;
        this.selectedLabel = selectedRow.text;
        this.targetAll.checked = true;

        const buttons = this.el.appendChild(El("div", "se-mixer-buttons"));
        this.applyButton = buttons.appendChild(ButtonEl("ed-button se-primary", "Apply", "Recolour the palette (one undo step)"));
        this.resetButton = buttons.appendChild(ButtonEl("ed-button", "Reset", "Put the mixer back to no change"));
        this.applyButton.addEventListener("click", () => this.Apply());
        this.resetButton.addEventListener("click", () => this.Reset());

        // A change to the palette under the mixer (undo, an edit) means the preview has to be worked out again.
        this.unsubscribe = doc.Subscribe(() => this.Changed(false));
        this.Refresh();
    }

    private AddSlider(label: string, min: number, max: number, set: (value: number) => void): Slider {
        const row = this.el.appendChild(El("div", "se-channel"));
        row.appendChild(El("label", "se-channel-label se-wide", label));
        const range = row.appendChild(document.createElement("input"));
        range.type = "range";
        range.min = String(min);
        range.max = String(max);
        range.setAttribute("aria-label", label);
        const box = row.appendChild(document.createElement("input"));
        box.type = "number";
        box.min = String(min);
        box.max = String(max);
        box.setAttribute("aria-label", label + " in percent");
        row.appendChild(El("span", "se-unit", "%"));
        range.addEventListener("input", () => {
            box.value = range.value;
            set(Number(range.value));
        });
        box.addEventListener("input", () => {
            const n = Number(box.value);
            if (box.value !== "" && Number.isFinite(n)) {
                range.value = String(Math.max(min, Math.min(max, n)));
                set(Math.max(min, Math.min(max, n)));
            }
        });
        box.addEventListener("change", () => this.Refresh());
        return { range, box };
    }

    /** The row of the output channel being edited. */
    private Row(): MixRow {
        return this.mixer[this.output];
    }

    /** Which palette entries the mixer would change, or undefined for all of them. */
    private Indices(): number[] | undefined {
        return this.target === "selected" ? this.selected() : undefined;
    }

    /** Whether the mixer has anything to do. */
    get Active(): boolean {
        return !IsIdentityMixer(this.mixer);
    }

    /** Called when the palette selection changes: "Selected colours" follows it. */
    SelectionChanged(): void {
        this.Changed(false);
    }

    private Changed(refresh = true): void {
        this.hooks.Preview(this.Active ? MixPalette(this.doc.Palette, this.mixer, this.Indices()) : null);
        if (refresh) {
            this.Refresh();
        } else {
            this.RefreshTargets();
        }
    }

    private RefreshTargets(): void {
        const n = this.selected().length;
        this.selectedLabel.textContent = `Selected colours (${n})`;
        this.applyButton.disabled = !this.Active;
        this.resetButton.disabled = !this.Active;
    }

    /** Shows the mixer's numbers (leaving a box being typed in alone). */
    private Refresh(): void {
        const active = document.activeElement;
        const row = this.Row();
        const show = (slider: Slider, value: number) => {
            slider.range.value = String(Math.round(value * 100));
            if (active !== slider.box) {
                slider.box.value = String(Math.round(value * 100));
            }
        };
        Object.keys(this.outputButtons).forEach(key => this.outputButtons[key].setAttribute("aria-pressed", String(key === this.output)));
        this.outputButtons.gray.disabled = !this.mixer.monochrome;
        (["r", "g", "b"] as const).forEach(key => show(this.weights[key], row[key]));
        show(this.constant, row.constant);
        show(this.alphaScale, this.mixer.alphaScale);
        show(this.alphaOffset, this.mixer.alphaOffset);
        this.mono.checked = this.mixer.monochrome;
        this.targetAll.checked = this.target === "all";
        this.targetSelected.checked = this.target === "selected";
        this.RefreshTargets();
    }

    Apply(): void {
        if (!this.Active) {
            return;
        }
        this.doc.ApplyMixer(this.mixer, this.Indices());
        this.Reset();
    }

    /** Back to no change, and the preview off. */
    Reset(): void {
        this.mixer = IdentityMixer();
        this.output = "red";
        this.preset.value = "0";
        this.hooks.Preview(null);
        this.Refresh();
    }

    Destroy(): void {
        this.unsubscribe();
        this.el.remove();
    }
}
