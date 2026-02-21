import {
    HeapInteriorEdge,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {
    acceptEdge,
    addTargetNodeAtInteriorEdgeIntersect,
    buildExteriorParentLists,
    initStraightSkeletonSolverContext,
    pushHeapInteriorEdgesFromParentPairs
} from "@/algorithms/straight-skeleton/algorithm-helpers";
import {initStraightSkeletonGraph} from "@/algorithms/straight-skeleton/core-functions";

function graphIsComplete(context: StraightSkeletonSolverContext): boolean {
    return context.acceptedEdges.every(flag => flag)
}

export function computeStraightSkeleton(nodes: Vector2[]): StraightSkeletonGraph {
    if (nodes.length < 3) {
        return initStraightSkeletonGraph(nodes);
    }
    const context = initStraightSkeletonSolverContext(nodes);
    const {graph, acceptedEdges, heap} = context;

    let nextEdge: HeapInteriorEdge | undefined;
    while (!graphIsComplete(context)) {
        nextEdge = heap.pop();

        { // Invariant handling
            if (nextEdge === undefined) {
                throw new Error(`Graph not complete but no edges left in heap`);
            }

            // Note 3: discard if ANY participating edge is already accepted
            if (nextEdge.participatingEdges.some(eid => eid < acceptedEdges.length && acceptedEdges[eid])) {
                continue;
            }
        }

        const interiorEdgeData = graph.interiorEdges[nextEdge.ownerId - graph.numExteriorNodes];

        const nodeIndex = addTargetNodeAtInteriorEdgeIntersect(context, interiorEdgeData)

        const acceptedInteriorEdges: number[] = graph.nodes[nodeIndex].inEdges;
        acceptedInteriorEdges.forEach(
            e => {
                acceptEdge(e, context);
            }
        )

        // accept exterior edges if they are now part of a closed loop.
        const [activeClockwiseParents, activeWiddershinsParents] = buildExteriorParentLists(context, acceptedInteriorEdges);

        pushHeapInteriorEdgesFromParentPairs(context, activeClockwiseParents, activeWiddershinsParents, nodeIndex)
    }

    return context.graph;
}