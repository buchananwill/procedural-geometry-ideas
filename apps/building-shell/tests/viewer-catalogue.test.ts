// WP-V1: the viewer's fixture selector lists every fixture the repo holds a page can build: the roster, the gable rises,
// the Ring conflicts, the port's regressions, the roof-gable research cases, the clean goldens with a committed input,
// the playtest seeds and the defect cases, grouped, with a text filter.
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {PORT_FIXTURES, RING_CONFLICT_FIXTURES, RISE_FIXTURES, SHELL_FIXTURES} from '../src/fixture.ts';
import {
  CatalogueGroup, CatalogueSources, InputFile, PLAYTEST_SEED_STEMS, catalogueGroups, choosableCount, filterCatalogue, filterTerms,
  goldenInputFiles, leftOutValue, playtestFiles,
} from '../src/viewer/catalogue.ts';
import {parseDefectCases} from '../src/viewer/defect-cases.ts';
import {draftFixtureOfJson} from '../src/viewer/draft.ts';
import {selectionFromHash} from '../src/viewer/hash.ts';
import {RESEARCH_ENTRIES, RESEARCH_FIXTURES} from '../src/viewer/research-cases.ts';
import {readInput} from '../src/wire/input-adapter.ts';

const APP = new URL('../', import.meta.url);
const manifest: unknown = JSON.parse(readFileSync(new URL('golden/manifest.json', APP), 'utf8'));
const LISTED = [...SHELL_FIXTURES, ...RISE_FIXTURES, ...RING_CONFLICT_FIXTURES, ...PORT_FIXTURES, ...RESEARCH_FIXTURES];
const goldens = goldenInputFiles(manifest, new Set(LISTED.map(f => f.name)));
const cases = parseDefectCases(manifest);
const sources: CatalogueSources = {
  shell: SHELL_FIXTURES, rises: RISE_FIXTURES, conflicts: RING_CONFLICT_FIXTURES, port: PORT_FIXTURES,
  research: RESEARCH_ENTRIES, defects: cases, goldens, playtest: playtestFiles(),
};
const groups = catalogueGroups(sources);
const values = (gs: readonly CatalogueGroup[]): string[] => gs.flatMap(g => g.entries.map(e => e.value));
const read = (f: InputFile): unknown => JSON.parse(readFileSync(new URL(f.path, APP), 'utf8'));

describe('the input files the selector reads', () => {
  it('lists every playtest seed in fixtures/playtest, and only those', () => {
    const onDisk = readdirSync(new URL('fixtures/playtest/', APP)).filter(n => n.endsWith('.input.json')).map(n => n.slice(0, -'.input.json'.length));
    expect([...PLAYTEST_SEED_STEMS].sort()).toEqual(onDisk.sort());
  });

  it('lists the clean goldens with a committed input that no in-memory fixture names', () => {
    expect(goldens.map(g => g.name)).toEqual([
      'FlushOverReflex300', 'FlushOverReflex250', 'UpperUJoinedByEdgeContact', 'FullWingsProbe', 'SplitBandFreeCut', 'SplitBandFreeCut45',
      'GablePitchL', 'AsymmetricLScrambled', 'SB400-600B100S500g60r024', 'PitchRingConflictFileReversed', 'StoreyRingConflictFileReversed',
      'CutPitchConflictFileReversed', 'HoleRingConflictFileReversed',
    ]);
  });

  it('leaves no golden with a committed input unoffered: each is a listed fixture, a golden file or a defect case', () => {
    const entries = (manifest as {fixtures: {fixture: string; input?: string}[]}).fixtures.filter(e => e.input !== undefined);
    const offered = new Set([...LISTED.map(f => f.name), ...goldens.map(g => g.name), ...cases.map(c => c.name)]);
    expect(entries.filter(e => !offered.has(e.fixture)).map(e => e.fixture)).toEqual([]);
  });

  it.each([...goldens, ...playtestFiles()].map(f => [f.name, f] as const))('%s exists, reads, and reads as a draft', (_, f) => {
    expect(existsSync(new URL(f.path, APP))).toBe(true);
    const json = read(f);
    expect(readInput(json, f.name).ok).toBe(true);
    expect(draftFixtureOfJson(json, f.name).ok).toBe(true);
  });

  it('reads nothing from a manifest with no fixtures list', () => {
    expect(goldenInputFiles({}, new Set())).toEqual([]);
    expect(goldenInputFiles(null, new Set())).toEqual([]);
  });
});

describe('catalogueGroups', () => {
  it('groups the selector in a fixed order', () => {
    expect(groups.map(g => g.label)).toEqual([
      'Fixtures', 'Gable rises', 'Ring conflicts', 'Port regressions', 'Roof-gable research cases', 'Goldens (golden/*.input.json)',
      'Playtest seeds (fixtures/playtest)', 'Defect cases',
    ]);
    expect(catalogueGroups({...sources, draft: {value: 'draft', label: 'x-draft'}}).at(-1)).toEqual({label: 'Draft', entries: [{value: 'draft', label: 'x-draft'}]});
  });

  it('lists every Ring conflict, port and research case, each research case by its id and title', () => {
    const of = (label: string) => groups.find(g => g.label === label)?.entries ?? [];
    expect(of('Ring conflicts').map(e => e.value)).toEqual(RING_CONFLICT_FIXTURES.map(f => f.name));
    expect(of('Port regressions').map(e => e.value)).toEqual(PORT_FIXTURES.map(f => f.name));
    const research = of('Roof-gable research cases');
    expect(research).toHaveLength(53);
    expect(research.find(e => e.value === 'research-2b')?.label).toBe('2b: T, only the south segment gabled, north hipped');
    expect(research.find(e => e.value === 'research-9a')?.label).toMatch(/\(cut placed by the pipeline\)$/);
    const left = research.filter(e => e.disabled);
    expect(left.map(e => e.value)).toEqual(['4g', '5a', '5b', '5c', '5d', '5e', '9b'].map(leftOutValue));
    for (const e of left) expect(e.label).toMatch(/\(left out: .+\)$/);
  });

  it('gives every option a value of its own, so a value and a #hash name one thing', () => {
    const vs = values(groups);
    expect(new Set(vs).size).toBe(vs.length);
  });

  it('lists every choosable entry the hash can name, each to its own kind', () => {
    for (const v of values(groups).filter(x => !x.startsWith('research-left-out-'))) {
      const sel = selectionFromHash(`#${encodeURIComponent(v)}`, LISTED, cases, undefined, [...goldens, ...playtestFiles()]);
      const name = sel.kind === 'case' ? sel.defect.name : sel.kind === 'file' ? sel.file.name : sel.kind === 'fixture' ? sel.fixture.name : '';
      expect(name).toBe(v);
    }
  });

  it('counts what can be chosen', () => {
    expect(choosableCount(groups)).toBe(values(groups).length - 7);
  });
});

describe('selectionFromHash with input files', () => {
  const files = [...goldens, ...playtestFiles()];

  it('names a research case as a fixture, a golden or seed as a file', () => {
    const r = selectionFromHash('#research-2b', LISTED, cases, undefined, files);
    expect(r.kind === 'fixture' && r.fixture.name).toBe('research-2b');
    const g = selectionFromHash('#FullWingsProbe', LISTED, cases, undefined, files);
    expect(g).toEqual({kind: 'file', file: {name: 'FullWingsProbe', path: 'golden/FullWingsProbe.input.json'}});
    const s = selectionFromHash('#prototype-seed.0.MultiRunSide.0', LISTED, cases, undefined, files);
    expect(s.kind).toBe('file');
  });

  it('looks in the roster before the files, so a file never shadows a listed fixture', () => {
    const clash: InputFile = {name: SHELL_FIXTURES[1].name, path: 'golden/x.input.json'};
    expect(selectionFromHash(`#${SHELL_FIXTURES[1].name}`, LISTED, [], undefined, [clash]).kind).toBe('fixture');
  });

  it('names the first fixture for an unknown hash, as before', () => {
    const sel = selectionFromHash('#no-such', LISTED, cases, undefined, files);
    expect(sel.kind === 'fixture' && sel.fixture.name).toBe(SHELL_FIXTURES[0].name);
  });
});

describe('filterCatalogue', () => {
  it('keeps everything for an empty query', () => {
    expect(filterCatalogue(groups, '  ')).toEqual(groups);
  });

  it('matches every word against the group, label and value, ignoring case', () => {
    expect(filterTerms(' T  South ')).toEqual(['t', 'south']);
    const hit = filterCatalogue(groups, '2b SOUTH');
    expect(values(hit)).toEqual(['research-2b']);
    expect(filterCatalogue(groups, 'port').find(g => g.label === 'Port regressions')?.entries).toHaveLength(PORT_FIXTURES.length);
    expect(values(filterCatalogue(groups, 'cut placed by the pipeline'))).toEqual(['research-9a', 'research-9c', 'research-9d']);
  });

  it('drops groups with no match, and keeps the entry on show whatever the query', () => {
    expect(filterCatalogue(groups, 'zzz-no-match')).toEqual([]);
    const kept = filterCatalogue(groups, 'zzz-no-match', 'DefaultChalet');
    expect(kept).toEqual([{label: 'Fixtures', entries: [{value: 'DefaultChalet', label: 'DefaultChalet'}]}]);
  });
});
