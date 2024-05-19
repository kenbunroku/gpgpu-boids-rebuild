precision highp float;
uniform float scale;
varying vec4 state;

void main() {
  gl_FragColor = vec4(1.0, 0.0, state.zw) * scale;
}
