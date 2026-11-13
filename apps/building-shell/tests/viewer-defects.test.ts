// Journal decision 169: the viewer's "Defect cases" group. The cases come from the golden manifest's `clean: false`
// entries, replayed from their input files; a defect is marked where it is (magenta Internal faces, Cheek in its colour,
// Unclassified Edges heavy and white-cased, the camera framed on the pinned positions).
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {GABLE_SETTING_FIXTURES, PORT_FIXTURES, RING_CONFLICT_FIXTURES, RISE_FIXTURES, SHELL_FIXTURES} from '../src/fixture.ts';
import type {ShellFixture} from '../src/fixture.ts';
import {buildShellDetailed} from '../src/shell.ts';
import {readInput} from '../src/wire/input-adapter.ts';
import {defectEdgeSegments, faceTriangles, linearRGB} from '../src/viewer/buffers.ts';
import {catalogueGroups, defectSourceText} from '../src/viewer/catalogue.ts';
import {MIN_FOCUS_EXTENT_CM, focusOf, focusOfCase, parseDefectCases, violationPoints} from '../src/viewer/defect-cases.ts';
import type {DefectCase} from '../src/viewer/defect-cases.ts';
import {inMemoryFixture, inMemorySources} from '../src/viewer/defect-sources.ts';
import {selectionFromHash} from '../src/viewer/hash.ts';
import {legendEntries} from '../src/viewer/legend.ts';
import {DEFECT_CASING_COLOUR, DEFECT_CASING_WIDTH, DEFECT_CORE_WIDTH, MAGENTA, SHELL_KIND_COLOUR} from '../src/viewer/palette.ts';
import {PINNED_CASES, pinnedFixture} from '../src/viewer/pinned-cases.ts';
import {RESEARCH_FIXTURES} from '../src/viewer/research-cases.ts';
import {makeToggles, withStoreys} from '../src/viewer/toggles.ts';
import {storeysOf} from '../src/fixture.ts';
import {GOLDEN_FIXTURES} from './golden-fixtures.ts';
import type {GoldenFixture} from './golden-fixtures.ts';

const golden = (file: string): string => readFileSync(new URL(`../golden/${file}`, import.meta.url), 'utf8');
const manifest: unknown = JSON.parse(golden('manifest.json'));
/** The fixtures the selector lists by name, as the page lists them. */
const LISTED: readonly ShellFixture[] = [...SHELL_FIXTURES, ...RISE_FIXTURES, ...GABLE_SETTING_FIXTURES, ...RING_CONFLICT_FIXTURES, ...PORT_FIXTURES, ...RESEARCH_FIXTURES];
const IN_MEMORY = inMemorySources(GOLDEN_FIXTURES, PINNED_CASES, LISTED);
const cases = parseDefectCases(manifest, IN_MEMORY);
const named = (name: string) => {
  const c = cases.find(x => x.name === name);
  if (!c) throw new Error(`no defect case ${name}`);
  return c;
};
/** The manifest's own entry of a case, as committed. */
const manifestEntry = (name: string) => (manifest as {fixtures: {fixture: string; input?: string; reasons?: string[]}[]}).fixtures.find(e => e.fixture === name);
/** The golden set's own fixture of a case, as `tests/golden-fixtures.ts` builds it. */
const goldenNamed = (name: string): GoldenFixture | undefined => GOLDEN_FIXTURES.find(g => g.fixture.name === name);

/** A case's fixture as the page loads it: read from its input file, or built from its in-memory source. */
function caseFixture(c: DefectCase): ShellFixture {
  const s = c.source;
  if (s.kind === 'none') throw new Error(`${c.name}: ${defectSourceText(c)}`);
  if (s.kind !== 'file') return inMemoryFixture(c.name, s);
  const read = readInput(JSON.parse(golden(s.input)), c.name);
  if (!read.ok) throw new Error(read.errors.join('; '));
  return read.fixture;
}

describe('parseDefectCases', () => {
  it('lists exactly the manifest entries with clean: false, in manifest order', () => {
    const raw = (manifest as {fixtures: {fixture: string; clean: boolean}[]}).fixtures;
    expect(cases.map(c => c.name)).toEqual(raw.filter(e => !e.clean).map(e => e.fixture));
    expect(cases.length).toBeGreaterThan(5);
  });

  it('carries each entry\'s residue class, violations, pinned error, input file and reasons', () => {
    const cheek = named('Court14Seed7h250');
    expect(cheek.residueClass).toBe('algorithm-B Cheek');
    expect(cheek.violations).toEqual(['cheeks 1, expected 0, at (291.83203125, 250, 500)']);
    // Every case's input file and reasons are its manifest entry's, whichever cases ship an input today.
    for (const c of cases) {
      expect(c.input, c.name).toBe(manifestEntry(c.name)?.input);
      expect(c.reasons, c.name).toEqual(manifestEntry(c.name)?.reasons ?? []);
    }
    const withInput = cases.find(c => c.input !== undefined);
    expect(withInput?.input).toBe(`${withInput?.name}.input.json`);
    const throws = cases.filter(c => c.error !== undefined);
    expect(throws.length).toBeGreaterThan(0);
    for (const c of throws) expect(c.violations).toEqual([]);
  });

  it('leaves a non-replayable case with no input file and says why', () => {
    const unloadable = cases.filter(c => c.input === undefined);
    expect(unloadable.length).toBeGreaterThan(0);
    for (const c of unloadable) expect(c.reasons.length, c.name).toBeGreaterThan(0);
  });

  it('reads every case\'s input file through readInput', () => {
    for (const c of cases.filter(x => x.input !== undefined)) {
      const read = readInput(JSON.parse(golden(c.input ?? '')), c.name);
      expect(read.ok, `${c.name}: ${read.ok ? '' : read.errors.join('; ')}`).toBe(true);
    }
  });

  it('is empty for anything that is not a manifest, and skips malformed entries', () => {
    expect(parseDefectCases(null)).toEqual([]);
    expect(parseDefectCases({fixtures: 3})).toEqual([]);
    expect(parseDefectCases({fixtures: [null, 7, {clean: false}, {fixture: 'A', clean: true}, {fixture: 'B', clean: false}]}).map(c => c.name)).toEqual(['B']);
  });
});

describe('where a defect case is loaded from (WP-V3)', () => {
  it('reads a case from its input file when it has one, else builds it from its in-memory source, else has none', () => {
    for (const c of cases) expect(c.source, c.name).toEqual(c.input !== undefined ? {kind: 'file', input: c.input} : IN_MEMORY.get(c.name) ?? {kind: 'none'});
  });

  it('finds a golden\'s pinned case by its pin, the very array, and draws the golden\'s own fixture from it', () => {
    const pinnedSourced = cases.filter(c => c.source.kind === 'pinned');
    expect(pinnedSourced.length).toBeGreaterThan(0);
    for (const c of pinnedSourced) {
      const g = goldenNamed(c.name);
      if (!g || g.clean || c.source.kind !== 'pinned') throw new Error(`${c.name} is no residue golden`);
      expect(c.source.pinned.pins.some(p => p.outcome === g.pin), c.name).toBe(true);
      // The same fixture drawn by the same generator: the golden set's fixture, name and all.
      expect(inMemoryFixture(c.name, c.source), c.name).toEqual(g.fixture);
      expect({...pinnedFixture(c.source.pinned), name: c.name}, c.name).toEqual(g.fixture);
    }
  });

  it('leaves no input-less case unloadable that a pinned case or a listed fixture draws', () => {
    for (const c of cases.filter(x => x.input === undefined)) {
      const g = goldenNamed(c.name);
      const drawn = g && !g.clean && (LISTED.includes(g.fixture) || PINNED_CASES.filter(p => p.pins.some(q => q.outcome === g.pin)).length === 1);
      expect(c.source.kind !== 'none', c.name).toBe(Boolean(drawn));
    }
    // The user's reference Cheek: the golden set ships no input for it (it builds a covered rise), so it is drawn as its pinned case.
    const cheek = named('Court14Seed7h250');
    expect(cheek.input).toBeUndefined();
    expect(cheek.source.kind === 'pinned' && cheek.source.pinned.key).toBe('s7h250/Court14');
  });

  it('builds a golden that is a listed fixture from that fixture, and a golden two pinned cases claim from neither', () => {
    const roster = SHELL_FIXTURES[0];
    const asRoster: GoldenFixture = {clean: false, fixture: roster, expectedGenus: [0], residueClass: 'algorithm-B Cheek', pin: [], located: false};
    expect(inMemorySources([asRoster], [], LISTED).get(roster.name)).toEqual({kind: 'fixture', fixture: roster});
    expect(inMemoryFixture(roster.name, {kind: 'fixture', fixture: roster})).toEqual(roster);
    const s7 = PINNED_CASES.find(p => p.key === 's7h250/Court14');
    const g = goldenNamed('Court14Seed7h250');
    if (!s7 || !g) throw new Error('no s7h250/Court14 or Court14Seed7h250');
    expect(inMemorySources([g], [s7, {...s7, key: 'twin'}], LISTED).size).toBe(0);
    expect(inMemorySources([g], [], LISTED).size).toBe(0);
  });

  it('says in its selector label where each case is loaded from, and lists a case with no source disabled, with its reason', () => {
    const entries = (defects: readonly DefectCase[]) => catalogueGroups({
      shell: [], rises: [], gableSettings: [], conflicts: [], port: [], research: [], defects, goldens: [], playtest: [], pinned: [], facts: {},
    }).flatMap(g => g.entries);
    const listed = entries(cases);
    expect(listed.find(e => e.value === 'Court14Seed7h250')).toEqual({value: 'Court14Seed7h250', label: 'Court14Seed7h250: algorithm-B Cheek (built from pinned case s7h250/Court14)'});
    expect(listed.find(e => e.value === 'CutOvershootProbe')?.label).toBe('CutOvershootProbe: algorithm-B cut-piece overshoot (read from golden/CutOvershootProbe.input.json)');
    for (const c of cases) expect(listed.find(e => e.value === c.name)?.label, c.name).toContain(defectSourceText(c));
    const unloadable: DefectCase = {...named('GapAligned1'), source: {kind: 'none'}};
    const [e] = entries([unloadable]);
    expect(e.disabled).toBe(true);
    expect(e.label).toBe(`GapAligned1: near-touching islands (cannot be loaded: no input file and no in-memory source (${unloadable.reasons.join('; ')}))`);
    expect(unloadable.reasons.length).toBeGreaterThan(0);
  });
});

describe('selectionFromHash', () => {
  it('names a defect case by its hash, and the roster by its own', () => {
    const sel = selectionFromHash('#CutOvershootProbe', {fixtures: SHELL_FIXTURES, cases});
    expect(sel.kind === 'case' && sel.defect.name).toBe('CutOvershootProbe');
    const roster = selectionFromHash('#Courtyard', {fixtures: SHELL_FIXTURES, cases});
    expect(roster.kind === 'fixture' && roster.fixture.name).toBe('Courtyard');
  });

  it('names every case by its encoded name', () => {
    for (const c of cases) {
      const sel = selectionFromHash(`#${encodeURIComponent(c.name)}`, {fixtures: SHELL_FIXTURES, cases});
      expect(sel.kind === 'case' && sel.defect.name, c.name).toBe(c.name);
    }
  });

  it('falls back to the first roster fixture for an unknown or malformed hash', () => {
    for (const hash of ['', '#NoSuchThing', '#%', '#%E0%A4%A']) {
      const sel = selectionFromHash(hash, {fixtures: SHELL_FIXTURES, cases});
      expect(sel.kind === 'fixture' && sel.fixture.name, hash).toBe(SHELL_FIXTURES[0].name);
    }
  });

  it('lets a roster name win a collision with a case', () => {
    const clash = {...named('Court14Seed7h250'), name: SHELL_FIXTURES[1].name};
    expect(selectionFromHash(`#${SHELL_FIXTURES[1].name}`, {fixtures: SHELL_FIXTURES, cases: [clash]}).kind).toBe('fixture');
  });

  it('no case shares a name with a roster fixture', () => {
    const roster = new Set(SHELL_FIXTURES.map(f => f.name));
    expect(cases.filter(c => roster.has(c.name)).map(c => c.name)).toEqual([]);
  });
});

describe('the camera is framed on the pinned positions', () => {
  it('reads every "(x, y, z)" a violation names, including both ends of each Edge', () => {
    expect(violationPoints(['cheeks 2, expected 0, at (100, 300, 380.322265625); (350, 300, 250)'])).toEqual([[100, 300, 380.322265625], [350, 300, 250]]);
    expect(violationPoints(['1 Unclassified Edges: (0, 500, 250) to (250, 250, 500.0048828125)'])).toEqual([[0, 500, 250], [250, 250, 500.0048828125]]);
    expect(violationPoints(['x at (-1.5, 2e-3, 3)'])).toEqual([[-1.5, 0.002, 3]]);
  });

  it('ignores the placeholder position of a whole-shell genus violation', () => {
    expect(violationPoints(['genus per component 2, expected 1: genus 2 at (0, 0, 0)'])).toEqual([]);
  });

  it('focuses on the box of the points, and never on less than the minimum extent', () => {
    expect(focusOf([])).toBeUndefined();
    expect(focusOf([[10, 20, 30]])).toEqual({centre: [10, 20, 30], extent: MIN_FOCUS_EXTENT_CM});
    const f = focusOf([[0, 0, 0], [300, 400, 0]]);
    expect(f?.centre).toEqual([150, 200, 0]);
    expect(f?.extent).toBe(500);
  });

  it('every case that pins a position has a focus; the Cheek class sits where it is pinned', () => {
    expect(focusOfCase(named('Court14Seed7h250'))?.centre).toEqual([291.83203125, 250, 500]);
    expect(focusOfCase(named('CutOvershootProbe'))).toBeDefined();
    expect(focusOfCase(named('CourtyardAt22.5-45s'))).toBeDefined();
  });
});

describe('a defect is marked where it is', () => {
  /** A case built as the page builds it: from its input file, or from its in-memory source. */
  const buildCase = async (name: string) => {
    const fixture = caseFixture(named(name));
    return {fixture, build: await buildShellDetailed(fixture)};
  };

  it('draws the surviving Internal face magenta, and counts it in the Defects legend', async () => {
    const {fixture, build} = await buildCase('CutOvershootProbe');
    const storeys = new Set(storeysOf(fixture));
    expect(SHELL_KIND_COLOUR.Internal).toBe(MAGENTA);
    const solid = faceTriangles(build, storeys, false);
    const magenta = linearRGB(MAGENTA);
    const internal = [...solid.owner].filter(id => build.shell.faces[id].tag.kind === 'Internal');
    expect(internal.length).toBeGreaterThan(0);
    for (let t = 0; t < solid.owner.length; t++) {
      if (build.shell.faces[solid.owner[t]].tag.kind !== 'Internal') continue;
      expect([solid.colors[9 * t], solid.colors[9 * t + 1], solid.colors[9 * t + 2]]).toEqual([...magenta]);
    }
    const toggles = withStoreys(makeToggles([]), storeysOf(fixture));
    const defects = legendEntries(build, toggles).filter(e => e.group === 'Defects');
    expect(defects.find(e => e.label.startsWith('Surviving Internal'))?.count).toBeGreaterThan(0);
  });

  it('draws each Unclassified Edge heavy: a white casing and a magenta core over the same segments', async () => {
    const {fixture, build} = await buildCase('CutOvershootProbe');
    const storeys = new Set(storeysOf(fixture));
    const casing = defectEdgeSegments(build, storeys, DEFECT_CASING_COLOUR);
    const core = defectEdgeSegments(build, storeys, MAGENTA);
    expect(casing.owner.length).toBe(3);
    expect(Array.from(core.positions)).toEqual(Array.from(casing.positions));
    expect(Array.from(casing.colors.slice(0, 3))).toEqual([...linearRGB(DEFECT_CASING_COLOUR)]);
    expect(Array.from(core.colors.slice(0, 3))).toEqual([...linearRGB(MAGENTA)]);
    expect(DEFECT_CASING_WIDTH).toBeGreaterThan(DEFECT_CORE_WIDTH);
    expect(DEFECT_CORE_WIDTH).toBeGreaterThan(3.5);
    const toggles = withStoreys(makeToggles([]), storeysOf(fixture));
    const entry = legendEntries(build, toggles).find(e => e.group === 'Defects' && e.label.startsWith('Unclassified'));
    expect(entry?.casing).toBe(DEFECT_CASING_COLOUR);
    expect(entry?.count).toBe(3);
  });

  it('lists the Cheek faces in their own legend colour', async () => {
    const {fixture, build} = await buildCase('Court14Seed7h250');
    const toggles = withStoreys(makeToggles([]), storeysOf(fixture));
    const cheek = legendEntries(build, toggles).find(e => e.group === 'Faces' && e.label === 'Cheek');
    expect(cheek?.colour).toBe(SHELL_KIND_COLOUR.Cheek);
    expect(cheek?.count).toBeGreaterThan(0);
  });

  it('draws nothing heavy on a shell with no Unclassified Edge', async () => {
    const fixture = SHELL_FIXTURES.find(f => f.name === 'Courtyard');
    if (!fixture) throw new Error('no Courtyard');
    const build = await buildShellDetailed(fixture);
    expect(defectEdgeSegments(build, new Set(storeysOf(fixture)), MAGENTA).owner.length).toBe(0);
  });
});
