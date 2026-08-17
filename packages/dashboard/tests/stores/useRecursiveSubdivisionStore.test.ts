import {
    DEFAULT_RECURSIVE_LEVELS,
    DEFAULT_SHOW_LEAF_FILLS,
    summariseRecursiveTree,
    useRecursiveSubdivisionStore,
} from '../../src/stores/useRecursiveSubdivisionStore';
import { failedNode, TREE } from '../fixtures/recursive-trees';

/**
 * What the recursive subdivision page reports, and what it opens showing.
 *
 * These numbers exist to catch a subdivision that looks right on the canvas but is not — a picture
 * that reads as deeply cut while producing a single leaf cell, say. A count that drifted silently
 * would take the only check on that with it, so the summary is tested on a tree whose shape is
 * written out rather than solved for. What the adapter makes of that same tree is tested beside the
 * adapter, in `tests/scene/recursiveSubdivisionToScene.test.ts`.
 */

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

describe('page defaults', () => {
    it('opens at three levels, where the mechanism is obvious rather than merely present', () => {
        expect(DEFAULT_RECURSIVE_LEVELS).toBe(3);
        expect(useRecursiveSubdivisionStore.getState().levels).toBe(3);
    });

    it('opens with the leaf fills on, and switches them off and back without touching anything else', () => {
        expect(DEFAULT_SHOW_LEAF_FILLS).toBe(true);
        expect(useRecursiveSubdivisionStore.getState().showLeafFills).toBe(true);

        useRecursiveSubdivisionStore.getState().setShowLeafFills(false);
        expect(useRecursiveSubdivisionStore.getState().showLeafFills).toBe(false);
        expect(useRecursiveSubdivisionStore.getState().levelVisibility.every((v) => v)).toBe(true);

        useRecursiveSubdivisionStore.getState().setShowLeafFills(true);
        expect(useRecursiveSubdivisionStore.getState().showLeafFills).toBe(true);
    });
});
