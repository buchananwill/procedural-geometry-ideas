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
import {RISE_FACING_STRATEGIES, RisePiece, algorithmBBuildsGable, claimedWalls} from '../src/rise.ts';
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

describe('decision 2: every default reproduces today\'s roof', () => {
  /** A fixture with every gable run's settings spelt out at their defaults. */
  const spelt = (f: ShellFixture): ShellFixture => ({...f, rings: f.rings.map(r => ({...r, sides: Object.fromEntries(Object.entries(r.sides ?? {}).map(([k, s]) => [k,
    s.runs ? {...s, runs: s.runs.map(x => (x.form === 'gable' ? {...x, facing: 'centreLine' as const, apart: false} : x))} : s]))}))});
  it.each(RISE_FIXTURES.map(f => [f.name, f] as const))('%s: its rises are the same with every setting spelt at its default', (_, f) => {
    const pieces = (x: ShellFixture): string => JSON.stringify((planStorey(x, 0).rises ?? []).map(r => [r.piece.label, r.piece.planes, r.piece.farDist, r.limitPlane ?? null, r.cap ?? null]));
    expect(pieces(spelt(f))).toBe(pieces(f));
  });
});

describe('decisions 1 and 12: a maxHeight stands above the plate', () => {
  it('a gable run\'s maxHeight of 0 or less is refused in memory; a hip run\'s is not read', () => {
    const capped = (form: 'hip' | 'gable', maxHeight: number): ShellFixture => shellFixture('Max', [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: [{from: 400, to: 600, form, deg: 45, maxHeight}]}})]);
    expect(() => planStorey(capped('gable', 0), 0)).toThrow(PlanRefusal);
    expect(() => planStorey(capped('gable', -10), 0)).toThrow(PlanRefusal);
    expect(() => planStorey(capped('hip', 0), 0)).not.toThrow();
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
