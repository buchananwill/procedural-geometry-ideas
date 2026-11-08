// Journal decisions 72, 150 (F4) and 155 (B5): the tests' one pin-table shape. A pin is a measured outcome, enrolled,
// never excluded: a case not listed keeps every invariant, and a cure or a moved defect breaks its test.
import type {ResidueClass} from '../src/golden.ts';

/**
 * The tests' one pin-record shape: every case that measures other than clean, with exactly its measured value `V`,
 * keyed by the name type `K` its generator emits (journal decision 155, B4 and B5). A case not listed is clean.
 */
export type PinRecord<K extends string, V> = Readonly<Partial<Record<K, V>>>;

/**
 * A case's measured outcome (journal decision 160, N3): its invariant violations, or `throwsOutcome` of its error, one
 * line each. A clean case's is empty.
 */
export type PinOutcome = readonly string[];

/** What every pin carries: its exact outcome. */
export interface Pin { outcome: PinOutcome }

/**
 * Why a pinned residue fails (journal decisions 150, F3, and 156, F7), read from its signature: each pinned case
 * carries its class explicitly, so an inherited defect and a regression a rule exposes are never confused.
 */
export type DefectCause =
  | 'roof-gable algorithm B, Cheek class'
  | "decision 132's cut rule exposes algorithm B's Cheek class (a regression)"
  | 'roof-gable algorithm B, cut-piece overshoot'
  | 'partial face-to-face contact of two storeys on one plane (Court25 class)'
  | 'edge contact between opposite coplanar faces (U8 class)'
  | 'cleanMesh stuck cap'
  | "a Cell corner in no triangle of its face's fan"
  | "a Gable-Wall edge, Unclassified (SplitCourt9 class)";

/** One pinned residue whose cause `causeOf` reads from its signature: its cause and its exact outcome. */
export interface CausedPin extends Pin { cause: DefectCause }

/**
 * One pinned residue with no `DefectCause` (journal decision 163, N3): its residue class by its stable name, and its
 * exact outcome. A table may hold several classes, so the class is the pin's own.
 */
export interface ClassedPin extends Pin { residueClass: ResidueClass }

/** Either kind of pinned residue. */
export type ResiduePin = CausedPin | ClassedPin;

/** A pin table whose every entry carries its cause. */
export type CausedPinTable<K extends string> = PinRecord<K, CausedPin>;

/** A pin table whose every entry carries its residue class (journal decision 163, N3). */
export type ClassedPinTable<K extends string> = PinRecord<K, ClassedPin>;

/** Each `DefectCause`'s residue class (journal decisions 161, Info, and 163, B1). */
export type CauseClasses = Readonly<Record<DefectCause, ResidueClass>>;

/**
 * Each pinned cause's residue class (journal decision 161, Info). Exhaustive over `DefectCause`, so a cause added to the
 * pins without a class fails `typecheck`. Decision 132's regressions are the Cheek class, exposed by the cut rule.
 */
export const CAUSE_CLASSES: CauseClasses = {
  'roof-gable algorithm B, Cheek class': 'algorithm-B Cheek',
  "decision 132's cut rule exposes algorithm B's Cheek class (a regression)": 'algorithm-B Cheek',
  'roof-gable algorithm B, cut-piece overshoot': 'algorithm-B cut-piece overshoot',
  'partial face-to-face contact of two storeys on one plane (Court25 class)': 'partial coplanar contact of two storeys',
  'edge contact between opposite coplanar faces (U8 class)': 'edge contact between opposite coplanar faces',
  'cleanMesh stuck cap': 'cleanMesh stuck cap',
  "a Cell corner in no triangle of its face's fan": 'Cell outside its face fan',
  'a Gable-Wall edge, Unclassified (SplitCourt9 class)': 'Gable-Wall edge Unclassified',
};

/** A pinned residue's class: its cause's (`CAUSE_CLASSES`), or the one it carries. */
export const pinClass = (pin: ResiduePin): ResidueClass => ('cause' in pin ? CAUSE_CLASSES[pin.cause] : pin.residueClass);

/** Decision 150, F3: decision 132's two regressions, by seed and case, at every height. */
const REGRESSIONS_132 = new Set(['s1/Court14', 's6/Court23']);

/**
 * A residue's class from its outcome, the rule the pins' explicit causes are checked against. `key` is
 * `s<seed>h<height>/<name>`.
 */
export function causeOf(key: string, outcome: PinOutcome): DefectCause | null {
  const [first = ''] = outcome;
  const seedCase = key.replace(/h\d+\//, '/');
  if (/lies in no triangle of its face's fan/.test(first)) return "a Cell corner in no triangle of its face's fan";
  if (/^cheeks /.test(first)) return REGRESSIONS_132.has(seedCase) ? "decision 132's cut rule exposes algorithm B's Cheek class (a regression)" : 'roof-gable algorithm B, Cheek class';
  if (/^survivingInternal /.test(first) && outcome.some(l => /Unclassified Edges/.test(l))) return 'roof-gable algorithm B, cut-piece overshoot';
  if (/reads ShellEdge \d+, its NetEdge -1/.test(first)) return 'partial face-to-face contact of two storeys on one plane (Court25 class)';
  if (/two Cells run the same way along one NetEdge/.test(first)) return 'edge contact between opposite coplanar faces (U8 class)';
  if (/cleanMesh: cap .* can neither flip nor merge/.test(first)) return 'cleanMesh stuck cap';
  if (/^\d+ Unclassified Edges/.test(first) && outcome.length === 1) return "a Gable-Wall edge, Unclassified (SplitCourt9 class)";
  return null;
}

/**
 * A build that throws, as its one outcome line (journal decision 160, N2): `throws: ` and the error's message. The one
 * form the sweeps measure, the pins hold and the golden tie reads a manifest error back as.
 */
export const throwsOutcome = (error: string): string => `throws: ${error}`;

/**
 * The tests' one pin accessor (journal decision 160, N3): a case's pinned outcome, or none for a case the table does not
 * list, from a table of either kind.
 */
export const pinnedOutcome = <K extends string>(table: PinRecord<K, Pin>, key: K): PinOutcome => table[key]?.outcome ?? [];
