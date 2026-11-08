// The pinned outcome of every playtest dump (journal decisions 72 and 123: enrol, never exclude; decision 148, F1:
// genus measured at enrolment and pinned).
//
// A dump in `fixtures/playtest/` with no pin must be accepted with no flag, keep every invariant with its roster genus
// (a seed: its subject names a roster fixture, `roster-genus.ts`) and no Cheek face, and, where it carries an output,
// show no difference in the full diff. Any other dump is shrunk to a minimal case and enrolled here with exactly its
// measured outcome, its genus per component included, so a cure breaks the suite as surely as a regression does. A pin
// leaves by its dump being fixed, never by a softened signature. Information lines and a legacy baseline are carried,
// never pinned (decisions 136 and 140).
import type {PinRecord} from './pin-table.ts';

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

/** A dump's stem as decision 152 names it: `<dump basename>.<SolveIndex>.<Subject>.<Seed>`. */
export type DumpStem = `${string}.${number}.${string}.${number}`;

/** Whether a listed stem follows decision 152's naming, and so may carry a pin. */
const isDumpStem = (stem: string): stem is DumpStem => /^.+\.\d+\..+\.\d+$/.test(stem);

/**
 * By dump stem, the name both files share before `.input.json` (decision 149), keyed by decision 152's stem type
 * (decision 155, B4). Every roster seed takes its roster pin, so only the hand-edited seed is pinned:
 * - `MultiRunSide` (decisions 167, finding 1, and 179, finding 1), the oracle for spec 16's run snap order
 *   (`multiRunDocument`): accepted with no flag, and clean, a box of genus 0. Its subject names no roster fixture, so
 *   its pin carries its genus.
 */
export const PLAYTEST_PINS: PinRecord<DumpStem, PlaytestPin> = {
  'prototype-seed.0.MultiRunSide.0': {kind: 'accepted', genus: [0]},
};

/** A listed dump's pin by its stem; none for a stem outside decision 152's naming, which no pin can name. */
export const playtestPin = (stem: string): PlaytestPin | undefined => (isDumpStem(stem) ? PLAYTEST_PINS[stem] : undefined);
