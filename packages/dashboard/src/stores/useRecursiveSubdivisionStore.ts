import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
    clampLevels,
    clampMergeGroupSize,
    flattenRecursiveTree,
    MAX_RECURSION_LEVELS,
    MIN_RECURSION_LEVELS,
} from '@proc-geo/core';
import type { RecursiveNode } from '@proc-geo/core';

/**
 * The fixture the page opens on.
 *
 * Chosen for the picture rather than for the algorithm: eight edges become four merged segments and
 * those become fifteen, so one glance shows two genuinely different scales of cell. A triangle or a
 * square subdivides correctly and looks like nothing has happened.
 */
export const DEFAULT_RECURSIVE_FIXTURE = 'Duck Octagon (passes)';

/** Two levels is the interesting default: one pass shows the mechanism, two shows the recursion. */
export const DEFAULT_RECURSIVE_LEVELS = 2;

/** Pairs of adjacent edges: coarse enough to merge visibly, fine enough to leave several segments. */
export const DEFAULT_MERGE_GROUP_SIZE = 2;

/**
 * Ceiling for the merge group control.
 *
 * Not a solver limit — a group at least as large as the boundary makes every pair of edges the same
 * street, so the region comes back as a single segment and each child is its own parent again. The
 * control stops short of that on the fixtures here, so the dial always does something visible.
 */
export const MAX_MERGE_GROUP_SIZE = 8;

export interface RecursiveSubdivisionStoreState {
    /** Name of the `ALL_TEST_POLYGONS` entry being subdivided. */
    fixtureName: string;
    /** Passes of subdivision, in `[1, 3]`. */
    levels: number;
    /** Adjacent segments merged into one group at every level. */
    mergeGroupSize: number;
    /**
     * Which levels are drawn, indexed by level.
     *
     * Always `MAX_RECURSION_LEVELS` long regardless of `levels`, so turning the level count down and
     * back up does not silently forget which levels were hidden.
     */
    levelVisibility: boolean[];

    setFixtureName: (name: string) => void;
    setLevels: (levels: number) => void;
    setMergeGroupSize: (size: number) => void;
    toggleLevel: (level: number) => void;
    showAllLevels: () => void;
}

/** Counts for one level of the tree. */
export interface RecursiveLevelSummary {
    level: number;
    /** Regions solved (or attempted) at this level. */
    nodes: number;
    /** Segments those regions were divided into. */
    segments: number;
    /** Regions at this level that recorded a failure instead. */
    failures: number;
}

export interface RecursiveTreeSummary {
    levels: RecursiveLevelSummary[];
    /**
     * Segments belonging to a node with no children — the finest cells in the picture.
     *
     * Reported because a subdivision that looks deep while producing one leaf is a bug the eye does
     * not catch, and the per-level counts alone do not say which cells are final.
     */
    leafSegments: number;
    totalSegments: number;
    totalFailures: number;
}

/** Per-level and leaf counts for a subdivision tree. */
export function summariseRecursiveTree(root: RecursiveNode): RecursiveTreeSummary {
    const nodes = flattenRecursiveTree(root);
    const deepest = nodes.reduce((deepestSoFar, node) => Math.max(deepestSoFar, node.level), 0);

    const levels: RecursiveLevelSummary[] = [];
    for (let level = 0; level <= deepest; level++) {
        const atLevel = nodes.filter((node) => node.level === level);
        levels.push({
            level,
            nodes: atLevel.length,
            segments: atLevel.reduce((total, node) => total + node.segments.length, 0),
            failures: atLevel.filter((node) => node.failure !== undefined).length,
        });
    }

    return {
        levels,
        leafSegments: nodes
            .filter((node) => node.children.length === 0)
            .reduce((total, node) => total + node.segments.length, 0),
        totalSegments: nodes.reduce((total, node) => total + node.segments.length, 0),
        totalFailures: nodes.filter((node) => node.failure !== undefined).length,
    };
}

export const useRecursiveSubdivisionStore = create<RecursiveSubdivisionStoreState>()(
    immer((set) => ({
        fixtureName: DEFAULT_RECURSIVE_FIXTURE,
        levels: DEFAULT_RECURSIVE_LEVELS,
        mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
        levelVisibility: Array.from({ length: MAX_RECURSION_LEVELS }, () => true),

        setFixtureName: (name) =>
            set((state) => {
                state.fixtureName = name;
            }),

        // Clamped by the core driver's own clamps rather than by numbers restated here: the store
        // and the solver must agree about what level 4 means, and the only way to guarantee that is
        // to ask the same function.
        setLevels: (levels) =>
            set((state) => {
                state.levels = clampLevels(levels);
            }),

        setMergeGroupSize: (size) =>
            set((state) => {
                state.mergeGroupSize = Math.min(MAX_MERGE_GROUP_SIZE, clampMergeGroupSize(size));
            }),

        toggleLevel: (level) =>
            set((state) => {
                if (level < MIN_RECURSION_LEVELS - 1 || level >= MAX_RECURSION_LEVELS) return;
                state.levelVisibility[level] = !state.levelVisibility[level];
            }),

        showAllLevels: () =>
            set((state) => {
                state.levelVisibility = state.levelVisibility.map(() => true);
            }),
    })),
);
