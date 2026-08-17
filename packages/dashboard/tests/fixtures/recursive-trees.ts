import { FULL_DEPTH_FRACTION } from '@proc-geo/core';
import type { LevelSpec, RecursiveNode, Strip, Vector2 } from '@proc-geo/core';

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

/**
 * What every node here says about canonicalisation: the ring it was handed came back untouched.
 *
 * Spread into each factory rather than spelled out in each, so the file states once — in code as
 * well as in the prose above — that a hand-built tree has nothing for a noise floor to remove.
 */
const UNCANONICALISED: Pick<RecursiveNode, 'canonicalBoundary' | 'canonicalAreaDrift'> = {
    canonicalBoundary: SQUARE,
    canonicalAreaDrift: 0,
};

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
        ...UNCANONICALISED,
        segments: Array.from({ length: segments }, strip),
        children,
        residueRings: [],
        residueChildren: [],
    };
}

/**
 * The reason {@link failedNode} gives when it is not told one: a region that was no polygon at all.
 *
 * One of the three sentences the driver can report, and the one a residue ring hits least often —
 * which is why the incomplete-solve reason below exists beside it.
 */
export const DEGENERATE_FAILURE = 'Degenerate region: no area.';

/**
 * A region that WAS a polygon and still did not subdivide, because its own solve did not finish.
 *
 * The failure a residue ring reaches by far the most often in the real corpus, and nothing about it is
 * degenerate: the ring has area, vertices and a winding. A readout that calls every ring it did not
 * recurse on "degenerate" is wrong about this one, so the fixtures carry it explicitly.
 */
export const INCOMPLETE_SOLVE_FAILURE = 'Incomplete solve: unresolved-collision: two edges never met.';

/** A region that would not subdivide: no segments, no children, and the reason it gives. */
export function failedNode(level: number, failure: string = DEGENERATE_FAILURE): RecursiveNode {
    return {
        level,
        boundary: SQUARE,
        ...UNCANONICALISED,
        segments: [],
        children: [],
        residueRings: [],
        residueChildren: [],
        failure,
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
        ...UNCANONICALISED,
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
 * The spec array {@link TREE} is the tree of.
 *
 * Written out beside the tree because half of what a readout has to say cannot be recovered from a
 * tree at all — a level whose `recurse` was overridden looks exactly like a level that asked to stop —
 * so the suites that read the summary need both. Full depth at every level, which is why no node here
 * carries a residue ring, and segments recursing until the terminal third level.
 */
export const TREE_LEVELS: LevelSpec[] = [
    { depthFraction: FULL_DEPTH_FRACTION, mergeGroupSize: 1, segments: 'recurse', residue: 'void' },
    { depthFraction: FULL_DEPTH_FRACTION, mergeGroupSize: 1, segments: 'recurse', residue: 'void' },
    { depthFraction: FULL_DEPTH_FRACTION, mergeGroupSize: 1, segments: 'leaf', residue: 'void' },
];

/**
 * A partial-depth tree: two rings at the root, one of them recursed on and one discarded.
 *
 * Distinct counts again — two rings, one residue child that subdivided, one that did not — so a
 * summary that confused rings with children, or discards with failures, cannot pass by coincidence.
 *
 * ALSO THE DROSTE SHAPE, and deliberately so: the root has residue children and no segment children,
 * which is the one shape only `leaf` + `recurse` can produce. Its own segments are therefore FINAL,
 * and a summary that treats a node with residue children as unfinished undercounts them.
 */
export const RESIDUE_TREE: RecursiveNode = nodeWithResidue(0, 3, 2, [
    nodeWithResidue(1, 2, 1),
    failedNode(1),
]);

/**
 * {@link RESIDUE_TREE} with its unrecursed ring stopped by an INCOMPLETE SOLVE rather than degeneracy.
 *
 * Identical in shape, different in reason, and that is the whole of it: the counts a readout reports
 * cannot tell these two trees apart, so a readout that names degeneracy is asserting a cause it has
 * not checked. The corpus produces this variant far more often than the degenerate one.
 */
export const UNSOLVED_RESIDUE_TREE: RecursiveNode = nodeWithResidue(0, 3, 2, [
    nodeWithResidue(1, 2, 1),
    failedNode(1, INCOMPLETE_SOLVE_FAILURE),
]);

/** The spec array {@link RESIDUE_TREE} is the tree of: the droste reading, then a terminal level. */
export const RESIDUE_TREE_LEVELS: LevelSpec[] = [
    { depthFraction: 0.5, mergeGroupSize: 1, segments: 'leaf', residue: 'recurse' },
    { depthFraction: 0.5, mergeGroupSize: 1, segments: 'leaf', residue: 'void' },
];
