import { FULL_DEPTH_FRACTION, MAX_RECURSION_LEVELS, subdivideRecursively } from '@proc-geo/core';
import { ALL_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import {
    DEFAULT_DEPTH_FRACTION,
    DEFAULT_MERGE_GROUP_SIZE,
    DEFAULT_RECURSIVE_FIXTURE,
    DEFAULT_RECURSIVE_LEVELS,
    DEFAULT_RESIDUE_TREATMENT,
    DEFAULT_SHOW_LEAF_FILLS,
    MAX_MERGE_GROUP_SIZE,
    MIN_PANEL_DEPTH_FRACTION,
    summariseRecursiveTree,
    useRecursiveSubdivisionStore,
} from '../../src/stores/useRecursiveSubdivisionStore';
import { failedNode, RESIDUE_TREE, TREE } from '../fixtures/recursive-trees';

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
        depthFraction: DEFAULT_DEPTH_FRACTION,
        residue: DEFAULT_RESIDUE_TREATMENT,
        levelVisibility: Array.from({ length: MAX_RECURSION_LEVELS }, () => true),
        showLeafFills: DEFAULT_SHOW_LEAF_FILLS,
    });
};

beforeEach(resetStore);

describe('summariseRecursiveTree', () => {
    it('counts nodes, segments and failures at each level', () => {
        expect(summariseRecursiveTree(TREE).levels).toEqual([
            { level: 0, nodes: 1, segments: 3, failures: 0, residueRings: 0, discardedResidueRings: 0 },
            { level: 1, nodes: 3, segments: 6, failures: 1, residueRings: 0, discardedResidueRings: 0 },
            { level: 2, nodes: 1, segments: 2, failures: 0, residueRings: 0, discardedResidueRings: 0 },
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
        expect(summary.levels).toEqual([
            { level: 0, nodes: 1, segments: 0, failures: 1, residueRings: 0, discardedResidueRings: 0 },
        ]);
        expect(summary.leafSegments).toBe(0);
        expect(summary.totalSegments).toBe(0);
        expect(summary.totalFailures).toBe(1);
        expect(summary.totalResidueRings).toBe(0);
        expect(summary.totalDiscardedResidueRings).toBe(0);
    });
});

/**
 * What the readout says below full depth.
 *
 * The residue is a second stream of children, so the counts have to keep it apart from the first:
 * rings are not segments, a discarded ring is not a failed region, and a residue subtree is still
 * part of the tree. A count that conflated any pair of those would still add up.
 */
describe('summariseRecursiveTree below full depth', () => {
    it('counts residue rings and discarded rings level by level', () => {
        expect(summariseRecursiveTree(RESIDUE_TREE).levels).toEqual([
            { level: 0, nodes: 1, segments: 3, failures: 0, residueRings: 2, discardedResidueRings: 1 },
            { level: 1, nodes: 2, segments: 2, failures: 1, residueRings: 1, discardedResidueRings: 0 },
        ]);
    });

    it('totals the rings over the whole tree, discards among them', () => {
        const summary = summariseRecursiveTree(RESIDUE_TREE);
        expect(summary.totalResidueRings).toBe(3);
        expect(summary.totalDiscardedResidueRings).toBe(1);
        // A discarded ring is a child that recorded a reason, so it is a failure as well as a discard.
        expect(summary.totalFailures).toBe(1);
    });

    it('counts a node with residue children as no leaf, since the picture goes deeper there', () => {
        // Level 0 has residue children, so its own segments are not the finest cells; the level-1
        // residue child has neither kind of child, so its two segments are.
        expect(summariseRecursiveTree(RESIDUE_TREE).leafSegments).toBe(2);
    });

    it('sees the residue subtrees of a real solve, not just the segment ones', () => {
        const fixture = ALL_TEST_POLYGONS.find((polygon) => polygon.name === DEFAULT_RECURSIVE_FIXTURE);
        const tree = subdivideRecursively(fixture?.vertices ?? [], {
            levels: 2,
            mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
            depthFraction: DEFAULT_DEPTH_FRACTION,
            residue: 'recurse',
        });

        const summary = summariseRecursiveTree(tree);
        expect(summary.totalResidueRings).toBeGreaterThan(0);
        // The residue children are level-1 regions in their own right, so they must be counted there.
        expect(summary.levels[1].nodes).toBe(tree.children.length + tree.residueChildren.length);
    });
});

describe('page defaults', () => {
    it('opens at three levels, where the mechanism is obvious rather than merely present', () => {
        expect(DEFAULT_RECURSIVE_LEVELS).toBe(3);
        expect(useRecursiveSubdivisionStore.getState().levels).toBe(3);
    });

    it('opens short of full depth, so the residue the page exists to show is on screen', () => {
        // Decision 10: at full depth there is no residue at all, so a page opening at 1.0 would
        // demonstrate nothing new. Measured on the default fixture rather than asserted in the
        // abstract — the default must actually produce rings, and here it produces two of them.
        expect(DEFAULT_DEPTH_FRACTION).toBeLessThan(FULL_DEPTH_FRACTION);
        expect(useRecursiveSubdivisionStore.getState().depthFraction).toBe(DEFAULT_DEPTH_FRACTION);

        const fixture = ALL_TEST_POLYGONS.find((polygon) => polygon.name === DEFAULT_RECURSIVE_FIXTURE);
        const tree = subdivideRecursively(fixture?.vertices ?? [], {
            levels: DEFAULT_RECURSIVE_LEVELS,
            mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
            depthFraction: DEFAULT_DEPTH_FRACTION,
            residue: DEFAULT_RESIDUE_TREATMENT,
        });
        expect(tree.residueRings.length).toBeGreaterThan(1);
    });

    it('opens with the residue recursed rather than voided', () => {
        expect(DEFAULT_RESIDUE_TREATMENT).toBe('recurse');
        expect(useRecursiveSubdivisionStore.getState().residue).toBe('recurse');
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

    it('holds the depth between the panel floor and full depth', () => {
        const { setDepthFraction } = useRecursiveSubdivisionStore.getState();

        setDepthFraction(0.35);
        expect(useRecursiveSubdivisionStore.getState().depthFraction).toBe(0.35);

        setDepthFraction(2);
        expect(useRecursiveSubdivisionStore.getState().depthFraction).toBe(FULL_DEPTH_FRACTION);

        // The core clamp reads a zero as full depth, which is right for a library caller and wrong
        // for a slider: dragging to the left stop must not land on the deepest cut there is.
        setDepthFraction(0);
        expect(useRecursiveSubdivisionStore.getState().depthFraction).toBe(MIN_PANEL_DEPTH_FRACTION);

        setDepthFraction(-1);
        expect(useRecursiveSubdivisionStore.getState().depthFraction).toBe(MIN_PANEL_DEPTH_FRACTION);

        setDepthFraction(Number.NaN);
        expect(useRecursiveSubdivisionStore.getState().depthFraction).toBe(DEFAULT_DEPTH_FRACTION);
    });

    it('switches the residue treatment both ways and leaves the depth where it was', () => {
        const { setResidue, setDepthFraction } = useRecursiveSubdivisionStore.getState();
        setDepthFraction(0.4);

        setResidue('void');
        expect(useRecursiveSubdivisionStore.getState().residue).toBe('void');
        expect(useRecursiveSubdivisionStore.getState().depthFraction).toBe(0.4);

        setResidue('recurse');
        expect(useRecursiveSubdivisionStore.getState().residue).toBe('recurse');
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
