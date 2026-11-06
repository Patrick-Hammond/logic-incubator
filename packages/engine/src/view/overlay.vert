// One floor overlay cell (see OverlayLayer): a quad, the same four values of its cell at each corner but its light.
attribute vec2 aVertexPosition;
// This corner in the level file's own pixels - what the pattern is laid out on.
attribute vec2 aPattern;
// The cell's top-left corner, likewise.
attribute vec2 aCell;
// This corner's light, as a tile's (see Lighting.CellCornerLight).
attribute vec3 aLight;
// Alpha (how solid it's drawn, its reflection too), seed, reflectivity and joins (OverlayJoin bits). Not its kind: the fragment
// shader is built for one kind (see OverlayLayer).
attribute vec4 aLook;
attribute vec3 aTint;

uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
// The screen's size, in the units the stage is laid out in - what the reflections texture covers.
uniform vec2 uScreen;

varying vec2 vPattern;
varying vec2 vCell;
varying vec2 vScreen;
varying vec3 vLight;
varying vec4 vLook;
varying vec3 vTint;

void main(void)
{
    vec3 world = translationMatrix * vec3(aVertexPosition, 1.0);
    gl_Position = vec4((projectionMatrix * world).xy, 0.0, 1.0);
    vScreen = world.xy / uScreen;
    vPattern = aPattern;
    vCell = aCell;
    vLight = aLight;
    vLook = aLook;
    vTint = aTint;
}
