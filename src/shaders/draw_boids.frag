precision highp float;
uniform float alpha;
uniform float tick;
varying vec2 vPosition;

void main() {
  float dist = length(vPosition);
  float cos = cos(tick * 0.5) * 0.5 + 0.5;
  float green = clamp(cos / dist, 0.0, 1.0);
  gl_FragColor = vec4(vPosition.x, green, vPosition.y, alpha);
}
