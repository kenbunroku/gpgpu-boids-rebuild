precision highp float;
varying vec2 uv;
uniform sampler2D src;
uniform float gamma, offset, scale;

void main() {
  vec3 color = max(offset + scale * texture2D(src, uv).rgb, vec3(0));
  gl_FragColor = vec4(pow(color.r, gamma), pow(color.g, gamma), // Save some 'pow' calls since only grayscale right now
  pow(color.b, gamma), 1.0);
}
