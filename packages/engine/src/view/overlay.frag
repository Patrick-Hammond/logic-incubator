precision highp float;
// Floor overlays (see Overlays, OverlayLayer): dirt, mud, water, slime, blood, moss and a shiny floor, made up pixel by pixel from
// each cell's kind and seed. Everything is worked out on the level's own pixel grid, a world pixel at a time, so an overlay is as
// blocky as the art round it. highp, because the pattern is laid out in the level's pixels, thousands across - on the first line,
// where pixi looks for it to step it down on a GPU without highp.
//
// KIND, the kind drawn, is defined under that first line by OverlayLayer (and UNLIT, for one multiplied into the floor): one
// program per kind, each only its own kind's code.
// A GPU runs every branch a group of pixels takes between them, and a software renderer every branch there is, so one program
// for all seven would cost each pixel all seven.

varying vec2 vPattern;
varying vec2 vCell;
varying vec2 vScreen;
varying vec3 vLight;
varying vec4 vLook;
varying vec3 vTint;

// What stands over the overlays, drawn upside down (see ReflectionCapture), and whether it's been drawn this frame.
uniform sampler2D uReflection;
uniform float uReflect;
// One world pixel, as a share of the reflections texture across and down.
uniform vec2 uPixel;
// Seconds, for what moves: ripples, bubbles.
uniform float uTime;
// The layer's alpha - its height band's fade.
uniform float uAlpha;
// A cell's size in world pixels.
uniform float uTile;

// The kinds, by their place in OverlayKinds.
#define DIRT 0
#define MUD 1
#define WATER 2
#define SLIME 3
#define BLOOD 4
#define MOSS 5
#define SHINY 6

// How round a patch's outer corners are, in pixels.
const float CORNER = 6.0;

// A number from 0 to 1 for each point - the same point, the same number, on any GPU (no sin(), which some do badly far from 0).
float Hash(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Smooth value noise, from 0 to 1.
float Noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(Hash(i), Hash(i + vec2(1.0, 0.0)), u.x), mix(Hash(i + vec2(0.0, 1.0)), Hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Three octaves of it - lumpier, still about 0 to 1.
float Fbm(vec2 p)
{
    return Noise(p) * 0.5 + Noise(p * 2.07 + 13.7) * 0.3 + Noise(p * 4.13 + 41.3) * 0.2;
}

// How far in from the edge of its patch an overlay's shore runs at `q`, from 0 to `reach` pixels - noise spread out to its full
// range, so a shore wanders right up to the painted edge in places and well inside it in others.
float Shore(vec2 q, float scale, float reach)
{
    return clamp((Fbm(q / scale) - 0.3) / 0.4, 0.0, 1.0) * reach;
}

bool Joined(float joins, float bit)
{
    return mod(floor(joins / bit), 2.0) > 0.5;
}

// How far, in pixels, the point `l` in its cell (0 to uTile each way) is from the edge of its patch - past every side and corner
// the patch doesn't carry on through (see OverlayJoin). Its outer corners are rounded; its inner corners come out round anyway.
float EdgeDistance(vec2 l, float joins)
{
    bool n = Joined(joins, 1.0);
    bool ne = Joined(joins, 2.0);
    bool e = Joined(joins, 4.0);
    bool se = Joined(joins, 8.0);
    bool s = Joined(joins, 16.0);
    bool sw = Joined(joins, 32.0);
    bool w = Joined(joins, 64.0);
    bool nw = Joined(joins, 128.0);
    vec2 r = vec2(uTile) - l;
    float d = 1000.0;
    if (!n) d = min(d, l.y);
    if (!e) d = min(d, r.x);
    if (!s) d = min(d, r.y);
    if (!w) d = min(d, l.x);
    if (n && w && !nw) d = min(d, length(l));
    if (n && e && !ne) d = min(d, length(vec2(r.x, l.y)));
    if (s && e && !se) d = min(d, length(r));
    if (s && w && !sw) d = min(d, length(vec2(l.x, r.y)));
    vec2 c = vec2(CORNER);
    if (!n && !w) d = min(d, CORNER - length(max(c - l, 0.0)));
    if (!n && !e) d = min(d, CORNER - length(max(c - vec2(r.x, l.y), 0.0)));
    if (!s && !e) d = min(d, CORNER - length(max(c - r, 0.0)));
    if (!s && !w) d = min(d, CORNER - length(max(c - vec2(l.x, r.y), 0.0)));
    return d;
}

void main(void)
{
    float seed = vLook.y;
    float reflectivity = vLook.z;
    float joins = floor(vLook.w + 0.5);

    // The middle of the world pixel this fragment is in - kept inside its own cell, which a quad's edge can round past.
    vec2 local = clamp(floor(vPattern - vCell) + 0.5, 0.5, uTile - 0.5);
    vec2 pixel = vCell + local;
    // The seed moves the pattern somewhere else entirely.
    vec2 q = pixel + vec2(Hash(vec2(seed, 3.17)), Hash(vec2(7.91, seed))) * 1024.0;
    float edge = EdgeDistance(local, joins);
    float t = uTime;

    vec3 colour = vTint;
    float alpha = 0.0;
    // How much of the reflection shows where this pixel is: over the overlay's body, or (shiny) everywhere it's painted.
    float mirror = 0.0;
    // How far the reflection wavers either way, in pixels.
    float wave = 0.0;
    // What the reflection's tinted towards.
    vec3 mirrorTint = vec3(1.0);

#if KIND == DIRT
    {
        float body = edge - Shore(q, 10.0, 9.0);
        float clumps = Fbm(q / 14.0 + 5.0);
        if (body > 0.0 && clumps > 0.36)
        {
            float tone = floor(Fbm(q / 5.0) * 4.0) / 4.0;
            colour = vTint * (0.7 + 0.5 * tone);
            alpha = body > 2.0 ? 0.85 : 0.6;
            mirror = 1.0;
        }
        else if (edge > 0.0 && Hash(pixel + seed) > 0.965)
        {
            // Crumbs, loose round it.
            colour = vTint * 0.8;
            alpha = 0.8;
        }
    }
#elif KIND == MUD
    {
        float body = edge - Shore(q, 11.0, 7.0);
        if (body > 0.0)
        {
            float tone = Fbm(q / 6.0);
            colour = vTint * (tone > 0.58 ? 1.2 : tone < 0.4 ? 0.78 : 1.0);
            alpha = body > 1.5 ? 0.92 : 0.7;
            // A wet glint here and there.
            if (Hash(floor(q / 3.0)) > 0.97 && Hash(pixel + 1.0) > 0.5)
            {
                colour = mix(colour, vec3(1.0), 0.35);
            }
            mirror = 1.0;
            wave = 0.5;
        }
    }
#elif KIND == WATER
    {
        float body = edge - Shore(q, 11.0, 8.0);
        if (body > 0.0)
        {
            // Shallow at the rim, deeper further in, in three steps.
            float depth = floor(clamp(body / 6.0, 0.0, 1.0) * 3.0) / 3.0;
            colour = mix(vTint * 1.3, vTint * 0.8, depth);
            alpha = 0.4 + 0.25 * depth;
            // Ripples: short bright dashes drifting across.
            float ripple = Noise(vec2(q.x / 7.0 + t * 0.35, q.y / 2.5 - t * 0.12));
            if (ripple > 0.76)
            {
                colour = mix(colour, vec3(0.85, 0.95, 1.0), 0.55);
                alpha = max(alpha, 0.7);
            }
            if (body < 1.2)
            {
                // A pale line where it laps at the floor.
                colour = mix(colour, vec3(0.8, 0.9, 1.0), 0.5);
                alpha = 0.6;
            }
            mirror = 1.0;
            wave = 1.0;
            mirrorTint = mix(vec3(1.0), clamp(vTint * 2.0, 0.0, 1.0), 0.35);
        }
    }
#elif KIND == SLIME
    {
        float body = edge - Shore(q, 9.0, 8.0);
        if (body > 0.0)
        {
            // Darker where it's thick, slowly churning.
            float blotch = Fbm(q / 7.0 + vec2(t * 0.06, t * 0.03));
            colour = vTint * (blotch > 0.58 ? 0.75 : blotch < 0.38 ? 1.15 : 1.0);
            alpha = 0.82;
            if (body < 1.3)
            {
                // A bright lip.
                colour = vTint * 1.3;
                alpha = 0.95;
            }
            else if (body > 3.0)
            {
                // Now and then a bubble, swelling for a while and popping, one to a 9 pixel square at most.
                vec2 square = floor(q / 9.0);
                float h = Hash(square);
                if (h > 0.72)
                {
                    float phase = fract(t * (0.18 + h * 0.25) + h * 7.0);
                    vec2 centre = square * 9.0 + 2.5 + floor(vec2(Hash(square + 1.7), Hash(square + 9.2)) * 4.0);
                    vec2 off = q - centre;
                    float radius = 0.6 + phase * 1.4;
                    float from = length(off);
                    if (phase < 0.94 && from < radius + 0.5)
                    {
                        // Its skin, and a glint at its top left.
                        colour = vTint * (from > radius - 0.5 ? 1.45 : 1.1);
                        alpha = 0.95;
                        if (off.x < -0.4 && off.y < -0.4 && from < radius)
                        {
                            colour = mix(vTint, vec3(1.0), 0.6);
                        }
                    }
                }
            }
            mirror = 1.0;
            wave = 0.5;
            mirrorTint = mix(vec3(1.0), clamp(vTint * 1.5, 0.0, 1.0), 0.5);
        }
    }
#elif KIND == BLOOD
    {
        float body = edge - Shore(q, 7.0, 10.0);
        // Splashed, not poured: gaps right through the middle of it.
        float splash = Fbm(q / 9.0 + 3.0);
        if (body > 1.0 && splash > 0.4)
        {
            colour = vTint * (Fbm(q / 4.0) > 0.6 ? 0.65 : 1.0);
            alpha = splash > 0.46 && body > 2.5 ? 0.9 : 0.7;
            mirror = 1.0;
            mirrorTint = mix(vec3(1.0), clamp(vTint * 2.0, 0.0, 1.0), 0.5);
        }
        else if (edge > 0.0 && body > -5.0 && Hash(floor(q / 2.0)) > 0.93)
        {
            // Drops flung round it, two pixels square.
            colour = vTint;
            alpha = 0.85;
        }
    }
#elif KIND == MOSS
    {
        float body = edge - Shore(q, 10.0, 9.0);
        float grow = Fbm(q / 5.0);
        // Ragged pixel by pixel at its edges, like a fuzz.
        if (body > 0.0 && grow + Hash(pixel) * 0.25 > 0.5)
        {
            colour = vTint * (grow > 0.62 ? 1.25 : 0.85);
            alpha = 0.9;
            mirror = 1.0;
        }
    }
#elif KIND == SHINY
    {
        if (edge > 0.0)
        {
            // Nothing of its own but a faint sheen in long diagonal streaks, and the reflection.
            float streak = fract((pixel.x + pixel.y) / 48.0 + Hash(vec2(seed, 1.0)));
            if (streak < 0.08)
            {
                colour = vec3(1.0);
                alpha = 0.06;
            }
            mirror = 1.0;
            mirrorTint = vTint;
        }
    }
#endif

    // Lit as the floor under it is; what it mirrors was lit where it stands. Multiplied into the floor (UNLIT), it isn't: the floor's
    // lit already, and its colour darkens it as it is, shadows and all.
#if UNLIT
    vec4 result = vec4(colour * alpha, alpha);
#else
    vec4 result = vec4(colour * vLight * alpha, alpha);
#endif
    if (uReflect > 0.5 && reflectivity > 0.0 && mirror > 0.0)
    {
        float sway = wave * floor(sin(pixel.y * 0.8 + t * 2.5) * 1.5 + 0.5);
        // Sampled at the middle of this world pixel, so the reflection is as blocky as the rest.
        vec2 at = vScreen + (pixel - vPattern + vec2(sway, 0.0)) * uPixel;
        vec4 mirrored = texture2D(uReflection, at);
        float k = reflectivity * mirror;
        result = result * (1.0 - mirrored.a * k) + vec4(mirrored.rgb * mirrorTint, mirrored.a) * k;
    }
    // Faded as its brush says, and as its height band is.
    gl_FragColor = result * vLook.x * uAlpha;
}
