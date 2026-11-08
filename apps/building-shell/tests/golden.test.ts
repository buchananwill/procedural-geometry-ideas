// Journal decisions 129, 131, 152 and 161: the committed golden set, `golden/`, is exactly what a fresh export writes,
// byte for byte, so the commit's hash names the oracle. Each C++-replayability flag agrees with the rule, and every
// replayable input replays to its shell and union goldens, or to its error. Re-export with
// `pnpm --filter @proc-geo/building-shell golden`.
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import {errorMessage} from '../src/errors.ts';
import {RING_SIDES, ShellFixture, ring} from '../src/fixture.ts';
import {
  GoldenEntry, GoldenEntrySchema, GoldenManifest, GoldenManifestSchema, MANIFEST_FILE, RESIDUE_CLASS_NAMES, UnionStages, cppReplayability, cppReplayabilityOf, goldenText, unionStages,
} from '../src/golden.ts';
import {BuildingShell, buildShellDetailed} from '../src/shell.ts';
import {withFileModelIndices} from '../src/wire/dump.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import type {BuildingShellInputV1, WireRun, WireVec2} from '../src/wire/input-types.ts';
import {planStorey} from '../src/storey.ts';
import {
  GOLDEN_FIXTURES, MODEL_ORDER_CONFLICTS, MODEL_ORDER_ORACLES, RESIDUE_CLASSES, RULE_ORACLES, UNMOVED_BY_FILE_ORDER, fileReversedName, goldenFiles,
  goldenInput,
} from './golden-fixtures.ts';
import {ORDER_FLAG, multiRunDocument} from './wire-round-trip-cases.ts';
import {throwsOutcome} from './pin-table.ts';
import {componentGenera} from './shell-invariants.ts';
import {shellFixture} from './test-builds.ts';

const GOLDEN_DIR = fileURLToPath(new URL('../golden', import.meta.url));
const committed = (name: string): string => readFileSync(path.join(GOLDEN_DIR, name), 'utf8');
const COMMITTED = readdirSync(GOLDEN_DIR).filter(n => n.endsWith('.json')).sort();
/**
 * The committed manifest, parsed against its schema (journal decision 155, N5). A malformed entry fails here, at module
 * load before any test runs, by its index: zod names the path, `fixtures.<index>`, not the fixture (decision 160, N5).
 */
const MANIFEST: GoldenManifest = GoldenManifestSchema.parse(JSON.parse(committed(MANIFEST_FILE)));

/** A replayable manifest entry, which names its input whether it builds or throws (journal decision 161, finding 1). */
type ReplayableEntry = Extract<GoldenEntry, {cppReplayable: true}>;

/** Narrows a manifest entry to a replayable one (journal decision 163, N4: a type predicate in place of casts). */
const isReplayableEntry = (e: GoldenEntry): e is ReplayableEntry => e.cppReplayable;

let fresh: Map<string, string>;
beforeAll(async () => { fresh = await goldenFiles(); }, 300_000);

describe('the golden set (journal decisions 129 and 131): a fresh export is the committed bytes', () => {
  it('holds exactly the files a fresh export writes', () => {
    expect(COMMITTED).toEqual([...fresh.keys()].sort());
  });

  it.each(COMMITTED)('%s: is byte-identical to a fresh export', name => {
    expect(committed(name) === fresh.get(name), `${name} differs from a fresh export: re-export, and say why it moved`).toBe(true);
  });

  // Each entry holds its files or its error, never both and never neither: the schema's union, parsed above.
  it('names every golden fixture once', () => {
    expect(MANIFEST.fixtures.map(e => e.fixture)).toEqual(GOLDEN_FIXTURES.map(g => g.fixture.name));
  });

  it('refuses a manifest entry that holds both its files and an error (journal decision 155, B10)', () => {
    const built = MANIFEST.fixtures.find(e => 'shell' in e);
    expect(built).toBeDefined();
    expect(GoldenEntrySchema.safeParse({...built, error: 'a build error'}).success).toBe(false);
    expect(GoldenEntrySchema.safeParse(built).success).toBe(true);
  });

  // The gate (journal decision 161, finding 1): the schema member that let a replayable residue that throws go without
  // its input is gone, so the port can always check whether its own build throws too.
  it('refuses a replayable entry without its input, whether it builds or throws (journal decision 161, finding 1)', () => {
    const replayable = MANIFEST.fixtures.filter(isReplayableEntry);
    const throwing = replayable.filter(e => 'error' in e);
    expect(throwing.map(e => e.fixture)).toEqual(['Court25Seed1h250', 'U8Seed6h300', 'SplitCourt10Seed2h250', 'Court35Seed11h250']);
    const built = replayable.find(e => 'shell' in e);
    expect(built).toBeDefined();
    for (const e of [...throwing, ...(built ? [built] : [])]) {
      expect(e.input).toBe(`${e.fixture}.input.json`);
      const {input: _, ...bare} = e;
      expect(GoldenEntrySchema.safeParse(e).success).toBe(true);
      expect(GoldenEntrySchema.safeParse(bare).success).toBe(false);
    }
  });
});

describe("the golden additions: decisions 156's F3 and 161's rule oracles, and 156's F4 residue classes", () => {
  const entry = (name: string) => MANIFEST.fixtures.find(e => e.fixture === name);
  const oracle = (name: string) => {
    const g = RULE_ORACLES.find(x => x.fixture.name === name);
    if (!g) throw new Error(`no oracle ${name}`);
    return g.fixture;
  };
  const cutsOf = (f: ShellFixture): number[][] =>
    planStorey(f, 0).building.walls.filter(w => w.form === 'cut').map(w => [w.a.x, w.b.x, Math.round((Math.atan(w.tan) * 180) / Math.PI)]);

  it.each(RULE_ORACLES.map(g => g.fixture.name))('%s: a clean, replayable oracle with its files', name => {
    expect(entry(name)).toMatchObject({clean: true, cppReplayable: true, violations: [], input: `${name}.input.json`});
  });

  it('SplitBandFreeCut reads the free cut: its cut is collinear with no wall, at the island\'s steepest 60°', () => {
    expect(cutsOf(oracle('SplitBandFreeCut'))).toEqual([[500, 500, 60], [500, 500, 60]]);
  });

  // Decision 161, finding 2: an island whose steepest pitch is not 60°, so the rejected constant 60 moves a clean golden.
  it('SplitBandFreeCut45 reads the free cut at its island\'s steepest, 45°', () => {
    expect(cutsOf(oracle('SplitBandFreeCut45'))).toEqual([[500, 500, 45], [500, 500, 45]]);
  });

  // Decision 161, finding 2: every wall is a gable, so the struck hip-only rule finds no hip; the cut reads the gables.
  it('SplitBandAllGable75 reads the free cut at its island\'s steepest wall, a gable at 75°', () => {
    const f = oracle('SplitBandAllGable75');
    expect(f.rings.every(r => RING_SIDES.every(s => r.sides?.[s]?.form === 'gable'))).toBe(true);
    expect(cutsOf(f)).toEqual([[500, 500, 75], [500, 500, 75]]);
  });

  // Decision 161, finding 3: the committed shell names the document's own Rings and sides, not the fixture's positions or
  // compass order. Ring 0 of the L is model index 7, written from its corner 1, so its W gable (compass 3) is its side 2.
  it("AsymmetricLScrambled: its document starts each Ring at another corner under sparse model indices, and its shell names the file's own sides", () => {
    const doc = JSON.parse(committed('AsymmetricLScrambled.input.json')) as BuildingShellInputV1;
    expect(doc.rings.map(r => [r.ringIndex, r.modelIndex, r.corners[0]])).toEqual([[0, 7, {x: 1000, y: 0}], [1, 20, {x: 1000, y: 800}]]);
    const shell = JSON.parse(committed('AsymmetricLScrambled.json')) as BuildingShell;
    expect(shell.faces.filter(x => x.tag.kind === 'Gable').map(x => x.sources)).toEqual([[{ringModelIndex: 7, side: 2}]]);
    const models = new Set(shell.cells.flatMap(c => (c.source ? [c.source.ringModelIndex] : [])));
    expect([...models].sort((a, b) => a - b)).toEqual([7, 20]);
  });

  // Decision 164, finding 1: an island with hips and a gable steeper than every hip, so a hip-first rule moves it.
  it("SB400-600B100S500g60r0 reads the free cut at its island's steepest wall, a gable at 60° over hips at 30°", () => {
    const f = oracle('SB400-600B100S500g60r0');
    expect(f.rings[0].sides?.W).toEqual({form: 'gable', deg: 60});
    expect(f.rings.every(r => r.defaultDeg === 30)).toBe(true);
    expect(cutsOf(f)).toEqual([[500, 500, 60], [500, 500, 60]]);
  });

  it.each(RESIDUE_CLASSES.map(g => g.fixture.name))('%s: not clean, carrying its violations or its error', name => {
    const e = entry(name);
    expect(e?.clean).toBe(false);
    expect(e && ('error' in e ? e.error : e.violations.join('\n')).length).toBeGreaterThan(0);
  });
});

/**
 * Journal decisions 164, finding 2, and 165: the model-order oracle. Each `*FileReversed` document lists its Rings in
 * reverse model order, and a reading that keys the conflict rule on file position builds every one differently but
 * those of `UNMOVED_BY_FILE_ORDER`, measured. Since WP3.9 that list is empty and all eight move: CutPitchConflict,
 * redesigned (decision 167, finding 4), contests the hole's S wall, so its reversal moves the wall and the cut that
 * takes its pitch. Before, its only shared wall, x = 1000, was hipped at 30° by all three Rings on it, and the
 * reversal could not show.
 */
describe('the model-order oracle (journal decision 164, finding 2)', () => {
  it.each(MODEL_ORDER_CONFLICTS.map(fileReversedName))('%s: its document lists the Rings in reverse model order, each ringIndex its position, and is flagged', name => {
    const doc = JSON.parse(committed(`${name}.input.json`)) as BuildingShellInputV1;
    const models = doc.rings.map(r => r.modelIndex);
    expect(models.length).toBeGreaterThan(1);
    expect(models.every((m, i) => i === 0 || m < models[i - 1])).toBe(true);
    expect(doc.rings.map(r => r.ringIndex)).toEqual(models.map((_, i) => i));
    const read = readInput(doc, name);
    if (!read.ok) throw new Error(read.errors.join('; '));
    expect(read.report.flags).toHaveLength(1);
    expect(read.report.flags[0]).toMatch(ORDER_FLAG);
  });

  it('a reading that orders the Rings by file position moves every shell but those of UNMOVED_BY_FILE_ORDER', async () => {
    const moved: string[] = [];
    for (const g of MODEL_ORDER_ORACLES) {
      if (!g.file) throw new Error(`${g.fixture.name} is not read from a document`);
      const {read} = g.file;
      // The file lists the Rings in reverse model order, so file order is the read fixture's reversed.
      const fileOrder: ShellFixture = {...read.fixture, rings: [...read.fixture.rings].reverse()};
      const b = await buildShellDetailed(fileOrder);
      const shell = withFileModelIndices(b.shell, {modelIndices: [...read.modelIndices].reverse(), sideSlots: [...read.sideSlots].reverse()});
      if (goldenText(shell) !== committed(`${g.fixture.name}.json`)) moved.push(g.fixture.name);
    }
    expect(moved).toEqual(MODEL_ORDER_CONFLICTS.filter(n => !UNMOVED_BY_FILE_ORDER.includes(n)).map(fileReversedName));
  }, 120_000);
});

describe("the manifest's residue classes and genus (journal decision 161, finding 5 and Info)", () => {
  it.each(GOLDEN_FIXTURES.map(g => [g.fixture.name, g] as const))('%s: carries its residue class exactly when it is a residue', (name, g) => {
    const e = MANIFEST.fixtures.find(x => x.fixture === name);
    expect(e && ('residueClass' in e ? e.residueClass : undefined)).toEqual(g.clean ? undefined : g.residueClass);
  });

  it('every residue class is represented, and every class is a stable name with no prototype id in it', () => {
    const classes = new Set(MANIFEST.fixtures.flatMap(e => ('residueClass' in e ? [e.residueClass] : [])));
    expect([...classes].sort()).toEqual([...RESIDUE_CLASS_NAMES].sort());
  });

  // The pin's genus is an expectation: a port must not read it as the shell's own (finding 5).
  it.each(MANIFEST.fixtures.flatMap(e => ('measuredGenus' in e ? [[e.fixture, e] as const] : [])))('%s: its measured genus is its union output\'s, and a clean entry measures what it expects', (name, e) => {
    const u = JSON.parse(committed(`${name}.union.json`)) as UnionStages;
    expect(e.measuredGenus).toEqual(componentGenera({tris: Uint32Array.from(u.unionOutput.tris)}));
    if (e.clean) expect(e.measuredGenus).toEqual(e.expectedGenus);
  });

  it('BridgeOverBlockAt45 measures genus 2 where its pin expects 1', () => {
    expect(MANIFEST.fixtures.find(x => x.fixture === 'BridgeOverBlockAt45')).toMatchObject({expectedGenus: [1], measuredGenus: [2]});
  });
});

/**
 * Journal decision 158, 3: every golden fixture's manifest outcome is its robustness pin, verbatim: a residue's
 * violations, or `throws: ` and its error, as the sweeps measure it (located signatures included), and a fixture with no
 * pin clean. An edited pin, or a manifest entry that disagrees with its pin, fails here.
 */
describe('the tie between the manifest and the robustness pins (journal decision 158, 3)', () => {
  it.each(GOLDEN_FIXTURES.map(g => [g.fixture.name, g] as const))('%s: its manifest outcome is its pin', (name, g) => {
    const e = MANIFEST.fixtures.find(x => x.fixture === name);
    const outcome = e && ('error' in e ? [throwsOutcome(e.error)] : e.violations);
    expect(outcome).toEqual(g.clean ? [] : g.pin);
    expect(e?.clean).toBe(g.clean);
  });
});

describe('C++ replayability (journal decision 152, amended)', () => {
  /** The rule restated: every reason a fixture's input is not replayable, in the rule's order. */
  function reasons(w: BuildingShellInputV1): string[] {
    const on = (v: number): boolean => Math.abs(v - 50 * Math.round(v / 50)) <= 1e-6;
    return [
      ...(w.rings.every(r => r.corners.every(c => on(c.x) && on(c.y))) ? [] : ['corner off the Cell lattice']),
      ...(w.rings.every((r, i) => r.ringIndex === i) ? [] : ['ringIndex not its array position']),
      ...(w.cellSizeCm === 50 ? [] : ['cellSize not 50']),
      ...(on(w.storeyHeightCm) ? [] : ['storey height not a whole number of Cells']),
      ...(w.rings.every(r => r.baseStorey + r.storeys <= 32) ? [] : ['a Ring reaching past storey 32']),
      ...readBack(w),
      ...(w.rings.every(r => r.sides.every((s, j) => oneWholeRun(r.corners, j, s.runs))) ? [] : ['a side not one run from 0 to its length']),
    ];
  }

  /**
   * Decision 179, finding 1's condition: side `j` carries exactly one run, from 0 to the length between its corners,
   * each end within the wire's 1e-6 cm slack.
   */
  function oneWholeRun(corners: readonly WireVec2[], j: number, runs: readonly WireRun[]): boolean {
    const a = corners[j], b = corners[(j + 1) % corners.length];
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    return runs.length === 1 && Math.abs(runs[0].startCm) <= 1e-6 && Math.abs(runs[0].endCm - length) <= 1e-6;
  }

  /** Decision 158, 2's condition: the prototype's own reader accepts the written file, or each refusal is a reason. */
  function readBack(w: BuildingShellInputV1): string[] {
    const r = readInput(JSON.parse(JSON.stringify(w)), 'readBack');
    return r.ok ? [] : r.errors.map(x => `readInput refuses it: ${x}`);
  }

  // Decision 161, finding 1: a replayable fixture's input is written whether it builds or throws.
  it.each(GOLDEN_FIXTURES.map(g => [g.fixture.name, g] as const))('%s: its flag and reasons agree with the rule, and its input is written exactly when replayable', (name, g) => {
    const e = MANIFEST.fixtures.find(x => x.fixture === name);
    const why = reasons(goldenInput(g));
    expect(e && {cppReplayable: e.cppReplayable, reasons: 'reasons' in e ? e.reasons : undefined, input: 'input' in e ? e.input : undefined}).toEqual(
      why.length ? {cppReplayable: false, reasons: why, input: undefined} : {cppReplayable: true, reasons: undefined, input: `${name}.input.json`});
    if (!why.length) expect(committed(`${name}.input.json`)).toBe(goldenText(goldenInput(g)));
  });

  it('refuses each condition by its own reason', () => {
    const box = (rect: [number, number, number, number], storeys = 1): ShellFixture['rings'][number] => ring(rect, 0, storeys, 45);
    expect(cppReplayability(shellFixture('OnLattice', [box([0, 0, 500, 400])]))).toEqual({cppReplayable: true});
    expect(cppReplayability(shellFixture('OffLattice', [box([0, 0, 510, 400])]))).toEqual({cppReplayable: false, reasons: ['corner off the Cell lattice']});
    expect(cppReplayability({...shellFixture('Cell100', [box([0, 0, 500, 400])]), cellSize: 100})).toEqual({cppReplayable: false, reasons: ['cellSize not 50']});
    expect(cppReplayability(shellFixture('Storey263', [box([0, 0, 500, 400])], 263))).toEqual({cppReplayable: false, reasons: ['storey height not a whole number of Cells']});
    expect(cppReplayability(shellFixture('Storey300', [box([0, 0, 500, 400])], 300))).toEqual({cppReplayable: true});
    expect(cppReplayability(shellFixture('Tall', [box([0, 0, 500, 400], 33)]))).toEqual({cppReplayable: false, reasons: ['a Ring reaching past storey 32']});
    expect(cppReplayability(shellFixture('Tall32', [box([0, 0, 500, 400], 32)]))).toEqual({cppReplayable: true});
    const misIndexed = writeInput(shellFixture('Two', [box([0, 0, 500, 400]), box([500, 0, 1000, 400])]));
    misIndexed.rings[0].ringIndex = 1;
    misIndexed.rings[1].ringIndex = 0;
    expect(cppReplayabilityOf(misIndexed)).toEqual({cppReplayable: false, reasons: ['ringIndex not its array position', ...readBack(misIndexed)]});
    expect(readBack(misIndexed)).toHaveLength(2);
    const steep = cppReplayability(shellFixture('Pitch80', [ring([0, 0, 500, 400], 0, 1, 80)]));
    expect(steep.cppReplayable).toBe(false);
    expect('reasons' in steep && steep.reasons).toHaveLength(4);
    for (const r of 'reasons' in steep ? steep.reasons : []) expect(r).toMatch(/^readInput refuses it: Ring 0 \(model index 0\) side \d run 0 .*outside \[7, 75\]/);
  });

  // Decision 179, finding 1: the seventh condition. Each document here is one `readInput` accepts, so the run shape is
  // its only reason; within the slack of 0 and of the side's length, one run is replayable.
  it('refuses a side that is not one run from 0 to its length, within the slack, by its own reason', () => {
    const notWhole = {cppReplayable: false, reasons: ['a side not one run from 0 to its length']};
    const withSide0 = (runs: [number, number][]): BuildingShellInputV1 => {
      const w = writeInput(shellFixture('Box', [ring([0, 0, 500, 400], 0, 1, 45)]));
      const [whole] = w.rings[0].sides[0].runs;
      w.rings[0].sides[0].runs = runs.map(([startCm, endCm]) => ({...whole, startCm, endCm}));
      return w;
    };
    expect(readBack(multiRunDocument())).toEqual([]);
    expect(cppReplayabilityOf(multiRunDocument())).toEqual(notWhole);
    expect(cppReplayabilityOf(withSide0([[0, 500]]))).toEqual({cppReplayable: true});
    expect(cppReplayabilityOf(withSide0([[-4e-7, 500 + 3e-7]]))).toEqual({cppReplayable: true});
    for (const runs of [[[0, 250], [250, 500]], [[0, 500 - 2e-6]], [[2e-6, 500]], [[0, 450]], [[50, 500]]] as [number, number][][]) {
      expect(readBack(withSide0(runs))).toEqual([]);
      expect(cppReplayabilityOf(withSide0(runs))).toEqual(notWhole);
    }
  });

  // Decision 160, N6: `readInput`'s own refusals contain '; ', so each is a reason of its own and none is joined.
  it('G5.86h250 is not replayable: its 5.86° pitch is outside the wire\'s bounds, so our own reader refuses it, one reason per run (decisions 158, 2, and 160, N6)', () => {
    const e = MANIFEST.fixtures.find(x => x.fixture === 'G5.86h250');
    const why = e && e.cppReplayable === false ? e.reasons : [];
    expect(why).toHaveLength(4);
    for (const r of why) expect(r).toMatch(/^readInput refuses it: Ring 0 \(model index 0\) side \d run 0 is solved \w+ at 5\.86 degrees, outside \[7, 75\] \(journal decisions 143, 144 and 153\)$/);
  });

  const replayable = MANIFEST.fixtures.flatMap(e => ('input' in e ? [e] : []));
  it('holds replayable fixtures', () => {
    expect(replayable.length).toBeGreaterThan(0);
  });

  // A replayable residue that throws replays to the same error (decision 161, finding 1).
  it.each(replayable.map(e => [e.fixture, e] as const))('%s: its input replays to its shell and union goldens byte for byte, or to its error', async (name, e) => {
    const read = readInput(JSON.parse(committed(e.input)), name);
    if (!read.ok) throw new Error(read.errors.join('; '));
    if ('error' in e) {
      expect(await buildShellDetailed(read.fixture).then(() => 'built', (x: unknown) => errorMessage(x))).toBe(e.error);
      return;
    }
    const b = await buildShellDetailed(read.fixture);
    expect(goldenText(withFileModelIndices(b.shell, read)) === committed(e.shell)).toBe(true);
    expect(goldenText(unionStages(name, b.union)) === committed(e.union)).toBe(true);
  }, 60_000);
});
