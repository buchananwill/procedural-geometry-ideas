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
  GOLDEN_SCHEMA, GenusPerComponent, GoldenEntry, GoldenManifest, GoldenManifestSchema, MANIFEST_FILE, ResidueClass, cppReplayabilityOf, goldenText,
  unionStages,
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
import {PinOutcome, PinRecord, ResiduePin, pinClass, throwsOutcome} from './pin-table.ts';
import {
  COURTYARD_DEFECTS, CUT_OVERSHOOT_DEFECTS, GAP_DEFECTS, NUDGE_DEFECTS, PITCH_END_DEFECTS, ROSTER_PITCH_DEFECTS, SPLIT_COURTYARD_DEFECTS, SeededKey,
  U_DEFECTS, seededKey,
} from './residue-pins.ts';
import {componentGenera, invariantViolations, roofUndersideLines} from './shell-invariants.ts';
import {NamedFixture, shellFixture} from './test-builds.ts';
import {ASYMMETRIC_L, rotatedSparse, scrambled} from './wire-round-trip-cases.ts';

/**
 * A golden fixture read from an `input@1` document rather than written from a fixture (journal decision 161, finding
 * 3): the document as committed, and what `readInput` made of it, whose model indices and side slots its shell's
 * provenance is mapped back through (`withFileModelIndices`).
 */
export interface GoldenFile { document: BuildingShellInputV1; read: AdaptedInput }

/**
 * What every golden fixture carries: the fixture it builds, the genus per component its pin expects, the manifest's
 * `expectedGenus` (journal decision 163, N2), and, for one read from a document, that document.
 */
export interface GoldenBase { fixture: ShellFixture; expectedGenus: GenusPerComponent; file?: GoldenFile }

/** A golden fixture that keeps every invariant: it has no pin (journal decision 160, B2). */
export interface CleanGolden extends GoldenBase { clean: true }

/**
 * A residue (journal decisions 158, 3, 160, B2, and 161, Info): its class by its stable name, its robustness pin,
 * verbatim, its violations or `throwsOutcome` of its error, as the robustness sweeps measure it, and `located` where
 * that measure names its Roof-Underside edges (`roofUndersideLines`, decision 156, F8).
 */
export interface ResidueGolden extends GoldenBase { clean: false; residueClass: ResidueClass; pin: PinOutcome; located: boolean }

/** One golden fixture: clean, or a residue with its class and pin (journal decision 160, B2). */
export type GoldenFixture = CleanGolden | ResidueGolden;

const cleanGolden = (fixture: ShellFixture, expectedGenus: GenusPerComponent): CleanGolden => ({clean: true, fixture, expectedGenus});

/** A residue from its pin: the pin's outcome, and its class, its cause's or its own (`pinClass`, decision 163, N3). */
const residueOfPin = (fixture: ShellFixture, expectedGenus: GenusPerComponent, pin: ResiduePin, located = false): ResidueGolden =>
  ({clean: false, fixture, expectedGenus, residueClass: pinClass(pin), pin: pin.outcome, located});

/** A residue from its pin table: the pin must be there, since a residue golden with no pin ties to nothing. */
function residueGolden<K extends string>(fixture: ShellFixture, expectedGenus: GenusPerComponent, table: PinRecord<K, ResiduePin>, key: K, located = false): ResidueGolden {
  const pin = table[key];
  if (!pin) throw new Error(`no pin ${key}`);
  return residueOfPin(fixture, expectedGenus, pin, located);
}

/**
 * A golden fixture read from a document (journal decision 161, finding 3), named `name`. The document must be one the
 * prototype's own reader accepts.
 */
function fileGolden(name: string, document: BuildingShellInputV1, expectedGenus: GenusPerComponent): CleanGolden {
  const read = readInput(JSON.parse(JSON.stringify(document)), name);
  if (!read.ok) throw new Error(`${name}: readInput refuses its document: ${read.errors.join('; ')}`);
  return {clean: true, fixture: read.fixture, expectedGenus, file: {document, read}};
}

/** A golden fixture's `input@1`: the document it was read from, or `writeInput` of its fixture. */
export const goldenInput = (g: GoldenFixture): BuildingShellInputV1 => g.file?.document ?? writeInput(g.fixture);

/** A fixture renamed for the golden set, where its tests build it at several storey heights under one name. */
const named = (f: ShellFixture, name: string): ShellFixture => ({...f, name});

/** A seeded case's golden name, `<name>Seed<seed>h<height>`: a file name, where its pin key holds `/`. */
const seededName = (name: string, seed: number | string, h: number | string): string => `${name}Seed${seed}h${h}`;

/** The draws per seed the robustness tests measure the seeded generators' pins over. */
const DRAWS_PER_SEED = 40;

/** A seeded generator: `count` draws of `seed` at storey height `h`, named by the name type `N`. */
type SeededGenerator<N extends string> = (seed: number, count: number, h: number) => NamedFixture<N>[];

/**
 * One pinned case of a seeded generator, stated once (journal decision 160, N1): its fixture, renamed by `seededName`,
 * and its pin, keyed by `seededKey`.
 */
function seededResidue<N extends string>(gen: SeededGenerator<N>, table: PinRecord<SeededKey<N>, ResiduePin>, seed: number, name: N, h: number, expectedGenus: GenusPerComponent): ResidueGolden {
  const key = seededKey(seed, h, name);
  const f = gen(seed, DRAWS_PER_SEED, h).find(x => x.name === name);
  if (!f) throw new Error(`no case ${key}`);
  return residueGolden(named(f, seededName(name, seed, h)), expectedGenus, table, key);
}

/**
 * One case of the widened pitch sweep (`rosterPitchCases`), stated once (journal decision 160, N1): its roster fixture
 * and genus read from its name, renamed `as` without its `@` and `/` for a file name, and its pin, located, as the sweep
 * measures it.
 */
function rosterPitchResidue(name: RosterPitchName, as: string): ResidueGolden {
  const roster = name.slice(0, name.indexOf('@'));
  const c = rosterPitchCases([fixtureByName(roster)]).find(x => x.name === name);
  if (!c) throw new Error(`no roster pitch case ${name}`);
  return residueGolden(named(c.fixture, as), rosterGenus(roster), ROSTER_PITCH_DEFECTS, name, true);
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
 * Journal decision 164, finding 1: the reviewer's `SB400-600B100S500g60r0`, a split-band courtyard hipped at 30° with the
 * cutting Ring's W side (the whole x = 0 wall) gabled at 60°, steeper than every hip on the island.
 */
function gableSteeperThanHips(): ShellFixture {
  const f = splitBandFixture('SB400-600B100S500g60r0', 400, 600, 100, 500, {a: 30, w: 30});
  f.rings[0] = {...f.rings[0], sides: {...f.rings[0].sides, W: {form: 'gable', deg: 60}}};
  return f;
}

/**
 * Journal decision 164, finding 2: the Ring-conflict fixtures whose conflicts the user's lowest-index rule (spec
 * decisions 3 and 128) decides, the six the correctness review measured.
 */
export const MODEL_ORDER_CONFLICTS = [
  'FlushRingConflict', 'OverlapRingConflict', 'PitchRingConflict', 'ThreeRingConflict', 'StoreyRingConflict', 'CutPitchConflict',
] as const;

/** One of `MODEL_ORDER_CONFLICTS`. */
export type ModelOrderConflict = typeof MODEL_ORDER_CONFLICTS[number];

/** A model-order oracle's golden name (journal decision 166, N2). */
export type FileReversedName = `${ModelOrderConflict}FileReversed`;

/** The one builder of a model-order oracle's name: `<fixture>FileReversed` (journal decision 166, N2). */
export const fileReversedName = (name: ModelOrderConflict): FileReversedName => `${name}FileReversed`;

/**
 * Journal decisions 165 and 166, N2: the conflicts whose shell reading the Rings in file order cannot move, measured,
 * not assumed. CutPitchConflict's one union wall that two of its Rings' sides share, x = 1000, is hipped at 30° by all
 * three, so its winner's order cannot show.
 */
export const UNMOVED_BY_FILE_ORDER: readonly ModelOrderConflict[] = ['CutPitchConflict'];

/**
 * Journal decision 164, finding 2: the model-order oracle. Each of `MODEL_ORDER_CONFLICTS` read from a document whose
 * file order reverses its model order (`scrambled`), named `fileReversedName` of it. `readInput` orders the Rings by
 * model index, so each reads back as its fixture, and its shell names the file's own model indices and side slots
 * (`withFileModelIndices`). A reader that keys the conflict rule on file position builds the reversed fixture instead.
 */
export const MODEL_ORDER_ORACLES: readonly CleanGolden[] = MODEL_ORDER_CONFLICTS.map(name =>
  fileGolden(fileReversedName(name), scrambled(named(fixtureByName(name), fileReversedName(name))), rosterGenus(name)));

/**
 * Journal decisions 156, F3, 161, findings 2 and 3, and 164, findings 1 and 2: the oracles of the rules WP3.8 changed,
 * each a clean golden that a rejected variant of its rule moves.
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
 *   whose Rings each start at a non-canonical corner, under model indices 7 and 20 that are not their array positions
 *   (`rotatedSparse`). Its Rings are listed in model order, so it is the oracle for the file's model indices and side
 *   slots, not for Ring order: the `*FileReversed` goldens are that. Its shell is built through `readInput`, and its
 *   provenance names the file's own model indices and side slots: the W gable is model index 7's side 2.
 * - `SB400-600B100S500g60r0` (decision 164, finding 1, the reviewer's reproducer): the split-band layout
 *   `H400-600B100S500` hipped at 30° throughout, with the cutting Ring's W side gabled at 60°, so the island has hips and
 *   a gable steeper than every hip. Its free cut takes the gable's 60°; a hip-first rule takes the hips' 30° and moves it.
 * - The `*FileReversed` goldens (`MODEL_ORDER_ORACLES`).
 */
export const RULE_ORACLES: readonly CleanGolden[] = [
  cleanGolden(splitBandFixture('SplitBandFreeCut', 300, 700, 200, 500, {a: 30, s: 30, n: 45, w: 60}), [1]),
  cleanGolden(splitBandFixture('SplitBandFreeCut45', 400, 600, 100, 500, {a: 45, w: 45}), [1]),
  cleanGolden(allGabled(splitBandFixture('SplitBandAllGable75', 300, 700, 200, 500, {a: 75, w: 75})), [1]),
  cleanGolden(shellFixture('GablePitchL', [
    ring([0, 0, 1000, 400], 0, 1, 30, {W: {form: 'gable', deg: 60}}),
    ring([600, 0, 1000, 800], 0, 1, 30, {N: {form: 'gable', deg: 20}}),
  ]), [0]),
  fileGolden('AsymmetricLScrambled', rotatedSparse(named(ASYMMETRIC_L, 'AsymmetricLScrambled')), [0]),
  cleanGolden(gableSteeperThanHips(), [1]),
  ...MODEL_ORDER_ORACLES,
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
  seededResidue(randomCourtyardFixtures, COURTYARD_DEFECTS, 1, 'Court14', 250, [1]),
  seededResidue(randomCourtyardFixtures, COURTYARD_DEFECTS, 6, 'Court23', 250, [1]),
  seededResidue(randomCourtyardFixtures, COURTYARD_DEFECTS, 1, 'Court25', 250, [1]),
  seededResidue(randomUFixtures, U_DEFECTS, 6, 'U8', 300, [0]),
  seededResidue(randomSplitCourtyardFixtures, SPLIT_COURTYARD_DEFECTS, 2, 'SplitCourt10', 250, [1]),
  residueGolden(namedCase(nudgeFixtures(), 'ApexEdge5'), [0], NUDGE_DEFECTS, 'ApexEdge5'),
  residueGolden(namedCase(pitchEndFixtures(), 'G5.86h250'), [0], PITCH_END_DEFECTS, 'G5.86h250'),
  rosterPitchResidue('Courtyard@22.5/45s', 'CourtyardAt22.5-45s'),
  rosterPitchResidue('BridgeOverBlock@45', 'BridgeOverBlockAt45'),
  seededResidue(randomCourtyardFixtures, COURTYARD_DEFECTS, 11, 'Court35', 250, [1]),
  seededResidue(randomSplitCourtyardFixtures, SPLIT_COURTYARD_DEFECTS, 7, 'SplitCourt9', 250, [1]),
];

/**
 * Journal decision 129: every named fixture, the roster, the Ring-conflict pairs, the four Port fixtures and the
 * courtyard first, then every enrolled robustness fixture that builds, each at the storey heights its tests read, then
 * the rule oracles (decisions 156, F3, 161, findings 2 and 3, and 164, findings 1 and 2) and residue classes (decision
 * 156, F4).
 */
export const GOLDEN_FIXTURES: readonly GoldenFixture[] = [
  ...EXPORTED_FIXTURES.map(fixture => cleanGolden(fixture, rosterGenus(fixture.name))),
  ...[300, 250].map(h => cleanGolden(named(flushOverReflexFixture(h), `FlushOverReflex${h}`), [0])),
  ...PINCH_SEEDS.flatMap(([s, k]) => [300, 250].map(h => cleanGolden(named(seededFixture(s, k, h), `Seed${s}Fuzz${k}h${h}`), [0]))),
  ...[300, 250].map(h => cleanGolden(named(seededFixture(CAP_CHAIN_SEED[0], CAP_CHAIN_SEED[1], h), `Seed${CAP_CHAIN_SEED[0]}Fuzz${CAP_CHAIN_SEED[1]}h${h}`), [0])),
  cleanGolden(UPPER_U_EDGE_CONTACT, [0]),
  cleanGolden(FULL_WINGS_PROBE, [1]),
  residueOfPin(CUT_OVERSHOOT_PROBE, [1], CUT_OVERSHOOT_DEFECTS),
  ...F2_COURTYARDS.map(f => cleanGolden(named(f, f.name.replace(/^s(\d)h(\d+)\/(.*)$/, (_, s: string, h: string, n: string) => seededName(n, s, h))), [1])),
  ...(['Aligned', 'Offset'] as const).map(kind => gapFixture(kind, 1)).map(f => residueGolden(f, [0, 0], GAP_DEFECTS, f.name)),
  ...RULE_ORACLES,
  ...RESIDUE_CLASSES,
];

/**
 * A golden fixture's class where it measures a defect. A clean golden that measures one is enrolled by no pin, so the
 * writer refuses to write it: an unattributed defect never reaches the oracle.
 */
function residueClassOf(g: GoldenFixture, outcome: PinOutcome): ResidueClass {
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
    const f = g.fixture, fixture = f.name, expectedGenus = [...g.expectedGenus], located = !g.clean && g.located;
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
