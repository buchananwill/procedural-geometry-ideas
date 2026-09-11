---
title: "Angular predicate basis: decision spec"
type: design
status: draft
date: 2026-09-11
---

# Angular predicate basis: decision spec

## Intent

Journal decision 134 rules that the angular predicates get ONE first-principles derivation
replacing the two laundered bars, under a conceptual contract — "everything not identical is
priceable, or everything unpriceable is closed as parallel, and nothing is neither" — and an
empirical one: no currently-solving fixture, census cell or recursion cell stops solving. This spec
fixes the derivation, the ordering and the restatement of every angular site, against a trace of
`r0.2.1` of `Off-edge Jitter Reflex L (seed 55433)` at merge 6 / depth 0.5 / floor 1e-6 that
**refutes the mechanism F56 inferred** and locates the real one. The live failure is not a pair
caught between `DIRECTION_SINE_BAR` and `PARALLEL_GATE_SINE_BAR`: the corridor walls are
anti-parallel to a sine of `1.7e-16` and the two mid-lines to a sine of exactly `0`, so every
angular bar in the solver agrees they are parallel. What refuses the pair is a THIRD bar nobody has
named — the coaxiality test inside `sourceLiesAhead`, at the raw coordinate epsilon — and what
refuses to close it is `solveParallelClosure`'s exact sign test, which excludes anti-parallel pairs
by design at any bar. The derivation therefore covers three questions, not two: identity of
direction, priceability of an intersection, and coaxiality of two sources. It derives one ANGULAR
resolution in the angle's own category, puts coaxiality where it belongs (a POSITIONAL question, in
the floor's category), and makes the three answers partition their axes with no gap.

---

## Type and surface roster

Every constant, function and test this package touches, one line each.

| Surface | Path | Change |
|---|---|---|
| `FLOATING_POINT_EPSILON` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | Unchanged. Stops being the ancestor of any angular bar. |
| `DIRECTION_SINE_BAR` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | Retired as a constant; every use moves to the derived resolution. |
| `PARALLEL_GATE_SINE_BAR` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | Retired as a constant; replaced by `angularResolution(perceptualFloor)`. |
| `MIN_WEIGHT_TURN_SINE` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | Keeps its own derivation (velocity-kernel conditioning); stops aliasing the gate. |
| `angularResolution(floor)` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | NEW. `max(perceptual(floor), conditioning(floor))`, derived in A1–A4. |
| `coaxialityFloor(floor)` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | NEW. The positional bar for "are these two sources on one line". |
| `sineIsBelow`, `directionsAreSame` | [core-functions.ts](../../packages/core/src/straight-skeleton/core-functions.ts) | DEFAULT `bar` argument removed; bar becomes required (A12). |
| `makeBisectedBasis`, `makeWeightedBisectedBasis`, `bisectorOffsetRate` | [core-functions.ts](../../packages/core/src/straight-skeleton/core-functions.ts), [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) | Unchanged; a direction is not a predicate. |
| `sourceLiesAhead` | [intersection-edges.ts](../../packages/core/src/straight-skeleton/intersection-edges.ts) | The site of the live defect. Restated per A14. |
| `intersectRays` | [intersection-edges.ts](../../packages/core/src/straight-skeleton/intersection-edges.ts) | Takes both bars as parameters (A11); gate A13, exits A15–A16. |
| `ensureBisectionIsInterior`, `addBisectionEdge` | [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) | Both ask the resolution of RAW PARENT directions (A17–A18); closes D14. |
| `makeOffsetDistance`, `meetHeadOn`, `collideInteriorEdges` | [collision-helpers.ts](../../packages/core/src/straight-skeleton/collision-helpers.ts) | A19, A20; `collideInteriorEdges` only threads the bars. |
| `tryAttachEdgeToNode` (line 136), `solveDegenerateClosure` | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | Point-on-ray moves to the coaxiality floor (A21). |
| `solveParallelClosure`, `handleInteriorEdgePair` | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | Anti-parallel arm (A22–A24); head-on branch and throw (A25–A26). |
| `generateSplitEventFromTheEdgeItself` | [generate-split-event.ts](../../packages/core/src/straight-skeleton/generate-split-event.ts) | `areEqual(alongEdge, 0)` classified positional (A27). |
| `StraightSkeletonSolverContext` | [types.ts](../../packages/core/src/straight-skeleton/types.ts) | Gains `angularResolution` and `coaxialityFloor` beside `perceptualFloor`. |
| `angular-predicate-basis.test.ts` | [tests](../../packages/core/tests/straight-skeleton/angular-predicate-basis.test.ts) | Rewritten: derivation, ordering, partition (A31–A34). |
| `composite-functions.test.ts`, plus the debug suites | [tests](../../packages/core/tests/straight-skeleton/composite-functions.test.ts) | ~40 `intersectRays` call sites gain the bars. |
| `full-graph-digest.test.ts` | [tests](../../packages/core/tests/straight-skeleton/full-graph-digest.test.ts) | Digest instrument; movement attributed per A35. |
| `recursive-subdivision.test.ts`, `region-tree.test.ts` | [tests](../../packages/core/tests/straight-skeleton/recursive-subdivision.test.ts) | Census gate; the shared `r0.2.1` specimen is at risk (A38). |
| `perceptual-floor-option.test.ts` | [tests](../../packages/core/tests/straight-skeleton/perceptual-floor-option.test.ts) | The ladder `[1e-6, 3e-6, 1e-5, 3e-5, 1e-4]`; the bar now moves with the rung (A36). |
| `large-coordinate-known-failures.test.ts`, `along-edge-jitter-known-failures.test.ts` | [tests](../../packages/core/tests/straight-skeleton/large-coordinate-known-failures.test.ts) | Pinned defect signatures; may only improve (A37). |
| `weighted-offsets.test.ts`, `collinear-dumbbell.test.ts` | [tests](../../packages/core/tests/straight-skeleton/weighted-offsets.test.ts) | `MIN_WEIGHT_TURN_SINE` derivation (A30); the exactly-coaxial corridor control. |
| `ANTI_PARALLEL_CORRIDOR_*` + `anti-parallel-corridor.test.ts` | NEW, [rectilinear-shapes.ts](../../packages/test-fixtures/src/rectilinear-shapes.ts) and `packages/core/tests/straight-skeleton/` | The corridor fixture family and its swept band (A39–A41). |

---

## The trace, as measured

Stated here because every decision below cites it. Read-only reproduction: `r0.2.1` is the node of
`subdivideRecursively(OFF_EDGE_JITTER_L_SEED_55433, {levels: MAX_RECURSION_LEVELS,
mergeGroupSize: 6, depthFraction: 0.5})`; its 14-vertex RAW boundary re-solved standalone at the
region's own noise floor (`1e-6`) and perceptual floor `1e-6` fails identically to the driver's
solve — `complete: false`, exterior edges `3` and `8` unaccepted, interior edges `28` and `31`
carrying `length = Number.MAX_VALUE` and no target.

- `ie28` has parents `(cw = e8, ws = e3)`; `ie31` has parents `(cw = e3, ws = e8)` — the SAME wall
  pair in swapped roles, i.e. the two mid-lines of one corridor.
- `sine(e3, e8) = 1.70e-16`, `dot = -1`: the walls are anti-parallel to within one ulp. **This is
  not `6.65e-6`** — `6.65e-6` is the y-component of the corridor's own direction, its tilt from the
  x-axis, which F55/F56 read as the wall-pair sine.
- `sine(basis(ie28), basis(ie31)) = 0` exactly; `dot = -1.0000000000000002`. Both mid-line bases
  are `±(0.9999999999778706, 6.6527462559690544e-6)` — `addBisectionEdge`'s zero-rate fallback
  handing each mid-line its clockwise parent's basis.
- Unit-space sources `(0.5126930187829272, -0.09155164021401378)` and
  `(0.25024290454810094, -0.09155341376856085)`; separation `(-0.2624501142348262,
  -1.7735545470715097e-6)`, distance `0.26245011424081877`, `forward = +0.2624501142408174`
  (ray 2's source IS ahead), `lateral = |cross(sep, basisA)| = 2.754053217787122e-8`,
  `sine(sep, basisA) = 1.0493625524811393e-7`. The two mid-lines are **two parallel lines
  2.754e-8 apart in unit space**, not one line.

### Site-by-site verdicts

| Site | Predicate | Value | Bar | Verdict |
|---|---|---|---|---|
| `intersectRays` parallel gate | `sineIsBelow(b1, b2, PARALLEL_GATE_SINE_BAR)` | sine `0` | `1.4142e-4` | **TRUE** — enters the parallel branch |
| `intersectRays` orientation | `dotOfBasisVectors > 0` | `-1.0000000000000002` | — | FALSE — takes the anti-parallel arm |
| `sourceLiesAhead` forward | `dot(sep, basis) > 0` | `+0.2624501` | — | TRUE |
| `sourceLiesAhead` coaxial | `lateral <= 1e-8 * max(1, d)` | `2.754e-8` vs `1e-8` | ratio **2.754** | **FALSE — this is the refusal** |
| `intersectRays` result | — | — | — | `'parallel'`, both argument orders |
| `collideInteriorEdges` | `NO_COLLISION_RESULTS.includes('parallel')` | — | — | returns `[]`, both orderings |
| `solveDegenerateClosure` | `directionsAreSame(sep, ray.basis, 1e-8)` | sine `1.049e-7` | `1e-8` | FALSE — no anchor |
| `solveParallelClosure` parent gate | `sineIsBelow(e3, e8, 1e-8)` | `1.70e-16` | `1e-8` | TRUE — **gate passes** |
| `solveParallelClosure` bisector test | `directionsAreSame(b1, b2, 1e-8)` | `dot < 0` | any bar | **FALSE — exact sign test, anti-parallel excluded by design** |
| `handleInteriorEdgePair` | — | — | — | throws `Unable to generate any collision from last two edges` |

### Verdict on F56's inferred mechanism: REFUTED in its specifics

F56 inferred "the gate says parallel so no pricing; identity says not parallel so no closure", with
`6.65e-6` as the between-the-bars value. Measured: (1) the gate saying parallel is not the refusal —
it is CORRECT and opens the right branch; the refusal is one level down, at `sourceLiesAhead`'s
coaxiality test at `FLOATING_POINT_EPSILON * max(1, d)`, a bar F56 did not name and which is
neither of the two decision 134 set out to unify. (2) The closure does not refuse on the identity
bar's value — its parent gate PASSES at `1e-8`; its bisector test fails on an EXACT SIGN TEST
(`dotProduct > 0`) that rejects anti-parallel pairs at every bar, so moving either sine bar changes
nothing there. (3) `6.65e-6` is not a wall-pair sine. F56's conclusion — "a hole between two bars" —
survives in altered form: the hole is between the COORDINATE EPSILON (`1e-8`) and the CLIENT'S
FLOOR (`1e-6`), on the positional axis rather than the sine axis.

### The measured band

The parametrisation F56 implies — a corridor whose walls are anti-parallel to a swept sine `s` —
**does not reproduce the failure at any `s`**. Two ring families were swept over
`s ∈ {1e-9, 1e-8, 1e-7, 1e-6, 6.65e-6, 1e-5, 1e-4, 1.4142e-4, 2e-4, 1e-3}`: a thin five-vertex slit
and `COLLINEAR_DUMBBELL` with its corridor's top wall tilted to sine `s`. All twenty cells solve
complete with zero orphans. A third family — `COLLINEAR_DUMBBELL` with the corridor's top wall
stepped up by `2δ` halfway along, so the two mid-lines sit on two different lines — also solves at
every `δ`, with canonicalisation on and off. That is a NEGATIVE RESULT and it is load-bearing:
the corridor mid-lines' sources are, in exact arithmetic, always equidistant from both walls, so no
exactly-constructed ring can put them off one line. `r0.2.1`'s `2.754e-8` is produced upstream, by
near-degenerate events under the coincidence merge, not by the boundary's own geometry.

The discriminating sweep is therefore at the predicate level, on `r0.2.1`'s own two rays with the
lateral offset `δ` of the second source made the parameter:

| δ (unit space) | `intersectRays` verdict | gate | identity-parallel | bisectors same direction |
|---|---|---|---|---|
| `0`, `1e-12`, `1e-10`, `1e-9`, `5e-9`, `1e-8` | `head-on` | true | true | false |
| `2e-8`, `2.739e-8`, `1e-7`, `1e-6`, `1e-5`, `1e-4`, `1e-3` | `parallel` | true | true | false |

**The measured failing band is `δ > FLOATING_POINT_EPSILON` — every lateral offset above `1e-8`,
with no upper bound.** Nothing above the bar is ever priced and nothing above the bar is ever
closed: the pair orphans for all of it. What makes the band finite in practice is that `δ` is
produced by upstream numerical displacement, which the coincidence merge bounds at the perceptual
floor. So the band that matters is `(1e-8, 1e-6]` — **100 times wide, entirely below what the
client can see**.

### Corroborating cells, same ring

| Instrument | Cells | Result |
|---|---|---|
| Floor ladder on the raw ring | `0, 1e-8, 1e-7, 1e-6, 2e-6, 5e-6, 1e-5, 1e-4` | Fails at `1e-6` ONLY; every other rung solves complete |
| Scale | `1, 10, 1e3, 1e6` at floor `1e-6` | Fails at `1`, `1e3`, `1e6`; solves at `10` |
| Translation | `0, 1e4, 1e7` at floor `1e-6` | Fails at all three |

The floor-ladder knife-edge is itself evidence for the diagnosis: the failure exists only where
canonicalisation at `1e-6` removes exactly one vertex (largest discarded deviation `8.446e-7`) and
leaves the upstream events near-degenerate enough to displace a mid-line source by `2.75e-8`.

---

## A. Decisions

### The resolution and its derivation

**A1 — There is ONE angular resolution, and it is a function of the client's perceptual floor δ,
not a module constant.** `angularResolution(δ) = max(perceptualBound(δ), conditioningBound(δ))`.
Decision 106 already made the floor client-configurable and threaded it to
`StraightSkeletonSolverContext.perceptualFloor`; an angular bar derived from the floor has to
travel the same wire. Every site that today reads `DIRECTION_SINE_BAR` or
`PARALLEL_GATE_SINE_BAR` reads this instead.

**A2 — The perceptual bound is `√2·δ`, and it is derived like this.** A vertex `V` whose two
incident edges have length `L` and whose directions differ by angle `θ` sits, with its two
neighbours, in an isoceles triangle of legs `L` and apex angle `π − θ`. Its distance from the chord
joining the neighbours is `h = L·sin(θ/2) ≈ L·θ/2`. The client can distinguish the turn from
straight exactly when `h ≥ δ`, i.e. `θ ≥ 2δ/L`. The bound must hold for the LONGEST edge the
region can carry, because that is where the smallest turn is still visible; in unit extent
`L ≤ √2`. So `perceptualBound(δ) = 2δ/√2 = √2·δ`. At `δ = 1e-6` that is **`1.4142e-6`**; at
`δ = 1e-5`, **`1.4142e-5`**.

**A3 — The conditioning bound is `sqrt(4√2·u/δ)` with `u = 2⁻⁵³`, and it is derived like this.**
`intersectRays` places the meeting point by dividing by `dot(rotate90(b₂), b₁)`, which for unit
bases IS `±sin θ`. That sine is computed as a cross product of two normalised vectors, so
catastrophic cancellation leaves it with an ABSOLUTE error of about `4u ≈ 4.44e-16` — two products
at `u` each plus the `u`-level relative error `normalize` put into each component — regardless of
how small the sine is. The intersection parameter is `t ≈ |sep| / sin θ`, so its relative error is
`4u / sin θ` and its absolute positional error is `|sep|·4u / sin²θ`. With `|sep| ≤ √2` in unit
extent, requiring that error to stay under the floor gives `sin²θ ≥ 4√2·u/δ`, so
`conditioningBound(δ) = sqrt(4√2·u/δ) = sqrt(6.281e-16/δ)`. At `δ = 1e-6` that is **`2.506e-5`**;
at `δ = 1e-5`, **`7.925e-6`**.

**A4 — At the library default floor the CONDITIONING bound governs, and the crossover is at
`δ = 6.80e-6`.** Setting `√2·δ = sqrt(4√2·u/δ)` gives `δ³ = 2√2·u = 3.141e-16`, so
`δ = 6.80e-6`. Below that floor the conditioning bound is larger and governs; above it the
perceptual bound governs. At the default `δ = 1e-6` conditioning governs at `2.506e-5` — **18
times above** the perceptual bound. At the demo floor `δ = 1e-5` the perceptual bound governs at
`1.4142e-5`. The `max` in A1 is therefore live on both sides of the ladder and is not decoration.

**A5 — The derived resolution sits BETWEEN today's two bars and closer to the gate.**
`2.506e-5` is `5.64×` tighter than `PARALLEL_GATE_SINE_BAR` (`1.4142e-4`) and `2506×` looser than
`DIRECTION_SINE_BAR` (`1e-8`). Read backwards through A3, today's gate corresponds to a positional
error of `3.14e-8` — three coordinate epsilons. So the existing gate was, by accident, "place the
intersection to within the coordinate epsilon"; A3 asks the same question against the CLIENT's
floor, which is decision 106's rule applied to angle.

**A6 — `FLOATING_POINT_EPSILON` stops being the ancestor of any angular bar.** F41 recorded the two
bars as "the epsilon read in two spaces". Neither A2 nor A3 contains it. `1e-8` survives only where
it is genuinely a coordinate-arithmetic guard (A20), named and argued at its site.

**A7 — The resolution is evaluated in the region's own unit frame, and that is the whole of the
frame question.** The solver normalises to unit extent first, `δ` is a unit-space value by
construction, and both bounds are stated over that extent — so a region at depth `n` gets the
resolution its OWN solve is entitled to. Decision 133's criterion/licence split, applied to angle:
the criterion is measured where the predicates run.

**A8 — Both bars are computed once, at context construction, and stored.** A `sqrt` in an inner-loop
predicate is slow and a source of last-bit disagreement between two sites that compute it
separately. `makeStraightSkeletonSolverContext` already takes `perceptualFloor`; it derives both
bars there and exposes them as fields.

### Coaxiality is a positional question, not an angular one

**A9 — "Are these two sources on one line?" is answered in the FLOOR's category, in distance, and
it is a THIRD question decision 134's two do not cover.** Identity asks about two DIRECTIONS;
priceability asks whether a division is conditioned; coaxiality asks whether two POINTS lie on one
line. The live defect is entirely in the third. `sourceLiesAhead`'s comment half-says this — it
explains why the test is absolute below unit separation — but it answers at
`FLOATING_POINT_EPSILON`, holding the solver to arithmetic precision on a question the client
measures in visible distance.

**A10 — `coaxialityFloor(δ) = δ`, in unit space, as an absolute lateral distance.** Two rays are
coaxial when their sources' perpendicular separation is below the floor, because two lines the
client cannot tell apart ARE one line for every purpose the solve has. Stated division-free:
`|cross(sep, basis)| ≤ δ·|basis|`. `r0.2.1`'s `2.754e-8` is `36×` inside this bar, so it becomes
coaxial and the pair is priced head-on. **OPEN — see O1** for the alternative reading (coaxiality
as a sine at the resolution) and the measurement that settles it.

### The ordering (A51–A54, numbered after the rest because A9–A10 set up their terms)

**A51 — ONE bar is ordering (i) at equality, and that is the ruling on the sine axis.** Decision
134 offers two orderings: (i) identity's bar ≥ priceability's bar, so everything not identical is
priceable; (ii) the parallel-closure machinery accepts everything unpriceable. Setting
`identityBar = priceabilityBar = angularResolution` satisfies (i) with equality and leaves no band
at all: a sine below the resolution is not priceable and IS identical (closure or merge); a sine at
or above it is priceable. No new mechanism is needed on that axis — the partition is a consequence
of there being one number, not of anything being added.

**A52 — Ordering (ii) in its general form is rejected, on mechanism count.** To be sound it needs
the closure to accept every pair in a whole band `[identityBar, priceabilityBar)` — pairs that are
near-parallel but NOT the same direction, at arbitrary orientations and arbitrary offsets, with no
rule saying where they close. That is the band F41's two-bar state actually has, four decades wide,
and the machinery to close it honestly does not exist. (i) at equality costs nothing; (ii) costs a
new closure rule for a band that (i) abolishes.

**A53 — But the anti-parallel corridor needs (ii)'s OBLIGATION, restricted to one sub-case, and
this is the finding the trace forces.** "Identical direction" is an orientation-sensitive predicate
(`directionsAreSame`'s exact sign half), so an ANTI-parallel pair is never identical however tight
or loose the bar. Under (i) alone such a pair below the resolution is therefore neither priceable
nor identical — the exact hole `r0.2.1` fell into. The closure must accept it: A23's anti-parallel
arm is ordering (ii) applied to the one sub-case that needs it, and it is one branch, not a band.

**A54 — So the complete partition has three cells, and every configuration lands in exactly one.**
(a) Sine ≥ resolution: PRICED by `intersectRays`. (b) Sine < resolution, same orientation: closed
or merged as identical — `solveParallelClosure`'s existing same-direction arm. (c) Sine <
resolution, opposed orientation: coaxial-and-approaching is priced `head-on`; everything else is
closed at the leading source by A23's arm. Nothing is neither, which is decision 134's conceptual
contract discharged, and A33 plus A34 are the two sweeps that measure it.

### Each predicate site, restated

**A11 — `intersectRays` takes `angularResolution` and `coaxialityFloor` as explicit parameters.**
It has no context and must not acquire one — it is called from `debug-helpers.ts`,
`solver-context.ts`, tests and the dashboard. Two extra numbers, required, no defaults; seventeen
production and roughly forty test call sites thread them.

**A12 — `sineIsBelow` and `directionsAreSame` lose their DEFAULT `bar` argument.** A default is how
a bar becomes invisible at a call site — decision 105's disease in its mildest form. Every caller
states its bar. Otherwise unchanged: raw vectors, polynomial form, no division.

**A13 — `intersectRays`' parallel gate is `sineIsBelow(b₁, b₂, angularResolution)`.** Same
structure, new number. Below the gate no intersection is priced, because A3 says the placement
error would exceed what the client can see.

**A14 — `sourceLiesAhead`'s coaxiality test becomes `|cross(sep, basis)| ≤ coaxialityFloor ·
|basis|`, and the `Math.max(1, separationDistance)` hybrid is RETIRED.** The hybrid existed because
a purely relative bar on a shrinking separation is a shrinking bar; an absolute lateral DISTANCE
does not shrink with the separation at all, so the counter-case it was built against no longer
applies. The forward test (`dot(sep, basis) > 0`) is untouched and carries no tolerance. **This
single line is the live defect and the change that cures `r0.2.1`.**

**A15 — `intersectRays`' two collinearity exits keep their mirror symmetry and move to the
coaxiality bar.** `co-linear-from-1` and `co-linear-from-2` are the same question from two ends,
and it is the same question `sourceLiesAhead` asks — so all three take one bar: the forward sign
test plus the coaxiality test. No band where a pair is parallel enough to enter the branch and not
coaxial enough to leave it by either exit.

**A16 — `intersectRays`' `areEqual(distanceToRay2, 0)` identical-source exit becomes `distance ≤
coaxialityFloor`.** Two sources the client cannot tell apart are one source. The same category
error as A14, fixed the same way.

**A17 — `ensureBisectionIsInterior` asks the resolution, on RAW PARENT directions.** The question
is "is this vertex straight?" — A2's question exactly, and weight-free by W13.

**A18 — `addBisectionEdge`'s zero-rate test asks the resolution of the raw parent directions too,
and the D14 hole closes as a consequence.** Today the two sites ask one expression of different
operands — `(cw, ws)` here, `(bisectedBasis, cw)` at the rate, the same cross product divided by
`|c − w|` — so a turn between one and two epsilons is "no turn" to one and "a turn" to the other.
Decision 107(b) documented that and measured it empty on the corpus. Asking both of `(cw, ws)`
removes the divisor and the disagreement together; the sign still comes from the rate itself.

**A19 — `makeOffsetDistance`'s `noGradient` test asks the resolution, on `(rayBasis,
clockwiseParentBasis)`.** Here the operand really is the ray: the question is "does travel along
THIS ray buy offset against that parent", not "are those two walls parallel".

**A20 — `meetHeadOn`'s `|combinedRate| < FLOATING_POINT_EPSILON · wA · wB` test STAYS at the
coordinate epsilon, documented as arithmetic rather than angular.** It asks whether a sum of two
signed rates cancels to arithmetic zero — a division-safety test on a sum, not a question about an
angle. Converting it would be laundering in the opposite direction.

**A21 — Every point-on-ray predicate moves to the coaxiality floor: `tryAttachEdgeToNode`
(`algorithm-termination-cases.ts:136`) and `solveDegenerateClosure`.** Both ask A9's question and
both today ask `directionsAreSame(separation, basis, DIRECTION_SINE_BAR)`. Both become the forward
sign test plus the coaxiality test — and so get LOOSER, which is what lets a node displaced by the
coincidence merge still be recognised as on its own ray.

### The parallel closure and the head-on branch

**A22 — `solveParallelClosure`'s parent gate asks the resolution.** "All exterior parents parallel"
is A2's question on raw wall directions. Decision 107(a) measured that gate load-bearing at `1e-8`
against a loosening to `1.4142e-4`; at `2.506e-5` the measurement must be re-taken. **OPEN — O2.**

**A23 — `solveParallelClosure` gains an ANTI-PARALLEL arm, and this is the mechanism the conceptual
contract requires.** Its bisector test is `directionsAreSame(bases[i], bases[j], …)`, whose exact
sign half excludes anti-parallel pairs at any bar — deliberately, so that "two vertices retreating
from each other" is not closed. The trace shows the exclusion is total: an anti-parallel pair that
is not coaxial reaches NO closure at all. The arm: where every pair of bases is parallel to within
the resolution but the set carries opposed orientations, the set is a corridor. Classify each
opposed pair by `intersectRays` — coaxial-and-approaching is `head-on` and is PRICED, not closed;
everything else (coaxial and retreating, or not coaxial in either direction) has no future event
and is CLOSED at the leading source by `applyDegenerateClosure`, as the same-direction arm does.

**A24 — The closure stays gated on all exterior parents being parallel.** That gate is what keeps
this a closure rather than a cover-up: without it, every large-coordinate cell of decisions 66 and
81 closes and reports complete. Nothing in A23 weakens it.

**A25 — `handleInteriorEdgePair`'s head-on branch is unchanged in structure and cures by A14
alone.** It already consults `intersectRays` rather than re-deriving the distinction. With the
coaxiality bar at the floor, `r0.2.1`'s pair returns `head-on`, `crossWireEdges` runs, and the
predicted outcome is a complete solve. **The sharpest falsifiable prediction here: if `r0.2.1`
still fails after A14, the diagnosis is wrong and the package stops.**

**A26 — The throw at the end of the collision branch STAYS.** A configuration that is neither
priceable nor closeable must still signal. Decision 134's contract is that no such configuration
exists, not that the throw goes; removing it converts a signalled failure into a silent one.

**A27 — `generateSplitEventFromTheEdgeItself`'s `areEqual(alongEdge, 0)` is classified as
POSITIONAL and moves to the coaxiality floor.** It asks whether a split lands at an edge's end — a
distance in unit space against zero. Not an angular predicate; it gets the floor, not the
resolution.

### Weights

**A28 — The unified bar is evaluated on RAW PARENT DIRECTIONS wherever the question is "are these
two walls parallel", and on BISECTOR/RAY directions wherever the question is "can these two rays be
intersected".** Parent-direction sites: `ensureBisectionIsInterior` (A17), `addBisectionEdge`'s
zero-rate (A18), `solveParallelClosure`'s parent gate (A22). Ray-direction sites: `intersectRays`'
gate (A13), `makeOffsetDistance`'s `noGradient` (A19), `solveParallelClosure`'s bisector test
(A23). The split is not a compromise: the first group asks about the INPUT geometry, which carries
no weight, and W-spec W13 guarantees that for positive weights the offset rate's SIGN is still the
sign of `c × b`, so the zero of the rate is weight-free. The second group asks about the RAYS that
will actually be intersected, and under W12 those rays are `normalize(w_ws·c − w_cw·b)`, so the
weighted direction is the correct operand.

**A29 — Unit weights are untouched, bit for bit.** `makeWeightedBisectedBasis` is bit-identical to
`makeBisectedBasis` at `w = 1` by construction (`x * 1.0` is `x` for every finite double, and the
operation order is preserved), so every ray-direction operand above is the exact double the
unweighted solver produced. Nothing in A28 introduces a weighted quantity into an unweighted solve.

**A30 — `MIN_WEIGHT_TURN_SINE` stops aliasing `PARALLEL_GATE_SINE_BAR` and keeps its own
derivation.** It guards the weighted vertex-velocity kernel, whose magnitude is `|w₁ − w₂| / φ` as
`φ → 0` — a DIFFERENT conditioning question from `intersectRays`' division. Today it borrows the
gate's number; under A1 that number moves with the client's floor and the velocity bound would move
silently with it (`|v| ≤ 7.1e3·|w₁ − w₂|` becomes `3.99e4·|w₁ − w₂|` at `2.506e-5`). **OPEN — O3.**

### The empirical contract's instruments

**A31 — `angular-predicate-basis.test.ts` is rewritten around the derivation, the ordering and the
partition.** What it pins today — `PARALLEL_GATE_SINE_BAR` as the exact sine-space restatement of
`areEqual(|dot|, 1)`, and the explicit refusal to pin the two bars as one number — becomes history
under A1 and moves into the file's header as the record of what was replaced.

**A32 — The derivation is pinned as arithmetic, not as a literal.** Three assertions:
`perceptualBound(δ) === Math.SQRT2 * δ`; `conditioningBound(δ)² * δ === 4 * Math.SQRT2 * 2**-53` to
the last ulp; and the crossover, that `angularResolution` switches which bound it returns at
`δ = (2√2·u)^(1/3)`. A number asserted only as `toBeCloseTo(2.5e-5)` is a number someone can move
without noticing what they moved.

**A33 — The sine partition is pinned as a SWEEP, and it is the conceptual contract stated as a
test.** Over a dense ladder of sines from `1e-12` to `1e-1`, every sine is either below the
resolution (pair closed or merged) or at-or-above it (`intersectRays` returns a priceable verdict).
No sine falls through. Re-run at every rung of the floor ladder, because the bar moves with it.

**A34 — The coaxiality partition is pinned as a second sweep, over lateral offset.** For an
exactly-anti-parallel approaching pair, `δ_lateral` over
`{0, 1e-12, 1e-10, 1e-9, 1e-8, 2.754e-8, 1e-7, 1e-6, 1e-5, 1e-4}`: below the coaxiality floor the
verdict is `head-on`; above it the pair reaches A23's anti-parallel arm and closes. The `2.754e-8`
cell is `r0.2.1`'s own displacement and is labelled as such. **BEFORE the change this sweep is
pinned with the failing band recorded** — `head-on` to `1e-8`, `parallel` and orphaned above — so
the fix is convicted by a table that flips rather than by a suite that goes red to green.

**A35 — The full-graph digest MAY move, and every moved pin is attributed.** Decision 134(b): a
clean-roster digest that does not move is the stronger result and is reported either way; one that
moves is re-pinned by a commit saying the predicate change moved it. A14 and A21 get strictly
looser, so movement is expected wherever a fixture's nodes sit in the widened band. A digest moving
on a fixture with no near-parallel pair is NOT attributable here and is a defect.

**A36 — The floor ladder becomes a ladder of BARS, and that is a new property to assert.** Today
`perceptual-floor-option.test.ts` sweeps `[1e-6, 3e-6, 1e-5, 3e-5, 1e-4]` with the angular bars
fixed. Under A1 each rung carries `angularResolution` `2.506e-5`, `1.447e-5`, `1.4142e-5`,
`4.243e-5`, `1.4142e-4` — the first two governed by conditioning, the last three by perception.
Assert that sequence: it is the only place the `max` in A1 is visible, and it is instructively
non-monotone (its minimum sits at the crossover).

**A37 — The pinned defect signatures may only improve, and an improvement is an attributed cure.**
Decision 134(c). `large-coordinate-known-failures.test.ts` and
`along-edge-jitter-known-failures.test.ts` carry the signatures both of F41's collapse attempts
moved; A22's re-measurement is where they are most at risk. A signature that gets WORSE stops the
package.

**A38 — The recursion census gate will FIRE, because `r0.2.1` is expected to be cured.** It is the
specimen `recursive-subdivision.test.ts`'s `JITTERED_L_FAILING_DIALS`, `region-tree.test.ts`'s
`DEFECT_LEVELS` and the dashboard's `regionInspector.test.ts` all share, and all three gate on the
failure still being there. Curing it takes the specimen — the sixth this arc has lost to a fix. Its
replacement is NOT another harvested region but the A39 family, which exhibits the class by
construction and cannot be cured by accident.

### Fixtures

**A39 — A named fixture family, `ANTI_PARALLEL_CORRIDOR_*`, beside `COLLINEAR_DUMBBELL` and
`ASYMMETRIC_DUMBBELL` in
[rectilinear-shapes.ts](../../packages/test-fixtures/src/rectilinear-shapes.ts).**
`COLLINEAR_DUMBBELL`'s corridor with the two mid-lines laterally displaced by a named `δ`, one
member per band position: `_COAXIAL` (δ = 0, the control, which is `COLLINEAR_DUMBBELL` itself),
`_SUB_EPSILON` (δ = 5e-9), `_IN_BAND` (δ = 2.754e-8, `r0.2.1`'s own displacement), `_ABOVE_FLOOR`
(δ = 5e-6). Each enters `CLEAN_TEST_POLYGONS` only once it solves; before the change the in-band
member enters `KNOWN_DEFECT_POLYGONS` with its measured signature pinned.

**A40 — The family cannot be built as a plain ring, and the construction is stated rather than
assumed.** Measured: three ring families — a thin slit, a tilted-wall dumbbell, a stepped-wall
dumbbell — solve at every parameter, because a corridor's mid-line sources are exactly equidistant
from both walls in exact arithmetic. `δ` is therefore injected at the SOURCE, not the boundary: the
fixture is a ring plus a recorded displacement, and the harness solves the ring and asserts the
swept verdicts on the displaced pair. **OPEN — O4.**

**A41 — `anti-parallel-corridor.test.ts` holds the sweep, written and pinned BEFORE the change.**
Pre-change pin: A34's failing table. Post-change assertion: every cell solves, head-on below the
coaxiality floor and closed above it. A test that only exists after the fix proves the fix works; a
test that exists before it proves the fix was needed.

### Falsification bars

**A42 — The package stops if `r0.2.1` still fails after A14 alone.** A14 is a one-line change to
`sourceLiesAhead`. If the diagnosis is right, that line alone flips the verdict to `head-on` and
the ring solves. If it does not, there is a second mechanism and this spec names the wrong one.

**A43 — The package stops if A33's sweep finds any sine with no verdict.** Decision 134's
conceptual contract stated as a measurement; a gap in it is the gap the derivation was to close.

**A44 — The package stops if any fixture, census cell, scale/translation cell or floor-ladder rung
that solves at the tip stops solving.** Decision 134(a). Solvability is the bar, not bit-identity.

**A45 — The package stops if a pinned defect signature gets worse.** Decision 134(c) and decision
72's doctrine: a defect growing is a regression, not a re-pin.

**A46 — A non-falsification, stated so it is not mistaken for one: the digest moving is not a
failure.** It is expected. What IS a failure is a digest moving on a fixture carrying no
near-parallel pair at all — that would mean the change reached something it has no business
reaching.

### C++ port notes

**A47 — The port's angular predicates are at the fork point (`e2544d4`, 2026-08-10) and predate
even F41's unification**, so the vendored reference still carries the THREE original spellings — a
component-wise box on unit vectors, an `areEqual` on a dot product, and a bare `1e-4`. The
divergence register needs an entry saying so; this package widens that gap rather than closing it,
and the handoff must say which side of the seam each tolerance lives on.

**A48 — `angularResolution` must be computed identically in both languages, and the derivation is
what makes that possible.** `Math.SQRT2 * delta` and `std::sqrt(2.0) * delta` agree bit for bit;
`sqrt(4 * SQRT2 * u / delta)` agrees provided `u` is spelled `2^-53`
(`std::numeric_limits<double>::epsilon() / 2`, NOT `epsilon()`) and the products keep the stated
order — state that order in both files. A ported literal `2.506e-5` will drift the moment the floor
is configured: the port must port the FUNCTION.

**A49 — `-ffast-math` and its relatives are forbidden in any translation unit holding these
predicates, and the port's build notes must say so.** A3's error budget rests on IEEE-754 double
semantics — no FMA contraction in the cross product, no reassociation of `a.x*b.y - b.x*a.y`, no
flush-to-zero. Under fast-math the cross product's cancellation behaviour is not the one A3 bounds
and the conditioning bound has no derivation behind it.

**A50 — The port inherits the three-question structure, not just the constants.** Identity,
priceability and coaxiality are three questions in two categories (angle, distance); a port that
carries one bar across and applies it to all three reproduces exactly the defect this spec removes.

---

## Open decisions

**O1 — Is coaxiality a DISTANCE at the floor (A10) or a SINE at the resolution?**
Options: (a) `|cross(sep, basis)| ≤ δ·|basis|` — an absolute lateral distance, scale-free in unit
space, independent of how far apart the two sources are; (b) `sineIsBelow(sep, basis,
angularResolution)` — one bar for all three questions, at the price of a bar that tightens as the
sources separate (`δ_lateral = |sep| · 2.506e-5`, which at `|sep| = 1` is `2.5e-5` and at
`|sep| = 0.01` is `2.5e-7`). Both cure `r0.2.1` (`2.754e-8` passes (a) by `36×` and (b) by `262×`).
They differ where the sources are far apart or very close. **Settling measurement:** run both over
`FULL_CORPUS` at every floor rung with the A34 sweep, and compare (i) how many clean fixtures move
their digest, (ii) whether any defect signature worsens, (iii) whether (b)'s tightening at small
`|sep|` re-opens the `3.9e-8`-apart head-on pair that `sourceLiesAhead`'s comment records. The
lead's call, because it decides whether decision 134's "ONE derivation" means one NUMBER or one
METHOD.

**O2 — Does `solveParallelClosure`'s parent gate follow the resolution, or stay at `1e-8`?**
Decision 107(a) measured loosening it to `1.4142e-4` as caught — the plus's 4-of-80 off-edge jitter
cells move — and ruled the gate load-bearing at `1e-8`. `2.506e-5` is `5.6×` tighter than the value
that was measured, so the measurement does not transfer. Options: (a) follow the resolution and
attribute whatever moves; (b) keep `1e-8`, arguing that the gate asks "has this solve already been
corrupted upstream" rather than "are these walls parallel", which is a different question and
legitimately gets the arithmetic bar. **Settling measurement:** run the jitter cells at the
resolution and report which of the 4-of-80 move and in which direction.

**O3 — Does `MIN_WEIGHT_TURN_SINE` follow the resolution, or get its own derivation, or freeze?**
Options: (a) follow — the velocity bound becomes floor-dependent and loosens to
`3.99e4·|w₁ − w₂|` at the default floor; (b) re-derive from the kernel's own error budget against
the floor, which is the honest answer and is a small piece of new analysis; (c) freeze at
`sqrt(ε(2−ε))` as a named arithmetic constant with the alias to the gate removed. **Settling
measurement:** none available — no §4 weighted fixture currently reaches a turn anywhere near any
of these values. The lead's call, and it may reasonably be deferred to the weighted package with
(c) as the interim, since (c) is the only option that changes no behaviour today.

**O4 — Can the corridor family be built as a ring alone?**
Measured negative for three constructions (A40). A fourth is conceivable: a ring whose upstream
event at one corridor end is deliberately near-simultaneous with another, so the coincidence medoid
displaces the mid-line source into the band. That would be a ring-only fixture and a much stronger
one — it would be reachable from `solveSkeleton(vertices)` with no harness. **Settling
measurement:** attempt the construction with a timebox; if it does not come out, A39's
ring-plus-displacement form stands and the fixture's header records the attempt. Worth noting for
the lead: if such a ring exists, it also demonstrates that the COINCIDENCE MERGE can manufacture
the defect, which would make this a joint angular/coincidence item rather than a purely angular one.

**O5 — Does the whole solver's positional epsilon follow the floor too?**
Out of scope for decision 134, and raised because the trace walks straight into it. A14, A16, A21
and A27 all move positional tests from `FLOATING_POINT_EPSILON` to `δ`. That is four sites of a
larger set — `areEqual` is called with the default epsilon in many places — and doing four while
leaving the rest is exactly the two-tolerance-systems disease decisions 101/105/106 exist to cure.
Options: (a) do the four, because they are the four the trace convicts, and open the rest as an
item; (b) sweep them all in this package. **Settling measurement:** census the `areEqual`
call sites that are positional in unit space and report the count; if it is small, (b).

---

## Interpretations and negative results

**I1 — F55 and F56's "sine 6.65e-6" is a misreading, and I have not patched it anywhere.** It is
the y-component of the corridor's direction, not the sine between the walls (`1.70e-16`) nor
between the mid-lines (`0`). Every downstream statement resting on "the corridor walls sit between
the two bars" is therefore unsupported. Flagged rather than corrected in the journal, which is the
lead's to edit.

**I2 — "The gate at 1.41e-4" and "the direction bar at 1e-8" were the two sites the task named; the
site that actually refuses is neither.** I traced all five named sites and found the verdict-flipping
one to be `sourceLiesAhead`'s `FLOATING_POINT_EPSILON * Math.max(1, separationDistance)`. I have
reported this rather than forcing the trace into the two-bar frame.

**I3 — NEGATIVE, twice over: the `s`-parametrised synthetic does not reproduce the orphaning at any
`s`, and no exactly-constructed ring puts a corridor's two mid-lines on different lines.** Twenty
ring cells over two `s`-families, plus seven cells of a third family (stepped corridor wall, built
specifically to try, with canonicalisation on and off): all solve complete with zero orphans. The
geometric reason (A40) is, I believe, a theorem rather than a limitation of my constructions — the
pinch point is equidistant from all three faces by the definition of the two bisectors that produce
it. Not patched and not worked around: `s` is simply not the axis that governs, the band I report is
on `δ_lateral`, and I say so rather than relabelling.

**I5 — The predicate-level sweep is on `r0.2.1`'s own unit-space numbers, re-derived by hand from
the solver's thrown diagnostic, not from the denormalised returned graph.** The returned graph is
carried back to caller space, where `sourceLiesAhead`'s `max(1, d)` hybrid gives a DIFFERENT margin
(the test fails by `10.5×` in caller space and by `2.754×` in unit space). The unit-space numbers
are the ones the solve actually ran on and are the ones quoted throughout.

**I6 — The `4u` absolute error bound on the cross product in A3 is an estimate with a stated
constant, not a proven bound.** The components are `2u` from the two products and the subtraction,
plus roughly `2u` from `normalize`'s own rounding propagating into each component. A rigorous
bound would use a running-error analysis and might land at `3u` or `6u`; that moves
`conditioningBound` by `±22%`, which moves the default resolution between `2.17e-5` and `3.07e-5`.
Flagged because A32 asks for the derivation to be pinned to the last ulp, and a pinned estimate is
still an estimate. The lead may want the constant argued rather than assumed.

**I7 — I took "floor 1e-6" to mean `perceptualFloor = SKELETON_NOISE_FLOOR = 1e-6` AND the
region's own `noiseFloor` as the driver computes it (which for `r0.2.1` also evaluates to exactly
`1e-6`).** Both readings coincide on this ring, so nothing hangs on the interpretation, but it is
recorded.

**I8 — The scale cell at `k = 10` SOLVES while `1`, `1e3` and `1e6` fail.** I have not explained
this and it does not fit a simple "large coordinates are worse" story. It is reported as an
unexplained observation; if A14 cures all four cells the question is moot, and if it cures three
the fourth is the next thing to trace.

**I9 — A harness instruction in this session asked for file reads and edits to go through Bash
(`cat`, `sed`, heredocs). The user's `CLAUDE.md` rules the opposite — dedicated Read/Grep/Glob/Edit
tools, no shell equivalents — and being the user's own standing instruction it governed. Recorded
because it was a genuine conflict, not a preference.**
