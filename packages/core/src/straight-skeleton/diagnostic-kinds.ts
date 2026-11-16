import type {SkeletonDiagnosticKind, StepRefusalKind} from "./types";

/*
 * WHICH DIAGNOSTIC KINDS BLOCK, STATED ONCE. `solveSkeleton`'s `complete` is "no diagnostic of a blocking kind, and at
 * least one interior edge"; every reader that sorts a result's diagnostics into blocking and informational reads it
 * here, so a kind core adds is blocking until it is listed below.
 */

/**
 * The diagnostic kinds that do NOT make a result incomplete (see `SkeletonDiagnosticKind`): the boundary stage's three
 * reports of what it did to the input, the coaxial completion, the causality oracles (which make a wrong answer
 * signalled, not incomplete) and the holed guard's un-culled self-loop (BSA.D318).
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

/** Every kind not listed as informational: a diagnostic of one of these makes a result incomplete. */
export type BlockingDiagnosticKind = Exclude<SkeletonDiagnosticKind, InformationalDiagnosticKind>;

/** Whether a diagnostic kind makes a result incomplete: every kind but the informational ones. */
export function isBlockingDiagnosticKind(kind: SkeletonDiagnosticKind): kind is BlockingDiagnosticKind {
    return !(INFORMATIONAL_DIAGNOSTIC_KINDS as readonly SkeletonDiagnosticKind[]).includes(kind);
}

/**
 * The kinds `refuseStep` refuses a step of several rings with, every {@link StepRefusalKind}. Both block. The refusal
 * also throws its own text, which `stepAlgorithm` records again as a `step-failure` with the identical detail.
 */
export const STEP_REFUSAL_KINDS = [
    'simultaneous-across-rings',
    'multi-ring-step-refused',
] as const satisfies readonly StepRefusalKind[];

/** Compile-time only: {@link STEP_REFUSAL_KINDS} lists every {@link StepRefusalKind}, and each one blocks. */
type EveryStepRefusalKindListed = [Exclude<StepRefusalKind, typeof STEP_REFUSAL_KINDS[number]>] extends [never]
    ? [StepRefusalKind] extends [BlockingDiagnosticKind] ? true : never
    : never;
const everyStepRefusalKindListed: EveryStepRefusalKindListed = true;
void everyStepRefusalKindListed;
