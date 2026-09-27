varying vec2 vTextureCoord;
varying vec2 vBackdropCoord;

uniform sampler2D uSampler;
uniform sampler2D uBackdrop;
uniform vec4 uBackdropClamp;

// W3C compositing "overlay": multiply where the backdrop is dark, screen where it's light.
vec3 Overlay(vec3 backdrop, vec3 source)
{
    vec3 multiply = 2.0 * backdrop * source;
    vec3 screen = 1.0 - 2.0 * (1.0 - backdrop) * (1.0 - source);
    return mix(multiply, screen, step(0.5, backdrop));
}

void main(void)
{
    // Both samples are premultiplied alpha.
    vec4 source = texture2D(uSampler, vTextureCoord);

    float inside = step(3.5,
        step(uBackdropClamp.x, vBackdropCoord.x) +
        step(uBackdropClamp.y, vBackdropCoord.y) +
        step(vBackdropCoord.x, uBackdropClamp.z) +
        step(vBackdropCoord.y, uBackdropClamp.w));
    vec4 backdrop = texture2D(uBackdrop, vBackdropCoord) * inside;

    vec3 sourceColor = source.rgb / max(source.a, 0.0001);
    vec3 backdropColor = backdrop.rgb / max(backdrop.a, 0.0001);

    // Where there's no backdrop the source shows through unblended.
    vec3 blended = mix(sourceColor, Overlay(backdropColor, sourceColor), backdrop.a);

    gl_FragColor = vec4(blended * source.a, source.a);
}
