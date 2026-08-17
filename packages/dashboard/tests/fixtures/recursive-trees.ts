import type { RecursiveNode, Strip, Vector2 } from '@proc-geo/core';

/**
 * Hand-built subdivision trees, shared by the suites that read a tree's shape.
 *
 * Written out rather than solved for: what the panel counts and what the adapter tints are facts
 * about the tree's shape, not about the geometry in it, and a fixture with no geometry in it cannot
 * quietly change underneath the assertions when a solver does. Both suites read the same tree so
 * that a count and a tint asserted against it are asserted against the same thing.
 */

const SQUARE: Vector2[] = [
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
];

function strip(): Strip {
    return { supportingEdgeIds: [0], boundary: SQUARE, holes: [], frontage: [] };
}

/** A node with `segments` identical cells, and whatever children it is given. */
export function node(level: number, segments: number, children: RecursiveNode[] = []): RecursiveNode {
    return {
        level,
        boundary: SQUARE,
        segments: Array.from({ length: segments }, strip),
        children,
    };
}

/** A region that would not subdivide: no segments, no children, a reason. */
export function failedNode(level: number): RecursiveNode {
    return { level, boundary: SQUARE, segments: [], children: [], failure: 'Degenerate region: no area.' };
}

/**
 * Three levels, one failed cell, and one branch that stops a level early — so a level's node count,
 * its segment count and its failure count are all distinct numbers rather than coincidentally equal.
 */
export const TREE: RecursiveNode = node(0, 3, [
    node(1, 2),
    failedNode(1),
    node(1, 4, [node(2, 2)]),
]);

/** How many level-0 segments {@link TREE} has — how many ways its hue wheel is cut. */
export const TREE_TERRITORY_COUNT = 3;
