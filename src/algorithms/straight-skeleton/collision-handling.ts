import {BisectionParams, CollisionEvent, StraightSkeletonSolverContext} from "@/algorithms/straight-skeleton/types";
import {checkSharedParents} from "@/algorithms/straight-skeleton/collision-helpers";
import {makeBisectedBasis, negateVector, rotateCw90, rotateWs90} from "@/algorithms/straight-skeleton/core-functions";


function handleCollisionEvent(event: CollisionEvent, context: StraightSkeletonSolverContext): BisectionParams[] {

    const [instigator, target] = event.collidingEdges;

    if (context.acceptedEdges[instigator] || context.acceptedEdges[target]) {
        return []
    }

    const interiorEdge = context.getInteriorWithId(instigator);

    const newNode = context.terminateEdgesAtPoint([instigator], event.position);
    const instigatorData = context.getEdgeWithId(instigator);

    if (event.eventType === 'interiorPair') {
        const otherInterior = context.getInteriorWithId(target);
        context.terminateEdgesAtPoint([target], event.position);

        const parentSharing = checkSharedParents(instigator, target, context);

        const widdershinsCollider = parentSharing[0] ? interiorEdge : otherInterior;
        const clockwiseCollider = parentSharing[1] ? interiorEdge : otherInterior;

        const approximateDirection = makeBisectedBasis(instigatorData.basisVector, context.getEdgeWithId(target).basisVector)

        context.accept(widdershinsCollider.id);
        context.accept(clockwiseCollider.id);

        return [{
            clockwiseExteriorEdgeIndex: clockwiseCollider.clockwiseExteriorEdgeIndex,
            source: newNode.id,
            widdershinsExteriorEdgeIndex: widdershinsCollider.widdershinsExteriorEdgeIndex,
            approximateDirection
        }]


    }

    if (event.eventType === 'interiorNonAdjacent') {
        const otherInterior = context.getInteriorWithId(target);
        const edgeData1 = context.getEdgeWithId(instigator)
        const edgeData2 = context.getEdgeWithId(target);

        const approximateDir1 = makeBisectedBasis(edgeData1.basisVector, edgeData2.basisVector);
        const approximateDir2 = negateVector(approximateDir1);

        context.accept(instigator);
        context.accept(target);

        return [
            {
                clockwiseExteriorEdgeIndex: interiorEdge.clockwiseExteriorEdgeIndex,
                widdershinsExteriorEdgeIndex: otherInterior.widdershinsExteriorEdgeIndex,
                source: newNode.id,
                approximateDirection: approximateDir1
            },
            {
                clockwiseExteriorEdgeIndex: otherInterior.clockwiseExteriorEdgeIndex,
                widdershinsExteriorEdgeIndex: interiorEdge.widdershinsExteriorEdgeIndex,
                source: newNode.id,
                approximateDirection: approximateDir2
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
                approximateDirection: rotateWs90(instigatorData.basisVector)
            },
            {
                clockwiseExteriorEdgeIndex: target,
                widdershinsExteriorEdgeIndex: instigatorInterior.widdershinsExteriorEdgeIndex,
                source: newNode.id,
                approximateDirection: rotateCw90(instigatorData.basisVector)

            }
        ]
    }

    return []
}

export default handleCollisionEvent