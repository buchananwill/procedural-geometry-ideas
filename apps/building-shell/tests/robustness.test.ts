// Journal decisions 101, 108 and 110: step 4 must build on any valid union. Every case here is built and checked
// against spec decision 32's invariants and the net's own (`invariantViolations`):
// - the WP3 correctness reviewer's pitch sweep (F36, F37), at 300 and 250 cm storeys;
// - decision 108's grid of pitch by storey height;
// - random Ring fixtures, seeds 1 to 4 at both storey heights (C4);
// - random courtyards from the full Ring family, and the same layouts with one wing removed (U shapes), seeds 1 and 2
//   at both storey heights (journal decisions 115, 132 and 135, F50), each measured defect enrolled with exactly its
//   signature;
// - journal decision 122's δ-nudge sweeps, each measured defect enrolled the same way;
// - the named regression fixtures C1 and C2, decision 122's and decision 135's reproducers, and decision 140's;
// - opt-in: with `SHELL_FUZZ_SEEDS` set (for example `5-12`), a larger seeded fuzz of `SHELL_FUZZ_COUNT` Ring fixtures
//   per seed at the storey heights `SHELL_FUZZ_HEIGHTS` (default `300,250`); with `SHELL_COURT_SEEDS` set, the
//   courtyard and U generators the same way, 40 per seed.
// No case is skipped and no sweep is thinned.
import {describe, expect, it} from 'vitest';
import {cornerBisector} from '../src/cells.ts';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {errorMessage} from '../src/errors.ts';
import {SHELL_FIXTURES, STOREY_HEIGHT_CM, ShellFixture} from '../src/fixture.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import type {Vec3} from '../src/tags.ts';
import {dot3} from '../src/vec3.ts';
import {
  CAP_CHAIN_SEED, PINCH_SEEDS, REVIEWER_STOREY_HEIGHT_CM, flushOverReflexFixture, gridFixtures, nudgeFixtures, randomCourtyardFixtures,
  F2_COURTYARDS, UPPER_U_EDGE_CONTACT, gapFixture, pitchEndFixtures, randomFixtures, randomSplitCourtyardFixtures, randomSplitCourtyards, randomUFixtures, rosterPitchCases, seededFixture, sweepFixture,
  sweepFixtures,
} from './robustness-fixtures.ts';
import type {CourtName, GridName, NudgeName, RosterPitchName, SplitCourtName, UName} from './robustness-fixtures.ts';
import {planStorey} from '../src/storey.ts';
import {CausedPinTable, PinTable, causeOf, pinnedOutcome} from './pin-table.ts';
import {rosterGenus} from './roster-genus.ts';
import {FixtureRing, ring} from '../src/fixture.ts';
import {ShellExpectation, dist, invariantViolations, roofUndersideLines} from './shell-invariants.ts';

/**
 * Every sweep, grid and random case as measured: genus 0 and no Cheek face (a box with a storey on its wall, or
 * rectangles overlapping at a corner, never close a tunnel). Fuzz46, whose 559 cm Hip passes through one mesh vertex
 * 2.47e-4 cm off its chord, is held by the loop checks like every other case, with no pin of its own.
 */
const EXPECTED: ShellExpectation = {genus: 0, cheeks: 0};

/** The reviewer's storey height, so its measured cases reproduce, and the fixtures' (journal decision 102). */
const HEIGHTS = [REVIEWER_STOREY_HEIGHT_CM, STOREY_HEIGHT_CM];

/** Journal decision 110, C4: the random seeds gated on every run, 140 fixtures each (the reviewer's run). */
const SEEDS = [1, 2, 3, 4];
const PER_SEED = 140;

const holds = async (f: ShellFixture): Promise<ShellBuild> => {
  const b = await buildShellDetailed(f);
  expect(invariantViolations(b, EXPECTED)).toEqual([]);
  return b;
};

describe.each(HEIGHTS)('the pitch sweep (journal decision 101, F36 and F37) at %i cm storeys: 20 to 70 degrees in 0.173 degree steps', h => {
  const cases = sweepFixtures(h);

  it('has all 580 of the reviewer\'s cases', () => {
    expect(cases).toHaveLength(580);
  });

  it.each(cases.map(f => [f.name, f] as const))('%s builds and keeps every invariant', async (_, f) => {
    await holds(f);
  });
});

describe('the pitch by storey-height grid (journal decision 108): 250 to 300 cm by 20 to 70 degrees', () => {
  const cases = gridFixtures();

  it('has 612 cases', () => {
    expect(cases).toHaveLength(612);
  });

  it.each(cases.map(f => [f.name, f] as const))('%s builds and keeps every invariant', async (_, f) => {
    await holds(f);
  });
});

describe.each(SEEDS.flatMap(s => HEIGHTS.map(h => [s, h] as const)))('the random Ring fixtures (journal decision 110, C4): seed %i at %i cm storeys', (seed, h) => {
  it.each(randomFixtures(seed, PER_SEED, h).map(f => [f.name, f] as const))('%s builds and keeps every invariant', async (_, f) => {
    await holds(f);
  });
});

// ---- Random courtyards (journal decision 115) -----------------------------------------------------------------------

/** The courtyard seeds gated on every run, 40 fixtures each, at both storey heights. */
const COURTYARD_SEEDS = [1, 2];
const PER_COURTYARD_SEED = 40;

/** A courtyard runs from the ground to the sky: genus 1. */
const COURTYARD_EXPECTED: ShellExpectation = {genus: 1, cheeks: 0};

/** A generated case's key: its seed, storey height and name, of the name type `N` its generator emits (decision 155, B4). */
type SeededKey<N extends string> = `s${number}h${number}/${N}`;

/**
 * Measured at WP3.8.2 over seeds 1 to 14 at 250, 263 and 300 cm (journal decision 156, F7), findings, not waivers:
 * every random courtyard that breaks an invariant, with its class and exactly its violations (or `throws:` and the
 * error a build raised, naming where). A case not listed keeps every invariant. A cure breaks the suite as surely as a
 * new defect, and either is re-measured, never softened. The default run builds every case listed here (decision 156,
 * F6) as well as seeds 1 and 2 at 300 and 250 whole; the opt-in run (`SHELL_COURT_SEEDS`) asserts against the same
 * table. Every count-only signature names its place (decision 150, F4), so a defect that moves fails its pin.
 * Seeds 1 to 14 fail 63 of 1680 (3.75%); seeds 7 to 14 alone, 45 of 960.
 * WP3.6's table (decision 135, F2) held two `cleanMesh` refusals that floor-standing holed hip solids caused, s1h300/
 * Court5 (a stuck cap) and s1h250/Court16 (a pinching collapse); clustering (decision 122, F-C) cures both, and they are
 * kept as named regressions below, since the generator now draws other layouts under those names.
 */
const COURTYARD_DEFECTS: CausedPinTable<SeededKey<CourtName>> = {
  's1h250/Court14': {cause: "decision 132's cut rule exposes algorithm B's Cheek class (a regression)", outcome: ["cheeks 1, expected 0, at (150, 400, 250)"]},
  's1h250/Court25': {cause: "partial face-to-face contact of two storeys on one plane (Court25 class)", outcome: ["throws: cell 729: side 24-278 (100, 500, 500) to (100, 500, 550) reads ShellEdge 63, its NetEdge -1"]},
  's1h263/Court14': {cause: "decision 132's cut rule exposes algorithm B's Cheek class (a regression)", outcome: ["cheeks 1, expected 0, at (150, 400, 263)"]},
  's1h263/Court25': {cause: "partial face-to-face contact of two storeys on one plane (Court25 class)", outcome: ["throws: cell 871: side 24-318 (100, 500, 526) to (100, 500, 550) reads ShellEdge 63, its NetEdge -1"]},
  's1h300/Court14': {cause: "decision 132's cut rule exposes algorithm B's Cheek class (a regression)", outcome: ["cheeks 1, expected 0, at (150, 400, 300)"]},
  's1h300/Court25': {cause: "partial face-to-face contact of two storeys on one plane (Court25 class)", outcome: ["throws: cell 847: side 24-292 (100, 500, 600) to (100, 500, 650) reads ShellEdge 63, its NetEdge -1"]},
  's2h250/Court15': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (275, 100, 562.546875)","3 Unclassified Edges: (250, 100, 557.7353515625) to (275, 100, 572.1689453125); (250, 100, 557.7353515625) to (300, 100, 557.7353515625); (275, 100, 572.1689453125) to (300, 100, 557.7353515625)"]},
  's2h263/Court15': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (275, 100, 588.546875)","3 Unclassified Edges: (250, 100, 583.7353515625) to (275, 100, 598.1689453125); (250, 100, 583.7353515625) to (300, 100, 583.7353515625); (275, 100, 598.1689453125) to (300, 100, 583.7353515625)"]},
  's2h300/Court15': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (275, 100, 662.546875)","3 Unclassified Edges: (250, 100, 657.7353515625) to (275, 100, 672.1689453125); (250, 100, 657.7353515625) to (300, 100, 657.7353515625); (275, 100, 672.1689453125) to (300, 100, 657.7353515625)"]},
  's4h250/Court7': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (606.4326171875, 300, 263.3369140625)","3 Unclassified Edges: (550, 300, 250) to (619.298828125, 300, 290.009765625); (550, 300, 250) to (650, 300, 250); (619.298828125, 300, 290.009765625) to (650, 300, 250)"]},
  's4h263/Court7': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (606.4326171875, 300, 276.3369140625)","3 Unclassified Edges: (550, 300, 263) to (619.298828125, 300, 303.009765625); (550, 300, 263) to (650, 300, 263); (619.298828125, 300, 303.009765625) to (650, 300, 263)"]},
  's4h300/Court7': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (606.4326171875, 300, 313.3369140625)","3 Unclassified Edges: (550, 300, 300) to (619.298828125, 300, 340.009765625); (550, 300, 300) to (650, 300, 300); (619.298828125, 300, 340.009765625) to (650, 300, 300)"]},
  's5h250/Court34': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 4, expected 0, at (250, 195.3779296875, 504.6220703125); (250, 500, 500); (250, 500, 510.6455078125); (250, 86.8349609375, 613.1650390625)"]},
  's5h263/Court34': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 2, expected 0, at (250, 500, 526); (250, 86.8349609375, 639.1650390625)"]},
  's5h300/Court34': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 2, expected 0, at (250, 500, 600); (250, 86.8349609375, 713.1650390625)"]},
  's6h250/Court23': {cause: "decision 132's cut rule exposes algorithm B's Cheek class (a regression)", outcome: ["cheeks 2, expected 0, at (100, 300, 380.322265625); (350, 300, 250)"]},
  's6h263/Court23': {cause: "decision 132's cut rule exposes algorithm B's Cheek class (a regression)", outcome: ["cheeks 2, expected 0, at (100, 300, 393.322265625); (350, 300, 263)"]},
  's6h300/Court23': {cause: "decision 132's cut rule exposes algorithm B's Cheek class (a regression)", outcome: ["cheeks 2, expected 0, at (100, 300, 430.322265625); (350, 300, 300)"]},
  's7h250/Court14': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (291.83203125, 250, 500)"]},
  's7h250/Court22': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (850, 500, 275.1181640625)","3 Unclassified Edges: (750, 500, 250) to (850, 500, 325.35546875); (750, 500, 250) to (950, 500, 250); (850, 500, 325.35546875) to (950, 500, 250)"]},
  's7h250/Court38': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (665.8642578125, 100, 578.5283203125)","3 Unclassified Edges: (657.822265625, 100, 575.35546875) to (665.1259765625, 100, 584.8740234375); (657.822265625, 100, 575.35546875) to (674.64453125, 100, 575.35546875); (665.1259765625, 100, 584.8740234375) to (674.64453125, 100, 575.35546875)"]},
  's7h263/Court14': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (301.806640625, 250, 526)"]},
  's7h263/Court22': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (850, 500, 288.1181640625)","3 Unclassified Edges: (750, 500, 263) to (850, 500, 338.35546875); (750, 500, 263) to (950, 500, 263); (850, 500, 338.35546875) to (950, 500, 263)"]},
  's7h263/Court38': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (665.8642578125, 100, 604.5283203125)","3 Unclassified Edges: (657.822265625, 100, 601.35546875) to (665.1259765625, 100, 610.8740234375); (657.822265625, 100, 601.35546875) to (674.64453125, 100, 601.35546875); (665.1259765625, 100, 610.8740234375) to (674.64453125, 100, 601.35546875)"]},
  's7h300/Court14': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (330.1982421875, 250, 600)"]},
  's7h300/Court22': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (850, 500, 325.1181640625)","3 Unclassified Edges: (750, 500, 300) to (850, 500, 375.35546875); (750, 500, 300) to (950, 500, 300); (850, 500, 375.35546875) to (950, 500, 300)"]},
  's7h300/Court38': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (665.8642578125, 100, 678.5283203125)","3 Unclassified Edges: (657.822265625, 100, 675.35546875) to (665.1259765625, 100, 684.8740234375); (657.822265625, 100, 675.35546875) to (674.64453125, 100, 675.35546875); (665.1259765625, 100, 684.8740234375) to (674.64453125, 100, 675.35546875)"]},
  's8h250/Court4': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (497.6572265625, 300, 264.32421875)","3 Unclassified Edges: (450, 300, 250) to (492.97265625, 300, 292.97265625); (450, 300, 250) to (550, 300, 250); (492.97265625, 300, 292.97265625) to (550, 300, 250)"]},
  's8h263/Court4': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (497.6572265625, 300, 277.32421875)","3 Unclassified Edges: (450, 300, 263) to (492.97265625, 300, 305.97265625); (450, 300, 263) to (550, 300, 263); (492.97265625, 300, 305.97265625) to (550, 300, 263)"]},
  's8h300/Court4': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (497.6572265625, 300, 314.32421875)","3 Unclassified Edges: (450, 300, 300) to (492.97265625, 300, 342.97265625); (450, 300, 300) to (550, 300, 300); (492.97265625, 300, 342.97265625) to (550, 300, 300)"]},
  's9h250/Court0': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (250, 250, 695.4833984375)"]},
  's9h250/Court27': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (175, 300, 325)"]},
  's9h263/Court0': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (250, 250, 721.4833984375)"]},
  's9h263/Court27': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (175, 300, 338)"]},
  's9h300/Court0': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (250, 250, 795.4833984375)"]},
  's9h300/Court27': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (175, 300, 375)"]},
  's10h250/Court15': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (595.5458984375, 100, 265.916015625)","3 Unclassified Edges: (550, 100, 250) to (586.6376953125, 100, 297.7470703125); (550, 100, 250) to (650, 100, 250); (586.6376953125, 100, 297.7470703125) to (650, 100, 250)"]},
  's10h250/Court18': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (450, 108.451171875, 331.7236328125)"]},
  's10h250/Court35': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (114.94140625, 600, 268.2490234375)","3 Unclassified Edges: (100, 600, 278.8671875) to (150, 600, 250); (94.82421875, 600, 275.87890625) to (100, 600, 278.8671875); (94.82421875, 600, 275.87890625) to (150, 600, 250)"]},
  's10h263/Court15': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (595.5458984375, 100, 278.916015625)","3 Unclassified Edges: (550, 100, 263) to (586.6376953125, 100, 310.7470703125); (550, 100, 263) to (650, 100, 263); (586.6376953125, 100, 310.7470703125) to (650, 100, 263)"]},
  's10h263/Court18': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (450, 108.451171875, 344.7236328125)"]},
  's10h263/Court35': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (115.0185546875, 600, 281.29296875)","3 Unclassified Edges: (100, 600, 291.8671875) to (150, 600, 263); (95.0546875, 600, 289.01171875) to (100, 600, 291.8671875); (95.0546875, 600, 289.01171875) to (150, 600, 263)"]},
  's10h300/Court15': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (595.5458984375, 100, 315.916015625)","3 Unclassified Edges: (550, 100, 300) to (586.6376953125, 100, 347.7470703125); (550, 100, 300) to (650, 100, 300); (586.6376953125, 100, 347.7470703125) to (650, 100, 300)"]},
  's10h300/Court18': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (450, 108.451171875, 381.7236328125)"]},
  's10h300/Court35': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (115.2041015625, 600, 318.400390625)","3 Unclassified Edges: (100, 600, 328.8671875) to (150, 600, 300); (95.611328125, 600, 326.3330078125) to (100, 600, 328.8671875); (95.611328125, 600, 326.3330078125) to (150, 600, 300)"]},
  's11h250/Court35': {cause: "a Cell corner in no triangle of its face's fan", outcome: ["throws: vertex 219 at (200, 550, 300): Cell 563 lies in no triangle of its face's fan"]},
  's11h263/Court35': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (197.8056640625, 550, 281.861328125)","3 Unclassified Edges: (150, 550, 263) to (193.4169921875, 550, 319.5830078125); (150, 550, 263) to (250, 550, 263); (193.4169921875, 550, 319.5830078125) to (250, 550, 263)"]},
  's11h300/Court35': {cause: "a Cell corner in no triangle of its face's fan", outcome: ["throws: vertex 227 at (200, 550, 350): Cell 667 lies in no triangle of its face's fan"]},
  's12h250/Court1': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (241.45703125, 300, 391.45703125)"]},
  's12h250/Court2': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (200, 150, 537.677734375)"]},
  's12h263/Court1': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (241.45703125, 300, 404.45703125)"]},
  's12h263/Court2': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (200, 150, 563.677734375)"]},
  's12h300/Court1': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (241.45703125, 300, 441.45703125)"]},
  's12h300/Court2': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (200, 150, 637.677734375)"]},
  's13h250/Court9': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 2, expected 0, at (146.05078125, 250, 310.0146484375); (400, 250, 250)"]},
  's13h250/Court13': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (524.93359375, 200, 589.56640625)","3 Unclassified Edges: (516.4521484375, 200, 586.6025390625) to (523.275390625, 200, 595.494140625); (516.4521484375, 200, 586.6025390625) to (535.07421875, 200, 586.6025390625); (523.275390625, 200, 595.494140625) to (535.07421875, 200, 586.6025390625)"]},
  's13h250/Court21': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (450, 250, 500)"]},
  's13h263/Court9': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 2, expected 0, at (146.05078125, 250, 323.0146484375); (400, 250, 263)"]},
  's13h263/Court13': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (524.93359375, 200, 615.56640625)","3 Unclassified Edges: (516.4521484375, 200, 612.6025390625) to (523.275390625, 200, 621.494140625); (516.4521484375, 200, 612.6025390625) to (535.07421875, 200, 612.6025390625); (523.275390625, 200, 621.494140625) to (535.07421875, 200, 612.6025390625)"]},
  's13h263/Court21': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (450, 250, 526)"]},
  's13h300/Court9': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 2, expected 0, at (146.05078125, 250, 360.0146484375); (400, 250, 300)"]},
  's13h300/Court13': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (524.93359375, 200, 689.56640625)","3 Unclassified Edges: (516.4521484375, 200, 686.6025390625) to (523.275390625, 200, 695.494140625); (516.4521484375, 200, 686.6025390625) to (535.07421875, 200, 686.6025390625); (523.275390625, 200, 695.494140625) to (535.07421875, 200, 686.6025390625)"]},
  's13h300/Court21': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (450, 250, 600)"]},
};

/** Measured at WP3.8.2 over seeds 1 to 14 at 250, 263 and 300 cm: every U-shape case that breaks an invariant. */
const U_DEFECTS: CausedPinTable<SeededKey<UName>> = {
  's6h263/U8': {cause: "edge contact between opposite coplanar faces (U8 class)", outcome: ["throws: vertex 286 at (104.8515625, 550, 650): two Cells run the same way along one NetEdge"]},
  's6h300/U8': {cause: "edge contact between opposite coplanar faces (U8 class)", outcome: ["throws: vertex 285 at (123.267578125, 550, 700): two Cells run the same way along one NetEdge"]},
};

/** A build's measured outcome: its invariant violations, or the error it raised. */
async function outcome(f: ShellFixture, want: ShellExpectation): Promise<string[]> {
  try {
    return invariantViolations(await buildShellDetailed(f), want);
  } catch (e) {
    return [`throws: ${errorMessage(e)}`];
  }
}

/**
 * A build's measured outcome with its Roof-Underside edges named (journal decision 156, F8): BridgeOverBlock's pins,
 * where its block's roof meets the bridge's floor, carry those edges' ends.
 */
async function locatedOutcome(f: ShellFixture, want: ShellExpectation): Promise<string[]> {
  try {
    const b = await buildShellDetailed(f);
    return [...invariantViolations(b, want), ...roofUndersideLines(b)];
  } catch (e) {
    return [`throws: ${errorMessage(e)}`];
  }
}

/** A courtyard's measured outcome. */
const courtyardOutcome = (f: ShellFixture): Promise<string[]> => outcome(f, COURTYARD_EXPECTED);

describe.each(COURTYARD_SEEDS.flatMap(s => HEIGHTS.map(h => [s, h] as const)))('random courtyards (journal decisions 115, 132 and 135): seed %i at %i cm storeys', (seed, h) => {
  it.each(randomCourtyardFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await courtyardOutcome(f)).toEqual(pinnedOutcome(COURTYARD_DEFECTS, `s${seed}h${h}/${name}`));
  });
});

/**
 * Measured at WP3.8.2 over seeds 1 to 14 at 250, 263 and 300 cm: every split-band courtyard (journal decisions 150,
 * 151 and 153) that breaks an invariant, in the same form, 6 of 1680. Split mode makes the free cut, collinear with no
 * wall, the shortest, so every one of these reads the free branch and takes the island's steepest wall.
 */
const SPLIT_COURTYARD_DEFECTS: CausedPinTable<SeededKey<SplitCourtName>> = {
  's2h250/SplitCourt10': {cause: "cleanMesh stuck cap", outcome: ["throws: cleanMesh: cap 38 (31-36, apex 34 at (712.802734375, 231.9697265625, 297.3251953125)) can neither flip nor merge its apex into its long edge"]},
  's2h263/SplitCourt10': {cause: "cleanMesh stuck cap", outcome: ["throws: cleanMesh: cap 38 (31-36, apex 34 at (712.802734375, 231.9697265625, 310.3251953125)) can neither flip nor merge its apex into its long edge"]},
  's2h300/SplitCourt10': {cause: "cleanMesh stuck cap", outcome: ["throws: cleanMesh: cap 38 (31-37, apex 34 at (712.802734375, 231.9697265625, 347.3251953125)) can neither flip nor merge its apex into its long edge"]},
  's5h250/SplitCourt29': {cause: "partial face-to-face contact of two storeys on one plane (Court25 class)", outcome: ["throws: cell 790: side 334-11 (750, 450, 300) to (750, 450, 250) reads ShellEdge 59, its NetEdge -1"]},
  's7h250/SplitCourt9': {cause: "a Gable-Wall edge, Unclassified (SplitCourt9 class)", outcome: ["2 Unclassified Edges: (191.8310546875, 400, 500) to (200, 400, 500); (200, 400, 500) to (200, 400, 510.6455078125)"]},
  's13h250/SplitCourt30': {cause: "cleanMesh stuck cap", outcome: ["throws: cleanMesh: cap 131 (63-72, apex 64 at (500.4453125, 736.64453125, 510.064453125)) can neither flip nor merge its apex into its long edge"]},
};

describe("the pin tables' causes (journal decisions 150, F4, and 156, F7)", () => {
  it.each([['courtyards', COURTYARD_DEFECTS], ['U shapes', U_DEFECTS], ['split bands', SPLIT_COURTYARD_DEFECTS]] as const)('every %s residue carries the class its signature reads', (_, pins) => {
    for (const [key, pin] of Object.entries(pins)) expect(pin && causeOf(key, pin.outcome), key).toBe(pin?.cause);
  });
});

describe.each(COURTYARD_SEEDS.flatMap(s => HEIGHTS.map(h => [s, h] as const)))('random split-band courtyards (journal decisions 150 and 151): seed %i at %i cm storeys', (seed, h) => {
  const draws = randomSplitCourtyards(seed, PER_COURTYARD_SEED, h);

  // The gate on the free branch: removing it moves every cut off its split line.
  it.each(draws.map(d => [d.fixture.name, d] as const))('%s is cut along its split, the free cut', (_, {fixture, split}) => {
    const cuts = planStorey(fixture, 0).building.walls.filter(w => w.form === 'cut');
    expect(cuts).toHaveLength(2);
    for (const w of cuts) expect([w.a, w.b].map(p => (split.axis === 'x' ? p.x : p.y))).toEqual([split.at, split.at]);
  });

  it.each(draws.map(d => [d.fixture.name, d.fixture] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await courtyardOutcome(f)).toEqual(pinnedOutcome(SPLIT_COURTYARD_DEFECTS, `s${seed}h${h}/${name}`));
  });
});

describe.each(COURTYARD_SEEDS.flatMap(s => HEIGHTS.map(h => [s, h] as const)))('random U shapes (F50): seed %i at %i cm storeys', (seed, h) => {
  it.each(randomUFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await outcome(f, EXPECTED)).toEqual(pinnedOutcome(U_DEFECTS, `s${seed}h${h}/${name}`));
  });
});

// ---- Journal decision 122's δ-nudge sweeps ------------------------------------------------------------------------

/**
 * Measured at WP3.7: every nudge that breaks an invariant, with exactly its violations. All are decision 122's G5:
 * an apex or ridge 5/1024 to 12/1024 cm through the floor above, under its eave, leaves roof features 0.004 to 0.012
 * cm across, above the cleaning's tolerance and at the shell's, whose Edges read Indeterminate, so Unclassified. The
 * nudges of 0.5/1024 to 4/1024 cm, which C8's link check and the 0.005 cm move limit refused (F-C, G2), all build.
 */
const NUDGE_DEFECTS: PinTable<NudgeName> = {
  'ApexEdge5': ["1 Unclassified Edges: (0, 500, 250) to (250, 250, 500.0048828125)","interior NetEdge 469 borders cells 214","interior NetEdge 537 borders cells 255","NetEdge 574 on ShellEdge 20 borders faces 8, expected 15,8","NetEdge 575 on ShellEdge 14 borders faces 8, expected 5,8","NetEdge 576 on ShellEdge 18 borders faces 9, expected 7,9","NetEdge 577 on ShellEdge 23 borders faces 9, expected 15,9","interior NetEdge 921 borders cells 450","interior NetEdge 924 borders cells 451"],
  'ApexEdge8': ["4 Unclassified Edges: (0, 500, 250) to (250, 250, 500.0078125); (250, 0, 500) to (250, 249.9921875, 500); (250, 250, 500.0078125) to (250.00390625, 249.99609375, 500.00390625); (250, 250, 500.0078125) to (250.00390625, 250.00390625, 500.00390625)"],
  'ApexEdge12': ["4 Unclassified Edges: (0, 500, 250) to (250, 250, 500.01171875); (250, 0, 500) to (250, 249.98828125, 500); (250, 250, 500.01171875) to (250.005859375, 249.994140625, 500.005859375); (250, 250, 500.01171875) to (250.005859375, 250.005859375, 500.005859375)"],
  'OverhangApexOnEave5': ["1 Unclassified Edges: (0, 500, 250) to (250, 250, 500.0048828125)","interior NetEdge 469 borders cells 214","interior NetEdge 537 borders cells 255","NetEdge 574 on ShellEdge 20 borders faces 8, expected 14,8","NetEdge 575 on ShellEdge 14 borders faces 8, expected 5,8","NetEdge 686 on ShellEdge 18 borders faces 10, expected 10,7","NetEdge 687 on ShellEdge 23 borders faces 10, expected 10,14","interior NetEdge 1016 borders cells 494","interior NetEdge 1019 borders cells 495"],
  'OverhangApexOnEave8': ["5 Unclassified Edges: (0, 500, 250) to (250, 250, 500.0078125); (250, 0, 500) to (250, 249.9921875, 500); (250, 250, 500.0078125) to (250.00390625, 249.99609375, 500.00390625); (250, 250, 500.0078125) to (250.00390625, 250.00390625, 500.00390625); (250, 250.0078125, 500) to (250, 500, 500)"],
  'OverhangApexOnEave12': ["4 Unclassified Edges: (0, 500, 250) to (250, 250, 500.01171875); (250, 250, 500.01171875) to (250.005859375, 249.994140625, 500.005859375); (250, 250, 500.01171875) to (250.005859375, 250.005859375, 500.005859375); (250, 250.01171875, 500) to (250, 500, 500)"],
  'RidgeEdge5': ["2 Unclassified Edges: (450, 250, 500.0048828125) to (450.0048828125, 250, 500); (450, 250, 500.0048828125) to (700, 500, 250)"],
  'RidgeEdge8': ["3 Unclassified Edges: (100, 250, 500) to (249.9921875, 250, 500); (450, 250, 500.0078125) to (450.00390625, 249.99609375, 500.00390625); (450, 250, 500.0078125) to (700, 500, 250)"],
  'RidgeEdge12': ["3 Unclassified Edges: (100, 250, 500) to (249.98828125, 250, 500); (450, 250, 500.01171875) to (450.005859375, 249.994140625, 500.005859375); (450, 250, 500.01171875) to (700, 500, 250)"],
};

describe("journal decision 122's δ-nudges at 250 cm storeys: an apex or ridge a hair under, at or over the floor above", () => {
  it.each(nudgeFixtures().map(f => [f.name, f] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await outcome(f, EXPECTED)).toEqual(NUDGE_DEFECTS[name] ?? []);
  });
});

// ---- The named regression fixtures (journal decision 110) ---------------------------------------------------------

const near = (p: Vec3, q: Vec3): boolean => dist(p, q) <= SHELL_TOLERANCE_CM;

/**
 * C1's pinch at `p`: one ShellVertex whose faces are its sheets' faces, sheet by sheet, the sheets in order of lowest
 * face id. `below` says which faces form the sheet under the overhang (the lower walls and the upper Underside).
 */
function expectPinch(b: ShellBuild, p: Vec3, below: (f: number) => boolean): void {
  const v = b.shell.vertices.filter(x => near(x.p, p));
  expect(v, `one vertex at (${p})`).toHaveLength(1);
  const {faces, cells} = v[0];
  const sheets = [faces.filter(below), faces.filter(f => !below(f))];
  expect(sheets.map(s => s.length > 0)).toEqual([true, true]);
  const [first, second] = [...sheets].sort((a, c) => Math.min(...a) - Math.min(...c));
  expect(faces).toEqual([...first, ...second]);
  // Cells follow the same sheets, in the same order.
  const cellFaces = cells.map(c => b.shell.cells[c].face);
  const firstCells = cellFaces.findIndex(f => !first.includes(f));
  expect(cellFaces.slice(0, firstCells).every(f => first.includes(f))).toBe(true);
  expect(cellFaces.slice(firstCells).every(f => second.includes(f))).toBe(true);
}

describe.each(HEIGHTS)('C1: an upper wall flush over a lower reflex corner (journal decision 110) at %i cm storeys', h => {
  it('FlushOverReflex: one ShellVertex carries both sheets at the corner, and the overhang foot is two coincident ShellEdges', async () => {
    const b = await holds(flushOverReflexFixture(h));
    const tag = (f: number) => b.shell.faces[f].tag;
    const P: Vec3 = [300, 300, h], Q: Vec3 = [450, 300, h];
    expectPinch(b, P, f => (tag(f).kind === 'Wall' && tag(f).storey === 0) || tag(f).kind === 'Underside');
    const foot = b.shell.edges.filter(e => (near(e.a, P) && near(e.b, Q)) || (near(e.a, Q) && near(e.b, P)));
    expect(foot.map(e => e.kind).sort()).toEqual(['RingJunction', 'SoffitJunction']);
    expect(new Set(foot.map(e => [...e.v].sort().join(','))).size).toBe(1);
  });

  it.each(PINCH_SEEDS.map(([s, k]) => [`Seed${s}Fuzz${k}`, s, k] as const))('%s builds and keeps every invariant', async (_, s, k) => {
    await holds(seededFixture(s, k, h));
  });
});

describe.each(HEIGHTS)('C2: two caps sharing a long edge (journal decision 110) at %i cm storeys', h => {
  it(`Seed${CAP_CHAIN_SEED[0]}Fuzz${CAP_CHAIN_SEED[1]} builds and keeps every invariant, its cap chain merged`, async () => {
    const b = await holds(seededFixture(CAP_CHAIN_SEED[0], CAP_CHAIN_SEED[1], h));
    expect(b.union.clean.merged).toBeGreaterThan(0);
  });
});

describe.each(HEIGHTS)('C2 and F-D at %i cm storeys: the cap chain moves no vertex further than the bound', h => {
  it(`Seed${CAP_CHAIN_SEED[0]}Fuzz${CAP_CHAIN_SEED[1]} moves no vertex further than SHELL_TOLERANCE_CM`, async () => {
    const b = await holds(seededFixture(CAP_CHAIN_SEED[0], CAP_CHAIN_SEED[1], h));
    expect(b.union.clean.maxMoveCm).toBeLessThanOrEqual(SHELL_TOLERANCE_CM);
  });
});

// ---- Journal decision 143: the wire format's pitch ends -------------------------------------------------------------

/**
 * Measured at WP3.7 for the wire format's proposed pitch bounds, 5 to 75 degrees: every failing case found, with
 * exactly its violations. Below 7 degrees the 0.173 degree sweep and finer scans find narrow pockets, all but one a
 * Cell side that lies on no ShellEdge, lattice line or split line; from 6.91 degrees up, every case scanned is green.
 */
const PITCH_END_DEFECTS: PinTable<GridName> = {
  'G5.86h250': ["throws: cell 276: side 107-109 (450, 150, 265.3955078125) to (499.9970703125, 100, 260.263671875) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.86h250u': ["throws: cell 201: side 109-111 (50, 50, 255.1318359375) to (100, 99.9970703125, 260.263671875) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.86h300': ["throws: cell 316: side 111-113 (450, 150, 315.3955078125) to (499.9970703125, 100, 310.263671875) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.86h300u': ["throws: cell 241: side 113-115 (50, 50, 305.1318359375) to (100, 99.9970703125, 310.263671875) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.87h250': ["throws: cell 276: side 107-109 (450, 150, 265.421875) to (499.9970703125, 100, 260.28125) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.87h250u': ["throws: cell 201: side 109-111 (50, 50, 255.140625) to (100, 99.9970703125, 260.28125) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.87h300': ["throws: cell 316: side 111-113 (450, 150, 315.421875) to (499.9970703125, 100, 310.28125) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.87h300u': ["throws: cell 241: side 113-115 (50, 50, 305.140625) to (100, 99.9970703125, 310.28125) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.865h250': ["throws: cell 276: side 107-109 (450, 150, 265.4091796875) to (499.9970703125, 100, 260.2724609375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.865h250u': ["throws: cell 201: side 109-111 (50, 50, 255.13671875) to (100, 99.9970703125, 260.2724609375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.865h300': ["throws: cell 316: side 111-113 (450, 150, 315.4091796875) to (499.9970703125, 100, 310.2724609375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G5.865h300u': ["throws: cell 241: side 113-115 (50, 50, 305.13671875) to (100, 99.9970703125, 310.2724609375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.02h250': ["throws: cell 276: side 107-109 (450, 150, 265.8193359375) to (499.9970703125, 100, 260.5458984375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.02h250u': ["throws: cell 201: side 109-111 (50, 50, 255.2734375) to (100, 99.9970703125, 260.5458984375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.02h300': ["throws: cell 316: side 111-113 (450, 150, 315.8193359375) to (499.9970703125, 100, 310.5458984375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.02h300u': ["throws: cell 241: side 113-115 (50, 50, 305.2734375) to (100, 99.9970703125, 310.5458984375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.9h250u': ["2 Unclassified Edges: (400, 200, 274.203125) to (400, 200, 500); (400, 200, 274.203125) to (600, 400, 250)"],
  'G6.015h250': ["throws: cell 276: side 107-109 (450, 150, 265.8056640625) to (499.9970703125, 100, 260.537109375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.15h250': ["throws: cell 276: side 107-109 (450, 150, 266.1630859375) to (499.9970703125, 100, 260.775390625) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.015h250u': ["throws: cell 201: side 109-111 (50, 50, 255.2685546875) to (100, 99.9970703125, 260.537109375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.15h250u': ["throws: cell 201: side 109-111 (50, 50, 255.3876953125) to (100, 99.9970703125, 260.775390625) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.015h300': ["throws: cell 316: side 111-113 (450, 150, 315.8056640625) to (499.9970703125, 100, 310.537109375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.015h300u': ["throws: cell 241: side 113-115 (50, 50, 305.2685546875) to (100, 99.9970703125, 310.537109375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.27h250': ["throws: cell 276: side 107-109 (450, 150, 266.4814453125) to (499.9970703125, 100, 260.9873046875) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.27h250u': ["throws: cell 201: side 109-111 (50, 50, 255.494140625) to (100, 99.9970703125, 260.9873046875) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.38h250': ["throws: cell 276: side 107-109 (450, 150, 266.7724609375) to (499.9970703125, 100, 261.181640625) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.38h250u': ["throws: cell 201: side 109-111 (50, 50, 255.5908203125) to (100, 99.9970703125, 261.181640625) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.48h250u': ["throws: cell 201: side 109-111 (50, 50, 255.6796875) to (100, 99.9970703125, 261.3583984375) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.57h250u': ["throws: cell 201: side 109-111 (50, 50, 255.7587890625) to (100, 99.9970703125, 261.517578125) is neither on a ShellEdge, a lattice line nor a split line"],
  'G6.66h250u': ["throws: cell 201: side 109-111 (50, 50, 255.8388671875) to (100, 99.9970703125, 261.6767578125) is neither on a ShellEdge, a lattice line nor a split line"],
};

describe("the wire format's pitch ends (journal decision 143): the sweep's box from 5 to 20 and from 70 to 75 degrees", () => {
  it.each(pitchEndFixtures().map(f => [f.name, f] as const))('%s keeps every invariant, or exactly its measured defect', async (name, f) => {
    expect(await outcome(f, EXPECTED)).toEqual(PITCH_END_DEFECTS[name] ?? []);
  });
});

// ---- Journal decision 122's reproducers, and decisions 135's and 140's ---------------------------------------------

describe("journal decision 122's fresh-seed reproducers, each cured", () => {
  it.each([[250], [263], [300]] as const)('G1: Seed5Fuzz46 at %i cm, its unfused pillow dropped as a zero-volume sheet', async h => {
    expect((await holds(seededFixture(5, 46, h))).union.clean.sheetTris).toBeGreaterThan(0);
  });

  it.each([[12, 17, 250], [8, 73, 300]] as const)('G1: Seed%iFuzz%i at %i cm, its prism top and gable bottom left unfused, dropped and stitched', async (s, k, h) => {
    expect((await holds(seededFixture(s, k, h))).union.clean.sheetTris).toBeGreaterThan(0);
  });

  it.each([[250], [263], [300]] as const)('F-C: Seed5Fuzz89 at %i cm, three vertices 1.2e-4 cm apart clustered, where the link check refused the collapse', async h => {
    expect((await holds(seededFixture(5, 89, h))).union.clean.merged).toBeGreaterThan(0);
  });

  it('G3: Seed11Fuzz10 at 300 cm, a lattice square holding a hole of its Roof, split into pieces of one lattice index', async () => {
    const b = await holds(seededFixture(11, 10, 300));
    const keys = b.shell.cells.map(c => `${c.face}|${c.lattice}`);
    expect(keys.length).toBeGreaterThan(new Set(keys).size);
  });

  it.each([[false], [true]] as const)('G4: P61.866 at 263 cm (upper storey %s), a rake vertex 0.0089 cm from a lattice crossing in plan, 0.019 in 3D', async upper => {
    await holds(sweepFixture(61.866, upper, 263));
  });
});

describe("journal decision 135, F2: floor-standing holed hip solids' two cleanMesh refusals, cured", () => {
  it.each(F2_COURTYARDS.map(f => [f.name, f] as const))('%s keeps every invariant', async (_, f) => {
    expect(await courtyardOutcome(f)).toEqual([]);
  });
});

/**
 * Journal decision 150, F6: the correctness reviewer's near-touching islands, `[0,0,500,400]` and a second island a gap
 * of k/1024 cm beyond x = 500, its corners aligned with the first's or offset to y 100 to 300. Each is two islands as
 * authored, genus 0 each. Measured at WP3.8:
 * - aligned, at gaps under `CLEAN_TOLERANCE_CM` (1 and 3), the cleaning clusters the facing corners and fuses the two
 *   into one component;
 * - offset, at those gaps, no corner meets a corner, so the two stay apart within the tolerance: loud, by the
 *   near-contact invariant, never fused;
 * - at 5/1024 and beyond, two components, clean.
 * Integer-quantum C++ corners cannot produce either, and the wire's 1/1024 snap makes them mis-authoring.
 */
const GAP_DEFECTS: PinTable<`Gap${'Aligned' | 'Offset'}${number}`> = {
  'GapAligned1': ["genus per component 0, expected 0,0: genus 0 at (0, 0, 0)"],
  'GapAligned3': ["genus per component 0, expected 0,0: genus 0 at (0, 0, 0)"],
  'GapOffset1': ["two components lie 9.766e-4 cm apart, within CLEAN_TOLERANCE_CM, at (500.0009765625, 100, 0) and (500, 100, 0)"],
  'GapOffset3': ["two components lie 2.930e-3 cm apart, within CLEAN_TOLERANCE_CM, at (500.0029296875, 100, 0) and (500, 100, 0)"],
};

describe('near-touching islands (journal decision 150, F6)', () => {
  const cases = [1, 3, 5, 8, 12].flatMap(k => (['Aligned', 'Offset'] as const).map(kind => [`Gap${kind}${k}` as const, kind, k] as const));
  it.each(cases)('%s keeps every invariant, or exactly its measured defect', async (name, kind, k) => {
    expect(await outcome(gapFixture(kind, k), {genus: [0, 0], cheeks: 0})).toEqual(GAP_DEFECTS[name] ?? []);
  });
});

describe('journal decision 140, F5: storeys joined by edge contact', () => {
  // WP5's review: storey 1's U stands on storey 0 by its wings, and its band touches storey 0 only along storey 0's
  // north eave, y = 400 at z = 250. The band's Underside runs straight past the U's inner corners there, so a Cell
  // corner at a corner lies inside a ShellEdge whose faces the corner's own triangle fans never reach.
  it('UpperUJoinedByEdgeContact keeps every invariant', async () => {
    await holds(UPPER_U_EDGE_CONTACT);
  });
});

// ---- The opt-in fuzz (journal decision 110, C4) ---------------------------------------------------------------------

/** A test-only seed setting: `a-b` or a comma list of seeds. */
function seedList(spec: string): number[] {
  if (!spec) return [];
  const range = /^(\d+)-(\d+)$/.exec(spec);
  if (range) return Array.from({length: Number(range[2]) - Number(range[1]) + 1}, (_, i) => Number(range[1]) + i);
  return spec.split(',').map(Number);
}

/** `SHELL_FUZZ_HEIGHTS`, a test-only setting: the opt-in fuzz's storey heights, a comma list, by default both heights. */
const FUZZ_HEIGHTS: number[] = process.env.SHELL_FUZZ_HEIGHTS ? process.env.SHELL_FUZZ_HEIGHTS.split(',').map(Number) : HEIGHTS;
const FUZZ_SEEDS = seedList(process.env.SHELL_FUZZ_SEEDS ?? '');
const COURT_FUZZ_SEEDS = seedList(process.env.SHELL_COURT_SEEDS ?? '');

if (FUZZ_SEEDS.length) {
  describe.each(FUZZ_SEEDS.flatMap(s => FUZZ_HEIGHTS.map(h => [s, h] as const)))('the opt-in fuzz: seed %i at %i cm storeys', (seed, h) => {
    it.each(randomFixtures(seed, Number(process.env.SHELL_FUZZ_COUNT ?? PER_SEED), h).map(f => [f.name, f] as const))('%s', async (_, f) => {
      await holds(f);
    });
  });
}

if (COURT_FUZZ_SEEDS.length) {
  describe.each(COURT_FUZZ_SEEDS.flatMap(s => FUZZ_HEIGHTS.map(h => [s, h] as const)))('the opt-in courtyard and U fuzz: seed %i at %i cm storeys', (seed, h) => {
    // Journal decision 150, F4: the opt-in run asserts against the same pins as the gated run.
    it.each(randomCourtyardFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('courtyard %s', async (name, f) => {
      expect(await courtyardOutcome(f)).toEqual(pinnedOutcome(COURTYARD_DEFECTS, `s${seed}h${h}/${name}`));
    });
    it.each(randomUFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('U %s', async (name, f) => {
      expect(await outcome(f, EXPECTED)).toEqual(pinnedOutcome(U_DEFECTS, `s${seed}h${h}/${name}`));
    });
    it.each(randomSplitCourtyardFixtures(seed, PER_COURTYARD_SEED, h).map(f => [f.name, f] as const))('split-band courtyard %s', async (name, f) => {
      expect(await courtyardOutcome(f)).toEqual(pinnedOutcome(SPLIT_COURTYARD_DEFECTS, `s${seed}h${h}/${name}`));
    });
  });
}

// ---- F37 ------------------------------------------------------------------------------------------------------------

describe('F37: a Cell corner is placed in the fan by its bisector', () => {
  it('builds the [0, 0, 600, 400] box gabled on y = 0 at 26.574 degrees, its rake apex 0.059 cm over z = 450', async () => {
    const b = await holds(sweepFixture(26.574, false));
    const {vertices, netEdges} = b.shell;
    const apex = vertices.filter(v => Math.abs(v.p[0] - 300) <= SHELL_TOLERANCE_CM && Math.abs(v.p[1]) <= SHELL_TOLERANCE_CM)
      .sort((p, q) => q.p[2] - p.p[2])[0];
    expect(apex.p[2] - 450).toBeCloseTo(0.0586, 3);
    // Its two Verge NetEdges are 0.131 cm long, under the 17 cm the 1e-4 rad nudge needed.
    const verges = apex.edges.map(e => netEdges[e]).filter(n => n.kind === 'Verge');
    expect(verges).toHaveLength(2);
    for (const n of verges) {
      const o = vertices[n.v[0] === apex.id ? n.v[1] : n.v[0]].p;
      expect(dist(o, apex.p)).toBeCloseTo(0.131, 3);
    }
    expect(apex.cells.length).toBeGreaterThan(0);
  });

  it('points strictly inside a corner at any angle, a straight or reflex one included', () => {
    const n: Vec3 = [0, 0, 1];
    const pos: Vec3[] = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [-10, 0, 0], [0, -10, 0], [10, 0.001, 0]];
    const corner = (prev: number, next: number): Vec3 =>
      cornerBisector({id: 0, face: 0, lattice: [0, 0], polygon: [], corners: [prev, 0, next], sides: [], whole: false, source: null}, 0, pos, n);
    // Leaving along +x, arriving from +y: a right angle, bisected at 45 degrees.
    const right = corner(2, 1);
    expect(right[0]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(right[1]).toBeCloseTo(Math.SQRT1_2, 9);
    // Leaving along +x, arriving from -x: straight, bisected along +y.
    expect(dot3(corner(3, 1), [0, 1, 0])).toBeCloseTo(1, 9);
    // Leaving along +x, arriving from -y: reflex (270 degrees), bisected along (-1, 1).
    const reflex = corner(4, 1);
    expect(reflex[0]).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(reflex[1]).toBeCloseTo(Math.SQRT1_2, 9);
    // A corner of 1e-4 rad: the bisector still lies strictly between its sides.
    const thin = corner(5, 1);
    expect(thin[1]).toBeGreaterThan(0);
    expect(thin[1] / thin[0]).toBeLessThan(0.001 / 10);
  });
});

// ---- Journal decisions 146 and 148: the widened pitch sweep ---------------------------------------------------------

/**
 * Measured at WP3.8: every roster fixture through the wire with every Pitched side at each whole degree of the wire's
 * range, [7, 75], and at 22.5, and at every ordered pair of 7, 22.5, 30, 45, 60 and 75 laid by Ring and by side axis
 * (`rosterPitchCases`), against its roster genus. Every case that breaks an invariant, with exactly its outcome:
 * - **BridgeOverBlock from 40 degrees** (F52): the block's hip rises through the tunnel and meets the bridge's floor.
 *   From 40 to 51 the contact is a ring and the genus 2, from 51.5 two lines and the genus 0. The edge there is now
 *   `SoffitJunction` (decision 146), so only the genus remains: real geometry, a roof touching the floor above it.
 *   Every pin of a shell whose roof meets the floor above carries those edges' ends (decision 156, F8), so 8 mixed
 *   cases whose invariants hold are listed too, with their edges alone.
 * - **Courtyard at mixed pitch**: one or two Internal triangles survive on the cut's plane, y = 300, with their
 *   Unclassified Edges, the cut pieces' faces across the slit no longer matching. Roof-gable algorithm B's cut-piece
 *   overshoot class (`CutOvershootProbe`), inherited. Content's own 22.5/45 reaches it (decision 148, F3).
 */
const ROSTER_PITCH_DEFECTS: PinTable<RosterPitchName> = {
  'BridgeOverBlock@40': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (297.9384765625, 297.9384765625, 500) to (297.9384765625, 302.0615234375, 500); SoffitJunction (297.9384765625, 297.9384765625, 500) to (702.0615234375, 297.9384765625, 500); SoffitJunction (297.9384765625, 302.0615234375, 500) to (702.0615234375, 302.0615234375, 500); SoffitJunction (702.0615234375, 297.9384765625, 500) to (702.0615234375, 302.0615234375, 500)"],
  'BridgeOverBlock@41': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (287.591796875, 287.591796875, 500) to (287.591796875, 312.408203125, 500); SoffitJunction (287.591796875, 287.591796875, 500) to (712.408203125, 287.591796875, 500); SoffitJunction (287.591796875, 312.408203125, 500) to (712.408203125, 312.408203125, 500); SoffitJunction (712.408203125, 287.591796875, 500) to (712.408203125, 312.408203125, 500)"],
  'BridgeOverBlock@42': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (277.6533203125, 277.6533203125, 500) to (277.6533203125, 322.3466796875, 500); SoffitJunction (277.6533203125, 277.6533203125, 500) to (722.3466796875, 277.6533203125, 500); SoffitJunction (277.6533203125, 322.3466796875, 500) to (722.3466796875, 322.3466796875, 500); SoffitJunction (722.3466796875, 277.6533203125, 500) to (722.3466796875, 322.3466796875, 500)"],
  'BridgeOverBlock@43': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (268.091796875, 268.091796875, 500) to (268.091796875, 331.908203125, 500); SoffitJunction (268.091796875, 268.091796875, 500) to (731.908203125, 268.091796875, 500); SoffitJunction (268.091796875, 331.908203125, 500) to (731.908203125, 331.908203125, 500); SoffitJunction (731.908203125, 268.091796875, 500) to (731.908203125, 331.908203125, 500)"],
  'BridgeOverBlock@44': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (258.8818359375, 258.8818359375, 500) to (258.8818359375, 341.1181640625, 500); SoffitJunction (258.8818359375, 258.8818359375, 500) to (741.1181640625, 258.8818359375, 500); SoffitJunction (258.8818359375, 341.1181640625, 500) to (741.1181640625, 341.1181640625, 500); SoffitJunction (741.1181640625, 258.8818359375, 500) to (741.1181640625, 341.1181640625, 500)"],
  'BridgeOverBlock@45': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (750, 250, 500); SoffitJunction (250, 350, 500) to (750, 350, 500); SoffitJunction (750, 250, 500) to (750, 350, 500)"],
  'BridgeOverBlock@45/22.5r': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (396.447265625, 250, 500); SoffitJunction (250, 350, 500) to (396.447265625, 350, 500); SoffitJunction (396.447265625, 250, 500) to (396.447265625, 350, 500)"],
  'BridgeOverBlock@45/30r': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (566.9873046875, 250, 500); SoffitJunction (250, 350, 500) to (566.9873046875, 350, 500); SoffitJunction (566.9873046875, 250, 500) to (566.9873046875, 350, 500)"],
  'BridgeOverBlock@45/30s': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (433.013671875, 250, 500) to (433.013671875, 350, 500); SoffitJunction (433.013671875, 250, 500) to (566.9873046875, 250, 500); SoffitJunction (433.013671875, 350, 500) to (566.9873046875, 350, 500); SoffitJunction (566.9873046875, 250, 500) to (566.9873046875, 350, 500)"],
  'BridgeOverBlock@45/60r': ["3 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (800, 250, 500); SoffitJunction (250, 350, 500) to (800, 350, 500)"],
  'BridgeOverBlock@45/60s': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 250, 500) to (800, 250, 500); SoffitJunction (200, 350, 500) to (800, 350, 500)"],
  'BridgeOverBlock@45/75r': ["3 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (800, 250, 500); SoffitJunction (250, 350, 500) to (800, 350, 500)"],
  'BridgeOverBlock@45/75s': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 250, 500) to (800, 250, 500); SoffitJunction (200, 350, 500) to (800, 350, 500)"],
  'BridgeOverBlock@46': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (241.421875, 241.421875, 500) to (241.421875, 358.578125, 500); SoffitJunction (241.421875, 241.421875, 500) to (758.578125, 241.421875, 500); SoffitJunction (241.421875, 358.578125, 500) to (758.578125, 358.578125, 500); SoffitJunction (758.578125, 241.421875, 500) to (758.578125, 358.578125, 500)"],
  'BridgeOverBlock@47': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (233.12890625, 233.12890625, 500) to (233.12890625, 366.87109375, 500); SoffitJunction (233.12890625, 233.12890625, 500) to (766.87109375, 233.12890625, 500); SoffitJunction (233.12890625, 366.87109375, 500) to (766.87109375, 366.87109375, 500); SoffitJunction (766.87109375, 233.12890625, 500) to (766.87109375, 366.87109375, 500)"],
  'BridgeOverBlock@48': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (225.1015625, 225.1015625, 500) to (225.1015625, 374.8984375, 500); SoffitJunction (225.1015625, 225.1015625, 500) to (774.8984375, 225.1015625, 500); SoffitJunction (225.1015625, 374.8984375, 500) to (774.8984375, 374.8984375, 500); SoffitJunction (774.8984375, 225.1015625, 500) to (774.8984375, 374.8984375, 500)"],
  'BridgeOverBlock@49': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (217.322265625, 217.322265625, 500) to (217.322265625, 382.6787109375, 500); SoffitJunction (217.322265625, 217.322265625, 500) to (782.6787109375, 217.322265625, 500); SoffitJunction (217.322265625, 382.6787109375, 500) to (782.6787109375, 382.6787109375, 500); SoffitJunction (782.6787109375, 217.322265625, 500) to (782.6787109375, 382.6787109375, 500)"],
  'BridgeOverBlock@50': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (209.7744140625, 209.7744140625, 500) to (209.7744140625, 390.2255859375, 500); SoffitJunction (209.7744140625, 209.7744140625, 500) to (790.2255859375, 209.7744140625, 500); SoffitJunction (209.7744140625, 390.2255859375, 500) to (790.2255859375, 390.2255859375, 500); SoffitJunction (790.2255859375, 209.7744140625, 500) to (790.2255859375, 390.2255859375, 500)"],
  'BridgeOverBlock@51': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (202.4462890625, 202.4462890625, 500) to (202.4462890625, 397.5537109375, 500); SoffitJunction (202.4462890625, 202.4462890625, 500) to (797.5537109375, 202.4462890625, 500); SoffitJunction (202.4462890625, 397.5537109375, 500) to (797.5537109375, 397.5537109375, 500); SoffitJunction (797.5537109375, 202.4462890625, 500) to (797.5537109375, 397.5537109375, 500)"],
  'BridgeOverBlock@52': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 195.3212890625, 500) to (800, 195.3212890625, 500); SoffitJunction (200, 404.6787109375, 500) to (800, 404.6787109375, 500)"],
  'BridgeOverBlock@53': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 188.388671875, 500) to (800, 188.388671875, 500); SoffitJunction (200, 411.611328125, 500) to (800, 411.611328125, 500)"],
  'BridgeOverBlock@54': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 181.6357421875, 500) to (800, 181.6357421875, 500); SoffitJunction (200, 418.3642578125, 500) to (800, 418.3642578125, 500)"],
  'BridgeOverBlock@55': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 175.0517578125, 500) to (800, 175.0517578125, 500); SoffitJunction (200, 424.9482421875, 500) to (800, 424.9482421875, 500)"],
  'BridgeOverBlock@56': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 168.626953125, 500) to (800, 168.626953125, 500); SoffitJunction (200, 431.373046875, 500) to (800, 431.373046875, 500)"],
  'BridgeOverBlock@57': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 162.3515625, 500) to (800, 162.3515625, 500); SoffitJunction (200, 437.6484375, 500) to (800, 437.6484375, 500)"],
  'BridgeOverBlock@58': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 156.216796875, 500) to (800, 156.216796875, 500); SoffitJunction (200, 443.783203125, 500) to (800, 443.783203125, 500)"],
  'BridgeOverBlock@59': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 150.21484375, 500) to (800, 150.21484375, 500); SoffitJunction (200, 449.78515625, 500) to (800, 449.78515625, 500)"],
  'BridgeOverBlock@60': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (800, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (800, 455.662109375, 500)"],
  'BridgeOverBlock@60/22.5r': ["3 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (396.447265625, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (396.447265625, 455.662109375, 500); SoffitJunction (396.447265625, 144.337890625, 500) to (396.447265625, 455.662109375, 500)"],
  'BridgeOverBlock@60/30r': ["3 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (566.9873046875, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (566.9873046875, 455.662109375, 500); SoffitJunction (566.9873046875, 144.337890625, 500) to (566.9873046875, 455.662109375, 500)"],
  'BridgeOverBlock@60/30s': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (433.013671875, 144.337890625, 500) to (433.013671875, 455.662109375, 500); SoffitJunction (433.013671875, 144.337890625, 500) to (566.9873046875, 144.337890625, 500); SoffitJunction (433.013671875, 455.662109375, 500) to (566.9873046875, 455.662109375, 500); SoffitJunction (566.9873046875, 144.337890625, 500) to (566.9873046875, 455.662109375, 500)"],
  'BridgeOverBlock@60/45r': ["3 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (750, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (750, 455.662109375, 500); SoffitJunction (750, 144.337890625, 500) to (750, 455.662109375, 500)"],
  'BridgeOverBlock@60/45s': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 144.337890625, 500) to (250, 455.6630859375, 500); SoffitJunction (250, 144.337890625, 500) to (750, 144.337890625, 500); SoffitJunction (250, 455.6630859375, 500) to (750, 455.6630859375, 500); SoffitJunction (750, 144.337890625, 500) to (750, 455.6630859375, 500)"],
  'BridgeOverBlock@60/75r': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (800, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (800, 455.662109375, 500)"],
  'BridgeOverBlock@60/75s': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (800, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (800, 455.662109375, 500)"],
  'BridgeOverBlock@61': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 138.5771484375, 500) to (800, 138.5771484375, 500); SoffitJunction (200, 461.4228515625, 500) to (800, 461.4228515625, 500)"],
  'BridgeOverBlock@62': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 132.927734375, 500) to (800, 132.927734375, 500); SoffitJunction (200, 467.072265625, 500) to (800, 467.072265625, 500)"],
  'BridgeOverBlock@63': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 127.3818359375, 500) to (800, 127.3818359375, 500); SoffitJunction (200, 472.619140625, 500) to (800, 472.619140625, 500)"],
  'BridgeOverBlock@64': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 121.93359375, 500) to (800, 121.93359375, 500); SoffitJunction (200, 478.06640625, 500) to (800, 478.06640625, 500)"],
  'BridgeOverBlock@65': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 116.5771484375, 500) to (800, 116.5771484375, 500); SoffitJunction (200, 483.4228515625, 500) to (800, 483.4228515625, 500)"],
  'BridgeOverBlock@66': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 111.3076171875, 500) to (800, 111.3076171875, 500); SoffitJunction (200, 488.6923828125, 500) to (800, 488.6923828125, 500)"],
  'BridgeOverBlock@67': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 106.119140625, 500) to (800, 106.119140625, 500); SoffitJunction (200, 493.880859375, 500) to (800, 493.880859375, 500)"],
  'BridgeOverBlock@68': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 101.0068359375, 500) to (800, 101.0068359375, 500); SoffitJunction (200, 498.9931640625, 500) to (800, 498.9931640625, 500)"],
  'BridgeOverBlock@69': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 504.0341796875, 500) to (800, 504.0341796875, 500); SoffitJunction (200, 95.9658203125, 500) to (800, 95.9658203125, 500)"],
  'BridgeOverBlock@70': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 509.0078125, 500) to (800, 509.0078125, 500); SoffitJunction (200, 90.9921875, 500) to (800, 90.9921875, 500)"],
  'BridgeOverBlock@71': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 513.91796875, 500) to (800, 513.91796875, 500); SoffitJunction (200, 86.08203125, 500) to (800, 86.08203125, 500)"],
  'BridgeOverBlock@72': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 518.7705078125, 500) to (800, 518.7705078125, 500); SoffitJunction (200, 81.2294921875, 500) to (800, 81.2294921875, 500)"],
  'BridgeOverBlock@73': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 523.5673828125, 500) to (800, 523.5673828125, 500); SoffitJunction (200, 76.4326171875, 500) to (800, 76.4326171875, 500)"],
  'BridgeOverBlock@74': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 528.3134765625, 500) to (800, 528.3134765625, 500); SoffitJunction (200, 71.6865234375, 500) to (800, 71.6865234375, 500)"],
  'BridgeOverBlock@75': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (800, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (800, 66.9873046875, 500)"],
  'BridgeOverBlock@75/22.5r': ["3 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (396.4462890625, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (396.4462890625, 66.9873046875, 500); SoffitJunction (396.4462890625, 66.9873046875, 500) to (396.4462890625, 533.0126953125, 500)"],
  'BridgeOverBlock@75/30r': ["3 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (566.9873046875, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (566.9873046875, 66.9873046875, 500); SoffitJunction (566.9873046875, 66.9873046875, 500) to (566.9873046875, 533.0126953125, 500)"],
  'BridgeOverBlock@75/30s': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (433.013671875, 533.0126953125, 500) to (566.9873046875, 533.0126953125, 500); SoffitJunction (433.013671875, 66.9873046875, 500) to (433.013671875, 533.0126953125, 500); SoffitJunction (433.013671875, 66.9873046875, 500) to (566.9873046875, 66.9873046875, 500); SoffitJunction (566.9873046875, 66.9873046875, 500) to (566.9873046875, 533.0126953125, 500)"],
  'BridgeOverBlock@75/45r': ["3 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (750, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (750, 66.9873046875, 500); SoffitJunction (750, 66.9873046875, 500) to (750, 533.0126953125, 500)"],
  'BridgeOverBlock@75/45s': ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 533.0126953125, 500) to (750, 533.0126953125, 500); SoffitJunction (250, 66.9873046875, 500) to (250, 533.0126953125, 500); SoffitJunction (250, 66.9873046875, 500) to (750, 66.9873046875, 500); SoffitJunction (750, 66.9873046875, 500) to (750, 533.0126953125, 500)"],
  'BridgeOverBlock@75/60r': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (800, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (800, 66.9873046875, 500)"],
  'BridgeOverBlock@75/60s': ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (800, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (800, 66.9873046875, 500)"],
  'Courtyard@7/22.5s': ["survivingInternal 1 at (150, 300, 295.267578125)","3 Unclassified Edges: (150, 300, 312.1318359375) to (211.0712890625, 300, 286.8349609375); (88.9287109375, 300, 286.8349609375) to (150, 300, 312.1318359375); (88.9287109375, 300, 286.8349609375) to (211.0712890625, 300, 286.8349609375)"],
  'Courtyard@7/30s': ["survivingInternal 2 at (121.2666015625, 300, 319.578125); (150.376953125, 300, 303.2060546875)","4 Unclassified Edges: (148.8681640625, 300, 335.94921875) to (151.1318359375, 300, 335.94921875); (151.1318359375, 300, 335.94921875) to (236.19921875, 300, 286.8349609375); (63.80078125, 300, 286.8349609375) to (148.8681640625, 300, 335.94921875); (63.80078125, 300, 286.8349609375) to (236.19921875, 300, 286.8349609375)"],
  'Courtyard@7/45s': ["survivingInternal 2 at (112.2783203125, 300, 319.578125); (171.3505859375, 300, 303.2060546875)","4 Unclassified Edges: (214.05078125, 300, 335.94921875) to (263.1650390625, 300, 286.8349609375); (36.8349609375, 300, 286.8349609375) to (263.1650390625, 300, 286.8349609375); (36.8349609375, 300, 286.8349609375) to (85.94921875, 300, 335.94921875); (85.94921875, 300, 335.94921875) to (214.05078125, 300, 335.94921875)"],
  'Courtyard@7/60s': ["survivingInternal 2 at (107.0888671875, 300, 319.578125); (183.458984375, 300, 303.2060546875)","4 Unclassified Edges: (21.2666015625, 300, 286.8349609375) to (278.7333984375, 300, 286.8349609375); (21.2666015625, 300, 286.8349609375) to (49.623046875, 300, 335.94921875); (250.376953125, 300, 335.94921875) to (278.7333984375, 300, 286.8349609375); (49.623046875, 300, 335.94921875) to (250.376953125, 300, 335.94921875)"],
  'Courtyard@7/75s': ["survivingInternal 2 at (103.2900390625, 300, 319.578125); (192.3232421875, 300, 303.2060546875)","4 Unclassified Edges: (23.0302734375, 300, 335.94921875) to (276.9697265625, 300, 335.94921875); (276.9697265625, 300, 335.94921875) to (290.1298828125, 300, 286.8349609375); (9.8701171875, 300, 286.8349609375) to (23.0302734375, 300, 335.94921875); (9.8701171875, 300, 286.8349609375) to (290.1298828125, 300, 286.8349609375)"],
  'Courtyard@22.5/45s': ["survivingInternal 1 at (150, 300, 382.8427734375)","3 Unclassified Edges: (124.263671875, 300, 374.263671875) to (150, 300, 400); (124.263671875, 300, 374.263671875) to (175.736328125, 300, 374.263671875); (150, 300, 400) to (175.736328125, 300, 374.263671875)"],
  'Courtyard@22.5/60s': ["survivingInternal 1 at (150, 300, 419.4453125)","3 Unclassified Edges: (150, 300, 509.8076171875) to (228.255859375, 300, 374.263671875); (71.744140625, 300, 374.263671875) to (150, 300, 509.8076171875); (71.744140625, 300, 374.263671875) to (228.255859375, 300, 374.263671875)"],
  'Courtyard@22.5/75s': ["survivingInternal 2 at (111.0986328125, 300, 484.720703125); (174.1025390625, 300, 429.4921875)","4 Unclassified Edges: (222.30859375, 300, 539.94921875) to (266.703125, 300, 374.263671875); (33.296875, 300, 374.263671875) to (266.703125, 300, 374.263671875); (33.296875, 300, 374.263671875) to (77.69140625, 300, 539.94921875); (77.69140625, 300, 539.94921875) to (222.30859375, 300, 539.94921875)"],
  'Courtyard@30/7r': ["survivingInternal 1 at (150, 300, 336.1669921875)","3 Unclassified Edges: (148.8681640625, 300, 335.94921875) to (150, 300, 336.6025390625); (148.8681640625, 300, 335.94921875) to (151.1318359375, 300, 335.94921875); (150, 300, 336.6025390625) to (151.1318359375, 300, 335.94921875)"],
  'Courtyard@30/60s': ["survivingInternal 1 at (150, 300, 452.072265625)","3 Unclassified Edges: (100, 300, 423.205078125) to (150, 300, 509.8076171875); (100, 300, 423.205078125) to (200, 300, 423.205078125); (150, 300, 509.8076171875) to (200, 300, 423.205078125)"],
  'Courtyard@30/75s': ["survivingInternal 2 at (115.4697265625, 300, 577.1650390625); (163.9033203125, 300, 500.185546875)","4 Unclassified Edges: (108.2900390625, 300, 654.1455078125) to (191.7099609375, 300, 654.1455078125); (191.7099609375, 300, 654.1455078125) to (253.58984375, 300, 423.205078125); (46.41015625, 300, 423.205078125) to (108.2900390625, 300, 654.1455078125); (46.41015625, 300, 423.205078125) to (253.58984375, 300, 423.205078125)"],
  'Courtyard@45/7r': ["survivingInternal 1 at (150, 300, 357.2998046875)","3 Unclassified Edges: (150, 300, 400) to (214.05078125, 300, 335.94921875); (85.94921875, 300, 335.94921875) to (150, 300, 400); (85.94921875, 300, 335.94921875) to (214.05078125, 300, 335.94921875)"],
  'Courtyard@45/75s': ["survivingInternal 1 at (150, 300, 636.6025390625)","3 Unclassified Edges: (150, 300, 809.8076171875) to (219.615234375, 300, 550); (80.384765625, 300, 550) to (150, 300, 809.8076171875); (80.384765625, 300, 550) to (219.615234375, 300, 550)"],
  'Courtyard@60/7r': ["survivingInternal 1 at (150, 300, 393.90234375)","3 Unclassified Edges: (150, 300, 509.8076171875) to (250.376953125, 300, 335.94921875); (49.623046875, 300, 335.94921875) to (150, 300, 509.8076171875); (49.623046875, 300, 335.94921875) to (250.376953125, 300, 335.94921875)"],
  'Courtyard@60/75s': ["survivingInternal 1 at (150, 300, 783.0126953125)","3 Unclassified Edges: (139.23046875, 300, 769.615234375) to (150, 300, 809.8076171875); (139.23046875, 300, 769.615234375) to (160.76953125, 300, 769.615234375); (150, 300, 809.8076171875) to (160.76953125, 300, 769.615234375)"],
  'Courtyard@75/7r': ["survivingInternal 1 at (150, 300, 493.90234375)","3 Unclassified Edges: (150, 300, 809.8076171875) to (276.9697265625, 300, 335.94921875); (23.0302734375, 300, 335.94921875) to (150, 300, 809.8076171875); (23.0302734375, 300, 335.94921875) to (276.9697265625, 300, 335.94921875)"],
  'Courtyard@75/22.5r': ["survivingInternal 1 at (150, 300, 629.90234375)","3 Unclassified Edges: (150, 300, 809.8076171875) to (222.30859375, 300, 539.94921875); (77.69140625, 300, 539.94921875) to (150, 300, 809.8076171875); (77.69140625, 300, 539.94921875) to (222.30859375, 300, 539.94921875)"],
  'Courtyard@75/30r': ["survivingInternal 1 at (150, 300, 706.033203125)","3 Unclassified Edges: (108.2900390625, 300, 654.1455078125) to (150, 300, 809.8076171875); (108.2900390625, 300, 654.1455078125) to (191.7099609375, 300, 654.1455078125); (150, 300, 809.8076171875) to (191.7099609375, 300, 654.1455078125)"],
};

describe('the widened pitch sweep (journal decisions 146 and 148, F3): every roster fixture over [7, 75] degrees, uniform and in mixed pairs', () => {
  const cases = rosterPitchCases(SHELL_FIXTURES);

  it('has 130 cases per roster fixture', () => {
    expect(cases).toHaveLength(130 * SHELL_FIXTURES.length);
  });

  it.each(cases.map(c => [c.name, c] as const))('%s keeps every invariant, or exactly its measured defect', async (name, c) => {
    expect(await locatedOutcome(c.fixture, {genus: rosterGenus(c.roster), cheeks: 0})).toEqual(ROSTER_PITCH_DEFECTS[name] ?? []);
  });
});

// ---- Journal decision 156, F6 and F7: every pinned case on the default run, and the two new signatures -------------

/**
 * Journal decision 156, F6: the default run asserts every pinned case of the seeded generators, building the pinned
 * cases themselves rather than their whole generators, so a pin the gated seeds do not reach is still held. The
 * opt-in path (`SHELL_COURT_SEEDS`) stays for discovering new failures.
 */
describe('every pinned case of the seeded generators, built on the default run (journal decision 156, F6)', () => {
  const seededCase = (gen: (seed: number, count: number, h: number) => ShellFixture[], key: string): ShellFixture => {
    const m = /^s(\d+)h(\d+)\/(.+)$/.exec(key);
    if (!m) throw new Error(`a pin key ${key} names no seed, height and case`);
    const f = gen(Number(m[1]), PER_COURTYARD_SEED, Number(m[2])).find(x => x.name === m[3]);
    if (!f) throw new Error(`no case ${key}`);
    return f;
  };
  const tables = [
    ['courtyard', COURTYARD_DEFECTS, randomCourtyardFixtures, COURTYARD_EXPECTED],
    ['U shape', U_DEFECTS, randomUFixtures, EXPECTED],
    ['split-band courtyard', SPLIT_COURTYARD_DEFECTS, randomSplitCourtyardFixtures, COURTYARD_EXPECTED],
  ] as const;
  const cases = tables.flatMap(([kind, pins, gen, want]) => Object.entries(pins).map(([key, pin]) => [`${kind} ${key}`, key, pin?.outcome ?? [], gen, want] as const));
  it.each(cases)('%s: exactly its pin', async (_, key, pin, gen, want) => {
    expect(await outcome(seededCase(gen, key), want)).toEqual(pin);
  });
});

/**
 * Journal decision 156, F7: the two signatures the seeds 7 to 14 measurement found that no earlier pin holds, enrolled
 * as named cases on the default run. Their pins are in the tables above too, where the opt-in run reads them.
 * - s11 Court35 at 250 and 300: a Cell corner that lies in no triangle of its face's fan;
 * - s7h250 SplitCourt9: a Gable-Wall edge, a gable's rake meeting a wall at the storey above's plate, Unclassified.
 */
describe("decision 156, F7's two new signatures", () => {
  it.each([[250], [300]] as const)('s11h%i/Court35: its Cell-fan throw', async h => {
    const f = randomCourtyardFixtures(11, PER_COURTYARD_SEED, h).find(x => x.name === 'Court35');
    if (!f) throw new Error('no Court35');
    expect(await courtyardOutcome(f)).toEqual(pinnedOutcome(COURTYARD_DEFECTS, `s11h${h}/Court35`));
    expect(COURTYARD_DEFECTS[`s11h${h}/Court35`]?.cause).toBe("a Cell corner in no triangle of its face's fan");
  });

  it('s7h250/SplitCourt9: its Gable-Wall Unclassified Edges', async () => {
    const f = randomSplitCourtyardFixtures(7, PER_COURTYARD_SEED, 250).find(x => x.name === 'SplitCourt9');
    if (!f) throw new Error('no SplitCourt9');
    expect(await courtyardOutcome(f)).toEqual(pinnedOutcome(SPLIT_COURTYARD_DEFECTS, 's7h250/SplitCourt9'));
    expect(SPLIT_COURTYARD_DEFECTS['s7h250/SplitCourt9']?.cause).toBe('a Gable-Wall edge, Unclassified (SplitCourt9 class)');
  });
});
