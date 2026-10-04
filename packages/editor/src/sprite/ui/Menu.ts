/**
 * The sprite editor's menu bar: a row of headings, each dropping a list of commands. What's in a list - and whether an item
 * is greyed out or ticked - is worked out each time it's opened, so it's always current. Mouse only (the editor's own
 * shortcuts cover the keyboard); Escape closes via `Close`.
 */

import { ButtonEl, El } from "../../ui/dom/Dom";

export type MenuItem = {
    label?: string;
    /** Shown right-aligned - a reminder, the key handling is the editor's. */
    shortcut?: string;
    action?: () => void;
    disabled?: boolean;
    /** Ticked (a toggle). */
    checked?: boolean;
    separator?: boolean;
};

export type MenuDef = { label: string; items: () => MenuItem[] };

export default class MenuBar {
    readonly el: HTMLElement;
    private open: { wrap: HTMLElement; button: HTMLButtonElement; panel: HTMLElement } | null = null;
    private wraps: { def: MenuDef; wrap: HTMLElement; button: HTMLButtonElement; panel: HTMLElement }[] = [];
    private onOutside = (e: PointerEvent) => {
        if (this.open && !(e.target instanceof Node && this.open.wrap.contains(e.target))) {
            this.Close();
        }
    };

    constructor(defs: MenuDef[]) {
        this.el = El("div", "se-menubar");
        this.el.setAttribute("role", "menubar");
        defs.forEach(def => {
            const wrap = this.el.appendChild(El("div", "se-menu-wrap"));
            const button = wrap.appendChild(ButtonEl("se-menu-button", def.label));
            button.setAttribute("aria-haspopup", "true");
            button.setAttribute("aria-expanded", "false");
            const panel = wrap.appendChild(El("div", "se-menu"));
            panel.setAttribute("role", "menu");
            panel.hidden = true;
            const entry = { def, wrap, button, panel };
            this.wraps.push(entry);
            button.addEventListener("pointerdown", e => {
                e.preventDefault();
                if (this.open && this.open.wrap === wrap) {
                    this.Close();
                } else {
                    this.Show(entry);
                }
            });
            button.addEventListener("pointerenter", () => {
                // Once one is open, moving along the bar opens the next, as menu bars do.
                if (this.open && this.open.wrap !== wrap) {
                    this.Show(entry);
                }
            });
        });
        document.addEventListener("pointerdown", this.onOutside, true);
    }

    get IsOpen(): boolean {
        return this.open !== null;
    }

    /** Closes whatever's open; true if something was. */
    Close(): boolean {
        if (!this.open) {
            return false;
        }
        this.open.panel.hidden = true;
        this.open.button.setAttribute("aria-expanded", "false");
        this.open.wrap.classList.remove("is-open");
        this.open = null;
        return true;
    }

    Destroy(): void {
        document.removeEventListener("pointerdown", this.onOutside, true);
        this.el.remove();
    }

    private Show(entry: { def: MenuDef; wrap: HTMLElement; button: HTMLButtonElement; panel: HTMLElement }): void {
        this.Close();
        const { def, wrap, button, panel } = entry;
        panel.textContent = "";
        def.items().forEach(item => {
            if (item.separator) {
                panel.appendChild(El("div", "se-menu-sep"));
                return;
            }
            const row = ButtonEl("se-menu-item");
            row.setAttribute("role", "menuitem");
            row.disabled = !!item.disabled;
            row.appendChild(El("span", "se-menu-check", item.checked ? "✓" : ""));
            row.appendChild(El("span", "se-menu-label", item.label));
            if (item.shortcut) {
                row.appendChild(El("span", "se-menu-shortcut", item.shortcut));
            }
            // A press on the item must not take focus off the editor: its shortcuts only work while the editor holds it.
            row.addEventListener("pointerdown", e => e.preventDefault());
            row.addEventListener("click", () => {
                this.Close();
                if (item.action) {
                    item.action();
                }
            });
            panel.appendChild(row);
        });
        panel.hidden = false;
        button.setAttribute("aria-expanded", "true");
        wrap.classList.add("is-open");
        this.open = entry;
    }
}
