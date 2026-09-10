import {
    CollisionCache,
    NO_COLLISION_SENTINEL,
    StraightSkeletonGraph,
    Vector2,
} from './types';

/**
 * The boundary transform every solver entry point applies to its input and undoes on its output.
 *
 * WHY THIS EXISTS. `FLOATING_POINT_EPSILON` is an ABSOLUTE `1e-8`, compared directly against raw
 * coordinates, so the degeneracy test gets *stricter* as the polygon grows: against a 500-unit span
 * it is a relative tolerance of 2e-11, and against a 30 000-unit span it is 3.3e-13 — at exactly the
 * scale a consumer working in world-space centimetres is most likely to hand it. Normalising the
 * polygon to unit extent once on the way in and denormalising on the way out leaves the constant at
 * `1e-8` and makes it relative BY CONSTRUCTION, because the solver never again sees a magnitude it
 * was not designed for.
 *
 * The C++ port of this same solver measured the change: damage fell from 24 of 44 fixtures to 0 of
 * 44, wrong-but-complete cells 33 to none, and `BROKEN_POLYGON@1e8` returned to its correct native
 * maximum offset of 126.6302 from a corrupt 308.9784.
 *
 * REJECTED ALTERNATIVES.
 *   - A per-comparison relative epsilon (`|a-b| <= eps * max(1, |a|, |b|)`) is correct, but it puts
 *     extra arithmetic at EVERY comparison site inside an O(n^3) algorithm. Normalisation is O(n),
 *     once, at the boundary. That cost argument is decisive.
 *   - Swapping `1e-8` for some other absolute constant is not a fix, it is a different absolute
 *     constant. And moving the epsilon moves the corpus's pass/fail boundary, which is the gate the
 *     whole solver rests on.
 *
 * THE MEASURE IS THE LONGEST BOUNDING-BOX SIDE, NOT THE DIAGONAL. The two differ for elongated
 * regions, which is the common case for a lane-bounded block, and the longest side is the quantity
 * that actually bounds every coordinate the solver will hold: after the transform no vertex is
 * further than `1/sqrt(2)` from the centre on either axis (see the next paragraph for where the
 * sqrt(2) comes from), so the largest magnitude in the solve is known and bounded regardless of
 * aspect ratio. The diagonal would leave a long thin polygon smaller than unit extent on both axes
 * and a square one larger, for no gain.
 *
 * THE SCALE IS THE NEAREST POWER OF TWO TO THAT SIDE, NOT THE SIDE ITSELF, AND THAT IS WHAT MAKES
 * THE ROUND TRIP EXACT. The factor is `2 ** Math.round(Math.log2(longestSide))`, with `toUnitScale`
 * and `fromUnitScale` computed from that exponent directly — `2 ** -e` and `2 ** e` — so the two are
 * EXACT reciprocals rather than one being derived by dividing into the other. Multiplying or
 * dividing a finite double by a power of two adjusts the exponent field and leaves the mantissa
 * untouched, so it is exact in IEEE-754 provided the result neither overflows nor falls subnormal.
 * Scaling by an arbitrary `1 / longestSide` rounds the mantissa twice — once going in, once coming
 * out — and the two roundings do not cancel.
 *
 * The cost is that the normalised extent is no longer exactly 1. Writing `longestSide = 2 ** (e + d)`
 * with `d` in `[-0.5, 0.5]` by construction of `Math.round`, the normalised extent is `2 ** d` and so
 * lands in `[1/sqrt(2), sqrt(2)]`. That bound is what preserves every tolerance argument above: the
 * solver still never sees a magnitude it was not designed for, which is the entire justification
 * this transform rests on. A 300-unit fixture scales by 256, not by 300, and comes out 1.171875
 * across; a vertex 150 from the centre becomes 0.5859375 — exact, terminating in binary — and
 * multiplying by 256 returns 150 bit-for-bit.
 *
 * THE EXPONENT IS CLAMPED SO THAT BOTH DIRECTIONS STAY NORMAL. `2 ** -e` for a large positive `e`
 * falls subnormal, and multiplying by a subnormal loses mantissa bits — which would silently destroy
 * the exactness this whole scheme exists for. Outside the range where both `2 ** e` and `2 ** -e`
 * are normal doubles the transform falls back to the identity, flagged exactly as a degenerate
 * extent is.
 *
 * APPLIED EXACTLY ONCE, AT THE BOUNDARY, AND NEVER RE-APPLIED MID-SOLVE. That is what preserves the
 * one bit-exactness requirement this solver carries. `offset-projection.ts` needs a bisector's birth
 * and death offsets to compare BIT-FOR-BIT equal at an event, with no tolerance permitted. Both are
 * computed from the same graph in the same space by the same arithmetic, so a transform that touches
 * neither the graph nor anything between them cannot separate them — normalising before the solve
 * begins and denormalising after it ends is invisible to that comparison. A second application PART
 * WAY THROUGH a solve would not be invisible, because normalise and denormalise each round, so
 * nothing below may be called on a graph the solver is still working on.
 *
 * ROUND-TRIPPING IS EXACT IN THE SCALING, AND ONLY CONDITIONALLY EXACT IN THE CENTRING. This is
 * stated at the strength it actually holds, no higher. The scaling half is exact unconditionally,
 * because the factor is a power of two and both directions are guaranteed normal. The centring half
 * is a subtraction, and by the Sterbenz lemma `p - c` is exact whenever `c / 2 <= p <= 2c` — which
 * holds comfortably for a polygon translated away from the origin, where a 300-unit span sitting at
 * 1e8 puts every vertex within a whisker of the centre. NEAR THE ORIGIN, where the span is
 * comparable to the coordinates themselves, the subtraction can round; the round trip is then exact
 * in the scaling but not in the centring, and lands within an ulp or so rather than on the bit.
 * `normalisation.test.ts` records which regimes achieve bit-equality and pins the achieved error for
 * those that do not.
 *
 * This matters because the recursive subdivision arc crosses this seam once per level per
 * sub-region and asserts a tiling identity at every level against that level's own input, so a
 * round-trip error invisible in a single solve is injected at every level boundary and compounds
 * through the tree. The skeleton suites are invariant based at a `1e-6` tolerance and carry no
 * bit-exact goldens, so nothing is pinned to the old bits — but any FUTURE golden must be recorded
 * on denormalised output.
 *
 * WHAT SCALES AND WHAT DOES NOT. This is the whole risk of the change, so every length-dimensioned
 * quantity the solver stores is enumerated here rather than left to be rediscovered:
 *
 *   PolygonNode.position          POSITION  — translated AND scaled.
 *   CollisionEvent.position       POSITION  — translated AND scaled.
 *   InteriorEdge.maxOffset        LENGTH    — scaled, NOT translated. An offset is a distance
 *                                             travelled by the wavefront, not a point, so the
 *                                             centring term must not touch it.
 *   CollisionEvent.offsetDistance LENGTH    — scaled, not translated, for the same reason.
 *   IntersectionResult[0] and [1] LENGTH    — the ray-units pair; scaled, not translated. They are
 *                                             measured in units of each ray's own basis vector and
 *                                             the solver's bases are unit length, so they are true
 *                                             distances. Infinities survive the multiply, which is
 *                                             what the no-collision outcomes need.
 *   PolygonEdge.basisVector       DIRECTION — UNTOUCHED. A uniform positive scale does not rotate
 *                                             anything, so the direction is already correct in
 *                                             caller space; scaling a UNIT basis vector would
 *                                             destroy the unit length that every ray distance and
 *                                             every offset derived from one depends on. This is the
 *                                             single easiest quantity to get wrong, because it is a
 *                                             vector and so are positions. The test for it asserts
 *                                             bit-for-bit equality rather than a tolerance,
 *                                             deliberately: a scaled unit vector is still very
 *                                             nearly unit at these magnitudes, so a tolerance would
 *                                             pass the exact defect it guards.
 *   InteriorEdge.length           SENTINEL  — untouched. Written once as `Number.MAX_VALUE` and
 *                                             never read.
 *   ids, indices, targets, counts, ranks, event types, accepted flags
 *                                 DIMENSIONLESS — untouched.
 *
 * DERIVED QUANTITIES NEED NO ENTRY IN THAT LIST AND MUST NOT BE GIVEN ONE. `sourceOffsetDistance`,
 * `makeOffsetDistance`, `projectRay`, `clockwiseVertexAtOffset` and `computeMaxOffset` are pure
 * functions of the graph, computed on demand and never cached, so they follow the graph into caller
 * space by themselves. Scaling them as well would apply the factor twice.
 *
 * THE DESCRIPTOR IS PLAIN DATA AND THE HELPERS ARE FREE FUNCTIONS, which is where this diverges in
 * shape (not in behaviour) from the C++ port, whose equivalent carries the same six conversions as
 * struct methods. A `SkeletonNormalisation` rides on `SkeletonSolveResult`, and results in this
 * codebase get `structuredClone`d and posted between workers and the dashboard; methods do not
 * survive that and silently become `undefined` at the call site. A POJO does.
 */
export interface SkeletonNormalisation {
    /** The input's bounding-box centre, in the CALLER'S coordinates. */
    centre: Vector2;
    /**
     * Multiply a caller-space length by this to reach unit space: `2 ** -exponent`, a NEGATIVE power
     * of two for a polygon larger than a unit.
     */
    toUnitScale: number;
    /**
     * Multiply a unit-space length by this to reach caller space: `2 ** exponent`, the power of two
     * NEAREST the input's longest bounding-box side. Exactly the reciprocal of {@link toUnitScale},
     * bit for bit, which is what makes the round trip exact.
     */
    fromUnitScale: number;
    /**
     * Set when no usable EXACT scale could be derived from the input's longest bounding-box side.
     * Two causes, flagged identically because the caller's recourse is the same for both:
     *
     *   - The side was not a positive NORMAL double — zero, subnormal, infinite, or NaN. At that
     *     extent there is no shape for a scale factor to describe, and the reciprocal of a subnormal
     *     overflows to infinity, which would take the whole solve with it.
     *   - The side's exponent fell outside the range where BOTH `2 ** exponent` and `2 ** -exponent`
     *     are normal doubles. A subnormal scale in either direction loses mantissa bits on every
     *     multiply, silently, which is precisely the failure this transform exists to prevent.
     *
     * Both scales are then 1 and ONLY the centring translation is applied.
     */
    degenerateExtent: boolean;
}

/**
 * The smallest positive NORMAL double, `2^-1022`.
 *
 * NOT `Number.MIN_VALUE`, which is the smallest *subnormal* (`5e-324`) and is the wrong threshold
 * here by 308 orders of magnitude. The test below is on the reciprocal's representability, not on
 * geometric smallness: `1 / 5e-324` overflows to `Infinity`, and an infinite scale turns every
 * vertex into `NaN`.
 */
export const SMALLEST_NORMAL_DOUBLE = 2.2250738585072014e-308;

/**
 * The lowest scale exponent for which BOTH `2 ** exponent` and `2 ** -exponent` are normal doubles.
 *
 * `2 ** -1022` is the smallest normal double and `2 ** 1022` is comfortably finite, so -1022 is the
 * floor. One step lower and `2 ** exponent` is subnormal.
 *
 * NO POLYGON CAN ACTUALLY TRIP THIS ONE. The degeneracy guard has already rejected every side below
 * `SMALLEST_NORMAL_DOUBLE`, whose `Math.log2` is exactly -1022, and `Math.round` cannot take that
 * lower. It is checked for symmetry with the ceiling, which IS reachable.
 */
const MIN_EXACT_SCALE_EXPONENT = -1022;

/**
 * The highest scale exponent for which BOTH `2 ** exponent` and `2 ** -exponent` are normal doubles.
 *
 * NOT 1023, even though `2 ** 1023` is a perfectly good finite double: its reciprocal `2 ** -1023`
 * is SUBNORMAL, and multiplying by a subnormal drops mantissa bits without a word of complaint.
 * That is the one new way this transform can fail, and it fails silently, so the bound is set by
 * whichever direction runs out first.
 */
const MAX_EXACT_SCALE_EXPONENT = 1022;

/** The transform that does nothing, for a polygon that offers no usable extent. */
function identityNormalisation(centre: Vector2): SkeletonNormalisation {
    return {centre, toUnitScale: 1, fromUnitScale: 1, degenerateExtent: true};
}

/**
 * Derive the unit-extent transform for a polygon from its bounding box.
 *
 * DEGENERATE EXTENT DOES NOT DIVIDE, and the rule is EXACT rather than tolerance-based: the longest
 * bounding-box side must be a positive normal double. Zero (every vertex coincident), subnormal,
 * infinite and NaN all yield an identity scale with the centring translation still applied, and set
 * `degenerateExtent` so the caller can tell.
 *
 * An EMPTY vertex list is degenerate with a zero centre. A polygon with extent on only ONE axis is
 * NOT degenerate, because the longer side is what the scale is taken from.
 *
 * THE SCALE IS THE NEAREST POWER OF TWO TO THAT SIDE, so the two scales are exact reciprocals and
 * the round trip is bit-exact in its scaling. The normalised extent is therefore in
 * `[1/sqrt(2), sqrt(2)]` rather than exactly 1. An exponent whose reciprocal power would be
 * subnormal is rejected the same way a degenerate extent is. See this module's header.
 */
export function makeSkeletonNormalisation(vertices: readonly Vector2[]): SkeletonNormalisation {
    if (vertices.length === 0) {
        return identityNormalisation({x: 0, y: 0});
    }

    let minX = vertices[0].x;
    let minY = vertices[0].y;
    let maxX = vertices[0].x;
    let maxY = vertices[0].y;
    for (const vertex of vertices) {
        if (vertex.x < minX) minX = vertex.x;
        if (vertex.y < minY) minY = vertex.y;
        if (vertex.x > maxX) maxX = vertex.x;
        if (vertex.y > maxY) maxY = vertex.y;
    }

    // HALVED BEFORE SUMMING RATHER THAN AFTER. A bounding box spanning most of the double range
    // overflows on the sum and would hand back an infinite centre, which turns every normalised
    // vertex into a NaN. Halving a double is exact, so this costs nothing and cannot overflow.
    const centre: Vector2 = {x: minX * 0.5 + maxX * 0.5, y: minY * 0.5 + maxY * 0.5};

    const longestSide = Math.max(maxX - minX, maxY - minY);

    // NaN fails the `>=`; Infinity fails `isFinite`. Neither needs a special case of its own. This
    // guard runs FIRST, so `Math.log2` below can never see a zero, a subnormal or a NaN.
    const scaleIsUsable = Number.isFinite(longestSide) && longestSide >= SMALLEST_NORMAL_DOUBLE;
    if (!scaleIsUsable) {
        return identityNormalisation(centre);
    }

    // `Math.round` ties toward +Infinity. That is deterministic and reproducible, and at an exact
    // half-way point either neighbouring power of two satisfies the [1/sqrt(2), sqrt(2)] bound, so
    // the tie is not worked around.
    const exponent = Math.round(Math.log2(longestSide));
    if (exponent < MIN_EXACT_SCALE_EXPONENT || exponent > MAX_EXACT_SCALE_EXPONENT) {
        return identityNormalisation(centre);
    }

    // COMPUTED FROM THE EXPONENT IN BOTH DIRECTIONS, never one from the other: `1 / (2 ** exponent)`
    // would be exact here too, but deriving each from the exponent is what makes the reciprocity a
    // property of the construction rather than a fact about this particular divisor.
    return {
        centre,
        toUnitScale: 2 ** -exponent,
        fromUnitScale: 2 ** exponent,
        degenerateExtent: false,
    };
}

/** A caller-space POSITION carried into unit space: centred, then scaled. */
export function normalisePosition(normalisation: SkeletonNormalisation, position: Vector2): Vector2 {
    return {
        x: (position.x - normalisation.centre.x) * normalisation.toUnitScale,
        y: (position.y - normalisation.centre.y) * normalisation.toUnitScale,
    };
}

/** A unit-space POSITION carried back to caller space: scaled, then un-centred. */
export function denormalisePosition(normalisation: SkeletonNormalisation, position: Vector2): Vector2 {
    return {
        x: position.x * normalisation.fromUnitScale + normalisation.centre.x,
        y: position.y * normalisation.fromUnitScale + normalisation.centre.y,
    };
}

/**
 * A caller-space LENGTH carried into unit space: scaled, never translated.
 *
 * This is the seam for length-dimensioned INPUTS further down the pipeline — `computeStrips`'s
 * `depth`, `sliceStrip`'s `minWidth`/`maxWidth`. A road is four metres wide however large the region
 * is; a dimensionless fraction is not a length and must not come through here.
 */
export function normaliseLength(normalisation: SkeletonNormalisation, length: number): number {
    return length * normalisation.toUnitScale;
}

/** A unit-space LENGTH carried back to caller space: scaled, never translated. */
export function denormaliseLength(normalisation: SkeletonNormalisation, length: number): number {
    return length * normalisation.fromUnitScale;
}

/**
 * A caller-space AREA carried into unit space. AREA SCALES AS THE SQUARE — `sliceStrip`'s `minArea`
 * and `maxArea` come through here, not through {@link normaliseLength}.
 */
export function normaliseArea(normalisation: SkeletonNormalisation, area: number): number {
    return area * normalisation.toUnitScale * normalisation.toUnitScale;
}

/** A unit-space AREA carried back to caller space. Squared, for the same reason. */
export function denormaliseArea(normalisation: SkeletonNormalisation, area: number): number {
    return area * normalisation.fromUnitScale * normalisation.fromUnitScale;
}

/** Every vertex carried into unit space. */
export function normalisePolygon(vertices: readonly Vector2[], normalisation: SkeletonNormalisation): Vector2[] {
    return vertices.map(vertex => normalisePosition(normalisation, vertex));
}

/**
 * Carry a solved graph back into the caller's coordinates, IN PLACE.
 *
 * Applies exactly the enumeration in this module's header. Call it once, on a graph the solver has
 * finished with; calling it twice scales twice, and there is nothing in the graph that could detect
 * that.
 */
export function denormaliseGraph(graph: StraightSkeletonGraph, normalisation: SkeletonNormalisation): void {
    for (const node of graph.nodes) {
        node.position = denormalisePosition(normalisation, node.position);
    }

    // `graph.edges` IS DELIBERATELY NOT WALKED. Its only non-index field is `basisVector`, which is a
    // unit DIRECTION and is already correct in caller space under a uniform positive scale. Scaling
    // it would destroy the unit length every offset in the solver is measured against.

    for (const interiorEdge of graph.interiorEdges) {
        if (interiorEdge.maxOffset !== undefined) {
            interiorEdge.maxOffset = denormaliseLength(normalisation, interiorEdge.maxOffset);
        }
        // `interiorEdge.length` is the `Number.MAX_VALUE` sentinel, not a length. Left alone.
    }
}

/**
 * Carry a context's collision memo back into the caller's coordinates, IN PLACE.
 *
 * SEPARATE FROM THE GRAPH BECAUSE ONLY SOME CALLERS HAVE BOTH. The stepped entry point hands back
 * graph snapshots with no context and therefore no cache, while the context-returning entry points
 * must do both — a cache left in unit space beside a denormalised graph would answer confidently in
 * the wrong units about edges that are still perfectly valid.
 */
export function denormaliseCollisionCache(cache: CollisionCache, normalisation: SkeletonNormalisation): void {
    for (const byFirstEdge of cache.values()) {
        for (const entry of byFirstEdge.values()) {
            if (entry === NO_COLLISION_SENTINEL) {
                continue;
            }
            for (const event of entry) {
                event.offsetDistance = denormaliseLength(normalisation, event.offsetDistance);
                // W-spec W47: the WEIGHT is dimensionless and untouched; the distance it is paired
                // with is a length and scales, which is what keeps `timeOf(arrival)` equal to the
                // `offsetDistance` beside it on both sides of the seam.
                event.arrival = {
                    distance: denormaliseLength(normalisation, event.arrival.distance),
                    weight: event.arrival.weight,
                };
                event.position = denormalisePosition(normalisation, event.position);
                event.intersectionData[0] = denormaliseLength(normalisation, event.intersectionData[0]);
                event.intersectionData[1] = denormaliseLength(normalisation, event.intersectionData[1]);
            }
        }
    }
}
