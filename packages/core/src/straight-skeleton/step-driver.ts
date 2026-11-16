import {
    AlgorithmStepInput,
    AlgorithmStepOutput,
    SkeletonLoop,
    SteppedAlgorithmResult,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "./types";
import {stepLog} from "./logger";
import {makeStraightSkeletonSolverContext} from "./solver-context";
import {initInteriorEdges, tryToAcceptExteriorEdge} from "./algorithm-helpers";
import {handleInteriorEdgePair, handleInteriorEdgeTriangle} from "./algorithm-termination-cases";
import {handleInteriorNGon} from "./algorithm-complex-cases";
import {ringsOfWavefront} from "./wavefront-links";
import {beginStep, endStep, refuseStep} from "./step-scope";

/*
 * THE STEP DRIVER: one step input dispatched to its handler by ring count and arity, a layer of step inputs stepped
 * with its failures caught per input, and a simple polygon run from initialisation to its last step boundary.
 */

export function handleAlgorithmStepInput(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepInput[] {
    const childSteps: AlgorithmStepInput[] = [];

    if (input.interiorEdges.length < 2) {
        throw new Error("Fewer than 2 interior edges is not a valid skeleton state")
    }

    // THE STEP IS RECORDED, AND ITS RINGS COUNTED FIRST (skeleton join-and-divide spec, decisions 4 and 22). The
    // struck-segment search reads the record; it is cleared however the step ends.
    beginStep(context, input.interiorEdges);
    try {
        const rings = ringsOfWavefront(context, input.interiorEdges);
        if (rings.length > 1) {
            // A STEP OF SEVERAL RINGS ALWAYS GOES TO THE N-GON, and never to the pair or triangle handler, which
            // are statements about one ring. In the generic case every ring has three bisectors or more.
            const short = rings.find(ring => ring.length < 3);
            if (short !== undefined) {
                refuseStep(context, 'multi-ring-step-refused', `a step of ${rings.length} rings holds the ring `
                    + `[${short.join(', ')}] of ${short.length} bisector(s); every ring of a generic step of several `
                    + `rings has three.`);
            }
            childSteps.push(...handleInteriorNGon(context, input));
            return childSteps;
        }

        if (input.interiorEdges.length === 2) {
            childSteps.push(...handleInteriorEdgePair(context, input))
        }

        if (input.interiorEdges.length === 3) {
            childSteps.push(...handleInteriorEdgeTriangle(context, input))
        }

        if (input.interiorEdges.length > 3) {
            childSteps.push(...handleInteriorNGon(context, input))
        }

        return childSteps;
    } finally {
        endStep(context);
    }
}

export function stepAlgorithm(context: StraightSkeletonSolverContext, inputs: AlgorithmStepInput[]): AlgorithmStepOutput {
    const childSteps: AlgorithmStepInput[] = [];
    const errors: string[] = [];

    for (const input of inputs) {
        try {
            for (const child of handleAlgorithmStepInput(context, input)) {
                // A CHILD WITH EXACTLY ONE LIVE INTERIOR EDGE IS A LOUD FAILURE, NEVER A SILENT DROP
                // (journal-5 decision 167(c), F74). One live bisector bounds no sub-polygon: it cannot
                // meet anything, so the ring that produced it was resolved into an inconsistent state —
                // F74's orphan, left when a later layer's merge re-joined onto the orphan's own source.
                // This filter used to drop such a child without a word, and the edge surfaced only as
                // an unresolved edge at the end. It is reported here as a `step-failure` naming the
                // edge and the ring it came from. A child with NO edges is a finished region, and goes.
                if (child.interiorEdges.length === 1) {
                    errors.push(`Sub-polygon [${input.interiorEdges.join(', ')}] left a child with one live `
                        + `interior edge, e${child.interiorEdges[0]}, which bounds no sub-polygon and can meet `
                        + `nothing: the ring was resolved into an inconsistent state.`);
                } else if (child.interiorEdges.length > 1) {
                    childSteps.push(child);
                }
            }
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }
    }

    if (errors.length > 0) {
        stepLog.warn(`stepAlgorithm: ${errors.length} sub-polygon(s) failed:\n${errors.join('\n')}`);
    }

    return {
        childSteps,
        errors
    }
}

/** Outcome of solving one simple (non-self-intersecting) polygon. */
export interface SimplePolygonRun {
    context: StraightSkeletonSolverContext;
    /** Messages accumulated from every `stepAlgorithm` iteration of this run. */
    errors: string[];
}

/**
 * Run the straight skeleton algorithm on a single simple (non-self-intersecting) polygon.
 *
 * `loops` is the loop table (skeleton loops-input spec, decision 10); omitted means one loop of all the nodes.
 * A HOLED RUN STEPS LIKE ANY OTHER (skeleton join-and-divide spec, decisions 24 and 34): a strike within a ring
 * divides it and a strike across rings joins them, by the one split rewrite, and the run ends, as a single loop's
 * does, when no step input remains. The stop after initialisation that stood here until node 4 is retired.
 *
 * `observer` is {@link solveSkeletonStepped}'s (dashboard holed-fixtures spec, decision 19): called after
 * `initInteriorEdges` and after each `tryToAcceptExteriorEdge` pass. It only reads. Omitted, the run is the one it
 * always was, so `solveSkeleton` is byte-identical.
 */
export function runSimplePolygon(
    nodes: Vector2[],
    perceptualFloor: number,
    weights?: readonly number[],
    loops?: readonly SkeletonLoop[],
    observer?: SolveStepObserver,
): SimplePolygonRun {
    const context = makeStraightSkeletonSolverContext(nodes, perceptualFloor, weights, loops);
    const exteriorEdges = [...context.graph.edges]
    const errors: string[] = [];

    initInteriorEdges(context);
    observer?.(context, []);

    // THE STEP BOUNDARIES (skeleton wavefront-order spec, decision 6), where the standing gate's probe checks
    // the links (decision 23), and the end of the solve, where it counts it. `null` in a normal solve.
    const probe = context.probe;

    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}]
    probe?.stepBoundary?.(context, inputs);
    while (inputs.length > 0) {
        const output = stepAlgorithm(context, inputs);
        errors.push(...output.errors);
        inputs = output.childSteps
        // AT THE STEP BOUNDARY, AND ONLY HERE (skeleton edge-acceptance spec, decision 4): nothing is pending.
        exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id))
        observer?.(context, output.errors);
        probe?.stepBoundary?.(context, inputs);
    }
    probe?.solveFinished?.(context, errors);

    return {context, errors}
}

/**
 * What {@link solveSkeletonStepped} watches a run with (dashboard holed-fixtures spec, decision 19): called once after
 * initialisation with no errors, and once after each step's acceptance pass with the errors that step recorded. It
 * reads the context and changes nothing.
 */
export type SolveStepObserver = (context: StraightSkeletonSolverContext, stepErrors: readonly string[]) => void;

export function runSimplePolygonStepped(
    nodes: Vector2[],
    perceptualFloor: number,
    weights?: readonly number[],
): SteppedAlgorithmResult {
    const context = makeStraightSkeletonSolverContext(nodes, perceptualFloor, weights);
    const exteriorEdges = [...context.graph.edges];

    initInteriorEdges(context);

    const snapshots: StraightSkeletonGraph[] = [structuredClone(context.graph)];
    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
    // The same step boundaries as `runSimplePolygon` (skeleton wavefront-order spec, decision 6).
    const probe = context.probe;
    probe?.stepBoundary?.(context, inputs);

    try {
        while (inputs.length > 0) {
            inputs = stepAlgorithm(context, inputs).childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
            probe?.stepBoundary?.(context, inputs);
            snapshots.push(structuredClone(context.graph));
        }
        return {snapshots, error: null};
    } catch (e) {
        snapshots.push(structuredClone(context.graph));
        return {snapshots, error: e instanceof Error ? e.message : String(e)};
    }
}
