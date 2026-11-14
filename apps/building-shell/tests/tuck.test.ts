// Journal decision 272 (WP-C3), on the cause BSA.F87 found: a tuck Manifold's union leaves is labelled, not removed.
// Both layers are labelled Tuck, no Cell lies on them, each rim is one ShellEdge between the two real faces that meet
// there in the true building, and a fold left unlabelled is a hard error. The x-mirror of each input builds with no
// tuck (BSA.F87), so it is an exact oracle against a false seam: the labelled build, its Tuck faces set aside, is the
// mirror image of the clean one.
import type {SimplePolygon} from 'manifold-3d';
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import type {ShellFace} from '../src/faces.ts';
import {getManifold} from '../src/manifold.ts';
import type {ShellMesh} from '../src/mesh.ts';
import {RawTri, makeRegionModel, prepareRawTri} from '../src/regions.ts';
import {BuildingShell, ShellBuild, buildShellFromUnion} from '../src/shell.ts';
import {samePlane} from '../src/tags.ts';
import type {FaceTag, Plane3, Vec3} from '../src/tags.ts';
import {TuckModel, TuckPlane, flipPlane, labelTucks} from '../src/tuck.ts';
import {retagPass, unionShell} from '../src/union.ts';
import {lineDistance} from '../src/vec3.ts';
import {mirrorDifferences, mirrorFixture} from './mirror-oracle.ts';
import {pinnedOutcome} from './pin-table.ts';
import {GAP_DEFECTS} from './residue-pins.ts';
import {COVERED_RISE_CELL_CLASH, SILENT_TUCK_CASES, THROWING_TUCK_CASES, TuckCase, gapFixture} from './robustness-fixtures.ts';
import {AREA_TOL, invariantViolations} from './shell-invariants.ts';
import {memoBuilds} from './test-builds.ts';

const build = memoBuilds();

/** Every tuck input: those that threw, the Cheek reproducer (its span unused: its mirror is no oracle), the silent ones. */
const ALL_CASES: readonly TuckCase[] = [...THROWING_TUCK_CASES, {fixture: COVERED_RISE_CELL_CLASH, span: 600}, ...SILENT_TUCK_CASES];

/** The cases whose x-mirror is the oracle. `CoveredRiseCellClash`'s mirror plans other roofs, so it is left out. */
const MIRRORED: readonly TuckCase[] = [...THROWING_TUCK_CASES, ...SILENT_TUCK_CASES];

/** Each case's measured genus: one tunnel through the Cheek reproducer's ring of Rings, none elsewhere. */
const genusOf = (c: TuckCase): number => (c.fixture === COVERED_RISE_CELL_CLASH ? 1 : 0);

/** The measured Cheek faces: the Cheek reproducer keeps one, exposed; its other Cheek is tucked. */
const cheeksOf = (c: TuckCase): number => (c.fixture === COVERED_RISE_CELL_CLASH ? 1 : 0);

const tuckFaces = (s: BuildingShell): ShellFace[] => s.faces.filter(f => f.tag.kind === 'Tuck');

/** A face's polygon in the two world axes off its normal's largest component, wound counter-clockwise there. */
function planPolygon(ps: Vec3[], n: Vec3): SimplePolygon {
  const ax = [0, 1, 2].reduce((m, k) => (Math.abs(n[k]) > Math.abs(n[m]) ? k : m), 0);
  const [s, t] = [0, 1, 2].filter(k => k !== ax);
  const poly = ps.map(p => [p[s], p[t]] as [number, number]);
  const area = poly.reduce((acc, p, i) => acc + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0);
  return area >= 0 ? poly : [...poly].reverse();
}

/**
 * The oracle for a tuck's area, independent of the labels: on a Tuck face's plane, the area where the mesh's
 * triangles of the two orientations overlap, by `CrossSection`, in the plane's projected axes.
 */
async function overlapArea(b: ShellBuild, face: ShellFace): Promise<number> {
  const wasm = await getManifold();
  const {mesh, tags} = b.union;
  const plane = {n: face.normal, d: face.offset};
  const sides: SimplePolygon[][] = [[], []];
  for (let t = 0; t < mesh.tris.length / 3; t++) {
    const p = tags.planes[mesh.faceIDs[t]];
    const k = samePlane(p, plane) ? 0 : samePlane(p, flipPlane(plane)) ? 1 : -1;
    if (k < 0) continue;
    const ps = [0, 1, 2].map(j => { const v = mesh.tris[3 * t + j]; return [mesh.positions[3 * v], mesh.positions[3 * v + 1], mesh.positions[3 * v + 2]] as Vec3; });
    sides[k].push(planPolygon(ps, face.normal));
  }
  const [a, c] = sides.map(ps => new wasm.CrossSection(ps, 'NonZero'));
  const both = a.intersect(c);
  try {
    // Projected along the normal's largest axis, so scaled by that component.
    return both.area() / Math.max(...face.normal.map(Math.abs));
  } finally {
    [a, c, both].forEach(x => x.delete());
  }
}

/**
 * Every pair of Cells, on any faces, that cover the same ground: Cells on one plane, of either orientation, whose
 * polygons overlap by more than `AREA_TOL`, as readable strings.
 */
async function overlappingCells(s: BuildingShell): Promise<string[]> {
  const wasm = await getManifold();
  const groups: {face: ShellFace; cells: number[]}[] = [];
  for (const c of s.cells) {
    const f = s.faces[c.face];
    const plane = {n: f.normal, d: f.offset};
    let g = groups.find(x => samePlane({n: x.face.normal, d: x.face.offset}, plane) || samePlane({n: x.face.normal, d: x.face.offset}, flipPlane(plane)));
    if (!g) { g = {face: f, cells: []}; groups.push(g); }
    g.cells.push(c.id);
  }
  const out: string[] = [];
  for (const g of groups) {
    const polys = g.cells.map(c => planPolygon(s.cells[c].polygon, g.face.normal));
    const each = polys.map(p => { const x = new wasm.CrossSection([p], 'Positive'); const a = x.area(); x.delete(); return a; });
    const all = new wasm.CrossSection(polys, 'NonZero');
    const union = all.area();
    all.delete();
    const sum = each.reduce((t, a) => t + a, 0);
    if (sum - union > AREA_TOL) out.push(`Cells on face ${g.face.id}'s plane overlap by ${(sum - union).toFixed(3)}`);
  }
  return out;
}

describe.each(ALL_CASES.map(c => [c.fixture.name, c] as const))('journal decision 272: %s builds, its tuck labelled, not removed', (_, c) => {
  it('builds every invariant, with one tuck and no Unclassified Edge', async () => {
    const b = await build(c.fixture);
    expect(invariantViolations(b, {genus: genusOf(c), cheeks: cheeksOf(c)})).toEqual([]);
    expect(b.shell.report.tucks).toBe(1);
    expect(b.shell.report.unclassifiedEdges).toBe(0);
  });

  it('labels both layers Tuck: two faces back to back, each the area the two orientations overlap by', async () => {
    const b = await build(c.fixture);
    const [front, back, ...rest] = tuckFaces(b.shell);
    expect(rest).toEqual([]);
    expect(samePlane({n: front.normal, d: front.offset}, flipPlane({n: back.normal, d: back.offset}))).toBe(true);
    expect(front.area).toBeGreaterThan(SHELL_TOLERANCE_CM);
    expect(Math.abs(front.area - back.area)).toBeLessThan(AREA_TOL);
    expect(Math.abs(front.area - await overlapArea(b, front))).toBeLessThan(AREA_TOL);
  });

  it('lays no Cell on a Tuck face, and no two Cells cover the same ground', async () => {
    const b = await build(c.fixture);
    const tucks = new Set(tuckFaces(b.shell).map(f => f.id));
    expect(b.shell.cells.filter(cell => tucks.has(cell.face))).toEqual([]);
    expect(await overlappingCells(b.shell)).toEqual([]);
  });

  it('reads every rim through the tuck: no ShellEdge names a Tuck face, and every one has a kind', async () => {
    const b = await build(c.fixture);
    const tucks = new Set(tuckFaces(b.shell).map(f => f.id));
    expect(b.shell.edges.filter(e => e.faces.some(f => tucks.has(f)))).toEqual([]);
    expect(b.shell.edges.filter(e => e.kind === 'Unclassified')).toEqual([]);
  });
});

/** One measured rim line: its ends, the kind the true building gives it, and the kinds of its two real faces. */
interface RimLine { a: Vec3; b: Vec3; kind: string; faces: [string, string] }

/**
 * The rims each tuck input has, read off the measured tuck outlines: a rake where the lower storey's Roof meets the
 * tower's Wall through the tuck (Roof|Wall, concave: RingJunction), and, where the gable continues past the tuck, the
 * tower's end where its Wall meets that exposed Gable (Wall|Gable, concave: InternalCorner). In `TuckGableEnd` the
 * tower's end at x = 200 is a fold, not a rim: its InternalCorner is the union's own edge between the exposed Gable and
 * the tower's E Wall, and is held here too, so the true building has it once.
 */
const RIMS: Readonly<Record<string, readonly RimLine[]>> = {
  TuckGableEnd250: [
    {a: [100, 50, 307.735], b: [200, 50, 307.735], kind: 'RingJunction', faces: ['Roof', 'Wall']},
    {a: [200, 50, 250], b: [200, 50, 307.735], kind: 'InternalCorner', faces: ['Gable', 'Wall']},
  ],
  TuckRiseGable: [
    {a: [100, 100, 528.868], b: [175, 100, 572.169], kind: 'RingJunction', faces: ['Roof', 'Wall']},
    {a: [100, 100, 500], b: [100, 100, 528.868], kind: 'InternalCorner', faces: ['Gable', 'Wall']},
  ],
  TuckSteepGableEnd263: [
    {a: [86.603, 50, 313], b: [200, 50, 313], kind: 'RingJunction', faces: ['Roof', 'Wall']},
  ],
  CoveredRiseCellClash: [
    {a: [100, 250, 500], b: [300, 250, 615.47], kind: 'RingJunction', faces: ['Roof', 'Wall']},
    {a: [300, 250, 500], b: [300, 250, 615.47], kind: 'InternalCorner', faces: ['Gable', 'Wall']},
  ],
};

const near = (p: Vec3, q: Vec3): boolean => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= 1e-3;

describe.each(Object.entries(RIMS))('journal decision 272: %s, each rim line one ShellEdge read through the tuck', (name, lines) => {
  const c = ALL_CASES.find(x => x.fixture.name === name);
  if (!c) throw new Error(`no tuck case ${name}`);
  it.each(lines.map(l => [`${l.kind} (${l.a.join(', ')}) to (${l.b.join(', ')})`, l] as const))('%s', async (_, line) => {
    const {shell} = await build(c.fixture);
    const on = shell.edges.filter(e => [e.a, e.b].every(p => lineDistance(p, line.a, line.b) <= SHELL_TOLERANCE_CM));
    // Exactly one ShellEdge lies on the line, and it runs from end to end of it.
    const covering = on.filter(e => (near(e.a, line.a) && near(e.b, line.b)) || (near(e.a, line.b) && near(e.b, line.a)));
    const inside = on.filter(e => !covering.includes(e) && [e.a, e.b].every(p => {
      const L = Math.hypot(...line.b.map((v, k) => v - line.a[k]));
      const u = p.reduce((t, v, k) => t + (v - line.a[k]) * (line.b[k] - line.a[k]), 0) / (L * L);
      return u > -1e-6 && u < 1 + 1e-6;
    }));
    expect(inside).toEqual([]);
    expect(covering).toHaveLength(1);
    const [edge] = covering;
    expect(edge.kind).toBe(line.kind);
    expect(edge.faces.map(f => shell.faces[f].tag.kind).sort()).toEqual([...line.faces].sort());
    // Every NetEdge on it carries one Cell of each of its two faces: the Cell net reads it as one edge.
    const nets = shell.netEdges.filter(n => n.shellEdge === edge.id);
    expect(nets.length).toBeGreaterThan(0);
    for (const n of nets) expect(n.cells.map(x => shell.cells[x].face).sort((p, q) => p - q)).toEqual([...edge.faces].sort((p, q) => p - q));
  });
});

describe.each(MIRRORED.map(c => [c.fixture.name, c] as const))('journal decision 272: %s against its x-mirror, which has no tuck', (_, c) => {
  it('the mirror builds clean with no tuck, and the labelled build less its Tuck faces is its mirror image', async () => {
    const tucked = await build(c.fixture);
    const clean = await build(mirrorFixture(c.fixture, c.span));
    expect(invariantViolations(clean, {genus: 0, cheeks: 0})).toEqual([]);
    expect(clean.shell.report.tucks).toBe(0);
    expect(clean.union.tuck).toEqual({tucks: 0, split: 0, neighbours: 0, added: 0});
    expect(mirrorDifferences(tucked.shell, clean.shell, c.span).differences).toEqual([]);
  });

  it('every Roof face has the same area, boundary ShellEdges and Cells as its mirror', async () => {
    const tucked = (await build(c.fixture)).shell;
    const clean = (await build(mirrorFixture(c.fixture, c.span))).shell;
    const roofs = (s: BuildingShell): number => s.faces.filter(f => f.tag.kind === 'Roof').length;
    expect(roofs(tucked)).toBeGreaterThan(0);
    expect(roofs(tucked)).toBe(roofs(clean));
    expect(mirrorDifferences(tucked, clean, c.span, kind => kind === 'Roof').differences).toEqual([]);
  });
});

describe('journal decision 272: a tuck\'s area in closed form, where the geometry gives it', () => {
  it('CoveredRiseCellClash tucks its whole storey 1 Cheek on y = 250, a triangle 100 cm deep and 200 tan 30° tall', async () => {
    const {shell} = await build(COVERED_RISE_CELL_CLASH);
    const want = (100 * 200 * Math.tan(Math.PI / 6)) / 2;
    for (const f of tuckFaces(shell)) expect(Math.abs(f.area - want), `face ${f.id}`).toBeLessThan(AREA_TOL);
    expect(tuckFaces(shell).map(f => f.tag.storey).sort()).toEqual([1, 2]);
  });
});

describe('journal decision 272: coplanar opposite faces with no fold between them are no tuck', () => {
  it('GapOffset1, two islands 1/1024 cm apart, has no Tuck, its cut nothing, and builds exactly its measured defect', async () => {
    const b = await build(gapFixture('Offset', 1));
    expect(b.shell.faces.filter(f => f.tag.kind === 'Tuck')).toEqual([]);
    expect(b.union.tuck).toEqual({tucks: 0, split: 0, neighbours: 0, added: 0});
    expect(invariantViolations(b, {genus: [0, 0], cheeks: 0})).toEqual(pinnedOutcome(GAP_DEFECTS, 'GapOffset1'));
  });
});

describe('journal decision 272: a tuck is a pair of layers, never three', () => {
  /** Triangles on z = 0 over the same ground, the first facing up and the rest down, with each one's faceID. */
  function layers(down: number): {mesh: ShellMesh; model: TuckModel; tags: FaceTag[]} {
    const up: Plane3 = {n: [0, 0, 1], d: 0};
    const positions = Float32Array.from([0, 0, 0, 100, 0, 0, 0, 100, 0]);
    const tris = [0, 1, 2, ...Array.from({length: down}, () => [0, 2, 1]).flat()];
    const mesh: ShellMesh = {positions, tris: Uint32Array.from(tris), faceIDs: Uint32Array.from(tris.slice(0, tris.length / 3).map((_, i) => i))};
    const prepared = (t: number, p: Plane3): RawTri => {
      const v = (j: number): Vec3 => { const k = mesh.tris[3 * t + j]; return [positions[3 * k], positions[3 * k + 1], positions[3 * k + 2]]; };
      const r = prepareRawTri(v(0), v(1), v(2), p.n);
      if (!r) throw new Error('no area');
      return r;
    };
    const back = Array.from({length: down}, (_, i) => i + 1);
    const plane: TuckPlane = {plane: up, front: new Set([0]), back: new Set(back), frontTris: [prepared(0, up)], backTris: back.map(t => prepared(t, flipPlane(up))), outline: []};
    const tag: FaceTag = {kind: 'Gable', storey: 0, wall: 0, plane: -1, part: 0};
    return {mesh, model: {planes: [plane]}, tags: tris.slice(0, tris.length / 3).map(() => tag)};
  }

  it('two layers over the same ground are one tuck, both labelled', () => {
    const {mesh, model, tags} = layers(1);
    const got = labelTucks('Pair', mesh, tags, model);
    expect(got.tucks).toBe(1);
    expect(got.triTags.map(t => t.kind)).toEqual(['Tuck', 'Tuck']);
  });

  it('a third layer is a hard error naming the plane and both areas', () => {
    const {mesh, model, tags} = layers(2);
    expect(() => labelTucks('Three', mesh, tags, model)).toThrow(/^Three: a tuck on the plane n=\(0\.000000, 0\.000000, 1\.000000\) d=0\.000 is no pair of layers: 5000\.000 cm² face one way, 10000\.000 cm² the other$/);
  });
});

describe('journal decision 272: a fold between two faces that are not both Tuck is a hard error', () => {
  it('fires on TuckGableEnd250 with the labelling taken off, naming the fold and its faces', async () => {
    const wasm = await getManifold();
    const f = THROWING_TUCK_CASES[0].fixture;
    const u = await unionShell(f);
    expect(u.triTags.some(t => t.kind === 'Tuck')).toBe(true);
    // The same cut mesh, its tags as the re-tag pass gives them, before the tuck pass labels the layers.
    const {triTags} = retagPass(u.label, u.mesh, makeRegionModel(u.parts, u.tags));
    expect(triTags.some(t => t.kind === 'Tuck')).toBe(false);
    expect(() => buildShellFromUnion(wasm, f, {...u, triTags}))
      .toThrow(/^a fold from \([-\d., ]+\) to \([-\d., ]+\) between face \d+ \((Gable\|0|Wall\|1)\|[^)]*\) and face \d+ \((Gable\|0|Wall\|1)\|[^)]*\): a tuck left unlabelled$/);
  });
});
