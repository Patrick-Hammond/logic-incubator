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

/**
 * Where a texture's reflection is placed so its feet meet the feet it's drawn with: the y to hand `tile()` for it upside down,
 * given the `top` it's drawn at the right way up. `origHeight` is the texture's height before trimming, `trimY` how far down its
 * art starts in that (0 if untrimmed) and `frameHeight` the height of the art itself. `tile()` puts the art `trimY` below the y it's
 * given and turning it over keeps it in the same rows, so the reflection - mirrored about the texture's bottom edge,
 * `top + origHeight` - starts `trimY` above where its art should start.
 */
export function MirroredTop(top: number, origHeight: number, trimY: number, frameHeight: number): number {
    return top + 2 * origHeight - 2 * trimY - frameHeight;
}
