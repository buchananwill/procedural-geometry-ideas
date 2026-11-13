// Spec decision 3 as amended (journal decision 116 and its addenda, then gable rise decisions 3 to 7): roof forms authored
// per Ring side, derived onto the union walls, the lowest Ring index winning each extent's form and the wall's one hip
// pitch; a gabled extent on a wall with a hip is a rise. Journal decision 135, F6: every conflict
// fixture builds inside its own test, through `build`, so a crash fails that test alone and never skips the file.
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {RING_CONFLICT_FIXTURES, ShellFixture, fixtureByName, ring, storeyRings} from '../src/fixture.ts';
import {PlanRefusal} from '../src/errors.ts';
import {edgeLine, loopRuns, ringSideLines, storeyLoops, tanDeg, unionWallForms, wallSel} from '../src/ring-forms.ts';
import {Wall, pt, unionLoops} from '../src/roof/model.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {planStorey} from '../src/storey.ts';
import {invariantViolations} from './shell-invariants.ts';
import {memoBuilds} from './test-builds.ts';

/** Each fixture's build, made once, on the first test that asks for it. */
const memo = memoBuilds();
const build = (name: string): Promise<ShellBuild> => memo(fixtureByName(name));

/** Storey `n`'s walls on one line: `x = at` or `y = at`. */
const wallsOn = (f: ShellFixture, axis: 'x' | 'y', at: number, n = 0): Wall[] =>
  planStorey(f, n).building.walls.filter(w => (axis === 'x' ? w.a.x === at && w.b.x === at : w.a.y === at && w.b.y === at));

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-12;

/** A conflict fixture's genus: 1 for the two courtyards, 0 for the rest. */
const genusOf = (name: string): number => (/^(HoleRing|CutPitch)Conflict/.test(name) ? 1 : 0);

describe('union walls (spec decision 3 as amended)', () => {
  it('are maximal straight runs, however many Ring corners break the traced outline', () => {
    // The L of ValleyWings: y = 0 is traced as two walls, broken at the second wing's corner x = 600, but is one run.
    const loops = unionLoops([[0, 0, 1000, 400], [600, 0, 1000, 1000]]);
    expect(loops).toHaveLength(1);
    const runs = loopRuns(loops[0]);
    expect(runs.filter(r => r.axis === 'y' && r.at === 0)).toEqual([{axis: 'y', at: 0, n: '+y', lo: 0, hi: 1000}]);
    expect(runs.filter(r => r.axis === 'x' && r.at === 1000)).toEqual([{axis: 'x', at: 1000, n: '-x', lo: 0, hi: 1000}]);
    expect(runs).toHaveLength(6);
  });

  it("read each loop edge's inward normal as roof-gable's Wall does: the footprint on its left", () => {
    expect(edgeLine(pt(0, 0), pt(10, 0)).n).toBe('+y');
    expect(edgeLine(pt(10, 0), pt(10, 10)).n).toBe('-x');
    expect(edgeLine(pt(10, 10), pt(0, 10)).n).toBe('-y');
    expect(edgeLine(pt(0, 10), pt(0, 0)).n).toBe('+x');
  });

  it("drop a buried side's form: gabling the side two Rings share changes nothing", () => {
    const plain: ShellFixture = {name: 'Plain', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 400], 0, 1, 45), ring([500, 0, 1000, 400], 0, 1, 45)]};
    const buried: ShellFixture = {...plain, name: 'Buried', rings: [ring([0, 0, 500, 400], 0, 1, 45, {E: {form: 'gable', deg: 60}}), plain.rings[1]]};
    const sels = (f: ShellFixture) => unionWallForms(storeyRings(f, 0), unionLoops(f.rings.map(r => r.rect))).map(wallSel);
    expect(sels(buried)).toEqual(sels(plain));
  });
});

describe('gable rise decisions 1 and 5 as amended (journal decision 209)', () => {
  const wallOn = (f: ShellFixture, axis: 'x' | 'y', at: number) => {
    const rings = storeyRings(f, 0);
    const w = unionWallForms(rings, storeyLoops(rings.map(r => r.ring.rect))).find(x => x.axis === axis && x.at === at);
    if (!w) throw new Error(`no wall ${axis} = ${at}`);
    return w;
  };
  const gable = (deg: number) => ({S: {form: 'gable' as const, deg}});

  // H1: the merge of adjacent gable extents across Rings keeps the lowest index. Index 2's [0, 300] merges with index
  // 0's [300, 600], both at 45°; index 1's [600, 900] stands at 60°. Decision 5 gives the wall index 0's 45°.
  it('H1: a whole-wall gable takes its lowest-index extent\'s pitch when that extent merged with a higher index\'s', () => {
    const f: ShellFixture = {name: 'MergedGables', cellSize: 50, storeyHeight: 250, rings: [
      ring([300, 0, 600, 500], 0, 1, 45, gable(45)), ring([600, 0, 900, 500], 0, 1, 45, gable(60)), ring([0, 0, 300, 500], 0, 1, 45, gable(45)),
    ]};
    expect(wallOn(f, 'y', 0)).toMatchObject({form: 'gable', deg: 45});
    expectWall(wallsOn(f, 'y', 0), 'gable', 45);
  });

  // M2: within one Ring, the first extent along that side's own direction wins, so every compass side gives one answer.
  it.each(['S', 'E', 'N', 'W'] as const)('M2: one side gabled at 20° with a 70° run over its second half takes 20° on %s', side => {
    const f: ShellFixture = {name: `TwoGablePitches${side}`, cellSize: 50, storeyHeight: 250, rings: [
      ring([0, 0, 500, 500], 0, 1, 45, {[side]: {form: 'gable', deg: 20, runs: [{from: 250, to: 500, form: 'gable', deg: 70}]}}),
    ]};
    const line = ringSideLines([0, 0, 500, 500])[side];
    expect(wallOn(f, line.axis, line.at)).toMatchObject({form: 'gable', deg: 20});
  });

  // L2: a side's runs are checked in memory, each refusal naming its Ring, side and run.
  it.each([
    ['outside its side', [{from: 900, to: 1100}], /Ring 0 side S run 0 spans 900 to 1100 cm: a run lies inside its side, 0 to 1000 cm/],
    ['of zero length', [{from: 400, to: 400}], /Ring 0 side S run 0 spans 400 to 400 cm: a run is not empty/],
    ['out of order', [{from: 600, to: 800}, {from: 200, to: 300}], /Ring 0 side S run 1 spans 200 to 300 cm: runs are listed in order along their side, and run 0 starts at 600 cm/],
    ['overlapping another', [{from: 200, to: 500}, {from: 400, to: 600}], /Ring 0 side S run 1 spans 400 to 600 cm: runs do not overlap, and run 0 ends at 500 cm/],
  ] as const)('L2: refuses a run %s as a PlanRefusal', (_, spans, message) => {
    const f: ShellFixture = {name: 'BadRuns', cellSize: 50, storeyHeight: 250, rings: [
      ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: spans.map(s => ({...s, form: 'gable' as const}))}}),
    ]};
    expect(() => wallOn(f, 'y', 0)).toThrow(PlanRefusal);
    expect(() => wallOn(f, 'y', 0)).toThrow(message);
  });
});

describe.each(RING_CONFLICT_FIXTURES.map(f => [f.name] as const))('%s', name => {
  it("builds and keeps spec decision 32's invariants", async () => {
    expect(invariantViolations(await build(name), {genus: genusOf(name), cheeks: 0})).toEqual([]);
  });
});

/** Every traced wall on a line takes one form and one pitch. */
const expectWall = (ws: Wall[], form: Wall['form'], deg: number): void => {
  expect(ws.length).toBeGreaterThan(1);
  for (const w of ws) {
    expect(w.form).toBe(form);
    expect(close(w.tan, tanDeg(deg))).toBe(true);
  }
};

/** Storey `n`'s rises on the union wall `axis = at`, as `[lo, hi]` stretches, from gable rise decision 3's derivation. */
const risesOn = (f: ShellFixture, axis: 'x' | 'y', at: number, n = 0): number[][] => {
  const rings = storeyRings(f, n);
  const w = unionWallForms(rings, storeyLoops(rings.map(r => r.ring.rect))).filter(x => x.axis === axis && x.at === at);
  return w.flatMap(x => (x.rises ?? []).map(r => [r.lo, r.hi]));
};

/** The Gable faces of a build facing outward along `n`, with their extent along the wall. */
const gablesFacing = async (name: string, axis: 'x' | 'y', n: number[]): Promise<number[][]> =>
  (await build(name)).shell.faces.filter(face => face.tag.kind === 'Gable' && face.normal.every((c, i) => Math.abs(c - n[i]) < 1e-9))
    .map(g => { const along = g.loops[0].map(p => p[axis === 'x' ? 1 : 0]); return [Math.min(...along), Math.max(...along)]; });

/**
 * Gable rise decision 3 (WP-G2), which amends journal decision 116's whole-wall rule: the lowest index wins each point of
 * the wall, not the whole wall. A gabled Ring's own stretch is a rise on a wall that enters the solve as a hip.
 */
describe.each([
  ['FlushRingConflict', 'y', 0, [0, -1, 0], [[500, 1000]], [[500, 1000]]],
  ['OverlapRingConflict', 'x', 1000, [1, 0, 0], [[0, 400]], []],
] as const)('%s (gable rise decision 3): the lowest index wins each extent, and a gabled extent is a rise', (name, axis, at, n, rises, swappedRises) => {
  it(`enters the solve as a hip on ${axis} = ${at} whatever the order, with its gabled Ring's stretch a rise`, () => {
    for (const [f, want] of [[name, rises], [`${name}Swapped`, swappedRises]] as const) {
      const ws = wallsOn(fixtureByName(f), axis, at);
      expect(ws.length).toBeGreaterThan(1);
      expect(ws.map(w => w.form)).toEqual(ws.map(() => 'hip'));
      expect(risesOn(fixtureByName(f), axis, at)).toEqual(want);
    }
  });

  it('stands one Gable face over each rise, and none where the hip wins the stretch', async () => {
    for (const [f, want] of [[name, rises], [`${name}Swapped`, swappedRises]] as const) {
      const g = await gablesFacing(f, axis, [...n]);
      expect(g).toHaveLength(want.length);
      g.forEach((span, k) => { expect(span[0]).toBeCloseTo(want[k][0], 6); expect(span[1]).toBeCloseTo(want[k][1], 6); });
    }
  });
});

describe('PitchRingConflict (journal decision 116, addendum): pitch follows the same rule', () => {
  it("gives every traced wall on y = 0 the first Ring's pitch, 30 degrees, and swapping the indices gives 45", () => {
    expectWall(wallsOn(fixtureByName('PitchRingConflict'), 'y', 0), 'hip', 30);
    expectWall(wallsOn(fixtureByName('PitchRingConflictSwapped'), 'y', 0), 'hip', 45);
  });

  it("slopes the whole y = 0 roof at the winner's pitch", async () => {
    for (const [f, deg] of [['PitchRingConflict', 30], ['PitchRingConflictSwapped', 45]] as const) {
      const facing = (await build(f)).shell.faces.filter(face => face.tag.kind === 'Roof' && face.normal[1] < -SHELL_TOLERANCE_CM && Math.abs(face.normal[0]) < 1e-9);
      expect(facing).toHaveLength(1);
      const r = (deg * Math.PI) / 180;
      expect(facing[0].normal[1]).toBeCloseTo(-Math.sin(r), 9);
      expect(facing[0].normal[2]).toBeCloseTo(Math.cos(r), 9);
    }
  });
});

describe('journal decision 135, F6: the conflict pairs beyond two adjacent Rings', () => {
  // Gable rise decisions 3 and 4 (WP-G2): each Ring wins its own stretch; the wall's one hip pitch is its lowest-index hip
  // extent's, so rotating the indices moves the pitch, 45 to 30, and never the rise.
  it('ThreeRingConflict: of three Rings on y = 0 each wins its own stretch; the gabled one is a rise, the hip pitch the lowest-index hip\'s', () => {
    expectWall(wallsOn(fixtureByName('ThreeRingConflict'), 'y', 0), 'hip', 45);
    expectWall(wallsOn(fixtureByName('ThreeRingConflictSwapped'), 'y', 0), 'hip', 30);
    for (const name of ['ThreeRingConflict', 'ThreeRingConflictSwapped']) expect(risesOn(fixtureByName(name), 'y', 0)).toEqual([[300, 600]]);
  });

  it('DistantRingConflict: indices 0 and 3 share y = 0 with two Rings between them, and each wins its own half', () => {
    for (const name of ['DistantRingConflict', 'DistantRingConflictSwapped']) {
      expectWall(wallsOn(fixtureByName(name), 'y', 0), 'hip', 45);
      expect(risesOn(fixtureByName(name), 'y', 0)).toEqual([[500, 1000]]);
    }
  });

  it('StoreyRingConflict: storey 0 takes each stretch\'s lowest index, storey 1 its only Ring, whatever the order', () => {
    expectWall(wallsOn(fixtureByName('StoreyRingConflict'), 'y', 0, 0), 'hip', 45);
    expect(risesOn(fixtureByName('StoreyRingConflict'), 'y', 0, 0)).toEqual([]);
    expectWall(wallsOn(fixtureByName('StoreyRingConflictSwapped'), 'y', 0, 0), 'hip', 45);
    expect(risesOn(fixtureByName('StoreyRingConflictSwapped'), 'y', 0, 0)).toEqual([[0, 500]]);
    for (const name of ['StoreyRingConflict', 'StoreyRingConflictSwapped']) {
      expect(wallsOn(fixtureByName(name), 'y', 0, 1).map(w => w.form)).toEqual(['gable']);
    }
  });

  it("HoleRingConflict: the hole's S wall takes its lowest index's pitch, and so does the cut collinear with it", () => {
    for (const [name, deg] of [['HoleRingConflict', 30], ['HoleRingConflictSwapped', 45]] as const) {
      const walls = planStorey(fixtureByName(name), 0).building.walls;
      const hole = walls.filter(w => w.a.y === 300 && w.b.y === 300 && w.form !== 'cut' && Math.min(w.a.x, w.b.x) >= 300);
      expect(hole.length).toBeGreaterThan(0);
      for (const w of hole) expect(close(w.tan, tanDeg(deg))).toBe(true);
      const cuts = walls.filter(w => w.form === 'cut');
      expect(cuts).toHaveLength(2);
      for (const w of cuts) expect(close(w.tan, tanDeg(deg))).toBe(true);
    }
  });

  // Journal decision 167, finding 4: the pair moves the shell. The shortest cut is passed over in both, and the next takes
  // the hole's S wall's pitch, which the lowest index decides.
  it("CutPitchConflict: the shortest cut, collinear with walls of different pitch at its ends, is passed over, and the next takes the lowest index's pitch", () => {
    for (const [name, deg] of [['CutPitchConflict', 30], ['CutPitchConflictSwapped', 60]] as const) {
      const walls = planStorey(fixtureByName(name), 0).building.walls;
      const hole = walls.filter(w => w.a.y === 300 && w.b.y === 300 && w.form !== 'cut' && Math.min(w.a.x, w.b.x) >= 300 && Math.max(w.a.x, w.b.x) <= 700);
      expect(hole.length).toBeGreaterThan(0);
      for (const w of hole) expect(close(w.tan, tanDeg(deg))).toBe(true);
      const cuts = walls.filter(w => w.form === 'cut');
      expect(cuts.map(w => [w.a, w.b])).toEqual([[pt(1000, 300), pt(700, 300)], [pt(700, 300), pt(1000, 300)]]);
      for (const w of cuts) expect(close(w.tan, tanDeg(deg))).toBe(true);
    }
  });
});
