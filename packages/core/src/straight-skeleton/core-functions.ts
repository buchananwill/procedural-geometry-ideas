import {RayProjection, Vector2} from "./types";
import {DIRECTION_SINE_BAR, FLOATING_POINT_EPSILON} from "./constants";

export function areEqual(a: number, b: number, epsilon = FLOATING_POINT_EPSILON): boolean {
    return Math.abs(a - b) < epsilon;
}

export function vectorsAreEqual(a: Vector2, b: Vector2, epsilon?: number): boolean {
    return areEqual(a.x, b.x, epsilon) && areEqual(a.y, b.y, epsilon);
}

export function assertIsNumber(x: unknown): asserts x is number {
    if (typeof x !== "number") {
        throw new Error("Expected a number");
    }
}

export function fp_compare(a: number, b: number, epsilon = FLOATING_POINT_EPSILON): number {
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
    if (areEqual(size, 0)) {
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
    if (areEqual(size, 0)) {
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
 * normalising a near-zero separation causes never happens. See {@link DIRECTION_SINE_BAR} for why
 * the form matters as much as the number.
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
export function sineIsBelow(a: Vector2, b: Vector2, bar: number = DIRECTION_SINE_BAR): boolean {
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
export function directionsAreSame(a: Vector2, b: Vector2, bar: number = DIRECTION_SINE_BAR): boolean {
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
    return areEqual(cross, 0) ? 0 : perpendicular / cross;
}

