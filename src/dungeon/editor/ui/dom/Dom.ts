/**
 * Shared pieces of the editor's DOM UI - `FormDialog` and the side panels
 * hosted by `EditorOverlay`: element helpers, one-off stylesheet injection,
 * and the theme. Colours live in CSS custom properties on `:root` so every
 * stylesheet draws from the same palette.
 */

export function El<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    el.className = className;
    if (text != null) {
        el.textContent = text;
    }
    return el;
}

/** A `type="button"` button (so it never submits anything), with an optional tooltip. */
export function ButtonEl(className: string, text?: string, title?: string): HTMLButtonElement {
    const button = El("button", className, text);
    button.type = "button";
    if (title) {
        button.title = title;
    }
    return button;
}

/** Adds `css` to the page once per `id`, however many times it's asked for. */
export function InjectStyles(id: string, css: string): void {
    if (document.getElementById(id)) {
        return;
    }
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
}

/** The theme variables and the classes shared across the editor's DOM UI. */
export function InjectTheme(): void {
    InjectStyles("ed-theme", THEME);
}

const THEME = `
:root {
    --ed-font: 13px/1.4 Arial, Helvetica, sans-serif;
    --ed-text: #e6e6e6;
    --ed-text-strong: #fff;
    --ed-label: #d0d0d6;
    --ed-muted: #a0a0a8;
    --ed-faint: #8c8c94;
    --ed-chip-text: #b8b8c0;
    --ed-panel: #2a2a2e;
    --ed-panel-border: #4a4a50;
    --ed-divider: #3a3a40;
    --ed-divider-soft: #333338;
    --ed-input: #1c1c1f;
    --ed-well: #1f1f23;
    --ed-button: #38383e;
    --ed-button-hover: #44444b;
    --ed-button-border: #55555c;
    --ed-hover-border: #6a6a74;
    --ed-accent: #9b5de5;
    --ed-accent-strong: #7b3fd0;
    --ed-accent-hover: #8a4fe0;
    --ed-accent-bg: #3b2a55;
    --ed-link: #b48cf0;
    --ed-error: #ff7b7b;
}
.ed-panel {
    display: flex; flex-direction: column; min-height: 0; box-sizing: border-box;
    background: var(--ed-panel); border: 1px solid var(--ed-panel-border); border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); overflow: hidden;
    font: var(--ed-font); color: var(--ed-text);
}
.ed-panel-header {
    display: flex; align-items: center; gap: 2px; flex: 0 0 auto; box-sizing: border-box;
    min-height: 32px; padding: 4px 6px 4px 10px; border-bottom: 1px solid var(--ed-divider);
}
.ed-panel-title { font-size: 11px; font-weight: bold; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ed-label); }
.ed-panel-note { margin-left: 6px; font-size: 11px; color: var(--ed-faint); }
.ed-scroll { overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: var(--ed-button-border) transparent; }
.ed-scroll::-webkit-scrollbar { width: 8px; }
.ed-scroll::-webkit-scrollbar-track { background: transparent; }
.ed-scroll::-webkit-scrollbar-thumb { background: var(--ed-button-border); border-radius: 4px; }
.ed-scroll::-webkit-scrollbar-thumb:hover { background: var(--ed-hover-border); }
.ed-button {
    padding: 6px 16px; border-radius: 4px; border: 1px solid var(--ed-button-border);
    background: var(--ed-button); color: #eee; font: inherit; cursor: pointer;
}
.ed-button:hover { background: var(--ed-button-hover); }
.ed-button:disabled { opacity: 0.45; cursor: not-allowed; }
.ed-icon-button {
    display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
    width: 24px; height: 24px; padding: 0; box-sizing: border-box;
    background: none; border: 1px solid transparent; border-radius: 4px; color: var(--ed-text); cursor: pointer;
}
.ed-icon-button:hover:not(:disabled) { background: var(--ed-button-hover); border-color: var(--ed-button-border); }
.ed-icon-button:disabled { opacity: 0.3; cursor: default; }
.ed-icon-button img { image-rendering: pixelated; }
`;
