// WP-V2: every pinned case of `tests/residue-pins.ts`, for the viewer's selector. One source of truth: the page reads the
// same pin tables and builds each fixture with the same generator the robustness sweeps use, imported from `tests/`, so
// the list cannot drift from the suite. Pure: no scene, no DOM, no fetch, no Node globals. A fixture is generated only
// when it is asked for (`pinnedFixture`), so listing the cases costs nothing at page load.
import {SHELL_FIXTURES} from '../fixture.ts';
import type {ShellFixture} from '../fixture.ts';
import {RESIDUE_CLASS_NAMES} from '../golden.ts';
import type {ResidueClass} from '../golden.ts';
import {focusOf, violationPoints} from './defect-cases.ts';
import type {DefectFocus} from './defect-cases.ts';
import {pinClass} from '../../tests/pin-table.ts';
import type {PinOutcome, PinRecord, ResiduePin} from '../../tests/pin-table.ts';
import {
  COURTYARD_DEFECTS, CUT_OVERSHOOT_DEFECTS, GABLE_RISE_CONFLICTS, GABLE_RISE_SPLIT_CONFLICTS, GAP_DEFECTS, JUT_CUT_DEFECTS, NUDGE_DEFECTS,
  PITCH_END_DEFECTS, ROSTER_PITCH_DEFECTS, SPLIT_COURTYARD_DEFECTS, U_DEFECTS,
} from '../../tests/residue-pins.ts';
import {
  CUT_OVERSHOOT_PROBE, gapFixture, jutCutFixtures, nudgeFixtures, pitchEndFixtures, randomCourtyardFixtures, randomSplitCourtyardFixtures,
  randomUFixtures, rosterPitchCases,
} from '../../tests/robustness-fixtures.ts';

/** The pin tables, by the name `tests/residue-pins.ts` exports each under. */
export const PIN_TABLE_NAMES = [
  'COURTYARD_DEFECTS', 'U_DEFECTS', 'SPLIT_COURTYARD_DEFECTS', 'NUDGE_DEFECTS', 'PITCH_END_DEFECTS', 'GAP_DEFECTS',
  'ROSTER_PITCH_DEFECTS', 'JUT_CUT_DEFECTS', 'CUT_OVERSHOOT_DEFECTS', 'GABLE_RISE_CONFLICTS', 'GABLE_RISE_SPLIT_CONFLICTS',
] as const;

/** One of `PIN_TABLE_NAMES`. */
export type PinTableName = typeof PIN_TABLE_NAMES[number];

/** The tables whose pins are conflicts alone, with no residue class: each is its own group, by its table name. */
export const CONFLICT_TABLES: readonly PinTableName[] = ['GABLE_RISE_CONFLICTS', 'GABLE_RISE_SPLIT_CONFLICTS'];

/** The key `CUT_OVERSHOOT_DEFECTS`, a single pin rather than a table, is listed under: its fixture's name. */
export const CUT_OVERSHOOT_KEY = CUT_OVERSHOOT_PROBE.name;

/** A table's entries as `[key, pin]`, in the table's own order: a residue pin, or a conflict pin's lines. */
type PinEntries = [key: string, pin: ResiduePin | readonly string[]][];

const entries = <V extends ResiduePin | readonly string[]>(t: PinRecord<string, V>): PinEntries =>
  Object.entries(t).flatMap(([k, v]): PinEntries => (v === undefined ? [] : [[k, v]]));

/** Every table's entries, by table name. */
const TABLES: Readonly<Record<PinTableName, PinEntries>> = {
  COURTYARD_DEFECTS: entries(COURTYARD_DEFECTS),
  U_DEFECTS: entries(U_DEFECTS),
  SPLIT_COURTYARD_DEFECTS: entries(SPLIT_COURTYARD_DEFECTS),
  NUDGE_DEFECTS: entries(NUDGE_DEFECTS),
  PITCH_END_DEFECTS: entries(PITCH_END_DEFECTS),
  GAP_DEFECTS: entries(GAP_DEFECTS),
  ROSTER_PITCH_DEFECTS: entries(ROSTER_PITCH_DEFECTS),
  JUT_CUT_DEFECTS: entries(JUT_CUT_DEFECTS),
  CUT_OVERSHOOT_DEFECTS: [[CUT_OVERSHOOT_KEY, CUT_OVERSHOOT_DEFECTS]],
  GABLE_RISE_CONFLICTS: entries(GABLE_RISE_CONFLICTS),
  GABLE_RISE_SPLIT_CONFLICTS: entries(GABLE_RISE_SPLIT_CONFLICTS),
};

/** One pin of a case: the table that holds it, and its outcome lines (a residue's, or a conflict table's conflicts). */
export interface CasePin { table: PinTableName; outcome: PinOutcome }

/** One pinned case, as the selector lists it. */
export interface PinnedCase {
  /** The pin tables' key: `s<seed>h<height>/<name>` for a seeded case, else the generator's name. */
  key: string;
  /** The selector's value and `#hash`: `pinned/<key>`, apart from every other entry's. */
  value: string;
  /** Its group: the residue class of its first residue pin (`pinClass`), else its conflict table's name. */
  group: ResidueClass | PinTableName;
  /** Every pin of the case, in `PIN_TABLE_NAMES` order. */
  pins: CasePin[];
}

/** The value a pinned case is listed under. */
export const pinnedValue = (key: string): string => `pinned/${key}`;

/** Every pinned case, grouped: the residue classes in `RESIDUE_CLASS_NAMES` order, then the conflict tables; tables' order within. */
export const PINNED_CASES: readonly PinnedCase[] = (() => {
  const byKey = new Map<string, PinnedCase>();
  for (const table of PIN_TABLE_NAMES) {
    for (const [key, pin] of TABLES[table]) {
      const outcome: PinOutcome = 'outcome' in pin ? pin.outcome : pin;
      const group = 'outcome' in pin ? pinClass(pin) : table;
      const c = byKey.get(key);
      if (c) c.pins.push({table, outcome});
      else byKey.set(key, {key, value: pinnedValue(key), group, pins: [{table, outcome}]});
    }
  }
  const order: readonly (ResidueClass | PinTableName)[] = [...RESIDUE_CLASS_NAMES, ...CONFLICT_TABLES];
  return [...byKey.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
})();

/** The selector's label of a pinned case's group. */
export const pinnedGroupLabel = (group: PinnedCase['group']): string =>
  ((CONFLICT_TABLES as readonly string[]).includes(group) ? `Pinned conflicts: ${group}` : `Pinned: ${group}`);

/** A seeded key's parts: seed, storey height, the generator's family and the draw's index. */
const SEEDED = /^s(\d+)h(\d+)\/(Court|U|SplitCourt)(\d+)$/;

/** A draw of a seeded generator by its index: each generator draws in sequence, so the first k + 1 draws hold the k-th. */
type SeededGenerator = (seed: number, count: number, storeyHeight: number) => ShellFixture[];

const SEEDED_GENERATORS: Readonly<Record<string, SeededGenerator>> = {
  Court: randomCourtyardFixtures, U: randomUFixtures, SplitCourt: randomSplitCourtyardFixtures,
};

/** The one fixture of `fs` named `name`, or a throw naming what was looked for. */
function named(fs: readonly ShellFixture[], name: string, from: string): ShellFixture {
  const f = fs.find(x => x.name === name);
  if (!f) throw new Error(`${from} draws no fixture named ${name}`);
  return f;
}

const GAP = /^Gap(Aligned|Offset)(\d+)$/;

/**
 * A pinned case's fixture, drawn from the generator its table's sweep uses, under the generator's own name (so a
 * conflict reads as its pin does). A seeded case is the k-th draw of its seed at its storey height. Throws for a key no
 * generator draws.
 */
export function pinnedFixture(c: Pick<PinnedCase, 'key' | 'pins'>): ShellFixture {
  const seeded = SEEDED.exec(c.key);
  if (seeded) {
    const [, seed, h, family, k] = seeded;
    const draws = SEEDED_GENERATORS[family](Number(seed), Number(k) + 1, Number(h));
    return named(draws, `${family}${k}`, `the ${family} generator at seed ${seed}, ${h} cm`);
  }
  const table = c.pins[0].table;
  if (table === 'NUDGE_DEFECTS') return named(nudgeFixtures(), c.key, 'nudgeFixtures');
  if (table === 'PITCH_END_DEFECTS') return named(pitchEndFixtures(), c.key, 'pitchEndFixtures');
  if (table === 'JUT_CUT_DEFECTS') return named(jutCutFixtures(), c.key, 'jutCutFixtures');
  if (table === 'CUT_OVERSHOOT_DEFECTS') return CUT_OVERSHOOT_PROBE;
  if (table === 'GAP_DEFECTS') {
    const gap = GAP.exec(c.key);
    if (!gap) throw new Error(`${c.key} is no near-touching pair's name`);
    return gapFixture(gap[1] === 'Aligned' ? 'Aligned' : 'Offset', Number(gap[2]));
  }
  if (table === 'ROSTER_PITCH_DEFECTS') {
    const roster = c.key.slice(0, c.key.indexOf('@'));
    const found = rosterPitchCases([named(SHELL_FIXTURES, roster, 'SHELL_FIXTURES')]).find(x => x.name === c.key);
    if (!found) throw new Error(`rosterPitchCases draws no case named ${c.key}`);
    return found.fixture;
  }
  throw new Error(`no generator draws the pinned case ${c.key} of ${table}`);
}

/** The name a pinned case's draft takes its own name from: its key, which names it apart from every other draw. */
export const pinnedDraftSource = (c: Pick<PinnedCase, 'key' | 'pins'>): ShellFixture => ({...pinnedFixture(c), name: c.key});

/**
 * Where the camera looks for a pinned case: the places its residue pins name, as a defect case's violations are framed.
 * A conflict table's lines name planes, not places (`n=(...)`), so they are left out.
 */
export const pinnedFocus = (c: Pick<PinnedCase, 'pins'>): DefectFocus | undefined =>
  focusOf(violationPoints(c.pins.filter(p => !CONFLICT_TABLES.includes(p.table)).flatMap(p => p.outcome)));

/** The note under the selector for a pinned case: its tables and their first outcome lines. */
export function pinnedNote(c: PinnedCase): string {
  const lines = c.pins.map(p => `${p.table}: ${p.outcome[0] ?? 'clean'}${p.outcome.length > 1 ? ` (+${p.outcome.length - 1} more)` : ''}`);
  return `Pinned case ${c.key}, built from its generator as the suite builds it. ${lines.join(' | ')}`;
}
