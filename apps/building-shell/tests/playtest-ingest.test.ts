// Journal decisions 124, 140 (F6), 148 (F1) and 149: every dump in `fixtures/playtest/`, an input document plus an
// optional output paired by stem, is loaded automatically. Its input is validated against `input@1`, adapted to a
// fixture and run through every invariant of `shell-invariants.ts`, its genus per component against its pin, measured
// at enrolment (the slab-genus prediction is retired); its output, when present, is diffed against the build. A dump's
// outcome must be clean, or exactly its pin in `playtest-pins.ts`.
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {errorMessage} from '../src/errors.ts';
import {EXPORTED_FIXTURES} from '../src/fixture.ts';
import {buildShellDetailed} from '../src/shell.ts';
import {diffReportLines} from '../src/wire/canonical.ts';
import {readOutput} from '../src/wire/canonical-output-schema.ts';
import {INPUT_SUFFIX, OUTPUT_SUFFIX, dumpReport, listDumps} from '../src/wire/dump.ts';
import {PLAYTEST_DIR, SEED_FIXTURES, SEED_WITH_OUTPUT, seedStem} from '../src/wire/export-playtest.ts';
import {readInput} from '../src/wire/input-adapter.ts';
import {AcceptedPin, PLAYTEST_PINS} from './playtest-pins.ts';
import {ROSTER_GENUS_NAMES, rosterGenus} from './roster-genus.ts';
import {componentGenera, invariantViolations} from './shell-invariants.ts';
import {expectBaselineShape} from './wire-report-shape.ts';

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
  it('holds the seeded dumps, one with its output, so the ingestion is never vacuous', () => {
    expect(LISTING.dumps.map(d => d.input)).toEqual(expect.arrayContaining(SEED_FIXTURES.map(n => `${seedStem(n)}${INPUT_SUFFIX}`)));
    expect(LISTING.dumps.find(d => d.stem === seedStem(SEED_WITH_OUTPUT))?.output).toBe(`${seedStem(SEED_WITH_OUTPUT)}${OUTPUT_SUFFIX}`);
  });

  it('holds no JSON that is neither an input nor the output of one', () => {
    expect(LISTING.strays).toEqual([]);
  });

  it('pins only dumps it holds', () => {
    expect(Object.keys(PLAYTEST_PINS).filter(k => !LISTING.dumps.some(d => d.stem === k))).toEqual([]);
  });
});

describe.each(LISTING.dumps.map(d => [d.stem, d] as const))('%s', (stem, dump) => {
  const pin = PLAYTEST_PINS[stem] ?? {kind: 'accepted'};
  const read = readInput(load(dump.input), stem);

  // Decision 143, F6: a dump's output is validated whatever its input's outcome, a refused input's included.
  if (dump.output) {
    const output = dump.output;
    it('has an output that validates against its schema', () => {
      const out = readOutput(load(output));
      expect(out.ok ? [] : out.errors).toEqual([]);
    });
  }

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

  it('keeps every invariant, with its pinned genus per component, and matches its output where it has one', async () => {
    if (!read.ok) throw new Error(`refused: ${read.errors.join('; ')}`);
    const b = await buildShellDetailed(read.fixture);
    // Decision 148, F1: a seed takes its roster pin by its provenance subject; any other dump must carry its own.
    const genus = want.genus ?? rosterGenus(read.input.provenance.subject);
    expect(invariantViolations(b, {genus, cheeks: want.cheeks ?? 0})).toEqual(want.violations ?? []);
    if (!dump.output) return;
    const report = dumpReport(stem, read, b.shell, load(dump.output));
    if ('ok' in report) throw new Error(`output refused: ${report.errors.join('; ')}`);
    if (report.mode === 'full') {
      expect(differences(diffReportLines(report))).toEqual(want.diff ?? []);
      return;
    }
    // Decision 143, F6: a baseline is printed and its structure asserted, never discarded, and never a pass or fail.
    console.log(diffReportLines(report).join('\n'));
    expectBaselineShape(report);
  }, 60_000);
});

describe('the roster genus pins (journal decision 148, F1; decision 150, N4)', () => {
  it('pins every exported fixture, and nothing else', () => {
    expect([...ROSTER_GENUS_NAMES].sort()).toEqual(EXPORTED_FIXTURES.map(f => f.name).sort());
  });

  it('throws on a fixture with no measurement', () => {
    expect(() => rosterGenus('NoSuchFixture')).toThrow(/no measured genus for NoSuchFixture/);
  });

  it.each(EXPORTED_FIXTURES.map(f => [f.name, f] as const))('%s: measures its pinned genus per component', async (name, f) => {
    expect(componentGenera((await buildShellDetailed(f)).union.mesh)).toEqual(rosterGenus(name));
  }, 60_000);
});
