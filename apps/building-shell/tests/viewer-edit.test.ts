// Viewer editing decisions 1 to 5 and gates 1 and 2 of decision 23: the pure edit functions, and `ringBox`.
import {describe, expect, it} from 'vitest';
import {EXPORTED_FIXTURES, RING_SIDES, RISE_FIXTURES, RingSide, SHELL_FIXTURES, ShellFixture, ring} from '../src/fixture.ts';
import {runSpan} from '../src/ring-forms.ts';
import type {Rect} from '../src/roof/model.ts';
import {writeInput} from '../src/wire/input-adapter.ts';
import {resolveSides, validate} from '../src/viewer/draft.ts';
import {
  addRing, addRun, cloneFixture, clearSide, duplicateRing, moveRing, pinListedPitches, removeRing, removeRun, ringBox, setBaseStorey,
  setDefaultDeg, setRect, setRectCoord, setRunForm, setRunFrom, setRunPitch, setRunTo, setSideForm, setSidePitch, setStoreyHeight, setStoreys,
  middleThird, sideLengthCm, snapToCell, writtenRunSources,
} from '../src/viewer/edit.ts';

/** Freezes a value and everything under it, so any write to it throws (modules are strict). */
function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const child of Object.values(v)) deepFreeze(child);
  }
  return v;
}

/** One edit, named, as it is made on Ring `i` (or on the fixture) of a fixture. */
interface EditCase { name: string; apply: (f: ShellFixture, i: number) => ShellFixture }

/**
 * Every edit function with values that are in range for the wire (decision 23's second gate): a pitch in 7 to 75, a rect
 * on the grid with positive area, storeys of at least 1.
 */
const IN_RANGE_EDITS: EditCase[] = [
  {name: 'addRing (beside Ring i)', apply: (f, i) => addRing(f, i)},
  {name: 'addRing (no selection)', apply: f => addRing(f)},
  {name: 'duplicateRing', apply: (f, i) => duplicateRing(f, i)},
  {name: 'moveRing up', apply: (f, i) => moveRing(f, i, -1)},
  {name: 'moveRing down', apply: (f, i) => moveRing(f, i, 1)},
  {name: 'setRect (moved east)', apply: (f, i) => { const [a, b, c, d] = f.rings[i].rect; return setRect(f, i, [a + 50, b, c + 50, d]); }},
  {name: 'setRect (widened)', apply: (f, i) => { const [a, b, c, d] = f.rings[i].rect; return setRect(f, i, [a, b, c + 100, d + 50]); }},
  {name: 'setRect (off the grid, snapped)', apply: (f, i) => { const [a, b, c, d] = f.rings[i].rect; return setRect(f, i, [a + 12, b - 7, c + 61, d + 3]); }},
  {name: 'setBaseStorey 0', apply: (f, i) => setBaseStorey(f, i, 0)},
  {name: 'setBaseStorey 2', apply: (f, i) => setBaseStorey(f, i, 2)},
  {name: 'setStoreys 1', apply: (f, i) => setStoreys(f, i, 1)},
  {name: 'setStoreys 3', apply: (f, i) => setStoreys(f, i, 3)},
  {name: 'setDefaultDeg 7', apply: (f, i) => setDefaultDeg(f, i, 7)},
  {name: 'setDefaultDeg 22.5', apply: (f, i) => setDefaultDeg(f, i, 22.5)},
  {name: 'setDefaultDeg 75', apply: (f, i) => setDefaultDeg(f, i, 75)},
  ...RING_SIDES.flatMap((side): EditCase[] => [
    {name: `setSideForm ${side} gable`, apply: (f, i) => setSideForm(f, i, side, 'gable')},
    {name: `setSideForm ${side} hip`, apply: (f, i) => setSideForm(f, i, side, 'hip')},
    {name: `setSidePitch ${side} 7`, apply: (f, i) => setSidePitch(f, i, side, 7)},
    {name: `setSidePitch ${side} 52.5`, apply: (f, i) => setSidePitch(f, i, side, 52.5)},
    {name: `setSidePitch ${side} 75`, apply: (f, i) => setSidePitch(f, i, side, 75)},
    {name: `clearSide ${side}`, apply: (f, i) => clearSide(f, i, side)},
  ]),
  {name: 'setStoreyHeight 300', apply: f => setStoreyHeight(f, 300)},
  {name: 'setStoreyHeight 250', apply: f => setStoreyHeight(f, 250)},
];

/** Removing a Ring is in range only while another Ring is left: the wire refuses a fixture with none. */
const REMOVE: EditCase = {name: 'removeRing', apply: (f, i) => removeRing(f, i)};

const roster = SHELL_FIXTURES;

describe('every roster fixture is a valid draft to start from', () => {
  for (const f of EXPORTED_FIXTURES) {
    it(f.name, () => {
      expect(validate(f)).toEqual({ok: true});
    });
  }
});

describe('gate 1: every edit function leaves its input unchanged (decision 23)', () => {
  for (const f of roster) {
    it(`${f.name}: no edit writes to its argument, and none shares a Ring with it`, () => {
      const frozen = deepFreeze(cloneFixture(f));
      const before = JSON.stringify(frozen);
      const edits = [...IN_RANGE_EDITS, REMOVE];
      for (const e of edits) {
        for (let i = 0; i < frozen.rings.length; i++) {
          const next = e.apply(frozen, i);
          expect(next, e.name).not.toBe(frozen);
          next.rings.forEach(r => {
            expect(frozen.rings.includes(r), `${e.name}: a Ring is shared`).toBe(false);
            expect(frozen.rings.some(o => o.rect === r.rect || (o.sides !== undefined && o.sides === r.sides)), `${e.name}: a rect or sides object is shared`).toBe(false);
          });
        }
      }
      expect(JSON.stringify(frozen)).toBe(before);
    });
  }

  it('the empty fixture is left alone too', () => {
    const empty = deepFreeze<ShellFixture>({name: 'e', cellSize: 50, storeyHeight: 250, rings: []});
    expect(addRing(empty).rings).toHaveLength(1);
    expect(empty.rings).toHaveLength(0);
  });
});

describe('gate 2: an in-range edit of a valid roster fixture is a valid draft (decision 23)', () => {
  for (const f of roster) {
    it(`${f.name}: every in-range edit passes the wire`, () => {
      const failures: string[] = [];
      const edits = f.rings.length > 1 ? [...IN_RANGE_EDITS, REMOVE] : IN_RANGE_EDITS;
      for (const e of edits) {
        for (let i = 0; i < f.rings.length; i++) {
          const v = validate(e.apply(f, i));
          if (!v.ok) failures.push(`${e.name} on Ring ${i}: ${v.errors[0]}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

describe('the edit set (decision 2)', () => {
  const two = (): ShellFixture => ({
    name: 'two', cellSize: 50, storeyHeight: 250,
    rings: [ring([0, 0, 600, 400], 0, 1, 30, {S: {form: 'gable'}}), ring([600, 100, 1000, 500], 1, 2, 45)],
  });

  it('adds a 500 x 500 hip Ring at 45 degrees, one storey, base 0, beside the selected Ring\'s east side (decision 4)', () => {
    const next = addRing(two(), 0);
    expect(next.rings).toHaveLength(3);
    // Literal values, not the constants the function reads, so a changed constant fails here.
    expect(next.rings[2]).toEqual({rect: [600, 0, 1100, 500], baseStorey: 0, storeys: 1, defaultDeg: 45, sides: {}});
    const alone = addRing({name: 'e', cellSize: 50, storeyHeight: 250, rings: []}).rings[0];
    expect(alone).toEqual({rect: [0, 0, 500, 500], baseStorey: 0, storeys: 1, defaultDeg: 45, sides: {}});
    expect(validate(addRing({name: 'e', cellSize: 50, storeyHeight: 250, rings: []}))).toEqual({ok: true});
    expect(addRing(two(), 1).rings[2].rect).toEqual([1000, 100, 1500, 600]);
  });

  it('places a new Ring at the origin when the fixture is empty, and beside the last Ring with no selection', () => {
    const empty: ShellFixture = {name: 'e', cellSize: 50, storeyHeight: 250, rings: []};
    expect(addRing(empty).rings[0].rect).toEqual([0, 0, 500, 500]);
    expect(addRing(two()).rings[2].rect).toEqual([1000, 100, 1500, 600]);
  });

  it('refuses a Ring that does not exist as a RangeError', () => {
    expect(() => addRing(two(), 5)).toThrow(RangeError);
    expect(() => removeRing(two(), -1)).toThrow(RangeError);
    expect(() => setStoreys(two(), 2, 1)).toThrow(RangeError);
  });

  it('removes a Ring, and the Rings after it move up', () => {
    const next = removeRing(two(), 0);
    expect(next.rings).toHaveLength(1);
    expect(next.rings[0].rect).toEqual([600, 100, 1000, 500]);
  });

  it('duplicates a Ring as an exact deep copy right after it', () => {
    const f = two();
    const next = duplicateRing(f, 0);
    expect(next.rings.map(r => r.rect)).toEqual([[0, 0, 600, 400], [0, 0, 600, 400], [600, 100, 1000, 500]]);
    expect(next.rings[1]).toEqual(f.rings[0]);
    expect(next.rings[1].sides).not.toBe(next.rings[0].sides);
  });

  it('snaps rect coordinates to the cell size and never leaves a negative zero (decision 5)', () => {
    expect(setRect(two(), 0, [24, 26, 623, 401]).rings[0].rect).toEqual([0, 50, 600, 400]);
    const zero = setRect(two(), 0, [-10, -20, 600, 400]).rings[0].rect;
    expect(Object.is(zero[0], 0) && Object.is(zero[1], 0)).toBe(true);
    expect(snapToCell(75, 50)).toBe(100);
    expect(snapToCell(74.9, 50)).toBe(50);
    const coarse = {...two(), cellSize: 100};
    expect(setRect(coarse, 0, [140, 0, 600, 400]).rings[0].rect).toEqual([100, 0, 600, 400]);
  });

  it('does not reorder or repair a rect: an inverted one is left for the wire to refuse (decision 9)', () => {
    expect(setRect(two(), 0, [600, 0, 0, 400]).rings[0].rect).toEqual([600, 0, 0, 400]);
  });

  it('sets base storey, storeys, default pitch and storey height without touching anything else', () => {
    const f = two();
    expect(setBaseStorey(f, 1, 3).rings[1]).toEqual({...f.rings[1], baseStorey: 3});
    expect(setStoreys(f, 1, 4).rings[1]).toEqual({...f.rings[1], storeys: 4});
    expect(setDefaultDeg(f, 0, 33.5).rings[0]).toEqual({...f.rings[0], defaultDeg: 33.5});
    expect(setStoreyHeight(f, 300).storeyHeight).toBe(300);
    expect(setStoreyHeight(f, 300).rings).toEqual(f.rings);
  });

  it('does not clamp or snap a pitch: 3 and 22.25 are stored as typed (decisions 5 and 9)', () => {
    expect(setDefaultDeg(two(), 0, 3).rings[0].defaultDeg).toBe(3);
    expect(setDefaultDeg(two(), 0, 22.25).rings[0].defaultDeg).toBe(22.25);
    expect(setSidePitch(two(), 0, 'N', 90).rings[0].sides?.N).toEqual({form: 'hip', deg: 90});
  });

  it('sets one side\'s form, keeping its pitch, and one side\'s pitch, keeping its form', () => {
    const f = two();
    const pitched = setSidePitch(f, 0, 'S', 40);
    expect(pitched.rings[0].sides?.S).toEqual({form: 'gable', deg: 40});
    expect(setSideForm(pitched, 0, 'S', 'hip').rings[0].sides?.S).toEqual({form: 'hip', deg: 40});
    expect(setSidePitch(f, 0, 'W', 20).rings[0].sides?.W).toEqual({form: 'hip', deg: 20});
  });

  it('choosing a form on a side pins its pitch at the value it has now, so a listed side always carries its own (journal decision 198, M1)', () => {
    const f = two();
    // E is not listed: it reads the Ring's 30, and choosing gable pins 30.
    expect(setSideForm(f, 0, 'E', 'gable').rings[0].sides?.E).toEqual({form: 'gable', deg: 30});
    // Choosing hip on an unlisted side lists it too, at 30.
    expect(setSideForm(f, 0, 'N', 'hip').rings[0].sides?.N).toEqual({form: 'hip', deg: 30});
    // The pin does not move when the default does afterwards; an unlisted side's pitch does.
    const pinned = setDefaultDeg(setSideForm(f, 0, 'E', 'gable'), 0, 50);
    expect(resolveSides(pinned.rings[0]).E).toEqual({form: 'gable', deg: 30});
    expect(resolveSides(pinned.rings[0]).N).toEqual({form: 'hip', deg: 50});
    // "Default" unlists the side, back to a hip at the Ring's pitch.
    expect(clearSide(pinned, 0, 'E').rings[0].sides?.E).toBeUndefined();
    expect(resolveSides(clearSide(pinned, 0, 'E').rings[0]).E).toEqual({form: 'hip', deg: 50});
  });

  it('pinListedPitches gives every listed side its own pitch without changing what any side resolves to', () => {
    const f = two();
    const pinned = pinListedPitches(f);
    expect(pinned.rings[0].sides).toEqual({S: {form: 'gable', deg: 30}});
    expect(pinned.rings.map(r => resolveSides(r))).toEqual(f.rings.map(r => resolveSides(r)));
    expect(f.rings[0].sides).toEqual({S: {form: 'gable'}});
  });

  it('sets one rect coordinate and leaves the other three as they are, off the grid or not (journal decision 198, Low 4)', () => {
    // A rect off the grid, as a loaded file may hold one: x0 = 12.5 and y0 = 7 are not multiples of 50.
    const f: ShellFixture = {name: 'o', cellSize: 50, storeyHeight: 250, rings: [ring([12.5, 7, 612.5, 407], 0, 1, 45)]};
    expect(setRectCoord(f, 0, 2, 620).rings[0].rect).toEqual([12.5, 7, 600, 407]);
    expect(setRectCoord(f, 0, 0, 74).rings[0].rect).toEqual([50, 7, 612.5, 407]);
    expect(setRectCoord(f, 0, 3, 430).rings[0].rect).toEqual([12.5, 7, 612.5, 450]);
    expect(setRectCoord(f, 0, 1, -10).rings[0].rect.map(v => Object.is(v, -0))).toEqual([false, false, false, false]);
  });

  it('copies by spread, so a field a Ring or a fixture gains later is copied with it (journal decision 198, B4)', () => {
    const extended = Object.assign(ring([0, 0, 500, 500], 0, 1, 45, {S: Object.assign({form: 'gable' as const}, {tag: 'x'})}), {note: 'n'});
    const f = Object.assign({name: 'x', cellSize: 50, storeyHeight: 250, rings: [extended]}, {extra: 1});
    const copy = cloneFixture(f);
    expect(copy).toEqual(f);
    expect(copy).toHaveProperty('extra', 1);
    expect(copy.rings[0]).toHaveProperty('note', 'n');
    expect(copy.rings[0].sides?.S).toHaveProperty('tag', 'x');
    expect(copy.rings[0]).not.toBe(extended);
    expect(copy.rings[0].sides).not.toBe(extended.sides);
  });

  it('clears one side back to the default, and clearing an unlisted side changes nothing', () => {
    const f = two();
    expect(clearSide(f, 0, 'S').rings[0].sides).toEqual({});
    expect(clearSide(f, 1, 'S')).toEqual(f);
  });

  it('moves a Ring up or down the index order, and a Ring at either end stays', () => {
    const f = two();
    expect(moveRing(f, 1, -1).rings.map(r => r.rect[0])).toEqual([600, 0]);
    expect(moveRing(f, 0, 1).rings.map(r => r.rect[0])).toEqual([600, 0]);
    expect(moveRing(f, 0, -1)).toEqual(f);
    expect(moveRing(f, 1, 1)).toEqual(f);
  });
});

describe('ringBox (decision 15)', () => {
  it('stands from the base storey\'s floor to the top storey\'s plate', () => {
    const f: ShellFixture = {name: 'b', cellSize: 50, storeyHeight: 250, rings: [ring([0, 50, 600, 400], 1, 2, 45)]};
    expect(ringBox(f, 0)).toEqual({rect: [0, 50, 600, 400], zLo: 250, zHi: 750});
  });
});

// ---- The run list (journal decision 210) -------------------------------------------------------------------------------------

/** One edit of one side's runs, named, as it is made on Ring `i` and `side` of a fixture. */
interface RunEdit { name: string; needsRun: boolean; apply: (f: ShellFixture, i: number, side: RingSide) => ShellFixture }

const runsOf = (f: ShellFixture, i: number, side: RingSide): number => f.rings[i].sides?.[side]?.runs?.length ?? 0;

/** Every run edit, with whether it needs a side that already has a run. */
const RUN_EDITS: RunEdit[] = [
  {name: 'addRun', needsRun: false, apply: (f, i, s) => addRun(f, i, s)},
  {name: 'removeRun', needsRun: true, apply: (f, i, s) => removeRun(f, i, s, 0)},
  {name: 'setRunFrom', needsRun: true, apply: (f, i, s) => setRunFrom(f, i, s, 0, 150)},
  {name: 'setRunTo', needsRun: true, apply: (f, i, s) => setRunTo(f, i, s, runsOf(f, i, s) - 1, 450)},
  {name: 'setRunForm', needsRun: true, apply: (f, i, s) => setRunForm(f, i, s, 0, 'hip')},
  {name: 'setRunPitch', needsRun: true, apply: (f, i, s) => setRunPitch(f, i, s, 0, 52.5)},
  {name: 'setSideForm', needsRun: false, apply: (f, i, s) => setSideForm(f, i, s, 'gable')},
  {name: 'setSidePitch', needsRun: false, apply: (f, i, s) => setSidePitch(f, i, s, 33)},
  {name: 'clearSide', needsRun: false, apply: (f, i, s) => clearSide(f, i, s)},
];

/** Every fixture a run can be edited on: the roster, and the fixtures that already have runs. */
const RUN_FIXTURES: readonly ShellFixture[] = [...SHELL_FIXTURES, ...RISE_FIXTURES];

describe('gate 1 for runs: every run edit leaves its input unchanged (journal decision 210)', () => {
  for (const f of RUN_FIXTURES) {
    it(`${f.name}: no run edit writes to its argument, and none shares a Ring, side or run with it`, () => {
      const frozen = deepFreeze(cloneFixture(f));
      const before = JSON.stringify(frozen);
      const shared = new Set<object>();
      for (const r of frozen.rings) {
        shared.add(r);
        shared.add(r.rect);
        if (r.sides) shared.add(r.sides);
        for (const s of Object.values(r.sides ?? {})) {
          shared.add(s);
          for (const run of s.runs ?? []) shared.add(run);
        }
      }
      let edited = 0;
      for (const e of RUN_EDITS) {
        frozen.rings.forEach((_, i) => {
          for (const side of RING_SIDES) {
            if (e.needsRun && !runsOf(frozen, i, side)) continue;
            const next = e.apply(frozen, i, side);
            edited++;
            expect(next, e.name).not.toBe(frozen);
            for (const r of next.rings) {
              expect(shared.has(r) || shared.has(r.rect) || (r.sides !== undefined && shared.has(r.sides)), `${e.name}: a Ring, rect or sides object is shared`).toBe(false);
              for (const s of Object.values(r.sides ?? {})) {
                expect(shared.has(s), `${e.name}: a side is shared`).toBe(false);
                for (const run of s.runs ?? []) expect(shared.has(run), `${e.name}: a run is shared`).toBe(false);
              }
            }
          }
        });
      }
      expect(edited).toBeGreaterThan(0);
      expect(JSON.stringify(frozen)).toBe(before);
    });
  }
});

describe('gate 3 for runs: setting a side\'s form or pitch keeps its runs; clearing it removes them (journal decision 210)', () => {
  const withRuns = RISE_FIXTURES.flatMap(f => f.rings.flatMap((r, i) => RING_SIDES.filter(s => r.sides?.[s]?.runs?.length).map(s => ({f, i, s}))));

  it('there are sides with runs to try it on', () => {
    expect(withRuns.length).toBeGreaterThan(8);
  });

  for (const {f, i, s} of withRuns) {
    it(`${f.name} Ring ${i} side ${s}`, () => {
      const runs = f.rings[i].sides?.[s]?.runs;
      expect(setSideForm(f, i, s, 'gable').rings[i].sides?.[s]?.runs).toEqual(runs);
      expect(setSideForm(f, i, s, 'hip').rings[i].sides?.[s]?.runs).toEqual(runs);
      expect(setSidePitch(f, i, s, 38).rings[i].sides?.[s]?.runs).toEqual(runs);
      expect(setSideForm(f, i, s, 'gable').rings[i].sides?.[s]?.form).toBe('gable');
      expect(setSidePitch(f, i, s, 38).rings[i].sides?.[s]?.deg).toBe(38);
      expect(clearSide(f, i, s).rings[i].sides?.[s]).toBeUndefined();
    });
  }
});

describe('the run edits (journal decision 210)', () => {
  const plain = (): ShellFixture => ({name: 'p', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 40)]});
  const runsAt = (f: ShellFixture, side: RingSide = 'S') => f.rings[0].sides?.[side]?.runs;

  it('adds a run over the middle third of the largest stretch no run covers, in the other form, at the side\'s pitch, and lists the side', () => {
    const one = addRun(plain(), 0, 'S');
    // The middle third of [0, 1000] is [333, 667], snapped inward to the 50 cm grid: both flanks keep the side's own form.
    expect(one.rings[0].sides?.S).toEqual({form: 'hip', deg: 40, runs: [{from: 350, to: 650, form: 'gable', deg: 40}]});
    // The two flanks tie at 350 cm, the first is taken: its middle third [117, 233] snaps to [150, 200]. The runs stay in order.
    expect(runsAt(addRun(one, 0, 'S'))?.map(r => [r.from, r.to])).toEqual([[150, 200], [350, 650]]);
    // A side wholly covered has no whole cell left: it is left as it was.
    const whole = setRunTo(setRunFrom(one, 0, 'S', 0, 0), 0, 'S', 0, 1000);
    expect(addRun(whole, 0, 'S')).toEqual(whole);
    // Shrunk to [300, 700], the next two take [100, 200] (middle of [0, 300]) and then [800, 900].
    const middle = setRunTo(setRunFrom(one, 0, 'S', 0, 300), 0, 'S', 0, 700);
    expect(runsAt(addRun(middle, 0, 'S'))?.map(r => [r.from, r.to])).toEqual([[100, 200], [300, 700]]);
    expect(runsAt(addRun(addRun(middle, 0, 'S'), 0, 'S'))?.map(r => [r.from, r.to])).toEqual([[100, 200], [300, 700], [800, 900]]);
  });

  it('middleThird keeps both flanks, and falls back to the whole stretch where no whole cell is left in the middle', () => {
    expect(middleThird([0, 1000], 50)).toEqual([350, 650]);
    expect(middleThird([650, 1000], 50)).toEqual([800, 850]);
    expect(middleThird([0, 100], 50)).toEqual([0, 100]);
    expect(middleThird([0, 150], 50)).toEqual([50, 100]);
  });

  it('adds a hip run on a gable side, and snaps the new run inward to the cell size', () => {
    const gableSide = setSideForm(plain(), 0, 'N', 'gable');
    expect(runsAt(addRun(gableSide, 0, 'N'), 'N')?.[0].form).toBe('hip');
    const off: ShellFixture = {name: 'o', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 40, {S: {form: 'hip', deg: 40, runs: [{from: 120, to: 480, form: 'gable', deg: 40}]}})]};
    // Uncovered: [0, 120] (snaps to [0, 100]) and [480, 1000] (snaps to [500, 1000]): the larger, of which the middle third is [700, 800].
    expect(runsAt(addRun(off, 0, 'S'))?.map(r => [r.from, r.to])).toEqual([[120, 480], [700, 800]]);
  });

  it('removes a run, and a side left with none is a plain side again, still listed', () => {
    const two = addRun(addRun(plain(), 0, 'S'), 0, 'S');
    expect(runsAt(two)?.map(r => r.from)).toEqual([150, 350]);
    expect(runsAt(removeRun(two, 0, 'S', 0))?.map(r => r.from)).toEqual([350]);
    const none = removeRun(removeRun(two, 0, 'S', 0), 0, 'S', 0);
    expect(none.rings[0].sides?.S).toEqual({form: 'hip', deg: 40});
    expect(Object.keys(none.rings[0].sides?.S ?? {})).not.toContain('runs');
  });

  it('sets a run\'s ends in cm from the side\'s start, snapped to the cell size, and does not reorder (decision 9)', () => {
    const f = addRun(plain(), 0, 'E');
    expect(runsAt(setRunFrom(f, 0, 'E', 0, 124), 'E')?.[0].from).toBe(100);
    expect(runsAt(setRunTo(f, 0, 'E', 0, 276), 'E')?.[0].to).toBe(300);
    expect(runsAt(setRunFrom(f, 0, 'E', 0, 900), 'E')?.[0]).toMatchObject({from: 900, to: 300});
  });

  it('sets a run\'s form and pitch, which is not clamped, and leaves the side and the other runs alone', () => {
    const f: ShellFixture = {name: 'm', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', deg: 45, runs: [
      {from: 100, to: 300, form: 'gable', deg: 50, maxHeight: 180}, {from: 500, to: 700, form: 'gable', deg: 60, limit: 'ridgeSlope'},
    ]}})]};
    const next = setRunPitch(setRunForm(f, 0, 'S', 1, 'hip'), 0, 'S', 1, 3);
    expect(next.rings[0].sides?.S?.runs?.[1]).toEqual({from: 500, to: 700, form: 'hip', deg: 3, limit: 'ridgeSlope'});
    expect(next.rings[0].sides?.S?.runs?.[0]).toEqual(f.rings[0].sides?.S?.runs?.[0]);
    expect(next.rings[0].sides).toMatchObject({S: {form: 'hip', deg: 45}});
  });

  it('keeps a run\'s maxHeight and limit through every edit that does not touch that run (journal decision 210)', () => {
    const f: ShellFixture = {name: 'm', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', deg: 45, runs: [
      {from: 100, to: 300, form: 'gable', deg: 50, maxHeight: 180, limit: 'ridgeSlope'}, {from: 500, to: 700, form: 'gable', deg: 60},
    ]}})]};
    const kept = f.rings[0].sides?.S?.runs?.[0];
    for (const next of [
      setRunFrom(f, 0, 'S', 1, 550), setRunTo(f, 0, 'S', 1, 650), setRunForm(f, 0, 'S', 1, 'hip'), setRunPitch(f, 0, 'S', 1, 55),
      setSideForm(f, 0, 'S', 'gable'), setSidePitch(f, 0, 'S', 35), addRun(f, 0, 'S'), duplicateRing(f, 0), moveRing(addRing(f), 0, 1),
    ]) {
      const runs = next.rings.flatMap(r => r.sides?.S?.runs ?? []);
      expect(runs.some(r => r.maxHeight === 180 && r.limit === 'ridgeSlope' && r.from === kept?.from), 'kept').toBe(true);
    }
    expect(removeRun(f, 0, 'S', 1).rings[0].sides?.S?.runs).toEqual([kept]);
  });

  it('refuses a run that does not exist as a RangeError', () => {
    expect(() => setRunFrom(plain(), 0, 'S', 0, 100)).toThrow(RangeError);
    expect(() => removeRun(addRun(plain(), 0, 'S'), 0, 'S', 3)).toThrow(RangeError);
    expect(() => addRun(plain(), 4, 'S')).toThrow(RangeError);
  });

  it('pins a run\'s pitch: pinListedPitches gives a run without one its side\'s', () => {
    const f: ShellFixture = {name: 'q', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: [{from: 0, to: 500, form: 'gable'}]}})]};
    expect(pinListedPitches(f).rings[0].sides?.S).toEqual({form: 'hip', deg: 45, runs: [{from: 0, to: 500, form: 'gable', deg: 45}]});
  });

  it('says where a side starts: sideLengthCm measures the side, and runSpan agrees with the panel\'s captions', () => {
    const rect: Rect = [100, 200, 700, 1000];
    expect(RING_SIDES.map(s => sideLengthCm(rect, s))).toEqual([600, 800, 600, 800]);
    // S from x0 toward east, E from y0 toward north, N from x1 toward west, W from y1 toward south.
    expect(runSpan(rect, 'S', {from: 0, to: 100})).toEqual([100, 200]);
    expect(runSpan(rect, 'E', {from: 0, to: 100})).toEqual([200, 300]);
    expect(runSpan(rect, 'N', {from: 0, to: 100})).toEqual([600, 700]);
    expect(runSpan(rect, 'W', {from: 0, to: 100})).toEqual([900, 1000]);
  });

  it('writtenRunSources lays the runs out as writeInput writes them, run for run', () => {
    const extra: ShellFixture = {name: 'x', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', deg: 45, runs: [
      {from: 0, to: 200, form: 'gable', deg: 45}, {from: 200, to: 300, form: 'gable', deg: 50}, {from: 600, to: 1000, form: 'gable', deg: 45},
    ]}})]};
    let sides = 0;
    for (const f of [...RISE_FIXTURES, extra]) {
      const wire = writeInput(f);
      f.rings.forEach((r, i) => RING_SIDES.forEach((s, j) => {
        const runs = r.sides?.[s]?.runs;
        if (!runs?.length) return;
        sides++;
        const sources = writtenRunSources(runs, sideLengthCm(r.rect, s));
        const written = wire.rings[i].sides[j].runs;
        expect(sources.length, `${f.name} Ring ${i} ${s}`).toBe(written.length);
        sources.forEach((k, w) => {
          if (k !== null) expect([written[w].startCm, written[w].endCm], `${f.name} ${s} run ${k}`).toEqual([runs[k].from, runs[k].to]);
        });
      }));
    }
    expect(sides).toBeGreaterThan(8);
    expect(writtenRunSources([{from: 100, to: 300}], 1000)).toEqual([null, 0, null]);
    expect(writtenRunSources([{from: 0, to: 1000}], 1000)).toEqual([0]);
  });

  it('every in-range run edit of a roster fixture is a valid draft (gate 2 for runs)', () => {
    const failures: string[] = [];
    for (const f of SHELL_FIXTURES) {
      f.rings.forEach((_, i) => {
        for (const side of RING_SIDES) {
          const added = addRun(f, i, side);
          const variants: [string, ShellFixture][] = [
            ['addRun', added], ['addRun then setRunPitch', setRunPitch(added, i, side, 0, 60)],
            ['addRun then setRunTo', setRunTo(added, i, side, 0, (added.rings[i].sides?.[side]?.runs?.[0].from ?? 0) + 50)],
            ['addRun then setSideForm', setSideForm(added, i, side, 'gable')], ['addRun then setSidePitch', setSidePitch(added, i, side, 30)],
          ];
          for (const [what, next] of variants) {
            const v = validate(next);
            if (!v.ok) failures.push(`${f.name} Ring ${i} ${side} ${what}: ${v.errors[0]}`);
          }
        }
      });
    }
    expect(failures).toEqual([]);
  });
});
