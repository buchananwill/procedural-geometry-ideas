import {
    FULL_DEPTH_FRACTION,
    MAX_RECURSION_LEVELS,
    MIN_RECURSION_LEVELS,
    subdivideRecursively,
} from '@proc-geo/core';
import type { LevelSpec } from '@proc-geo/core';
import { CLEAN_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import {
    clampSpineFraction,
    DEFAULT_DEPTH_FRACTION,
    DEFAULT_LEVEL_SPEC,
    DEFAULT_MERGE_GROUP_SIZE,
    DEFAULT_RECURSIVE_FIXTURE,
    DEFAULT_RECURSIVE_LEVELS,
    DEFAULT_RESIDUE_TREATMENT,
    DEFAULT_SEGMENT_TREATMENT,
    DEFAULT_SHOW_LEAF_FILLS,
    DEFAULT_SPINE_STRATEGIES,
    DEFAULT_WAVEFRONT_TIME_FRACTION,
    DEFAULT_WHISKER_PRUNE_FRACTION,
    MAX_MERGE_GROUP_SIZE,
    MIN_PANEL_DEPTH_FRACTION,
    spineFractionOf,
    summariseRecursiveTree,
    useRecursiveSubdivisionStore,
    withSpineFraction,
    withSpineKind,
} from '../../src/stores/useRecursiveSubdivisionStore';
import type {
    RecursiveLevelSummary,
    RecursiveTreeSummary,
} from '../../src/stores/useRecursiveSubdivisionStore';
import {
    DEGENERATE_FAILURE,
    failedNode,
    INCOMPLETE_SOLVE_FAILURE,
    RESIDUE_TREE,
    RESIDUE_TREE_LEVELS,
    TREE,
    TREE_LEVELS,
    UNSOLVED_RESIDUE_TREE,
} from '../fixtures/recursive-trees';

/**
 * What the recursive subdivision page reports, and what it opens showing.
 *
 * These numbers exist to catch a subdivision that looks right on the canvas but is not — a picture
 * that reads as deeply cut while producing a single leaf cell, say, or a level whose setting the
 * driver overrode while the panel went on reporting the setting. A count that drifted silently would
 * take the only check on that with it, so the summary is tested on a tree whose shape is written out
 * rather than solved for, alongside the spec array that tree is the tree OF. What the adapter makes of
 * the same tree is tested beside the adapter, in `tests/scene/recursiveSubdivisionToScene.test.ts`.
 */

// Zustand stores are singletons, so restore the slices these tests write to.
const resetStore = () => {
    useRecursiveSubdivisionStore.setState({
        fixtureName: DEFAULT_RECURSIVE_FIXTURE,
        levels: DEFAULT_RECURSIVE_LEVELS.map((spec) => ({ ...spec })),
        levelVisibility: Array.from({ length: MAX_RECURSION_LEVELS }, () => true),
        showLeafFills: DEFAULT_SHOW_LEAF_FILLS,
        spineStrategies: DEFAULT_SPINE_STRATEGIES.map((strategy) => ({ ...strategy })),
    });
};

beforeEach(resetStore);

/**
 * The counts half of a level summary — everything but what the two streams did.
 *
 * Derived from {@link RecursiveLevelSummary} rather than listed again, so a new count has to be
 * answered here rather than silently escaping every assertion in this file.
 */
type RecursiveLevelCounts = Omit<
    RecursiveLevelSummary,
    'segmentStream' | 'residueStream' | 'residueInert'
>;

/** A summary reduced to its counts, so a test about counts is not restating stream reports. */
function levelCounts(summary: RecursiveTreeSummary): RecursiveLevelCounts[] {
    return summary.levels.map((level) => ({
        level: level.level,
        nodes: level.nodes,
        segments: level.segments,
        failures: level.failures,
        residueRings: level.residueRings,
        unsubdividedResidueRings: level.unsubdividedResidueRings,
    }));
}

describe('summariseRecursiveTree', () => {
    it('counts nodes, segments and failures at each level', () => {
        expect(levelCounts(summariseRecursiveTree(TREE, TREE_LEVELS))).toEqual([
            { level: 0, nodes: 1, segments: 3, failures: 0, residueRings: 0, unsubdividedResidueRings: 0 },
            { level: 1, nodes: 3, segments: 6, failures: 1, residueRings: 0, unsubdividedResidueRings: 0 },
            { level: 2, nodes: 1, segments: 2, failures: 0, residueRings: 0, unsubdividedResidueRings: 0 },
        ]);
    });

    it('counts only the segments of nodes with no segment children as leaf cells', () => {
        // The level-1 node with a child contributes nothing; its child's two segments are the leaves.
        expect(summariseRecursiveTree(TREE, TREE_LEVELS).leafSegments).toBe(4);
    });

    it('totals the segments and failures over the whole tree', () => {
        const summary = summariseRecursiveTree(TREE, TREE_LEVELS);
        expect(summary.totalSegments).toBe(11);
        expect(summary.totalFailures).toBe(1);
    });

    it('reports a root that failed as one level with no segments', () => {
        const summary = summariseRecursiveTree(failedNode(0), [DEFAULT_LEVEL_SPEC]);
        expect(levelCounts(summary)).toEqual([
            { level: 0, nodes: 1, segments: 0, failures: 1, residueRings: 0, unsubdividedResidueRings: 0 },
        ]);
        expect(summary.leafSegments).toBe(0);
        expect(summary.totalSegments).toBe(0);
        expect(summary.totalFailures).toBe(1);
        expect(summary.totalResidueRings).toBe(0);
        expect(summary.totalUnsubdividedResidueRings).toBe(0);
    });

    it('reports one row per specified level, even where the level grew no regions', () => {
        // A level below a terminal one is reached by nothing, and a row of zeroes is how the readout
        // says so — dropping the row would leave a control with no readout beside it.
        const levels: LevelSpec[] = [
            { depthFraction: FULL_DEPTH_FRACTION, mergeGroupSize: 1, segments: 'leaf', residue: 'void' },
            { depthFraction: FULL_DEPTH_FRACTION, mergeGroupSize: 1, segments: 'leaf', residue: 'void' },
        ];
        const summary = summariseRecursiveTree(TREE, levels);
        expect(summary.levels).toHaveLength(2);
        expect(summary.levels[1].nodes).toBe(3);
    });
});

/**
 * Decision 9: the readout says what each stream ASKED FOR and what it actually DID.
 *
 * A spec that says `recurse` and a tree that shows leaves is exactly the disagreement a readout exists
 * to catch, and it is unrecoverable from the tree alone — an overridden level is shaped exactly like a
 * level that asked to stop. So the summary is handed both, and these are the assertions that the two
 * are reported apart rather than reconciled.
 */
describe('what each stream did, per level', () => {
    it('reports a recursed stream as recursed and a terminal one by the word it asked for', () => {
        const summary = summariseRecursiveTree(RESIDUE_TREE, RESIDUE_TREE_LEVELS);

        expect(summary.levels[0].segmentStream)
            .toEqual({ requested: 'leaf', recursed: false, overridden: false });
        expect(summary.levels[0].residueStream)
            .toEqual({ requested: 'recurse', recursed: true, overridden: false });
        expect(summary.levels[1].residueStream)
            .toEqual({ requested: 'void', recursed: false, overridden: false });
    });

    it('flags a level whose recurse the last level overrode, rather than reporting it as asked', () => {
        const levels: LevelSpec[] = [
            { depthFraction: 0.5, mergeGroupSize: 1, segments: 'recurse', residue: 'recurse' },
        ];
        const [level] = summariseRecursiveTree(RESIDUE_TREE, levels).levels;

        expect(level.segmentStream).toEqual({ requested: 'recurse', recursed: false, overridden: true });
        expect(level.residueStream.requested).toBe('recurse');
        expect(level.residueStream.overridden).toBe(true);
    });

    it('calls a residue setting inert at full depth, where there is nothing for it to treat', () => {
        // Decision 5's validity rule showing up where it can: at full depth the wavefront is consumed,
        // so a `recurse` and a `void` describe the same empty stream.
        const summary = summariseRecursiveTree(TREE, TREE_LEVELS);
        expect(summary.levels.every((level) => level.residueInert)).toBe(true);
        expect(summariseRecursiveTree(RESIDUE_TREE, RESIDUE_TREE_LEVELS).levels
            .every((level) => level.residueInert)).toBe(false);
    });
});

/**
 * What the readout says below full depth.
 *
 * The residue is a second stream of children, so the counts have to keep it apart from the first:
 * rings are not segments, an unsubdivided ring is not a failed region, and a residue subtree is still
 * part of the tree. A count that conflated any pair of those would still add up.
 */
describe('summariseRecursiveTree below full depth', () => {
    it('counts residue rings and unsubdivided rings level by level', () => {
        expect(levelCounts(summariseRecursiveTree(RESIDUE_TREE, RESIDUE_TREE_LEVELS))).toEqual([
            { level: 0, nodes: 1, segments: 3, failures: 0, residueRings: 2, unsubdividedResidueRings: 1 },
            { level: 1, nodes: 2, segments: 2, failures: 1, residueRings: 1, unsubdividedResidueRings: 0 },
        ]);
    });

    it('totals the rings over the whole tree, the unsubdivided ones among them', () => {
        const summary = summariseRecursiveTree(RESIDUE_TREE, RESIDUE_TREE_LEVELS);
        expect(summary.totalResidueRings).toBe(3);
        expect(summary.totalUnsubdividedResidueRings).toBe(1);
        // An unsubdivided ring is a child that recorded a reason, so it is a failure as well.
        expect(summary.totalFailures).toBe(1);
    });

    it('counts a ring stopped by an incomplete solve exactly as it counts a degenerate one', () => {
        // A residue ring recurses through the same path a segment child does, so it fails for the same
        // three reasons — and in the real corpus it stops on an incomplete solve far more often than on
        // the degeneracy floor. The two trees differ ONLY in the sentence their unrecursed ring carries,
        // so a count that is blind to the reason must report them identically. That is what licenses the
        // readout to say "not subdivided" and nothing more: it has not checked which reason it was.
        expect(RESIDUE_TREE.residueChildren[1].failure).toBe(DEGENERATE_FAILURE);
        expect(UNSOLVED_RESIDUE_TREE.residueChildren[1].failure).toBe(INCOMPLETE_SOLVE_FAILURE);
        expect(INCOMPLETE_SOLVE_FAILURE).not.toMatch(/^Degenerate region/);

        const unsolved = summariseRecursiveTree(UNSOLVED_RESIDUE_TREE, RESIDUE_TREE_LEVELS);
        expect(levelCounts(unsolved))
            .toEqual(levelCounts(summariseRecursiveTree(RESIDUE_TREE, RESIDUE_TREE_LEVELS)));
        expect(unsolved.totalUnsubdividedResidueRings).toBe(1);
    });

    it('counts the final ring of a droste node as leaf cells, courtyard or no courtyard', () => {
        // The miscount decision 11 warns about. Under `leaf` + `recurse` the root's own segments ARE
        // the finest cells at that level — the recursion went down the residue, not through them — so
        // treating a node with residue children as unfinished loses three cells here.
        const summary = summariseRecursiveTree(RESIDUE_TREE, RESIDUE_TREE_LEVELS);
        expect(RESIDUE_TREE.children).toEqual([]);
        expect(RESIDUE_TREE.residueChildren.length).toBeGreaterThan(0);
        // Three at the root, two in the residue child that subdivided, none in the failed one.
        expect(summary.leafSegments).toBe(5);
    });

    it('sees the residue subtrees of a real solve, not just the segment ones', () => {
        const fixture = CLEAN_TEST_POLYGONS.find((polygon) => polygon.name === DEFAULT_RECURSIVE_FIXTURE);
        const levels: LevelSpec[] = [
            { depthFraction: DEFAULT_DEPTH_FRACTION, mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE, segments: 'recurse', residue: 'recurse' },
            { depthFraction: DEFAULT_DEPTH_FRACTION, mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE, segments: 'leaf', residue: 'void' },
        ];
        const tree = subdivideRecursively(fixture?.vertices ?? [], { levels });

        const summary = summariseRecursiveTree(tree, levels);
        expect(summary.totalResidueRings).toBeGreaterThan(0);
        // The residue children are level-1 regions in their own right, so they must be counted there.
        expect(summary.levels[1].nodes).toBe(tree.children.length + tree.residueChildren.length);
    });
});

describe('page defaults', () => {
    it('opens at three levels, where the mechanism is obvious rather than merely present', () => {
        expect(DEFAULT_RECURSIVE_LEVELS).toHaveLength(MAX_RECURSION_LEVELS);
        expect(useRecursiveSubdivisionStore.getState().levels).toEqual(DEFAULT_RECURSIVE_LEVELS);
    });

    it('opens on levels that differ from each other, which is the whole point of the change', () => {
        // Decision 7 prefers defaults that show the levels DIFFERING: three identical rows produce
        // exactly the picture the retired scalar options produced, and a reader could not tell.
        const depths = new Set(DEFAULT_RECURSIVE_LEVELS.map((level) => level.depthFraction));
        const groups = new Set(DEFAULT_RECURSIVE_LEVELS.map((level) => level.mergeGroupSize));
        const segments = new Set(DEFAULT_RECURSIVE_LEVELS.map((level) => level.segments));

        expect(depths.size).toBeGreaterThan(1);
        expect(groups.size).toBeGreaterThan(1);
        expect(segments.size).toBeGreaterThan(1);
    });

    it('opens on a tree that really is recursive, and heterogeneous, on the default fixture', () => {
        // Decision 7: a recursive picture on first paint, measured rather than asserted in the
        // abstract. Every region solves, the tree reaches all three levels, and there is a residue to
        // see at the levels cut short of full depth.
        const fixture = CLEAN_TEST_POLYGONS.find((polygon) => polygon.name === DEFAULT_RECURSIVE_FIXTURE);
        const tree = subdivideRecursively(fixture?.vertices ?? [], { levels: DEFAULT_RECURSIVE_LEVELS });
        const summary = summariseRecursiveTree(tree, DEFAULT_RECURSIVE_LEVELS);

        expect(summary.totalFailures).toBe(0);
        expect(summary.levels).toHaveLength(MAX_RECURSION_LEVELS);
        expect(summary.levels.every((level) => level.nodes > 0)).toBe(true);
        expect(tree.residueRings.length).toBeGreaterThan(1);
        // Level 1 is the droste level: its ring is final and only its courtyard descends.
        expect(summary.levels[1].segmentStream.requested).toBe('leaf');
        expect(summary.levels[1].residueStream.recursed).toBe(true);
        // And nothing the default asks for is quietly overridden.
        expect(summary.levels.every((level) => !level.segmentStream.overridden)).toBe(true);
        expect(summary.levels.every((level) => !level.residueStream.overridden)).toBe(true);
    });

    it('opens with a level added by hand recursing both streams at the default dials', () => {
        expect(DEFAULT_LEVEL_SPEC).toEqual({
            depthFraction: DEFAULT_DEPTH_FRACTION,
            mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
            segments: DEFAULT_SEGMENT_TREATMENT,
            residue: DEFAULT_RESIDUE_TREATMENT,
        });
        expect(DEFAULT_DEPTH_FRACTION).toBeLessThan(FULL_DEPTH_FRACTION);
        expect(DEFAULT_RESIDUE_TREATMENT).toBe('recurse');
        expect(DEFAULT_SEGMENT_TREATMENT).toBe('recurse');
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
 * Every one of these is a field handed straight to `subdivideRecursively`, so a control that lets an
 * out-of-range value through does not produce a wrong picture — it produces a solver run the driver
 * then silently clamps, and the panel goes on reporting the number the user typed. These assert that
 * the store settles on the value the solver will actually see.
 */
describe('subdivision controls', () => {
    it('takes a fixture name verbatim', () => {
        useRecursiveSubdivisionStore.getState().setFixtureName('Square');
        expect(useRecursiveSubdivisionStore.getState().fixtureName).toBe('Square');
    });

    it('edits one level and leaves its neighbours exactly as they were', () => {
        const { updateLevel } = useRecursiveSubdivisionStore.getState();
        updateLevel(1, { segments: 'recurse', mergeGroupSize: 4 });

        const { levels } = useRecursiveSubdivisionStore.getState();
        expect(levels[1].segments).toBe('recurse');
        expect(levels[1].mergeGroupSize).toBe(4);
        // The fields it was not handed keep their values, and the other rows are untouched.
        expect(levels[1].depthFraction).toBe(DEFAULT_RECURSIVE_LEVELS[1].depthFraction);
        expect(levels[0]).toEqual(DEFAULT_RECURSIVE_LEVELS[0]);
        expect(levels[2]).toEqual(DEFAULT_RECURSIVE_LEVELS[2]);
    });

    it('ignores an edit to a level that does not exist', () => {
        const { updateLevel } = useRecursiveSubdivisionStore.getState();
        updateLevel(7, { mergeGroupSize: 4 });
        updateLevel(-1, { mergeGroupSize: 4 });
        expect(useRecursiveSubdivisionStore.getState().levels).toEqual(DEFAULT_RECURSIVE_LEVELS);
    });

    it('holds a level’s merge group between one edge and the panel ceiling', () => {
        const { updateLevel } = useRecursiveSubdivisionStore.getState();
        const mergeGroupOf = (level: number) =>
            useRecursiveSubdivisionStore.getState().levels[level].mergeGroupSize;

        updateLevel(0, { mergeGroupSize: 0 });
        expect(mergeGroupOf(0)).toBe(1);

        updateLevel(0, { mergeGroupSize: 500 });
        expect(mergeGroupOf(0)).toBe(MAX_MERGE_GROUP_SIZE);

        updateLevel(0, { mergeGroupSize: 3.9 });
        expect(mergeGroupOf(0)).toBe(3);

        updateLevel(0, { mergeGroupSize: Number.NaN });
        expect(mergeGroupOf(0)).toBe(1);
    });

    it('holds a level’s depth between the panel floor and full depth', () => {
        const { updateLevel } = useRecursiveSubdivisionStore.getState();
        const depthOf = (level: number) =>
            useRecursiveSubdivisionStore.getState().levels[level].depthFraction;

        updateLevel(0, { depthFraction: 0.35 });
        expect(depthOf(0)).toBe(0.35);

        updateLevel(0, { depthFraction: 2 });
        expect(depthOf(0)).toBe(FULL_DEPTH_FRACTION);

        // The core clamp reads a zero as full depth, which is right for a library caller and wrong
        // for a slider: dragging to the left stop must not land on the deepest cut there is.
        updateLevel(0, { depthFraction: 0 });
        expect(depthOf(0)).toBe(MIN_PANEL_DEPTH_FRACTION);

        updateLevel(0, { depthFraction: -1 });
        expect(depthOf(0)).toBe(MIN_PANEL_DEPTH_FRACTION);

        updateLevel(0, { depthFraction: Number.NaN });
        expect(depthOf(0)).toBe(DEFAULT_DEPTH_FRACTION);
    });

    it('switches a level’s stream treatments both ways and leaves its depth where it was', () => {
        const { updateLevel } = useRecursiveSubdivisionStore.getState();
        updateLevel(0, { depthFraction: 0.4 });

        updateLevel(0, { residue: 'void', segments: 'leaf' });
        expect(useRecursiveSubdivisionStore.getState().levels[0].residue).toBe('void');
        expect(useRecursiveSubdivisionStore.getState().levels[0].segments).toBe('leaf');
        expect(useRecursiveSubdivisionStore.getState().levels[0].depthFraction).toBe(0.4);

        updateLevel(0, { residue: 'recurse', segments: 'recurse' });
        expect(useRecursiveSubdivisionStore.getState().levels[0].residue).toBe('recurse');
        expect(useRecursiveSubdivisionStore.getState().levels[0].segments).toBe('recurse');
    });

    it('adds and removes rows, which is the only way the depth changes', () => {
        const { addLevel, removeLevel } = useRecursiveSubdivisionStore.getState();
        const depth = () => useRecursiveSubdivisionStore.getState().levels.length;

        removeLevel(1);
        expect(depth()).toBe(2);
        // The row that was level 2 has moved up, so the array is the composition minus one level
        // rather than a gap in it.
        expect(useRecursiveSubdivisionStore.getState().levels)
            .toEqual([DEFAULT_RECURSIVE_LEVELS[0], DEFAULT_RECURSIVE_LEVELS[2]]);

        addLevel();
        expect(depth()).toBe(3);
        expect(useRecursiveSubdivisionStore.getState().levels[2]).toEqual(DEFAULT_LEVEL_SPEC);
    });

    it('stops adding at the maximum and removing at the minimum', () => {
        const { addLevel, removeLevel } = useRecursiveSubdivisionStore.getState();
        const levels = () => useRecursiveSubdivisionStore.getState().levels;

        addLevel();
        addLevel();
        expect(levels()).toHaveLength(MAX_RECURSION_LEVELS);

        removeLevel(0);
        removeLevel(0);
        removeLevel(0);
        removeLevel(0);
        expect(levels()).toHaveLength(MIN_RECURSION_LEVELS);
        // The one row left is a real spec rather than whatever the last removal left behind.
        expect(levels()[0]).toEqual(DEFAULT_RECURSIVE_LEVELS[MAX_RECURSION_LEVELS - 1]);
    });

    it('ignores a removal of a row that does not exist', () => {
        const { removeLevel } = useRecursiveSubdivisionStore.getState();
        removeLevel(9);
        removeLevel(-1);
        expect(useRecursiveSubdivisionStore.getState().levels).toEqual(DEFAULT_RECURSIVE_LEVELS);
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

    it('keeps a hidden level hidden when a row is removed and added back', () => {
        const { addLevel, removeLevel, toggleLevel } = useRecursiveSubdivisionStore.getState();

        toggleLevel(2);
        removeLevel(2);
        addLevel();

        // The array is sized by MAX_RECURSION_LEVELS, not by the number of rows, so level 2 is
        // still hidden.
        expect(useRecursiveSubdivisionStore.getState().levelVisibility).toEqual([true, true, false]);
    });
});

/**
 * The spine half of the page, as far as the STORE owns it: which definition each level is set to,
 * how a threshold is clamped, and what survives a row being removed and added back.
 *
 * What a definition actually extracts is a pure derivation over the driver's tree and lives beside
 * the other ones, in `tests/scene/regionSpine.test.ts`.
 */

describe('spine strategy defaults', () => {
    it('opens with all three definitions on screen, one per level', () => {
        // Three identical rows would produce exactly the picture one definition produces, and a
        // reader could not tell the comparison had been offered.
        expect(DEFAULT_SPINE_STRATEGIES.map((strategy) => strategy.kind))
            .toEqual(['diameter', 'wavefront-time', 'whisker-prune']);
    });

    it('gives one strategy per level the driver can run', () => {
        expect(useRecursiveSubdivisionStore.getState().spineStrategies).toHaveLength(MAX_RECURSION_LEVELS);
    });
});

describe('spine fractions', () => {
    it('keeps a threshold dimensionless, inside [0, 1]', () => {
        expect(clampSpineFraction(-0.5)).toBe(0);
        expect(clampSpineFraction(4)).toBe(1);
        expect(clampSpineFraction(0.35)).toBe(0.35);
        expect(clampSpineFraction(Number.NaN)).toBe(0);
    });

    it('reports a threshold only for the definitions that have one', () => {
        expect(spineFractionOf({ kind: 'diameter' })).toBeUndefined();
        expect(spineFractionOf({ kind: 'wavefront-time', fraction: 0.4 })).toBe(0.4);
        expect(spineFractionOf({ kind: 'whisker-prune', fraction: 0.2 })).toBe(0.2);
    });

    it('carries a threshold across a change of definition rather than resetting it', () => {
        // A reader comparing two definitions at one setting is the whole use of the control.
        expect(withSpineKind({ kind: 'wavefront-time', fraction: 0.4 }, 'whisker-prune'))
            .toEqual({ kind: 'whisker-prune', fraction: 0.4 });
        // Out of `diameter` there is no threshold to carry, so each definition falls back to its own.
        expect(withSpineKind({ kind: 'diameter' }, 'wavefront-time'))
            .toEqual({ kind: 'wavefront-time', fraction: DEFAULT_WAVEFRONT_TIME_FRACTION });
        expect(withSpineKind({ kind: 'diameter' }, 'whisker-prune'))
            .toEqual({ kind: 'whisker-prune', fraction: DEFAULT_WHISKER_PRUNE_FRACTION });
        expect(withSpineKind({ kind: 'whisker-prune', fraction: 0.2 }, 'diameter'))
            .toEqual({ kind: 'diameter' });
    });

    it('leaves the definition that takes no parameter without one', () => {
        expect(withSpineFraction({ kind: 'diameter' }, 0.7)).toEqual({ kind: 'diameter' });
        expect(withSpineFraction({ kind: 'wavefront-time', fraction: 0.1 }, 0.7))
            .toEqual({ kind: 'wavefront-time', fraction: 0.7 });
    });
});

describe('setSpineStrategy', () => {
    it('sets one level and leaves the others alone', () => {
        useRecursiveSubdivisionStore.getState().setSpineStrategy(1, { kind: 'diameter' });

        const { spineStrategies } = useRecursiveSubdivisionStore.getState();
        expect(spineStrategies[1]).toEqual({ kind: 'diameter' });
        expect(spineStrategies[0]).toEqual(DEFAULT_SPINE_STRATEGIES[0]);
        expect(spineStrategies[2]).toEqual(DEFAULT_SPINE_STRATEGIES[2]);
    });

    it('clamps a threshold it is handed from outside the panel', () => {
        useRecursiveSubdivisionStore.getState()
            .setSpineStrategy(0, { kind: 'wavefront-time', fraction: 8 });
        expect(useRecursiveSubdivisionStore.getState().spineStrategies[0])
            .toEqual({ kind: 'wavefront-time', fraction: 1 });
    });

    it('ignores a level outside the array rather than growing it', () => {
        const { setSpineStrategy } = useRecursiveSubdivisionStore.getState();
        setSpineStrategy(-1, { kind: 'diameter' });
        setSpineStrategy(MAX_RECURSION_LEVELS, { kind: 'diameter' });

        const { spineStrategies } = useRecursiveSubdivisionStore.getState();
        expect(Object.keys(spineStrategies)).toEqual(
            Array.from({ length: MAX_RECURSION_LEVELS }, (_, level) => String(level)),
        );
    });

    it('keeps the strategy of a level that is removed and added back', () => {
        const { addLevel, removeLevel, setSpineStrategy } = useRecursiveSubdivisionStore.getState();

        setSpineStrategy(2, { kind: 'wavefront-time', fraction: 0.25 });
        removeLevel(2);
        addLevel();

        expect(useRecursiveSubdivisionStore.getState().spineStrategies[2])
            .toEqual({ kind: 'wavefront-time', fraction: 0.25 });
    });
});
