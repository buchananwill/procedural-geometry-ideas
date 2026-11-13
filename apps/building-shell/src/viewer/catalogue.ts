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
  conflicts: readonly ShellFixture[];
  port: readonly ShellFixture[];
  research: readonly ResearchEntry[];
  defects: readonly DefectCase[];
  goldens: readonly InputFile[];
  playtest: readonly InputFile[];
  /** The pinned cases of `tests/residue-pins.ts` (WP-V2), each group by its pinned class. */
  pinned: readonly PinnedCase[];
  /** What each entry builds, by value (`CATALOGUE_FACTS`): an entry it does not name builds none of it. */
  facts: FactsTable;
  /** The draft's name and the selector's value for it, when the editor holds one. */
  draft?: CatalogueEntry;
}

/**
 * WP-V2: what an entry builds that a person filters by: its Cheek faces, its conflicts, its Unclassified Edges, whether
 * its build throws, and whether it builds a gable rise. A table records only what is there: a count above zero, a flag
 * that holds.
 */
export interface EntryFacts { cheeks: number; conflicts: number; unclassified: number; throws: boolean; rise: boolean }

/** One entry's facts as a table holds them: only the counts above zero and the flags that hold. */
export type RecordedFacts = Partial<EntryFacts>;

/** Every entry's recorded facts, by the entry's value. */
export type FactsTable = Readonly<Record<string, RecordedFacts>>;

/** The facts an entry's label carries, as words the filter finds: `cheeks 2`, `conflicts 3`, `unclassified 1`, `throws`, `rise`. */
export function factTags(f: RecordedFacts | undefined): string[] {
  if (!f) return [];
  return [
    ...(f.cheeks ? [`cheeks ${f.cheeks}`] : []),
    ...(f.conflicts ? [`conflicts ${f.conflicts}`] : []),
    ...(f.unclassified ? [`unclassified ${f.unclassified}`] : []),
    ...(f.throws ? ['throws'] : []),
    ...(f.rise ? ['rise'] : []),
  ];
}

/** The facts an entry records, the zero counts and false flags left out, in `EntryFacts` order. */
export function recordedFacts(f: EntryFacts): RecordedFacts {
  return {
    ...(f.cheeks ? {cheeks: f.cheeks} : {}),
    ...(f.conflicts ? {conflicts: f.conflicts} : {}),
    ...(f.unclassified ? {unclassified: f.unclassified} : {}),
    ...(f.throws ? {throws: true} : {}),
    ...(f.rise ? {rise: true} : {}),
  };
}

/** An entry's label with its facts appended, so the filter and the reader see them: `name [cheeks 1, rise]`. */
const withFacts = (e: CatalogueEntry, facts: FactsTable): CatalogueEntry => {
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

/** A defect case's option, as the page has always labelled it (journal decision 169). */
function defectEntry(c: DefectCase): CatalogueEntry {
  const note = c.input === undefined ? ' (cannot be loaded)' : c.error !== undefined ? ' (build throws)' : '';
  return {value: c.name, label: `${c.name}: ${c.residueClass}${note}`};
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
    const label = pinnedGroupLabel(c.group);
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
