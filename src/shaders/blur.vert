precision highp float;
varying vec2 uv;
attribute vec2 xy;

void main() {
  uv = 0.5 + 0.5 * xy;
  gl_Position = vec4(xy, 0.0, 1.0);
}
