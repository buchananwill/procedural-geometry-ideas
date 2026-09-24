import {IntersectionType} from "./types";

/*
 * ----------------------------------------------------------------------------
 * THE TWO SOURCES OF A TOLERANCE — AND NO THIRD (C8 spec T1, T2; journal decisions 144, 157)
 * ----------------------------------------------------------------------------
 *
 * The scratch constant `FLOATING_POINT_EPSILON = 1e-8` is DELETED. It was one literal read as a
 * distance, a time, a sine, an area and a parameter, and it was none of them. A tolerance in this
 * package may now contain only: the client's perceptual floor δ (`context.perceptualFloor`, unit
 * space) for "visibly the same"; the unit roundoff u = 2⁻⁵³ (`UNIT_ROUNDOFF`) for "arithmetically
 * distinguishable"; integer multiples of u argued at their site the way `CROSS_PRODUCT_ROUNDING_UNITS`
 * is argued below; and IEEE representability limits.
 *
 * THE CATEGORY RULE (spec T2, ratified by decision 157). A comparison that decides a QUESTION the
 * arithmetic cannot decide — about input geometry, or about candidate events before any node exists —
 * takes δ. A comparison whose acceptance DISCARDS OR SUBSTITUTES an answer the solver has already
 * produced — collapsing two nodes to one, replacing a computed rate — takes u. A comparison guarding a
 * division takes that operation's own first-order rounding bound. The floor is a release from
 * imperceptible questions, never an override of an answer already given.
 *
 * Every derived bar is a FUNCTION of δ (and u), computed once at context construction and carried on
 * the context (spec T5, A8), so that a C++ port inherits the derivation rather than a number (T38).
 */

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
 * An absolute area, read in TWO SPACES (spec I3): a caller-space area by the recursion
 * (`recursive-subdivision.ts` `degenerateRegionFailure`) and a UNIT-space area by the decomposition
 * (`polygon-decomposition.ts` `isValidSubPolygon`, which runs after `solveSkeleton` normalises).
 *
 * NOT YET DERIVED — A MEASURED STOP (C8 spec T23, open decision O3; dispatch 1's settling measurement,
 * 2026-09-24). O3's two candidate forms were measured against every decision-96 decline in the
 * recursion census (22 declines, all at depth 1, on `Off-edge Jitter Plus (seed 7919)` and
 * `Off-edge Jitter Reflex L (seed 55433, k=4)`), with the root floor restated in caller units as
 * canonicalisation restates it (2.56e-4 on both). (a) `δ²` keeps 1 of the 22; (b) `δ·(perimeter/2)`
 * keeps 16 and releases 6 (areas 4.6e-7..8.5e-7 against bars 4.0e-7..5.5e-7). Neither form keeps
 * every decline, which is the ruling rule's STOP branch, so the number is unmoved and the form is
 * returned to the lead. The decomposition's sub-polygon verdicts over the self-intersecting fixtures
 * agree under all three bars (current, (a), (b)) at both 1e-6 and 1e-5.
 *
 * It lived twice — `AREA_EPSILON` in `polygon-decomposition.ts` and `DEGENERATE_AREA_EPSILON` in
 * `recursive-subdivision.ts` — with the second's comment asserting the two must agree; they are one
 * declaration here so that agreement cannot lapse.
 */
export const DEGENERATE_AREA_EPSILON = 0.000001;

/**
 * Ulps of the larger quantity within which two computed values are ONE MOMENT of the arithmetic — the
 * REPRESENTATION BAR (C8 spec T26; moved here from `algorithm-complex-cases.ts`, where it was
 * `SIMULTANEOUS_ARRIVAL_ULPS`, value unchanged).
 *
 * SIXTY-FOUR, argued by two measured populations six orders away on either side (asserted as ratios in
 * `arrival-ordering.test.ts`): the rounding noise between two reports of one arrival sits at one to a
 * few ulps; the nearest genuinely separate arrivals on the corpus (`OFF_EDGE_JITTER_L_SEED_55433`'s
 * collapsing 4-ring) sit 3.9e5 to 1.1e6 ulps apart. Read with `Number.EPSILON` (= 2u) as
 * `ARRIVAL_MOMENT_ULPS · ε · |larger|`.
 *
 * SHARED BY EVERY "SAME VALUE, TWO ARITHMETIC ROUTES" QUESTION: the moment partition of the layer
 * tie-break (S29), the offset table's simultaneous sets (S30, which was a free `1e-12`), and the
 * arithmetic same-point bar of node identity (S1, S2, S4, S5 — see {@link positionsAreOnePoint}).
 * Integer-valued so the C++ port reproduces the product order bit for bit (T38).
 */
export const ARRIVAL_MOMENT_ULPS = 64;

/**
 * "Are these two arrivals ONE MOMENT of the wavefront clock?" — the SIMULTANEITY WINDOW, as a length
 * (C8 spec T12–T14; journal decisions 155 and 158).
 *
 * THE WINDOW IS THE FLOOR ITSELF, and both sources give it. Perceptually, an offset is a length and
 * one floor governs both axes (decision 83), so the time axis cannot be finer than the space axis.
 * Arithmetically, the angular resolution was sized (spec A3) so that every intersection the solver
 * prices is placed to within δ; every arrival distance therefore carries up to δ of error, and two
 * arrivals less than δ apart are not orderable by the solver's own error budget — the question
 * decision 141 hands to the floor. It replaces the scratch `1e-8`, which was about 1e8 ulps of pure
 * literal.
 *
 * STATED PER PAIR, CROSS-MULTIPLIED (T13): `|d₁·w₂ − d₂·w₁| < window · min(w₁, w₂)`, which is
 * `|t₁ − t₂| < δ / max(w₁, w₂)` — inside the window no participating edge advances more than δ. At
 * unit weights it reads `|d₁ − d₂| < δ`.
 *
 * ANCHORED, NEVER TRANSITIVE (decision 155): approximate equality is not an equivalence relation, so
 * every window is anchored on the earliest arrival and its width never exceeds δ. A many-way meeting
 * the window splits across two layers yields two nodes inside the floor, which decision 141 admits.
 *
 * Named like {@link coaxialityFloor} so every window site states which currency it spends; computed
 * once onto `StraightSkeletonSolverContext.simultaneityWindow` (T5).
 */
export function simultaneityWindow(perceptualFloor: number): number {
    return perceptualFloor;
}

/**
 * THE WINDOW THE SEVEN SITES STILL READ — HELD AT ITS HISTORICAL `1e-8` AS A MEASURED STOP (C8 spec
 * T14, T16, T37; dispatch 1, 2026-09-24). The derivation above is landed and carried on the context as
 * `simultaneityWindow`; the sites S22–S28 do not yet spend it, because moving them hit T37's STOPs.
 * Measured by toggle, each site alone with every other at 1e-8, over the T37 instrument suites:
 *
 *   - S22 (the layer): the four predicted defect digests move (T15), AND fixtures stop solving (two
 *     off-edge jitter plus cells), `Off-edge Jitter Reflex L (seed 55433)` gains a direction violation
 *     and a `causality-violation` diagnostic, the recursion census moves, `Offset Cross Junction`'s
 *     ladder moves at 1e-5 and above, and two clean fixtures (Crazy Polygon, Duck Octagon) grow as the
 *     floor rises — STOPs 1, 2, 3 and 6, and T16;
 *   - S28 (split birth): one off-edge jitter plus cell (k = 3) stops solving — STOP 1;
 *   - S23 (phantom) and S24 (snap time): off-corpus movement only (Circle 48 at 1e10's culled count,
 *     the 1e10 shards, the jittered Circle 32 at 1x seed 5, the flagged plus cell cured);
 *   - S25, S26, S27: nothing moves.
 *
 * T14 puts all seven on ONE bar, so a partial landing would be one question at two bars (decision
 * 144); all seven are held together and the STOP is returned to the lead. Stated per pair in T13's
 * form (`window · min(w₁, w₂)`), which is landed.
 */
export const HELD_SIMULTANEITY_WINDOW = 0.00000001;

/**
 * The largest ratio between the fastest and slowest edge weight the solver will accept (W-spec W48;
 * C8 spec T22, journal decision 156): `maxWeightRatio(δ) = δ / (64·√2·u)`.
 *
 * THE OLD DERIVATION IS VOID. `MAX_WEIGHT_RATIO = 100` was `1e-6 / 1e-8`: the scratch time window read
 * as a distance on the fastest edge. The per-pair window (T13) is stated on the FASTER participant, so
 * that hazard — two arrivals fused because the window, read in the fast edge's distance, exceeds the
 * floor — is gone for every ratio. What still binds is COHERENCE between the two simultaneity bars:
 * the narrowest window, `δ / R` in time, must stay wider than the arithmetic moment bar
 * (`ARRIVAL_MOMENT_ULPS · ε · t`, S29) at the largest time a unit-extent region admits,
 * `t_max = √2/2` (spec I7). So
 *
 *     R  ≤  δ / (64 · ε · t_max)  =  δ / (64 · 2u · √2/2)  =  δ / (64 · √2 · u)
 *
 * — about 9.95e7 at the library floor and 9.95e8 at 1e-5. The door refuses only where the narrowest
 * window would fall inside the moment bar: "guards pathological, doesn't insist on a concrete product
 * opinion" (decision 156). The conditioning hazard the old ceiling half-covered is the per-vertex turn
 * guard's ({@link minWeightTurnSine}).
 *
 * PRODUCT ORDER IS PART OF THE DEFINITION: `64 · √2` and `· u` are exact (powers of two), so the only
 * rounding is the division, and `maxWeightRatio(δ) · 64 · √2 · u` returns δ (asserted in
 * `tolerance-derivation.test.ts`).
 */
export function maxWeightRatio(perceptualFloor: number): number {
    return perceptualFloor / (ARRIVAL_MOMENT_ULPS * Math.SQRT2 * UNIT_ROUNDOFF);
}

/**
 * "Weights may change only at a VISIBLE CORNER" — the turn-sine bar below which a weight change is
 * refused (W-spec W49, arc journal decisions 119 and 124(b)).
 *
 * THE HAZARD IS ANGULAR, NOT A RATIO. The weighted vertex velocity solves `v · n₁ = w₁`,
 * `v · n₂ = w₂`, and its magnitude is `sqrt(w₁² + w₂² − 2 w₁ w₂ cos φ) / |sin φ|`. At `w₁ = w₂` that
 * is `w / cos(φ/2)`, bounded by the vertex angle alone. At `w₁ ≠ w₂` and `φ → 0` it is
 * `|w₁ − w₂| / φ`, unbounded for ANY weight ratio — measured at `1.5e7` for a turn of `1e-6` with
 * weights `(1, 16)`, where the `1e-8` time window becomes a spatial slack of `0.15`, a seventh of
 * the unit extent. {@link maxWeightRatio} cannot bound it, so a second guard is required.
 *
 * DERIVED FROM THE KERNEL'S OWN ERROR BUDGET (C8 spec T21), PER VERTEX: `√(√2·u·Δw / δ)`, with
 * `Δw = |w₁ − w₂|` at that vertex on the NORMALISED weights (minimum exactly 1, W-spec W4). The
 * kernel's velocity is `num / sin φ` with `|num| → Δw` as `φ → 0`, and the evaluated sine carries
 * `k·u` of absolute error (`k` = {@link CROSS_PRODUCT_ROUNDING_UNITS}), so the velocity error is about
 * `Δw·k·u / sin²φ`. Over the largest time a unit-extent region admits, `t_max ≤ √2/2` at minimum weight
 * 1 (spec I7), the positional error stays under δ when
 *
 *     sin²φ  ≥  k·u·t_max·Δw / δ  =  2u·(√2/2)·Δw / δ  =  √2·u·Δw / δ.
 *
 * Equivalently `conditioningBound(δ)·√(Δw/2)`. At the library floor: 4.853e-5 for weights (1, 16) and
 * 1.2468e-4 for Δw = 99, against the retired frozen 1.4142e-4 (the scratch epsilon's `√(ε(2 − ε))`,
 * which this replaces). A DIFFERENT QUESTION from `intersectRays`' division, so distinct from the
 * angular resolution (spec A22).
 *
 * PRODUCT ORDER IS PART OF THE DEFINITION: `√2 · u` is exact (u a power of two), then `· Δw`, `/ δ`
 * and the square root each round once; `minWeightTurnSine(δ, Δw)² · δ` returns `√2·u·Δw` to the ulp
 * (asserted in `tolerance-derivation.test.ts`).
 *
 * UNIT WEIGHTS NEVER REACH IT: the guard requires `w₁ ≠ w₂` before it looks at the turn at all.
 */
export function minWeightTurnSine(perceptualFloor: number, weightDifference: number): number {
    return Math.sqrt(Math.SQRT2 * UNIT_ROUNDOFF * weightDifference / perceptualFloor);
}

/*
 * ----------------------------------------------------------------------------
 * DIVISION SAFETY — EACH GUARD TAKES ITS OPERATION'S OWN FIRST-ORDER ROUNDING BOUND (C8 spec T19, T20)
 * ----------------------------------------------------------------------------
 *
 * "Is this divisor zero?" is a question about the arithmetic, not about the geometry, so its bar is
 * the evaluated expression's own rounding-error bound: a value inside it has no sign and no magnitude
 * the arithmetic can vouch for. The pattern is `meetHeadOn`'s (collision-helpers.ts). Every bound below
 * is first order in u, lies seven to eight orders inside the retired `1e-8`, and is compared with `≤`
 * ("inside the bound"), as `meetHeadOn` compares.
 */

/**
 * The rounding bound of `rateA·weightB + rateB·weightA`, where each rate is a cross product of unit
 * vectors (absolute error `k·u`, {@link CROSS_PRODUCT_ROUNDING_UNITS}) and each product by a weight and
 * the final addition round once (relative u):
 *
 *     |fl(sum) − sum|  ≤  k·u·(weightA + weightB)  +  2u·(|termA| + |termB|)
 *
 * `termA = rateA·weightB` and `termB = rateB·weightA` are the two EVALUATED products. The operation
 * order is `meetHeadOn`'s, so that site and the two split divisors (S33, S34) share one bound bit for
 * bit. At unit weights the bound is at most `8u ≈ 8.9e-16`.
 */
export function weightedRateSumRoundingBound(
    termA: number,
    termB: number,
    weightA: number,
    weightB: number,
): number {
    return CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF * (weightA + weightB)
        + 2 * UNIT_ROUNDOFF * (Math.abs(termA) + Math.abs(termB));
}

/**
 * The rounding error of a 3×3 determinant evaluated by cofactor expansion along the first row, in
 * units of u: **c₃ = 5**. ARGUED HERE, as {@link CROSS_PRODUCT_ROUNDING_UNITS} is argued above.
 *
 * The expression is `r₀₀·(r₁₁·r₂₂ − r₁₂·r₂₁) − r₀₁·(r₁₀·r₂₂ − r₁₂·r₂₀) + r₀₂·(r₁₀·r₂₁ − r₁₁·r₂₀)`,
 * every `*`, `−` and `+` its own correctly rounded operation (no FMA, T39). Each of the six exact
 * triple products `P` reaches the result through at most FIVE roundings: the inner product (1), the
 * inner subtraction (1), the outer product (1), and the two outer additions — left to right, the first
 * two cofactor terms pass through both, the third through one. So each carries a relative factor
 * `(1 + θ₅)` with `|θ₅| ≤ γ₅ = 5u/(1 − 5u)`, and to first order
 *
 *     |fl(det) − det|  ≤  5u · Σ |triple products|.
 *
 * Integer-valued and stated separately so the port reproduces `c₃ · u · Σ` in the same order (T38).
 */
export const DETERMINANT3_ROUNDING_UNITS = 5;

/** The sum of the magnitudes of the six triple products of a 3×3 determinant's cofactor expansion. */
export function determinant3TripleSum(
    row0: readonly [number, number, number],
    row1: readonly [number, number, number],
    row2: readonly [number, number, number],
): number {
    return Math.abs(row0[0]) * (Math.abs(row1[1] * row2[2]) + Math.abs(row1[2] * row2[1]))
        + Math.abs(row0[1]) * (Math.abs(row1[0] * row2[2]) + Math.abs(row1[2] * row2[0]))
        + Math.abs(row0[2]) * (Math.abs(row1[0] * row2[1]) + Math.abs(row1[1] * row2[0]));
}

/** `c₃ · u · Σ|triple products|` — the determinant's first-order rounding bound (S35, T19). */
export function determinant3RoundingBound(tripleSum: number): number {
    return DETERMINANT3_ROUNDING_UNITS * UNIT_ROUNDOFF * tripleSum;
}

/**
 * The first-order rounding bound of a Cramer quotient `t = det_t / det` (S36, T20).
 *
 * `det_t` and `det` each carry `c₃·u·Σ|triple products|` of their own ({@link
 * determinant3RoundingBound}), and the division rounds once (relative u). Propagated to first order:
 *
 *     |fl(t) − t|  ≤  (c₃·u·Σ_t  +  |t| · c₃·u·Σ) / |det|  +  u·|t|
 *
 * where `Σ_t` is the triple sum of the substituted determinant. With unit normals this is the spec's
 * `c₃·u·(|rhs| + |t|·Σ|weights|) / |det|` with the normals' components (each at most 1) kept rather
 * than bounded away, plus the division's own rounding.
 */
export function cramerQuotientRoundingBound(
    numeratorTripleSum: number,
    denominatorTripleSum: number,
    quotient: number,
    determinant: number,
): number {
    return (determinant3RoundingBound(numeratorTripleSum)
            + Math.abs(quotient) * determinant3RoundingBound(denominatorTripleSum)) / Math.abs(determinant)
        + UNIT_ROUNDOFF * Math.abs(quotient);
}

/**
 * The rounding bound of the sum of two (weighted) unit bases before normalisation, `|wWs·c + wCw·b|`
 * (S37, T19): each unit basis carries up to `k·u` of absolute error, scaled by its weight, so
 * `k·u·(wWs + wCw)` — which at unit weights is the spec's `2k·u`, bit for bit. A sum inside it has no
 * direction the arithmetic can vouch for.
 */
export function basisSumRoundingBound(weightA: number, weightB: number): number {
    return CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF * (weightA + weightB);
}

/**
 * The rounding bound of a cross product of two unit vectors, `k·u` (S38, T19): the divisor of
 * `projectFromPerpendicular`.
 */
export const UNIT_CROSS_PRODUCT_ROUNDING_BOUND = CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF;

/**
 * "Are these two positions ONE POINT?" once a node exists — the ARITHMETIC same-point bar of S1
 * (`findOrAddNode`), S2 (`coincidentEventPositions`), S4 (graph-merge's crossing-point dedupe) and S5
 * (the offset projection's zero-length segments). HELD AT ITS HISTORICAL VALUE, THE COMPONENT BOX AT
 * `1e-8`, AS A MEASURED STOP (C8 spec T8 and O1; journal decision 154's ruling rule).
 *
 * O1's settling histogram (dispatch 1, 2026-09-24) found joins ABOVE 64 ulps — 43 of them at 5e5 to
 * 5.2e7 ulps of the unit extent (7e-10 to 1.16e-8), on Circle 48 and Rosette5 40 at fine
 * translations, one off-edge jitter cell and eight cells of the jittered Circle 32 ladder — and they do
 * NOT correlate with the pricing's conditioning: every one sits 6e3 to 3.6e8 times the larger of its
 * two positions' conditioning quantities (`|sep|·2u/sin²θ` at the pair pricing, the Cramer bound at
 * the terminal triangle). That is decision 154's third branch: each such join names a path that
 * BYPASSED EVENT RESOLUTION, and the three found are reported to the lead rather than absorbed — the
 * whole-event merge (`handleInteriorNGon` → `terminateEdgesAtPoint`) landing on a node an earlier layer
 * built, the terminal triangle's closed form (`handleInteriorEdgeTriangle`) landing on one, and the
 * split path (`handleCollisionEvent`). Until those paths are fixed there, option (a)'s representation
 * bar would split nodes this box currently joins, so the bar is not moved.
 *
 * Its acceptance DISCARDS a produced answer (two nodes become one), so under T2 it is an arithmetic
 * bar and never δ (F27, audit C1).
 */
export const ARITHMETIC_SAME_POINT_BOX = 0.00000001;

/**
 * "Are these two sources on ONE LINE?" — the LANE WIDTH, in distance, for the coaxiality question
 * (spec A9/A10, journal decisions 135 and 136).
 *
 * A THIRD QUESTION, IN THE FLOOR'S CATEGORY. The solver asks three things about a pair of rays, not
 * two: are the directions identical (an angle), is an intersection priceable (an angle), and are the
 * two sources coaxial (a DISTANCE). The third was answered for years at
 * the retired scratch `FLOATING_POINT_EPSILON`, which held the solver to arithmetic precision on a question the
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