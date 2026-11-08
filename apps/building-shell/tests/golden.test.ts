// Journal decisions 129, 131 and 152: the committed golden set, `golden/`, is exactly what a fresh export writes, byte
// for byte, so the commit's hash names the oracle. Each C++-replayability flag agrees with the rule, and every
// replayable input round-trips to its shell golden. Re-export with `pnpm --filter @proc-geo/building-shell golden`.
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import {ShellFixture, ring} from '../src/fixture.ts';
import {GoldenEntrySchema, GoldenManifest, GoldenManifestSchema, MANIFEST_FILE, cppReplayability, cppReplayabilityOf, goldenText} from '../src/golden.ts';
import {buildShell} from '../src/shell.ts';
import {withFileModelIndices} from '../src/wire/dump.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import type {BuildingShellInputV1} from '../src/wire/input-types.ts';
import {planStorey} from '../src/storey.ts';
import {GOLDEN_FIXTURES, RESIDUE_CLASSES, RULE_ORACLES, goldenFiles} from './golden-fixtures.ts';
import {throwsOutcome} from './pin-table.ts';
import {shellFixture} from './test-builds.ts';

const GOLDEN_DIR = fileURLToPath(new URL('../golden', import.meta.url));
const committed = (name: string): string => readFileSync(path.join(GOLDEN_DIR, name), 'utf8');
const COMMITTED = readdirSync(GOLDEN_DIR).filter(n => n.endsWith('.json')).sort();
/** The committed manifest, parsed against its schema (journal decision 155, N5): a malformed entry fails here, by name. */
const MANIFEST: GoldenManifest = GoldenManifestSchema.parse(JSON.parse(committed(MANIFEST_FILE)));

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
});

describe("decision 156's golden additions: F3's rule oracles and F4's residue classes", () => {
  const entry = (name: string) => MANIFEST.fixtures.find(e => e.fixture === name);

  it.each(RULE_ORACLES.map(g => g.fixture.name))('%s: a clean, replayable oracle with its files', name => {
    expect(entry(name)).toMatchObject({clean: true, cppReplayable: true, violations: [], input: `${name}.input.json`});
  });

  it('SplitBandFreeCut reads the free cut: its cut is collinear with no wall, at the island\'s steepest 60°', () => {
    const f = RULE_ORACLES[0].fixture;
    const cuts = planStorey(f, 0).building.walls.filter(w => w.form === 'cut');
    expect(cuts.map(w => [w.a.x, w.b.x, Math.round((Math.atan(w.tan) * 180) / Math.PI)])).toEqual([[500, 500, 60], [500, 500, 60]]);
  });

  it.each(RESIDUE_CLASSES.map(g => g.fixture.name))('%s: not clean, carrying its violations or its error', name => {
    const e = entry(name);
    expect(e?.clean).toBe(false);
    expect(e && ('error' in e ? e.error : e.violations.join('\n')).length).toBeGreaterThan(0);
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
  /** The rule restated: every reason a fixture's written input is not replayable, in the rule's order. */
  function reasons(f: ShellFixture): string[] {
    const on = (v: number): boolean => Math.abs(v - 50 * Math.round(v / 50)) <= 1e-6;
    const w = writeInput(f);
    return [
      ...(w.rings.every(r => r.corners.every(c => on(c.x) && on(c.y))) ? [] : ['corner off the Cell lattice']),
      ...(w.rings.every((r, i) => r.ringIndex === i) ? [] : ['ringIndex not its array position']),
      ...(w.cellSizeCm === 50 ? [] : ['cellSize not 50']),
      ...(on(w.storeyHeightCm) ? [] : ['storey height not a whole number of Cells']),
      ...(w.rings.every(r => r.baseStorey + r.storeys <= 32) ? [] : ['a Ring reaching past storey 32']),
      ...readBack(w),
    ];
  }

  /** Decision 158, 2's condition: the prototype's own reader accepts the written file, or each refusal is a reason. */
  function readBack(w: BuildingShellInputV1): string[] {
    const r = readInput(JSON.parse(JSON.stringify(w)), 'readBack');
    return r.ok ? [] : r.errors.map(x => `readInput refuses it: ${x}`);
  }

  it.each(GOLDEN_FIXTURES.map(g => [g.fixture.name, g.fixture] as const))('%s: its flag and reasons agree with the rule, and its input is written exactly when replayable and built', (name, f) => {
    const e = MANIFEST.fixtures.find(x => x.fixture === name);
    const why = reasons(f);
    const built = e !== undefined && !('error' in e);
    expect(e && {cppReplayable: e.cppReplayable, reasons: 'reasons' in e ? e.reasons : undefined, input: 'input' in e ? e.input : undefined}).toEqual(
      why.length ? {cppReplayable: false, reasons: why, input: undefined} : {cppReplayable: true, reasons: undefined, input: built ? `${name}.input.json` : undefined});
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

  it.each(replayable.map(e => [e.fixture, e] as const))('%s: its input round-trips to its shell golden, byte for byte', async (name, e) => {
    const read = readInput(JSON.parse(committed(e.input)), name);
    if (!read.ok) throw new Error(read.errors.join('; '));
    expect(goldenText(withFileModelIndices(await buildShell(read.fixture), read)) === committed(e.shell)).toBe(true);
  }, 60_000);
});
