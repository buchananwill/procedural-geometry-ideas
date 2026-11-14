// Spec decision 2 as amended (journal decisions 115, 132 and 135): a storey plan with a hole is roofed through a cut
// along a segment of a raw Ring wall. The cut's selection and pitch, its splice, the courtyard fixtures' assertions, the
// reviewers' courtyard probes, and the layouts the rule refuses.
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {freeCutPitch, selectCut, spliceCourtyard} from '../src/courtyard.ts';
import {errorMessage} from '../src/errors.ts';
import {COURTYARD_RECTS, FixtureRing, RingSides, ShellFixture, fixtureByName, ring, storeyRings} from '../src/fixture.ts';
import {UnionWall, tanDeg, unionWallForms} from '../src/ring-forms.ts';
import {runB} from '../src/roof/algoB.ts';
import {Pt, Rect, polyArea, pt, unionLoops} from '../src/roof/model.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {planStorey} from '../src/storey.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import type {Vec3} from '../src/tags.ts';
import {
  COURTYARD_JUT_WING, CUT_OVERSHOOT_PROBE, FULL_WINGS_PROBE, SPLIT_BAND_LAYOUTS, SplitBandLayout, jutWingFixture, jutWingRects, splitBandFixture, splitBandName,
} from './robustness-fixtures.ts';
import {MirrorAxis, mirrorDifferences, mirrorFixture} from './mirror-oracle.ts';
import {ClassedPinTable, pinnedOutcome, throwsOutcome} from './pin-table.ts';
import {CUT_OVERSHOOT_DEFECTS} from './residue-pins.ts';
import {ShellExpectation, invariantViolations, planHolds} from './shell-invariants.ts';
import {memoBuilds, shellFixture} from './test-builds.ts';

/** A storey plan's union loops, split into outer loops and holes. */
interface CourtyardLoops { outers: Pt[][]; holes: Pt[][] }

const courtyardLoops = (f: ShellFixture): CourtyardLoops => {
  const loops = unionLoops(storeyRings(f, 0).map(r => r.ring.rect));
  return {outers: loops.filter(l => polyArea(l) > 0), holes: loops.filter(l => polyArea(l) < 0)};
};

/** Storey 0's cut for a fixture's one hole, as spec decision 2 chooses it. */
const cutOf = (f: ShellFixture): ReturnType<typeof selectCut> => {
  const {outers, holes} = courtyardLoops(f);
  const rings = storeyRings(f, 0);
  return selectCut(rings, outers, holes[0], unionWallForms(rings, unionLoops(rings.map(r => r.ring.rect))));
};

const tol = SHELL_TOLERANCE_CM;

/** A one-storey layout at 250 cm storeys, every Ring at `deg` unless given its own Rings. */
const layout = (name: string, rings: FixtureRing[]): ShellFixture => shellFixture(name, rings);
const courtyard = (name: string, rects: Rect[], deg = 30): ShellFixture => layout(name, rects.map(r => ring(r, 0, 1, deg)));

/**
 * Journal decision 132: the corrected cut rule's layout. Wings at full depth with the bands between them: no whole raw
 * wall crosses the ring, but each band's inner side has a segment that does.
 */
const FULL_WINGS = FULL_WINGS_PROBE;

/** Each build, made once, on the first test that asks for it, so a crash fails that test alone. */
const build = memoBuilds();

describe('the cut (spec decision 2 as amended)', () => {
  it("runs along the S band's N side, y = 300 over x 0 to 300: of the 300 cm segments, the lowest x, then y, then Ring", () => {
    // The W wing's S side is the same segment; the S band's index, 0, beats the wing's, 2.
    expect(cutOf(fixtureByName('Courtyard'))).toEqual({a: pt(0, 300), b: pt(300, 300), ring: 0, side: 'N', outer: 0, deg: 30});
  });

  it('is what the storey Building is spliced through: two cut walls on it, every other wall hipped at 30 degrees', () => {
    const {building} = planStorey(fixtureByName('Courtyard'), 0);
    expect(building.comps).toHaveLength(1);
    const [comp] = building.comps;
    expect(comp.holes).toHaveLength(1);
    const cuts = comp.walls.filter(w => w.form === 'cut');
    expect(cuts.map(w => [w.a, w.b])).toEqual([[pt(0, 300), pt(300, 300)], [pt(300, 300), pt(0, 300)]]);
    for (const w of comp.walls) {
      if (w.form !== 'cut') expect(w.form).toBe('hip');
      expect(Math.abs(w.tan - Math.tan(Math.PI / 6))).toBeLessThan(1e-12);
    }
  });

  it("splices like roof-gable's buildCourtyard at slit 0: A, the outer loop, A, B, the hole's loop, B", () => {
    const outer = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];
    const hole = [pt(4, 4), pt(4, 6), pt(6, 6), pt(6, 4)];
    const {ring: r, cutWalls} = spliceCourtyard(outer, hole, {a: pt(10, 0), b: pt(6, 4), ring: 0, side: 'S', outer: 0, deg: 30});
    expect(r).toEqual([pt(10, 0), pt(10, 10), pt(0, 10), pt(0, 0), pt(10, 0), pt(6, 4), pt(4, 4), pt(4, 6), pt(6, 6), pt(6, 4)]);
    expect(cutWalls).toEqual([4, 9]);
  });

  // No whole raw wall of FullWingsProbe crosses the ring, so decision 115's whole-wall rule refused it.
  it("FullWingsProbe (journal decision 132): cut along a segment of the S band's 1000 cm N side, from the outer loop to the hole's corner", () => {
    expect(cutOf(FULL_WINGS)).toEqual({a: pt(0, 300), b: pt(300, 300), ring: 0, side: 'N', outer: 0, deg: 30});
  });
});

describe('the cut\'s pitch (spec decision 2 as amended, journal decision 135, F1)', () => {
  const C = COURTYARD_RECTS;
  const rings = (degs: number[], sides: RingSides[] = []): FixtureRing[] => C.map((r, i) => ring(r, 0, 1, degs[i], sides[i]));
  // The correctness reviewer's reproducers (probes/zz-court2.test.ts). The cut, y = 300 over x 0 to 300, is collinear
  // at (300, 300) with the hole's S wall, the S band's N side.
  it.each([
    ['CutWing50', rings([30, 30, 50, 30]), 30],
    ['Bands50', rings([50, 50, 30, 30]), 50],
    ['HoleSide45', rings([30, 30, 30, 30], [{N: {form: 'hip', deg: 45}}]), 45],
    ['HoleSideGabled', rings([30, 30, 30, 30], [{N: {form: 'gable'}}]), 30],
    ['OtherWing50', rings([30, 30, 30, 50]), 30],
    // Journal decision 141: every side pitched, S 30, E 35, N 40, W 45. The cut runs along the S band's N side, and is
    // collinear at the hole's corner with that side, 40 degrees.
    ['CourtyardMixedPitch', rings([30, 30, 30, 30], [0, 1, 2, 3].map(() => ({S: {form: 'hip', deg: 30}, E: {form: 'hip', deg: 35}, N: {form: 'hip', deg: 40}, W: {form: 'hip', deg: 45}}))), 40],
  ] as const)('%s: the cut takes the hole wall\'s derived pitch, %i degrees, and the building keeps every invariant', async (name, rs, deg) => {
    const f = layout(name, [...rs]);
    const cut = cutOf(f);
    expect(cut?.deg).toBe(deg);
    for (const w of planStorey(f, 0).building.walls.filter(x => x.form === 'cut')) expect(Math.abs(w.tan - tanDeg(deg))).toBeLessThan(1e-12);
    expect(invariantViolations(await build(f), {genus: 1, cheeks: 0})).toEqual([]);
  });
});

describe('a cut collinear with no wall (spec decision 2 as amended, journal decisions 143, 150, 151 and 153)', () => {
  const wall = (form: 'hip' | 'gable', deg: number): UnionWall => ({axis: 'y', at: 0, n: '+y', lo: 0, hi: 100, form, deg});

  it("takes the steepest derived pitch among all its island's walls, hip and gable", () => {
    expect(freeCutPitch([wall('hip', 30), wall('hip', 52.5), wall('gable', 75), wall('hip', 45)])).toBe(75);
    expect(freeCutPitch([wall('gable', 60), wall('gable', 30)])).toBe(60);
  });

  // The WP5.1 correctness reviewer's reproducer: every Ring at 30 degrees, its S side authored at 45. Read back from
  // the wire, the Rings' defaults are derived from their sides, so a pitch read off a Ring's default could change and
  // the skeleton refuse it (door-turn). Built directly and built from its own export, the shell is one shell.
  it('builds the S-side-45 Courtyard the same directly and after readInput(writeInput(f))', async () => {
    const f = layout('CourtyardS45', COURTYARD_RECTS.map(r => ring(r, 0, 1, 30, {S: {form: 'hip', deg: 45}})));
    const back = readInput(writeInput(f), f.name);
    if (!back.ok) throw new Error(`refused: ${back.errors.join('; ')}`);
    const direct = (await build(f)).shell;
    const read = (await buildShellDetailed(back.fixture)).shell;
    expect(read).toEqual(direct);
    expect(invariantViolations(await build(f), {genus: 1, cheeks: 0})).toEqual([]);
  });
});

/** A build's measured outcome: its invariant violations with genus 1, or the error it raised. */
async function outcomeOf(f: ShellFixture): Promise<string[]> {
  try {
    return invariantViolations(await build(f), {genus: 1, cheeks: 0});
  } catch (e) {
    return [throwsOutcome(errorMessage(e))];
  }
}

/** A split-band layout's cut: the split Ring's buried shared wall, x = split, from the outer loop to the hole. */
function expectSplitCut(f: ShellFixture, [, , bandS, split]: SplitBandLayout, deg: number): void {
  const cut = cutOf(f);
  expect(cut && {a: cut.a, b: cut.b, deg: cut.deg}).toEqual({a: pt(split, 0), b: pt(split, bandS), deg});
}

/**
 * Journal decision 150, F1 and F2: the correctness reviewer's 85 split-band layouts. The S band is authored as two
 * Rings, so their buried shared wall is the shortest cut and collinear with no wall. Every Ring stands at one pitch,
 * or (the four W layouts) the wings at another. `CUT_FREE_DEG = 45` broke 20 of the 27 at 60 degrees.
 */
describe("decision 150's split-band reproducers: the free cut at the island's steepest hip wall", () => {
  const uniform = SPLIT_BAND_LAYOUTS.flatMap(l => [30, 45, 60].map(d => [`${splitBandName(l)}D${d}`, l, d] as const));
  it.each(uniform)('%s takes its split as the cut, at the bands\' pitch', (name, l, d) => {
    expectSplitCut(splitBandFixture(name, ...l, {a: d, w: d}), l, d);
  });
  it.each(uniform)('%s keeps every invariant', async (name, l, d) => {
    expect(await outcomeOf(splitBandFixture(name, ...l, {a: d, w: d}))).toEqual([]);
  });

  /** The reviewer's four layouts with the wings at another pitch from the bands. */
  const wingsDiffer = (name: string, lo: number, hi: number, d: number, wd: number): ShellFixture => {
    const f = splitBandFixture(name, lo, hi, 150, 500, {a: d, w: wd});
    f.rings[1] = {...f.rings[1], defaultDeg: d};
    f.rings[4] = {...f.rings[4], defaultDeg: d};
    return f;
  };
  const wingCases = [[400, 600], [450, 550]].flatMap(([lo, hi]) => [[30, 60], [60, 30]].map(([d, wd]) => [`W${lo}-${hi}D${d}w${wd}`, lo, hi, d, wd] as const));
  it.each(wingCases)('%s, its wings at another pitch, takes the steeper of the two', (name, lo, hi, d, wd) => {
    expectSplitCut(wingsDiffer(name, lo, hi, d, wd), [lo, hi, 150, 500], Math.max(d, wd));
  });
  it.each(wingCases)('%s keeps every invariant', async (name, lo, hi, d, wd) => {
    expect(await outcomeOf(wingsDiffer(name, lo, hi, d, wd))).toEqual([]);
  });
});

/**
 * Journal decision 151: the counter-cases that struck decision 150's provisional cut-ends rule. The cutting Ring wins
 * both walls the free cut meets, at 30 and 45 degrees, while the far band and the wings stand at 60. The cut-ends rule
 * took 45, the steeper of the two walls at the cut's ends, and broke 96 of these 162; the island's steepest hip wall
 * takes 60.
 */
describe("decision 151's counter-cases to the cut-ends rule: the far band and wings steeper than both walls at the cut's ends", () => {
  const cases = SPLIT_BAND_LAYOUTS.flatMap(l => [[30, 45], [45, 30]].flatMap(([s, n]) => [30, 45, 60].map(a =>
    [`${splitBandName(l)}s${s}n${n}a${a}w60`, l, {a, s, n, w: 60}] as const)));
  it.each(cases)('%s takes 60 degrees', (name, l, p) => {
    expectSplitCut(splitBandFixture(name, ...l, p), l, 60);
  });
  it.each(cases)('%s keeps every invariant', async (name, l, p) => {
    expect(await outcomeOf(splitBandFixture(name, ...l, p))).toEqual([]);
  });
});

/**
 * Journal decisions 151 and 153, measured: split-band courtyards with every side gabled (`g`), and the same with the
 * far N band hipped (`n`). The free cut takes the steepest wall of the island, gables included, so the Rings' common
 * pitch. Every layout not listed keeps every invariant. Under decision 151's `CUT_ALL_GABLE_DEG = 45` the ten
 * all-gable layouts at 60 degrees with a hole 100 cm wide or narrower were refused by the skeleton, the cut shallower
 * than its gables; decision 153 cures all ten.
 */
const ALL_GABLE_DEFECTS: ClassedPinTable<`${string}D${number}${'g' | 'n'}`> = {
};

describe('all-gable split bands (journal decisions 151 and 153): the free cut takes the gables\' pitch', () => {
  const G = {form: 'gable'} as const;
  const cases = SPLIT_BAND_LAYOUTS.flatMap(l => [30, 45, 60].flatMap(d => [false, true].map(farHip =>
    [`${splitBandName(l)}D${d}${farHip ? 'n' : 'g'}` as const, l, d, farHip] as const)));
  it.each(cases)('%s keeps every invariant, or exactly its measured defect', async (name, l, d, farHip) => {
    const f = splitBandFixture(name, ...l, {a: d, w: d});
    f.rings = f.rings.map((r, i) => ({...r, sides: farHip && i === 4 ? {} : {S: G, E: G, N: G, W: G}}));
    const pin = pinnedOutcome(ALL_GABLE_DEFECTS, name);
    if (!pin.length) expectSplitCut(f, l, d);
    expect(await outcomeOf(f)).toEqual(pin);
  });
});

/** The courtyard fixtures asserted as the roster is: the Courtyard, and FullWingsProbe under decision 132's rule. */
describe.each([['Courtyard', () => fixtureByName('Courtyard')], ['FullWingsProbe', () => FULL_WINGS]] as const)('%s (journal decisions 115 and 132)', (_, fixture) => {
  it("keeps spec decision 32's invariants with genus 1", async () => {
    expect(invariantViolations(await build(fixture()), {genus: 1, cheeks: 0})).toEqual([]);
  });

  it('has a Wall face on each of the four courtyard walls, each 400 by 250', async () => {
    const b = await build(fixture());
    const walls: [Vec3, number][] = [[[1, 0, 0], 300], [[-1, 0, 0], -700], [[0, 1, 0], 300], [[0, -1, 0], -700]];
    for (const [n, d] of walls) {
      const on = b.shell.faces.filter(f => f.tag.kind === 'Wall' && f.normal.every((c, i) => Math.abs(c - n[i]) < 1e-9) && Math.abs(f.offset - d) <= tol);
      expect(on, `Wall facing (${n}) at ${d}`).toHaveLength(1);
      expect(Math.abs(on[0].area - 400 * 250)).toBeLessThan(0.05);
    }
  });

  it("tags every raw face on the cut's vertical plane Internal, and none survives", async () => {
    const {parts, tags, survivingInternal} = (await build(fixture())).union;
    let onCut = 0;
    for (const p of parts) {
      const P = p.soup.positions;
      p.soup.faceIDs.forEach((f, t) => {
        const vs = [0, 1, 2].map(j => p.soup.tris[3 * t + j]);
        const inSpan = vs.every(v => Math.abs(P[3 * v + 1] - 300) <= tol && P[3 * v] >= -tol && P[3 * v] <= 300 + tol);
        if (!inSpan) return;
        onCut++;
        expect(tags.table[f].kind, `${p.name} triangle ${t}`).toBe('Internal');
      });
    }
    expect(onCut).toBeGreaterThan(0);
    expect(survivingInternal).toBe(0);
  });

  it("leaves no trace: no ShellEdge on the cut's line within its span, and none ending inside it", async () => {
    const b = await build(fixture());
    const onCutPlane = (p: Vec3): boolean => Math.abs(p[1] - 300) <= tol && p[0] >= -tol && p[0] <= 300 + tol;
    const inside = (p: Vec3): boolean => onCutPlane(p) && p[0] > tol && p[0] < 300 - tol;
    const along = b.shell.edges.filter(e => onCutPlane(e.a) && onCutPlane(e.b) && inside([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, 0]));
    expect(along.map(e => `${e.kind} (${e.a}) to (${e.b})`)).toEqual([]);
    expect(b.shell.edges.filter(e => inside(e.a) || inside(e.b)).map(e => `${e.kind} (${e.a}) to (${e.b})`)).toEqual([]);
  });

  it("has an empty report in spec decision 40's sense", async () => {
    const {report} = (await build(fixture())).shell;
    expect([report.conflicts, report.survivingInternal, report.unclassifiedEdges, report.cheeks, report.newEdgeKinds]).toEqual([[], 0, 0, 0, []]);
  });
});

/**
 * The correctness reviewers' courtyard probes (WP3.6's, `probes/zz-court.test.ts`), each built and checked against
 * spec decision 32, with its genus per connected component (journal decision 135).
 */
describe('the courtyard probes (journal decision 135)', () => {
  const C = COURTYARD_RECTS;
  const all = (deg: number, storeys = 1): FixtureRing[] => C.map(r => ring(r, 0, storeys, deg));
  const cases: [string, FixtureRing[], ShellExpectation['genus']][] = [
    ['CourtOnBlock', [ring([0, 0, 1000, 1000], 0, 1, 30), ...C.map(r => ring(r, 1, 1, 30))], 0],
    ['CourtTwoStorey', all(30, 2), 1],
    ['CourtGabled', [ring(C[0], 0, 1, 30, {S: {form: 'gable'}, N: {form: 'gable'}}), ...C.slice(1).map(r => ring(r, 0, 1, 30))], 1],
    ['CourtCollinear', [ring([0, 0, 1000, 300], 0, 1, 30), ring([0, 700, 1000, 1000], 0, 1, 30), ring([0, 300, 300, 700], 0, 1, 30), ring([700, 200, 1000, 700], 0, 1, 30)], 1],
    // A courtyard island beside a plain island: Manifold's one figure sums to 0; per component it is 1 and 0.
    ['CourtTwoIslands', [...all(30), ring([1200, 0, 1600, 400], 0, 1, 30)], [1, 0]],
    ['CourtL', [...all(30), ring([1000, 0, 1400, 300], 0, 1, 30)], 1],
    ['CourtCovered', [...all(30), ring([0, 0, 1000, 1000], 1, 1, 30)], 0],
    // An island standing in the courtyard: two components again.
    ['CourtIslandInHole', [...all(30), ring([450, 450, 550, 550], 0, 1, 30)], [1, 0]],
    ['Court45', all(45), 1],
    ['Court60', all(60), 1],
    ['CourtNarrow', [ring([0, 0, 1000, 100], 0, 1, 30), ring([0, 900, 1000, 1000], 0, 1, 30), ring([0, 100, 100, 900], 0, 1, 30), ring([900, 100, 1000, 900], 0, 1, 30)], 1],
    ['CourtCutSideGabled', [ring(C[0], 0, 1, 30), ring(C[1], 0, 1, 30), ring(C[2], 0, 1, 30, {S: {form: 'gable'}}), ring(C[3], 0, 1, 30)], 1],
  ];
  it.each(cases)('%s keeps every invariant, with its genus per component', async (name, rings, genus) => {
    expect(invariantViolations(await build(layout(name, rings)), {genus, cheeks: 0})).toEqual([]);
  });
});

describe('layouts the rule refuses (spec decision 2 as amended)', () => {
  it('refuses a hole every segment of whose cuts is collinear with walls of different pitch at its two ends', () => {
    // Both wings jut out past the bands at 45 degrees; every segment from the hole to the outer loop is collinear at
    // its outer end with a wing's exposed 45 degree side and at its hole end with a 30 degree band side.
    const f = layout('NoCutProbe', [ring([0, 0, 1000, 300], 0, 1, 30), ring([0, 700, 1000, 1000], 0, 1, 30), ring([-200, 300, 300, 700], 0, 1, 45), ring([700, 300, 1200, 700], 0, 1, 45)]);
    expect(() => planStorey(f, 0)).toThrow(/NoCutProbe storey 0: no raw Ring wall cuts the courtyard ring from the hole at/);
  });

  it('refuses an island with two holes', () => {
    const f = courtyard('TwoHolesProbe', [[0, 0, 700, 100], [0, 200, 700, 300], [0, 100, 100, 200], [300, 100, 400, 200], [600, 100, 700, 200]]);
    expect(() => planStorey(f, 0)).toThrow(/TwoHolesProbe storey 0: the island at .* holds 2 holes; a courtyard roof takes one/);
  });

  it('roofs the hole the old storey refused (the HoleProbe ring) through its cut', () => {
    const f = courtyard('HoleProbe', [[0, 0, 300, 100], [0, 200, 300, 300], [0, 100, 100, 200], [200, 100, 300, 200]]);
    const plan = planStorey(f, 0);
    expect(plan.building.walls.filter(w => w.form === 'cut').map(w => [w.a, w.b])).toEqual([[pt(0, 100), pt(100, 100)], [pt(100, 100), pt(0, 100)]]);
  });

  // WP3.6's finding, enrolled with its measured signature, not waived: roof-gable's algorithm B, unchanged, overshoots
  // the true roof when the cut is longer than twice the depth of the band beyond it. Both cut pieces read the shorter
  // side's end planes (here x = 0 and the hole's x = 250, rising to 125 at the cut's middle), and the wing-side piece's
  // far wall is the far band's, so nothing caps it at the near band's depth, 100. Its face on the cut then stands
  // higher than its partner's across the slit, and survives.
  it('enrols the cut-piece overshoot (CutOvershootProbe): runB stands 21 cm above the true roof, and one Internal cut face survives', async () => {
    const f = CUT_OVERSHOOT_PROBE;
    const plan = planStorey(f, 0);
    const truth = (x: number, y: number): number => Math.tan(Math.PI / 6) * Math.min(Math.min(x, 650 - x, y - 150, 850 - y), Math.max(250 - x, x - 400, 250 - y, y - 600));
    const at = {x: 127.3, y: 251.7};
    const got = runB(plan.building, {far: 'plane'}).eval(at);
    expect(got?.h ?? NaN).toBeCloseTo(122.7 * Math.tan(Math.PI / 6), 1);
    expect(truth(at.x, at.y)).toBeCloseTo(101.7 * Math.tan(Math.PI / 6), 1);
    expect(invariantViolations(await build(f), {genus: 1, cheeks: 0})).toEqual(CUT_OVERSHOOT_DEFECTS.outcome);
  });

  it('builds the Courtyard from COURTYARD_RECTS', () => {
    expect(fixtureByName('Courtyard').rings.map(r => r.rect)).toEqual(COURTYARD_RECTS);
  });
});

/** Storey `n`'s cut for a fixture's one hole there, as spec decision 2 chooses it. */
const cutAt = (f: ShellFixture, n: number): ReturnType<typeof selectCut> => {
  const rings = storeyRings(f, n);
  const loops = unionLoops(rings.map(r => r.ring.rect));
  return selectCut(rings, loops.filter(l => polyArea(l) > 0), loops.filter(l => polyArea(l) < 0)[0], unionWallForms(rings, loops));
};

/** A cut's two ends, `a` on the outer loop first. */
type CutEnds = [a: Pt, b: Pt];
const endsOf = (c: ReturnType<typeof selectCut>): CutEnds | undefined => c && [c.a, c.b];

/** A plan point reflected on `axis` about `span / 2`. */
const mirrored = (p: Pt, span: number, axis: MirrorAxis): Pt => (axis === 0 ? pt(span - p.x, p.y) : pt(p.x, span - p.y));

/** The faces a build stands on a vertical plane where no gable was asked for: every Gable and Cheek face. */
const gableOrCheek = (b: ShellBuild): string[] =>
  b.shell.faces.filter(f => f.tag.kind === 'Gable' || f.tag.kind === 'Cheek').map(f => `${f.tag.kind} n=(${f.normal.map(c => c.toFixed(3))}) d=${f.offset.toFixed(2)}`);

/** The top of a build's Roof faces over plan point (x, y), or NaN where none holds it. */
function roofTop(b: ShellBuild, x: number, y: number): number {
  const zs = b.shell.faces.filter(f => f.tag.kind === 'Roof' && planHolds(f, x, y)).map(f => (f.offset - f.normal[0] * x - f.normal[1] * y) / f.normal[2]);
  return zs.length ? Math.max(...zs) : NaN;
}

/**
 * Journal decision 278 (journal findings 88 and 89): a courtyard cut qualifies only if its outer end leaves the
 * building on both sides of its line. A cut whose outer end is a corner of the outline where a wall carries on in line
 * with it is refused, and the next candidate is tried, as for a cut the pitch rule refuses. Built through such a cut,
 * algorithm B reads the cut side's extent and end planes from beyond the cut, and stands an unrequested gable on the
 * outline. Every case here is all hip, so a Gable or a Cheek face is that defect, and none is asked for.
 *
 * The oracle is a mirror: each refused case's roof is the mirror image of a partner's, a layout whose own cut is the
 * mirror image of the case's new cut and leaves the building on both sides, so the rule does not touch the partner
 * (measured: its cut is the same under the pitch rule alone).
 */
describe('a cut whose outer end does not leave the building on both sides (journal decision 278)', () => {
  const t30 = Math.tan(Math.PI / 6);
  const PLATE = 250;
  const E = (n: number): CutEnds => [pt(1000, n), pt(700, n)];

  describe('CourtyardJutWing, the user\'s input (journal finding 88)', () => {
    it('takes the east cut, y = 300 over x 700 to 1000, not the west one that ends where the wing\'s S wall carries on', () => {
      expect(cutAt(COURTYARD_JUT_WING, 0)).toEqual({a: pt(1000, 300), b: pt(700, 300), ring: 0, side: 'N', outer: 0, deg: 30});
    });

    it('builds no Gable and no Cheek face, and keeps every invariant with genus 1', async () => {
      const b = await build(COURTYARD_JUT_WING);
      expect(gableOrCheek(b)).toEqual([]);
      expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
    });

    it('hips every Ring side as asked: every wall hip or cut at 30 degrees, and every Roof face at 30 degrees', async () => {
      for (const w of planStorey(COURTYARD_JUT_WING, 0).building.walls) {
        expect(['hip', 'cut']).toContain(w.form);
        expect(Math.abs(w.tan - t30)).toBeLessThan(1e-12);
      }
      const roofs = (await build(COURTYARD_JUT_WING)).shell.faces.filter(f => f.tag.kind === 'Roof');
      expect(roofs.length).toBeGreaterThan(0);
      for (const f of roofs) expect(Math.abs(f.normal[2] - Math.cos(Math.PI / 6)), `Roof n=(${f.normal})`).toBeLessThan(1e-6);
    });

    // A 30 degree hip roof stands tan 30 times the wavefront's arrival time above the 250 cm plate. Each point's time is
    // read off the rectangles: the bands' ridges at half their 300 cm depth, the wing's at half its 400, its hip end 125
    // in from x = -250, and on x 0 to 150 beside the old cut the W wall's own slope, which the defect stood up to
    // 144.34 cm higher as a gable (journal finding 89).
    it.each([
      ['the S band\'s ridge', 500, 150, 150], ['the N band\'s ridge', 500, 850, 150], ['the E wing\'s ridge', 850, 500, 150],
      ['the S band\'s ridge end beside the east cut', 850, 150, 150], ['the wing\'s ridge, west of x = 0', -50, 500, 200],
      ['the wing\'s ridge at x = 10', 10, 500, 200], ['the wing\'s ridge at x = 100', 100, 500, 200], ['the wing\'s W hip end', -125, 500, 125],
      ['the S band\'s W slope', 75, 150, 75], ['the N band\'s W slope', 75, 850, 75], ['the S band\'s W slope at x = 10', 10, 150, 10],
      ['the SW hip', 100, 100, 100], ['the S band\'s ridge end', 150, 150, 150], ['the wing\'s SW hip', -200, 350, 50],
    ] as const)('stands at the closed-form height on %s, (%i, %i): %i cm of wavefront at 30 degrees', async (_, x, y, d) => {
      expect(Math.abs(roofTop(await build(COURTYARD_JUT_WING), x, y) - (PLATE + d * t30))).toBeLessThanOrEqual(tol);
    });

    it('stands no higher than the wing\'s ridge, 250 + 200 tan 30', async () => {
      const top = Math.max(...(await build(COURTYARD_JUT_WING)).shell.faces.flatMap(f => f.loops[0].map(p => p[2])));
      expect(Math.abs(top - (PLATE + 200 * t30))).toBeLessThanOrEqual(tol);
    });
  });

  /**
   * Journal finding 89's boundary cases, each with its new cut at each courtyard storey and its mirror partner. Before
   * decision 278 each took the west cut ending at a corner where a wall carries on, and built a Gable and Cheeks on the
   * outline (the 750 cm jut at the hole end, x = 300), or (the 300 cm jut) threw "Not manifold".
   */
  const refused: [name: string, fixture: ShellFixture, cuts: CutEnds[], axis: MirrorAxis, genus: number][] = [
    ['CourtyardJutWing', COURTYARD_JUT_WING, [E(300)], 0, 1],
    ...[50, 200, 300, 500, 750].map((jut): [string, ShellFixture, CutEnds[], MirrorAxis, number] => [`JutWing${jut}`, jutWingFixture(`JutWing${jut}`, jut), [E(300)], 0, 1]),
    ['JutWing300h263', shellFixture('JutWing300h263', jutWingRects(300).map(r => ring(r, 0, 1, 30)), 263), [E(300)], 0, 1],
    ['JutWing250At45', jutWingFixture('JutWing250At45', 250, 45), [E(300)], 0, 1],
    ['JutWing300At45', jutWingFixture('JutWing300At45', 300, 45), [E(300)], 0, 1],
    ['JutWingTwoStoreys', jutWingFixture('JutWingTwoStoreys', 250, 30, [2, 2, 2, 2]), [E(300), E(300)], 0, 1],
    ['JutWingOneStoreyUnderU', jutWingFixture('JutWingOneStoreyUnderU', 250, 30, [2, 1, 2, 2]), [E(300)], 0, 1],
    ['JutWingTwoStoreysOverCourtyard', jutWingFixture('JutWingTwoStoreysOverCourtyard', 250, 30, [1, 2, 1, 1]), [E(300)], 0, 1],
    // The user's input mirrored in y: the same plan, its Rings in mirrored order, so the hole's N wall's cut is the
    // S band's (Ring 2's), x 700 to 1000.
    ['JutWingMirrorY', {...mirrorFixture(COURTYARD_JUT_WING, 1000, 1), name: 'JutWingMirrorY'}, [E(300)], 0, 1],
    // Transposed: the wing juts south, beside the cut x = 300 over y 0 to 300; the north one, y 700 to 1000, is taken.
    ['JutWingTransposed', courtyard('JutWingTransposed', [[0, 0, 300, 1000], [300, -250, 700, 300], [700, 0, 1000, 1000], [300, 700, 700, 1000]]), [[pt(300, 1000), pt(300, 700)]], 1, 1],
    // A wing 300 cm wide, flush, and a 250 by 200 jut aligned with the courtyard's S wall only: the cut y = 700 is taken.
    ['JutAlignedS', courtyard('JutAlignedS', [[0, 0, 1000, 300], [0, 300, 300, 700], [-250, 300, 0, 500], [0, 700, 1000, 1000], [700, 300, 1000, 700]]), [[pt(0, 700), pt(300, 700)]], 1, 1],
  ];

  describe.each(refused)('%s', (_, f, cuts, axis, genus) => {
    const partner = mirrorFixture(f, 1000, axis);

    it('takes the cut that leaves the building on both sides, at each courtyard storey', () => {
      expect(cuts.map((_c, n) => endsOf(cutAt(f, n)))).toEqual(cuts);
    });

    it('builds no Gable and no Cheek face, and keeps every invariant', async () => {
      const b = await build(f);
      expect(gableOrCheek(b)).toEqual([]);
      expect(invariantViolations(b, {genus, cheeks: 0})).toEqual([]);
    });

    it('is the mirror image of its partner, whose cut is the mirror image of its own', async () => {
      expect(cuts.map((_c, n) => endsOf(cutAt(partner, n)))).toEqual(cuts.map(c => c.map(p => mirrored(p, 1000, axis))));
      expect(mirrorDifferences((await build(f)).shell, (await build(partner)).shell, 1000, () => true, tol, axis).differences).toEqual([]);
    });
  });

  // Mirrored in x with the W wing widened to 350, so the east cut is the shortest and is the one the wing's S wall
  // carries on from. Its x-mirror is refused too, so it has no partner; its heights are read in closed form instead.
  describe('JutWingMirrorX, the wing jutting east beside the shortest cut', () => {
    const f = courtyard('JutWingMirrorX', [[0, 0, 1000, 300], [700, 300, 1250, 700], [0, 700, 1000, 1000], [0, 300, 350, 700]]);

    it('takes the west cut, y = 300 over x 0 to 350', () => {
      expect(endsOf(cutAt(f, 0))).toEqual([pt(0, 300), pt(350, 300)]);
    });

    it('builds no Gable and no Cheek face, and keeps every invariant with genus 1', async () => {
      const b = await build(f);
      expect(gableOrCheek(b)).toEqual([]);
      expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
    });

    it.each([
      ['the S band\'s ridge', 500, 150, 150], ['the S band\'s E slope', 925, 150, 75], ['the N band\'s E slope', 925, 850, 75],
      ['the wing\'s ridge at x = 990', 990, 500, 200], ['the wing\'s E hip end', 1175, 500, 75], ['the W wing\'s ridge', 175, 500, 175],
    ] as const)('stands at the closed-form height on %s, (%i, %i): %i cm of wavefront at 30 degrees', async (_, x, y, d) => {
      expect(Math.abs(roofTop(await build(f), x, y) - (PLATE + d * t30))).toBeLessThanOrEqual(tol);
    });
  });

  /** Layouts whose cut leaves the building on both sides, so the rule does not touch them: each keeps its cut. */
  it.each([
    ['a flush wing', jutWingFixture('JutWing0', 0)],
    ['a jut mid-wall, collinear with no cut', courtyard('JutMidWall', [[0, 0, 1000, 300], [0, 300, 300, 700], [-250, 350, 0, 650], [0, 700, 1000, 1000], [700, 300, 1000, 700]])],
    ['a jut aligned with the courtyard\'s other wall, y = 700', courtyard('JutAlignedN', [[0, 0, 1000, 300], [0, 300, 300, 700], [-250, 500, 0, 700], [0, 700, 1000, 1000], [700, 300, 1000, 700]])],
    ['the user\'s input mirrored in x, the wing jutting east', mirrorFixture(COURTYARD_JUT_WING, 1000)],
  ] as const)('%s keeps its cut, y = 300 over x 0 to 300, and every invariant', async (_, f) => {
    expect(endsOf(cutAt(f, 0))).toEqual([pt(0, 300), pt(300, 300)]);
    const b = await build(f);
    expect(gableOrCheek(b)).toEqual([]);
    expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
  });

  // The rule's known cost (journal decision 278): the S band runs on past x = 0, so the cut y = 300 over x 0 to 300
  // ends at a corner where the band's N wall carries on, on the same face as the courtyard's own. That cut built clean,
  // and is refused; the cut y = 700 is taken, and the shell is the same set of faces and Edges (measured).
  it.each([
    ['the S band running on to x = -250', 'BandRunsOnPastCut', [[-250, 0, 1000, 300], [0, 300, 300, 700], [0, 700, 1000, 1000], [700, 300, 1000, 700]]],
    ['a jut under the cut\'s line, below the W wing', 'JutBelowCutLine', [[0, 0, 1000, 300], [-250, 100, 0, 300], [0, 300, 300, 700], [0, 700, 1000, 1000], [700, 300, 1000, 700]]],
  ] as const)('with %s (%s), takes y = 700 over x 0 to 300, still clean and the mirror image of its y-mirror', async (_, name, rects) => {
    const f = courtyard(name, rects.map(r => [...r] as Rect));
    expect(endsOf(cutAt(f, 0))).toEqual([pt(0, 700), pt(300, 700)]);
    const b = await build(f);
    expect(gableOrCheek(b)).toEqual([]);
    expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
    const partner = mirrorFixture(f, 1000, 1);
    expect(endsOf(cutAt(partner, 0))).toEqual([pt(0, 300), pt(300, 300)]);
    expect(mirrorDifferences(b.shell, (await build(partner)).shell, 1000, () => true, tol, 1).differences).toEqual([]);
  });
});
