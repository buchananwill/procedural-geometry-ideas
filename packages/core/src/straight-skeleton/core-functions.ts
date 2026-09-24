import {RayProjection, Vector2} from "./types";
import {
    basisSumRoundingBound,
    OFFSET_RATE_FORWARD_ROUNDING_BOUND,
    UNIT_CROSS_PRODUCT_ROUNDING_BOUND,
} from "./constants";

/*
 * NO DEFAULT BAR ON ANY EQUALITY PREDICATE (C8 spec T4). `areEqual`, `vectorsAreEqual` and
 * `fp_compare` used to default to the scratch `FLOATING_POINT_EPSILON`, which is deleted (T1). A default
 * here would be a tolerance chosen one hop away from every caller — the pattern spec A15 removed from
 * `sineIsBelow` — so every caller states its bar, and an exact comparison is written with a literal 0.
 */

export function areEqual(a: number, b: number, epsilon: number): boolean {
    return Math.abs(a - b) < epsilon;
}

/**
 * The COMPONENT-WISE BOX: both coordinates within `epsilon`. Kept, with its bar stated by the caller,
 * only where C8 did not re-derive the site: the arithmetic same-point bar (spec T8) stays the box while
 * its O1 ruling is STOPPED (see `solver-context.ts` `findOrAddNode`).
 */
export function vectorsAreEqual(a: Vector2, b: Vector2, epsilon: number): boolean {
    return areEqual(a.x, b.x, epsilon) && areEqual(a.y, b.y, epsilon);
}

export function assertIsNumber(x: unknown): asserts x is number {
    if (typeof x !== "number") {
        throw new Error("Expected a number");
    }
}

export function fp_compare(a: number, b: number, epsilon: number): number {
    const diff = a - b;
    if (Math.abs(diff) < epsilon) {
        return 0;
    }
    return diff < 0 ? - 1 : 1;
}

export function addVectors(a: Vector2, b: Vector2): Vector2 {
    return {x: (a.x + b.x), y: (a.y + b.y)};
}

/**
 * Subtract b from a
 * */
export function subtractVectors(a: Vector2, b: Vector2): Vector2 {
    return {x: (a.x - b.x), y: (a.y - b.y)};
}

export function scaleVector(v: Vector2, scalar: number): Vector2 {
    return {x: v.x * scalar, y: v.y * scalar};
}

export function rotateCw90(vector: Vector2):Vector2 {
    // noinspection JSSuspiciousNameCombination rotation of vector
    return {x: vector.y, y: -vector.x}
}

export function rotateWs90(vector: Vector2): Vector2 {
    return negateVector(rotateCw90(vector))
}

export function sizeOfVector(v: Vector2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * If argument v has size 0, returns [1,0]
 * */
export function normalize(v: Vector2): [Vector2, number] {
    const size = sizeOfVector(v)
    if (size === 0) {
        return [{x: 0, y: 0}, size];
    }
    return [{x: v.x / size, y: v.y / size}, size];
}

export function makeBasis(from: Vector2, to: Vector2): Vector2 {
    const relativeVector = subtractVectors(to, from);
    return normalize(relativeVector)[0];
}

/**
 * Assumes vectors are ordered so that iBasis is the clockwise-most exterior edge, in the case of a polygon perimeter
 * */
export function makeBisectedBasis(iBasis: Vector2, jBasis: Vector2): Vector2 {
    const added = addVectors(iBasis, jBasis);
    const [bisection, size] = normalize(added);
    // A DIVISION GUARD (C8 spec T19, S37): the sum of two unit bases has no direction the arithmetic
    // can vouch for inside its own rounding bound, `2k·u` — was `areEqual(size, 0)` at the scratch 1e-8.
    if (size <= basisSumRoundingBound(1, 1)) {
        // noinspection JSSuspiciousNameCombination Matrix rotation
        return rotateCw90(iBasis)
    }
    return bisection;
}

/**
 * The WEIGHTED bisected basis: `normalize(w_ws · c − w_cw · b)` (W-spec W12).
 *
 * `iBasis` is the clockwise parent's basis `c` and `jBasis` is the widdershins parent's basis
 * ALREADY NEGATED — the same two vectors {@link makeBisectedBasis} is handed at the one call site,
 * `addBisectionEdge` — so the sum below IS the spec's difference. `wCw` and `wWs` are those two
 * parents' weights, and the numerator is the vertex-velocity kernel's numerator (W-spec W9), so the
 * direction this returns is the kernel's direction.
 *
 * AT UNIT WEIGHTS IT IS BIT-IDENTICAL TO {@link makeBisectedBasis} BY CONSTRUCTION. `x * 1.0` is `x`
 * for every finite double, so the two scalings are the identity on their operands and the addition,
 * the normalisation and the zero-length fallback are the ones the unweighted solver performed, in
 * the order it performed them. That is what arc decision 112(d)'s bit-identity bar rests on, and it
 * is why the Cramer spelling — divide by the determinant, then normalise — is NOT used: it is 0–3
 * ulps off today's bits.
 *
 * The zero-length fallback is today's, unchanged: where the scaled difference cancels there is no
 * direction to normalise and the inward perpendicular of the clockwise parent stands in.
 */
export function makeWeightedBisectedBasis(
    iBasis: Vector2,
    jBasis: Vector2,
    wCw: number,
    wWs: number,
): Vector2 {
    const added = addVectors(scaleVector(iBasis, wWs), scaleVector(jBasis, wCw));
    const [bisection, size] = normalize(added);
    // The same guard as {@link makeBisectedBasis}, each basis's `k·u` scaled by its weight; at unit
    // weights `basisSumRoundingBound(1, 1)`, bit for bit (C8 spec T19, S37).
    if (size <= basisSumRoundingBound(wWs, wCw)) {
        // noinspection JSSuspiciousNameCombination Matrix rotation
        return rotateCw90(iBasis)
    }
    return bisection;
}

export function negateVector(v: Vector2): Vector2 {
    return {x: -v.x, y: -v.y};
}

export function findPositionAlongRay(ray: RayProjection, t: number): Vector2 {
    return addVectors(ray.sourceVector, scaleVector(ray.basisVector, t));
}

export function makeRay(source: Vector2, basis: Vector2): RayProjection {
    return {sourceVector: source, basisVector: basis};
}

export function crossProduct(a: Vector2, b: Vector2): number {
    return a.x * b.y - b.x * a.y
}

export function dotProduct(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y
}

/*
 * ----------------------------------------------------------------------------
 * THE ANGULAR PREDICATES — ONE BASIS FOR EVERY "SAME DIRECTION" QUESTION
 * ----------------------------------------------------------------------------
 *
 * Journal decision 105. Before these existed the solver asked "are these two directions the same?"
 * in three different spellings — a component-wise box on two unit vectors, an `areEqual` on their
 * dot product, and a box at a bare `1e-4` — which answered at ≈1e-8, 1.41e-4 and ≈1.41e-4 radians
 * respectively. The value under test could therefore be judged parallel by one caller and
 * non-parallel by the next, decided by nothing but which spelling that caller reached for.
 *
 * These two functions are the whole of the replacement. Both work on RAW vectors: the operand
 * magnitudes appear on the right-hand side instead of being divided out on the left, so a caller
 * with a raw separation vector no longer has to normalise before asking, and the amplification that
 * normalising a near-zero separation causes never happens.
 *
 * NO DEFAULT BAR (spec A15, journal decision 146). Both used to default to the retired
 * `DIRECTION_SINE_BAR`, a module constant; the bar is now the solve's own `angularResolution`, a
 * function of the client's floor carried on the solver context, and a default here would freeze it
 * at one value one hop away from every caller. Every caller states its bar.
 */

/**
 * Is the sine of the angle between `a` and `b` below `bar`?
 *
 * `|cross(a, b)| < bar · |a| · |b|`, evaluated in that order and never as a division. Answers
 * PARALLELISM only — it is blind to orientation, so anti-parallel vectors pass. Use
 * {@link directionsAreSame} where the two must also point the same way.
 *
 * A zero-length operand fails: the angle to a vector with no direction is not below anything.
 */
export function sineIsBelow(a: Vector2, b: Vector2, bar: number): boolean {
    return Math.abs(crossProduct(a, b)) < bar * sizeOfVector(a) * sizeOfVector(b);
}

/**
 * Do `a` and `b` point the same way, to within `bar` of sine?
 *
 * The orientation half is an EXACT sign test on the dot product and carries no tolerance, because
 * the tolerance belongs to the angle and a pair inside the sine bar with a negative dot is
 * anti-parallel rather than nearly-same — a full half-turn away, which is not a near miss.
 *
 * This is also the point-on-ray predicate. "Does `point` lie ahead on the ray `(source, basis)`?"
 * is `directionsAreSame(subtractVectors(point, source), basis)`, with no normalisation of the
 * separation anywhere in it.
 */
export function directionsAreSame(a: Vector2, b: Vector2, bar: number): boolean {
    return dotProduct(a, b) > 0 && sineIsBelow(a, b, bar);
}

/**
 * iBasis is clockwise from jBasis to give positive projection
 * */
export function projectToPerpendicular(iBasis: Vector2, jBasis: Vector2, length: number): number {
    return crossProduct(iBasis, jBasis) * length
}

/**
 * iBasis is clockwise from jBasis to give positive projection
 * */
export function projectFromPerpendicular(iBasis: Vector2, jBasis: Vector2, perpendicular: number): number {
    const cross = crossProduct(iBasis, jBasis);
    // A DIVISION GUARD (C8 spec T19, S38): a cross product of unit vectors inside its own rounding
    // bound `k·u` has no sign to divide by — was `areEqual(cross, 0)` at the scratch 1e-8.
    return Math.abs(cross) <= UNIT_CROSS_PRODUCT_ROUNDING_BOUND ? 0 : perpendicular / cross;
}

/**
 * Is this evaluated OFFSET RATE an arithmetic zero? `|rate| ≤ 8u` — the rate's FORWARD rounding bound
 * (C8 spec T2, T30; journal decisions 157, 161(b) and 164).
 *
 * An offset rate is `cross(basis, clockwiseParent.basis)`: a bisector basis against a wall basis, both
 * normalised from COMPUTED vectors. The question both callers ask is whether the rate of the EXACT
 * geometry is zero, so the bar charges the operands' own direction errors as well as the evaluation:
 * {@link OFFSET_RATE_FORWARD_ROUNDING_BOUND}, argued at `FORWARD_CROSS_PRODUCT_ROUNDING_UNITS` in
 * constants.ts. Inside it the rate has no sign the arithmetic can vouch for; outside it the sign and the
 * magnitude are an ANSWER the solver has already computed. (`k·u`, the backward bound of the evaluation
 * alone, was landed here first and is too narrow for a forward question — decision 164.)
 *
 * A SUBSTITUTION BAR, NOT A QUESTION. `makeOffsetDistance` substitutes `0` for the computed rate when this
 * holds (S20), so under T2 the bar is the arithmetic's own, and never the angular resolution or the
 * perceptual floor: decision 157's floor releases the solver from questions it cannot decide, and never
 * overrides an answer it has given. `≤`, as every rounding-bound guard in this package compares.
 *
 * `addBisectionEdge`'s zero rate (S19) asks the same expression of the same operand and decision 164
 * wired it here, but it is NOT a caller: measured in C8 dispatch 3, this bar there leaves `Golf Cart`'s
 * root unmoved but prices its level-1 regions' 5u–24u corridor rates by sign, and a region's strips come
 * out 3.2% short. The site stays held at its sine literal (see there).
 */
export function offsetRateIsArithmeticZero(rate: number): boolean {
    return Math.abs(rate) <= OFFSET_RATE_FORWARD_ROUNDING_BOUND;
}

