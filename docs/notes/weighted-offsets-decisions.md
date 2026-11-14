---
title: "Weighted offsets: decision spec"
type: decision-spec
area: straight-skeleton
status: completed
date: 2026-09-10
verified_by: [packages/core/tests/straight-skeleton/weighted-offsets.test.ts, packages/core/tests/straight-skeleton/full-graph-digest.test.ts]
---

# Weighted offsets: decision spec

Drafted by a delegate under journal decision 112(g) of
[the session-4 journal](./recursive-subdivision-arc-journal-4.md), from a site roster verified by
opening every file in `packages/core/src/straight-skeleton` (appendix, §7). Ratification is the
lead's; **no production code changes until it is ratified** (112(g)). Every clause of decision 112 is
cited where it is honoured: (a) input surface W1–W4; (b) time semantics W5–W8; (c) division-free
predicates W22–W27; (d) unit-weight bit-identity W12, W36, W51, §5, amended by arc decision 115 to
name W21 as its one exception; (e) positive bounded weights and
the maximum-ratio constant W2–W3, W48–W49; (f) degenerate machinery fixtured first W29–W37, §4; (g)
this document.

## 1. Intent

A weight is a per-exterior-edge, strictly positive speed. Today every wavefront edge advances at
unit speed, and the solver calls the arrival time of a wavefront an *offset* because the two are the
same number. Under weights they are not: the wavefront of edge `i` is at perpendicular distance
`w_i · t` from its supporting line at time `t`, so every quantity the solver today computes as a
perpendicular distance is a time once divided by the weight of the edge it was measured against.
The extension is a systematic substitution along that one seam — offset becomes time, the equidistant
locus becomes the equi-time locus, and the "offset rate" of decision 70 becomes the reciprocal of the
vertex speed — with every comparison written by cross-multiplication so that no divided quantity is
ever compared against another divided quantity. The one place the geometry itself changes is the
degenerate machinery, which today encodes speed symmetry: parallel same-facing walls that never meet
at unit speed do meet at unequal speeds, and the corridor midline becomes a line at fraction
`w₁ / (w₁ + w₂)` of the corridor's width. Weights also change what the boundary stage may remove:
decision 55's rule — a vertex collinear with the chord between its neighbours contributes nothing —
becomes "collinear AND equal-weighted contributes nothing" (arc decision 120, narrowed by 124(c)): a
weight change is admitted only at a visible corner, and a corner that passed that door is never
merged by a sub-floor chord deviation. **Model invariant (arc decision 124, the user):** the base of
the roof lies in a single plane, no roof-perimeter vertex lies outside it, and anything that must
violate this — dormers included — is a separate feature stitched into the roof solution the skeleton
produces, never a convention inside the solver. Unit weights must reproduce the current 59-fixture
corpus bit for bit, and this document's first finding is that the instrument for that bar does not
yet exist in the suite.

## 2. Type and surface roster

One line each; `+` added, `~` changed, `=` unchanged but named because a reader will look for it.

| | Surface | File |
|---|---|---|
| + | `interface WeightOptions { weights?: readonly number[] }` — one entry per input vertex, `weights[i]` is the speed of edge `i` (vertex `i` to `i+1`); default all ones | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) beside `SolveSkeletonOptions` (line 886) |
| ~ | `SolveSkeletonOptions extends PerceptualFloorOptions, WeightOptions` | same file, line 886 |
| ~ | `runAlgorithmV5(nodes, options?: PerceptualFloorOptions & WeightOptions)`, same for `runAlgorithmV5Stepped` | same file, lines 844, 1065 |
| + | `const MAX_WEIGHT_RATIO: number` (a refusal, W48) and `const MIN_WEIGHT_TURN_SINE: number` (a refusal, W49, arc decision 124(b)) | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) |
| + | `StraightSkeletonGraph.exteriorWeights: number[]` — normalised per W4, indexed by exterior edge id, length `numExteriorNodes`, plain data so it survives `structuredClone` | [types.ts](../../packages/core/src/straight-skeleton/types.ts) line 49 |
| + | `GraphHelpers.weightOf(exteriorEdgeId): number` | types.ts line 61; implemented in [solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts) |
| ~ | `makeStraightSkeletonSolverContext(nodes, perceptualFloor = SKELETON_NOISE_FLOOR, weights?: readonly number[])` — third optional argument, default all ones | solver-context.ts line 32 |
| + | `interface Arrival { distance: number; weight: number }` — a time as the pair it was derived from: `distance` is the perpendicular distance from the clockwise parent's supporting line, `weight` that parent's weight; `time = distance / weight` | types.ts |
| ~ | `CollisionEvent.offsetDistance` is a TIME; `+ CollisionEvent.arrival: Arrival` carries the pair every predicate reads | types.ts line 145 |
| ~ | `InteriorEdge.maxOffset` is a TIME | types.ts line 38 |
| ~ | `SplitOffsetResult.offsetDistance` is a TIME; `+ arrival: Arrival` | types.ts line 139 |
| + | `arrivalOf(edge, context, ray, alongRay): Arrival`; `compareArrivals(a, b, epsilon): -1\|0\|1`; `arrivalsAreEqual(a, b, epsilon)`; `arrivalsAreSimultaneous(a, b)`; `laterArrival(a, b)`; `timeOf(a)` | [collision-helpers.ts](../../packages/core/src/straight-skeleton/collision-helpers.ts) |
| = | `makeOffsetDistance`, `sourceOffsetDistance` keep computing the DISTANCE against the clockwise parent, bit for bit (W6) | collision-helpers.ts lines 45, 75 |
| ~ | `makeBisectedBasis(iBasis, jBasis)` gains a sibling `makeWeightedBisectedBasis(c, bWs, wCw, wWs)` (W12) | [core-functions.ts](../../packages/core/src/straight-skeleton/core-functions.ts) line 73 |
| ~ | `addBisectionEdge` reads the two parents' weights and calls the weighted basis (W12–W14) | [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) line 130 |
| ~ | `solveTerminalPoint` rows become `[n.x, n.y, -w]` (W28) | algorithm-termination-cases.ts line 561 |
| ~ | `computeNodeOffsets(result)` returns TIMES (W38); `computeOffsetRings(result, time)`, `computeMaxOffset(result)` take and return time | [offset-projection.ts](../../packages/core/src/straight-skeleton/offset-projection.ts) lines 319, 505, 850 |
| ~ | `StripOptions.depth` is a TIME (W40) | [strip-decomposition.ts](../../packages/core/src/straight-skeleton/strip-decomposition.ts) line 158 |
| ~ | `FaceEdge` gains `weight: number`; `marchDirection`, `nextActive` and the march loop take weights (W41) | [parcel-slicing.ts](../../packages/core/src/straight-skeleton/parcel-slicing.ts) lines 224, 484, 504, 581 |
| ~ | `SkeletonSolveResult` gains `weights: number[]` — the normalised, boundary-stage-remapped weights the solve ran on | types.ts line 223 |
| ~ | `SkeletonDiagnosticKind` unchanged; refusals THROW (W3) | types.ts line 211 |
| ~ | `computeNodeOffsetDistances(context)` returns TIMES | [debug-helpers.ts](../../packages/core/src/straight-skeleton/debug-helpers.ts) line 54 |
| + | `tests/straight-skeleton/full-graph-digest.test.ts` — the 112(d) instrument (W51) | packages/core/tests |
| ~ | `canonicalisePolygon` is called with `pinnedIndices` containing every vertex whose incident weights differ (W44, arc decision 120 narrowed by 124(c)) | canonicalisation.ts line 231 |
| + | `assertWeightsChangeOnlyAtVisibleCorners(vertices, weights)` — the turn-guard refusal, run before canonicalisation (W49, arc decision 124(b)) | algorithm-termination-cases.ts beside `assertVerticesAreFinite` |
| + | `test-fixtures/src/weighted-fixtures.ts` — `WEIGHTED_TEST_POLYGONS: {name, vertices, weights, expected}` (§4) | packages/test-fixtures/src |

## 3. Decisions

### Input surface

**W1 — A weight array is parallel to the input vertices and names edge speeds** (112(a)). `weights[i]`
is the speed of the edge from input vertex `i` to input vertex `(i + 1) % n`, which is exterior edge
`i` in [graph-helpers.ts](../../packages/core/src/straight-skeleton/graph-helpers.ts) line 49–56.
`weights` absent, or of length zero, means all ones. A `weights` array whose length differs from the
vertex count is rejected by a thrown `Error` naming both lengths.

**W2 — Every weight is a finite, strictly positive double**, checked at the door beside
`assertVerticesAreFinite` (algorithm-termination-cases.ts line 837). Zero, negative, `NaN` and
infinite weights throw, naming the index. Gables are a post-process and never a solver input
(112(e)).

**W3 — The weight ratio is checked at the door and refused by a throw.** `max(weights) / min(weights)`
above `MAX_WEIGHT_RATIO` (W44) throws an `Error` naming the two extreme indices and the constant.
Refusal is a throw, not a diagnostic, for the same reason a non-finite vertex is: it is input the
solver cannot solve, not a solve that came back degraded.

**W4 — Weights are normalised so that the minimum weight is exactly `1`**, by dividing every weight by
the minimum, once, immediately after W2–W3 and before anything else reads them. Rationale: the
skeleton is invariant under a common scaling of all weights (all times scale by the reciprocal), so
one convention fixes the time unit; with the minimum at `1` every time is at most the distance it was
derived from (`t = d / w ≤ d`), so every ABSOLUTE tolerance on a time (`FLOATING_POINT_EPSILON` in the
layer window and the phantom test) is at least as wide in distance terms as it is today and at most
`MAX_WEIGHT_RATIO` times wider (W44 derives the constant from exactly this). All-ones divides by
`1.0`, which is exact, so the unit-weight path is untouched bit for bit. The normalised array is what
`SkeletonSolveResult.weights` reports.

### Time semantics

**W5 — Offset means time** (112(b)). Every field and return value today called an offset —
`CollisionEvent.offsetDistance`, `InteriorEdge.maxOffset`, `SplitOffsetResult.offsetDistance`,
`TerminalSolution.offset`, the map `computeNodeOffsets` returns, the argument of
`computeOffsetRings`, `StripOptions.depth` — is the wavefront clock. At unit weights time and distance
are the same doubles.

**W6 — `makeOffsetDistance` and `sourceOffsetDistance` are NOT changed.** They compute the
perpendicular distance from the bisector's clockwise parent's supporting line (collision-helpers.ts
lines 45–58 and 75–85: `sourceOffset + alongRay · cross(basis, clockwiseParent.basis)`), and that
distance is exactly what a time needs beside a weight. Leaving their arithmetic alone is what makes
every unit-weight number downstream bit-identical.

**W7 — A time is carried as the pair it came from.** `Arrival { distance, weight }` is
`makeOffsetDistance(...)` paired with `context.weightOf(clockwiseParent.id)`. `timeOf(a) = a.distance
/ a.weight` exists for reporting, sorting keys and denormalisation only. Every tolerance decision reads
the pair (W22).

**W8 — Linear causality is restated over time unchanged** (112(b), decision 102): the pairing winner is
the earlier ARRIVAL, decided by `compareArrivals`; the lexicographic tie-break keeps its scope of one
simultaneity moment (W25).

### The kernel

**W9 — The vertex velocity is the solution of `v · n₁ = w₁`, `v · n₂ = w₂`** (112(e)), with
`n = rotateCw90(basis)` the inward unit normal — the convention `solveTerminalPoint` already states
(algorithm-termination-cases.ts line 542–548) — `n₁` the clockwise parent's normal with `w₁` its
weight, `n₂` the widdershins parent's with `w₂`. Closed form, with `c` the clockwise parent basis and
`b` the widdershins parent basis:

```
det = n₁ × n₂ = c × b                       (rotation preserves the cross product)
v   = (w₂ · c − w₁ · b) / det
|v|² = (w₁² + w₂² − 2 w₁ w₂ (n₁ · n₂)) / det²
```

Verified numerically (scratchpad `kernel-check.mjs`, `kernel-check-2.mjs`): residuals `v·nᵢ − wᵢ`
at or below `4.4e-16` on ten configurations at four weight pairs; `|v|` agrees with the closed form
to printed precision.

**W10 — The determinant is `c × b`, the sine of the turn at the vertex, and its two zeros are today's
two degenerate cases.** `det → 0` with `c · b > 0` is a straight vertex: the system is consistent only
when `w₁ = w₂` (then `v = w · n`, the inward perpendicular, which is `makeBisectedBasis`'s existing
fallback at core-functions.ts line 76–78); with `w₁ ≠ w₂` it is inconsistent — the two offset lines
are parallel at different distances for every `t > 0`, the wavefront has a step of height
`|w₁ − w₂| · t`, and no single vertex velocity exists. ~~AMENDED 2026-09-10 (arc decision 121): that
vertex is not refused; it is classified straight by W49's classifier and resolved by the riser
convention of W53, which replaces it with two ordinary kernel vertices.~~ **RESTORED 2026-09-10 (arc
decision 124(b))**: the inconsistent straight case is refused at the door by W49 and is never reached
in the solver; `addBisectionEdge` never sees a weight change at a vertex whose `|c × b|` is below
`PARALLEL_GATE_SINE_BAR`. `det → 0`
with `c · b < 0` is an anti-parallel pair: inconsistent for all positive weights; it is the corridor
end, where today `addBisectionEdge` takes direction `c` at zero rate (algorithm-helpers.ts lines
105–118), and W17 keeps that.

**W11 — The arrival-time rate along the trace is `1 / |v|` against BOTH parents.** For the unit
direction `d = v / |v|`: `(d · n₁) / w₁ = (d · n₂) / w₂ = 1 / |v|`. This is the equi-time property
and it is what replaces "equidistant". Measured: the two clocks agree to `1e-12` relative on 199 986
of 200 000 random vertices, the remainder being near-straight vertices where both cross products are
of order `1e-4` and the disagreement is rounding. At unit weights `1 / |v| = cross(d, c)`, which is
today's `bisectorOffsetRate` (algorithm-helpers.ts line 84–86) — confirmed equal to printed
precision on every named configuration.

### Bisector construction

**W12 — The weighted bisected basis is `normalize(w_ws · c − w_cw · b)` with today's zero-length
fallback**, as `makeWeightedBisectedBasis(c, bWs, wCw, wWs)` beside `makeBisectedBasis`
(core-functions.ts line 73). The numerator is the kernel's numerator (W9), so the direction is the
kernel's. **At unit weights it is bit-identical to today by construction**: `1.0 · c` is `c`,
`1.0 · b` is `b`, and `c − b` is `c + (−b)` in IEEE-754, which is the `addVectors(c, negate(b))` that
`addBisectionEdge` computes at lines 171–174. Measured: 0 mismatching vertices in 200 000 random turns
in `(−(π − 1e-4), π − 1e-4)` and 0 ulps on the five named configurations. The Cramer spelling —
divide by `det`, then normalise — is 0–3 ulps off today's bits (31 % bit-identical, max 3 ulps over
100 000) and is NOT used; the naive unit closed form `normalize(rotateCw90(c + b))` is catastrophic
near a straight vertex (`4.2e11` ulps at a turn of `1e-6`) and is NOT used.

**W13 — The direction sign rule of decision 70 survives verbatim.** The rate of `normalize(w_ws · c −
w_cw · b)` against the clockwise parent is `w_cw · (c × b) / |numerator|`, whose sign for positive
weights is the sign of `c × b` — the same sign `addBisectionEdge` tests at line 186 through
`bisectorOffsetRate`. The kernel direction has rate `w₁ / |v| > 0` against the clockwise parent
always, so "a bisector's rate is non-negative" is a theorem under weights, not a convention, and the
reflex/convex decision is unchanged in form: convex `det > 0` keeps the numerator, reflex `det < 0`
negates it.

**W14 — The zero-rate branch keeps parent ordering as its rule** (algorithm-helpers.ts lines 183–188):
where `sineIsBelow(bisected, c)` the parents are anti-parallel, the direction is `c`, and the
bisector carries constant time — its source node's time. Under unequal weights the corridor between
anti-facing walls at speeds `w₁, w₂` closes all at once at `t* = width / (w₁ + w₂)` along the line at
distance `w₁ · t*` from wall 1; the node the bisector is born at already lies on that line because the
event that placed it was computed by the weighted machinery. Nothing new is computed here.

**W15 — `ensureBisectionIsInterior` and `computePrimaryInteriorEdges` are unchanged** (algorithm-
helpers.ts line 60, debug-helpers.ts line 79). The first is reached only on the zero-rate branch,
where the direction is `c` regardless of weights. The second is a dashboard overlay of the UNWEIGHTED
primary bisectors. **RULED 2026-09-10 (arc decision 114(ii))**: `computePrimaryInteriorEdges` GAINS
the `weights` parameter and calls `makeWeightedBisectedBasis`; an unweighted overlay drawn over a
weighted solve is a wrong picture, so the "stays unweighted with its name saying so" option is
rejected (§7, dashboard rows).

**W16 — `createBisectionInteriorEdge`'s `maxOffset` is a time** (algorithm-helpers.ts lines 226–227):
`updateMaxOffset(edgeIndex, timeOf(arrivalOf(...)))`. `updateMaxOffset` keeps its `Math.min`
(solver-context.ts line 285); the `outOfBounds` test at collision-helpers.ts line 259 compares
`event.arrival` against the stored time by `compareArrivals` on `{distance: maxOffset · w, weight: w}`
with `w` the edge's clockwise-parent weight — at unit weights `maxOffset · 1` is exact.

**W17 — `initInteriorEdges` passes each vertex's two weights** (algorithm-helpers.ts lines 241–250):
clockwise parent `i`, widdershins parent `(i − 1 + n) % n`, weights `exteriorWeights[i]` and
`exteriorWeights[(i − 1 + n) % n]`.

### Collision arrival

**W18 — `collideInteriorEdges` builds two `Arrival`s and reports the later one** (collision-helpers.ts
lines 192–193, 225). `arrivalOffsetOfPair`'s `Math.max` becomes `laterArrival(a, b)`: the pair whose
`distance · other.weight` is larger; at unit weights that is `Math.max` on the two distances, and the
stored `offsetDistance = timeOf(later)` is `distance / 1.0`, exact.

**W19 — `meetHeadOn` splits the separation by weighted rates** (collision-helpers.ts lines 101–122).
With `rA = cross(ray1.basis, cwA.basis)`, `rB` likewise, `sA`, `sB` the two source distances and
`wA`, `wB` the two clockwise-parent weights:

```
alongA = (sB·wA − sA·wB + separation·rB·wA) / (rA·wB + rB·wA)
```

and the cancellation test is `|rA·wB + rB·wA| < FLOATING_POINT_EPSILON · wA · wB`. At unit weights every
product is by `1.0` and the expression is today's `(sB − sA + separation·rB) / (rA + rB)` in the same
operation order; measured 0 mismatches in 100 000 random operands.

**W20 — The direct strike is weighted the same way** (generate-split-event.ts lines 127–136):

```
s      = L · negT · w_cw / (crossCw · w_t + negT · w_cw)
arrival = {distance: s · crossCw, weight: w_cw}
```

with `w_t` the split edge's weight. At unit weights this is today's `L · negT / (crossCw + negT)` in
the same order — 0 mismatches in 100 000. The zero test on the divisor scales as in W19. The formula
keeps today's primary-only assumption (the instigator's source is on its parent line); that is not
new.

**W21 — The incenter fallback is replaced by the same linear form with a source term, and this is a
non-bit-identical site** (generate-split-event.ts lines 25–109). Today it constructs a temporary node
on the more perpendicular parent, bisects with `makeBisectedBasis` (line 90) and intersects rays. The
weighted event is the point on the instigator ray where the instigator's time equals the split edge's
time: with `D₀` the instigator's source distance from its clockwise parent line, `E₀` its source
distance from the split edge's line, `r = cross(d, c)` and `q = −cross(d, e)`:
`s = (E₀ · w_cw − D₀ · w_e) / (r · w_e + q · w_cw)`, `arrival = {D₀ + s·r, w_cw}`. That closed form
reaches the same point as today's construction by different arithmetic, so its unit-weight bits are
NOT today's bits by construction. **RULED 2026-09-10 (arc decision 115)**: the linear equi-time form
REPLACES the incenter construction outright; there is no two-path branch, because W36 forbids one on
decision-105 grounds. The resulting digest movement is measured and attributed pin by pin. Movement is
bounded by ulps by construction — the two constructions reach the same point — so any pin that moves
by more than ulps is a defect in the linear form, not an attribution. Decision 112(d) is amended
accordingly: bit-identity is the bar at every site where today's operations can be performed in
today's order, and this is the one named exception.

### Predicates

**W22 — Weights enter every tolerance decision division-free by cross-multiplication** (112(c),
decision 105; the ratio bound that keeps the scaled epsilons inside the measured bands is W48). `compareArrivals(a, b, ε) = fp_compare(a.distance · b.weight, b.distance · a.weight,
ε · a.weight · b.weight)`; `arrivalsAreEqual` is the zero case. This is the exact restatement of
`|a.distance/a.weight − b.distance/b.weight| < ε` and at unit weights it is `fp_compare(a.distance,
b.distance, ε)` with every operand multiplied by `1.0` — measured 0 verdict mismatches in 100 000
random near-equal pairs at `ε = 1e-8`.

**W23 — The phantom test is `!arrivalsAreEqual(arrivalA, arrivalB, FLOATING_POINT_EPSILON)`**
(collision-helpers.ts line 198), and `offsetDistance <= 0` becomes `arrivalA.distance <= 0` (the
weight is positive, so the sign is the distance's).

**W24 — The layer window is `compareArrivals(event.arrival, bestArrival, FLOATING_POINT_EPSILON) <= 0`**
(algorithm-complex-cases.ts line 189), with `bestArrival` the earliest by the same comparator; the
sort at line 183 orders by `compareArrivals(…, 0)`.

**W25 — Simultaneity keeps its 64-ulp bar, cross-multiplied** (algorithm-complex-cases.ts lines
107–110): `|d₁·w₂ − d₂·w₁| ≤ SIMULTANEOUS_ARRIVAL_ULPS · Number.EPSILON · max(|d₁·w₂|, |d₂·w₁|)`.
`inArrivalOrder` and `earliestArrivalMoment` sort by `compareArrivals(…, 0)`. At unit weights the
products are by `1.0` and the verdict is today's.

**W26 — Every absolute epsilon applied to a weight-scaled quantity is multiplied by the same weight
product that scaled the quantity.** This is the single rule behind W19, W20, W22, W28 and W33; it is
stated once so no site derives its own.

**W27 — `bestNonPhantomCollision` sorts by `compareArrivals(…, 0)`** (collision-helpers.ts line 34).

### Terminal cases

**W28 — `solveTerminalPoint` rows are `[n.x, n.y, −w]` and the solution's third unknown is time**
(algorithm-termination-cases.ts line 561). Each line contributes `n · P − w · t = n · A`. At unit
weights the row is `[n.x, n.y, −1]` — the same double — so position and time are bit-identical by
construction. The singularity test becomes `|det| < FLOATING_POINT_EPSILON · max(w₁, w₂, w₃)` (W26); at
unit weights that is today's `areEqual(det, 0)`.

**W29 — A triangle over two same-facing parallel parents is REGULAR under unequal weights.** With
`n₁ = n₃`, the determinant is `(w₃ − w₁) · (n₁ × n₂)`: singular today, non-singular when the two
parallel parents differ in weight, and the solve then returns the point where the faster wall
overtakes the slower — the event 112(f) names. No new branch: the existing singular fall-through
(line 564–567) simply stops being taken.

**W30 — The snap pre-pass compares times as arrivals** (algorithm-termination-cases.ts lines 106,
128–130, 145–146): `birthOffset` and `snapOffset` become arrivals from `arrivalOf`; the two rejection
tests are `compareArrivals(snap, birth, ε) < 0` and `!arrivalsAreEqual(candidate, snap, ε)`.
`nodeOffset` (line 63) returns an arrival.

### Degenerate closures

**W31 — `solveDegenerateClosure`'s simultaneity is equi-time** (algorithm-termination-cases.ts line
268): every collected arrival must satisfy `arrivalsAreEqual(arrival, arrivals[0], ε)`; the
not-before-birth test at lines 255–256 is `compareArrivals(arrival, birth, ε) >= 0`. The premise —
"all exterior parents parallel, so one offset governs the whole sub-polygon" — holds under weights
only for the ANTI-facing case; for same-facing parallel parents with unequal weights the wavefront has
a step that moves, and the closure's arrival check fails as it should, sending the step to the
collision path (W29).

**W32 — `solveParallelClosure`'s premise is false for same-facing parallel walls at unequal weights,
and the function is not the site that breaks** (algorithm-termination-cases.ts lines 326–359). The
premise "parallel rays pointing the same way never meet" is a statement about BISECTOR rays. Under
unit weights the two vertices of a riser between same-facing walls at `y = 0` and `y = h` trace
parallel rays (measured: both `v = (1, −1)` in the scratchpad's step configuration). Under weights
`w_low = 2`, `w_high = 1` they trace `v = (1, −2)` and `v = (1, −1)`: the riser's wavefront shrinks at
rate `|w_low − w_high| = 1` and collapses at `t = h / |w_low − w_high|`. Those rays are NOT parallel,
so `directionsAreSame` at line 343 returns false, the function returns `undefined`, and the pair
resolves on the ordinary collision path. What breaks is therefore the CALLER's assumption that
reaching this function with no collision means no event was possible; under weights that is true only
because the weighted collision path already found the event. The function's own gate — all parents
parallel, all bisectors same-direction — is kept as written, and the same-facing case with equal
weights (the slit the plus fixture leaves behind) still closes here.

**W33 — The `co-linear-from-1` leading-source closure gains an equi-time check** (algorithm-
termination-cases.ts lines 481–486). Today the trailing bisector is closed onto the leading source on
the raw separation alone. Under weights the trailer reaches that point at `arrival_T = arrivalOf(T,
…, distance to leading source)` and the leader was born there at `arrival_L`; the closure stands only
if `arrivalsAreEqual(arrival_T, arrival_L, ε)`, else the branch falls through to the throw at line
445. This check is NOT gated on weights (W36). It is reached twice on the corpus at native placement
(the plus seed) and on the large-coordinate cells; if it fails there at unit weights the digest moves,
and that movement is a finding to attribute, not a reason to gate. **NOT IMPLEMENTED 2026-09-10 (arc
decision 126).** The check was written and measured at unit weights over the whole corpus: the digest
does not move (all 59 native pins survive), but the branch is reached by near-anti-parallel corridors
whose two mid-lines carry constant, slightly different times, so the check FIRES there. With the
consequence stated above (fall through to the throw) ten pinned assertions across six suites move,
including a defect growing — the recursion census reports jitter-plus seed 7919 at 16 failed regions
where 15 is pinned. With the softest consequence (fall through to ordinary termination) four move,
including an UNATTRIBUTED CURE (rosette5-40 at 1e11, 2 → 1 unresolved) and the 48-way cluster at 2e10
shattering 11 → 12 nodes. Neither rewrite of the failure register is justified by anything measured,
because no §4 weighted fixture reaches the branch. Ruled: the closure stands on the raw separation as
today; the site carries a block comment recording the measurement; the check is re-opened only with
a weighted fixture that reaches the branch — a corridor whose walls carry different weights and whose
closure is reached through `co-linear-from-1` — which is §4.10, an OPEN roster entry.

**W34 — The head-on cross-wire is unchanged** (line 404–405): two bisectors on one line pointing at
each other are the two midlines of a corridor, both at constant time `t*`; under weights both nodes
lie on the equi-time line (W14) and the wiring is topological.

**W35 — `applyDegenerateClosure` is unchanged**: it terminates and culls, and reads no offset.

**W36 — There is NO branch on "all weights are one" anywhere in the solver.** Decision 105 forbids a
value receiving different verdicts by code path, and a gate on unit weights is such a path: the input
`(1, 1, …, 1 + 2⁻⁵²)` would be solved by different code from `(1, 1, …, 1)`. Bit-identity at unit
weights is achieved by writing every site so that its unit-weight evaluation performs today's
operations in today's order (W12, W19, W20, W22, W28), and the two sites where that is not achievable
are named and left to the lead (W21, §6 N3).

**W37 — I5's licence for two bisectors on one node pair gains a weight condition.** Today
(graph-index-invariants.test.ts lines 490–612) two bisectors may span one node pair only where their
parents are parallel, because parallel parents' equidistant locus is a single mid-line. Under weights:
anti-facing parallel parents still share one equi-time line (any weights); same-facing parallel
parents share a locus only when their weights are EQUAL (unequal weights give no common locus at all —
W10). The test's `parentsParallel` predicate becomes `parentsParallel && (antiFacing || weightsEqual)`,
and the legitimacy of each licensed pair is additionally checked by equi-time at both nodes: `d₁·w₂ =
d₂·w₁` to `EQUIDISTANCE_BAR · w₁ · w₂`.

### Coincidence and I5

**W38 — `coincident-events.ts` is unchanged.** `isOneEvent` (line 45) is a POSITION test at the
perceptual floor; `medoidPosition` (line 258) picks a member; `bisectionsForMerge` (line 442) emits
parents and a source only; `ringsOfSubPolygon` is topological. None of them reads a time or assumes a
midpoint. The layer they are fed is selected by W24–W25.

**W39 — Mirror-symmetry assumptions, enumerated, and their equi-time replacements.** (i) "A bisector's
source is equidistant from its two parents" (I3, graph-index-invariants.test.ts line 238–266):
becomes `|d_cw · w_ws − d_ws · w_cw| ≤ EQUIDISTANCE_BAR · w_cw · w_ws`. (ii) "The corridor midline lies
at half the width" (addBisectionEdge's comment, lines 105–111; I5's "mid-line"): becomes the line at
`w₁ / (w₁ + w₂)` of the width from wall 1 — never computed explicitly, it is where the weighted events
land. (iii) `meetHeadOn` "splits the separation in proportion to rate": already rate-aware, W19
weights the rates. (iv) The wavefront-causality oracle's "distance to the supporting line of one
parent" (wavefront-causality.test.ts lines 61–80): becomes that distance divided by that parent's
weight — a time, and the same time from either parent. (v) `computeNodeOffsets`' re-derivation
(offset-projection.ts lines 343–370): the same division (W40). No medoid, centroid or equidistant
point elsewhere in the solver assumes symmetry — the medoid is a member of the arrival set and the
arrival set is weighted upstream.

### Offset projection and downstream consumers

**W40 — `computeNodeOffsets` returns times**: `distanceToSupportingLine(node, parent) /
exteriorWeights[parent]` (offset-projection.ts line 359–366), reading the clockwise parent of the
first incident bisector exactly as today. Dividing by `1.0` is exact. `SIMULTANEITY_RELATIVE_TOLERANCE`
(line 290) is relative and needs no change. `bisectorPositionAtOffset` (lines 569–575) converts a local
TIME to travel: `projectFromPerpendicular(basis, cwParent.basis, localTime · weightOf(cwParent))` —
at unit weights `localTime · 1.0` is exact. Lifetimes `[birth, death)` (line 547) compare times read
from the one table, bit-exact as today.

**W41 — `computeStrips`' `depth` is a time; the clip is unchanged in form** (strip-decomposition.ts
lines 563–564, 596–597, 927–941): node "offsets" are times from W40, `current.offset <= depth` is a
time comparison, and the crossing interpolation is linear in time because a wavefront vertex moves
linearly along its bisector. The strip's physical setback on edge `e` is `w_e · depth` — that is the
point of weights, and the caller who wants a four-metre road on a unit-weight edge passes
`normaliseLength(normalisation, 4) / 1`.

**W42 — `parcel-slicing.ts` marches with the kernel it already contains.** `marchDirection` (lines
484–495) is W9's Cramer form at unit weights; it becomes `v · n_a = w_a`, `v · n_b = w_b` with
`FaceEdge.weight` (the frontage edge's exterior weight, looked up through
`Strip.supportingEdgeIds`, strip-decomposition.ts line 95). The overtake test at line 514 becomes
`dot(direction, n_i) <= w_i + OVERTAKE_DOT_EPSILON · w_i`; the meeting at lines 594–598 becomes
`(D_i − w_i · τ) / (w_i − dot(direction, n_i))` with `τ = wavefront / w_active` — at unit weights
`D_i − 1.0 · (wavefront / 1.0)` is today's `competitor − wavefront`. This module's arithmetic is in
caller space and NOT part of the 112(d) digest; its bar is the strip-tiling identity (§5).

**W43 — `skeleton-tree.ts` and `spine.ts` read `computeNodeOffsets` and change nothing**
(skeleton-tree.ts line 319, spine.ts line 133): a `wavefront-time` threshold is already named as such.

### Canonicalisation and recursion pass-down

**W44 — The weight of an edge produced by removing a vertex.** `canonicalisePolygon`
(canonicalisation.ts lines 246–257) removes vertex `v` and merges edges `v−1 → v` and `v → v+1` into
one. Options: **(a)** pin every vertex whose two edges differ in weight, through the existing
`pinnedIndices` argument (line 234), so a weight change is never canonicalised away — simplest, but a
near-straight pinned vertex with a weight change has speed `|v| ≈ |w₁ − w₂| / sin(turn)` (W49) and is
exactly the conditioning hazard; **(b)** remove it and give the merged edge the weight of the LONGER
constituent — the silhouette the floor kept is that edge's; **(c)** refuse the input — a weight change
at a vertex under the floor is a contradiction between "cannot be seen" and "matters". The measurement
that settles it: the fixtures of §4 run under all three with the tiling identity and the fold sweep at
level 1; option (a)'s speed at the pinned vertex is recorded per fixture. ~~RULED 2026-09-10 (arc
decision 117): option (b). The merged edge takes the weight of the LONGER constituent, and the
boundary stage emits a diagnostic naming the removed vertex and both weights. Reason: a vertex the
client cannot see cannot carry a weight change the client can see, and the longer constituent is the
silhouette the floor kept; (a) keeps W49's hazard inside the solve, and (c) makes a sub-floor
authoring accident fatal for a runtime. The throw placeholder is REMOVED. The settling measurement
still runs and is reported; if (b) fails the tiling identity on any §4 fixture the ruling is
reopened.~~ **STRUCK AND RE-RULED 2026-09-10 (arc decision 120, the user): option (a).** A vertex
whose two incident edge weights differ is STRUCTURAL and is never removed by canonicalisation,
whatever its deviation from the chord: the boundary stage pins it through the existing
`pinnedIndices` argument, with no diagnostic and no merge. Why (b) was wrong: the user's dormer
square (§4.8) places an exactly collinear vertex at the centre of each side ON PURPOSE, because the
weight change either side of it is what makes a dormer interject into the roofline — "the varying
edge weights manifestly make the collinear vertices no longer trivial". (b)'s premise, that a vertex
the client cannot see carries nothing the client can see, is false under weights: the vertex is
invisible in the silhouette and visible in the skeleton. The settling measurement is RETIRED; there is
nothing to settle. **STANDS, NARROWED 2026-09-10 (arc decision 124(c))**: option (a) is the ruling,
and the vertices it pins are exactly those that passed W49's door — a weight-change vertex that
reaches canonicalisation has a visible turn (`|c × b| ≥ PARALLEL_GATE_SINE_BAR`), is structural, and is
pinned so that a sub-floor CHORD DEVIATION never merges it. That is well-conditioned because the
kernel is conditioned by the turn, not by the deviation — `|v| ≤ |w₁ − w₂| / |c × b|` — and the door
has already bounded the turn from below at `PARALLEL_GATE_SINE_BAR`, so a pinned vertex with a
sub-floor deviation (two long edges meeting at a small but visible turn) has a speed at most
`7.1e3 · |w₁ − w₂|`. Decision 117 stays struck: a weight-change vertex is never
silently merged in either direction. Unit weights are untouched: with every weight equal no vertex is
pinned by this rule and the digest cannot move.

**W45 — Weights are remapped through every boundary-stage index change.** Winding reversal
(algorithm-termination-cases.ts lines 984–990): `weights'[j] = weights[(n − 2 − j) mod n]`, because
reversed edge `j` runs from `v_{n−1−j}` to `v_{n−2−j}`, which is original edge `n−2−j`. Canonicalisation:
edge `i` survives as edge `indexRemap[i]` when both `v_i` and `v_{i+1}` survive (`CanonicalPolygon.
indexRemap`, canonicalisation.ts line 89); a merge is W44. Decomposition (polygon-decomposition.ts
lines 89–107): sub-polygon A's edges are the crossing point to `V_{i+1}` (a piece of edge `i`), then
edges `i+1 … j−1`, then `V_j` to the crossing point (a piece of edge `j`); each piece carries its
original edge's weight, and `DecompositionResult` gains a parallel `subPolygonWeights: number[][]`.
`graph-merge.ts` line 94 copies `maxOffset` as a time.

**W46 — The weight of a recursion-derived boundary edge, and the first landing runs sub-regions at
unit weight.** `divideRegion` (recursive-subdivision.ts line 719) calls `solveSkeleton(boundary,
{noiseFloor, perceptualFloor})` on a `Strip.boundary` or a `computeOffsetRings` ring, both bare
`Vector2[]` with no provenance — `region.ts` line 21–31 records that the provenance plumbing is
designed and not built. So no sub-region can know which of its edges is a piece of a weighted parent
edge, a contour (the offset of a parent edge, whose exterior id `OffsetRingSegment.exteriorEdgeId`
does carry, offset-projection.ts line 146–150), a ridge or a cut. Options for when the plumbing
exists: **(a)** perimeter and contour runs inherit the parent edge's weight, ridge and cut runs take
weight `1`; **(b)** ridge and cut runs take the mean of the two faces' weights; **(c)** a caller
policy keyed by `BoundaryProvenance` (region.ts line 57), default (a). The measurement: the level-1
tiling identity and `region-boundary-folds.test.ts` at asymmetric root weights on §4's fixtures.
**RULED 2026-09-10 (arc decision 118)**: the first landing is ROOT-ONLY weights — the recursion
driver passes no weights to sub-region solves (all ones), weights apply to the root solve only, and
the recursion census signatures (recursive-subdivision.test.ts line 223) are unmoved by construction.
The policy for when the provenance plumbing exists is option (a): perimeter and contour runs inherit
the parent edge's weight, ridge and cut runs take weight `1`. Not open.

### Normalisation

**W47 — Weights are dimensionless and the unit-extent transform does not touch them.** `time = distance
/ weight` scales with distance under `toUnitScale`, so every time is carried by `normaliseLength` /
`denormaliseLength` exactly as the enumeration at normalisation.ts lines 89–122 already carries
`maxOffset`, `offsetDistance` and the ray-units pair. `exteriorWeights` is added to that enumeration
as DIMENSIONLESS — untouched — beside the ids. `denormaliseGraph` (line 319) and
`denormaliseCollisionCache` (line 344) change nothing.

### The maximum-ratio constant

**W48 — `MAX_WEIGHT_RATIO = 100`.** Derivation: after W4 the fastest
edge has weight `R = max/min`, and the solver's absolute time window `FLOATING_POINT_EPSILON = 1e-8`
(the layer window and the phantom test) is a distance window of `R · 1e-8` on that edge. At `R = 100`
that is `1e-6`, the `SKELETON_NOISE_FLOOR` (canonicalisation.ts line 141): beyond it the solver would
fuse, as one arrival moment, two arrivals the client's floor says are two things. So the proposed
constant is `SKELETON_NOISE_FLOOR / FLOATING_POINT_EPSILON = 100`, derived and not picked. The game
runtime's need is not recorded here (a lane against a highway may need `1 : 5`; a setback of zero is
a gable and out of contract). **RULED 2026-09-10 (arc decision 119)**: `MAX_WEIGHT_RATIO = 100` as
derived; the near-maximum-ratio fixture (§4.4) is still swept at `R ∈ {10, 30, 100, 300}` against the
analytic answer and the tiling identity and the first `R` at which either moves is reported, so the
user can move the constant with a measurement in hand. The refusal is a thrown `Error` naming the two
extreme edges, matching `assertVerticesAreFinite`. N9's normalisation to minimum `1` is ratified under
the same decision.

**W49 — The ratio bound does NOT bound the vertex speed, and a second guard is required.**
`|v| = sqrt(w₁² + w₂² − 2 w₁ w₂ cos φ) / |sin φ|` with `φ` the angle between the normals. At `w₁ = w₂`
this is `w / cos(φ/2)`, bounded by the vertex angle alone and already present in the corpus (the
extreme-acute fixture). At `w₁ ≠ w₂` and `φ → 0` it is `|w₁ − w₂| / φ`, unbounded for ANY ratio: measured
`|v| = 1.5e7` at a turn of `1e-6` with weights `(1, 16)`, where the `1e-8` time window is a spatial
slack of `0.15` — a seventh of the unit extent. The hazard is angular, not a ratio. Options:
**(a)** `MIN_WEIGHT_TURN_SINE`: refuse a vertex whose two weights differ and whose `|c × b|` is below
a bar, proposed `PARALLEL_GATE_SINE_BAR` (`1.41e-4`, constants.ts line 81) so the same gate that refuses
to price a near-parallel intersection refuses to price a near-parallel weight change; **(b)** refuse
when `|v| · FLOATING_POINT_EPSILON > perceptualFloor · min(w₁, w₂)`, the direct statement of the
slack argument, evaluated per vertex at the door; **(c)** diagnose and continue. Unit weights are
untouched by (a) and (b) because both require `w₁ ≠ w₂`. This is the fast-beside-slow conditioning
hazard of 112(f), quantified; §4.3 is its fixture. **RULED 2026-09-10 (arc decision 119): option
(a).** A vertex whose two weights differ and whose `|c × b|` is below `PARALLEL_GATE_SINE_BAR` is
refused at the door by a thrown `Error` naming the offending vertex and its two weights, matching
`assertVerticesAreFinite`; the constant is `MIN_WEIGHT_TURN_SINE = PARALLEL_GATE_SINE_BAR`. Reason: the
gate that already refuses to price a near-parallel intersection is the one bar for "too parallel to
price", and (b) would introduce a second bar in a different space. ~~AMENDED 2026-09-10 (arc decision
121): the turn-sine guard is a CLASSIFIER, not a refusal. A weight-changing vertex with `|c × b|`
below `MIN_WEIGHT_TURN_SINE` is classified STRAIGHT and resolved by the riser convention (W53); above
it, the kernel is evaluated and is well-conditioned by the bar's own derivation. No refusal remains on
the turn; the only refusal in the solver is the ratio guard of W3.~~ **REFUSAL RESTORED 2026-09-10
(arc decision 124(b))**. Contract statement, verbatim: **weights may change only at a visible
corner.** A vertex whose two weights differ and whose `|c × b|` is below `PARALLEL_GATE_SINE_BAR`
(`MIN_WEIGHT_TURN_SINE`) is refused with a thrown `Error` naming the vertex and its two weights,
BEFORE canonicalisation runs — the check reads the caller's ring in unit space, immediately after W2
and W3 and before `canonicalisePolygon`. Reason: this is the same class of fence as 112(e)'s zero
weights — a configuration the weighted skeleton cannot make well-posed without an extra convention is
outside the contract, not inside it with a convention bolted on. Above the bar the kernel is
well-conditioned by the bar's own derivation: `|v| ≤ |w₁ − w₂| / 1.41e-4`, at most `7.1e3 · |w₁ − w₂|`.

### Fixtures

**W50 — The weighted fixtures live in `@proc-geo/test-fixtures` as their own roster**,
`WEIGHTED_TEST_POLYGONS`, each entry `{name, vertices, weights, expected}` with `expected` the analytic
answer of §4 where one exists, and they are NOT added to `CLEAN_TEST_POLYGONS` or `FULL_CORPUS`, whose
sweeps assume unit weights and whose count (59) is the digest's.

### Falsification bars

**W51 — The full-graph digest is a committed test, and it does not exist yet.** No test in
`packages/core/tests` computes a digest: the term appears only in journals and in source comments
(algorithm-helpers.ts line 52, algorithm-termination-cases.ts line 298, collision-helpers.ts line 148),
and the measurement was made by scratch scripts. `full-graph-digest.test.ts` is added FIRST: for every
fixture in `FULL_CORPUS` it solves with `solveSkeleton(vertices)` and pins a SHA-256 over the
denormalised graph — every node position as its 64-bit pattern, every edge's source, target and basis
bits, every interior edge's parents and `maxOffset` bits, in id order. The pins are recorded on the
tip BEFORE any weighted change lands (`e88da1f` or its successor) and the weighted branch must leave
all 59 unchanged. This is 112(d)'s instrument. **RULED 2026-09-10 (arc decision 116)**: the digest
test lands FIRST, as its own commit on the current tip, before any weighted change; and it is
convicted by mutation — perturb one node coordinate by one ulp and the pin must die — so that a
digest which could not see a one-ulp change is never mistaken for a bar.

### C++ port notes

**W52 — Port-first statements for the handoff's weighted section** (decision 113 item 8). (i) The
kernel is a 2×2 solve the port's `marchDirection` equivalent already has; the direction used for
bisectors is the scaled difference `w_ws · c − w_cw · b`, normalised, NOT the Cramer quotient — the
two differ by up to 4 ulps and only the first matches the unit-weight reference bit for bit. (ii)
Times are stored as `distance / weight` but every tolerance decision is on the pair, by
cross-multiplication, with the epsilon scaled by the weight product (W22, W26). (iii) Weights are
normalised to minimum `1` (W4). (iv) The three-line terminal solve replaces `−1` by `−w` in the
third column and nothing else. (v) The claim the port can make against the reference is structural
identity below `1e-13`, not byte identity (decision 113 item 2); the digest of W51 is the
reference's own bar, not the port's. (vi) Arc decision 124's model invariant — the roof base is a
single plane, dormers are stitched features — is stated in the handoff as a model invariant, because
the port's runtime is where the stitched features will be built (124(d)).

### The riser convention (SUPERSEDED)

**W53 — SUPERSEDED 2026-09-10 (arc decision 124(a)): not implemented, no riser convention, no
zero-length edges, no dormer solve. Kept struck through as the design record.** A collinear
weight-change vertex is refused at the door (W49); the case this decision resolved is outside the
contract.

~~**W53 — The riser convention** (arc decision 121; Biedl, Held, Huber, Kaaser, Palfrader, *Weighted
straight skeletons in the plane*, Computational Geometry 48:2, 2015, where the weighted skeleton at
a collinear weight change is well-defined only once the direction and weight of the inserted edge are
fixed). At a weight-changing vertex `v` classified straight by W49 — `|c × b| < MIN_WEIGHT_TURN_SINE`
with `w₁ ≠ w₂`, `c` the outgoing wall basis, `b` the incoming — a zero-length RISER edge is inserted
at `v`, perpendicular to the wall, with its own weight `w_r`. Its basis is `±rotateCw90(c)` and its
inward normal `n_r = ±c`, the sign chosen so that `n_r` points along the wall TOWARD THE SLOWER of
the two walls: the riser's face is the strip the fast wall sweeps that the slow wall has not, and
that strip lies on the slow wall's side of the step. The two vertices the riser creates are ordinary
kernels with orthogonal normals, so W9 reads, with `n` the wall's inward normal (`n = rotateCw90(c)`,
and `n · n_r = 0`): `v_A = w₁ · n + w_r · n_r` (vertex between the incoming wall, weight `w₁`, and the
riser); `v_B = w₂ · n + w_r · n_r` (vertex between the riser and the outgoing wall, weight `w₂`).~~

~~The riser's wavefront segment runs from `A` to `B`, has length `|w₁ − w₂| · t`, and is an ordinary
wavefront edge: the two vertices collide, split and terminate like any other, the riser is an
ordinary split-event target, and its collapse — which happens only through a later event, since its
own length grows — is an ordinary edge event. With `w_r = 0` (option (i)) `v_A = w₁ · n` and `v_B =
w₂ · n`: both vertices move straight inward at their own wall speeds and the riser line is
stationary — a vertical dormer cheek in the roof reading. OPEN, the user's call — the riser weight
`w_r`: (i) `w_r = 0`, a stationary riser: a zero-weight edge inside 112(e)'s fence, which would need
reopening for risers ONLY; what the fence would need, determined from the kernel: (1) `arrivalOf`
must never pair a distance with the riser's weight — a bisector whose clockwise parent is a
zero-weight riser takes its `Arrival` against its widdershins parent (W7's "always the clockwise
parent" convention gains this one exception), because `distance / 0` is not a time and, since `v_A`
runs parallel to the riser line, the distance to that line is identically zero; (2) a riser as a
split-event target is priced at the instigator's own clock — W20's divisor `crossCw · w_t + negT ·
w_cw` with `w_t = 0` reduces to `negT · w_cw`, which is non-zero, so the formula needs no case; (3)
I3's equi-time check against a zero-weight parent reduces to "the bisector's source lies on the
riser line", which is true by construction; (4) the riser CAN be split and CAN be a corridor wall
(the anti-facing corridor of a fast wall against a stationary riser closes at `t* = width / (w +
0)`, W14's formula unchanged); nothing in the kernel forbids either. (ii) `w_r = min(w₁, w₂)` or the
mean — a positive riser inside the contract; the riser line moves toward the slow wall and the cheek
leans. (iii) `w_r` as an explicit per-vertex input beside the edge weights, default one of the above.
The measurement that informs it: the dormer square (§4.8) solved under (i) and (ii), rendered, and
compared against what a dormer roof looks like.~~

~~**Site consequences, and the implementation recommended.** Two ways to realise the riser were
evaluated. *Inside the solver*: `initInteriorEdges` (algorithm-helpers.ts line 241) emits TWO primary
bisectors at one input vertex with a synthetic wavefront edge between them. This breaks the identity
"exterior edge id = vertex index = node index" that the solver rests on everywhere — `edgeRank`'s
`edgeId < numExteriorNodes` (solver-context.ts line 40), `getInteriorWithId(id − numExteriorNodes)`
(line 65), `span` (line 94), `activeExteriorEdgeSegments` (line 187), `exteriorParentsOfSubPolygon`
(line 326), `initBoundingPolygon`'s edge/node loop (graph-helpers.ts line 49), and every `%
numExteriorNodes` in `handleInteriorNGon`'s partition (algorithm-complex-cases.ts lines 367–443).
Every one of those would need a separate exterior-edge count. Rejected. *Boundary-stage rewrite*
(RECOMMENDED): after canonicalisation and winding normalisation and after decomposition — the last
boundary stage, immediately before `runSimplePolygon` — vertex `v` becomes the pair `v, v` with a
zero-length exterior edge between them, the weight array gains `w_r` at that index, and the solver
sees one more ordinary vertex and one more ordinary exterior edge. The identity above holds;
`numExteriorNodes` grows by one per riser, which consumers already tolerate because canonicalisation
already changes the count (decision 75, `indexRemap`). The rewrite emits a `riserIndices: number[]`
on `SkeletonSolveResult` beside `indexRemap`.~~

~~The touch points of the recommended form, each verified: (1) `initBoundingPolygon` (graph-helpers.ts
line 55) computes each basis by `makeBasis` of the two endpoints, and `normalize` of a zero vector
returns `{0, 0}` (core-functions.ts line 59) — the riser's basis must be SUPPLIED, so the function
gains a `basisOverrides: Map<number, Vector2>` argument filled by the rewrite; (2) canonicalisation
(canonicalisation.ts line 332–336) would remove BOTH riser vertices — each has deviation exactly zero
against a chord through its coincident twin — which is why the rewrite runs AFTER canonicalisation
and never before it; sub-region solves are unit-weight in the first landing (W46), so no riser ever
reaches a re-canonicalisation; (3) `intersectRays` classifies the two riser bisectors as
`identical-source` (intersection-edges.ts line 56–57), which is in `NO_COLLISION_RESULTS` — correct,
they diverge — but `handleInteriorEdgePair` (algorithm-termination-cases.ts lines 406–414) reads
`identical-source` as "the wavefront has finished" and terminates both edges at the source; that
premise is false for a riser pair bounding a growing edge, and the branch must exclude a pair whose
shared source is a riser vertex; (4) I2 (graph-index-invariants.test.ts line 159, no two nodes inside
the coincidence floor) exempts riser twins, and `findOrAddNode` (solver-context.ts line 150) is not
involved because exterior nodes are created directly; (5) `computeNodeOffsets`' re-derivation
(offset-projection.ts lines 255–263, 359–366) and the wavefront-causality oracle measure the parent
line through its two ENDPOINTS, and `distanceToSupportingLine` falls back to point distance at zero
length — both must measure through the edge's stored `basisVector` instead, which is exact for every
edge and is the only correct reading for a riser; (6) `makeRing` (offset-projection.ts line 664)
drops the riser's zero-length segment at `t = 0` and keeps it once it has length — correct as
written; (7) `parcel-slicing.ts` line 427 returns `null` for a frontage edge shorter than its
tolerance, so a riser that lands in a strip's frontage must be skipped there by the same
`riserIndices`; (8) `DEGENERATE_AREA_EPSILON` screens (polygon-decomposition.ts line 118,
recursive-subdivision.ts `degenerateRegionFailure`) are unaffected: a zero-length edge contributes
zero area; (9) `decomposePolygon`'s crossing test never sees a riser because the rewrite runs after
it; (10) `region.ts` runs: a riser is one edge of whichever run its vertex was in. Interpretations
made here are recorded in §6 N14–N17.~~

## 4. Fixture roster

Coordinates are clockwise in a y-up frame (up, right, down is clockwise — the `SQUARE` convention).
Weights are listed per edge `i` (vertex `i` to `i+1`) and are already at minimum `1`.

**4.1 Rectangle with one edge at weight 2.** Vertices `(0,0) (0,2) (4,2) (4,0)`, weights
`[1, 1, 1, 2]` (edge 3 is the bottom, `y = 0`). Bottom wavefront `y = 2t`, top `y = 2 − t`, sides `x = t`
and `x = 4 − t`. Corner velocities: bottom-left `(1, 2)`, bottom-right `(−1, 2)`, top-left `(1, −1)`,
top-right `(−1, −1)`. Expected: two interior nodes `(2/3, 4/3)` and `(10/3, 4/3)`, both at time `2/3`,
joined by one ridge; `computeMaxOffset = 2/3`. At unit weights: `(1, 1)`, `(3, 1)`, time `1`.

**4.2 Corridor with unequal walls.** Vertices `(0,0) (0,1) (10,1) (10,0)`, weights `[1, 3, 1, 1]` (edge
1, the top wall, at 3). Expected: the ridge lies at `y = 1/4` — distance `w_bottom · t* = 1 · 1/4` from
the slow bottom wall, `3/4` from the fast top wall — with `t* = 1 / (1 + 3)`. Corner velocities:
`(0,0)` gives `(1, 1)`, `(0,1)` gives `(1, −3)`, and both reach `(1/4, 1/4)` at `t = 1/4`; mirrored on
the right, `(39/4, 1/4)`. Expected: one ridge between those two nodes, both at time `1/4`. Convicts
W14 and W39(ii): at unit weights the ridge is at `y = 1/2` with nodes `(1/2, 1/2)`, `(19/2, 1/2)`.

**4.3 Fast-beside-slow reflex, the 112(f) hazard.** An L: vertices `(0,0) (0,4) (2,4) (2,2) (6,2)
(6,0)`, reflex vertex `(2,2)` between edge 2 (`(2,4)→(2,2)`, the riser, widdershins parent) and edge
3 (`(2,2)→(6,2)`, the inner shelf, clockwise parent). Weights `[1, 1, 1, 4, 1, 1]` — the shelf fast,
the riser slow. Reflex velocity by W9: `n_riser = (−1, 0)`, `n_shelf = (0, −1)`, `v = (−1, −4)`, speed
`sqrt(17)`: the fast shelf pulls the vertex down along the riser's basis at four times the riser's own
rate, and the riser's wavefront segment lengthens at rate 4. Expected first event at `t = 2/5`: the
shelf (`y = 2 − 4t`) and the floor (edge 5, `y = t`) are anti-facing parallel walls of width 2, so the
whole lower block closes at once on the equi-time line `y = 2/5` (W14), the reflex trace arriving at
its left end `(8/5, 2/5)` and the two right-hand corner traces `(−1, −4)` from `(6,2)` and `(−1, 1)`
from `(6,0)` at its right end `(28/5, 2/5)`; one ridge between those nodes, both at time `2/5`. Then
complete solve, causality over time, containment, tiling. ~~A second variant tilting the shelf so the
reflex turn is `1e-3` radians records `|v|` (≈ `3e3` at these weights) and is the fixture W49's guard
is convicted on.~~ *Second variant re-authored 2026-09-10 (arc decision 127(b)) as the delegate's
`WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE`*: a 10×10 square whose bottom wall is broken at its midpoint
by a vertex placed `2.5e-3` inside, so the turn sine at that vertex is exactly `1e-3` — above
`PARALLEL_GATE_SINE_BAR` (`1.41e-4`), so it passes W49's door — with weights `4` and `1` on the two
halves. Kernel speed at that vertex `|v| = |4 − 1| / 1e-3 = 3e3`, the same number for the same reason
as the retired variant. Expected: accepted at the door, the vertex pinned (W44), a complete solve,
causality over time, containment and tiling; the fixture is the conviction of W49's bound
`|v| ≤ |w₁ − w₂| / 1.41e-4` from inside the contract.

**4.4 Near-maximum-ratio.** `SQUARE` scaled to `(0,0) (0,2) (2,2) (2,0)` with weights `[1, 1, 1, R]`,
`R = MAX_WEIGHT_RATIO`. Expected at `R`: bottom wavefront `y = R t` meets top `y = 2 − t` at `t = 2 /
(R + 1)`, ridge at `y = 2R / (R + 1)` from `x = 2 / (R + 1)` to `2 − 2 / (R + 1)`; `computeMaxOffset = 2 /
(R + 1)`. At `R + 1` the solver throws (W3), asserted.

**4.5 Mirror-symmetric shape with asymmetric weights: the metamorphic pair.** `PENTAGON_HOUSE` with
the two roof edges at `[…, 1, 2, …]`. Expected: the apex node moves toward the slow roof; the solve is
NOT mirror-symmetric; and — the falsification — the mirrored polygon with the mirrored weight array
(W45's reversal map) yields the mirrored skeleton to `1e-12` in unit space. At weights all one the
digest of the unweighted fixture is unchanged.

**4.6 The step (W29, W32).** Vertices `(0,0) (0,10) (12,10) (12,2) (8,2) (8,0)`, weights
`[1, 1, 1, 1, 1, 2]` (edge 5, the low floor `y = 0`, fast; edge 3, the high floor `y = 2`, at 1; edge
4 the riser `x = 8`). The left block is 8 wide so that its side corridor (`t = 4`) and the floor/top
meeting (`t = 10/3`) come after the event under test. Reflex `(8,2)`: `v = (−1, 1)`; convex `(8,0)`:
`v = (−1, 2)`; the riser's wavefront collapses at `t = 2` at `(6, 4)` — an edge-collapse node that does
not exist at unit weights, where the two traces are parallel `(−1, 1)`. Asserted: the node, its time,
and that `solveParallelClosure` is not entered on this fixture (a debug counter or a log assertion).

**4.7 Collinear vertex with a weight change.** `INVISIBLE_VERTEX_RECTANGLE` with a weight change across
`INVISIBLE_VERTEX_INDEX`. Expected (arc decision 124(b)): the solve THROWS at the door, before
canonicalisation, naming `INVISIBLE_VERTEX_INDEX` and its two weights — the vertex sits exactly on its
own edge, so its turn is zero and a weight change there is outside the contract. With equal weights
either side of that vertex and a weight change elsewhere, the solve proceeds and the invisible vertex
is removed exactly as at unit weights (`removedCount` 1), which is the fixture's second assertion.

**4.8 The dormer square — the refusal that makes arc decision 124's invariant visible** (arc
decisions 122 and 124). Vertices `(0,0) (0,1) (0,2) (1,2) (2,2) (2,1) (2,0) (1,0)`: a 2×2 square with
an exactly collinear vertex at the centre of each side, placed there to model dormers. Weights
alternate `[1, 2, 1, 2, 1, 2, 1, 2]`, so every midpoint is a weight change at a vertex with zero turn.
Expected: `solveSkeleton` throws at the door, before canonicalisation, naming the first offending
vertex (index 1, `(0,1)`) and its two weights `1` and `2`; nothing is solved. Why the fixture exists:
this is the shape the user reasoned from, and its refusal is the model invariant stated as a test —
the roof base is one plane, a dormer is a feature stitched in afterwards, and a solver that accepted
this input would have to invent a convention (the struck W53) to make it well-posed. ~~Its riser
expectations under options (i) and (ii), and the plain-square negative control, are retired: the
door is reached first and none of that geometry is ever computed.~~ A companion assertion keeps the
contract's other edge honest: the same square with the midpoints REMOVED and weights
`[1, 2, 1, 2]` on its four edges solves (every weight change is at a `90°` corner), with corner
velocities ~~`(1, 2)`, `(2, −1)`, `(−1, −2)`, `(−2, 1)`, four-fold rotational symmetry to `1e-12`, and
no mirror symmetry~~ **`(1, 2)`, `(1, −2)`, `(−1, −2)`, `(−1, 2)` — corrected 2026-09-10 (arc decision
127(a))**: on a four-cycle with alternating weights, opposite edges have the same speed, so the
configuration is mirror-symmetric about both axes and two-fold rotational; four-fold rotational
symmetry with no mirror symmetry is unachievable for any weights, and the second and fourth
velocities as first written were arithmetically wrong (the kernel at `(0,2)` is `v · (1,0) = 1`, `v ·
(0,−1) = 2`, which is `(1, −2)`, not `(2, −1)`). Asserted: those four velocities, mirror symmetry
about `x = 1` and `y = 1` to `1e-12`, the ridge horizontal at `y = 4/3` (the fast top and bottom
walls meet the slow sides' corner traces at `t = 2/3`, as in §4.1).

**4.9 `WEIGHTED_SUB_FLOOR_WEIGHT_CHANGE` — the W44 conviction** (arc decision 127(c)). A small bump on
one wall: an apex vertex whose chord deviation is `4e-6` — under `SKELETON_NOISE_FLOOR` (`1e-6`)? no:
four times the floor is not under it, so the bump is built so that the apex's deviation is `4e-6`
against SHORT incident edges, giving a turn sine of `2e-4` — above `PARALLEL_GATE_SINE_BAR` — and the
control removes it by lowering the floor's target... *Stated exactly as the delegate authored it:*
apex deviation `4e-6`, turn sine `2e-4`, weights differing across the apex. The unit-weight CONTROL:
the same ring solved with all weights one at a `perceptualFloor` above `4e-6` loses the vertex
(`removedCount` 1). The weighted assertion: the same ring and floor with unequal weights across the
apex keeps it (`removedCount` 0) because W44 pins it; the solve is complete and the kernel at the apex
has speed `|w₁ − w₂| / 2e-4`. This fixture exists because a pinned vertex is only distinguishable
from an unpinned one when its deviation is sub-floor while its turn is super-bar, and that pair of
conditions holds only when the incident edges are short.

**4.10 OPEN — unequal-wall corridor closing through `co-linear-from-1`** (arc decision 126). The
discriminating fixture for W33: a corridor whose two walls carry different weights and whose two
mid-lines are born pointing the same way along one line, so that the pair is classified
`co-linear-from-1` and reaches the leading-source closure (algorithm-termination-cases.ts lines
481–486). No expectation is stated yet: the fixture has to be constructed and measured before anything
is pinned, and W33's check is re-opened by it and by nothing else.

## 5. Falsification bars

1. **Unit-weight digest bit-identity over all 59 fixtures** (112(d), W51). Run before any weighted
   fixture is believed. Per arc decision 116 the digest test lands FIRST, as its own commit on the
   current tip, before any weighted change, and is convicted by mutation: perturb one node coordinate
   by one ulp and the pin must die. A moved pin is attributed per fixture; the only sites permitted to
   move it are W21 (arc decision 115: movement bounded by ulps, more than ulps is a defect in the
   linear form); W33's check is not implemented (arc decision 126), so it moves nothing; each such
   movement is a finding.
2. **Analytic fixtures** (§4.1, 4.2, 4.4, 4.6): node positions to `1e-12` relative in unit space,
   times to `1e-12`, node and edge counts exact.
3. **Wavefront causality over time**: `wavefront-causality.test.ts`'s oracle divides by the parent
   weight; the assertion is unchanged in form (no bisector's target time precedes its source time).
4. **Containment unchanged** (`skeleton-containment.test.ts`): spatial, no restatement.
5. **Tiling unchanged** (`strip-tiling.test.ts`): the clipped faces plus the offset rings tile the
   polygon at every time depth, weighted or not.
6. **Fold sweep unchanged** (`region-boundary-folds.test.ts`): at root weights all one the
   population is unmoved; at asymmetric root weights it is measured and pinned as a new row.
7. **I1–I5 over time** (`graph-index-invariants.test.ts`): I1, I2, I4 unchanged; I3 as W39(i); I5 as
   W37.
8. **The metamorphic mirror pair** (§4.5) at `1e-12`.
9. **Refusals are loud**: three throws, each with a test asserting the throw and that its message
   names the offender — W2 (non-positive or non-finite weight, beside the existing non-finite-vertex
   refusal), W3 (the ratio guard, naming the two extreme edges) and W49 (the turn guard, naming the
   vertex and its two weights, thrown BEFORE canonicalisation — arc decision 124(b)). W44 pins
   silently and is convicted by §4.7's second assertion, not by a throw.
11. **The dormer square** (§4.8): throws naming vertex 1 and weights `1`, `2`; the four-edge
    companion solves with the stated corner velocities and rotational symmetry.
10. **Recursion census unmoved** (`recursive-subdivision.test.ts` line 223) while W46 stands at
    root-only weights.

## 6. Interpretations and negative results

- **N1 — No full-graph digest test exists in the suite.** Decision 112(d) calls it "the extension's
  first falsification bar" and it is a scratch measurement in the journals; W51 makes it a test.
- **N2 — 112(b) and 112(c) pull in opposite directions on the stored scalar**, and I resolved it by
  carrying both: the stored `offsetDistance` is the time (112(b)), the stored `arrival` is the pair,
  and every tolerance decision reads the pair (112(c)). A stricter reading — no divided scalar stored
  anywhere — would change every consumer of `offsetDistance` (dashboard, normalisation, tests) for no
  verdict difference, since ordering by `d/w` and by cross-multiplication agree except at rounding,
  which the pair comparator settles.
- **N3 — The incenter fallback (W21) is the one solver site where the division-free weighted form is
  not achievable bit-identically at unit weights.** Its weighted answer is a closed linear form that
  today's ray construction reaches by different arithmetic. RULED 2026-09-10 (arc decision 115): the
  linear form replaces the construction outright; see W21.
- **N4 — The Cramer spelling of the kernel is NOT bit-identical at unit weights** (0–3 ulps, 69 % of
  random vertices differ); the scaled-difference spelling IS (0 of 200 000). The kernel closed form in
  W9 is therefore stated in the second spelling, and the port note W52(i) says so.
- **N5 — `solveParallelClosure` is not where the 112(f) premise breaks in code**; the premise is about
  bisector rays and those stop being parallel under weights before the function is reached (W32).
  What the ruling correctly identifies is the CALLER's inference "no collision found ⇒ no event
  possible", which is sound under weights only because W19/W29 find the event first. Fixture 4.6
  convicts this. The scratch script `kernel-check.mjs` prints "t = -1 (expected 1)" for its step
  configuration: that is a sign slip in the script's closing-rate line (it divides by the negated
  rate), not in W32 — the y-velocities differ by exactly the weight difference and the riser
  collapses at `t = 1` as W32 states.
- **N6 — The maximum-ratio constant does not bound the conditioning hazard** (W49): the fast-beside-
  slow speed is angular, `|w₁ − w₂| / sin(turn)`, and a second guard is required. I did not add a
  refusal 112(e) does not name; I stated the options and the measurement. Arc decision 119 made it a
  refusal, 121 briefly a classifier, and 124(b) a refusal again with the contract statement "weights
  may change only at a visible corner".
- **N7 — A collinear vertex with a weight change has no vertex velocity** (W10, W44): the kernel is
  inconsistent, the scaled-difference numerator degenerates to `(w_ws − w_cw) · c` — a direction along
  the wall at zero rate, measured. Under arc decision 124(b) that vertex is refused at the door, so
  this numerator is never handed to `addBisectionEdge`.
- **N14 — SUPERSEDED (arc decision 124).** The riser's orientation ("toward the slower wall") was my
  interpretation of decision 121; no riser exists, so nothing rests on it.
- **N15 — SUPERSEDED (arc decision 124).** "After canonicalisation" for the riser rewrite was my
  interpretation, forced by canonicalisation removing both riser twins; moot.
- **N16 — SUPERSEDED (arc decision 124).** The `identical-source` terminal-branch consequence was a
  riser-only site; with no zero-length edges the branch's premise is unchanged from today.
- **N17 — SUPERSEDED (arc decision 124).** The dormer square's option-(ii) partial derivation is
  retired with the fixture's riser expectations.
- **N18 — SUPERSEDED (arc decision 124).** The analysis of what 112(e)'s fence would need for a
  zero-weight riser is moot; the fence stands unopened.
- **N19 — Where the turn guard runs is my interpretation of "before canonicalisation runs".** I placed
  it in unit space, immediately after W2 and W3 and before `canonicalisePolygon`, reading the
  caller's ring after winding normalisation is NOT yet applied; since `|c × b|` is invariant under
  reversal and under the unit-extent scale, the verdict does not depend on that placement, only the
  reported index does — and the index reported is the caller's own, before any renumbering, which is
  the convention `nonFiniteVertexComplaint` already uses.
- **N20 — §4.8's companion assertion (the four-edge square with alternating weights) is my
  addition**, not in arc decision 122 or 124: it keeps the fixture from convicting only the refusal
  and says what the same weights DO produce inside the contract.
- **N8 — Recursion pass-down is blocked on provenance plumbing that does not exist** (W46);
  `Strip.boundary` and the residue rings are bare rings. The first landing is root-only.
- **N9 — Weight normalisation to minimum `1` is my choice, not 112's**; the alternative (maximum `1`)
  makes every time at least its distance and would TIGHTEN the absolute time windows on slow edges
  below `findOrAddNode`'s frozen position epsilon (solver-context.ts line 150), so that the time layer
  could separate two arrivals the node layer fuses. Minimum `1` keeps the time windows at least as wide
  as the position epsilon everywhere; W48 derives the ratio bound from the other end of that band.
  RATIFIED 2026-09-10 (arc decision 119).
- **N10 — `intersectRays` needs no change**: it is ray geometry with no speed in it
  (intersection-edges.ts lines 48–117); every weight enters at the sites that price its result.
- **N11 — The winding-reversal weight map (W45)** was derived, not read from code: `solveSkeleton`
  reverses vertices at line 985 and nothing today carries a parallel array through it.
- **N12 — The dashboard is second-tier and named only**: `useCollisionSweep.ts` line 83 builds a
  context with no weights; the labels at `PolygonCanvas.tsx` line 237, `skeletonToScene.ts` lines 283
  and 569 print `offsetDistance` and `d=` and would print times; `parcel-pipeline.ts` lines 168–170
  and `useRecursiveSubdivisionStore.ts` line 142 already treat the maximum offset as a fraction base
  and need nothing. No weight UI exists and none is specified here.
- **N13 — The `CLEAN_TEST_POLYGONS` comment "MEASURED OVER ALL 57 FIXTURES"** at graph-index-
  invariants.test.ts line 203 predates the 59-fixture corpus; it is a stale count in a comment, not a
  roster discrepancy, and is outside this spec's mandate.

## 7. Appendix: site roster

Verified by opening each file. "BI" is the verdict on whether the unit-weight path is bit-identical
by construction under the decision cited: **yes** (multiplies or divides by exactly `1.0`, or the
site's arithmetic is untouched), **no** (a new formula), **n/a** (no arithmetic changes).

| # | Site | Current (one line) | Weighted form | BI | Decision |
|---|---|---|---|---|---|
| 1 | [types.ts](../../packages/core/src/straight-skeleton/types.ts) 12–17 `PolygonEdge` | no weight field | weights live on `StraightSkeletonGraph.exteriorWeights`, not on the edge | n/a | roster |
| 2 | types.ts 38 `InteriorEdge.maxOffset` | distance | time | n/a | W5, W16 |
| 3 | types.ts 145–151 `CollisionEvent.offsetDistance` | distance | time, plus `arrival: Arrival` | n/a | W5, W7 |
| 4 | types.ts 97–111 `StraightSkeletonSolverContext` | no weights | `weightOf(id)` via `GraphHelpers` | n/a | roster |
| 5 | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) 3, 44, 81 | `1e-8`, sine bars | unchanged; `MAX_WEIGHT_RATIO`, `MIN_WEIGHT_TURN_SINE` added | n/a | W48, W49 |
| 6 | [core-functions.ts](../../packages/core/src/straight-skeleton/core-functions.ts) 73–81 `makeBisectedBasis` | `normalize(i + j)`, zero → `rotateCw90(i)` | sibling `normalize(w_ws·c − w_cw·b)`, same fallback | yes (0/200 000) | W12 |
| 7 | core-functions.ts 152–162 `projectToPerpendicular`, `projectFromPerpendicular` | `cross · length`, `perp / cross` | unchanged; callers pass `time · w` as the perpendicular | yes | W40 |
| 8 | [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) 60–69 `ensureBisectionIsInterior` | flip on `cross(cw, ws) < 0` | unchanged (zero-rate branch only) | yes | W15 |
| 9 | algorithm-helpers.ts 84–86 `bisectorOffsetRate` | `cross(basis, c)` | unchanged; equals `w_cw / |v|` on the weighted basis | yes | W11, W13 |
| 10 | algorithm-helpers.ts 171–174 bisected basis | `makeBisectedBasis(c, −b)` | `makeWeightedBisectedBasis(c, b, w_cw, w_ws)` | yes | W12 |
| 11 | algorithm-helpers.ts 176–188 sign and zero-rate | `rate < 0 → negate`; `sineIsBelow → parent order` | unchanged | yes | W13, W14 |
| 12 | algorithm-helpers.ts 226–227 `maxOffset` | `makeOffsetDistance(...)` | `timeOf(arrivalOf(...))` | yes | W16 |
| 13 | algorithm-helpers.ts 241–250 `initInteriorEdges` | parents `i`, `i−1` | plus weights `[i]`, `[i−1]` | yes | W17 |
| 14 | [collision-helpers.ts](../../packages/core/src/straight-skeleton/collision-helpers.ts) 34 sort | `a.offsetDistance − b.offsetDistance` | `compareArrivals(a.arrival, b.arrival, 0)` | yes | W27 |
| 15 | collision-helpers.ts 45–58 `sourceOffsetDistance` | perpendicular distance of source from cw parent line | unchanged (it is the pair's `distance`) | yes | W6 |
| 16 | collision-helpers.ts 75–85 `makeOffsetDistance` | `source + along · cross(basis, c)` | unchanged; paired with `weightOf(c)` by `arrivalOf` | yes | W6, W7 |
| 17 | collision-helpers.ts 101–122 `meetHeadOn` | `(sB − sA + sep·rB) / (rA + rB)`; `areEqual(rA + rB, 0)` | `(sB·wA − sA·wB + sep·rB·wA) / (rA·wB + rB·wA)`; `|…| < ε·wA·wB` | yes (0/100 000) | W19 |
| 18 | collision-helpers.ts 159–161 `arrivalOffsetOfPair` | `Math.max(a, b)` | `laterArrival`: larger `d·w_other` | yes | W18 |
| 19 | collision-helpers.ts 198–202 phantom | `!areEqual(dA, dB) \|\| dA <= 0` | `!arrivalsAreEqual(A, B, ε) \|\| A.distance <= 0` | yes | W23 |
| 20 | collision-helpers.ts 258–263 `outOfBounds` | `e.offsetDistance > maxOffset` | `compareArrivals(e.arrival, {maxOffset·w, w}, 0) > 0` | yes | W16 |
| 21 | [intersection-edges.ts](../../packages/core/src/straight-skeleton/intersection-edges.ts) 48–117 `intersectRays` | ray-ray, no speed | unchanged | yes | N10 |
| 22 | [generate-split-event.ts](../../packages/core/src/straight-skeleton/generate-split-event.ts) 25–109 `findOffsetViaIncenter` | temp node + `makeBisectedBasis` + ray intersection | linear equi-time form with source term, replacing outright (arc decision 115) | **no** — the one named exception; movement bounded by ulps | W21, N3 |
| 23 | generate-split-event.ts 127–136 `findOffsetByDirectStrike` | `L·negT / (crossCw + negT)`; `offset = s·crossCw` | `L·negT·w_cw / (crossCw·w_t + negT·w_cw)`; arrival `{s·crossCw, w_cw}` | yes (0/100 000) | W20 |
| 24 | generate-split-event.ts 101, 177, 253, 293 negative/validate | `offset < 0`; `validateSplitReachesEdge(…, offset)` | `arrival.distance < 0`; pass the arrival | yes | W20, site 30 |
| 25 | [solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts) 32–35 constructor | `(nodes, floor)` | `(nodes, floor, weights?)`; 8 direct call sites in core/tests/fixtures/dashboard | n/a | roster |
| 26 | solver-context.ts 76–80 `isReflexEdge` | `dot(cwParent, basis) < 0` | unchanged (direction only) | yes | W13 |
| 27 | solver-context.ts 122–125 `vertexAtOffset` | `t = offset / cross(bisector, edge)` | `t = (localTime · w_edge) / cross(...)` | yes | W40 |
| 28 | solver-context.ts 276–286 `updateMaxOffset` | `min(maxOffset, offset)` | same on times | yes | W16 |
| 29 | solver-context.ts 291–296 `clockwise/widdershinsVertexAtOffset` | offset as distance | time; multiply by `weightOf(edgeId)` | yes | W40 |
| 30 | solver-context.ts 347–366 `validateSplitReachesEdge` | `local = offset − sourceOffset`; `notYetBorn(local)`; `vertexAtOffset(…, local)` | `compareArrivals(split, birth, ε) < 0` rejects; `vertexAtOffset(…, timeOf(split) − timeOf(birth))` scaled by `w_edge` | yes | W30, W40 |
| 31 | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) 63–74 `nodeOffset` | `sourceOffsetDistance` | arrival | yes | W30 |
| 32 | algorithm-termination-cases.ts 106–151 `tryAttachEdgeToNode` | `snap − birth < 0`; `!areEqual(candidate, snap)` | `compareArrivals(…) < 0`; `!arrivalsAreEqual(…)` | yes | W30 |
| 33 | algorithm-termination-cases.ts 191–205 `applyDegenerateClosure` | terminate, cull, accept | unchanged | n/a | W35 |
| 34 | algorithm-termination-cases.ts 228–274 `solveDegenerateClosure` | arrivals all `areEqual` to the first; birth check | `arrivalsAreEqual`; `compareArrivals ≥ 0` | yes | W31 |
| 35 | algorithm-termination-cases.ts 326–359 `solveParallelClosure` | parents parallel, bisectors same-direction, leading source | unchanged; the premise moves to the caller | yes | W32, N5 |
| 36 | algorithm-termination-cases.ts 404–405 head-on cross-wire | topological | unchanged | n/a | W34 |
| 37 | algorithm-termination-cases.ts 481–486 `co-linear-from-1` closure | leading source on raw separation | plus `arrivalsAreEqual(trailer-at-source, leader-birth, ε)` | yes at the arithmetic; verdict may move (N3-class) | W33 |
| 38 | algorithm-termination-cases.ts 561 `solveTerminalPoint` rows | `[n.x, n.y, −1]` | `[n.x, n.y, −w]` | yes | W28 |
| 39 | algorithm-termination-cases.ts 564–567 singular test | `areEqual(det, 0)` | `|det| < ε · max(w)` | yes | W28, W29 |
| 40 | algorithm-termination-cases.ts 614 negative time | `offset < 0` | unchanged (time) | yes | W28 |
| 41 | algorithm-termination-cases.ts 886–918 `SolveSkeletonOptions` | floor options | `+ weights` | n/a | W1 |
| 42 | algorithm-termination-cases.ts 984–990 winding reversal | vertices reversed | weights reversed by `w'[j] = w[(n−2−j) mod n]` | n/a | W45 |
| 43 | algorithm-termination-cases.ts 972, 860, 1085 canonicalise | vertex removal | weight remap through `indexRemap`; merge rule OPEN | n/a | W44, W45 |
| 44 | [algorithm-complex-cases.ts](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts) 53, 107–110 simultaneity | 64 ulps on times | 64 ulps on `d₁w₂` vs `d₂w₁` | yes | W25 |
| 45 | algorithm-complex-cases.ts 86–136 `inArrivalOrder`, `earliestArrivalMoment` | sort by offset | sort by `compareArrivals(…, 0)` | yes | W25 |
| 46 | algorithm-complex-cases.ts 180–197 layer window | `fp_compare(offset, best) <= 0` | `compareArrivals(…, ε) <= 0` | yes | W24 |
| 47 | [collision-handling.ts](../../packages/core/src/straight-skeleton/collision-handling.ts) 5–95 | topological | unchanged | n/a | — |
| 48 | [coincident-events.ts](../../packages/core/src/straight-skeleton/coincident-events.ts) 45, 101, 171, 258, 442 | position floor, medoid, parents | unchanged | n/a | W38 |
| 49 | [graph-helpers.ts](../../packages/core/src/straight-skeleton/graph-helpers.ts) 38–63 `initBoundingPolygon` | edges `i → i+1` | plus `exteriorWeights` on the graph | n/a | W1 |
| 50 | [offset-projection.ts](../../packages/core/src/straight-skeleton/offset-projection.ts) 359–366 re-derivation | `distanceToSupportingLine(...)` | `… / exteriorWeights[parent]` | yes | W40 |
| 51 | offset-projection.ts 290 tolerance | relative `1e-12` | unchanged | yes | W40 |
| 52 | offset-projection.ts 547 lifetimes | `offset < birth \|\| offset >= death` | same on times | yes | W40 |
| 53 | offset-projection.ts 573 `bisectorPositionAtOffset` | `projectFromPerpendicular(basis, c, localOffset)` | `…(basis, c, localTime · w_c)` | yes | W40 |
| 54 | offset-projection.ts 505–509, 771–778, 850 entry points | offset as distance | time | n/a | W5 |
| 55 | [strip-decomposition.ts](../../packages/core/src/straight-skeleton/strip-decomposition.ts) 158–159 `depth` | length, via `normaliseLength` | time | n/a | W41 |
| 56 | strip-decomposition.ts 563–564, 596–597, 928–939 clip | linear in offset | linear in time | yes | W41 |
| 57 | [parcel-slicing.ts](../../packages/core/src/straight-skeleton/parcel-slicing.ts) 224–225, 431–437 `FaceEdge.normal` | inward unit normal | `+ weight` from `supportingEdgeIds` | n/a | W42 |
| 58 | parcel-slicing.ts 472–475 `offsetWithinFace` | `dot(p − start, normal)` | unchanged (distance); time = `/ weight` at the comparison | yes | W42 |
| 59 | parcel-slicing.ts 484–495 `marchDirection` | `v·n_a = v·n_b = 1` Cramer | `= w_a, w_b` | yes | W42 |
| 60 | parcel-slicing.ts 514, 594–598 overtake and meeting | `dot ≤ 1`; `(comp − wave) / (1 − dot)` | `dot ≤ w_i`; `(D_i − w_i·τ) / (w_i − dot)` | yes | W42 |
| 61 | [recursive-subdivision.ts](../../packages/core/src/straight-skeleton/recursive-subdivision.ts) 719, 727–731 `divideRegion` | `solveSkeleton(boundary, {floors})`; `computeMaxOffset · fraction` | no weights passed (root only); depth is a time | n/a | W46 |
| 62 | recursive-subdivision.ts 859–860, 874–877 children | bare rings | provenance needed for pass-down | n/a | W46, N8 |
| 63 | [region.ts](../../packages/core/src/straight-skeleton/region.ts) 57–64, 80–85 | provenance vocabulary, no weight | weight-by-provenance is the OPEN target | n/a | W46 |
| 64 | [canonicalisation.ts](../../packages/core/src/straight-skeleton/canonicalisation.ts) 231–272 | removes vertices, remaps indices, honours pins | merged-edge weight OPEN; placeholder throw | n/a | W44 |
| 65 | [normalisation.ts](../../packages/core/src/straight-skeleton/normalisation.ts) 89–122, 319–358 | lengths scaled, directions untouched | times scaled as lengths; weights dimensionless, untouched | yes | W47 |
| 66 | [polygon-decomposition.ts](../../packages/core/src/straight-skeleton/polygon-decomposition.ts) 89–107 `splitAtCrossing` | vertex lists only | parallel weight lists, pieces inherit | n/a | W45 |
| 67 | [graph-merge.ts](../../packages/core/src/straight-skeleton/graph-merge.ts) 94 | copies `maxOffset` | copies a time | yes | W45 |
| 68 | [debug-helpers.ts](../../packages/core/src/straight-skeleton/debug-helpers.ts) 54–73 `computeNodeOffsetDistances` | `sourceOffsetDistance` | `timeOf(arrival)` | yes | W5 |
| 69 | debug-helpers.ts 93–99 `computePrimaryInteriorEdges` | unweighted bisector | lead's call | n/a | W15 |
| 70 | tests: `wavefront-causality.test.ts` 61–80 oracle | distance to parent line | `/ weight` | — | §5.3 |
| 71 | tests: `graph-index-invariants.test.ts` 150 I1, 159 I2, 283 I3 (238–269), 435 I4, 693 I5 (589–606) | I3 equidistant; I5 parents parallel | I3 equi-time; I5 weight condition | — | W37, W39 |
| 72 | tests: `skeleton-containment.test.ts`, `strip-tiling.test.ts`, `region-boundary-folds.test.ts` | spatial invariants | unchanged in form | — | §5.4–6 |
| 73 | tests: `recursive-subdivision.test.ts` 223 census | signatures | unmoved (root-only weights) | — | §5.10 |
| 74 | tests: full-graph digest | **does not exist** | `full-graph-digest.test.ts` added first | — | W51, N1 |
| 75 | dashboard [useCollisionSweep.ts](../../packages/dashboard/src/hooks/useCollisionSweep.ts) 38, 58–61, 83 | sweep `offsetDistance`; node distances; unweighted context | times; pass weights | — | N12 |
| 76 | dashboard [skeletonToScene.ts](../../packages/dashboard/src/scene/adapters/skeletonToScene.ts) 283, 559–569; [PolygonCanvas.tsx](../../packages/dashboard/src/components/PolygonCanvas.tsx) 237; [DebugPanel.tsx](../../packages/dashboard/src/components/DebugPanel.tsx) 113–115 | labels print offsets as `d=` | print times | — | N12 |
| 77 | dashboard [parcel-pipeline.ts](../../packages/dashboard/src/hooks/parcel-pipeline.ts) 168–170; [useRecursiveSubdivisionStore.ts](../../packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts) 142 | fraction of max offset | fraction of max time; no change | — | N12 |
