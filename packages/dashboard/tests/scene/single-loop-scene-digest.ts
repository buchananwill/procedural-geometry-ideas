import { createHash } from 'node:crypto';
import {
    angularResolution,
    coaxialityFloor,
    computeNodeOffsetDistances,
    computePrimaryEdgeIntersections,
    computePrimaryInteriorEdges,
    generateCollisionSweep,
    resolvePerceptualFloor,
} from '@proc-geo/core';
import type { StraightSkeletonSolverContext } from '@proc-geo/core';
import { solveSkeletonBoundary, solveSkeletonGuarded } from '../../src/hooks/skeleton-solve-boundary';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../../src/scene/perceptual-floor';
import { skeletonToScene } from '../../src/scene/adapters/skeletonToScene';
import type { CollisionSweepLine, DebugDisplayOptions } from '../../src/types';
import type { Vertex } from '../../src/stores/usePolygonStore';

/*
 * THE SCENE THE STRAIGHT-SKELETON PAGE DRAWS FOR A SINGLE-LOOP FIXTURE, AS ONE DIGEST (dashboard holed-fixtures spec,
 * decision 42). The inputs are the page's own single-loop paths: the boundary file's guarded solve and boundary stage
 * at the explorer's floor, the primary preview at the solve's weights (all ones, as after every fixture load), the
 * offset readout and the full sweep (ids `n .. 2n − 1`, as `useCollisionSweep` takes them). The sweep lines are mapped
 * here exactly as `useCollisionSweep`'s private `sweepLinesToRender` maps them. Every debug flag off, then every flag on.
 */

export const ALL_FLAGS_OFF: DebugDisplayOptions = {
    showExteriorEdgeLengths: false,
    showInteriorEdgeLengths: false,
    showSelectedNodeEdgeLengths: false,
    showSkeletonNodes: false,
    showPrimaryIntersectionNodes: false,
    showNodeIndices: false,
    showEdgeIndices: false,
    showOffsetDistances: false,
    showSweepEventDetails: false,
    showUnresolvedEdges: false,
    showEdgeDirections: false,
    showParentEdges: false,
    showCollisionSweep: false,
};

export const ALL_FLAGS_ON: DebugDisplayOptions = Object.fromEntries(
    Object.keys(ALL_FLAGS_OFF).map(key => [key, true])) as unknown as DebugDisplayOptions;

function fullSweepLines(context: StraightSkeletonSolverContext): CollisionSweepLine[] {
    const n = context.graph.numExteriorNodes;
    const edgeIds: number[] = [];
    for (let i = n; i < 2 * n; i++) {
        if (i < context.graph.edges.length) edgeIds.push(i);
    }
    return generateCollisionSweep(edgeIds, context).map((se, i) => {
        const sourceNode = context.graph.nodes[context.graph.edges[se.instigatorEdgeId].source];
        return {
            key: `sweep-${i}`,
            sourceX: sourceNode.position.x,
            sourceY: sourceNode.position.y,
            targetX: se.event.position.x,
            targetY: se.event.position.y,
            offsetDistance: se.event.offsetDistance,
            edgeIdA: se.event.collidingEdges[0],
            edgeIdB: se.event.collidingEdges[1],
            eventType: se.event.eventType,
            intersectionType: se.event.intersectionData[2],
            alongRay1: se.event.intersectionData[0],
            alongRay2: se.event.intersectionData[1],
        };
    });
}

/** A value, or a stand-in naming the throw, so a fixture whose readout throws still has a digest. */
function attempt<T>(make: () => T): T | string {
    try {
        return make();
    } catch (thrown) {
        return `throw:${thrown instanceof Error ? thrown.message : String(thrown)}`;
    }
}

/** The page's scene for `vertices` with every debug flag `on` or off, as a SHA-256 of its JSON. */
export function singleLoopSceneDigest(vertices: readonly Vertex[], on: boolean): string {
    const polygon = vertices.map(vertex => ({ x: vertex.x, y: vertex.y }));
    const weights = polygon.map(() => 1);
    const options = { perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR, weights };
    const { context } = solveSkeletonGuarded(polygon, options);
    const remap = solveSkeletonBoundary(polygon, options).indexRemap;
    const floor = resolvePerceptualFloor({ perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR });
    const primaryEdges = on
        ? attempt(() => computePrimaryInteriorEdges(polygon, coaxialityFloor(floor), angularResolution(floor), weights))
        : [];
    const primary = typeof primaryEdges === 'string' ? [] : primaryEdges;
    const intersections = primary.length > 0
        ? computePrimaryEdgeIntersections(primary, coaxialityFloor(floor), angularResolution(floor))
        : [];
    const sweep = on && context !== null ? attempt(() => fullSweepLines(context)) : null;
    const offsets = on && context !== null ? attempt(() => computeNodeOffsetDistances(context)) : null;
    const scene = skeletonToScene({
        vertices: polygon,
        skeleton: context?.graph ?? null,
        primaryEdges: primary,
        primaryEdgeIntersections: intersections,
        debug: on ? ALL_FLAGS_ON : ALL_FLAGS_OFF,
        collisionSweepLines: typeof sweep === 'string' ? null : sweep,
        nodeOffsetDistances: typeof offsets === 'string' ? null : offsets,
        selectedDebugNodes: on && context !== null ? new Set([context.graph.numExteriorNodes]) : new Set<number>(),
        invScale: 1,
        solverVertexRemap: remap,
    });
    const record = JSON.stringify({ scene, primaryEdges: typeof primaryEdges === 'string' ? primaryEdges : null,
        sweep: typeof sweep === 'string' ? sweep : null, offsets: typeof offsets === 'string' ? offsets : null });
    return createHash('sha256').update(record).digest('hex');
}
