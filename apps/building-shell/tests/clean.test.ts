// The cleaning between the union and step 4 (journal decision 101, F36): near-coincident vertices merge, caps flip
// away, the result stays a closed manifold, and every triangle keeps a tag whose plane holds it.
import {describe, expect, it} from 'vitest';
import {CLEAN_MAX_MOVE_CM, CLEAN_TOLERANCE_CM, cleanMesh} from '../src/clean.ts';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {SHELL_FIXTURES, ShellFixture} from '../src/fixture.ts';
import {getManifold} from '../src/manifold.ts';
import {ShellMesh, ShellUnion, partManifold, triArea, unionShell} from '../src/union.ts';
import {SNAP_STEPS_PER_CM} from '../src/weld.ts';
import {randomFixtures} from './robustness-fixtures.ts';
import {AREA_TOL} from './shell-invariants.ts';

/** `probe10.mjs`'s fixture: its union leaves four vertex pairs 7.6e-5 to 2.3e-4 cm apart. */
const NEAR_PAIRS: ShellFixture = {
  name: 'NearPairs', cellSize: 50, storeyHeight: 300,
  rings: [{rect: [100, 50, 410, 580], baseStorey: 0, storeys: 1}, {rect: [280, 80, 640, 380], baseStorey: 0, storeys: 1}, {rect: [140, 440, 240, 530], baseStorey: 1, storeys: 1}],
  roofs: {0: {sels: [{x: 100, form: 'gable'}], defaultDeg: 52.5}, 1: {sels: [], defaultDeg: 45}},
};
/** Random fixture 14: its union leaves a cap 3.3e-4 cm high on a storey-0 hip, and no short edge. */
const CAP = randomFixtures(1, 80)[14];

/** The union's mesh before the cleaning, taken again from the parts `unionShell` kept. */
async function rawUnion(u: ShellUnion): Promise<ShellMesh> {
  const wasm = await getManifold();
  const ms = u.parts.map(p => partManifold(wasm, p));
  const m = wasm.Manifold.union(ms);
  try {
    const g = m.getMesh();
    const positions = new Float32Array(3 * g.numVert);
    for (let v = 0; v < g.numVert; v++) for (let a = 0; a < 3; a++) positions[3 * v + a] = g.vertProperties[g.numProp * v + a];
    return {positions, tris: Uint32Array.from(g.triVerts), faceIDs: Uint32Array.from(g.faceID)};
  } finally {
    ms.forEach(x => x.delete());
    m.delete();
  }
}

const edgeLengths = (mesh: ShellMesh): number[] => {
  const P = mesh.positions, T = mesh.tris;
  const out: number[] = [];
  for (let h = 0; h < T.length; h++) {
    const a = T[h], b = T[3 * Math.floor(h / 3) + (h % 3 + 1) % 3];
    out.push(Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]));
  }
  return out;
};
const surface = (mesh: ShellMesh): number => Array.from({length: mesh.tris.length / 3}, (_, t) => triArea(mesh, t)).reduce((s, a) => s + a, 0);

/** Every triangle whose corners lie further than `SHELL_TOLERANCE_CM` off its faceID's generating plane. */
function offPlane(u: ShellUnion): number[] {
  const P = u.mesh.positions;
  const bad: number[] = [];
  for (let t = 0; t < u.mesh.tris.length / 3; t++) {
    const {n, d} = u.tags.planes[u.mesh.faceIDs[t]];
    for (let j = 0; j < 3; j++) {
      const v = 3 * u.mesh.tris[3 * t + j];
      if (Math.abs(n[0] * P[v] + n[1] * P[v + 1] + n[2] * P[v + 2] - d) > SHELL_TOLERANCE_CM) { bad.push(t); break; }
    }
  }
  return bad;
}

describe('the cleaning tolerance (journal decision 101, F36)', () => {
  it('lies above the 1/1024 cm grid cell\'s diagonal and at most half the shell tolerance', () => {
    expect(CLEAN_TOLERANCE_CM).toBeGreaterThan(Math.sqrt(3) / SNAP_STEPS_PER_CM);
    expect(CLEAN_TOLERANCE_CM).toBeLessThanOrEqual(SHELL_TOLERANCE_CM / 2);
    expect(CLEAN_MAX_MOVE_CM).toBeLessThan(SHELL_TOLERANCE_CM);
  });

  it("is beyond manifold-3d 3.2.1's own simplify, whose short-edge collapse stops at the mesh's float32 epsilon", async () => {
    const wasm = await getManifold();
    const u = await unionShell(NEAR_PAIRS);
    const ms = u.parts.map(p => partManifold(wasm, p));
    const m = wasm.Manifold.union(ms);
    const s = m.simplify(CLEAN_TOLERANCE_CM);
    try {
      expect(m.tolerance()).toBeLessThan(1e-4);
      expect(s.numVert()).toBe(m.numVert());
    } finally {
      ms.forEach(x => x.delete());
      m.delete();
      s.delete();
    }
  });
});

describe('cleanMesh', () => {
  it("merges the near-coincident pairs, leaving no edge under the tolerance and a closed manifold of the union's area", async () => {
    const u = await unionShell(NEAR_PAIRS);
    const raw = await rawUnion(u);
    expect(Math.min(...edgeLengths(raw))).toBeLessThan(3e-4);
    expect(u.clean.merged).toBe(4);
    expect(u.clean.collapsed).toBe(8);
    expect(u.clean.maxMoveCm).toBeLessThan(3e-4);
    expect(Math.min(...edgeLengths(u.mesh))).toBeGreaterThanOrEqual(CLEAN_TOLERANCE_CM);
    expect({status: u.status, closed: u.closed, genus: u.genus}).toEqual({status: 'NoError', closed: true, genus: 0});
    expect(Math.abs(surface(u.mesh) - surface(raw))).toBeLessThan(AREA_TOL);
    expect(offPlane(u)).toEqual([]);
  });

  it('flips a cap away, every triangle left on its tag\'s plane', async () => {
    const u = await unionShell(CAP);
    const raw = await rawUnion(u);
    expect(u.clean).toMatchObject({merged: 0, flipped: 1});
    expect(cleanMesh(raw).stats.flipped).toBe(1);
    expect({status: u.status, closed: u.closed, genus: u.genus}).toEqual({status: 'NoError', closed: true, genus: 0});
    expect(Math.abs(surface(u.mesh) - surface(raw))).toBeLessThan(AREA_TOL);
    expect(offPlane(u)).toEqual([]);
  });

  it.each(SHELL_FIXTURES.map(f => [f.name, f] as const))('%s: leaves the fixture\'s union as it is', async (_, f) => {
    const u = await unionShell(f);
    expect(u.clean).toEqual({merged: 0, collapsed: 0, flipped: 0, maxMoveCm: 0});
  });

  it('refuses a chain of short edges reaching past CLEAN_MAX_MOVE_CM', () => {
    // Four vertices 3e-3 cm apart along x, each fanned to a far apex: every step is short, the chain 9e-3 cm long.
    const step = 3e-3;
    const mesh: ShellMesh = {
      positions: Float32Array.from([0, 0, 0, step, 0, 0, 2 * step, 0, 0, 3 * step, 0, 0, 0, 100, 0]),
      tris: Uint32Array.from([0, 1, 4, 1, 2, 4, 2, 3, 4]),
      faceIDs: Uint32Array.from([0, 0, 0]),
    };
    expect(() => cleanMesh(mesh)).toThrow(/past/);
  });
});
