import type { RecursiveNode, Strip, Vector2 } from '@proc-geo/core';

/**
 * Hand-built subdivision trees, shared by the suites that read a tree's shape.
 *
 * Written out rather than solved for: what the panel counts and what the adapter tints are facts
 * about the tree's shape, not about the geometry in it, and a fixture with no geometry in it cannot
 * quietly change underneath the assertions when a solver does. Both suites read the same tree so
 * that a count and a tint asserted against it are asserted against the same thing.
 *
 * Nothing here was canonicalised, so every node's `canonicalBoundary` is the ring it was handed and
 * its `canonicalAreaDrift` is zero — the state the driver reports for a polygon the noise floor took
 * nothing from, which is what a hand-built tree is.
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

/** A ring inside {@link SQUARE}, inset by `inset` — a residue ring's shape without a solve. */
function ring(inset: number): Vector2[] {
    return [
        { x: inset, y: inset },
        { x: inset, y: 10 - inset },
        { x: 10 - inset, y: 10 - inset },
        { x: 10 - inset, y: inset },
    ];
}

/** A node with `segments` identical cells, and whatever children it is given. */
export function node(level: number, segments: number, children: RecursiveNode[] = []): RecursiveNode {
    return {
        level,
        boundary: SQUARE,
        canonicalBoundary: SQUARE,
        canonicalAreaDrift: 0,
        segments: Array.from({ length: segments }, strip),
        children,
        residueRings: [],
        residueChildren: [],
    };
}

/** A region that would not subdivide: no segments, no children, a reason. */
export function failedNode(level: number): RecursiveNode {
    return {
        level,
        boundary: SQUARE,
        canonicalBoundary: SQUARE,
        canonicalAreaDrift: 0,
        segments: [],
        children: [],
        residueRings: [],
        residueChildren: [],
        failure: 'Degenerate region: no area.',
    };
}

/**
 * A node cut short of full depth: `segments` cells around `rings` residue rings.
 *
 * `residueChildren` mirrors the rings one for one, exactly as the driver emits them, so a suite can
 * tell a ring that was recursed on from one that was discarded — the first child subdivides, and any
 * further child is a failed one, which is how decision 4's discard is recorded.
 */
export function nodeWithResidue(
    level: number,
    segments: number,
    rings: number,
    residueChildren: RecursiveNode[] = [],
): RecursiveNode {
    return {
        level,
        boundary: SQUARE,
        canonicalBoundary: SQUARE,
        canonicalAreaDrift: 0,
        segments: Array.from({ length: segments }, strip),
        children: [],
        residueRings: Array.from({ length: rings }, (_unused, index) => ring(1 + index)),
        residueChildren,
    };
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

/**
 * A partial-depth tree: two rings at the root, one of them recursed on and one discarded.
 *
 * Distinct counts again — two rings, one residue child that subdivided, one that did not — so a
 * summary that confused rings with children, or discards with failures, cannot pass by coincidence.
 */
export const RESIDUE_TREE: RecursiveNode = nodeWithResidue(0, 3, 2, [
    nodeWithResidue(1, 2, 1),
    failedNode(1),
]);
