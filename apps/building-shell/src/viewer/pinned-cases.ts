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

/** The pin tables whose pins carry a residue class, by the name `tests/residue-pins.ts` exports each under. */
export const RESIDUE_TABLE_NAMES = [
  'COURTYARD_DEFECTS', 'U_DEFECTS', 'SPLIT_COURTYARD_DEFECTS', 'NUDGE_DEFECTS', 'PITCH_END_DEFECTS', 'GAP_DEFECTS',
  'ROSTER_PITCH_DEFECTS', 'JUT_CUT_DEFECTS', 'CUT_OVERSHOOT_DEFECTS',
] as const;

/** One of `RESIDUE_TABLE_NAMES`. */
export type ResidueTableName = typeof RESIDUE_TABLE_NAMES[number];

/** The pin tables whose pins are conflicts alone, with no residue class: each is its own group, by its table name. */
export const CONFLICT_TABLE_NAMES = ['GABLE_RISE_CONFLICTS', 'GABLE_RISE_SPLIT_CONFLICTS'] as const;

/** One of `CONFLICT_TABLE_NAMES`. */
export type ConflictTableName = typeof CONFLICT_TABLE_NAMES[number];

/** Every pin table, residue tables first. A test holds this list to `tests/residue-pins.ts`'s exports. */
export const PIN_TABLE_NAMES = [...RESIDUE_TABLE_NAMES, ...CONFLICT_TABLE_NAMES] as const;

/** One of `PIN_TABLE_NAMES`. */
export type PinTableName = typeof PIN_TABLE_NAMES[number];

/** The key `CUT_OVERSHOOT_DEFECTS`, a single pin rather than a table, is listed under: its fixture's name. */
export const CUT_OVERSHOOT_KEY = CUT_OVERSHOOT_PROBE.name;

const entries = <V>(t: PinRecord<string, V>): [key: string, pin: V][] =>
  Object.entries(t).flatMap(([k, v]): [string, V][] => (v === undefined ? [] : [[k, v]]));

/** A residue table's entries, in the table's own order: each key with its pin. */
export type ResidueTableEntries = readonly (readonly [key: string, pin: ResiduePin])[];

/** A conflict table's entries, in the table's own order: each key with its conflict lines. */
export type ConflictTableEntries = readonly (readonly [key: string, conflicts: PinOutcome])[];

/** Every pin table's entries, by table name: what `pinnedCasesOf` lists. */
export interface PinTables {
  residue: Readonly<Record<ResidueTableName, ResidueTableEntries>>;
  conflict: Readonly<Record<ConflictTableName, ConflictTableEntries>>;
}

/** The pin tables of `tests/residue-pins.ts`, every one by its exported name. */
export const PIN_TABLES: PinTables = {
  residue: {
    COURTYARD_DEFECTS: entries(COURTYARD_DEFECTS),
    U_DEFECTS: entries(U_DEFECTS),
    SPLIT_COURTYARD_DEFECTS: entries(SPLIT_COURTYARD_DEFECTS),
    NUDGE_DEFECTS: entries(NUDGE_DEFECTS),
    PITCH_END_DEFECTS: entries(PITCH_END_DEFECTS),
    GAP_DEFECTS: entries(GAP_DEFECTS),
    ROSTER_PITCH_DEFECTS: entries(ROSTER_PITCH_DEFECTS),
    JUT_CUT_DEFECTS: entries(JUT_CUT_DEFECTS),
    CUT_OVERSHOOT_DEFECTS: [[CUT_OVERSHOOT_KEY, CUT_OVERSHOOT_DEFECTS]],
  },
  conflict: {
    GABLE_RISE_CONFLICTS: entries(GABLE_RISE_CONFLICTS),
    GABLE_RISE_SPLIT_CONFLICTS: entries(GABLE_RISE_SPLIT_CONFLICTS),
  },
};

/** A residue table's pin of a case: its table and its outcome lines. */
export interface ResidueCasePin { kind: 'residue'; table: ResidueTableName; outcome: PinOutcome }

/** A conflict table's pin of a case: its table and its conflict lines. */
export interface ConflictCasePin { kind: 'conflict'; table: ConflictTableName; outcome: PinOutcome }

/** One pin of a case. */
export type CasePin = ResidueCasePin | ConflictCasePin;

/** The selector's value of a pinned case: `pinned/<key>`, apart from every other entry's. */
export type PinnedValue = `pinned/${string}`;

/** What every pinned case carries. */
interface PinnedCaseBase {
  /** The pin tables' key: `s<seed>h<height>/<name>` for a seeded case, else the generator's name. */
  key: string;
  /** The selector's value and `#hash`. */
  value: PinnedValue;
  /** Every pin of the case, in `PIN_TABLE_NAMES` order. */
  pins: CasePin[];
}

/** A case a residue table pins: grouped by its first residue pin's class (`pinClass`). */
export interface ResiduePinnedCase extends PinnedCaseBase { kind: 'residue'; group: ResidueClass }

/** A case only a conflict table pins: grouped by that table's name. */
export interface ConflictPinnedCase extends PinnedCaseBase { kind: 'conflict'; group: ConflictTableName }

/** One pinned case, as the selector lists it. */
export type PinnedCase = ResiduePinnedCase | ConflictPinnedCase;

/** The value a pinned case is listed under. */
export const pinnedValue = (key: string): PinnedValue => `pinned/${key}`;

/**
 * Every case the tables pin, once each, grouped: the residue classes in `RESIDUE_CLASS_NAMES` order, then the conflict
 * tables; tables' order within. A case any residue table pins is a residue case, grouped by its first residue pin's class,
 * whatever conflict table pins it too; a case only conflict tables pin is grouped by the first of them.
 */
export function pinnedCasesOf(tables: PinTables): PinnedCase[] {
  const byKey = new Map<string, PinnedCase>();
  for (const table of RESIDUE_TABLE_NAMES) {
    for (const [key, pin] of tables.residue[table]) {
      const p: CasePin = {kind: 'residue', table, outcome: pin.outcome};
      const c = byKey.get(key);
      if (c) c.pins.push(p);
      else byKey.set(key, {kind: 'residue', key, value: pinnedValue(key), group: pinClass(pin), pins: [p]});
    }
  }
  for (const table of CONFLICT_TABLE_NAMES) {
    for (const [key, conflicts] of tables.conflict[table]) {
      const p: CasePin = {kind: 'conflict', table, outcome: conflicts};
      const c = byKey.get(key);
      if (c) c.pins.push(p);
      else byKey.set(key, {kind: 'conflict', key, value: pinnedValue(key), group: table, pins: [p]});
    }
  }
  const order: readonly PinnedCase['group'][] = [...RESIDUE_CLASS_NAMES, ...CONFLICT_TABLE_NAMES];
  return [...byKey.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** Every pinned case of `tests/residue-pins.ts`, as the selector lists them (`pinnedCasesOf`). */
export const PINNED_CASES: readonly PinnedCase[] = pinnedCasesOf(PIN_TABLES);

/** The selector's label of a pinned case's group. */
export const pinnedGroupLabel = (c: Pick<ResiduePinnedCase, 'kind' | 'group'> | Pick<ConflictPinnedCase, 'kind' | 'group'>): string =>
  (c.kind === 'conflict' ? `Pinned conflicts: ${c.group}` : `Pinned: ${c.group}`);

/** The seeded generators' families, as their draws are named: `Court<k>`, `U<k>`, `SplitCourt<k>`. */
export const SEEDED_FAMILIES = ['Court', 'U', 'SplitCourt'] as const;

/** One of `SEEDED_FAMILIES`. */
export type SeededFamily = typeof SEEDED_FAMILIES[number];

/** A draw of a seeded generator by its index: each generator draws in sequence, so the first k + 1 draws hold the k-th. */
type SeededGenerator = (seed: number, count: number, storeyHeight: number) => ShellFixture[];

const SEEDED_GENERATORS: Readonly<Record<SeededFamily, SeededGenerator>> = {
  Court: randomCourtyardFixtures, U: randomUFixtures, SplitCourt: randomSplitCourtyardFixtures,
};

/** A seeded key's parts: seed, storey height, the generator's family (one of `SEEDED_FAMILIES`) and the draw's index. */
const SEEDED = new RegExp(String.raw`^s(\d+)h(\d+)/(${SEEDED_FAMILIES.join('|')})(\d+)$`);

const isSeededFamily = (s: string): s is SeededFamily => SEEDED_FAMILIES.some(f => f === s);

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
export function pinnedFixture(c: Pick<PinnedCaseBase, 'key' | 'pins'>): ShellFixture {
  const seeded = SEEDED.exec(c.key);
  if (seeded) {
    const [, seed, h, family, k] = seeded;
    if (!isSeededFamily(family)) throw new Error(`${c.key} names no seeded generator`);
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
export const pinnedDraftSource = (c: Pick<PinnedCaseBase, 'key' | 'pins'>): ShellFixture => ({...pinnedFixture(c), name: c.key});

/**
 * Where the camera looks for a pinned case: the places its residue pins name, as a defect case's violations are framed.
 * A conflict table's lines name planes, not places (`n=(...)`), so they are left out.
 */
export const pinnedFocus = (c: Pick<PinnedCaseBase, 'pins'>): DefectFocus | undefined =>
  focusOf(violationPoints(c.pins.filter(p => p.kind === 'residue').flatMap(p => p.outcome)));

/** The note under the selector for a pinned case: its tables and their first outcome lines. */
export function pinnedNote(c: PinnedCase): string {
  const lines = c.pins.map(p => `${p.table}: ${p.outcome[0] ?? 'clean'}${p.outcome.length > 1 ? ` (+${p.outcome.length - 1} more)` : ''}`);
  return `Pinned case ${c.key}, built from its generator as the suite builds it. ${lines.join(' | ')}`;
}
