import {IntersectionType, Vector2} from "./types";

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
 * "Is this region worth solving?" — the DEGENERACY BAR, an area: `floor · perimeter / 2`, "NO VISIBLE
 * WIDTH" (C8 spec T23, open decision O3 ruled form (b) by journal decision 159(b)).
 *
 * A region of area `A` and perimeter `P` has a mean width of about `2A / P`; below `floor` the client
 * cannot see it has any width at all, which is decision 96's "a tile narrower than a certain size". It
 * replaces `DEGENERATE_AREA_EPSILON = 1e-6`, an absolute area with no derivation, which was read in two
 * spaces (spec I3): a caller-space area in the recursion, and a unit-space area in the decomposition,
 * where it was a square 1e-3 on a side — 1000δ — so a visible lobe of a self-intersection could be
 * discarded.
 *
 * ONE BAR, EACH CONSUMER IN ITS OWN SPACE: the recursion (`degenerateRegionFailure`) reads it with the
 * ROOT floor restated in caller units and the region's caller-unit perimeter, as canonicalisation
 * restates the root floor (S47); the decomposition (`isValidSubPolygon`) reads it in unit space with the
 * solve's perceptual floor, because `solveSkeleton` normalises before it decomposes.
 *
 * A FLOOR RATHER THAN AN EXACT ZERO, because the regions asking are computed: a sub-polygon of a
 * decomposition and a segment boundary from `computeStrips` both arrive as intersections of rays, so a
 * geometrically collinear sliver carries an area of `1e-13` and never an exact `0`.
 *
 * MEASURED BEFORE IT MOVED (C8 dispatches 1 and 2, 2026-09-24). Of the recursion census's 22
 * decision-96 declines (all at full depth, on `Off-edge Jitter Plus (seed 7919)` and `Off-edge Jitter
 * Reflex L (seed 55433, k=4)`, root floor 2.56e-4 in caller units), this form keeps 16 and releases 6
 * (areas 4.6e-7..8.5e-7 against bars 4.0e-7..5.5e-7); `δ²` would have kept 1. Decision 159(b) ruled
 * that the six be SOLVED before the bar moved: all six solve complete, with zero causality violations
 * on every oracle, I2 and I5 clean, and their strips tiling the canonical region to ≤ 1.25e-16. The
 * decomposition's sub-polygon verdicts over the self-intersecting fixtures agree under the old and the
 * new bar.
 */
export function degenerateAreaBar(floor: number, perimeter: number): number {
    return floor * perimeter / 2;
}

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
 * tie-break (S29), the offset table's simultaneous sets (S30, which was a free `1e-12`), and the floor of
 * every pair's simultaneity window (`pairSimultaneityWindow`). The same-point question of node identity
 * (S1, S2, S4, S5) reads {@link ARITHMETIC_SAME_POINT_BOX}, held (register C12). Integer-valued so the C++
 * port reproduces the product order bit for bit (T38).
 */
export const ARRIVAL_MOMENT_ULPS = 64;

/**
 * "Are these two arrivals ONE MOMENT of the wavefront clock?" — the CAP of the SIMULTANEITY WINDOW, as
 * a length (C8 spec T12 as amended by journal decision 160, T13, T14; decisions 155 and 158).
 *
 * THE WINDOW IS PER PAIR, AND THIS IS ITS CAP. Each pair's window is its own ordering uncertainty — the
 * arithmetic moment bar (`ARRIVAL_MOMENT_ULPS · ε · t` at the later time) widened by the two arrivals'
 * pricing error budgets (`Arrival.uncertainty`) — and never wider than δ, where decision 157 releases
 * the solver from deciding: perceptual in its cap, arithmetic in its floor. See
 * `pairSimultaneityWindow` (collision-helpers.ts) for the expression.
 *
 * THE FLAT δ WINDOW IS STRUCK (F70, decision 160). A δ-wide layer resolved as one event merges the
 * geometry of arrivals the arithmetic orders perfectly well — two arrivals 1e-7 apart are about 1e9
 * ulps apart, a deterministic order — and resolving them as simultaneous OVERRIDES that order, which
 * decision 157 forbids. "Every arrival carries up to δ of error" is the worst case at the conditioning
 * edge (spec A3), not the typical arrival; the typical arrival carries its own budget, which is what the
 * per-pair form reads.
 *
 * NOT YET SPENT: the per-pair form hit T37's STOPs in C8 dispatch 2 (division-only budget) and again in
 * register C12 (complete model, exact box) — see "THE WINDOW AND THE BOX" below — and the seven sites read
 * {@link HELD_SIMULTANEITY_WINDOW}. `compareArrivalsAtPairWindow` (collision-helpers.ts) is the per-pair
 * comparison, landed and unspent.
 *
 * STATED CROSS-MULTIPLIED (T13): the cap is `δ · min(w₁, w₂)` on `|d₁·w₂ − d₂·w₁|`, which is
 * `|t₁ − t₂| < δ / max(w₁, w₂)` — inside it no participating edge advances more than δ.
 *
 * ANCHORED, NEVER TRANSITIVE (decision 155): every window is anchored on the earliest arrival.
 *
 * Named like {@link coaxialityFloor} so every window site states which currency it spends; computed
 * once onto `StraightSkeletonSolverContext.simultaneityWindow` (T5).
 */
export function simultaneityWindow(perceptualFloor: number): number {
    return perceptualFloor;
}

/*
 * ----------------------------------------------------------------------------
 * THE WINDOW AND THE BOX — ONE HAND-TUNED SYSTEM, HELD TOGETHER (journal decisions 162 and 167, findings
 * F72 (struck) and F74, register C12)
 * ----------------------------------------------------------------------------
 *
 * {@link HELD_SIMULTANEITY_WINDOW} and {@link ARITHMETIC_SAME_POINT_BOX} are not two tolerances that happen
 * to share a number: they are ONE MATCHED PAIR. F74 traced what the pair does: the box absorbs genuinely
 * later or earlier events 1e-10 to 4e-7 away in time (41 of C11's 44 joins), and if the window moves
 * alone to its per-pair bar, the held box re-joins a later layer's merge onto an orphan edge's own source
 * and leaves a one-edge ring the step used to drop silently. Decision 162 rules a PERCEPTUAL window wrong
 * in principle, and decision 167 chose to move both, together, to the arithmetic bar: the window to each
 * pair's own, the moment bar widened by the two arrivals' COMPLETE first-order error budgets (the
 * error-model section below), capped at {@link simultaneityWindow}; the box to exact coordinate equality
 * at S1, S2, S4 and S5.
 *
 * REGISTER C12 MEASURED THAT MOVE AND IT STOPPED; BOTH ARE HELD HERE, BY INVERSE EDIT (2026-09-25). The
 * complete model is LANDED on every `Arrival` and every node (`Arrival.uncertainty`,
 * `positionUncertainties`) and convicted against exact arithmetic, and it is UNSPENT, as the division-only
 * budget was after C8 dispatch 2. Measured over 642 cells (`FULL_CORPUS` at 1e-6 and 1e-5, Circle 48 and
 * Rosette5 40 at the 46 fine translations, the off-edge 1e-3 and along-edge 1.0 jitter grids, the jittered
 * Circle 32 ladder, the 62 regular circles of the vertex-count sweep):
 *
 *   - DECISION 167'S CONVICTION HELD. `Near Regular Circle 48` (native), `Near Regular Peanut 32` and
 *     `Slightly Deformed Peanut 2` did not move; every regular circle solved, digest unmoved.
 *   - THE WINDOW STOPPED. The complete model is honest and it is WIDE where a bisector is ill-conditioned:
 *     a unit-weight bisector's direction error is `5u + 4u·cot(φ/2)` (the parents `φ` apart), so a
 *     near-straight jittered vertex carries budgets of up to 2.9e13 moment bars on the corpus (median 1.5,
 *     99th percentile 2.1e4) and reaches the δ cap — the perceptual window again, locally. An anchored
 *     per-pair layer then resolves a wide-budget arrival with the earliest while leaving out a
 *     narrow-budget arrival of the same edges that is unorderable against it: `Off-edge Jitter Plus`, k = 9,
 *     seed 23757, strips 1.1% short with every oracle clean (F73's class); k = 7, seed 31676, an offset and
 *     a direction violation; four cells off machine-precision tiling (1.7e-13 to 3.6e-10). Filtering the
 *     whole list rather than cutting at the first refusal also gave `Off-edge Jitter Plus (seed 7919)` a
 *     direction violation and stopped two off-edge cells solving.
 *   - THE BOX, EXACT, IS MOSTLY WHAT DECISION 167 SAID — sub-floor fans become separate nodes, trees and
 *     tilings improve on the translated circles — but alone it gives `Near Regular Circle 48` at 2e11 an
 *     offset and a direction violation (while curing that cell's 57% tiling miss), and at S5 the offset
 *     projection's two ends of a zero-length segment are computed independently and differ by ulps, so an
 *     exact S5 keeps a repeated vertex (`offset-event-boundary-regression.test.ts`, two tests).
 *
 * The package's own report carries every table; the lead rules on the next mechanism.
 */

/**
 * THE WINDOW THE SEVEN SITES STILL READ — HELD AT ITS HISTORICAL `1e-8` AS A MEASURED STOP, THREE TIMES
 * (C8 spec T14, T16, T37; register C12). Half of ONE matched pair with {@link ARITHMETIC_SAME_POINT_BOX} —
 * see the section above: they move together, or not at all.
 *
 * DISPATCH 1 (the flat δ window, F70): S22 alone moved the four predicted defect digests and stopped
 * fixtures solving, grew a direction violation and a diagnostic on `(seed 55433)`, moved the recursion
 * census and `Offset Cross Junction`'s ladder; S28 alone stopped one plus cell solving — STOPs 1, 2, 3, 6.
 *
 * DISPATCH 2 (T12 as amended by journal decision 160, the per-pair window `pairSimultaneityWindow` in
 * collision-helpers.ts, capped at δ, DIVISION-ONLY budget): with all seven sites at it, 211 of 580 sweep
 * cells move and 45 core tests fail — `Near Regular Circle 48` and the vertex-count sweep's regular circles
 * STOP SOLVING, and two CLEAN digests move (`Near Regular Peanut 32`, `Slightly Deformed Peanut 2`).
 *
 * REGISTER C12 (the per-pair window with the COMPLETE first-order model, beside an exact box): the three
 * fixtures dispatch 2 split are gathered and unmoved, and the move STOPS elsewhere — see the section above.
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
 * The FORWARD error of an evaluated OFFSET RATE — `cross(b̂, ĉ)`, a bisector basis against its clockwise
 * parent's wall basis, both COMPUTED from stored vertex coordinates — against the rate of the EXACT
 * geometry those coordinates describe, in units of {@link UNIT_ROUNDOFF}: **8**, near zero (journal-5
 * decision 164). ARGUED HERE as {@link CROSS_PRODUCT_ROUNDING_UNITS} is argued.
 *
 * `k = 2` answers the BACKWARD question — the error of evaluating the cross product of the stored doubles
 * — which is right for `intersectRays`, whose rays ARE those doubles. "Is this bisector's rate zero?" is
 * the FORWARD question — is the rate of the geometry the solver was given zero — so it must also charge
 * how far each operand's direction lies from the exact direction of the geometry. A perturbation of a
 * vector's components by relative factors `(1 + δᵢ)`, `|δᵢ| ≤ u`, turns it by at most
 * `|v_x v_y (δ₂ − δ₁)| / |v|² ≤ u·|sin 2φ| ≤ u`, and a common factor turns it not at all. So:
 *
 *   - the WALL BASIS `ĉ = normalize(q − p)`: the subtraction rounds each component once (≤ u of turn) and
 *     the normalisation divides each by one shared computed length and rounds once more (≤ u): **2u**;
 *   - the BISECTOR BASIS `b̂ = normalize(w_ws·ĉ − w_cw·ŵ)`: where its rate is near zero the two parents
 *     are near ANTI-parallel (near-parallel same-way parents at unequal weights are refused at the door,
 *     `minWeightTurnSine`; at equal weights their bisector is the ±1-rate perpendicular), so its direction
 *     is a convex combination of the two parents' and inherits at most their **2u**; the weight scalings
 *     round once (**u**, exact at unit weights), the sum once (**u**) and the normalisation once (**u**):
 *     **5u**;
 *   - the EVALUATION: `u·(1 + |sin θ|) + u²` (the `k` argument), which near zero is **u** to first order.
 *
 * Turns of `ε_b` and `ε_c` move `sin θ` by at most `|ε_b| + |ε_c|`, and the operands' length errors (a few
 * u) multiply `|sin θ|`, which inside the bar is itself O(u) — second order. Total, to first order where
 * the bar decides: `2u + 5u + u = 8u ≈ 8.9e-16`.
 *
 * A WORST-CASE BOUND, NOT A FIT: over 200 000 random near-anti-parallel wall pairs measured against exact
 * dyadic arithmetic (C8 dispatch 3), the worst forward error of the evaluated rate was 1.75u — the
 * roundings rarely align — and over 2 000 000 EXACTLY anti-parallel pairs the computed rate never
 * exceeded 1.5u. The bound is what the arithmetic can VOUCH FOR, not what it usually achieves: `Golf
 * Cart`'s 3.3u corridor rates, which it zeroes, are TRUE rates of a one-ulp tilt in that fixture's input
 * (vertex 3 at y = 399.99999999999994), not rounding.
 */
export const FORWARD_CROSS_PRODUCT_ROUNDING_UNITS = 8;

/**
 * `FORWARD_CROSS_PRODUCT_ROUNDING_UNITS · u`: the bar below which an evaluated offset rate carries no sign
 * the arithmetic can vouch for about the exact geometry (journal-5 decision 164). Read through
 * `offsetRateIsArithmeticZero` (core-functions.ts) by `makeOffsetDistance` (S20). `addBisectionEdge`'s
 * zero rate (S19) was measured at it and stays held (see that site).
 */
export const OFFSET_RATE_FORWARD_ROUNDING_BOUND = FORWARD_CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF;

/*
 * ----------------------------------------------------------------------------
 * THE ARRIVAL ERROR MODEL — COMPLETE, FIRST ORDER (journal-5 decisions 162(a) and 167, register C12)
 * ----------------------------------------------------------------------------
 *
 * THE QUESTION. Two arrivals of ONE exact meeting, priced along two different routes, come out as two
 * different doubles. The simultaneity window of a pair must contain that difference, or the solver splits
 * one meeting into two moments on the strength of its own rounding (F71: Peanut 32's `e37 × e57` readings
 * differ by 5.0e-15 against a moment bar of 2.9e-15; Circle 48's 48 hub arrivals span 2.7e-14). So each
 * arrival carries a FORWARD error bound — how far its computed distance can lie from the distance of the
 * EXACT geometry the solver was handed (the stored input doubles) — and two arrivals whose difference is
 * inside the sum of their bounds cannot be ordered by anything the arithmetic can vouch for.
 *
 * WHAT C8 DISPATCH 2 CHARGED, AND WHY IT WAS TWO ORDERS SHORT. Only the division by `sin θ` inside
 * `intersectRays` (`k·u·|sep|/sin²θ`): the BACKWARD error of evaluating the intersection of the stored
 * rays. But the rays are not the geometry — their bases are NORMALISED COMPUTED vectors, their sources
 * may be PRICED positions, and the arrival is then read through a computed RATE and a computed SOURCE
 * OFFSET. Every one of those roundings reaches the reading. The model below charges each, to first order
 * in u, as the FORWARD question requires (the argument at {@link FORWARD_CROSS_PRODUCT_ROUNDING_UNITS}).
 *
 * THE PIECES, EACH ARGUED AT ITS FUNCTION:
 *
 *   (i)   a basis's DIRECTION error — a wall `normalize(q − p)`: {@link WALL_DIRECTION_ERROR} (2u); a
 *         bisector: {@link bisectorDirectionError} (`5u + 4u·cot(φ/2)` at unit weights, the parents `φ`
 *         apart) — propagated through the intersection as `(η₁·|a| + η₂·|t|) / |sin θ|`
 *         ({@link rayIntersectionAlongUncertainty}); and every normalised vector's LENGTH error
 *         ({@link BASIS_LENGTH_ERROR}, 3u), which the turn-only reading missed;
 *   (ii)  the offset RATE's forward error, {@link offsetRateForwardError} (`η_b + η_c + 2u + 6u·|r|`),
 *         times the travel ({@link arrivalUncertainty});
 *   (iii) the SOURCE's own position budget, CARRIED from the event that placed the node (0 for a
 *         stored input vertex) — into the intersection as `(e₁ + e₂)/|sin θ|`, and into the source
 *         offset ({@link sourceOffsetUncertainty});
 *   (iv)  the division term C8 dispatch 2 had, now stated on the priced travel: `k·u·|a| / |sin θ|`
 *         (≤ `k·u·|sep|/sin²θ`);
 *
 * plus the evaluation roundings of every product and sum on the route. All are FIRST ORDER: products of
 * two error terms are dropped, as the `k` argument drops `u²`.
 *
 * A BOUND, NOT A FIT, CONVICTED AGAINST EXACT ARITHMETIC: `tolerance-derivation.test.ts` pins every
 * formula below as arithmetic and convicts the intersection budget against exact dyadic arithmetic on
 * 20 000 random intersections of normalised computed bases.
 */

/**
 * The direction error of a WALL basis — `makeBasis(p, q) = normalize(q − p)` of two stored doubles —
 * against the exact direction of `q − p`, in units of u: **2** (the FORWARD argument at
 * {@link FORWARD_CROSS_PRODUCT_ROUNDING_UNITS}): the subtraction rounds each component once (a turn of at
 * most `u·|sin 2φ| ≤ u`), and the normalisation divides both by one shared computed length (no turn) and
 * rounds each quotient once (at most `u` more).
 */
export const WALL_DIRECTION_ROUNDING_UNITS = 2;

/** `WALL_DIRECTION_ROUNDING_UNITS · u`: a wall basis's direction error, as an angle (radians ≈ sine). */
export const WALL_DIRECTION_ERROR = WALL_DIRECTION_ROUNDING_UNITS * UNIT_ROUNDOFF;

/**
 * The LENGTH error of any normalised computed vector — `normalize(z)`, `| |ẑ| − 1 |` — in units of u:
 * **3**. The computed length `√(x² + y²)` is off by a relative `2u` (the two squares and their sum give
 * `2u` on the square, halved by the root, plus the root's own rounding), and each quotient rounds once
 * more (`u`). A direction's TURN and its LENGTH are separate errors, and the model needs both: a length
 * error is harmless along the vector but not across a sum or a difference of two such vectors (see
 * {@link bisectorDirectionError}), and it scales every product the vector enters.
 */
export const BASIS_LENGTH_ROUNDING_UNITS = 3;

/** `BASIS_LENGTH_ROUNDING_UNITS · u`: the relative length error of a normalised computed vector. */
export const BASIS_LENGTH_ERROR = BASIS_LENGTH_ROUNDING_UNITS * UNIT_ROUNDOFF;

/**
 * The direction error of a BISECTOR basis `b̂ = ±normalize(v)`, `v = w_ws·ĉ − w_cw·ŵ` (the kernel
 * numerator `makeWeightedBisectedBasis` normalises; `ĉ`, `ŵ` the clockwise and widdershins parent WALL
 * bases), against the exact bisector of the exact walls — PART (i) of the model for an interior ray.
 *
 * DERIVED. Perturb `ĉ` by `δc` — a TURN `θ_c` (across `ĉ`) and a LENGTH error `λ_c` (along it) — and `ŵ`
 * likewise. The component of `δv = w_ws·δc − w_cw·δw` across `v̂` is what turns `v`: a turn of `ĉ`
 * contributes `θ_c·|ĉ·v̂|`, a length error `λ_c·|ĉ × v̂|`. So `v` turns by
 *
 *     ( w_ws·(θ_c·|ĉ·b̂| + λ_c·|ĉ×b̂|)  +  w_cw·(θ_w·|ŵ·b̂| + λ_w·|ŵ×b̂|) ) / |v|.
 *
 * Each parent carries the wall's turn `2u` and length error `3u` ({@link BASIS_LENGTH_ERROR}), and its
 * weight scaling rounds each component once more (`u` of turn and `u` of length; exact at unit weights,
 * charged regardless so that there is no branch on unit weights — W-spec W36): `θ = 3u`, `λ = 4u`. The
 * sum rounds each component once (`u` of turn) and the normalisation once more (`u`). So
 *
 *     η_b  =  ( w_ws·(3u·|ĉ·b̂| + 4u·|ĉ×b̂|)  +  w_cw·(3u·|ŵ·b̂| + 4u·|ŵ×b̂|) ) / |v|  +  2u.
 *
 * AT UNIT WEIGHTS, `v = ĉ − ŵ` with the parents `φ` apart: `|ĉ·v̂| = |ŵ·v̂| = |v|/2` (the TURNS average —
 * the bisector's direction is the mean of the parents' angles) and `|ĉ×v̂| = |ŵ×v̂| = cos(φ/2)` (the
 * LENGTH errors do not), so `η_b = 5u + 4u·cot(φ/2)`: 5u between anti-parallel walls (the corridor
 * midline, where {@link FORWARD_CROSS_PRODUCT_ROUNDING_UNITS}'s 5u was argued), 9u at a right angle, and
 * growing without bound at a near-STRAIGHT vertex, where two nearly equal unit vectors are subtracted and
 * their length errors are all that is left of the difference's direction. MEASURED BEFORE IT WAS
 * WRITTEN: the turn-only form (5u at every angle) was convicted against exact arithmetic by a bisector
 * 28.8u off its true direction (`tolerance-derivation.test.ts`). Under unequal weights the kernel can
 * amplify further, which the per-vertex turn guard ({@link minWeightTurnSine}) bounds; the expression
 * charges it as it stands.
 *
 * THE FALLBACK: where `|v|` is inside its own rounding bound ({@link basisSumRoundingBound}) the basis is
 * `rotateCw90(ĉ)`, an exact rotation of the clockwise wall, whose turn is the wall's.
 */
export function bisectorDirectionError(
    clockwiseBasis: Vector2,
    widdershinsBasis: Vector2,
    clockwiseWeight: number,
    widdershinsWeight: number,
    basis: Vector2,
): number {
    const vx = widdershinsWeight * clockwiseBasis.x - clockwiseWeight * widdershinsBasis.x;
    const vy = widdershinsWeight * clockwiseBasis.y - clockwiseWeight * widdershinsBasis.y;
    const size = Math.sqrt(vx * vx + vy * vy);
    if (size <= basisSumRoundingBound(widdershinsWeight, clockwiseWeight)) {
        return WALL_DIRECTION_ERROR;
    }
    const turn = WALL_DIRECTION_ERROR + UNIT_ROUNDOFF;
    const length = BASIS_LENGTH_ERROR + UNIT_ROUNDOFF;
    const clockwiseShare = turn * Math.abs(clockwiseBasis.x * basis.x + clockwiseBasis.y * basis.y)
        + length * Math.abs(clockwiseBasis.x * basis.y - basis.x * clockwiseBasis.y);
    const widdershinsShare = turn * Math.abs(widdershinsBasis.x * basis.x + widdershinsBasis.y * basis.y)
        + length * Math.abs(widdershinsBasis.x * basis.y - basis.x * widdershinsBasis.y);
    return (widdershinsWeight * clockwiseShare + clockwiseWeight * widdershinsShare) / size
        + 2 * UNIT_ROUNDOFF;
}

/**
 * The FORWARD error of an evaluated offset rate `r = cross(b̂, ĉ)` — PART (ii) of the model:
 *
 *     E_r  =  η_b + η_c + k·u + 2·λ·|r|
 *
 * Turns of the two operands move the sine by at most the sum of the turns; the evaluation adds
 * `u·(1 + |sin θ|) ≤ k·u` at any angle (the `k` argument); and each operand's length error
 * ({@link BASIS_LENGTH_ERROR}) scales the product. At unit weights between anti-parallel walls, near
 * zero, this is {@link FORWARD_CROSS_PRODUCT_ROUNDING_UNITS}'s argument (5u + 2u + the evaluation, the
 * length term second order); away from zero the evaluation is charged at `2u` and the length errors at
 * `6u·|r|`, because a rate multiplying a travel is read at every angle.
 */
export function offsetRateForwardError(basisDirectionError: number, wallDirectionError: number, rate: number): number {
    return basisDirectionError + wallDirectionError + CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF
        + 2 * BASIS_LENGTH_ERROR * Math.abs(rate);
}

/**
 * The error budget of a SOURCE OFFSET `s = cross(normalize(P − A), ĉ) · |P − A|` — a bisector source
 * `P`'s distance from its clockwise parent's line through the wall's own stored source `A` — PART (iii)
 * of the model, with `L = |P − A|`:
 *
 *     E_s  =  e_P  +  L·(η_c + 4u)  +  4u·|s|
 *
 * `e_P` is `P`'s carried position budget (a displacement of `P` moves its distance from the line by at
 * most itself; `A` is a stored input vertex, exact). `η_c` turns the line about `A`, moving the distance
 * at `P` by `L·η_c`. `L·ŝep` is the computed separation with each component off by a relative `2u` (the
 * subtraction and the quotient — the length `L`'s own error cancels between the quotient and the
 * product), `2u·L` as a vector, and the cross product of two unit vectors rounds by `k·u = 2u`: `4u·L`.
 * The wall's LENGTH error ({@link BASIS_LENGTH_ERROR}) scales the offset by a relative `3u` and the final
 * product rounds once: `4u·|s|`. A PRIMARY bisector's source IS its clockwise parent's source, `s = 0`
 * exactly and not computed: its budget is `0` (the caller does not reach this).
 */
export function sourceOffsetUncertainty(
    sourceUncertainty: number,
    separation: number,
    sourceOffset: number,
    wallDirectionError: number,
): number {
    return sourceUncertainty + separation * (wallDirectionError + 4 * UNIT_ROUNDOFF)
        + 4 * UNIT_ROUNDOFF * Math.abs(sourceOffset);
}

/**
 * THE MERGE NODE'S DISPLACEMENT, AS A POSITION BUDGET (journal-5 decision 170; the ratified Part B of
 * register C14's trace). A whole-event merge gathers meetings that lie within the perceptual floor of one
 * another and sites ONE node at their medoid — decision 157's release: below the floor the solver is not
 * obliged to tell the meetings apart. The release is not free downstream. Every bisector the merge emits
 * starts at that node, and a bisector's clock is read from its source's distance to its CLOCKWISE parent
 * (`sourceOffsetWithBudget`); if the node is not on the emitted bisector's own equi-time locus, that
 * reading and the widdershins parent's differ by the node's residual, and every later arrival of the
 * bisector carries the difference whole — for a corridor midline (anti-parallel parents, rate ≈ 0) it is
 * not even attenuated. The pricing budgets of the merged events do not see it: they answer for where each
 * EVENT was computed, not for where the node was PUT.
 *
 * The residual, for an emitted bisector with parents `cw`, `ws` at distances `d_cw`, `d_ws` of the node
 * from their lines and weights `w_cw`, `w_ws`:
 *
 *     E_merge  =  |d_cw·w_ws − d_ws·w_cw| / min(w_cw, w_ws)       ( = |d_cw − d_ws| at unit weights )
 *
 * which is `max(w_cw, w_ws)·|t_cw − t_ws|`: the two parents' clocks at the node, disagreeing, restated as
 * a length on the faster wall — never smaller than the clockwise reading's error `w_cw·|t_cw − t_ws|`.
 * Measured on `Off-edge Jitter Plus`, k = 9, seed 23757: the step-58 merge of 163×232 and 93×232, 9.47e-7
 * apart, sited the 75|4 bisector's source 1.7214e-10 off its locus, against a carried budget of 9.28e-12.
 */
export function mergeDisplacementUncertainty(
    clockwiseDistance: number,
    clockwiseWeight: number,
    widdershinsDistance: number,
    widdershinsWeight: number,
): number {
    return Math.abs(clockwiseDistance * widdershinsWeight - widdershinsDistance * clockwiseWeight)
        / Math.min(clockwiseWeight, widdershinsWeight);
}

/** One ray of a priced intersection, with the error terms part (i) and part (iii) of the model charge it. */
export interface RayErrorTerms {
    /** The computed travel along this ray to the meeting point. */
    along: number;
    /** The carried position budget of the ray's source node (0 for a stored input vertex). */
    sourceUncertainty: number;
    /** The direction error of the ray's basis ({@link WALL_DIRECTION_ERROR} or {@link bisectorDirectionError}). */
    directionError: number;
}

/**
 * The error budget of the travel `a` along ray 1 to its intersection with ray 2 as `intersectRays` prices
 * it — `a = D·dot(ŝep, rot b₂) / dot(rot b₂, b₁)`, `D = |sep|` — against the travel to the intersection
 * of the EXACT rays, with `s = |sin θ|` the evaluated sine and `t` the travel along ray 2:
 *
 *     E_a  =  ( e₁ + e₂  +  η₁·|a| + η₂·|t|  +  k·u·|a|  +  5u·D ) / s   +   (λ + 2u)·|a|
 *
 * DERIVED (the exact first-order propagation, `P₁ + a·b₁ = P₂ + t·b₂`, so `a = cross(P₂ − P₁, b₂) /
 * cross(b₁, b₂)`):
 *
 *   - SOURCES (part iii): a displacement `δ` of either source moves `a` by `cross(δ, b₂)/sin θ`, at most
 *     `|δ|/s` — hence `(e₁ + e₂)/s`;
 *   - BASES (part i): turning `b₂` by `η₂` about `P₂` moves line 2, at the meeting point, by `η₂·|t|`
 *     across itself, and `a` by `η₂·|t|/s` (exactly `−η₂·t/sin θ`); turning `b₁` by `η₁` moves `a` by
 *     `η₁·|a|·|cos θ|/s ≤ η₁·|a|/s`. By the law of sines `|a|, |t| ≤ D/s`, so this is at most
 *     `(η₁ + η₂)·D/sin²θ` — the `|sep|·(2u + 2u)/sin θ` of the dispatch, per unit of travel;
 *   - THE DIVISION (part iv): the denominator is a dot product of unit vectors, off by `k·u` absolutely,
 *     so relatively by `k·u/s`: `k·u·|a|/s` (C8 dispatch 2's term, `≤ k·u·D/sin²θ`, restated on `|a|`);
 *   - THE NUMERATOR: `D·ŝep` is the computed separation with each component off by a relative `3u` (the
 *     subtraction, the quotient by `D`, the product by `D` — the length `D`'s own error cancels between
 *     the two), `3u·D` as a vector; the dot product with a unit vector rounds by `k·u = 2u` of `D`: `5u·D/s`
 *     (ray 2's LENGTH error scales numerator and denominator alike, and cancels);
 *   - THE SCALARS: ray 1's LENGTH error `λ` ({@link BASIS_LENGTH_ERROR}) scales the denominator, and so
 *     the travel, by a relative `λ`; the product and the quotient round once each: `(λ + 2u)·|a|`.
 */
export function rayIntersectionAlongUncertainty(
    first: RayErrorTerms,
    second: RayErrorTerms,
    separation: number,
    sine: number,
): number {
    const travel = Math.abs(first.along);
    return (first.sourceUncertainty + second.sourceUncertainty
            + first.directionError * travel + second.directionError * Math.abs(second.along)
            + CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF * travel
            + 5 * UNIT_ROUNDOFF * separation) / Math.abs(sine)
        + (BASIS_LENGTH_ERROR + 2 * UNIT_ROUNDOFF) * travel;
}

/**
 * The error budget of an ARRIVAL DISTANCE `d = s + a·r` (`makeOffsetDistance`): the source offset `s`
 * plus the travel `a` times the offset rate `r` — or `d = s` where the rate is substituted by zero (S20):
 *
 *     E_d  =  E_s  +  |r|·E_a  +  |a|·(E_r + [substituted]·|r|)  +  u·(|a·r| + |d|)
 *
 * First order in the three inputs' budgets (`E_s`, `E_a`, `E_r`), each argued at its own function; the
 * product and the sum round once each. A SUBSTITUTED rate discards `a·r` outright, so the discarded
 * reading `|a·r|` is charged on top of the rate's forward error: the exact rate can be as large as
 * `|r| + E_r`.
 */
export function arrivalUncertainty(
    sourceOffsetBudget: number,
    rate: number,
    rateError: number,
    along: number,
    alongBudget: number,
    distance: number,
    rateSubstituted: boolean,
): number {
    const travel = Math.abs(along);
    const rateMagnitude = Math.abs(rate);
    return sourceOffsetBudget
        + rateMagnitude * alongBudget
        + travel * (rateError + (rateSubstituted ? rateMagnitude : 0))
        + UNIT_ROUNDOFF * (travel * rateMagnitude + Math.abs(distance));
}

/**
 * The error budget of a POINT placed along a ray, `X = P + a·b̂` (`findPositionAlongRay`) — the budget
 * an event hands the node it creates:
 *
 *     E_X  =  e_P  +  E_a  +  |a|·(η_b + λ)  +  2u·(|a| + ‖X‖₁)
 *
 * the source's carried budget, the travel's, the basis's turn and LENGTH error ({@link BASIS_LENGTH_ERROR})
 * swept over the travel, and the scaling and the addition rounding each component once (`u·|a|` and
 * `u·|X|` per axis, bounded in the 1-norm).
 */
export function pointAlongRayUncertainty(
    sourceUncertainty: number,
    along: number,
    alongBudget: number,
    directionError: number,
    position: Vector2,
): number {
    const travel = Math.abs(along);
    return sourceUncertainty + alongBudget + travel * (directionError + BASIS_LENGTH_ERROR)
        + 2 * UNIT_ROUNDOFF * (travel + Math.abs(position.x) + Math.abs(position.y));
}

/**
 * The FORWARD error bound of a weighted rate sum `rateA·weightB + rateB·weightA` — the divisor of the
 * head-on meeting and of both split paths — against the sum of the EXACT rates: each rate's forward
 * error ({@link offsetRateForwardError}) scaled by its weight, plus the two products and the sum rounding
 * once each (`2u` per term, as in {@link weightedRateSumRoundingBound}, whose `k·u` backward charge the
 * forward errors replace). A BUDGET, not the division guard: the guard stays the backward bound (T19).
 */
export function weightedRateSumForwardBound(
    termA: number,
    termB: number,
    weightA: number,
    weightB: number,
    rateErrorA: number,
    rateErrorB: number,
): number {
    return weightB * rateErrorA + weightA * rateErrorB
        + 2 * UNIT_ROUNDOFF * (Math.abs(termA) + Math.abs(termB));
}

/**
 * "Are these two positions ONE POINT?" once a node exists — the ARITHMETIC same-point bar of S1
 * (`findOrAddNode`), S2 (`coincidentEventPositions`), S4 (graph-merge's crossing-point dedupe) and S5
 * (the offset projection's zero-length segments). HELD AT ITS HISTORICAL VALUE, THE COMPONENT BOX AT
 * `1e-8`, AS A MEASURED STOP (C8 spec T8 and O1; journal decision 154's ruling rule; register C12).
 *
 * O1's settling histogram (dispatch 1, 2026-09-24) found joins ABOVE 64 ulps — 43 of them at 5e5 to
 * 5.2e7 ulps of the unit extent (7e-10 to 1.16e-8), on Circle 48 and Rosette5 40 at fine translations,
 * one off-edge jitter cell and eight cells of the jittered Circle 32 ladder — that do NOT correlate with
 * the pricing's conditioning. F74 traced them: 41 of 44 are this box absorbing a genuinely later or
 * earlier event (1e-10 to 4e-7 away in time), which decision 141 would admit as a distinct node.
 *
 * Its acceptance DISCARDS a produced answer (two nodes become one), so under T2 it is an arithmetic
 * bar and never δ (F27, audit C1).
 *
 * THE WINDOW'S COUNTERPART (journal decisions 162(b), 167): the other half of ONE matched pair with
 * {@link HELD_SIMULTANEITY_WINDOW}. Register C12 measured both at the arithmetic bar and the move STOPPED;
 * see "THE WINDOW AND THE BOX" above `HELD_SIMULTANEITY_WINDOW`. Exact, the four sites read: S1 and S4
 * coordinate equality; S2 coordinate equality OR one instigator (a group of re-reports of ONE split is
 * one node by acceptance — read as equality alone, it moved seven clean digests by at most 1.93 ulps);
 * S5 could not be exact (the two ends of a zero-length offset segment are computed apart and differ by
 * ulps, and an exact S5 keeps a repeated vertex).
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
