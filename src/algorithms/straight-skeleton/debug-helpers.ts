import type {CollisionEvent, StraightSkeletonSolverContext} from './types';
import {collideEdges} from './collision-helpers';
import {sourceOffsetDistance} from './collision-helpers';

export interface CollisionSweepEvent {
    instigatorEdgeId: number;
    event: CollisionEvent;
}

/**
 * For each edge in edgeIds, collide against all other interior edges
 * and all exterior edges. Uses collideEdges directly (not cache-aware)
 * so that debug sweeps work independently of algorithm state.
 *
 * Returns everything including phantomDivergentOffset for full debug visibility.
 * Sorted by offsetDistance ascending.
 */
export function generateCollisionSweep(
    edgeIds: number[],
    context: StraightSkeletonSolverContext
): CollisionSweepEvent[] {
    const results: CollisionSweepEvent[] = [];
    const edgeIdSet = new Set(edgeIds);

    for (const edgeId of edgeIds) {
        // Collide against all interior edges
        for (const interiorEdge of context.graph.interiorEdges) {
            if (interiorEdge.id === edgeId) continue;
            const event = collideEdges(edgeId, interiorEdge.id, context);
            if (event !== null) {
                results.push({instigatorEdgeId: edgeId, event});
            }
        }

        // Collide against all exterior edges
        for (let i = 0; i < context.graph.numExteriorNodes; i++) {
            const event = collideEdges(edgeId, i, context);
            if (event !== null) {
                results.push({instigatorEdgeId: edgeId, event});
            }
        }
    }

    results.sort((a, b) => a.event.offsetDistance - b.event.offsetDistance);
    return results;
}

/**
 * Compute offset distance for each interior node.
 * For each node with id >= numExteriorNodes, picks any outgoing interior edge
 * and returns sourceOffsetDistance(edge, context).
 */
export function computeNodeOffsetDistances(
    context: StraightSkeletonSolverContext
): Map<number, number> {
    const result = new Map<number, number>();
    const {graph} = context;

    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        // Find an outgoing interior edge
        for (const edgeId of node.outEdges) {
            if (context.edgeRank(edgeId) !== 'exterior') {
                const edge = context.getInteriorWithId(edgeId);
                result.set(i, sourceOffsetDistance(edge, context));
                break;
            }
        }
    }

    return result;
}
