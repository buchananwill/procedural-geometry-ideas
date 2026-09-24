import {BisectionParams, CollisionEvent, StraightSkeletonSolverContext} from "./types";
import {checkSharedParents} from "./collision-helpers";


function handleCollisionEvent(event: CollisionEvent, context: StraightSkeletonSolverContext): BisectionParams[] {

    const [instigator, target] = event.collidingEdges;

    if (context.acceptedEdges[instigator] || context.acceptedEdges[target]) {
        return []
    }

    const interiorEdge = context.getInteriorWithId(instigator);

    const newNode = context.terminateEdgesAtPoint([instigator], event.position, event.positionUncertainty);

    if (event.eventType === 'interiorPair') {
        const otherInterior = context.getInteriorWithId(target);
        context.terminateEdgesAtPoint([target], event.position, event.positionUncertainty);

        const parentSharing = checkSharedParents(instigator, target, context);

        const widdershinsCollider = parentSharing[0] ? interiorEdge : otherInterior;
        const clockwiseCollider = parentSharing[1] ? interiorEdge : otherInterior;

        context.accept(widdershinsCollider.id);
        context.accept(clockwiseCollider.id);

        return [{
            clockwiseExteriorEdgeIndex: clockwiseCollider.clockwiseExteriorEdgeIndex,
            source: newNode.id,
            widdershinsExteriorEdgeIndex: widdershinsCollider.widdershinsExteriorEdgeIndex,
        }]


    }

    if (event.eventType === 'interiorNonAdjacent') {
        const otherInterior = context.getInteriorWithId(target);

        // The target arrives at this point just as the instigator does, so it ends here too.
        // Accepting it without terminating it strands it: `accept` only marks the edge resolved,
        // it does not give it a target node, and the reciprocal event cannot repair the omission
        // because by then both edges are accepted and the handler returns early above. The
        // `interiorPair` branch terminates both for exactly this reason.
        context.terminateEdgesAtPoint([target], event.position, event.positionUncertainty);

        context.accept(instigator);
        context.accept(target);

        return [
            {
                clockwiseExteriorEdgeIndex: interiorEdge.clockwiseExteriorEdgeIndex,
                widdershinsExteriorEdgeIndex: otherInterior.widdershinsExteriorEdgeIndex,
                source: newNode.id,
            },
            {
                clockwiseExteriorEdgeIndex: otherInterior.clockwiseExteriorEdgeIndex,
                widdershinsExteriorEdgeIndex: interiorEdge.widdershinsExteriorEdgeIndex,
                source: newNode.id,
            }
        ]
    }

    if (event.eventType === 'interiorAgainstExterior') {
        const instigatorInterior = context.getInteriorWithId(instigator);

        if (event.collidingEdges.length > 2) {
            event.collidingEdges.slice(2).forEach(e => {
                if (context.edgeRank(e) !== 'exterior') {
                    context.acceptedEdges[e] = true;
                }

            })
        }

        context.acceptedEdges[instigator] = true;


        return [
            {
                clockwiseExteriorEdgeIndex: instigatorInterior.clockwiseExteriorEdgeIndex,
                widdershinsExteriorEdgeIndex: target,
                source: newNode.id,
            },
            {
                clockwiseExteriorEdgeIndex: target,
                widdershinsExteriorEdgeIndex: instigatorInterior.widdershinsExteriorEdgeIndex,
                source: newNode.id,
            }
        ]
    }

    return []
}

export default handleCollisionEvent