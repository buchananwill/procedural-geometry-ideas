import {IntersectionType} from "./types";

export const FLOATING_POINT_EPSILON = 0.00000001;

/*
 * ----------------------------------------------------------------------------
 * THE ANGULAR RESOLUTION — ONE BAR, DERIVED FROM THE CLIENT'S FLOOR AND THE ROUNDOFF
 * ----------------------------------------------------------------------------
 *
 * Spec A1–A8 (angular-predicate-basis-decisions.md), journal decisions 134, 144 and 146. There is ONE
 * angular resolution, a FUNCTION of the client's perceptual floor δ, and every angular predicate in
 * the solver — "are these two directions identical?" and "can these two rays be intersected?" —
 * reads it. It replaces two retired constants, `DIRECTION_SINE_BAR` (1e-8, the epsilon read as a
 * sine) and `PARALLEL_GATE_SINE_BAR` (1.4142e-4, the epsilon read through `areEqual(|dot|, 1)`),
 * which were one scratch constant read in two spaces four orders apart. NEITHER TERM BELOW CONTAINS
 * `FLOATING_POINT_EPSILON` (spec A6, decision 144): the only two legitimate sources of a tolerance
 * are the client's floor δ ("visibly the same") and the double's unit roundoff u ("arithmetically
 * distinguishable"), and the resolution is the larger of one bound drawn from each.
 *
 * Every angular test keeps the division-free relative form journal decision 105 ruled:
 *
 *     |cross(a, b)|  <  angularResolution · |a| · |b|
 *
 * THE ORDERING IS (i) AT EQUALITY (spec A11): identity's bar and priceability's bar are one number,
 * so below the resolution a pair is not priceable and IS identical (closed or merged as parallel),
 * and at or above it the pair is priced. There is no band between the two.
 *
 * COMPUTED ONCE, AT CONTEXT CONSTRUCTION (spec A8): `makeStraightSkeletonSolverContext` stores
 * `angularResolution(perceptualFloor)` on the context beside `coaxialityFloor`, and every site reads
 * that field. A `sqrt` in an inner-loop predicate is slow, and two sites computing it separately
 * could disagree in the last bit.
 */

/**
 * The unit roundoff of IEEE-754 binary64 under round-to-nearest: `u = 2⁻⁵³`, HALF of
 * `Number.EPSILON`. Every correctly rounded operation returns `x(1 + ε)` with `|ε| ≤ u`.
 */
export const UNIT_ROUNDOFF = Number.EPSILON / 2;

/**
 * The absolute rounding error of the evaluated cross product of two unit vectors, in units of
 * {@link UNIT_ROUNDOFF}: **k = 2**. ARGUED HERE (spec I6 flagged the spec's `4u` as an estimate).
 *
 * The expression is `crossProduct(a, b) = a.x*b.y − b.x*a.y`, evaluated by JavaScript as two
 * correctly rounded products and one correctly rounded subtraction — IEEE-754 double, round to
 * nearest, and NO fused multiply-add (ECMAScript specifies each `*` and `−` as its own rounded
 * operation; engines may not contract them). Write `P = a.x·b.y`, `Q = b.x·a.y` exactly. Then
 *
 *     p̂ = P(1 + ε₁),   q̂ = Q(1 + ε₂),   ĉ = (p̂ − q̂)(1 + ε₃),   |εᵢ| ≤ u
 *
 *     ĉ − (P − Q) = P·ε₁ − Q·ε₂ + (p̂ − q̂)·ε₃
 *     |ĉ − (P − Q)| ≤ u·(|P| + |Q|) + u·|p̂ − q̂|
 *
 * For unit `a`, `b`, Cauchy–Schwarz on `(|a.x|, |a.y|)·(|b.y|, |b.x|)` gives `|P| + |Q| ≤ |a|·|b| = 1`,
 * and `|p̂ − q̂| ≤ |P − Q| + u(|P| + |Q|) ≤ |sin θ| + u`. So
 *
 *     |ĉ − sin θ|  ≤  u · (1 + |sin θ|) + u²   ≤   2u + u²
 *
 * at EVERY angle — the classical `γ₂` bound for a two-term dot product, to first order. In the
 * near-parallel regime the resolution actually decides (`|sin θ| ≲ 1e-4`) the third rounding
 * contributes `u·|sin θ|`, four orders below the first two, and when `p̂` and `q̂` share a sign and lie
 * within a factor of two of each other Sterbenz's lemma makes the subtraction EXACT (`ε₃ = 0`), so the
 * error there is `u(|P| + |Q|) ≤ u`. The spec's operands are not exactly unit — a normalised double
 * has `| |a| − 1 | ≲ 2u` — which moves the bound by `O(u²)` only.
 *
 * SO THE CONSTANT IS 2, NOT 3, 4 OR 6. `2u` is the smallest integer multiple of `u` that bounds the
 * error at every angle (`1u` holds only inside the near-parallel regime, and only just: `u(1 + |sin θ|)`
 * exceeds it). `3u`, `4u` and `6u` arise only by charging the OPERANDS' own normalisation error —
 * at most `u` of angle per normalised vector — to the cross product. That is excluded here on the
 * backward-error reading the conditioning bound needs: the solver's rays ARE the stored doubles, the
 * intersection `intersectRays` owes is the intersection of THOSE rays, and the only error the
 * division by `sin θ` amplifies is the error of evaluating `sin θ` from them. An upstream direction
 * error is a modelling error in the ray, present whether or not anything divides by it.
 *
 * Integer-valued and stated as a separate constant so that the C++ port (spec A26.2) reproduces the
 * product `k · √2 · u` in the same order, bit for bit.
 */
export const CROSS_PRODUCT_ROUNDING_UNITS = 2;

/**
 * The PERCEPTUAL bound on a turn the client can see, as a sine: `√2 · δ` (spec A2).
 *
 * A vertex with incident edges of length `L` and turn angle `θ` sits `h ≈ L·θ/2` from the chord
 * joining its neighbours; the client resolves the turn when `h ≥ δ`, i.e. `θ ≥ 2δ/L`. The bound must
 * hold for the longest edge a unit-extent region can carry, `L ≤ √2`, so the bound is
 * `2δ/√2 = √2·δ`. Evaluated in the region's own unit frame (spec A7).
 */
export function perceptualBound(perceptualFloor: number): number {
    return Math.SQRT2 * perceptualFloor;
}

/**
 * The CONDITIONING bound below which an intersection cannot be priced to within the floor, as a
 * sine: `sqrt(k·√2·u / δ)` with `k` = {@link CROSS_PRODUCT_ROUNDING_UNITS} (spec A3, constant argued
 * there).
 *
 * `intersectRays` divides by `sin θ`, computed as a cross product of unit vectors carrying an
 * absolute error of at most `k·u`. The resulting positional error is `|sep| · k·u / sin²θ`; bounding
 * it under the floor δ with `|sep| ≤ √2` in unit extent gives `sin²θ ≥ k·√2·u / δ`.
 *
 * PRODUCT ORDER IS PART OF THE DEFINITION (spec A26.2): `k · √2` and then `· u` are both exact (`k`
 * is 2 and `u` a power of two), so the only roundings are the division by δ and the square root.
 */
export function conditioningBound(perceptualFloor: number): number {
    return Math.sqrt(CROSS_PRODUCT_ROUNDING_UNITS * Math.SQRT2 * UNIT_ROUNDOFF / perceptualFloor);
}

/**
 * THE angular resolution at floor δ: `max(perceptualBound(δ), conditioningBound(δ))` (spec A1).
 *
 * THE `max` IS LIVE ON BOTH SIDES OF THE FLOOR LADDER (spec A4). The two bounds cross at
 * `δ* = (k·u/√2)^(1/3)` — with `k = 2`, `(√2·u)^(1/3) ≈ 5.39e-6`. Below it the conditioning bound
 * governs (`1.772e-5` at the library floor `1e-6`, 12.5× the perceptual bound); above it perception
 * governs (`1.4142e-5` at the demo floor `1e-5`). The resolution is therefore NOT monotone in δ: it
 * falls from the library floor to a minimum at the crossover and rises after it.
 *
 * Read BY THE SOLVER ONLY THROUGH `StraightSkeletonSolverContext.angularResolution` (spec A8); a
 * caller with no context states the value it means by calling this.
 */
export function angularResolution(perceptualFloor: number): number {
    return Math.max(perceptualBound(perceptualFloor), conditioningBound(perceptualFloor));
}

/**
 * Area below which a region counts as degenerate — the one floor, for every "is this sub-polygon
 * worth solving" question in the package.
 *
 * A floor rather than an exact zero, because the regions asking are *computed*: a sub-polygon of a
 * self-intersection decomposition and a segment boundary from `computeStrips` both arrive as
 * intersections of rays, so a sliver that is geometrically collinear carries an area of `1e-13` and
 * never an exact `0`. Testing `=== 0` would catch only hand-authored collinear input.
 *
 * An absolute area in the polygon's own units, on the same footing as {@link FLOATING_POINT_EPSILON}.
 * It lived twice — `AREA_EPSILON` in `polygon-decomposition.ts` and `DEGENERATE_AREA_EPSILON` in
 * `recursive-subdivision.ts` — with the second's comment asserting the two must agree; they are one
 * declaration here so that agreement cannot lapse.
 */
export const DEGENERATE_AREA_EPSILON = 0.000001;

/**
 * The largest ratio between the fastest and slowest edge weight the solver will accept (W-spec W48,
 * arc journal decision 119).
 *
 * DERIVED, NOT PICKED. After normalisation (W-spec W4) the slowest edge has weight exactly `1` and
 * the fastest has weight `R = max / min`. A TIME is `distance / weight`, so the solver's absolute
 * time window — {@link FLOATING_POINT_EPSILON}, used by the layer window and the phantom test — is a
 * DISTANCE window of `R · 1e-8` on the fastest edge. At `R = 100` that is `1e-6`, which is exactly
 * `SKELETON_NOISE_FLOOR`: beyond it the solver would fuse, as one arrival moment, two arrivals the
 * client's own floor says are two separate things. So the constant is
 * `SKELETON_NOISE_FLOOR / FLOATING_POINT_EPSILON = 100`.
 *
 * Not imported from `canonicalisation.ts` because that module imports from the solver's side of the
 * graph; the derivation is stated here and the two numbers are asserted against each other in
 * `weighted-offsets.test.ts`.
 */
export const MAX_WEIGHT_RATIO = 100;

/**
 * "Weights may change only at a VISIBLE CORNER" — the turn-sine bar below which a weight change is
 * refused (W-spec W49, arc journal decisions 119 and 124(b)).
 *
 * THE HAZARD IS ANGULAR, NOT A RATIO. The weighted vertex velocity solves `v · n₁ = w₁`,
 * `v · n₂ = w₂`, and its magnitude is `sqrt(w₁² + w₂² − 2 w₁ w₂ cos φ) / |sin φ|`. At `w₁ = w₂` that
 * is `w / cos(φ/2)`, bounded by the vertex angle alone. At `w₁ ≠ w₂` and `φ → 0` it is
 * `|w₁ − w₂| / φ`, unbounded for ANY weight ratio — measured at `1.5e7` for a turn of `1e-6` with
 * weights `(1, 16)`, where the `1e-8` time window becomes a spatial slack of `0.15`, a seventh of
 * the unit extent. {@link MAX_WEIGHT_RATIO} cannot bound it, so a second guard is required.
 *
 * AN INTERIM ARITHMETIC CONSTANT, FROZEN AT ITS HISTORICAL VALUE, AWAITING RE-DERIVATION (spec A22,
 * open decision O3 ruled (c) interim by journal decision 146; journal-5 register C8, the tolerance
 * derivation package). It used to ALIAS the retired `PARALLEL_GATE_SINE_BAR`, borrowing that bar's
 * number for a DIFFERENT conditioning question: this guards the weighted vertex-velocity kernel,
 * whose magnitude is `|w₁ − w₂| / φ` as `φ → 0`, not `intersectRays`' division. The gate is now the
 * floor-dependent `angularResolution`, and had the alias followed it the velocity bound would have
 * moved silently with the client's floor (`7.1e3·|w₁ − w₂|` becoming `5.6e4·|w₁ − w₂|` at the
 * library floor). So the alias is cut and the value frozen: `sqrt(ε(2 − ε))` at the scratch epsilon,
 * **1.4142e-4**, exactly the number the guard has always used — no behaviour moves. Above it the
 * kernel is conditioned as before: `|v| ≤ |w₁ − w₂| / 1.41e-4`, at most `7.1e3 · |w₁ − w₂|`. Its own
 * derivation, from the kernel's error budget against the floor, is C8's work (option (b)); it still
 * descends from `FLOATING_POINT_EPSILON`, which decision 144 retires, and says so.
 *
 * UNIT WEIGHTS NEVER REACH IT: the guard requires `w₁ ≠ w₂` before it looks at the turn at all.
 */
export const MIN_WEIGHT_TURN_SINE = Math.sqrt(FLOATING_POINT_EPSILON * (2 - FLOATING_POINT_EPSILON));

/**
 * "Are these two sources on ONE LINE?" — the LANE WIDTH, in distance, for the coaxiality question
 * (spec A9/A10, journal decisions 135 and 136).
 *
 * A THIRD QUESTION, IN THE FLOOR'S CATEGORY. The solver asks three things about a pair of rays, not
 * two: are the directions identical (an angle), is an intersection priceable (an angle), and are the
 * two sources coaxial (a DISTANCE). The third was answered for years at
 * {@link FLOATING_POINT_EPSILON}, which held the solver to arithmetic precision on a question the
 * client measures in visible distance — `sourceLiesAhead`'s own comment half-recognised this and
 * then reached for the epsilon anyway.
 *
 * THE WIDTH IS THE FLOOR ITSELF, unchanged: two lines the client cannot tell apart ARE one line for
 * every purpose the solve has, and journal decision 105's doctrine already rules that the floor is
 * the sole perceptual-identity bar. The identity is written as a function rather than used inline so
 * that the currency is named at every site that spends it, and so that the C++ port inherits the
 * three-question structure rather than three literals.
 *
 * IN UNIT SPACE, AS AN ABSOLUTE LATERAL DISTANCE — not a relative bar on the source separation. A
 * relative bar on a separation tending to zero is a bar tending to zero, and head-on-ness is a
 * property of the two DIRECTIONS, which do not shrink with it. That is the measured counter-case
 * `sourceLiesAhead`'s `Math.max(1, d)` hybrid existed for; the hybrid is retired because the
 * absolute form states the same thing without the discontinuity at unit separation.
 */
export function coaxialityFloor(perceptualFloor: number): number {
    return perceptualFloor;
}

export const NO_COLLISION_RESULTS: IntersectionType[] = ['diverging', 'parallel', 'identical-source']

export const TRIANGLE_INTERSECT_PAIRINGS = [[0,1],[1,2],[2,0],[1,0],[2,1],[0,2]]