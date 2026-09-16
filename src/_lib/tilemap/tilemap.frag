varying vec2 vTextureCoord;
varying vec4 vFrame;
varying float vTextureId;
varying float vAlpha;
varying vec3 vTint;
varying vec2 vFlicker;
uniform vec4 shadowColor;
uniform float tileAlpha;
uniform float time;
uniform sampler2D uSamplers[%count%];
uniform vec2 uSamplerSize[%count%];

// Cheap pseudo-random hash - good enough for a stepped flicker, not for anything
// that needs real distribution guarantees.
float hash(float n)
{
   return fract(sin(n) * 43758.5453123);
}

void main(void)
{
   vec2 textureCoord = clamp(vTextureCoord, vFrame.xy, vFrame.zw);
   float textureId = floor(vTextureId + 0.5);

   vec4 color;
   %forloop%

   // vFlicker.x is intensity (0 = steady), vFlicker.y is a per-tile seed so
   // different lights don't pulse in lockstep. Stepped + interpolated between
   // steps so it reads as an irregular flicker rather than a smooth wave -
   // entirely driven by the `time` uniform, so animating it costs one uniform
   // upload per frame, not a vertex buffer re-upload.
   float flickerT = time * 8.0 + vFlicker.y * 100.0;
   float flickerNoise = mix(hash(floor(flickerT)), hash(floor(flickerT) + 1.0), fract(flickerT));
   float brightness = 1.0 - vFlicker.x * flickerNoise * 0.4;

   gl_FragColor = color * vAlpha * tileAlpha * vec4(vTint * brightness, 1.0);
}
