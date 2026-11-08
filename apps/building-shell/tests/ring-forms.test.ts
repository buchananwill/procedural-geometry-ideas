// Spec decision 3 as amended (journal decision 116 and its addenda): roof forms authored per Ring side, derived onto the
// union walls, the lowest Ring index winning the whole wall's form and pitch. Journal decision 135, F6: every conflict
// fixture builds inside its own test, through `build`, so a crash fails that test alone and never skips the file.
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {RING_CONFLICT_FIXTURES, ShellFixture, fixtureByName, ring, storeyRings} from '../src/fixture.ts';
import {edgeLine, loopRuns, tanDeg, unionWallForms, wallSel} from '../src/ring-forms.ts';
import {Wall, pt, unionLoops} from '../src/roof/model.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {planStorey} from '../src/storey.ts';
import {invariantViolations} from './shell-invariants.ts';

/** Each fixture's build, made once, on the first test that asks for it. */
const builds = new Map<string, Promise<ShellBuild>>();
const build = (name: string): Promise<ShellBuild> => {
  let b = builds.get(name);
  if (!b) { b = buildShellDetailed(fixtureByName(name)); builds.set(name, b); }
  return b;
};

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

describe.each([
  ['FlushRingConflict', 'y', 0, 'hip', 'gable'],
  ['OverlapRingConflict', 'x', 1000, 'gable', 'hip'],
] as const)('%s (journal decision 116): the lowest index wins the whole wall', (name, axis, at, first, swapped) => {
  it(`gives every traced wall on ${axis} = ${at} the first Ring's form, ${first}, and swapping the indices gives ${swapped}`, () => {
    const a = wallsOn(fixtureByName(name), axis, at), s = wallsOn(fixtureByName(`${name}Swapped`), axis, at);
    expect(a.length).toBeGreaterThan(1);
    expect(a.map(w => w.form)).toEqual(a.map(() => first));
    expect(s.map(w => w.form)).toEqual(s.map(() => swapped));
  });

  it(`stands one Gable face over the whole wall only where it is gabled`, async () => {
    const n = axis === 'x' ? [1, 0, 0] : [0, -1, 0];
    const gables = async (f: string) => (await build(f)).shell.faces.filter(face => face.tag.kind === 'Gable' && face.normal.every((c, i) => Math.abs(c - n[i]) < 1e-9));
    const gabled = first === 'gable' ? name : `${name}Swapped`, hipped = first === 'gable' ? `${name}Swapped` : name;
    expect(await gables(hipped)).toEqual([]);
    const g = await gables(gabled);
    expect(g).toHaveLength(1);
    const along = g[0].loops[0].map(p => p[axis === 'x' ? 1 : 0]);
    expect(Math.min(...along)).toBeCloseTo(0, 6);
    expect(Math.max(...along)).toBeCloseTo(1000, 6);
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
  it('ThreeRingConflict: of three Rings on y = 0, index 0 wins the whole wall; rotated, the new index 0 does', () => {
    expectWall(wallsOn(fixtureByName('ThreeRingConflict'), 'y', 0), 'hip', 45);
    expectWall(wallsOn(fixtureByName('ThreeRingConflictSwapped'), 'y', 0), 'gable', 45);
  });

  it('DistantRingConflict: indices 0 and 3 disagree on y = 0, with two Rings between them, and index 0 wins', () => {
    expectWall(wallsOn(fixtureByName('DistantRingConflict'), 'y', 0), 'hip', 45);
    expectWall(wallsOn(fixtureByName('DistantRingConflictSwapped'), 'y', 0), 'gable', 45);
  });

  it('StoreyRingConflict: storey 0 takes its lowest index, storey 1 its only Ring, whatever the order', () => {
    expectWall(wallsOn(fixtureByName('StoreyRingConflict'), 'y', 0, 0), 'hip', 45);
    expectWall(wallsOn(fixtureByName('StoreyRingConflictSwapped'), 'y', 0, 0), 'gable', 45);
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

  it('CutPitchConflict: the shortest cut, collinear with 45 and 30 degree walls at its ends, is passed over', () => {
    for (const name of ['CutPitchConflict', 'CutPitchConflictSwapped']) {
      const cuts = planStorey(fixtureByName(name), 0).building.walls.filter(w => w.form === 'cut');
      expect(cuts.map(w => [w.a, w.b])).toEqual([[pt(1000, 300), pt(700, 300)], [pt(700, 300), pt(1000, 300)]]);
      for (const w of cuts) expect(close(w.tan, tanDeg(30))).toBe(true);
    }
  });
});
