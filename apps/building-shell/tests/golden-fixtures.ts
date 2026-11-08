// Journal decisions 129, 131 and 152: the golden set, `golden/`, the oracle port-ready is named by. One module builds
// every file's text, so the writer (`scripts/export-golden.ts`) and the drift test (golden.test.ts) read the same bytes.
// - one `<fixture>.json` per named fixture that builds: its BuildingShell;
// - one `<fixture>.union.json` beside it: its union stages (raw parts, boolean output, final tagged mesh);
// - one `<fixture>.input.json` for each C++-replayable fixture, `writeInput` of it (decision 152), or the document it was
//   read from (decision 161, finding 3), whether it builds or throws (decision 161, finding 1);
// - `manifest.json`: every named fixture with its replayability and every reason when false, one string each
//   (decision 160, N6), the genus per component its pin expects and, where it builds, the genus its union measures
//   (decision 161, finding 5), whether it is clean (decision 156, F4), a residue's class (decision 161, Info), its
//   files and pinned report and invariant violations, or, for a fixture whose build throws, its error in place of its
//   shell, union, report and violations.
import {errorMessage} from '../src/errors.ts';
import {EXPORTED_FIXTURES, RING_SIDES, RingSides, ShellFixture, fixtureByName, ring} from '../src/fixture.ts';
import {
  GOLDEN_SCHEMA, GoldenEntry, GoldenManifest, GoldenManifestSchema, MANIFEST_FILE, ResidueClass, cppReplayabilityOf, goldenText, unionStages,
} from '../src/golden.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {withFileModelIndices} from '../src/wire/dump.ts';
import {AdaptedInput, readInput, writeInput} from '../src/wire/input-adapter.ts';
import type {BuildingShellInputV1} from '../src/wire/input-types.ts';
import {
  CAP_CHAIN_SEED, CUT_OVERSHOOT_PROBE, F2_COURTYARDS, FULL_WINGS_PROBE, PINCH_SEEDS, RosterPitchName, UPPER_U_EDGE_CONTACT,
  flushOverReflexFixture, gapFixture, nudgeFixtures, pitchEndFixtures, randomCourtyardFixtures, randomSplitCourtyardFixtures,
  randomUFixtures, rosterPitchCases, seededFixture, splitBandFixture,
} from './robustness-fixtures.ts';
import {rosterGenus} from './roster-genus.ts';
import {CausedPinTable, DefectCause, PinTable, throwsOutcome} from './pin-table.ts';
import {
  COURTYARD_DEFECTS, CUT_OVERSHOOT_DEFECTS, GAP_DEFECTS, NUDGE_DEFECTS, PITCH_END_DEFECTS, ROSTER_PITCH_DEFECTS, SPLIT_COURTYARD_DEFECTS, U_DEFECTS,
} from './residue-pins.ts';
import {componentGenera, invariantViolations, roofUndersideLines} from './shell-invariants.ts';
import {NamedFixture, shellFixture} from './test-builds.ts';
import {ASYMMETRIC_L, scrambled} from './wire-round-trip-cases.ts';

/**
 * A golden fixture read from an `input@1` document rather than written from a fixture (journal decision 161, finding
 * 3): the document as committed, and what `readInput` made of it, whose model indices and side slots its shell's
 * provenance is mapped back through (`withFileModelIndices`).
 */
export interface GoldenFile { document: BuildingShellInputV1; read: AdaptedInput }

/**
 * What every golden fixture carries: the fixture it builds, the genus per component its pin expects, and, for one read
 * from a document, that document.
 */
export interface GoldenBase { fixture: ShellFixture; genus: readonly number[]; file?: GoldenFile }

/** A golden fixture that keeps every invariant: it has no pin (journal decision 160, B2). */
export interface CleanGolden extends GoldenBase { clean: true }

/**
 * A residue (journal decisions 158, 3, 160, B2, and 161, Info): its class by its stable name, its robustness pin,
 * verbatim, its violations or `throwsOutcome` of its error, as the robustness sweeps measure it, and `located` where
 * that measure names its Roof-Underside edges (`roofUndersideLines`, decision 156, F8).
 */
export interface ResidueGolden extends GoldenBase { clean: false; residueClass: ResidueClass; pin: readonly string[]; located: boolean }

/** One golden fixture: clean, or a residue with its class and pin (journal decision 160, B2). */
export type GoldenFixture = CleanGolden | ResidueGolden;

const cleanGolden = (fixture: ShellFixture, genus: readonly number[]): CleanGolden => ({clean: true, fixture, genus});

/** A residue whose pin table carries no cause: its class is named here. */
const residueGolden = (fixture: ShellFixture, genus: readonly number[], pin: readonly string[], residueClass: ResidueClass, located = false): ResidueGolden =>
  ({clean: false, fixture, genus, residueClass, pin, located});

/**
 * Each pinned cause's residue class (journal decision 161, Info). Exhaustive over `DefectCause`, so a cause added to the
 * pins without a class fails `typecheck`. Decision 132's regressions are the Cheek class, exposed by the cut rule.
 */
const CAUSE_CLASSES: {readonly [C in DefectCause]: ResidueClass} = {
  'roof-gable algorithm B, Cheek class': 'algorithm-B Cheek',
  "decision 132's cut rule exposes algorithm B's Cheek class (a regression)": 'algorithm-B Cheek',
  'roof-gable algorithm B, cut-piece overshoot': 'algorithm-B cut-piece overshoot',
  'partial face-to-face contact of two storeys on one plane (Court25 class)': 'partial coplanar contact of two storeys',
  'edge contact between opposite coplanar faces (U8 class)': 'edge contact between opposite coplanar faces',
  'cleanMesh stuck cap': 'cleanMesh stuck cap',
  "a Cell corner in no triangle of its face's fan": 'Cell outside its face fan',
  'a Gable-Wall edge, Unclassified (SplitCourt9 class)': 'Gable-Wall edge Unclassified',
};

/** A residue's pin from its table: it must be there, since a residue golden with no pin ties to nothing. */
function pinOf<K extends string>(table: PinTable<K>, key: K): readonly string[] {
  const pin = table[key];
  if (!pin) throw new Error(`no pin ${key}`);
  return pin;
}

/** A residue from a table whose every pin carries its cause: its class is the cause's (`CAUSE_CLASSES`). */
function causedResidue<K extends string>(fixture: ShellFixture, genus: readonly number[], table: CausedPinTable<K>, key: K): ResidueGolden {
  const pin = table[key];
  if (!pin) throw new Error(`no pin ${key}`);
  return residueGolden(fixture, genus, pin.outcome, CAUSE_CLASSES[pin.cause]);
}

/**
 * A golden fixture read from a document (journal decision 161, finding 3), named `name`. The document must be one the
 * prototype's own reader accepts.
 */
function fileGolden(name: string, document: BuildingShellInputV1, genus: readonly number[]): CleanGolden {
  const read = readInput(JSON.parse(JSON.stringify(document)), name);
  if (!read.ok) throw new Error(`${name}: readInput refuses its document: ${read.errors.join('; ')}`);
  return {clean: true, fixture: read.fixture, genus, file: {document, read}};
}

/** A golden fixture's `input@1`: the document it was read from, or `writeInput` of its fixture. */
export const goldenInput = (g: GoldenFixture): BuildingShellInputV1 => g.file?.document ?? writeInput(g.fixture);

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

/** A fixture with every side of every Ring gabled, each at its Ring's default pitch. */
const allGabled = (f: ShellFixture): ShellFixture =>
  ({...f, rings: f.rings.map(r => ({...r, sides: Object.fromEntries(RING_SIDES.map(s => [s, {form: 'gable'}])) as RingSides}))});

/**
 * Journal decisions 156, F3, and 161, findings 2 and 3: the oracles of the rules WP3.8 changed, each a clean golden
 * that a rejected variant of its rule moves.
 * - `SplitBandFreeCut`: decision 151's counter-case `H300-700B200S500s30n45a30w60`, a split-band courtyard whose cut,
 *   the split's buried wall, is collinear with no wall, so it reads the free branch. The cutting Ring's walls at the
 *   cut's ends stand at 30° and 45° and the wings and far band at 60°, so the cut takes the island's steepest, 60°.
 * - `SplitBandFreeCut45` (decision 161, finding 2): the split-band layout `H400-600B100S500` hipped at 45° throughout,
 *   an island whose steepest pitch is not 60°, so decision 151's rejected constant 60 moves its shell.
 * - `SplitBandAllGable75` (decision 161, finding 2, the reviewer's reproducer): `H300-700B200S500` gabled on every side
 *   at 75°, so the island's steepest wall is a gable. Decision 151's struck hip-only rule finds no hip and falls to 45°,
 *   where the skeleton refuses the storey.
 * - `GablePitchL`: an L of two Rings hipped at 30°, gabled on its W side at 60° and its N side at 20°. A gable's pitch
 *   is geometry (decision 153), and here, unlike a single gable, it moves the shell: read at the Rings' 30° default, the
 *   gables change it.
 * - `AsymmetricLScrambled` (decision 161, finding 3, decision 156's F1 rule): the asymmetric L read from a document
 *   whose Rings each start at a non-canonical corner, listed in another order under model indices 7 and 20 that are not
 *   their array positions (`scrambled`). Its shell is built through `readInput`, and its provenance names the file's own
 *   model indices and side slots: the W gable is model index 7's side 2.
 */
export const RULE_ORACLES: readonly CleanGolden[] = [
  cleanGolden(splitBandFixture('SplitBandFreeCut', 300, 700, 200, 500, {a: 30, s: 30, n: 45, w: 60}), [1]),
  cleanGolden(splitBandFixture('SplitBandFreeCut45', 400, 600, 100, 500, {a: 45, w: 45}), [1]),
  cleanGolden(allGabled(splitBandFixture('SplitBandAllGable75', 300, 700, 200, 500, {a: 75, w: 75})), [1]),
  cleanGolden(shellFixture('GablePitchL', [
    ring([0, 0, 1000, 400], 0, 1, 30, {W: {form: 'gable', deg: 60}}),
    ring([600, 0, 1000, 800], 0, 1, 30, {N: {form: 'gable', deg: 20}}),
  ]), [0]),
  fileGolden('AsymmetricLScrambled', scrambled(named(ASYMMETRIC_L, 'AsymmetricLScrambled')), [0]),
];

/**
 * Journal decision 156, F4: one representative of every residue class the port inherits, each with the genus its pin
 * expects, so its manifest entry carries its class (decision 161, Info), its pinned violations or its error and
 * `clean: false`:
 * - the Cheek class, as decision 132's two regressions: s1h250 Court14 and s6h250 Court23;
 * - the Court25 throw (partial face-to-face contact of two storeys on one plane): s1h250 Court25;
 * - U8 (edge contact between opposite coplanar faces): s6h300 U8;
 * - a split-band failure, the split bands' commonest, a `cleanMesh` stuck cap: s2h250 SplitCourt10;
 * - a δ-nudge (decision 122's G5): ApexEdge5;
 * - a pitch-end throw (decision 143): G5.86h250;
 * - Courtyard at content's 22.5° and 45°, laid by side axis (decision 148, F3): its cut-piece overshoot;
 * - BridgeOverBlock at 45° (F52): its block's roof meeting the bridge's floor, genus 2 against 1, with its
 *   Roof-Underside edges' ends, as its pin carries them;
 * - and decision 156, F7's two classes (decision 158, 1): s11h250 Court35's Cell-fan throw, and s7h250 SplitCourt9's
 *   Unclassified Gable-Wall edges.
 */
export const RESIDUE_CLASSES: readonly ResidueGolden[] = [
  causedResidue(seededCase(randomCourtyardFixtures, 1, 'Court14', 250), [1], COURTYARD_DEFECTS, 's1h250/Court14'),
  causedResidue(seededCase(randomCourtyardFixtures, 6, 'Court23', 250), [1], COURTYARD_DEFECTS, 's6h250/Court23'),
  causedResidue(seededCase(randomCourtyardFixtures, 1, 'Court25', 250), [1], COURTYARD_DEFECTS, 's1h250/Court25'),
  causedResidue(seededCase(randomUFixtures, 6, 'U8', 300), [0], U_DEFECTS, 's6h300/U8'),
  causedResidue(seededCase(randomSplitCourtyardFixtures, 2, 'SplitCourt10', 250), [1], SPLIT_COURTYARD_DEFECTS, 's2h250/SplitCourt10'),
  residueGolden(namedCase(nudgeFixtures(), 'ApexEdge5'), [0], pinOf(NUDGE_DEFECTS, 'ApexEdge5'), 'sub-tolerance roof feature'),
  residueGolden(namedCase(pitchEndFixtures(), 'G5.86h250'), [0], pinOf(PITCH_END_DEFECTS, 'G5.86h250'), 'low-pitch pocket'),
  residueGolden(rosterPitchCase('Courtyard', 'Courtyard@22.5/45s', 'CourtyardAt22.5-45s'), rosterGenus('Courtyard'), pinOf(ROSTER_PITCH_DEFECTS, 'Courtyard@22.5/45s'), 'algorithm-B cut-piece overshoot', true),
  residueGolden(rosterPitchCase('BridgeOverBlock', 'BridgeOverBlock@45', 'BridgeOverBlockAt45'), rosterGenus('BridgeOverBlock'), pinOf(ROSTER_PITCH_DEFECTS, 'BridgeOverBlock@45'), 'roof meets the floor above', true),
  causedResidue(seededCase(randomCourtyardFixtures, 11, 'Court35', 250), [1], COURTYARD_DEFECTS, 's11h250/Court35'),
  causedResidue(seededCase(randomSplitCourtyardFixtures, 7, 'SplitCourt9', 250), [1], SPLIT_COURTYARD_DEFECTS, 's7h250/SplitCourt9'),
];

/**
 * Journal decision 129: every named fixture, the roster, the Ring-conflict pairs, the four Port fixtures and the
 * courtyard first, then every enrolled robustness fixture that builds, each at the storey heights its tests read, then
 * the rule oracles (decisions 156, F3, and 161, findings 2 and 3) and residue classes (decision 156, F4).
 */
export const GOLDEN_FIXTURES: readonly GoldenFixture[] = [
  ...EXPORTED_FIXTURES.map(fixture => cleanGolden(fixture, rosterGenus(fixture.name))),
  ...[300, 250].map(h => cleanGolden(named(flushOverReflexFixture(h), `FlushOverReflex${h}`), [0])),
  ...PINCH_SEEDS.flatMap(([s, k]) => [300, 250].map(h => cleanGolden(named(seededFixture(s, k, h), `Seed${s}Fuzz${k}h${h}`), [0]))),
  ...[300, 250].map(h => cleanGolden(named(seededFixture(CAP_CHAIN_SEED[0], CAP_CHAIN_SEED[1], h), `Seed${CAP_CHAIN_SEED[0]}Fuzz${CAP_CHAIN_SEED[1]}h${h}`), [0])),
  cleanGolden(UPPER_U_EDGE_CONTACT, [0]),
  cleanGolden(FULL_WINGS_PROBE, [1]),
  residueGolden(CUT_OVERSHOOT_PROBE, [1], CUT_OVERSHOOT_DEFECTS, 'algorithm-B cut-piece overshoot'),
  ...F2_COURTYARDS.map(f => cleanGolden(named(f, f.name.replace(/^s(\d)h(\d+)\/(.*)$/, '$3Seed$1h$2')), [1])),
  ...(['Aligned', 'Offset'] as const).map(kind => gapFixture(kind, 1)).map(f => residueGolden(f, [0, 0], pinOf(GAP_DEFECTS, f.name), 'near-touching islands')),
  ...RULE_ORACLES,
  ...RESIDUE_CLASSES,
];

/**
 * A golden fixture's class where it measures a defect. A clean golden that measures one is enrolled by no pin, so the
 * writer refuses to write it: an unattributed defect never reaches the oracle.
 */
function residueClassOf(g: GoldenFixture, outcome: readonly string[]): ResidueClass {
  if (g.clean) throw new Error(`${g.fixture.name} measures ${outcome[0]}, but no pin enrols it: re-measure, then enrol or fix it`);
  return g.residueClass;
}

/**
 * Every golden file by name, with its text: what the writer writes and the drift test compares byte for byte. Each
 * manifest entry is built as one member of `GoldenEntry`'s union (journal decision 155, B10), in the manifest's key
 * order: the fixture, its replayability, its expected and measured genus, whether it is clean and its class, then its
 * files, report and violations, or its input and error.
 */
export async function goldenFiles(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries: GoldenEntry[] = [];
  for (const g of GOLDEN_FIXTURES) {
    const f = g.fixture, fixture = f.name, expectedGenus = [...g.genus], located = !g.clean && g.located;
    const document = goldenInput(g), replay = cppReplayabilityOf(document), input = `${fixture}.input.json`;
    // Decision 161, finding 1: a replayable fixture ships its input whether it builds or throws.
    if (replay.cppReplayable) files.set(input, goldenText(document));
    let b: ShellBuild;
    try {
      b = await buildShellDetailed(f);
    } catch (e) {
      const error = errorMessage(e), residueClass = residueClassOf(g, [throwsOutcome(error)]);
      entries.push(replay.cppReplayable
        ? {fixture, cppReplayable: true, expectedGenus, clean: false, residueClass, input, error}
        : {fixture, cppReplayable: false, reasons: replay.reasons, expectedGenus, clean: false, residueClass, error});
      continue;
    }
    const shell = `${fixture}.json`, union = `${fixture}.union.json`, measuredGenus = componentGenera(b.union.mesh);
    // Measured as its pin is (decision 158, 3): a located residue names its Roof-Underside edges too.
    const report = b.shell.report, violations = [...invariantViolations(b, {genus: expectedGenus, cheeks: 0}), ...(located ? roofUndersideLines(b) : [])];
    // Decision 161, finding 3: a shell read from a document names the document's own Rings and sides.
    files.set(shell, goldenText(g.file ? withFileModelIndices(b.shell, g.file.read) : b.shell));
    files.set(union, goldenText(unionStages(fixture, b.union)));
    if (replay.cppReplayable) {
      entries.push(violations.length
        ? {fixture, cppReplayable: true, expectedGenus, measuredGenus, clean: false, residueClass: residueClassOf(g, violations), shell, union, input, report, violations}
        : {fixture, cppReplayable: true, expectedGenus, measuredGenus, clean: true, shell, union, input, report, violations: []});
    } else {
      const {reasons} = replay;
      entries.push(violations.length
        ? {fixture, cppReplayable: false, reasons, expectedGenus, measuredGenus, clean: false, residueClass: residueClassOf(g, violations), shell, union, report, violations}
        : {fixture, cppReplayable: false, reasons, expectedGenus, measuredGenus, clean: true, shell, union, report, violations: []});
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
