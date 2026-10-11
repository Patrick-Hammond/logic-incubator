/** Where a step from `index` lands among `count` choices: going round past either end when `wrap` is set, stopping at the ends otherwise (-1 when there are none). Pure. */
export function StepChoice(index: number, step: number, count: number, wrap: boolean): number {
    if (count <= 0) return -1;
    const next = index + step;
    return wrap ? ((next % count) + count) % count : Math.max(0, Math.min(count - 1, next));
}
