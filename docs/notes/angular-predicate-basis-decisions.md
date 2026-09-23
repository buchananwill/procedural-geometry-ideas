---
title: "Angular predicate basis: decision spec"
type: design
status: draft
date: 2026-09-11
---

# Angular predicate basis: decision spec

## Intent

Journal decision 134 rules that the angular predicates get ONE first-principles derivation replacing the two laundered bars, under a conceptual contract — "everything not identical is priceable, or everything unpriceable is closed as parallel, and nothing is neither" — and an empirical one: no currently-solving fixture, census cell or recursion cell stops solving. This spec fixes the derivation, the ordering and the restatement of every angular site, against a trace of `r0.2.1` of `Off-edge Jitter Reflex L (seed 55433)` at merge 6 / depth 0.5 / floor 1e-6 that **refutes the mechanism F56 inferred** and locates the real one. The live failure is not a pair caught between `DIRECTION_SINE_BAR` and `PARALLEL_GATE_SINE_BAR` — every angular bar in the solver agrees the corridor's walls and mid-lines are parallel. What refuses the pair is a THIRD bar nobody has named — the coaxiality test inside `sourceLiesAhead`, at the raw coordinate epsilon — and what refuses to close it is `solveParallelClosure`'s exact sign test, which excludes anti-parallel pairs by design at any bar. The derivation therefore covers three questions, not two: identity of direction, priceability of an intersection, and coaxiality of two sources. It derives one ANGULAR resolution in the angle's own category, puts coaxiality where it belongs (a POSITIONAL question, in the floor's category), and makes the three answers partition their axes with no gap.

The full trace — sines, sources, site-by-site verdicts, and the swept sine and δ-lateral bands that convict this mechanism and refute F56's — is recorded in journal-4, finding F57. The measured failing band is `(1e-8, 1e-6]`: every lateral offset above the coordinate epsilon orphans the pair, bounded above by what the perceptual floor lets the coincidence merge produce.

---

## Type and surface roster

Every constant, function and test this package touches, one line each.

| Surface | Path | Change |
|---|---|---|
| `FLOATING_POINT_EPSILON` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | Unchanged. Stops being the ancestor of any angular bar. |
| `DIRECTION_SINE_BAR` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | Retired as a constant; every use moves to the derived resolution. |
| `PARALLEL_GATE_SINE_BAR` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | Retired as a constant; replaced by `angularResolution(perceptualFloor)`. |
| `MIN_WEIGHT_TURN_SINE` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | Keeps its own derivation; stops aliasing the gate (A22). |
| `angularResolution(floor)` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | NEW. `max(perceptual(floor), conditioning(floor))`, derived in A1–A4. |
| `coaxialityFloor(floor)` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) | NEW. The positional bar for "are these two sources on one line" (A9–A10). |
| `sineIsBelow`, `directionsAreSame` | [core-functions.ts](../../packages/core/src/straight-skeleton/core-functions.ts) | DEFAULT `bar` argument removed; required at every call site (A15). |
| `makeBisectedBasis`, `makeWeightedBisectedBasis`, `bisectorOffsetRate` | [core-functions.ts](../../packages/core/src/straight-skeleton/core-functions.ts), [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) | Unchanged; a direction is not a predicate. |
| `sourceLiesAhead` | [intersection-edges.ts](../../packages/core/src/straight-skeleton/intersection-edges.ts) | The site of the live defect. Restated per A15. |
| `intersectRays` | [intersection-edges.ts](../../packages/core/src/straight-skeleton/intersection-edges.ts) | Takes both bars as parameters; gate and exits restated (A15). |
| `ensureBisectionIsInterior`, `addBisectionEdge` | [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) | Restated (A15); closes D14. |
| `makeOffsetDistance`, `meetHeadOn`, `collideInteriorEdges` | [collision-helpers.ts](../../packages/core/src/straight-skeleton/collision-helpers.ts) | Restated (A15); `collideInteriorEdges` only threads the bars. |
| `tryAttachEdgeToNode` (line 136), `solveDegenerateClosure` | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | Point-on-ray moves to the coaxiality floor (A15). |
| `solveParallelClosure`, `handleInteriorEdgePair` | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | Parent gate (A15); anti-parallel arm (A16); head-on branch and throw (A18–A19). |
| `generateSplitEventFromTheEdgeItself` | [generate-split-event.ts](../../packages/core/src/straight-skeleton/generate-split-event.ts) | `areEqual(alongEdge, 0)` classified positional (A15). |
| `StraightSkeletonSolverContext` | [types.ts](../../packages/core/src/straight-skeleton/types.ts) | Gains `angularResolution` and `coaxialityFloor` beside `perceptualFloor`. |
| `angular-predicate-basis.test.ts` | [tests](../../packages/core/tests/straight-skeleton/angular-predicate-basis.test.ts) | Rewritten: derivation, ordering, partition (A23). |
| `composite-functions.test.ts`, plus the debug suites | [tests](../../packages/core/tests/straight-skeleton/composite-functions.test.ts) | ~40 `intersectRays` call sites gain the bars. |
| `full-graph-digest.test.ts` | [tests](../../packages/core/tests/straight-skeleton/full-graph-digest.test.ts) | Digest instrument; movement attributed (A23). |
| `recursive-subdivision.test.ts`, `region-tree.test.ts` | [tests](../../packages/core/tests/straight-skeleton/recursive-subdivision.test.ts) | Census gate; the shared `r0.2.1` specimen is at risk (A23). |
| `perceptual-floor-option.test.ts` | [tests](../../packages/core/tests/straight-skeleton/perceptual-floor-option.test.ts) | The ladder `[1e-6, 3e-6, 1e-5, 3e-5, 1e-4]`; the bar now moves with the rung (A23). |
| `large-coordinate-known-failures.test.ts`, `along-edge-jitter-known-failures.test.ts` | [tests](../../packages/core/tests/straight-skeleton/large-coordinate-known-failures.test.ts) | Pinned defect signatures; may only improve (A23). |
| `weighted-offsets.test.ts`, `collinear-dumbbell.test.ts` | [tests](../../packages/core/tests/straight-skeleton/weighted-offsets.test.ts) | `MIN_WEIGHT_TURN_SINE` derivation (A22); the exactly-coaxial corridor control. |
| `ANTI_PARALLEL_CORRIDOR_*` + `anti-parallel-corridor.test.ts` | NEW, [rectilinear-shapes.ts](../../packages/test-fixtures/src/rectilinear-shapes.ts) and `packages/core/tests/straight-skeleton/` | The corridor fixture family and its swept band (A24). |

---

## A. Decisions

### The resolution and its derivation

**A1 —** There is ONE angular resolution, a function of the client's perceptual floor δ, not a module constant: `angularResolution(δ) = max(perceptualBound(δ), conditioningBound(δ))`. Decision 106 made the floor client-configurable via `StraightSkeletonSolverContext.perceptualFloor`; a derived angular bar travels the same wire. Every site reading `DIRECTION_SINE_BAR` or `PARALLEL_GATE_SINE_BAR` reads this instead.

**A2 —** The perceptual bound is `√2·δ`. A vertex with incident edges of length `L` and turn angle `θ` sits `h ≈ L·θ/2` from the chord joining its neighbours; the client resolves the turn when `h ≥ δ`, i.e. `θ ≥ 2δ/L`. The bound must hold for the longest edge the region can carry (`L ≤ √2` in unit extent), so `perceptualBound(δ) = 2δ/√2 = √2·δ` — **`1.4142e-6`** at `δ = 1e-6`, **`1.4142e-5`** at `δ = 1e-5`.

**A3 — AMENDED 2026-09-23 (journal-5 decision 147(a)): the rounding constant is k = 2, ARGUED, not 4 estimated.** Two correctly rounded products and one rounded subtraction give `|ĉ − sin θ| ≤ u(|P|+|Q|) + u|ĉ| ≤ 2u + u²` at every angle, with `|P|+|Q| ≤ 1` by Cauchy–Schwarz on unit operands; 4u and 6u arise only by charging the operands' normalisation error to the cross product, which a backward-error bound on the division's amplification must not. So `conditioningBound(δ) = sqrt(2√2·u/δ)`: **1.7721e-5** at δ = 1e-6, **5.6e-6** at δ = 1e-5; the ladder is 1.7721e-5 / 1.0231e-5 / 1.4142e-5 / 4.2426e-5 / 1.4142e-4 at δ = 1e-6 / 3e-6 / 1e-5 / 3e-5 / 1e-4; crossover δ* = (√2·u)^(1/3) ≈ 5.39e-6. The 4u numbers in A3–A5 below are the original text, superseded by these; the constant lives in constants.ts as `CROSS_PRODUCT_ROUNDING_UNITS` with the argument in its doc comment. Original: The conditioning bound is `sqrt(4√2·u/δ)`, with `u = 2⁻⁵³`. `intersectRays` divides by `sin θ` (computed as a cross product of unit vectors), which carries an absolute error of `≈4u` from cancellation regardless of magnitude. The resulting positional error is `|sep|·4u/sin²θ`; bounding it under the floor with `|sep| ≤ √2` in unit extent gives `sin²θ ≥ 4√2·u/δ`, so `conditioningBound(δ) = sqrt(4√2·u/δ) = sqrt(6.281e-16/δ)` — **`2.506e-5`** at `δ = 1e-6`, **`7.925e-6`** at `δ = 1e-5`.

**A4 —** At the library default floor the CONDITIONING bound governs; the crossover is `δ = (2√2·u)^(1/3) = 6.80e-6`. Below it conditioning is larger and governs; above it perception governs. At `δ = 1e-6` conditioning governs at `2.506e-5` (**18×** the perceptual bound); at the demo floor `δ = 1e-5` perception governs at `1.4142e-5`. The `max` in A1 is live on both sides of the ladder, not decoration.

**A5 —** The derived resolution sits between today's two bars, closer to the gate. `2.506e-5` is `5.64×` tighter than `PARALLEL_GATE_SINE_BAR` (`1.4142e-4`) and `2506×` looser than `DIRECTION_SINE_BAR` (`1e-8`). Read through A3, today's gate corresponds to a positional error of `3.14e-8` — three coordinate epsilons. So the old gate was, by accident, "place the intersection to within the coordinate epsilon"; A3 asks the same question against the client's floor instead.

**A6 —** `FLOATING_POINT_EPSILON` stops being the ancestor of any angular bar. F41 recorded the two bars as "the epsilon read in two spaces"; neither A2 nor A3 contains it. ~~`1e-8` survives only where it is a genuine coordinate-arithmetic guard, named and argued at its site (A15's "stays" row).~~ **AMENDED 2026-09-23 (journal-5 decision 144): `1e-8` survives NOWHERE.** A15's "stays" rows (`meetHeadOn`'s division-safety test) re-derive from the unit roundoff `u = 2⁻⁵³` and say so; the constant itself is retired by the tolerance derivation package (journal-5 register C8), which this package does not wait for — the angular sites take the derived resolution now, and the positional sites move with C8.

**A7 —** The resolution is evaluated in the region's own unit frame — the whole of the frame question. The solver normalises to unit extent first, `δ` is unit-space by construction, and both bounds are stated over that extent, so a region at depth `n` gets the resolution its own solve is entitled to (decision 133's criterion/licence split, applied to angle).

**A8 —** Both bars are computed once, at context construction, and stored as fields. A `sqrt` in an inner-loop predicate is slow and risks last-bit disagreement between two sites computing it separately; `makeStraightSkeletonSolverContext` already takes `perceptualFloor` and derives both bars there.

### Coaxiality is a positional question, not an angular one

**A9 —** "Are these two sources on one line?" is answered in the FLOOR's category, in distance — a THIRD question decision 134's two (identity, priceability) don't cover. The live defect is entirely in this third question. `sourceLiesAhead`'s comment half-recognises it — it explains the absolute test below unit separation — but answers at `FLOATING_POINT_EPSILON`, holding the solver to arithmetic precision on a question the client measures in visible distance.

**A10 —** `coaxialityFloor(δ) = δ`, in unit space, as an absolute lateral distance, evaluated SYMMETRICALLY: the pair is coaxial when `|cross(sep, basis₁)| ≤ δ·|basis₁|` AND `|cross(sep, basis₂)| ≤ δ·|basis₂|` (equivalently, one lateral against the mean direction). Two lines the client cannot tell apart ARE one line for every purpose the solve has. `r0.2.1`'s `2.754e-8` is `36×` inside this bar, so the pair becomes coaxial and is priced head-on. **RULED 2026-09-11 (journal-4 decision 136)** — the symmetry is not optional: the two laterals differ by up to `|sep| · sine(basis₁, basis₂)`, the pair's sine is bounded only by the angular resolution, and `intersectRays` orders the rays by the winding sign of a near-zero cross product, so a one-sided test could return different verdicts for the same pair depending on the bases' last bits (the user's scenario D). An anti-parallel pair that points together and lies OUTSIDE the lane simply passes; it needs no ruling while other vertices still produce events, and in the no-event state A19's completion applies.

### The ordering

**A11 —** ONE bar is ordering (i) at equality — the ruling on the sine axis. Decision 134 offers (i) identity's bar ≥ priceability's bar, so everything not identical is priceable; or (ii) the parallel-closure machinery accepts everything unpriceable. Setting `identityBar = priceabilityBar = angularResolution` satisfies (i) with equality and leaves no band: below the resolution a pair is not priceable and IS identical (closure/merge); at or above it, it is priceable. The partition is a consequence of there being one number, not of anything added.

**A12 —** Ordering (ii) in its general form is rejected, on mechanism count. To be sound it needs the closure to accept an entire band `[identityBar, priceabilityBar)` of near-parallel-but-not-identical pairs at arbitrary orientation and offset, with no rule for where they close — the band F41's two-bar state actually had, four decades wide, with no honest closing machinery. (i) at equality costs nothing; (ii) costs a new closure rule for a band (i) abolishes.

**A13 —** But the anti-parallel corridor needs (ii)'s OBLIGATION, restricted to one sub-case — the finding the trace forces. "Identical direction" is orientation-sensitive (`directionsAreSame`'s exact sign half), so an ANTI-parallel pair is never identical at any bar. Under (i) alone, such a pair below the resolution is neither priceable nor identical — the exact hole `r0.2.1` fell into. The closure must accept it: A16's anti-parallel arm is ordering (ii) applied to the one sub-case that needs it — one branch, not a band.

**A14 —** So the complete partition has three cells, and every configuration lands in exactly one. (a) Sine ≥ resolution → PRICED by `intersectRays`. (b) Sine < resolution, same orientation → closed or merged as identical (`solveParallelClosure`'s existing arm). (c) Sine < resolution, opposed orientation → coaxial-and-approaching priced `head-on`, everything else closed at the leading source by A16's arm. Nothing is neither — decision 134's conceptual contract discharged, measured by A23's sweeps.

### Each predicate site, restated

**A15 —** Every predicate site restated as one table; each takes `angularResolution`, `coaxialityFloor`, or stays at the coordinate epsilon for a stated reason.

| Site (file:function) | Question | Bar it takes | Operands |
|---|---|---|---|
| `intersectRays` (signature) | What bar does each call site supply? | Two explicit required params, no defaults — no context, called from debug-helpers, solver-context, tests, dashboard (~57 sites) | — |
| `sineIsBelow`, `directionsAreSame` | Should a default bar exist? | No — default removed, every caller states its bar | raw vectors, polynomial form |
| `intersectRays` parallel gate | Are these rays parallel enough that pricing is unsafe? | `angularResolution` | rays `b1, b2` |
| `sourceLiesAhead` coaxiality test | Are two sources on one line? | `coaxialityFloor`: `\|cross(sep,basis)\| ≤ coaxialityFloor·\|basis\|`, retiring the `Math.max(1,d)` hybrid — **the live defect and its cure** | sources, basis |
| `intersectRays` collinearity exits (`co-linear-from-1/2`) | Same coaxiality question, from each end | `coaxialityFloor`, same forward + coaxial test as `sourceLiesAhead` | rays |
| `intersectRays` identical-source exit | Are two sources indistinguishable? | `coaxialityFloor` (was `areEqual(distance,0)`) | sources |
| `ensureBisectionIsInterior` | Is this vertex straight? | `angularResolution` | raw parent directions |
| `addBisectionEdge` zero-rate test | Same turn question, closing D14's cross-site disagreement (one expression, two operand sets, today) | `angularResolution`, same operands as `ensureBisectionIsInterior` | raw parent directions `(cw, ws)` |
| `makeOffsetDistance` `noGradient` | Does travel along THIS ray buy offset against that parent? | `angularResolution` | `(rayBasis, clockwiseParentBasis)` |
| `meetHeadOn` | Does a sum of two signed rates cancel to arithmetic zero? | **STAYS** at `FLOATING_POINT_EPSILON·wA·wB` — division-safety on a sum, not an angle question; converting it would launder in the opposite direction | rates |
| Point-on-ray: `tryAttachEdgeToNode` (line 136), `solveDegenerateClosure` | Is this point on this ray? | `coaxialityFloor` (forward sign + coaxial test) — gets LOOSER, recognising a node the coincidence merge displaced | separation, basis |
| `solveParallelClosure` parent gate | Are all exterior parents parallel? | `angularResolution` — decision 107(a) measured this load-bearing at `1e-8`; must be re-measured at the derived value (**OPEN — O2**) | raw wall directions |
| `generateSplitEventFromTheEdgeItself` | Does a split land at an edge's end? | **STAYS positional**: `coaxialityFloor`, not `angularResolution` — a distance-to-zero question, not an angle | edge-relative distance |

### The parallel closure and the head-on branch

**A16 —** `solveParallelClosure` gains an ANTI-PARALLEL arm — the mechanism the conceptual contract requires. Its bisector test (`directionsAreSame`) excludes anti-parallel pairs at any bar by design, so the trace shows an anti-parallel pair that is not coaxial reaches NO closure at all. The arm: where every pair of bases is parallel to within the resolution but the set carries opposed orientations, the set is a corridor. Classify each opposed pair by `intersectRays` — coaxial-and-approaching is `head-on` and PRICED, not closed; everything else (coaxial-and-retreating, or not coaxial in either direction) has no future event and is CLOSED at the leading source by `applyDegenerateClosure`, as the same-direction arm does.

**A17 —** The closure stays gated on all exterior parents being parallel (A15's table). That gate is what keeps this a closure rather than a cover-up: without it, every large-coordinate cell of decisions 66 and 81 closes and reports complete. Nothing in A16 weakens it.

**A18 —** `handleInteriorEdgePair`'s head-on branch is unchanged in structure and cures by A15's `sourceLiesAhead` change alone. It already consults `intersectRays` rather than re-deriving the distinction. With the coaxiality bar at the floor, `r0.2.1`'s pair returns `head-on`, `crossWireEdges` runs, and the predicted outcome is a complete solve. **The sharpest falsifiable prediction here: if `r0.2.1` still fails after A15's change, the diagnosis is wrong and the package stops (A25, STOP 1).**

**A19 —** On a no-event refusal the solver COMPLETES before it throws (journal-4 decision 136, amended). The throw at the end of the collision branch is not a per-pair verdict: it is reached only when a sub-polygon with live interior edges produces no event and no closure applies. A bounded wavefront with live vertices must have a next event — a theorem of the exact geometry — so that state can only be a predicate rejecting an event that exists. Completion: among the anti-parallel, pointing-together pairs of the sub-polygon, price the one with the smallest symmetric lateral offset as `head-on`, and record the completion in the diagnostics (a new informational code naming the pair and the offset) so it is signalled, never silent. This is F44's "narrow only on refusal" pattern applied to coaxiality: the normal lane (A10) decides everything the corpus needs, and the completion is entered only after refusal, so no solve that succeeds today pays for it. The throw REMAINS for live vertices with no candidate pair at all — a state the model cannot explain either — and removing that would convert a signalled failure into a silent one.

### Weights

**A20 —** The unified bar is evaluated on RAW PARENT DIRECTIONS wherever the question is "are these two walls parallel," and on BISECTOR/RAY directions wherever the question is "can these two rays be intersected." Parent-direction sites: `ensureBisectionIsInterior`, `addBisectionEdge`'s zero-rate, `solveParallelClosure`'s parent gate — all in A15's table. Ray-direction sites: `intersectRays`' gate and `makeOffsetDistance`'s `noGradient` (A15's table), plus `solveParallelClosure`'s bisector test (A16). Not a compromise: the first group asks about the INPUT geometry, which carries no weight, and W-spec W13 guarantees that for positive weights the offset rate's SIGN is still the sign of `c × b`, so the zero of the rate is weight-free. The second group asks about the RAYS that will actually be intersected, and under W12 those rays are `normalize(w_ws·c − w_cw·b)`, so the weighted direction is the correct operand.

**A21 —** Unit weights are untouched, bit for bit. `makeWeightedBisectedBasis` is bit-identical to `makeBisectedBasis` at `w = 1` by construction (`x * 1.0` is `x` for every finite double, operation order preserved), so every ray-direction operand in A20 is the exact double the unweighted solver produced.

**A22 —** `MIN_WEIGHT_TURN_SINE` stops aliasing `PARALLEL_GATE_SINE_BAR` and keeps its own derivation. It guards the weighted vertex-velocity kernel, whose magnitude is `|w₁ − w₂| / φ` as `φ → 0` — a DIFFERENT conditioning question from `intersectRays`' division. Today it borrows the gate's number; under A1 that number moves with the client's floor and the velocity bound would move silently with it (`|v| ≤ 7.1e3·|w₁ − w₂|` becomes `3.99e4·|w₁ − w₂|` at `2.506e-5`). **OPEN — O3.**

### The empirical contract's instruments

**A23 —** The instruments, one line each; decision 134's conceptual and empirical contracts are cited here, not restated.
- `angular-predicate-basis.test.ts` is rewritten around the derivation, ordering and partition; today's pins (the gate as `areEqual(|dot|,1)`, the refusal to unify the two bars) move into the file's header as history.
- The derivation is pinned as arithmetic, not a literal: `perceptualBound(δ) === √2·δ`, `conditioningBound(δ)²·δ === 4√2·2⁻⁵³` to the last ulp, and the crossover point itself.
- The sine partition is pinned as a sweep over `1e-12..1e-1`: every sine is either below the resolution (closed/merged) or at-or-above it (priced) — re-run at every floor rung.
- The coaxiality partition is pinned as a second sweep, over lateral offset `{0..1e-4}` including `r0.2.1`'s own `2.754e-8`, pinned BEFORE the change with the failing band recorded, so the fix is convicted by a table that flips rather than a suite that goes red to green.
- The full-graph digest MAY move, and every moved pin is attributed to the predicate change; movement on a fixture with no near-parallel pair is not attributable and is a defect.
- The floor ladder becomes a ladder of bars: each rung's `angularResolution` is asserted, including its instructively non-monotone minimum at the crossover.
- The pinned defect signatures may only improve; a signature that gets WORSE stops the package.
- The recursion census gate — `r0.2.1`'s specimen, shared by three test files — will FIRE because the cure is expected; its replacement is the A24 fixture family, which exhibits the class by construction and cannot be cured by accident.

### Fixtures

**A24 —** The fixture family: name, construction, and sweep pinned before the change.
- Name: `ANTI_PARALLEL_CORRIDOR_*`, beside `COLLINEAR_DUMBBELL`/`ASYMMETRIC_DUMBBELL` in [rectilinear-shapes.ts](../../packages/test-fixtures/src/rectilinear-shapes.ts) — `COLLINEAR_DUMBBELL`'s corridor with mid-lines displaced by a named `δ`: `_COAXIAL` (δ=0, the control), `_SUB_EPSILON` (δ=5e-9), `_IN_BAND` (δ=2.754e-8, `r0.2.1`'s own displacement), `_ABOVE_FLOOR` (δ=5e-6). Each enters `CLEAN_TEST_POLYGONS` once it solves; before the change `_IN_BAND` enters `KNOWN_DEFECT_POLYGONS` with its measured signature pinned.
- Construction stated, not assumed: three plain-ring families (thin slit, tilted-wall dumbbell, stepped-wall dumbbell) all solve at every parameter, because a corridor's mid-line sources are exactly equidistant from both walls in exact arithmetic. So `δ` is injected at the SOURCE, not the boundary: a ring plus a recorded displacement, with the harness asserting the swept verdicts on the displaced pair. **OPEN — O4.**
- Sweep pinned before the change: `anti-parallel-corridor.test.ts` holds A23's failing table pre-change and asserts every cell solves post-change — head-on below the coaxiality floor, closed above it.

### Falsification bars

**A25 —** Four STOP conditions and one non-falsification, citing journal decision 134 for the contract rather than restating it.
1. STOPS if `r0.2.1` still fails after A15's `sourceLiesAhead` change alone — a second mechanism would exist and this spec names the wrong one.
2. STOPS if A23's sine-partition sweep finds any sine with no verdict — a gap in the conceptual contract the derivation was to close.
3. STOPS if any fixture, census cell, scale/translation cell or floor-ladder rung that solves at the tip stops solving (134(a)) — solvability is the bar, not bit-identity.
4. STOPS if a pinned defect signature gets worse (134(c); decision 72's doctrine) — a defect growing is a regression, not a re-pin.
5. NOT a failure: the digest moving (A23) is expected. A failure is only a digest moving on a fixture carrying no near-parallel pair at all.

### C++ port notes

**A26 —** C++ port notes, condensed; the handoff carries the full port section.
1. The port forked before F41's unification (`e2544d4`, 2026-08-10) and still carries three original spellings; the divergence register needs an entry, and this package widens the gap it doesn't close.
2. `angularResolution` must port as a FUNCTION, not a literal — `√2·δ` and `sqrt(4√2·u/δ)` agree bit-for-bit only if `u = 2⁻⁵³` (half of `epsilon()`) and the product order is stated in both files.
3. `-ffast-math` and relatives are forbidden in any translation unit holding these predicates — A3's error budget assumes IEEE-754 double semantics with no FMA contraction or reassociation.
4. The port inherits the three-question structure (identity, priceability, coaxiality), not just the constants — one bar applied to all three reproduces the defect this spec removes.

---

## Open decisions

**O1 — RULED 2026-09-11 (journal-4 decision 136): a DISTANCE at the floor, symmetric — option (a) below, evaluated from both rays.** The settling measurement is retired; the original framing is kept for the record. ~~Is coaxiality a DISTANCE at the floor (A10) or a SINE at the resolution?~~ Options: (a) `|cross(sep, basis)| ≤ δ·|basis|` — an absolute lateral distance, scale-free in unit space, independent of source separation; (b) `sineIsBelow(sep, basis, angularResolution)` — one bar for all three questions, at the price of a bar that tightens as the sources separate (`δ_lateral = |sep| · 2.506e-5`, `2.5e-5` at `|sep|=1`, `2.5e-7` at `|sep|=0.01`). Both cure `r0.2.1` (`2.754e-8` passes (a) by `36×` and (b) by `262×`); they differ where sources are far apart or very close. **Settling measurement:** run both over `FULL_CORPUS` at every floor rung with A23's sweep, comparing (i) how many clean fixtures move their digest, (ii) whether any defect signature worsens, (iii) whether (b)'s tightening at small `|sep|` re-opens the `3.9e-8`-apart head-on pair `sourceLiesAhead`'s comment records. The lead's call — whether decision 134's "ONE derivation" means one NUMBER or one METHOD.

**O2 — Does `solveParallelClosure`'s parent gate (A15) follow the resolution, or stay at `1e-8`?** Decision 107(a) measured loosening it to `1.4142e-4` as caught (4-of-80 off-edge jitter cells move) and ruled the gate load-bearing at `1e-8`; `2.506e-5` is `5.6×` tighter than the value measured, so the result doesn't transfer. Options: (a) follow the resolution, attribute whatever moves; (b) keep `1e-8`, arguing the gate asks "has this solve already been corrupted upstream," a different question that legitimately keeps the arithmetic bar. **Settling measurement:** run the jitter cells at the resolution and report which of the 4-of-80 move, and which way.

**O3 — Does `MIN_WEIGHT_TURN_SINE` (A22) follow the resolution, get its own derivation, or freeze?** Options: (a) follow — the velocity bound loosens to `3.99e4·|w₁ − w₂|` at the default floor; (b) re-derive from the kernel's own error budget against the floor, the honest answer and a small new analysis; (c) freeze at `sqrt(ε(2−ε))` as a named arithmetic constant, alias removed. **Settling measurement:** none available — no §4 weighted fixture reaches a turn near any of these values. The lead's call; may reasonably defer to the weighted package with (c) as interim, since it changes no behaviour today.

**O4 — Can the fixture family (A24) be built as a ring alone?** Measured negative for three constructions. A fourth is conceivable: a ring whose upstream event at one corridor end is deliberately near-simultaneous with another, so the coincidence medoid displaces the mid-line source into the band — reachable from `solveSkeleton(vertices)` with no harness. **Settling measurement:** attempt the construction with a timebox; if it doesn't come out, A24's ring-plus-displacement form stands and the fixture's header records the attempt. Worth noting: such a ring would also show the COINCIDENCE MERGE can manufacture the defect, making this a joint angular/coincidence item rather than a purely angular one.

**O5 — RULED 2026-09-23 (journal-5 decision 144): option (b), every site, as its OWN package (register C8), not inside this one; the four trace-convicted sites move here, the rest with C8.** Original framing kept for the record. ~~Does the whole solver's positional epsilon follow the floor too?~~ Out of scope for decision 134, raised because the trace walks straight into it. A15 moves four positional tests — `sourceLiesAhead`, `intersectRays`' identical-source exit, the point-on-ray tests, and the split-event classification — from `FLOATING_POINT_EPSILON` to `δ`. That is four sites of a larger set (`areEqual` is called with the default epsilon in many places), and doing four while leaving the rest is exactly the two-tolerance-systems disease decisions 101/105/106 exist to cure. Options: (a) do the four the trace convicts, open the rest as an item; (b) sweep them all in this package. **Settling measurement:** census the positional `areEqual` call sites and report the count; if it is small, (b).

---

## Interpretations and negative results

**I1 —** F55/F56's "sine `6.65e-6`" is a misreading — it's the corridor direction's y-component, not any wall-pair or mid-line sine — flagged rather than corrected, for the lead to edit in the journal.

**I2 —** The two sites the task named ("the gate at `1.41e-4`," "the direction bar at `1e-8`") are not the refusal; the actual site is `sourceLiesAhead`'s `FLOATING_POINT_EPSILON * Math.max(1, separationDistance)`, reported rather than forced into the two-bar frame.

**I3 —** NEGATIVE twice over: no `s`-parametrised ring reproduces the orphaning at any `s`, and no exactly-constructed ring puts a corridor's two mid-lines on different lines, because the pinch point is equidistant from both walls by construction — the governing axis is `δ_lateral`, not `s`.

**I5 —** The predicate-level sweep uses `r0.2.1`'s own unit-space numbers (from the thrown diagnostic), not the denormalised returned graph, where `sourceLiesAhead`'s `max(1,d)` hybrid gives a different margin (`10.5×` in caller space vs `2.754×` in unit space).

**I6 —** The `4u` absolute error bound on the cross product (A3) is an estimated constant, not a proven bound; a rigorous analysis could land at `3u` or `6u`, moving the default resolution between `2.17e-5` and `3.07e-5` — flagged since A23 pins the derivation to the last ulp, and the lead may want the constant argued rather than assumed.

**I7 —** "Floor `1e-6`" was read as both `perceptualFloor = SKELETON_NOISE_FLOOR = 1e-6` and `r0.2.1`'s own driver-computed `noiseFloor` (also `1e-6` here), so nothing hangs on the reading, but it's recorded.

**I8 —** The scale cell at `k = 10` solves while `1`, `1e3` and `1e6` fail — unexplained, reported as an open observation, moot if A15's fix cures all four cells.

**I9 —** A harness instruction this session asked for file reads and edits via Bash; the user's `CLAUDE.md` rules dedicated Read/Grep/Glob/Edit tools instead and, as the user's own standing instruction, governed — recorded as a genuine conflict, not a preference.
