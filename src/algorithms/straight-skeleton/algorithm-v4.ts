import {Vector2} from "@/algorithms/straight-skeleton/types";
import {
    createBisectionInteriorEdge,
    hasInteriorLoop,
    makeStraightSkeletonSolverContext
} from "@/algorithms/straight-skeleton/algorithm-helpers";
import {graphIsComplete} from "@/algorithms/straight-skeleton/algorithm";
import {createCollisionEvents} from "@/algorithms/straight-skeleton/collision-helpers";
import {areEqual} from "@/algorithms/straight-skeleton/core-functions";
import {handleCollisionEvent} from "@/algorithms/straight-skeleton/collision-handling";

export function computeStraightSkeletonV4(nodes: Vector2[]) {

    // init context

    const solverContext = makeStraightSkeletonSolverContext(nodes);

    const exteriorEdges = [...solverContext.graph.edges];

    // create interior edges from exterior node bisections
    for (let clockwiseExteriorEdgeIndex = 0; clockwiseExteriorEdgeIndex < exteriorEdges.length; clockwiseExteriorEdgeIndex++) {
        const widdershinsExteriorEdgeIndex = (clockwiseExteriorEdgeIndex - 1 + exteriorEdges.length) % exteriorEdges.length;
        createBisectionInteriorEdge(solverContext, clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex, clockwiseExteriorEdgeIndex)
    }


    // LOOP:
    while (!graphIsComplete(solverContext)) {
        // generate events
        const events = createCollisionEvents(solverContext);
        if (events.length === 0) {
            throw new Error("Incomplete graph could not generate any new collision events");
        }
        // handle top layer
        const offsetThreshold = events[0].offsetDistance;
        const eventLayer = events.filter(e => areEqual(e.offsetDistance, offsetThreshold))
        const proposedBisections = eventLayer.flatMap(e => handleCollisionEvent(e, solverContext))

        solverContext.graph
            .edges
            .filter(e => !solverContext.acceptedEdges[e.id])
            .forEach(e => { solverContext.acceptedEdges[e.id] = hasInteriorLoop(e.id, solverContext);})

        // - discard stale bisections after all events handled
        proposedBisections.filter(params => {
            return !solverContext.acceptedEdges[params.widdershinsExteriorEdgeIndex]
                && !solverContext.acceptedEdges[params.clockwiseExteriorEdgeIndex]
        })
            // - convert to new bisections
            .map(params => {
                return createBisectionInteriorEdge(
                    solverContext,
                    params.clockwiseExteriorEdgeIndex,
                    params.widdershinsExteriorEdgeIndex,
                    params.source,
                    params.approximateDirection)
            })


    }
    // terminate: external edges are all accepted

    return solverContext.graph;
}