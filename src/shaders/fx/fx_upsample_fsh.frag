// https://www.shadertoy.com/view/3td3W8
precision highp float;

uniform vec3 uResolution;
uniform sampler2D uSrc;

varying vec2 texCoord;

void main() {
  vec2 uv = vec2(texCoord.xy / (uResolution.xy * 2.0));
  vec2 halfpixel = 0.5 / (uResolution.xy * 2.0);
  float offset = 3.0;

  vec4 sum = texture2D(uSrc, uv + vec2(-halfpixel.x * 2.0, 0.0) * offset);

  sum += texture2D(uSrc, uv + vec2(-halfpixel.x, halfpixel.y) * offset) * 2.0;
  sum += texture2D(uSrc, uv + vec2(0.0, halfpixel.y * 2.0) * offset);
  sum += texture2D(uSrc, uv + vec2(halfpixel.x, halfpixel.y) * offset) * 2.0;
  sum += texture2D(uSrc, uv + vec2(halfpixel.x * 2.0, 0.0) * offset);
  sum += texture2D(uSrc, uv + vec2(halfpixel.x, -halfpixel.y) * offset) * 2.0;
  sum += texture2D(uSrc, uv + vec2(0.0, -halfpixel.y * 2.0) * offset);
  sum += texture2D(uSrc, uv + vec2(-halfpixel.x, -halfpixel.y) * offset) * 2.0;

  gl_FragColor = sum / 12.0;
}
