// Cells (spec decisions 22 to 25): lattice frames, interior side kinds, and the boundary points a Cell side carries.
import {describe, expect, it} from 'vitest';
import type {Vec2} from 'manifold-3d';
import {BoundaryPoint, FaceFrame, contourLobes, faceFrame, interiorSideKind, layCells, originRecord, withBoundaryPoints} from '../src/cells.ts';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {VertexOrigin, buildShellEdges, makeVertexRegistry, vertexAt} from '../src/edges.ts';
import {buildShellDetailed} from '../src/shell.ts';
import {ShellFace, assembleFaces, reduceFaceLoops} from '../src/faces.ts';
import {fixtureByName} from '../src/fixture.ts';
import {getManifold} from '../src/manifold.ts';
import {FaceTag, Vec3} from '../src/tags.ts';
import {unionShell} from '../src/union.ts';

const face = (kind: FaceTag['kind'], normal: Vec3, offset = 0): ShellFace => ({
  id: 0, tag: {kind, storey: 0, wall: 0, plane: -1, part: 0}, normal, offset, loops: [], area: 0,
});

describe('faceFrame (decision 22 as amended)', () => {
  it('lays a wall facing ±y in (x, z), signed by how (x, z) turns seen from outside', () => {
    expect(faceFrame(face('Wall', [0, -1, 0]))).toEqual({s: 0, t: 2, r: 1, sign: 1});
    expect(faceFrame(face('Wall', [0, 1, 0]))).toEqual({s: 0, t: 2, r: 1, sign: -1});
  });

  it('lays Gable and Cheek faces facing ±x in (y, z)', () => {
    expect(faceFrame(face('Gable', [1, 0, 0]))).toEqual({s: 1, t: 2, r: 0, sign: 1});
    expect(faceFrame(face('Cheek', [-1, 0, 0]))).toEqual({s: 1, t: 2, r: 0, sign: -1});
  });

  it('lays Roof and Underside faces in plan, and gives Ground and Internal none', () => {
    expect(faceFrame(face('Roof', [-0.5, 0, Math.sqrt(3) / 2]))).toEqual({s: 0, t: 1, r: 2, sign: 1});
    expect(faceFrame(face('Underside', [0, 0, -1]))).toEqual({s: 0, t: 1, r: 2, sign: -1});
    expect(faceFrame(face('Ground', [0, 0, -1]))).toBeNull();
    expect(faceFrame(face('Internal', [0, 0, 1]))).toBeNull();
  });

  it('refuses a Cheek on the plate: it has no (u, z) lattice', () => {
    expect(() => faceFrame(face('Cheek', [0, 0, -1]))).toThrow(/no \(u, z\) lattice/);
  });
});

describe('interiorSideKind (decision 25 as amended, journal decisions 61 and 77)', () => {
  const up: [Vec3, Vec3] = [[0, 0, 0], [0, 0, 50]];
  const level: [Vec3, Vec3] = [[0, 0, 0], [50, 0, 0]];
  it.each([
    ['Wall', up, 'WallVertical'], ['Wall', level, 'WallHorizontal'],
    ['Gable', up, 'GableVertical'], ['Gable', level, 'GableHorizontal'],
    ['Cheek', up, 'GableVertical'], ['Cheek', level, 'GableHorizontal'],
    ['Roof', level, 'RoofInterior'], ['Underside', level, 'RoofInterior'],
  ] as const)('%s side %o is %s', (kind, [a, b], want) => {
    expect(interiorSideKind(face(kind, kind === 'Roof' || kind === 'Underside' ? [0, 0, 1] : [0, -1, 0]), a, b)).toBe(want);
  });
});

describe('NetEdge pairing along a rake, before any vertex is ordered (journal decision 59)', () => {
  it("pairs every Cell side on NarrowUpperStorey's Verges with exactly one side of the other face", async () => {
    const wasm = await getManifold();
    const f = fixtureByName('NarrowUpperStorey');
    const u = await unionShell(f);
    const asm = assembleFaces(u);
    const reg = makeVertexRegistry();
    const ea = buildShellEdges(u, asm, reg, f.storeyHeight);
    reduceFaceLoops(asm, u.mesh.positions, v => ea.endpoints.has(v));
    const {cells, netEdges} = layCells(wasm, u, asm, ea, reg, f.cellSize);
    const verges = ea.edges.filter(e => e.kind === 'Verge');
    expect(verges).toHaveLength(2);
    for (const e of verges) {
      const on = netEdges.filter(n => n.shellEdge === e.id);
      // The rake crosses Gable lattice lines in x and z, and Roof lattice lines in x: more NetEdges than x-crossings.
      expect(on.length).toBeGreaterThan(6);
      for (const n of on) {
        expect(n.cells, `NetEdge ${n.id}`).toHaveLength(2);
        expect(n.cells.map(c => asm.faces[cells[c].face].tag.kind).sort()).toEqual(['Gable', 'Roof']);
      }
    }
  });
});

describe('contourLobes (journal decisions 92 and 101)', () => {
  const at = (pts: Vec2[]) => (id: number): Vec2 => pts[id];
  // A figure eight touching itself at corner 0: one lobe through 1 and 2 counter-clockwise, the other through 3 and 4
  // clockwise.
  const pts: Vec2[] = [[0, 0], [10, 0], [10, 10], [-10, -10], [-10, 0]];

  it('gives one Cell per lobe of a contour touching itself', () => {
    const ccw: Vec2[] = [[0, 0], [10, 0], [10, 10], [-10, 0], [-10, -10], [0, -10]];
    expect(contourLobes([0, 1, 2, 0, 4, 5], at(ccw), 'test').map(l => l.ids)).toEqual([[0, 1, 2], [0, 4, 5]]);
  });

  it('refuses a lobe wound clockwise, as it refuses a contour hole', () => {
    expect(() => contourLobes([0, 1, 2, 0, 3, 4], at(pts), 'test')).toThrow(/winds clockwise/);
  });

  // Spec decision 23 as amended (journal decision 119, F43): existence follows the snap grid, never an area.
  it('keeps a sliver of three distinct vertices, however small its area', () => {
    // 0.02 cm long, 0.002 cm high: 2e-5 cm², a fifth of `SHELL_TOLERANCE_CM`², as F43's 9.35e-5 cm² piece was under it.
    const sliver: Vec2[] = [[0, 0], [0.02, 0], [0.01, 0.002]];
    const lobes = contourLobes([0, 1, 2], at(sliver), 'test');
    expect(lobes.map(l => l.ids)).toEqual([[0, 1, 2]]);
    expect(lobes[0].area).toBeLessThan(SHELL_TOLERANCE_CM ** 2);
  });

  it('gives no Cell for a lobe of fewer than three distinct vertices', () => {
    expect(contourLobes([0, 1, 0, 1], at(pts), 'test')).toEqual([]);
  });

  // Spec decision 23 as amended (journal decision 135, F7): three distinct snapped vertices with no positive area are a
  // hard error, never silently dropped.
  it('refuses three distinct vertices that are collinear: no positive snapped area', () => {
    const line: Vec2[] = [[0, 0], [1 / 1024, 0], [2 / 1024, 0]];
    expect(() => contourLobes([0, 1, 2], at(line), 'test')).toThrow(/a lobe of 3 distinct corners winds clockwise or has no area/);
  });
});

describe('originRecord (journal decision 100, B8)', () => {
  it('reads each origin\'s faces, and refuses an origin of no known kind rather than naming face -1', async () => {
    const b = await buildShellDetailed(fixtureByName('NarrowUpperStorey'));
    const {union: u, faces: asm, edges: ea} = b;
    expect(originRecord(u, asm, ea, {at: 'face', face: 3}, 'test')).toEqual({sheets: [{faces: [3], fan: null}], faces: [3]});
    expect(originRecord(u, asm, ea, {at: 'edge', edges: [0]}, 'test')).toEqual({sheets: [{faces: ea.edges[0].faces, fan: null}], faces: ea.edges[0].faces});
    const forged = {at: 'lattice', face: 3} as unknown as VertexOrigin;
    expect(() => originRecord(u, asm, ea, forged, 'test')).toThrow(/no known kind/);
  });
});

describe('withBoundaryPoints (journal decision 59)', () => {
  it("inserts the neighbour's T-points on a side, in order, and nothing off it", () => {
    const reg = makeVertexRegistry();
    const at = (p: Vec3): number => vertexAt(reg, p, {at: 'face', face: 0});
    const [a, b, c] = [at([0, 0, 300]), at([50, 0, 386.6]), at([0, 0, 350])];
    const t1 = at([28.8675, 0, 350]), t2 = at([10, 0, 317.32]), off = at([25, 0, 320]);
    const boundary: BoundaryPoint[] = [t1, t2, off].map(id => ({id, at: [reg.positions[id][0], reg.positions[id][2]]}));
    expect(withBoundaryPoints([a, b, c], reg, boundary)).toEqual([a, t2, t1, b, c]);
  });

  // Journal decision 122, G4 (P61.866 at 263 cm): on a steep Roof, a Gable's lattice crossing lies 0.019 cm from the
  // Roof's own crossing along the verge, but 0.0089 cm from it in plan. Decided in 3D by identity, it is inserted.
  it('inserts a vertex 0.019 cm from a side end in 3D though 0.0089 cm from it in plan (G4)', () => {
    const reg = makeVertexRegistry();
    const at = (p: Vec3): number => vertexAt(reg, p, {at: 'face', face: 0});
    const B: Vec3 = [100, 0, 188.02];
    const L = Math.hypot(B[0], B[2]);
    const near: Vec3 = [B[0] - 0.019 * B[0] / L, 0, B[2] - 0.019 * B[2] / L];
    expect(Math.abs(near[0] - B[0])).toBeLessThan(SHELL_TOLERANCE_CM);
    const [a, b, c, n] = [at([0, 0, 0]), at(B), at([B[0], 50, B[2]]), at(near)];
    const plan = (id: number): BoundaryPoint => ({id, at: [reg.positions[id][0], reg.positions[id][1]]});
    expect(withBoundaryPoints([a, b, c], reg, [plan(n)])).toEqual([a, n, b, c]);
  });

  it("reads a side on one ShellEdge from that edge's own vertices, by identity, however near its ends (G4)", () => {
    const reg = makeVertexRegistry();
    const at = (p: Vec3): number => vertexAt(reg, p, {at: 'face', face: 0});
    const [a, b, c] = [at([0, 0, 0]), at([100, 0, 0]), at([0, 50, 0])];
    // 0.005 cm from b along the edge, and an off-edge point within tolerance of the side, from another edge.
    const n = at([99.995, 0, 0]), other = at([60, 0.008, 0]);
    const plan = (id: number): BoundaryPoint => ({id, at: [reg.positions[id][0], reg.positions[id][1]]});
    expect(withBoundaryPoints([a, b, c], reg, [plan(n), plan(other)], [[a, n, b]])).toEqual([a, n, b, c]);
  });
});
