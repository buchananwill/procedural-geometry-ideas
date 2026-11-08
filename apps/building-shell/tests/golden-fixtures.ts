// Journal decisions 129, 131 and 152: the golden set, `golden/`, the oracle port-ready is named by. One module builds
// every file's text, so the writer (`scripts/export-golden.ts`) and the drift test (golden.test.ts) read the same bytes.
// - one `<fixture>.json` per named fixture: its BuildingShell;
// - one `<fixture>.union.json`: its union stages (raw parts, boolean output, final tagged mesh);
// - one `<fixture>.input.json` for each C++-replayable fixture, `writeInput` of it (decision 152);
// - `manifest.json`: every named fixture with its pinned report, its genus per component, its invariant outcome, its
//   replayability with the reason when false, and, for a fixture whose build throws, its error in place of files.
import {errorMessage} from '../src/errors.ts';
import {EXPORTED_FIXTURES, ShellFixture} from '../src/fixture.ts';
import {goldenText, cppReplayability, unionStages} from '../src/golden.ts';
import {ShellReport, buildShellDetailed} from '../src/shell.ts';
import {writeInput} from '../src/wire/input-adapter.ts';
import {
  CAP_CHAIN_SEED, CUT_OVERSHOOT_PROBE, F2_COURTYARDS, FULL_WINGS_PROBE, PINCH_SEEDS, UPPER_U_EDGE_CONTACT, flushOverReflexFixture,
  gapFixture, seededFixture,
} from './robustness-fixtures.ts';
import {rosterGenus} from './roster-genus.ts';
import {invariantViolations} from './shell-invariants.ts';

/** One golden fixture and the genus per component its pin expects. */
export interface GoldenFixture { fixture: ShellFixture; genus: readonly number[] }

/** A fixture renamed for the golden set, where its tests build it at several storey heights under one name. */
const named = (f: ShellFixture, name: string): ShellFixture => ({...f, name});

/**
 * Journal decision 129: every named fixture, the roster, the Ring-conflict pairs, the four Port fixtures and the
 * courtyard first, then every enrolled robustness fixture that builds, each at the storey heights its tests read.
 */
export const GOLDEN_FIXTURES: readonly GoldenFixture[] = [
  ...EXPORTED_FIXTURES.map(fixture => ({fixture, genus: rosterGenus(fixture.name)})),
  ...[300, 250].map(h => ({fixture: named(flushOverReflexFixture(h), `FlushOverReflex${h}`), genus: [0]})),
  ...PINCH_SEEDS.flatMap(([s, k]) => [300, 250].map(h => ({fixture: named(seededFixture(s, k, h), `Seed${s}Fuzz${k}h${h}`), genus: [0]}))),
  ...[300, 250].map(h => ({fixture: named(seededFixture(CAP_CHAIN_SEED[0], CAP_CHAIN_SEED[1], h), `Seed${CAP_CHAIN_SEED[0]}Fuzz${CAP_CHAIN_SEED[1]}h${h}`), genus: [0]})),
  {fixture: UPPER_U_EDGE_CONTACT, genus: [0]},
  {fixture: FULL_WINGS_PROBE, genus: [1]},
  {fixture: CUT_OVERSHOOT_PROBE, genus: [1]},
  ...F2_COURTYARDS.map(f => ({fixture: named(f, f.name.replace(/^s(\d)h(\d+)\/(.*)$/, '$3Seed$1h$2')), genus: [1]})),
  ...(['Aligned', 'Offset'] as const).map(kind => ({fixture: gapFixture(kind, 1), genus: [0, 0]})),
];

/** One fixture's manifest entry (journal decisions 129 and 152). */
export interface GoldenEntry {
  fixture: string;
  /** Its files, absent for a fixture whose build throws. */
  shell?: string;
  union?: string;
  /** Its `input@1`, written only when it is C++-replayable. */
  input?: string;
  cppReplayable: boolean;
  /** Why it is not replayable. */
  reason?: string;
  /** Its pinned genus per component, highest first. */
  genus: readonly number[];
  /** Its pinned report (spec decision 33), absent for a fixture whose build throws. */
  report?: ShellReport;
  /** Its invariant outcome against `genus`: empty when clean, its enrolled defect otherwise. */
  violations: string[];
  /** The error its build raised, in place of its files. */
  error?: string;
}

/** The manifest: every named fixture, in `GOLDEN_FIXTURES` order. */
export interface GoldenManifest { schema: 'building-shell/golden@1'; fixtures: GoldenEntry[] }

export const MANIFEST_FILE = 'manifest.json';

/** Every golden file by name, with its text: what the writer writes and the drift test compares byte for byte. */
export async function goldenFiles(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries: GoldenEntry[] = [];
  for (const {fixture: f, genus} of GOLDEN_FIXTURES) {
    const replay = cppReplayability(f);
    const base = {fixture: f.name, cppReplayable: replay.cppReplayable, ...(replay.cppReplayable ? {} : {reason: replay.reason}), genus};
    try {
      const b = await buildShellDetailed(f);
      const shell = `${f.name}.json`, union = `${f.name}.union.json`, input = `${f.name}.input.json`;
      files.set(shell, goldenText(b.shell));
      files.set(union, goldenText(unionStages(f.name, b.union)));
      if (replay.cppReplayable) files.set(input, goldenText(writeInput(f)));
      entries.push({...base, shell, union, ...(replay.cppReplayable ? {input} : {}), report: b.shell.report, violations: invariantViolations(b, {genus, cheeks: 0})});
    } catch (e) {
      entries.push({...base, violations: [], error: errorMessage(e)});
    }
  }
  const manifest: GoldenManifest = {schema: 'building-shell/golden@1', fixtures: entries};
  files.set(MANIFEST_FILE, `${JSON.stringify(manifest, null, 1)}\n`);
  return files;
}
