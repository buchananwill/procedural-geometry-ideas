// Journal decisions 124 and 140 (F6): every dump in `fixtures/playtest/`, `<subject>.input.json` plus an optional
// `<subject>.output.json`, is loaded automatically. Its input is validated against `input@1`, adapted to a fixture and
// run through every invariant of `shell-invariants.ts`; its output, when present, is diffed against the build. A
// dump's outcome must be clean, or exactly its pin in `playtest-pins.ts`.
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {errorMessage} from '../src/errors.ts';
import {EXPORTED_FIXTURES, ShellFixture, ring} from '../src/fixture.ts';
import {buildShellDetailed} from '../src/shell.ts';
import {diffReportLines} from '../src/wire/canonical.ts';
import {INPUT_SUFFIX, dumpReport, listDumps} from '../src/wire/dump.ts';
import {PLAYTEST_DIR, SEED_FIXTURES} from '../src/wire/export-playtest.ts';
import {readInput} from '../src/wire/input-adapter.ts';
import {AcceptedPin, PLAYTEST_PINS} from './playtest-pins.ts';
import {invariantViolations} from './shell-invariants.ts';
import {expectedGenus, predictedComponentGenera, predictedGenus} from './slab-genus.ts';

const LISTING = listDumps(readdirSync(PLAYTEST_DIR));

/** One file's JSON, or the parse error as a value no schema accepts. */
function load(file: string): unknown {
  try {
    return JSON.parse(readFileSync(path.join(PLAYTEST_DIR, file), 'utf8'));
  } catch (e) {
    return {parseError: errorMessage(e)};
  }
}

/** A report's difference lines: everything but its flags and information. */
const differences = (lines: string[]): string[] => lines.filter(l => !/^[^:]*: (FLAG|INFO) /.test(l));

describe('the playtest folder', () => {
  it('holds the seeded dumps, so the ingestion is never vacuous', () => {
    expect(LISTING.dumps.map(d => d.input)).toEqual(expect.arrayContaining(SEED_FIXTURES.map(n => `${n}${INPUT_SUFFIX}`)));
  });

  it('holds no JSON that is neither an input nor the output of one', () => {
    expect(LISTING.strays).toEqual([]);
  });

  it('pins only dumps it holds', () => {
    expect(Object.keys(PLAYTEST_PINS).filter(k => !LISTING.dumps.some(d => d.subject === k))).toEqual([]);
  });
});

describe.each(LISTING.dumps.map(d => [d.subject, d] as const))('%s', (subject, dump) => {
  const pin = PLAYTEST_PINS[subject] ?? {kind: 'accepted'};
  const read = readInput(load(dump.input), subject);

  if (pin.kind === 'refused') {
    it('is refused, with exactly its pinned reasons', () => {
      expect(read.ok ? [] : read.errors).toEqual(pin.refused);
    });
    return;
  }
  const want: AcceptedPin = pin;

  it('validates against input@1 and adapts, with exactly its pinned flags', () => {
    expect(read.ok ? [] : read.errors).toEqual([]);
    expect(read.ok ? read.report.flags : []).toEqual(want.flags ?? []);
  });

  it('keeps every invariant, with the genus its Rings predict, and matches its output where it has one', async () => {
    if (!read.ok) throw new Error(`refused: ${read.errors.join('; ')}`);
    const b = await buildShellDetailed(read.fixture);
    expect(invariantViolations(b, {genus: expectedGenus(read.fixture), cheeks: want.cheeks ?? 0})).toEqual(want.violations ?? []);
    if (!dump.output) return;
    const report = dumpReport(subject, read, b.shell, load(dump.output));
    if ('ok' in report) throw new Error(`output refused: ${report.errors.join('; ')}`);
    if (report.mode === 'full') expect(differences(diffReportLines(report))).toEqual(want.diff ?? []);
  }, 60_000);
});

describe('the genus prediction (decision 140, F5)', () => {
  // N4: every exported fixture by name, as union.test.ts, ring-forms.test.ts and port.test.ts measure it.
  const MEASURED: Readonly<Record<string, number>> = {
    NarrowUpperStorey: 0, NarrowUpperStoreyGabled: 0, TallerUpper: 0, Overhang: 0, OverhangApexOnEave: 0, Bridge: 0,
    BridgeOverBlock: 1, ValleyWings: 0, ValleyWingsPierced: 0, SingleStoreyT: 0, DefaultChalet: 0, Courtyard: 1,
    FlushRingConflict: 0, FlushRingConflictSwapped: 0, OverlapRingConflict: 0, OverlapRingConflictSwapped: 0,
    PitchRingConflict: 0, PitchRingConflictSwapped: 0,
    PortNarrowUpper300: 0, PortNarrowUpperGabled300: 0, PortPokeOut300: 0, PortPokeOut250: 0,
    // WP3.7's addendum-2 conflict fixtures (journal decision 135, F6), as ring-forms.test.ts measures them.
    ThreeRingConflict: 0, ThreeRingConflictSwapped: 0, DistantRingConflict: 0, DistantRingConflictSwapped: 0,
    StoreyRingConflict: 0, StoreyRingConflictSwapped: 0, HoleRingConflict: 1, HoleRingConflictSwapped: 1,
    CutPitchConflict: 1, CutPitchConflictSwapped: 1,
  };
  const measured = (name: string): number => {
    const g = MEASURED[name];
    if (g === undefined) throw new Error(`no measured genus for ${name}`);
    return g;
  };

  it.each(EXPORTED_FIXTURES.map(f => [f.name, f] as const))('%s: predicts the genus the suite measures', (name, f) => {
    expect(predictedGenus(f)).toBe(measured(name));
  });

  const fx = (name: string, rings: ShellFixture['rings']): ShellFixture => ({name, cellSize: 50, storeyHeight: 250, rings});
  /** The correctness review's probes that build, each with the genus Manifold measures. */
  const PROBES: [ShellFixture, number][] = [
    [fx('Apart', [ring([0, 0, 100, 100], 0, 1, 45), ring([200, 0, 300, 100], 0, 1, 45)]), -1],
    [fx('EdgeContactAcrossStoreys', [ring([0, 0, 400, 400], 0, 1, 30), ring([400, 0, 800, 400], 1, 1, 30)]), -1],
    [fx('VertexContactAcrossStoreys', [ring([0, 0, 400, 400], 0, 1, 30), ring([400, 400, 800, 800], 1, 1, 30)]), -1],
    [fx('LowRoofUnderTunnel30', [ring([0, 0, 1000, 400], 0, 1, 30), ring([0, 0, 200, 400], 1, 1, 30), ring([800, 0, 1000, 400], 1, 1, 30), ring([0, 0, 1000, 400], 2, 1, 30)]), 1],
    [fx('RoofTouchesBridgeOneUp', [ring([0, 0, 200, 400], 0, 2, 30), ring([800, 0, 1000, 400], 0, 2, 30), ring([200, 0, 800, 400], 0, 1, 70), ring([0, 0, 1000, 400], 2, 1, 30)]), 1],
  ];
  it.each(PROBES.map(([f, g]) => [f.name, f, g] as const))('%s: joins solids only through positive-area contact, as Manifold does', async (_, f, g) => {
    expect(predictedGenus(f)).toBe(g);
    expect((await buildShellDetailed(f)).union.genus).toBe(g);
  }, 60_000);

  it('predicts per component: a courtyard beside a separate island is genera 1 and 0, which Manifold sums to 0', () => {
    const f = fx('CourtyardBesideIsland', [
      ring([0, 0, 1000, 300], 0, 1, 30), ring([0, 700, 1000, 1000], 0, 1, 30), ring([0, 300, 300, 700], 0, 1, 30), ring([700, 300, 1000, 700], 0, 1, 30),
      ring([1500, 0, 1800, 300], 0, 1, 30),
    ]);
    expect(predictedComponentGenera(f)).toEqual([1, 0]);
    expect(predictedGenus(f)).toBe(0);
  });

  it('enrols the case it does not cover: a 60° roof filling the tunnel above it (predicted 1, measured 0)', async () => {
    const f = fx('TallRoofThroughTunnel60', [ring([0, 0, 1000, 400], 0, 1, 60), ring([0, 0, 200, 400], 1, 1, 30), ring([800, 0, 1000, 400], 1, 1, 30), ring([0, 0, 1000, 400], 2, 1, 30)]);
    expect(predictedGenus(f)).toBe(1);
    expect((await buildShellDetailed(f)).union.genus).toBe(0);
  }, 60_000);
});
