import type {StepRefusalKind, StraightSkeletonSolverContext} from "./types";

// ── The current step (skeleton join-and-divide spec, decisions 4 and 22) ─────────────────────────

/**
 * WHICH STEP IS RUNNING. `handleAlgorithmStepInput` opens a scope for the step it is about to handle, holds it on the
 * context as `context.step` while the step runs, and clears it when the step returns or throws. The struck-segment
 * search reads it: a split may strike only a segment whose `from` stands in the current step (decision 4), because a
 * ring of another step is another part of the region. Outside a step — a direct call from a unit test, or the
 * dashboard pricing events between steps — `context.step` is `null` and every segment is searched.
 *
 * ON THE CONTEXT FOR THE REASON THE FLOOR IS: its one reader below the step's own handlers,
 * `validateSplitReachesEdge`, is a context method reached from the event pricing four calls down.
 */
export interface StepScope {
    /** The step's bisectors, which the struck-segment search is restricted to. */
    readonly members: ReadonlySet<number>;
}

/** Open the scope of the step about to be handled, held on the context until {@link endStep}. */
export function beginStep(context: StraightSkeletonSolverContext, interiorEdgeIds: readonly number[]): StepScope {
    const step: StepScope = {members: new Set(interiorEdgeIds)};
    context.step = step;
    return step;
}

/** The step has returned or thrown: no scope is held, and every segment is searched again. */
export function endStep(context: StraightSkeletonSolverContext): void {
    context.step = null;
}

/** The bisectors of the step being handled, or `null` outside a step. */
export function currentStepMembers(context: StraightSkeletonSolverContext): ReadonlySet<number> | null {
    return context.step?.members ?? null;
}

/**
 * REFUSE THE CURRENT STEP, BY NAME: push a blocking diagnostic naming the step's bisectors and the reason, and throw
 * the same text, which `stepAlgorithm` records as the step's failure. Never a guess (decision 16), and never silent.
 */
export function refuseStep(context: StraightSkeletonSolverContext, kind: StepRefusalKind, reason: string): never {
    const members = currentStepMembers(context);
    const step = members === null ? 'outside a step' : `[${[...members].sort((a, b) => a - b).join(', ')}]`;
    const detail = `Step ${step}: ${reason}`;
    context.diagnostics.push({kind, detail});
    throw new Error(detail);
}
