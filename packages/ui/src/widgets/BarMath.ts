/**
 * How wide a bar's fill is: the fraction filled of the room inside the track, in whole pixels so the edge of the fill stays on the pixel grid. A fraction
 * above 0 always shows at least one pixel (a nearly-dead character still shows a sliver), and only exactly 0 shows nothing. Pure.
 */
export function FillWidth(fraction: number, room: number): number {
    if (!(room > 0) || !(fraction > 0)) {
        return 0;
    }
    return Math.max(1, Math.min(room, Math.round(Math.min(1, fraction) * room)));
}
