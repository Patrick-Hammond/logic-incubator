/** The sprite editor window's stylesheet. Colours come from the editor's theme variables (see ui/dom/Dom.ts), so it matches the rest of the editor. */

export const SpriteEditorStyles = `
.se-root {
    position: fixed; inset: 0; z-index: 900; display: flex; flex-direction: column;
    background: #151518; color: var(--ed-text); font: var(--ed-font); outline: none;
    user-select: none; -webkit-user-select: none;
}
.se-root *, .se-root *::before, .se-root *::after { box-sizing: border-box; }
.se-top {
    /* The left inset clears the dev build's FPS counter, which sits over the top-left corner of the page. */
    flex: 0 0 auto; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px 0 90px;
    background: var(--ed-panel); border-bottom: 1px solid var(--ed-panel-border);
}
.se-title { font-weight: bold; color: var(--ed-text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 38vw; }
.se-meta { color: var(--ed-muted); font-size: 12px; white-space: nowrap; }
.se-spacer { flex: 1; }
.se-main { flex: 1 1 auto; min-height: 0; display: flex; }
.se-left { flex: 0 0 150px; padding: 10px; overflow-y: auto; background: var(--ed-panel); border-right: 1px solid var(--ed-panel-border); }
.se-side { flex: 0 0 276px; padding: 10px; overflow-y: auto; background: var(--ed-panel); border-left: 1px solid var(--ed-panel-border); scrollbar-width: thin; scrollbar-color: var(--ed-button-border) transparent; }
.se-stage { position: relative; flex: 1 1 auto; min-width: 0; background: #17171a; overflow: hidden; }
.se-canvas { position: absolute; left: 0; top: 0; display: block; cursor: crosshair; touch-action: none; }
.se-status {
    flex: 0 0 auto; display: flex; align-items: center; gap: 18px; height: 24px; padding: 0 10px;
    background: var(--ed-panel); border-top: 1px solid var(--ed-panel-border); font-size: 11px; color: var(--ed-muted);
}
.se-status .se-message { flex: 1; color: var(--ed-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.se-status .se-message.is-error { color: var(--ed-error); }

/* menus */
.se-menubar { display: flex; align-items: center; }
.se-menu-wrap { position: relative; }
.se-menu-button { padding: 6px 11px; background: none; border: none; border-radius: 4px; color: var(--ed-text); font: inherit; cursor: pointer; }
.se-menu-button:hover, .se-menu-wrap.is-open > .se-menu-button { background: var(--ed-button-hover); }
.se-menu {
    position: absolute; top: calc(100% + 3px); left: 0; z-index: 10; min-width: 250px; padding: 4px 0;
    background: var(--ed-panel); border: 1px solid var(--ed-panel-border); border-radius: 5px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.se-menu[hidden] { display: none; }
.se-menu-item { display: flex; align-items: center; width: 100%; padding: 5px 12px 5px 6px; background: none; border: none; color: var(--ed-text); font: inherit; text-align: left; cursor: pointer; }
.se-menu-item:hover:not(:disabled) { background: var(--ed-accent-bg); color: var(--ed-text-strong); }
.se-menu-item:disabled { color: var(--ed-faint); cursor: default; }
.se-menu-check { flex: 0 0 18px; color: var(--ed-accent); text-align: center; }
.se-menu-label { flex: 1; white-space: nowrap; }
.se-menu-shortcut { margin-left: 24px; color: var(--ed-faint); font-size: 11px; }
.se-menu-sep { height: 1px; margin: 4px 0; background: var(--ed-divider); }

/* buttons, tools */
.se-icon { display: inline-flex; width: 16px; height: 16px; }
.se-icon svg { display: block; }
.se-tools { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.se-tool {
    display: inline-flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1; min-height: 28px; padding: 0;
    background: var(--ed-button); color: var(--ed-text); border: 1px solid var(--ed-button-border); border-radius: 4px; cursor: pointer;
}
.se-tool:hover:not(:disabled) { background: var(--ed-button-hover); border-color: var(--ed-hover-border); }
.se-tool:disabled { opacity: 0.35; cursor: default; }
.se-tool[aria-pressed=true], .se-toggle[aria-pressed=true], .se-seg-button[aria-pressed=true] { background: var(--ed-accent-bg); border-color: var(--ed-accent); color: var(--ed-text-strong); }
.se-tool.se-small { width: 30px; height: 30px; min-height: 0; aspect-ratio: auto; }
.se-toggle, .se-seg-button {
    display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 26px; padding: 0 8px;
    background: var(--ed-button); color: var(--ed-text); border: 1px solid var(--ed-button-border); border-radius: 4px; font: inherit; font-size: 12px; cursor: pointer;
}
.se-toggle:hover:not(:disabled), .se-seg-button:hover:not(:disabled) { background: var(--ed-button-hover); }
.se-seg-button:disabled { opacity: 0.35; cursor: default; }
.se-seg { display: flex; gap: 3px; }
.se-seg-button { flex: 1; padding: 0 4px; }
.se-mini { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; background: var(--ed-button); color: var(--ed-text); border: 1px solid var(--ed-button-border); border-radius: 3px; cursor: pointer; }
.se-mini:hover:not(:disabled) { background: var(--ed-button-hover); }
.se-mini:disabled { opacity: 0.35; cursor: default; }
.se-primary { background: var(--ed-accent-strong); border-color: var(--ed-accent); color: var(--ed-text-strong); }
.se-primary:hover:not(:disabled) { background: var(--ed-accent-hover); }
.se-root .ed-button { padding: 4px 12px; }

/* toolbox */
.se-colours { position: relative; height: 62px; margin: 12px 0 8px; }
.se-fg-swatch, .se-bg-swatch { position: absolute; width: 34px; height: 34px; border: 2px solid #fff; box-shadow: 0 0 0 1px #000; background-size: auto, 8px 8px; }
.se-bg-swatch { left: 24px; top: 22px; border-color: #bbb; }
.se-fg-swatch { left: 4px; top: 4px; }
.se-swap { position: absolute; right: 4px; top: 2px; display: inline-flex; width: 26px; height: 26px; padding: 0; align-items: center; justify-content: center; background: none; border: 1px solid transparent; border-radius: 4px; color: var(--ed-text); cursor: pointer; }
.se-swap:hover { background: var(--ed-button-hover); border-color: var(--ed-button-border); }
.se-opt { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
.se-opt[hidden] { display: none; }
.se-opt-label { font-size: 11px; font-weight: bold; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ed-label); }
.se-opt-controls { display: flex; align-items: center; gap: 6px; }
.se-wide-button { width: 100%; padding: 4px 6px; font-size: 12px; }
.se-check { flex-direction: row; align-items: center; gap: 7px; font-size: 12px; color: var(--ed-label); cursor: pointer; }
.se-check input { accent-color: var(--ed-accent); margin: 0; }

/* inputs */
.se-root input[type=range] { flex: 1; min-width: 0; accent-color: var(--ed-accent); }
.se-root input[type=number], .se-root input[type=text], .se-root select {
    background: var(--ed-input); color: var(--ed-text-strong); border: 1px solid var(--ed-panel-border); border-radius: 4px; padding: 3px 5px; font: inherit; font-size: 12px;
}
.se-root input[type=number] { width: 54px; }
.se-root input:focus-visible, .se-root select:focus-visible, .se-root button:focus-visible { outline: 2px solid var(--ed-accent); outline-offset: 1px; }
.se-root input[type=text], .se-root select { user-select: text; -webkit-user-select: text; }
.se-select { max-width: 100%; }

/* palette */
.se-section-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.se-section-title { font-size: 11px; font-weight: bold; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ed-label); }
.se-section-note { flex: 1; font-size: 11px; color: var(--ed-faint); }
.se-grid { display: block; image-rendering: pixelated; border: 1px solid var(--ed-divider); cursor: pointer; }
.se-colour-editor { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
.se-colour-top { display: flex; align-items: center; gap: 8px; }
.se-colour-swatch { flex: 0 0 40px; height: 40px; border: 1px solid var(--ed-button-border); background-size: auto, 8px 8px; }
.se-colour-labels { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.se-colour-index { font-size: 11px; color: var(--ed-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.se-hex { font-family: monospace; width: 100%; }
.se-native-colour { flex: 0 0 34px; width: 34px; height: 28px; padding: 0; border: 1px solid var(--ed-panel-border); border-radius: 4px; background: none; cursor: pointer; }
.se-channel { display: grid; grid-template-columns: 22px 1fr 54px auto; align-items: center; gap: 6px; }
.se-channel-label { font-size: 11px; font-weight: bold; color: var(--ed-label); }
.se-channel-label.se-wide { grid-column: 1; white-space: nowrap; width: 56px; }
.se-mixer .se-channel { grid-template-columns: 56px 1fr 54px 12px; }
.se-unit { font-size: 11px; color: var(--ed-faint); }

/* mixer */
.se-details { margin-top: 14px; border-top: 1px solid var(--ed-divider); padding-top: 8px; }
.se-details > summary { cursor: pointer; font-size: 11px; font-weight: bold; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ed-label); list-style: none; padding: 2px 0 6px; }
.se-details > summary::-webkit-details-marker { display: none; }
.se-details > summary::before { content: "▸ "; color: var(--ed-faint); }
.se-details[open] > summary::before { content: "▾ "; }
.se-mixer { display: flex; flex-direction: column; gap: 6px; }
.se-mixer-row { display: flex; flex-direction: column; gap: 3px; }
.se-mixer-sub { margin-top: 4px; font-size: 11px; font-weight: bold; color: var(--ed-label); }
.se-mixer-targets { display: flex; flex-direction: column; gap: 3px; margin-top: 2px; }
.se-mixer-buttons { display: flex; gap: 6px; margin-top: 4px; }

/* timeline */
.se-timeline { flex: 0 0 auto; display: flex; align-items: stretch; gap: 10px; padding: 8px 10px; background: var(--ed-panel); border-top: 1px solid var(--ed-panel-border); }
.se-frame-controls { display: grid; grid-template-columns: repeat(4, 30px); gap: 4px; align-content: start; }
.se-strip { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 2px 2px 8px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: var(--ed-button-border) transparent; }
.se-frame { position: relative; flex: 0 0 auto; padding: 3px; background: var(--ed-well); border: 2px solid transparent; border-radius: 4px; cursor: pointer; }
.se-frame:hover { border-color: var(--ed-hover-border); }
.se-frame[aria-selected=true] { border-color: var(--ed-accent); background: var(--ed-accent-bg); }
.se-frame.is-playing { box-shadow: 0 0 0 2px #ffd23c; }
.se-frame.is-drop { border-style: dashed; border-color: #ffd23c; }
.se-frame canvas { display: block; image-rendering: pixelated; }
.se-frame-no { position: absolute; left: 5px; top: 4px; padding: 0 3px; font-size: 10px; background: rgba(0, 0, 0, 0.6); border-radius: 2px; color: #fff; pointer-events: none; }
.se-playback { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding-left: 10px; border-left: 1px solid var(--ed-divider); }
.se-transport { display: grid; grid-template-columns: 30px 30px; gap: 5px; align-content: start; }
.se-speed { grid-column: 1 / 3; display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--ed-muted); }
.se-transport .se-select { grid-column: 1 / 3; }
.se-preview-box { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 134px; }
.se-preview { image-rendering: pixelated; max-width: 128px; max-height: 128px; background: #202024; border: 1px solid var(--ed-divider); }
.se-preview-label { font-size: 11px; color: var(--ed-muted); }

/* messages */
.se-toast {
    position: absolute; left: 50%; bottom: 38px; transform: translateX(-50%); z-index: 20; max-width: min(640px, 80vw); padding: 8px 14px;
    background: var(--ed-panel); border: 1px solid var(--ed-accent); border-radius: 6px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5); color: var(--ed-text-strong); pointer-events: none;
}
.se-toast.is-error { border-color: var(--ed-error); }
.se-busy { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.62); font-size: 15px; color: var(--ed-text-strong); }

/* a message dialog's text may run to several lines */
.fd-subtitle { white-space: pre-line; }
`;
