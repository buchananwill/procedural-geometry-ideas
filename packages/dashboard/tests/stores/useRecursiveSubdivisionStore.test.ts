import type { RecursiveNode, Strip, Vector2 } from '@proc-geo/core';
import { summariseRecursiveTree } from '../../src/stores/useRecursiveSubdivisionStore';

/**
 * The counts the page reports, pinned against a hand-built tree.
 *
 * These numbers exist to catch a subdivision that looks right on the canvas but is not — a picture
 * that reads as deeply cut while producing a single leaf cell, say. A count that drifts silently
 * would take the only check on that with it, so the summary is tested on a tree whose shape is
 * written out rather than solved for.
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

function node(level: number, segments: number, children: RecursiveNode[] = []): RecursiveNode {
    return {
        level,
        boundary: SQUARE,
        segments: Array.from({ length: segments }, strip),
        children,
    };
}

function failedNode(level: number): RecursiveNode {
    return { level, boundary: SQUARE, segments: [], children: [], failure: 'Degenerate region: no area.' };
}

/**
 * Three levels, one failed cell, and one branch that stops a level early — so a level's node count,
 * its segment count and its failure count are all distinct numbers rather than coincidentally equal.
 */
const TREE: RecursiveNode = node(0, 3, [
    node(1, 2),
    failedNode(1),
    node(1, 4, [node(2, 2)]),
]);

describe('summariseRecursiveTree', () => {
    it('counts nodes, segments and failures at each level', () => {
        expect(summariseRecursiveTree(TREE).levels).toEqual([
            { level: 0, nodes: 1, segments: 3, failures: 0 },
            { level: 1, nodes: 3, segments: 6, failures: 1 },
            { level: 2, nodes: 1, segments: 2, failures: 0 },
        ]);
    });

    it('counts only the segments of childless nodes as leaf cells', () => {
        // The level-1 node with a child contributes nothing; its child's two segments are the leaves.
        expect(summariseRecursiveTree(TREE).leafSegments).toBe(4);
    });

    it('totals the segments and failures over the whole tree', () => {
        const summary = summariseRecursiveTree(TREE);
        expect(summary.totalSegments).toBe(11);
        expect(summary.totalFailures).toBe(1);
    });

    it('reports a root that failed as one level with no segments', () => {
        const summary = summariseRecursiveTree(failedNode(0));
        expect(summary.levels).toEqual([{ level: 0, nodes: 1, segments: 0, failures: 1 }]);
        expect(summary.leafSegments).toBe(0);
        expect(summary.totalSegments).toBe(0);
        expect(summary.totalFailures).toBe(1);
    });
});
