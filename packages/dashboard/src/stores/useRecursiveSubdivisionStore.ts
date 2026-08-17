import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
    clampDepthFraction,
    clampLevels,
    clampMergeGroupSize,
    flattenRecursiveTree,
    MAX_RECURSION_LEVELS,
    MIN_RECURSION_LEVELS,
} from '@proc-geo/core';
import type { RecursiveNode, ResidueTreatment } from '@proc-geo/core';

/**
 * The fixture the page opens on.
 *
 * Chosen for the picture rather than for the algorithm: eight edges become four merged segments and
 * those become fifteen, so one glance shows two genuinely different scales of cell. A triangle or a
 * square subdivides correctly and looks like nothing has happened.
 */
export const DEFAULT_RECURSIVE_FIXTURE = 'Duck Octagon (passes)';

/**
 * Three levels is the interesting default.
 *
 * Two is legible, but three is where the mechanism is obvious — territories of coarse cells, each
 * cut again and again — and the counts confirm the fixture still subdivides cleanly there.
 */
export const DEFAULT_RECURSIVE_LEVELS = 3;

/**
 * Leaf cells open tinted by the territory they descend from.
 *
 * On, because that is the picture the page exists to show; switchable, because stroke-only is the
 * honest comparison and the way to check the fills are not hiding anything.
 */
export const DEFAULT_SHOW_LEAF_FILLS = true;

/** Pairs of adjacent edges: coarse enough to merge visibly, fine enough to leave several segments. */
export const DEFAULT_MERGE_GROUP_SIZE = 2;

/**
 * The page opens at half depth, where there IS a residue — and, on the default fixture, two of them.
 *
 * Full depth is the behaviour that predates this control and shows no residue at all, so a page
 * opening at 1.0 would demonstrate nothing new. Measured on `Duck Octagon (passes)`: at half its
 * maximum offset the residue is a quarter of the region's area and has already pinched into two
 * separate rings, so the default view shows both that the interior is a different kind of thing and
 * that it is rings plural.
 */
export const DEFAULT_DEPTH_FRACTION = 0.5;

/**
 * Shallowest cut the control offers.
 *
 * Not a solver limit: the driver accepts anything above zero. Below a twentieth of the maximum offset
 * the segments are a hairline rim around a residue that is all but the whole region, which reads as a
 * page that has stopped working rather than as a shallow cut.
 */
export const MIN_PANEL_DEPTH_FRACTION = 0.05;

/** Step the depth control moves in — fine enough to walk a residue through a pinch. */
export const DEPTH_FRACTION_STEP = 0.05;

/** Residue recursion is on by default: the droste reading is what the second stream is for. */
export const DEFAULT_RESIDUE_TREATMENT: ResidueTreatment = 'recurse';

/**
 * Depth fraction as the panel means it: inside `[MIN_PANEL_DEPTH_FRACTION, 1]`.
 *
 * The core clamp is asked the same question afterwards rather than restated here, so the panel and
 * the solver cannot disagree about what 1.2 means. What this adds is the panel's own floor: the core
 * clamp reads a zero as full depth — the honest reading of "no usable depth" for a library caller —
 * and a slider dragged to its left stop landing on FULL depth would be the opposite of what the user
 * just asked for.
 */
export function clampPanelDepthFraction(depthFraction: number): number {
    if (!Number.isFinite(depthFraction)) {
        return DEFAULT_DEPTH_FRACTION;
    }
    return clampDepthFraction(Math.max(MIN_PANEL_DEPTH_FRACTION, depthFraction));
}

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
    /** Inward cut as a fraction of each region's own maximum offset. 1 = full depth, no residue. */
    depthFraction: number;
    /** Whether each region's residue is subdivided in turn or left whole as a courtyard. */
    residue: ResidueTreatment;
    /**
     * Which levels are drawn, indexed by level.
     *
     * Always `MAX_RECURSION_LEVELS` long regardless of `levels`, so turning the level count down and
     * back up does not silently forget which levels were hidden.
     */
    levelVisibility: boolean[];
    /** Leaf cells are filled with their territory's tint. Off is stroke-only rendering. */
    showLeafFills: boolean;

    setFixtureName: (name: string) => void;
    setLevels: (levels: number) => void;
    setMergeGroupSize: (size: number) => void;
    setDepthFraction: (depthFraction: number) => void;
    setResidue: (residue: ResidueTreatment) => void;
    toggleLevel: (level: number) => void;
    showAllLevels: () => void;
    setShowLeafFills: (show: boolean) => void;
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
    /** Residue rings those regions were left holding. Zero everywhere at full depth. */
    residueRings: number;
    /**
     * Rings at this level that were discarded rather than recursed on.
     *
     * A ring can be a real part of the region and still be no polygon at all — fewer than three
     * vertices, or an area under the degeneracy floor. Such a ring is kept in the picture and in the
     * area accounting, and its child records why it was not subdivided; this is that count. It is
     * zero under the `void` treatment, where no ring was a candidate for recursion in the first place.
     */
    discardedResidueRings: number;
}

export interface RecursiveTreeSummary {
    levels: RecursiveLevelSummary[];
    /**
     * Segments belonging to a node with no children of either kind — the finest cells in the picture.
     *
     * Reported because a subdivision that looks deep while producing one leaf is a bug the eye does
     * not catch, and the per-level counts alone do not say which cells are final.
     */
    leafSegments: number;
    totalSegments: number;
    totalFailures: number;
    totalResidueRings: number;
    totalDiscardedResidueRings: number;
}

/** Rings this node kept but did not recurse on — see {@link RecursiveLevelSummary.discardedResidueRings}. */
function discardedResidueRings(node: RecursiveNode): number {
    return node.residueChildren.filter((child) => child.failure !== undefined).length;
}

function sumOver(nodes: RecursiveNode[], count: (node: RecursiveNode) => number): number {
    return nodes.reduce((total, node) => total + count(node), 0);
}

/** Per-level, residue and leaf counts for a subdivision tree. */
export function summariseRecursiveTree(root: RecursiveNode): RecursiveTreeSummary {
    const nodes = flattenRecursiveTree(root);
    const deepest = nodes.reduce((deepestSoFar, node) => Math.max(deepestSoFar, node.level), 0);

    const levels: RecursiveLevelSummary[] = [];
    for (let level = 0; level <= deepest; level++) {
        const atLevel = nodes.filter((node) => node.level === level);
        levels.push({
            level,
            nodes: atLevel.length,
            segments: sumOver(atLevel, (node) => node.segments.length),
            failures: atLevel.filter((node) => node.failure !== undefined).length,
            residueRings: sumOver(atLevel, (node) => node.residueRings.length),
            discardedResidueRings: sumOver(atLevel, discardedResidueRings),
        });
    }

    return {
        levels,
        leafSegments: sumOver(
            nodes.filter((node) => node.children.length === 0 && node.residueChildren.length === 0),
            (node) => node.segments.length),
        totalSegments: sumOver(nodes, (node) => node.segments.length),
        totalFailures: nodes.filter((node) => node.failure !== undefined).length,
        totalResidueRings: sumOver(nodes, (node) => node.residueRings.length),
        totalDiscardedResidueRings: sumOver(nodes, discardedResidueRings),
    };
}

export const useRecursiveSubdivisionStore = create<RecursiveSubdivisionStoreState>()(
    immer((set) => ({
        fixtureName: DEFAULT_RECURSIVE_FIXTURE,
        levels: DEFAULT_RECURSIVE_LEVELS,
        mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
        depthFraction: DEFAULT_DEPTH_FRACTION,
        residue: DEFAULT_RESIDUE_TREATMENT,
        levelVisibility: Array.from({ length: MAX_RECURSION_LEVELS }, () => true),
        showLeafFills: DEFAULT_SHOW_LEAF_FILLS,

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

        setDepthFraction: (depthFraction) =>
            set((state) => {
                state.depthFraction = clampPanelDepthFraction(depthFraction);
            }),

        setResidue: (residue) =>
            set((state) => {
                state.residue = residue;
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

        setShowLeafFills: (show) =>
            set((state) => {
                state.showLeafFills = show;
            }),
    })),
);
