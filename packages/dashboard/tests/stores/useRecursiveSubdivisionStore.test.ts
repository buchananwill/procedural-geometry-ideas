import { MAX_RECURSION_LEVELS } from '@proc-geo/core';
import {
    DEFAULT_MERGE_GROUP_SIZE,
    DEFAULT_RECURSIVE_FIXTURE,
    DEFAULT_RECURSIVE_LEVELS,
    DEFAULT_SHOW_LEAF_FILLS,
    MAX_MERGE_GROUP_SIZE,
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

// Zustand stores are singletons, so restore the slices these tests write to.
const resetStore = () => {
    useRecursiveSubdivisionStore.setState({
        fixtureName: DEFAULT_RECURSIVE_FIXTURE,
        levels: DEFAULT_RECURSIVE_LEVELS,
        mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
        levelVisibility: Array.from({ length: MAX_RECURSION_LEVELS }, () => true),
        showLeafFills: DEFAULT_SHOW_LEAF_FILLS,
    });
};

beforeEach(resetStore);

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

/**
 * The controls the page drives the solver with.
 *
 * Every one of these is a number handed straight to `subdivideRecursively`, so a control that lets an
 * out-of-range value through does not produce a wrong picture — it produces a solver run the driver
 * then silently clamps, and the panel goes on reporting the number the user typed. These assert that
 * the store settles on the value the solver will actually see.
 */
describe('subdivision controls', () => {
    it('takes a fixture name verbatim', () => {
        useRecursiveSubdivisionStore.getState().setFixtureName('Square');
        expect(useRecursiveSubdivisionStore.getState().fixtureName).toBe('Square');
    });

    it('holds levels inside the range the driver recurses over', () => {
        const { setLevels } = useRecursiveSubdivisionStore.getState();

        setLevels(0);
        expect(useRecursiveSubdivisionStore.getState().levels).toBe(1);

        setLevels(99);
        expect(useRecursiveSubdivisionStore.getState().levels).toBe(MAX_RECURSION_LEVELS);

        // A slider mid-drag can read fractional; the driver counts whole passes.
        setLevels(2.7);
        expect(useRecursiveSubdivisionStore.getState().levels).toBe(2);

        setLevels(Number.NaN);
        expect(useRecursiveSubdivisionStore.getState().levels).toBe(1);
    });

    it('holds the merge group between one edge and the panel ceiling', () => {
        const { setMergeGroupSize } = useRecursiveSubdivisionStore.getState();

        setMergeGroupSize(0);
        expect(useRecursiveSubdivisionStore.getState().mergeGroupSize).toBe(1);

        setMergeGroupSize(500);
        expect(useRecursiveSubdivisionStore.getState().mergeGroupSize).toBe(MAX_MERGE_GROUP_SIZE);

        setMergeGroupSize(3.9);
        expect(useRecursiveSubdivisionStore.getState().mergeGroupSize).toBe(3);

        setMergeGroupSize(Number.NaN);
        expect(useRecursiveSubdivisionStore.getState().mergeGroupSize).toBe(1);
    });

    it('toggles one level at a time and leaves its neighbours alone', () => {
        useRecursiveSubdivisionStore.getState().toggleLevel(1);
        expect(useRecursiveSubdivisionStore.getState().levelVisibility).toEqual([true, false, true]);

        useRecursiveSubdivisionStore.getState().toggleLevel(1);
        expect(useRecursiveSubdivisionStore.getState().levelVisibility).toEqual([true, true, true]);
    });

    it('ignores a level outside the tree rather than growing the visibility array', () => {
        const { toggleLevel } = useRecursiveSubdivisionStore.getState();

        toggleLevel(-1);
        toggleLevel(MAX_RECURSION_LEVELS);

        // Keys rather than length: an out-of-range write below zero lands as a `-1` property that
        // leaves both the length and `every` untouched, so only the key set catches it.
        const { levelVisibility } = useRecursiveSubdivisionStore.getState();
        expect(Object.keys(levelVisibility)).toEqual(
            Array.from({ length: MAX_RECURSION_LEVELS }, (_, level) => String(level)),
        );
        expect(levelVisibility.every((visible) => visible)).toBe(true);
    });

    it('brings every hidden level back at once', () => {
        const { toggleLevel, showAllLevels } = useRecursiveSubdivisionStore.getState();
        toggleLevel(0);
        toggleLevel(2);
        expect(useRecursiveSubdivisionStore.getState().levelVisibility).toEqual([false, true, false]);

        showAllLevels();
        expect(useRecursiveSubdivisionStore.getState().levelVisibility).toEqual([true, true, true]);
    });

    it('keeps a hidden level hidden when the level count is turned down and back up', () => {
        const { setLevels, toggleLevel } = useRecursiveSubdivisionStore.getState();

        toggleLevel(2);
        setLevels(1);
        setLevels(MAX_RECURSION_LEVELS);

        // The array is sized by MAX_RECURSION_LEVELS, not by `levels`, so level 2 is still hidden.
        expect(useRecursiveSubdivisionStore.getState().levelVisibility).toEqual([true, true, false]);
    });
});
