import {
    HeapInteriorEdge,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {
    acceptEdge, addBisectionEdge,
    finalizeTargetNodePosition, hasInteriorLoop,
    initStraightSkeletonSolverContext, makeRayProjection, unitsToIntersection, updateInteriorEdgeIntersection
} from "@/algorithms/straight-skeleton/algorithm-helpers";
import {addNode} from "@/algorithms/straight-skeleton/core-functions";

function graphIsComplete(context: StraightSkeletonSolverContext): boolean {
    return context.acceptedEdges.every(flag => flag)
}

export function computeStraightSkeleton(nodes: Vector2[]): StraightSkeletonGraph {

    const context = initStraightSkeletonSolverContext(nodes);
    const {graph, acceptedEdges, heap} = context;

    const pushHeapInteriorEdge = (clockwiseParent: number, widdershinsParent: number, source: number) => {

        const edgeIndex = addBisectionEdge(graph, clockwiseParent, widdershinsParent, source);

        const heapInteriorEdge: HeapInteriorEdge = {
            id: edgeIndex,
        }

        acceptedEdges.push(false);
        const interiorEdgeData = graph.interiorEdges[edgeIndex - graph.numExteriorNodes];

        for (let otherInteriorEdge = 0; otherInteriorEdge < graph.interiorEdges.length; otherInteriorEdge++) {
            const otherInteriorEdgeData = graph.interiorEdges[otherInteriorEdge];

            if (otherInteriorEdgeData.id === edgeIndex) {
                continue;
            }

            if (acceptedEdges[otherInteriorEdgeData.id]) {
                continue;
            }

            const [firstDistance, otherDistance] = unitsToIntersection(
                makeRayProjection(graph.edges[edgeIndex], graph),
                makeRayProjection(graph.edges[otherInteriorEdgeData.id], graph)
            );

            updateInteriorEdgeIntersection(interiorEdgeData, otherInteriorEdgeData.id, firstDistance)
            const reducedOtherEdgeLength = updateInteriorEdgeIntersection(otherInteriorEdgeData, interiorEdgeData.id, otherDistance)
            if (reducedOtherEdgeLength) {
                context.heap.push({id: otherInteriorEdgeData.id})
            }
        }

        context.heap.push(heapInteriorEdge);

    };

    let nextEdge: HeapInteriorEdge | undefined = heap.pop();
    while (!graphIsComplete(context) && nextEdge) {
        if (acceptedEdges.length <= nextEdge.id || !acceptedEdges[nextEdge.id]) {
            const newNodePosition = finalizeTargetNodePosition(nextEdge, graph);
            const nodeIndex = addNode(newNodePosition, graph)
            const newNode = graph.nodes[nodeIndex];
            newNode.inEdges.push(nextEdge.id)
            const interiorEdgeData = graph.interiorEdges[nextEdge.id];
            newNode.inEdges.push(...interiorEdgeData.intersectingEdges)

            const acceptedInteriorEdges: number[] = [nextEdge.id, ...interiorEdgeData.intersectingEdges]
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
                pushHeapInteriorEdge(activeClockwiseParents[0], activeWiddershinsParents[0], nodeIndex);
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

                    pushHeapInteriorEdge(clockwiseParentEdge, widdershinsParentEdge, nodeIndex)

                    widdershinsParentIndex++;
                    widdershinsParentIndex = widdershinsParentIndex % activeWiddershinsParents.length;
                }

            }
        }

        nextEdge = heap.pop();
    }

    return context.graph;
}