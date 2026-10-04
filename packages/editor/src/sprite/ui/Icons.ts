/**
 * The sprite editor's small line icons: inline SVG (16x16, drawn in `currentColor`) so they follow the theme and need
 * no asset files - the editor ships in a bundle of its own, and these shouldn't depend on it.
 */

import { El } from "../../ui/dom/Dom";

const Paths: { [name: string]: string } = {
    pencil: '<path d="M2.5 13.5l.8-3.3L10.9 2.6l2.5 2.5-7.6 7.6z"/><path d="M9.2 4.3l2.5 2.5"/>',
    eraser: '<path d="M2.6 10.6l5.4-6.1 5.4 4.8-3.6 4H5.6z"/><path d="M5.2 8l5.4 4.8"/><path d="M7 13.3h7"/>',
    line: '<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1" fill="currentColor"/><circle cx="13" cy="3" r="1" fill="currentColor"/>',
    rect: '<rect x="2.5" y="4" width="11" height="8"/>',
    ellipse: '<ellipse cx="8" cy="8" rx="5.8" ry="4.3"/>',
    fill: '<path d="M3.2 9L8 4.2 12.8 9 8 13.8z"/><path d="M8 4.2L6 2.2"/><path d="M13.6 11.2c.9 1.3.9 2.2 0 3-.9-.8-.9-1.7 0-3z" fill="currentColor"/>',
    picker: '<path d="M10.4 2.6l3 3-1.7 1.7-3-3z"/><path d="M8.7 5.3L3.2 10.8v2h2l5.5-5.5"/>',
    select: '<rect x="2.5" y="2.5" width="11" height="11" stroke-dasharray="2 2"/>',
    play: '<path d="M5 3.2l8 4.8-8 4.8z" fill="currentColor"/>',
    pause: '<path d="M4.5 3h2.6v10H4.5zM8.9 3h2.6v10H8.9z" fill="currentColor"/>',
    stop: '<path d="M4 4h8v8H4z" fill="currentColor"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    minus: '<path d="M3 8h10"/>',
    duplicate: '<rect x="2.5" y="5.5" width="8" height="8"/><path d="M5.5 5.5v-3h8v8h-3"/>',
    left: '<path d="M10 3L5 8l5 5"/>',
    right: '<path d="M6 3l5 5-5 5"/>',
    reverse: '<path d="M2.5 5.5h9M9 3l2.7 2.5L9 8M13.5 10.5h-9M7 8l-2.7 2.5L7 13"/>',
    swap: '<path d="M3 5.5h9M9.5 3l2.7 2.5-2.7 2.5M13 10.5H4M6.5 8L3.8 10.5 6.5 13"/>',
    mirrorX: '<path d="M8 2v12" stroke-dasharray="1.5 1.5"/><path d="M5.5 5L2.5 8l3 3zM10.5 5l3 3-3 3z"/>',
    mirrorY: '<path d="M2 8h12" stroke-dasharray="1.5 1.5"/><path d="M5 5.5L8 2.5l3 3zM5 10.5l3 3 3-3z"/>',
    square: '<rect x="3.5" y="3.5" width="9" height="9" fill="currentColor"/>',
    round: '<circle cx="8" cy="8" r="5" fill="currentColor"/>',
    close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
    onion: '<rect x="2.5" y="4.5" width="7" height="7" opacity=".45"/><rect x="6.5" y="4.5" width="7" height="7"/>',
    grid: '<path d="M2.5 2.5h11v11h-11zM2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11"/>'
};

/** An icon as an element; `name` is one of the keys above (an unknown one gives an empty icon). */
export function Icon(name: string): HTMLElement {
    const span = El("span", "se-icon");
    span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Paths[name] || ""}</svg>`;
    return span;
}

export const IconNames = Object.keys(Paths);
