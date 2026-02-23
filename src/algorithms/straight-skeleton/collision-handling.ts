import {BisectionParams, CollisionEvent, StraightSkeletonSolverContext} from "@/algorithms/straight-skeleton/types";
import {checkSharedParents} from "@/algorithms/straight-skeleton/collision-helpers";
import {makeBisectedBasis, scaleVector} from "@/algorithms/straight-skeleton/core-functions";


export function handleCollisionEvent(event: CollisionEvent, context: StraightSkeletonSolverContext): BisectionParams[] {

    const [instigator, target] = event.collidingEdges;

    const interiorEdge = context.getInteriorWithId(instigator);

    const newNode = context.findOrAddNode(event.position);
    newNode.inEdges.push(instigator)

    if (event.eventType === 'interiorPair') {
        const otherInterior = context.getInteriorWithId(target);
        newNode.inEdges.push(target);

        const parentSharing = checkSharedParents(instigator, target, context);
        if (parentSharing.includes(true)) {
            const widdershinsCollider = parentSharing[0] ? interiorEdge : otherInterior;
            const clockwiseCollider = parentSharing[1] ? interiorEdge : otherInterior;

            const collapsedEdge = clockwiseCollider.widdershinsExteriorEdgeIndex;

            context.acceptedEdges[collapsedEdge] = true;
            context.acceptedEdges[widdershinsCollider.id] = true;
            context.acceptedEdges[clockwiseCollider.id] = true;

            return [{
                clockwiseExteriorEdgeIndex: clockwiseCollider.widdershinsExteriorEdgeIndex,
                source: newNode.id,
                widdershinsExteriorEdgeIndex: widdershinsCollider.widdershinsExteriorEdgeIndex
            }]
        }

        const edgeData1 = context.getEdgeWithId(instigator)
        const edgeData2 = context.getEdgeWithId(target);

        const approximateDir1 = makeBisectedBasis(edgeData1.basisVector, edgeData2.basisVector);
        const approximateDir2 = scaleVector(approximateDir1, -1);

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