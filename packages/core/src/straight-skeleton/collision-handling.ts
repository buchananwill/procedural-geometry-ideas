import {BisectionParams, CollisionEvent, StraightSkeletonSolverContext} from "./types";
import {checkSharedParents} from "./collision-helpers";
import {linkPairCollapse, linkSplit, linkVertexToVertex} from "./wavefront";


/**
 * Resolve one event and return the bisections it bears.
 *
 * EACH BRANCH WRITES THE WAVEFRONT'S LINKS IN THE SAME ACT (skeleton wavefront-order spec, decision 9),
 * from the participants it holds: its bisections are not born yet, so they are linked as pending births
 * that the layer replaces by their ids when it creates them (`wavefront.ts`). Nothing here reads a link to
 * decide anything; the parameters returned are exactly what they were.
 */
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

        const collapse: BisectionParams = {
            clockwiseExteriorEdgeIndex: clockwiseCollider.clockwiseExteriorEdgeIndex,
            source: newNode.id,
            widdershinsExteriorEdgeIndex: widdershinsCollider.widdershinsExteriorEdgeIndex,
        };
        linkPairCollapse(context, [instigator, target], widdershinsCollider.id, clockwiseCollider.id, collapse);
        return [collapse]


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

        const bisections: BisectionParams[] = [
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
        ];
        linkVertexToVertex(context, instigator, target, bisections[0], bisections[1]);
        return bisections
    }

    if (event.eventType === 'interiorAgainstExterior') {
        const instigatorInterior = context.getInteriorWithId(instigator);

        // NEVER REACHED ON THE CORPUS: no event generator emits more than two colliding edges. Kept as it
        // was; such an edge would be accepted without being unlinked, and `checkWavefront` would say so.
        if (event.collidingEdges.length > 2) {
            event.collidingEdges.slice(2).forEach(e => {
                if (context.edgeRank(e) !== 'exterior') {
                    context.acceptedEdges[e] = true;
                }

            })
        }

        context.acceptedEdges[instigator] = true;


        const bisections: BisectionParams[] = [
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
        ];
        linkSplit(context, instigator, event.struckSegment, event.position, bisections[0], bisections[1]);
        return bisections
    }

    // An event of no handled type still terminated the instigator above without accepting it, as it always
    // has; its links are left alone, since the bisector is still live.
    return []
}

export default handleCollisionEvent
