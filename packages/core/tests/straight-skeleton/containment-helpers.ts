import {FLOATING_POINT_EPSILON, solveSkeleton, Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  IS THIS SKELETON NODE INSIDE THE POLYGON IT CAME FROM?
 * ============================================================================
 *
 * Shared by `skeleton-containment.test.ts`, which sweeps the corpus, and
 * `slightly-deformed-peanut.test.ts`, which pins the two fixtures that made the sweep necessary.
 * The predicate lives here rather than in either of them so both ask exactly the same question.
 */

/**
 * The caller-space distance a node may sit outside the boundary and still count as on it.
 *
 * The solver's tolerances are absolute in UNIT space, where the polygon has extent 1; multiplying
 * by the caller's extent says the same thing in the caller's units, which is the conversion
 * `normalisation.ts` applies to every other length.
 */
export function containmentTolerance(polygon: Vector2[]): number {
    const xs = polygon.map(vertex => vertex.x);
    const ys = polygon.map(vertex => vertex.y);
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    return FLOATING_POINT_EPSILON * extent;
}

/** Even-odd crossing test. A point exactly on the boundary is decided by the distance test instead. */
export function isInside(point: Vector2, polygon: Vector2[]): boolean {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        const current = polygon[index];
        const before = polygon[previous];
        const straddles = (current.y > point.y) !== (before.y > point.y);
        if (straddles && point.x < ((before.x - current.x) * (point.y - current.y)) / (before.y - current.y) + current.x) {
            inside = !inside;
        }
    }
    return inside;
}

/** Distance from a point to the nearest point of the closed boundary. */
export function distanceToBoundary(point: Vector2, polygon: Vector2[]): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const lengthSquared = dx * dx + dy * dy;
        const along = lengthSquared === 0
            ? 0
            : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
        nearest = Math.min(nearest, Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy)));
    }
    return nearest;
}

/**
 * Every interior node of this polygon's skeleton that lies outside it, described.
 *
 * Measured against the polygon AS THE CALLER PASSED IT, not the canonicalised ring the solve ran
 * on: an escaped bisector is wrong to the caller, and canonicalisation only ever moves the boundary
 * by less than the tolerance below.
 */
export function escapedNodes(polygon: Vector2[]): string[] {
    const {graph} = solveSkeleton(polygon);
    const tolerance = containmentTolerance(polygon);
    const escaped: string[] = [];

    for (let id = graph.numExteriorNodes; id < graph.nodes.length; id++) {
        const node = graph.nodes[id];
        if (isInside(node.position, polygon)) {
            continue;
        }
        const distance = distanceToBoundary(node.position, polygon);
        if (distance <= tolerance) {
            continue;
        }
        escaped.push(
            `node ${node.id} at (${node.position.x}, ${node.position.y}) lies ${distance} outside the `
            + `boundary, past the ${tolerance} tolerance`,
        );
    }

    return escaped;
}
