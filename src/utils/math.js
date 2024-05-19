export const Vector3 = {
  create: (x, y, z) => ({ x, y, z }),

  dot: (v0, v1) => v0.x * v1.x + v0.y * v1.y + v0.z * v1.z,

  cross: (v0, v1) => ({
    x: v0.y * v1.z - v0.z * v1.y,
    y: v0.z * v1.x - v0.x * v1.z,
    z: v0.x * v1.y - v0.y * v1.x,
  }),

  normalize: (v) => {
    const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return l > 0.00001
      ? { x: v.x / l, y: v.y / l, z: v.z / l }
      : { x: v.x, y: v.y, z: v.z };
  },

  arrayForm: (v) => new Float32Array([v.x, v.y, v.z]),
};

export const Matrix44 = {
  createIdentity: () =>
    new Float32Array([
      1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
      1.0,
    ]),

  loadProjection: (m, aspect, vdeg, near, far) => {
    const result = new Float32Array(m);
    const h = near * Math.tan(((vdeg * Math.PI) / 180.0) * 0.5) * 2.0;
    const w = h * aspect;
    result.set([
      (2.0 * near) / w,
      0.0,
      0.0,
      0.0,
      0.0,
      (2.0 * near) / h,
      0.0,
      0.0,
      0.0,
      0.0,
      -(far + near) / (far - near),
      -1.0,
      0.0,
      0.0,
      (-2.0 * far * near) / (far - near),
      0.0,
    ]);
    return result;
  },

  loadLookAt: (m, vpos, vlook, vup) => {
    const result = new Float32Array(m);
    const frontv = Vector3.normalize(
      Vector3.create(vpos.x - vlook.x, vpos.y - vlook.y, vpos.z - vlook.z)
    );
    const sidev = Vector3.normalize(Vector3.cross(vup, frontv));
    const topv = Vector3.normalize(Vector3.cross(frontv, sidev));

    result.set([
      sidev.x,
      topv.x,
      frontv.x,
      0.0,
      sidev.y,
      topv.y,
      frontv.y,
      0.0,
      sidev.z,
      topv.z,
      frontv.z,
      0.0,
      -(vpos.x * sidev.x + vpos.y * sidev.y + vpos.z * sidev.z),
      -(vpos.x * topv.x + vpos.y * topv.y + vpos.z * topv.z),
      -(vpos.x * frontv.x + vpos.y * frontv.y + vpos.z * frontv.z),
      1.0,
    ]);
    return result;
  },
};
