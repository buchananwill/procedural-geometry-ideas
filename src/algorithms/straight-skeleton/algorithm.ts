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

                let widdershinsParentIndex = 0;
                for (let clockwiseParentIndex = 0; clockwiseParentIndex < activeClockwiseParents.length; clockwiseParentIndex++) {
                    const clockwiseParentEdge = activeClockwiseParents[clockwiseParentIndex];

                    // need to make alternating pairs of clockwise/widdershins parents indices
                    // so find the first widdershins parent that is greater than the first clockwise parent
                    if (clockwiseParentIndex === 0 && activeWiddershinsParents[widdershinsParentIndex] < clockwiseParentEdge) {
                        widdershinsParentIndex += 1;

                        if (activeWiddershinsParents[widdershinsParentIndex] < clockwiseParentEdge) {
                            throw new Error("Two consecutive initial widdershins parents are less than the first clockwise parent");
                        }
                    }

                    const widdershinsParentEdge = activeWiddershinsParents[widdershinsParentIndex];

                    pushHeapInteriorEdge(clockwiseParentEdge, widdershinsParentEdge)

                    widdershinsParentIndex++;
                    widdershinsParentIndex = widdershinsParentIndex % activeWiddershinsParents.length;
                }

            }
        }

        nextEdge = heap.pop();
    }

    return context.graph;
}