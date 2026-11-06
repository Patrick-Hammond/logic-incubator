/**
 * Turning what's drawn upside down for a reflection (see `ReflectionCapture`): it's mirrored top to bottom about its own bottom
 * edge, where it stands, so it hangs down from its feet into the water. Pure - no pixi - so it runs under the plain node test runner.
 */

/**
 * `light` - four corners' red, green and blue, top-left, top-right, bottom-right, bottom-left, as a tile's (see
 * `Lighting.CellCornerLight`) - upside down, into `out`: what lit its feet lights the top of its reflection, which is at its feet.
 */
export function MirroredLight(light: ArrayLike<number>, out: Float32Array): Float32Array {
    for (let channel = 0; channel < 3; channel++) {
        const topLeft = light[channel];
        const topRight = light[3 + channel];
        out[channel] = light[9 + channel];
        out[3 + channel] = light[6 + channel];
        out[6 + channel] = topRight;
        out[9 + channel] = topLeft;
    }
    return out;
}

/**
 * How something turned by `rotation` and flipped by `scaleX`, `scaleY` (as a sprite would be - see `TileMap.TileGD8Rotation`) is
 * drawn once it's mirrored top to bottom on the screen as well: flipped the other way up, and turned back the other way - a
 * rotation from 0 up to a whole turn.
 */
export function MirroredTurn(rotation: number, scaleX: number, scaleY: number): { rotation: number; scaleX: number; scaleY: number } {
    const turn = Math.PI * 2;
    const back = ((-rotation % turn) + turn) % turn;
    return { rotation: back, scaleX, scaleY: -scaleY };
}
