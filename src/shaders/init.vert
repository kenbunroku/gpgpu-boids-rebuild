precision highp float;
attribute vec2 aUV;
attribute vec4 aInitialState;
varying vec4 state;

void main() {
  state = aInitialState;
  gl_Position = vec4(aUV * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
