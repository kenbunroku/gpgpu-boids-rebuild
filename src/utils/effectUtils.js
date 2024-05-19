import { createShader, useShader, unuseShader } from "./webglUtils";

export function createEffectProgram(gl, vtxsrc, frgsrc, exunifs, exattrs) {
  const ret = {};
  let unifs = ["uResolution", "uSrc", "uDelta"];
  if (exunifs) {
    unifs = unifs.concat(exunifs);
  }
  let attrs = ["aPosition"];
  if (exattrs) {
    attrs = attrs.concat(exattrs);
  }

  ret.program = createShader(gl, vtxsrc, frgsrc, unifs, attrs);
  useShader(gl, ret.program);

  ret.dataArray = new Float32Array([
    -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0,
  ]);
  ret.buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ret.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, ret.dataArray, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  unuseShader(gl, ret.program);

  return ret;
}

export function useEffect(gl, fxobj, srctex, renderSpecArray) {
  const prog = fxobj.program;
  useShader(gl, prog);
  gl.uniform3fv(prog.uniforms.uResolution, renderSpecArray);

  if (srctex != null) {
    gl.uniform2fv(prog.uniforms.uDelta, srctex.dtxArray);
    gl.uniform1i(prog.uniforms.uSrc, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srctex.texture);
  }
}

export function drawEffect(gl, fxobj) {
  gl.bindBuffer(gl.ARRAY_BUFFER, fxobj.buffer);
  gl.vertexAttribPointer(
    fxobj.program.attributes.aPosition,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function unuseEffect(gl, fxobj) {
  unuseShader(gl, fxobj.program);
}
