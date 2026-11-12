// Viewer editing decisions 1 to 5 and gates 1 and 2 of decision 23: the pure edit functions, and `ringBox`.
import {describe, expect, it} from 'vitest';
import {EXPORTED_FIXTURES, RING_SIDES, SHELL_FIXTURES, ShellFixture, ring} from '../src/fixture.ts';
import {resolveSides, validate} from '../src/viewer/draft.ts';
import {
  addRing, cloneFixture, clearSide, duplicateRing, moveRing, pinListedPitches, removeRing, ringBox, setBaseStorey,
  setDefaultDeg, setRect, setRectCoord, setSideForm, setSidePitch, setStoreyHeight, setStoreys, snapToCell,
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
