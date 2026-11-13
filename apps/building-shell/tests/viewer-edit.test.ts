// Viewer editing decisions 1 to 5 and gates 1 and 2 of decision 23: the pure edit functions, and `ringBox`.
import {describe, expect, it} from 'vitest';
import {EXPORTED_FIXTURES, RING_SIDES, RISE_FIXTURES, RingSide, SHELL_FIXTURES, ShellFixture, SideRun, ring} from '../src/fixture.ts';
import {runSpan} from '../src/ring-forms.ts';
import type {Rect} from '../src/roof/model.ts';
import {writeInput} from '../src/wire/input-adapter.ts';
import {resolveSides, validate} from '../src/viewer/draft.ts';
import {
  addRing, canSplitStretch, canonicalFixture, canonicalSide, cloneFixture, clearSide, duplicateRing, middleThird, moveBoundary, moveRing, pinListedPitches,
  removeRing, ringBox, runsAreContiguous, setBaseStorey, setDefaultDeg, setRect, setRectCoord, setSideForm, setSidePitch, setStoreyHeight, setStoreys,
  setStretchForm, setStretchPitch, sideLengthCm, snapToCell, splitStretch, stretchCount,
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

// ---- Stretches (journal decision 214) ---------------------------------------------------------------------------------------

/** One edit of one side's stretches, named, as it is made on Ring `i` and `side` of a fixture. */
interface StretchEdit { name: string; needsSplit: boolean; apply: (f: ShellFixture, i: number, side: RingSide) => ShellFixture }

const stretchesIn = (f: ShellFixture, i: number, side: RingSide): number => stretchCount(f, i, side);

/** Every stretch edit, with whether it needs a split side (more than one stretch). */
const STRETCH_EDITS: StretchEdit[] = [
  {name: 'splitStretch', needsSplit: false, apply: (f, i, s) => splitStretch(f, i, s, 0)},
  {name: 'splitStretch (the last)', needsSplit: false, apply: (f, i, s) => splitStretch(f, i, s, stretchesIn(f, i, s) - 1)},
  {name: 'moveBoundary', needsSplit: true, apply: (f, i, s) => moveBoundary(f, i, s, 1, 150)},
  {name: 'setStretchForm', needsSplit: false, apply: (f, i, s) => setStretchForm(f, i, s, 0, 'gable')},
  {name: 'setStretchForm (hip)', needsSplit: false, apply: (f, i, s) => setStretchForm(f, i, s, stretchesIn(f, i, s) - 1, 'hip')},
  {name: 'setStretchPitch', needsSplit: false, apply: (f, i, s) => setStretchPitch(f, i, s, 0, 52.5)},
  {name: 'setSideForm', needsSplit: false, apply: (f, i, s) => setSideForm(f, i, s, 'gable')},
  {name: 'setSidePitch', needsSplit: false, apply: (f, i, s) => setSidePitch(f, i, s, 33)},
  {name: 'clearSide', needsSplit: false, apply: (f, i, s) => clearSide(f, i, s)},
];

/** Every fixture a side can be split on: the roster, and the fixtures that already have runs. */
const RUN_FIXTURES: readonly ShellFixture[] = [...SHELL_FIXTURES, ...RISE_FIXTURES];

describe('gate 1 for stretches: every stretch edit leaves its input unchanged (journal decision 214)', () => {
  for (const f of RUN_FIXTURES) {
    it(`${f.name}: no stretch edit writes to its argument, and none shares a Ring, side or run with it`, () => {
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
      for (const e of STRETCH_EDITS) {
        frozen.rings.forEach((_, i) => {
          for (const side of RING_SIDES) {
            if (e.needsSplit && stretchesIn(frozen, i, side) < 2) continue;
            const next = e.apply(frozen, i, side);
            edited++;
            expect(next, e.name).not.toBe(frozen);
            for (const r of next.rings) {
              expect(shared.has(r) || shared.has(r.rect) || (r.sides !== undefined && shared.has(r.sides)), `${e.name}: a Ring, rect or sides object is shared`).toBe(false);
              for (const s of Object.values(r.sides ?? {})) {
                expect(shared.has(s), `${e.name}: a side is shared`).toBe(false);
                for (const run of s.runs ?? []) expect(shared.has(run), `${e.name}: a stretch is shared`).toBe(false);
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

describe('the canonical spelling of a side (journal decision 214)', () => {
  const L = 1000;
  const run = (from: number, to: number, form: 'hip' | 'gable', deg: number, extra: Partial<SideRun> = {}): SideRun => ({from, to, form, deg, ...extra});

  it('a plain side is left as it is, its pitch pinned, and an empty runs list is no list', () => {
    expect(canonicalSide({form: 'gable'}, L, 40)).toEqual({form: 'gable', deg: 40});
    expect(canonicalSide({form: 'hip', deg: 30, runs: []}, L, 40)).toEqual({form: 'hip', deg: 30});
  });

  it('fills a gap with the side\'s own form and pitch, so the stretches tile the side', () => {
    const side = canonicalSide({form: 'hip', deg: 30, runs: [run(300, 700, 'gable', 60)]}, L, 40);
    expect(side).toEqual({form: 'hip', deg: 30, runs: [run(0, 300, 'hip', 30), run(300, 700, 'gable', 60), run(700, L, 'hip', 30)]});
  });

  it('merges neighbours that agree in form, pitch, maxHeight and limit, and keeps ones that differ in any', () => {
    const merged = canonicalSide({form: 'hip', deg: 30, runs: [run(0, 300, 'hip', 30), run(300, 500, 'gable', 60), run(500, 700, 'gable', 60), run(700, L, 'hip', 30)]}, L, 40);
    expect(merged.runs).toEqual([run(0, 300, 'hip', 30), run(300, 700, 'gable', 60), run(700, L, 'hip', 30)]);
    const kept = canonicalSide({form: 'hip', deg: 30, runs: [run(0, 300, 'hip', 30), run(300, 500, 'gable', 60, {maxHeight: 200}), run(500, 700, 'gable', 60), run(700, L, 'hip', 30)]}, L, 40);
    expect(kept.runs).toHaveLength(4);
    const limited = canonicalSide({form: 'hip', deg: 30, runs: [run(300, 500, 'gable', 60, {limit: 'ridgeSlope'}), run(500, 700, 'gable', 60)]}, L, 40);
    expect(limited.runs).toHaveLength(4);
    expect(canonicalSide({form: 'hip', deg: 30, runs: [run(300, 500, 'gable', 60, {maxHeight: 200}), run(500, 700, 'gable', 60, {maxHeight: 200})]}, L, 40).runs).toHaveLength(3);
  });

  it('a side that merges to one stretch is a plain side again', () => {
    expect(canonicalSide({form: 'hip', deg: 30, runs: [run(0, 500, 'gable', 60), run(500, L, 'gable', 60)]}, L, 40)).toEqual({form: 'gable', deg: 60});
    expect(canonicalSide({form: 'gable', deg: 50, runs: [run(0, L, 'hip', 35)]}, L, 40)).toEqual({form: 'hip', deg: 35});
  });

  it('derives the side\'s own form and pitch: its first hip stretch, else its first stretch', () => {
    expect(canonicalSide({form: 'gable', deg: 50, runs: [run(300, 700, 'hip', 30)]}, L, 40)).toMatchObject({form: 'hip', deg: 30});
    expect(canonicalSide({form: 'hip', deg: 30, runs: [run(0, 500, 'gable', 60), run(500, L, 'gable', 45)]}, L, 40)).toMatchObject({form: 'gable', deg: 60});
    expect(canonicalSide({form: 'gable', deg: 50, runs: [run(0, 400, 'gable', 60)]}, L, 40)).toMatchObject({form: 'gable', deg: 60});
  });

  it('is idempotent', () => {
    const once = canonicalSide({form: 'gable', deg: 50, runs: [run(100, 300, 'hip', 30), run(300, 500, 'gable', 60)]}, L, 40);
    expect(canonicalSide(once, L, 40)).toEqual(once);
  });

  it('leaves a side whose runs are malformed as typed, and says so by not tiling it', () => {
    for (const runs of [
      [run(500, 300, 'gable', 60)], [run(300, 300, 'gable', 60)], [run(0, 600, 'gable', 60), run(500, L, 'hip', 30)],
      [run(400, 600, 'gable', 60), run(0, 200, 'hip', 30)], [run(-100, 200, 'gable', 60)], [run(800, 1200, 'gable', 60)],
    ]) {
      expect(canonicalSide({form: 'hip', deg: 30, runs}, L, 40).runs, JSON.stringify(runs)).toEqual(runs);
    }
  });

  it('canonicalFixture gives every side of every Ring the one spelling, and a rise fixture\'s free runs tile', () => {
    const tiled = canonicalFixture(RISE_FIXTURES.find(f => f.name === 'MidWallRise') as ShellFixture);
    expect(tiled.rings[0].sides?.S).toEqual({form: 'hip', deg: 30, runs: [run(0, 330, 'hip', 30), run(330, 610, 'gable', 45), run(610, L, 'hip', 30)]});
    for (const f of RISE_FIXTURES) expect(canonicalFixture(canonicalFixture(f)), f.name).toEqual(canonicalFixture(f));
  });
});

describe('the stretch edits (journal decision 214)', () => {
  const plain = (): ShellFixture => ({name: 'p', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 40)]});
  const runsAt = (f: ShellFixture, side: RingSide = 'S') => f.rings[0].sides?.[side]?.runs;
  const spans = (f: ShellFixture, side: RingSide = 'S') => runsAt(f, side)?.map(r => [r.from, r.to, r.form, r.deg]);

  it('splits a plain side into three: the other form over the middle third, the side\'s form on both flanks', () => {
    const split = splitStretch(plain(), 0, 'S', 0);
    expect(split.rings[0].sides?.S).toEqual({form: 'hip', deg: 40, runs: [
      {from: 0, to: 350, form: 'hip', deg: 40}, {from: 350, to: 650, form: 'gable', deg: 40}, {from: 650, to: 1000, form: 'hip', deg: 40},
    ]});
  });

  it('splits a stretch into three where its middle holds a whole cell, else into two halves, else says it cannot', () => {
    const f = splitStretch(splitStretch(plain(), 0, 'S', 0), 0, 'S', 2);
    // [650, 1000]: its middle third [767, 883] snaps to [800, 850], both flanks kept.
    expect(spans(f)).toEqual([[0, 350, 'hip', 40], [350, 650, 'gable', 40], [650, 800, 'hip', 40], [800, 850, 'gable', 40], [850, 1000, 'hip', 40]]);
    // A stretch of two cells has no whole cell in its middle third, so it halves, the second half in the other form.
    const two: ShellFixture = {name: 'w', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 100, 500], 0, 1, 40)]};
    expect(spans(splitStretch(two, 0, 'S', 0))).toEqual([[0, 50, 'hip', 40], [50, 100, 'gable', 40]]);
    const tiny: ShellFixture = {name: 't', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 50, 500], 0, 1, 40)]};
    expect(canSplitStretch(tiny, 0, 'S', 0)).toBe(false);
    expect(splitStretch(tiny, 0, 'S', 0)).toEqual(tiny);
    expect(canSplitStretch(plain(), 0, 'S', 0)).toBe(true);
    expect(canSplitStretch({...tiny, rings: [ring([0, 0, 100, 500], 0, 1, 40)]}, 0, 'S', 0)).toBe(true);
  });

  it('a new hip stretch takes the side\'s existing hip pitch (journal decision 214, Low 2)', () => {
    // A gable side at 45 with a hip stretch at 30: splitting the gable stretch makes a hip stretch at 30, not 45.
    const f: ShellFixture = {name: 'h', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'gable', deg: 45, runs: [
      {from: 0, to: 400, form: 'gable', deg: 45}, {from: 400, to: 600, form: 'hip', deg: 30}, {from: 600, to: 1000, form: 'gable', deg: 45},
    ]}})]};
    const split = splitStretch(f, 0, 'S', 0);
    const hips = runsAt(split)?.filter(r => r.form === 'hip') ?? [];
    expect(hips.length).toBeGreaterThan(1);
    expect(new Set(hips.map(r => r.deg))).toEqual(new Set([30]));
    expect(validate(split)).toEqual({ok: true});
    // With no hip stretch, it takes the pitch of the stretch it is split from.
    const gable = splitStretch(setSideForm(plain(), 0, 'N', 'gable'), 0, 'N', 0);
    expect(runsAt(gable, 'N')?.[1]).toMatchObject({form: 'hip', deg: 40});
  });

  it('sets a stretch\'s form: a hip takes the side\'s hip pitch and loses maxHeight and limit; equal neighbours merge', () => {
    const f: ShellFixture = {name: 'm', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', deg: 30, runs: [
      {from: 0, to: 300, form: 'hip', deg: 30}, {from: 300, to: 700, form: 'gable', deg: 60, maxHeight: 180, limit: 'ridgeSlope'}, {from: 700, to: 1000, form: 'hip', deg: 30},
    ]}})]};
    // The middle stretch to hip: it takes 30, loses its limits, and the three hips are one: a plain hip side at 30.
    expect(setStretchForm(f, 0, 'S', 1, 'hip').rings[0].sides?.S).toEqual({form: 'hip', deg: 30});
    // A gable stretch at 60 set to gable again changes nothing.
    expect(setStretchForm(f, 0, 'S', 1, 'gable')).toEqual(f);
    // The first stretch to gable at 60: it merges with nothing (the middle has limits), the side's own form is still the first hip.
    const first = setStretchForm(setStretchPitch(f, 0, 'S', 0, 60), 0, 'S', 0, 'gable');
    expect(spans(first)).toEqual([[0, 300, 'gable', 60], [300, 700, 'gable', 60], [700, 1000, 'hip', 30]]);
    expect(first.rings[0].sides?.S).toMatchObject({form: 'hip', deg: 30});
  });

  it('sets a stretch\'s pitch, and equal neighbours merge', () => {
    const split = splitStretch(plain(), 0, 'S', 0);
    expect(spans(setStretchPitch(split, 0, 'S', 1, 60))).toEqual([[0, 350, 'hip', 40], [350, 650, 'gable', 60], [650, 1000, 'hip', 40]]);
    // Two gables of different pitch side by side become one when the pitches agree.
    const two: ShellFixture = {name: 'g', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 40, {S: {form: 'hip', deg: 40, runs: [
      {from: 0, to: 300, form: 'hip', deg: 40}, {from: 300, to: 500, form: 'gable', deg: 60}, {from: 500, to: 700, form: 'gable', deg: 45}, {from: 700, to: 1000, form: 'hip', deg: 40},
    ]}})]};
    expect(spans(setStretchPitch(two, 0, 'S', 2, 60))).toEqual([[0, 300, 'hip', 40], [300, 700, 'gable', 60], [700, 1000, 'hip', 40]]);
    expect(spans(setStretchPitch(two, 0, 'S', 1, 45))).toEqual([[0, 300, 'hip', 40], [300, 700, 'gable', 45], [700, 1000, 'hip', 40]]);
  });

  it('moves the boundary between two stretches, which moves both, snapped to the cell size', () => {
    const split = splitStretch(plain(), 0, 'S', 0);
    expect(spans(moveBoundary(split, 0, 'S', 1, 424))).toEqual([[0, 400, 'hip', 40], [400, 650, 'gable', 40], [650, 1000, 'hip', 40]]);
    expect(spans(moveBoundary(split, 0, 'S', 2, 776))).toEqual([[0, 350, 'hip', 40], [350, 800, 'gable', 40], [800, 1000, 'hip', 40]]);
  });

  it('a boundary moved past a neighbour\'s far end leaves the side as typed, and the draft is for the wire to refuse (decision 9)', () => {
    const split = splitStretch(plain(), 0, 'S', 0);
    const past = moveBoundary(split, 0, 'S', 1, 700);
    expect(spans(past)).toEqual([[0, 700, 'hip', 40], [700, 650, 'gable', 40], [650, 1000, 'hip', 40]].map(r => r));
    expect(validate(past).ok).toBe(false);
  });

  it('on a split side the side\'s own form and pitch do not act; on a plain side they do', () => {
    const split = splitStretch(plain(), 0, 'S', 0);
    expect(setSideForm(split, 0, 'S', 'gable')).toEqual(split);
    expect(setSidePitch(split, 0, 'S', 55)).toEqual(split);
    expect(setSideForm(plain(), 0, 'S', 'gable').rings[0].sides?.S).toEqual({form: 'gable', deg: 40});
    // "Default" returns a split side to plain, unlisted.
    expect(clearSide(split, 0, 'S').rings[0].sides?.S).toBeUndefined();
  });

  it('keeps a stretch\'s maxHeight and limit through every edit that does not touch that stretch', () => {
    const f: ShellFixture = {name: 'm', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', deg: 45, runs: [
      {from: 0, to: 100, form: 'hip', deg: 45}, {from: 100, to: 300, form: 'gable', deg: 50, maxHeight: 180, limit: 'ridgeSlope'}, {from: 300, to: 1000, form: 'hip', deg: 45},
    ]}})]};
    for (const next of [
      moveBoundary(f, 0, 'S', 2, 500), splitStretch(f, 0, 'S', 2), setStretchPitch(f, 0, 'S', 2, 45), setStretchForm(f, 0, 'S', 0, 'hip'),
      duplicateRing(f, 0), moveRing(addRing(f), 0, 1), setDefaultDeg(f, 0, 33),
    ]) {
      const runs = next.rings.flatMap(r => r.sides?.S?.runs ?? []);
      expect(runs.some(r => r.maxHeight === 180 && r.limit === 'ridgeSlope' && r.form === 'gable'), 'kept').toBe(true);
    }
    // Splitting the stretch that holds them keeps them on both flanks.
    const kept = splitStretch(f, 0, 'S', 1).rings[0].sides?.S?.runs?.filter(r => r.maxHeight === 180);
    expect(kept?.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses a stretch that does not exist as a RangeError', () => {
    expect(() => moveBoundary(plain(), 0, 'S', 1, 100)).toThrow(RangeError);
    expect(() => moveBoundary(splitStretch(plain(), 0, 'S', 0), 0, 'S', 0, 100)).toThrow(RangeError);
    expect(() => setStretchForm(plain(), 0, 'S', 3, 'hip')).toThrow(RangeError);
    expect(() => splitStretch(plain(), 4, 'S', 0)).toThrow(RangeError);
  });

  it('pins a run\'s pitch: pinListedPitches gives a run without one its side\'s', () => {
    const f: ShellFixture = {name: 'q', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: [{from: 0, to: 500, form: 'gable'}]}})]};
    expect(pinListedPitches(f).rings[0].sides?.S).toEqual({form: 'hip', deg: 45, runs: [{from: 0, to: 500, form: 'gable', deg: 45}]});
  });

  it('resizing a Ring keeps its split sides tiled: the last stretch ends where the side does, and stretches past the end go', () => {
    const split = splitStretch(plain(), 0, 'S', 0);
    const longer = setRectCoord(split, 0, 2, 1200);
    expect(spans(longer)).toEqual([[0, 350, 'hip', 40], [350, 650, 'gable', 40], [650, 1200, 'hip', 40]]);
    const shorter = setRectCoord(split, 0, 2, 500);
    expect(spans(shorter)).toEqual([[0, 350, 'hip', 40], [350, 500, 'gable', 40]]);
    expect(validate(shorter)).toEqual({ok: true});
    expect(validate(setRect(split, 0, [0, 0, 300, 500]))).toEqual({ok: true});
    // Cut to 300 cm only the first stretch is left, and a side of one stretch is plain.
    expect(setRect(split, 0, [0, 0, 300, 500]).rings[0].sides?.S).toEqual({form: 'hip', deg: 40});
  });

  /** The world coordinates of a side's interior boundaries: where stretch k starts, for k from 1, on the line the side lies along. */
  const boundariesInWorld = (f: ShellFixture, side: RingSide): number[] => {
    const r = f.rings[0];
    const [x0, y0, x1, y1] = r.rect;
    return (r.sides?.[side]?.runs ?? []).slice(1).map(run => (side === 'S' ? x0 + run.from : side === 'E' ? y0 + run.from : side === 'N' ? x1 - run.from : y1 - run.from)).sort((a, b) => a - b);
  };

  /** A 1000 x 500 Ring with all four sides split into three stretches, so each has two interior boundaries. */
  const splitAll = (): ShellFixture => RING_SIDES.reduce((f, side) => splitStretch(f, 0, side, 0), plain());

  /** The world interval a side lies along: [x0, x1] for S and N, [y0, y1] for E and W. */
  const worldRange = (f: ShellFixture, side: RingSide): [number, number] => {
    const [x0, y0, x1, y1] = f.rings[0].rect;
    return side === 'S' || side === 'N' ? [Math.min(x0, x1), Math.max(x0, x1)] : [Math.min(y0, y1), Math.max(y0, y1)];
  };

  it('a resize keeps every surviving boundary where it is in the world, on all four sides, whichever end moves (journal decision 216)', () => {
    const base = splitAll();
    // The boundaries start at [350, 650] on the 1000 cm sides and [200, 300] on the 500 cm ones, in offsets from each side's start.
    expect(RING_SIDES.map(s => boundariesInWorld(base, s))).toEqual([[350, 650], [200, 300], [350, 650], [200, 300]]);
    const moves: [string, 0 | 1 | 2 | 3, number][] = [
      ['x0 in', 0, 200], ['x0 out', 0, -200], ['x0 far in', 0, 700], ['x1 in', 2, 800], ['x1 out', 2, 1400], ['x1 far in', 2, 300],
      ['y0 in', 1, 100], ['y0 out', 1, -100], ['y0 far in', 1, 350], ['y1 in', 3, 400], ['y1 out', 3, 700], ['y1 far in', 3, 150],
    ];
    let compared = 0;
    for (const [what, coord, value] of moves) {
      const next = setRectCoord(base, 0, coord, value);
      for (const side of RING_SIDES) {
        const [lo, hi] = worldRange(next, side);
        // The boundaries that were strictly inside the new side are exactly the ones it has now, at the same world coordinates.
        const expected = boundariesInWorld(base, side).filter(w => w > lo && w < hi);
        expect(boundariesInWorld(next, side), `${what}: side ${side}`).toEqual(expected);
        const runs = next.rings[0].sides?.[side]?.runs;
        if (runs) {
          // The end stretches grow or shrink to the new ends, and the side is still tiled.
          expect(runs[0].from, `${what}: ${side}`).toBe(0);
          expect(runs.at(-1)?.to, `${what}: ${side}`).toBe(sideLengthCm(next.rings[0].rect, side));
          expect(runsAreContiguous(runs, sideLengthCm(next.rings[0].rect, side)), `${what}: ${side}`).toBe(true);
        }
        compared++;
      }
      expect(validate(next), what).toEqual({ok: true});
    }
    expect(compared).toBe(moves.length * 4);
  });

  it('the rise does not slide: the N rise of a 1000 cm Ring stays at x 350 to 650 when x1 moves, and the S rise when x0 moves', () => {
    const base = splitAll();
    const runInWorld = (f: ShellFixture, side: RingSide): [number, number] | undefined => {
      const gable = f.rings[0].sides?.[side]?.runs?.find(r => r.form === 'gable');
      return gable ? runSpan(f.rings[0].rect, side, gable) : undefined;
    };
    expect(runInWorld(base, 'N')).toEqual([350, 650]);
    expect(runInWorld(setRectCoord(base, 0, 2, 800), 'N')).toEqual([350, 650]);
    expect(runInWorld(setRectCoord(base, 0, 0, 200), 'S')).toEqual([350, 650]);
    expect(runInWorld(setRectCoord(base, 0, 0, 200), 'N')).toEqual([350, 650]);
    expect(runInWorld(setRectCoord(base, 0, 2, 800), 'S')).toEqual([350, 650]);
    // The sides on the other axis are untouched by a resize on this one.
    for (const [coord, value] of [[0, 200], [2, 800]] as const) {
      const next = setRectCoord(base, 0, coord, value);
      expect(next.rings[0].sides?.E).toEqual(base.rings[0].sides?.E);
      expect(next.rings[0].sides?.W).toEqual(base.rings[0].sides?.W);
    }
    for (const [coord, value] of [[1, 100], [3, 400]] as const) {
      const next = setRectCoord(base, 0, coord, value);
      expect(next.rings[0].sides?.S).toEqual(base.rings[0].sides?.S);
      expect(next.rings[0].sides?.N).toEqual(base.rings[0].sides?.N);
    }
  });

  it('a stretch partly outside the new side is clipped, one wholly outside is dropped, and a side left with one stretch is plain', () => {
    const base = splitAll();
    // S runs x 0 to 1000 in [0, 350] hip, [350, 650] gable, [650, 1000] hip. Cut at x1 = 500: the gable is clipped, the last hip dropped.
    expect(spans(setRectCoord(base, 0, 2, 500), 'S')).toEqual([[0, 350, 'hip', 40], [350, 500, 'gable', 40]]);
    // From x0 = 400: the first hip is dropped, the gable clipped to [400, 650] (offset 0 to 250), the last hip kept.
    expect(spans(setRectCoord(base, 0, 0, 400), 'S')).toEqual([[0, 250, 'gable', 40], [250, 600, 'hip', 40]]);
    // From x0 = 700: only the last hip is left: a plain side.
    expect(setRectCoord(base, 0, 0, 700).rings[0].sides?.S).toEqual({form: 'hip', deg: 40});
    // N runs from x1 toward x0, so a cut at x0 = 400 clips its last stretch instead.
    expect(spans(setRectCoord(base, 0, 0, 400), 'N')).toEqual([[0, 350, 'hip', 40], [350, 600, 'gable', 40]]);
  });

  it('a resize that leaves nothing of a side inside keeps the stretch nearest it, and a malformed side is left as it was', () => {
    const base = splitAll();
    const gone = setRect(base, 0, [2000, 0, 2400, 500]);
    expect(validate(gone)).toEqual({ok: true});
    const malformed = moveBoundary(base, 0, 'S', 1, 800);
    expect(validate(malformed).ok).toBe(false);
    expect(spans(setRectCoord(malformed, 0, 0, 100), 'S')).toEqual(spans(malformed, 'S'));
  });

  it('moving a boundary exactly onto its neighbour\'s far end removes that neighbour; past it stays an invalid draft (journal decision 216)', () => {
    const base = splitAll();
    // S: [0, 350] hip, [350, 650] gable, [650, 1000] hip. Boundary 1 (350) onto 650 removes the gable: the hips merge to plain.
    expect(base.rings[0].sides?.S?.runs?.length).toBe(3);
    expect(moveBoundary(base, 0, 'S', 1, 650).rings[0].sides?.S).toEqual({form: 'hip', deg: 40});
    // Boundary 2 (650) onto 350 removes the gable from the other side.
    expect(moveBoundary(base, 0, 'S', 2, 350).rings[0].sides?.S).toEqual({form: 'hip', deg: 40});
    // Boundary 1 onto the start of the first stretch (0) removes the first hip: the gable now starts the side.
    const onto = moveBoundary(base, 0, 'S', 1, 0);
    expect(spans(onto, 'S')).toEqual([[0, 650, 'gable', 40], [650, 1000, 'hip', 40]]);
    expect(validate(onto)).toEqual({ok: true});
    // Past the far end: the draft is invalid, as before.
    expect(validate(moveBoundary(base, 0, 'S', 1, 700)).ok).toBe(false);
    expect(validate(moveBoundary(base, 0, 'S', 1, -50)).ok).toBe(false);
  });

  it('a stretch of a cell and a half is too short to split; two cells is the least (journal decision 216)', () => {
    const at = (x1: number): ShellFixture => ({name: 'c', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, x1, 500], 0, 1, 40)]});
    for (const x1 of [50, 75, 99, 100, 125, 149, 150, 200]) {
      const can = canSplitStretch(at(x1), 0, 'S', 0);
      expect(can, `${x1} cm`).toBe(x1 >= 100);
      const next = splitStretch(at(x1), 0, 'S', 0);
      expect(next.rings[0].sides?.S?.runs !== undefined, `${x1} cm splits`).toBe(can);
      if (can) for (const run of next.rings[0].sides?.S?.runs ?? []) expect(run.to - run.from, `${x1} cm: a part holds a cell`).toBeGreaterThanOrEqual(50);
    }
  });

  it('middleThird keeps both flanks, and falls back to the whole stretch where no whole cell is left in the middle', () => {
    expect(middleThird([0, 1000], 50)).toEqual([350, 650]);
    expect(middleThird([650, 1000], 50)).toEqual([800, 850]);
    expect(middleThird([0, 100], 50)).toEqual([0, 100]);
    expect(middleThird([0, 150], 50)).toEqual([50, 100]);
  });

  it('says where a side starts: sideLengthCm measures the side, and runSpan agrees with the panel\'s captions', () => {
    const rect: Rect = [100, 200, 700, 1000];
    expect(RING_SIDES.map(s => sideLengthCm(rect, s))).toEqual([600, 800, 600, 800]);
    expect(runSpan(rect, 'S', {from: 0, to: 100})).toEqual([100, 200]);
    expect(runSpan(rect, 'E', {from: 0, to: 100})).toEqual([200, 300]);
    expect(runSpan(rect, 'N', {from: 0, to: 100})).toEqual([600, 700]);
    expect(runSpan(rect, 'W', {from: 0, to: 100})).toEqual([900, 1000]);
  });

  it('written as authored, the stretches of a split side are the wire\'s runs, position for position (journal decision 214, N4)', () => {
    let sides = 0;
    for (const f of RUN_FIXTURES.map(canonicalFixture)) {
      const wire = writeInput(f);
      f.rings.forEach((r, i) => RING_SIDES.forEach((s, j) => {
        const runs = r.sides?.[s]?.runs;
        if (!runs?.length) return;
        sides++;
        expect(runsAreContiguous(runs, sideLengthCm(r.rect, s)), `${f.name} Ring ${i} ${s}`).toBe(true);
        const written = wire.rings[i].sides[j].runs;
        expect(written.map(w => [w.startCm, w.endCm]), `${f.name} Ring ${i} ${s}`).toEqual(runs.map(x => [x.from, x.to]));
      }));
    }
    expect(sides).toBeGreaterThan(8);
    expect(runsAreContiguous([{from: 0, to: 300}, {from: 300, to: 1000}], 1000)).toBe(true);
    expect(runsAreContiguous([{from: 0, to: 300}, {from: 400, to: 1000}], 1000)).toBe(false);
    expect(runsAreContiguous([{from: 100, to: 1000}], 1000)).toBe(false);
  });

  it('every in-range stretch edit of a roster fixture is a valid draft (gate 2 for stretches)', () => {
    const failures: string[] = [];
    for (const f of SHELL_FIXTURES) {
      f.rings.forEach((_, i) => {
        for (const side of RING_SIDES) {
          const split = splitStretch(f, i, side, 0);
          const variants: [string, ShellFixture][] = [
            ['split', split], ['split then pitch', setStretchPitch(split, i, side, 1, 60)], ['split then form', setStretchForm(split, i, side, 1, 'hip')],
          ];
          const second = split.rings[i].sides?.[side]?.runs?.[1];
          // A boundary moved one cell into the stretch it starts, where that stretch has more than one.
          if (second && second.from + f.cellSize < second.to) variants.push(['split then boundary', moveBoundary(split, i, side, 1, second.from + f.cellSize)]);
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
