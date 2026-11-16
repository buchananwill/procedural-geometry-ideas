import {BisectionParams, ResolvableEvent, StraightSkeletonSolverContext} from "./types";
import {linkPairCollapse, linkSplit, linkVertexToVertex, pairCollapseSides} from "./wavefront";


/**
 * Resolve one event and return the bisections it bears.
 *
 * EACH BRANCH WRITES THE WAVEFRONT'S LINKS IN THE SAME ACT (skeleton wavefront-order spec, decision 9),
 * from the participants it holds: its bisections are not born yet, so they are linked as pending births
 * that the layer replaces by their ids when it creates them (`wavefront.ts`). The one link read here is the
 * pair collapse's: which collider stands on which side.
 */
function handleCollisionEvent(event: ResolvableEvent, context: StraightSkeletonSolverContext): BisectionParams[] {

    const [instigator, target] = event.collidingEdges;

    if (context.acceptedEdges[instigator] || context.acceptedEdges[target]) {
        return []
    }

    const interiorEdge = context.getInteriorWithId(instigator);

    // A NEIGHBOUR COLLAPSE EXACTLY WHEN THE LINKS MAKE THE TWO NEIGHBOURS, ASKED NOW (skeleton join-and-divide
    // spec, decision 3): never answered from the type a cached event was priced with, because the links can change
    // between pricing and resolution, and a shared parent no longer means adjacency once an edge bounds two
    // segments of one ring.
    //
    // WHICH COLLIDER STANDS ON WHICH SIDE IS READ FROM THE LINKS (BSA.F97 finding 3, BSA.D293): the
    // widdershins collider is the one whose clockwise neighbour is the other. A shared parent cannot say
    // it once an exterior edge bounds two segments of one ring. Two bisectors that are not neighbours
    // have no sides, so `sides` is defined exactly for a pair collapse.
    const sides = event.eventType === 'interiorAgainstExterior'
        ? undefined
        : pairCollapseSides(context, instigator, target);

    const newNode = context.terminateEdgesAtPoint([instigator], event.position, event.positionUncertainty);

    if (sides !== undefined) {
        const otherInterior = context.getInteriorWithId(target);
        context.terminateEdgesAtPoint([target], event.position, event.positionUncertainty);

        const [widdershinsCollider, clockwiseCollider] = sides.map(id => id === instigator ? interiorEdge : otherInterior);

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

    if (event.eventType !== 'interiorAgainstExterior') {
        const otherInterior = context.getInteriorWithId(target);

        // The target arrives at this point just as the instigator does, so it ends here too.
        // Accepting it without terminating it strands it: `accept` only marks the edge resolved,
        // it does not give it a target node, and the reciprocal event cannot repair the omission
        // because by then both edges are accepted and the handler returns early above. The
        // pair-collapse branch terminates both for exactly this reason.
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

    // A split: the instigator strikes the exterior edge `target`.
    context.acceptedEdges[instigator] = true;


    const bisections: BisectionParams[] = [
        {
            clockwiseExteriorEdgeIndex: interiorEdge.clockwiseExteriorEdgeIndex,
            widdershinsExteriorEdgeIndex: target,
            source: newNode.id,
        },
        {
            clockwiseExteriorEdgeIndex: target,
            widdershinsExteriorEdgeIndex: interiorEdge.widdershinsExteriorEdgeIndex,
            source: newNode.id,
        }
    ];
    linkSplit(context, instigator, event.struckSegment, event.position, bisections[0], bisections[1]);
    return bisections
}

export default handleCollisionEvent
