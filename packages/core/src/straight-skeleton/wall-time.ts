import type {PolygonNode, StraightSkeletonGraph, Vector2} from "./types";
import {distanceToSupportingLine} from "./planar-geometry";

/*
 * A WALL'S CLOCK, READ FROM A FINISHED GRAPH (W-spec W5, W7). The wavefront of exterior edge `e` stands at distance
 * `w_e · t` from `e`'s supporting line at time `t`, so a point's distance from that line, beside `e`'s weight, is an
 * arrival on `e`'s clock. The post-solve readers that re-derive times from geometry (the causality check, the holed
 * guard, the offset projection) share these primitives; each keeps its own weight read and its own comparison.
 *
 * The bisector-side reading of a node's time, the birth arrival of a bisector it emits, is `nodeBirthArrival` in
 * `collision-helpers.ts`, beside `birthArrivalOf`.
 */

/** A point's distance from a wall's supporting line, beside that wall's weight: an arrival on the wall's clock. */
export interface WallReading {
    distance: number;
    weight: number;
}

/**
 * The distance from `point` to the supporting line of exterior edge `wall`, the line through the wall's own source and
 * target nodes (skeleton join-and-divide spec, decision 32; loop-consumers spec, decisions 2 and 5), in the graph's
 * units. On one loop edge `e`'s target is node `(e + 1) mod n`; on a holed graph a loop's last edge ends at that loop's
 * own first node. Unsigned.
 */
export function distanceToWallLine(graph: StraightSkeletonGraph, point: Vector2, wall: number): number {
    const edge = graph.edges[wall];
    return distanceToSupportingLine(point, graph.nodes[edge.source].position, graph.nodes[edge.target!].position);
}

/** Every interior edge's clockwise exterior parent, keyed by the interior edge's id. */
export function clockwiseParentsOf(graph: StraightSkeletonGraph): Map<number, number> {
    const parents = new Map<number, number>();
    for (const interiorEdge of graph.interiorEdges) {
        parents.set(interiorEdge.id, interiorEdge.clockwiseExteriorEdgeIndex);
    }
    return parents;
}

/**
 * THE WALL THAT DATES A NODE: the clockwise parent of the first interior edge incident to it, in-edges then out-edges,
 * first occurrence. `undefined` when no incident edge is an interior edge of `clockwiseParents`
 * ({@link clockwiseParentsOf}), so such a node has no derived time rather than a guessed one.
 */
export function datingWallOf(node: PolygonNode, clockwiseParents: ReadonlyMap<number, number>): number | undefined {
    for (const edgeId of new Set([...node.inEdges, ...node.outEdges])) {
        const wall = clockwiseParents.get(edgeId);
        if (wall !== undefined) {
            return wall;
        }
    }
    return undefined;
}

/**
 * How much later `later` is than `earlier`, cross-multiplied and stated on the faster of the two walls, as a length:
 * `(d_later · w_earlier − d_earlier · w_later) / min(w_later, w_earlier)` (BSA.D309; W-spec W22, W26). Negative when
 * `later` is in fact the earlier of the two.
 */
export function gapOnFasterWall(later: WallReading, earlier: WallReading): number {
    return (later.distance * earlier.weight - earlier.distance * later.weight) / Math.min(later.weight, earlier.weight);
}
