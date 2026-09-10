import {IntersectionType} from "./types";

export const FLOATING_POINT_EPSILON = 0.00000001;

/*
 * ----------------------------------------------------------------------------
 * THE ANGULAR BARS — ONE BASIS, WRITTEN AS A SINE, DERIVED FROM THE EPSILON
 * ----------------------------------------------------------------------------
 *
 * Journal decision 105: "a single value must never receive different verdicts depending on which
 * code path reached the predicate". Angle was where the solver broke that rule worst, and the
 * mechanism was that NOTHING SAID WHICH SPACE A BAR LIVED IN. The same `FLOATING_POINT_EPSILON`
 * meant ≈1e-8 rad applied component-wise to two unit vectors and 1.41e-4 rad applied to their dot
 * product — one number, two meanings, four orders apart — and a third site carried a bare `1e-4`
 * with no comment anywhere in the record.
 *
 * Both bars below are stated in ONE space, the SINE of the angle, and both are tested in the
 * division-free relative form the ruling names:
 *
 *     |cross(a, b)|  <  bar · |a| · |b|
 *
 * rather than by normalising the operands and comparing them. That matters for more than tidiness.
 * Normalising divides by a length, and a division by a quantity tending to zero amplifies float
 * noise without bound: a genuinely head-on pair whose sources were 3.9e-8 apart came out with a
 * lateral component of 6.2e-9 — numerically zero — yet a unit direction 0.15 away from the basis,
 * and was misread as parallel (`intersection-edges.ts`). The polynomial form asks the same question
 * of the raw operands and never divides, so one bar means one angle at every magnitude, and the
 * predicate no longer depends on whether the caller happened to normalise first.
 *
 * NEITHER IS A NEW NUMBER. Both are derived from {@link FLOATING_POINT_EPSILON}, and the derivation
 * is written here rather than left to be inferred from an effective value someone measured later.
 */

/**
 * "The arithmetic cannot tell these two directions apart."
 *
 * The epsilon itself, read as a sine — one radian of angle is one unit of sine at this scale, so
 * `1e-8` here is `1e-8` radians and says so. This is the bar for questions of IDENTITY: does this
 * point lie on that ray, does this bisector run along that basis. It replaces
 * `vectorsAreEqual(unitA, unitB)`, whose component-wise box was the same bar to within a factor of
 * √2 but was anisotropic — a pair separated along the diagonal was judged more leniently than the
 * same separation along an axis — and which required its operands to be normalised first.
 */
export const DIRECTION_SINE_BAR = FLOATING_POINT_EPSILON;

/**
 * "These two directions are parallel enough that solving for their intersection is meaningless."
 *
 * THE EXACT SINE-SPACE RESTATEMENT OF `areEqual(|dot(a, b)|, 1)`, not an approximation of it and not
 * a value anyone picked. For unit `a`, `b`:
 *
 *     1 − |cos θ| < ε   ⟺   cos²θ > (1 − ε)²   ⟺   sin²θ < 1 − (1 − ε)²   =   ε(2 − ε)
 *
 * so the dot-space test at `ε` IS the sine-space test at `sqrt(ε(2 − ε))` — **1.4142e-4**. The four
 * orders between this and {@link DIRECTION_SINE_BAR} were never a choice; they were the epsilon
 * being read in a space where its own square root is the bar, in three places, with the comments at
 * all three calling it "the standing tolerance".
 *
 * IT IS A CONDITIONING GATE, NOT AN IDENTITY CLAIM, and that is why it stands beside the identity
 * bar rather than being collapsed into it. What it guards is a DIVISION: `intersectRays` divides by
 * the sine to place the meeting point, so a pair at 1e-6 radians is priced at 1e6 times its own
 * separation — a distance the solve cannot use whatever it means geometrically.
 *
 * TWO BARS IS THE MEASURED OUTCOME, NOT THE UNEXAMINED ONE. Journal decision 105 asks for ONE
 * predicate basis, and the collapse was attempted in BOTH directions and refused by the corpus in
 * both. Setting this to {@link DIRECTION_SINE_BAR}: the clean roster stays bit-identical, but 13
 * tests across 4 suites fail — every pinned large-coordinate signature moves (Circle 48 at 1e10,
 * Rosette5 40 at 1e11, the 29-cell scatter, the 48-way half-merge mechanism), the off-edge jitter
 * class moves, and the recursion census gate fires on unattributed movement. Setting
 * {@link DIRECTION_SINE_BAR} to this instead: the clean roster again stays bit-identical, but the
 * `seed 55433, k=4` fixture STOPS SOLVING — `complete` goes true → false with a step failure — and
 * four defect fixtures move.
 *
 * So the four orders between the two bars are load-bearing, and what the ruling actually buys here
 * is that the two are now DECLARED, in one space, with one derivation each, instead of being the
 * same constant read in two spaces by accident of which spelling a site reached for. TODO: the
 * disagreement is real and stands — a value at 1e-6 radians is "the same direction" to the gate and
 * "a different direction" to the identity bar. Closing it needs the large-coordinate class ruled
 * first, because that class is what both collapses break.
 */
export const PARALLEL_GATE_SINE_BAR = Math.sqrt(
    FLOATING_POINT_EPSILON * (2 - FLOATING_POINT_EPSILON));

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
 * IT REUSES AN EXISTING BAR RATHER THAN MINTING ONE. {@link PARALLEL_GATE_SINE_BAR} is already the
 * one answer to "is this turn too small to price?", and a weight change at a turn the solver refuses
 * to price an intersection at is the same question. Above the bar the kernel is well conditioned by
 * the bar's own derivation: `|v| ≤ |w₁ − w₂| / 1.41e-4`, at most `7.1e3 · |w₁ − w₂|`.
 *
 * UNIT WEIGHTS NEVER REACH IT: the guard requires `w₁ ≠ w₂` before it looks at the turn at all.
 */
export const MIN_WEIGHT_TURN_SINE = PARALLEL_GATE_SINE_BAR;

export const NO_COLLISION_RESULTS: IntersectionType[] = ['diverging', 'parallel', 'identical-source']

export const TRIANGLE_INTERSECT_PAIRINGS = [[0,1],[1,2],[2,0],[1,0],[2,1],[0,2]]