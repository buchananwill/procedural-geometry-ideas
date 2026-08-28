import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
    clampDepthFraction,
    clampLevelSpecs,
    clampMergeGroupSize,
    flattenRecursiveTree,
    FULL_DEPTH_FRACTION,
    isLastLevel,
    MAX_RECURSION_LEVELS,
    MIN_RECURSION_LEVELS,
} from '@proc-geo/core';
import type {
    LevelSpec,
    RecursiveNode,
    ResidueTreatment,
    SegmentTreatment,
    SpineStrategy,
} from '@proc-geo/core';

/**
 * The fixture the page opens on.
 *
 * Chosen for the picture rather than for the algorithm: eight edges become four merged segments and
 * those become fifteen, so one glance shows two genuinely different scales of cell. A triangle or a
 * square subdivides correctly and looks like nothing has happened.
 */
export const DEFAULT_RECURSIVE_FIXTURE = 'Duck Octagon (passes)';

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
 * The depth a level opens at, and the depth a level added by hand starts at.
 *
 * Short of full depth, where there IS a residue. Full depth is the behaviour that predates the residue
 * stream and shows none at all, so a level opening at 1.0 would demonstrate nothing new and would
 * leave its own residue control inert.
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

/** Segments recurse by default, which is the one thing the retired scalar shape could always do. */
export const DEFAULT_SEGMENT_TREATMENT: SegmentTreatment = 'recurse';

/**
 * The spec a level added by hand starts on: both streams recursing at the default dials.
 *
 * Both streams rather than one, because a new row lands at the BOTTOM of the list where decision 3
 * makes it terminal anyway — so what these two settings describe is what the row will do once another
 * is added below it, and a row that arrived already terminal would read as a row that does nothing.
 */
export const DEFAULT_LEVEL_SPEC: LevelSpec = {
    depthFraction: DEFAULT_DEPTH_FRACTION,
    mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
    segments: DEFAULT_SEGMENT_TREATMENT,
    residue: DEFAULT_RESIDUE_TREATMENT,
};

/**
 * The three levels the page opens on — DELIBERATELY UNLIKE EACH OTHER.
 *
 * The whole point of a level being its own spec is invisible in a homogeneous tree: three identical
 * rows produce exactly the picture the retired scalar options produced, and a reader could not tell the
 * change had happened. So the default composition differs in every field a spec has:
 *
 * - **Level 0** cuts a shallow rim in merged pairs and sends both streams down, so the first thing on
 *   screen is a ring of coarse cells around a courtyard, each of which is a region in its own right.
 * - **Level 1** cuts deeper, one segment per edge, and is the DROSTE level: its ring of cells is final
 *   and only its courtyard descends. That is the reading the retired shape could not ask for at all.
 * - **Level 2** runs at full depth, so it has no residue and the segments tile it — the terminal level,
 *   said in the two settings rather than left to decision 3 to override.
 *
 * Measured on {@link DEFAULT_RECURSIVE_FIXTURE}: every region solves, and the tree reaches all three
 * levels with residue rings at the two levels that have a depth short of full.
 */
export const DEFAULT_RECURSIVE_LEVELS: LevelSpec[] = [
    { depthFraction: 0.5, mergeGroupSize: 2, segments: 'recurse', residue: 'recurse' },
    { depthFraction: 0.65, mergeGroupSize: 1, segments: 'leaf', residue: 'recurse' },
    { depthFraction: FULL_DEPTH_FRACTION, mergeGroupSize: 1, segments: 'leaf', residue: 'void' },
];

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

/**
 * A change to one level's spec: any subset of its fields.
 *
 * Derived from {@link LevelSpec} rather than listed again, so a fifth field on a spec is editable the
 * moment it exists rather than the moment somebody remembers to add a setter for it.
 */
export type LevelSpecPatch = Partial<LevelSpec>;

/** Which definition of a spine a level uses. The three the core module offers, no more. */
export type SpineStrategyKind = SpineStrategy['kind'];

/** The wavefront-time threshold a level starts on: half the region's maximum offset. */
export const DEFAULT_WAVEFRONT_TIME_FRACTION = 0.5;

/**
 * The whisker threshold a level starts on: a seventh of the diameter's length.
 *
 * Low, deliberately. A whisker prune is interesting where it removes the bisectors and keeps the
 * arcs between them, and the fraction at which that happens is small on most regions — a setting
 * that opened having pruned the tree to nothing would look like a page that had failed.
 */
export const DEFAULT_WHISKER_PRUNE_FRACTION = 0.15;

/** Step both spine sliders move in, matching the depth control's feel. */
export const SPINE_FRACTION_STEP = 0.05;

/** The strategy a level added by hand starts on: the one definition that takes no parameter. */
export const DEFAULT_SPINE_STRATEGY: SpineStrategy = { kind: 'diameter' };

/**
 * The strategy each level opens on — ONE OF EACH, deliberately.
 *
 * The three definitions have never been compared, and the page exists to compare them, so the
 * default composition puts all three on screen at once rather than three copies of the safest one.
 * Level 0 is the whole region's through-route, level 1 keeps the deep interior of each of its cells,
 * level 2 prunes whiskers — and a reader who changes nothing has already seen the comparison the
 * task was raised to make.
 *
 * As long as {@link RecursiveSubdivisionStoreState.spineStrategies} — one entry per level the driver
 * can run, whatever the current composition is.
 */
export const DEFAULT_SPINE_STRATEGIES: SpineStrategy[] = [
    { kind: 'diameter' },
    { kind: 'wavefront-time', fraction: DEFAULT_WAVEFRONT_TIME_FRACTION },
    { kind: 'whisker-prune', fraction: DEFAULT_WHISKER_PRUNE_FRACTION },
];

/**
 * A spine fraction as the panel means it: inside `[0, 1]`.
 *
 * Both thresholds are dimensionless fractions of the region's own scale, which is what lets one
 * slider mean the same thing on a courtyard and on a whole region. The clamp is the PANEL's, not the
 * solver's: `extractSpine` reads whatever it is handed and lands above or below everything, which is
 * the honest answer for a library caller and a control that had lost its stops for a user.
 */
export function clampSpineFraction(fraction: number): number {
    if (!Number.isFinite(fraction)) return 0;
    return Math.min(1, Math.max(0, fraction));
}

/** The threshold a strategy carries, or `undefined` for the one that takes no parameter. */
export function spineFractionOf(strategy: SpineStrategy): number | undefined {
    return strategy.kind === 'diameter' ? undefined : strategy.fraction;
}

/**
 * The same strategy under a different definition, carrying the threshold across.
 *
 * A reader comparing `wavefront-time` at 0.4 with `whisker-prune` wants to see the OTHER definition,
 * not the other definition at some remembered default — so the fraction survives the switch, and only
 * a switch out of `diameter`, which has none to carry, falls back to a default.
 */
export function withSpineKind(strategy: SpineStrategy, kind: SpineStrategyKind): SpineStrategy {
    if (kind === 'diameter') return { kind };
    const carried = spineFractionOf(strategy);
    const fallback = kind === 'wavefront-time'
        ? DEFAULT_WAVEFRONT_TIME_FRACTION
        : DEFAULT_WHISKER_PRUNE_FRACTION;
    return { kind, fraction: clampSpineFraction(carried ?? fallback) };
}

/** One level's strategy with its threshold moved, or unchanged where it has none to move. */
export function withSpineFraction(strategy: SpineStrategy, fraction: number): SpineStrategy {
    return strategy.kind === 'diameter' ? { kind: 'diameter' } : { ...strategy, fraction: clampSpineFraction(fraction) };
}

/** A strategy as the panel stores it: its own threshold put through the panel's clamp. */
function clampedSpineStrategy(strategy: SpineStrategy): SpineStrategy {
    return withSpineFraction(strategy, spineFractionOf(strategy) ?? 0);
}

export interface RecursiveSubdivisionStoreState {
    /** Name of the `FULL_CORPUS` entry being subdivided — known-defect fixtures included. */
    fixtureName: string;
    /**
     * One spec per level, outermost first. Its LENGTH is the recursion depth.
     *
     * There is no separate level count: the panel adds and removes rows, and the driver reads the
     * array. Kept inside `[1, 3]` entries by {@link clampLevelSpecs}, which is the same clamp the
     * driver applies, so the panel cannot report a level the solver will not run.
     */
    levels: LevelSpec[];
    /**
     * Which levels are drawn, indexed by level.
     *
     * Always `MAX_RECURSION_LEVELS` long regardless of how many levels are specified, so removing a
     * row and adding one back does not silently forget which levels were hidden.
     */
    levelVisibility: boolean[];
    /** Leaf cells are filled with their territory's tint. Off is stroke-only rendering. */
    showLeafFills: boolean;
    /**
     * Which spine definition each level uses, indexed by level.
     *
     * PER LEVEL, like every other dial on this page: a spine is a per-level property in the design,
     * and the question "which definition is right" may well have a different answer for a whole
     * region than for one of its cells. Always `MAX_RECURSION_LEVELS` long for the same reason
     * {@link RecursiveSubdivisionStoreState.levelVisibility} is — removing a row and adding one back
     * does not silently forget what that level was set to.
     */
    spineStrategies: SpineStrategy[];

    setFixtureName: (name: string) => void;
    /** Changes some of one level's fields, clamping whatever it was handed. */
    updateLevel: (level: number, patch: LevelSpecPatch) => void;
    /** Appends a level at the deepest end, up to `MAX_RECURSION_LEVELS`. */
    addLevel: () => void;
    /** Removes one level, keeping at least `MIN_RECURSION_LEVELS`. */
    removeLevel: (level: number) => void;
    toggleLevel: (level: number) => void;
    showAllLevels: () => void;
    setShowLeafFills: (show: boolean) => void;
    /** Sets one level's spine definition, clamping whatever threshold it was handed. */
    setSpineStrategy: (level: number, strategy: SpineStrategy) => void;
}

/**
 * What one of a level's two child streams asked for, and what it actually did.
 *
 * GENERIC OVER THE TREATMENT because the two streams answer different questions — `leaf` against
 * `void` — while everything else about the report is the same, and two hand-copied interfaces would be
 * two places for a fourth field to be added to one of them.
 */
export interface RecursiveStreamReport<TTreatment extends string> {
    /** What this level's spec asked for. */
    requested: TTreatment;
    /** Whether regions at this level actually grew children from this stream. */
    recursed: boolean;
    /**
     * The spec asked to recurse and the level had nowhere to send it.
     *
     * A SPEC THAT SAYS `recurse` AND A TREE THAT SHOWS LEAVES IS EXACTLY THE DISAGREEMENT A READOUT
     * EXISTS TO CATCH, so it is reported rather than quietly resolved: at the last level both streams
     * are terminal whatever the spec says.
     */
    overridden: boolean;
}

export type SegmentStreamReport = RecursiveStreamReport<SegmentTreatment>;
export type ResidueStreamReport = RecursiveStreamReport<ResidueTreatment>;

/** Counts for one level of the tree, and what each of its two streams did. */
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
     * Rings at this level the recursion did not reach, WHATEVER THE REASON.
     *
     * A ring can be a real part of the region and still be no polygon at all — fewer than three
     * vertices, or an area under the degeneracy floor — but it can equally be a perfectly good polygon
     * whose own solve did not finish, because a residue ring recurses through exactly the path a
     * segment child does. Both are counted here and neither is named: the ring is kept in the picture
     * and in the area accounting, its child records the reason, and the readout says only that the
     * recursion stopped there. Reporting every one of them as degenerate would assert a cause that is
     * false for most of them. Zero under the `void` treatment, where no ring was a candidate for
     * recursion in the first place.
     */
    unsubdividedResidueRings: number;
    /** What became of the segments this level produced. */
    segmentStream: SegmentStreamReport;
    /** What became of the residue rings this level produced. */
    residueStream: ResidueStreamReport;
    /**
     * This level's residue setting cannot apply: at full depth the wavefront is consumed and there is
     * no residue for it to describe.
     */
    residueInert: boolean;
}

export interface RecursiveTreeSummary {
    levels: RecursiveLevelSummary[];
    /**
     * Segments belonging to a node that grew no segment children — the finest cells in the picture.
     *
     * NO SEGMENT CHILDREN, RATHER THAN NO CHILDREN OF EITHER KIND. A node whose segments are leaves
     * and whose courtyard recurses — the droste reading — has a ring of cells that really is final,
     * and counting it as unfinished because the residue went deeper is the one miscount this shape
     * makes easy. It is also the count the canvas fills, so panel and picture agree.
     */
    leafSegments: number;
    totalSegments: number;
    totalFailures: number;
    totalResidueRings: number;
    totalUnsubdividedResidueRings: number;
}

/** Rings this node kept but did not recurse on — see {@link RecursiveLevelSummary.unsubdividedResidueRings}. */
function unsubdividedResidueRings(node: RecursiveNode): number {
    return node.residueChildren.filter((child) => child.failure !== undefined).length;
}

function sumOver(nodes: RecursiveNode[], count: (node: RecursiveNode) => number): number {
    return nodes.reduce((total, node) => total + count(node), 0);
}

/** One stream's report: what was asked, what happened, and whether the two disagree. */
function streamReport<TTreatment extends string>(
    requested: TTreatment,
    recursed: boolean,
    terminal: boolean,
): RecursiveStreamReport<TTreatment> {
    return { requested, recursed, overridden: requested === 'recurse' && terminal };
}

/**
 * Per-level, residue and leaf counts for a subdivision tree, against the specs it was grown from.
 *
 * THE SPECS ARE A PARAMETER, not read back out of the tree, because half of what decision 9 asks for
 * cannot be recovered from a tree at all: a level whose `recurse` was overridden looks exactly like a
 * level that asked to stop. One row per spec, which is one row per level the driver can produce.
 */
export function summariseRecursiveTree(root: RecursiveNode, specs: LevelSpec[]): RecursiveTreeSummary {
    const nodes = flattenRecursiveTree(root);
    const levelSpecs = clampLevelSpecs(specs);

    const levels: RecursiveLevelSummary[] = levelSpecs.map((spec, level) => {
        const atLevel = nodes.filter((node) => node.level === level);
        // The driver's own predicate rather than the arithmetic restated: a readout that answered
        // decision 3 differently from the driver would report a recursion that never happened.
        const terminal = isLastLevel(level, levelSpecs);
        return {
            level,
            nodes: atLevel.length,
            segments: sumOver(atLevel, (node) => node.segments.length),
            failures: atLevel.filter((node) => node.failure !== undefined).length,
            residueRings: sumOver(atLevel, (node) => node.residueRings.length),
            unsubdividedResidueRings: sumOver(atLevel, unsubdividedResidueRings),
            segmentStream: streamReport(
                spec.segments,
                atLevel.some((node) => node.children.length > 0),
                terminal),
            residueStream: streamReport(
                spec.residue,
                atLevel.some((node) => node.residueChildren.length > 0),
                terminal),
            residueInert: spec.depthFraction >= FULL_DEPTH_FRACTION,
        };
    });

    return {
        levels,
        leafSegments: sumOver(
            nodes.filter((node) => node.children.length === 0),
            (node) => node.segments.length),
        totalSegments: sumOver(nodes, (node) => node.segments.length),
        totalFailures: nodes.filter((node) => node.failure !== undefined).length,
        totalResidueRings: sumOver(nodes, (node) => node.residueRings.length),
        totalUnsubdividedResidueRings: sumOver(nodes, unsubdividedResidueRings),
    };
}

/** One level's spec with the fields of `patch` applied, each clamped the way the driver clamps it. */
function patchedLevel(spec: LevelSpec, patch: LevelSpecPatch): LevelSpec {
    return {
        depthFraction: patch.depthFraction === undefined
            ? spec.depthFraction
            : clampPanelDepthFraction(patch.depthFraction),
        mergeGroupSize: patch.mergeGroupSize === undefined
            ? spec.mergeGroupSize
            : Math.min(MAX_MERGE_GROUP_SIZE, clampMergeGroupSize(patch.mergeGroupSize)),
        segments: patch.segments ?? spec.segments,
        residue: patch.residue ?? spec.residue,
    };
}

export const useRecursiveSubdivisionStore = create<RecursiveSubdivisionStoreState>()(
    immer((set) => ({
        fixtureName: DEFAULT_RECURSIVE_FIXTURE,
        // Copied rather than shared: the store's array is edited in place by `updateLevel`, and the
        // exported default is a constant several suites assert against.
        levels: DEFAULT_RECURSIVE_LEVELS.map((spec) => ({ ...spec })),
        levelVisibility: Array.from({ length: MAX_RECURSION_LEVELS }, () => true),
        showLeafFills: DEFAULT_SHOW_LEAF_FILLS,
        // Copied, and padded to one entry per level the driver can run, so a strategy set on a level
        // that is later removed is still there when the level comes back.
        spineStrategies: Array.from(
            { length: MAX_RECURSION_LEVELS },
            (_unused, level) => ({ ...(DEFAULT_SPINE_STRATEGIES[level] ?? DEFAULT_SPINE_STRATEGY) }),
        ),

        setFixtureName: (name) =>
            set((state) => {
                state.fixtureName = name;
            }),

        // Clamped by the core driver's own clamps rather than by numbers restated here: the store
        // and the solver must agree about what a merge group of 500 or a depth of 4 means, and the
        // only way to guarantee that is to ask the same functions.
        updateLevel: (level, patch) =>
            set((state) => {
                const spec = state.levels[level];
                if (spec === undefined) return;
                state.levels[level] = patchedLevel(spec, patch);
            }),

        addLevel: () =>
            set((state) => {
                if (state.levels.length >= MAX_RECURSION_LEVELS) return;
                state.levels.push({ ...DEFAULT_LEVEL_SPEC });
            }),

        removeLevel: (level) =>
            set((state) => {
                if (state.levels.length <= MIN_RECURSION_LEVELS) return;
                if (level < 0 || level >= state.levels.length) return;
                state.levels.splice(level, 1);
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

        setSpineStrategy: (level, strategy) =>
            set((state) => {
                if (level < 0 || level >= state.spineStrategies.length) return;
                state.spineStrategies[level] = clampedSpineStrategy(strategy);
            }),
    })),
);
