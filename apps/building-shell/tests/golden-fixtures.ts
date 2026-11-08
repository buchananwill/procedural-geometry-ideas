// Journal decisions 129, 131 and 152: the golden set, `golden/`, the oracle port-ready is named by. One module builds
// every file's text, so the writer (`scripts/export-golden.ts`) and the drift test (golden.test.ts) read the same bytes.
// - one `<fixture>.json` per named fixture: its BuildingShell;
// - one `<fixture>.union.json`: its union stages (raw parts, boolean output, final tagged mesh);
// - one `<fixture>.input.json` for each C++-replayable fixture, `writeInput` of it (decision 152);
// - `manifest.json`: every named fixture with its pinned report, its genus per component, its invariant outcome, its
//   replayability with the reason when false, and, for a fixture whose build throws, its error in place of files.
import {errorMessage} from '../src/errors.ts';
import {EXPORTED_FIXTURES, ShellFixture} from '../src/fixture.ts';
import {GOLDEN_SCHEMA, GoldenEntry, GoldenManifest, GoldenManifestSchema, MANIFEST_FILE, cppReplayability, goldenText, unionStages} from '../src/golden.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
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

/**
 * Every golden file by name, with its text: what the writer writes and the drift test compares byte for byte. Each
 * manifest entry is built as one member of `GoldenEntry`'s union (journal decision 155, B10), in the manifest's key
 * order: the fixture, its replayability, its genus, then its files and report or its error.
 */
export async function goldenFiles(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries: GoldenEntry[] = [];
  for (const {fixture: f, genus: pinned} of GOLDEN_FIXTURES) {
    const replay = cppReplayability(f);
    const fixture = f.name, genus = [...pinned];
    let b: ShellBuild;
    try {
      b = await buildShellDetailed(f);
    } catch (e) {
      const error = errorMessage(e);
      entries.push(replay.cppReplayable
        ? {fixture, cppReplayable: true, genus, violations: [], error}
        : {fixture, cppReplayable: false, reason: replay.reason, genus, violations: [], error});
      continue;
    }
    const shell = `${f.name}.json`, union = `${f.name}.union.json`;
    const report = b.shell.report, violations = invariantViolations(b, {genus, cheeks: 0});
    files.set(shell, goldenText(b.shell));
    files.set(union, goldenText(unionStages(f.name, b.union)));
    if (replay.cppReplayable) {
      const input = `${f.name}.input.json`;
      files.set(input, goldenText(writeInput(f)));
      entries.push({fixture, cppReplayable: true, genus, shell, union, input, report, violations});
    } else {
      entries.push({fixture, cppReplayable: false, reason: replay.reason, genus, shell, union, report, violations});
    }
  }
  const manifest: GoldenManifest = {schema: GOLDEN_SCHEMA, fixtures: entries};
  // The type cannot refuse an entry holding both files and an error, since some member of the union holds each key;
  // the schema does (decision 155, B10 and N5), so the writer never writes one. Its output is discarded: the text keeps
  // the entries' own key order.
  GoldenManifestSchema.parse(manifest);
  files.set(MANIFEST_FILE, `${JSON.stringify(manifest, null, 1)}\n`);
  return files;
}
