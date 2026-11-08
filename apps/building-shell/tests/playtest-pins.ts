// The pinned outcome of every playtest dump (journal decisions 72 and 123: enrol, never exclude; decision 148, F1:
// genus measured at enrolment and pinned).
//
// A dump in `fixtures/playtest/` with no pin must be accepted with no flag, keep every invariant with its roster genus
// (a seed: its subject names a roster fixture, `roster-genus.ts`) and no Cheek face, and, where it carries an output,
// show no difference in the full diff. Any other dump is shrunk to a minimal case and enrolled here with exactly its
// measured outcome, its genus per component included, so a cure breaks the suite as surely as a regression does. A pin
// leaves by its dump being fixed, never by a softened signature. Information lines and a legacy baseline are carried,
// never pinned (decisions 136 and 140).

/** A dump whose input the adapter refuses: exactly these reasons. */
export interface RefusedPin { kind: 'refused'; refused: string[] }

/**
 * A dump whose input the adapter accepts: its genus per component, highest first, measured at enrolment (decision 148,
 * F1; a seed may leave it to its roster pin), and exactly these flags, Cheek faces and invariant violations, and, for a
 * dump with an output, exactly these full-diff difference lines (`diffReportLines`, flags and information excluded).
 */
export interface AcceptedPin {
  kind: 'accepted';
  genus?: readonly number[];
  flags?: string[];
  cheeks?: number;
  violations?: string[];
  diff?: string[];
}

export type PlaytestPin = RefusedPin | AcceptedPin;

/** By dump stem, the name both files share before `.input.json` (decision 149). Empty: every dump today is a seed. */
export const PLAYTEST_PINS: Readonly<Record<string, PlaytestPin>> = {};
