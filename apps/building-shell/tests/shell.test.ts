// Step 4 end to end on every fixture: decision 32's WP3 invariants, the net's own invariants (journal decisions 58 to
// 60), the report (decision 33), and each fixture's own assertions (decisions 34 to 40).
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {EdgeKind, ShellEdge, ShellVertex, snapPoint} from '../src/edges.ts';
import {ShellFace, loopArea, meshSurfaceArea} from '../src/faces.ts';
import {SHELL_FIXTURES, ShellFixture, fixtureByName} from '../src/fixture.ts';
import {CASES} from '../src/roof/cases.ts';
import {Rect, Sel} from '../src/roof/model.ts';
import {
  CONVENTION_CHEEK, CONVENTION_CORNER_BY_GEOMETRY, CONVENTION_UNDERSIDE_ROOF_INTERIOR, ShellBuild, buildShellDetailed,
} from '../src/shell.ts';
import {FaceTag, Vec3, identityKey} from '../src/tags.ts';
import {SNAP_STEPS_PER_CM} from '../src/weld.ts';

/** Tagged and summed areas to 0.05 cm², as `union.test.ts` asserts them. The worst float32 drift measured is 1.1e-3. */
const AREA_TOL = 0.05;
/** The furthest `snapCm` moves a 3D point: half a 1/1024 cm step on each axis. */
const SNAP_MOVE = Math.sqrt(3) / (2 * SNAP_STEPS_PER_CM);
const TAN30 = Math.tan(Math.PI / 6);
const TAN60 = Math.sqrt(3);

/** The correctness reviewer's U (storey.test.ts): one surviving Cheek, on x = 200 over the spine. */
const U_PROBE: ShellFixture = {
  name: 'UProbe', cellSize: 50, storeyHeight: 300,
  rings: ([[0, 0, 200, 600], [0, 0, 1000, 200], [800, 0, 1000, 600]] as Rect[]).map(rect => ({rect, baseStorey: 0, storeys: 1})),
  roofs: {0: {sels: [{y: 0, to: 200, form: 'gable'}] as Sel[], defaultDeg: 45}},
};

const builds = new Map<string, ShellBuild>();
beforeAll(async () => {
  for (const f of [...SHELL_FIXTURES, U_PROBE]) builds.set(f.name, await buildShellDetailed(f));
}, 120_000);
function get(name: string): ShellBuild {
  const b = builds.get(name);
  if (!b) throw new Error(`no shell built for ${name}`);
  return b;
}
const ALL = [...SHELL_FIXTURES.map(f => f.name), U_PROBE.name];

// ---- Helpers ----------------------------------------------------------------------------------------------------

const dist = (p: Vec3, q: Vec3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const near = (p: Vec3, q: Vec3): boolean => dist(p, q) <= SHELL_TOLERANCE_CM;

/** The ShellEdges of `kind` running between `p` and `q`, either way round. */
function edgesBetween(b: ShellBuild, kind: EdgeKind, p: Vec3, q: Vec3): ShellEdge[] {
  return b.shell.edges.filter(e => e.kind === kind && ((near(e.a, p) && near(e.b, q)) || (near(e.a, q) && near(e.b, p))));
}
function expectEdge(b: ShellBuild, kind: EdgeKind, p: Vec3, q: Vec3): void {
  expect(edgesBetween(b, kind, p, q).map(e => e.id), `${kind} from (${p}) to (${q})`).toHaveLength(1);
}
const facesWhere = (b: ShellBuild, pred: (t: FaceTag) => boolean): ShellFace[] => b.shell.faces.filter(f => pred(f.tag));
const is = (kind: FaceTag['kind'], storey: number) => (t: FaceTag): boolean => t.kind === kind && t.storey === storey;
const sumArea = (fs: ShellFace[]): number => fs.reduce((s, f) => s + f.area, 0);
const planArea = (fs: ShellFace[]): number => fs.reduce((s, f) => s + f.area * Math.abs(f.normal[2]), 0);
const loopXs = (fs: ShellFace[]): number[] => fs.flatMap(f => f.loops.flat().map(p => p[0]));
const tagOf = (b: ShellBuild, f: number): FaceTag => b.shell.faces[f].tag;
function vertexNear(b: ShellBuild, p: Vec3): ShellVertex {
  const v = b.shell.vertices.find(x => near(x.p, p));
  if (!v) throw new Error(`no vertex at (${p})`);
  return v;
}

/** Whether plan point (x, y) lies in a face's plan projection, its boundary within tolerance included. */
function planHolds(f: ShellFace, x: number, y: number): boolean {
  let winding = 0;
  for (const loop of f.loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], c = loop[(i + 1) % loop.length];
      const dx = c[0] - a[0], dy = c[1] - a[1];
      const L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0;
      if (Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y) <= SHELL_TOLERANCE_CM) return true;
      if ((a[1] <= y) !== (c[1] <= y)) {
        const xi = a[0] + ((y - a[1]) * dx) / dy;
        if (xi > x) winding += c[1] > a[1] ? 1 : -1;
      }
    }
  }
  return winding !== 0;
}

// ---- Decision 32's WP3 invariants -------------------------------------------------------------------------------

describe('decision 32 invariants (WP3 part)', () => {
  it.each(ALL)('%s: every Cell polygon lies on its face', name => {
    const b = get(name);
    for (const c of b.shell.cells) {
      const f = b.shell.faces[c.face];
      for (const p of c.polygon) {
        expect(Math.abs(f.normal[0] * p[0] + f.normal[1] * p[1] + f.normal[2] * p[2] - f.offset)).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
      }
      // Within the face's region: the lattice frame's projection, read as in plan for a plan face, else in (u, z).
      const fr = b.frames[c.face];
      if (!fr) throw new Error(`cell ${c.id} on face ${c.face}, which has no lattice`);
      const flat = (p: Vec3): Vec3 => [p[fr.s], p[fr.t], 0];
      const projected: ShellFace = {...f, loops: f.loops.map(l => l.map(flat))};
      for (const p of c.polygon) expect(planHolds(projected, p[fr.s], p[fr.t]), `cell ${c.id} corner (${p})`).toBe(true);
    }
  });

  it.each(ALL)("%s: the summed ShellFace areas equal the output mesh's surface area", name => {
    const b = get(name);
    expect(Math.abs(sumArea(b.shell.faces) - meshSurfaceArea(b.union.mesh))).toBeLessThan(AREA_TOL);
  });

  it.each(ALL)('%s: each face\'s Cells tile its lattice projection', name => {
    const b = get(name);
    const byFace = new Map<number, number>();
    for (const c of b.shell.cells) {
      const fr = b.frames[c.face];
      if (!fr) throw new Error(`cell ${c.id} has no frame`);
      const n: Vec3 = [0, 0, 0];
      n[3 - fr.s - fr.t] = 1;
      byFace.set(c.face, (byFace.get(c.face) ?? 0) + Math.abs(loopArea(c.polygon.map(p => [p[fr.s], p[fr.t], 0]), [0, 0, 1])));
    }
    b.frames.forEach((fr, f) => {
      if (!fr) return;
      const face = b.shell.faces[f];
      const r = 3 - fr.s - fr.t;
      // Cells stand on the 1/1024 cm grid and the face's loops on the manifold's float32 positions: snapping moves a
      // vertex at most SNAP_MOVE, so the two areas may part by up to SNAP_MOVE times the face's perimeter.
      const perimeter = face.loops.reduce((s, l) => s + l.reduce((t, p, i) => t + dist(p, l[(i + 1) % l.length]), 0), 0);
      expect(Math.abs((byFace.get(f) ?? 0) - face.area * Math.abs(face.normal[r])), `face ${f}`).toBeLessThan(AREA_TOL + SNAP_MOVE * perimeter);
    });
  });
});

// ---- The net's invariants ---------------------------------------------------------------------------------------

describe('the net (journal decisions 58 to 60)', () => {
  it.each(ALL)('%s: NetEdges pair Cell sides one to one', name => {
    const b = get(name);
    const {cells, netEdges, edges} = b.shell;
    for (const n of netEdges) {
      if (n.shellEdge < 0) {
        expect(n.cells, `interior NetEdge ${n.id}`).toHaveLength(2);
        expect(cells[n.cells[0]].face).toBe(cells[n.cells[1]].face);
      } else {
        const faces = edges[n.shellEdge].faces.filter(f => b.frames[f] !== null);
        expect(n.cells.length, `NetEdge ${n.id} on ShellEdge ${n.shellEdge}`).toBe(faces.length);
        expect(n.cells.map(c => cells[c].face).sort()).toEqual([...faces].sort());
      }
    }
    for (const c of cells) {
      c.sides.forEach((s, i) => {
        const n = netEdges[s];
        expect(n.cells).toContain(c.id);
        expect([...n.v].sort()).toEqual([c.corners[i], c.corners[(i + 1) % c.corners.length]].sort());
      });
    }
  });

  it.each(ALL)('%s: every Cell winds counter-clockwise seen from outside', name => {
    const b = get(name);
    for (const c of b.shell.cells) expect(loopArea(c.polygon, b.shell.faces[c.face].normal)).toBeGreaterThan(0);
  });

  it.each(ALL)('%s: vertices are unique grid points, and ShellEdge ends are vertices', name => {
    const b = get(name);
    const keys = new Set(b.shell.vertices.map(v => v.p.join(',')));
    expect(keys.size).toBe(b.shell.vertices.length);
    for (const v of b.shell.vertices) expect(snapPoint(v.p)).toEqual(v.p);
    for (const e of b.shell.edges) {
      expect(b.shell.vertices[e.v[0]].p).toEqual(snapPoint(e.a));
      expect(b.shell.vertices[e.v[1]].p).toEqual(snapPoint(e.b));
    }
    for (const c of b.shell.cells) c.corners.forEach((v, i) => expect(b.shell.vertices[v].p).toEqual(c.polygon[i]));
  });

  it.each(ALL)("%s: each vertex lists its NetEdges and Cells in the Cells' counter-clockwise order", name => {
    const b = get(name);
    const {cells, vertices, netEdges} = b.shell;
    for (const v of vertices) {
      const m = v.edges.length;
      let last = -1;
      for (const cid of v.cells) {
        const c = cells[cid];
        const i = c.corners.indexOf(v.id);
        const out = c.sides[i], into = c.sides[(i - 1 + c.corners.length) % c.corners.length];
        const j = v.edges.indexOf(out);
        expect(j, `vertex ${v.id} cell ${cid}`).toBeGreaterThan(last);
        expect(v.edges[(j + 1) % m], `vertex ${v.id} cell ${cid}`).toBe(into);
        last = j;
      }
      // Every incidence is listed exactly once.
      expect([...v.edges].sort((x, y) => x - y)).toEqual(netEdges.filter(n => n.v.includes(v.id)).map(n => n.id));
      expect([...v.cells].sort((x, y) => x - y)).toEqual(cells.filter(c => c.corners.includes(v.id)).map(c => c.id));
    }
  });

  it.each(ALL)('%s: at a lattice corner inside a face, the NetEdges turn counter-clockwise seen from outside', name => {
    const b = get(name);
    const {vertices, netEdges, faces} = b.shell;
    let checked = 0;
    for (const v of vertices) {
      if (v.faces.length !== 1 || v.edges.length !== 4 || v.cells.length !== 4) continue;
      const n = faces[v.faces[0]].normal;
      const dir = (e: number): Vec3 => {
        const o = vertices[netEdges[e].v[0] === v.id ? netEdges[e].v[1] : netEdges[e].v[0]].p;
        return [o[0] - v.p[0], o[1] - v.p[1], o[2] - v.p[2]];
      };
      for (let i = 0; i < 4; i++) {
        const d0 = dir(v.edges[i]), d1 = dir(v.edges[(i + 1) % 4]);
        const cr: Vec3 = [d0[1] * d1[2] - d0[2] * d1[1], d0[2] * d1[0] - d0[0] * d1[2], d0[0] * d1[1] - d0[1] * d1[0]];
        expect(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2]).toBeGreaterThan(0);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("orders a ground corner's faces counter-clockwise from outside: y = 0 wall, x = 0 wall, Ground", () => {
    const b = get('NarrowUpperStorey');
    const v = vertexNear(b, [0, 0, 0]);
    const on = (n: Vec3): number => b.shell.faces.findIndex(f => f.tag.storey === 0 && near(f.normal, n) && v.faces.includes(f.id));
    const want = [on([0, -1, 0]), on([-1, 0, 0]), on([0, 0, -1])];
    const k = v.faces.indexOf(want[0]);
    expect([...v.faces.slice(k), ...v.faces.slice(0, k)]).toEqual(want);
  });

  it.each(ALL)('%s: no ShellEdge joins two faces of one identity (open question 4)', name => {
    const b = get(name);
    expect(b.shell.edges.filter(e => identityKey(tagOf(b, e.faces[0])) === identityKey(tagOf(b, e.faces[1]))).map(e => e.id)).toEqual([]);
  });

  it.each(ALL)('%s: a NetEdge on a ShellEdge takes its kind, an interior one its face\'s (decision 25)', name => {
    const b = get(name);
    const {netEdges, edges, cells, faces, vertices} = b.shell;
    for (const n of netEdges) {
      if (n.shellEdge >= 0) { expect(n.kind).toBe(edges[n.shellEdge].kind); continue; }
      const kind = faces[cells[n.cells[0]].face].tag.kind;
      const level = Math.abs(vertices[n.v[0]].p[2] - vertices[n.v[1]].p[2]) <= SHELL_TOLERANCE_CM;
      const want: Record<string, EdgeKind> = {
        Wall: level ? 'WallHorizontal' : 'WallVertical', Gable: level ? 'GableHorizontal' : 'GableVertical',
        Cheek: level ? 'GableHorizontal' : 'GableVertical', Underside: 'RoofInterior', Roof: 'RoofInterior',
      };
      expect(n.kind).toBe(want[kind]);
    }
  });

  it.each(ALL)('%s: Cells lie on every Wall, Gable, Cheek, Roof and Underside face, and on no Ground face', name => {
    const b = get(name);
    const withCells = new Set(b.shell.cells.map(c => c.face));
    for (const f of b.shell.faces) {
      const laid = ['Wall', 'Gable', 'Cheek', 'Roof', 'Underside'].includes(f.tag.kind);
      expect(withCells.has(f.id), `face ${f.id} ${identityKey(f.tag)}`).toBe(laid);
    }
  });
});

// ---- The report (decision 33) ---------------------------------------------------------------------------------------

/** Each fixture's report as measured: its conflict count (union.test.ts pins the strings) and the rest exactly. */
const SOFFIT = {newEdgeKinds: ['SoffitEdge', 'SoffitJunction'], newConventions: [CONVENTION_UNDERSIDE_ROOF_INTERIOR]};
const PLAIN = {newEdgeKinds: [], newConventions: []};
const CORNERED = {newEdgeKinds: [], newConventions: [CONVENTION_CORNER_BY_GEOMETRY]};
const REPORTS: Record<string, {conflicts: number; partialCells: number; newEdgeKinds: string[]; newConventions: string[]}> = {
  NarrowUpperStorey: {conflicts: 1, partialCells: 56, ...PLAIN},
  NarrowUpperStoreyGabled: {conflicts: 2, partialCells: 56, ...PLAIN},
  TallerUpper: {conflicts: 1, partialCells: 66, ...PLAIN},
  Overhang: {conflicts: 0, partialCells: 90, ...SOFFIT},
  OverhangApexOnEave: {conflicts: 0, partialCells: 84, ...SOFFIT},
  Bridge: {conflicts: 0, partialCells: 48, ...SOFFIT},
  BridgeOverBlock: {conflicts: 0, partialCells: 96, ...SOFFIT},
  ValleyWings: {conflicts: 0, partialCells: 54, ...CORNERED},
  ValleyWingsPierced: {conflicts: 0, partialCells: 116, ...CORNERED},
  SingleStoreyT: {conflicts: 0, partialCells: 42, ...CORNERED},
};

describe('the report (decision 33)', () => {
  it('pins a report for every fixture', () => {
    expect(Object.keys(REPORTS).sort()).toEqual(SHELL_FIXTURES.map(f => f.name).sort());
  });

  it.each(SHELL_FIXTURES.map(f => f.name))('%s: matches its measured report', name => {
    const {report, cells} = get(name).shell;
    const want = REPORTS[name];
    expect(report.conflicts).toHaveLength(want.conflicts);
    expect(report.survivingInternal).toBe(0);
    expect(report.unclassifiedEdges).toBe(0);
    expect(report.cheeks).toBe(0);
    expect(report.newEdgeKinds).toEqual(want.newEdgeKinds);
    expect(report.newConventions).toEqual(want.newConventions);
    expect(report.partialCells).toBe(cells.filter(c => !c.whole).length);
    expect(report.partialCells).toBe(want.partialCells);
  });

  it.each(ALL)('%s: lists the corner convention exactly when an InternalCorner is emitted (journal decision 90)', name => {
    const {report, edges} = get(name).shell;
    expect(report.newConventions.includes(CONVENTION_CORNER_BY_GEOMETRY)).toBe(edges.some(e => e.kind === 'InternalCorner'));
  });

  it.each(ALL)('%s: a whole Cell is its full lattice square', name => {
    const b = get(name);
    for (const c of b.shell.cells) {
      const fr = b.frames[c.face];
      if (!fr) throw new Error(`cell ${c.id} has no frame`);
      const a = Math.abs(loopArea(c.polygon.map(p => [p[fr.s], p[fr.t], 0]), [0, 0, 1]));
      expect(c.whole).toBe(2500 - a <= SHELL_TOLERANCE_CM * 50);
      if (c.whole) {
        for (const p of c.polygon) {
          expect(p[fr.s]).toBeGreaterThanOrEqual(c.lattice[0] * 50 - SHELL_TOLERANCE_CM);
          expect(p[fr.s]).toBeLessThanOrEqual(c.lattice[0] * 50 + 50 + SHELL_TOLERANCE_CM);
        }
      }
    }
  });
});

// ---- A surviving Cheek (journal decision 77) --------------------------------------------------------------------

describe('a surviving Cheek reads as a Gable (UProbe)', () => {
  it('has one Cheek face, every Edge of it classified, and Cells with Gable interior sides', () => {
    const b = get(U_PROBE.name);
    const {shell} = b;
    expect(shell.report.cheeks).toBe(1);
    expect(shell.report.unclassifiedEdges).toBe(0);
    expect(shell.report.newConventions).toContain(CONVENTION_CHEEK);
    const cheeks = shell.faces.filter(f => f.tag.kind === 'Cheek');
    expect(cheeks).toHaveLength(1);
    const around = shell.edges.filter(e => e.faces.includes(cheeks[0].id));
    expect(around.length).toBeGreaterThan(0);
    for (const e of around) expect(e.kind).not.toBe('Unclassified');
    // The Cheek stands on the band end x = 200 beside the arm wall's Gable: a flat vertical GableVertical between them.
    expect(around.map(e => e.kind)).toContain('GableVertical');
    const interior = shell.netEdges.filter(n => n.shellEdge < 0 && n.cells.some(c => shell.cells[c].face === cheeks[0].id));
    expect(interior.length).toBeGreaterThan(0);
    for (const n of interior) expect(['GableVertical', 'GableHorizontal']).toContain(n.kind);
  });
});

// ---- The fixtures (decisions 34 to 40) ------------------------------------------------------------------------------

const APEX_60 = 300 + 300 * TAN60; // 819.6
const RAKE_SEAT_Z = 300 + 50 * TAN60; // 386.6

describe.each(['NarrowUpperStorey', 'NarrowUpperStoreyGabled'])('%s (decisions 34 and 35)', name => {
  it('has no Roof face of storey 1', () => {
    expect(facesWhere(get(name), is('Roof', 1))).toEqual([]);
  });

  it("has storey 1's Wall faces only on y = 0, totalling 60000", () => {
    const walls = facesWhere(get(name), is('Wall', 1));
    for (const f of walls) {
      expect(near(f.normal, [0, -1, 0])).toBe(true);
      expect(Math.abs(f.offset)).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
    }
    expect(Math.abs(sumArea(walls) - 60000)).toBeLessThan(AREA_TOL);
  });

  it("has storey 0's Gable area 155884.6 - 60000", () => {
    expect(Math.abs(sumArea(facesWhere(get(name), is('Gable', 0))) - (90000 * TAN60 - 60000))).toBeLessThan(AREA_TOL);
  });

  it('has one Ridge, from (300, 0, 819.6) to (300, 300, 819.6)', () => {
    const b = get(name);
    expect(b.shell.edges.filter(e => e.kind === 'Ridge')).toHaveLength(1);
    expectEdge(b, 'Ridge', [300, 0, APEX_60], [300, 300, APEX_60]);
  });

  it('has GableVertical on x = 200 and x = 400 over z 300 to 600, GableHorizontal at z = 600 over x 200 to 400', () => {
    const b = get(name);
    expectEdge(b, 'GableVertical', [200, 0, 300], [200, 0, 600]);
    expectEdge(b, 'GableVertical', [400, 0, 300], [400, 0, 600]);
    expectEdge(b, 'GableHorizontal', [200, 0, 600], [400, 0, 600]);
  });

  it('has FloorLine at z = 300 over x 200 to 400, WallPlate at z = 300 over x 0 to 200 and x 400 to 600', () => {
    const b = get(name);
    expectEdge(b, 'FloorLine', [200, 0, 300], [400, 0, 300]);
    expectEdge(b, 'WallPlate', [0, 0, 300], [200, 0, 300]);
    expectEdge(b, 'WallPlate', [400, 0, 300], [600, 0, 300]);
  });

  it("lists a Verge and a GableVertical NetEdge at the rake seat (50, 0, 386.6), C28's bracket seat", () => {
    const b = get(name);
    const v = vertexNear(b, [50, 0, RAKE_SEAT_Z]);
    const kinds = v.edges.map(e => b.shell.netEdges[e].kind);
    expect(kinds).toContain('Verge');
    expect(kinds).toContain('GableVertical');
  });
});

describe('NarrowUpperStoreyGabled (decision 35)', () => {
  it("equals NarrowUpperStorey's faces, tags and areas, and no storey-1 Gable survives", () => {
    const sig = (b: ShellBuild): string[] => b.shell.faces.map(f =>
      `${identityKey(f.tag)} n=${f.normal.map(x => x.toFixed(6)).join(',')} d=${f.offset.toFixed(3)} a=${(Math.round(f.area * 10) / 10).toFixed(1)}`).sort();
    expect(sig(get('NarrowUpperStoreyGabled'))).toEqual(sig(get('NarrowUpperStorey')));
    expect(facesWhere(get('NarrowUpperStoreyGabled'), is('Gable', 1))).toEqual([]);
  });
});

describe('TallerUpper (decision 36)', () => {
  const low = 300 + 200 * TAN30; // 415.5
  const apex = 300 + 300 * TAN30; // 473.2

  it("has storey 1's Roof faces over plan area 40000", () => {
    expect(Math.abs(planArea(facesWhere(get('TallerUpper'), is('Roof', 1))) - 40000)).toBeLessThan(AREA_TOL);
  });

  it('has its lower Ridge only from y = 200 to y = 300 at x = 300', () => {
    const b = get('TallerUpper');
    const lower = b.shell.edges.filter(e => e.kind === 'Ridge' && e.faces.every(f => is('Roof', 0)(tagOf(b, f))));
    expect(lower).toHaveLength(1);
    expectEdge(b, 'Ridge', [300, 200, apex], [300, 300, apex]);
  });

  it('has RingJunctions along x = 200 and x = 400 at z = 415.5 over y 0 to 200', () => {
    const b = get('TallerUpper');
    expectEdge(b, 'RingJunction', [200, 0, low], [200, 200, low]);
    expectEdge(b, 'RingJunction', [400, 0, low], [400, 200, low]);
  });

  it('has two sloped RingJunctions on y = 200 meeting at (300, 200, 473.2)', () => {
    const b = get('TallerUpper');
    expectEdge(b, 'RingJunction', [200, 200, low], [300, 200, apex]);
    expectEdge(b, 'RingJunction', [300, 200, apex], [400, 200, low]);
  });
});

describe('Overhang (decision 37)', () => {
  const apex = 300 + 300 * TAN30;

  it("has storey 1's Underside only over x 600 to 900, area 180000", () => {
    const u = facesWhere(get('Overhang'), is('Underside', 1));
    expect(Math.abs(sumArea(u) - 180000)).toBeLessThan(AREA_TOL);
    for (const x of loopXs(u)) { expect(x).toBeGreaterThanOrEqual(600 - SHELL_TOLERANCE_CM); expect(x).toBeLessThanOrEqual(900 + SHELL_TOLERANCE_CM); }
  });

  it("has storey 0's Roof only over x 0 to 300, plan area 180000", () => {
    const r = facesWhere(get('Overhang'), is('Roof', 0));
    expect(Math.abs(planArea(r) - 180000)).toBeLessThan(AREA_TOL);
    for (const x of loopXs(r)) expect(x).toBeLessThanOrEqual(300 + SHELL_TOLERANCE_CM);
  });

  it('has SoffitEdge along x = 900, and along y = 0 and y = 600 over x 600 to 900', () => {
    const b = get('Overhang');
    expectEdge(b, 'SoffitEdge', [900, 0, 300], [900, 600, 300]);
    expectEdge(b, 'SoffitEdge', [600, 0, 300], [900, 0, 300]);
    expectEdge(b, 'SoffitEdge', [600, 600, 300], [900, 600, 300]);
  });

  it('has SoffitJunction along x = 600 at z = 300', () => {
    expectEdge(get('Overhang'), 'SoffitJunction', [600, 0, 300], [600, 600, 300]);
  });

  it('has a ^-shaped RingJunction on x = 300 through (300, 0, 300), (300, 300, 473.2) and (300, 600, 300)', () => {
    const b = get('Overhang');
    expectEdge(b, 'RingJunction', [300, 0, 300], [300, 300, apex]);
    expectEdge(b, 'RingJunction', [300, 300, apex], [300, 600, 300]);
  });
});

describe('Bridge (decision 38)', () => {
  it('has no Roof face of storey 0 or storey 1', () => {
    expect(facesWhere(get('Bridge'), t => t.kind === 'Roof' && t.storey < 2)).toEqual([]);
  });

  it("has storey 2's Underside over x 200 to 800, area 360000", () => {
    const u = facesWhere(get('Bridge'), is('Underside', 2));
    expect(Math.abs(sumArea(u) - 360000)).toBeLessThan(AREA_TOL);
    for (const x of loopXs(u)) { expect(x).toBeGreaterThanOrEqual(200 - SHELL_TOLERANCE_CM); expect(x).toBeLessThanOrEqual(800 + SHELL_TOLERANCE_CM); }
  });

  it.each([200, 800])('has SoffitJunction, FloorLine and GroundLine along the inner wall x = %i', x => {
    const b = get('Bridge');
    expectEdge(b, 'SoffitJunction', [x, 0, 600], [x, 600, 600]);
    expectEdge(b, 'FloorLine', [x, 0, 300], [x, 600, 300]);
    expectEdge(b, 'GroundLine', [x, 0, 0], [x, 600, 0]);
  });
});

describe('BridgeOverBlock (decision 38)', () => {
  const apex = 300 + 300 * TAN30;
  const low = 300 + 200 * TAN30;

  it("has storey 0's Roof over x 200 to 800, its Ridge whole from x 300 to 700 at z 473.2", () => {
    const b = get('BridgeOverBlock');
    const r = facesWhere(b, is('Roof', 0));
    expect(Math.abs(planArea(r) - 360000)).toBeLessThan(AREA_TOL);
    for (const x of loopXs(r)) { expect(x).toBeGreaterThanOrEqual(200 - SHELL_TOLERANCE_CM); expect(x).toBeLessThanOrEqual(800 + SHELL_TOLERANCE_CM); }
    const ridge = edgesBetween(b, 'Ridge', [300, 300, apex], [700, 300, apex]);
    expect(ridge).toHaveLength(1);
    expect(ridge[0].faces.every(f => is('Roof', 0)(tagOf(b, f)))).toBe(true);
  });

  it('has no Roof face of storey 1', () => {
    expect(facesWhere(get('BridgeOverBlock'), is('Roof', 1))).toEqual([]);
  });

  it("has storey 2's Underside over x 200 to 800, area 360000", () => {
    const u = facesWhere(get('BridgeOverBlock'), is('Underside', 2));
    expect(Math.abs(sumArea(u) - 360000)).toBeLessThan(AREA_TOL);
    for (const x of loopXs(u)) { expect(x).toBeGreaterThanOrEqual(200 - SHELL_TOLERANCE_CM); expect(x).toBeLessThanOrEqual(800 + SHELL_TOLERANCE_CM); }
  });

  it.each([200, 800])("meets the tower's inner wall x = %i by sloped RingJunctions", x => {
    const b = get('BridgeOverBlock');
    expectEdge(b, 'RingJunction', [x, 0, 300], [x, 200, low]);
    expectEdge(b, 'RingJunction', [x, 400, low], [x, 600, 300]);
    for (const e of b.shell.edges.filter(e => e.faces.some(f => is('Roof', 0)(tagOf(b, f))) && e.faces.some(f => is('Wall', 1)(tagOf(b, f))))) {
      expect(e.kind).toBe('RingJunction');
    }
  });
});

describe('ValleyWings (decision 39)', () => {
  it("has a Valley on x + y = 1000 ending on storey 1's y = 300 wall at (700, 300), where two RingJunctions meet", () => {
    const b = get('ValleyWings');
    const valleys = b.shell.edges.filter(e => e.kind === 'Valley' && e.faces.every(f => is('Roof', 0)(tagOf(b, f))));
    expect(valleys).toHaveLength(1);
    const [v] = valleys;
    for (const p of [v.a, v.b]) expect(Math.abs(p[0] + p[1] - 1000)).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
    const end: Vec3 = [700, 300, 400];
    expect(near(v.a, end) || near(v.b, end)).toBe(true);
    const meet = b.shell.edges.filter(e => e.kind === 'RingJunction' && (near(e.a, end) || near(e.b, end)));
    expect(meet).toHaveLength(2);
    for (const e of meet) expect(e.faces.some(f => is('Wall', 1)(tagOf(b, f)))).toBe(true);
  });

  it('has no Roof face of storey 0 meeting a Roof face of storey 1', () => {
    const b = get('ValleyWings');
    const kinds = (e: ShellEdge): string => e.faces.map(f => `${tagOf(b, f).kind}${tagOf(b, f).storey}`).sort().join('|');
    expect(b.shell.edges.filter(e => kinds(e) === 'Roof0|Roof1')).toEqual([]);
  });

  it('has no Unclassified Edge', () => {
    expect(get('ValleyWings').shell.edges.filter(e => e.kind === 'Unclassified')).toEqual([]);
  });
});

describe('SingleStoreyT (decision 40)', () => {
  const case2a = CASES.find(c => c.id === '2a');

  it("has its Roof and Gable top surface at case 2a's expected(p) plus the plate, on a 25 cm grid inside the footprint", () => {
    if (!case2a?.expected) throw new Error('case 2a has no expected(p)');
    const expected = case2a.expected;
    const roofs = facesWhere(get('SingleStoreyT'), t => t.kind === 'Roof');
    const strictlyInside = (x: number, y: number): boolean =>
      (x > 0 && x < 1000 && y > 0 && y < 500) || (x >= 1000 && x < 1400 && y > 150 && y < 350);
    let checked = 0;
    for (let x = 25; x < 1400; x += 25) {
      for (let y = 25; y < 500; y += 25) {
        if (!strictlyInside(x, y)) continue;
        const zs = roofs.filter(f => planHolds(f, x, y)).map(f => (f.offset - f.normal[0] * x - f.normal[1] * y) / f.normal[2]);
        expect(zs.length, `no Roof face over (${x}, ${y})`).toBeGreaterThan(0);
        expect(Math.abs(Math.max(...zs) - (300 + expected({x, y}))), `top at (${x}, ${y})`).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(800);
  });

  // Interpretation, reported to the arc lead: "its report is empty" is read as empty of findings. Taken literally it
  // cannot hold: exact roof cuts give partial Cells (42), and its two InternalCorners list journal decision 90's
  // convention, which the spec says is not a defect. Both are pinned in REPORTS above.
  it('has a report empty of findings: no conflict, no surviving Internal, no Unclassified Edge, no Cheek, no new kind', () => {
    const {report} = get('SingleStoreyT').shell;
    expect({conflicts: report.conflicts, survivingInternal: report.survivingInternal, unclassifiedEdges: report.unclassifiedEdges,
      cheeks: report.cheeks, newEdgeKinds: report.newEdgeKinds}).toEqual({
      conflicts: [], survivingInternal: 0, unclassifiedEdges: 0, cheeks: 0, newEdgeKinds: [],
    });
  });
});

// ---- The degenerate twins: decision 32's invariants plus their measured topology -----------------------------------

/** Faces per kind and storey, ShellEdges per kind, and the net's counts, as measured. */
interface TwinTopology { faces: Record<string, number>; edges: Record<string, number>; vertices: number; netEdges: number; cells: number }
const TWIN_TOPOLOGY: Record<string, TwinTopology> = {
  OverhangApexOnEave: {
    faces: {Ground0: 1, Roof0: 3, Roof1: 4, Underside1: 1, Wall0: 4, Wall1: 5},
    edges: {Eaves: 8, ExternalCorner: 8, FloorLine: 2, GroundLine: 4, Hip: 6, RingJunction: 2, SoffitEdge: 3, SoffitJunction: 1},
    vertices: 853, netEdges: 1722, cells: 870,
  },
  ValleyWingsPierced: {
    faces: {Gable0: 2, Ground0: 1, Roof0: 4, Roof1: 4, Wall0: 8, Wall1: 6},
    edges: {Eaves: 12, ExternalCorner: 9, GroundLine: 8, Hip: 5, InternalCorner: 1, Ridge: 2, RingJunction: 6, Valley: 5, Verge: 4, WallPlate: 2, WallVertical: 2},
    vertices: 971, netEdges: 1896, cells: 926,
  },
};

describe.each(Object.keys(TWIN_TOPOLOGY))('%s (degenerate twin)', name => {
  const count = (keys: string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const k of [...keys].sort()) out[k] = (out[k] ?? 0) + 1;
    return out;
  };

  it('has its measured faces and Edges', () => {
    const b = get(name);
    expect(count(b.shell.faces.map(f => `${f.tag.kind}${f.tag.storey}`))).toEqual(TWIN_TOPOLOGY[name].faces);
    expect(count(b.shell.edges.map(e => e.kind))).toEqual(TWIN_TOPOLOGY[name].edges);
    const {vertices, netEdges, cells} = TWIN_TOPOLOGY[name];
    expect({vertices: b.shell.vertices.length, netEdges: b.shell.netEdges.length, cells: b.shell.cells.length}).toEqual({vertices, netEdges, cells});
  });
});

describe('OverhangApexOnEave pinch (decision 37)', () => {
  it("splits storey 1's x = 300 wall into two faces touching only at (300, 300, 600)", () => {
    const b = get('OverhangApexOnEave');
    const pinch: Vec3 = [300, 300, 600];
    const halves = facesWhere(b, is('Wall', 1)).filter(f => near(f.normal, [-1, 0, 0]) && Math.abs(f.offset + 300) <= SHELL_TOLERANCE_CM);
    expect(halves).toHaveLength(2);
    for (const f of halves) expect(f.loops.flat().some(p => near(p, pinch))).toBe(true);
    expect(b.shell.edges.filter(e => e.faces.includes(halves[0].id) && e.faces.includes(halves[1].id))).toEqual([]);
    expect(vertexNear(b, pinch).faces.filter(f => f === halves[0].id || f === halves[1].id)).toHaveLength(2);
  });
});

describe('fixture coverage', () => {
  it('builds every fixture in the roster', () => {
    for (const f of SHELL_FIXTURES) expect(fixtureByName(f.name).name).toBe(get(f.name).shell.fixture);
  });
});
