// Journal decisions 72, 150, 156 (F7) and 158: every pinned residue of the robustness generators, measured, with exactly
// its outcome. One module, so the robustness sweeps and the golden set's tie test (golden.test.ts) read the same pins:
// a residue golden's manifest entry equals its pin here, verbatim. Every pin carries its class: a cause `causeOf` reads
// (`CausedPinTable`), or its residue class where no cause applies (`ClassedPinTable`, journal decision 163, N3).
import type {CausedPinTable, ClassedPin, ClassedPinTable, PinRecord} from './pin-table.ts';
import type {CourtName, GapName, GridName, JutCutName, NudgeName, RosterPitchName, SplitCourtName, UName} from './robustness-fixtures.ts';

/** A generated case's key: its seed, storey height and name, of the name type `N` its generator emits (decision 155, B4). */
export type SeededKey<N extends string> = `s${number}h${number}/${N}`;

/** The one builder of a seeded case's pin key (journal decision 160, N1): `s<seed>h<height>/<name>`. */
export const seededKey = <N extends string>(seed: number, storeyHeight: number, name: N): SeededKey<N> => `s${seed}h${storeyHeight}/${name}`;

/**
 * Measured at WP3.8.2 over seeds 1 to 14 at 250, 263 and 300 cm (journal decision 156, F7), findings, not waivers:
 * every random courtyard that breaks an invariant, with its class and exactly its violations (or `throws:` and the
 * error a build raised, naming where). A case not listed keeps every invariant. A cure breaks the suite as surely as a
 * new defect, and either is re-measured, never softened. The default run builds every case listed here (decision 156,
 * F6) as well as seeds 1 and 2 at 300 and 250 whole; the opt-in run (`SHELL_COURT_SEEDS`) asserts against the same
 * table. Every count-only signature names its place (decision 150, F4), so a defect that moves fails its pin.
 * Seeds 1 to 14 fail 63 of 1680 (3.75%); seeds 7 to 14 alone, 45 of 960. WP-G2 (gable rise decision 3) cured 30 of
 * those pins: 6 are promoted and 24 re-pinned by their conflicts in `GABLE_RISE_CONFLICTS`, each noted where it lived.
 * WP3.6's table (decision 135, F2) held two `cleanMesh` refusals that floor-standing holed hip solids caused, s1h300/
 * Court5 (a stuck cap) and s1h250/Court16 (a pinching collapse); clustering (decision 122, F-C) cures both, and they are
 * kept as named regressions below, since the generator now draws other layouts under those names.
 */
export const COURTYARD_DEFECTS: CausedPinTable<SeededKey<CourtName>> = {
  // 's1h250/Court14': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's1h250/Court25': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's1h263/Court14': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // Re-pinned by journal decision 220 (WP-G4.2): an all-gable wall became a rise, and the same throw moved to cell 824 (it was cell 826, side 26-328).
  // 's1h263/Court25': cured by journal decisions 243 to 245 (WP-L2): it no longer throws; clean, re-pinned in GABLE_RISE_CONFLICTS by its F69 conflict.
  // Was: "throws: cell 824: side 29-324 (100, 500, 526) to (100, 500, 550) reads ShellEdge 73, its NetEdge -1".
  // Journal decision 245: a covered rise (decision 243, rule 3) on Ring 3's S side over x [650, 900] lies on the courtyard
  // cut's line y = 150, and the cut-piece overshoot appears on that cut. Smallest input: `COVERED_RISE_ON_CUT_LINE`.
  's1h250/Court29': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (212.8662109375, 150, 276.6728515625)","3 Unclassified Edges: (100, 150, 250) to (238.5986328125, 150, 330.01953125); (100, 150, 250) to (300, 150, 250); (238.5986328125, 150, 330.01953125) to (300, 150, 250)"]},
  // Journal decision 245, as s1h250.
  's1h300/Court29': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (212.8662109375, 150, 326.6728515625)","3 Unclassified Edges: (100, 150, 300) to (238.5986328125, 150, 380.01953125); (100, 150, 300) to (300, 150, 300); (238.5986328125, 150, 380.01953125) to (300, 150, 300)"]},
  // 's1h300/Court14': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's1h300/Court25': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  's2h250/Court15': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (275, 100, 562.546875)","3 Unclassified Edges: (250, 100, 557.7353515625) to (275, 100, 572.1689453125); (250, 100, 557.7353515625) to (300, 100, 557.7353515625); (275, 100, 572.1689453125) to (300, 100, 557.7353515625)"]},
  's2h263/Court15': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (275, 100, 588.546875)","3 Unclassified Edges: (250, 100, 583.7353515625) to (275, 100, 598.1689453125); (250, 100, 583.7353515625) to (300, 100, 583.7353515625); (275, 100, 598.1689453125) to (300, 100, 583.7353515625)"]},
  's2h300/Court15': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (275, 100, 662.546875)","3 Unclassified Edges: (250, 100, 657.7353515625) to (275, 100, 672.1689453125); (250, 100, 657.7353515625) to (300, 100, 657.7353515625); (275, 100, 672.1689453125) to (300, 100, 657.7353515625)"]},
  // 's4h250/Court7': promoted by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise, and it is clean, its height oracle held, with no conflict.
  // 's4h263/Court7': promoted by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise, and it is clean, its height oracle held, with no conflict.
  // 's4h300/Court7': promoted by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise, and it is clean, its height oracle held, with no conflict.
  // 's5h250/Court34': cured by journal decision 264 (WP-C1): its x = 0 line, claimed gable at two pitches, now builds a rise at each, [0, 500] at 30° and [500, 700] at 52.5°; clean, re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // Was: "cheeks 4, expected 0, at (250, 195.3779296875, 504.6220703125); (250, 500, 500); (250, 500, 510.6455078125); (250, 86.8349609375, 613.1650390625)".
  // 's5h263/Court34': cured by journal decision 264 (WP-C1), as s5h250. Was: "cheeks 2, expected 0, at (250, 500, 526); (250, 86.8349609375, 639.1650390625)".
  // 's5h300/Court34': cured by journal decision 264 (WP-C1), as s5h250. Was: "cheeks 2, expected 0, at (250, 500, 600); (250, 86.8349609375, 713.1650390625)".
  // 's6h250/Court23': promoted by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise, and it is clean, its height oracle held, with no conflict.
  // 's6h263/Court23': promoted by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise, and it is clean, its height oracle held, with no conflict.
  // 's6h300/Court23': promoted by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise, and it is clean, its height oracle held, with no conflict.
  's7h250/Court14': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (291.83203125, 250, 500)"]},
  // 's7h250/Court22': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  's7h250/Court38': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (665.8642578125, 100, 578.5283203125)","3 Unclassified Edges: (657.822265625, 100, 575.35546875) to (665.1259765625, 100, 584.8740234375); (657.822265625, 100, 575.35546875) to (674.64453125, 100, 575.35546875); (665.1259765625, 100, 584.8740234375) to (674.64453125, 100, 575.35546875)"]},
  's7h263/Court14': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (301.806640625, 250, 526)"]},
  // 's7h263/Court22': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  's7h263/Court38': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (665.8642578125, 100, 604.5283203125)","3 Unclassified Edges: (657.822265625, 100, 601.35546875) to (665.1259765625, 100, 610.8740234375); (657.822265625, 100, 601.35546875) to (674.64453125, 100, 601.35546875); (665.1259765625, 100, 610.8740234375) to (674.64453125, 100, 601.35546875)"]},
  's7h300/Court14': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (330.1982421875, 250, 600)"]},
  // 's7h300/Court22': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  's7h300/Court38': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (665.8642578125, 100, 678.5283203125)","3 Unclassified Edges: (657.822265625, 100, 675.35546875) to (665.1259765625, 100, 684.8740234375); (657.822265625, 100, 675.35546875) to (674.64453125, 100, 675.35546875); (665.1259765625, 100, 684.8740234375) to (674.64453125, 100, 675.35546875)"]},
  // 's8h250/Court4': promoted by journal decisions 243 to 245 (WP-L2): a covered rise is built over its cut-piece overshoot, and it is clean, its height oracle held, with no conflict.
  // 's8h263/Court4': promoted by journal decisions 243 to 245 (WP-L2): a covered rise is built over its cut-piece overshoot, and it is clean, its height oracle held, with no conflict.
  // 's8h300/Court4': promoted by journal decisions 243 to 245 (WP-L2): a covered rise is built over its cut-piece overshoot, and it is clean, its height oracle held, with no conflict.
  // 's9h250/Court0': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's9h250/Court27': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's9h263/Court0': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's9h263/Court27': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's9h300/Court0': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's9h300/Court27': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's10h250/Court15': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's10h250/Court18': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  's10h250/Court35': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (114.94140625, 600, 268.2490234375)","3 Unclassified Edges: (100, 600, 278.8671875) to (150, 600, 250); (94.82421875, 600, 275.87890625) to (100, 600, 278.8671875); (94.82421875, 600, 275.87890625) to (150, 600, 250)"]},
  // 's10h263/Court15': cured by journal decisions 243 to 245 (WP-L2): a covered rise is built over its cut-piece overshoot; clean, re-pinned in GABLE_RISE_CONFLICTS by its F69 conflict.
  // 's10h263/Court18': cured by gable rise decision 3 (WP-G2) and re-pinned in GABLE_RISE_CONFLICTS; worsened by journal decision 220 (WP-G4.2), an accepted cost:
  // a courtyard hole wall whose band runs on under a taller Ring is now a rise, and a 26.8 cm² sliver of its storey 0 Gable front, coplanar with the taller
  // Ring's storey 1 Wall on y = 400 and facing it, meets that Wall in 2 Unclassified Edges: SplitCourt9's Gable-Wall pair. Its conflict stays pinned there too.
  // 's10h263/Court18': cured by journal decisions 243 to 245 (WP-L2): its 2 Unclassified Gable-Wall Edges are gone; clean, its conflict pinned in GABLE_RISE_CONFLICTS.
  's10h263/Court35': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (115.0185546875, 600, 281.29296875)","3 Unclassified Edges: (100, 600, 291.8671875) to (150, 600, 263); (95.0546875, 600, 289.01171875) to (100, 600, 291.8671875); (95.0546875, 600, 289.01171875) to (150, 600, 263)"]},
  // 's10h300/Court15': cured by journal decisions 243 to 245 (WP-L2): a covered rise is built over its cut-piece overshoot; clean, re-pinned in GABLE_RISE_CONFLICTS by its F69 conflict.
  // 's10h300/Court18': cured by gable rise decision 3 (WP-G2) and re-pinned in GABLE_RISE_CONFLICTS; worsened by journal decision 220 (WP-G4.2), as s10h263.
  // 's10h300/Court18': cured by journal decisions 243 to 245 (WP-L2): its 2 Unclassified Gable-Wall Edges are gone; clean, its conflict pinned in GABLE_RISE_CONFLICTS.
  's10h300/Court35': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (115.2041015625, 600, 318.400390625)","3 Unclassified Edges: (100, 600, 328.8671875) to (150, 600, 300); (95.611328125, 600, 326.3330078125) to (100, 600, 328.8671875); (95.611328125, 600, 326.3330078125) to (150, 600, 300)"]},
  // 's11h250/Court35': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's11h263/Court35': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's11h300/Court35': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  's12h250/Court1': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (241.45703125, 300, 391.45703125)"]},
  // 's12h250/Court2': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  's12h263/Court1': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (241.45703125, 300, 404.45703125)"]},
  // 's12h263/Court2': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  's12h300/Court1': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (241.45703125, 300, 441.45703125)"]},
  // 's12h300/Court2': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  's13h250/Court9': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 2, expected 0, at (146.05078125, 250, 310.0146484375); (400, 250, 250)"]},
  's13h250/Court13': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (524.93359375, 200, 589.56640625)","3 Unclassified Edges: (516.4521484375, 200, 586.6025390625) to (523.275390625, 200, 595.494140625); (516.4521484375, 200, 586.6025390625) to (535.07421875, 200, 586.6025390625); (523.275390625, 200, 595.494140625) to (535.07421875, 200, 586.6025390625)"]},
  // Re-pinned by journal decisions 243 to 245 (WP-L2), was its 1 Cheek: a covered rise (decision 243, rule 3) on its storey 1 S lines
  // reaches the Cell-laying class (journal F64, F74). Smallest input: `COVERED_RISE_CELL_CLASH`.
  's13h250/Court21': {cause: "edge contact between opposite coplanar faces (U8 class)", outcome: ["throws: vertex 273 at (300, 250, 550): two Cells run the same way along one NetEdge"]},
  's13h263/Court9': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 2, expected 0, at (146.05078125, 250, 323.0146484375); (400, 250, 263)"]},
  's13h263/Court13': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (524.93359375, 200, 615.56640625)","3 Unclassified Edges: (516.4521484375, 200, 612.6025390625) to (523.275390625, 200, 621.494140625); (516.4521484375, 200, 612.6025390625) to (535.07421875, 200, 612.6025390625); (523.275390625, 200, 621.494140625) to (535.07421875, 200, 612.6025390625)"]},
  's13h263/Court21': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (450, 250, 526)"]},
  's13h300/Court9': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 2, expected 0, at (146.05078125, 250, 360.0146484375); (400, 250, 300)"]},
  's13h300/Court13': {cause: "roof-gable algorithm B, cut-piece overshoot", outcome: ["survivingInternal 1 at (524.93359375, 200, 689.56640625)","3 Unclassified Edges: (516.4521484375, 200, 686.6025390625) to (523.275390625, 200, 695.494140625); (516.4521484375, 200, 686.6025390625) to (535.07421875, 200, 686.6025390625); (523.275390625, 200, 695.494140625) to (535.07421875, 200, 686.6025390625)"]},
  // Re-pinned by journal decisions 243 to 245 (WP-L2), was its 1 Cheek: a covered rise (decision 243, rule 3) on its storey 1 S lines
  // reaches the Cell-laying class (journal F64, F74). Smallest input: `COVERED_RISE_CELL_CLASH`.
  's13h300/Court21': {cause: "edge contact between opposite coplanar faces (U8 class)", outcome: ["throws: vertex 289 at (300, 250, 650): two Cells run the same way along one NetEdge"]},
};

/** Measured at WP3.8.2 over seeds 1 to 14 at 250, 263 and 300 cm: every U-shape case that breaks an invariant. */
export const U_DEFECTS: CausedPinTable<SeededKey<UName>> = {
  's6h263/U8': {cause: "edge contact between opposite coplanar faces (U8 class)", outcome: ["throws: vertex 286 at (104.8515625, 550, 650): two Cells run the same way along one NetEdge"]},
  's6h300/U8': {cause: "edge contact between opposite coplanar faces (U8 class)", outcome: ["throws: vertex 285 at (123.267578125, 550, 700): two Cells run the same way along one NetEdge"]},
};

/**
 * Measured at WP3.8.2 over seeds 1 to 14 at 250, 263 and 300 cm: every split-band courtyard (journal decisions 150,
 * 151 and 153) that breaks an invariant, in the same form, 6 of 1680. WP-G2 (gable rise decision 3) cured 5, each
 * re-pinned by its conflicts in `GABLE_RISE_SPLIT_CONFLICTS`; the `cleanMesh stuck cap` class is left with no member. Split mode makes the free cut, collinear with no
 * wall, the shortest, so every one of these reads the free branch and takes the island's steepest wall.
 * **Journal decision 264 (WP-C1)** removes decision 220's two-pitch sub-rule, so a line claimed gable at two pitches
 * builds a rise at each. Six cases of the default run gain 1 Cheek each, enrolled here: SplitCourt1 at s1, SplitCourt11
 * and SplitCourt29 at s2, each at 250 and 300 cm. A Cheek is no defect (journal decisions 260 and 263); the class names
 * are `causeOf`'s, which reads the signature alone.
 */
export const SPLIT_COURTYARD_DEFECTS: CausedPinTable<SeededKey<SplitCourtName>> = {
  // 's2h250/SplitCourt10': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's2h263/SplitCourt10': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's2h300/SplitCourt10': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's5h250/SplitCourt29': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // 's7h250/SplitCourt9': cured by journal decisions 243 to 245 (WP-L2): its 2 Unclassified Gable-Wall Edges are gone; clean, re-pinned in GABLE_RISE_SPLIT_CONFLICTS by its F69 conflicts.
  // 's13h250/SplitCourt30': cured by gable rise decision 3 (WP-G2): its mixed wall is a hip with a rise; re-pinned in GABLE_RISE_CONFLICTS by its F69 conflicts.
  // Enrolled by journal decision 264 (WP-C1), an accepted fact (journal decisions 260 and 263): a line claimed gable at two pitches now builds a rise at
  // each, and the shell gains 1 Cheek. Was clean. Its conflicts are pinned in GABLE_RISE_SPLIT_CONFLICTS.
  's1h250/SplitCourt1': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (250, 700, 400)"]},
  // Enrolled by journal decision 264 (WP-C1), as s1h250.
  's1h300/SplitCourt1': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (250, 700, 450)"]},
  // Enrolled by journal decision 264 (WP-C1), as s1h250/SplitCourt1.
  's2h250/SplitCourt11': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (250, 160.75390625, 644.3369140625)"]},
  // Enrolled by journal decision 264 (WP-C1), as s1h250/SplitCourt1.
  's2h300/SplitCourt11': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (250, 160.75390625, 744.3369140625)"]},
  // Enrolled by journal decision 264 (WP-C1), as s1h250/SplitCourt1.
  's2h250/SplitCourt29': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (550, 150, 250)"]},
  // Enrolled by journal decision 264 (WP-C1), as s1h250/SplitCourt1.
  's2h300/SplitCourt29': {cause: "roof-gable algorithm B, Cheek class", outcome: ["cheeks 1, expected 0, at (550, 150, 300)"]},
};

/**
 * Measured at WP3.7: every nudge that breaks an invariant, with exactly its violations. All are decision 122's G5:
 * an apex or ridge 5/1024 to 12/1024 cm through the floor above, under its eave, leaves roof features 0.004 to 0.012
 * cm across, above the cleaning's tolerance and at the shell's, whose Edges read Indeterminate, so Unclassified. The
 * nudges of 0.5/1024 to 4/1024 cm, which C8's link check and the 0.005 cm move limit refused (F-C, G2), all build.
 */
export const NUDGE_DEFECTS: ClassedPinTable<NudgeName> = {
  'ApexEdge5': {residueClass: 'sub-tolerance roof feature', outcome: ["1 Unclassified Edges: (0, 500, 250) to (250, 250, 500.0048828125)","interior NetEdge 469 borders cells 214","interior NetEdge 537 borders cells 255","NetEdge 574 on ShellEdge 20 borders faces 8, expected 15,8","NetEdge 575 on ShellEdge 14 borders faces 8, expected 5,8","NetEdge 576 on ShellEdge 18 borders faces 9, expected 7,9","NetEdge 577 on ShellEdge 23 borders faces 9, expected 15,9","interior NetEdge 921 borders cells 450","interior NetEdge 924 borders cells 451"]},
  'ApexEdge8': {residueClass: 'sub-tolerance roof feature', outcome: ["4 Unclassified Edges: (0, 500, 250) to (250, 250, 500.0078125); (250, 0, 500) to (250, 249.9921875, 500); (250, 250, 500.0078125) to (250.00390625, 249.99609375, 500.00390625); (250, 250, 500.0078125) to (250.00390625, 250.00390625, 500.00390625)"]},
  'ApexEdge12': {residueClass: 'sub-tolerance roof feature', outcome: ["4 Unclassified Edges: (0, 500, 250) to (250, 250, 500.01171875); (250, 0, 500) to (250, 249.98828125, 500); (250, 250, 500.01171875) to (250.005859375, 249.994140625, 500.005859375); (250, 250, 500.01171875) to (250.005859375, 250.005859375, 500.005859375)"]},
  'OverhangApexOnEave5': {residueClass: 'sub-tolerance roof feature', outcome: ["1 Unclassified Edges: (0, 500, 250) to (250, 250, 500.0048828125)","interior NetEdge 469 borders cells 214","interior NetEdge 537 borders cells 255","NetEdge 574 on ShellEdge 20 borders faces 8, expected 14,8","NetEdge 575 on ShellEdge 14 borders faces 8, expected 5,8","NetEdge 686 on ShellEdge 18 borders faces 10, expected 10,7","NetEdge 687 on ShellEdge 23 borders faces 10, expected 10,14","interior NetEdge 1016 borders cells 494","interior NetEdge 1019 borders cells 495"]},
  'OverhangApexOnEave8': {residueClass: 'sub-tolerance roof feature', outcome: ["5 Unclassified Edges: (0, 500, 250) to (250, 250, 500.0078125); (250, 0, 500) to (250, 249.9921875, 500); (250, 250, 500.0078125) to (250.00390625, 249.99609375, 500.00390625); (250, 250, 500.0078125) to (250.00390625, 250.00390625, 500.00390625); (250, 250.0078125, 500) to (250, 500, 500)"]},
  'OverhangApexOnEave12': {residueClass: 'sub-tolerance roof feature', outcome: ["4 Unclassified Edges: (0, 500, 250) to (250, 250, 500.01171875); (250, 250, 500.01171875) to (250.005859375, 249.994140625, 500.005859375); (250, 250, 500.01171875) to (250.005859375, 250.005859375, 500.005859375); (250, 250.01171875, 500) to (250, 500, 500)"]},
  'RidgeEdge5': {residueClass: 'sub-tolerance roof feature', outcome: ["2 Unclassified Edges: (450, 250, 500.0048828125) to (450.0048828125, 250, 500); (450, 250, 500.0048828125) to (700, 500, 250)"]},
  'RidgeEdge8': {residueClass: 'sub-tolerance roof feature', outcome: ["3 Unclassified Edges: (100, 250, 500) to (249.9921875, 250, 500); (450, 250, 500.0078125) to (450.00390625, 249.99609375, 500.00390625); (450, 250, 500.0078125) to (700, 500, 250)"]},
  'RidgeEdge12': {residueClass: 'sub-tolerance roof feature', outcome: ["3 Unclassified Edges: (100, 250, 500) to (249.98828125, 250, 500); (450, 250, 500.01171875) to (450.005859375, 249.994140625, 500.005859375); (450, 250, 500.01171875) to (700, 500, 250)"]},
};

/**
 * Measured at WP3.7 for the wire format's proposed pitch bounds, 5 to 75 degrees: every failing case found, with
 * exactly its violations. Below 7 degrees the 0.173 degree sweep and finer scans find narrow pockets, all but one a
 * Cell side that lies on no ShellEdge, lattice line or split line; from 6.91 degrees up, every case scanned is green.
 */
export const PITCH_END_DEFECTS: ClassedPinTable<GridName> = {
  'G5.86h250': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 276: side 107-109 (450, 150, 265.3955078125) to (499.9970703125, 100, 260.263671875) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.86h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.1318359375) to (100, 99.9970703125, 260.263671875) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.86h300': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 316: side 111-113 (450, 150, 315.3955078125) to (499.9970703125, 100, 310.263671875) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.86h300u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 241: side 113-115 (50, 50, 305.1318359375) to (100, 99.9970703125, 310.263671875) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.87h250': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 276: side 107-109 (450, 150, 265.421875) to (499.9970703125, 100, 260.28125) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.87h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.140625) to (100, 99.9970703125, 260.28125) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.87h300': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 316: side 111-113 (450, 150, 315.421875) to (499.9970703125, 100, 310.28125) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.87h300u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 241: side 113-115 (50, 50, 305.140625) to (100, 99.9970703125, 310.28125) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.865h250': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 276: side 107-109 (450, 150, 265.4091796875) to (499.9970703125, 100, 260.2724609375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.865h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.13671875) to (100, 99.9970703125, 260.2724609375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.865h300': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 316: side 111-113 (450, 150, 315.4091796875) to (499.9970703125, 100, 310.2724609375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G5.865h300u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 241: side 113-115 (50, 50, 305.13671875) to (100, 99.9970703125, 310.2724609375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.02h250': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 276: side 107-109 (450, 150, 265.8193359375) to (499.9970703125, 100, 260.5458984375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.02h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.2734375) to (100, 99.9970703125, 260.5458984375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.02h300': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 316: side 111-113 (450, 150, 315.8193359375) to (499.9970703125, 100, 310.5458984375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.02h300u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 241: side 113-115 (50, 50, 305.2734375) to (100, 99.9970703125, 310.5458984375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.9h250u': {residueClass: 'low-pitch pocket', outcome: ["2 Unclassified Edges: (400, 200, 274.203125) to (400, 200, 500); (400, 200, 274.203125) to (600, 400, 250)"]},
  'G6.015h250': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 276: side 107-109 (450, 150, 265.8056640625) to (499.9970703125, 100, 260.537109375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.15h250': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 276: side 107-109 (450, 150, 266.1630859375) to (499.9970703125, 100, 260.775390625) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.015h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.2685546875) to (100, 99.9970703125, 260.537109375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.15h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.3876953125) to (100, 99.9970703125, 260.775390625) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.015h300': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 316: side 111-113 (450, 150, 315.8056640625) to (499.9970703125, 100, 310.537109375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.015h300u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 241: side 113-115 (50, 50, 305.2685546875) to (100, 99.9970703125, 310.537109375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.27h250': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 276: side 107-109 (450, 150, 266.4814453125) to (499.9970703125, 100, 260.9873046875) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.27h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.494140625) to (100, 99.9970703125, 260.9873046875) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.38h250': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 276: side 107-109 (450, 150, 266.7724609375) to (499.9970703125, 100, 261.181640625) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.38h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.5908203125) to (100, 99.9970703125, 261.181640625) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.48h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.6796875) to (100, 99.9970703125, 261.3583984375) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.57h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.7587890625) to (100, 99.9970703125, 261.517578125) is neither on a ShellEdge, a lattice line nor a split line"]},
  'G6.66h250u': {residueClass: 'low-pitch pocket', outcome: ["throws: cell 201: side 109-111 (50, 50, 255.8388671875) to (100, 99.9970703125, 261.6767578125) is neither on a ShellEdge, a lattice line nor a split line"]},
};

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
export const GAP_DEFECTS: ClassedPinTable<GapName> = {
  'GapAligned1': {residueClass: 'near-touching islands', outcome: ["genus per component 0, expected 0,0: genus 0 at (0, 0, 0)"]},
  'GapAligned3': {residueClass: 'near-touching islands', outcome: ["genus per component 0, expected 0,0: genus 0 at (0, 0, 0)"]},
  'GapOffset1': {residueClass: 'near-touching islands', outcome: ["two components lie 9.766e-4 cm apart, within CLEAN_TOLERANCE_CM, at (500.0009765625, 100, 0) and (500, 100, 0)"]},
  'GapOffset3': {residueClass: 'near-touching islands', outcome: ["two components lie 2.930e-3 cm apart, within CLEAN_TOLERANCE_CM, at (500.0029296875, 100, 0) and (500, 100, 0)"]},
};

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
export const ROSTER_PITCH_DEFECTS: ClassedPinTable<RosterPitchName> = {
  'BridgeOverBlock@40': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (297.9384765625, 297.9384765625, 500) to (297.9384765625, 302.0615234375, 500); SoffitJunction (297.9384765625, 297.9384765625, 500) to (702.0615234375, 297.9384765625, 500); SoffitJunction (297.9384765625, 302.0615234375, 500) to (702.0615234375, 302.0615234375, 500); SoffitJunction (702.0615234375, 297.9384765625, 500) to (702.0615234375, 302.0615234375, 500)"]},
  'BridgeOverBlock@41': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (287.591796875, 287.591796875, 500) to (287.591796875, 312.408203125, 500); SoffitJunction (287.591796875, 287.591796875, 500) to (712.408203125, 287.591796875, 500); SoffitJunction (287.591796875, 312.408203125, 500) to (712.408203125, 312.408203125, 500); SoffitJunction (712.408203125, 287.591796875, 500) to (712.408203125, 312.408203125, 500)"]},
  'BridgeOverBlock@42': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (277.6533203125, 277.6533203125, 500) to (277.6533203125, 322.3466796875, 500); SoffitJunction (277.6533203125, 277.6533203125, 500) to (722.3466796875, 277.6533203125, 500); SoffitJunction (277.6533203125, 322.3466796875, 500) to (722.3466796875, 322.3466796875, 500); SoffitJunction (722.3466796875, 277.6533203125, 500) to (722.3466796875, 322.3466796875, 500)"]},
  'BridgeOverBlock@43': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (268.091796875, 268.091796875, 500) to (268.091796875, 331.908203125, 500); SoffitJunction (268.091796875, 268.091796875, 500) to (731.908203125, 268.091796875, 500); SoffitJunction (268.091796875, 331.908203125, 500) to (731.908203125, 331.908203125, 500); SoffitJunction (731.908203125, 268.091796875, 500) to (731.908203125, 331.908203125, 500)"]},
  'BridgeOverBlock@44': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (258.8818359375, 258.8818359375, 500) to (258.8818359375, 341.1181640625, 500); SoffitJunction (258.8818359375, 258.8818359375, 500) to (741.1181640625, 258.8818359375, 500); SoffitJunction (258.8818359375, 341.1181640625, 500) to (741.1181640625, 341.1181640625, 500); SoffitJunction (741.1181640625, 258.8818359375, 500) to (741.1181640625, 341.1181640625, 500)"]},
  'BridgeOverBlock@45': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (750, 250, 500); SoffitJunction (250, 350, 500) to (750, 350, 500); SoffitJunction (750, 250, 500) to (750, 350, 500)"]},
  'BridgeOverBlock@45/22.5r': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (396.447265625, 250, 500); SoffitJunction (250, 350, 500) to (396.447265625, 350, 500); SoffitJunction (396.447265625, 250, 500) to (396.447265625, 350, 500)"]},
  'BridgeOverBlock@45/30r': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (566.9873046875, 250, 500); SoffitJunction (250, 350, 500) to (566.9873046875, 350, 500); SoffitJunction (566.9873046875, 250, 500) to (566.9873046875, 350, 500)"]},
  'BridgeOverBlock@45/30s': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (433.013671875, 250, 500) to (433.013671875, 350, 500); SoffitJunction (433.013671875, 250, 500) to (566.9873046875, 250, 500); SoffitJunction (433.013671875, 350, 500) to (566.9873046875, 350, 500); SoffitJunction (566.9873046875, 250, 500) to (566.9873046875, 350, 500)"]},
  'BridgeOverBlock@45/60r': {residueClass: 'roof meets the floor above', outcome: ["3 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (800, 250, 500); SoffitJunction (250, 350, 500) to (800, 350, 500)"]},
  'BridgeOverBlock@45/60s': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 250, 500) to (800, 250, 500); SoffitJunction (200, 350, 500) to (800, 350, 500)"]},
  'BridgeOverBlock@45/75r': {residueClass: 'roof meets the floor above', outcome: ["3 Roof-Underside Edges: SoffitJunction (250, 250, 500) to (250, 350, 500); SoffitJunction (250, 250, 500) to (800, 250, 500); SoffitJunction (250, 350, 500) to (800, 350, 500)"]},
  'BridgeOverBlock@45/75s': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 250, 500) to (800, 250, 500); SoffitJunction (200, 350, 500) to (800, 350, 500)"]},
  'BridgeOverBlock@46': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (241.421875, 241.421875, 500) to (241.421875, 358.578125, 500); SoffitJunction (241.421875, 241.421875, 500) to (758.578125, 241.421875, 500); SoffitJunction (241.421875, 358.578125, 500) to (758.578125, 358.578125, 500); SoffitJunction (758.578125, 241.421875, 500) to (758.578125, 358.578125, 500)"]},
  'BridgeOverBlock@47': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (233.12890625, 233.12890625, 500) to (233.12890625, 366.87109375, 500); SoffitJunction (233.12890625, 233.12890625, 500) to (766.87109375, 233.12890625, 500); SoffitJunction (233.12890625, 366.87109375, 500) to (766.87109375, 366.87109375, 500); SoffitJunction (766.87109375, 233.12890625, 500) to (766.87109375, 366.87109375, 500)"]},
  'BridgeOverBlock@48': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (225.1015625, 225.1015625, 500) to (225.1015625, 374.8984375, 500); SoffitJunction (225.1015625, 225.1015625, 500) to (774.8984375, 225.1015625, 500); SoffitJunction (225.1015625, 374.8984375, 500) to (774.8984375, 374.8984375, 500); SoffitJunction (774.8984375, 225.1015625, 500) to (774.8984375, 374.8984375, 500)"]},
  'BridgeOverBlock@49': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (217.322265625, 217.322265625, 500) to (217.322265625, 382.6787109375, 500); SoffitJunction (217.322265625, 217.322265625, 500) to (782.6787109375, 217.322265625, 500); SoffitJunction (217.322265625, 382.6787109375, 500) to (782.6787109375, 382.6787109375, 500); SoffitJunction (782.6787109375, 217.322265625, 500) to (782.6787109375, 382.6787109375, 500)"]},
  'BridgeOverBlock@50': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (209.7744140625, 209.7744140625, 500) to (209.7744140625, 390.2255859375, 500); SoffitJunction (209.7744140625, 209.7744140625, 500) to (790.2255859375, 209.7744140625, 500); SoffitJunction (209.7744140625, 390.2255859375, 500) to (790.2255859375, 390.2255859375, 500); SoffitJunction (790.2255859375, 209.7744140625, 500) to (790.2255859375, 390.2255859375, 500)"]},
  'BridgeOverBlock@51': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (202.4462890625, 202.4462890625, 500) to (202.4462890625, 397.5537109375, 500); SoffitJunction (202.4462890625, 202.4462890625, 500) to (797.5537109375, 202.4462890625, 500); SoffitJunction (202.4462890625, 397.5537109375, 500) to (797.5537109375, 397.5537109375, 500); SoffitJunction (797.5537109375, 202.4462890625, 500) to (797.5537109375, 397.5537109375, 500)"]},
  'BridgeOverBlock@52': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 195.3212890625, 500) to (800, 195.3212890625, 500); SoffitJunction (200, 404.6787109375, 500) to (800, 404.6787109375, 500)"]},
  'BridgeOverBlock@53': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 188.388671875, 500) to (800, 188.388671875, 500); SoffitJunction (200, 411.611328125, 500) to (800, 411.611328125, 500)"]},
  'BridgeOverBlock@54': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 181.6357421875, 500) to (800, 181.6357421875, 500); SoffitJunction (200, 418.3642578125, 500) to (800, 418.3642578125, 500)"]},
  'BridgeOverBlock@55': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 175.0517578125, 500) to (800, 175.0517578125, 500); SoffitJunction (200, 424.9482421875, 500) to (800, 424.9482421875, 500)"]},
  'BridgeOverBlock@56': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 168.626953125, 500) to (800, 168.626953125, 500); SoffitJunction (200, 431.373046875, 500) to (800, 431.373046875, 500)"]},
  'BridgeOverBlock@57': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 162.3515625, 500) to (800, 162.3515625, 500); SoffitJunction (200, 437.6484375, 500) to (800, 437.6484375, 500)"]},
  'BridgeOverBlock@58': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 156.216796875, 500) to (800, 156.216796875, 500); SoffitJunction (200, 443.783203125, 500) to (800, 443.783203125, 500)"]},
  'BridgeOverBlock@59': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 150.21484375, 500) to (800, 150.21484375, 500); SoffitJunction (200, 449.78515625, 500) to (800, 449.78515625, 500)"]},
  'BridgeOverBlock@60': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (800, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (800, 455.662109375, 500)"]},
  'BridgeOverBlock@60/22.5r': {residueClass: 'roof meets the floor above', outcome: ["3 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (396.447265625, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (396.447265625, 455.662109375, 500); SoffitJunction (396.447265625, 144.337890625, 500) to (396.447265625, 455.662109375, 500)"]},
  'BridgeOverBlock@60/30r': {residueClass: 'roof meets the floor above', outcome: ["3 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (566.9873046875, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (566.9873046875, 455.662109375, 500); SoffitJunction (566.9873046875, 144.337890625, 500) to (566.9873046875, 455.662109375, 500)"]},
  'BridgeOverBlock@60/30s': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (433.013671875, 144.337890625, 500) to (433.013671875, 455.662109375, 500); SoffitJunction (433.013671875, 144.337890625, 500) to (566.9873046875, 144.337890625, 500); SoffitJunction (433.013671875, 455.662109375, 500) to (566.9873046875, 455.662109375, 500); SoffitJunction (566.9873046875, 144.337890625, 500) to (566.9873046875, 455.662109375, 500)"]},
  'BridgeOverBlock@60/45r': {residueClass: 'roof meets the floor above', outcome: ["3 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (750, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (750, 455.662109375, 500); SoffitJunction (750, 144.337890625, 500) to (750, 455.662109375, 500)"]},
  'BridgeOverBlock@60/45s': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 144.337890625, 500) to (250, 455.6630859375, 500); SoffitJunction (250, 144.337890625, 500) to (750, 144.337890625, 500); SoffitJunction (250, 455.6630859375, 500) to (750, 455.6630859375, 500); SoffitJunction (750, 144.337890625, 500) to (750, 455.6630859375, 500)"]},
  'BridgeOverBlock@60/75r': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (800, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (800, 455.662109375, 500)"]},
  'BridgeOverBlock@60/75s': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 144.337890625, 500) to (800, 144.337890625, 500); SoffitJunction (200, 455.662109375, 500) to (800, 455.662109375, 500)"]},
  'BridgeOverBlock@61': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 138.5771484375, 500) to (800, 138.5771484375, 500); SoffitJunction (200, 461.4228515625, 500) to (800, 461.4228515625, 500)"]},
  'BridgeOverBlock@62': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 132.927734375, 500) to (800, 132.927734375, 500); SoffitJunction (200, 467.072265625, 500) to (800, 467.072265625, 500)"]},
  'BridgeOverBlock@63': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 127.3818359375, 500) to (800, 127.3818359375, 500); SoffitJunction (200, 472.619140625, 500) to (800, 472.619140625, 500)"]},
  'BridgeOverBlock@64': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 121.93359375, 500) to (800, 121.93359375, 500); SoffitJunction (200, 478.06640625, 500) to (800, 478.06640625, 500)"]},
  'BridgeOverBlock@65': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 116.5771484375, 500) to (800, 116.5771484375, 500); SoffitJunction (200, 483.4228515625, 500) to (800, 483.4228515625, 500)"]},
  'BridgeOverBlock@66': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 111.3076171875, 500) to (800, 111.3076171875, 500); SoffitJunction (200, 488.6923828125, 500) to (800, 488.6923828125, 500)"]},
  'BridgeOverBlock@67': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 106.119140625, 500) to (800, 106.119140625, 500); SoffitJunction (200, 493.880859375, 500) to (800, 493.880859375, 500)"]},
  'BridgeOverBlock@68': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 101.0068359375, 500) to (800, 101.0068359375, 500); SoffitJunction (200, 498.9931640625, 500) to (800, 498.9931640625, 500)"]},
  'BridgeOverBlock@69': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 504.0341796875, 500) to (800, 504.0341796875, 500); SoffitJunction (200, 95.9658203125, 500) to (800, 95.9658203125, 500)"]},
  'BridgeOverBlock@70': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 509.0078125, 500) to (800, 509.0078125, 500); SoffitJunction (200, 90.9921875, 500) to (800, 90.9921875, 500)"]},
  'BridgeOverBlock@71': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 513.91796875, 500) to (800, 513.91796875, 500); SoffitJunction (200, 86.08203125, 500) to (800, 86.08203125, 500)"]},
  'BridgeOverBlock@72': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 518.7705078125, 500) to (800, 518.7705078125, 500); SoffitJunction (200, 81.2294921875, 500) to (800, 81.2294921875, 500)"]},
  'BridgeOverBlock@73': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 523.5673828125, 500) to (800, 523.5673828125, 500); SoffitJunction (200, 76.4326171875, 500) to (800, 76.4326171875, 500)"]},
  'BridgeOverBlock@74': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 528.3134765625, 500) to (800, 528.3134765625, 500); SoffitJunction (200, 71.6865234375, 500) to (800, 71.6865234375, 500)"]},
  'BridgeOverBlock@75': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (800, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (800, 66.9873046875, 500)"]},
  'BridgeOverBlock@75/22.5r': {residueClass: 'roof meets the floor above', outcome: ["3 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (396.4462890625, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (396.4462890625, 66.9873046875, 500); SoffitJunction (396.4462890625, 66.9873046875, 500) to (396.4462890625, 533.0126953125, 500)"]},
  'BridgeOverBlock@75/30r': {residueClass: 'roof meets the floor above', outcome: ["3 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (566.9873046875, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (566.9873046875, 66.9873046875, 500); SoffitJunction (566.9873046875, 66.9873046875, 500) to (566.9873046875, 533.0126953125, 500)"]},
  'BridgeOverBlock@75/30s': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (433.013671875, 533.0126953125, 500) to (566.9873046875, 533.0126953125, 500); SoffitJunction (433.013671875, 66.9873046875, 500) to (433.013671875, 533.0126953125, 500); SoffitJunction (433.013671875, 66.9873046875, 500) to (566.9873046875, 66.9873046875, 500); SoffitJunction (566.9873046875, 66.9873046875, 500) to (566.9873046875, 533.0126953125, 500)"]},
  'BridgeOverBlock@75/45r': {residueClass: 'roof meets the floor above', outcome: ["3 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (750, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (750, 66.9873046875, 500); SoffitJunction (750, 66.9873046875, 500) to (750, 533.0126953125, 500)"]},
  'BridgeOverBlock@75/45s': {residueClass: 'roof meets the floor above', outcome: ["genus per component 2, expected 1: genus 2 at (0, 0, 0)","4 Roof-Underside Edges: SoffitJunction (250, 533.0126953125, 500) to (750, 533.0126953125, 500); SoffitJunction (250, 66.9873046875, 500) to (250, 533.0126953125, 500); SoffitJunction (250, 66.9873046875, 500) to (750, 66.9873046875, 500); SoffitJunction (750, 66.9873046875, 500) to (750, 533.0126953125, 500)"]},
  'BridgeOverBlock@75/60r': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (800, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (800, 66.9873046875, 500)"]},
  'BridgeOverBlock@75/60s': {residueClass: 'roof meets the floor above', outcome: ["genus per component 0, expected 1: genus 0 at (0, 0, 0)","2 Roof-Underside Edges: SoffitJunction (200, 533.0126953125, 500) to (800, 533.0126953125, 500); SoffitJunction (200, 66.9873046875, 500) to (800, 66.9873046875, 500)"]},
  'Courtyard@7/22.5s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 295.267578125)","3 Unclassified Edges: (150, 300, 312.1318359375) to (211.0712890625, 300, 286.8349609375); (88.9287109375, 300, 286.8349609375) to (150, 300, 312.1318359375); (88.9287109375, 300, 286.8349609375) to (211.0712890625, 300, 286.8349609375)"]},
  'Courtyard@7/30s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 2 at (121.2666015625, 300, 319.578125); (150.376953125, 300, 303.2060546875)","4 Unclassified Edges: (148.8681640625, 300, 335.94921875) to (151.1318359375, 300, 335.94921875); (151.1318359375, 300, 335.94921875) to (236.19921875, 300, 286.8349609375); (63.80078125, 300, 286.8349609375) to (148.8681640625, 300, 335.94921875); (63.80078125, 300, 286.8349609375) to (236.19921875, 300, 286.8349609375)"]},
  'Courtyard@7/45s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 2 at (112.2783203125, 300, 319.578125); (171.3505859375, 300, 303.2060546875)","4 Unclassified Edges: (214.05078125, 300, 335.94921875) to (263.1650390625, 300, 286.8349609375); (36.8349609375, 300, 286.8349609375) to (263.1650390625, 300, 286.8349609375); (36.8349609375, 300, 286.8349609375) to (85.94921875, 300, 335.94921875); (85.94921875, 300, 335.94921875) to (214.05078125, 300, 335.94921875)"]},
  'Courtyard@7/60s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 2 at (107.0888671875, 300, 319.578125); (183.458984375, 300, 303.2060546875)","4 Unclassified Edges: (21.2666015625, 300, 286.8349609375) to (278.7333984375, 300, 286.8349609375); (21.2666015625, 300, 286.8349609375) to (49.623046875, 300, 335.94921875); (250.376953125, 300, 335.94921875) to (278.7333984375, 300, 286.8349609375); (49.623046875, 300, 335.94921875) to (250.376953125, 300, 335.94921875)"]},
  'Courtyard@7/75s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 2 at (103.2900390625, 300, 319.578125); (192.3232421875, 300, 303.2060546875)","4 Unclassified Edges: (23.0302734375, 300, 335.94921875) to (276.9697265625, 300, 335.94921875); (276.9697265625, 300, 335.94921875) to (290.1298828125, 300, 286.8349609375); (9.8701171875, 300, 286.8349609375) to (23.0302734375, 300, 335.94921875); (9.8701171875, 300, 286.8349609375) to (290.1298828125, 300, 286.8349609375)"]},
  'Courtyard@22.5/45s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 382.8427734375)","3 Unclassified Edges: (124.263671875, 300, 374.263671875) to (150, 300, 400); (124.263671875, 300, 374.263671875) to (175.736328125, 300, 374.263671875); (150, 300, 400) to (175.736328125, 300, 374.263671875)"]},
  'Courtyard@22.5/60s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 419.4453125)","3 Unclassified Edges: (150, 300, 509.8076171875) to (228.255859375, 300, 374.263671875); (71.744140625, 300, 374.263671875) to (150, 300, 509.8076171875); (71.744140625, 300, 374.263671875) to (228.255859375, 300, 374.263671875)"]},
  'Courtyard@22.5/75s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 2 at (111.0986328125, 300, 484.720703125); (174.1025390625, 300, 429.4921875)","4 Unclassified Edges: (222.30859375, 300, 539.94921875) to (266.703125, 300, 374.263671875); (33.296875, 300, 374.263671875) to (266.703125, 300, 374.263671875); (33.296875, 300, 374.263671875) to (77.69140625, 300, 539.94921875); (77.69140625, 300, 539.94921875) to (222.30859375, 300, 539.94921875)"]},
  'Courtyard@30/7r': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 336.1669921875)","3 Unclassified Edges: (148.8681640625, 300, 335.94921875) to (150, 300, 336.6025390625); (148.8681640625, 300, 335.94921875) to (151.1318359375, 300, 335.94921875); (150, 300, 336.6025390625) to (151.1318359375, 300, 335.94921875)"]},
  'Courtyard@30/60s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 452.072265625)","3 Unclassified Edges: (100, 300, 423.205078125) to (150, 300, 509.8076171875); (100, 300, 423.205078125) to (200, 300, 423.205078125); (150, 300, 509.8076171875) to (200, 300, 423.205078125)"]},
  'Courtyard@30/75s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 2 at (115.4697265625, 300, 577.1650390625); (163.9033203125, 300, 500.185546875)","4 Unclassified Edges: (108.2900390625, 300, 654.1455078125) to (191.7099609375, 300, 654.1455078125); (191.7099609375, 300, 654.1455078125) to (253.58984375, 300, 423.205078125); (46.41015625, 300, 423.205078125) to (108.2900390625, 300, 654.1455078125); (46.41015625, 300, 423.205078125) to (253.58984375, 300, 423.205078125)"]},
  'Courtyard@45/7r': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 357.2998046875)","3 Unclassified Edges: (150, 300, 400) to (214.05078125, 300, 335.94921875); (85.94921875, 300, 335.94921875) to (150, 300, 400); (85.94921875, 300, 335.94921875) to (214.05078125, 300, 335.94921875)"]},
  'Courtyard@45/75s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 636.6025390625)","3 Unclassified Edges: (150, 300, 809.8076171875) to (219.615234375, 300, 550); (80.384765625, 300, 550) to (150, 300, 809.8076171875); (80.384765625, 300, 550) to (219.615234375, 300, 550)"]},
  'Courtyard@60/7r': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 393.90234375)","3 Unclassified Edges: (150, 300, 509.8076171875) to (250.376953125, 300, 335.94921875); (49.623046875, 300, 335.94921875) to (150, 300, 509.8076171875); (49.623046875, 300, 335.94921875) to (250.376953125, 300, 335.94921875)"]},
  'Courtyard@60/75s': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 783.0126953125)","3 Unclassified Edges: (139.23046875, 300, 769.615234375) to (150, 300, 809.8076171875); (139.23046875, 300, 769.615234375) to (160.76953125, 300, 769.615234375); (150, 300, 809.8076171875) to (160.76953125, 300, 769.615234375)"]},
  'Courtyard@75/7r': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 493.90234375)","3 Unclassified Edges: (150, 300, 809.8076171875) to (276.9697265625, 300, 335.94921875); (23.0302734375, 300, 335.94921875) to (150, 300, 809.8076171875); (23.0302734375, 300, 335.94921875) to (276.9697265625, 300, 335.94921875)"]},
  'Courtyard@75/22.5r': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 629.90234375)","3 Unclassified Edges: (150, 300, 809.8076171875) to (222.30859375, 300, 539.94921875); (77.69140625, 300, 539.94921875) to (150, 300, 809.8076171875); (77.69140625, 300, 539.94921875) to (222.30859375, 300, 539.94921875)"]},
  'Courtyard@75/30r': {residueClass: 'algorithm-B cut-piece overshoot', outcome: ["survivingInternal 1 at (150, 300, 706.033203125)","3 Unclassified Edges: (108.2900390625, 300, 654.1455078125) to (150, 300, 809.8076171875); (108.2900390625, 300, 654.1455078125) to (191.7099609375, 300, 654.1455078125); (150, 300, 809.8076171875) to (191.7099609375, 300, 654.1455078125)"]},
};

/**
 * Journal decision 175 and F55, measured at WP3.9.1 at 250 cm storeys, genus 1, enrolled as best effort (decision
 * 172): a courtyard cut that qualifies while collinear with a jutting wall, both at 30 degrees (`jutCutFixtures`). Its
 * signature names its places: two Internal triangles surviving on the cut's plane, y = 300, a Cheek at the cut's outer
 * end, (0, 300, 250), and four Unclassified Edges on y = 300 from x 0 to 127. `CourtyardJutCut`, whose cut does not
 * qualify, is clean, so it is not listed.
 */
export const JUT_CUT_DEFECTS: ClassedPinTable<JutCutName> = {
  'CourtyardJutCutSwapped': {residueClass: 'courtyard cut collinear with a jutting wall', outcome: ["survivingInternal 2 at (42.2646484375, 300, 432.13671875); (58.931640625, 300, 457.7353515625)","cheeks 1, expected 0, at (0, 300, 250)","4 Unclassified Edges: (0, 300, 423.205078125) to (0, 300, 450); (0, 300, 423.205078125) to (126.794921875, 300, 423.205078125); (0, 300, 450) to (50, 300, 500); (50, 300, 500) to (126.794921875, 300, 423.205078125)"]},
};

/**
 * WP3.6's finding (courtyard.test.ts): roof-gable algorithm B's cut-piece overshoot, `CutOvershootProbe`, with exactly
 * its violations at genus 1.
 */
export const CUT_OVERSHOOT_DEFECTS: ClassedPin = {
  residueClass: 'algorithm-B cut-piece overshoot',
  outcome: [
    'survivingInternal 1 at (125, 250, 312.546875)',
    '3 Unclassified Edges: (100, 250, 307.7353515625) to (125, 250, 322.1689453125); (100, 250, 307.7353515625) to (150, 250, 307.7353515625); (125, 250, 322.1689453125) to (150, 250, 307.7353515625)',
  ],
};

/**
 * WP-G2 (gable rise decision 3, journal decision 206): the cases decision 3 cured that are clean by every invariant and
 * the rise's height oracle, but carry re-tag conflicts, so they are re-pinned here, not promoted: each with exactly its
 * conflicts. Every one is F69's class: a storey's Wall or Gable reported over the Gable of the storey below on one plane,
 * as a rise's front buried under a flush upper wall gives. Most carried conflicts before WP-G2 too (up to 19); none were
 * pinned, since the sweeps never asserted conflicts. `s10h250/Court15` (from none to 1) and `s11h263/Court35` (from none
 * to 2) are the two that gained conflicts where they had none.
 *
 * **Journal decision 220 (WP-G4.2)**: an all-gable wall whose algorithm B piece is not its claimed band is a hip with a
 * rise. Its accepted cost is more F69 conflicts, pinned exactly here: `s2h250/Court14`, `s2h300/Court14` (2 to 3),
 * `s2h250/Court29`, `s2h300/Court29` (1 to 2) and `s2h250/Court3` (2 to 3), enrolled from the default run's whole
 * sweeps, where conflicts are otherwise not asserted. The `s1` Court14 and Court25 rows are re-pinned: the same count,
 * read off other triangles. `s10h263/Court18` and `s10h300/Court18` keep their conflict here, and their new Unclassified
 * Edges are pinned in `COURTYARD_DEFECTS`.
 *
 * **Journal decisions 243 to 245 (WP-L2)**: every row the three rules move is re-pinned with its measured conflicts, each
 * noted. `s1h263/Court25` and `s10h263/Court15`, `s10h300/Court15` are enrolled here, cured of their defect pins; the s10
 * Court18 rows' Unclassified Edges are cured, and their conflict alone stays.
 *
 * **Journal decision 264 (WP-C1)**: `s5h250/Court34`, `s5h263/Court34` and `s5h300/Court34` are enrolled here, cured of
 * their Cheek pins (4, 2 and 2 Cheeks) by the removal of the two-pitch sub-rule; their conflicts fall from 11, 6 and 6 to
 * 5, 2 and 2.
 */
export const GABLE_RISE_CONFLICTS: PinRecord<SeededKey<CourtName>, readonly string[]> = {
  // Re-pinned by journal decision 220: was "n=(0.000000, 1.000000, 0.000000) d=200.000: Wall storey 1 wall 2 (part 8) over Gable storey 0 wall 14 (part 3)".
  // Re-pinned by journal decisions 243 to 245 (WP-L2): 1 conflict to 2.
  's1h250/Court14': ["Court14: n=(0.000000, -1.000000, 0.000000) d=-100.000: Wall storey 1 wall 0 (part 9) over Gable storey 0 wall 0 (part 5)","Court14: n=(0.000000, 1.000000, 0.000000) d=200.000: Wall storey 1 wall 2 (part 9) over Gable storey 0 wall 14 (part 5)"],
  // Re-pinned by journal decision 220: was "... over Gable storey 0 wall 10 (part 3)".
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 1 conflict, read off other parts.
  's1h250/Court25': ["Court25: n=(1.000000, 0.000000, 0.000000) d=100.000: Wall storey 1 wall 1 (part 10) over Gable storey 0 wall 10 (part 7)"],
  // Enrolled by journal decisions 243 to 245 (WP-L2): its Cell/ShellEdge throw is cured, and it is clean but for this conflict.
  's1h263/Court25': ["Court25: n=(1.000000, 0.000000, 0.000000) d=100.000: Wall storey 1 wall 1 (part 10) over Gable storey 0 wall 10 (part 7)"],
  // Re-pinned by journal decision 220, as s1h250.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): 1 conflict to 2.
  's1h263/Court14': ["Court14: n=(0.000000, -1.000000, 0.000000) d=-100.000: Wall storey 1 wall 0 (part 9) over Gable storey 0 wall 0 (part 5)","Court14: n=(0.000000, 1.000000, 0.000000) d=200.000: Wall storey 1 wall 2 (part 9) over Gable storey 0 wall 14 (part 5)"],
  // Re-pinned by journal decision 220, as s1h250.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): 1 conflict to 2.
  's1h300/Court14': ["Court14: n=(0.000000, -1.000000, 0.000000) d=-100.000: Wall storey 1 wall 0 (part 9) over Gable storey 0 wall 0 (part 5)","Court14: n=(0.000000, 1.000000, 0.000000) d=200.000: Wall storey 1 wall 2 (part 9) over Gable storey 0 wall 14 (part 5)"],
  // Re-pinned by journal decision 220, as s1h250.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 1 conflict, read off other parts.
  's1h300/Court25': ["Court25: n=(1.000000, 0.000000, 0.000000) d=100.000: Wall storey 1 wall 1 (part 10) over Gable storey 0 wall 10 (part 7)"],
  // Enrolled by journal decision 220: 2 conflicts to 3.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): 3 conflicts to 2.
  's2h250/Court14': ["Court14: n=(-1.000000, 0.000000, 0.000000) d=-450.000: Wall storey 1 wall 12 (part 9) over Gable storey 0 wall 12 (part 6)","Court14: n=(1.000000, 0.000000, 0.000000) d=150.000: Wall storey 1 wall 10 (part 9) over Gable storey 0 wall 10 (part 5)"],
  // Enrolled by journal decision 220: 2 conflicts to 3.
  's2h250/Court3': ["Court3: n=(0.000000, 1.000000, 0.000000) d=350.000: Wall storey 1 wall 2 (part 8) over Gable storey 0 wall 9 (part 2)","Court3: n=(1.000000, 0.000000, 0.000000) d=250.000: Wall storey 1 wall 3 (part 8) over Gable storey 0 wall 10 (part 7)","Court3: n=(1.000000, 0.000000, 0.000000) d=250.000: Wall storey 2 wall 1 (part 12) over Gable storey 1 wall 3 (part 11)"],
  // Enrolled by journal decision 220: 1 conflict to 2.
  's2h250/Court29': ["Court29: n=(-1.000000, 0.000000, 0.000000) d=-150.000: Wall storey 1 wall 5 (part 7) over Gable storey 0 wall 6 (part 5)","Court29: n=(0.000000, -1.000000, 0.000000) d=-250.000: Wall storey 1 wall 2 (part 7) over Gable storey 0 wall 12 (part 6)"],
  // Enrolled by journal decision 220: 2 conflicts to 3.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): 3 conflicts to 2.
  's2h300/Court14': ["Court14: n=(-1.000000, 0.000000, 0.000000) d=-450.000: Wall storey 1 wall 12 (part 9) over Gable storey 0 wall 12 (part 6)","Court14: n=(1.000000, 0.000000, 0.000000) d=150.000: Wall storey 1 wall 10 (part 9) over Gable storey 0 wall 10 (part 5)"],
  // Enrolled by journal decision 220: 1 conflict to 2.
  's2h300/Court29': ["Court29: n=(-1.000000, 0.000000, 0.000000) d=-150.000: Wall storey 1 wall 5 (part 7) over Gable storey 0 wall 6 (part 5)","Court29: n=(0.000000, -1.000000, 0.000000) d=-250.000: Wall storey 1 wall 2 (part 7) over Gable storey 0 wall 12 (part 6)"],
  // Enrolled by journal decision 264 (WP-C1): its 4 Cheeks are cured, and it is clean but for these conflicts (11 before, unpinned).
  's5h250/Court34': ["Court34: n=(-1.000000, 0.000000, 0.000000) d=0.000: Wall storey 1 wall 10 (part 8) over Gable storey 0 wall 9 (part 5)","Court34: n=(-1.000000, 0.000000, 0.000000) d=0.000: Wall storey 1 wall 8 (part 8) over Gable storey 0 wall 8 (part 4)","Court34: n=(-1.000000, 0.000000, 0.000000) d=0.000: Wall storey 1 wall 9 (part 8) over Gable storey 0 wall 9 (part 5)","Court34: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 1 wall 4 (part 8) over Gable storey 0 wall 4 (part 4)","Court34: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 2 wall 1 (part 14) over Gable storey 1 wall 4 (part 13)"],
  // Enrolled by journal decision 264 (WP-C1): its 2 Cheeks are cured, and it is clean but for these conflicts (6 before, unpinned).
  's5h263/Court34': ["Court34: n=(-1.000000, 0.000000, 0.000000) d=0.000: Wall storey 1 wall 9 (part 8) over Gable storey 0 wall 9 (part 5)","Court34: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 2 wall 1 (part 14) over Gable storey 1 wall 4 (part 13)"],
  // Enrolled by journal decision 264 (WP-C1), as s5h263.
  's5h300/Court34': ["Court34: n=(-1.000000, 0.000000, 0.000000) d=0.000: Wall storey 1 wall 9 (part 8) over Gable storey 0 wall 9 (part 5)","Court34: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 2 wall 1 (part 14) over Gable storey 1 wall 4 (part 13)"],
  's7h250/Court22': ["Court22: n=(0.000000, -1.000000, 0.000000) d=-100.000: Wall storey 1 wall 4 (part 9) over Gable storey 0 wall 7 (part 4)","Court22: n=(0.000000, -1.000000, 0.000000) d=-100.000: Wall storey 2 wall 0 (part 12) over Gable storey 1 wall 4 (part 11)","Court22: n=(0.000000, 1.000000, 0.000000) d=750.000: Wall storey 1 wall 2 (part 7) over Gable storey 0 wall 1 (part 5)"],
  's7h263/Court22': ["Court22: n=(0.000000, -1.000000, 0.000000) d=-100.000: Wall storey 2 wall 0 (part 12) over Gable storey 1 wall 4 (part 11)","Court22: n=(0.000000, 1.000000, 0.000000) d=750.000: Wall storey 1 wall 2 (part 7) over Gable storey 0 wall 1 (part 5)"],
  's7h300/Court22': ["Court22: n=(0.000000, -1.000000, 0.000000) d=-100.000: Wall storey 1 wall 4 (part 9) over Gable storey 0 wall 7 (part 4)","Court22: n=(0.000000, -1.000000, 0.000000) d=-100.000: Wall storey 2 wall 0 (part 12) over Gable storey 1 wall 4 (part 11)","Court22: n=(0.000000, 1.000000, 0.000000) d=750.000: Wall storey 1 wall 2 (part 7) over Gable storey 0 wall 1 (part 5)"],
  // Re-pinned by journal decision 231 (and 233), at all three heights: 1 conflict more. Storey 1's rise [250, 500] on its
  // y = 50 wall (part 17, capped at storey 2's wall top) lost its limit, the y = 150 wall being gabled along its whole
  // length, so it runs on to that wall and stands above its gable there. Its back face is then coplanar with storey 2's
  // wall 6 on y = 150, and the re-tag pass reports that Wall over it: F69's report, as for part 14 on the same plane.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 15 conflicts, read off other parts.
  's9h250/Court0': ["Court0: n=(-1.000000, 0.000000, 0.000000) d=-100.000: Wall storey 1 wall 8 (part 12) over Gable storey 0 wall 8 (part 9)","Court0: n=(-1.000000, 0.000000, 0.000000) d=-100.000: Wall storey 2 wall 7 (part 22) over Gable storey 1 wall 8 (part 20)","Court0: n=(0.000000, -1.000000, 0.000000) d=-250.000: Gable storey 0 wall 13 (part 3) over Gable storey 1 wall 13 (part 14)","Court0: n=(0.000000, -1.000000, 0.000000) d=-250.000: Wall storey 1 wall 13 (part 12) over Gable storey 0 wall 13 (part 3)","Court0: n=(0.000000, -1.000000, 0.000000) d=-50.000: Wall storey 1 wall 0 (part 12) over Gable storey 0 wall 0 (part 7)","Court0: n=(0.000000, -1.000000, 0.000000) d=-50.000: Wall storey 2 wall 0 (part 22) over Gable storey 1 wall 0 (part 18)","Court0: n=(0.000000, 1.000000, 0.000000) d=150.000: Wall storey 1 wall 15 (part 12) over Gable storey 0 wall 15 (part 4)","Court0: n=(0.000000, 1.000000, 0.000000) d=150.000: Wall storey 2 wall 6 (part 22) over Gable storey 1 wall 15 (part 15)","Court0: n=(0.000000, 1.000000, 0.000000) d=150.000: Wall storey 2 wall 6 (part 22) over Gable storey 1 wall 15 (part 18)","Court0: n=(0.000000, 1.000000, 0.000000) d=450.000: Wall storey 2 wall 4 (part 22) over Gable storey 1 wall 5 (part 19)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 1 wall 2 (part 12) over Gable storey 0 wall 2 (part 2)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 1 wall 3 (part 12) over Gable storey 0 wall 2 (part 2)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 1 wall 4 (part 12) over Gable storey 0 wall 2 (part 2)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 2 wall 2 (part 22) over Gable storey 1 wall 2 (part 13)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 2 wall 3 (part 22) over Gable storey 1 wall 2 (part 13)"],
  's9h250/Court27': ["Court27: n=(0.000000, -1.000000, 0.000000) d=-150.000: Wall storey 1 wall 0 (part 5) over Gable storey 0 wall 6 (part 4)","Court27: n=(0.000000, -1.000000, 0.000000) d=-150.000: Wall storey 2 wall 0 (part 8) over Gable storey 1 wall 0 (part 7)"],
  // Re-pinned by journal decision 231, as s9h250.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 11 conflicts, read off other parts.
  's9h263/Court0': ["Court0: n=(-1.000000, 0.000000, 0.000000) d=-100.000: Wall storey 2 wall 7 (part 22) over Gable storey 1 wall 8 (part 20)","Court0: n=(0.000000, -1.000000, 0.000000) d=-250.000: Wall storey 1 wall 13 (part 12) over Gable storey 0 wall 13 (part 3)","Court0: n=(0.000000, -1.000000, 0.000000) d=-50.000: Wall storey 1 wall 0 (part 12) over Gable storey 0 wall 0 (part 7)","Court0: n=(0.000000, -1.000000, 0.000000) d=-50.000: Wall storey 2 wall 0 (part 22) over Gable storey 1 wall 0 (part 18)","Court0: n=(0.000000, 1.000000, 0.000000) d=150.000: Wall storey 1 wall 15 (part 12) over Gable storey 0 wall 15 (part 4)","Court0: n=(0.000000, 1.000000, 0.000000) d=150.000: Wall storey 2 wall 6 (part 22) over Gable storey 1 wall 15 (part 15)","Court0: n=(0.000000, 1.000000, 0.000000) d=150.000: Wall storey 2 wall 6 (part 22) over Gable storey 1 wall 15 (part 18)","Court0: n=(0.000000, 1.000000, 0.000000) d=450.000: Wall storey 2 wall 4 (part 22) over Gable storey 1 wall 5 (part 19)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 1 wall 3 (part 12) over Gable storey 0 wall 2 (part 2)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 2 wall 2 (part 22) over Gable storey 1 wall 2 (part 13)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 2 wall 3 (part 22) over Gable storey 1 wall 2 (part 13)"],
  's9h263/Court27': ["Court27: n=(0.000000, -1.000000, 0.000000) d=-150.000: Wall storey 2 wall 0 (part 8) over Gable storey 1 wall 0 (part 7)"],
  // Re-pinned by journal decision 231, as s9h250.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 11 conflicts, read off other parts.
  's9h300/Court0': ["Court0: n=(-1.000000, 0.000000, 0.000000) d=-100.000: Wall storey 2 wall 7 (part 22) over Gable storey 1 wall 8 (part 20)","Court0: n=(0.000000, -1.000000, 0.000000) d=-250.000: Wall storey 1 wall 13 (part 12) over Gable storey 0 wall 13 (part 3)","Court0: n=(0.000000, -1.000000, 0.000000) d=-50.000: Wall storey 1 wall 0 (part 12) over Gable storey 0 wall 0 (part 7)","Court0: n=(0.000000, -1.000000, 0.000000) d=-50.000: Wall storey 2 wall 0 (part 22) over Gable storey 1 wall 0 (part 18)","Court0: n=(0.000000, 1.000000, 0.000000) d=150.000: Wall storey 1 wall 15 (part 12) over Gable storey 0 wall 15 (part 4)","Court0: n=(0.000000, 1.000000, 0.000000) d=150.000: Wall storey 2 wall 6 (part 22) over Gable storey 1 wall 15 (part 15)","Court0: n=(0.000000, 1.000000, 0.000000) d=150.000: Wall storey 2 wall 6 (part 22) over Gable storey 1 wall 15 (part 18)","Court0: n=(0.000000, 1.000000, 0.000000) d=450.000: Wall storey 2 wall 4 (part 22) over Gable storey 1 wall 5 (part 19)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 1 wall 3 (part 12) over Gable storey 0 wall 2 (part 2)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 2 wall 2 (part 22) over Gable storey 1 wall 2 (part 13)","Court0: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 2 wall 3 (part 22) over Gable storey 1 wall 2 (part 13)"],
  's9h300/Court27': ["Court27: n=(0.000000, -1.000000, 0.000000) d=-150.000: Wall storey 2 wall 0 (part 8) over Gable storey 1 wall 0 (part 7)"],
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 1 conflict, read off other parts.
  's10h250/Court15': ["Court15: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 1 wall 5 (part 6) over Gable storey 0 wall 0 (part 4)"],
  // Enrolled by journal decisions 243 to 245 (WP-L2): its cut-piece overshoot is cured (a covered rise is built over it), and it is clean but for this conflict.
  's10h263/Court15': ["Court15: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 1 wall 5 (part 6) over Gable storey 0 wall 0 (part 4)"],
  // Enrolled by journal decisions 243 to 245 (WP-L2), as s10h263.
  's10h300/Court15': ["Court15: n=(1.000000, 0.000000, 0.000000) d=650.000: Wall storey 1 wall 5 (part 6) over Gable storey 0 wall 0 (part 4)"],
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 1 conflict, read off other parts.
  's10h250/Court18': ["Court18: n=(0.000000, 1.000000, 0.000000) d=400.000: Wall storey 2 wall 2 (part 14) over Gable storey 1 wall 2 (part 13)"],
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 1 conflict, read off other parts.
  's10h263/Court18': ["Court18: n=(0.000000, 1.000000, 0.000000) d=400.000: Wall storey 2 wall 2 (part 14) over Gable storey 1 wall 2 (part 13)"],
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 1 conflict, read off other parts.
  's10h300/Court18': ["Court18: n=(0.000000, 1.000000, 0.000000) d=400.000: Wall storey 2 wall 2 (part 14) over Gable storey 1 wall 2 (part 13)"],
  's11h250/Court35': ["Court35: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 1 wall 2 (part 6) over Gable storey 0 wall 3 (part 4)","Court35: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 2 wall 1 (part 9) over Gable storey 1 wall 2 (part 8)"],
  's11h263/Court35': ["Court35: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 1 wall 2 (part 6) over Gable storey 0 wall 3 (part 4)","Court35: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 2 wall 1 (part 9) over Gable storey 1 wall 2 (part 8)"],
  's11h300/Court35': ["Court35: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 1 wall 2 (part 6) over Gable storey 0 wall 3 (part 4)","Court35: n=(1.000000, 0.000000, 0.000000) d=600.000: Wall storey 2 wall 1 (part 9) over Gable storey 1 wall 2 (part 8)"],
  's12h250/Court2': ["Court2: n=(-1.000000, 0.000000, 0.000000) d=-50.000: Wall storey 1 wall 6 (part 7) over Gable storey 0 wall 6 (part 5)","Court2: n=(0.000000, 1.000000, 0.000000) d=550.000: Wall storey 1 wall 4 (part 7) over Gable storey 0 wall 4 (part 2)","Court2: n=(0.000000, 1.000000, 0.000000) d=550.000: Wall storey 2 wall 2 (part 12) over Gable storey 1 wall 4 (part 8)"],
  's12h263/Court2': ["Court2: n=(-1.000000, 0.000000, 0.000000) d=-50.000: Wall storey 1 wall 6 (part 7) over Gable storey 0 wall 6 (part 5)","Court2: n=(0.000000, 1.000000, 0.000000) d=550.000: Wall storey 1 wall 4 (part 7) over Gable storey 0 wall 4 (part 2)","Court2: n=(0.000000, 1.000000, 0.000000) d=550.000: Wall storey 2 wall 2 (part 12) over Gable storey 1 wall 4 (part 8)"],
  's12h300/Court2': ["Court2: n=(-1.000000, 0.000000, 0.000000) d=-50.000: Wall storey 1 wall 6 (part 7) over Gable storey 0 wall 6 (part 5)","Court2: n=(0.000000, 1.000000, 0.000000) d=550.000: Wall storey 1 wall 4 (part 7) over Gable storey 0 wall 4 (part 2)","Court2: n=(0.000000, 1.000000, 0.000000) d=550.000: Wall storey 2 wall 2 (part 12) over Gable storey 1 wall 4 (part 8)"],
};

/**
 * WP-G2: the split-band cases decision 3 cured that carry conflicts, as `GABLE_RISE_CONFLICTS` holds the courtyards'.
 * **Journal decision 220 (WP-G4.2)** enrols, from the default run's whole sweeps, the split courtyards that gained F69
 * conflicts as its accepted cost (`s1h250/SplitCourt13`, `s1h300/SplitCourt13` 4 to 5, `s1h250/SplitCourt14` 1 to 2,
 * `s1h300/SplitCourt20` 13 to 14, `s2h250/SplitCourt29`, `s2h300/SplitCourt29` 1 to 2), and re-pins
 * `s13h250/SplitCourt30` (3 to 2).
 * **Journal decision 264 (WP-C1)** enrols the conflicts of the six split courtyards it gives a Cheek
 * (`SPLIT_COURTYARD_DEFECTS`): `s1h250/SplitCourt1`, `s1h300/SplitCourt1` (3 to 4), `s2h250/SplitCourt11` (2 to 2, read
 * off other parts), `s2h300/SplitCourt11` (2 to 1), and re-pins `s2h250/SplitCourt29`, `s2h300/SplitCourt29` (the same 2,
 * read off other parts).
 */
export const GABLE_RISE_SPLIT_CONFLICTS: PinRecord<SeededKey<SplitCourtName>, readonly string[]> = {
  // Enrolled by journal decision 220: 4 conflicts to 5.
  's1h250/SplitCourt13': ["SplitCourt13: n=(-1.000000, 0.000000, 0.000000) d=-450.000: Wall storey 1 wall 13 (part 7) over Gable storey 0 wall 13 (part 2)","SplitCourt13: n=(-1.000000, 0.000000, 0.000000) d=-450.000: Wall storey 2 wall 4 (part 14) over Gable storey 1 wall 13 (part 9)","SplitCourt13: n=(0.000000, -1.000000, 0.000000) d=-350.000: Wall storey 1 wall 12 (part 7) over Gable storey 0 wall 12 (part 6)","SplitCourt13: n=(0.000000, -1.000000, 0.000000) d=-350.000: Wall storey 2 wall 3 (part 14) over Gable storey 1 wall 12 (part 13)","SplitCourt13: n=(0.000000, 1.000000, 0.000000) d=550.000: Wall storey 2 wall 8 (part 14) over Gable storey 1 wall 6 (part 12)"],
  // Enrolled by journal decision 220: 1 conflict to 2.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): 2 conflicts to 3.
  's1h250/SplitCourt14': ["SplitCourt14: n=(0.000000, -1.000000, 0.000000) d=-100.000: Wall storey 1 wall 0 (part 10) over Gable storey 0 wall 7 (part 5)","SplitCourt14: n=(0.000000, 1.000000, 0.000000) d=250.000: Wall storey 1 wall 2 (part 10) over Gable storey 0 wall 12 (part 5)","SplitCourt14: n=(0.000000, 1.000000, 0.000000) d=250.000: Wall storey 1 wall 2 (part 10) over Gable storey 0 wall 12 (part 7)"],
  // Enrolled by journal decision 220: 4 conflicts to 5.
  's1h300/SplitCourt13': ["SplitCourt13: n=(-1.000000, 0.000000, 0.000000) d=-450.000: Wall storey 1 wall 13 (part 7) over Gable storey 0 wall 13 (part 2)","SplitCourt13: n=(-1.000000, 0.000000, 0.000000) d=-450.000: Wall storey 2 wall 4 (part 14) over Gable storey 1 wall 13 (part 9)","SplitCourt13: n=(0.000000, -1.000000, 0.000000) d=-350.000: Wall storey 1 wall 12 (part 7) over Gable storey 0 wall 12 (part 6)","SplitCourt13: n=(0.000000, -1.000000, 0.000000) d=-350.000: Wall storey 2 wall 3 (part 14) over Gable storey 1 wall 12 (part 13)","SplitCourt13: n=(0.000000, 1.000000, 0.000000) d=550.000: Wall storey 2 wall 8 (part 14) over Gable storey 1 wall 6 (part 12)"],
  // Enrolled by journal decision 220: 13 conflicts to 14.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 14 conflicts, read off other parts.
  's1h300/SplitCourt20': ["SplitCourt20: n=(-1.000000, 0.000000, 0.000000) d=-150.000: Wall storey 1 wall 11 (part 10) over Gable storey 0 wall 1 (part 3)","SplitCourt20: n=(-1.000000, 0.000000, 0.000000) d=-150.000: Wall storey 1 wall 6 (part 10) over Gable storey 0 wall 1 (part 3)","SplitCourt20: n=(-1.000000, 0.000000, 0.000000) d=-150.000: Wall storey 2 wall 3 (part 18) over Gable storey 1 wall 11 (part 15)","SplitCourt20: n=(-1.000000, 0.000000, 0.000000) d=-150.000: Wall storey 2 wall 9 (part 20) over Gable storey 1 wall 6 (part 13)","SplitCourt20: n=(0.000000, -1.000000, 0.000000) d=-600.000: Wall storey 1 wall 7 (part 10) over Gable storey 0 wall 11 (part 2)","SplitCourt20: n=(0.000000, -1.000000, 0.000000) d=-600.000: Wall storey 1 wall 7 (part 10) over Gable storey 0 wall 11 (part 4)","SplitCourt20: n=(0.000000, -1.000000, 0.000000) d=-600.000: Wall storey 1 wall 8 (part 10) over Gable storey 0 wall 11 (part 2)","SplitCourt20: n=(0.000000, -1.000000, 0.000000) d=-600.000: Wall storey 2 wall 4 (part 20) over Gable storey 1 wall 7 (part 12)","SplitCourt20: n=(0.000000, -1.000000, 0.000000) d=-600.000: Wall storey 2 wall 5 (part 20) over Gable storey 1 wall 7 (part 12)","SplitCourt20: n=(0.000000, 1.000000, 0.000000) d=700.000: Wall storey 1 wall 4 (part 10) over Gable storey 0 wall 0 (part 2)","SplitCourt20: n=(0.000000, 1.000000, 0.000000) d=700.000: Wall storey 1 wall 5 (part 10) over Gable storey 0 wall 0 (part 2)","SplitCourt20: n=(0.000000, 1.000000, 0.000000) d=700.000: Wall storey 2 wall 7 (part 20) over Gable storey 1 wall 4 (part 12)","SplitCourt20: n=(0.000000, 1.000000, 0.000000) d=700.000: Wall storey 2 wall 8 (part 20) over Gable storey 1 wall 4 (part 12)","SplitCourt20: n=(1.000000, 0.000000, 0.000000) d=750.000: Wall storey 1 wall 2 (part 10) over Gable storey 0 wall 7 (part 7)"],
  // Enrolled by journal decision 264 (WP-C1), with its Cheek in SPLIT_COURTYARD_DEFECTS: 3 conflicts to 4.
  's1h250/SplitCourt1': ["SplitCourt1: n=(-1.000000, 0.000000, 0.000000) d=-600.000: Wall storey 1 wall 4 (part 11) over Gable storey 0 wall 12 (part 9)","SplitCourt1: n=(-1.000000, 0.000000, 0.000000) d=-600.000: Wall storey 2 wall 4 (part 16) over Gable storey 1 wall 4 (part 14)","SplitCourt1: n=(1.000000, 0.000000, 0.000000) d=900.000: Wall storey 1 wall 1 (part 11) over Gable storey 0 wall 6 (part 4)","SplitCourt1: n=(1.000000, 0.000000, 0.000000) d=900.000: Wall storey 2 wall 1 (part 16) over Gable storey 1 wall 1 (part 13)"],
  // Enrolled by journal decision 264 (WP-C1), as s1h250.
  's1h300/SplitCourt1': ["SplitCourt1: n=(-1.000000, 0.000000, 0.000000) d=-600.000: Wall storey 1 wall 4 (part 11) over Gable storey 0 wall 12 (part 9)","SplitCourt1: n=(-1.000000, 0.000000, 0.000000) d=-600.000: Wall storey 2 wall 4 (part 16) over Gable storey 1 wall 4 (part 14)","SplitCourt1: n=(1.000000, 0.000000, 0.000000) d=900.000: Wall storey 1 wall 1 (part 11) over Gable storey 0 wall 6 (part 4)","SplitCourt1: n=(1.000000, 0.000000, 0.000000) d=900.000: Wall storey 2 wall 1 (part 16) over Gable storey 1 wall 1 (part 13)"],
  // Enrolled by journal decision 264 (WP-C1), with its Cheek in SPLIT_COURTYARD_DEFECTS: 2 conflicts to 2, read off other parts.
  's2h250/SplitCourt11': ["SplitCourt11: n=(-1.000000, 0.000000, 0.000000) d=0.000: Wall storey 1 wall 0 (part 10) over Gable storey 0 wall 0 (part 4)","SplitCourt11: n=(-1.000000, 0.000000, 0.000000) d=0.000: Wall storey 1 wall 8 (part 10) over Gable storey 0 wall 8 (part 5)"],
  // Enrolled by journal decision 264 (WP-C1), with its Cheek in SPLIT_COURTYARD_DEFECTS: 2 conflicts to 1.
  's2h300/SplitCourt11': ["SplitCourt11: n=(-1.000000, 0.000000, 0.000000) d=0.000: Wall storey 1 wall 0 (part 10) over Gable storey 0 wall 0 (part 4)"],
  // Enrolled by journal decision 220: 1 conflict to 2.
  // Re-pinned by journal decision 264 (WP-C1), its Cheek in SPLIT_COURTYARD_DEFECTS: the same 2 conflicts, read off other parts.
  's2h250/SplitCourt29': ["SplitCourt29: n=(-1.000000, 0.000000, 0.000000) d=-150.000: Wall storey 1 wall 5 (part 8) over Gable storey 0 wall 5 (part 6)","SplitCourt29: n=(0.000000, -1.000000, 0.000000) d=-250.000: Wall storey 1 wall 2 (part 8) over Gable storey 0 wall 12 (part 7)"],
  // Enrolled by journal decision 220: 1 conflict to 2.
  // Re-pinned by journal decision 264 (WP-C1), as s2h250.
  's2h300/SplitCourt29': ["SplitCourt29: n=(-1.000000, 0.000000, 0.000000) d=-150.000: Wall storey 1 wall 5 (part 8) over Gable storey 0 wall 5 (part 6)","SplitCourt29: n=(0.000000, -1.000000, 0.000000) d=-250.000: Wall storey 1 wall 2 (part 8) over Gable storey 0 wall 12 (part 7)"],
  's2h250/SplitCourt10': ["SplitCourt10: n=(1.000000, 0.000000, 0.000000) d=800.000: Wall storey 1 wall 2 (part 7) over Gable storey 0 wall 7 (part 6)","SplitCourt10: n=(1.000000, 0.000000, 0.000000) d=800.000: Wall storey 2 wall 2 (part 10) over Gable storey 1 wall 2 (part 9)"],
  's2h263/SplitCourt10': ["SplitCourt10: n=(1.000000, 0.000000, 0.000000) d=800.000: Wall storey 1 wall 2 (part 7) over Gable storey 0 wall 7 (part 6)","SplitCourt10: n=(1.000000, 0.000000, 0.000000) d=800.000: Wall storey 2 wall 2 (part 10) over Gable storey 1 wall 2 (part 9)"],
  's2h300/SplitCourt10': ["SplitCourt10: n=(1.000000, 0.000000, 0.000000) d=800.000: Wall storey 1 wall 2 (part 7) over Gable storey 0 wall 7 (part 6)","SplitCourt10: n=(1.000000, 0.000000, 0.000000) d=800.000: Wall storey 2 wall 2 (part 10) over Gable storey 1 wall 2 (part 9)"],
  // Enrolled by journal decisions 243 to 245 (WP-L2): its 2 Unclassified Gable-Wall Edges are cured, and it is clean but for these conflicts.
  's7h250/SplitCourt9': ["SplitCourt9: n=(0.000000, -1.000000, 0.000000) d=-150.000: Wall storey 2 wall 0 (part 13) over Gable storey 1 wall 0 (part 11)","SplitCourt9: n=(1.000000, 0.000000, 0.000000) d=700.000: Gable storey 1 wall 5 (part 12) over Gable storey 2 wall 5 (part 18)","SplitCourt9: n=(1.000000, 0.000000, 0.000000) d=700.000: Wall storey 1 wall 5 (part 9) over Gable storey 0 wall 2 (part 5)","SplitCourt9: n=(1.000000, 0.000000, 0.000000) d=700.000: Wall storey 2 wall 5 (part 15) over Gable storey 1 wall 5 (part 12)"],
  // Re-pinned by journal decisions 243 to 245 (WP-L2): 1 conflict to 2.
  's5h250/SplitCourt29': ["SplitCourt29: n=(1.000000, 0.000000, 0.000000) d=950.000: Wall storey 1 wall 2 (part 8) over Gable storey 0 wall 1 (part 5)","SplitCourt29: n=(1.000000, 0.000000, 0.000000) d=950.000: Wall storey 2 wall 2 (part 12) over Gable storey 1 wall 2 (part 11)"],
  // Re-pinned by journal decision 220: 3 conflicts to 2; "Gable storey 0 wall 14 (part 3) over Gable storey 1 wall 3 (part 10)" is gone.
  // Re-pinned by journal decisions 243 to 245 (WP-L2): the same 2 conflicts, read off other parts.
  's13h250/SplitCourt30': ["SplitCourt30: n=(-1.000000, 0.000000, 0.000000) d=-500.000: Wall storey 1 wall 3 (part 8) over Gable storey 0 wall 14 (part 4)","SplitCourt30: n=(1.000000, 0.000000, 0.000000) d=700.000: Wall storey 1 wall 1 (part 8) over Gable storey 0 wall 2 (part 4)"],
};
