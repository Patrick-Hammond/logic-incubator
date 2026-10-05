import UiTheme from "../UiTheme";
import UiToggle from "./UiToggle";

/** A box that is ticked or not, with a label beside it. A press toggles it and emits `change` (the new value) and `activate`. */
export default class UiCheckbox extends UiToggle {
    constructor(theme: UiTheme, variant: string, label: string, checked = false) {
        const skin = theme.skin.checkboxes && theme.skin.checkboxes[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no checkbox "${variant}".`);
        }
        super(theme, skin, label, checked);
    }

    protected Trigger(): void {
        this.checked = !this.checked;
        this.Refresh();
        this.emit("change", this.checked, this);
        super.Trigger();
    }
}
