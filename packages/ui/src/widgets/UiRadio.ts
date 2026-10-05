import { utils } from "pixi.js";
import UiTheme from "../UiTheme";
import UiToggle from "./UiToggle";

/** A ring with a dot when it is the chosen one, with a label beside it. A press chooses it (a radio button doesn't un-choose itself): it emits `change` and `activate`. */
export class UiRadio extends UiToggle {
    constructor(theme: UiTheme, variant: string, label: string, checked = false) {
        const skin = theme.skin.radios && theme.skin.radios[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no radio "${variant}".`);
        }
        super(theme, skin, label, checked);
    }

    protected Trigger(): void {
        if (!this.checked) {
            this.checked = true;
            this.Refresh();
            this.emit("change", true, this);
        }
        super.Trigger();
    }
}

/**
 * Radio buttons of which exactly one is chosen: choosing one un-chooses the others. Emits `change` (the chosen radio and its index) when the player chooses one - not when
 * `Select` does. A radio can be in only one group.
 */
export class UiRadioGroup extends utils.EventEmitter {
    private readonly radios: UiRadio[] = [];

    constructor(radios: UiRadio[] = [], selected = -1) {
        super();
        radios.forEach(radio => this.Add(radio));
        if (selected >= 0) this.Select(selected);
    }

    Add(radio: UiRadio): void {
        this.radios.push(radio);
        radio.on("change", (checked: boolean) => {
            if (checked) {
                this.radios.forEach(other => {
                    if (other !== radio) other.Checked = false;
                });
                this.emit("change", radio, this.radios.indexOf(radio));
            }
        });
    }

    get Selected(): number {
        return this.radios.findIndex(radio => radio.Checked);
    }

    /** Chooses one by index (or none, for -1) without emitting `change`. */
    Select(index: number): void {
        this.radios.forEach((radio, i) => (radio.Checked = i === index));
    }

    get Radios(): ReadonlyArray<UiRadio> {
        return this.radios;
    }
}
