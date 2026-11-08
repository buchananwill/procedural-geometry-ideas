// Journal decision 169: the viewer's "Defect cases" group. The cases come from the golden manifest's `clean: false`
// entries, replayed from their input files; a defect is marked where it is (magenta Internal faces, Cheek in its colour,
// Unclassified Edges heavy and white-cased, the camera framed on the pinned positions).
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {SHELL_FIXTURES} from '../src/fixture.ts';
import {buildShellDetailed} from '../src/shell.ts';
import {readInput} from '../src/wire/input-adapter.ts';
import {defectEdgeSegments, faceTriangles, linearRGB} from '../src/viewer/buffers.ts';
import {MIN_FOCUS_EXTENT_CM, focusOf, focusOfCase, parseDefectCases, violationPoints} from '../src/viewer/defect-cases.ts';
import {selectionFromHash} from '../src/viewer/hash.ts';
import {legendEntries} from '../src/viewer/legend.ts';
import {DEFECT_CASING_COLOUR, DEFECT_CASING_WIDTH, DEFECT_CORE_WIDTH, MAGENTA, SHELL_KIND_COLOUR} from '../src/viewer/palette.ts';
import {makeToggles, withStoreys} from '../src/viewer/toggles.ts';
import {storeysOf} from '../src/fixture.ts';

const golden = (file: string): string => readFileSync(new URL(`../golden/${file}`, import.meta.url), 'utf8');
const manifest: unknown = JSON.parse(golden('manifest.json'));
const cases = parseDefectCases(manifest);
const named = (name: string) => {
  const c = cases.find(x => x.name === name);
  if (!c) throw new Error(`no defect case ${name}`);
  return c;
};

describe('parseDefectCases', () => {
  it('lists exactly the manifest entries with clean: false, in manifest order', () => {
    const raw = (manifest as {fixtures: {fixture: string; clean: boolean}[]}).fixtures;
    expect(cases.map(c => c.name)).toEqual(raw.filter(e => !e.clean).map(e => e.fixture));
    expect(cases.length).toBeGreaterThan(5);
  });

  it('carries each entry\'s residue class, violations, pinned error, input file and reasons', () => {
    const cheek = named('Court14Seed1h250');
    expect(cheek.residueClass).toBe('algorithm-B Cheek');
    expect(cheek.violations).toEqual(['cheeks 1, expected 0, at (150, 400, 250)']);
    expect(cheek.input).toBe('Court14Seed1h250.input.json');
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

describe('selectionFromHash', () => {
  it('names a defect case by its hash, and the roster by its own', () => {
    const sel = selectionFromHash('#CutOvershootProbe', SHELL_FIXTURES, cases);
    expect(sel.kind === 'case' && sel.defect.name).toBe('CutOvershootProbe');
    const roster = selectionFromHash('#Courtyard', SHELL_FIXTURES, cases);
    expect(roster.kind === 'fixture' && roster.fixture.name).toBe('Courtyard');
  });

  it('names every case by its encoded name', () => {
    for (const c of cases) {
      const sel = selectionFromHash(`#${encodeURIComponent(c.name)}`, SHELL_FIXTURES, cases);
      expect(sel.kind === 'case' && sel.defect.name, c.name).toBe(c.name);
    }
  });

  it('falls back to the first roster fixture for an unknown or malformed hash', () => {
    for (const hash of ['', '#NoSuchThing', '#%', '#%E0%A4%A']) {
      const sel = selectionFromHash(hash, SHELL_FIXTURES, cases);
      expect(sel.kind === 'fixture' && sel.fixture.name, hash).toBe(SHELL_FIXTURES[0].name);
    }
  });

  it('lets a roster name win a collision with a case', () => {
    const clash = {...named('Court14Seed1h250'), name: SHELL_FIXTURES[1].name};
    expect(selectionFromHash(`#${SHELL_FIXTURES[1].name}`, SHELL_FIXTURES, [clash]).kind).toBe('fixture');
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
    expect(focusOfCase(named('Court14Seed1h250'))?.centre).toEqual([150, 400, 250]);
    expect(focusOfCase(named('CutOvershootProbe'))).toBeDefined();
    expect(focusOfCase(named('CourtyardAt22.5-45s'))).toBeDefined();
  });
});

describe('a defect is marked where it is', () => {
  const buildCase = async (name: string) => {
    const read = readInput(JSON.parse(golden(named(name).input ?? '')), name);
    if (!read.ok) throw new Error(read.errors.join('; '));
    return {fixture: read.fixture, build: await buildShellDetailed(read.fixture)};
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
    const {fixture, build} = await buildCase('Court14Seed1h250');
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
