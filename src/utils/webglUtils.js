export function createRenderTarget(gl, w, h, canWriteToFloat) {
  const ret = {
    width: w,
    height: h,
    sizeArray: new Float32Array([w, h, w / h]),
    dtxArray: new Float32Array([1.0 / w, 1.0 / h]),
  };
  ret.frameBuffer = gl.createFramebuffer();
  ret.renderBuffer = gl.createRenderbuffer();
  ret.texture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, ret.texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    w,
    h,
    0,
    gl.RGBA,
    canWriteToFloat ? gl.FLOAT : gl.HALF_FLOAT_OES,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MAG_FILTER,
    canWriteToFloat ? gl.LINEAR : gl.NEAREST
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    canWriteToFloat ? gl.LINEAR : gl.NEAREST
  );

  gl.bindFramebuffer(gl.FRAMEBUFFER, ret.frameBuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    ret.texture,
    0
  );

  gl.bindRenderbuffer(gl.RENDERBUFFER, ret.renderBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER,
    ret.renderBuffer
  );

  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return ret;
}

export function createDeferredRenderTarget(
  gl,
  w,
  h,
  canWriteToFloat,
  numOfColorBuffers,
  ext = gl.getExtension("WEBGL_draw_buffers")
) {
  const ret = {
    width: w,
    height: h,
    sizeArray: new Float32Array([w, h, w / h]),
    dtxArray: new Float32Array([1.0 / w, 1.0 / h]),
  };
  ret.frameBuffer = gl.createFramebuffer();
  ret.renderBuffer = gl.createRenderbuffer();
  ret.textures = [];
  const drawbuffers = [];

  gl.bindFramebuffer(gl.FRAMEBUFFER, ret.frameBuffer);
  for (let i = 0; i < numOfColorBuffers; i++) {
    ret.textures.push(gl.createTexture());

    gl.bindTexture(gl.TEXTURE_2D, ret.textures[i]);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      canWriteToFloat ? gl.FLOAT : gl.HALF_FLOAT_OES,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      canWriteToFloat ? gl.LINEAR : gl.NEAREST
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      canWriteToFloat ? gl.LINEAR : gl.NEAREST
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      ext.COLOR_ATTACHMENT0_WEBGL + i,
      gl.TEXTURE_2D,
      ret.textures[i],
      0
    );

    drawbuffers.push(ext.COLOR_ATTACHMENT0_WEBGL + i);
  }

  ret.drawBuffers = drawbuffers;

  return ret;
}

export function deleteRenderTarget(gl, rt) {
  if (!rt) return;
  gl.deleteFramebuffer(rt.frameBuffer);
  gl.deleteRenderbuffer(rt.renderBuffer);
  gl.deleteTexture(rt.texture);
}

function _compileShader(gl, shtype, shsrc) {
  var retsh = gl.createShader(shtype);

  gl.shaderSource(retsh, shsrc);
  gl.compileShader(retsh);

  if (!gl.getShaderParameter(retsh, gl.COMPILE_STATUS)) {
    var errlog = gl.getShaderInfoLog(retsh);
    gl.deleteShader(retsh);
    console.error(errlog);
    return null;
  }
  return retsh;
}

export function createShader(gl, vtxsrc, frgsrc, uniformlist, attrlist) {
  var vsh = _compileShader(gl, gl.VERTEX_SHADER, vtxsrc);
  var fsh = _compileShader(gl, gl.FRAGMENT_SHADER, frgsrc);

  if (vsh == null || fsh == null) {
    return null;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);

  gl.deleteShader(vsh);
  gl.deleteShader(fsh);

  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    var errlog = gl.getProgramInfoLog(prog);
    console.error(errlog);
    return null;
  }

  if (uniformlist) {
    prog.uniforms = {};
    for (let i = 0; i < uniformlist.length; i++) {
      prog.uniforms[uniformlist[i]] = gl.getUniformLocation(
        prog,
        uniformlist[i]
      );
    }
  }

  if (attrlist) {
    prog.attributes = {};
    for (let i = 0; i < attrlist.length; i++) {
      const attr = attrlist[i];
      prog.attributes[attr] = gl.getAttribLocation(prog, attr);
    }
  }

  return prog;
}

export function useShader(gl, prog) {
  gl.useProgram(prog);
  for (let attr in prog.attributes) {
    gl.enableVertexAttribArray(prog.attributes[attr]);
  }
}

export function unuseShader(gl, prog) {
  for (let attr in prog.attributes) {
    gl.disableVertexAttribArray(prog.attributes[attr]);
  }
  gl.useProgram(null);
}

export function createTextureLookupTable(w, h, stride) {
  stride = stride || 2;
  const n = w * h * stride;

  let out = new Float32Array(n);

  for (let i = 0, iStride = 0; iStride < n; i++, iStride += stride) {
    out[iStride] = ((i % w) + 0.5) / w;
    out[iStride + 1] = (((i / w) | 0) + 0.5) / h;
  }

  return out;
}
