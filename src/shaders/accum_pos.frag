precision highp float;
uniform float scale;
varying vec4 state;

void main() {
  gl_FragColor = vec4(fract(state.xy + 0.25) - 0.25, fract(state.xy - 0.25) + 0.25) * scale;
}
