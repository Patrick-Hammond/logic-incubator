// Laying the atlas's frames out on a template sheet: grouped, each group starting on a fresh row under a band of room for its heading, pieces on an 8-pixel grid with a gap
// between them, wrapping at the sheet's width. Pure - sizes in, positions out.

const GRID = 8;
const up = n => Math.ceil(n / GRID) * GRID;

/** The order states are listed in within a family (a button's normal, hover, pressed, disabled look side by side). */
export const StateOrder = ["normal", "empty", "inactive", "active", "off", "on", "hover", "pressed", "focused", "selected", "disabled"];

/** Splits `btn_primary_hover` into the family `btn_primary` and the state `hover`; names that don't end in a known state are their own family. */
export function SplitState(name) {
    const at = name.lastIndexOf("_");
    const state = at > 0 ? name.slice(at + 1) : "";
    return StateOrder.indexOf(state) >= 0 ? { family: name.slice(0, at), state } : { family: name, state: "" };
}

/** Orders names by family and then by state in `StateOrder` (unknown or no state first). */
export function CompareNames(a, b) {
    const x = SplitState(a), y = SplitState(b);
    if (x.family !== y.family) return x.family < y.family ? -1 : 1;
    return StateOrder.indexOf(x.state) - StateOrder.indexOf(y.state);
}

/**
 * Positions for `groups` (each { title, pieces: [{ name, width, height }] }) on a sheet `sheetWidth` wide: returns { height, placed: [{ name, x, y, width, height, group }], headings: [{ title, x, y }] }.
 * Each group gets a heading row of `headingHeight` (a multiple of 8) above its first row of pieces, which is left empty so the guide can label it.
 */
export function LayoutPieces(groups, sheetWidth, headingHeight = 16) {
    const placed = [];
    const headings = [];
    let y = GRID;
    groups.forEach(group => {
        if (!group.pieces.length) return;
        headings.push({ title: group.title, x: GRID, y });
        y += up(headingHeight);
        let x = GRID;
        let rowHeight = 0;
        group.pieces.forEach(piece => {
            if (x + piece.width > sheetWidth - GRID && x > GRID) {
                y += up(rowHeight) + GRID;
                x = GRID;
                rowHeight = 0;
            }
            placed.push({ name: piece.name, x, y, width: piece.width, height: piece.height, group: group.title });
            x += up(piece.width) + GRID;
            rowHeight = Math.max(rowHeight, piece.height);
        });
        y += up(rowHeight) + GRID * 2;
    });
    return { height: y, placed, headings };
}
