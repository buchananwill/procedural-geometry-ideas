// Viewer editing decisions 6 to 9, 15 to 21 and gates 3 and 4 of decision 23: the pure draft state, the file and link
// round trips, and the hash. Plain values in, plain values out, as `viewer-toggles.test.ts`.
import {describe, expect, it} from 'vitest';
import {EXPORTED_FIXTURES, RING_SIDES, SHELL_FIXTURES, ShellFixture, ring} from '../src/fixture.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import {
  Draft, HISTORY_CAP, blankDraft, canRedo, canUndo, canonicalFixture, dispatch, draftJson, draftName, editDraftOf, explainRefusals,
  fixtureToBuild, isDirty, keepStoreys, makeDraft, parseDraftJson, resolveSides, restoreDraft, ringOfHit, serializeDraft, validate,
} from '../src/viewer/draft.ts';
import {DRAFT_HASH, draftFromLinkHash, draftLinkHash, selectionFromHash, selectionName} from '../src/viewer/hash.ts';
import {makeToggles, setStorey, visibleStoreys} from '../src/viewer/toggles.ts';
import {memoBuilds} from './test-builds.ts';

const chalet = SHELL_FIXTURES.find(f => f.name === 'DefaultChalet') as ShellFixture;
const oneRing = (deg = 45): ShellFixture => ({name: 'one', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, deg)]});
const withDeg = (deg: number): Draft => dispatch(makeDraft(oneRing()), {kind: 'setDefaultDeg', ring: 0, value: deg});

describe('decision 6: a draft is valid when readInput(writeInput(draft)) accepts it', () => {
  it('accepts a draft the wire accepts and agrees with the wire call for call', () => {
    for (const f of EXPORTED_FIXTURES) {
      const wire = readInput(writeInput(f), f.name);
      expect(validate(f).ok, f.name).toBe(wire.ok);
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
    expect(d.fixture.rings).toEqual(chalet.rings);
    expect(d.fixture.rings[0]).not.toBe(chalet.rings[0]);
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

  it('does not mutate the draft it is given', () => {
    const d = start();
    const frozen = (v: unknown): void => { if (typeof v === 'object' && v) { Object.freeze(v); Object.values(v).forEach(frozen); } };
    frozen(d);
    const before = JSON.stringify(d);
    for (const kind of ['addRing', 'undo', 'redo', 'reset'] as const) dispatch(d, {kind});
    dispatch(d, {kind: 'setStoreys', ring: 0, value: 4});
    dispatch(d, {kind: 'moveRing', ring: 0, direction: 1});
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('gate 3: a draft survives download then load unchanged (decision 23)', () => {
  const same = (a: ShellFixture, b: ShellFixture): void => {
    expect(b).toEqual(canonicalFixture(a));
    expect(b.name).toBe(a.name);
    expect(b.cellSize).toBe(a.cellSize);
    expect(b.storeyHeight).toBe(a.storeyHeight);
    expect(b.rings.map(r => resolveSides(r))).toEqual(a.rings.map(r => resolveSides(r)));
    expect(b.rings.map(r => r.rect)).toEqual(a.rings.map(r => r.rect));
    expect(writeInput(b)).toEqual(writeInput(a));
  };

  for (const f of EXPORTED_FIXTURES) {
    it(`${f.name}: the file it downloads loads back as the same draft`, () => {
      const read = parseDraftJson(draftJson(f), 'unrelated-file-name');
      expect(read.ok).toBe(true);
      if (read.ok) same(f, read.fixture);
    });
  }

  it('an edited draft survives it too, pitches, forms and order included', () => {
    let d = editDraftOf(SHELL_FIXTURES.find(f => f.name === 'ValleyWings') as ShellFixture);
    d = dispatch(d, {kind: 'setSideForm', ring: 1, side: 'S', form: 'gable'});
    d = dispatch(d, {kind: 'setSidePitch', ring: 0, side: 'N', value: 33.5});
    d = dispatch(d, {kind: 'setDefaultDeg', ring: 2, value: 52.5});
    d = dispatch(d, {kind: 'addRing'});
    d = dispatch(d, {kind: 'moveRing', ring: 3, direction: -1});
    expect(d.validation.ok).toBe(true);
    const read = parseDraftJson(draftJson(d.fixture), 'x');
    expect(read.ok).toBe(true);
    if (read.ok) same(d.fixture, read.fixture);
  });

  it('writes the draft\'s name as the file\'s provenance subject (decision 19)', () => {
    expect(JSON.parse(draftJson(editDraftOf(chalet).fixture)).provenance.subject).toBe('DefaultChalet-draft');
  });

  it('the raw round trip is not the same fixture, which is why the loaded draft is canonical', () => {
    // readInput lists every side with its pitch and re-derives defaultDeg: the same building in another spelling.
    const raw = readInput(writeInput(chalet), chalet.name);
    expect(raw.ok).toBe(true);
    if (!raw.ok) return;
    expect(raw.fixture).not.toEqual(chalet);
    expect(Object.keys(raw.fixture.rings[0].sides ?? {}).sort()).toEqual(['E', 'N', 'S', 'W']);
    expect(resolveSides(raw.fixture.rings[0])).toEqual(resolveSides(chalet.rings[0]));
    // The draft read from the file has the listing back: only W and E, as authored.
    const read = parseDraftJson(draftJson(chalet), 'x');
    expect(read.ok && read.fixture.rings[0]).toEqual(chalet.rings[0]);
  });

  it('keeps a side listed as a hip at the default pitch listed: its `request` is part of the file', () => {
    const f: ShellFixture = {name: 'l', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 500, 500], 0, 1, 45, {S: {form: 'hip', deg: 45}, N: {form: 'hip'}})]};
    const read = parseDraftJson(draftJson(f), 'x');
    expect(read.ok && read.fixture.rings[0].sides).toEqual({S: {form: 'hip'}, N: {form: 'hip'}});
  });

  it('reads a file whose Auto sides disagree (the C++ may write one) without changing what any side solves', () => {
    const json = JSON.parse(draftJson(oneRing(45))) as {rings: {sides: {request: string; runs: {pitchDegrees: number; form: string}[]}[]}[]};
    json.rings[0].sides[1].runs[0].pitchDegrees = 30;
    json.rings[0].sides[2].runs[0].form = 'GableEnd';
    const read = parseDraftJson(JSON.stringify(json), 'x');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(resolveSides(read.fixture.rings[0])).toEqual({S: {form: 'hip', deg: 45}, E: {form: 'hip', deg: 30}, N: {form: 'gable', deg: 45}, W: {form: 'hip', deg: 45}});
  });

  it('canonicalFixture is idempotent', () => {
    for (const f of EXPORTED_FIXTURES) expect(canonicalFixture(canonicalFixture(f))).toEqual(canonicalFixture(f));
  });

  it('refuses text that is not JSON, and a file the wire refuses, with the reasons', () => {
    expect(parseDraftJson('{not json', 'x')).toMatchObject({ok: false});
    const bad = JSON.parse(draftJson(oneRing())) as {rings: {sides: {runs: {pitchDegrees: number}[]}[]}[]};
    bad.rings[0].sides[0].runs[0].pitchDegrees = 3;
    const read = parseDraftJson(JSON.stringify(bad), 'x');
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.errors.join('\n')).toMatch(/outside \[7, 75\]/);
  });
});

describe('persistence (decisions 18 and 21)', () => {
  it('restores the draft and its source, and leaves the history behind', () => {
    let d = editDraftOf(chalet);
    d = dispatch(d, {kind: 'addRing'});
    const restored = restoreDraft(serializeDraft(d));
    expect(restored?.fixture).toEqual(d.fixture);
    expect(restored?.source).toEqual(d.source);
    expect(restored?.past).toEqual([]);
  });

  it('restores a draft the wire refuses, which a reload must not lose', () => {
    const d = withDeg(3);
    const restored = restoreDraft(serializeDraft(d));
    expect(restored?.fixture.rings[0].defaultDeg).toBe(3);
    expect(restored?.validation.ok).toBe(false);
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
      if (link?.ok) expect(link.fixture).toEqual(canonicalFixture(f));
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
    const sel = selectionFromHash(draftLinkHash(chalet), SHELL_FIXTURES, []);
    expect(sel).toMatchObject({kind: 'draft', origin: 'link'});
    expect(selectionName(sel)).toBe('DefaultChalet');
  });

  it('shows a link that fails readInput\'s refusal, and falls back to the first fixture', () => {
    const bad = JSON.parse(draftJson(oneRing())) as {rings: {sides: {runs: {pitchDegrees: number}[]}[]}[]};
    bad.rings[0].sides[1].runs[0].pitchDegrees = 80;
    const hash = `#draft=${btoa(JSON.stringify(bad)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
    const sel = selectionFromHash(hash, SHELL_FIXTURES, []);
    expect(sel.kind).toBe('fixture');
    if (sel.kind === 'fixture') {
      expect(sel.fixture).toBe(first);
      expect(sel.refusal?.join(' ')).toMatch(/outside \[7, 75\]/);
    }
    for (const junk of ['#draft=', '#draft=!!!', '#draft=e30', '#draft=bm90LWpzb24']) {
      const s = selectionFromHash(junk, SHELL_FIXTURES, []);
      expect(s.kind, junk).toBe('fixture');
      if (s.kind === 'fixture') {
        expect(s.fixture, junk).toBe(first);
        expect(s.refusal?.length ?? 0, junk).toBeGreaterThan(0);
      }
    }
  });

  it('`#draft` is the saved draft, and the first fixture when there is none', () => {
    const saved = editDraftOf(chalet).fixture;
    expect(selectionFromHash(DRAFT_HASH, SHELL_FIXTURES, [], saved)).toEqual({kind: 'draft', fixture: saved, origin: 'saved'});
    const none = selectionFromHash(DRAFT_HASH, SHELL_FIXTURES, []);
    expect(none.kind === 'fixture' && none.fixture).toBe(first);
  });

  it('still names roster fixtures and defect cases as before', () => {
    expect(selectionFromHash('#Overhang', SHELL_FIXTURES, [])).toMatchObject({kind: 'fixture'});
    expect(selectionFromHash('#NoSuch', SHELL_FIXTURES, [])).toEqual({kind: 'fixture', fixture: first});
    expect(selectionFromHash('', SHELL_FIXTURES, [])).toEqual({kind: 'fixture', fixture: first});
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
