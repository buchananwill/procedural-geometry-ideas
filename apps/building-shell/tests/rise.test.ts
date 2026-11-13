// Gable rise decisions 1 to 21 (journal decisions 204 to 206, WP-G2): every rise fixture keeps spec 32's invariants
// (decision 20) and its height function (decision 19); the gates of decision 21 and of the provisional defaults of
// journal decision 204, each convicted by mutation; Cell provenance (decision 14); the wire (decisions 15 to 17); and
// F69's conflict, pinned as the re-tag pass reports it today.
import {describe, expect, it} from 'vitest';
import {PlanRefusal} from '../src/errors.ts';
import {EXPORTED_FIXTURES, RING_SIDES, RISE_FIXTURES, ShellFixture, fixtureByName, ring, storeyRings} from '../src/fixture.ts';
import {BUILDS_A_RISE, NOT_ONE_WHOLE_RUN, cppReplayability} from '../src/golden.ts';
import {getManifold} from '../src/manifold.ts';
import {ringSideLines, storeyLoops, unionWallForms} from '../src/ring-forms.ts';
import {FLOOR_CAP_GAP_CM, builtRoofReading, hipRoofReading, ridgeSlope, risePieces} from '../src/rise.ts';
import {ShellBuild, buildShellDetailed, buildShellFromUnion} from '../src/shell.ts';
import {planStorey} from '../src/storey.ts';
import {unionPlans} from '../src/union.ts';
import {WIRE_FORMS, readInput, writeInput} from '../src/wire/input-adapter.ts';
import type {BuildingShellInputV1} from '../src/wire/input-types.ts';
import {RISE_ORACLE_TOL_CM, intervalTop, riseBreakthrough, riseOracle} from './rise-oracle.ts';
import {componentGenera, invariantViolations} from './shell-invariants.ts';
import {memoBuilds, shellFixture} from './test-builds.ts';

const build = memoBuilds();
const rise = (name: string): ShellFixture => {
  const f = RISE_FIXTURES.find(x => x.name === name);
  if (!f) throw new Error(`no rise fixture ${name}`);
  return f;
};

/** Every rise fixture's genus: the courtyards close their hole. */
const genusOf = (name: string): number => (name.startsWith('Courtyard') ? 1 : 0);

/** How many rises each fixture builds: FlushT none (its crossbar's hip wins), AdjacentRises two, every other one. */
const RISES: Record<string, number> = {FlushT: 0, AdjacentRises: 2};

/**
 * F69 (journal decision 203, WP-G2's brief): the re-tag pass reports a coplanar Wall over a Gable only where an output
 * triangle's centroid lands in the overlap. A rise's front under a flush upper wall gives one. Pinned as it is today,
 * text for text; it is a property of the re-tag pass, not of rises, and is not fixed here.
 */
const F69_CONFLICTS: Record<string, string[]> = {
  BuriedRise: ['BuriedRise: n=(0.000000, -1.000000, 0.000000) d=0.000: Wall storey 1 wall 0 (part 3) over Gable storey 0 wall 0 (part 2)'],
  StoreyRingConflictSwapped: ['StoreyRingConflictSwapped: n=(0.000000, -1.000000, 0.000000) d=0.000: Wall storey 1 wall 0 (part 3) over Gable storey 0 wall 0 (part 2)'],
};

/** A shell's structure: faces by kind, plane and area (0.1 cm²), Edge kinds, Cell count. */
function signature(b: ShellBuild): string {
  const faces = b.shell.faces.map(f => `${f.tag.kind}|${f.normal.map(v => v.toFixed(5)).join(',')}|${f.offset.toFixed(3)}|${f.area.toFixed(1)}`).sort();
  return JSON.stringify({faces, edges: b.shell.edges.map(e => e.kind).sort(), cells: b.shell.cells.length});
}

/** The Gable faces standing on `y = 0`, facing -y, with their apex height and their Cells' sources. */
const southGables = (b: ShellBuild) => b.shell.faces.filter(f => f.tag.kind === 'Gable' && Math.abs(f.normal[1] + 1) < 1e-9)
  .map(f => ({apex: Math.max(...f.loops[0].map(p => p[2])), lo: Math.min(...f.loops[0].map(p => p[0])), hi: Math.max(...f.loops[0].map(p => p[0])), sources: f.sources}));

describe.each(RISE_FIXTURES.map(f => [f.name] as const))('%s', name => {
  it("keeps spec decision 32's invariants, with no Cheek and its pinned conflicts only (decision 20)", async () => {
    const b = await build(rise(name));
    expect(invariantViolations(b, {genus: genusOf(name), cheeks: 0})).toEqual([]);
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
const INDEPENDENT: Record<string, {limit?: ['x' | 'y', number, -1 | 1]; at: [number, number]; z: number}> = {
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
};

describe('journal decision 209, M1: each rise fixture against hand-named planes and hand-computed heights', () => {
  it('lists every rise fixture', () => {
    expect(Object.keys(INDEPENDENT).sort()).toEqual(RISE_FIXTURES.map(f => f.name).sort());
  });

  it.each(Object.entries(INDEPENDENT))('%s: its limit is the named wall\'s plane, and its top at the named point is the closed form', async (name, want) => {
    const plan = planStorey(rise(name), 0);
    if (want.limit) {
      const [axis, at, inward] = want.limit;
      for (const r of plan.rises ?? []) expect(r.limitPlane).toBe(planeOfWalls(plan, axis, at, inward));
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
    const comp = plan.building.comps[r.piece.wall.comp];
    expect(hipRoofReading({plan, wall: r.piece.wall, comp, rise: r.rise})).toBeUndefined();
    expect(builtRoofReading({plan, wall: r.piece.wall, comp, rise: r.rise})).toBe(r.limitPlane);
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

  // Journal decision 206 (interpretation 6): a rise that no reading of ridgeSlope limits is refused, never built
  // unlimited. No fixture reaches it; this reaches it by giving the walk no roof at all.
  it('ridgeSlope refuses, as a PlanRefusal, a rise no reading limits', () => {
    const plan = planStorey(rise('MidWallRise'), 0);
    const [r] = plan.rises ?? [];
    const bare = {...plan, roof: {...plan.roof, faces: [], pieces: []}};
    expect(() => ridgeSlope({plan: bare, wall: r.piece.wall, comp: plan.building.comps[0], rise: r.rise})).toThrow(PlanRefusal);
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

  // Journal decision 209, L2: the in-memory run check and readInput's run geometry agree, so writeInput never writes runs
  // readInput refuses for their geometry. Every list of up to two gable runs from these spans on a 1000 cm side.
  it('refuses in memory exactly the runs readInput refuses on the wire', () => {
    const spans = [[-100, 100], [0, 200], [200, 200], [300, 500], [400, 600], [600, 1000], [900, 1100]] as const;
    const lists = [...spans.map(s => [s]), ...spans.flatMap(a => spans.map(b => [a, b]))];
    for (const list of lists) {
      const f = shellFixture('RunGeometry', [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: list.map(([from, to]) => ({from, to, form: 'gable' as const}))}})]);
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
