precision highp float;

uniform sampler2D uSrc;
uniform vec2 uDelta;

varying vec2 texCoord;
// varying vec2 screenCoord;

void main(void) {
  vec4 col = texture2D(uSrc, texCoord);
  gl_FragColor = vec4(col.rgb * 2.0 - vec3(0.4), 1.0);
}
