// Step 4 end to end on every fixture: decision 32's WP3 invariants, the net's own invariants (journal decisions 58 to
// 60), the report (decision 33), and each fixture's own assertions (decisions 34 to 40).
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {EdgeKind, ShellEdge, ShellVertex, snapPoint} from '../src/edges.ts';
import type {Vec2} from 'manifold-3d';
import {errorMessage} from '../src/errors.ts';
import {ShellFace, facePlane, loopArea} from '../src/faces.ts';
import {FixtureRing, RingSides, SHELL_FIXTURES, STOREY_HEIGHT_CM, ShellFixture, fixtureByName, ring} from '../src/fixture.ts';
import {getManifold} from '../src/manifold.ts';
import {tanDeg} from '../src/ring-forms.ts';
import {CASES} from '../src/roof/cases.ts';
import {Rect, Sel, buildFromRects} from '../src/roof/model.ts';
import {
  CONVENTION_CHEEK, CONVENTION_CORNER_BY_GEOMETRY, CONVENTION_ROOF_LINES_CUT, CONVENTION_UNDERSIDE_ROOF_INTERIOR, ROOF_LINE_KINDS,
  ShellBuild, ShellReport, buildShellDetailed, buildShellFromUnion,
} from '../src/shell.ts';
import {planChecked} from '../src/storey.ts';
import {FaceTag, Vec3, clusterKeyOf} from '../src/tags.ts';
import {unionPlans} from '../src/union.ts';
import {cross2} from '../src/vec3.ts';
import {SNAP_STEPS_PER_CM} from '../src/weld.ts';
import {AREA_TOL, SNAP_MOVE, dist, faceLoopViolations, planHolds, tagPlaneViolations} from './shell-invariants.ts';

const TAN30 = Math.tan(Math.PI / 6);
const TAN60 = Math.sqrt(3);

/**
 * The correctness reviewer's U (storey.test.ts): one surviving Cheek, on x = 200 over the spine. Its y = 0 line is
 * gabled over [0, 200] only, which Ring authoring cannot say (the whole union wall takes one form, spec decision 3), so
 * its storey is built from roof-gable `Sel`s, below the fixture layer, exactly as before Ring forms.
 */
const U_RECTS: Rect[] = [[0, 0, 200, 600], [0, 0, 1000, 200], [800, 0, 1000, 600]];
const U_SELS: Sel[] = [{y: 0, to: 200, form: 'gable'}];
const oneStoreyRings = (rects: Rect[], deg: number, sides: RingSides[] = []): FixtureRing[] =>
  rects.map((rect, i) => ring(rect, 0, 1, deg, sides[i]));
const U_PROBE: ShellFixture = {name: 'UProbe', cellSize: 50, storeyHeight: STOREY_HEIGHT_CM, rings: oneStoreyRings(U_RECTS, 45)};

async function buildUProbe(): Promise<ShellBuild> {
  const wasm = await getManifold();
  const plan = planChecked(U_PROBE.name, 0, 0, STOREY_HEIGHT_CM, buildFromRects(U_RECTS, U_SELS, tanDeg(45)));
  return buildShellFromUnion(wasm, U_PROBE, unionPlans(wasm, U_PROBE.name, [plan]));
}

/**
 * The correctness reviewer's hip-touch probes (journal decision 96, F1 and F2): storey 1 stands on storey 0's 45
 * degree hip with one corner on the hip line x = y, at (70, 70) off the lattice and at (100, 100) on it.
 */
const hipTouch = (name: string, upper: Rect): ShellFixture => ({
  name, cellSize: 50, storeyHeight: STOREY_HEIGHT_CM, rings: [ring([0, 0, 600, 600], 0, 1, 45), ring(upper, 1, 1, 45)],
});
const HIP_TOUCH_OFF = hipTouch('HipTouchOffLattice', [30, 70, 70, 170]);
const HIP_TOUCH_ON = hipTouch('HipTouchOnLattice', [50, 100, 100, 200]);

/** One fixture's build, or the error it threw (journal decision 100, N6). */
type BuildOutcome = ShellBuild | Error;

/** Each build, or the error it threw: a fixture that fails to build fails its own tests, not the whole file. */
const builds = new Map<string, BuildOutcome>();
/** One named build to run before the tests: the fixture's name and how to build it. */
type BuildJob = [name: string, build: () => Promise<ShellBuild>];

beforeAll(async () => {
  const jobs: BuildJob[] = [
    ...[...SHELL_FIXTURES, ...FIXTURE_PROBES].map((f): BuildJob => [f.name, () => buildShellDetailed(f)]),
    [U_PROBE.name, buildUProbe],
  ];
  for (const [name, build] of jobs) {
    try {
      builds.set(name, await build());
    } catch (e) {
      builds.set(name, e instanceof Error ? e : new Error(errorMessage(e)));
    }
  }
}, 120_000);
function get(name: string): ShellBuild {
  const b = builds.get(name);
  if (!b) throw new Error(`no shell built for ${name}`);
  if (b instanceof Error) throw b;
  return b;
}
const FIXTURE_PROBES = [HIP_TOUCH_OFF, HIP_TOUCH_ON];
const ALL = [...SHELL_FIXTURES.map(f => f.name), U_PROBE.name, ...FIXTURE_PROBES.map(f => f.name)];

// ---- Helpers ----------------------------------------------------------------------------------------------------

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

  // Spec decision 32 as amended (journal decisions 110 and 122, F-E): each face's loops against its own triangles.
  it.each(ALL)("%s: every ShellFace's loops lie within tolerance of its triangles' boundary, by Hausdorff distance", name => {
    expect(faceLoopViolations(get(name))).toEqual([]);
  });

  // Journal decision 110, C3.
  it.each(ALL)("%s: every output triangle lies on its tag's generating plane", name => {
    expect(tagPlaneViolations(get(name))).toEqual([]);
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
    const id = (f: number): string => b.faces.identities[f];
    expect(b.shell.edges.filter(e => id(e.faces[0]) === id(e.faces[1])).map(e => e.id)).toEqual([]);
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
      expect(withCells.has(f.id), `face ${f.id} ${b.faces.identities[f.id]}`).toBe(laid);
    }
  });
});

// ---- The report (decision 33) ---------------------------------------------------------------------------------------

/** A fixture's report as measured: its conflict count (union.test.ts pins the strings) and the rest exactly. */
type ReportPin = Pick<ShellReport, 'partialCells' | 'newEdgeKinds' | 'newConventions'> & {conflicts: number};
type KindsPin = Pick<ShellReport, 'newEdgeKinds' | 'newConventions'>;
// Every fixture with a Hip cuts a Roof Cell exactly (journal decision 96, F5). DefaultChalet has none, and its one
// Ridge runs on the Cell line y = 500, so it lists no convention at all.
const SOFFIT: KindsPin = {newEdgeKinds: ['SoffitEdge', 'SoffitJunction'], newConventions: [CONVENTION_UNDERSIDE_ROOF_INTERIOR, CONVENTION_ROOF_LINES_CUT]};
const PLAIN: KindsPin = {newEdgeKinds: [], newConventions: [CONVENTION_ROOF_LINES_CUT]};
const CORNERED: KindsPin = {newEdgeKinds: [], newConventions: [CONVENTION_CORNER_BY_GEOMETRY, CONVENTION_ROOF_LINES_CUT]};
const NONE: KindsPin = {newEdgeKinds: [], newConventions: []};
// Re-measured at 250 cm storeys (journal decision 102): OverhangApexOnEave 84 -> 70 (redesigned footprints) and
// ValleyWingsPierced 116 -> 124; every other count is unchanged.
const REPORTS: Record<string, ReportPin> = {
  NarrowUpperStorey: {conflicts: 1, partialCells: 56, ...PLAIN},
  NarrowUpperStoreyGabled: {conflicts: 2, partialCells: 56, ...PLAIN},
  TallerUpper: {conflicts: 1, partialCells: 66, ...PLAIN},
  Overhang: {conflicts: 0, partialCells: 90, ...SOFFIT},
  OverhangApexOnEave: {conflicts: 0, partialCells: 70, ...SOFFIT},
  Bridge: {conflicts: 0, partialCells: 48, ...SOFFIT},
  BridgeOverBlock: {conflicts: 0, partialCells: 96, ...SOFFIT},
  ValleyWings: {conflicts: 0, partialCells: 54, ...CORNERED},
  ValleyWingsPierced: {conflicts: 0, partialCells: 124, ...CORNERED},
  SingleStoreyT: {conflicts: 0, partialCells: 42, ...CORNERED},
  DefaultChalet: {conflicts: 0, partialCells: 56, ...NONE},
  // Journal decision 115: the courtyard's four inner corners are InternalCorners, and its hips cut Roof Cells.
  Courtyard: {conflicts: 0, partialCells: 48, ...CORNERED},
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

/** Every fixture's storey height (journal decision 102): plates at 250, 500 and 750. */
const H = STOREY_HEIGHT_CM;
const APEX_60 = H + 300 * TAN60; // 769.6
const RAKE_SEAT_Z = H + 50 * TAN60; // 336.6

describe.each(['NarrowUpperStorey', 'NarrowUpperStoreyGabled'])('%s (decisions 34 and 35)', name => {
  it('has no Roof face of storey 1', () => {
    expect(facesWhere(get(name), is('Roof', 1))).toEqual([]);
  });

  it("has storey 1's Wall faces only on y = 0, totalling 50000", () => {
    const walls = facesWhere(get(name), is('Wall', 1));
    for (const f of walls) {
      expect(near(f.normal, [0, -1, 0])).toBe(true);
      expect(Math.abs(f.offset)).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
    }
    expect(Math.abs(sumArea(walls) - 200 * H)).toBeLessThan(AREA_TOL);
  });

  it("has storey 0's Gable area 155884.6 - 50000 = 105884.6", () => {
    expect(Math.abs(sumArea(facesWhere(get(name), is('Gable', 0))) - (90000 * TAN60 - 200 * H))).toBeLessThan(AREA_TOL);
  });

  it('has one Ridge, from (300, 0, 769.6) to (300, 300, 769.6)', () => {
    const b = get(name);
    expect(b.shell.edges.filter(e => e.kind === 'Ridge')).toHaveLength(1);
    expectEdge(b, 'Ridge', [300, 0, APEX_60], [300, 300, APEX_60]);
  });

  it('has GableVertical on x = 200 and x = 400 over z 250 to 500, GableHorizontal at z = 500 over x 200 to 400', () => {
    const b = get(name);
    expectEdge(b, 'GableVertical', [200, 0, H], [200, 0, 2 * H]);
    expectEdge(b, 'GableVertical', [400, 0, H], [400, 0, 2 * H]);
    expectEdge(b, 'GableHorizontal', [200, 0, 2 * H], [400, 0, 2 * H]);
  });

  it('has FloorLine at z = 250 over x 200 to 400, WallPlate at z = 250 over x 0 to 200 and x 400 to 600', () => {
    const b = get(name);
    expectEdge(b, 'FloorLine', [200, 0, H], [400, 0, H]);
    expectEdge(b, 'WallPlate', [0, 0, H], [200, 0, H]);
    expectEdge(b, 'WallPlate', [400, 0, H], [600, 0, H]);
  });

  it("lists a Verge and a GableVertical NetEdge at the rake seat (50, 0, 336.6), C28's bracket seat", () => {
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
      `${b.faces.identities[f.id]} n=${f.normal.map(x => x.toFixed(6)).join(',')} d=${f.offset.toFixed(3)} a=${(Math.round(f.area * 10) / 10).toFixed(1)}`).sort();
    expect(sig(get('NarrowUpperStoreyGabled'))).toEqual(sig(get('NarrowUpperStorey')));
    expect(facesWhere(get('NarrowUpperStoreyGabled'), is('Gable', 1))).toEqual([]);
  });
});

describe('TallerUpper (decision 36)', () => {
  const low = H + 200 * TAN30; // 365.5
  const apex = H + 300 * TAN30; // 423.2

  it("has storey 1's Roof faces over plan area 40000", () => {
    expect(Math.abs(planArea(facesWhere(get('TallerUpper'), is('Roof', 1))) - 40000)).toBeLessThan(AREA_TOL);
  });

  it('has its lower Ridge only from y = 200 to y = 300 at x = 300', () => {
    const b = get('TallerUpper');
    const lower = b.shell.edges.filter(e => e.kind === 'Ridge' && e.faces.every(f => is('Roof', 0)(tagOf(b, f))));
    expect(lower).toHaveLength(1);
    expectEdge(b, 'Ridge', [300, 200, apex], [300, 300, apex]);
  });

  it('has RingJunctions along x = 200 and x = 400 at z = 365.5 over y 0 to 200', () => {
    const b = get('TallerUpper');
    expectEdge(b, 'RingJunction', [200, 0, low], [200, 200, low]);
    expectEdge(b, 'RingJunction', [400, 0, low], [400, 200, low]);
  });

  it('has two sloped RingJunctions on y = 200 meeting at (300, 200, 423.2)', () => {
    const b = get('TallerUpper');
    expectEdge(b, 'RingJunction', [200, 200, low], [300, 200, apex]);
    expectEdge(b, 'RingJunction', [300, 200, apex], [400, 200, low]);
  });
});

describe('Overhang (decision 37)', () => {
  const apex = H + 300 * TAN30; // 423.2

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
    expectEdge(b, 'SoffitEdge', [900, 0, H], [900, 600, H]);
    expectEdge(b, 'SoffitEdge', [600, 0, H], [900, 0, H]);
    expectEdge(b, 'SoffitEdge', [600, 600, H], [900, 600, H]);
  });

  it('has SoffitJunction along x = 600 at z = 250', () => {
    expectEdge(get('Overhang'), 'SoffitJunction', [600, 0, H], [600, 600, H]);
  });

  it('has a ^-shaped RingJunction on x = 300 through (300, 0, 250), (300, 300, 423.2) and (300, 600, 250)', () => {
    const b = get('Overhang');
    expectEdge(b, 'RingJunction', [300, 0, H], [300, 300, apex]);
    expectEdge(b, 'RingJunction', [300, 300, apex], [300, 600, H]);
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
    expectEdge(b, 'SoffitJunction', [x, 0, 2 * H], [x, 600, 2 * H]);
    expectEdge(b, 'FloorLine', [x, 0, H], [x, 600, H]);
    expectEdge(b, 'GroundLine', [x, 0, 0], [x, 600, 0]);
  });
});

describe('BridgeOverBlock (decision 38)', () => {
  const apex = H + 300 * TAN30; // 423.2
  const low = H + 200 * TAN30; // 365.5

  it("has storey 0's Roof over x 200 to 800, its Ridge whole from x 300 to 700 at z 423.2", () => {
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
    expectEdge(b, 'RingJunction', [x, 0, H], [x, 200, low]);
    expectEdge(b, 'RingJunction', [x, 400, low], [x, 600, H]);
    for (const e of b.shell.edges.filter(e => e.faces.some(f => is('Roof', 0)(tagOf(b, f))) && e.faces.some(f => is('Wall', 1)(tagOf(b, f))))) {
      expect(e.kind).toBe('RingJunction');
    }
  });
});

describe('ValleyWings (decision 39)', () => {
  it("has a Valley on x + y = 1000 ending on storey 1's y = 300 wall at (700, 300, 350), where two RingJunctions meet", () => {
    const b = get('ValleyWings');
    const valleys = b.shell.edges.filter(e => e.kind === 'Valley' && e.faces.every(f => is('Roof', 0)(tagOf(b, f))));
    expect(valleys).toHaveLength(1);
    const [v] = valleys;
    for (const p of [v.a, v.b]) expect(Math.abs(p[0] + p[1] - 1000)).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
    const end: Vec3 = [700, 300, H + 100];
    expect(near(v.a, end) || near(v.b, end)).toBe(true);
    const meet = b.shell.edges.filter(e => e.kind === 'RingJunction' && (near(e.a, end) || near(e.b, end)));
    expect(meet).toHaveLength(2);
    for (const e of meet) expect(e.faces.some(f => is('Wall', 1)(tagOf(b, f)))).toBe(true);
  });

  it('has no Roof face of storey 0 meeting a Roof face of storey 1, by a shared Edge or a shared vertex', () => {
    const b = get('ValleyWings');
    const kinds = (e: ShellEdge): string => e.faces.map(f => `${tagOf(b, f).kind}${tagOf(b, f).storey}`).sort().join('|');
    expect(b.shell.edges.filter(e => kinds(e) === 'Roof0|Roof1')).toEqual([]);
    // Journal decision 96, F8: nor at a vertex.
    const both = b.shell.vertices.filter(v => v.faces.some(f => is('Roof', 0)(tagOf(b, f))) && v.faces.some(f => is('Roof', 1)(tagOf(b, f))));
    expect(both.map(v => v.p)).toEqual([]);
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
        expect(Math.abs(Math.max(...zs) - (H + expected({x, y}))), `top at (${x}, ${y})`).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
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

describe('DefaultChalet (decision 40, journal decision 103)', () => {
  const TAN22_5 = Math.tan(Math.PI / 8);
  const ridgeZ = H + 500 * TAN22_5; // 457.1

  it('has one Ridge, from (0, 500, 457.1) to (1000, 500, 457.1)', () => {
    const b = get('DefaultChalet');
    expect(b.shell.edges.filter(e => e.kind === 'Ridge')).toHaveLength(1);
    expectEdge(b, 'Ridge', [0, 500, ridgeZ], [1000, 500, ridgeZ]);
  });

  // The Gable's base corners lie on the 1/1024 cm grid; its apex at z = 457.10678 does not, and the raw parts' snap
  // (spec decision 11) moves it at most half a grid step, so over the 1000 cm base the area may move 500 / 2048 cm².
  // Measured: 103553.23, the apex snapped to 457.10645.
  it('has two Gable faces, each of area 103553.4 to within the apex snap', () => {
    const gables = facesWhere(get('DefaultChalet'), t => t.kind === 'Gable');
    expect(gables).toHaveLength(2);
    for (const f of gables) expect(Math.abs(f.area - 500 * 500 * TAN22_5)).toBeLessThanOrEqual(500 / (2 * SNAP_STEPS_PER_CM));
  });

  it('has four Verge Edges and two Eaves Edges', () => {
    const {edges} = get('DefaultChalet').shell;
    expect(edges.filter(e => e.kind === 'Verge')).toHaveLength(4);
    expect(edges.filter(e => e.kind === 'Eaves')).toHaveLength(2);
  });

  it('has a report empty of findings, in the sense SingleStoreyT has', () => {
    const {report} = get('DefaultChalet').shell;
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
    // Re-measured on the redesigned footprints at 250 cm storeys (journal decision 102): faces and Edges unchanged,
    // vertices 853 -> 596, NetEdges 1722 -> 1205, Cells 870 -> 610.
    vertices: 596, netEdges: 1205, cells: 610,
  },
  // Re-measured under journal decision 96's plane identity: the L's two collinear walls on y = 0 and on x = 1000 are
  // now one face each (Wall0 8 -> 6), so their flat WallVertical seams go (2 -> 0) and the Eaves and GroundLines they
  // split join (12 -> 10, 8 -> 6).
  ValleyWingsPierced: {
    faces: {Gable0: 2, Ground0: 1, Roof0: 4, Roof1: 4, Wall0: 6, Wall1: 6},
    edges: {Eaves: 10, ExternalCorner: 9, GroundLine: 6, Hip: 5, InternalCorner: 1, Ridge: 2, RingJunction: 6, Valley: 5, Verge: 4, WallPlate: 2},
    // Re-measured at 250 cm storeys (journal decision 102): faces and Edges unchanged, vertices 971 -> 873, NetEdges
    // 1896 -> 1702, Cells 926 -> 830.
    vertices: 873, netEdges: 1702, cells: 830,
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
  it("splits storey 1's x = 250 wall into two faces touching only at (250, 250, 500)", () => {
    const b = get('OverhangApexOnEave');
    const pinch: Vec3 = [250, 250, 2 * H];
    const halves = facesWhere(b, is('Wall', 1)).filter(f => near(f.normal, [-1, 0, 0]) && Math.abs(f.offset + 250) <= SHELL_TOLERANCE_CM);
    expect(halves).toHaveLength(2);
    for (const f of halves) expect(f.loops.flat().some(p => near(p, pinch))).toBe(true);
    expect(b.shell.edges.filter(e => e.faces.includes(halves[0].id) && e.faces.includes(halves[1].id))).toEqual([]);
    expect(vertexNear(b, pinch).faces.filter(f => f === halves[0].id || f === halves[1].id)).toHaveLength(2);
  });
});

// ---- The correctness review's findings (journal decision 96) ------------------------------------------------------

describe('F1: a ShellEdge end inside another ShellEdge is a vertex of both', () => {
  it("splits storey 0's hip at storey 1's corner (70, 70, 320), off the lattice, and pairs both sides there", () => {
    const b = get(HIP_TOUCH_OFF.name);
    const X: Vec3 = [70, 70, STOREY_HEIGHT_CM + 70];
    const x = vertexNear(b, X);
    const hips = b.shell.edges.filter(e => e.kind === 'Hip' && e.faces.every(f => is('Roof', 0)(tagOf(b, f)))
      && Math.abs(e.a[0] - e.a[1]) <= SHELL_TOLERANCE_CM && Math.abs(e.b[0] - e.b[1]) <= SHELL_TOLERANCE_CM);
    const through = hips.filter(e => !near(e.a, X) && !near(e.b, X) && Math.min(e.a[0], e.b[0]) < 70 && Math.max(e.a[0], e.b[0]) > 70);
    expect(through).toHaveLength(1);
    // X ends other ShellEdges, and the hip's NetEdges meet there from both roof faces.
    expect(b.shell.edges.filter(e => e.v.includes(x.id)).length).toBeGreaterThan(0);
    const atX = b.shell.netEdges.filter(n => n.shellEdge === through[0].id && n.v.includes(x.id));
    expect(atX).toHaveLength(2);
    for (const n of atX) expect(n.cells).toHaveLength(2);
  });
});

describe('F2: a hole touching its face\'s outer loop is two simple loops', () => {
  it("gives storey 0's west roof face an outer loop and storey 1's footprint as a hole touching it at (100, 100, 350)", () => {
    const b = get(HIP_TOUCH_ON.name);
    const west = facesWhere(b, is('Roof', 0)).filter(f => near(f.normal, [-Math.SQRT1_2, 0, Math.SQRT1_2]));
    expect(west).toHaveLength(1);
    const [outer, hole, ...rest] = west[0].loops;
    expect(rest).toEqual([]);
    for (const loop of [outer, hole]) expect(new Set(loop.map(p => snapPoint(p).join(','))).size).toBe(loop.length);
    expect(loopArea(outer, west[0].normal)).toBeGreaterThan(0);
    // The footprint [50, 100] x [100, 200] on z = 250 + x: 5000 cm² in plan, 5000 * sqrt 2 on the slope.
    expect(Math.abs(loopArea(hole, west[0].normal) + 5000 * Math.SQRT2)).toBeLessThan(AREA_TOL);
    const corners: Vec3[] = [[50, 100, H + 50], [100, 100, H + 100], [100, 200, H + 100], [50, 200, H + 50]];
    expect(hole).toHaveLength(4);
    for (const c of corners) expect(hole.some(p => near(p, c))).toBe(true);
    expect(outer.some(p => near(p, [100, 100, H + 100]))).toBe(true);
  });
});

describe('F3: a face meeting a vertex twice', () => {
  it("names storey 0's pinched west roof face twice at (70, 70, 320), in fan order", () => {
    const b = get(HIP_TOUCH_OFF.name);
    const x = vertexNear(b, [70, 70, STOREY_HEIGHT_CM + 70]);
    const west = facesWhere(b, is('Roof', 0)).filter(f => near(f.normal, [-Math.SQRT1_2, 0, Math.SQRT1_2]));
    expect(west).toHaveLength(1);
    expect(x.faces.filter(f => f === west[0].id)).toHaveLength(2);
  });
});

describe('F4: every Cell\'s lattice index', () => {
  it.each(ALL)('%s: matches the square its polygon lies in, on both axes', name => {
    const b = get(name);
    for (const c of b.shell.cells) {
      const fr = b.frames[c.face];
      if (!fr) throw new Error(`cell ${c.id} has no frame`);
      const pts: Vec2[] = c.polygon.map(p => [p[fr.s], p[fr.t]]);
      // The polygon's area centroid lies strictly inside the one square holding the whole polygon.
      let a = 0, cs = 0, ct = 0;
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        const w = cross2(p, q);
        a += w; cs += (p[0] + q[0]) * w; ct += (p[1] + q[1]) * w;
      });
      const centroid = [cs / (3 * a), ct / (3 * a)];
      expect([Math.floor(centroid[0] / 50), Math.floor(centroid[1] / 50)], `cell ${c.id}`).toEqual(c.lattice);
      for (const p of pts) {
        for (const ax of [0, 1]) {
          expect(p[ax]).toBeGreaterThanOrEqual(c.lattice[ax] * 50 - SHELL_TOLERANCE_CM);
          expect(p[ax]).toBeLessThanOrEqual(c.lattice[ax] * 50 + 50 + SHELL_TOLERANCE_CM);
        }
      }
    }
  });
});

describe('F5: the exact roof cut is a new convention', () => {
  const box = (name: string, depth: number): ShellFixture => ({
    name, cellSize: 50, storeyHeight: STOREY_HEIGHT_CM, rings: oneStoreyRings([[0, 0, 400, depth]], 45, [{W: {form: 'gable'}, E: {form: 'gable'}}]),
  });

  it('is not listed for a gabled box whose only roof line, its Ridge, runs on a Cell line', async () => {
    const {shell} = await buildShellDetailed(box('RidgeOnLattice', 300));
    expect(shell.edges.filter(e => ROOF_LINE_KINDS.includes(e.kind)).map(e => e.kind)).toEqual(['Ridge']);
    expect(shell.report.newConventions).not.toContain(CONVENTION_ROOF_LINES_CUT);
  });

  it('is listed once its Ridge runs off the Cell lines', async () => {
    const {shell} = await buildShellDetailed(box('RidgeOffLattice', 250));
    expect(shell.edges.filter(e => ROOF_LINE_KINDS.includes(e.kind)).map(e => e.kind)).toEqual(['Ridge']);
    expect(shell.report.newConventions).toContain(CONVENTION_ROOF_LINES_CUT);
  });
});

describe('F6: the shell does not depend on how the plan was split into Rings', () => {
  /** A face by what it is: identity on its plane, area, and its loops' points; never its id, wall or part. */
  const faceSig = (b: ShellBuild, f: ShellFace): string => {
    const loops = f.loops.map(l => l.map(p => snapPoint(p).map(x => x.toFixed(2)).join(',')).sort().join(' ')).sort();
    return `${f.tag.kind}|${f.tag.storey}|${clusterKeyOf(facePlane(f), b.union.tags.clusters)}|${f.area.toFixed(1)}|${loops.join(' / ')}`;
  };
  const edgeSig = (b: ShellBuild, e: ShellEdge): string => {
    const ends = [e.a, e.b].map(p => snapPoint(p).map(x => x.toFixed(2)).join(',')).sort();
    return `${e.kind}|${ends.join(' ')}|${e.faces.map(f => faceSig(b, b.shell.faces[f])).sort().join(' & ')}`;
  };

  it("builds Bridge's storey 2 from 3 Rings exactly as from 1, face for face and Edge for Edge", async () => {
    const three = get('Bridge');
    const bridge = fixtureByName('Bridge');
    const one = await buildShellDetailed({
      ...bridge, name: 'BridgeOneRing',
      rings: [ring([0, 0, 200, 600], 0, 2, 30), ring([800, 0, 1000, 600], 0, 2, 30), ring([0, 0, 1000, 600], 2, 1, 30)],
    });
    expect(three.shell.faces.map(f => faceSig(three, f)).sort()).toEqual(one.shell.faces.map(f => faceSig(one, f)).sort());
    expect(three.shell.edges.map(e => edgeSig(three, e)).sort()).toEqual(one.shell.edges.map(e => edgeSig(one, e)).sort());
    const counts = (b: ShellBuild): number[] => [b.shell.vertices.length, b.shell.netEdges.length, b.shell.cells.length];
    expect(counts(three)).toEqual(counts(one));
  });

  it("gives Bridge's storey 2 one Wall face per wall plane and no flat WallVertical seam", () => {
    const b = get('Bridge');
    expect(facesWhere(b, is('Wall', 2))).toHaveLength(4);
    expect(b.shell.edges.filter(e => e.kind === 'WallVertical')).toEqual([]);
  });
});

describe('fixture coverage', () => {
  it('builds every fixture in the roster', () => {
    for (const f of SHELL_FIXTURES) expect(fixtureByName(f.name).name).toBe(get(f.name).shell.fixture);
  });
});
