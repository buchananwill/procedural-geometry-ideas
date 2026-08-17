import type {SkeletonSolveResult, Vector2} from './types';
import {solveSkeleton} from './algorithm-termination-cases';
import {canonicalisePolygon, REMOVED_VERTEX_INDEX, SKELETON_NOISE_FLOOR} from './canonicalisation';
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
 * The whole driver is `solveSkeleton` → `computeStrips` at {@link RecursiveOptions.depthFraction} of
 * `computeMaxOffset` → recurse. At full depth the offset contour has vanished, so the segments tile
 * the region exactly and there is nothing left over. BELOW full depth the same solve yields TWO child
 * streams, and both are carried: the segments, and the RESIDUE — the interior contour the wavefront
 * has not yet reached, read straight off `computeOffsetRings`.
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
 * Area below which a region counts as degenerate for decision 5.
 *
 * A floor rather than an exact zero, because the regions this driver recurses on are *computed*:
 * a segment boundary comes back from `computeStrips` as intersections of offset rays, so a sliver
 * that is geometrically collinear arrives with an area of `1e-13` and never with an exact `0`.
 * Testing `=== 0` would therefore only ever catch hand-authored collinear input and would hand every
 * real near-degenerate cell to the solver. The value matches the `AREA_EPSILON` that
 * `polygon-decomposition.ts` already uses for the same "is this sub-polygon degenerate" question;
 * it is an absolute area in the polygon's own units, which is the same footing that constant is on.
 */
export const DEGENERATE_AREA_EPSILON = 1e-6;

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

export interface RecursiveOptions {
    /** How many times to subdivide. 1 = one pass, no recursion. Clamped to [1, 3]. */
    levels: number;
    /** Adjacent segments per merged group at every level. Clamped to at least 1. */
    mergeGroupSize: number;
    /**
     * Inward depth as a fraction of each node's OWN maximum offset, in `(0, 1]`. 1 = full depth.
     *
     * A FRACTION, NEVER AN ABSOLUTE LENGTH. A sub-region is smaller than its parent, so a depth that
     * is a shallow rim at level 0 would consume a level-2 cell entirely; and being dimensionless it
     * crosses the normalisation seam untouched, where a length would have to be scaled at every
     * level. Clamped by {@link clampDepthFraction}.
     */
    depthFraction: number;
    /** What becomes of a node's residue. `void` leaves it whole and undivided. */
    residue: ResidueTreatment;
}

export interface RecursiveNode {
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
     * Zero on a node that never solved — degenerate, failed or throwing — because no
     * canonicalisation happened there to have a drift.
     */
    canonicalAreaDrift: number;
    /** Segments this node was divided into, in boundary order. Empty when `failure` is set. */
    segments: Strip[];
    /** One child per merged group, in the same order. Empty at the leaf level. */
    children: RecursiveNode[];
    /**
     * Inner contours at this node's depth — the part of the region the wavefront never reached.
     *
     * Clockwise, like every other boundary here, and EMPTY AT FULL DEPTH: at `depthFraction` of 1
     * the wavefront is consumed and the segments tile the region on their own. More than one ring
     * means the wavefront pinched into disconnected loops, which is the normal outcome for a
     * non-convex region cut deeply enough; each is a region in its own right.
     */
    residueRings: Vector2[][];
    /**
     * Children grown from the residue rings, one per ring, in the same order.
     *
     * Empty at the leaf level and under {@link ResidueTreatment} `void`, which keeps the rings and
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

/** Levels, forced into `[1, 3]`. Anything non-finite is treated as the minimum. */
export function clampLevels(levels: number): number {
    if (!Number.isFinite(levels)) {
        return MIN_RECURSION_LEVELS;
    }
    return Math.min(MAX_RECURSION_LEVELS, Math.max(MIN_RECURSION_LEVELS, Math.floor(levels)));
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
 * The policy one call to {@link subdivideRecursively} runs under, fixed before the first solve.
 *
 * Gathered into one value rather than threaded as five parameters because every field is constant
 * for the whole tree: a node that read a different depth or a different floor from its parent would
 * be the defect this arc exists to prevent, and passing one frozen record makes that impossible to
 * write by accident.
 */
export interface RecursiveRun {
    /** Clamped level count. */
    levels: number;
    /** The merge policy handed to `computeStrips` at every node. */
    sameLogicalStreet: SameLogicalStreetPredicate;
    /** Clamped depth fraction, applied to each node's own maximum offset. */
    depthFraction: number;
    /** What becomes of every node's residue. */
    residue: ResidueTreatment;
    /**
     * The ROOT region's canonicalisation floor, as a length in the CALLER'S coordinates.
     *
     * Carried in caller space because that is the only space every level shares: each region is
     * normalised to its own unit extent before it is canonicalised, so the unit-space number differs
     * per region while this one does not. See {@link canonicaliseRegion}.
     */
    rootNoiseFloor: number;
}

/**
 * Subdivides `boundary` into segments and residue, then subdivides each of those, `levels` times
 * over.
 *
 * Every node of the returned tree either carries the segments it was divided into or a `failure`
 * saying why it was not — including the root, which is returned as a failed node rather than
 * throwing, so a caller always has something to draw.
 */
export function subdivideRecursively(boundary: Vector2[], options: RecursiveOptions): RecursiveNode {
    return subdivideNode(boundary, 0, {
        levels: clampLevels(options.levels),
        sameLogicalStreet: makeMergeGroupPredicate(options.mergeGroupSize),
        depthFraction: clampDepthFraction(options.depthFraction),
        residue: options.residue,
        rootNoiseFloor: rootNoiseFloor(boundary),
    });
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
 */
export type SegmentOutcome =
    | {canonicalBoundary: Vector2[]; segments: Strip[]; residueRings: Vector2[][]; failure?: undefined}
    | {canonicalBoundary?: undefined; segments?: undefined; residueRings?: undefined; failure: string};

/**
 * Decision 5's degeneracy test: why this region has no skeleton, or `undefined` when it has one.
 *
 * `solveSkeleton` throws below three vertices and a zero-area polygon has no skeleton to speak of;
 * both are reported the same way as a solve that merely failed, because to the caller they are the
 * same event — this cell was not subdivided.
 */
function degenerateRegionFailure(boundary: Vector2[]): string | undefined {
    if (boundary.length < 3) {
        return `Degenerate region: ${boundary.length} boundary vertices, fewer than the three a polygon needs.`;
    }
    const area = Math.abs(signedArea(boundary));
    if (area < DEGENERATE_AREA_EPSILON) {
        return `Degenerate region: ${boundary.length} boundary vertices enclosing an area of `
            + `${area}, under the ${DEGENERATE_AREA_EPSILON} degeneracy floor.`;
    }
    return undefined;
}

/**
 * Divides one non-degenerate region into its segments and its residue, at the run's depth.
 *
 * The caller has already screened for degeneracy, so everything reported here is a solve that was
 * attempted and did not finish. The depth is the region's OWN maximum offset scaled by the run's
 * fraction, which is what keeps a level-2 cell cut as shallowly, in proportion, as the root was.
 */
function divideRegion(boundary: Vector2[], run: RecursiveRun): SegmentOutcome {
    const {noiseFloor, canonicalBoundary} = canonicaliseRegion(boundary, run.rootNoiseFloor);
    try {
        const result = solveSkeleton(boundary, {noiseFloor});
        if (!result.complete) {
            const detail = result.diagnostics.map(diagnostic => `${diagnostic.kind}: ${diagnostic.detail}`).join('; ');
            return {failure: `Incomplete solve: ${detail === '' ? 'no diagnostics reported.' : detail}`};
        }
        const depth = computeMaxOffset(result) * run.depthFraction;
        return {
            canonicalBoundary,
            segments: computeStrips(result, {depth, sameLogicalStreet: run.sameLogicalStreet}),
            residueRings: residueAt(result, depth, run.depthFraction),
        };
    } catch (error) {
        return {failure: `Subdivision threw: ${describe(error)}`};
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

function subdivideNode(boundary: Vector2[], level: number, run: RecursiveRun): RecursiveNode {
    // Screened before the winding is touched: a region with no area has no winding to normalise, so
    // it is recorded exactly as it was handed in rather than arbitrarily reversed on the way out.
    // This is also where a residue ring too small or too thin to be a polygon is caught: decision 4
    // discards it from the recursion, and it is recorded here in the same shape a failed segment
    // child is, because to the caller the two are the same event.
    const degeneracy = degenerateRegionFailure(boundary);
    if (degeneracy !== undefined) {
        return {
            level, boundary, canonicalBoundary: boundary, canonicalAreaDrift: 0,
            segments: [], children: [], residueRings: [], residueChildren: [],
            failure: degeneracy,
        };
    }

    // `ensureClockwise` from `./polygon-decomposition` is this package's one winding-normalisation
    // formula, rather than a third copy of it. A `Strip.boundary` and a `computeOffsetRings` ring both
    // already arrive clockwise, so this only does real work on the root's raw input.
    const clockwise = ensureClockwise(boundary);
    const outcome = divideRegion(clockwise, run);
    if (outcome.segments === undefined) {
        // No solve completed, so no canonicalisation happened either: the region is reported as its
        // own canonical form rather than as a polygon nothing ever produced.
        return {
            level, boundary: clockwise, canonicalBoundary: clockwise, canonicalAreaDrift: 0,
            segments: [], children: [], residueRings: [],
            residueChildren: [], failure: outcome.failure,
        };
    }

    const isLeafLevel = level + 1 >= run.levels;
    return {
        level,
        boundary: clockwise,
        canonicalBoundary: outcome.canonicalBoundary,
        canonicalAreaDrift: canonicalAreaDrift(clockwise, outcome.canonicalBoundary),
        segments: outcome.segments,
        // One child per merged group, in the same order — a degenerate or unsolvable segment
        // becomes a child carrying its failure, never a gap in the sequence.
        children: isLeafLevel
            ? []
            : outcome.segments.map(segment => subdivideNode(segment.boundary, level + 1, run)),
        residueRings: outcome.residueRings,
        // One child per RING, in the same order, and for the same reason. `void` keeps the rings and
        // grows nothing from them: that is a courtyard, not an absence of residue.
        residueChildren: isLeafLevel || run.residue !== 'recurse'
            ? []
            : outcome.residueRings.map(ring => subdivideNode(ring, level + 1, run)),
    };
}
