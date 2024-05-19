#extension GL_EXT_draw_buffers : require

precision highp float;
uniform float scale;
varying vec4 state;

void main() {
  gl_FragData[0] = vec4(fract(state.xy + 0.25) - 0.25, fract(state.xy - 0.25) + 0.25) * scale;
  gl_FragData[1] = vec4(1.0, 0.0, state.zw) * scale;
}
