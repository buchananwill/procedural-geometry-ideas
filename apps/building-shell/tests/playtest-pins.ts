// The pinned outcome of every playtest dump that is not clean (journal decisions 72 and 123: enrol, never exclude).
//
// A dump in `fixtures/playtest/` with no pin must be accepted with no flag, keep every invariant with its genus as its
// Rings predict (`slab-genus.ts`) and no Cheek face, and, where it carries an output, show no difference in the full
// diff. A dump that does not is shrunk to a minimal case and enrolled here with exactly its measured outcome, so a
// cure breaks the suite as surely as a regression does. A pin leaves by its dump being fixed, never by a softened
// signature. Information lines and a legacy baseline are carried, never pinned (decisions 136 and 140).

/** A dump whose input the adapter refuses: exactly these reasons. */
export interface RefusedPin { kind: 'refused'; refused: string[] }

/**
 * A dump whose input the adapter accepts: exactly these flags, Cheek faces and invariant violations, and, for a dump
 * with an output, exactly these full-diff difference lines (`diffReportLines`, flags and information excluded).
 */
export interface AcceptedPin { kind: 'accepted'; flags?: string[]; cheeks?: number; violations?: string[]; diff?: string[] }

export type PlaytestPin = RefusedPin | AcceptedPin;

/** By dump subject, the basename both files share. Empty: every dump in the folder today is clean. */
export const PLAYTEST_PINS: Readonly<Record<string, PlaytestPin>> = {};
