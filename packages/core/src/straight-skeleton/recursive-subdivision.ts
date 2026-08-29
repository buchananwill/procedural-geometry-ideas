import type {SkeletonSolveResult, Vector2} from './types';
import {solveSkeleton} from './algorithm-termination-cases';
import {canonicalisePolygon, REMOVED_VERTEX_INDEX, SKELETON_NOISE_FLOOR} from './canonicalisation';
import {DEGENERATE_AREA_EPSILON} from './constants';
import {denormaliseLength, makeSkeletonNormalisation, normaliseLength, normalisePolygon} from './normalisation';
import {computeMaxOffset, computeOffsetRings} from './offset-projection';
import {computeStrips} from './strip-decomposition';
import type {Strip, StripOptions} from './strip-decomposition';
import {ensureClockwise} from './polygon-decomposition';
import {signedArea} from '../random-polygon/geometry-helpers';

/**
 * Recursive segment subdivision: solve a region, cut it into segments, solve each segment again —
 * and, below full depth, solve what the wavefront never reached as well.
 *
 * ## Nothing here is new geometry
 *
 * The whole driver is `solveSkeleton` → `computeStrips` at {@link LevelSpec.depthFraction} of
 * `computeMaxOffset` → recurse. At full depth the offset contour has vanished, so the segments tile
 * the region exactly and there is nothing left over. BELOW full depth the same solve yields TWO child
 * streams, and both are carried: the segments, and the RESIDUE — the interior contour the wavefront
 * has not yet reached, read straight off `computeOffsetRings`.
 *
 * ## A LEVEL IS ITS OWN SPEC
 *
 * {@link RecursiveOptions} is one {@link LevelSpec} per level and NOTHING ELSE: the array's length is
 * the recursion depth, and `levels[n]` says how a region handed to level `n` is divided — its depth,
 * its merge grouping, and what becomes of each of its two child streams. A level's spec governs the
 * region it is HANDED, never the regions it produces, which is the only reading under which
 * {@link LevelSpec.segments} and {@link LevelSpec.residue} mean the same thing at every level.
 *
 * Both streams are independently terminal, so all four combinations are askable and all four work.
 * `leaf` + `recurse` is the droste reading proper — the ring of segments is final and only the
 * courtyard subdivides — and it is the only combination in which a node has residue children and no
 * segment children. The scalar shape this replaced could not express it, or `void` + `leaf`, or
 * `leaf` + `void`, because segments always recursed.
 *
 * ## The residue is rings, PLURAL
 *
 * Offsetting a non-convex polygon inward is not shape-preserving: where the boundary pinches, the
 * wavefront separates into disconnected loops. `computeOffsetRings` says so in its return type and
 * this driver honours it — each ring is its own region with its own recursion. Treating the residue
 * as a single polygon is the obvious wrong implementation and would look perfectly correct on every
 * convex fixture in the corpus.
 *
 * ## The canonicalisation floor belongs to the ROOT region
 *
 * `canonicalisation.ts` states it and this is the driver that has to honour it: a floor is a
 * render-scale length in the CALLER'S units, and `solveSkeleton` applies it in the unit space each
 * region is normalised into. Letting every sub-region canonicalise against its own extent scales a
 * thin sliver up enormously and shrinks its floor in world terms — the exact failure the floor exists
 * to prevent, and the reason recursion could otherwise manufacture fractal complexity out of its own
 * output. So the root's floor is measured once, in caller space, and each descendant converts it into
 * its own unit space before solving. At the root the conversion is the identity, bit for bit, because
 * both directions are the same power-of-two scale.
 *
 * ## The strips tile the polygon they were DERIVED from, not the one handed in
 *
 * Because canonicalisation runs inside the solve, the polygon a node was handed and the polygon its
 * segments came out of are deliberately different — by a floor-times-perimeter sliver, whenever the
 * stage removed anything. A node therefore carries both: {@link RecursiveNode.boundary} is what was
 * handed in, {@link RecursiveNode.canonicalBoundary} is what the wavefront ran on, and any tiling
 * identity is written against the second. The difference between them is not error and is not
 * hidden: it is reported as {@link RecursiveNode.canonicalAreaDrift}, a quantity of its own.
 *
 * Merging adjacent segments is done by {@link StripOptions.sameLogicalStreet}, *before* any geometry
 * is built: runs of `mergeGroupSize` consecutive exterior edges become one segment, and
 * `computeStrips` emits the merged face union itself. There is deliberately no polygon union in this
 * module — writing one would be building the thing `computeStrips` already provides.
 *
 * ## Failure is data
 *
 * A sub-polygon that will not solve is recorded on its node ({@link RecursiveNode.failure}) and its
 * siblings carry on. A demo that throws on one awkward cell shows nothing at all; a half-subdivided
 * picture that marks which cells failed is the useful artefact, and the census of which regions fail
 * as *solver output fed back as solver input* is itself the measurement this pass exists to take.
 * That covers the residue stream too: a ring that will not solve — or that is too small or too thin
 * to be a polygon at all — becomes a residue child carrying its reason, and its sibling rings and its
 * parent's segments are unaffected.
 */

/** Fewest passes `subdivideRecursively` will run: one solve, no recursion. */
export const MIN_RECURSION_LEVELS = 1;

/**
 * Most passes `subdivideRecursively` will run.
 *
 * A runaway guard, not a design position: the solver is roughly cubic and this runs it once per
 * segment per level, so a mis-typed level count is expensive rather than merely wrong.
 */
export const MAX_RECURSION_LEVELS = 3;

/**
 * The depth fraction at which the wavefront is fully consumed and there is no residue.
 *
 * The upper end of the `(0, 1]` interval rather than a default: a caller asking for full depth is
 * asking for exactly the behaviour that predates the residue stream.
 */
export const FULL_DEPTH_FRACTION = 1;

/**
 * What becomes of a node's residue.
 *
 * NAMED RATHER THAN INLINE, because the store, the panel and the driver all have to spell the same
 * two words and a union written out three times is three places for a third treatment to be added to
 * two of them. The two values are the whole boundary-versus-droste question: `recurse` cuts the
 * interior up again, `void` leaves it whole as a courtyard.
 */
export type ResidueTreatment = 'recurse' | 'void';

/**
 * What becomes of a node's segments.
 *
 * Named for the same reason {@link ResidueTreatment} is, and kept a SEPARATE type from it rather than
 * one union shared by both streams: `void` and `leaf` are different words because they describe
 * different things — a courtyard that was never cut, against a cell that is final — and a single union
 * would let a caller ask for a `void` ring of segments, which means nothing.
 */
export type SegmentTreatment = 'recurse' | 'leaf';

/**
 * What one level does to the region it is given.
 *
 * A LEVEL IS ITS OWN SPEC. Both of the region's child streams are named here because a level's whole
 * job is to say what becomes of each of them, and the interesting compositions — a boundary pass whose
 * courtyard is subdivided differently from its ring — are exactly the ones that cannot be said with
 * one setting shared by every level.
 */
export interface LevelSpec {
    /**
     * Inward depth as a fraction of this region's OWN maximum offset, in `(0, 1]`. 1 = full depth.
     *
     * A FRACTION, NEVER AN ABSOLUTE LENGTH. A sub-region is smaller than its parent, so a depth that
     * is a shallow rim at level 0 would consume a level-2 cell entirely; and being dimensionless it
     * crosses the normalisation seam untouched, where a length would have to be scaled at every
     * level. Clamped by {@link clampDepthFraction}.
     */
    depthFraction: number;
    /** Adjacent exterior edges fused into one segment at this level. Clamped to at least 1. */
    mergeGroupSize: number;
    /** Whether this level's segments become regions at the next level. */
    segments: SegmentTreatment;
    /** Whether this level's residue rings become regions at the next level. */
    residue: ResidueTreatment;
}

export interface RecursiveOptions {
    /**
     * One spec per level, outermost first. Length 1..{@link MAX_RECURSION_LEVELS}; the length IS the
     * depth.
     *
     * THERE IS NO SEPARATE LEVEL COUNT, deliberately: a count plus one uniform spec cannot say what a
     * level has to say, and keeping both would let them disagree. `levels[0]` describes how the root
     * is divided, `levels[1]` how each of the root's children is divided, and so on. Clamped by
     * {@link clampLevelSpecs}.
     */
    levels: LevelSpec[];
}

/**
 * The scalars the uniform reading of this driver used to take, for {@link uniformLevelSpecs}.
 *
 * Kept as a type of its own rather than as four positional parameters so a call site reads the same
 * way it did when these were fields on {@link RecursiveOptions} — which is what makes the migration a
 * one-liner rather than a re-ordering exercise.
 */
export interface UniformLevelSpecsInput {
    /** How many levels to produce. Clamped by {@link clampLevels}. */
    levels: number;
    /** The merge group size every level gets. */
    mergeGroupSize: number;
    /** The depth fraction every level gets. */
    depthFraction: number;
    /** The residue treatment every level gets. */
    residue: ResidueTreatment;
}

/**
 * `levels` copies of one spec: the uniform reading that predates per-level specs.
 *
 * A HELPER, NOT A SECOND SOURCE OF TRUTH. The driver reads {@link RecursiveOptions.levels} and nothing
 * else; this exists so that the behaviour the scalar options described keeps a name and a one-line
 * migration. `segments` is `recurse` at every level because that is the only thing the old shape could
 * do — segments always recursed, which is why three of the four stream combinations were unreachable.
 */
export function uniformLevelSpecs(input: UniformLevelSpecsInput): LevelSpec[] {
    const {mergeGroupSize, depthFraction, residue} = input;
    return Array.from({length: clampLevels(input.levels)}, () => ({
        depthFraction, mergeGroupSize, segments: 'recurse' as SegmentTreatment, residue,
    }));
}

/**
 * The id the root of every subdivision tree carries.
 *
 * A CONSTANT RATHER THAN A LITERAL AT THE ONE CALL SITE, because a diagnostic that cites a region id
 * and a test that pins one both have to spell the root the same way, and the driver is not the only
 * thing that builds a tree — the dashboard's hand-built fixtures stamp identity through
 * {@link childRegionId} too.
 */
export const ROOT_REGION_ID = 'r0';

/**
 * The id of the `childIndex`-th child of the region `parentId`.
 *
 * PATH-BASED AND NOTHING ELSE (journal decision 97): the id is the route from the root, so it is a
 * pure function of the tree's shape and identical input yields identical ids across runs and across
 * machines. No counter, no hash of geometry, nothing that could renumber when an unrelated branch
 * changes — a census row citing `r0.3.1` names the same region tomorrow.
 *
 * THE INDEX IS INTO THE CONCATENATED CHILD ORDER — segment children first, then residue children —
 * which is the order {@link flattenRecursiveTree} walks, so a reader following ids down a printed
 * traversal never has to know which stream a child came from. Which stream it DID come from is
 * {@link RecursiveNode.provenance}'s question, and it answers it with the index into that stream's
 * own array.
 */
export function childRegionId(parentId: string, childIndex: number): string {
    return `${parentId}.${childIndex}`;
}

/**
 * Where a region's boundary came from: which of its parent's two child streams, and which member.
 *
 * CARRIED, NEVER RECOVERED. A child's boundary is new geometry — a clipped skeleton face or an offset
 * contour — and asking afterwards which of the parent's strips or rings it matches would be a
 * proximity test on machine-generated coordinates, which is exactly the class of question this
 * codebase has been bitten by. The driver knows the answer at the moment it hands the polygon down,
 * and the cost of keeping it is one small record.
 *
 * The index is into the parent's OWN array — {@link RecursiveNode.segments} or
 * {@link RecursiveNode.residueRings} — rather than into the concatenated child order, so a region can
 * be shown beside the strip it was cut from without arithmetic.
 */
export type RegionProvenance =
    | {kind: 'root'}
    | {kind: 'segment'; index: number}
    | {kind: 'residue'; ringIndex: number};

/**
 * What became of a region: solved, refused as too small to be a polygon, or attempted and failed.
 *
 * THREE ARMS RATHER THAN A STRING, because the three are acted on differently and journal decision 96
 * settled that only one of them is a defect. A `declined-degenerate` region is the driver correctly
 * refusing to slice a tile narrower than it can see — accepted behaviour, and it carries the measured
 * area that made the call so a reader can check it against the floor without re-deriving it. A
 * `failed` region is a polygon of real area whose solve did not finish, which is the live defect
 * class. Telling them apart by matching the prefix of a sentence is what this replaces.
 *
 * {@link RecursiveNode.failure} carries the same sentence on both failing arms and stays the thing a
 * readout prints; this is the thing a census counts by kind.
 */
export type RegionOutcome =
    | {kind: 'solved'}
    | {kind: 'failed'; failure: string}
    | {
        kind: 'declined-degenerate';
        failure: string;
        /** Boundary vertices the region was handed. Fewer than three is one of the two reasons. */
        vertexCount: number;
        /** `|signedArea|` of the region as measured, against {@link DEGENERATE_AREA_EPSILON}. */
        area: number;
    };

export interface RecursiveNode {
    /**
     * This region's stable, path-based id — see {@link childRegionId}.
     *
     * FIRST-CLASS IDENTITY (journal decision 97). The tree the driver returns is the instrument the
     * recursion is debugged with, and an instrument whose readings cannot be cited is half an
     * instrument: the census names the region that failed, the inspector is pointed at one region by
     * name, and the two are talking about the same thing because the name is a function of the input.
     */
    id: string;
    /** The id of the region this one was cut from, or `undefined` at the root. */
    parentId?: string;
    /** Which of the parent's strips or residue rings this region's boundary is. */
    provenance: RegionProvenance;
    /**
     * Solved, declined as degenerate, or attempted and failed — see {@link RegionOutcome}.
     *
     * AGREES WITH {@link failure} BY CONSTRUCTION: both are written at the same return, and the two
     * failing arms carry the identical sentence. The string is what a panel prints; this is what a
     * census counts and what a test pins.
     */
    outcome: RegionOutcome;
    /** Depth in the tree. The root is 0. */
    level: number;
    /** The polygon handed to this node, clockwise, before canonicalisation. */
    boundary: Vector2[];
    /**
     * The polygon the solve actually ran on, after canonicalisation. Segments derive from THIS.
     *
     * THE ONLY POLYGON THE STRIPS CAN BE EXPECTED TO TILE, and therefore the one a tiling identity
     * has to be written against. `solveSkeleton` canonicalises inside the solve — it removes
     * boundary vertices too small to see, on purpose — so the segments and the residue rings are
     * both clipped out of a polygon that is smaller than {@link boundary} by a floor-times-perimeter
     * sliver. Summing them against `boundary` charges that intended removal as tiling error, which
     * is what closed the canonicalisation floor's usable band down to a single point.
     *
     * Carried on the node rather than left to the caller to recompute: recomputing means running
     * canonicalisation a second time and trusting the two runs to agree, a second derivation of a
     * quantity that already has a canonical source.
     *
     * Equal to {@link boundary}, vertex for vertex and bit for bit, wherever canonicalisation
     * removed nothing — which is nearly all of the corpus. See {@link canonicalAreaDrift}.
     *
     * Carried on a node whose solve FAILED as well, because canonicalisation ran there too: the
     * stage runs ahead of the wavefront and does not depend on it finishing. Only a DEGENERATE node
     * — screened out before any canonicalisation happens — is its own canonical form by default.
     */
    canonicalBoundary: Vector2[];
    /**
     * `|area(boundary) − area(canonicalBoundary)| / area(boundary)`: how much of the region
     * canonicalisation removed before the wavefront ever saw it.
     *
     * A SEPARATE, REPORTED QUANTITY, NEVER FOLDED INTO THE TILING IDENTITY. Two different things are
     * being asserted — that the strips tile what they were built from, and that what they were built
     * from still resembles what was handed in — and collapsing them into one number is what made an
     * intended removal look like a gap between strips.
     *
     * EXACTLY ZERO, not approximately, wherever canonicalisation removed nothing: the stage deletes
     * vertices and never perturbs the ones it keeps, and {@link canonicaliseRegion} preserves that
     * by selecting the survivors from the caller's own coordinates rather than reading them back out
     * of unit space. A non-zero drift on a node that lost no vertices would mean canonicalisation had
     * moved a vertex, which is a defect in it rather than here.
     *
     * REPORTED ON A NODE THAT FAILED TO SOLVE JUST AS ON ONE THAT SOLVED. Canonicalisation runs
     * before the wavefront and does not depend on it succeeding, so a region that lost a vertex and
     * then failed to solve lost it just the same; zeroing the drift there would be reporting a
     * removal that happened as one that did not. Zero only on a DEGENERATE node, which is screened
     * out before anything is canonicalised at all and so genuinely has no drift to report.
     */
    canonicalAreaDrift: number;
    /** Segments this node was divided into, in boundary order. Empty when `failure` is set. */
    segments: Strip[];
    /**
     * Children grown from the segments, one per merged group, in the same order.
     *
     * Empty at the last level and under {@link SegmentTreatment} `leaf`, which leaves the ring of
     * segments final. A LEAF SEGMENT AND A SEGMENT THAT MERELY HAS NO CHILDREN ARE DIFFERENT THINGS,
     * and this field cannot tell them apart on its own — the level's spec is what says which it was.
     */
    children: RecursiveNode[];
    /**
     * Inner contours at this node's depth — the part of the region the wavefront never reached.
     *
     * Clockwise, like every other boundary here, and EMPTY AT FULL DEPTH: at its own level's
     * `depthFraction` of 1 the wavefront is consumed and the segments tile the region on their own,
     * which also makes that level's {@link ResidueTreatment} inert. More than one ring
     * means the wavefront pinched into disconnected loops, which is the normal outcome for a
     * non-convex region cut deeply enough; each is a region in its own right.
     */
    residueRings: Vector2[][];
    /**
     * Children grown from the residue rings, one per ring, in the same order.
     *
     * Empty at the last level and under {@link ResidueTreatment} `void`, which keeps the rings and
     * grows nothing from them. A ring too degenerate to recurse on is NOT dropped from
     * {@link residueRings} — it is still part of the region and still counts towards the tiling
     * identity — but its child records why it was not subdivided, exactly as a failed segment child
     * does.
     */
    residueChildren: RecursiveNode[];
    /** Why this node was not subdivided, or `undefined` when it was. */
    failure?: string;
}

/** The merge policy `computeStrips` takes, named so this module never restates its shape. */
export type SameLogicalStreetPredicate = NonNullable<StripOptions['sameLogicalStreet']>;

/**
 * Groups exterior edges into runs of `mergeGroupSize` consecutive ids.
 *
 * `computeStrips` asks the question once per adjacent pair `(i, i + 1)` around the boundary, wrap
 * included, so "same run" is simply "same group index". The wrap pair therefore answers false
 * whenever the boundary has more edges than one group holds, which is what makes the last group a
 * short one rather than one that swallows the seam. When a group is at least as large as the whole
 * boundary every pair answers true and `computeStrips` emits a single segment equal to the region —
 * a legitimate, if uninteresting, answer rather than an error.
 */
export function makeMergeGroupPredicate(mergeGroupSize: number): SameLogicalStreetPredicate {
    const size = clampMergeGroupSize(mergeGroupSize);
    return (edgeIdA: number, edgeIdB: number) =>
        Math.floor(edgeIdA / size) === Math.floor(edgeIdB / size);
}

/**
 * A count of levels, forced into `[1, 3]`. Anything non-finite is treated as the minimum.
 *
 * Still a count rather than an array, because the depth is bounded in exactly one place and both the
 * driver's {@link clampLevelSpecs} and a UI counting its own rows have to be bounded by the same
 * formula. What was retired is the level count as a FIELD ON THE OPTIONS, not the arithmetic.
 */
export function clampLevels(levels: number): number {
    if (!Number.isFinite(levels)) {
        return MIN_RECURSION_LEVELS;
    }
    return Math.min(MAX_RECURSION_LEVELS, Math.max(MIN_RECURSION_LEVELS, Math.floor(levels)));
}

/**
 * Decision 3's predicate: whether `level` is the deepest level a composition of `levels` levels has.
 *
 * PUBLISHED RATHER THAN RESTATED AT EACH SITE, for the same reason the clamps are: the driver, the
 * readout that reports an overridden setting, and the panel that disables a terminal level's controls
 * must all answer this identically or the readout says a level recursed that the driver stopped. It
 * asks only for the array's LENGTH, so a list of {@link LevelSpec} and a list of {@link LevelPolicy}
 * are both answerable — they are the same composition at two stages of preparation.
 */
export function isLastLevel(level: number, levels: readonly unknown[]): boolean {
    return level + 1 >= levels.length;
}

/** Merge group size, forced to a whole number of at least one. */
export function clampMergeGroupSize(mergeGroupSize: number): number {
    if (!Number.isFinite(mergeGroupSize)) {
        return 1;
    }
    return Math.max(1, Math.floor(mergeGroupSize));
}

/**
 * Depth fraction, forced into `(0, 1]`.
 *
 * ANYTHING UNUSABLE FALLS BACK TO FULL DEPTH rather than to some small positive fraction, because the
 * interval is open at zero and so has no least element to clamp to. A zero or negative fraction asks
 * for a cut of no depth, which produces segments with no area and a residue equal to the whole region
 * — a recursion that subdivides nothing. Full depth is the honest reading of "no usable depth was
 * asked for": it is the behaviour that predates this option.
 */
export function clampDepthFraction(depthFraction: number): number {
    if (!Number.isFinite(depthFraction) || depthFraction <= 0) {
        return FULL_DEPTH_FRACTION;
    }
    return Math.min(FULL_DEPTH_FRACTION, depthFraction);
}

/**
 * The spec a run falls back on when it is handed no levels at all.
 *
 * An empty array asks for a recursion of no depth, which is not a thing this driver can return — every
 * call produces a root node. So the length is clamped up to {@link MIN_RECURSION_LEVELS}, and this is
 * what that one level says: full depth, no merging, and both streams terminal. Terminal because a
 * single level's streams are terminal anyway — there is no next level for them to reach — so saying
 * `recurse` here would be a setting the driver immediately overrode. Full depth and a group of one for
 * the same reason {@link clampDepthFraction} and {@link clampMergeGroupSize} fall back on them: they
 * are the readings of "nothing usable was asked for" those clamps already publish.
 */
export const FALLBACK_LEVEL_SPEC: LevelSpec = {
    depthFraction: FULL_DEPTH_FRACTION,
    mergeGroupSize: 1,
    segments: 'leaf',
    residue: 'void',
};

/**
 * One spec per level, its length forced into `[1, 3]` and every field inside its own range.
 *
 * THE LENGTH IS CLAMPED THROUGH {@link clampLevels}, the same function the level count went through
 * when it was a number, so the depth this driver will run to is bounded by exactly one formula however
 * it is asked for. Entries past the maximum are dropped rather than folded into the last one: a fourth
 * level's spec has nowhere to apply, and merging it into the third would be running a spec against a
 * region it was not written for.
 */
export function clampLevelSpecs(levels: LevelSpec[]): LevelSpec[] {
    const requested = levels.length === 0 ? [FALLBACK_LEVEL_SPEC] : levels;
    return requested.slice(0, clampLevels(requested.length)).map(spec => ({
        depthFraction: clampDepthFraction(spec.depthFraction),
        mergeGroupSize: clampMergeGroupSize(spec.mergeGroupSize),
        segments: spec.segments,
        residue: spec.residue,
    }));
}

/**
 * One level's spec with its merge group size already turned into the predicate `computeStrips` takes.
 *
 * Derived from {@link LevelSpec} rather than restated, so a fifth field on a spec has to be answered
 * here. The predicate is built ONCE PER LEVEL, before the first solve, rather than per node: it is a
 * pure function of the group size, and rebuilding it at every node would be re-deriving a constant
 * hundreds of times.
 */
export type LevelPolicy = Omit<LevelSpec, 'mergeGroupSize'> & {
    /** The merge policy handed to `computeStrips` at every node of this level. */
    sameLogicalStreet: SameLogicalStreetPredicate;
};

/**
 * The policy one call to {@link subdivideRecursively} runs under, fixed before the first solve.
 *
 * Gathered into one value rather than threaded as separate parameters because it is constant for the
 * whole tree: a node that read a different depth or a different floor from the level it belongs to
 * would be the defect this arc exists to prevent, and passing one frozen record makes that impossible
 * to write by accident. WHAT IS CONSTANT IS THE ARRAY, not one spec — the array is indexed by level,
 * and a node at level `n` may only ever read `levels[n]`.
 */
export interface RecursiveRun {
    /** One clamped policy per level, outermost first. Its length is the recursion depth. */
    levels: LevelPolicy[];
    /**
     * The ROOT region's canonicalisation floor, as a length in the CALLER'S coordinates.
     *
     * Carried in caller space because that is the only space every level shares: each region is
     * normalised to its own unit extent before it is canonicalised, so the unit-space number differs
     * per region while this one does not. See {@link canonicaliseRegion}.
     */
    rootNoiseFloor: number;
}

/** One level's spec as the run holds it: clamped, with its merge predicate already built. */
function toLevelPolicy(spec: LevelSpec): LevelPolicy {
    return {
        depthFraction: spec.depthFraction,
        segments: spec.segments,
        residue: spec.residue,
        sameLogicalStreet: makeMergeGroupPredicate(spec.mergeGroupSize),
    };
}

/**
 * Subdivides `boundary` into segments and residue, then subdivides each of those, once per entry in
 * `options.levels`.
 *
 * Every node of the returned tree either carries the segments it was divided into or a `failure`
 * saying why it was not — including the root, which is returned as a failed node rather than
 * throwing, so a caller always has something to draw.
 */
export function subdivideRecursively(boundary: Vector2[], options: RecursiveOptions): RecursiveNode {
    return subdivideNode(boundary, 0, {id: ROOT_REGION_ID, provenance: {kind: 'root'}}, {
        levels: clampLevelSpecs(options.levels).map(toLevelPolicy),
        rootNoiseFloor: rootNoiseFloor(boundary),
    });
}

/**
 * One region of a subdivision tree, by id, or `undefined` where the tree has no such region.
 *
 * A LINEAR SCAN OVER {@link flattenRecursiveTree}, not a parse of the id's path. The id says where a
 * region sits, but reading it as a route would be a second implementation of the tree's own shape,
 * and it would answer confidently for a path that does not exist. Trees here are hundreds of nodes,
 * not millions, and the caller is a human pointing at one region.
 */
export function findRegionById(root: RecursiveNode, id: string): RecursiveNode | undefined {
    return flattenRecursiveTree(root).find(node => node.id === id);
}

/**
 * Every node of a subdivision tree, the node itself first, then each subtree in child order —
 * segment children first, then residue children.
 *
 * Lives here rather than in whichever caller wants it because counting, censusing and drawing a tree
 * all start by walking it, and three copies of one recursive line are three places for the traversal
 * order to drift apart. BOTH STREAMS ARE WALKED: a residue subtree invisible to the traversal would
 * be invisible to the counts, to the census and to the canvas, which is indistinguishable from not
 * having recursed on it at all.
 */
export function flattenRecursiveTree(node: RecursiveNode): RecursiveNode[] {
    return [
        node,
        ...node.children.flatMap(flattenRecursiveTree),
        ...node.residueChildren.flatMap(flattenRecursiveTree),
    ];
}

/**
 * The standing noise floor as a length in the caller's coordinates, measured on the ROOT region.
 *
 * `SKELETON_NOISE_FLOOR` is a UNIT-SPACE constant, so what it means as a world length depends on the
 * extent it was normalised against. Measuring it once here against the root's extent is decision 7 of
 * the canonicalisation spec: the floor is a property of the region the caller handed in, not of
 * whichever sliver the recursion is currently holding.
 */
function rootNoiseFloor(boundary: Vector2[]): number {
    return denormaliseLength(makeSkeletonNormalisation(boundary), SKELETON_NOISE_FLOOR);
}

/**
 * What one region's solve is set up with: the floor it will canonicalise against, and the polygon
 * that canonicalisation leaves behind.
 *
 * THE TWO ARE DERIVED TOGETHER FROM ONE NORMALISATION OF THE REGION, because they are two readings of
 * a single act — the floor is the question and the surviving ring is the answer, and deriving them
 * from two separately-built normalisations would be two chances for them to describe different
 * polygons.
 */
interface RegionCanonicalisation {
    /** The root's floor, expressed in the unit space `solveSkeleton` canonicalises the region in. */
    noiseFloor: number;
    /** The region minus the vertices that floor removes, in the CALLER'S coordinates. */
    canonicalBoundary: Vector2[];
}

/**
 * The root's floor in the unit space `solveSkeleton` will canonicalise `region` in, and the ring that
 * floor leaves standing.
 *
 * The floor is the same physical distance said in the units the comparison happens in.
 * `makeSkeletonNormalisation` is called on the same vertices `solveSkeleton` is about to call it on,
 * so the two agree by construction rather than by a shared assumption about extents; at the root the
 * round trip is exact, because both directions are the same power-of-two scale.
 *
 * THE SURVIVING RING IS SELECTED FROM THE CALLER'S OWN VERTICES THROUGH `indexRemap`, never read back
 * out of unit space. Canonicalisation deletes vertices and never moves the ones it keeps, and the
 * remap is what carries that fact across the normalisation seam: taking the surviving coordinates
 * from `region` itself makes {@link RecursiveNode.canonicalAreaDrift} EXACTLY zero wherever nothing
 * was removed, which is what decision 7 asks for. Reading the solved graph's exterior ring instead
 * looks equivalent and is not — measured across the corpus at three depths and four merge groups, it
 * differs from the input by up to `1.4e-14` on rings that lost no vertex at all, because
 * normalisation's CENTRING translation is not exactly invertible even though its power-of-two scale
 * is. That noise is far below the tiling tolerance and would be invisible there; it is not invisible
 * to an assertion of exact equality, and it would be attributed to canonicalisation, which did not
 * cause it.
 *
 * `canonicalisePolygon` is a pure function of the ring and the floor, and this hands it exactly what
 * `solveSkeleton` hands it, so the two calls do not need to be trusted to agree — but they are checked
 * to agree anyway, against the solved graph's own exterior ring, in the suite.
 */
function canonicaliseRegion(region: Vector2[], rootFloor: number): RegionCanonicalisation {
    const normalisation = makeSkeletonNormalisation(region);
    const noiseFloor = normaliseLength(normalisation, rootFloor);
    const canonical = canonicalisePolygon(normalisePolygon(region, normalisation), noiseFloor);
    return {
        noiseFloor,
        canonicalBoundary: region.filter(
            (_vertex, index) => canonical.indexRemap[index] !== REMOVED_VERTEX_INDEX),
    };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Both child streams of one region, or the reason it has neither. Never both.
 *
 * The two streams come out of ONE solve and are returned together for that reason: the residue is the
 * offset contour of the very same skeleton the segments were clipped out of, and recovering it from a
 * second solve would be a second answer to a question already answered.
 *
 * `canonicalBoundary` IS ON BOTH ARMS, INCLUDING THE FAILURE. Canonicalisation happens before the
 * wavefront and independently of whether it finishes, so a region that failed to solve has still been
 * canonicalised — and dropping the ring on the failure arm would leave the caller with nothing to
 * report but the polygon it handed in, which is a removal that happened reported as one that did not.
 */
export type SegmentOutcome =
    | {canonicalBoundary: Vector2[]; segments: Strip[]; residueRings: Vector2[][]; failure?: undefined}
    | {canonicalBoundary: Vector2[]; segments?: undefined; residueRings?: undefined; failure: string};

/**
 * Decision 5's degeneracy test: why this region has no skeleton, or `undefined` when it has one.
 *
 * `solveSkeleton` throws below three vertices and a zero-area polygon has no skeleton to speak of;
 * both are reported the same way as a solve that merely failed, because to the caller they are the
 * same event — this cell was not subdivided.
 */
function degenerateRegionFailure(boundary: Vector2[]): Extract<RegionOutcome, {kind: 'declined-degenerate'}> | undefined {
    // Reported with the area it was measured at, not just the sentence that quotes it: journal
    // decision 96 accepts the decline as correct behaviour, so the number that made the call is a
    // measurement a reader checks against the floor rather than a fragment to parse back out.
    const area = boundary.length < 3 ? 0 : Math.abs(signedArea(boundary));
    if (boundary.length < 3) {
        return {
            kind: 'declined-degenerate', vertexCount: boundary.length, area,
            failure: `Degenerate region: ${boundary.length} boundary vertices, fewer than the three a polygon needs.`,
        };
    }
    if (area < DEGENERATE_AREA_EPSILON) {
        return {
            kind: 'declined-degenerate', vertexCount: boundary.length, area,
            failure: `Degenerate region: ${boundary.length} boundary vertices enclosing an area of `
                + `${area}, under the ${DEGENERATE_AREA_EPSILON} degeneracy floor.`,
        };
    }
    return undefined;
}

/**
 * Divides one non-degenerate region into its segments and its residue, at ITS OWN LEVEL'S depth.
 *
 * The caller has already screened for degeneracy, so everything reported here is a solve that was
 * attempted and did not finish. The depth is the region's OWN maximum offset scaled by the fraction on
 * the spec for the level this region belongs to — the region it was HANDED, never the ones it produces
 * — which is what lets a shallow boundary pass at level 0 sit above a full-depth cut at level 1.
 *
 * EVERY RETURN CARRIES THE CANONICAL RING, the failures included. It is computed before the `try`
 * because canonicalisation is what the solve is set up with rather than something the solve produces,
 * so it is just as true of a region that then failed to solve — several fixtures in the corpus lose a
 * vertex to the floor and go on to report an incomplete solve, and that removal is real.
 */
function divideRegion(boundary: Vector2[], level: LevelPolicy, rootFloor: number): SegmentOutcome {
    const {noiseFloor, canonicalBoundary} = canonicaliseRegion(boundary, rootFloor);
    try {
        const result = solveSkeleton(boundary, {noiseFloor});
        if (!result.complete) {
            const detail = result.diagnostics.map(diagnostic => `${diagnostic.kind}: ${diagnostic.detail}`).join('; ');
            return {
                canonicalBoundary,
                failure: `Incomplete solve: ${detail === '' ? 'no diagnostics reported.' : detail}`,
            };
        }
        const depth = computeMaxOffset(result) * level.depthFraction;
        return {
            canonicalBoundary,
            segments: computeStrips(result, {depth, sameLogicalStreet: level.sameLogicalStreet}),
            residueRings: residueAt(result, depth, level.depthFraction),
        };
    } catch (error) {
        return {canonicalBoundary, failure: `Subdivision threw: ${describe(error)}`};
    }
}

/**
 * How much area canonicalisation removed, as a fraction of the region it was handed.
 *
 * `boundary` has already cleared {@link DEGENERATE_AREA_EPSILON} by the time this is asked — the
 * degeneracy screen runs before the solve — so the divisor is bounded away from zero and there is no
 * degenerate case to guard. Zero EXACTLY when the two rings are the same vertices, because the two
 * shoelace sums are then term for term identical.
 */
function canonicalAreaDrift(boundary: Vector2[], canonicalBoundary: Vector2[]): number {
    const area = Math.abs(signedArea(boundary));
    return Math.abs(area - Math.abs(signedArea(canonicalBoundary))) / area;
}

/**
 * The rings the wavefront has not yet reached at `depth`, or none at all at full depth.
 *
 * FULL DEPTH IS A SEPARATE CODE PATH, DELIBERATELY. `computeOffsetRings` at the maximum offset
 * returns nothing because the wavefront has been consumed — but "returns nothing" and "is not asked"
 * are different claims, and only the second makes full depth exactly the behaviour that predates the
 * residue stream regardless of what the projection does at its own boundary.
 */
function residueAt(result: SkeletonSolveResult, depth: number, depthFraction: number): Vector2[][] {
    return depthFraction >= FULL_DEPTH_FRACTION ? [] : computeOffsetRings(result, depth);
}

/**
 * The four streams a node that was not subdivided carries: none of them.
 *
 * Derived from {@link RecursiveNode} rather than restated, so a fifth stream added to the node has to
 * be answered here rather than silently defaulting to whatever the two failure branches were last
 * written to say.
 */
type UnsubdividedStreams = Pick<RecursiveNode, 'segments' | 'children' | 'residueRings' | 'residueChildren'>;

/**
 * Empty segment, child and residue streams, freshly allocated.
 *
 * A FUNCTION RATHER THAN A SHARED CONSTANT: the arrays it returns are handed straight to a caller as
 * a node's own fields, and one frozen constant would give every failed node in a tree the same four
 * array instances to alias.
 */
function noSubdivision(): UnsubdividedStreams {
    return {segments: [], children: [], residueRings: [], residueChildren: []};
}

/**
 * Who a region is, decided by its parent before it is subdivided.
 *
 * PASSED IN RATHER THAN DERIVED, because a path-based id is a fact about where the recursion is, and
 * only the caller knows that. A node that worked its own id out would need the tree it is still being
 * built into.
 */
interface RegionIdentity {
    id: string;
    parentId?: string;
    provenance: RegionProvenance;
}

/**
 * The identity of the child at `childIndex` of `parent`, cut from `provenance`.
 *
 * The two streams are numbered in ONE sequence — segment children then residue children — which is
 * the order {@link flattenRecursiveTree} walks, so the caller offsets the residue index by the number
 * of segment children rather than restarting it.
 */
function childIdentity(parent: RegionIdentity, childIndex: number, provenance: RegionProvenance): RegionIdentity {
    return {id: childRegionId(parent.id, childIndex), parentId: parent.id, provenance};
}

function subdivideNode(
    boundary: Vector2[], level: number, identity: RegionIdentity, run: RecursiveRun,
): RecursiveNode {
    // Screened before the winding is touched: a region with no area has no winding to normalise, so
    // it is recorded exactly as it was handed in rather than arbitrarily reversed on the way out.
    // This is also where a residue ring too small or too thin to be a polygon is caught: decision 4
    // discards it from the recursion, and it is recorded here in the same shape a failed segment
    // child is, because to the caller the two are the same event.
    // A degenerate region is turned away BEFORE anything is canonicalised, which is the one case in
    // which a node really is its own canonical form with a drift of exactly zero.
    const degeneracy = degenerateRegionFailure(boundary);
    if (degeneracy !== undefined) {
        return {
            ...identity, outcome: degeneracy,
            level, boundary, canonicalBoundary: boundary, canonicalAreaDrift: 0,
            ...noSubdivision(), failure: degeneracy.failure,
        };
    }

    // A level's spec governs the region it was HANDED, so the spec read here is the one at this
    // node's own level and never its parent's or its children's.
    const spec = run.levels[level];

    // `ensureClockwise` from `./polygon-decomposition` is this package's one winding-normalisation
    // formula, rather than a third copy of it. A `Strip.boundary` and a `computeOffsetRings` ring both
    // already arrive clockwise, so this only does real work on the root's raw input.
    const clockwise = ensureClockwise(boundary);
    const outcome = divideRegion(clockwise, spec, run.rootNoiseFloor);
    if (outcome.segments === undefined) {
        // The solve did not finish, but canonicalisation ran before it and removed whatever the floor
        // found — so the ring and the drift are reported exactly as they are on a node that solved.
        // Reporting the region as its own canonical form here would zero a removal that happened.
        return {
            ...identity, outcome: {kind: 'failed', failure: outcome.failure},
            level, boundary: clockwise,
            canonicalBoundary: outcome.canonicalBoundary,
            canonicalAreaDrift: canonicalAreaDrift(clockwise, outcome.canonicalBoundary),
            ...noSubdivision(), failure: outcome.failure,
        };
    }

    // AT THE LAST LEVEL BOTH STREAMS ARE TERMINAL WHATEVER THE SPEC SAYS: a `recurse` there has
    // nowhere to go, so it is read as `leaf`/`void`. The override is silent HERE and loud in the
    // caller — a control that appears to do nothing is worse than one that is visibly disabled, which
    // is the readout's job rather than the driver's.
    const terminal = isLastLevel(level, run.levels);
    const children = terminal || spec.segments !== 'recurse'
        ? []
        // One child per merged group, in the same order — a degenerate or unsolvable segment
        // becomes a child carrying its failure, never a gap in the sequence. `leaf` grows none of
        // them: the ring of cells is final, which is a different thing from a cell that came out
        // childless because the recursion ran out of levels.
        : outcome.segments.map((segment, index) => subdivideNode(
            segment.boundary, level + 1, childIdentity(identity, index, {kind: 'segment', index}), run));
    return {
        ...identity, outcome: {kind: 'solved'},
        level,
        boundary: clockwise,
        canonicalBoundary: outcome.canonicalBoundary,
        canonicalAreaDrift: canonicalAreaDrift(clockwise, outcome.canonicalBoundary),
        segments: outcome.segments,
        children,
        residueRings: outcome.residueRings,
        // One child per RING, in the same order, and for the same reason. `void` keeps the rings and
        // grows nothing from them: that is a courtyard, not an absence of residue.
        residueChildren: terminal || spec.residue !== 'recurse'
            ? []
            : outcome.residueRings.map((ring, ringIndex) => subdivideNode(
                ring, level + 1,
                childIdentity(identity, children.length + ringIndex, {kind: 'residue', ringIndex}),
                run)),
    };
}
