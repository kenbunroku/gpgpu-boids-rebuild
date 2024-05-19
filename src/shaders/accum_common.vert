precision highp float;
attribute vec2 uv;
uniform sampler2D positions;
varying vec4 state;

void main() {
  state = texture2D(positions, uv.xy);
  gl_Position = vec4(state.xy * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
