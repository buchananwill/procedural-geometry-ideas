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
import {GOLDEN_FIXTURES, goldenFiles} from './golden-fixtures.ts';
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
    ];
  }

  it.each(GOLDEN_FIXTURES.map(g => [g.fixture.name, g.fixture] as const))('%s: its flag and reason agree with the rule, and its input is written exactly when replayable', (name, f) => {
    const e = MANIFEST.fixtures.find(x => x.fixture === name);
    const why = reasons(f);
    expect(e && {cppReplayable: e.cppReplayable, reason: 'reason' in e ? e.reason : undefined, input: 'input' in e ? e.input : undefined}).toEqual(
      why.length ? {cppReplayable: false, reason: why.join('; '), input: undefined} : {cppReplayable: true, reason: undefined, input: `${name}.input.json`});
  });

  it('refuses each condition by its own reason', () => {
    const box = (rect: [number, number, number, number], storeys = 1): ShellFixture['rings'][number] => ring(rect, 0, storeys, 45);
    expect(cppReplayability(shellFixture('OnLattice', [box([0, 0, 500, 400])]))).toEqual({cppReplayable: true});
    expect(cppReplayability(shellFixture('OffLattice', [box([0, 0, 510, 400])]))).toEqual({cppReplayable: false, reason: 'corner off the Cell lattice'});
    expect(cppReplayability({...shellFixture('Cell100', [box([0, 0, 500, 400])]), cellSize: 100})).toEqual({cppReplayable: false, reason: 'cellSize not 50'});
    expect(cppReplayability(shellFixture('Storey263', [box([0, 0, 500, 400])], 263))).toEqual({cppReplayable: false, reason: 'storey height not a whole number of Cells'});
    expect(cppReplayability(shellFixture('Storey300', [box([0, 0, 500, 400])], 300))).toEqual({cppReplayable: true});
    expect(cppReplayability(shellFixture('Tall', [box([0, 0, 500, 400], 33)]))).toEqual({cppReplayable: false, reason: 'a Ring reaching past storey 32'});
    expect(cppReplayability(shellFixture('Tall32', [box([0, 0, 500, 400], 32)]))).toEqual({cppReplayable: true});
    const misIndexed = writeInput(shellFixture('Two', [box([0, 0, 500, 400]), box([500, 0, 1000, 400])]));
    misIndexed.rings[0].ringIndex = 1;
    misIndexed.rings[1].ringIndex = 0;
    expect(cppReplayabilityOf(misIndexed)).toEqual({cppReplayable: false, reason: 'ringIndex not its array position'});
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
