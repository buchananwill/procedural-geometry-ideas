// WP-V2: every pinned case of `residue-pins.ts` is listed by the viewer, drawn from the generator its table's sweep uses.
// One source of truth: `src/viewer/pinned-cases.ts` imports the tables and the generators from here, `tests/`.
import {describe, expect, it} from 'vitest';
import type {ShellFixture} from '../src/fixture.ts';
import {editDraftOf} from '../src/viewer/draft.ts';
import {
  CONFLICT_TABLE_NAMES, CUT_OVERSHOOT_KEY, PINNED_CASES, PIN_TABLES, PIN_TABLE_NAMES, RESIDUE_TABLE_NAMES, pinnedCasesOf, pinnedDraftSource,
  pinnedFixture, pinnedFocus, pinnedGroupLabel, pinnedNote, pinnedValue,
} from '../src/viewer/pinned-cases.ts';
import type {ConflictTableName, PinTableName, ResidueTableName} from '../src/viewer/pinned-cases.ts';
import {CAUSE_CLASSES, pinClass} from './pin-table.ts';
import type {PinOutcome, ResiduePin} from './pin-table.ts';
import * as pins from './residue-pins.ts';
import {randomCourtyardFixtures, randomSplitCourtyardFixtures, randomUFixtures} from './robustness-fixtures.ts';

/** Each table's keys as the module exports it; the single cut-overshoot pin under its fixture's name. */
const tableKeys = (t: PinTableName): string[] => (t === 'CUT_OVERSHOOT_DEFECTS' ? [CUT_OVERSHOOT_KEY] : Object.keys(pins[t]));

/** A residue table's pin of `key`, read from `residue-pins.ts` itself, or undefined when the table does not pin it. */
const residuePinOf = (t: ResidueTableName, key: string): ResiduePin | undefined => {
  if (t === 'CUT_OVERSHOOT_DEFECTS') return key === CUT_OVERSHOOT_KEY ? pins.CUT_OVERSHOOT_DEFECTS : undefined;
  return Object.entries(pins[t]).find(([k]) => k === key)?.[1];
};

/** A conflict table's conflict lines for `key`, read from `residue-pins.ts` itself, or undefined when it does not pin it. */
const conflictsOf = (t: ConflictTableName, key: string): PinOutcome | undefined => Object.entries(pins[t]).find(([k]) => k === key)?.[1];

const isConflictTable = (t: PinTableName): t is ConflictTableName => CONFLICT_TABLE_NAMES.some(c => c === t);

/** A pin table's own outcome for `key`: the very array `residue-pins.ts` holds. */
const tableOutcome = (t: PinTableName, key: string): PinOutcome | undefined =>
  (isConflictTable(t) ? conflictsOf(t, key) : residuePinOf(t, key)?.outcome);

/** The pin tables with one conflict pin added to `s7h250/Court14`, a case a residue table pins, so a case two kinds of table pin exists. */
const DOUBLY_PINNED_KEY = 's7h250/Court14';
const DOUBLY_PINNED_LINES: PinOutcome = ['Court14: a conflict line added by this test'];
const doublyPinned = pinnedCasesOf({
  residue: PIN_TABLES.residue,
  conflict: {...PIN_TABLES.conflict, GABLE_RISE_CONFLICTS: [...PIN_TABLES.conflict.GABLE_RISE_CONFLICTS, [DOUBLY_PINNED_KEY, DOUBLY_PINNED_LINES]]},
}).find(c => c.key === DOUBLY_PINNED_KEY);

/** The sweeps' draw count per seed (`PER_COURTYARD_SEED` in robustness.test.ts), which `seededCase` draws a key from. */
const SWEEP_DRAWS = 40;

describe('the pin tables', () => {
  it('PIN_TABLE_NAMES lists every pin table residue-pins.ts exports, and only those', () => {
    // Every object residue-pins.ts exports is a pin table or a single pin; its functions (`seededKey`) are not.
    const exported = Object.entries(pins).filter(([, v]) => typeof v === 'object' && v !== null).map(([k]) => k);
    expect([...PIN_TABLE_NAMES].sort()).toEqual(exported.sort());
  });
});

describe('the pinned cases', () => {
  it('list every key of every pin table, each once, and nothing else', () => {
    const all = PIN_TABLE_NAMES.flatMap(tableKeys);
    expect(PINNED_CASES.map(c => c.key).sort()).toEqual([...new Set(all)].sort());
    for (const c of PINNED_CASES) expect(c.pins.map(p => p.table)).toEqual(PIN_TABLE_NAMES.filter(t => tableKeys(t).includes(c.key)));
    // Each once: as many cases as the tables hold distinct keys, however many that is.
    expect(PINNED_CASES.length).toBe(new Set(all).size);
    expect(PINNED_CASES.length).toBeGreaterThan(0);
  });

  it('carry each pin\'s outcome verbatim', () => {
    const c = PINNED_CASES.find(x => x.key === 's7h250/Court14');
    expect(c?.pins).toEqual([{kind: 'residue', table: 'COURTYARD_DEFECTS', outcome: pins.COURTYARD_DEFECTS['s7h250/Court14']?.outcome}]);
    // Every pin of every case is its table's own outcome array, not a copy.
    for (const x of PINNED_CASES) for (const p of x.pins) expect(p.outcome, `${x.key} ${p.table}`).toBe(tableOutcome(p.table, x.key));
    // No case is pinned by a residue table and a conflict table today, so the tables are given one: both pins are carried, residue first.
    expect(doublyPinned?.pins.map(p => p.table)).toEqual(['COURTYARD_DEFECTS', 'GABLE_RISE_CONFLICTS']);
    expect(doublyPinned?.pins[1].outcome).toBe(DOUBLY_PINNED_LINES);
  });

  it('group each case by its first residue pin\'s class, as the pin tables name it, else by its conflict table', () => {
    const s7 = PINNED_CASES.find(x => x.key === 's7h250/Court14');
    expect(s7?.group).toBe(CAUSE_CLASSES['roof-gable algorithm B, Cheek class']);
    expect(PINNED_CASES.find(x => x.key === 'ApexEdge5')?.group).toBe(pins.NUDGE_DEFECTS.ApexEdge5?.residueClass);
    expect(PINNED_CASES.find(x => x.key === 's1h250/Court14')).toMatchObject({kind: 'conflict', group: 'GABLE_RISE_CONFLICTS'});
    expect(s7?.kind).toBe('residue');
    expect(pinnedGroupLabel({kind: 'residue', group: 'algorithm-B Cheek'})).toBe('Pinned: algorithm-B Cheek');
    expect(pinnedGroupLabel({kind: 'conflict', group: 'GABLE_RISE_CONFLICTS'})).toBe('Pinned conflicts: GABLE_RISE_CONFLICTS');
    // The rule, case by case, read from the tables: the first residue table's pin's class, else the first conflict table.
    for (const x of PINNED_CASES) {
      const residue = RESIDUE_TABLE_NAMES.map(t => residuePinOf(t, x.key)).find(p => p !== undefined);
      const conflict = CONFLICT_TABLE_NAMES.find(t => conflictsOf(t, x.key) !== undefined);
      expect({kind: x.kind, group: x.group}, x.key).toEqual(residue ? {kind: 'residue', group: pinClass(residue)} : {kind: 'conflict', group: conflict});
    }
    // A case a residue table pins is a residue case, whatever conflict table pins it too.
    expect(doublyPinned).toMatchObject({kind: 'residue', group: 'algorithm-B Cheek'});
    expect(PINNED_CASES.filter(x => x.group === 'algorithm-B Cheek').length).toBeGreaterThan(0);
  });

  it('are valued pinned/<key>, so no pinned case shadows a defect case of the same name', () => {
    expect(PINNED_CASES.every(c => c.value === pinnedValue(c.key))).toBe(true);
    expect(pinnedValue('ApexEdge5')).toBe('pinned/ApexEdge5');
  });
});

describe('pinnedFixture', () => {
  it.each(PINNED_CASES.map(c => [c.key, c] as const))('%s is drawn from its generator', (_, c) => {
    const f = pinnedFixture(c);
    expect(f.rings.length).toBeGreaterThan(0);
  });

  const seeded: [string, (seed: number, count: number, h: number) => ShellFixture[]][] = [['Court', randomCourtyardFixtures], ['U', randomUFixtures], ['SplitCourt', randomSplitCourtyardFixtures]];
  it.each(PINNED_CASES.filter(c => /^s\d+h\d+\//.test(c.key)).map(c => [c.key, c] as const))('%s is the draw the sweeps make of 40 per seed', (key, c) => {
    const [, seed, h, family] = /^s(\d+)h(\d+)\/([A-Za-z]+)\d+$/.exec(key) ?? [];
    const gen = seeded.find(([f]) => f === family)?.[1];
    if (!gen) throw new Error(`no generator for ${key}`);
    const name = key.slice(key.indexOf('/') + 1);
    expect(pinnedFixture(c)).toEqual(gen(Number(seed), SWEEP_DRAWS, Number(h)).find(x => x.name === name));
  });

  it('keeps the generator\'s own name, so a conflict reads as its pin does; a draft takes the key', () => {
    const c = PINNED_CASES.find(x => x.key === 's7h250/Court14');
    if (!c) throw new Error('no s7h250/Court14');
    expect(pinnedFixture(c).name).toBe('Court14');
    expect(pinnedDraftSource(c).name).toBe('s7h250/Court14');
    expect(editDraftOf(pinnedDraftSource(c)).fixture.name).toBe('s7h250/Court14-draft');
  });

  it('refuses a key no generator draws', () => {
    expect(() => pinnedFixture({key: 'nothing', pins: [{kind: 'residue', table: 'COURTYARD_DEFECTS', outcome: []}]})).toThrow(/no generator draws/);
    expect(() => pinnedFixture({key: 's1h250/Court999x', pins: [{kind: 'residue', table: 'COURTYARD_DEFECTS', outcome: []}]})).toThrow();
    // A seeded key of a family no generator draws matches no family, so it never reaches an undefined generator.
    expect(() => pinnedFixture({key: 's1h250/Barn3', pins: [{kind: 'residue', table: 'COURTYARD_DEFECTS', outcome: []}]})).toThrow(/no generator draws/);
  });
});

describe('a pinned case on the page', () => {
  it('frames the places its residue pins name, and never a conflict\'s plane', () => {
    const c = PINNED_CASES.find(x => x.key === 's7h250/Court14');
    if (!c) throw new Error('no s7h250/Court14');
    expect(pinnedFocus(c)?.centre).toEqual([291.83203125, 250, 500]);
    const conflictOnly = PINNED_CASES.find(x => x.kind === 'conflict');
    if (!conflictOnly) throw new Error('no conflict-only case');
    expect(pinnedFocus(conflictOnly)).toBeUndefined();
  });

  it('notes its tables and their first outcome lines', () => {
    const c = PINNED_CASES.find(x => x.key === 's7h250/Court14');
    if (!c) throw new Error('no s7h250/Court14');
    expect(pinnedNote(c)).toBe('Pinned case s7h250/Court14, built from its generator as the suite builds it. COURTYARD_DEFECTS: cheeks 1, expected 0, at (291.83203125, 250, 500)');
  });
});
