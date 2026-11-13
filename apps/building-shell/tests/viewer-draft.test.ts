// Viewer editing decisions 6 to 9, 15 to 21 and gates 3 and 4 of decision 23: the pure draft state, the file and link
// round trips, and the hash. Plain values in, plain values out, as `viewer-toggles.test.ts`.
import {describe, expect, it} from 'vitest';
import {
  EXPORTED_FIXTURES, FixtureRing, GABLE_SETTING_FIXTURES, RING_SIDES, RISE_FACINGS, RISE_FIXTURES, SHELL_FIXTURES, ShellFixture, SideRun, ring,
} from '../src/fixture.ts';
import {canonicalFixture, settledSettings} from '../src/viewer/edit.ts';
import {BuildingShellInputV1, WIRE_GABLE_ONLY_DEG} from '../src/wire/input-types.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import {
  Draft, DraftAction, HISTORY_CAP, TALL_STOREY_SUM, blankDraft, buildGate, canRedo, canUndo, dispatch, draftFixtureOfJson, draftJson, draftName, editDraftOf,
  explainRefusals, fixtureToBuild, heldMessage, isDirty, keepStoreys, makeDraft, parseDraftJson, resolveSides, restoreDraft, ringOfHit, sameFixture,
  saveMark, serializeDraft, storeySum, validate,
} from '../src/viewer/draft.ts';
import {DRAFT_HASH, draftFromLinkHash, draftLinkHash, selectionFromHash, selectionName} from '../src/viewer/hash.ts';
import {makeToggles, setStorey, visibleStoreys} from '../src/viewer/toggles.ts';
import {memoBuilds} from './test-builds.ts';

const chalet = SHELL_FIXTURES.find(f => f.name === 'DefaultChalet') as ShellFixture;
const oneRing = (deg = 45): ShellFixture => ({name: 'one', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, deg)]});
/** An `input@1` value of one Ring, edited by `change` before it is read. */
const fileWith = (change: (input: BuildingShellInputV1) => void): BuildingShellInputV1 => {
  const input = structuredClone(writeInput(oneRing(45)));
  change(input);
  return input;
};
const withDeg = (deg: number): Draft => dispatch(makeDraft(oneRing()), {kind: 'setDefaultDeg', ring: 0, value: deg});

describe('decision 6: a draft is valid when readInput(writeInput(draft)) accepts it', () => {
  // Literal expectations, so a `validate` that stopped asking the wire, or asked it wrongly, fails here.
  it('accepts every exported fixture, and refuses each of these, for the wire\'s reason', () => {
    for (const f of EXPORTED_FIXTURES) expect(validate(f), f.name).toEqual({ok: true});
    const refusedFor: [string, (g: ShellFixture) => void, RegExp][] = [
      ['a pitch of 3', g => { g.rings[0].defaultDeg = 3; }, /3 degrees, outside \[7, 75\]/],
      ['a pitch of 80', g => { g.rings[0].sides = {N: {form: 'gable', deg: 80}}; }, /80 degrees, outside \[7, 75\]/],
      ['an inverted rect', g => { g.rings[0].rect = [1000, 0, 0, 500]; }, /signed area/],
      ['a rect off the grid', g => { g.rings[0].rect = [0.3, 0, 1000, 500]; }, /off the 1\/1024 cm grid/],
      ['no Ring', g => { g.rings = []; }, /^rings: /],
    ];
    for (const [what, change, why] of refusedFor) {
      const g = structuredClone(oneRing());
      change(g);
      const v = validate(g);
      expect(v.ok, what).toBe(false);
      expect(v.ok ? '' : v.errors.join('\n'), what).toMatch(why);
    }
  });

  it('refuses what the wire refuses, with the wire\'s own text', () => {
    const bad = oneRing(3);
    const wire = readInput(writeInput(bad), bad.name);
    expect(wire.ok).toBe(false);
    expect(validate(bad)).toEqual({ok: false, errors: wire.ok ? [] : wire.errors});
  });

  it('refuses an empty fixture, a zero-area rect, an inverted rect, no storeys and a fractional storey', () => {
    const f = oneRing();
    const refused = (change: (g: ShellFixture) => void): boolean => {
      const g = structuredClone(f);
      change(g);
      return !validate(g).ok;
    };
    expect(refused(g => { g.rings = []; })).toBe(true);
    expect(refused(g => { g.rings[0].rect = [0, 0, 0, 500]; })).toBe(true);
    expect(refused(g => { g.rings[0].rect = [1000, 0, 0, 500]; })).toBe(true);
    expect(refused(g => { g.rings[0].storeys = 0; })).toBe(true);
    expect(refused(g => { g.rings[0].baseStorey = -1; })).toBe(true);
    expect(refused(g => { g.rings[0].storeys = 1.5; })).toBe(true);
    expect(refused(g => { g.rings[0].rect = [0, 0, 1000.5, 500]; })).toBe(false);
  });
});

describe('gate 4: an out-of-range pitch is refused by decision 6 and not built (decision 23)', () => {
  const outOfRange = [-5, 0, 3, 6.9, 75.1, 90, 120];
  const inRange = [7, 7.5, 22.5, 45, 75];

  it('a default pitch outside 7 to 75 makes the draft invalid, and it is not built', () => {
    for (const deg of outOfRange) {
      const d = withDeg(deg);
      expect(d.fixture.rings[0].defaultDeg, `${deg} is applied, never blocked`).toBe(deg);
      expect(d.validation.ok, `${deg}`).toBe(false);
      expect(fixtureToBuild(d), `${deg}`).toBeUndefined();
    }
  });

  it('a side\'s own pitch, hip or gable, outside 7 to 75 makes the draft invalid, and it is not built', () => {
    for (const deg of outOfRange) {
      for (const form of ['hip', 'gable'] as const) {
        let d = dispatch(makeDraft(oneRing()), {kind: 'setSideForm', ring: 0, side: 'E', form});
        d = dispatch(d, {kind: 'setSidePitch', ring: 0, side: 'E', value: deg});
        expect(d.validation.ok, `${form} ${deg}`).toBe(false);
        expect(fixtureToBuild(d), `${form} ${deg}`).toBeUndefined();
      }
    }
  });

  it('every pitch in range, the ends included, is valid and is built', () => {
    for (const deg of inRange) {
      const d = withDeg(deg);
      expect(d.validation, `${deg}`).toEqual({ok: true});
      expect(fixtureToBuild(d)).toBe(d.fixture);
    }
  });

  it('a pitch that is not a number is not an edit', () => {
    const d = makeDraft(oneRing());
    expect(dispatch(d, {kind: 'setDefaultDeg', ring: 0, value: Number.NaN})).toBe(d);
    expect(dispatch(d, {kind: 'setSidePitch', ring: 0, side: 'S', value: Number.POSITIVE_INFINITY})).toBe(d);
  });

  it('the refusal names the pitch and its range, and points at the field that holds it', () => {
    const d = dispatch(withDeg(45), {kind: 'setSidePitch', ring: 0, side: 'N', value: 3});
    const errors = d.validation.ok ? [] : d.validation.errors;
    const refusals = explainRefusals(errors, d.fixture);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatchObject({ring: 0, field: 'sidePitch', side: 'N'});
    expect(refusals[0].text).toMatch(/3 degrees, outside \[7, 75\]/);
    const viaDefault = withDeg(3);
    const fromDefault = explainRefusals(viaDefault.validation.ok ? [] : viaDefault.validation.errors, viaDefault.fixture);
    expect(fromDefault.length).toBe(4);
    expect(new Set(fromDefault.map(r => r.field))).toEqual(new Set(['defaultDeg']));
  });
});

describe('refusals are placed on fields (decision 7)', () => {
  const place = (f: ShellFixture) => {
    const v = validate(f);
    return explainRefusals(v.ok ? [] : v.errors, f);
  };

  it('places a Ring\'s shape on its rect, and its storeys on their fields', () => {
    const f = {...oneRing(), rings: [ring([0, 0, 500, 500], 0, 1, 45), ring([600, 0, 0, 500], 0, 1, 45)]};
    expect(place(f).filter(r => r.ring === 1).every(r => r.field === 'rect')).toBe(true);
    expect(place(f).some(r => r.ring === 1)).toBe(true);
    const g = {...oneRing(), rings: [ring([0, 0, 500, 500], 0, 0, 45)]};
    expect(place(g)).toMatchObject([{ring: 0, field: 'storeys'}]);
    const h = {...oneRing(), rings: [ring([0, 0, 500, 500], -1, 1, 45)]};
    expect(place(h)).toMatchObject([{ring: 0, field: 'baseStorey'}]);
  });

  it('places an empty fixture on the draft, not on a Ring', () => {
    expect(place({...oneRing(), rings: []})).toMatchObject([{ring: null, field: 'rings'}]);
  });
});

describe('the draft: history, selection and the never-blocked rule (decisions 3, 9, 16 and 21)', () => {
  const start = (): Draft => makeDraft({name: 'two', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 500], 0, 1, 45), ring([500, 0, 1000, 500], 0, 1, 30)]});

  it('names a roster fixture\'s draft `<name>-draft`, once, and starts it valid and clean (decision 17)', () => {
    const d = editDraftOf(chalet);
    expect(d.fixture.name).toBe('DefaultChalet-draft');
    expect(editDraftOf(d.fixture).fixture.name).toBe('DefaultChalet-draft');
    expect(draftName('x')).toBe('x-draft');
    expect(d.validation.ok).toBe(true);
    expect(isDirty(d)).toBe(false);
    // Journal decision 198, M1: every listed side is spelled with its own pitch, which changes nothing the pipeline reads.
    expect(d.fixture.rings[0].sides).toEqual({W: {form: 'gable', deg: 22.5}, E: {form: 'gable', deg: 22.5}});
    expect(d.fixture.rings.map(r => resolveSides(r))).toEqual(chalet.rings.map(r => resolveSides(r)));
    expect(d.fixture.rings[0]).not.toBe(chalet.rings[0]);
    for (const f of EXPORTED_FIXTURES) {
      const adopted = editDraftOf(f).fixture;
      expect(adopted.rings.map(r => resolveSides(r)), f.name).toEqual(f.rings.map(r => resolveSides(r)));
      for (const r of adopted.rings) for (const s of RING_SIDES) if (r.sides?.[s]) expect(r.sides[s]?.deg, f.name).toBeTypeOf('number');
    }
  });

  it('offers a blank draft, which the wire refuses until a Ring is added', () => {
    const d = blankDraft();
    expect(d.fixture.rings).toEqual([]);
    expect(d.validation.ok).toBe(false);
    expect(d.selected).toBeNull();
    const added = dispatch(d, {kind: 'addRing'});
    expect(added.validation.ok).toBe(true);
    expect(added.selected).toBe(0);
  });

  it('undoes and redoes, and a new edit clears the redo list', () => {
    let d = start();
    expect(canUndo(d)).toBe(false);
    d = dispatch(d, {kind: 'setStoreys', ring: 0, value: 2});
    d = dispatch(d, {kind: 'setStoreys', ring: 0, value: 3});
    expect(canUndo(d)).toBe(true);
    d = dispatch(d, {kind: 'undo'});
    expect(d.fixture.rings[0].storeys).toBe(2);
    expect(canRedo(d)).toBe(true);
    d = dispatch(dispatch(d, {kind: 'undo'}), {kind: 'undo'});
    expect(d.fixture.rings[0].storeys).toBe(1);
    expect(dispatch(d, {kind: 'undo'})).toBe(d);
    d = dispatch(d, {kind: 'redo'});
    expect(d.fixture.rings[0].storeys).toBe(2);
    d = dispatch(d, {kind: 'setStoreys', ring: 0, value: 5});
    expect(canRedo(d)).toBe(false);
  });

  it('an edit that changes nothing adds no history', () => {
    const d = start();
    const same = dispatch(d, {kind: 'setStoreys', ring: 0, value: 1});
    expect(same.past).toHaveLength(0);
    expect(same.fixture).toBe(d.fixture);
    expect(dispatch(d, {kind: 'setRectCoord', ring: 0, coord: 2, value: 510}).past).toHaveLength(0);
  });

  it('keeps at most 200 fixtures of history, dropping the oldest (decision 21)', () => {
    let d = start();
    // The draft starts at 1 storey, so these are HISTORY_CAP + 5 commits, and the five oldest fixtures (1 to 5) are dropped.
    for (let i = 2; i <= HISTORY_CAP + 6; i++) d = dispatch(d, {kind: 'setStoreys', ring: 0, value: i});
    expect(d.past).toHaveLength(HISTORY_CAP);
    expect(d.past[0].rings[0].storeys).toBe(6);
    for (let i = 0; i < HISTORY_CAP; i++) d = dispatch(d, {kind: 'undo'});
    expect(d.fixture.rings[0].storeys).toBe(6);
    expect(canUndo(d)).toBe(false);
  });

  it('is never blocked: it passes through an invalid state to a valid one, and undo is always there (decision 9)', () => {
    let d = start();
    d = dispatch(d, {kind: 'setRectCoord', ring: 0, coord: 2, value: -500});
    expect(d.validation.ok).toBe(false);
    expect(canUndo(d)).toBe(true);
    d = dispatch(d, {kind: 'setRectCoord', ring: 0, coord: 2, value: 500});
    expect(d.validation.ok).toBe(true);
    d = dispatch(d, {kind: 'setStoreys', ring: 0, value: 0});
    expect(d.validation.ok).toBe(false);
    expect(dispatch(d, {kind: 'undo'}).validation.ok).toBe(true);
  });

  it('adds, removes, duplicates and moves Rings, and the selection follows (decisions 3 and 15)', () => {
    let d = dispatch(start(), {kind: 'select', ring: 1});
    d = dispatch(d, {kind: 'addRing'});
    expect(d.selected).toBe(2);
    expect(d.fixture.rings[2].rect).toEqual([1000, 0, 1500, 500]);
    d = dispatch(d, {kind: 'moveRing', ring: 2, direction: -1});
    expect([d.selected, d.fixture.rings[1].rect[0]]).toEqual([1, 1000]);
    d = dispatch(d, {kind: 'moveRing', ring: 0, direction: 1});
    expect(d.selected).toBe(0);
    d = dispatch(d, {kind: 'duplicateRing', ring: 0});
    expect([d.selected, d.fixture.rings.length]).toEqual([1, 4]);
    d = dispatch(d, {kind: 'removeRing', ring: 0});
    expect(d.selected).toBe(0);
    d = dispatch(d, {kind: 'select', ring: 2});
    d = dispatch(d, {kind: 'removeRing', ring: 2});
    expect(d.selected).toBe(1);
    expect(dispatch(d, {kind: 'select', ring: 9})).toBe(d);
    expect(dispatch(d, {kind: 'removeRing', ring: 9})).toBe(d);
    d = dispatch(dispatch(d, {kind: 'removeRing', ring: 0}), {kind: 'removeRing', ring: 0});
    expect(d.selected).toBeNull();
  });

  it('resets to the source it started from, undoably', () => {
    let d = dispatch(start(), {kind: 'addRing'});
    expect(isDirty(d)).toBe(true);
    d = dispatch(d, {kind: 'reset'});
    expect(d.fixture.rings).toHaveLength(2);
    expect(isDirty(d)).toBe(false);
    expect(dispatch(d, {kind: 'undo'}).fixture.rings).toHaveLength(3);
  });

  it('edits through the panel\'s actions produce the pure edit functions\' results', () => {
    let d = start();
    d = dispatch(d, {kind: 'setSideForm', ring: 1, side: 'N', form: 'gable'});
    d = dispatch(d, {kind: 'setSidePitch', ring: 1, side: 'N', value: 40});
    d = dispatch(d, {kind: 'setBaseStorey', ring: 1, value: 1});
    d = dispatch(d, {kind: 'setStoreyHeight', value: 300});
    d = dispatch(d, {kind: 'setRectCoord', ring: 1, coord: 3, value: 524});
    expect(d.fixture.rings[1]).toEqual({rect: [500, 0, 1000, 500], baseStorey: 1, storeys: 1, defaultDeg: 30, sides: {N: {form: 'gable', deg: 40}}});
    expect(d.fixture.storeyHeight).toBe(300);
    d = dispatch(d, {kind: 'clearSide', ring: 1, side: 'N'});
    expect(d.fixture.rings[1].sides).toEqual({});
  });

  it('does not mutate the draft it is given, whatever the action', () => {
    // A draft with history on both sides, a selection and a difference from its source, so that every action does something.
    let d = start();
    d = dispatch(d, {kind: 'setStoreys', ring: 0, value: 2});
    d = dispatch(d, {kind: 'setStoreys', ring: 0, value: 3});
    d = dispatch(d, {kind: 'undo'});
    d = dispatch(d, {kind: 'select', ring: 1});
    const frozen = (v: unknown): void => { if (typeof v === 'object' && v) { Object.freeze(v); Object.values(v).forEach(frozen); } };
    frozen(d);
    const before = JSON.stringify(d);
    const actions: DraftAction[] = [
      {kind: 'addRing'}, {kind: 'undo'}, {kind: 'redo'}, {kind: 'reset'},
      {kind: 'removeRing', ring: 0}, {kind: 'duplicateRing', ring: 1}, {kind: 'moveRing', ring: 1, direction: -1},
      {kind: 'setRectCoord', ring: 0, coord: 2, value: 600}, {kind: 'setStoreys', ring: 0, value: 4}, {kind: 'setBaseStorey', ring: 1, value: 1},
      {kind: 'setDefaultDeg', ring: 0, value: 33}, {kind: 'setSideForm', ring: 0, side: 'E', form: 'gable'}, {kind: 'setSidePitch', ring: 0, side: 'N', value: 40},
      {kind: 'clearSide', ring: 0, side: 'S'}, {kind: 'setStoreyHeight', value: 300}, {kind: 'load', fixture: oneRing()},
    ];
    for (const a of actions) {
      const next = dispatch(d, a);
      expect(next, a.kind).not.toBe(d);
    }
    expect(JSON.stringify(d)).toBe(before);
  });
});

/** `readInput`'s `defaultDeg` for a Ring: the pitch of its first hip in S, E, N, W order, or the wire's fixed one with none. */
const wireDefaultDeg = (r: FixtureRing): number => {
  for (const s of RING_SIDES) {
    const side = resolveSides(r)[s];
    if (r.sides?.[s] && side.form === 'hip') return side.deg;
  }
  return WIRE_GABLE_ONLY_DEG;
};

/** A Ring that lists all four sides: the wire has no field for its `defaultDeg`, so a file cannot return it. */
const allListed = (r: FixtureRing): boolean => RING_SIDES.every(s => r.sides?.[s] !== undefined);

describe('gate 3: a draft survives download then load unchanged (decision 23 as amended, journal decision 198, M1)', () => {
  /** The draft, written out and read back. */
  const roundTrip = (f: ShellFixture): ShellFixture => {
    const read = parseDraftJson(draftJson(f), 'unrelated-file-name');
    if (!read.ok) throw new Error(`the file was refused: ${read.errors.join('; ')}`);
    return read.fixture;
  };

  /** The loaded fixture equals the draft, but for the one named exception, which is pinned exactly: what `readInput` gives. */
  const sameButForTheException = (draft: ShellFixture, loaded: ShellFixture): void => {
    const expected: ShellFixture = {...draft, rings: draft.rings.map(r => (allListed(r) ? {...r, defaultDeg: wireDefaultDeg(r)} : r))};
    expect(loaded).toEqual(expected);
  };

  for (const f of EXPORTED_FIXTURES) {
    it(`${f.name}: the file its draft downloads loads back as that draft`, () => {
      const d = editDraftOf(f).fixture;
      sameButForTheException(d, roundTrip(d));
    });
  }

  it('an edited draft survives it too, pitches, forms, listing and order included', () => {
    let d = editDraftOf(SHELL_FIXTURES.find(f => f.name === 'ValleyWings') as ShellFixture);
    d = dispatch(d, {kind: 'setSideForm', ring: 1, side: 'S', form: 'gable'});
    d = dispatch(d, {kind: 'setSidePitch', ring: 0, side: 'N', value: 33.5});
    d = dispatch(d, {kind: 'setDefaultDeg', ring: 2, value: 52.5});
    d = dispatch(d, {kind: 'setSideForm', ring: 2, side: 'W', form: 'hip'});
    d = dispatch(d, {kind: 'addRing'});
    d = dispatch(d, {kind: 'moveRing', ring: 3, direction: -1});
    expect(d.validation.ok).toBe(true);
    sameButForTheException(d.fixture, roundTrip(d.fixture));
  });

  it('the one exception: a Ring with all four sides listed comes back with the defaultDeg readInput gives, and nothing else of it changes', () => {
    const f: ShellFixture = {
      name: 'x', cellSize: 50, storeyHeight: 250,
      rings: [
        ring([0, 0, 500, 500], 0, 1, 60, {S: {form: 'gable', deg: 30}, E: {form: 'hip', deg: 35}, N: {form: 'hip', deg: 40}, W: {form: 'gable', deg: 45}}),
        ring([500, 0, 1000, 500], 0, 1, 25, {S: {form: 'gable', deg: 30}}),
      ],
    };
    const loaded = roundTrip(f);
    // Ring 0: all four listed, so its 60 is lost, and readInput's first-hip pitch, 35, stands in. Resolved sides are unchanged.
    expect(f.rings[0].defaultDeg).toBe(60);
    expect(loaded.rings[0].defaultDeg).toBe(35);
    expect(resolveSides(loaded.rings[0])).toEqual(resolveSides(f.rings[0]));
    expect({...loaded.rings[0], defaultDeg: 60}).toEqual(f.rings[0]);
    // Ring 1 has unlisted sides, so its defaultDeg is carried by them and comes back exactly.
    expect(loaded.rings[1]).toEqual(f.rings[1]);
    expect(loaded.name).toBe('x');
  });

  it('every difference between a draft and its load is a defaultDeg of a Ring with all four sides listed', () => {
    for (const f of EXPORTED_FIXTURES) {
      const d = editDraftOf(f).fixture;
      const loaded = roundTrip(d);
      d.rings.forEach((r, i) => {
        if (sameFixture({...d, rings: [r]}, {...loaded, rings: [loaded.rings[i]]})) return;
        expect(allListed(r), `${f.name} Ring ${i}`).toBe(true);
        expect({...loaded.rings[i], defaultDeg: r.defaultDeg}, `${f.name} Ring ${i}`).toEqual(r);
      });
    }
  });

  it('writes the draft\'s name as the file\'s provenance subject (decision 19)', () => {
    expect(JSON.parse(draftJson(editDraftOf(chalet).fixture)).provenance.subject).toBe('DefaultChalet-draft');
  });

  it('the raw round trip is not the same fixture, which is why the loaded draft is rebuilt from the file\'s `request`', () => {
    // readInput lists every side with its pitch and re-derives defaultDeg: the same building in another spelling.
    const raw = readInput(writeInput(chalet), chalet.name);
    expect(raw.ok).toBe(true);
    if (!raw.ok) return;
    expect(raw.fixture).not.toEqual(chalet);
    expect(Object.keys(raw.fixture.rings[0].sides ?? {}).sort()).toEqual(['E', 'N', 'S', 'W']);
    expect(resolveSides(raw.fixture.rings[0])).toEqual(resolveSides(chalet.rings[0]));
    // The draft read from the file has the listing back: only W and E, each with its own pitch.
    const read = parseDraftJson(draftJson(chalet), 'x');
    expect(read.ok && read.fixture.rings[0].sides).toEqual({W: {form: 'gable', deg: 22.5}, E: {form: 'gable', deg: 22.5}});
    expect(read.ok && read.fixture.rings[0].defaultDeg).toBe(22.5);
  });

  it('keeps a side listed as a hip at the default pitch listed: its `request` is part of the file', () => {
    const f: ShellFixture = {name: 'l', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 500], 0, 1, 45, {S: {form: 'hip', deg: 45}, N: {form: 'hip', deg: 45}})]};
    const read = parseDraftJson(draftJson(f), 'x');
    expect(read.ok && read.fixture.rings[0].sides).toEqual({S: {form: 'hip', deg: 45}, N: {form: 'hip', deg: 45}});
  });

  it('reads a file whose Auto sides disagree (the C++ may write one) without changing what any side solves', () => {
    const input = fileWith(i => { i.rings[0].sides[1].runs[0].pitchDegrees = 30; i.rings[0].sides[2].runs[0].form = 'GableEnd'; });
    const read = parseDraftJson(JSON.stringify(input), 'x');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(resolveSides(read.fixture.rings[0])).toEqual({S: {form: 'hip', deg: 45}, E: {form: 'hip', deg: 30}, N: {form: 'gable', deg: 45}, W: {form: 'hip', deg: 45}});
    // The two that disagree are listed, each with its own pitch; the two that agree follow the default.
    expect(read.fixture.rings[0].sides).toEqual({E: {form: 'hip', deg: 30}, N: {form: 'gable', deg: 45}});
  });

  it('a formless side of a foreign file resolves to the pitch readInput gives it (journal decision 198, Low 5)', () => {
    // Two flush Rings, so Ring 0's E side lies inside the union and may be formless. It has no run, so readInput leaves it
    // unlisted at its defaultDeg, the first Pitched side's pitch: 30. The Auto hips N and W at 45 must not drag that default
    // to 45, or the formless side would change pitch.
    const input = structuredClone(writeInput({name: 'two', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 500], 0, 1, 45), ring([500, 0, 1000, 500], 0, 1, 45)]}));
    input.rings[0].sides[0].runs[0].pitchDegrees = 30;
    input.rings[0].sides[0].request = 'Pitched';
    input.rings[0].sides[1].runs = [];
    const raw = readInput(input, 'x');
    expect(raw.ok).toBe(true);
    if (!raw.ok) return;
    const read = parseDraftJson(JSON.stringify(input), 'x');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(raw.fixture.rings[0].defaultDeg).toBe(30);
    expect(read.fixture.rings[0].defaultDeg).toBe(30);
    expect(resolveSides(read.fixture.rings[0]).E).toEqual(resolveSides(raw.fixture.rings[0]).E);
    for (const s of RING_SIDES) expect(resolveSides(read.fixture.rings[0])[s], s).toEqual(resolveSides(raw.fixture.rings[0])[s]);
  });

  it('a defect case becomes a draft through the same reconstruction as a loaded file (journal decision 198, N2)', () => {
    const f = chalet;
    const json = JSON.parse(draftJson(f));
    const viaCase = draftFixtureOfJson(json, 'CaseName');
    const viaFile = parseDraftJson(JSON.stringify(json), 'x');
    expect(viaCase.ok && viaFile.ok).toBe(true);
    if (!viaCase.ok || !viaFile.ok) return;
    expect(viaCase.fixture).toEqual({...viaFile.fixture, name: 'CaseName'});
    expect(editDraftOf(viaCase.fixture).fixture.name).toBe('CaseName-draft');
    expect(viaCase.fixture.rings[0].sides).toEqual({W: {form: 'gable', deg: 22.5}, E: {form: 'gable', deg: 22.5}});
  });

  it('refuses text that is not JSON, and a file the wire refuses, with the reasons', () => {
    expect(parseDraftJson('{not json', 'x')).toMatchObject({ok: false});
    const read = parseDraftJson(JSON.stringify(fileWith(i => { i.rings[0].sides[0].runs[0].pitchDegrees = 3; })), 'x');
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.errors.join('\n')).toMatch(/outside \[7, 75\]/);
  });
});

describe('equality of fixtures does not depend on key order (journal decision 198, B4)', () => {
  it('is the same fixture when only the order of the keys differs', () => {
    const a: ShellFixture = {name: 'k', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 500], 0, 1, 45, {W: {form: 'gable', deg: 30}, E: {form: 'hip', deg: 40}})]};
    const b: ShellFixture = {rings: [{sides: {E: {deg: 40, form: 'hip'}, W: {deg: 30, form: 'gable'}}, defaultDeg: 45, storeys: 1, baseStorey: 0, rect: [0, 0, 500, 500]}], storeyHeight: 250, cellSize: 50, name: 'k'};
    expect(sameFixture(a, b)).toBe(true);
    expect(sameFixture(a, {...b, name: 'other'})).toBe(false);
    expect(sameFixture(a, {...b, rings: [{...b.rings[0], sides: {E: {deg: 41, form: 'hip'}, W: {deg: 30, form: 'gable'}}}]})).toBe(false);
  });
});

describe('journal decision 198, M2: a build that did not finish, and a very tall draft', () => {
  const tall = (storeys: number): Draft => makeDraft({name: 'tall', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 500], 0, storeys, 45)]});

  it('builds a valid draft, and says why when it does not', () => {
    const d = makeDraft(oneRing());
    expect(buildGate(d, {unfinished: false, confirmedTall: false})).toBe('build');
    expect(buildGate(withDeg(3), {unfinished: false, confirmedTall: false})).toBe('invalid');
    expect(buildGate(blankDraft(), {unfinished: false, confirmedTall: false})).toBe('invalid');
  });

  it('does not build a draft whose last build did not finish (the mark), and says how to go on', () => {
    const d = makeDraft(oneRing());
    expect(buildGate(d, {unfinished: true, confirmedTall: false})).toBe('unfinished');
    expect(heldMessage('unfinished', d)).toMatch(/did not finish/);
    expect(heldMessage('unfinished', d)).toMatch(/Undo/);
  });

  it('the mark survives a reload: a text saved with it restores as unfinished, and without it as finished', () => {
    const d = dispatch(makeDraft(oneRing()), {kind: 'setStoreys', ring: 0, value: 2});
    const marked = restoreDraft(serializeDraft(d, {lastGood: undefined}));
    const clean = restoreDraft(serializeDraft(d));
    expect(marked?.unfinished).toBe(true);
    expect(clean?.unfinished).toBe(false);
    expect(restoreDraft(serializeDraft(d, {lastGood: undefined}).replace('"building":true', '"building":false'))?.unfinished).toBe(false);
  });

  it('a reload that finds the mark offers Undo: the draft that last built is its one step of history', () => {
    const good = makeDraft(oneRing());
    const bad = dispatch(good, {kind: 'setStoreys', ring: 0, value: 40});
    const restored = restoreDraft(serializeDraft(bad, {lastGood: good.fixture}));
    expect(restored?.unfinished).toBe(true);
    expect(restored?.draft.fixture.rings[0].storeys).toBe(40);
    expect(restored && canUndo(restored.draft)).toBe(true);
    expect(restored && dispatch(restored.draft, {kind: 'undo'}).fixture.rings[0].storeys).toBe(1);
    // Without the mark, a reload has no history (decision 21).
    expect(restoreDraft(serializeDraft(bad, undefined))?.draft.past).toEqual([]);
  });

  it('a save carries the mark whenever the draft is held unfinished or a build is in flight, whatever the action (journal decision 201)', () => {
    const base = dispatch(makeDraft(oneRing()), {kind: 'addRing'});
    const reloaded = restoreDraft(serializeDraft(base, {lastGood: undefined}));
    expect(reloaded?.unfinished).toBe(true);
    // A click on a Ring is a save of an unchanged fixture; it must not erase the mark of a draft still held as unfinished.
    const clicked = dispatch(reloaded?.draft ?? base, {kind: 'select', ring: 1});
    expect(clicked.fixture).toBe(reloaded?.draft.fixture);
    const afterClick = restoreDraft(serializeDraft(clicked, saveMark({unfinished: true, buildsInFlight: 0}, undefined)));
    expect(afterClick?.unfinished).toBe(true);
    // The same while the first build is still waiting: a click saves, and the build in flight keeps its mark.
    expect(restoreDraft(serializeDraft(clicked, saveMark({unfinished: false, buildsInFlight: 1}, undefined)))?.unfinished).toBe(true);
    expect(restoreDraft(serializeDraft(clicked, saveMark({unfinished: false, buildsInFlight: 2}, undefined)))?.unfinished).toBe(true);
    // Nothing held and nothing building: no mark.
    expect(saveMark({unfinished: false, buildsInFlight: 0}, undefined)).toBeUndefined();
    expect(restoreDraft(serializeDraft(clicked, saveMark({unfinished: false, buildsInFlight: 0}, undefined)))?.unfinished).toBe(false);
    // The mark brings the last good draft with it, for Undo.
    expect(saveMark({unfinished: true, buildsInFlight: 0}, base.fixture)?.lastGood).toBe(base.fixture);
  });

  it('a draft whose Rings\' storeys sum above 100 asks first; at 100 it does not; agreeing builds it', () => {
    expect(TALL_STOREY_SUM).toBe(100);
    expect(storeySum(tall(100).fixture)).toBe(100);
    expect(buildGate(tall(100), {unfinished: false, confirmedTall: false})).toBe('build');
    expect(buildGate(tall(101), {unfinished: false, confirmedTall: false})).toBe('ask');
    expect(buildGate(tall(101), {unfinished: false, confirmedTall: true})).toBe('build');
    // The sum is over Rings, not a Ring's height: two Rings of 51.
    const two = makeDraft({name: 't', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 500], 0, 51, 45), ring([500, 0, 1000, 500], 0, 51, 45)]});
    expect(storeySum(two.fixture)).toBe(102);
    expect(buildGate(two, {unfinished: false, confirmedTall: false})).toBe('ask');
    expect(heldMessage('ask', tall(101))).toMatch(/101 storeys/);
    expect(heldMessage('build', tall(101))).toBeNull();
  });

  it('neither is a validity rule: a tall draft and an unfinished one are valid (decision 193)', () => {
    expect(tall(200).validation).toEqual({ok: true});
    expect(fixtureToBuild(tall(200))).toBeDefined();
  });
});

describe('persistence (decisions 18 and 21)', () => {
  it('restores the draft and its source, and leaves the history behind', () => {
    let d = editDraftOf(chalet);
    d = dispatch(d, {kind: 'addRing'});
    const restored = restoreDraft(serializeDraft(d));
    expect(restored?.draft.fixture).toEqual(d.fixture);
    expect(restored?.draft.source).toEqual(d.source);
    expect(restored?.draft.past).toEqual([]);
    expect(restored?.unfinished).toBe(false);
  });

  it('restores a draft the wire refuses, which a reload must not lose', () => {
    const d = withDeg(3);
    const restored = restoreDraft(serializeDraft(d));
    expect(restored?.draft.fixture.rings[0].defaultDeg).toBe(3);
    expect(restored?.draft.validation.ok).toBe(false);
  });

  it('gives a saved listed side without a pitch its own, as a draft saved before the amendment would need', () => {
    const f: ShellFixture = {name: 'old', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 500], 0, 1, 33, {S: {form: 'gable'}})]};
    const text = JSON.stringify({v: 1, fixture: f, source: f});
    expect(restoreDraft(text)?.draft.fixture.rings[0].sides).toEqual({S: {form: 'gable', deg: 33}});
  });

  it('restores nothing from nothing, from garbage, or from another version', () => {
    expect(restoreDraft(null)).toBeUndefined();
    expect(restoreDraft('')).toBeUndefined();
    expect(restoreDraft('{"v":1}')).toBeUndefined();
    expect(restoreDraft('not json')).toBeUndefined();
    const text = JSON.parse(serializeDraft(makeDraft(oneRing()))) as {v: number};
    expect(restoreDraft(JSON.stringify({...text, v: 2}))).toBeUndefined();
    expect(restoreDraft(JSON.stringify({...text, fixture: {name: 1}}))).toBeUndefined();
  });
});

describe('the hash (decisions 18 and 20)', () => {
  const first = SHELL_FIXTURES[0];

  it('carries a draft as input@1 JSON and reads it back through readInput', () => {
    for (const f of SHELL_FIXTURES) {
      const link = draftFromLinkHash(draftLinkHash(f));
      expect(link?.ok, f.name).toBe(true);
      // The link carries the draft a roster fixture becomes, under the roster fixture's own name.
      if (link?.ok) {
        const d = {...editDraftOf(f).fixture, name: f.name};
        expect(link.fixture, f.name).toEqual({...d, rings: d.rings.map(r => (allListed(r) ? {...r, defaultDeg: wireDefaultDeg(r)} : r))});
      }
    }
  });

  it('survives a name with characters outside ASCII', () => {
    const f = {...oneRing(), name: 'Bü ✓ 家-draft'};
    const link = draftFromLinkHash(draftLinkHash(f));
    expect(link?.ok && link.fixture.name).toBe('Bü ✓ 家-draft');
  });

  it('uses only characters a hash holds unescaped', () => {
    expect(draftLinkHash(chalet)).toMatch(/^#draft=[A-Za-z0-9_-]+$/);
  });

  it('selects a link\'s draft, with the link as its origin', () => {
    const sel = selectionFromHash(draftLinkHash(chalet), {fixtures: SHELL_FIXTURES, cases: []});
    expect(sel).toMatchObject({kind: 'draft', origin: 'link'});
    expect(selectionName(sel)).toBe('DefaultChalet');
  });

  it('shows a link that fails readInput\'s refusal, and falls back to the first fixture', () => {
    const bad = fileWith(i => { i.rings[0].sides[1].runs[0].pitchDegrees = 80; });
    const hash = `#draft=${btoa(JSON.stringify(bad)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
    const sel = selectionFromHash(hash, {fixtures: SHELL_FIXTURES, cases: []});
    expect(sel.kind).toBe('fixture');
    if (sel.kind === 'fixture') {
      expect(sel.fixture).toBe(first);
      expect(sel.refusal?.join(' ')).toMatch(/outside \[7, 75\]/);
    }
    for (const junk of ['#draft=', '#draft=!!!', '#draft=e30', '#draft=bm90LWpzb24']) {
      const s = selectionFromHash(junk, {fixtures: SHELL_FIXTURES, cases: []});
      expect(s.kind, junk).toBe('fixture');
      if (s.kind === 'fixture') {
        expect(s.fixture, junk).toBe(first);
        expect(s.refusal?.length ?? 0, junk).toBeGreaterThan(0);
      }
    }
  });

  it('`#draft` is the saved draft, and the first fixture when there is none', () => {
    const saved = editDraftOf(chalet).fixture;
    expect(selectionFromHash(DRAFT_HASH, {fixtures: SHELL_FIXTURES, cases: [], saved})).toEqual({kind: 'draft', fixture: saved, origin: 'saved'});
    const none = selectionFromHash(DRAFT_HASH, {fixtures: SHELL_FIXTURES, cases: []});
    expect(none.kind === 'fixture' && none.fixture).toBe(first);
  });

  it('still names roster fixtures and defect cases as before', () => {
    expect(selectionFromHash('#Overhang', {fixtures: SHELL_FIXTURES, cases: []})).toMatchObject({kind: 'fixture'});
    expect(selectionFromHash('#NoSuch', {fixtures: SHELL_FIXTURES, cases: []})).toEqual({kind: 'fixture', fixture: first});
    expect(selectionFromHash('', {fixtures: SHELL_FIXTURES, cases: []})).toEqual({kind: 'fixture', fixture: first});
  });

  it('never reads a roster fixture as a link', () => {
    for (const f of SHELL_FIXTURES) expect(draftFromLinkHash(`#${encodeURIComponent(f.name)}`)).toBeUndefined();
  });
});

describe('the storey toggles of a rebuilt draft (decision 11)', () => {
  it('keeps a hidden storey hidden, shows a new one, and drops one that is gone', () => {
    const t = setStorey(makeToggles([0, 1, 2]), 1, false);
    const next = keepStoreys(t, [0, 1, 3]);
    expect(next.storeys).toEqual({0: true, 1: false, 3: true});
    expect([...visibleStoreys(next)].sort()).toEqual([0, 3]);
  });

  it('leaves layers, raw and the outline options as they were', () => {
    const t = {...makeToggles([0]), raw: true, highlightPartial: true, netKindOutlines: true};
    const next = keepStoreys(t, [0, 1]);
    expect([next.layers, next.raw, next.highlightPartial, next.netKindOutlines]).toEqual([t.layers, true, true, true]);
  });
});

describe('ringOfHit: the Ring a clicked face\'s provenance names (decision 15)', () => {
  const build = memoBuilds();
  const fixture = SHELL_FIXTURES.find(f => f.name === 'SingleStoreyT') as ShellFixture;

  it('names the Ring of a Wall or Gable Cell, for every such Cell', async () => {
    const b = await build(fixture);
    const named = new Set<number>();
    b.shell.cells.forEach((c, i) => {
      if (!c.source) return;
      expect(ringOfHit(b, {kind: 'surface', face: c.face, cell: i})).toBe(c.source.ringModelIndex);
      named.add(c.source.ringModelIndex);
    });
    expect([...named].sort()).toEqual([0, 1]);
  });

  it('names the lowest-index source of a face hit with no Cell under it', async () => {
    const b = await build(fixture);
    const face = b.shell.faces.find(f => f.sources.length > 0);
    expect(face).toBeDefined();
    if (face) expect(ringOfHit(b, {kind: 'surface', face: face.id, cell: null})).toBe(face.sources[0].ringModelIndex);
  });

  it('names no Ring for a Roof face, an Edge or a vertex: they carry no provenance', async () => {
    const b = await build(fixture);
    const roof = b.shell.faces.find(f => f.tag.kind === 'Roof');
    expect(roof).toBeDefined();
    if (roof) expect(ringOfHit(b, {kind: 'surface', face: roof.id, cell: null})).toBeNull();
    expect(ringOfHit(b, {kind: 'edge', id: 0})).toBeNull();
    expect(ringOfHit(b, {kind: 'vertex', id: 0})).toBeNull();
  });
});

describe('side order', () => {
  it('RING_SIDES is S, E, N, W, which the refusal mapping reads side numbers by', () => {
    expect([...RING_SIDES]).toEqual(['S', 'E', 'N', 'W']);
  });
});

// ---- Stretches and the one spelling (journal decision 214) ---------------------------------------------------------------------

/** Every run of every side of a fixture. */
const runsOf = (f: ShellFixture): SideRun[] => f.rings.flatMap(r => Object.values(r.sides ?? {}).flatMap(s => s.runs ?? []));

/** A Ring that lists all four sides: the wire has no `defaultDeg` to carry for it (journal decision 198). */
const lists = (r: FixtureRing): boolean => RING_SIDES.every(s => r.sides?.[s] !== undefined);

/**
 * What download then load must return for a valid draft (journal decision 214, per-stretch gable settings decision 14): the
 * draft itself, but for the one named exception, `defaultDeg` of a Ring with all four sides listed, which is what
 * `readInput` gives it. A gable stretch's settings are not an exception: the wire carries them.
 */
function expectedLoad(draft: ShellFixture): ShellFixture {
  return {...draft, rings: draft.rings.map(r => (lists(r) ? {...r, defaultDeg: wireDefaultDeg(r)} : r))};
}

const loadOf = (f: ShellFixture): ShellFixture => {
  const read = parseDraftJson(draftJson(f), 'x');
  if (!read.ok) throw new Error(`the file was refused: ${read.errors.join('; ')}`);
  return read.fixture;
};

describe('gate 3 for stretches: download then load returns every valid draft itself (journal decision 214)', () => {
  for (const f of [...RISE_FIXTURES, ...GABLE_SETTING_FIXTURES]) {
    it(`${f.name}: its draft survives it`, () => {
      const d = editDraftOf(f);
      expect(d.validation.ok).toBe(true);
      expect(loadOf(d.fixture)).toEqual(expectedLoad(d.fixture));
    });
  }

  it('a plain rectangle with its S side split in three, the middle a steeper gable, survives it, and so does each stretch edit after', () => {
    let d = dispatch(makeDraft(oneRing(40)), {kind: 'splitStretch', ring: 0, side: 'S', run: 0});
    d = dispatch(d, {kind: 'setStretchPitch', ring: 0, side: 'S', run: 1, value: 60});
    expect(d.fixture.rings[0].sides?.S).toEqual({form: 'hip', deg: 40, runs: [
      {from: 0, to: 350, form: 'hip', deg: 40}, {from: 350, to: 650, form: 'gable', deg: 60}, {from: 650, to: 1000, form: 'hip', deg: 40},
    ]});
    const steps: DraftAction[] = [
      {kind: 'moveBoundary', ring: 0, side: 'S', run: 1, value: 300}, {kind: 'moveBoundary', ring: 0, side: 'S', run: 2, value: 700},
      {kind: 'setStretchForm', ring: 0, side: 'S', run: 0, form: 'gable'}, {kind: 'setStretchPitch', ring: 0, side: 'S', run: 0, value: 45},
      {kind: 'splitStretch', ring: 0, side: 'S', run: 2}, {kind: 'splitStretch', ring: 0, side: 'N', run: 0}, {kind: 'setStretchForm', ring: 0, side: 'N', run: 1, form: 'hip'},
    ];
    let checked = 0;
    for (const a of [null, ...steps]) {
      if (a) d = dispatch(d, a);
      if (!d.validation.ok) continue;
      checked++;
      expect(loadOf(d.fixture), JSON.stringify(a)).toEqual(expectedLoad(d.fixture));
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('the case the reviewer found: a hip side at 30 covered by three gable runs at 30 is a plain gable at 30, in the draft as in the load', () => {
    const f: ShellFixture = {name: 'r', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 30, {S: {form: 'hip', deg: 30, runs: [
      {from: 0, to: 300, form: 'gable', deg: 30}, {from: 300, to: 700, form: 'gable', deg: 30}, {from: 700, to: 1000, form: 'gable', deg: 30},
    ]}})]};
    const d = makeDraft(f);
    expect(d.fixture.rings[0].sides?.S).toEqual({form: 'gable', deg: 30});
    expect(loadOf(d.fixture)).toEqual(d.fixture);
    // So "side pitch 60" does the same to the draft as to its loaded copy.
    const a = dispatch(d, {kind: 'setSidePitch', ring: 0, side: 'S', value: 60});
    const b = dispatch(makeDraft(loadOf(d.fixture)), {kind: 'setSidePitch', ring: 0, side: 'S', value: 60});
    expect(a.fixture).toEqual(b.fixture);
  });

  it('the follow-up edit gives the same result on a draft and on its loaded copy, for every stretch edit, on every rise and gable setting fixture', () => {
    let compared = 0;
    for (const f of [...RISE_FIXTURES, ...GABLE_SETTING_FIXTURES]) {
      const d = editDraftOf(f);
      const copy = makeDraft(loadOf(d.fixture));
      for (const [i, r] of d.fixture.rings.entries()) {
        for (const side of RING_SIDES) {
          const n = r.sides?.[side]?.runs?.length ?? 1;
          const actions: DraftAction[] = [
            {kind: 'setSidePitch', ring: i, side, value: 60}, {kind: 'setSideForm', ring: i, side, form: 'gable'}, {kind: 'splitStretch', ring: i, side, run: n - 1},
            {kind: 'setStretchForm', ring: i, side, run: 0, form: 'gable'}, {kind: 'setStretchPitch', ring: i, side, run: 0, value: 55},
            {kind: 'halveStretch', ring: i, side, run: n - 1}, {kind: 'setStretchMaxHeight', ring: i, side, run: n - 1, value: 120},
            {kind: 'setStretchFacing', ring: i, side, run: n - 1, facing: 'split'}, {kind: 'setStretchApart', ring: i, side, run: n - 1, apart: false},
          ];
          for (const a of actions) {
            expect(dispatch(d, a).fixture, `${f.name} ${JSON.stringify(a)}`).toEqual(dispatch(copy, a).fixture);
            compared++;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(200);
  });

  it('what the wire carries now: maxHeight, facing and apart are written and loaded back (per-stretch gable settings decisions 14 and 19)', () => {
    const flat = RISE_FIXTURES.find(f => f.name === 'FlatTopRise') as ShellFixture;
    const d = editDraftOf(flat).fixture;
    expect(d.rings[0].sides?.S?.runs?.some(r => r.maxHeight === 200)).toBe(true);
    expect(draftJson(d)).toMatch(/"maxHeightCm": 200/);
    expect(loadOf(d)).toEqual(d);
    // Through the link too, and through a saved draft, after an edit that does not touch that stretch.
    const edited = dispatch(makeDraft(d), {kind: 'moveBoundary', ring: 0, side: 'S', run: 2, value: 800});
    expect(edited.fixture.rings[0].sides?.S?.runs?.some(r => r.maxHeight === 200)).toBe(true);
    const linked = draftFromLinkHash(draftLinkHash(edited.fixture));
    expect(linked?.ok && linked.fixture).toEqual(edited.fixture);
    expect(restoreDraft(serializeDraft(edited))?.draft.fixture).toEqual(edited.fixture);
    // Every setting at once, on stretches that would merge but for standing apart.
    let all = dispatch(makeDraft(oneRing(40)), {kind: 'splitStretch', ring: 0, side: 'S', run: 0});
    all = dispatch(all, {kind: 'halveStretch', ring: 0, side: 'S', run: 1});
    all = dispatch(all, {kind: 'setStretchMaxHeight', ring: 0, side: 'S', run: 1, value: 90});
    all = dispatch(all, {kind: 'setStretchFacing', ring: 0, side: 'S', run: 2, facing: 'whole'});
    expect(all.validation.ok).toBe(true);
    expect(all.fixture.rings[0].sides?.S?.runs).toEqual([
      {from: 0, to: 350, form: 'hip', deg: 40}, {from: 350, to: 500, form: 'gable', deg: 40, maxHeight: 90, apart: true},
      {from: 500, to: 650, form: 'gable', deg: 40, facing: 'whole', apart: true}, {from: 650, to: 1000, form: 'hip', deg: 40},
    ]);
    expect(loadOf(all.fixture)).toEqual(all.fixture);
  });

  it('limit, which the wire does not carry, has one value, which the one spelling writes as none: a draft that names it loads back as itself', () => {
    const f: ShellFixture = {name: 'l', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, 45, {S: {form: 'hip', runs: [{from: 300, to: 700, form: 'gable', deg: 60, limit: 'ridgeSlope'}]}})]};
    expect(draftJson(f)).not.toMatch(/limit/);
    const d = makeDraft(f).fixture;
    expect(runsOf(d).some(r => r.limit !== undefined)).toBe(false);
    expect(loadOf(d)).toEqual(d);
  });

  it('a maximum height of 0 is none in the draft, as on the wire, so no draft holds a 0 the pipeline refuses; a negative one is the wire\'s to refuse', () => {
    const split = dispatch(makeDraft(oneRing(40)), {kind: 'splitStretch', ring: 0, side: 'S', run: 0});
    const capped = dispatch(split, {kind: 'setStretchMaxHeight', ring: 0, side: 'S', run: 1, value: 150});
    expect(capped.fixture.rings[0].sides?.S?.runs?.[1].maxHeight).toBe(150);
    const zero = dispatch(capped, {kind: 'setStretchMaxHeight', ring: 0, side: 'S', run: 1, value: 0});
    expect(zero.fixture).toEqual(split.fixture);
    expect(dispatch(capped, {kind: 'setStretchMaxHeight', ring: 0, side: 'S', run: 1, value: null}).fixture).toEqual(split.fixture);
    const negative = dispatch(capped, {kind: 'setStretchMaxHeight', ring: 0, side: 'S', run: 1, value: -50});
    expect(negative.validation.ok).toBe(false);
    if (!negative.validation.ok) expect(explainRefusals(negative.validation.errors, negative.fixture)).toMatchObject([{ring: 0, field: 'run', side: 'S', run: 1}]);
    expect(dispatch(capped, {kind: 'setStretchMaxHeight', ring: 0, side: 'S', run: 1, value: Number.NaN})).toBe(capped);
  });

  it('a foreign file\'s mixed side that asks for Auto keeps its stretches (a side with runs is listed)', () => {
    const input = structuredClone(writeInput(editDraftOf(RISE_FIXTURES.find(f => f.name === 'MidWallRise') as ShellFixture).fixture));
    input.rings[0].sides[0].request = 'Auto';
    const read = parseDraftJson(JSON.stringify(input), 'x');
    expect(read.ok && read.fixture.rings[0].sides?.S).toEqual({form: 'hip', deg: 30, runs: [
      {from: 0, to: 330, form: 'hip', deg: 30}, {from: 330, to: 610, form: 'gable', deg: 45}, {from: 610, to: 1000, form: 'hip', deg: 30},
    ]});
  });

  it('a file with gaps between its runs, as the C++ may write, loads tiled, the gaps taking the side\'s own form', () => {
    const input = structuredClone(writeInput(oneRing(40)));
    input.rings[0].sides[0].runs = [
      {startCm: 300, endCm: 500, form: 'GableEnd', pitchDegrees: 60, bEmptied: false, bOutlineRefused: false, maxHeightCm: 0, facing: 'CentreLine', bStandsApart: false},
      {startCm: 700, endCm: 900, form: 'Pitched', pitchDegrees: 40, bEmptied: false, bOutlineRefused: false, maxHeightCm: 0, facing: 'CentreLine', bStandsApart: false},
    ];
    const read = parseDraftJson(JSON.stringify(input), 'x');
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.fixture.rings[0].sides?.S).toMatchObject({form: 'hip', deg: 40, runs: [{from: 0, to: 300}, {from: 300, to: 500}, {from: 500, to: 1000}]});
  });
});

/** A small seeded generator (a linear congruence), so a failing sequence can be replayed from its seed. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('the fuzz: for every valid draft an edit sequence reaches, download then load returns it (journal decision 214)', () => {
  const PITCHES = [7, 22.5, 30, 30, 45, 45, 45, 60, 75, 3, 80];
  const COORDS = [0, 50, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, -50];
  /** A maximum height field's entries: empty (null), heights above and below an apex, 0 (none, as on the wire) and one the wire refuses. */
  const MAX_HEIGHTS = [null, 100, 150, 200, 400, 0, -50];

  /** One random action on a draft, from what it holds: any edit the panel can make, stretch edits and undo included. */
  function randomAction(d: Draft, rng: () => number): DraftAction {
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
    const rings = d.fixture.rings.length;
    const ring = rings ? Math.floor(rng() * rings) : 0;
    const side = pick(RING_SIDES);
    const stretches = d.fixture.rings[ring]?.sides?.[side]?.runs?.length ?? 1;
    const run = Math.floor(rng() * stretches);
    // Per-stretch gable settings decisions 16 and 18: a gable stretch's three settings, and halving one into two that stand apart.
    const g = rng();
    if (g < 0.05) return {kind: 'halveStretch', ring, side, run};
    if (g < 0.10) return {kind: 'setStretchMaxHeight', ring, side, run, value: pick(MAX_HEIGHTS)};
    if (g < 0.15) return {kind: 'setStretchFacing', ring, side, run, facing: pick(RISE_FACINGS)};
    if (g < 0.21) return {kind: 'setStretchApart', ring, side, run, apart: pick([true, true, false])};
    const x = rng();
    if (x < 0.22) return {kind: 'splitStretch', ring, side, run};
    if (x < 0.34) return {kind: 'moveBoundary', ring, side, run: Math.max(1, run), value: pick(COORDS)};
    if (x < 0.46) return {kind: 'setStretchForm', ring, side, run, form: pick(['hip', 'gable'] as const)};
    if (x < 0.56) return {kind: 'setStretchPitch', ring, side, run, value: pick(PITCHES)};
    if (x < 0.62) return {kind: 'setSideForm', ring, side, form: pick(['hip', 'gable'] as const)};
    if (x < 0.67) return {kind: 'setSidePitch', ring, side, value: pick(PITCHES)};
    if (x < 0.70) return {kind: 'clearSide', ring, side};
    if (x < 0.74) return {kind: 'setDefaultDeg', ring, value: pick(PITCHES)};
    if (x < 0.80) return {kind: 'setRectCoord', ring, coord: pick([0, 1, 2, 3] as const), value: pick(COORDS)};
    if (x < 0.83) return {kind: 'addRing'};
    if (x < 0.85) return {kind: 'duplicateRing', ring};
    if (x < 0.87) return {kind: 'moveRing', ring, direction: pick([-1, 1] as const)};
    if (x < 0.89) return {kind: 'removeRing', ring};
    if (x < 0.91) return {kind: 'setStoreys', ring, value: pick([1, 2, 3])};
    if (x < 0.93) return {kind: 'setBaseStorey', ring, value: pick([0, 1])};
    if (x < 0.97) return {kind: 'undo'};
    return {kind: 'redo'};
  }

  const starts: [string, Draft][] = [
    ['a plain Ring', makeDraft(oneRing(40))],
    ['two flush Rings', makeDraft({name: 'two', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 500], 0, 1, 40), ring([500, 0, 1000, 500], 0, 1, 40)]})],
    ['the chalet', editDraftOf(chalet)],
    ...[...RISE_FIXTURES, ...GABLE_SETTING_FIXTURES].map((f): [string, Draft] => [f.name, editDraftOf(f)]),
  ];
  const SEQUENCES = 30, STEPS = 40;

  /** Whether a side holds two neighbouring gable stretches that would be one but that one of them stands apart (decision 17). */
  const keptApart = (runs: readonly SideRun[]): boolean => runs.some((r, k) => {
    const p = runs[k - 1];
    return p !== undefined && p.form === 'gable' && r.form === 'gable' && p.deg === r.deg && p.maxHeight === r.maxHeight && p.facing === r.facing && (p.apart === true || r.apart === true);
  });

  it('holds on every valid draft of the sequences, and the sequences cover what they should', () => {
    const stats = {
      sequences: 0, steps: 0, valid: 0, invalid: 0, splitSides: 0, threeStretchSides: 0, merges: 0, hipAndGable: 0, listedAll: 0, undone: 0, resizedSplit: 0,
      withMaxHeight: 0, withFacing: 0, withApart: 0, keptApart: 0, halved: 0, resizedSettings: 0,
    };
    const failures: string[] = [];
    starts.forEach(([name, start], si) => {
      for (let seq = 0; seq < SEQUENCES; seq++) {
        const rng = seeded(1000 * si + seq + 1);
        let d = start;
        const trace: string[] = [];
        stats.sequences++;
        for (let step = 0; step < STEPS; step++) {
          const a = randomAction(d, rng);
          const before = d;
          d = dispatch(d, a);
          trace.push(JSON.stringify(a));
          stats.steps++;
          if (a.kind === 'undo' && d !== before) stats.undone++;
          if (!d.validation.ok) { stats.invalid++; continue; }
          stats.valid++;
          const f = d.fixture;
          // Every valid draft is in the one spelling, and is the same fixture after a download and a load.
          if (!sameFixture(canonicalFixture(f), f)) failures.push(`${name} seed ${si}/${seq} step ${step}: not canonical after ${a.kind}`);
          const loaded = loadOf(f);
          if (!sameFixture(loaded, expectedLoad(f))) failures.push(`${name} seed ${si}/${seq} step ${step}: ${trace.slice(-6).join(' ')}\n  draft  ${JSON.stringify(f.rings.map(r => r.sides))}\n  loaded ${JSON.stringify(loaded.rings.map(r => r.sides))}`);
          const splits = f.rings.flatMap(r => Object.values(r.sides ?? {})).filter(s => s.runs?.length);
          stats.splitSides += splits.length;
          stats.threeStretchSides += splits.filter(s => (s.runs?.length ?? 0) >= 3).length;
          stats.hipAndGable += splits.filter(s => s.runs?.some(r => r.form === 'hip') && s.runs?.some(r => r.form === 'gable')).length;
          const runs = runsOf(f);
          if (runs.some(r => r.maxHeight !== undefined)) stats.withMaxHeight++;
          if (runs.some(r => r.facing !== undefined)) stats.withFacing++;
          if (runs.some(r => r.apart === true)) stats.withApart++;
          if (splits.some(s => keptApart(s.runs ?? []))) stats.keptApart++;
          if (a.kind === 'halveStretch' && d !== before) stats.halved++;
          // A resize of a Ring whose sides were split, which carries each boundary to its own world coordinate (journal decision 216).
          if (a.kind === 'setRectCoord' && before.fixture.rings.some(r => Object.values(r.sides ?? {}).some(s => s.runs?.length))) stats.resizedSplit++;
          if (a.kind === 'setRectCoord' && runsOf(before.fixture).some(r => Object.keys(settledSettings(r)).length > 0)) stats.resizedSettings++;
          if (f.rings.some(lists)) stats.listedAll++;
          // A merge: a stretch edit that left a split side with fewer stretches than it had.
          const had = before.fixture.rings.flatMap(r => Object.values(r.sides ?? {})).reduce((n, s) => n + (s.runs?.length ?? 0), 0);
          const has = splits.reduce((n, s) => n + (s.runs?.length ?? 0), 0);
          if ((a.kind === 'setStretchForm' || a.kind === 'setStretchPitch' || a.kind === 'moveBoundary') && has < had) stats.merges++;
        }
      }
    });
    expect(failures.slice(0, 5)).toEqual([]);
    // What the fuzz covered: it is a test of the property only if it reached these.
    expect(stats.sequences).toBe(starts.length * SEQUENCES);
    expect(stats.valid).toBeGreaterThan(5000);
    expect(stats.invalid).toBeGreaterThan(1000);
    expect(stats.splitSides).toBeGreaterThan(10000);
    expect(stats.threeStretchSides).toBeGreaterThan(8000);
    expect(stats.hipAndGable).toBeGreaterThan(10000);
    expect(stats.merges).toBeGreaterThan(60);
    expect(stats.listedAll).toBeGreaterThan(800);
    expect(stats.undone).toBeGreaterThan(500);
    expect(stats.resizedSplit).toBeGreaterThan(150);
    // Per-stretch gable settings decisions 16 to 18: drafts holding each setting, neighbours kept two by standing apart, halved
    // stretches, and resizes of Rings whose stretches carry settings (measured at 1,786, 2,260, 4,222, 2,315, 915 and 254).
    expect(stats.withMaxHeight).toBeGreaterThan(1000);
    expect(stats.withFacing).toBeGreaterThan(1300);
    expect(stats.withApart).toBeGreaterThan(2500);
    expect(stats.keptApart).toBeGreaterThan(1400);
    expect(stats.halved).toBeGreaterThan(500);
    expect(stats.resizedSettings).toBeGreaterThan(150);
    // 43,200 steps take about 10 s alone, more beside the rest of the suite: the default 5 s is not for it.
  }, 120_000);
});

describe('the stretch actions of a draft (journal decision 214)', () => {
  const start = (): Draft => makeDraft(oneRing(40));

  it('split, move, set and return to plain go through the draft, its history and its validity, and undo undoes each', () => {
    let d = dispatch(start(), {kind: 'splitStretch', ring: 0, side: 'S', run: 0});
    expect(d.fixture.rings[0].sides?.S?.runs).toHaveLength(3);
    d = dispatch(d, {kind: 'moveBoundary', ring: 0, side: 'S', run: 1, value: 300});
    d = dispatch(d, {kind: 'setStretchForm', ring: 0, side: 'S', run: 1, form: 'gable'});
    d = dispatch(d, {kind: 'setStretchPitch', ring: 0, side: 'S', run: 1, value: 60});
    expect(d.fixture.rings[0].sides?.S?.runs?.[1]).toEqual({from: 300, to: 650, form: 'gable', deg: 60});
    d = dispatch(d, {kind: 'clearSide', ring: 0, side: 'S'});
    expect(d.fixture.rings[0].sides?.S).toBeUndefined();
    for (let i = 0; i < 5; i++) d = dispatch(d, {kind: 'undo'});
    expect(canUndo(d)).toBe(false);
    expect(d.fixture.rings[0].sides).toEqual({});
  });

  it('setting two neighbours equal merges them, and a side of one stretch is plain', () => {
    let d = dispatch(start(), {kind: 'splitStretch', ring: 0, side: 'S', run: 0});
    d = dispatch(d, {kind: 'setStretchForm', ring: 0, side: 'S', run: 1, form: 'hip'});
    expect(d.fixture.rings[0].sides?.S).toEqual({form: 'hip', deg: 40});
  });

  it('is never blocked: a boundary moved past its neighbour is applied, and the draft is invalid', () => {
    const d = dispatch(start(), {kind: 'splitStretch', ring: 0, side: 'S', run: 0});
    const past = dispatch(d, {kind: 'moveBoundary', ring: 0, side: 'S', run: 1, value: 800});
    expect(past.validation.ok).toBe(false);
    expect(fixtureToBuild(past)).toBeUndefined();
    expect(dispatch(past, {kind: 'undo'}).validation.ok).toBe(true);
    // The malformed side is left as typed, so the next edit can put it right.
    const fixed = dispatch(past, {kind: 'moveBoundary', ring: 0, side: 'S', run: 1, value: 400});
    expect(fixed.validation.ok).toBe(true);
    expect(fixed.fixture.rings[0].sides?.S?.runs?.[1]).toMatchObject({from: 400, to: 650});
  });

  it('ignores a stretch that is gone, a boundary that is not one, and a value that is not a number', () => {
    const d = dispatch(start(), {kind: 'splitStretch', ring: 0, side: 'S', run: 0});
    expect(dispatch(d, {kind: 'splitStretch', ring: 0, side: 'S', run: 9})).toBe(d);
    expect(dispatch(d, {kind: 'moveBoundary', ring: 0, side: 'S', run: 0, value: 100})).toBe(d);
    expect(dispatch(d, {kind: 'moveBoundary', ring: 0, side: 'S', run: 3, value: 100})).toBe(d);
    expect(dispatch(d, {kind: 'moveBoundary', ring: 0, side: 'S', run: 1, value: Number.NaN})).toBe(d);
    expect(dispatch(d, {kind: 'setStretchPitch', ring: 0, side: 'S', run: 1, value: Number.POSITIVE_INFINITY})).toBe(d);
    expect(dispatch(d, {kind: 'splitStretch', ring: 7, side: 'S', run: 0})).toBe(d);
  });

  it('a stretch too short to split leaves the draft as it was', () => {
    const tiny = makeDraft({name: 't', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 50, 500], 0, 1, 40)]});
    expect(dispatch(tiny, {kind: 'splitStretch', ring: 0, side: 'S', run: 0}).fixture).toEqual(tiny.fixture);
  });

  it('a draft of a rise fixture starts valid, in the one spelling, with every stretch carrying its own pitch', () => {
    for (const f of RISE_FIXTURES) {
      const d = editDraftOf(f);
      expect(d.validation, f.name).toEqual({ok: true});
      expect(sameFixture(canonicalFixture(d.fixture), d.fixture), f.name).toBe(true);
      for (const r of d.fixture.rings) for (const s of RING_SIDES) for (const run of r.sides?.[s]?.runs ?? []) expect(run.deg, f.name).toBeTypeOf('number');
    }
  });

  it('places a refusal about a stretch on that stretch, by the index the wire writes', () => {
    let d = dispatch(start(), {kind: 'splitStretch', ring: 0, side: 'S', run: 0});
    d = dispatch(d, {kind: 'setStretchForm', ring: 0, side: 'S', run: 1, form: 'gable'});
    const place = (x: Draft) => explainRefusals(x.validation.ok ? [] : x.validation.errors, x.fixture);
    // A pitch of 80 on the middle stretch: the refusal is about stretch 1.
    const steep = dispatch(d, {kind: 'setStretchPitch', ring: 0, side: 'S', run: 1, value: 80});
    expect(place(steep)).toMatchObject([{ring: 0, field: 'run', side: 'S', run: 1}]);
    // A boundary moved past: the stretches it leaves empty or reversed are the stretches refused.
    const past = dispatch(d, {kind: 'moveBoundary', ring: 0, side: 'S', run: 1, value: 800});
    const refused = place(past).filter(r => r.field === 'run');
    expect(refused.length).toBeGreaterThan(0);
    for (const r of refused) expect(r).toMatchObject({ring: 0, side: 'S'});
    // Two hip stretches of different pitch are the side's.
    const hips = dispatch(d, {kind: 'setStretchPitch', ring: 0, side: 'S', run: 0, value: 30});
    expect(place(hips).length).toBeGreaterThan(0);
    expect(place(hips).every(r => r.ring === 0 && r.side === 'S')).toBe(true);
  });

  it('per-stretch gable settings decisions 16 to 18: halve, maximum height, facing and standing apart go through the draft and its history, and mutate nothing', () => {
    // The browser check's walk: a plain rectangle, three equal gable stretches each standing apart, then two unticked.
    let d = dispatch(start(), {kind: 'splitStretch', ring: 0, side: 'S', run: 0});
    d = dispatch(d, {kind: 'setStretchApart', ring: 0, side: 'S', run: 1, apart: true});
    d = dispatch(d, {kind: 'setStretchForm', ring: 0, side: 'S', run: 0, form: 'gable'});
    d = dispatch(d, {kind: 'setStretchForm', ring: 0, side: 'S', run: 2, form: 'gable'});
    d = dispatch(d, {kind: 'setStretchApart', ring: 0, side: 'S', run: 0, apart: true});
    d = dispatch(d, {kind: 'setStretchApart', ring: 0, side: 'S', run: 2, apart: true});
    expect(d.fixture.rings[0].sides?.S?.runs?.map(r => [r.from, r.to, r.form, r.apart])).toEqual([[0, 350, 'gable', true], [350, 650, 'gable', true], [650, 1000, 'gable', true]]);
    expect(d.validation.ok).toBe(true);
    // Unticking one leaves it between two that stand apart: still three. Unticking its neighbour too merges the two.
    const one = dispatch(d, {kind: 'setStretchApart', ring: 0, side: 'S', run: 0, apart: false});
    expect(one.fixture.rings[0].sides?.S?.runs).toHaveLength(3);
    const two = dispatch(one, {kind: 'setStretchApart', ring: 0, side: 'S', run: 1, apart: false});
    expect(two.fixture.rings[0].sides?.S?.runs?.map(r => [r.from, r.to, r.apart])).toEqual([[0, 650, undefined], [650, 1000, true]]);
    expect(dispatch(two, {kind: 'undo'}).fixture).toEqual(one.fixture);
    // Every new action on a frozen draft: each makes a new draft, and the one given is unchanged.
    const frozen = (v: unknown): void => { if (typeof v === 'object' && v) { Object.freeze(v); Object.values(v).forEach(frozen); } };
    frozen(one);
    const before = JSON.stringify(one);
    const actions: DraftAction[] = [
      {kind: 'halveStretch', ring: 0, side: 'S', run: 1}, {kind: 'setStretchMaxHeight', ring: 0, side: 'S', run: 1, value: 120},
      {kind: 'setStretchFacing', ring: 0, side: 'S', run: 2, facing: 'split'}, {kind: 'setStretchApart', ring: 0, side: 'S', run: 2, apart: false},
    ];
    for (const a of actions) expect(dispatch(one, a), a.kind).not.toBe(one);
    expect(JSON.stringify(one)).toBe(before);
    // A stale target is ignored, as every stretch action's is.
    expect(dispatch(one, {kind: 'halveStretch', ring: 0, side: 'S', run: 7})).toBe(one);
    expect(dispatch(one, {kind: 'setStretchFacing', ring: 3, side: 'S', run: 0, facing: 'whole'})).toBe(one);
  });
});
