// The pinned outcome of every playtest file that is not clean (journal decisions 72 and 123: enrol, never exclude).
//
// A file in `fixtures/playtest/` with no pin must be accepted with no flag, and keep every invariant with its genus as
// its Rings predict (`slab-genus.ts`) and no Cheek face. A file that does not is shrunk to a minimal case and enrolled
// here with exactly its measured outcome, so a cure breaks the suite as surely as a regression does. A pin leaves by
// its file being fixed, never by a softened signature.

/** A file the adapter refuses: exactly these reasons. */
export interface RefusedPin { refused: string[] }

/** A file the adapter accepts: exactly these flags, Cheek faces and invariant violations. */
export interface AcceptedPin { flags?: string[]; cheeks?: number; violations?: string[] }

export type PlaytestPin = RefusedPin | AcceptedPin;

/** By file name, `.json` included. Empty: every file in the folder today is clean. */
export const PLAYTEST_PINS: Readonly<Record<string, PlaytestPin>> = {};
