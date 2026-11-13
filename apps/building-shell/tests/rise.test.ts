// Gable rise decisions 1 to 21 (journal decisions 204 to 206, WP-G2): every rise fixture keeps spec 32's invariants
// (decision 20) and its height function (decision 19); the gates of decision 21 and of the provisional defaults of
// journal decision 204, each convicted by mutation; Cell provenance (decision 14); the wire (decisions 15 to 17); and
// F69's conflict, pinned as the re-tag pass reports it today.
import {describe, expect, it} from 'vitest';
import {PlanRefusal} from '../src/errors.ts';
import {EXPORTED_FIXTURES, RING_SIDES, RISE_FIXTURES, ShellFixture, SideForm, fixtureByName, ring, storeyRings, storeysOf} from '../src/fixture.ts';
import {BUILDS_A_RISE, NOT_ONE_WHOLE_RUN, buildsARise, cppReplayability} from '../src/golden.ts';
import {getManifold} from '../src/manifold.ts';
import {GableRise, claimedBands, ringSideLines, storeyLoops, unionWallForms} from '../src/ring-forms.ts';
import {
  FLOOR_CAP_GAP_CM, LimitContext, NO_WALL, RisePiece, algorithmBBuildsGable, algorithmBSpan, builtRoofReading, claimedWalls, extentOf, hipRoofReading, ridgeSlope,
  ridgeSlopeReadings, risePieces, slopeInBuilding, storeyGables, storeyRises,
} from '../src/rise.ts';
import {solveRoofParts} from '../src/roof/algoB.ts';
import {ShellBuild, buildShellDetailed, buildShellFromUnion} from '../src/shell.ts';
import {StoreyPlan, buildingOf, planChecked, planStorey, storeyForms} from '../src/storey.ts';
import {unionPlans} from '../src/union.ts';
import {WIRE_FORMS, readInput, writeInput} from '../src/wire/input-adapter.ts';
import type {BuildingShellInputV1} from '../src/wire/input-types.ts';
import {RISE_ORACLE_TOL_CM, intervalTop, riseBreakthrough, riseOracle} from './rise-oracle.ts';
import {gapFixture, nudgeFixtures, randomCourtyardFixtures, randomFixtures, randomSplitCourtyardFixtures, randomUFixtures} from './robustness-fixtures.ts';
import {componentGenera, invariantViolations} from './shell-invariants.ts';
import {memoBuilds, shellFixture} from './test-builds.ts';

const build = memoBuilds();
const rise = (name: string): ShellFixture => {
  const f = RISE_FIXTURES.find(x => x.name === name);
  if (!f) throw new Error(`no rise fixture ${name}`);
  return f;
};

/** The limit context production gives one of a storey's rises: its wall, island and band, and the storey's gables. */
function limitContextOf(f: ShellFixture, plan: StoreyPlan, r: RisePiece): LimitContext {
  const forms = storeyForms(storeyRings(f, plan.storey));
  return {plan, wall: r.piece.wall, comp: plan.building.comps[r.piece.wall.comp], rise: r.rise, gables: storeyGables(plan, storeyRises(forms.walls, forms.covered))};
}

/** Every rise fixture's genus: the courtyards close their hole. */
const genusOf = (name: string): number => (name.startsWith('Courtyard') ? 1 : 0);

/**
 * How many rises each fixture builds: FlushT none (its crossbar's hip wins), AdjacentRises two,
 * GableBesideHipSouthWing two (Ring 0's W gable is a rise on the x = 0 wall the wing's hipped W side continues, as
 * before journal decision 220), RiseFacingRiseWall two (one on each long side), RiseBeforeTStemBarRisen three (one on
 * the bar's S wall, one on each of its N walls), the five OppositeGablesT fixtures two each (one on the crossbar's S
 * side, one on its N side; in OppositeGablesTCovered the N one is a covered rise, journal decision 243, rule 3), every
 * other one.
 */
const RISES: Record<string, number> = {
  FlushT: 0, AdjacentRises: 2, GableBesideHipSouthWing: 2, RiseFacingRiseWall: 2, RiseBeforeTStemBarRisen: 3,
  OppositeGablesT65: 2, OppositeGablesT75: 2, OppositeGablesTCovered: 2, OppositeGablesTUnequal: 2, OppositeGablesTPartFacing: 2,
};

/**
 * F69 (journal decision 203, WP-G2's brief): the re-tag pass reports a coplanar Wall over a Gable only where an output
 * triangle's centroid lands in the overlap. A rise's front under a flush upper wall gives one. Pinned as it is today,
 * text for text; it is a property of the re-tag pass, not of rises, and is not fixed here.
 */
const F69_CONFLICTS: Record<string, string[]> = {
  BuriedRise: ['BuriedRise: n=(0.000000, -1.000000, 0.000000) d=0.000: Wall storey 1 wall 0 (part 3) over Gable storey 0 wall 0 (part 2)'],
  StoreyRingConflictSwapped: ['StoreyRingConflictSwapped: n=(0.000000, -1.000000, 0.000000) d=0.000: Wall storey 1 wall 0 (part 3) over Gable storey 0 wall 0 (part 2)'],
};

/**
 * Cheeks a rise fixture builds, as facts (journal decisions 235 and 237: a Cheek is not a defect in itself). Journal
 * decision 243: OppositeGablesTPartFacing's S rise runs at full height to the N wall's line, since its walk line is under
 * the N gable (rule 1); over x [400, 450] that line is the stem's S side, under no gable and on no union wall, so the
 * rise's end standing above the stem's roof there is one Cheek, at (400, 400) on the plate.
 */
const CHEEKS: Record<string, number> = {OppositeGablesTPartFacing: 1};

/** A shell's structure: faces by kind, plane and area (0.1 cm²), Edge kinds, Cell count. */
function signature(b: ShellBuild): string {
  const faces = b.shell.faces.map(f => `${f.tag.kind}|${f.normal.map(v => v.toFixed(5)).join(',')}|${f.offset.toFixed(3)}|${f.area.toFixed(1)}`).sort();
  return JSON.stringify({faces, edges: b.shell.edges.map(e => e.kind).sort(), cells: b.shell.cells.length});
}

/** The Gable faces standing on `y = 0`, facing -y, with their apex height and their Cells' sources. */
const southGables = (b: ShellBuild) => b.shell.faces.filter(f => f.tag.kind === 'Gable' && Math.abs(f.normal[1] + 1) < 1e-9)
  .map(f => ({apex: Math.max(...f.loops[0].map(p => p[2])), lo: Math.min(...f.loops[0].map(p => p[0])), hi: Math.max(...f.loops[0].map(p => p[0])), sources: f.sources}));

describe.each(RISE_FIXTURES.map(f => [f.name] as const))('%s', name => {
  it("keeps spec decision 32's invariants, with its pinned Cheeks and conflicts only (decision 20)", async () => {
    const b = await build(rise(name));
    expect(invariantViolations(b, {genus: genusOf(name), cheeks: CHEEKS[name] ?? 0})).toEqual([]);
    expect(b.shell.report.unclassifiedEdges).toBe(0);
    expect(b.shell.report.conflicts).toEqual(F69_CONFLICTS[name] ?? []);
  });

  it('builds its rises, and every rise stands on decision 19\'s height function', async () => {
    const b = await build(rise(name));
    expect(b.union.plans.reduce((n, p) => n + (p.rises?.length ?? 0), 0)).toBe(RISES[name] ?? 1);
    const o = riseOracle(b.union);
    expect(o.worst, o.at).toBeLessThanOrEqual(RISE_ORACLE_TOL_CM);
  });

  it('stays beneath the top of every storey over it (journal F68)', async () => {
    expect(riseBreakthrough((await build(rise(name))).union)).toBeLessThanOrEqual(RISE_ORACLE_TOL_CM);
  });
});

// ---- Journal decision 209, M1: assertions independent of rise.ts's choice of planes --------------------------------

/** The plane of the walls on one line facing one way (not a cut), named by hand: the line `axis = at`, inward `n`. */
function planeOfWalls(plan: ReturnType<typeof planStorey>, axis: 'x' | 'y', at: number, inward: -1 | 1): number {
  const ids = new Set(plan.building.walls
    .filter(w => w.form !== 'cut' && (axis === 'y' ? w.a.y === at && w.b.y === at && Math.sign(w.n.y) === inward : w.a.x === at && w.b.x === at && Math.sign(w.n.x) === inward))
    .map(w => w.plane));
  if (ids.size !== 1) throw new Error(`walls on ${axis} = ${at} facing ${inward} hold ${ids.size} planes`);
  return [...ids][0];
}

const t = (deg: number): number => Math.tan((deg * Math.PI) / 180);

/**
 * Every rise fixture: the wall whose plane is its rises' limit, named by hand (none where nothing is built), and one
 * height of the built shell's top at a point picked by hand, from a closed form of the fixture's own numbers (plate 250).
 * CornerRise's apex is in its own gate below; `CourtyardRiseAlongCut`'s hole W wall too, so its row adds the height.
 */
type HandWall = ['x' | 'y', number, -1 | 1];

/** A rise with no slope limit (journal decision 231): only its rakes and caps bound it. */
type NoLimit = 'none';

/** One fixture's row: its limits named by hand, and one height of its built top at a point picked by hand. */
interface IndependentRow { limit?: HandWall | NoLimit; limits?: Record<string, HandWall | NoLimit>; at: [number, number]; z: number }

/**
 * `limit` names every rise's limit wall, or says it has none; `limits` names it (or none) per rise, keyed by the line its
 * wall stands on (`y=0`), for a fixture whose rises have different limits.
 */
const INDEPENDENT: Record<string, IndependentRow> = {
  // A 45° rise over [330, 610] on a 30° hip: the near rake 120 above the plate at x = 450, under the N slope's 259.8.
  MidWallRise: {limit: ['y', 500, -1], at: [450, 50], z: 250 + t(45) * 120},
  // The 60° rake from x = 800, 50 cm in, under the E hip's 150 (decision 10's corner plane).
  CornerRise: {limit: ['y', 500, -1], at: [850, 20], z: 250 + t(60) * 50},
  // The bar's N slope (y = 400), not the stem's end (y = 1000): at y = 150 it gives 250, under the rakes' 335.9.
  RiseBeforeTStem: {limit: ['y', 400, -1], at: [490, 150], z: 250 + 250},
  // No rise: the crossbar's S hip at y = 100.
  FlushT: {at: [500, 100], z: 250 + 100},
  FlushTSwapped: {limit: ['y', 500, -1], at: [450, 30], z: 250 + 50},
  // The 60° rise over [500, 700]: its near rake 50 cm in.
  AdjacentRises: {limit: ['y', 500, -1], at: [550, 40], z: 250 + t(60) * 50},
  // The hole S wall's plane (y = 300, facing -y): the rakes' 80 under its 138.6.
  CourtyardRiseFacingCut: {limit: ['y', 300, -1], at: [180, 60], z: 250 + 80},
  CourtyardRiseAlongCut: {limit: ['x', 300, -1], at: [60, 280], z: 250 + 80},
  // The far slope truncates the 75° rise at its own wall: 490 at y = 10.
  TruncatedRise: {limit: ['y', 500, -1], at: [500, 10], z: 250 + 490},
  // maxHeight 200 under the 60° rakes' 346.
  FlatTopRise: {limit: ['y', 500, -1], at: [500, 20], z: 250 + 200},
  // The floor cap, 1 cm under storey 2's floor at 500, under the far slope's t(30) × 480 = 277.1.
  OverhangCappedRise: {limit: ['y', 500, -1], at: [500, 20], z: 500 - 1},
  // The wall-top cap at storey 1's plate, 500, outside storey 1's plan (y < 100).
  SetBackCappedRise: {limit: ['y', 500, -1], at: [500, 50], z: 500},
  // Buried whole: the top is storey 1's own S hip, 50 above its plate at 500.
  BuriedRise: {limit: ['y', 500, -1], at: [500, 50], z: 500 + 50},
  // Journal F75's drafts: Ring 1's far slope (y = 800) limits; at x = 900 the two 22.5° rakes, from x = 600 and from
  // the x = 1200 corner, meet 300 cm in from each end, above the S hip's 20 cm and under the limit's 780 cm.
  GableBesideHip: {limit: ['y', 800, -1], at: [900, 20], z: 250 + t(22.5) * 300},
  // With the wing, Ring 0's W gable is a rise on x = 0 too (as before decision 220), limited by Ring 1's E slope.
  GableBesideHipSouthWing: {limits: {'y=0': ['y', 800, -1], 'x=0': ['x', 1200, -1]}, at: [900, 20], z: 250 + t(22.5) * 300},
  // Journal decision 231: the N wall is gabled along its whole length, so its 30° skeleton face (which gave 490 t(30) =
  // 282.9 here before) is no limit, and nothing else falls on the walk. The 75° rakes from x = 300 and x = 700 meet at
  // x = 500, 200 t(75) up, above the 60° S slope's 17.3 at y = 10.
  RiseFacingGabledWall: {limit: 'none', at: [500, 10], z: 250 + t(75) * 200},
  // Journal decision 243, rule 1, re-pinned from decision 231's 490: the N wall's own 60° rise stands over the S rise's
  // walk line (x = 500), so the N wall's 45° slope no longer limits it, nor the S slope the N rise (x = 500 is inside
  // [300, 700]). The 75° rakes from x = 300 and x = 700 meet at x = 500, 200 t(75) up, at y = 10 as everywhere along it.
  RiseFacingRiseWall: {limits: {'y=0': 'none', 'y=500': 'none'}, at: [500, 10], z: 250 + t(75) * 200},
  // Journal decisions 231 and 233: no slope limit, so the 75° rakes' apex, 200 t(75) = 746.4, runs at full height to the
  // N wall, 0.08 cm short of which this reads it; the N gable stands only 500 there.
  RiseRunsToFarGable: {limit: 'none', at: [500, 499.9], z: 250 + t(75) * 200},
  // The gate of journal decision 231's last clause: the bar's two N walls each carry a rise, and the bar's N slope (y = 400)
  // still limits the S rise, 250 at y = 150 as in RiseBeforeTStem. Passed over, the walk would run on into the stem and
  // take its end's slope (y = 1000), and the top here would be the rakes' 335.9. The N rises are limited by the S slope.
  RiseBeforeTStemBarRisen: {limits: {'y=0': ['y', 400, -1], 'y=400': ['y', 0, 1]}, at: [490, 150], z: 250 + 250},
  // Journal decision 243 (F80), the user's drafts. Each rise's walk line (x = 525) lies under the opposite gable, so no
  // slope limits either (rule 1). At mid-depth the top is the 65° rakes' apex, 125 t(65), under the crossbar's 346.4 ridge.
  OppositeGablesT65: {limit: 'none', at: [525, 200], z: 250 + t(65) * 125},
  // At 75° the apex, 125 t(75) = 466.5, stands above the 346.4 ridge, and stays at full height across the crossbar.
  OppositeGablesT75: {limit: 'none', at: [525, 200], z: 250 + t(75) * 125},
  // The N stretch is wholly under the stem and built all the same (rule 3); both are their 75° rakes, apex 100 t(75).
  OppositeGablesTCovered: {limit: 'none', at: [500, 200], z: 250 + t(75) * 100},
  // The 75° S rise runs over the 60° N one to the N wall: its apex at mid-depth is the taller, 125 t(75).
  OppositeGablesTUnequal: {limit: 'none', at: [525, 200], z: 250 + t(75) * 125},
  // The S walk line (x = 525) is under the N gable over [450, 900]: no limit. The N walk line (x = 675) is not under the S
  // gable over [400, 650]: the S wall's slope (y = 0) limits the N rise. At mid-depth the S rise's apex, 125 t(75).
  OppositeGablesTPartFacing: {limits: {'y=0': 'none', 'y=400': ['y', 0, 1]}, at: [525, 200], z: 250 + t(75) * 125},
  // Journal decision 244: the 60° rakes from y = 100 and y = 400 meet at y = 250, 150 t(60) up. The walk from (500, 250)
  // runs west along the main ridge to the W end's slope (x = 0), which at x = 490 stands 490 t(30) = 282.9, above them.
  GableOnSharedWall: {limit: ['x', 0, 1], at: [490, 250], z: 250 + t(60) * 150},
};

describe('journal decision 209, M1: each rise fixture against hand-named planes and hand-computed heights', () => {
  it('lists every rise fixture', () => {
    expect(Object.keys(INDEPENDENT).sort()).toEqual(RISE_FIXTURES.map(f => f.name).sort());
  });

  it.each(Object.entries(INDEPENDENT))('%s: its limit is the named wall\'s plane, and its top at the named point is the closed form', async (name, want) => {
    const plan = planStorey(rise(name), 0);
    if (want.limit === 'none') {
      expect(plan.rises?.length).toBeGreaterThan(0);
      for (const r of plan.rises ?? []) expect(r.limitPlane).toBeUndefined();
    } else if (want.limit) {
      const [axis, at, inward] = want.limit;
      for (const r of plan.rises ?? []) expect(r.limitPlane).toBe(planeOfWalls(plan, axis, at, inward));
    } else if (want.limits) {
      const on = (r: NonNullable<typeof plan.rises>[number]): string => (r.piece.wall.a.x === r.piece.wall.b.x ? `x=${r.piece.wall.a.x}` : `y=${r.piece.wall.a.y}`);
      expect([...new Set((plan.rises ?? []).map(on))].sort()).toEqual(Object.keys(want.limits).sort());
      for (const r of plan.rises ?? []) {
        const hand = want.limits[on(r)];
        expect(r.limitPlane, on(r)).toBe(hand === 'none' ? undefined : planeOfWalls(plan, ...hand));
      }
    } else {
      expect(plan.rises ?? []).toEqual([]);
    }
    const b = await build(rise(name));
    const [x, y] = want.at;
    expect(intervalTop(b.union, x + 0.013, y + 0.017, 250.5)).toBeCloseTo(want.z, 1);
  });

  it('names the cap that won: the floor, the wall top, the rise\'s own maxHeight', () => {
    const cap = (name: string) => planStorey(rise(name), 0).rises?.map(r => [r.cap, r.capCm]);
    expect(cap('OverhangCappedRise')).toEqual([['floor', 249]]);
    expect(cap('SetBackCappedRise')).toEqual([['wallTop', 250]]);
    expect(cap('BuriedRise')).toEqual([['wallTop', 250]]);
    expect(cap('FlatTopRise')).toEqual([['maxHeight', 200]]);
    expect(cap('MidWallRise')).toEqual([[undefined, undefined]]);
  });
});

describe("F69's conflict, pinned as the re-tag pass reports it (journal decision 206)", () => {
  it('StoreyRingConflictSwapped: its rise under the flush storey above reports Wall over Gable once', async () => {
    const b = await build(fixtureByName('StoreyRingConflictSwapped'));
    expect(b.shell.report.conflicts).toEqual(F69_CONFLICTS.StoreyRingConflictSwapped);
    expect(invariantViolations(b, {genus: 0, cheeks: 0})).toEqual([]);
  });
});

// ---- Decision 21's gates, and the defaults of journal decision 204, each convicted by mutation -----------------------

describe('decision 21 and journal decision 204: the gates', () => {
  // Decision 9: the rake from x = 600 lies on the stem's W wall plane (an L, no corner), so its id must be that plane's.
  // Mutation: a rise's planes never take an existing id; then the two faces conflict on one plane.
  it('decision 9: a rake on another wall\'s plane takes its id, and the shell has no conflict', async () => {
    const f = shellFixture('RakeOnStemPlane', [
      ring([0, 0, 1000, 400], 0, 1, 45, {S: {form: 'hip', runs: [{from: 600, to: 1000, form: 'gable', deg: 45}]}}),
      ring([600, 0, 1000, 1000], 0, 1, 45),
    ]);
    const plan = planStorey(f, 0);
    const stemW = plan.building.walls.find(w => w.a.x === 600 && w.b.x === 600);
    expect(stemW && plan.rises?.[0].piece.planes).toContain(stemW?.plane);
    const b = await build(f);
    expect(b.shell.report.conflicts).toEqual([]);
    expect(invariantViolations(b, {genus: 0, cheeks: 0})).toEqual([]);
  });

  // Decision 3. Mutation: each extent takes the wall's whole-wall winner; then the flush pair's gable spreads over the
  // whole wall again, and FlushTSwapped's stem gable stands 750 high over [0, 1000].
  it("decision 3: a gabled Ring's own stretch is a rise, never the whole wall", async () => {
    for (const [name, apex, lo, hi] of [['FlushRingConflict', 500, 500, 1000], ['FlushRingConflictSwapped', 500, 500, 1000]] as const) {
      const g = southGables(await build(fixtureByName(name)));
      expect(g).toHaveLength(1);
      expect(g[0].apex).toBeCloseTo(apex, 6);
      expect([g[0].lo, g[0].hi]).toEqual([lo, hi]);
    }
    const t = southGables(await build(rise('FlushTSwapped')));
    expect(t.map(g => [g.lo, g.hi, Math.round(g.apex * 100) / 100])).toEqual([[400, 600, 350]]);
  });

  // Decision 10 on unequal pitches (decision 21 as amended): the 60° rise ends at the 45° E hip's plane. Mutation: no
  // corner rule; the rise's own 60° rake stands at x = 1000 and its apex is 423.2.
  it('decision 10: a 60° rise at a 45° convex corner takes the end wall\'s plane: apex 376.79', async () => {
    const g = southGables(await build(rise('CornerRise')));
    expect(g).toHaveLength(1);
    expect(g[0].apex).toBeCloseTo(250 + 200 * Math.tan(Math.PI / 3) / (Math.tan(Math.PI / 3) + 1), 2);
  });

  // Decision 21: a rise widened to the whole wall, forced past decision 5 by hand, is the whole-wall gable's shell.
  // Mutation: no corner rule; at 60° on 45° the widened rise's ends are its own rakes and the shells differ.
  it.each([[45], [60], [30]] as const)('decision 21: a rise widened to the whole wall at %i° on 45° is the whole-wall gable', async deg => {
    const wasm = await getManifold();
    const R = [0, 0, 1000, 500] as const;
    const gable = shellFixture(`WholeWallGable${deg}`, [ring([...R], 0, 1, 45, {S: {form: 'gable', deg}})]);
    const hipped = shellFixture(`WideRise${deg}`, [ring([...R], 0, 1, 45, {S: {form: 'hip', deg}})]);
    const plan = planStorey(hipped, 0);
    const rings = storeyRings(hipped, 0);
    const walls = unionWallForms(rings, storeyLoops(rings.map(r => r.ring.rect)))
      .map(w => (w.axis === 'y' && w.at === 0 ? {...w, rises: [{lo: 0, hi: 1000, deg, limit: 'ridgeSlope' as const}]} : w));
    plan.rises = risePieces(hipped, plan, walls);
    const wide = buildShellFromUnion(wasm, gable, unionPlans(wasm, hipped.name, [plan]));
    expect(signature(wide)).toBe(signature(await build(gable)));
  });

  // Journal decision 204: where the walk over the hip roof finds no falling face (it runs along the courtyard's cut), the
  // built roof's walk gives the limit, the hole W wall's plane. Mutation: no fallback; then ridgeSlope refuses the rise.
  it("ridgeSlope's fallback: the walk along the cut reads the built roof, and the rise is clean", async () => {
    const plan = planStorey(rise('CourtyardRiseAlongCut'), 0);
    const [r] = plan.rises ?? [];
    const ctx = limitContextOf(rise('CourtyardRiseAlongCut'), plan, r);
    expect(hipRoofReading(ctx)).toBeUndefined();
    expect(builtRoofReading(ctx)).toBe(r.limitPlane);
    const holeW = plan.building.walls.find(w => w.a.x === 300 && w.b.x === 300);
    expect(r.limitPlane).toBe(holeW?.plane);
    expect(invariantViolations(await build(rise('CourtyardRiseAlongCut')), {genus: 1, cheeks: 0})).toEqual([]);
  });

  // Journal decision 204, F71: the floor cap stands FLOOR_CAP_GAP_CM below an overhanging floor. Mutation: no gap; the
  // capped front meets the overhang's floor where it projects past the wall, an Unclassified Gable-Underside Edge.
  it('the floor cap stands its gap below the overhanging floor: no Underside contact, no Unclassified Edge', async () => {
    const b = await build(rise('OverhangCappedRise'));
    const [r] = b.union.plans[0].rises ?? [];
    expect(r.capCm).toBe(2 * 250 - 250 - FLOOR_CAP_GAP_CM);
    expect(b.shell.report.unclassifiedEdges).toBe(0);
    expect(b.shell.edges.filter(e => e.faces.some(f => b.shell.faces[f].tag.kind === 'Underside') && e.faces.some(f => ['Gable', 'Roof'].includes(b.shell.faces[f].tag.kind) && b.shell.faces[f].tag.storey === 0))).toEqual([]);
    expect(componentGenera(b.union.mesh)).toEqual([0]);
  });

  // Journal decision 204, F72: a rise is capped at the wall top of the storey directly above. Mutation: no wall-top cap;
  // the 75° rise stands 149.7 cm through the set-back storey's eave.
  it('the wall-top cap holds a rise under the set-back storey directly above beneath that storey', async () => {
    const b = await build(rise('SetBackCappedRise'));
    expect(b.union.plans[0].rises?.[0].capCm).toBe(250);
    expect(riseBreakthrough(b.union)).toBeLessThanOrEqual(RISE_ORACLE_TOL_CM);
  });

  // Decision 16: a fixture with no authored runs writes what it always has, one run per side its whole length.
  // Mutation: the run-less branch writes the side's form as its request even where the fixture lists no side.
  it('decision 16: every run-less fixture writes one run per side, Auto where it lists none, byte for byte', () => {
    const oneRun = (f: ShellFixture): BuildingShellInputV1 => {
      const doc = writeInput(f);
      f.rings.forEach((r, i) => RING_SIDES.forEach((side, j) => {
        const s = r.sides?.[side], l = ringSideLines(r.rect)[side];
        const form = WIRE_FORMS[s?.form ?? 'hip'];
        doc.rings[i].sides[j] = {request: s ? form : 'Auto', runs: [{startCm: 0, endCm: l.hi - l.lo, form, pitchDegrees: s?.deg ?? r.defaultDeg, bEmptied: false, bOutlineRefused: false}]};
      }));
      return doc;
    };
    for (const f of [...EXPORTED_FIXTURES, ...RISE_FIXTURES.filter(x => x.rings.every(r => RING_SIDES.every(s => !r.sides?.[s]?.runs)))]) {
      expect(JSON.stringify(writeInput(f)), f.name).toBe(JSON.stringify(oneRun(f)));
    }
  });
});

// ---- Gable rise decision 5 as amended by journal decision 220 ------------------------------------------------------

describe('journal decision 220: a gable belongs to the Ring side that asked for it', () => {
  /** The Gable faces on `y = 0` facing -y: their span, apex height and the x of their apex. */
  const yZeroGables = (b: ShellBuild) => b.shell.faces.filter(f => f.tag.kind === 'Gable' && Math.abs(f.normal[1] + 1) < 1e-9 && f.loops[0].every(p => Math.abs(p[1]) < 1e-9))
    .map(f => {
      const top = f.loops[0].reduce((m, p) => (p[2] > m[2] ? p : m));
      return {lo: Math.min(...f.loops[0].map(p => p[0])), hi: Math.max(...f.loops[0].map(p => p[0])), apex: top[2], apexX: top[0]};
    });

  // Journal F75 and F77. Mutation: `algorithmBBuildsGable` returns true (the predicate removed, algorithm B keeps every
  // all-gable wall); then the wing's wall is a slice of a 1200 cm gable, its apex at x = 600, 248.5 cm up.
  it.each([['GableBesideHip'], ['GableBesideHipSouthWing']] as const)('%s: one symmetric gable on y = 0 over [600, 1200], its apex at x = 900, 300 tan 22.5° above the plate', async name => {
    const g = yZeroGables(await build(rise(name)));
    expect(g).toHaveLength(1);
    expect([g[0].lo, g[0].hi]).toEqual([600, 1200]);
    // The mesh holds float32 positions: 374.2637 against the closed form's 374.2641.
    expect(g[0].apexX).toBeCloseTo(900, 2);
    expect(g[0].apex).toBeCloseTo(250 + t(22.5) * 300, 2);
  });

  // F76: SingleStoreyT's E gable end is Ring 0's whole E side, its middle buried by the stem. Algorithm B's piece spans
  // that claimed band, so algorithm B keeps the wall, and the shell is the one the per-extent walls alone give.
  it('SingleStoreyT: algorithm B keeps its gable end, and its shell is byte for byte the per-extent walls\' shell', async () => {
    const f = fixtureByName('SingleStoreyT');
    const rings = storeyRings(f, 0);
    const rects = rings.map(r => r.ring.rect), loops = storeyLoops(rects);
    const derived = unionWallForms(rings, loops);
    const b0 = buildingOf(rings, rects, loops, derived);
    const east = derived.filter(w => w.axis === 'x' && w.at === 1000 && w.n === '-x');
    expect(east.map(w => [w.lo, w.hi, w.form])).toEqual([[0, 150, 'gable'], [350, 500, 'gable']]);
    for (const w of east) {
      expect(algorithmBSpan(b0, w)).toEqual([0, 500]);
      expect(claimedBands(rings, w).map(r => [r.lo, r.hi])).toEqual([[0, 500]]);
    }
    const {walls, changed} = claimedWalls(rings, derived, b0);
    expect(changed).toBe(false);
    walls.forEach((w, k) => expect(w).toBe(derived[k]));
    const wasm = await getManifold();
    const perExtent = buildShellFromUnion(wasm, f, unionPlans(wasm, f.name, [planChecked(f.name, 0, 0, 250, b0)]));
    const built = await build(f);
    expect(Array.from(built.union.mesh.positions)).toEqual(Array.from(perExtent.union.mesh.positions));
    expect(Array.from(built.union.mesh.tris)).toEqual(Array.from(perExtent.union.mesh.tris));
    expect(signature(built)).toBe(signature(perExtent));
  });

  it('the predicate: algorithm B keeps an all-gable wall only where the claimed bands on it tile its span', () => {
    const band = (lo: number, hi: number, deg = 45): GableRise => ({lo, hi, deg, limit: 'ridgeSlope'});
    expect(algorithmBBuildsGable([band(0, 500)], [0, 500])).toBe(true);
    expect(algorithmBBuildsGable([band(600, 1200)], [0, 1200])).toBe(false);
    expect(algorithmBBuildsGable([band(0, 1200)], [600, 1200])).toBe(false);
    expect(algorithmBBuildsGable([band(0, 400), band(500, 1000)], [0, 1000])).toBe(false);
    expect(algorithmBBuildsGable([], [0, 500])).toBe(false);
  });

  // Decision 220's sub-rule. Mutation: `algorithmBBuildsGable` requires one band; then this wall is a hip at 45° with
  // two rises, and the split courtyard below gains a Cheek.
  it('the sub-rule: a wall claimed gable at two pitches stays algorithm B\'s one gable', () => {
    const f = shellFixture('TwoPitchGable', [ring([0, 0, 1000, 500], 0, 1, 30, {S: {form: 'gable', deg: 45, runs: [{from: 500, to: 1000, form: 'gable', deg: 60}]}})]);
    const south = storeyForms(storeyRings(f, 0)).walls.filter(w => w.axis === 'y' && w.at === 0);
    expect(south.map(w => [w.form, w.deg, w.rises])).toEqual([['gable', 45, undefined]]);
  });
});

// ---- Journal decision 222: the verdict is decided once per line extent, and every band is built once ----------------

describe('journal decision 222: algorithm B\'s verdict is the line extent\'s, not a wall\'s', () => {
  const twoPitchRuns = (split: number): SideForm => ({form: 'gable', runs: [{from: 0, to: split, form: 'gable', deg: 30}, {from: split, to: 1000, form: 'gable', deg: 45}]});
  /**
   * The review's three inputs (H1). Each puts two claimed bands of two pitches, which together tile algorithm B's extent
   * [0, 1000] of y = 0, on two or three union walls of that one extent, so a per-wall verdict kept one wall and gave up
   * another. The sub-rule keeps the extent: algorithm B's one gable over [0, 1000] at the lowest index's 30°, its rakes the
   * x = 0 and x = 1000 hip planes at 30°, its apex at x = 500, 500 tan 30° above the plate. That is the roof before
   * `b1cff3e`, clean.
   */
  const H1: readonly [string, ShellFixture, number][] = [
    ['TwoRingsNoRuns', shellFixture('TwoRingsNoRuns', [
      ring([0, 0, 500, 500], 0, 1, 30, {S: {form: 'gable', deg: 30}}), ring([500, 0, 1000, 500], 0, 1, 30, {S: {form: 'gable', deg: 45}}), ring([600, -300, 800, 0], 0, 1, 30)]), 0],
    ['SplitSeen', shellFixture('SplitSeen', [ring([0, 0, 1000, 500], 0, 1, 30, {S: twoPitchRuns(300)}), ring([400, -300, 800, 0], 0, 1, 30)]), 0],
    ['HoleAndOuter2', shellFixture('HoleAndOuter2', [ring([0, 0, 1000, 500], 0, 1, 30, {S: twoPitchRuns(500)}),
      ring([100, -400, 300, 0], 0, 1, 30), ring([700, -400, 900, 0], 0, 1, 30), ring([100, -600, 900, -400], 0, 1, 30)]), 1],
  ];

  // Mutation: the verdict per wall again (each wall's own overlapping bands against its span); then each input keeps one
  // wall and builds a rise on another over a band algorithm B also builds, and the shell has 1 Cheek.
  it.each(H1)('%s: every wall on the extent takes one verdict, no rise is built, and the roof is algorithm B\'s one gable, clean', async (_, f, genus) => {
    const onLine = storeyForms(storeyRings(f, 0)).walls.filter(w => w.axis === 'y' && w.at === 0 && w.n === '+y');
    expect(onLine.length).toBeGreaterThan(1);
    expect(onLine.map(w => [w.form, w.rises])).toEqual(onLine.map(() => ['gable', undefined]));
    const b = await build(f);
    expect(b.union.plans[0].rises ?? []).toEqual([]);
    expect(invariantViolations(b, {genus, cheeks: 0})).toEqual([]);
    expect(b.shell.report.conflicts).toEqual([]);
    const faces = b.shell.faces.filter(x => x.tag.kind === 'Gable' && Math.abs(x.normal[1] + 1) < 1e-9 && x.loops[0].every(p => Math.abs(p[1]) < 1e-9));
    expect(faces.map(x => [Math.min(...x.loops[0].map(p => p[0])), Math.max(...x.loops[0].map(p => p[0]))])).toEqual([[0, 1000]]);
    const apex = faces[0].loops[0].reduce((m, p) => (p[2] > m[2] ? p : m));
    expect(apex[0]).toBeCloseTo(500, 2);
    expect(apex[2]).toBeCloseTo(250 + t(30) * 500, 2);
  });

  // Decision 222, M1: a gable run whose middle a wing buries is one claimed band, so one rise over the whole run, built
  // once (decision 220's "buried stretches included"; it built two before decision 220). Its middle is buried, so it
  // stands on the longest wall it overlaps, the lower-starting of two equal ones: [0, 300].
  it('OneBandTwoWalls: one rise over [100, 900], built once, on wall [0, 300], clean, its Cells naming Ring 0\'s S side on both exposed parts', async () => {
    const f = shellFixture('OneBandTwoWalls', [ring([0, 0, 1000, 500], 0, 1, 30, {S: {form: 'hip', runs: [{from: 100, to: 900, form: 'gable', deg: 45}]}}), ring([300, -300, 700, 0], 0, 1, 30)]);
    const plan = planStorey(f, 0);
    const wallSpan = (r: NonNullable<typeof plan.rises>[number]): number[] => [Math.min(r.piece.wall.a.x, r.piece.wall.b.x), Math.max(r.piece.wall.a.x, r.piece.wall.b.x)];
    expect((plan.rises ?? []).map(r => [r.rise.lo, r.rise.hi, ...wallSpan(r)])).toEqual([[100, 900, 0, 300]]);
    const b = await build(f);
    expect(invariantViolations(b, {genus: 0, cheeks: 0})).toEqual([]);
    expect(b.shell.report.conflicts).toEqual([]);
    const front = b.shell.faces.filter(x => x.tag.kind === 'Gable' && Math.abs(x.normal[1] + 1) < 1e-9).map(x => x.id);
    const cells = b.shell.cells.filter(c => front.includes(c.face));
    const west = cells.filter(c => c.polygon.every(p => p[0] <= 300 + 1e-6)), east = cells.filter(c => c.polygon.every(p => p[0] >= 700 - 1e-6));
    expect(west.length).toBeGreaterThan(0);
    expect(east.length).toBeGreaterThan(0);
    expect([...new Set(cells.map(c => JSON.stringify(c.source)))]).toEqual([JSON.stringify({ringModelIndex: 0, side: 0})]);
  });

  // Decision 222, L2: band ends are compared within the same 1e-9 as the overlap filter and `algorithmBSpan`. Mutation:
  // exact comparison; then bands meeting 1e-12 apart no longer tile.
  it('band ends compare within 1e-9, so an off-lattice run end tiles the span', () => {
    const band = (lo: number, hi: number, deg: number): GableRise => ({lo, hi, deg, limit: 'ridgeSlope'});
    expect(algorithmBBuildsGable([band(0.1, 333.4 + 1e-12, 30), band(333.4, 1000.7, 45)], [0.1 + 1e-12, 1000.7])).toBe(true);
    expect(algorithmBBuildsGable([band(0.1, 333.4, 30), band(333.4 + 1e-6, 1000.7, 45)], [0.1, 1000.7])).toBe(false);
    // Off the lattice end to end: corners at 0.1 and 1000.7, the pitches split at 333.3 along the side, a wing burying
    // [400.1, 600.1]; the extent stays algorithm B's one gable.
    const f = shellFixture('OffLatticeSplit', [ring([0.1, 0, 1000.7, 500], 0, 1, 30, {S: {form: 'gable', runs: [{from: 0, to: 333.3, form: 'gable', deg: 30}, {from: 333.3, to: 1000.6, form: 'gable', deg: 45}]}}), ring([400.1, -300, 600.1, 0], 0, 1, 30)]);
    const onLine = storeyForms(storeyRings(f, 0)).walls.filter(w => w.axis === 'y' && w.at === 0 && w.n === '+y');
    expect(onLine.map(w => [w.form, w.rises])).toEqual([['gable', undefined], ['gable', undefined]]);
  });

  // Decision 222: bands that differ only in maxHeight are one gable to algorithm B, as a single band's maxHeight is.
  it('bands differing only in maxHeight keep algorithm B\'s one gable', () => {
    const f = shellFixture('MaxHeightSplit', [ring([0, 0, 1000, 500], 0, 1, 30, {S: {form: 'gable', deg: 45, runs: [{from: 0, to: 500, form: 'gable', deg: 45, maxHeight: 200}]}})]);
    const rings = storeyRings(f, 0);
    expect(claimedBands(rings, {axis: 'y', at: 0, n: '+y'}).map(r => [r.lo, r.hi, r.maxHeight])).toEqual([[0, 500, 200], [500, 1000, undefined]]);
    expect(storeyForms(rings).walls.filter(w => w.axis === 'y' && w.at === 0).map(w => [w.form, w.deg, w.rises])).toEqual([['gable', 45, undefined]]);
  });
});

// ---- The copy of algorithm B's extentOf, tied to algorithm B over the corpus ------------------------------------------

describe('journal decision 220: rise.ts\'s copy of extentOf is algorithm B\'s', () => {
  // Every whole-line gable piece algorithm B builds on the per-extent walls (before decision 220 turns any wall into a
  // rise) spans exactly what the copy gives for its wall. Convicted by one mutation: the copy without its forward loop
  // fails here. The corpus holds footprints off the 50 cm lattice (journal decision 222, L3): the random Rings on a
  // 10 cm lattice, the courtyards shifted by (0.3, 0.7) cm, and the nudges and gaps at k/1024 cm.
  it('agrees with every whole-line piece algorithm B builds, over the roster, the rise fixtures, the random courtyards, split courtyards and U shapes, and footprints off the lattice', () => {
    const shifted = (f: ShellFixture): ShellFixture => ({...f, name: `${f.name}+0.3,0.7`, rings: f.rings.map(r => ({...r, rect: [r.rect[0] + 0.3, r.rect[1] + 0.7, r.rect[2] + 0.3, r.rect[3] + 0.7]}))});
    const fixtures = [...EXPORTED_FIXTURES, ...RISE_FIXTURES, ...[1, 2].flatMap(s => [250, 300].flatMap(h => [
      ...randomCourtyardFixtures(s, 40, h), ...randomSplitCourtyardFixtures(s, 40, h), ...randomUFixtures(s, 40, h)])),
    ...[1, 2, 3, 4].flatMap(s => randomFixtures(s, 140, 300)), ...randomCourtyardFixtures(1, 40, 300).map(shifted), ...randomSplitCourtyardFixtures(1, 40, 300).map(shifted),
    ...nudgeFixtures(), ...[1, 3, 5, 8, 12].flatMap(k => (['Aligned', 'Offset'] as const).map(kind => gapFixture(kind, k)))];
    let offLattice = 0;
    let pieces = 0, wider = 0;
    for (const f of fixtures) for (const n of storeysOf(f)) {
      const rings = storeyRings(f, n);
      const rects = rings.map(r => r.ring.rect);
      let b;
      try {
        const loops = storeyLoops(rects);
        b = buildingOf(rings, rects, loops, unionWallForms(rings, loops));
      } catch { continue; }
      let roof;
      try { roof = solveRoofParts(b, {far: 'plane'}); } catch { continue; }
      for (const p of roof.pieces.filter(q => q.label.includes(' whole ') && q.wall.form === 'gable')) {
        pieces++;
        const ext = extentOf(b, b.comps[p.wall.comp], p.wall);
        expect(ext, `${f.name} storey ${n} ${p.label}`).toEqual([p.bandLo, p.bandHi]);
        const span = p.wall.a.x === p.wall.b.x ? [Math.min(p.wall.a.y, p.wall.b.y), Math.max(p.wall.a.y, p.wall.b.y)] : [Math.min(p.wall.a.x, p.wall.b.x), Math.max(p.wall.a.x, p.wall.b.x)];
        if (ext[0] < span[0] || ext[1] > span[1]) wider++;
        if (ext.some(v => Math.abs(v - 50 * Math.round(v / 50)) > 1e-9)) offLattice++;
      }
    }
    expect(pieces).toBeGreaterThan(1000);
    expect(wider).toBeGreaterThan(100);
    expect(offLattice).toBeGreaterThan(100);
  });
});

// ---- Decisions 12, 14 and 17, and the limit's refusal -------------------------------------------------------------

describe('decisions 12, 14 and 17', () => {
  it('decision 12: a rise whose lowest cap is at or below its plate builds no piece', () => {
    const f = shellFixture('CappedAtPlate', [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: [{from: 400, to: 600, form: 'gable', deg: 60, maxHeight: 0}]}})]);
    expect(planStorey(f, 0).rises).toEqual([]);
  });

  it("decision 14: a rise's Gable Cells name the Ring and side that win its extent", async () => {
    expect(southGables(await build(fixtureByName('FlushRingConflict')))[0].sources).toEqual([{ringModelIndex: 1, side: 0}]);
    expect(southGables(await build(fixtureByName('FlushRingConflictSwapped')))[0].sources).toEqual([{ringModelIndex: 0, side: 0}]);
    expect(southGables(await build(rise('FlushTSwapped')))[0].sources).toEqual([{ringModelIndex: 0, side: 0}]);
    // One rise merged across two Rings' runs (decision 6): each Ring's stretch names its own side.
    const b = await build(rise('CourtyardRiseAlongCut'));
    const west = b.shell.faces.filter(f => f.tag.kind === 'Gable' && Math.abs(f.normal[0] + 1) < 1e-9);
    expect(west.map(f => f.sources)).toEqual([[{ringModelIndex: 0, side: 3}, {ringModelIndex: 2, side: 3}]]);
  });

  it('decision 17: a document that builds a rise is not replayable; FlushT, whose hip wins, is', () => {
    for (const f of RISE_FIXTURES) {
      const r = cppReplayability(f);
      if (f.name === 'FlushT') { expect(r).toEqual({cppReplayable: true}); continue; }
      expect(r.cppReplayable, f.name).toBe(false);
      if (!r.cppReplayable) expect(r.reasons, f.name).toContain(BUILDS_A_RISE);
    }
    const runs = cppReplayability(rise('MidWallRise'));
    expect(!runs.cppReplayable && runs.reasons).toEqual([NOT_ONE_WHOLE_RUN, BUILDS_A_RISE]);
  });

  // Journal decisions 222 (L1) and 224: each branch of buildsARise.
  it('decision 17: buildsARise falls back to the per-extent derivation on a PlanRefusal', () => {
    const refused = (): never => { throw new PlanRefusal('refused for the test'); };
    // The fallback reads MidWallRise's rise from its per-extent walls, and SingleStoreyT's none.
    expect(buildsARise(rise('MidWallRise'), refused)).toBe(true);
    expect(buildsARise(fixtureByName('SingleStoreyT'), refused)).toBe(false);
    // A corner-only pinch is refused by both derivations (journal decision 146): no rise.
    expect(buildsARise(shellFixture('CornerPinch', [ring([0, 0, 100, 100], 0, 1, 45), ring([100, 100, 200, 200], 0, 1, 45)]))).toBe(false);
  });

  // Mutation: every error caught (read as no rise, or sent to the fallback); then this error no longer propagates.
  it('decision 17: buildsARise lets an error that is no refusal through, so the export breaks loudly', () => {
    expect(() => buildsARise(rise('MidWallRise'), () => { throw new Error('a claimed-band throw site'); })).toThrow('a claimed-band throw site');
  });

  // Journal decision 231, replacing decision 206's refusal: a rise that no reading of ridgeSlope limits has no slope
  // limit. This reaches it by giving the walk no roof at all; RiseFacingGabledWall reaches it through production.
  // Mutation: the refusal restored; then this throws, and RiseFacingGabledWall's plan is refused.
  it('ridgeSlope gives no slope limit, never a refusal, where no reading finds a falling face', () => {
    const plan = planStorey(rise('MidWallRise'), 0);
    const [r] = plan.rises ?? [];
    const bare = {...plan, roof: {...plan.roof, faces: [], pieces: []}};
    expect(ridgeSlope({plan: bare, wall: r.piece.wall, comp: plan.building.comps[0], rise: r.rise, gables: []})).toBeUndefined();
  });
});

// ---- Journal decision 231: a slope that is not in the finished building does not limit a gable ---------------------

describe('journal decision 231: a slope not in the finished building does not limit a rise', () => {
  /** The storey wall on the line `axis = at`, facing `inward`, holding the point `s` along it. */
  const wallAt = (plan: ReturnType<typeof planStorey>, axis: 'x' | 'y', at: number, inward: -1 | 1, s: number) => {
    const w = plan.building.walls.find(o => (axis === 'y'
      ? o.a.y === at && o.b.y === at && Math.sign(o.n.y) === inward && Math.min(o.a.x, o.b.x) <= s && s <= Math.max(o.a.x, o.b.x)
      : o.a.x === at && o.b.x === at && Math.sign(o.n.x) === inward && Math.min(o.a.y, o.b.y) <= s && s <= Math.max(o.a.y, o.b.y)));
    if (!w) throw new Error(`no wall on ${axis} = ${at} at ${s}`);
    return w;
  };

  // The predicate reads how the storey is planned: a wall the solve takes as a gable and algorithm B builds whole.
  // Mutation (the predicate says no wall carrying a rise is built): fails here, and on RiseBeforeTStemBarRisen's row
  // above. Where a wall's rise stands over the walk line, journal decision 243's rule 1 passes over its slope instead.
  it('the predicate: a wall algorithm B builds as a gable has no hip slope in the building; a hip, a rise\'s wall and a cut have theirs', () => {
    const gabled = planStorey(rise('RiseFacingGabledWall'), 0);
    expect(slopeInBuilding(gabled, wallAt(gabled, 'y', 500, -1, 500))).toBe(false);
    expect(slopeInBuilding(gabled, wallAt(gabled, 'y', 0, 1, 500))).toBe(true);
    expect(slopeInBuilding(gabled, wallAt(gabled, 'x', 1000, -1, 250))).toBe(true);
    // A wall carrying a rise on part of its length is a hip in the solve, and keeps its slope.
    const risen = planStorey(rise('RiseFacingRiseWall'), 0);
    expect(slopeInBuilding(risen, wallAt(risen, 'y', 500, -1, 500))).toBe(true);
    // SingleStoreyT's E gable end: two walls, the stem burying the middle, one algorithm B piece over [0, 500]. Both walls
    // are gabled along their whole length.
    const t = planStorey(fixtureByName('SingleStoreyT'), 0);
    expect([wallAt(t, 'x', 1000, -1, 100), wallAt(t, 'x', 1000, -1, 400)].map(w => slopeInBuilding(t, w))).toEqual([false, false]);
    // A wall gabled along its whole length that journal decision 220 turns into a rise over that length enters the
    // solve as a hip, and keeps its slope: GableBesideHipSouthWing's y = 0 wall over [600, 1200].
    const wing = planStorey(rise('GableBesideHipSouthWing'), 0);
    expect(slopeInBuilding(wing, wallAt(wing, 'y', 0, 1, 900))).toBe(true);
    // A courtyard's cut is no gable: its two sides keep their slope, the collinear hole wall's.
    const court = planStorey(rise('CourtyardRiseFacingCut'), 0);
    const cuts = court.building.walls.filter(w => w.form === 'cut');
    expect(cuts).toHaveLength(2);
    expect(cuts.map(w => slopeInBuilding(court, w))).toEqual([true, true]);
  });

  // Mutation: the predicate removed (every slope built); then the walk takes the gabled N wall's 30° skeleton plane and
  // the rise's front is truncated at 282.9 (the fixture's INDEPENDENT row fails too).
  it('RiseFacingGabledWall: the walk passes over the gabled wall\'s face, the built roof offers no falling face, and the rise is its two rakes alone', () => {
    const plan = planStorey(rise('RiseFacingGabledWall'), 0);
    const [r] = plan.rises ?? [];
    const ctx = limitContextOf(rise('RiseFacingGabledWall'), plan, r);
    const north = wallAt(plan, 'y', 500, -1, 500);
    expect(hipRoofReading(ctx)).toBeUndefined();
    expect(builtRoofReading(ctx)).toBeUndefined();
    // With every slope counted as built and neither of decision 243's rules, the walk is the one before decision 231, and
    // it takes the N wall's plane.
    expect(ridgeSlopeReadings({slopeIn: () => true, gableOver: () => false, end: () => undefined}).map(reading => reading(ctx))).toEqual([north.plane, undefined]);
    expect(r.limitPlane).toBeUndefined();
    expect(r.cap).toBeUndefined();
    expect(r.piece.planes.map(id => plan.building.planes[id].label)).toEqual(['rake from 300 on y=0 x[0,1000]', 'rake from 700 on y=0 x[0,1000]']);
  });

  // Journal decision 233: a rise with no slope limit runs to the far wall, and where it stands above the far gable it
  // shows there as a second gable. F70's case: the N gable's apex is 500 t(45) = 500, the rise's 200 t(75) = 746.4, so
  // the one Gable face on y = 500 peaks at 746.4 over x = 500. Before decision 231 the far skeleton plane truncated the
  // rise at 500 and the N gable kept its own apex.
  it('RiseRunsToFarGable: the ridge reaches the N wall at its full height, a second gable on that wall, and the build is clean', async () => {
    const b = await build(rise('RiseRunsToFarGable'));
    expect(invariantViolations(b, {genus: 0, cheeks: 0})).toEqual([]);
    expect(b.shell.report.conflicts).toEqual([]);
    const north = b.shell.faces.filter(f => f.tag.kind === 'Gable' && Math.abs(f.normal[1] - 1) < 1e-9 && f.loops[0].every(p => Math.abs(p[1] - 500) < 1e-6));
    expect(north).toHaveLength(1);
    const top = north[0].loops[0].reduce((m, p) => (p[2] > m[2] ? p : m));
    expect(top[0]).toBeCloseTo(500, 2);
    expect(top[2]).toBeCloseTo(250 + t(75) * 200, 2);
    // Either side of the rise the face is the N gable's own: 250 + 200 at x = 200.
    expect(intervalTop(b.union, 200.013, 499.917, 250.5)).toBeCloseTo(250 + 200, 1);
  });
});

// ---- Journal decision 243 (F80): opposite gables, and a gable stretch wholly under an abutting Ring -------------------

describe('journal decision 243: a gable over the walk line replaces its slope, the rise runs to it, and a covered stretch is built', () => {
  /** The built top at `(x, y)`, read off the mesh just off the lattice, above the plate. */
  const topAt = (b: ShellBuild, x: number, y: number): number | null => intervalTop(b.union, x + 0.013, y + 0.017, 250.5);
  /** The Gable faces on the line `y = at`, facing `outward` in y: their span in x, apex height and Cells' sources. */
  const gablesOnY = (b: ShellBuild, at: number, outward: -1 | 1) => b.shell.faces
    .filter(f => f.tag.kind === 'Gable' && Math.abs(f.normal[1] - outward) < 1e-9 && f.loops[0].every(p => Math.abs(p[1] - at) < 1e-6))
    .map(f => ({lo: Math.min(...f.loops[0].map(p => p[0])), hi: Math.max(...f.loops[0].map(p => p[0])), apex: Math.max(...f.loops[0].map(p => p[2])), sources: f.sources}));

  // Rules 1 and 2. The user's draft 4: the ridge continues cleanly from the S gable to the N gable, 125 t(75) = 466.5 above
  // the plate at the S wall, at mid-depth and at the N wall. Mutation (rule 1 removed: `gableOverWalk` always false): each
  // rise is limited by the slope the other replaces, and the ridge dips to the crossbar's 346.4 at mid-depth.
  it.each([['OppositeGablesT75', 75], ['OppositeGablesT65', 65]] as const)('%s: the ridge stands 125 tan %i° above the plate from the S wall to the N wall', async (name, deg) => {
    const b = await build(rise(name));
    for (const y of [0.5, 100, 200, 300, 399.5]) expect(topAt(b, 525, y), `y = ${y}`).toBeCloseTo(250 + t(deg) * 125, 1);
    const [south] = gablesOnY(b, 0, -1), [north] = gablesOnY(b, 400, 1);
    expect([south.lo, south.hi, north.lo, north.hi]).toEqual([400, 650, 400, 650]);
    expect(south.apex).toBeCloseTo(250 + t(deg) * 125, 2);
    expect(north.apex).toBeCloseTo(250 + t(deg) * 125, 2);
  });

  // Rules 2 and 3. The user's draft 5 as the lead built it: the N stretch over [400, 600] lies wholly on the stem's S side,
  // on no union wall. Both gables are built and match: 100 t(75) above the plate at x = 500, from y = 0 to y = 400.
  // Mutation (rule 3 removed: `coveredBands` returns none): the N gable is not built, the S rise is limited by the N slope,
  // and there is no Gable on y = 400 over [400, 600].
  it('OppositeGablesTCovered: both gables are built and match, the N one standing on the bar\'s N wall [0, 400] and naming the bar\'s N side', async () => {
    const f = rise('OppositeGablesTCovered');
    const forms = storeyForms(storeyRings(f, 0));
    expect(forms.covered.map(c => [c.line, c.rise.lo, c.rise.hi, c.rise.deg])).toEqual([[{axis: 'y', at: 400, n: '-y'}, 400, 600, 75]]);
    const plan = planStorey(f, 0);
    const wallOf = (r: RisePiece): number[] => [r.piece.wall.a.y, Math.min(r.piece.wall.a.x, r.piece.wall.b.x), Math.max(r.piece.wall.a.x, r.piece.wall.b.x)];
    expect((plan.rises ?? []).map(wallOf)).toEqual([[0, 0, 1000], [400, 0, 400]]);
    const b = await build(f);
    const [south] = gablesOnY(b, 0, -1), [north] = gablesOnY(b, 400, 1);
    expect([south.lo, south.hi, north.lo, north.hi]).toEqual([400, 600, 400, 600]);
    expect(south.apex).toBeCloseTo(250 + t(75) * 100, 2);
    expect(north.apex).toBeCloseTo(250 + t(75) * 100, 2);
    for (const y of [0.5, 200, 399.5]) expect(topAt(b, 500, y), `y = ${y}`).toBeCloseTo(250 + t(75) * 100, 1);
    // Decision 14: the covered gable's Cells name the Ring and side that claim it, the bar's N side.
    expect(north.sources).toEqual([{ringModelIndex: 0, side: 2}]);
  });

  // Rule 2. The S rise's far wall by algorithm B's piece rule is the stem's end (y = 1000), the first wall facing back
  // that its band overlaps; it ends at the N gable's line instead, and the walk reads nothing beyond it. Mutation (rule 2
  // removed: `gableEnd` finds no end): the walk goes on into the stem and takes its end slope, the S rise runs to y = 1000,
  // and it stands above the stem's 100 cm ridge at y = 700.
  it('OppositeGablesTCovered: the S rise ends at the N gable\'s wall, and the stem beyond it keeps its own ridge', async () => {
    const plan = planStorey(rise('OppositeGablesTCovered'), 0);
    expect((plan.rises ?? []).map(r => r.piece.farDist)).toEqual([400, 400]);
    const b = await build(rise('OppositeGablesTCovered'));
    for (const y of [450, 700]) expect(topAt(b, 500, y), `y = ${y}`).toBeCloseTo(250 + 100, 1);
  });

  // Journal decision 244: a covered band on a line that holds no union wall. It stands on a wall made for it (`NO_WALL`),
  // its Gable face on x = 500 facing +x peaks at 150 t(60) over y = 250, and its Cells name Ring 0's E side, the side
  // that claims the band (gable rise decision 14). Mutation (provenance reads union walls only): the build throws, a Gable
  // Cell lying on no Ring side.
  it('GableOnSharedWall: a gable on the shared wall between two Rings, above both roofs, naming the side that claims it', async () => {
    const plan = planStorey(rise('GableOnSharedWall'), 0);
    expect((plan.rises ?? []).map(r => [r.piece.wall.id, r.piece.wall.plane, r.rise.lo, r.rise.hi])).toEqual([[NO_WALL, NO_WALL, 100, 400]]);
    const b = await build(rise('GableOnSharedWall'));
    const front = b.shell.faces.filter(f => f.tag.kind === 'Gable' && Math.abs(f.normal[0] - 1) < 1e-9 && f.loops[0].every(p => Math.abs(p[0] - 500) < 1e-6));
    expect(front).toHaveLength(1);
    const top = front[0].loops[0].reduce((m, p) => (p[2] > m[2] ? p : m));
    expect(top[1]).toBeCloseTo(250, 2);
    expect(top[2]).toBeCloseTo(250 + t(60) * 150, 2);
    expect(front[0].sources).toEqual([{ringModelIndex: 0, side: 1}]);
    // Either side of the shared wall the roofs are the 30° hips: 250 t(30) at the main ridge.
    expect(topAt(b, 700, 250)).toBeCloseTo(250 + t(30) * 250, 1);
  });

  // Opposite gables of different pitch: neither limits the other, so the taller 75° S rise runs to the N wall and shows
  // there above the 60° N gable (as RiseRunsToFarGable shows above its far gable). Expected, not a defect.
  it('OppositeGablesTUnequal: the taller rise runs to the opposite wall and shows above the lower gable', async () => {
    const b = await build(rise('OppositeGablesTUnequal'));
    for (const y of [0.5, 200, 399.5]) expect(topAt(b, 525, y), `y = ${y}`).toBeCloseTo(250 + t(75) * 125, 1);
    const [north] = gablesOnY(b, 400, 1);
    expect(north.apex).toBeCloseTo(250 + t(75) * 125, 2);
  });

  // Rule 1 is decided on the walk line. The S walk line (x = 525) lies under the N gable over [450, 900], so the S rise
  // runs at full height to the N wall. The N walk line (x = 675) does not lie under the S gable over [400, 650], so the
  // S wall's slope limits the N rise: at (800, 100) the 75° N rakes' 373.2 is cut to that slope's 100 t(60) = 173.2.
  it('OppositeGablesTPartFacing: the rise whose walk line is under the opposite gable runs through; the other is limited', async () => {
    const b = await build(rise('OppositeGablesTPartFacing'));
    expect(topAt(b, 525, 399.5)).toBeCloseTo(250 + t(75) * 125, 1);
    expect(topAt(b, 800, 100)).toBeCloseTo(250 + t(60) * 100, 1);
    expect(topAt(b, 800, 300)).toBeCloseTo(250 + t(75) * 100, 1);
  });

  // Rule 3 on algorithm B's extent: a band counts where it overlaps the extent's span, on a union wall or not. Ring 0's E
  // gable end at 30° has a 45° stretch over its buried middle [150, 350]. Its bands [0, 150], [150, 350] and [350, 500]
  // tile algorithm B's span [0, 500], so the extent stays algorithm B's one gable (decision 220's sub-rule), and no band is
  // a covered rise. Mutation (bands count only where they overlap one of the extent's walls): the two walls become hips
  // with a rise each, and the middle band a covered rise.
  it('a covered band inside algorithm B\'s span counts on it, and the extent stays algorithm B\'s one gable', () => {
    const f = shellFixture('BuriedTwoPitchEnd', [
      ring([0, 0, 500, 500], 0, 1, 30, {E: {form: 'gable', deg: 30, runs: [{from: 150, to: 350, form: 'gable', deg: 45}]}}),
      ring([500, 150, 800, 350], 0, 1, 30),
    ]);
    const forms = storeyForms(storeyRings(f, 0));
    const east = forms.walls.filter(w => w.axis === 'x' && w.at === 500 && w.n === '-x');
    expect(east.map(w => [w.lo, w.hi, w.form, w.rises])).toEqual([[0, 150, 'gable', undefined], [350, 500, 'gable', undefined]]);
    expect(forms.covered).toEqual([]);
  });

  // The rules read bands, not heights, so no rise's limit or reach depends on another's height: every gable the storey
  // builds is fixed by `claimedWalls` before any rise is planned. A band its own maxHeight holds at the plate builds
  // nothing, so it replaces no slope.
  it('the storey\'s gables come from bands alone; a band capped at its plate is none of them', () => {
    const f = rise('OppositeGablesT75');
    const plan = planStorey(f, 0);
    const forms = storeyForms(storeyRings(f, 0));
    expect(storeyGables(plan, storeyRises(forms.walls, forms.covered)).map(g => [g.axis, g.at, g.n, g.lo, g.hi])).toEqual([['y', 0, '+y', 400, 650], ['y', 400, '-y', 400, 650]]);
    const capped = storeyRises(forms.walls, forms.covered).map(r => (r.line.at === 400 ? {...r, rise: {...r.rise, maxHeight: 0}} : r));
    expect(storeyGables(plan, capped).map(g => g.at)).toEqual([0]);
  });
});

// ---- The wire (decisions 1, 15 and 16) -----------------------------------------------------------------------------

describe('the wire carries runs (decisions 1, 15 and 16)', () => {
  const read = (f: ShellFixture): ShellFixture => {
    const r = readInput(JSON.parse(JSON.stringify(writeInput(f))), f.name);
    if (!r.ok) throw new Error(r.errors.join('; '));
    return r.fixture;
  };
  const inMemory = (f: ShellFixture): boolean => f.rings.some(r => RING_SIDES.some(s => r.sides?.[s]?.runs?.some(x => x.maxHeight !== undefined || x.limit !== undefined)));

  it.each(RISE_FIXTURES.filter(f => !inMemory(f)).map(f => [f.name] as const))('%s: reads back through input@1 to the same shell', async name => {
    expect(signature(await buildShellDetailed(read(rise(name))))).toBe(signature(await build(rise(name))));
  });

  // Journal decisions 209 (L2) and 211: the in-memory run check and readInput agree on runs, their geometry and their hip
  // pitches, so writeInput never writes runs readInput refuses. Every list of up to two runs from these spans, each a
  // gable, a hip at the side's 45° or a hip at 30°, on a 1000 cm side hipped at 45°, then on one gabled at 20°.
  it('refuses in memory exactly the runs readInput refuses on the wire, for geometry and for hip pitch', () => {
    const spans = [[-100, 100], [0, 200], [200, 200], [300, 500], [400, 600], [600, 1000], [900, 1100], [0, 1000]] as const;
    const kinds = [{form: 'gable'}, {form: 'hip'}, {form: 'hip', deg: 30}] as const;
    const runs = spans.flatMap(([from, to]) => kinds.map(k => ({from, to, ...k})));
    const lists = [...runs.map(r => [r]), ...runs.flatMap(a => runs.map(b => [a, b]))];
    for (const [sideForm, list] of (['hip', 'gable'] as const).flatMap(form => lists.map(l => [form, l] as const))) {
      const side = sideForm === 'hip' ? {form: sideForm, runs: [...list]} : {form: sideForm, deg: 20, runs: [...list]};
      const f = shellFixture('RunGeometry', [ring([0, 0, 1000, 500], 0, 1, 45, {S: side})]);
      const rings = storeyRings(f, 0);
      let inMemory = true;
      try { unionWallForms(rings, storeyLoops(rings.map(r => r.ring.rect))); } catch (e) { if (!(e instanceof PlanRefusal)) throw e; inMemory = false; }
      const wire = readInput(JSON.parse(JSON.stringify(writeInput(f))), f.name).ok;
      expect(wire, JSON.stringify(list)).toBe(inMemory);
    }
  });

  // Decision 11 and 12: `maxHeight` and `limit` are in memory only, so input@1 does not carry them.
  it("FlatTopRise: its maxHeight does not survive input@1, so the shell read back is the uncapped rise's", async () => {
    const back = read(rise('FlatTopRise'));
    expect(back.rings[0].sides?.S?.runs).toEqual([{from: 300, to: 700, form: 'gable', deg: 60}]);
    expect(signature(await buildShellDetailed(back))).not.toBe(signature(await build(rise('FlatTopRise'))));
  });
});
