import {
    AlgorithmStepInput,
    AlgorithmStepOutput, CollisionEvent,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {stepLog} from "@/algorithms/straight-skeleton/logger";
import {
    areEqual,
    dotProduct,
    normalize,
    subtractVectors,
    vectorsAreEqual
} from "@/algorithms/straight-skeleton/core-functions";
import {collideInteriorEdges} from "@/algorithms/straight-skeleton/collision-helpers";
import {makeStraightSkeletonSolverContext} from "@/algorithms/straight-skeleton/solver-context";
import {initInteriorEdges, tryToAcceptExteriorEdge} from "@/algorithms/straight-skeleton/algorithm-helpers";
import {handleInteriorEdges} from "@/algorithms/straight-skeleton/algorithm-complex-cases";
import {TRIANGLE_INTERSECT_PAIRINGS} from "@/algorithms/straight-skeleton/constants";

function stringifyFinalData(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): string {
    return `{"polygonEdges" :${JSON.stringify(context.getEdges(input.interiorEdges))}, "interiorEdges": ${JSON.stringify(context.getInteriorEdges(input.interiorEdges))}, "sourceNodes": ${JSON.stringify(input.interiorEdges.map(e => context.graph.nodes[context.getEdgeWithId(e).source]))}}`
}

/**
 * For a given edge, scan all existing nodes to see if any node lies exactly
 * along the edge's basis direction from its source.  If found, wire up
 * target / inEdges and return true.
 */
function tryAttachEdgeToNode(context: StraightSkeletonSolverContext, edgeId: number): boolean {
    const edgeData = context.getEdgeWithId(edgeId);
    const source = context.findSource(edgeId);

    for (let i = 0; i < context.graph.nodes.length; i++) {
        if (i === edgeData.source) continue;
        const candidate = context.graph.nodes[i];
        const [direction, distance] = normalize(subtractVectors(candidate.position, source.position));
        if (distance > 0 && vectorsAreEqual(direction, edgeData.basisVector)) {
            edgeData.target = candidate.id;
            candidate.inEdges.push(edgeId);
            return true;
        }
    }
    return false;
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
        edgeData1.target = edgeData2.source;
        edgeData2.target = edgeData1.source;

        const source1 = context.findSource(id1);
        const source2 = context.findSource(id2);

        source1.inEdges.push(id2);
        source2.inEdges.push(id1);
    } else {
        const collision = collideInteriorEdges(context.getInteriorWithId(id1), context.getInteriorWithId(id2), context);
        if (collision === null) {
            throw new Error(`Unable to generate any collision from last two edges: ${stringifyFinalData(context, input)}`)
        }

        // Co-linear collapse: cross-wire sources
        const intersectionType = collision.intersectionData[2];
        if (intersectionType === 'co-linear-from-1') {
            edgeData1.target = edgeData2.source;
            edgeData2.target = edgeData1.source;

            const source1 = context.findSource(id1);
            const source2 = context.findSource(id2);

            source1.inEdges.push(id2);
            source2.inEdges.push(id1);
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

    const edgeData = context.getEdges(input.interiorEdges);

    let event: CollisionEvent | null = null;
    for (const [index1, index2] of TRIANGLE_INTERSECT_PAIRINGS) {
        const edge1 = context.getInteriorWithId(input.interiorEdges[index1]);
        const edge2 = context.getInteriorWithId(input.interiorEdges[index2]);
        event = collideInteriorEdges(edge1, edge2, context);
    }


    if (event === null) {
        throw new Error(`Failed to collide interior edges in triangle: ${stringifyFinalData(context, input)}`);
    }

    const newNode = context.findOrAddNode(event.position)
    newNode.inEdges.push(...input.interiorEdges);
    edgeData.forEach(e => {
        e.target = newNode.id;
    })

    context.acceptAll(input.interiorEdges);

    return {
        childSteps: []
    }
}


export function HandleAlgorithmStepInput(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
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
        result.childSteps.push(...handleInteriorEdges(context, input).childSteps)
    }

    return result;
}

export function StepAlgorithm(context: StraightSkeletonSolverContext, inputs: AlgorithmStepInput[]): AlgorithmStepOutput {
    const childSteps: AlgorithmStepInput[] = [];
    const errors: string[] = [];

    for (const input of inputs) {
        try {
            childSteps.push(...HandleAlgorithmStepInput(context, input).childSteps);
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }
    }

    if (errors.length > 0) {
        stepLog.warn(`StepAlgorithm: ${errors.length} sub-polygon(s) failed:\n${errors.join('\n')}`);
    }

    return {
        childSteps: childSteps.filter(steps => steps.interiorEdges.length > 1)
    }
}

export function runAlgorithmV5(nodes: Vector2[]): StraightSkeletonSolverContext {
    if (nodes.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }
    const context = makeStraightSkeletonSolverContext(nodes);
    const exteriorEdges = [...context.graph.edges]

    initInteriorEdges(context);

    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}]
    while (inputs.length > 0) {
        inputs = StepAlgorithm(context, inputs).childSteps
        exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id))
    }

    return context
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

    const context = makeStraightSkeletonSolverContext(nodes);
    const exteriorEdges = [...context.graph.edges];

    initInteriorEdges(context);

    const snapshots: StraightSkeletonGraph[] = [structuredClone(context.graph)];
    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

    try {
        while (inputs.length > 0) {
            inputs = StepAlgorithm(context, inputs).childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
            snapshots.push(structuredClone(context.graph));
        }
        return {snapshots, error: null};
    } catch (e) {
        snapshots.push(structuredClone(context.graph));
        return {snapshots, error: e instanceof Error ? e.message : String(e)};
    }
}