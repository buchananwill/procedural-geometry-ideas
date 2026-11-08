// Journal decision 124's ingestion: every JSON in `fixtures/playtest/` is loaded automatically, validated against
// `input@1`, adapted to a fixture and run through every invariant of `shell-invariants.ts`. A file's outcome must be
// clean, or exactly its pin in `playtest-pins.ts`.
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {errorMessage} from '../src/errors.ts';
import {EXPORTED_FIXTURES, ring} from '../src/fixture.ts';
import {buildShellDetailed} from '../src/shell.ts';
import {PLAYTEST_DIR, SEED_FIXTURES} from '../src/wire/export-playtest.ts';
import {readInput} from '../src/wire/input-adapter.ts';
import {AcceptedPin, PLAYTEST_PINS} from './playtest-pins.ts';
import {invariantViolations} from './shell-invariants.ts';
import {predictedGenus} from './slab-genus.ts';

const FILES = readdirSync(PLAYTEST_DIR).filter(f => f.toLowerCase().endsWith('.json')).sort();

/** One file's JSON, or the parse error as a refusal. */
function load(file: string): unknown {
  try {
    return JSON.parse(readFileSync(path.join(PLAYTEST_DIR, file), 'utf8'));
  } catch (e) {
    return {parseError: errorMessage(e)};
  }
}

describe('the playtest folder', () => {
  it('holds the seeded files, so the ingestion is never vacuous', () => {
    expect(FILES).toEqual(expect.arrayContaining(SEED_FIXTURES.map(n => `${n}.json`)));
  });

  it('pins only files it holds', () => {
    expect(Object.keys(PLAYTEST_PINS).filter(k => !FILES.includes(k))).toEqual([]);
  });
});

describe('the genus prediction', () => {
  // union.test.ts's measured pins for the roster; ring-forms.test.ts and port.test.ts measure 0 for the rest.
  const MEASURED: Record<string, number> = {Bridge: 0, BridgeOverBlock: 1, Courtyard: 1};
  it.each(EXPORTED_FIXTURES.map(f => [f.name, f] as const))('%s: predicts the genus the suite measures', (name, f) => {
    expect(predictedGenus(f)).toBe(MEASURED[name] ?? 0);
  });

  it('counts each disjoint building, as Manifold does: two apart measure genus -1', async () => {
    const f = {name: 'Apart', cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 100, 100], 0, 1, 45), ring([200, 0, 300, 100], 0, 1, 45)]};
    expect(predictedGenus(f)).toBe(-1);
    expect((await buildShellDetailed(f)).union.genus).toBe(-1);
  });
});

describe.each(FILES)('%s', file => {
  const pin = PLAYTEST_PINS[file] ?? {};
  const read = readInput(load(file), path.basename(file, path.extname(file)));

  if ('refused' in pin) {
    it('is refused, with exactly its pinned reasons', () => {
      expect(read.ok ? [] : read.errors).toEqual(pin.refused);
    });
    return;
  }
  const want: AcceptedPin = pin;

  it('validates against input@1 and adapts, with exactly its pinned flags', () => {
    expect(read.ok ? [] : read.errors).toEqual([]);
    expect(read.ok ? read.flags : []).toEqual(want.flags ?? []);
  });

  it('keeps every invariant, with the genus its Rings predict', async () => {
    if (!read.ok) throw new Error(`refused: ${read.errors.join('; ')}`);
    const b = await buildShellDetailed(read.fixture);
    expect(invariantViolations(b, {genus: predictedGenus(read.fixture), cheeks: want.cheeks ?? 0})).toEqual(want.violations ?? []);
  }, 60_000);
});
