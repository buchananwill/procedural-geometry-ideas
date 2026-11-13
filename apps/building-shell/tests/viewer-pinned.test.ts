// WP-V2: every pinned case of `residue-pins.ts` is listed by the viewer, drawn from the generator its table's sweep uses.
// One source of truth: `src/viewer/pinned-cases.ts` imports the tables and the generators from here, `tests/`.
import {describe, expect, it} from 'vitest';
import type {ShellFixture} from '../src/fixture.ts';
import {editDraftOf} from '../src/viewer/draft.ts';
import {
  CUT_OVERSHOOT_KEY, PINNED_CASES, PIN_TABLE_NAMES, pinnedDraftSource, pinnedFixture, pinnedFocus, pinnedGroupLabel, pinnedNote,
  pinnedValue,
} from '../src/viewer/pinned-cases.ts';
import type {PinTableName} from '../src/viewer/pinned-cases.ts';
import {CAUSE_CLASSES} from './pin-table.ts';
import * as pins from './residue-pins.ts';
import {randomCourtyardFixtures, randomSplitCourtyardFixtures, randomUFixtures} from './robustness-fixtures.ts';

/** Each table's keys as the module exports it; the single cut-overshoot pin under its fixture's name. */
const tableKeys = (t: PinTableName): string[] => (t === 'CUT_OVERSHOOT_DEFECTS' ? [CUT_OVERSHOOT_KEY] : Object.keys(pins[t]));

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
    expect(PINNED_CASES.length).toBe(196);
  });

  it('carry each pin\'s outcome verbatim', () => {
    const c = PINNED_CASES.find(x => x.key === 's7h250/Court14');
    expect(c?.pins).toEqual([{kind: 'residue', table: 'COURTYARD_DEFECTS', outcome: pins.COURTYARD_DEFECTS['s7h250/Court14']?.outcome}]);
    const both = PINNED_CASES.find(x => x.key === 's10h263/Court18');
    expect(both?.pins.map(p => p.table)).toEqual(['COURTYARD_DEFECTS', 'GABLE_RISE_CONFLICTS']);
    expect(both?.pins[1].outcome).toEqual(pins.GABLE_RISE_CONFLICTS['s10h263/Court18']);
  });

  it('group each case by its first residue pin\'s class, as the pin tables name it, else by its conflict table', () => {
    const s7 = PINNED_CASES.find(x => x.key === 's7h250/Court14');
    expect(s7?.group).toBe(CAUSE_CLASSES['roof-gable algorithm B, Cheek class']);
    expect(PINNED_CASES.find(x => x.key === 'ApexEdge5')?.group).toBe(pins.NUDGE_DEFECTS.ApexEdge5?.residueClass);
    expect(PINNED_CASES.find(x => x.key === 's1h250/Court14')).toMatchObject({kind: 'conflict', group: 'GABLE_RISE_CONFLICTS'});
    expect(s7?.kind).toBe('residue');
    expect(pinnedGroupLabel({kind: 'residue', group: 'algorithm-B Cheek'})).toBe('Pinned: algorithm-B Cheek');
    expect(pinnedGroupLabel({kind: 'conflict', group: 'GABLE_RISE_CONFLICTS'})).toBe('Pinned conflicts: GABLE_RISE_CONFLICTS');
    // A case a residue table pins is a residue case, whatever conflict table pins it too.
    expect(PINNED_CASES.find(x => x.key === 's10h263/Court18')?.kind).toBe('residue');
    expect(PINNED_CASES.filter(x => x.group === 'algorithm-B Cheek')).toHaveLength(15);
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
