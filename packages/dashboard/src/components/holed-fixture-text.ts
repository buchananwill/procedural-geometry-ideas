import type { SkeletonDiagnosticKind } from '@proc-geo/core';

/*
 * ============================================================================
 *  WHAT THE DASHBOARD SAYS ABOUT A HOLED FIXTURE (dashboard holed-fixtures spec, decisions 6, 34, 35, 37 and 38).
 * ============================================================================
 *
 * Every sentence shown for a holed fixture, as a constant, so a test can hold the panels and the boundary to one
 * wording. A core refusal is never reworded here: it names its loop and the caller's vertex, and is shown verbatim
 * (decision 36).
 */

/** `ControlsPanel`'s holed notice (decision 6). */
export function holedNoticeText(name: string, holeCount: number): string {
    return `“${name}”: ${holeCount} hole(s), drawn read-only. Outline vertices and weights stay editable. Loading a `
        + `fixture, pasting, generating or Reset Polygon removes the holes.`;
}

/** Why Copy Vertices is off while holes are loaded (decision 6). */
export const HOLED_COPY_DISABLED_TEXT = 'Copy holds one ring, so it is off while holes are loaded.';

/** Why the recursive page's editor bridge is off while the editor holds a holed fixture (decision 34). */
export const HOLED_BRIDGE_DISABLED_TEXT =
    'The editor holds a holed fixture, and recursive subdivision needs a skeleton that is a tree.';

/** The parcels page's stop at slicing (decision 35). */
export const HOLED_SLICE_REFUSAL_TEXT =
    'Parcel slicing takes no holed region: a strip carries no loop, and lots of a holed footprint are outside this '
    + 'arc (BSA.D282). The skeleton, offset rings and strips shown are the holed solve\'s.';

/** The skeleton page's instruction for a holed fixture (decision 40). */
export const HOLED_INSTRUCTION_TEXT = 'A holed fixture\'s holes are read-only; its outline can still be edited.';

/** The title of the alert a holed result with `complete: false` raises (decision 37). */
export const SKELETON_INCOMPLETE_TITLE = 'Skeleton incomplete';

/**
 * The diagnostic kinds that do NOT make a result incomplete, as `SkeletonDiagnosticKind`'s doc comment in core and
 * `SkeletonSolveResult.complete` state them: the boundary stage's three reports, the coaxial completion, the causality
 * oracles and the holed guard's self-loop (BSA.D318). Listed inside the collapse (decision 38), never as a heading.
 */
export const INFORMATIONAL_DIAGNOSTIC_KINDS = [
    'winding-normalised',
    'vertices-canonicalised',
    'self-intersecting',
    'coaxial-completion',
    'causality-violation',
    'holed-unculled-self-loop',
] as const satisfies readonly SkeletonDiagnosticKind[];

export type InformationalDiagnosticKind = typeof INFORMATIONAL_DIAGNOSTIC_KINDS[number];

/**
 * Every kind core blocks on. EVERY KIND NOT LISTED AS INFORMATIONAL IS TREATED AS BLOCKING, so a kind core adds gets
 * no heading below until one is written, and the `Record` then fails to compile: a blocking kind is never shown
 * without its heading (decision 50).
 */
export type BlockingDiagnosticKind = Exclude<SkeletonDiagnosticKind, InformationalDiagnosticKind>;

/**
 * The heading of each blocking kind in the `Skeleton incomplete` alert (decision 37's table as amended by decision
 * 50). The holed guard's four are worded from each kind's own doc comment in core (`types.ts`, `holed-guard.ts`).
 */
export const BLOCKING_DIAGNOSTIC_HEADINGS: Record<BlockingDiagnosticKind, string> = {
    'simultaneous-across-rings': 'Events of more than two fronts coincide (for example a corner of each of two holes '
        + 'reaching one wall together). The solver refuses such a layer; the skeleton stops at the refused step.',
    'multi-ring-step-refused': 'A step of several rings could not be resolved without guessing, and was refused. The '
        + 'skeleton stops there.',
    'step-failure': 'A step threw and was skipped; its bisectors stay unresolved.',
    'unresolved-edges': 'These bisectors never met anything; they are drawn as dashed rays.',
    'holed-topology-violation': 'The finished skeleton is not one connected graph with one cycle round each hole, or '
        + 'one of its arcs names two different pairs of walls. The solver distrusts it and marks it incomplete.',
    'holed-equal-time-violation': 'An interior node is not at one time from every wall that meets there. The solver '
        + 'distrusts the skeleton and marks it incomplete.',
    'holed-time-order-violation': 'An interior edge runs backwards in time: its target is earlier than its source. '
        + 'The solver distrusts the skeleton and marks it incomplete.',
    'holed-planarity-violation': 'Two arcs of the skeleton cross inside both, or two collinear arcs overlap. The '
        + 'solver distrusts the skeleton and marks it incomplete.',
};

/** Whether a diagnostic kind is one core blocks on: every kind but the informational ones. */
export function isBlockingDiagnosticKind(kind: SkeletonDiagnosticKind): kind is BlockingDiagnosticKind {
    return !(INFORMATIONAL_DIAGNOSTIC_KINDS as readonly SkeletonDiagnosticKind[]).includes(kind);
}
