import {
    AlgorithmStepInput,
    AlgorithmStepOutput, CollisionEvent,
    PolygonNode,
    SkeletonDiagnostic,
    SkeletonSolveResult,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "./types";
import {stepLog} from "./logger";
import {
    areEqual,
    dotProduct,
    normalize,
    subtractVectors,
    vectorsAreEqual
} from "./core-functions";
import {bestNonPhantomCollision, collideInteriorEdges} from "./collision-helpers";
import {makeStraightSkeletonSolverContext} from "./solver-context";
import {initInteriorEdges, tryToAcceptExteriorEdge} from "./algorithm-helpers";
import {handleInteriorNGon} from "./algorithm-complex-cases";
import {TRIANGLE_INTERSECT_PAIRINGS} from "./constants";
import {decomposePolygon} from "./polygon-decomposition";
import {mergeSkeletonGraphs, makeMergedSolverContext} from "./graph-merge";
import {isClockwise} from "../random-polygon/geometry-helpers";

function stringifyFinalData(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): string {
    return `{"polygonEdges" :${JSON.stringify(context.getEdges(input.interiorEdges))}, "interiorEdges": ${JSON.stringify(context.getInteriorEdges(input.interiorEdges))}, "sourceNodes": ${JSON.stringify(input.interiorEdges.map(e => context.graph.nodes[context.getEdgeWithId(e).source]))}}`
}

/**
 * For a given edge, scan all existing nodes to see if any node lies exactly
 * along the edge's basis direction from its source.  If found, wire up
 * target / inEdges and return true.
 *
 * Several nodes can be collinear with the ray — an apex vertex sits directly beyond the
 * ridge node it feeds, for instance — so the *nearest* one wins. A bisector ends where the
 * wavefront next arrives, and taking any further node instead runs the edge backwards
 * through skeleton the solver has already resolved.
 */
function tryAttachEdgeToNode(context: StraightSkeletonSolverContext, edgeId: number): boolean {
    const edgeData = context.getEdgeWithId(edgeId);
    const source = context.findSource(edgeId);

    let nearest: PolygonNode | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < context.graph.nodes.length; i++) {
        if (i === edgeData.source) continue;
        const candidate = context.graph.nodes[i];
        const [direction, distance] = normalize(subtractVectors(candidate.position, source.position));
        if (distance > 0 && distance < nearestDistance && vectorsAreEqual(direction, edgeData.basisVector)) {
            nearest = candidate;
            nearestDistance = distance;
        }
    }

    if (nearest === undefined) {
        return false;
    }

    edgeData.target = nearest.id;
    nearest.inEdges.push(edgeId);
    return true;
}

/**
 * Pre-pass: try to resolve every edge in the input by snapping it to an
 * existing node.  Returns the list of edge IDs that could NOT be resolved
 * (and therefore still need collision handling).
 */
function resolveEdgesPointingAtNodes(context: StraightSkeletonSolverContext, edgeIds: number[]): number[] {
    const unresolved: number[] = [];
    for (const id of edgeIds) {
        if (!tryAttachEdgeToNode(context, id)) {
            unresolved.push(id);
        }
    }
    return unresolved;
}

export function handleInteriorEdgePair(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length !== 2) {
        throw new Error("Invalid call: expecting two interior edges");
    }

    const remaining = resolveEdgesPointingAtNodes(context, input.interiorEdges);

    // All edges resolved without collision
    if (remaining.length === 0) {
        context.acceptAll(input.interiorEdges);
        return {childSteps: []};
    }

    // One edge resolved, the other still needs a target — try to snap it too
    if (remaining.length === 1) {
        // The resolved edge created a new target node; re-attempt the remaining one
        if (tryAttachEdgeToNode(context, remaining[0])) {
            context.acceptAll(input.interiorEdges);
            return {childSteps: []};
        }
    }

    // Fall back to collision-based resolution
    const [id1, id2] = input.interiorEdges;
    const edgeData1 = context.getEdgeWithId(id1);
    const edgeData2 = context.getEdgeWithId(id2);

    const dotEdges = dotProduct(edgeData1.basisVector, edgeData2.basisVector);
    // Head on Collision
    if (areEqual(dotEdges, -1)) {
        context.crossWireEdges(id1, id2);
    } else {
        const collisions = collideInteriorEdges(context.getInteriorWithId(id1), context.getInteriorWithId(id2), context);
        if (collisions.length === 0) {
            throw new Error(`Unable to generate any collision from last two edges: ${stringifyFinalData(context, input)}`)
        }

        // Pick the best (lowest offset, non-phantom) collision
        const best = bestNonPhantomCollision(collisions)!;

        // Co-linear collapse: cross-wire sources
        const intersectionType = best.intersectionData[2];
        if (intersectionType === 'co-linear-from-1') {
            context.crossWireEdges(id1, id2);
        } else {
            // Standard convergence — wire both edges to the collision point
            context.terminateEdgesAtPoint([id1, id2], best.position);
        }
    }

    context.acceptAll(input.interiorEdges);

    return {
        childSteps: []
    }
}

export function handleInteriorEdgeTriangle(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length !== 3) {
        throw new Error("Invalid call: expecting three interior edges");
    }

    const allCollisions: CollisionEvent[] = [];
    for (const [index1, index2] of TRIANGLE_INTERSECT_PAIRINGS) {
        const edge1 = context.getInteriorWithId(input.interiorEdges[index1]);
        const edge2 = context.getInteriorWithId(input.interiorEdges[index2]);
        allCollisions.push(...collideInteriorEdges(edge1, edge2, context));
    }

    // Pick the best non-phantom collision; fall back to any collision
    const best = bestNonPhantomCollision(allCollisions);

    if (!best) {
        throw new Error(`Failed to collide interior edges in triangle: ${stringifyFinalData(context, input)}`);
    }

    context.terminateEdgesAtPoint(input.interiorEdges, best.position);

    context.acceptAll(input.interiorEdges);

    return {
        childSteps: []
    }
}


export function handleAlgorithmStepInput(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    const result: AlgorithmStepOutput = {
        childSteps: []
    };

    if (input.interiorEdges.length < 2) {
        throw new Error("Fewer than 2 interior edges is not a valid skeleton state")
    }

    if (input.interiorEdges.length === 2) {
        result.childSteps.push(...handleInteriorEdgePair(context, input).childSteps)
    }

    if (input.interiorEdges.length === 3) {
        result.childSteps.push(...handleInteriorEdgeTriangle(context, input).childSteps)
    }

    if (input.interiorEdges.length > 3) {
        result.childSteps.push(...handleInteriorNGon(context, input).childSteps)
    }

    return result;
}

export function stepAlgorithm(context: StraightSkeletonSolverContext, inputs: AlgorithmStepInput[]): AlgorithmStepOutput {
    const childSteps: AlgorithmStepInput[] = [];
    const errors: string[] = [];

    for (const input of inputs) {
        try {
            childSteps.push(...handleAlgorithmStepInput(context, input).childSteps);
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }
    }

    if (errors.length > 0) {
        stepLog.warn(`stepAlgorithm: ${errors.length} sub-polygon(s) failed:\n${errors.join('\n')}`);
    }

    return {
        childSteps: childSteps.filter(steps => steps.interiorEdges.length > 1),
        errors
    }
}

/** Outcome of solving one simple (non-self-intersecting) polygon. */
interface SimplePolygonRun {
    context: StraightSkeletonSolverContext;
    /** Messages accumulated from every `stepAlgorithm` iteration of this run. */
    errors: string[];
}

/** Run the straight skeleton algorithm on a single simple (non-self-intersecting) polygon. */
function runSimplePolygon(nodes: Vector2[]): SimplePolygonRun {
    const context = makeStraightSkeletonSolverContext(nodes);
    const exteriorEdges = [...context.graph.edges]
    const errors: string[] = [];

    initInteriorEdges(context);

    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}]
    while (inputs.length > 0) {
        const output = stepAlgorithm(context, inputs);
        errors.push(...(output.errors ?? []));
        inputs = output.childSteps
        exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id))
    }

    return {context, errors}
}

/**
 * Legacy entry point, preserved verbatim for existing callers.
 *
 * It reports nothing about how well the solve went, and retains three silent-failure modes:
 * 1. Counter-clockwise input does not throw — it yields a graph with only the boundary and no
 *    resolved interior edges.
 * 2. Per-sub-polygon exceptions are swallowed by `stepAlgorithm`, so a partially-resolved
 *    skeleton is indistinguishable from a complete one.
 * 3. Self-intersecting input returns the merged solver context, whose helpers throw when called.
 *
 * Prefer {@link solveSkeleton}, which normalises winding, reports diagnostics, and returns
 * `context: null` instead of a throwing stub for the merged path.
 */
export function runAlgorithmV5(nodes: Vector2[]): StraightSkeletonSolverContext {
    if (nodes.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }

    const decomposition = decomposePolygon(nodes);

    if (!decomposition.wasSelfIntersecting) {
        return runSimplePolygon(nodes).context;
    }

    const subResults = decomposition.subPolygons.map(subPoly => ({
        graph: runSimplePolygon(subPoly).context.graph,
    }));

    const merged = mergeSkeletonGraphs(subResults, decomposition.crossingPoints);
    return makeMergedSolverContext(merged);
}

export interface SolveSkeletonOptions {
    /**
     * Reverse counter-clockwise input before solving. The solver only handles clockwise
     * winding; leaving this off on counter-clockwise input produces an unresolved skeleton.
     * Defaults to `true`.
     */
    normaliseWinding?: boolean;
}

/** Collect the interior edges of a solved graph that never acquired a target node. */
function findUnresolvedInteriorEdgeIds(graph: StraightSkeletonGraph): number[] {
    return graph.interiorEdges
        .filter(interiorEdge => graph.edges[interiorEdge.id]?.target === undefined)
        .map(interiorEdge => interiorEdge.id);
}

function pushStepFailures(diagnostics: SkeletonDiagnostic[], errors: string[]): void {
    for (const error of errors) {
        diagnostics.push({kind: 'step-failure', detail: error});
    }
}

/**
 * Primary entry point: solve the straight skeleton and report how complete the answer is.
 *
 * Unlike {@link runAlgorithmV5}, every degraded outcome is visible on the returned value —
 * winding correction, self-intersection, swallowed step failures, and interior edges that
 * never resolved all appear in `diagnostics`, and `complete` summarises whether the skeleton
 * can be trusted.
 *
 * Throws only when there are fewer than three vertices.
 */
export function solveSkeleton(vertices: Vector2[], options?: SolveSkeletonOptions): SkeletonSolveResult {
    if (vertices.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }

    const normaliseWinding = options?.normaliseWinding ?? true;
    const diagnostics: SkeletonDiagnostic[] = [];

    let workingVertices = vertices;
    if (normaliseWinding && !isClockwise(vertices)) {
        workingVertices = [...vertices].reverse();
        diagnostics.push({
            kind: 'winding-normalised',
            detail: `Input was counter-clockwise; ${vertices.length} vertices reversed to clockwise winding before solving.`,
        });
    }

    const decomposition = decomposePolygon(workingVertices);

    let graph: StraightSkeletonGraph;
    let context: StraightSkeletonSolverContext | null;

    if (decomposition.wasSelfIntersecting) {
        diagnostics.push({
            kind: 'self-intersecting',
            detail: `Input self-intersects; decomposed into ${decomposition.subPolygons.length} sub-polygon(s) at ${decomposition.crossingPoints.length} crossing point(s) and merged. Solver context is unavailable for merged results.`,
        });

        const subResults = decomposition.subPolygons.map(subPolygon => {
            const run = runSimplePolygon(subPolygon);
            pushStepFailures(diagnostics, run.errors);
            return {graph: run.context.graph};
        });

        graph = mergeSkeletonGraphs(subResults, decomposition.crossingPoints).graph;
        context = null;
    } else {
        const run = runSimplePolygon(workingVertices);
        pushStepFailures(diagnostics, run.errors);
        graph = run.context.graph;
        context = run.context;
    }

    const unresolvedEdgeIds = findUnresolvedInteriorEdgeIds(graph);
    if (unresolvedEdgeIds.length > 0) {
        diagnostics.push({
            kind: 'unresolved-edges',
            detail: `${unresolvedEdgeIds.length} interior edge(s) finished without a target node: ${unresolvedEdgeIds.join(', ')}.`,
        });
    }

    const blocking = diagnostics.some(d => d.kind === 'step-failure' || d.kind === 'unresolved-edges');
    const complete = !blocking && graph.interiorEdges.length > 0;

    return {graph, context, complete, diagnostics};
}

export interface SteppedAlgorithmResult {
    /** Graph snapshots: index 0 = after init, 1..N = after each while-loop iteration */
    snapshots: StraightSkeletonGraph[];
    /** Non-null if the algorithm threw an error */
    error: string | null;
}

export function runAlgorithmV5Stepped(nodes: Vector2[]): SteppedAlgorithmResult {
    if (nodes.length < 3) {
        return {snapshots: [], error: "Must have at least three nodes to perform algorithm"};
    }

    const decomposition = decomposePolygon(nodes);

    if (!decomposition.wasSelfIntersecting) {
        return runSimplePolygonStepped(nodes);
    }

    // For decomposed polygons, run each sub-polygon stepped and concatenate snapshots,
    // with the merged graph as the final snapshot.
    const allSnapshots: StraightSkeletonGraph[] = [];
    const subGraphs: StraightSkeletonGraph[] = [];
    let lastError: string | null = null;

    for (const subPoly of decomposition.subPolygons) {
        const result = runSimplePolygonStepped(subPoly);
        allSnapshots.push(...result.snapshots);
        if (result.error) lastError = result.error;
        if (result.snapshots.length > 0) {
            subGraphs.push(result.snapshots[result.snapshots.length - 1]);
        }
    }

    // Append merged graph as final snapshot
    const merged = mergeSkeletonGraphs(
        subGraphs.map(graph => ({graph})),
        decomposition.crossingPoints,
    );
    allSnapshots.push(merged.graph);

    return {snapshots: allSnapshots, error: lastError};
}

function runSimplePolygonStepped(nodes: Vector2[]): SteppedAlgorithmResult {
    const context = makeStraightSkeletonSolverContext(nodes);
    const exteriorEdges = [...context.graph.edges];

    initInteriorEdges(context);

    const snapshots: StraightSkeletonGraph[] = [structuredClone(context.graph)];
    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

    try {
        while (inputs.length > 0) {
            inputs = stepAlgorithm(context, inputs).childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
            snapshots.push(structuredClone(context.graph));
        }
        return {snapshots, error: null};
    } catch (e) {
        snapshots.push(structuredClone(context.graph));
        return {snapshots, error: e instanceof Error ? e.message : String(e)};
    }
}