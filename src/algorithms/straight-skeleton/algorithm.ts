import {
    HeapInteriorEdge,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {
    acceptEdge,
    finalizeTargetNodePosition, hasInteriorLoop,
    initStraightSkeletonSolverContext
} from "@/algorithms/straight-skeleton/algorithm-helpers";
import {addNode} from "@/algorithms/straight-skeleton/core-functions";

function graphIsComplete(context: StraightSkeletonSolverContext): boolean {
    return context.acceptedEdges.every(flag => flag)
}

export function computeStraightSkeleton(nodes: Vector2[]): StraightSkeletonGraph {

    const context = initStraightSkeletonSolverContext(nodes);
    const {graph, acceptedEdges, heap} = context;

    const pushHeapInteriorEdge = (clockwiseParent: number, widdershinsParent: number) => {
        // fill in later
    };

    let nextEdge: HeapInteriorEdge | undefined = heap.pop();
    while (!graphIsComplete(context) && nextEdge) {
        if (acceptedEdges.length <= nextEdge.id || !acceptedEdges[nextEdge.id]) {
            const newNodePosition = finalizeTargetNodePosition(nextEdge, graph);
            const nodeIndex = addNode(newNodePosition, graph)
            const newNode = graph.nodes[nodeIndex];
            newNode.inEdges.push(nextEdge.id)
            newNode.inEdges.push(...nextEdge.intersectingEdges)

            const acceptedInteriorEdges: number[] = [nextEdge.id, ...nextEdge.intersectingEdges]
            acceptedInteriorEdges.forEach(e => acceptEdge(e, context))

            // accept exterior edges if they are now part of a closed loop.
            const testedExteriorEdges = new Set<number>();

            const testAndAccept = (e: number) => {
                if (testedExteriorEdges.has(e)) {
                    return context.acceptedEdges[e];
                }

                testedExteriorEdges.add(e);

                if (hasInteriorLoop(e, context)) {
                    context.acceptedEdges[e] = true;
                }

                return context.acceptedEdges[e];

            }

            const activeClockwiseParents: number[] = [];
            const activeWiddershinsParents: number[] = []

            acceptedInteriorEdges.forEach(e => {
                const interiorEdge = graph.interiorEdges[e];
                if (!testAndAccept(interiorEdge.widdershinsExteriorEdgeIndex)) {
                    activeWiddershinsParents.push(interiorEdge.widdershinsExteriorEdgeIndex);
                }
                if (!testAndAccept(interiorEdge.clockwiseExteriorEdgeIndex)) {
                    activeClockwiseParents.push(interiorEdge.clockwiseExteriorEdgeIndex);
                }
            })

            if (activeClockwiseParents.length !== activeWiddershinsParents.length) {
                throw new Error("Expected both arrays to be equal length")
            }
            if (activeClockwiseParents.length === 1) {
                pushHeapInteriorEdge(activeClockwiseParents[0], activeWiddershinsParents[0]);
            }

            if (activeClockwiseParents.length > 1) {
                activeClockwiseParents.sort()
                activeWiddershinsParents.sort()

                // need to make alternating pairs of clockwise/widdershins parents indices
                // so find the first widdershins parent that is greater than
            }


            // get all adjoining exterior edges that are not accepted
            // there will be either two or four
            // for each newly accepted interior edge:
            // if its clockwise parent is not-accepted, find the next newly-accepted interior edge whose anti-clockwise parent edge is not-accepted, make a new interior edge with those exterior edges as parents
            // if its anticlockwise parent is not-accepted, do nothing: we wait until we find an un-accepted clockwise parent, and it will be consumed then.


        }

        nextEdge = heap.pop();
    }

    return context.graph;
}