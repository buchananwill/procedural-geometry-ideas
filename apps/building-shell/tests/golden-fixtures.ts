// Journal decisions 129, 131 and 152: the golden set, `golden/`, the oracle port-ready is named by. One module builds
// every file's text, so the writer (`scripts/export-golden.ts`) and the drift test (golden.test.ts) read the same bytes.
// - one `<fixture>.json` per named fixture: its BuildingShell;
// - one `<fixture>.union.json`: its union stages (raw parts, boolean output, final tagged mesh);
// - one `<fixture>.input.json` for each C++-replayable fixture, `writeInput` of it (decision 152);
// - `manifest.json`: every named fixture with its pinned report, its genus per component, its replayability with the
//   reason when false, whether it is clean (decision 156, F4), its invariant violations, and, for a fixture whose build
//   throws, its error in place of files and violations.
import {errorMessage} from '../src/errors.ts';
import {EXPORTED_FIXTURES, ShellFixture, fixtureByName, ring} from '../src/fixture.ts';
import {GOLDEN_SCHEMA, GoldenEntry, GoldenManifest, GoldenManifestSchema, MANIFEST_FILE, cppReplayability, goldenText, unionStages} from '../src/golden.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {writeInput} from '../src/wire/input-adapter.ts';
import {
  CAP_CHAIN_SEED, CUT_OVERSHOOT_PROBE, F2_COURTYARDS, FULL_WINGS_PROBE, PINCH_SEEDS, RosterPitchName, UPPER_U_EDGE_CONTACT,
  flushOverReflexFixture, gapFixture, nudgeFixtures, pitchEndFixtures, randomCourtyardFixtures, randomSplitCourtyardFixtures,
  randomUFixtures, rosterPitchCases, seededFixture, splitBandFixture,
} from './robustness-fixtures.ts';
import {rosterGenus} from './roster-genus.ts';
import {invariantViolations} from './shell-invariants.ts';
import {NamedFixture, shellFixture} from './test-builds.ts';

/** One golden fixture and the genus per component its pin expects. */
export interface GoldenFixture { fixture: ShellFixture; genus: readonly number[] }

/** A fixture renamed for the golden set, where its tests build it at several storey heights under one name. */
const named = (f: ShellFixture, name: string): ShellFixture => ({...f, name});

/** The draws per seed the robustness tests measure the seeded generators' pins over. */
const DRAWS_PER_SEED = 40;

/** One pinned case of a seeded generator, renamed `<name>Seed<seed>h<height>` as `F2_COURTYARDS` are. */
function seededCase<N extends string>(gen: (seed: number, count: number, h: number) => NamedFixture<N>[], seed: number, name: N, h: number): ShellFixture {
  const f = gen(seed, DRAWS_PER_SEED, h).find(x => x.name === name);
  if (!f) throw new Error(`no case s${seed}h${h}/${name}`);
  return named(f, `${name}Seed${seed}h${h}`);
}

/** One case of the widened pitch sweep (`rosterPitchCases`), renamed without its `@` and `/` for a file name. */
function rosterPitchCase(roster: string, name: RosterPitchName, as: string): ShellFixture {
  const c = rosterPitchCases([fixtureByName(roster)]).find(x => x.name === name);
  if (!c) throw new Error(`no roster pitch case ${name}`);
  return named(c.fixture, as);
}

/** One case of a named generator by its name. */
function namedCase<N extends string>(cases: readonly NamedFixture<N>[], name: N): ShellFixture {
  const f = cases.find(x => x.name === name);
  if (!f) throw new Error(`no case ${name}`);
  return f;
}

/**
 * Journal decision 156, F3: the oracles of the two rules WP3.8 changed.
 * - `SplitBandFreeCut`: decision 151's counter-case `H300-700B200S500s30n45a30w60`, a split-band courtyard whose cut,
 *   the split's buried wall, is collinear with no wall, so it reads the free branch. The cutting Ring's walls at the
 *   cut's ends stand at 30° and 45° and the wings and far band at 60°, so the cut takes the island's steepest, 60°.
 * - `GablePitchL`: an L of two Rings hipped at 30°, gabled on its W side at 60° and its N side at 20°. A gable's pitch
 *   is geometry (decision 153), and here, unlike a single gable, it moves the shell: read at the Rings' 30° default, the
 *   gables change it.
 */
export const RULE_ORACLES: readonly GoldenFixture[] = [
  {fixture: splitBandFixture('SplitBandFreeCut', 300, 700, 200, 500, {a: 30, s: 30, n: 45, w: 60}), genus: [1]},
  {
    fixture: shellFixture('GablePitchL', [
      ring([0, 0, 1000, 400], 0, 1, 30, {W: {form: 'gable', deg: 60}}),
      ring([600, 0, 1000, 800], 0, 1, 30, {N: {form: 'gable', deg: 20}}),
    ]),
    genus: [0],
  },
];

/**
 * Journal decision 156, F4: one representative of every residue class the port inherits, each with the genus its pin
 * expects, so its manifest entry carries its pinned violations or its error and `clean: false`:
 * - the Cheek class, as decision 132's two regressions: s1h250 Court14 and s6h250 Court23;
 * - the Court25 throw (partial face-to-face contact of two storeys on one plane): s1h250 Court25;
 * - U8 (edge contact between opposite coplanar faces): s6h300 U8;
 * - a split-band failure, the split bands' commonest, a `cleanMesh` stuck cap: s2h250 SplitCourt10;
 * - a δ-nudge (decision 122's G5): ApexEdge5;
 * - a pitch-end throw (decision 143): G5.86h250;
 * - Courtyard at content's 22.5° and 45°, laid by side axis (decision 148, F3): its cut-piece overshoot;
 * - BridgeOverBlock at 45° (F52): its block's roof meeting the bridge's floor, genus 2 against 1.
 */
export const RESIDUE_CLASSES: readonly GoldenFixture[] = [
  {fixture: seededCase(randomCourtyardFixtures, 1, 'Court14', 250), genus: [1]},
  {fixture: seededCase(randomCourtyardFixtures, 6, 'Court23', 250), genus: [1]},
  {fixture: seededCase(randomCourtyardFixtures, 1, 'Court25', 250), genus: [1]},
  {fixture: seededCase(randomUFixtures, 6, 'U8', 300), genus: [0]},
  {fixture: seededCase(randomSplitCourtyardFixtures, 2, 'SplitCourt10', 250), genus: [1]},
  {fixture: namedCase(nudgeFixtures(), 'ApexEdge5'), genus: [0]},
  {fixture: namedCase(pitchEndFixtures(), 'G5.86h250'), genus: [0]},
  {fixture: rosterPitchCase('Courtyard', 'Courtyard@22.5/45s', 'CourtyardAt22.5-45s'), genus: rosterGenus('Courtyard')},
  {fixture: rosterPitchCase('BridgeOverBlock', 'BridgeOverBlock@45', 'BridgeOverBlockAt45'), genus: rosterGenus('BridgeOverBlock')},
];

/**
 * Journal decision 129: every named fixture, the roster, the Ring-conflict pairs, the four Port fixtures and the
 * courtyard first, then every enrolled robustness fixture that builds, each at the storey heights its tests read, then
 * decision 156's rule oracles (F3) and residue classes (F4).
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
  ...RULE_ORACLES,
  ...RESIDUE_CLASSES,
];

/**
 * Every golden file by name, with its text: what the writer writes and the drift test compares byte for byte. Each
 * manifest entry is built as one member of `GoldenEntry`'s union (journal decision 155, B10), in the manifest's key
 * order: the fixture, its replayability, its genus, whether it is clean, then its files, report and violations, or its
 * error.
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
        ? {fixture, cppReplayable: true, genus, clean: false, error}
        : {fixture, cppReplayable: false, reason: replay.reason, genus, clean: false, error});
      continue;
    }
    const shell = `${f.name}.json`, union = `${f.name}.union.json`;
    const report = b.shell.report, violations = invariantViolations(b, {genus, cheeks: 0});
    files.set(shell, goldenText(b.shell));
    files.set(union, goldenText(unionStages(f.name, b.union)));
    if (replay.cppReplayable) {
      const input = `${f.name}.input.json`;
      files.set(input, goldenText(writeInput(f)));
      entries.push(violations.length
        ? {fixture, cppReplayable: true, genus, clean: false, shell, union, input, report, violations}
        : {fixture, cppReplayable: true, genus, clean: true, shell, union, input, report, violations: []});
    } else {
      const {reason} = replay;
      entries.push(violations.length
        ? {fixture, cppReplayable: false, reason, genus, clean: false, shell, union, report, violations}
        : {fixture, cppReplayable: false, reason, genus, clean: true, shell, union, report, violations: []});
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
