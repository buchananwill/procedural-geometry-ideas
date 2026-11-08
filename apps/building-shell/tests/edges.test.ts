// ShellEdges (spec decisions 19 to 21): the convexity test, the edge table, and the 21-member EdgeKind.
import {beforeAll, describe, expect, it} from 'vitest';
import {meshOf} from '../src/clean.ts';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {
  EDGE_KINDS, EdgeGeometry, EdgeShape, NEW_EDGE_KINDS, buildShellEdges, classifyEdge, edgeShape, liftAcross, makeVertexRegistry, meshOrigin,
  straightRuns, vertexAt,
} from '../src/edges.ts';
import {FaceSource, assembleFaces, meshPoint} from '../src/faces.ts';
import {Wasm, getManifold} from '../src/manifold.ts';
import {FaceTag, Plane3, Vec3, addFace, makeShellTags, samePlane} from '../src/tags.ts';
import {ShellMesh} from '../src/union.ts';

let wasm: Wasm;
beforeAll(async () => { wasm = await getManifold(); });

const tag = (kind: FaceTag['kind'], storey = 0, wall = 0): FaceTag => ({kind, storey, wall, plane: kind === 'Roof' ? wall : -1, part: 0});

describe('EdgeKind (spec decision 21 as amended, journal decision 44)', () => {
  it('is exactly 21 members: the 16 EModularEdgeKind names in order, then the 5 new ones', () => {
    expect(EDGE_KINDS).toEqual([
      'WallVertical', 'WallHorizontal', 'FloorLine', 'ExternalCorner', 'InternalCorner', 'RingJunction', 'Eaves',
      'RoofInterior', 'WallPlate', 'GableHorizontal', 'GableVertical', 'Verge', 'Ridge', 'Hip', 'Valley', 'GroundLine',
      'RoofSeam', 'GableSloped', 'SoffitEdge', 'SoffitJunction', 'Unclassified',
    ]);
    expect(NEW_EDGE_KINDS).toEqual(EDGE_KINDS.slice(16));
  });
});

describe('edgeShape (spec decision 20)', () => {
  it('reads the worked Ridge as convex and the worked RingJunction as concave', () => {
    const nA: Vec3 = [-0.5, 0, Math.sqrt(3) / 2];
    // Ridge: q = (600, 0, 300), p = (300, 250, 473.2).
    const ridgeLift = -0.5 * 300 + (Math.sqrt(3) / 2) * (300 - (300 + 300 / Math.sqrt(3)));
    expect(ridgeLift).toBeCloseTo(-300, 6);
    expect(edgeShape(nA, [0.5, 0, Math.sqrt(3) / 2], ridgeLift)).toBe('Convex');
    // RingJunction: q = (200, 0, 600), p = (200, 100, 415.5).
    expect(edgeShape(nA, [1, 0, 0], (Math.sqrt(3) / 2) * 184.5)).toBe('Concave');
  });

  it('runs the flat test first: two planes 1e-4 rad apart are flat however far q lies', () => {
    const tilt = 1e-4;
    const nB: Vec3 = [Math.sin(tilt), 0, Math.cos(tilt)];
    expect(edgeShape([0, 0, 1], nB, -1)).toBe('Flat');
    expect(edgeShape([0, 0, 1], nB, 1)).toBe('Flat');
  });

  it('is Indeterminate when not flat and q lies within tolerance of A', () => {
    expect(edgeShape([0, 0, 1], [1, 0, 0], SHELL_TOLERANCE_CM / 2)).toBe('Indeterminate');
  });
});

describe('classifyEdge (spec decision 21)', () => {
  const g = (shape: EdgeShape, horizontal = false, vertical = false, z = 0): EdgeGeometry => ({shape, horizontal, vertical, z});

  it.each([
    ['Roof', 'Roof', g('Flat'), 'RoofSeam'],
    ['Roof', 'Roof', g('Convex', true), 'Ridge'],
    ['Roof', 'Roof', g('Convex'), 'Hip'],
    ['Roof', 'Roof', g('Concave'), 'Valley'],
    ['Roof', 'Wall', g('Flat'), 'Unclassified'],
    ['Wall', 'Roof', g('Convex'), 'Eaves'],
    ['Roof', 'Wall', g('Concave'), 'RingJunction'],
    ['Gable', 'Roof', g('Convex'), 'Verge'],
    ['Roof', 'Gable', g('Concave'), 'RingJunction'],
    ['Wall', 'Wall', g('Flat', true), 'FloorLine'],
    ['Wall', 'Wall', g('Flat', false, true), 'WallVertical'],
    ['Wall', 'Wall', g('Convex'), 'ExternalCorner'],
    ['Wall', 'Wall', g('Concave'), 'InternalCorner'],
    ['Wall', 'Gable', g('Flat', true, false, 300), 'WallPlate'],
    ['Gable', 'Wall', g('Flat', true, false, 600), 'GableHorizontal'],
    ['Wall', 'Gable', g('Flat', false, true), 'GableVertical'],
    ['Wall', 'Gable', g('Flat'), 'GableSloped'],
    ['Gable', 'Gable', g('Flat', false, true), 'GableVertical'],
    ['Gable', 'Gable', g('Flat', true), 'GableHorizontal'],
    ['Gable', 'Gable', g('Convex'), 'ExternalCorner'],
    ['Wall', 'Ground', g('Convex'), 'GroundLine'],
    ['Ground', 'Gable', g('Convex'), 'GroundLine'],
    ['Wall', 'Ground', g('Concave'), 'Unclassified'],
    ['Underside', 'Wall', g('Convex'), 'SoffitEdge'],
    ['Wall', 'Underside', g('Concave'), 'SoffitJunction'],
    ['Roof', 'Underside', g('Convex'), 'Unclassified'],
    ['Roof', 'Ground', g('Convex'), 'Unclassified'],
  ] as const)('%s, %s, %o: %s', (a, b, geo, kind) => {
    expect(classifyEdge(tag(a), tag(b), geo, 300)).toBe(kind);
  });

  it('reads a Cheek as a Gable (journal decision 77)', () => {
    expect(classifyEdge(tag('Cheek'), tag('Roof'), g('Convex'), 300)).toBe('Verge');
    expect(classifyEdge(tag('Roof'), tag('Cheek'), g('Concave'), 300)).toBe('RingJunction');
    expect(classifyEdge(tag('Cheek'), tag('Gable'), g('Flat', false, true), 300)).toBe('GableVertical');
    expect(classifyEdge(tag('Cheek'), tag('Cheek'), g('Convex'), 300)).toBe('ExternalCorner');
    expect(classifyEdge(tag('Wall'), tag('Cheek'), g('Flat', true, false, 300), 300)).toBe('WallPlate');
    expect(classifyEdge(tag('Ground'), tag('Cheek'), g('Convex'), 300)).toBe('GroundLine');
  });

  it("places WallPlate at the Gable's own plate, read from the Gable's storey", () => {
    expect(classifyEdge(tag('Wall', 1), tag('Gable', 1), g('Flat', true, false, 600), 300)).toBe('WallPlate');
    expect(classifyEdge(tag('Wall', 1), tag('Gable', 1), g('Flat', true, false, 300), 300)).toBe('GableHorizontal');
  });
});

/**
 * A solid whose x = 0 face is an L (non-convex): a 10 cm cube with a 10 by 2 by 2 cm bar on top along y = 0. The
 * bar's riser, the plane y = 2 facing +y, meets the L along x = 0, z 10 to 12: a convex edge. The L's centroid has
 * y = 4.85, on the riser's outward side, so reading it as `q` would call the edge concave (journal decision 42).
 */
function notchedSolid(): FaceSource {
  const cube = wasm.Manifold.cube([10, 10, 10]);
  const bar0 = wasm.Manifold.cube([10, 2, 2]);
  const bar = bar0.translate([0, 0, 10]);
  const u = cube.add(bar);
  // N16 and N10's test half: the one Manifold-mesh reader. Its faceIDs are replaced below, plane by plane.
  const {positions, tris} = meshOf(u.getMesh());
  [cube, bar0, bar, u].forEach(m => m.delete());
  const tags = makeShellTags();
  const faceIDs = new Uint32Array(tris.length / 3);
  const triTags: FaceTag[] = [];
  for (let t = 0; t < tris.length / 3; t++) {
    const [a, b, c] = [0, 1, 2].map(j => meshPoint(positions, tris[3 * t + j]));
    const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const L = Math.hypot(...cr);
    const n: Vec3 = [Math.round(cr[0] / L), Math.round(cr[1] / L), Math.round(cr[2] / L)];
    const plane: Plane3 = {n, d: n[0] * a[0] + n[1] * a[1] + n[2] * a[2]};
    let id = tags.planes.findIndex(p => samePlane(p, plane));
    if (id < 0) id = addFace(tags, {kind: 'Wall', storey: 0, wall: tags.table.length, plane: -1, part: 0}, plane);
    faceIDs[t] = id;
    triTags.push(tags.table[id]);
  }
  const mesh: ShellMesh = {positions, tris, faceIDs};
  return {mesh, triTags, tags};
}

describe('convexity reads the opposite vertex of B\'s incident triangle (journal decision 42)', () => {
  it("calls the riser's edge with the L-shaped x = 0 face convex, from either side", () => {
    const src = notchedSolid();
    const asm = assembleFaces(src);
    const faceOn = (n: Vec3, d: number): number => asm.planes.findIndex(p => samePlane(p, {n, d}));
    const riser = faceOn([0, 1, 0], 2), ell = faceOn([-1, 0, 0], 0);
    expect(riser).toBeGreaterThanOrEqual(0);
    expect(ell).toBeGreaterThanOrEqual(0);
    // Every half-edge of the riser whose twin lies in the L: read with A = the riser, B = the L.
    const {tris} = src.mesh;
    const across: number[] = [];
    for (let h = 0; h < tris.length; h++) {
      if (asm.triFace[Math.floor(h / 3)] === riser && asm.triFace[Math.floor(asm.topo.twin[h] / 3)] === ell) across.push(h);
    }
    expect(across.length).toBeGreaterThan(0);
    for (const h of across) {
      const lift = liftAcross(src, asm, h, asm.planes[riser].n);
      expect(edgeShape(asm.planes[riser].n, asm.planes[ell].n, lift)).toBe('Convex');
    }
    // And end to end: the ShellEdge between them is an ExternalCorner.
    const {edges} = buildShellEdges(src, asm, makeVertexRegistry(), 300);
    const e = edges.find(x => x.faces.includes(riser) && x.faces.includes(ell));
    expect(e?.kind).toBe('ExternalCorner');
  });
});

describe('straightRuns (journal decision 110, C5)', () => {
  it('keeps a straight chain one run, and cuts a chain at a real bend', () => {
    const line: Vec3[] = [0, 1, 2, 3, 4].map(i => [100 * i, 0, 0]);
    expect(straightRuns(line)).toEqual([[0, 4]]);
    const bent: Vec3[] = [[0, 0, 0], [100, 0, 0], [200, 0, 0], [200, 100, 0], [200, 200, 0]];
    expect(straightRuns(bent)).toEqual([[0, 2], [2, 4]]);
  });

  it('cuts a chain that drifts under the tolerance at each vertex but bows past it from its final chord', () => {
    // Twenty 100 cm steps, each turning 4e-6 rad: each new vertex lies under 0.004 cm off the line from the run's start
    // to the next vertex, under SHELL_TOLERANCE_CM, but the whole chain bows about 0.02 cm off its own final chord.
    const pts: Vec3[] = [[0, 0, 0]];
    let angle = 0;
    for (let i = 0; i < 20; i++) {
      angle += 4e-6;
      const [x, y] = pts[pts.length - 1];
      pts.push([x + 100 * Math.cos(angle), y + 100 * Math.sin(angle), 0]);
    }
    const runs = straightRuns(pts);
    expect(runs.length).toBeGreaterThan(1);
    for (const [s, e] of runs) {
      const a = pts[s], b = pts[e];
      for (let k = s + 1; k < e; k++) {
        const p = pts[k];
        const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
        expect(Math.hypot(p[0] - a[0] - t * (b[0] - a[0]), p[1] - a[1] - t * (b[1] - a[1]))).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
      }
    }
  });
});

describe('vertexAt at a pinch (journal decision 110, C1)', () => {
  it('makes two mesh vertices at one exact position one vertex of two sheets, and refuses two distinct points on one grid point', () => {
    const reg = makeVertexRegistry();
    const p: Vec3 = [290, 260, 300];
    const a = vertexAt(reg, p, meshOrigin(13, p));
    expect(vertexAt(reg, [...p], meshOrigin(26, [...p]))).toBe(a);
    expect(reg.origins[a]).toEqual({at: 'mesh', vertices: [13, 26], point: p});
    const q: Vec3 = [10, 10, 10.0002];
    vertexAt(reg, [10, 10, 10], meshOrigin(1, [10, 10, 10]));
    expect(() => vertexAt(reg, q, meshOrigin(2, q))).toThrow(/snap to one grid point/);
  });
});
