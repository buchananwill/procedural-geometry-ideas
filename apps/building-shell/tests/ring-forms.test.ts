// Spec decision 3 as amended (journal decision 116 and its addenda): roof forms authored per Ring side, derived onto the
// union walls, the lowest Ring index winning the whole wall's form and pitch.
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {RING_CONFLICT_FIXTURES, ShellFixture, fixtureByName, ring, storeyRings} from '../src/fixture.ts';
import {edgeLine, loopRuns, tanDeg, unionWallForms, wallSel} from '../src/ring-forms.ts';
import {Wall, pt, unionLoops} from '../src/roof/model.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {planStorey} from '../src/storey.ts';
import {invariantViolations} from './shell-invariants.ts';

const builds = new Map<string, ShellBuild>();
beforeAll(async () => {
  for (const f of RING_CONFLICT_FIXTURES) builds.set(f.name, await buildShellDetailed(f));
}, 60_000);
const get = (name: string): ShellBuild => {
  const b = builds.get(name);
  if (!b) throw new Error(`no shell built for ${name}`);
  return b;
};

/** Storey 0's walls on one line: `x = at` or `y = at`. */
const wallsOn = (f: ShellFixture, axis: 'x' | 'y', at: number): Wall[] =>
  planStorey(f, 0).building.walls.filter(w => (axis === 'x' ? w.a.x === at && w.b.x === at : w.a.y === at && w.b.y === at));

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-12;

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

  it.each([name, `${name}Swapped`])("%s keeps spec decision 32's invariants", n => {
    expect(invariantViolations(get(n), {genus: 0, cheeks: 0})).toEqual([]);
  });

  it(`stands one Gable face over the whole wall only where it is gabled`, () => {
    const n = axis === 'x' ? [1, 0, 0] : [0, -1, 0];
    const gables = (f: string) => get(f).shell.faces.filter(face => face.tag.kind === 'Gable' && face.normal.every((c, i) => Math.abs(c - n[i]) < 1e-9));
    const gabled = first === 'gable' ? name : `${name}Swapped`, hipped = first === 'gable' ? `${name}Swapped` : name;
    expect(gables(hipped)).toEqual([]);
    const g = gables(gabled);
    expect(g).toHaveLength(1);
    const along = g[0].loops[0].map(p => p[axis === 'x' ? 1 : 0]);
    expect(Math.min(...along)).toBeCloseTo(0, 6);
    expect(Math.max(...along)).toBeCloseTo(1000, 6);
  });
});

describe('PitchRingConflict (journal decision 116, addendum): pitch follows the same rule', () => {
  it("gives every traced wall on y = 0 the first Ring's pitch, 30 degrees, and swapping the indices gives 45", () => {
    for (const [f, deg] of [['PitchRingConflict', 30], ['PitchRingConflictSwapped', 45]] as const) {
      const ws = wallsOn(fixtureByName(f), 'y', 0);
      expect(ws.length).toBeGreaterThan(1);
      for (const w of ws) { expect(w.form).toBe('hip'); expect(close(w.tan, tanDeg(deg))).toBe(true); }
    }
  });

  it.each(['PitchRingConflict', 'PitchRingConflictSwapped'])("%s keeps spec decision 32's invariants", n => {
    expect(invariantViolations(get(n), {genus: 0, cheeks: 0})).toEqual([]);
  });

  it("slopes the whole y = 0 roof at the winner's pitch", () => {
    for (const [f, deg] of [['PitchRingConflict', 30], ['PitchRingConflictSwapped', 45]] as const) {
      const facing = get(f).shell.faces.filter(face => face.tag.kind === 'Roof' && face.normal[1] < -SHELL_TOLERANCE_CM && Math.abs(face.normal[0]) < 1e-9);
      expect(facing).toHaveLength(1);
      const r = (deg * Math.PI) / 180;
      expect(facing[0].normal[1]).toBeCloseTo(-Math.sin(r), 9);
      expect(facing[0].normal[2]).toBeCloseTo(Math.cos(r), 9);
    }
  });
});
