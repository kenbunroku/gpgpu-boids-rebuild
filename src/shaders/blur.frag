  /*
   * https://github.com/Jam3/glsl-fast-gaussian-blur
   *
   * The MIT License (MIT)
   * Copyright (c) 2015 Jam3
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
   * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
   * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
   * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
   * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
   * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
   * OR OTHER DEALINGS IN THE SOFTWARE.
   */

precision highp float;
varying vec2 uv;
uniform sampler2D src1, src2;
uniform vec2 direction, inverseResolution;

vec4 blur(sampler2D image, vec2 uv, vec2 inverseResolution, vec2 direction) {
  vec4 color = vec4(0.0);
  vec2 off1 = vec2(1.411764705882353) * direction;
  vec2 off2 = vec2(3.2941176470588234) * direction;
  vec2 off3 = vec2(5.176470588235294) * direction;
  color += texture2D(image, uv) * 0.1964825501511404;
  color += texture2D(image, uv + (off1 * inverseResolution)) * 0.2969069646728344;
  color += texture2D(image, uv - (off1 * inverseResolution)) * 0.2969069646728344;
  color += texture2D(image, uv + (off2 * inverseResolution)) * 0.09447039785044732;
  color += texture2D(image, uv - (off2 * inverseResolution)) * 0.09447039785044732;
  color += texture2D(image, uv + (off3 * inverseResolution)) * 0.010381362401148057;
  color += texture2D(image, uv - (off3 * inverseResolution)) * 0.010381362401148057;
  return color;
}

void main() {
  gl_FragColor = blur(src1, uv, inverseResolution, direction);
}
