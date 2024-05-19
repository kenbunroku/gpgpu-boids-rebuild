import { Pane } from "tweakpane";
import {
  createShader,
  createRenderTarget,
  deleteRenderTarget,
  useShader,
  unuseShader,
  createTextureLookupTable,
} from "../utils/webglUtils";
import {
  createEffectProgram,
  useEffect,
  drawEffect,
  unuseEffect,
} from "../utils/effectUtils";

// shaders
import initvert from "../shaders/init.vert";
import initfrag from "../shaders/init.frag";
import accum_common_vert from "../shaders/accum_common.vert";
import accum_pos_frag from "../shaders/accum_pos.frag";
import accum_pos_velo from "../shaders/accum_pos_velo.frag";
import accum_den_velo from "../shaders/accum_den_velo.frag";
import blur_vert from "../shaders/blur.vert";
import blur_frag from "../shaders/blur.frag";
import draw_boids_vert from "../shaders/draw_boids.vert";
import draw_boids_frag from "../shaders/draw_boids.frag";
import iterate_frag from "../shaders/iterate.frag";
import copy_frag from "../shaders/copy.frag";
import fx_common_vsh from "../shaders/fx/fx_common_vsh.vert";
import fx_brightbuf_fsh from "../shaders/fx/fx_brightbuf_fsh.frag";
import fx_dirblur_r4_fsh from "../shaders/fx/fx_dirblur_r4_fsh.frag";
import fx_downsample_fsh from "../shaders/fx/fx_downsample_fsh.frag";
import fx_upsample_fsh from "../shaders/fx/fx_upsample_fsh.frag";
import pp_final_vsh from "../shaders/post_processing/pp_final_vsh.vert";
import pp_final_fsh from "../shaders/post_processing/pp_final_fsh.frag";

let gl, canvas;
let canWriteToFloat = false;
let drawBuffersExt;
let sceneStandBy = false;
const timeInfo = {
  start: 0,
  prev: 0,
  delta: 0,
  elapsed: 0,
};

const boidsParams = {
  textureSize: 512,
  separation: 0.5,
  cohesion: 0.8,
  alignment: 0.4,
  velocityEnforcement: 0.5,
  leading: 1.0,
  randomness: 1.0,
  dt: 0.0004,
  gamma: 1,
  opacity: 0.6,
};

const blurParams = {
  gridSize: 512,
  blurStencil: [
    { label: "5px", value: 0 },
    { label: "9px", value: 1 },
    { label: "13px", value: 2 },
  ],
};

const renderSpec = {
  width: 0,
  height: 0,
  aspect: 1,
  array: new Float32Array(3),
  halfWidth: 0,
  halfHeight: 0,
  halfArray: new Float32Array(3),
  quarterWidth: 0,
  quarterHeight: 0,
  quarterArray: new Float32Array(3),
  eighthWidth: 0,
  eighthHeight: 0,
  eighthArray: new Float32Array(3),
};
renderSpec.setSize = function (w, h) {
  renderSpec.width = w;
  renderSpec.height = h;
  renderSpec.aspect = renderSpec.width / renderSpec.height;
  renderSpec.array[0] = renderSpec.width;
  renderSpec.array[1] = renderSpec.height;
  renderSpec.array[2] = renderSpec.aspect;

  renderSpec.halfWidth = Math.floor(w / 2);
  renderSpec.halfHeight = Math.floor(h / 2);
  renderSpec.halfArray[0] = renderSpec.halfWidth;
  renderSpec.halfArray[1] = renderSpec.halfHeight;
  renderSpec.halfArray[2] = renderSpec.halfWidth / renderSpec.halfHeight;

  renderSpec.quarterWidth = Math.floor(w / 4);
  renderSpec.quarterHeight = Math.floor(h / 4);
  renderSpec.quarterArray[0] = renderSpec.quarterWidth;
  renderSpec.quarterArray[1] = renderSpec.quarterHeight;
  renderSpec.quarterArray[2] =
    renderSpec.quarterWidth / renderSpec.quarterHeight;

  renderSpec.eighthWidth = Math.floor(w / 8);
  renderSpec.eighthHeight = Math.floor(h / 8);
  renderSpec.eighthArray[0] = renderSpec.eighthWidth;
  renderSpec.eighthArray[1] = renderSpec.eighthHeight;
  renderSpec.eighthArray[2] = renderSpec.eighthWidth / renderSpec.eighthHeight;

  renderSpec.textureWidth = boidsParams.textureSize;
  renderSpec.textureHeight = boidsParams.textureSize;
  renderSpec.gridSize = blurParams.gridSize;
};

let uv;
const xy = new Float32Array([-4, -4, 4, -4, 0, 4]);

const boids = {};
async function createBoids() {
  const vtxsrc = initvert;
  const fragsrc = initfrag;
  boids.program = createShader(
    gl,
    vtxsrc,
    fragsrc,
    [],
    ["aInitialState", "aUV"]
  );
  useShader(gl, boids.program);

  // Calculate initial state
  const v = 0.5;

  boids.numOfBoids = (await boidsParams.textureSize) * boidsParams.textureSize; // Ensure this is recalculated
  boids.initialState = new Float32Array(boids.numOfBoids * 4);
  for (let i4 = 0; i4 < boids.initialState.length; i4 += 4) {
    const theta = Math.random() * Math.PI * 2;
    const r = 0.285 * Math.pow(Math.random(), 0.3);
    boids.initialState[i4] = 0.5 + r * Math.cos(theta);
    boids.initialState[i4 + 1] = 0.5 + r * Math.sin(theta);
    boids.initialState[i4 + 2] = (Math.random() * 2 - 1) * v;
    boids.initialState[i4 + 3] = (Math.random() * 2 - 1) * v;
  }

  // Recreate buffer for initial state
  if (boids.buffer) {
    gl.deleteBuffer(boids.buffer); // Delete the old buffer if it exists
  }
  boids.buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, boids.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, boids.initialState, gl.DYNAMIC_DRAW);

  // Create a separate buffer for UV
  if (boids.uvBuffer) {
    gl.deleteBuffer(boids.uvBuffer); // Delete the old buffer if it exists
  }
  uv = await createTextureLookupTable(
    boidsParams.textureSize,
    boidsParams.textureSize,
    2
  );
  boids.uvBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, boids.uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.DYNAMIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  unuseShader(gl, boids.program);
}

function renderBoids() {
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.STENCIL_TEST);

  // initial state
  useShader(gl, boids.program);

  // Bind and set up the initial state buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, boids.buffer);
  gl.vertexAttribPointer(
    boids.program.attributes.aInitialState,
    4,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(boids.program.attributes.aInitialState);

  // Bind and set up the UV buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, boids.uvBuffer);
  gl.vertexAttribPointer(
    boids.program.attributes.aUV,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(boids.program.attributes.aUV);

  // Draw the boids
  gl.drawArrays(gl.POINTS, 0, boids.numOfBoids);

  unuseShader(gl, boids.program);
}

function createSimProgram(vtxsrc, frgsrc, unifs, attrs) {
  const ret = {};

  ret.program = createShader(gl, vtxsrc, frgsrc, unifs, attrs);

  if (attrs.includes("uv")) {
    useShader(gl, ret.program);
    if (ret.buffer) {
      gl.deleteBuffer(ret.buffer);
    }
    ret.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ret.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    unuseShader(gl, ret.program);
  }

  return ret;
}

const simulationLib = {};
async function createSimulationLib() {
  let vtxsrc, frgsrc;

  const cmnvtxsrc = accum_common_vert;

  // accumulation of position
  frgsrc = accum_pos_frag;
  simulationLib.accumPos = createSimProgram(
    cmnvtxsrc,
    frgsrc,
    ["positions", "scale"],
    ["uv"]
  );

  // accumulation of density and velocity
  frgsrc = accum_den_velo;
  simulationLib.accumDenVelo = createSimProgram(
    cmnvtxsrc,
    frgsrc,
    ["positions", "scale"],
    ["uv"]
  );

  // accumulation of position and velocity
  frgsrc = accum_pos_velo;
  simulationLib.accumPosVelo = createSimProgram(
    cmnvtxsrc,
    frgsrc,
    ["positions", "scale"],
    ["uv"]
  );

  // blur
  vtxsrc = blur_vert;
  frgsrc = blur_frag;
  simulationLib.blur = {};
  simulationLib.blur.program = createShader(
    gl,
    vtxsrc,
    frgsrc,
    ["inverseResolution", "src1", "src2", "direction"],
    ["xy"]
  );

  if (simulationLib.blur.buffer) {
    gl.deleteBuffer(simulationLib.blur.buffer);
  }
  simulationLib.blur.buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.blur.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, xy, gl.DYNAMIC_DRAW);

  // iterate
  vtxsrc = blur_vert;
  frgsrc = iterate_frag;
  simulationLib.iterate = {};
  simulationLib.iterate.program = createShader(
    gl,
    vtxsrc,
    frgsrc,
    [
      "uRandomness",
      "uRand",
      "uCohesion",
      "uSeparation",
      "uVelocityEnforcement",
      "uAlignment",
      "uLeading",
      "inverseResolution",
      "src",
      "position",
      "densityVelocity",
      "dt",
    ],
    ["xy"]
  );
  if (simulationLib.iterate.buffer) {
    gl.deleteBuffer(simulationLib.iterate.buffer);
  }
  simulationLib.iterate.buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.iterate.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, xy, gl.DYNAMIC_DRAW);

  // draw boids
  vtxsrc = draw_boids_vert;
  frgsrc = draw_boids_frag;
  simulationLib.drawBoids = createSimProgram(
    vtxsrc,
    frgsrc,
    ["positions", "alpha", "tick"],
    ["uv"]
  );

  // final
  vtxsrc = blur_vert;
  frgsrc = copy_frag;
  simulationLib.copy = {};
  simulationLib.copy.program = createShader(
    gl,
    vtxsrc,
    frgsrc,
    ["src", "gamma", "offset", "scale"],
    ["xy"]
  );
  if (simulationLib.copy.buffer) {
    gl.deleteBuffer(simulationLib.copy.buffer);
  }
  simulationLib.copy.buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.copy.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, xy, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

const effectLib = {};
function createEffectLib() {
  let vtxsrc, frgsrc;

  const cmnvtxsrc = fx_common_vsh;

  // brightpixels buffer
  frgsrc = fx_brightbuf_fsh;
  effectLib.mkBrightBuf = createEffectProgram(
    gl,
    cmnvtxsrc,
    frgsrc,
    null,
    null
  );

  // direction blur
  frgsrc = fx_dirblur_r4_fsh;
  effectLib.dirBlur = createEffectProgram(
    gl,
    cmnvtxsrc,
    frgsrc,
    ["uBlurDir"],
    null
  );

  // down sample
  frgsrc = fx_downsample_fsh;
  effectLib.downSample = createEffectProgram(gl, cmnvtxsrc, frgsrc, null, null);

  // up sample
  frgsrc = fx_upsample_fsh;
  effectLib.upSample = createEffectProgram(gl, cmnvtxsrc, frgsrc, null, null);

  // final composite
  vtxsrc = pp_final_vsh;
  frgsrc = pp_final_fsh;
  effectLib.finalComposite = createEffectProgram(
    gl,
    vtxsrc,
    frgsrc,
    ["uBloom"],
    null
  );
}

async function createScene() {
  await createBoids();
  await createSimulationLib();
  [0, 1].forEach((i) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec[`stateFBO${i}`].frameBuffer);
    gl.viewport(
      0,
      0,
      renderSpec[`stateFBO${i}`].width,
      renderSpec[`stateFBO${i}`].height
    );
    gl.clearColor(0.005, 0, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    renderBoids();
  });
  createEffectLib();

  sceneStandBy = true;
}

function renderSimulationLib() {
  // clear
  [0, 1].forEach((i) => {
    bindRT(renderSpec[`positionAccumulationFBO${i}`], true);
  });
  [0, 1].forEach((i) => {
    bindRT(renderSpec[`densityVelocityAccumulationFBO${i}`], true);
  });

  // accumulate
  // gl.enable(gl.BLEND);
  // gl.blendFunc(gl.ONE, gl.ONE);
  // gl.bindFramebuffer(
  //   gl.FRAMEBUFFER,
  //   renderSpec.positionDensityVelocityFBO0.frameBuffer
  // );

  // gl.viewport(
  //   0,
  //   0,
  //   renderSpec.positionDensityVelocityFBO0.width,
  //   renderSpec.positionDensityVelocityFBO0.height
  // );
  // useShader(gl, simulationLib.accumPosVelo.program);
  // gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.accumPosVelo.buffer);
  // gl.enableVertexAttribArray(simulationLib.accumPosVelo.program.attributes.uv);
  // gl.vertexAttribPointer(
  //   simulationLib.accumPosVelo.program.attributes.uv,
  //   2,
  //   gl.FLOAT,
  //   false,
  //   0,
  //   0
  // );
  // const scale =
  //   (1e6 / boids.numOfBoids) * Math.pow(blurParams.gridSize / 512, 1) * 8.0;
  // gl.uniform1f(simulationLib.accumPosVelo.program.uniforms.scale, scale);
  // gl.activeTexture(gl.TEXTURE0);
  // gl.bindTexture(gl.TEXTURE_2D, renderSpec.stateFBO0.texture);
  // gl.uniform1i(simulationLib.accumPosVelo.program.uniforms.positions, 0);
  // gl.drawArrays(gl.POINTS, 0, boids.numOfBoids);
  // unuseShader(gl, simulationLib.accumPosVelo.program);
  // gl.disable(gl.BLEND);

  // accumulation of position
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.bindFramebuffer(
    gl.FRAMEBUFFER,
    renderSpec.positionAccumulationFBO0.frameBuffer
  );
  gl.viewport(
    0,
    0,
    renderSpec.positionAccumulationFBO0.width,
    renderSpec.positionAccumulationFBO0.height
  );
  useShader(gl, simulationLib.accumPos.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.accumPos.buffer);
  gl.vertexAttribPointer(
    simulationLib.accumPos.program.attributes.uv,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(simulationLib.accumPos.program.attributes.uv);

  // Ensure the buffer data is correctly set
  const bufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
  const expectedSize = boids.numOfBoids * 2 * Float32Array.BYTES_PER_ELEMENT;
  if (bufferSize < expectedSize) {
    console.error(
      `Buffer size (${bufferSize}) is less than expected (${expectedSize}).`
    );
    return;
  }

  const scale =
    (1e6 / boids.numOfBoids) * Math.pow(blurParams.gridSize / 512, 1) * 8.0;
  gl.uniform1f(simulationLib.accumPos.program.uniforms.scale, scale);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.stateFBO0.texture);
  gl.uniform1i(simulationLib.accumPos.program.uniforms.positions, 0);
  gl.drawArrays(gl.POINTS, 0, boids.numOfBoids);
  unuseShader(gl, simulationLib.accumPos.program);

  // accumulation of velocity
  gl.bindFramebuffer(
    gl.FRAMEBUFFER,
    renderSpec.densityVelocityAccumulationFBO0.frameBuffer
  );
  gl.viewport(
    0,
    0,
    renderSpec.densityVelocityAccumulationFBO0.width,
    renderSpec.densityVelocityAccumulationFBO0.height
  );
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  useShader(gl, simulationLib.accumDenVelo.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.accumDenVelo.buffer);
  gl.vertexAttribPointer(
    simulationLib.accumDenVelo.program.attributes.uv,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.uniform1f(simulationLib.accumDenVelo.program.uniforms.scale, scale);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.stateFBO0.texture);
  gl.uniform1i(simulationLib.accumDenVelo.program.uniforms.positions, 0);
  gl.drawArrays(gl.POINTS, 0, boids.numOfBoids);
  unuseShader(gl, simulationLib.accumDenVelo.program);
  gl.disable(gl.BLEND);

  // blur horizontal
  gl.bindFramebuffer(
    gl.FRAMEBUFFER,
    renderSpec.positionAccumulationFBO1.frameBuffer
  );
  gl.viewport(
    0,
    0,
    renderSpec.positionAccumulationFBO1.width,
    renderSpec.positionAccumulationFBO1.height
  );
  useShader(gl, simulationLib.blur.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.blur.buffer);
  gl.vertexAttribPointer(
    simulationLib.blur.program.attributes.xy,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.uniform2fv(simulationLib.blur.program.uniforms.inverseResolution, [
    1 / blurParams.gridSize,
    1 / blurParams.gridSize,
  ]);
  gl.uniform2fv(simulationLib.blur.program.uniforms.direction, [1, 0]);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.positionAccumulationFBO0.texture);
  gl.uniform1i(simulationLib.blur.program.uniforms.src1, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);

  // blur vertical
  gl.bindFramebuffer(
    gl.FRAMEBUFFER,
    renderSpec.positionAccumulationFBO0.frameBuffer
  );
  gl.viewport(
    0,
    0,
    renderSpec.positionAccumulationFBO0.width,
    renderSpec.positionAccumulationFBO0.height
  );
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  useShader(gl, simulationLib.blur.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.blur.buffer);
  gl.enableVertexAttribArray(simulationLib.blur.program.attributes.xy);
  gl.vertexAttribPointer(
    simulationLib.blur.program.attributes.xy,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.uniform2fv(simulationLib.blur.program.uniforms.inverseResolution, [
    1 / blurParams.gridSize,
    1 / blurParams.gridSize,
  ]);
  gl.uniform2fv(simulationLib.blur.program.uniforms.direction, [0, 1]);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.positionAccumulationFBO1.texture);
  gl.uniform1i(simulationLib.blur.program.uniforms.src1, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);

  // blur horizontal
  gl.bindFramebuffer(
    gl.FRAMEBUFFER,
    renderSpec.densityVelocityAccumulationFBO1.frameBuffer
  );
  gl.viewport(
    0,
    0,
    renderSpec.densityVelocityAccumulationFBO1.width,
    renderSpec.densityVelocityAccumulationFBO1.height
  );
  useShader(gl, simulationLib.blur.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.blur.buffer);
  gl.vertexAttribPointer(
    simulationLib.blur.program.attributes.xy,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.uniform2fv(simulationLib.blur.program.uniforms.inverseResolution, [
    1 / blurParams.gridSize,
    1 / blurParams.gridSize,
  ]);
  gl.uniform2fv(simulationLib.blur.program.uniforms.direction, [1, 0]);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(
    gl.TEXTURE_2D,
    renderSpec.densityVelocityAccumulationFBO0.texture
  );
  gl.uniform1i(simulationLib.blur.program.uniforms.src1, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);

  // blur vertical
  gl.bindFramebuffer(
    gl.FRAMEBUFFER,
    renderSpec.densityVelocityAccumulationFBO0.frameBuffer
  );
  gl.viewport(
    0,
    0,
    renderSpec.densityVelocityAccumulationFBO0.width,
    renderSpec.densityVelocityAccumulationFBO0.height
  );
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  useShader(gl, simulationLib.blur.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.blur.buffer);
  gl.enableVertexAttribArray(simulationLib.blur.program.attributes.xy);
  gl.vertexAttribPointer(
    simulationLib.blur.program.attributes.xy,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.uniform2fv(simulationLib.blur.program.uniforms.inverseResolution, [
    1 / blurParams.gridSize,
    1 / blurParams.gridSize,
  ]);
  gl.uniform2fv(simulationLib.blur.program.uniforms.direction, [0, 1]);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(
    gl.TEXTURE_2D,
    renderSpec.densityVelocityAccumulationFBO1.texture
  );
  gl.uniform1i(simulationLib.blur.program.uniforms.src1, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);

  unuseShader(gl, simulationLib.blur.program);

  // iterate boids simulation
  bindRT(renderSpec.stateFBO1, true);
  useShader(gl, simulationLib.iterate.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.iterate.buffer);
  gl.vertexAttribPointer(
    simulationLib.iterate.program.attributes.xy,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.uniform1f(
    simulationLib.iterate.program.uniforms.uRandomness,
    boidsParams.randomness
  );
  gl.uniform1f(simulationLib.iterate.program.uniforms.uRand, Math.random());
  gl.uniform1f(
    simulationLib.iterate.program.uniforms.uCohesion,
    boidsParams.cohesion
  );
  gl.uniform1f(
    simulationLib.iterate.program.uniforms.uSeparation,
    boidsParams.separation
  );
  gl.uniform1f(
    simulationLib.iterate.program.uniforms.uVelocityEnforcement,
    boidsParams.velocityEnforcement
  );
  gl.uniform1f(
    simulationLib.iterate.program.uniforms.uAlignment,
    boidsParams.alignment
  );
  gl.uniform1f(
    simulationLib.iterate.program.uniforms.uLeading,
    boidsParams.leading
  );
  gl.uniform2fv(simulationLib.iterate.program.uniforms.inverseResolution, [
    1 / blurParams.gridSize,
    1 / blurParams.gridSize,
  ]);
  gl.uniform1f(simulationLib.iterate.program.uniforms.dt, boidsParams.dt);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.stateFBO0.texture);
  gl.uniform1i(simulationLib.iterate.program.uniforms.src, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.positionAccumulationFBO0.texture);
  gl.uniform1i(simulationLib.iterate.program.uniforms.position, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(
    gl.TEXTURE_2D,
    renderSpec.densityVelocityAccumulationFBO0.texture
  );
  gl.uniform1i(simulationLib.iterate.program.uniforms.densityVelocity, 2);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);
  unuseShader(gl, simulationLib.iterate.program);

  // swap stateFBO0 and stateFBO1
  const tmp = renderSpec.stateFBO0;
  renderSpec.stateFBO0 = renderSpec.stateFBO1;
  renderSpec.stateFBO1 = tmp;

  // offscreen the results
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  bindRT(renderSpec.offscreenFBO, true);
  useShader(gl, simulationLib.drawBoids.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.drawBoids.buffer);
  gl.vertexAttribPointer(
    simulationLib.drawBoids.program.attributes.uv,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.stateFBO0.texture);
  gl.uniform1i(simulationLib.drawBoids.program.uniforms.positions, 0);
  const alpha =
    ((80000 * boidsParams.opacity) / Math.pow(boidsParams.textureSize, 2)) *
    (canvas.width / 600);
  gl.uniform1f(simulationLib.drawBoids.program.uniforms.alpha, alpha);
  gl.uniform1f(simulationLib.drawBoids.program.uniforms.tick, timeInfo.elapsed);
  gl.drawArrays(gl.POINTS, 0, boids.numOfBoids);
  unuseShader(gl, simulationLib.drawBoids.program);

  gl.disable(gl.BLEND);

  // copy to mainRT
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec.mainRT.frameBuffer);
  gl.viewport(0, 0, renderSpec.mainRT.width, renderSpec.mainRT.height);
  useShader(gl, simulationLib.copy.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, simulationLib.copy.buffer);
  gl.vertexAttribPointer(
    simulationLib.copy.program.attributes.xy,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.offscreenFBO.texture);
  gl.uniform1i(simulationLib.copy.program.uniforms.src, 0);
  gl.uniform1f(
    simulationLib.copy.program.uniforms.gamma,
    1 / boidsParams.gamma
  );
  gl.uniform1f(simulationLib.copy.program.uniforms.offset, 0);
  gl.uniform1f(simulationLib.copy.program.uniforms.scale, 1);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);
  unuseShader(gl, simulationLib.copy.program);
}

function renderPostProcess() {
  // make bright buff
  bindRT(renderSpec.wHalfRT0, true);
  useEffect(gl, effectLib.mkBrightBuf, renderSpec.mainRT, renderSpec.array);
  drawEffect(gl, effectLib.mkBrightBuf);
  unuseEffect(gl, effectLib.mkBrightBuf);

  // make bloom
  for (let i = 0; i < 2; i++) {
    const p = 1.5 + 1 * i;
    const s = 2.0 + 1 * i;
    bindRT(renderSpec.wHalfRT1, true);
    useEffect(gl, effectLib.dirBlur, renderSpec.wHalfRT0, renderSpec.array);
    gl.uniform4f(effectLib.dirBlur.program.uniforms.uBlurDir, p, 0.0, s, 0.0);
    drawEffect(gl, effectLib.dirBlur);
    unuseEffect(gl, effectLib.dirBlur);

    bindRT(renderSpec.wHalfRT0, true);
    useEffect(gl, effectLib.dirBlur, renderSpec.wHalfRT1, renderSpec.array);
    gl.uniform4f(effectLib.dirBlur.program.uniforms.uBlurDir, 0.0, p, 0.0, s);
    drawEffect(gl, effectLib.dirBlur);
    unuseEffect(gl, effectLib.dirBlur);
  }

  // // down sampling
  // bindRT(renderSpec.wQuarterRT0, true);
  // useEffect(
  //   gl,
  //   effectLib.downSample,
  //   renderSpec.wHalfRT0,
  //   renderSpec.halfArray
  // );
  // drawEffect(gl, effectLib.downSample);
  // unuseEffect(gl, effectLib.downSample);

  // bindRT(renderSpec.wEighthRT0, true);
  // useEffect(
  //   gl,
  //   effectLib.downSample,
  //   renderSpec.wQuarterRT0,
  //   renderSpec.quarterArray
  // );
  // drawEffect(gl, effectLib.downSample);
  // unuseEffect(gl, effectLib.downSample);

  // // up sampling
  // bindRT(renderSpec.wQuarterRT0, true);
  // useEffect(
  //   gl,
  //   effectLib.upSample,
  //   renderSpec.wEighthRT0,
  //   renderSpec.eighthArray
  // );
  // drawEffect(gl, effectLib.upSample);
  // unuseEffect(gl, effectLib.upSample);

  // bindRT(renderSpec.wHalfRT0, true);
  // useEffect(
  //   gl,
  //   effectLib.upSample,
  //   renderSpec.wQuarterRT0,
  //   renderSpec.quarterArray
  // );
  // drawEffect(gl, effectLib.upSample);
  // unuseEffect(gl, effectLib.upSample);
}

function renderScene() {
  //boids simulation
  renderSimulationLib();

  // post processing
  renderPostProcess();

  // display
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, renderSpec.width, renderSpec.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  useEffect(gl, effectLib.finalComposite, renderSpec.mainRT, renderSpec.array);
  gl.uniform1i(effectLib.finalComposite.program.uniforms.uBloom, 1);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.wHalfRT0.texture);
  drawEffect(gl, effectLib.finalComposite);
  unuseEffect(gl, effectLib.finalComposite);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

async function onResize(e) {
  makeCanvasFullScreen(document.getElementById("webgl"));
  setViewports();
  if (sceneStandBy) {
    await createScene();
  }
}

function setViewports() {
  renderSpec.setSize(gl.canvas.width, gl.canvas.height);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.viewport(0, 0, renderSpec.width, renderSpec.height);

  const rtfunc = function (rtname, rtw, rth) {
    let rt = renderSpec[rtname];
    if (rt) deleteRenderTarget(rt);
    renderSpec[rtname] = createRenderTarget(gl, rtw, rth, canWriteToFloat);
  };

  // Create render targets
  rtfunc("mainRT", renderSpec.width, renderSpec.height);
  [0, 1].forEach((i) => {
    rtfunc(`stateFBO${i}`, renderSpec.textureWidth, renderSpec.textureHeight);
  });
  [0, 1].forEach((i) => {
    rtfunc(
      `positionAccumulationFBO${i}`,
      renderSpec.gridSize,
      renderSpec.gridSize
    );
  });
  [0, 1].forEach((i) => {
    rtfunc(
      `densityVelocityAccumulationFBO${i}`,
      renderSpec.gridSize,
      renderSpec.gridSize
    );
  });
  [0, 1].map((i) => {
    let rt = renderSpec[`positionDensityVelocityFBO${i}`];
    if (rt) deleteRenderTarget(rt);
    rt = {};

    rt.frameBuffer = gl.createFramebuffer();
    rt.renderBuffer = gl.createRenderbuffer();
    rt.textures = [
      renderSpec[`positionAccumulationFBO${i}`].texture,
      renderSpec[`densityVelocityAccumulationFBO${i}`].texture,
    ];
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.frameBuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      drawBuffersExt.COLOR_ATTACHMENT0_WEBGL,
      gl.TEXTURE_2D,
      rt.textures[0],
      0
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      drawBuffersExt.COLOR_ATTACHMENT1_WEBGL,
      gl.TEXTURE_2D,
      rt.textures[1],
      0
    );
    drawBuffersExt.drawBuffersWEBGL([
      drawBuffersExt.COLOR_ATTACHMENT0_WEBGL,
      drawBuffersExt.COLOR_ATTACHMENT1_WEBGL,
    ]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("Framebuffer not complete:", status);
    }

    renderSpec[`positionDensityVelocityFBO${i}`] = rt;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  });
  rtfunc("offscreenFBO", renderSpec.width, renderSpec.height);
  rtfunc("wHalfRT0", renderSpec.halfWidth, renderSpec.halfHeight);
  rtfunc("wHalfRT1", renderSpec.halfWidth, renderSpec.halfHeight);
  rtfunc("wQuarterRT0", renderSpec.quarterWidth, renderSpec.quarterHeight);
  rtfunc("wEighthRT0", renderSpec.eighthWidth, renderSpec.eighthHeight);
}

function render() {
  renderScene();
}

let animating = true;

function toggleAnimation(elm) {
  animating ^= true;
  if (animating) animate();
  if (elm) {
    elm.innerHTML = animating ? "Stop" : "Start";
  }
}

function animate() {
  const curdate = new Date();
  timeInfo.elapsed = (curdate - timeInfo.start) / 1000.0;
  timeInfo.delta = (curdate - timeInfo.prev) / 1000.0;
  timeInfo.prev = curdate;

  if (animating) requestAnimationFrame(animate);
  render();
}

function makeCanvasFullScreen(canvas) {
  const b = document.body;
  const d = document.documentElement;
  const fullw = Math.max(
    b.clientWidth,
    b.scrollWidth,
    d.scrollWidth,
    d.clientWidth
  );
  const fullh = Math.max(
    b.clientHeight,
    b.scrollHeight,
    d.scrollHeight,
    d.clientHeight
  );
  const side = Math.min(fullw, fullh);
  canvas.width = side;
  canvas.height = side;
}

const btn = document.querySelector(".stop");
btn.addEventListener("click", function () {
  toggleAnimation(btn);
});

async function resetAnimation() {
  timeInfo.start = new Date();
  timeInfo.prev = timeInfo.start;
  timeInfo.elapsed = 0;
  await createScene();
  render();
}

const startBtn = document.querySelector(".restart");
startBtn.addEventListener("click", function () {
  resetAnimation();
});

canWriteToFloat = false;
let canUseWebGLDrawBuffers = false;
window.addEventListener("load", async function (e) {
  canvas = document.getElementById("webgl");
  try {
    makeCanvasFullScreen(canvas);
    gl = canvas.getContext("webgl", {
      antialias: false,
      preserveDrawingBuffer: true,
    });
  } catch (e) {
    alert("WebGL not supported." + e);
    console.error(e);
    return;
  }

  // Add extensions
  try {
    const floatTextureExt = gl.getExtension("OES_texture_float");
    if (floatTextureExt) {
      canWriteToFloat = true;
      gl.getExtension("OES_texture_float_linear");
    } else {
      gl.getExtension("OES_texture_half_float");
      gl.getExtension("OES_texture_half_float_linear");
    }
    drawBuffersExt = gl.getExtension("WEBGL_draw_buffers");
    if (drawBuffersExt) {
      canUseWebGLDrawBuffers = true;
    }
  } catch (e) {
    alert("WebGL not supported." + e);
    console.error(e);
    return;
  }
  console.log(canWriteToFloat ? "Datatype: float" : "Datatype: half float");
  console.log(
    canUseWebGLDrawBuffers ? "Draw buffers: yes" : "Draw buffers: no"
  );

  window.addEventListener("resize", onResize);

  createDebugPane();
  setViewports();
  await createScene();

  timeInfo.start = new Date();
  timeInfo.prev = timeInfo.start;
  animate();
});

function createDebugPane() {
  const pane = new Pane();

  // boids folder
  const boids = pane.addFolder({ title: "Boids" });
  boids
    .addBinding(boidsParams, "textureSize", { min: 1, max: 1024, step: 16 })
    .on("change", async (e) => {
      if (e.last) {
        renderSpec.textureWidth = boidsParams.textureSize;
        renderSpec.textureHeight = boidsParams.textureSize;
        setViewports();
        boidsParams.textureSize = e.value;
        resetAnimation();
      }
    });
  boids.addBinding(boidsParams, "separation", { min: 0, max: 1 });
  boids.addBinding(boidsParams, "cohesion", { min: 0, max: 1 });
  boids.addBinding(boidsParams, "alignment", { min: 0, max: 1 });
  boids.addBinding(boidsParams, "velocityEnforcement", { min: 0, max: 1 });
  boids.addBinding(boidsParams, "leading", { min: 0, max: 2 });
  boids.addBinding(boidsParams, "randomness", { min: 0, max: 1 });
  boids.addBinding(boidsParams, "dt", { min: 0, max: 0.0005 });
  boids.addBinding(boidsParams, "gamma", { min: 0, max: 2.5 });
  boids.addBinding(boidsParams, "opacity", { min: 0, max: 1 });

  // blur folder
  // const blur = pane.addFolder({ title: "Blur" });
  // blur.addBinding(blurParams, "gridSize", { min: 1, max: 1024 });
}

const bindRT = function (rt, isclear) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.frameBuffer);
  gl.viewport(0, 0, rt.width, rt.height);
  if (isclear) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
};
