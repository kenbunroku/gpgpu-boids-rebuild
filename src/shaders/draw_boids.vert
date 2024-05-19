precision highp float;
attribute vec2 uv;
uniform sampler2D positions;
varying vec2 vPosition;

void main() {
  vec2 state = texture2D(positions, uv.xy).xy;
  vec2 pos = state * 2.0 - 1.0;
  vPosition = state + 0.1;
  gl_Position = vec4(pos, 0.0, 1.0);
  gl_PointSize = 1.0;
}
