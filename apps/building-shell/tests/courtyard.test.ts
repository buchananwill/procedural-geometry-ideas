// The courtyards on the holed roof (holed roof decisions 50 to 52): every island is roofed by the skeleton of its
// outline and its holes, each wall at its own pitch. The cut, its placement, splice and pitch, went with it, and so did
// its tests; every invariant check over the same layouts is kept, and the layouts the holed solve refuses are
// `HOLED_REFUSALS` entries (tests/holed-roof.test.ts).
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {errorMessage} from '../src/errors.ts';
import {COURTYARD_RECTS, FixtureRing, RingSides, ShellFixture, fixtureByName, ring} from '../src/fixture.ts';
import {runB} from '../src/roof/algoB.ts';
import {Rect} from '../src/roof/model.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {planStorey} from '../src/storey.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import type {Vec3} from '../src/tags.ts';
import {
  COURTYARD_JUT_WING, OFF_CENTRE_COURTYARD, FULL_WINGS_PROBE, SPLIT_BAND_LAYOUTS, jutWingFixture, jutWingRects, splitBandFixture, splitBandName,
} from './robustness-fixtures.ts';
import {MirrorAxis, mirrorDifferences, mirrorFixture} from './mirror-oracle.ts';
import {ClassedPinTable, pinnedOutcome, throwsOutcome} from './pin-table.ts';
import {ShellExpectation, invariantViolations, planHolds} from './shell-invariants.ts';
import {memoBuilds, shellFixture} from './test-builds.ts';

const tol = SHELL_TOLERANCE_CM;
const t30 = Math.tan(Math.PI / 6);
const PLATE = 250;

/** A one-storey layout at 250 cm storeys, every Ring at `deg` unless given its own Rings. */
const layout = (name: string, rings: FixtureRing[]): ShellFixture => shellFixture(name, rings);
const courtyard = (name: string, rects: Rect[], deg = 30): ShellFixture => layout(name, rects.map(r => ring(r, 0, 1, deg)));

/** Each build, made once, on the first test that asks for it, so a crash fails that test alone. */
const build = memoBuilds();

/** The faces a build stands on a vertical plane where no gable was asked for: every Gable and Cheek face. */
const gableOrCheek = (b: ShellBuild): string[] =>
  b.shell.faces.filter(f => f.tag.kind === 'Gable' || f.tag.kind === 'Cheek').map(f => `${f.tag.kind} n=(${f.normal.map(c => c.toFixed(3))}) d=${f.offset.toFixed(2)}`);

/** The top of a build's Roof faces over plan point (x, y), or NaN where none holds it. */
function roofTop(b: ShellBuild, x: number, y: number): number {
  const zs = b.shell.faces.filter(f => f.tag.kind === 'Roof' && planHolds(f, x, y)).map(f => (f.offset - f.normal[0] * x - f.normal[1] * y) / f.normal[2]);
  return zs.length ? Math.max(...zs) : NaN;
}

/** The pitch, in degrees, of the walls of storey 0's hole on the hole's S wall, y = 300 over x 300 to 700. */
function holeSouthDegs(f: ShellFixture): number[] {
  const walls = planStorey(f, 0).building.walls.filter(w => w.loop === 1 && w.a.y === 300 && w.b.y === 300 && Math.min(w.a.x, w.b.x) >= 300 && Math.max(w.a.x, w.b.x) <= 700);
  return [...new Set(walls.map(w => Math.round((Math.atan(w.tan) * 180) / Math.PI)))];
}

/** A build's measured outcome: its invariant violations with genus 1, or the error it raised. */
async function outcomeOf(f: ShellFixture): Promise<string[]> {
  try {
    return invariantViolations(await build(f), {genus: 1, cheeks: 0});
  } catch (e) {
    return [throwsOutcome(errorMessage(e))];
  }
}

describe("each wall at its own union wall's pitch (holed roof decisions 18 and 20)", () => {
  const C = COURTYARD_RECTS;
  const rings = (degs: number[], sides: RingSides[] = []): FixtureRing[] => C.map((r, i) => ring(r, 0, 1, degs[i], sides[i]));
  // The correctness reviewer's reproducers (probes/zz-court2.test.ts), once the cut's pitch rule's: each hole wall now
  // takes its own derived pitch, and a mixed-pitch courtyard is roofed by the weighted holed solve.
  it.each([
    // `Wing50` was `CutWing50` (holed roof decision 47).
    ['Wing50', rings([30, 30, 50, 30]), 30],
    ['Bands50', rings([50, 50, 30, 30]), 50],
    ['HoleSide45', rings([30, 30, 30, 30], [{N: {form: 'hip', deg: 45}}]), 45],
    ['HoleSideGabled', rings([30, 30, 30, 30], [{N: {form: 'gable'}}]), 30],
    ['OtherWing50', rings([30, 30, 30, 50]), 30],
    // Journal decision 141: every side pitched, S 30, E 35, N 40, W 45. The hole's S wall is the S band's N side, 40.
    ['CourtyardMixedPitch', rings([30, 30, 30, 30], [0, 1, 2, 3].map(() => ({S: {form: 'hip', deg: 30}, E: {form: 'hip', deg: 35}, N: {form: 'hip', deg: 40}, W: {form: 'hip', deg: 45}}))), 40],
  ] as const)('%s: the hole\'s S wall keeps its derived pitch, %i degrees, and the building keeps every invariant', async (name, rs, deg) => {
    const f = layout(name, [...rs]);
    expect(holeSouthDegs(f)).toEqual([deg]);
    expect(invariantViolations(await build(f), {genus: 1, cheeks: 0})).toEqual([]);
  });

  // The WP5.1 correctness reviewer's reproducer: every Ring at 30 degrees, its S side authored at 45. Read back from
  // the wire, the Rings' defaults are derived from their sides; built directly and built from its own export, the shell
  // is one shell.
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

/**
 * Journal decision 150, F1 and F2: the correctness reviewer's 85 split-band layouts, the S band authored as two Rings.
 * Every Ring stands at one pitch, or (the four W layouts) the wings at another.
 */
describe("decision 150's split-band reproducers", () => {
  const uniform = SPLIT_BAND_LAYOUTS.flatMap(l => [30, 45, 60].map(d => [`${splitBandName(l)}D${d}`, l, d] as const));
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
  it.each(wingCases)('%s keeps every invariant', async (name, lo, hi, d, wd) => {
    expect(await outcomeOf(wingsDiffer(name, lo, hi, d, wd))).toEqual([]);
  });
});

/**
 * Journal decision 151's counter-cases to the cut-ends rule: the cutting Ring wins both walls at the split, at 30 and 45
 * degrees, while the far band and the wings stand at 60.
 */
describe("decision 151's counter-cases: the far band and wings steeper than both walls at the split", () => {
  const cases = SPLIT_BAND_LAYOUTS.flatMap(l => [[30, 45], [45, 30]].flatMap(([s, n]) => [30, 45, 60].map(a =>
    [`${splitBandName(l)}s${s}n${n}a${a}w60`, l, {a, s, n, w: 60}] as const)));
  it.each(cases)('%s keeps every invariant', async (name, l, p) => {
    expect(await outcomeOf(splitBandFixture(name, ...l, p))).toEqual([]);
  });
});

/**
 * Journal decisions 151 and 153, measured: split-band courtyards with every side gabled (`g`), and the same with the
 * far N band hipped (`n`). Every layout not listed keeps every invariant.
 */
const ALL_GABLE_DEFECTS: ClassedPinTable<`${string}D${number}${'g' | 'n'}`> = {
};

describe('all-gable split bands (journal decisions 151 and 153)', () => {
  const G = {form: 'gable'} as const;
  const cases = SPLIT_BAND_LAYOUTS.flatMap(l => [30, 45, 60].flatMap(d => [false, true].map(farHip =>
    [`${splitBandName(l)}D${d}${farHip ? 'n' : 'g'}` as const, l, d, farHip] as const)));
  it.each(cases)('%s keeps every invariant, or exactly its measured defect', async (name, l, d, farHip) => {
    const f = splitBandFixture(name, ...l, {a: d, w: d});
    f.rings = f.rings.map((r, i) => ({...r, sides: farHip && i === 4 ? {} : {S: G, E: G, N: G, W: G}}));
    expect(await outcomeOf(f)).toEqual(pinnedOutcome(ALL_GABLE_DEFECTS, name));
  });
});

/** The courtyard fixtures asserted as the roster is: the Courtyard, and FullWingsProbe. */
describe.each([['Courtyard', () => fixtureByName('Courtyard')], ['FullWingsProbe', () => FULL_WINGS_PROBE]] as const)('%s (journal decisions 115 and 132)', (_, fixture) => {
  it("keeps spec decision 32's invariants with genus 1", async () => {
    expect(invariantViolations(await build(fixture()), {genus: 1, cheeks: 0})).toEqual([]);
  });

  it('is one island with one hole, its walls the outer loop\'s and then the hole\'s', () => {
    const {building} = planStorey(fixture(), 0);
    expect(building.comps).toHaveLength(1);
    const [comp] = building.comps;
    expect(comp.holes).toHaveLength(1);
    const loops = comp.walls.map(w => w.loop);
    expect(loops).toEqual([...loops].sort((p, q) => p - q));
    expect(comp.walls.filter(w => w.loop === 1)).toHaveLength(comp.holes[0].length);
    for (const w of comp.walls) {
      expect(w.form).toBe('hip');
      expect(Math.abs(w.tan - t30)).toBeLessThan(1e-12);
    }
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

  // Where the cut ran, y = 300 over x 0 to 300, the true roof has no seam.
  it('has no ShellEdge on the old cut\'s line within its span, and none ending inside it', async () => {
    const b = await build(fixture());
    const onLine = (p: Vec3): boolean => Math.abs(p[1] - 300) <= tol && p[0] >= -tol && p[0] <= 300 + tol;
    const inside = (p: Vec3): boolean => onLine(p) && p[0] > tol && p[0] < 300 - tol;
    const along = b.shell.edges.filter(e => onLine(e.a) && onLine(e.b) && inside([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, 0]));
    expect(along.map(e => `${e.kind} (${e.a}) to (${e.b})`)).toEqual([]);
    expect(b.shell.edges.filter(e => inside(e.a) || inside(e.b)).map(e => `${e.kind} (${e.a}) to (${e.b})`)).toEqual([]);
  });

  it("has an empty report in spec decision 40's sense", async () => {
    const {report} = (await build(fixture())).shell;
    expect([report.conflicts, report.survivingInternal, report.unclassifiedEdges, report.cheeks, report.newEdgeKinds]).toEqual([[], 0, 0, 0, []]);
  });

  // Holed roof decision 38: an all-hip island at one pitch stands at tan 30 times its L-infinity distance to the walls.
  it.each([[500, 150, 150], [150, 500, 150], [150, 150, 150], [75, 500, 75], [500, 225, 75]] as const)('stands at the closed-form height at (%i, %i): %i cm of wavefront at 30 degrees', async (x, y, d) => {
    expect(Math.abs(roofTop(await build(fixture()), x, y) - (PLATE + d * t30))).toBeLessThanOrEqual(tol);
  });
});

/**
 * The correctness reviewers' courtyard probes (WP3.6's, `probes/zz-court.test.ts`), each built and checked against
 * spec decision 32, with its genus per connected component (journal decision 135). `CourtL` is refused by the holed
 * solve, and is a `HOLED_REFUSALS` entry.
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
    ['CourtCovered', [...all(30), ring([0, 0, 1000, 1000], 1, 1, 30)], 0],
    // An island standing in the courtyard: two components again.
    ['CourtIslandInHole', [...all(30), ring([450, 450, 550, 550], 0, 1, 30)], [1, 0]],
    ['Court45', all(45), 1],
    ['Court60', all(60), 1],
    ['CourtNarrow', [ring([0, 0, 1000, 100], 0, 1, 30), ring([0, 900, 1000, 1000], 0, 1, 30), ring([0, 100, 100, 900], 0, 1, 30), ring([900, 100, 1000, 900], 0, 1, 30)], 1],
    // `CourtWingSideGabled` was `CourtCutSideGabled` (holed roof decision 47).
    ['CourtWingSideGabled', [ring(C[0], 0, 1, 30), ring(C[1], 0, 1, 30), ring(C[2], 0, 1, 30, {S: {form: 'gable'}}), ring(C[3], 0, 1, 30)], 1],
  ];
  it.each(cases)('%s keeps every invariant, with its genus per component', async (name, rings, genus) => {
    expect(invariantViolations(await build(layout(name, rings)), {genus, cheeks: 0})).toEqual([]);
  });
});

describe('layouts the cut refused or roofed oddly, on the holed roof (holed roof decisions 48 and 51)', () => {
  // Both wings jut out past the bands at 45 degrees: the cut rule found no segment whose two ends agreed in pitch, and
  // refused it. The holed solve roofs it, all hips.
  it('NoCutProbe builds with genus 1 and no Gable or Cheek face', async () => {
    const f = layout('NoCutProbe', [ring([0, 0, 1000, 300], 0, 1, 30), ring([0, 700, 1000, 1000], 0, 1, 30), ring([-200, 300, 300, 700], 0, 1, 45), ring([700, 300, 1200, 700], 0, 1, 45)]);
    const b = await build(f);
    expect(gableOrCheek(b)).toEqual([]);
    expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
  });

  it('HoleProbe, a 300 square round a 100 square hole, stands its ridge at 250 + 50 tan 30', async () => {
    const f = courtyard('HoleProbe', [[0, 0, 300, 100], [0, 200, 300, 300], [0, 100, 100, 200], [200, 100, 300, 200]]);
    const b = await build(f);
    expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
    for (const [x, y] of [[150, 50], [50, 150], [250, 150], [150, 250]]) expect(Math.abs(roofTop(b, x, y) - (PLATE + 50 * t30))).toBeLessThanOrEqual(tol);
  });

  // WP3.6's finding: roof-gable's algorithm B overshot the true roof here by 21 cm, the cut pieces reading the shorter
  // side's end planes, and one Internal cut face survived. With no cut there is no piece, and the roof is the true one.
  it('OffCentreCourtyard is roofed true: runB and the shell stand at 250 + 101.7 tan 30 at (127.3, 251.7), and it keeps every invariant', async () => {
    const f = OFF_CENTRE_COURTYARD;
    const plan = planStorey(f, 0);
    const truth = (x: number, y: number): number => t30 * Math.min(Math.min(x, 650 - x, y - 150, 850 - y), Math.max(250 - x, x - 400, 250 - y, y - 600));
    const at = {x: 127.3, y: 251.7};
    expect(truth(at.x, at.y)).toBeCloseTo(101.7 * t30, 1);
    expect(runB(plan.building, {far: 'plane'}).eval(at)?.h ?? NaN).toBeCloseTo(101.7 * t30, 6);
    const b = await build(f);
    expect(Math.abs(roofTop(b, at.x, at.y) - (PLATE + 101.7 * t30))).toBeLessThanOrEqual(tol);
    expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
  });

  it('builds the Courtyard from COURTYARD_RECTS', () => {
    expect(fixtureByName('Courtyard').rings.map(r => r.rect)).toEqual(COURTYARD_RECTS);
  });
});

/** Which axis a case is mirrored on to give its partner. */
type Mirror = MirrorAxis;

/**
 * Journal findings 88 and 89 and decision 279's cases on the holed roof: the courtyard with its W wing jutting out
 * beside the band. Under the cut, which cut was taken decided whether an unrequested gable stood on the outline; with no
 * cut, every case here is all hip, so a Gable or a Cheek face would be a defect, and none is asked for. Each case is
 * checked against the mirror image of a partner layout, or against closed-form heights. The layouts the holed solve
 * refuses (`JutAlignedS`, `JutAlignedN`, `JutMidWall`, `BandRunsOnPastCut`, `JutBelowCutLine` and their mirrors) are
 * `HOLED_REFUSALS` entries.
 */
describe('the jut family on the holed roof (journal findings 88 and 89)', () => {
  describe('CourtyardJutWing, the user\'s input (journal finding 88)', () => {
    it('builds no Gable and no Cheek face, and keeps every invariant with genus 1', async () => {
      const b = await build(COURTYARD_JUT_WING);
      expect(gableOrCheek(b)).toEqual([]);
      expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
    });

    it('hips every Ring side as asked: every wall a hip at 30 degrees, and every Roof face at 30 degrees', async () => {
      for (const w of planStorey(COURTYARD_JUT_WING, 0).building.walls) {
        expect(w.form).toBe('hip');
        expect(Math.abs(w.tan - t30)).toBeLessThan(1e-12);
      }
      const roofs = (await build(COURTYARD_JUT_WING)).shell.faces.filter(f => f.tag.kind === 'Roof');
      expect(roofs.length).toBeGreaterThan(0);
      for (const f of roofs) expect(Math.abs(f.normal[2] - Math.cos(Math.PI / 6)), `Roof n=(${f.normal})`).toBeLessThan(1e-6);
    });

    // A 30 degree hip roof stands tan 30 times the wavefront's arrival time above the 250 cm plate. Each point's time is
    // read off the rectangles: the bands' ridges at half their 300 cm depth, the wing's at half its 400, its hip end 125
    // in from x = -250, and on x 0 to 150 the W wall's own slope, which the cut's defect stood up to 144.34 cm higher as
    // a gable (journal finding 89).
    it.each([
      ['the S band\'s ridge', 500, 150, 150], ['the N band\'s ridge', 500, 850, 150], ['the E wing\'s ridge', 850, 500, 150],
      ['the S band\'s ridge end by the E wing', 850, 150, 150], ['the wing\'s ridge, west of x = 0', -50, 500, 200],
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

  /** Journal finding 89's boundary cases that the holed solve roofs, each with its mirror partner. */
  const cases: [name: string, fixture: ShellFixture, axis: Mirror, genus: number][] = [
    ['CourtyardJutWing', COURTYARD_JUT_WING, 0, 1],
    ...[50, 200, 300, 500, 750].map((jut): [string, ShellFixture, Mirror, number] => [`JutWing${jut}`, jutWingFixture(`JutWing${jut}`, jut), 0, 1]),
    ['JutWing300h263', shellFixture('JutWing300h263', jutWingRects(300).map(r => ring(r, 0, 1, 30)), 263), 0, 1],
    ['JutWing250At45', jutWingFixture('JutWing250At45', 250, 45), 0, 1],
    ['JutWing300At45', jutWingFixture('JutWing300At45', 300, 45), 0, 1],
    ['JutWingTwoStoreys', jutWingFixture('JutWingTwoStoreys', 250, 30, [2, 2, 2, 2]), 0, 1],
    ['JutWingOneStoreyUnderU', jutWingFixture('JutWingOneStoreyUnderU', 250, 30, [2, 1, 2, 2]), 0, 1],
    ['JutWingTwoStoreysOverCourtyard', jutWingFixture('JutWingTwoStoreysOverCourtyard', 250, 30, [1, 2, 1, 1]), 0, 1],
    // The user's input mirrored in y: the same plan, its Rings in mirrored order.
    ['JutWingMirrorY', {...mirrorFixture(COURTYARD_JUT_WING, 1000, 1), name: 'JutWingMirrorY'}, 0, 1],
    // Transposed: the wing juts south.
    ['JutWingTransposed', courtyard('JutWingTransposed', [[0, 0, 300, 1000], [300, -250, 700, 300], [700, 0, 1000, 1000], [300, 700, 700, 1000]]), 1, 1],
  ];

  describe.each(cases)('%s', (_, f, axis, genus) => {
    const partner = mirrorFixture(f, 1000, axis);

    it('builds no Gable and no Cheek face, and keeps every invariant', async () => {
      const b = await build(f);
      expect(gableOrCheek(b)).toEqual([]);
      expect(invariantViolations(b, {genus, cheeks: 0})).toEqual([]);
    });

    it('is the mirror image of its partner', async () => {
      expect(mirrorDifferences((await build(f)).shell, (await build(partner)).shell, 1000, () => true, tol, axis).differences).toEqual([]);
    });
  });

  // Mirrored in x with the W wing widened to 350. Its x-mirror's heights are read in closed form instead.
  describe('JutWingMirrorX, the wing jutting east', () => {
    const f = courtyard('JutWingMirrorX', [[0, 0, 1000, 300], [700, 300, 1250, 700], [0, 700, 1000, 1000], [0, 300, 350, 700]]);

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

  it.each([
    ['a flush wing', jutWingFixture('JutWing0', 0)],
    ['the user\'s input mirrored in x, the wing jutting east', mirrorFixture(COURTYARD_JUT_WING, 1000)],
  ] as const)('%s builds no Gable and no Cheek face, and keeps every invariant', async (_, f) => {
    const b = await build(f);
    expect(gableOrCheek(b)).toEqual([]);
    expect(invariantViolations(b, {genus: 1, cheeks: 0})).toEqual([]);
  });
});

// Holed roof decisions 5 and 22: a gable's extent breaks at every vertex of the island's loops, a hole's included. The
// jut's S wall, y = 300 over x -250 to 0, gabled: its line runs on inside the W wing to the hole's corner, x = 300, and
// there enters the hole. Read from the outer loop's vertices alone, the walk would step from x = 0 to x = 1000 and stop
// at x = 0, since x = 500 is in the hole.
describe('a gable beside a courtyard runs its line to the hole (holed roof decision 22)', () => {
  const f = layout('JutWingSGabled', jutWingRects(250).map((r, i) => ring(r, 0, 1, 30, i === 1 ? {S: {form: 'gable'}} : {})));

  it('stands its piece over x -250 to 300 on y = 300, its extent ending at the hole\'s corner', () => {
    const plan = planStorey(f, 0);
    const pieces = plan.roof.pieces.filter(p => p.wall.a.y === 300 && p.wall.b.y === 300);
    expect(pieces.map(p => [p.bandLo, p.bandHi])).toEqual([[-250, 300]]);
  });
});
