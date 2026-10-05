/**
 * The text of a text field as the page's own input element reports it - the value and the selection - and what the kit does with it: keeping it to the characters and length the
 * field allows (an edit that breaks the rule is cut back, and the field tells the native input so), working out where the selection and caret are on screen, and how far the
 * text has to scroll to keep the caret in view. The native input does the editing (typing, IME, clipboard, undo); this only follows it. Pure.
 */

export type TextState = { value: string; start: number; end: number };

export type TextRules = {
    /** The most characters the field holds. */
    maxLength?: number;
    /** Characters it doesn't accept (a name field with no punctuation): tested on one character at a time. */
    allowed?: RegExp;
};

/** The state with every disallowed character removed and the value cut to `maxLength`, the selection moved to follow (and kept inside the new value). */
export function Sanitise(state: TextState, rules: TextRules): TextState {
    let value = "";
    let start = state.start, end = state.end;
    for (let i = 0; i < state.value.length; i++) {
        const ch = state.value[i];
        if (rules.allowed && !rules.allowed.test(ch)) {
            if (i < state.start) start--;
            if (i < state.end) end--;
            continue;
        }
        value += ch;
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        value = value.slice(0, rules.maxLength);
    }
    start = Math.max(0, Math.min(value.length, start));
    end = Math.max(0, Math.min(value.length, end));
    return { value, start: Math.min(start, end), end: Math.max(start, end) };
}

/** Whether two states are the same text and selection. */
export function SameState(a: TextState, b: TextState): boolean {
    return a.value === b.value && a.start === b.start && a.end === b.end;
}

/** The selection as a span of x positions (the width of the text before it, and up to its end), or null for a caret with nothing selected. */
export function SelectionSpan(state: TextState, measure: (text: string) => number): { x0: number; x1: number } | null {
    if (state.start === state.end) {
        return null;
    }
    return { x0: measure(state.value.slice(0, state.start)), x1: measure(state.value.slice(0, state.end)) };
}

/** The caret's x: the width of the text before it (before the selection's end, so extending a selection to the right moves it). */
export function CaretX(state: TextState, measure: (text: string) => number): number {
    return measure(state.value.slice(0, state.end));
}

/** How far the text should be scrolled left so that the caret at `caretX` stays inside a field `viewWidth` wide (with `margin` to spare), moving as little as it can from `current`. */
export function CaretScroll(caretX: number, viewWidth: number, current: number, margin = 2): number {
    if (caretX - current > viewWidth - margin) {
        return caretX - (viewWidth - margin);
    }
    if (caretX - current < margin) {
        return Math.max(0, caretX - margin);
    }
    return current;
}
