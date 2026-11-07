// Cells (spec decisions 22 to 25): lattice frames, interior side kinds, and the boundary points a Cell side carries.
import {describe, expect, it} from 'vitest';
import {BoundaryPoint, FaceFrame, faceFrame, interiorSideKind, layCells, withBoundaryPoints} from '../src/cells.ts';
import {buildShellEdges, makeVertexRegistry, vertexAt} from '../src/edges.ts';
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

describe('withBoundaryPoints (journal decision 59)', () => {
  it("inserts the neighbour's T-points on a side, in order, and nothing off it", () => {
    const reg = makeVertexRegistry();
    const at = (p: Vec3): number => vertexAt(reg, p, {at: 'face', face: 0});
    const [a, b, c] = [at([0, 0, 300]), at([50, 0, 386.6]), at([0, 0, 350])];
    const t1 = at([28.8675, 0, 350]), t2 = at([10, 0, 317.32]), off = at([25, 0, 320]);
    const fr: FaceFrame = {s: 0, t: 2, r: 1, sign: 1};
    const boundary: BoundaryPoint[] = [t1, t2, off].map(id => ({id, at: [reg.positions[id][0], reg.positions[id][2]]}));
    expect(withBoundaryPoints([a, b, c], reg, fr, boundary)).toEqual([a, t2, t1, b, c]);
  });
});
