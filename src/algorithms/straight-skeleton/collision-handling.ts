import {BisectionParams, CollisionEvent, StraightSkeletonSolverContext} from "@/algorithms/straight-skeleton/types";
import {checkSharedParents} from "@/algorithms/straight-skeleton/collision-helpers";
import {makeBisectedBasis, scaleVector} from "@/algorithms/straight-skeleton/core-functions";


function handleCollisionEvent(event: CollisionEvent, context: StraightSkeletonSolverContext): BisectionParams[] {

    const [instigator, target] = event.collidingEdges;

    if (context.acceptedEdges[instigator] || context.acceptedEdges[target]) {
        return []
    }

    const interiorEdge = context.getInteriorWithId(instigator);

    const newNode = context.findOrAddNode(event.position);
    newNode.inEdges.push(instigator)
    const instigatorData = context.getEdgeWithId(instigator);
    instigatorData.target = newNode.id;

    if (event.eventType === 'interiorPair') {
        const otherInterior = context.getInteriorWithId(target);
        newNode.inEdges.push(target);
        const targetEdgeData = context.getEdgeWithId(target);
        targetEdgeData.target = newNode.id;

        const parentSharing = checkSharedParents(instigator, target, context);

        const widdershinsCollider = parentSharing[0] ? interiorEdge : otherInterior;
        const clockwiseCollider = parentSharing[1] ? interiorEdge : otherInterior;

        const collapsedEdge = clockwiseCollider.widdershinsExteriorEdgeIndex;
        const approximateDirection = makeBisectedBasis(instigatorData.basisVector, targetEdgeData.basisVector)

        context.accept(collapsedEdge);
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
        const approximateDir2 = scaleVector(approximateDir1, -1);

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
        const targetExterior = context.getEdgeWithId(target);

        context.acceptedEdges[instigator] = true;

        return [
            {
                clockwiseExteriorEdgeIndex: instigatorInterior.clockwiseExteriorEdgeIndex,
                widdershinsExteriorEdgeIndex: target,
                source: newNode.id,
                approximateDirection: scaleVector(targetExterior.basisVector, -1)
            },
            {
                clockwiseExteriorEdgeIndex: target,
                widdershinsExteriorEdgeIndex: instigatorInterior.widdershinsExteriorEdgeIndex,
                source: newNode.id,
                approximateDirection: targetExterior.basisVector

            }
        ]
    }

    return []
}

export default handleCollisionEvent