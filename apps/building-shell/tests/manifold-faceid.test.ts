// Open question 1 of WP2: does manifold-3d 3.2.1 carry input faceIDs through `union`, per triangle, and keep them
// distinguishable across parts? The whole tagging model (spec decisions 10, 11 and 13) stands on this.
import {beforeAll, describe, expect, it} from 'vitest';
import {getManifold, Wasm} from '../src/manifold.ts';

let wasm: Wasm;
beforeAll(async () => { wasm = await getManifold(); });

/** Which coordinate axis a box face is normal to, and where along it the face lies. */
type AxisPlane = [axis: number, at: number];

/** An axis-aligned box as a raw mesh, every one of its 12 triangles carrying `baseID + faceIndex` (6 faces). */
function boxMesh(w: Wasm, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, baseID: number) {
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  // Outward CCW quads: -z, +z, -y, +x, +y, -x.
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const tri: number[] = [];
  const face: number[] = [];
  quads.forEach((q, i) => {
    tri.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    face.push(baseID + i, baseID + i);
  });
  return new w.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(v.flat()),
    triVerts: new Uint32Array(tri),
    faceID: new Uint32Array(face),
  });
}

describe('manifold-3d 3.2.1 faceID provenance', () => {
  it('carries every input faceID through union, per triangle, distinct across parts', () => {
    const a = wasm.Manifold.ofMesh(boxMesh(wasm, 0, 0, 0, 10, 10, 10, 100));
    const b = wasm.Manifold.ofMesh(boxMesh(wasm, 5, 5, 5, 15, 15, 15, 200));
    const u = wasm.Manifold.union([a, b]);
    expect(u.status()).toBe('NoError');
    const m = u.getMesh();
    const ids = new Set(Array.from(m.faceID));
    // Every output triangle names an input face, and both parts' faces survive under their own ids.
    for (const id of ids) expect(id >= 100 && id < 106 || id >= 200 && id < 206).toBe(true);
    expect([...ids].some(id => id < 200)).toBe(true);
    expect([...ids].some(id => id >= 200)).toBe(true);
    // Each output triangle lies on the plane its faceID names.
    const planeOf = (id: number): AxisPlane => {
      const local = id % 100;
      const off = id >= 200 ? 5 : 0;
      const axis = [2, 2, 1, 0, 1, 0][local];
      const hi = [false, true, false, true, true, false][local];
      return [axis, off + (hi ? 10 : 0)];
    };
    for (let t = 0; t < m.numTri; t++) {
      const [axis, at] = planeOf(m.faceID[t]);
      for (const vi of m.verts(t)) expect(m.position(vi)[axis]).toBeCloseTo(at, 5);
    }
    a.delete(); b.delete(); u.delete();
  });

  it('keeps exactly one of two coplanar coincident faces, under one of the two input ids', () => {
    // Two boxes sharing the plane y = 0 (both outward -y) over x 0..10, z 0..10; B pokes above A.
    const a = wasm.Manifold.ofMesh(boxMesh(wasm, 0, 0, 0, 10, 10, 10, 100));
    const b = wasm.Manifold.ofMesh(boxMesh(wasm, 2, 0, 2, 8, 4, 20, 200));
    const u = wasm.Manifold.union([a, b]);
    const m = u.getMesh();
    let areaOnY0 = 0;
    for (let t = 0; t < m.numTri; t++) {
      const id = m.faceID[t];
      if (id !== 102 && id !== 202) continue;
      const [p, q, r] = Array.from(m.verts(t)).map(i => m.position(i));
      areaOnY0 += Math.abs((q[0] - p[0]) * (r[2] - p[2]) - (r[0] - p[0]) * (q[2] - p[2])) / 2;
    }
    // A's face (100) plus the part of B's above A (6 x 10): no doubled area.
    expect(areaOnY0).toBeCloseTo(100 + 60, 4);
    expect(u.volume()).toBeCloseTo(1000 + 6 * 4 * 10, 3);
    a.delete(); b.delete(); u.delete();
  });
});
