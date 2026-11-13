// Per-stretch gable settings (docs/notes/building-shell-gable-stretch-settings-decisions.md), the pipeline and the wire
// (WP-S1): decisions 1 to 15 and 20 to 25. Each settings fixture asserts its roof by closed forms written here
// (decision 23), its limits named by hand; what it builds is pinned as fact (decision 25); and the gates of decision 24
// that are the pipeline's and the wire's are each convicted by mutation, named where it is held.
import {describe, expect, it} from 'vitest';
import {PlanRefusal} from '../src/errors.ts';
import {
  GABLE_SETTING_FIXTURES, RING_SIDES, RISE_FACINGS, RISE_FIXTURES, RiseFacing, ShellFixture, SideForm, SideRun, ring, storeyRings,
} from '../src/fixture.ts';
import {BUILDS_A_RISE, cppReplayability} from '../src/golden.ts';
import {GableRise, storeyLoops, unionWallForms} from '../src/ring-forms.ts';
import {RISE_FACING_STRATEGIES, RISE_MIN_CAP_CM, RisePiece, algorithmBBuildsGable, claimedWalls} from '../src/rise.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {StoreyPlan, buildingOf, planStorey} from '../src/storey.ts';
import {FACING_READINGS, WIRE_FACINGS, readInput, runSettings, writeInput} from '../src/wire/input-adapter.ts';
import type {BuildingShellInputV1} from '../src/wire/input-types.ts';
import {RISE_ORACLE_TOL_CM, intervalTop, riseOracle} from './rise-oracle.ts';
import {invariantViolations} from './shell-invariants.ts';
import {memoBuilds, shellFixture} from './test-builds.ts';

const build = memoBuilds();
const t = (deg: number): number => Math.tan((deg * Math.PI) / 180);

const setting = (name: string): ShellFixture => {
  const f = GABLE_SETTING_FIXTURES.find(x => x.name === name);
  if (!f) throw new Error(`no settings fixture ${name}`);
  return f;
};

/** The built shell's top above the 250 cm plate at a point picked by hand, read off the lattice as rise.test.ts reads it. */
const topAt = (b: ShellBuild, x: number, y: number): number => (intervalTop(b.union, x + 0.013, y + 0.017, 250.5) ?? Number.NaN) - 250;

/** The plane of the walls on the line `y = at` facing `inward`, named by hand: a limit's wall. */
function planeOnY(plan: StoreyPlan, at: number, inward: -1 | 1): number {
  const ids = new Set(plan.building.walls.filter(w => w.form !== 'cut' && w.a.y === at && w.b.y === at && Math.sign(w.n.y) === inward).map(w => w.plane));
  if (ids.size !== 1) throw new Error(`walls on y = ${at} facing ${inward} hold ${ids.size} planes`);
  return [...ids][0];
}

/** A limit named by hand: the walls on `y = at` facing `inward`, or no slope limit. */
type HandLimit = readonly [at: number, inward: -1 | 1] | 'none';

/** One piece as named by hand: the line its wall stands on (`y = at`), its band, and its limit. */
type HandPiece = readonly [at: number, lo: number, hi: number, limit: HandLimit];

/** A piece as built, in `HandPiece`'s terms, its limit as a plane id or 'none'. */
const pieceOf = (r: RisePiece): [number, number, number, number | 'none'] => [r.piece.wall.a.y, r.piece.bandLo, r.piece.bandHi, r.limitPlane ?? 'none'];

const handOf = (plan: StoreyPlan, p: HandPiece): [number, number, number, number | 'none'] =>
  [p[0], p[1], p[2], p[3] === 'none' ? 'none' : planeOnY(plan, ...p[3])];

/** A fixture's roof by hand: its pieces with their limits, and heights of its built top at points, each a closed form. */
interface HandRoof { pieces: readonly HandPiece[]; tops: readonly (readonly [x: number, y: number, z: number])[] }

const S_SLOPE: HandLimit = [0, 1], N_SLOPE_400: HandLimit = [400, -1], N_SLOPE_500: HandLimit = [500, -1];

/**
 * Decisions 22 and 23: every settings fixture's roof by closed forms of its own numbers.
 * - The half-offset pair (a 1000 by 400 box at 45, ridge 200 high; 75° stretches S over [300, 500], N over [400, 600],
 *   apex 100 t(75) = 373.2). Under `centreLine` each walk line lies at the other's band end, under no gable, so each is
 *   limited by the opposite slope: at (410, 100) the S rise is the N slope's 400 - 100 = 300, under its rakes' 90 t(75).
 *   Under `whole` neither covers the other's width, so the same. Under `split` each is cut at the other's end, x = 400
 *   for S and 500 for N: over [400, 500] both parts lie under the facing gable and run through unlimited to the far
 *   wall, so at (410, 100) the top is S's rake from 500, 90 t(75) = 335.9; over [300, 400] S stays limited by the N
 *   slope, over [500, 600] N by the S slope.
 * - ApartGablesRow and ApartNeighbours: three (two) 60° gables of 200 cm, each its own: apex 100 t(60) = 173.2 at each
 *   middle, and the S hip's 10 at their meeting points on the plate, where one merged rise would stand 200 t(60).
 * - ApartWholeSide and ApartAcrossRings: two 45° rises of 500 cm, each taking the end wall's 45° hip plane at the corner
 *   (gable rise decision 10): apex 250 at x = 250 and 750, and the S hip's 10 at x = 500.
 * - EditorSpeltMaxHeight: the 45° rise over [330, 610], apex 140, capped flat at its maxHeight 100.
 */
const HAND_ROOFS: Record<string, HandRoof> = {
  HalfOffsetGablesCentreLine: {pieces: [[0, 300, 500, N_SLOPE_400], [400, 400, 600, S_SLOPE]], tops: [[410, 100, 300], [490, 300, 300], [350, 100, t(75) * 50]]},
  HalfOffsetGablesWhole: {pieces: [[0, 300, 500, N_SLOPE_400], [400, 400, 600, S_SLOPE]], tops: [[410, 100, 300], [490, 300, 300], [350, 100, t(75) * 50]]},
  HalfOffsetGablesSplit: {
    pieces: [[0, 300, 400, N_SLOPE_400], [0, 400, 500, 'none'], [400, 400, 500, 'none'], [400, 500, 600, S_SLOPE]],
    tops: [[410, 100, t(75) * 90], [490, 300, t(75) * 90], [350, 100, t(75) * 50], [400.5, 300, t(75) * 99.5]],
  },
  ApartGablesRow: {pieces: [[0, 300, 500, N_SLOPE_500], [0, 500, 700, N_SLOPE_500], [0, 700, 900, N_SLOPE_500]], tops: [[400, 10, t(60) * 100], [500, 10, 10], [600, 10, t(60) * 100], [700, 10, 10]]},
  ApartNeighbours: {pieces: [[0, 300, 500, N_SLOPE_500], [0, 500, 700, N_SLOPE_500]], tops: [[400, 10, t(60) * 100], [500, 10, 10], [600, 10, t(60) * 100]]},
  ApartWholeSide: {pieces: [[0, 0, 500, N_SLOPE_500], [0, 500, 1000, N_SLOPE_500]], tops: [[250, 10, 250], [500, 10, 10], [750, 10, 250]]},
  ApartAcrossRings: {pieces: [[0, 0, 500, N_SLOPE_400], [0, 500, 1000, N_SLOPE_400]], tops: [[250, 10, 250], [500, 10, 10], [750, 10, 250]]},
  EditorSpeltMaxHeight: {pieces: [[0, 330, 610, N_SLOPE_500]], tops: [[470, 20, 100]]},
};

/**
 * Decision 25, as facts: the Cheeks each settings fixture builds. HalfOffsetGablesSplit's two are the steps at x = 400 and
 * x = 500, where a part that runs through stands beside a part the opposite slope limits (the earlier probe of a split on
 * one wide band gave the same two). Every other count is 0: no conflict, no Unclassified Edge, no throw, closed.
 */
const CHEEKS: Record<string, number> = {HalfOffsetGablesSplit: 2};

describe.each(GABLE_SETTING_FIXTURES.map(f => [f.name] as const))('%s', name => {
  it('decision 25: builds closed, its Cheeks as pinned, no conflict, no Unclassified Edge, and stands on its height function', async () => {
    const b = await build(setting(name));
    expect(invariantViolations(b, {genus: 0, cheeks: CHEEKS[name] ?? 0})).toEqual([]);
    expect(b.shell.report.cheeks).toBe(CHEEKS[name] ?? 0);
    expect(b.shell.report.unclassifiedEdges).toBe(0);
    expect(b.shell.report.conflicts).toEqual([]);
    const o = riseOracle(b.union);
    expect(o.worst, o.at).toBeLessThanOrEqual(RISE_ORACLE_TOL_CM);
  });

  it('decisions 22 and 23: its pieces and limits as named by hand, and its top by closed forms', async () => {
    const want = HAND_ROOFS[name];
    const plan = planStorey(setting(name), 0);
    expect((plan.rises ?? []).map(pieceOf)).toEqual(want.pieces.map(p => handOf(plan, p)));
    const b = await build(setting(name));
    for (const [x, y, z] of want.tops) expect(topAt(b, x, y), `(${x}, ${y})`).toBeCloseTo(z, 1);
  });

  // Decision 14. Mutation: writeInput drops any one of maxHeight, facing or apart; then the settings read back differ.
  it('decision 14: readInput(writeInput(f)) keeps every setting of every gable stretch, and builds the same shell', async () => {
    const f = setting(name);
    const r = readInput(JSON.parse(JSON.stringify(writeInput(f))), f.name);
    if (!r.ok) throw new Error(r.errors.join('; '));
    const settingsOf = (x: ShellFixture): string[] => x.rings.flatMap(rg => RING_SIDES.flatMap(s => (rg.sides?.[s]?.runs ?? [])
      .filter(run => run.form === 'gable').map(run => JSON.stringify([s, run.from, run.to, run.maxHeight ?? null, run.facing ?? 'centreLine', run.apart ?? false]))));
    expect(settingsOf(r.fixture)).toEqual(settingsOf(f));
    const shell = (b: ShellBuild): string => JSON.stringify([Array.from(b.union.mesh.positions), Array.from(b.union.mesh.tris), b.union.triTags]);
    expect(shell(await buildShellDetailed(r.fixture))).toBe(shell(await build(f)));
  });

  // Decision 15 (gable rise decision 17, journal decision 249).
  it('decision 15: builds a rise, so is not C++-replayable', () => {
    const rep = cppReplayability(setting(name));
    expect(rep.cppReplayable).toBe(false);
    if (!rep.cppReplayable) expect(rep.reasons).toContain(BUILDS_A_RISE);
  });
});

// ---- Decisions 4 to 7: the facing strategies ------------------------------------------------------------------------

/** A 1000 by 400 box at 45 with a 75° S stretch over [sLo, sHi] and N stretches over world x `n`, each under `facing`. */
function facingBox(name: string, s: readonly [number, number], n: readonly (readonly [number, number])[], sFacing: RiseFacing, nFacing: RiseFacing = sFacing): ShellFixture {
  const run = (from: number, to: number, facing: RiseFacing, extra: Partial<SideRun> = {}): SideRun => ({from, to, form: 'gable', deg: 75, facing, ...extra});
  // The N side runs from x = 1000; adjoining N stretches stand apart so they stay two gables.
  const north = n.map(([lo, hi]) => run(1000 - hi, 1000 - lo, nFacing, n.length > 1 ? {apart: true} : {})).reverse();
  return shellFixture(name, [ring([0, 0, 1000, 400], 0, 1, 45, {S: {form: 'hip', runs: [run(s[0], s[1], sFacing)]}, N: {form: 'hip', runs: north}})]);
}

/** The S rise's pieces of a facing box: each piece's band and whether a slope limits it. */
const southPieces = (f: ShellFixture): [number, number, boolean][] =>
  (planStorey(f, 0).rises ?? []).filter(r => r.piece.wall.a.y === 0).map(r => [r.piece.bandLo, r.piece.bandHi, r.limitPlane !== undefined]);

describe('decisions 4 and 5: the facing strategy table', () => {
  it('has one entry per name of RISE_FACINGS, centreLine first and the default', () => {
    expect(Object.keys(RISE_FACING_STRATEGIES).sort()).toEqual([...RISE_FACINGS].sort());
    expect(RISE_FACINGS[0]).toBe('centreLine');
  });

  // Gate, decision 24: a strategy's entry swapped for another's. The quarter-offset pair tells centreLine from whole, the
  // half-offset pair tells split from both (its row above). Mutation: centreLine's entry is whole's (or the reverse);
  // then these two pairs swap their pieces' limits.
  it('a quarter offset: centreLine runs both through (each centre line inside the other band); whole limits both (neither covers the other)', () => {
    const quarter = (facing: RiseFacing): ShellFixture => facingBox(`Quarter${facing}`, [300, 500], [[350, 550]], facing);
    expect(southPieces(quarter('centreLine'))).toEqual([[300, 500, false]]);
    expect(southPieces(quarter('whole'))).toEqual([[300, 500, true]]);
    // A quarter offset under split: cut at 350, the part under the N gable runs through, the part clear of it is limited.
    expect(southPieces(quarter('split'))).toEqual([[300, 350, true], [350, 500, false]]);
  });

  it('quarter offset, by closed forms: at (410, 100) centreLine is the S rakes\' 90 t(75), whole the N slope\'s 300', async () => {
    expect(topAt(await build(facingBox('QuarterTopcentreLine', [300, 500], [[350, 550]], 'centreLine')), 410, 100)).toBeCloseTo(t(75) * 90, 1);
    expect(topAt(await build(facingBox('QuarterTopwhole', [300, 500], [[350, 550]], 'whole')), 410, 100)).toBeCloseTo(300, 1);
  });

  it('whole: several adjoining stretches cover a width together; a gap between them, however narrow, does not', () => {
    expect(southPieces(facingBox('WholeAdjoining', [300, 500], [[300, 420], [420, 500]], 'whole'))).toEqual([[300, 500, false]]);
    expect(southPieces(facingBox('WholeGap', [300, 500], [[300, 420], [430, 500]], 'whole'))).toEqual([[300, 500, true]]);
    // The same gap under centreLine: the centre line x = 400 lies inside [300, 420], so it runs through.
    expect(southPieces(facingBox('CentreGap', [300, 500], [[300, 420], [430, 500]], 'centreLine'))).toEqual([[300, 500, false]]);
    // Under split the gap is a part of its own, limited; the parts either side run through.
    expect(southPieces(facingBox('SplitGap', [300, 500], [[300, 420], [430, 500]], 'split'))).toEqual([[300, 420, false], [420, 430, true], [430, 500, false]]);
  });

  it('decision 6: each rise applies its own strategy: S split facing N centreLine builds S in two parts and N limited whole', () => {
    const f = facingBox('MixedFacing', [300, 500], [[400, 600]], 'split', 'centreLine');
    expect((planStorey(f, 0).rises ?? []).map(r => [r.piece.wall.a.y, r.piece.bandLo, r.piece.bandHi, r.limitPlane !== undefined]))
      .toEqual([[0, 300, 400, true], [0, 400, 500, false], [400, 400, 600, true]]);
  });

  // Decision 7: journal decision 231 holds under every strategy. RiseFacingGabledWall's N wall is gabled along its whole
  // length, so its slope is not in the finished building and limits the S rise under no strategy.
  it.each(RISE_FACINGS.map(x => [x] as const))('decision 7: under %s a slope not in the finished building does not limit', facing => {
    const f = RISE_FIXTURES.find(x => x.name === 'RiseFacingGabledWall') as ShellFixture;
    const withFacing: ShellFixture = {...f, rings: f.rings.map(r => ({...r, sides: {...r.sides, S: {...r.sides?.S, runs: r.sides?.S?.runs?.map(x => ({...x, facing}))} as SideForm}}))};
    const rises = planStorey(withFacing, 0).rises ?? [];
    expect(rises.length).toBeGreaterThan(0);
    for (const r of rises) expect(r.limitPlane).toBeUndefined();
  });
});

// ---- Decisions 8 to 11: standing apart -------------------------------------------------------------------------------

/** The rises a 1000 by 500 box at 45 builds with these S runs. */
const risesOf = (runs: SideRun[]): [number, number][] =>
  (planStorey(shellFixture('Neighbours', [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs}})]), 0).rises ?? []).map(r => [r.piece.bandLo, r.piece.bandHi]);

describe('decisions 8 to 10: which neighbouring gable stretches merge', () => {
  const g = (from: number, to: number, extra: Partial<SideRun> = {}): SideRun => ({from, to, form: 'gable', deg: 60, ...extra});

  // Gate, decision 24: `apart` ignored by the merge. Mutation: `joins` drops its `apart` clause; then the neighbours
  // here, and ApartGablesRow and ApartNeighbours above, build one rise.
  it('decision 8: equal neighbours merge only when neither stands apart', () => {
    expect(risesOf([g(300, 500), g(500, 700)])).toEqual([[300, 700]]);
    expect(risesOf([g(300, 500, {apart: true}), g(500, 700)])).toEqual([[300, 500], [500, 700]]);
    expect(risesOf([g(300, 500), g(500, 700, {apart: true})])).toEqual([[300, 500], [500, 700]]);
  });

  it('decision 8: neighbours that differ in maxHeight or facing do not merge (maxHeight as today\'s code already has it)', () => {
    expect(risesOf([g(300, 500, {maxHeight: 150}), g(500, 700)])).toEqual([[300, 500], [500, 700]]);
    expect(risesOf([g(300, 500, {maxHeight: 150}), g(500, 700, {maxHeight: 150})])).toEqual([[300, 700]]);
    expect(risesOf([g(300, 500, {facing: 'whole'}), g(500, 700)])).toEqual([[300, 500], [500, 700]]);
  });

  it('decision 10: a run boundary alone is not two gables, and one run cut by another Ring\'s side end stays one', () => {
    expect(risesOf([g(300, 400), g(400, 550), g(550, 700)])).toEqual([[300, 700]]);
    // A stretch standing apart, cut at x = 500 by the S side end of an overlapping Ring that lies on its line: still one
    // rise of its own. Mutation: `joins` drops its same-stretch clause; then the two pieces of the one run are two rises.
    const f = shellFixture('CutApart', [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: [g(300, 700, {apart: true})]}}), ring([500, 0, 1200, 400], 0, 1, 45)]);
    expect((planStorey(f, 0).rises ?? []).map(r => [r.piece.bandLo, r.piece.bandHi])).toEqual([[300, 700]]);
  });

  // Decision 10 on the wire: the game splits one gabled side into several plate runs that agree, and they read as one.
  it('decision 10: a file whose gabled side is split into agreeing GableEnd runs reads as one gable side and builds one gable', async () => {
    const plain = shellFixture('GameSplitGable', [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'gable', deg: 45}})]);
    const doc: BuildingShellInputV1 = writeInput(plain);
    const [whole] = doc.rings[0].sides[0].runs;
    doc.rings[0].sides[0].runs = [[0, 300], [300, 650], [650, 1000]].map(([startCm, endCm]) => ({...whole, startCm, endCm}));
    const r = readInput(JSON.parse(JSON.stringify(doc)), 'GameSplitGable');
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.fixture.rings[0].sides?.S).toEqual({form: 'gable', deg: 45});
    const shell = (b: ShellBuild): string => JSON.stringify([Array.from(b.union.mesh.positions), Array.from(b.union.mesh.tris)]);
    expect(shell(await buildShellDetailed(r.fixture))).toBe(shell(await build(plain)));
  });
});

describe('decision 11: a line extent holding a stretch that stands apart is not algorithm B\'s', () => {
  const band = (lo: number, hi: number, apart: boolean): GableRise => ({lo, hi, deg: 45, limit: 'ridgeSlope', facing: 'centreLine', apart});

  // Gate, decision 24: `apart` ignored by the whole-wall verdict. Mutation: `algorithmBBuildsGable` drops its `apart`
  // test; then ApartWholeSide and ApartAcrossRings are one whole-wall gable again, and this predicate keeps them.
  it('the predicate: bands that tile the span give it up when any stands apart, and keep it exactly as before when none does', () => {
    expect(algorithmBBuildsGable([band(0, 500, false), band(500, 1000, false)], [0, 1000])).toBe(true);
    expect(algorithmBBuildsGable([band(0, 500, false), band(500, 1000, true)], [0, 1000])).toBe(false);
    expect(algorithmBBuildsGable([band(0, 1000, true)], [0, 1000])).toBe(false);
    expect(algorithmBBuildsGable([band(0, 400, false), band(500, 1000, false)], [0, 1000])).toBe(false);
  });

  it('ApartWholeSide: the all-gable S wall enters the solve as a hip at its gable pitch, carrying two rises', () => {
    const f = setting('ApartWholeSide');
    const rings = storeyRings(f, 0);
    const rects = rings.map(r => r.ring.rect), loops = storeyLoops(rects);
    const derived = unionWallForms(rings, loops);
    const {walls, changed} = claimedWalls(rings, derived, buildingOf(rings, rects, loops, derived));
    expect(changed).toBe(true);
    const south = walls.find(w => w.axis === 'y' && w.at === 0);
    expect([south?.form, south?.deg, south?.rises?.map(r => [r.lo, r.hi, r.apart])]).toEqual(['hip', 45, [[0, 500, true], [500, 1000, true]]]);
  });

  // The same two sides with no `apart`: today's one whole-wall gable, its top at x = 500 far above the hip's 10.
  it('without apart, the same sides are today\'s one gable: no rise, and x = 500 under its ridge', async () => {
    for (const name of ['ApartWholeSide', 'ApartAcrossRings']) {
      const f = setting(name);
      const plain: ShellFixture = {...f, name: `${name}Merged`, rings: f.rings.map(r => ({...r, sides: {S: {form: 'gable', deg: 45}}}))};
      expect(planStorey(plain, 0).rises ?? []).toEqual([]);
      expect(topAt(await build(plain), 500, 10)).toBeGreaterThan(300);
    }
  });
});

// ---- Decisions 1, 2 and 12 to 14: the settings in memory and on the wire ------------------------------------------

/** A whole shell, exactly: the union's mesh and tags, and step 4's faces, Edges and Cells. */
const shellKey = (b: ShellBuild): string => JSON.stringify([
  Array.from(b.union.mesh.positions), Array.from(b.union.mesh.tris), b.union.triTags,
  b.shell.faces.map(x => [x.tag, x.area, x.sources ?? null]), b.shell.edges.map(e => e.kind), b.shell.cells.map(c => [c.face, c.whole, c.source]),
]);

/** A shell's structure, triangulation aside: faces by kind, plane and area (0.1 cm²), Edge kinds, Cells and their sources. */
const shellShape = (b: ShellBuild): string => JSON.stringify({
  faces: b.shell.faces.map(f => `${f.tag.kind}|${f.normal.map(v => v.toFixed(5)).join(',')}|${f.offset.toFixed(3)}|${f.area.toFixed(1)}`).sort(),
  edges: b.shell.edges.map(e => e.kind).sort(), cells: b.shell.cells.map(c => `${b.shell.faces[c.face].tag.kind}|${c.whole}|${JSON.stringify(c.source)}`).sort(),
});

describe('decision 2: every default reproduces today\'s roof (WP-S1.1, L3: whole shells)', () => {
  /** A fixture with every gable run's settings but `maxHeight`, which has no default to spell, spelt at their defaults. */
  const spelt = (f: ShellFixture): ShellFixture => ({...f, name: `${f.name}Spelt`, rings: f.rings.map(r => ({...r, sides: Object.fromEntries(Object.entries(r.sides ?? {}).map(([k, s]) => [k,
    s.runs ? {...s, runs: s.runs.map(x => (x.form === 'gable' ? {...x, limit: 'ridgeSlope' as const, facing: 'centreLine' as const, apart: false} : x))} : s]))}))});
  it.each(RISE_FIXTURES.map(f => [f.name, f] as const))('%s: builds the same shell, mesh, tags, faces, Edges and Cells, with every default spelt', async (_, f) => {
    expect(shellKey(await buildShellDetailed(spelt(f)))).toBe(shellKey(await build(f)));
  });

  // The reviewer's measurement: a lone gable side spelt as one whole-length stretch standing apart gives up algorithm B
  // (decision 11), and its one rise, its ends on the end walls' planes (gable rise decision 10), is the same gable.
  it.each([[45, 45], [30, 60], [45, 30]] as const)('a lone whole-length gable standing apart, the box hipped at %i and the gable at %i, is the plain gable side', async (hip, deg) => {
    const box = (name: string, S: SideForm): ShellFixture => shellFixture(name, [ring([0, 0, 1000, 500], 0, 1, hip, {S})]);
    const apart = box(`LoneApart${hip}-${deg}`, {form: 'gable', deg, runs: [{from: 0, to: 1000, form: 'gable', deg, apart: true}]});
    expect(planStorey(apart, 0).rises?.length).toBe(1);
    expect(shellShape(await build(apart))).toBe(shellShape(await build(box(`LonePlain${hip}-${deg}`, {form: 'gable', deg}))));
  });
});

describe('decisions 1 and 12: a maxHeight stands above the plate, and only a gable run carries a setting', () => {
  it('a gable run\'s maxHeight of 0 or less is refused in memory', () => {
    const capped = (maxHeight: number): ShellFixture => shellFixture('Max', [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: [{from: 400, to: 600, form: 'gable', deg: 45, maxHeight}]}})]);
    expect(() => planStorey(capped(0), 0)).toThrow(PlanRefusal);
    expect(() => planStorey(capped(-10), 0)).toThrow(PlanRefusal);
  });

  // WP-S1.1, L2: memory agrees with the wire, which refuses a Pitched run carrying a setting. Mutation: the hip check
  // removed from `checkedRun`; then the apart hip run splits the hip extents and plans.
  it.each([[{maxHeight: 150}], [{facing: 'whole'}], [{apart: true}]] as const)('a hip run carrying %j is a PlanRefusal naming its Ring, side and run', extra => {
    const f = shellFixture('HipSetting', [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: [{from: 400, to: 600, form: 'hip', deg: 45, ...extra}]}})]);
    expect(() => planStorey(f, 0)).toThrow(/Ring 0 side S run 0 is a hip run carrying a gable's settings/);
  });

  it('a hip run with its facing spelt at the default is no setting, as on the wire', () => {
    const f = shellFixture('HipDefault', [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: [{from: 400, to: 600, form: 'hip', deg: 45, facing: 'centreLine', apart: false}]}})]);
    expect(() => planStorey(f, 0)).not.toThrow();
  });
});

// ---- WP-S1.1, H1: the thinnest capped rise built ----------------------------------------------------------------------

describe('decision 12 (WP-S1.1, H1): a rise capped within RISE_MIN_CAP_CM of its plate builds no piece', () => {
  /** A 1000 by 500 box hipped at `hip` (its E side at `endHip`), a 60° stretch on S over [lo, hi] capped at `cap`. */
  const capped = (name: string, lo: number, hi: number, cap: number, hip = 45, endHip = hip): ShellFixture =>
    shellFixture(name, [ring([0, 0, 1000, 500], 0, 1, hip, {S: {form: 'hip', deg: hip, runs: [{from: lo, to: hi, form: 'gable', deg: 60, maxHeight: cap}]}, E: {form: 'hip', deg: endHip}})]);
  /** The editor's spelling of EditorSpeltMaxHeight at another cap. */
  const spelt = (cap: number): ShellFixture => {
    const f = setting('EditorSpeltMaxHeight');
    const runs = f.rings[0].sides?.S?.runs?.map(r => (r.form === 'gable' ? {...r, maxHeight: cap} : r));
    return {...f, name: `EditorSpelt${cap}`, rings: [{...f.rings[0], sides: {S: {form: 'hip', deg: 30, runs}}}]};
  };
  const throughWire = (f: ShellFixture): ShellFixture => {
    const r = readInput(JSON.parse(JSON.stringify(writeInput(f))), f.name);
    if (!r.ok) throw new Error(r.errors.join('; '));
    return r.fixture;
  };
  const clean = async (f: ShellFixture): Promise<void> => {
    const b = await buildShellDetailed(f);
    expect(invariantViolations(b, {genus: 0, cheeks: 0}), f.name).toEqual([]);
    expect(b.shell.report.unclassifiedEdges, f.name).toBe(0);
  };

  // The reviewer's cases, and the sweep's worst (a corner rise between two 75° hips, 2.6 cm). Mutation: the threshold
  // back to SHELL_TOLERANCE_CM; then these build slivers that throw or leave Unclassified Edges.
  it.each([
    ['EditorSpeltMaxHeight at 0.0101', spelt(0.0101)], ['EditorSpeltMaxHeight at 0.011', spelt(0.011)],
    ['the 60° box stretch at 0.011', capped('Box011', 300, 500, 0.011)], ['the 60° box stretch at 0.015', capped('Box015', 300, 500, 0.015)],
    ['a corner rise between 75° hips at 2.6', capped('Corner26', 800, 1000, 2.6, 75)], ['the same at the threshold', capped('CornerAt', 800, 1000, 5, 75)],
  ] as const)('%s: no piece, and the shell is clean, in memory and through the wire', async (_, f) => {
    expect(RISE_MIN_CAP_CM).toBe(5);
    for (const g of [f, throughWire(f)]) {
      expect(planStorey(g, 0).rises ?? []).toEqual([]);
      await clean(g);
    }
  });

  it('just above the threshold the rise is built, flat at its cap, and clean', async () => {
    for (const f of [capped('BoxAbove', 300, 500, 5.05), capped('CornerAbove', 800, 1000, 5.05, 75), spelt(5.05)]) {
      expect(planStorey(f, 0).rises?.map(r => r.capCm)).toEqual([5.05]);
      await clean(f);
    }
    expect(topAt(await build(capped('BoxAboveTop', 300, 500, 5.05)), 400, 2)).toBeCloseTo(5.05, 1);
  });

  // The rule reads the lowest cap whatever its source: SetBackCappedRise's wall-top cap is the storey height.
  it('applies to the wall-top cap too: a storey 4 cm tall caps the rise below the threshold, one 6 cm tall does not', () => {
    const f = RISE_FIXTURES.find(x => x.name === 'SetBackCappedRise') as ShellFixture;
    expect(planStorey({...f, storeyHeight: 4}, 0).rises ?? []).toEqual([]);
    expect(planStorey({...f, storeyHeight: 6}, 0).rises?.map(r => [r.cap, r.capCm])).toEqual([['wallTop', 6]]);
  });
});

// ---- WP-S1.1, L1 and L4: where `split` cuts ----------------------------------------------------------------------------

describe('split cuts only where the rise can meet a gable, and never a sliver (WP-S1.1, L1 and L4)', () => {
  /** An L, `[0,0,1000,400]` and `[600,0,1000,1000]` at 45, with a 75° split stretch on S over [300, 700]. */
  const ell = [ring([0, 0, 1000, 400], 0, 1, 45, {S: {form: 'hip', runs: [{from: 300, to: 700, form: 'gable', deg: 75, facing: 'split'}]}}), ring([600, 0, 1000, 1000], 0, 1, 45)];
  /** A separate building to the north, its N side gabled at 75 over world x [620, 680], over the
   * L's stem: on another island. Cut there, the rise's part over the stem would reach to the stem's far wall. */
  const away = ring([300, 1200, 700, 1600], 0, 1, 45, {N: {form: 'hip', runs: [{from: 20, to: 80, form: 'gable', deg: 75}]}});

  // The reviewer's case. Mutation: `splitParts` cuts at every facing-back gable ahead, reached or not; then the L's rise
  // is two or three pieces.
  it('a gable on another island does not cut the rise: one piece, as without that building', async () => {
    const alone = shellFixture('SplitAlone', ell), beside = shellFixture('SplitBeside', [...ell, away]);
    const bands = (f: ShellFixture): [number, number, number][] => (planStorey(f, 0).rises ?? []).filter(r => r.piece.wall.a.y === 0).map(r => [r.piece.bandLo, r.piece.bandHi, r.piece.farDist]);
    expect(bands(beside)).toEqual([[300, 700, bands(alone)[0][2]]]);
    expect(bands(alone)).toHaveLength(1);
    const [a, b] = [await build(alone), await build(beside)];
    for (const [x, y] of [[450, 50], [500, 100], [550, 150]] as const) expect(topAt(b, x, y)).toBeCloseTo(topAt(a, x, y), 3);
  });

  // Mutation: cuts de-duplicated by exact value; then the gap between the two N gables is a part of its own.
  it('gable ends within SHELL_TOLERANCE_CM are one cut: no part narrower than the tolerance', () => {
    expect(southPieces(facingBox('SplitSliver', [300, 500], [[300, 400], [400.000001, 500]], 'split'))).toEqual([[300, 500, false]]);
    expect(southPieces(facingBox('SplitNearEnd', [300, 500], [[300.005, 420]], 'split'))).toEqual([[300, 420, false], [420, 500, true]]);
  });
});

describe('decisions 12 to 14: the wire', () => {
  it('names the three fields as the run fields are named, with USTRUCT defaults that are today\'s settings', () => {
    const [run] = writeInput(setting('ApartNeighbours')).rings[0].sides[1].runs;
    expect(Object.keys(run)).toEqual(['startCm', 'endCm', 'form', 'pitchDegrees', 'bEmptied', 'bOutlineRefused', 'maxHeightCm', 'facing', 'bStandsApart']);
    expect(runSettings({maxHeightCm: 0, facing: 'CentreLine', bStandsApart: false})).toEqual({});
  });

  it('ties the facing tables both ways, over every strategy', () => {
    for (const x of RISE_FACINGS) expect(FACING_READINGS[WIRE_FACINGS[x]]).toBe(x);
  });

  it('writes a gable run\'s settings, and every other run at its defaults', () => {
    const sides = writeInput(setting('EditorSpeltMaxHeight')).rings[0].sides[0].runs.map(r => [r.form, r.maxHeightCm, r.facing, r.bStandsApart]);
    expect(sides).toEqual([['Pitched', 0, 'CentreLine', false], ['GableEnd', 100, 'CentreLine', false], ['Pitched', 0, 'CentreLine', false]]);
    const apart = writeInput(setting('ApartNeighbours')).rings[0].sides[0].runs.map(r => [r.startCm, r.form, r.bStandsApart]);
    expect(apart).toEqual([[0, 'Pitched', false], [300, 'GableEnd', true], [500, 'GableEnd', false], [700, 'Pitched', false]]);
  });

  it('decision 12: a file without the three fields reads every run at its defaults, so means what it meant', () => {
    for (const f of [...RISE_FIXTURES, setting('ApartNeighbours')]) {
      const doc = JSON.parse(JSON.stringify(writeInput(f)));
      for (const r of doc.rings) for (const s of r.sides) for (const run of s.runs) { delete run.maxHeightCm; delete run.facing; delete run.bStandsApart; }
      const r = readInput(doc, f.name);
      if (!r.ok) throw new Error(r.errors.join('; '));
      for (const ring of r.fixture.rings) for (const s of RING_SIDES) for (const run of ring.sides?.[s]?.runs ?? []) expect([run.maxHeight, run.facing, run.apart]).toEqual([undefined, undefined, undefined]);
    }
  });

  it('refuses a gable setting on a Pitched run, and a negative maxHeightCm', () => {
    const doc = writeInput(setting('ApartNeighbours'));
    doc.rings[0].sides[0].runs[0].bStandsApart = true;
    const refused = readInput(JSON.parse(JSON.stringify(doc)), 'x');
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors.join('\n')).toMatch(/run 0 is solved Pitched but carries a gable's settings/);
    const negative = writeInput(setting('ApartNeighbours'));
    negative.rings[0].sides[0].runs[1].maxHeightCm = -1;
    expect(readInput(JSON.parse(JSON.stringify(negative)), 'x').ok).toBe(false);
  });

  it('decision 14: a lone gable side spelt as one stretch standing apart reads back with its run, not folded into the side', () => {
    const r = readInput(JSON.parse(JSON.stringify(writeInput(setting('ApartAcrossRings')))), 'x');
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.fixture.rings[1].sides?.S).toEqual({form: 'gable', deg: 45, runs: [{from: 0, to: 500, form: 'gable', deg: 45, apart: true}]});
    expect(r.fixture.rings[0].sides?.S).toEqual({form: 'gable', deg: 45});
  });
});
