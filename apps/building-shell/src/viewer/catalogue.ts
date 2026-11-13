// WP-V1: what the viewer's fixture selector lists, grouped, and its text filter. Pure data: no scene, no DOM, no fetch,
// and no Node globals (the page reads the manifest and hands it here). WP-V2: the pinned cases, and every entry's label
// carrying what it builds (`EntryFacts`), so the filter finds, for one, every entry that builds a Cheek.
import type {ShellFixture} from '../fixture.ts';
import {manifestEntries, record, text} from './defect-cases.ts';
import type {DefectCase} from './defect-cases.ts';
import {pinnedGroupLabel} from './pinned-cases.ts';
import type {PinnedCase} from './pinned-cases.ts';
import type {ResearchEntry} from './research-cases.ts';

/** A fixture the page reads from a committed `input@1` file: its name (the selector's value and `#hash`) and its URL path. */
export interface InputFile { name: string; path: string }

/** An input file as the page fetched it: the file, and its JSON as parsed, not yet read by `readInput`. */
export interface LoadedInput { file: InputFile; json: unknown }

/** One option of the selector. A disabled entry is listed for its reason and cannot be chosen. */
export interface CatalogueEntry { value: string; label: string; disabled?: boolean }

/** One `<optgroup>` of the selector. */
export interface CatalogueGroup { label: string; entries: CatalogueEntry[] }

/** The value of a left-out research case's disabled option: no fixture is named so. */
export const leftOutValue = (id: string): string => `research-left-out-${id}`;

/** Where the golden files are served from, relative to the page. */
export const GOLDEN_DIR_URL = 'golden/';

/** Where the playtest seeds are served from, relative to the page. */
export const PLAYTEST_DIR_URL = 'fixtures/playtest/';

/**
 * The playtest seeds' stems, `fixtures/playtest/<stem>.input.json` each: the browser cannot list a folder, so they are
 * named here, and a test holds this list to the folder.
 */
export const PLAYTEST_SEED_STEMS: readonly string[] = [
  'prototype-seed.0.BridgeOverBlock.0',
  'prototype-seed.0.Courtyard.0',
  'prototype-seed.0.DefaultChalet.0',
  'prototype-seed.0.MultiRunSide.0',
  'prototype-seed.0.OverlapRingConflictSwapped.0',
  'prototype-seed.0.PortPokeOut300.0',
  'prototype-seed.0.SingleStoreyT.0',
  'prototype-seed.0.ValleyWings.0',
];

/** The playtest seeds, each read from its file. */
export const playtestFiles = (): InputFile[] => PLAYTEST_SEED_STEMS.map(stem => ({name: stem, path: `${PLAYTEST_DIR_URL}${stem}.input.json`}));

/**
 * The golden manifest's clean entries with a committed `golden/<name>.input.json`, in manifest order, less those whose
 * name is in `listed` (a fixture the page holds in memory already). The defect cases (`clean: false`) are listed apart.
 */
export function goldenInputFiles(manifest: unknown, listed: ReadonlySet<string>): InputFile[] {
  const fixtures = manifestEntries(manifest);
  if (!fixtures) return [];
  return fixtures.flatMap((raw): InputFile[] => {
    const e = record(raw);
    const name = text(e?.fixture), input = text(e?.input);
    if (!e || name === undefined || input === undefined || e.clean !== true || listed.has(name)) return [];
    return [{name, path: `${GOLDEN_DIR_URL}${input}`}];
  });
}

/** Everything the selector can list, each list in its own order. */
export interface CatalogueSources {
  shell: readonly ShellFixture[];
  rises: readonly ShellFixture[];
  /** Per-stretch gable settings decision 22: one fixture per setting (`GABLE_SETTING_FIXTURES`). */
  gableSettings: readonly ShellFixture[];
  conflicts: readonly ShellFixture[];
  port: readonly ShellFixture[];
  research: readonly ResearchEntry[];
  defects: readonly DefectCase[];
  goldens: readonly InputFile[];
  playtest: readonly InputFile[];
  /** The pinned cases of `tests/residue-pins.ts` (WP-V2), each group by its pinned class. */
  pinned: readonly PinnedCase[];
  /** What each entry builds, by value (`CATALOGUE_FACTS`): an entry it does not name builds none of it. */
  facts: FactsLookup;
  /** The draft's name and the selector's value for it, when the editor holds one. */
  draft?: CatalogueEntry;
}

/**
 * WP-V2: what an entry builds that a person filters by: its Cheek faces, its conflicts, its Unclassified Edges, whether
 * its build throws, and whether it builds a gable rise. A table records only what is there: a count above zero, a flag
 * that holds.
 */
export type EntryFacts = Record<CountFact, number> & Record<FlagFact, boolean>;

/** The facts that are counts, in the order a label lists them. */
export const COUNT_FACTS = ['cheeks', 'conflicts', 'unclassified'] as const;

/** One of `COUNT_FACTS`. */
export type CountFact = typeof COUNT_FACTS[number];

/** The facts that are flags, listed after the counts. */
export const FLAG_FACTS = ['throws', 'rise'] as const;

/** One of `FLAG_FACTS`. */
export type FlagFact = typeof FLAG_FACTS[number];

/**
 * The one spec of every fact: the word its tag is spelled with. Exhaustive over `EntryFacts`, so a fact added to
 * `COUNT_FACTS` or `FLAG_FACTS` does not compile without its tag; `factTags` and `recordedFacts` both read it.
 */
export const FACT_WORDS: Readonly<Record<keyof EntryFacts, string>> = {
  cheeks: 'cheeks', conflicts: 'conflicts', unclassified: 'unclassified', throws: 'throws', rise: 'rise',
};

/** The largest count a table records: any real count is far below it. */
export const MAX_RECORDED_COUNT = 999;

/** The whole numbers 1 to `N`: `Acc` counts up, `Out` gathers. Tail-recursive, so it reaches 999. */
type OneTo<N extends number, Acc extends unknown[] = [unknown], Out extends number = never> =
  Acc['length'] extends N ? Out | N : OneTo<N, [...Acc, unknown], Out | Acc['length']>;

/** A count a table records: a whole number above zero, at most `MAX_RECORDED_COUNT`. `0` does not type-check. */
export type RecordedCount = OneTo<typeof MAX_RECORDED_COUNT>;

/** Whether `n` is a count a table records. */
export const isRecordedCount = (n: number): n is RecordedCount => Number.isInteger(n) && n >= 1 && n <= MAX_RECORDED_COUNT;

/**
 * One entry's facts as a table holds them: only the counts above zero and the flags that hold, so `{cheeks: 0}` and
 * `{throws: false}` do not type-check.
 */
export type RecordedFacts = Partial<Record<CountFact, RecordedCount> & Record<FlagFact, true>>;

/** The facts the catalogue reads, by an entry's value: an entry the table does not name builds none of them. */
export type FactsLookup = Readonly<Partial<Record<string, RecordedFacts>>>;

/** The facts an entry's label carries, as words the filter finds: `cheeks 2`, `conflicts 3`, `unclassified 1`, `throws`, `rise`. */
export function factTags(f: RecordedFacts | undefined): string[] {
  if (!f) return [];
  const tags: string[] = [];
  for (const k of COUNT_FACTS) {
    const n = f[k];
    if (n !== undefined) tags.push(`${FACT_WORDS[k]} ${n}`);
  }
  for (const k of FLAG_FACTS) if (f[k]) tags.push(FACT_WORDS[k]);
  return tags;
}

/** The facts an entry records, the zero counts and false flags left out, counts first. Throws for a count it cannot record. */
export function recordedFacts(f: EntryFacts): RecordedFacts {
  const out: RecordedFacts = {};
  for (const k of COUNT_FACTS) {
    const n = f[k];
    if (n === 0) continue;
    if (!isRecordedCount(n)) throw new Error(`${FACT_WORDS[k]} ${n} is no count a table records (1 to ${MAX_RECORDED_COUNT})`);
    out[k] = n;
  }
  for (const k of FLAG_FACTS) if (f[k]) out[k] = true;
  return out;
}

/** An entry's label with its facts appended, so the filter and the reader see them: `name [cheeks 1, rise]`. */
const withFacts = (e: CatalogueEntry, facts: FactsLookup): CatalogueEntry => {
  const tags = factTags(facts[e.value]);
  return tags.length ? {...e, label: `${e.label} [${tags.join(', ')}]`} : e;
};

const named = (fs: readonly ShellFixture[]): CatalogueEntry[] => fs.map(f => ({value: f.name, label: f.name}));

const filesOf = (fs: readonly InputFile[]): CatalogueEntry[] => fs.map(f => ({value: f.name, label: f.name}));

/** A research case's option: its id and title, and for a left-out case, disabled, with the reason. */
function researchEntry(e: ResearchEntry): CatalogueEntry {
  if (!e.conversion.ok) return {value: leftOutValue(e.id), label: `${e.id}: ${e.title} (left out: ${e.conversion.reason})`, disabled: true};
  return {value: e.name, label: `${e.id}: ${e.title}${e.conversion.courtyard ? ' (cut placed by the pipeline)' : ''}`};
}

/** Where a defect case is loaded from, in words: its selector label and the case box both say it (WP-V3). */
export function defectSourceText(c: Pick<DefectCase, 'source' | 'reasons'>): string {
  switch (c.source.kind) {
    case 'file': return `read from ${GOLDEN_DIR_URL}${c.source.input}`;
    case 'pinned': return `built from pinned case ${c.source.pinned.key}`;
    case 'fixture': return `built from listed fixture ${c.source.fixture.name}`;
    case 'none': return `cannot be loaded: no input file and no in-memory source (${c.reasons.length ? c.reasons.join('; ') : 'the manifest gives no reason'})`;
  }
}

/**
 * A defect case's option (journal decision 169): its name, its class and where it is loaded from (WP-V3). A case with no
 * source is listed disabled, for its reason, as a left-out research case is: it is never built, so it has no facts.
 */
function defectEntry(c: DefectCase): CatalogueEntry {
  const label = `${c.name}: ${c.residueClass} (${defectSourceText(c)})`;
  if (c.source.kind === 'none') return {value: c.name, label, disabled: true};
  return {value: c.name, label: c.error !== undefined ? `${label} (build throws)` : label};
}

/** A pinned case's option: its key, and the other tables that pin it too. */
function pinnedEntry(c: PinnedCase): CatalogueEntry {
  const also = c.pins.slice(1).map(p => p.table);
  return {value: c.value, label: also.length ? `${c.key} (also ${also.join(', ')})` : c.key};
}

/** The pinned cases' groups, one per group, in the cases' order. */
function pinnedGroups(cases: readonly PinnedCase[]): CatalogueGroup[] {
  const out: CatalogueGroup[] = [];
  for (const c of cases) {
    const label = pinnedGroupLabel(c);
    const last = out[out.length - 1];
    if (last && last.label === label) last.entries.push(pinnedEntry(c));
    else out.push({label, entries: [pinnedEntry(c)]});
  }
  return out;
}

/** The selector's groups, in the order shown, every entry labelled with its facts; a group with no entries is left out. */
export function catalogueGroups(s: CatalogueSources): CatalogueGroup[] {
  const groups: CatalogueGroup[] = [
    {label: 'Fixtures', entries: named(s.shell)},
    {label: 'Gable rises', entries: named(s.rises)},
    {label: 'Gable settings', entries: named(s.gableSettings)},
    {label: 'Ring conflicts', entries: named(s.conflicts)},
    {label: 'Port regressions', entries: named(s.port)},
    {label: 'Roof-gable research cases', entries: s.research.map(researchEntry)},
    {label: 'Goldens (golden/*.input.json)', entries: filesOf(s.goldens)},
    {label: 'Playtest seeds (fixtures/playtest)', entries: filesOf(s.playtest)},
    {label: 'Defect cases', entries: s.defects.map(defectEntry)},
    ...pinnedGroups(s.pinned),
    {label: 'Draft', entries: s.draft ? [s.draft] : []},
  ];
  return groups
    .filter(g => g.entries.length > 0)
    .map(g => ({label: g.label, entries: g.entries.map(e => withFacts(e, s.facts))}));
}

/** The filter's words, lower-cased: every one must appear in an entry's group, label or value. */
export const filterTerms = (query: string): string[] => query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

/**
 * The groups with only the entries matching `query`: every word of it appears in the entry's group label, its label or
 * its value, ignoring case. An empty query keeps everything. The entry valued `keep` stays whatever the query, so the
 * selector still shows what is on show.
 */
export function filterCatalogue(groups: readonly CatalogueGroup[], query: string, keep?: string): CatalogueGroup[] {
  const terms = filterTerms(query);
  if (!terms.length) return groups.map(g => ({label: g.label, entries: [...g.entries]}));
  return groups
    .map(g => ({
      label: g.label,
      entries: g.entries.filter(e => {
        if (keep !== undefined && e.value === keep) return true;
        const hay = `${g.label} ${e.label} ${e.value}`.toLowerCase();
        return terms.every(t => hay.includes(t));
      }),
    }))
    .filter(g => g.entries.length > 0);
}

/** How many entries the groups list that can be chosen. */
export const choosableCount = (groups: readonly CatalogueGroup[]): number => groups.reduce((n, g) => n + g.entries.filter(e => !e.disabled).length, 0);
