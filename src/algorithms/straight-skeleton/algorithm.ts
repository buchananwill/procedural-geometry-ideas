import {
    HeapInteriorEdge,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {
    acceptEdge,
    acceptEdgeAndPropagate,
    addTargetNodeAtInteriorEdgeIntersect,
    buildExteriorParentLists,
    finalizeTargetNodePosition,
    initStraightSkeletonSolverContext,
    pushHeapInteriorEdgesFromParentPairs,
    reEvaluateEdge
} from "@/algorithms/straight-skeleton/algorithm-helpers";
import {initStraightSkeletonGraph, positionsAreClose} from "@/algorithms/straight-skeleton/core-functions";

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

        if (nextEdge === undefined) {
            throw new Error(`Graph not complete but no edges left in heap`);
        }

        // Generation check: skip if this event is from an outdated evaluation
        const ownerInteriorData = graph.interiorEdges[nextEdge.ownerId - graph.numExteriorNodes];
        if (nextEdge.generation !== ownerInteriorData.heapGeneration) {
            continue;
        }

        const ownerAccepted = nextEdge.ownerId < acceptedEdges.length && acceptedEdges[nextEdge.ownerId];

        // Fully stale: owner itself is accepted — discard
        if (ownerAccepted) {
            continue;
        }

        // Partially stale: owner is NOT accepted but some participants are
        const hasStaleParticipants = nextEdge.participatingEdges.some(
            eid => eid !== nextEdge!.ownerId && eid < acceptedEdges.length && acceptedEdges[eid]
        );

        if (hasStaleParticipants) {
            // Compute where the owner would land based on its recorded length
            const interiorEdgeData = graph.interiorEdges[nextEdge.ownerId - graph.numExteriorNodes];
            const targetPos = finalizeTargetNodePosition(interiorEdgeData.id, graph);

            // Check if an existing interior node is at that position
            let existingNodeIndex = -1;
            for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
                if (positionsAreClose(graph.nodes[i].position, targetPos)) {
                    existingNodeIndex = i;
                    break;
                }
            }

            if (existingNodeIndex >= 0) {
                // Accept the owner at the existing node
                const ownerEdgeId = nextEdge.ownerId;
                if (!graph.nodes[existingNodeIndex].inEdges.includes(ownerEdgeId)) {
                    graph.nodes[existingNodeIndex].inEdges.push(ownerEdgeId);
                }
                graph.edges[ownerEdgeId].target = existingNodeIndex;
                acceptEdgeAndPropagate(ownerEdgeId, context);

                // Build parents using ALL interior edges at the node for balanced parent lists
                const allNodeEdges = graph.nodes[existingNodeIndex].inEdges.filter(
                    e => e >= graph.numExteriorNodes
                );
                const [cw, ws] = buildExteriorParentLists(context, allNodeEdges);
                pushHeapInteriorEdgesFromParentPairs(context, cw, ws, existingNodeIndex);
            } else {
                // Re-evaluate the owner edge with dirty-queue propagation
                reEvaluateEdge(context, nextEdge.ownerId);
            }
            continue;
        }

        const interiorEdgeData = graph.interiorEdges[nextEdge.ownerId - graph.numExteriorNodes];

        const nodeIndex = addTargetNodeAtInteriorEdgeIntersect(context, interiorEdgeData);

        // Accept only edges that aren't already accepted
        const newlyAcceptedEdges: number[] = graph.nodes[nodeIndex].inEdges.filter(
            e => !acceptedEdges[e]
        );
        newlyAcceptedEdges.forEach(
            e => {
                acceptEdgeAndPropagate(e, context);
            }
        );

        // Use ALL interior edges at the node for balanced parent lists
        const allInteriorEdgesAtNode = graph.nodes[nodeIndex].inEdges.filter(
            e => e >= graph.numExteriorNodes
        );
        const [activeClockwiseParents, activeWiddershinsParents] = buildExteriorParentLists(context, allInteriorEdgesAtNode);

        pushHeapInteriorEdgesFromParentPairs(context, activeClockwiseParents, activeWiddershinsParents, nodeIndex);
    }

    return context.graph;
}