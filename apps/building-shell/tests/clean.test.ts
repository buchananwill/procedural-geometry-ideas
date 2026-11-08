// The cleaning between the union and step 4 (journal decision 101, F36): near-coincident vertices merge, caps flip
// away, the result stays a closed manifold, and every triangle keeps a tag whose plane holds it.
import {describe, expect, it} from 'vitest';
import {CLEAN_MAX_MOVE_CM, CLEAN_TOLERANCE_CM, NO_CLEAN, cleanMesh, float32Ulp, meetMargin, meshOf} from '../src/clean.ts';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {SHELL_FIXTURES, ShellFixture, ring} from '../src/fixture.ts';
import {getManifold} from '../src/manifold.ts';
import type {ShellMesh} from '../src/mesh.ts';
import {ShellUnion, partManifold, triArea, unionShell} from '../src/union.ts';
import {dist3, pointAt} from '../src/vec3.ts';
import {SNAP_STEPS_PER_CM} from '../src/weld.ts';
import {CAP_CHAIN_SEED, randomFixtures, seededFixture} from './robustness-fixtures.ts';
import {AREA_TOL, nearContactViolations} from './shell-invariants.ts';

/** `probe10.mjs`'s fixture: its union leaves four vertex pairs 7.6e-5 to 2.3e-4 cm apart. */
const NEAR_PAIRS: ShellFixture = {
  name: 'NearPairs', cellSize: 50, storeyHeight: 300,
  rings: [ring([100, 50, 410, 580], 0, 1, 52.5, {W: {form: 'gable'}}), ring([280, 80, 640, 380], 0, 1, 52.5), ring([140, 440, 240, 530], 1, 1, 45)],
};
/** Random fixture 14: its union leaves a cap 3.3e-4 cm high on a storey-0 hip, and no short edge. */
const CAP = randomFixtures(1, 80)[14];

/** The union's mesh before the cleaning, taken again from the parts `unionShell` kept. */
async function rawUnion(u: ShellUnion): Promise<ShellMesh> {
  const wasm = await getManifold();
  const ms = u.parts.map(p => partManifold(wasm, p));
  const m = wasm.Manifold.union(ms);
  try {
    return meshOf(m.getMesh());
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
    out.push(dist3(pointAt(P, a), pointAt(P, b)));
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
    // Journal decision 122, G2 and F-D: every vertex's total move is bounded by the shell's tolerance itself.
    expect(CLEAN_MAX_MOVE_CM).toBe(SHELL_TOLERANCE_CM);
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
    expect(u.clean).toEqual(NO_CLEAN);
  });

  it('refuses a cluster reaching past CLEAN_MAX_MOVE_CM', () => {
    // Five vertices 3e-3 cm apart along x: every step is short, the cluster 1.2e-2 cm long. The two ends carry two
    // triangles to far corners, so the end that would move onto the other is kept.
    const step = 3e-3;
    const mesh: ShellMesh = {
      positions: Float32Array.from([0, 0, 0, step, 0, 0, 2 * step, 0, 0, 3 * step, 0, 0, 4 * step, 0, 0, 0, 100, 0, 0, 0, 100]),
      tris: Uint32Array.from([0, 5, 6, 4, 6, 5]),
      faceIDs: Uint32Array.from([0, 0]),
    };
    expect(() => cleanMesh(mesh)).toThrow(/past/);
  });

  // Journal decision 122, F-C: decision 110's link check refused this collapse as a pinch. Clustered, the two equator
  // vertices are one, the bipyramid's two halves fold onto each other as pairs of opposite triangles on one vertex
  // triple, and the zero-volume solid left is dropped whole (G1).
  it('dissolves a bipyramid whose equator edge is 1e-3 cm long, where the link check refused it (F-C, G1)', () => {
    const mesh: ShellMesh = {
      positions: Float32Array.from([0, 0, 0, 1e-3, 0, 0, 50, 80, 0, 25, 30, 50, 25, 30, -50]),
      tris: Uint32Array.from([0, 1, 3, 1, 2, 3, 2, 0, 3, 1, 0, 4, 2, 1, 4, 0, 2, 4]),
      faceIDs: new Uint32Array(6),
    };
    const {mesh: out, stats} = cleanMesh(mesh);
    expect(out.tris.length).toBe(0);
    expect(stats).toMatchObject({merged: 1, sheetTris: 4});
  });

  it('clusters near vertices whatever their connectivity: two sheets 2e-4 cm apart keep a vertex each, at one position (F-C)', () => {
    // Two tetrahedra touching at a corner, their touching corners 2e-4 cm apart and joined by no edge: a pinch.
    const d = 2e-4;
    const tet = (o: number[], s: number): number[] => [o[0], o[1], o[2], o[0] + s, o[1], o[2], o[0], o[1] + s, o[2], o[0], o[1], o[2] + s];
    const mesh: ShellMesh = {
      positions: Float32Array.from([...tet([0, 0, 0], 10), ...tet([d, 0, 0], -10)]),
      tris: Uint32Array.from([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3, 4, 5, 6, 4, 7, 5, 4, 6, 7, 5, 7, 6]),
      faceIDs: new Uint32Array(8),
    };
    const {mesh: out, stats} = cleanMesh(mesh);
    expect(stats.merged).toBe(0);
    expect(out.positions.length / 3).toBe(8);
    expect([out.positions[0], out.positions[1], out.positions[2]]).toEqual([out.positions[12], out.positions[13], out.positions[14]]);
    expect(stats.maxMoveCm).toBeCloseTo(d, 6);
  });

  it('drops a zero-volume pillow, two coincident opposite triangles, and leaves the closed solid beside it (G1)', () => {
    const tet = [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10];
    const pillow = [20, 0, 0, 30, 0, 0, 20, 10, 0];
    const mesh: ShellMesh = {
      positions: Float32Array.from([...tet, ...pillow]),
      tris: Uint32Array.from([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3, 4, 5, 6, 4, 6, 5]),
      faceIDs: Uint32Array.from([0, 0, 0, 0, 1, 2]),
    };
    const {mesh: out, stats} = cleanMesh(mesh);
    expect(stats.sheetTris).toBe(2);
    expect(out.tris.length / 3).toBe(4);
  });
});

describe('the move bound on the float32 positions as written (journal decision 150, F5)', () => {
  const [seed, index] = CAP_CHAIN_SEED;

  it('aims the meeting point short of the bound by more than the float32 write can carry it', () => {
    for (const x of [1, 300, 1000, 4000, 1e5]) expect(meetMargin(x)).toBeGreaterThan((Math.sqrt(3) / 2) * float32Ulp(x));
    expect(float32Ulp(1000)).toBe(2 ** -14);
  });

  // Seed4Fuzz134 is the corpus's one meeting point (scanned over every gated and opt-in generator at WP3.8). Every
  // union vertex's move is read here from the two float32 meshes themselves, never from the cleaning's own figure.
  it.each([[250], [263], [300]] as const)(`Seed${seed}Fuzz${index} at %i cm: every vertex moves within CLEAN_MAX_MOVE_CM, read in float32`, async h => {
    const u = await unionShell(seededFixture(seed, index, h));
    const raw = await rawUnion(u);
    const {mesh, stats, vertexOf} = cleanMesh(raw, u.tags.planes);
    if (h !== 263) expect(stats.met).toBeGreaterThan(0);
    let worst = 0;
    vertexOf.forEach((w, o) => {
      if (w < 0) return;
      const d = dist3(pointAt(mesh.positions, w), pointAt(raw.positions, o));
      worst = Math.max(worst, d);
    });
    expect(worst).toBeLessThanOrEqual(CLEAN_MAX_MOVE_CM);
    expect(stats.maxMoveCm).toBe(worst);
  });
});

describe('the near-contact invariant (journal decision 150, F6)', () => {
  /** Two unit-ish boxes along x, the second `gap` cm beyond the first and offset in y and z, so no corners meet. */
  const boxes = (gap: number): ShellMesh => {
    const box = (x0: number, y0: number, z0: number, s: number): number[] =>
      [0, 1].flatMap(k => [0, 1].flatMap(j => [0, 1].flatMap(i => [x0 + i * s, y0 + j * s, z0 + k * s])));
    const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    const tris = (o: number): number[] => quads.flatMap(([a, b, c, d]) => [o + a, o + b, o + c, o + a, o + c, o + d]);
    return {
      positions: Float32Array.from([...box(0, 0, 0, 10), ...box(10 + gap, 2, 2, 6)]),
      tris: Uint32Array.from([...tris(0), ...tris(8)]),
      faceIDs: new Uint32Array(24),
    };
  };

  it('is violated by two components 2/1024 cm apart, extents offset', () => {
    expect(nearContactViolations(boxes(2 / SNAP_STEPS_PER_CM))).toHaveLength(1);
  });

  it('holds for components that touch, and for components further apart than CLEAN_TOLERANCE_CM', () => {
    expect(nearContactViolations(boxes(0))).toEqual([]);
    expect(nearContactViolations(boxes(1.5 * CLEAN_TOLERANCE_CM))).toEqual([]);
  });
});
