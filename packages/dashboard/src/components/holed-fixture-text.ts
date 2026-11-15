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

/**
 * THE CANVAS'S OWN WORD WHILE CORE REFUSES THE CURRENT LOOPS (BSA.D323), drawn above them. The loops are stroked in
 * red and NOT FILLED: the solver has said they do not bound a region it accepts, and any fill (even-odd over the
 * loops, or the outline alone) would shade some hole as building.
 */
export const HOLED_REFUSED_CANVAS_TEXT =
    'Refused by the solver (see Edge Weights): the red loops are not filled, and have no skeleton.';

/** The same, when the last skeleton that solved is kept on screen as a ghost. */
export const HOLED_REFUSED_STALE_CANVAS_TEXT =
    'Refused by the solver (see Edge Weights): the red loops are not filled. Dashed grey is the last skeleton that '
    + 'solved, with its own outline; it is not this outline\'s.';

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
 * The two kinds core refuses a step of several rings with (`StepRefusalKind` in core's `wavefront.ts`). `refuseStep`
 * pushes the refusal AND throws the same text, which `stepAlgorithm` records again as a `step-failure` with the
 * identical detail; the alert shows such a pair once, as the refusal (BSA.D323).
 */
export const STEP_REFUSAL_KINDS = [
    'simultaneous-across-rings',
    'multi-ring-step-refused',
] as const satisfies readonly SkeletonDiagnosticKind[];

/**
 * The heading of each blocking kind in the `Skeleton incomplete` alert (decision 37's table as amended by decision
 * 50). EVERY HEADING IS WORDED FROM THE KIND'S OWN DOC COMMENT ON `SkeletonDiagnosticKind` in core's `types.ts`
 * (BSA.D323), so a heading never claims less or more than core says the kind covers.
 */
export const BLOCKING_DIAGNOSTIC_HEADINGS: Record<BlockingDiagnosticKind, string> = {
    'simultaneous-across-rings': 'Refused: in one layer of a step of several rings, events of different rings '
        + 'coincide in a form the solver does not settle (a vertex event across rings that is not one run on each of '
        + 'two rings, a layer that cannot be resolved whole holding an event across rings, or a meeting on a third '
        + 'front). The layer was refused before it changed anything; the skeleton stops at the refused step.',
    'multi-ring-step-refused': 'Refused: a step of several rings could not be handled without guessing (a ring of '
        + 'fewer than three bisectors at its start, no event at all, or rings the layer left that cannot be told outer '
        + 'from inner or assigned to a component). The skeleton stops at the refused step.',
    'step-failure': 'A sub-polygon threw during a solver step and was skipped; its bisectors stay unresolved.',
    'unresolved-edges': 'One or more interior edges finished the solve without a target node. On the finished '
        + 'skeleton, and on a step-through\'s last frame, they are drawn as dashed red rays.',
    'holed-topology-violation': 'The finished skeleton is not one connected graph whose cycle rank equals the hole '
        + 'count, or one of its arcs is recorded with two different pairs of walls. The solver distrusts it and marks '
        + 'it incomplete.',
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
