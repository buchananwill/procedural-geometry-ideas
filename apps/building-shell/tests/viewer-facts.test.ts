// WP-V2: every catalogue entry is built, and what it builds (its Cheek faces, conflicts, Unclassified Edges, a throw, a
// gable rise) is held to `src/viewer/catalogue-facts.ts`, the table the page labels each entry from. The table is
// generated here: run this file with CATALOGUE_FACTS_WRITE=1 to rewrite it; otherwise a stale table fails. Each pinned
// case's build is held to its pin, and each golden's to its manifest entry, so the table never records a result that
// disagrees with a pin.
import {readFileSync, writeFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {errorMessage} from '../src/errors.ts';
import {GABLE_SETTING_FIXTURES, PORT_FIXTURES, RING_CONFLICT_FIXTURES, RISE_FIXTURES, SHELL_FIXTURES, storeysOf} from '../src/fixture.ts';
import type {ShellFixture} from '../src/fixture.ts';
import {buildShellDetailed} from '../src/shell.ts';
import type {ShellBuild} from '../src/shell.ts';
import {planStorey} from '../src/storey.ts';
import {CATALOGUE_FACTS, CATALOGUE_VALUES} from '../src/viewer/catalogue-facts.ts';
import {
  CatalogueSources, EntryFacts, FACT_WORDS, FactsLookup, GOLDEN_DIR_URL, InputFile, RecordedFacts, catalogueGroups, factTags, filterCatalogue,
  goldenInputFiles, playtestFiles, recordedFacts,
} from '../src/viewer/catalogue.ts';
import {parseDefectCases} from '../src/viewer/defect-cases.ts';
import {inMemoryFixture, inMemorySources} from '../src/viewer/defect-sources.ts';
import {PINNED_CASES, pinnedFixture} from '../src/viewer/pinned-cases.ts';
import type {PinnedCase} from '../src/viewer/pinned-cases.ts';
import {RESEARCH_ENTRIES, RESEARCH_FIXTURES} from '../src/viewer/research-cases.ts';
import {readInput} from '../src/wire/input-adapter.ts';
import {GOLDEN_FIXTURES} from './golden-fixtures.ts';
import {throwsOutcome} from './pin-table.ts';

const APP = new URL('../', import.meta.url);
const FACTS_FILE = new URL('src/viewer/catalogue-facts.ts', APP);
const manifest: unknown = JSON.parse(readFileSync(new URL('golden/manifest.json', APP), 'utf8'));
const LISTED: readonly ShellFixture[] = [...SHELL_FIXTURES, ...RISE_FIXTURES, ...GABLE_SETTING_FIXTURES, ...RING_CONFLICT_FIXTURES, ...PORT_FIXTURES, ...RESEARCH_FIXTURES];
const goldens = goldenInputFiles(manifest, new Set(LISTED.map(f => f.name)));
const cases = parseDefectCases(manifest, inMemorySources(GOLDEN_FIXTURES, PINNED_CASES, LISTED));
const sources = (facts: FactsLookup): CatalogueSources => ({
  shell: SHELL_FIXTURES, rises: RISE_FIXTURES, gableSettings: GABLE_SETTING_FIXTURES, conflicts: RING_CONFLICT_FIXTURES, port: PORT_FIXTURES, research: RESEARCH_ENTRIES,
  defects: cases, goldens, playtest: playtestFiles(), pinned: PINNED_CASES, facts,
});

/** What one catalogue entry is built from: a fixture in memory, an input file on disk, or a pinned case's generator. */
type EntrySource = {kind: 'fixture'; fixture: ShellFixture} | {kind: 'file'; file: InputFile} | {kind: 'pinned'; pinned: PinnedCase};

const fileFixture = (f: InputFile): ShellFixture => {
  const read = readInput(JSON.parse(readFileSync(new URL(f.path, APP), 'utf8')), f.name);
  if (!read.ok) throw new Error(`readInput refuses ${f.path}: ${read.errors.join('; ')}`);
  return read.fixture;
};

/**
 * Every choosable entry of the catalogue, by value, in its order, with what it is built from: a defect case as the page
 * loads it, from its input file or its in-memory source (WP-V3). A defect case with no source is listed disabled, so it
 * is not choosable and is not here.
 */
const ENTRIES: [value: string, source: EntrySource][] = [
  ...LISTED.map((f): [string, EntrySource] => [f.name, {kind: 'fixture', fixture: f}]),
  ...[...goldens, ...playtestFiles()].map((f): [string, EntrySource] => [f.name, {kind: 'file', file: f}]),
  ...cases.flatMap((c): [string, EntrySource][] => {
    const s = c.source;
    if (s.kind === 'none') return [];
    return [[c.name, s.kind === 'file' ? {kind: 'file', file: {name: c.name, path: `${GOLDEN_DIR_URL}${s.input}`}} : {kind: 'fixture', fixture: inMemoryFixture(c.name, s)}]];
  }),
  ...PINNED_CASES.map((c): [string, EntrySource] => [c.value, {kind: 'pinned', pinned: c}]),
];

const fixtureOf = (s: EntrySource): ShellFixture => (s.kind === 'fixture' ? s.fixture : s.kind === 'file' ? fileFixture(s.file) : pinnedFixture(s.pinned));

/** One entry's build: what it builds, and the error when it throws. */
interface Measured { facts: EntryFacts; build?: ShellBuild; error?: string }

/** Whether any storey of `f` plans a gable rise. A storey whose plan throws plans none. */
function buildsARise(f: ShellFixture): boolean {
  return storeysOf(f).some(n => {
    try {
      return (planStorey(f, n).rises?.length ?? 0) > 0;
    } catch {
      return false;
    }
  });
}

async function measure(f: ShellFixture): Promise<Measured> {
  const rise = buildsARise(f);
  try {
    const build = await buildShellDetailed(f);
    const r = build.shell.report;
    return {build, facts: {cheeks: r.cheeks, conflicts: r.conflicts.length, unclassified: r.unclassifiedEdges, throws: false, rise}};
  } catch (e) {
    return {error: errorMessage(e), facts: {cheeks: 0, conflicts: 0, unclassified: 0, throws: true, rise}};
  }
}

/** The count a pin's outcome line states, `cheeks N, ...` or `N Unclassified Edges: ...`, or 0 when no line states it. */
const statedCount = (outcome: readonly string[], re: RegExp): number => {
  for (const l of outcome) {
    const m = re.exec(l);
    if (m) return Number(m[1]);
  }
  return 0;
};

/** Where a pinned case's build disagrees with its pins; empty when it agrees. */
function pinDisagreements(c: PinnedCase, m: Measured): string[] {
  const out: string[] = [];
  for (const p of c.pins) {
    if (p.kind === 'conflict') {
      const got = m.build?.shell.report.conflicts ?? [];
      if (JSON.stringify(got) !== JSON.stringify(p.outcome)) out.push(`${p.table}: conflicts ${JSON.stringify(got)}, pinned ${JSON.stringify(p.outcome)}`);
      continue;
    }
    const pinnedThrow = p.outcome.find(l => l.startsWith('throws: '));
    if (pinnedThrow !== undefined || m.error !== undefined) {
      const got = m.error === undefined ? 'builds' : throwsOutcome(m.error);
      if (got !== pinnedThrow) out.push(`${p.table}: ${got}, pinned ${pinnedThrow ?? 'a build'}`);
      continue;
    }
    const cheeks = statedCount(p.outcome, /^cheeks (\d+),/), unclassified = statedCount(p.outcome, /^(\d+) Unclassified Edges/);
    if (m.facts.cheeks !== cheeks) out.push(`${p.table}: cheeks ${m.facts.cheeks}, pinned ${cheeks}`);
    if (m.facts.unclassified !== unclassified) out.push(`${p.table}: unclassified ${m.facts.unclassified}, pinned ${unclassified}`);
  }
  return out;
}

/** A manifest entry's report and error, by fixture name. */
interface ManifestPin { report?: {cheeks: number; conflicts: string[]; unclassifiedEdges: number}; error?: string }
const MANIFEST: ReadonlyMap<string, ManifestPin> = new Map(
  (manifest as {fixtures: (ManifestPin & {fixture: string})[]}).fixtures.map(e => [e.fixture, e]),
);

/** Where a golden's build disagrees with its manifest entry's report or error; empty when it agrees or it is no golden. */
function manifestDisagreements(value: string, m: Measured): string[] {
  const g = MANIFEST.get(value);
  if (!g) return [];
  if (g.error !== undefined || m.error !== undefined) return g.error === m.error ? [] : [`error ${m.error ?? 'none'}, manifest ${g.error ?? 'none'}`];
  const r = m.build?.shell.report, want = g.report;
  if (!r || !want) return ['no report'];
  const out: string[] = [];
  if (r.cheeks !== want.cheeks) out.push(`cheeks ${r.cheeks}, manifest ${want.cheeks}`);
  if (r.unclassifiedEdges !== want.unclassifiedEdges) out.push(`unclassified ${r.unclassifiedEdges}, manifest ${want.unclassifiedEdges}`);
  if (r.conflicts.length !== want.conflicts.length) out.push(`conflicts ${r.conflicts.length}, manifest ${want.conflicts.length}`);
  return out;
}

/** Every choosable value of the catalogue, in its order: the values the facts table is typed over. */
const CHOOSABLE: readonly string[] = catalogueGroups(sources({})).flatMap(g => g.entries.filter(e => !e.disabled).map(e => e.value));

/** The facts table's source text: the catalogue's values as a const tuple, then the rows in catalogue order. */
function factsText(values: readonly string[], table: FactsLookup): string {
  const rows = Object.entries(table).map(([v, f]) => `  ${JSON.stringify(v)}: ${JSON.stringify(f).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')},`);
  return [
    '// Generated by tests/viewer-facts.test.ts (run it with CATALOGUE_FACTS_WRITE=1); the test fails while this is stale.',
    "import type {RecordedFacts} from './catalogue.ts';",
    '',
    '/** Every choosable value of the catalogue when the table was made, in catalogue order. */',
    'export const CATALOGUE_VALUES = [',
    ...values.map(v => `  ${JSON.stringify(v)},`),
    '] as const;',
    '',
    '/** One of `CATALOGUE_VALUES`: a row for any other value does not compile. */',
    'export type CatalogueValue = typeof CATALOGUE_VALUES[number];',
    '',
    '/** The facts table, typed over the catalogue\'s values. */',
    'export type CatalogueFacts = Readonly<Partial<Record<CatalogueValue, RecordedFacts>>>;',
    '',
    '/** What each catalogue entry builds, by value: only the counts above zero and the flags that hold. */',
    'export const CATALOGUE_FACTS: CatalogueFacts = {',
    ...rows,
    '};',
    '',
  ].join('\n');
}

const measured = new Map<string, Measured>();

describe('every catalogue entry, built (WP-V2)', () => {
  it('lists every choosable entry of the catalogue once, a defect case with no input file included', () => {
    const choosable = catalogueGroups(sources({})).flatMap(g => g.entries.filter(e => !e.disabled).map(e => e.value));
    expect(ENTRIES.map(([v]) => v).sort()).toEqual(choosable.sort());
    expect(new Set(choosable).size).toBe(choosable.length);
  });

  it('gives every listed entry a facts row or a stated reason it has none', () => {
    // A measured entry is a value of the table (`CATALOGUE_VALUES`), recorded with only what it builds: no row is "builds none".
    // An entry never measured is disabled, its reason in its label: a left-out research case, or a defect case with no source.
    const measured = new Set<string>(CATALOGUE_VALUES);
    for (const e of catalogueGroups(sources(CATALOGUE_FACTS)).flatMap(g => g.entries)) {
      if (measured.has(e.value)) continue;
      expect(e.disabled, e.value).toBe(true);
      expect(e.label, e.value).toMatch(/\((left out|cannot be loaded): .+\)$/);
    }
  });

  it('every fact word in the filter finds every entry that builds that fact, and nothing the table does not cover', () => {
    const groups = catalogueGroups(sources(CATALOGUE_FACTS));
    const measured = new Set<string>(CATALOGUE_VALUES);
    for (const [fact, word] of Object.entries(FACT_WORDS)) {
      const found = filterCatalogue(groups, word).flatMap(g => g.entries);
      for (const e of found) expect(measured.has(e.value) || e.disabled === true, `${word}: ${e.value}`).toBe(true);
      const having = Object.entries(CATALOGUE_FACTS).filter(([, f]) => f !== undefined && fact in f).map(([v]) => v);
      expect(having.filter(v => !found.some(e => e.value === v)), word).toEqual([]);
    }
  });

  it.each(ENTRIES)('%s builds as its pin or manifest entry says', async (value, source) => {
    const m = await measure(fixtureOf(source));
    measured.set(value, m);
    expect(source.kind === 'pinned' ? pinDisagreements(source.pinned, m) : []).toEqual([]);
    expect(manifestDisagreements(value, m)).toEqual([]);
  });

  it('holds the facts table to what every entry builds', () => {
    expect(measured.size).toBe(ENTRIES.length);
    const table: Record<string, RecordedFacts> = {};
    for (const [value] of ENTRIES) {
      const m = measured.get(value);
      if (!m) throw new Error(`${value} was not built`);
      const r = recordedFacts(m.facts);
      if (Object.keys(r).length) table[value] = r;
    }
    if (process.env.CATALOGUE_FACTS_WRITE) writeFileSync(FACTS_FILE, factsText(CHOOSABLE, table), 'utf8');
    else expect(readFileSync(FACTS_FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(factsText(CHOOSABLE, table));
    expect(CATALOGUE_FACTS).toEqual(process.env.CATALOGUE_FACTS_WRITE ? CATALOGUE_FACTS : table);
  });

  it('types the table over the catalogue\'s values as they stand', () => {
    // A write rewrites the file this module was loaded from: the next run reads the new tuple.
    if (!process.env.CATALOGUE_FACTS_WRITE) expect([...CATALOGUE_VALUES]).toEqual(CHOOSABLE);
  });

  it('records only counts above zero and flags that hold', () => {
    expect(recordedFacts({cheeks: 0, conflicts: 2, unclassified: 0, throws: false, rise: true})).toEqual({conflicts: 2, rise: true});
    expect(() => recordedFacts({cheeks: 1.5, conflicts: 0, unclassified: 0, throws: false, rise: false})).toThrow(/no count a table records/);
    expect(factTags({cheeks: 2, throws: true})).toEqual(['cheeks 2', 'throws']);
  });

  it('"cheek" in the filter finds every entry that builds a Cheek face, and only those', () => {
    const cheeky = Object.entries(CATALOGUE_FACTS).filter(([, f]) => (f?.cheeks ?? 0) > 0).map(([v]) => v);
    const found = filterCatalogue(catalogueGroups(sources(CATALOGUE_FACTS)), 'cheek').flatMap(g => g.entries.filter(e => !e.disabled).map(e => e.value));
    expect(found.sort()).toEqual(cheeky.sort());
    expect(cheeky.length).toBeGreaterThan(1);
  });

  it('labels an entry with its facts where the reader sees them', () => {
    const groups = catalogueGroups(sources(CATALOGUE_FACTS));
    const label = groups.flatMap(g => g.entries).find(e => e.value === 'pinned/s7h250/Court14')?.label;
    expect(label).toMatch(/^s7h250\/Court14 \[cheeks 1/);
  });
});
