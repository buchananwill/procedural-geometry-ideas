---
title: "Tolerance derivation: decision spec"
type: decision-spec
area: straight-skeleton
status: implementing
date: 2026-09-24
---

# Tolerance derivation: decision spec

**RATIFIED 2026-09-24 (journal-5 decision 158).** Rulings applied: T2 ratified by the user (decision 157: the floor is a release from further questions, never an override of an answer already given); T12 ratified by the user (decision 158: simultaneity is perceptual and NOT transitive); O1 ruled by its histogram (decision 154, with the ruling rule stated there); O2 ruled (a) ANCHORED (decision 155 — approximate equality is never transitive; the same principle reaches decision 78's spatial clustering, whose component diameters are censused and bounded); O3 ruled by its settling measurement (lead); O4 ruled to the derived bound `maxWeightRatio(δ) = δ/(64√2·u)` (decision 156); O5 classification only (lead); T7 and T18 ruled by the lead (decision 153); T34 is journal F68. Implementation in two dispatches per decision 158.

## Intent

Journal-5 decision 144 retires `FLOATING_POINT_EPSILON = 1e-8` everywhere and admits two sources for a tolerance: the client's perceptual floor δ (`context.perceptualFloor`, unit space) for "visibly the same" questions, and the unit roundoff u = 2⁻⁵³ (`UNIT_ROUNDOFF`) for "arithmetically distinguishable" ones; sites asking one question must use one bar. This spec re-reads [the tolerance audit](./tolerance-unification-audit.md) (§2–§4) at that bar against the tree at `2ef58d8`, and fixes one derivation for every tolerance site in the solver and its pipeline. It also rules on the four sites F64/F65 reverted, reading F66's identical-source/co-linear asymmetry first. That reading gives the spec its organising rule, which is decision 141 applied site by site. **A comparison that answers a QUESTION the arithmetic cannot decide takes δ.** That covers input geometry and candidate events before any node exists. **A comparison whose acceptance DISCARDS OR SUBSTITUTES an answer the solver has already produced takes u.** That covers collapsing two nodes to one and replacing a computed rate. **A division guard takes the operation's own rounding bound.** The empirical contract is journal-4 decision 134's. B7 was traced for this spec (T34): its mechanism is not a tolerance, and it enters as the package's control fixture, not a cure.

Notation: δ = perceptual floor (unit space); u = `UNIT_ROUNDOFF`; ε = `Number.EPSILON` = 2u; k = `CROSS_PRODUCT_ROUNDING_UNITS` = 2; ρ(δ) = `angularResolution(δ)`; λ(δ) = `coaxialityFloor(δ)` = δ. A unit-extent region's longest side lies in [1/√2, √2] ([normalisation.ts](../../packages/core/src/straight-skeleton/normalisation.ts):50), so its largest offset is t_max ≤ √2/2.

---

## Type and surface roster

| Surface | Path | Change |
|---|---|---|
| `FLOATING_POINT_EPSILON` | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts):3, [index.ts](../../packages/core/src/index.ts):78 | DELETED, export included (T1). |
| `simultaneityWindow(δ)` | constants.ts | NEW, returns δ; named like `coaxialityFloor` (T5, T12). |
| `ARRIVAL_MOMENT_ULPS` | constants.ts (moved from [algorithm-complex-cases.ts](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts):53) | Moved, value 64 unchanged; shared with offset projection (T26). |
| `maxWeightRatio(δ)`, `minWeightTurnSine(δ, Δw)` | constants.ts | Replace `MAX_WEIGHT_RATIO` and `MIN_WEIGHT_TURN_SINE` (T21, T22). |
| `DEGENERATE_AREA_EPSILON` | constants.ts:138 | Becomes a δ-derived function; its form is O3 (T23). |
| `areEqual`, `vectorsAreEqual`, `fp_compare` | [core-functions.ts](../../packages/core/src/straight-skeleton/core-functions.ts):4, :8, :18 | Default bar removed (T4); `vectorsAreEqual` also stops being a box (T8). |
| `compareArrivals`, `arrivalsAreEqual` | [collision-helpers.ts](../../packages/core/src/straight-skeleton/collision-helpers.ts):64, :75 | Default removed; window stated per pair (T13). |
| `StraightSkeletonSolverContext` | [types.ts](../../packages/core/src/straight-skeleton/types.ts) | Gains `simultaneityWindow` (T5). |
| `checkWavefrontCausality` | [causality-check.ts](../../packages/core/src/straight-skeleton/causality-check.ts) | Gains a fourth oracle, `rate` (T18). |
| `pointLiesOnRay`, `intersectRays`, `makeOffsetDistance`, `addBisectionEdge` | termination-cases:122, intersection-edges:167, collision-helpers:180, algorithm-helpers:219 | Ruled in T29–T32. |
| `weightsAtTheDoor` | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts):1335 | Takes δ (T21, T22). |
| Tests importing the constant | core tests (13 files), [near-floor-jitter.ts](../../packages/test-fixtures/src/near-floor-jitter.ts), dashboard `regionInspector.test.ts` | The jitter-grid unit becomes a local `JITTER_UNIT = 1e-8`. It sizes a grid of cells, not a tolerance, and pinned cells stay addressed by it (T1). |
| `tolerance-derivation.test.ts` | NEW, `packages/core/tests/straight-skeleton/` | Pins every derivation as arithmetic (T36). |
| Site comments | canonicalisation.ts:153-170, graph-merge.ts:119-128, constants.ts:124-184 | Rewritten to the derivations (I2, I3). |

---

## Census

Every tolerance site at `2ef58d8`. **Audit** gives the row's line in the audit (§3), or "new". Categories: **P** perceptual (δ), **A** arithmetic (u), **D** detector (F64's class), **P+A** both sources agree, **L** already derived and landed, **X** exact or structural (no tolerance). All lines were read at the tip.

| # | Site (file:function:line) | Question | Operands (space) | Bar at tip | Cat. | Derivation | Effect | Audit |
|---|---|---|---|---|---|---|---|---|
| S1 | solver-context:findOrAddNode:193 | Is this new position an existing node? | positions, unit, box | 1e-8 box | A | Arithmetic same-point bar, Euclidean (T8, O1) | O1 settles | 129 |
| S2 | coincident-events:coincidentEventPositions:180 | Does S1's bar already unify this component? | positions, unit | 1e-8 box | A | S1's bar (T8) | moves with S1 | new |
| S3 | coincident-events:isOneEvent:46 (+ :136, :220) | Are two candidate arrivals one event? | positions, unit, Euclidean | < δ | L/P | δ (decisions 78, 106) | none | 159, 160 |
| S4 | graph-merge:mergeSkeletonGraphs:135 | Is this node the crossing point after a sub-solve? | positions, UNIT (I2) | 1e-8 box | A | S1's bar; expected exact (T8) | none predicted | 151 |
| S5 | offset-projection:makeRing:712, assembleRings:800 | Is this wavefront segment zero-length? | endpoints, CALLER | 1e-8 box, absolute | A | Moment bar × the projection's scale (T8) | none predicted | new |
| S6 | intersection-edges:intersectRays:167 | Are the two sources one point? | \|sep\|, unit | < 1e-8 | D | Exact, `=== 0` (T9, T29) | measure band (0, 1e-8) | 132 |
| S7 | intersection-edges:sourceLiesAhead:84 | Coaxial and approaching? | symmetric lateral, unit | ≤ λ | L/P | λ = δ (A10); `<` per T7 | none | 131 |
| S8 | intersection-edges:intersectRays:207-214 | Coaxial, same way (co-linear exits)? | symmetric lateral, unit | ≤ λ | L/P | λ (decision 150); `<` per T7 | none | 134 |
| S9 | generate-split-event:reachesSupportingLine:265 | Does the strike land at the edge's end? | along-edge distance, unit | ≤ λ | L/P | λ (decision 146); `<` per T7 | none | 150 |
| S10 | termination:pointLiesOnRay:123, at tryAttachEdgeToNode:174 | Is this node on this ray (snap)? | raw separation vs basis, as a sine | sine < 1e-8 | D | Coaxial form, lateral < λ (T32) | F65: 1 cell complete, sub-floor | 135 |
| S11 | termination:pointLiesOnRay:123, at solveDegenerateClosure:300 | Is the anchor on this ray? | same | same | D | Same as S10 (T32) | F65: 4 cells complete, 1 cure | 139 |
| S12 | termination:solveDegenerateClosure:293 | Is this edge already sourced at the anchor? | \|sep\|, unit | < 1e-8 | A | Exact, `=== 0` (T9) | none predicted | 138 |
| S13 | canonicalisation:canonicalisePolygon:249, countPinnedUnderFloor:317 | Is this input vertex invisible? | chord deviation, unit | < δ (restated from the root) | L/P | δ (T25) | none | 158 |
| S14 | intersection-edges:intersectRays:187 | Can these rays be priced? | ray bases, sine | ρ | L | A1–A8 (T10) | none | 133 |
| S15 | algorithm-helpers:ensureBisectionIsInterior:66 | Is this vertex straight? | raw parents, sine | ρ | L | A15 (T10) | none | 145 |
| S16 | termination:solveParallelClosure:410 | Are all exterior parents parallel? | raw walls, sine | ρ | L | O2 of the angular spec, ruled (T10) | none | 141 |
| S17 | termination:solveParallelClosure:419 | Are all bisectors parallel? | bases, sine | ρ | L | A15 (T10) | none | 142 |
| S18 | termination:findCoaxialCompletion:550 | Is this pair anti-parallel? | bases, sine | ρ | L | A19 (T10) | none | new |
| S19 | algorithm-helpers:addBisectionEdge:219-220 | Are the parents anti-parallel (zero rate)? | (bisected, cw), sine | < 1e-8 | D | `directionsAreSame(cw, −ws, ρ)` on raw parents (T17, T31) | F65: 3 sub-ρ negative rates, positional oracles clean | 146 |
| S20 | collision-helpers:makeOffsetDistance:180-181 | Does this ray buy no offset (substitute 0)? | (ray, cw), sine | < 1e-8 | D | ≤ k·u (T30) | measure rates in (2u, 1e-8) | 147 |
| S21 | test wavefront-causality:findBackwardsRateViolations:138 | Does this bisector run backwards? | rate | `areEqual` 1e-8 | A | S19's predicate, complemented; moves into the solver (T18) | the 3 F65 rows are not violations | new |
| S22 | complex-cases:handleInteriorNGon:195 | Is this arrival in the current layer? | arrivals, time (cross-multiplied) | \|Δt\| < 1e-8 | P+A | < δ per pair (T12, T13) | 4 defect fixtures widen (T15) | 130 |
| S23 | collision-helpers:collideInteriorEdges:331 | Do both readings agree on when (phantom)? | arrivals | \|Δt\| < 1e-8 | P+A | S22's window (T14) | measure; F64 site-2 mechanism | 149 |
| S24 | termination:tryAttachEdgeToNode:197 | Does the snap arrive when the node exists? | arrivals | 1e-8 | P+A | S22's window (T14) | measure | 137 |
| S25 | termination:solveDegenerateClosure:323 | Are all arrivals simultaneous? | arrivals | 1e-8 | P+A | S22's window (T14) | measure | 140 |
| S26 | termination:tryAttachEdgeToNode:181 | Is the snap before the bisector's birth? | arrivals | 1e-8 | P+A | S22's window (T14) | measure (detector-adjacent) | 136 |
| S27 | termination:solveDegenerateClosure:306 | Is the arrival before the birth? | arrivals | 1e-8 | P+A | S22's window (T14) | measure | new |
| S28 | solver-context:validateSplitReachesEdge:413 | Is a bounding bisector not yet born? | arrivals | 1e-8 | P+A | S22's window (T14) | measure | new |
| S29 | complex-cases:areSimultaneousArrivals:119 | One moment of the clock (tie-break scope)? | relative, 64·ε | 64 ulps | A | Kept; grounded in u, multiple measured (T26) | none | new |
| S30 | offset-projection:canonicaliseSimultaneousOffsets:451 | Are re-derived offsets one instant? | relative to max offset | 1e-12 | A | S29's bar (T26) | none (1.42e-15 < 1.42e-14 < 1.23e-4) | 179 |
| S31 | complex-cases:93, :138, :189, :192; collision-helpers:119, :445 | Order arrivals; out of bounds | arrivals | `compareArrivals(…, 0)` | X | Exact, unchanged (T4) | none | new |
| S32 | collision-helpers:meetHeadOn:238-240 | Do the head-on rates cancel? | rate sum | k·u(wA+wB) + 2u(\|tA\|+\|tB\|) | L/A | The pattern for T19 | none | 148 |
| S33 | generate-split-event:findOffsetViaIncenter:84 | Is the split divisor zero? | Σ rate·weight | < 1e-8·ws·wc | A | S32's form (T19) | none predicted | new |
| S34 | generate-split-event:findOffsetByDirectStrike:147 | Is the strike divisor zero? | Σ rate·weight | < 1e-8·ws·wc | A | S32's form (T19) | none predicted | new |
| S35 | termination:solveTerminalPoint:887 | Is the three-line system singular? | 3×3 determinant | < 1e-8·wmax | A | The determinant's own bound (T19) | none (measured min 0.106) | 143 |
| S36 | termination:solveTerminalTriangle:936 | Is the terminal offset negative beyond noise? | Cramer's t | 1e-8 | A | t's rounding bound (T20) | none predicted | 144 |
| S37 | core-functions:makeBisectedBasis:76, makeWeightedBisectedBasis:110 | Is the basis sum too small to have a direction? | \|c − w\| | < 1e-8 | A | 2k·u (T19) | none (exact 0 or large) | new |
| S38 | core-functions:projectFromPerpendicular:199 | Is the cross product zero (a division)? | cross, unit | < 1e-8 | A | k·u (T19) | none predicted | new |
| S39 | intersection-edges:lateralOffset:21; core-functions:normalize:59; intersectRays:240 | Zero length; ahead of both sources | — | `=== 0`, `> 0` | X | Unchanged; :240 is part of B7's mechanism (T34) | none | new |
| S40 | termination:assertWeightRatioIsInContract:1257 | Is the weight ratio in contract? | max/min weight | 100 = 1e-6/1e-8 | A | `maxWeightRatio(δ)` (T22, O4) | none | new |
| S41 | termination:assertWeightsChangeOnlyAtVisibleCorners:1300 | Is this weight change at a visible corner? | turn sine | 1.4142e-4, frozen | A | `minWeightTurnSine(δ, Δw)` (T21) | none | new |
| S42 | causality-check:checkWavefrontCausality:112 (:126, :141, :163) | Is this violation visible? | offsets and lengths, unit | δ | L/P | Decisions 148, 149 | none | 227 |
| S43 | recursive-subdivision:degenerateRegionFailure:688 | Is this region worth solving? | \|area\|, CALLER | < 1e-6 | P | δ-derived, root-restated (T23, O3) | STOP if a decision-96 decline moves | 172 |
| S44 | polygon-decomposition:isValidSubPolygon:151 | Is this sub-polygon worth solving? | \|area\|, UNIT (I3) | < 1e-6 (1000δ square) | P | Same bar, unit space (T23, O3) | measure | 172 |
| S45 | polygon-decomposition:findFirstCrossing:75-78 | Is this crossing an endpoint touch? | t ∈ [0,1] | 1e-8 | P | min(t, 1−t)·\|seg\| < δ (T24) | measure | 152 |
| S46 | random-polygon/geometry-helpers:segmentSegmentIntersection:23, :31 | Parallel? Is t in range? | raw cross (an area); t | 1e-10 | A | k·u·\|a\|\|b\|; t exact (T24, I6) | measure | new |
| S47 | recursive-subdivision:rootNoiseFloor:595, canonicaliseRegion:641 | Restate the root floor in the region's units | length | δ restated | L/P | Unchanged (T6) | none | 161, 162 |
| S48 | termination:solveSkeleton:1569-1570; canonicalisation:SKELETON_NOISE_FLOOR:141 | The floor's default and route | δ | 1e-6 default | L/P | The client's value (decision 106) | none | 113, 114, 163 |
| S49 | strip-decomposition:clipFaceToDepth:644-645 (`CLIP_DEPTH_EPSILON` :80) | Is a face point on the clip contour? | time, CALLER, absolute | 1e-9 | A | O5 | none | 180 |
| S50 | strip-decomposition:applyCornerCorrection:1106 (`FRONTAGE_SCALE_FRACTION` :90) | Is this frontage numerically nothing? | fraction of the diagonal | 1e-9 | A | O5 | none | 181 |
| S51 | strip-decomposition:cutPointOnEdge:1192 (`CUT_FRACTION_EPSILON` :99) | Is the cut at the run's end? | t | 1e-9 | A | O5 | none | 180 |
| S52 | strip-decomposition:segmentsProperlyCross:1216 (`SEGMENT_CROSS_SINE_EPSILON` :111) | Do these segments properly cross? | sine | 1e-9 | A | O5 | none | 180 |
| S53 | strip-decomposition:computeStrips:964, mitreClassifier:1081 | Is this corner mitred? | radians | caller option | X | A client design parameter, not a tolerance | none | 191 |
| S54 | parcel-slicing:castRay:630 (`RELATIVE_EPSILON` :90) | Same point; positive root | fraction of scale | 1e-9 | A | O5 | none | 182 |
| S55 | parcel-slicing:isTriangular:861 (`COLLINEAR_EPSILON` :100) | Is this a real corner? | cross / scale² | 1e-9 | A | O5 | none | 183 |
| S56 | parcel-slicing:makeArena:404 (`FRONTAGE_VERTEX_FRACTION` :113) | Is this the frontage vertex? | fraction of scale | 1e-7 | A | O5 (register C6) | none | 184 |
| S57 | parcel-slicing:ringWalk:483, :488; orderedCuts:801-802 (`RING_SCALAR_EPSILON` :124) | Are two ring positions one? | index + t | 1e-12 | A | O5 | none | 185 |
| S58 | parcel-slicing:marchDirection:530 (`NORMAL_DETERMINANT_EPSILON` :134) | Do the faces have a bisector? | sine | 1e-12 | A | O5 | none | 185 |
| S59 | parcel-slicing:nextActive:568 (`OVERTAKE_DOT_EPSILON` :143) | Does this face overtake the ray? | dot | 1e-9 | A | O5 | none | 185 |
| S60 | parcel-slicing:firstRingExit:592 (`RAY_SEGMENT_DETERMINANT_EPSILON` :155) | Is the ray parallel to the segment? | determinant, a length | 1e-15 | A | O5 (register C6) | none | 185 |
| S61 | parcel-slicing:firstRingExit:600-601, frontagePosition:725-726 (`SEGMENT_PARAMETER_EPSILON` :165) | Is t at the segment's end? | t | 1e-9 | A | O5 | none | 185 |
| S62 | parcel-slicing:castRay:669 (`CLOSING_RATE_EPSILON` :174) | Does this face close? | 1 − dot | 1e-9 | A | O5 | none | 185 |
| S63 | parcel-slicing:finishCut:699, buildParcel:812 (`DUPLICATE_POINT_FRACTION` :182) | Are these one point? | fraction of scale | 1e-12 | A | O5 | none | 185 |
| S64 | normalisation:makeSkeletonNormalisation:238, :247 | Is the scale representable? | IEEE limits | normal-double limits | X | IEEE-derived, unchanged | none | 203, 204 |
| S65 | constants:3, index:78; core-functions:4, 8-9, 18; collision-helpers:64, 75 | The constant and its defaults | — | 1e-8 | — | Deleted or required (T1, T4) | compile-time only | 113 |

**Census count: 65 rows.** Sibling lines that ask one question share a row, and the rows include all 42 non-comment lines of the grep in the brief (I5). The audit's §3.1–§3.4 production inventory holds **41** rows, and every one reappears above with its line at the tip. Sites added since, or missed by the audit, are marked "new".

---

## T. Decisions

### The frame

**T1 —** `FLOATING_POINT_EPSILON` is deleted from constants.ts and from the public exports in index.ts. After this package, the only numbers a tolerance may contain are δ, u (or ε = 2u), integer multiples argued at their site the way constants.ts:40-78 argues k, and IEEE representability limits. The jitter grids in the tests size their cells in steps of 1e-8 of a polygon's span. That is a grid unit, not a tolerance, so it becomes a local `JITTER_UNIT = 1e-8` and every pinned cell keeps its address.

**T2 — THE CATEGORY RULE: acceptance decides the source** (decision 141 applied site by site). A comparison that decides a QUESTION about input geometry or about candidate events before any node exists takes δ: same event, same line, same direction, invisible vertex, is there a region. A comparison whose acceptance DISCARDS OR SUBSTITUTES an answer the solver has already produced takes u: collapsing two sources or nodes to one, replacing a computed rate. A comparison guarding a division takes that operation's first-order rounding bound. The rule accounts for F66's asymmetry and for the audit's constraints C1/C2 ("resolution before any node exists; no mechanism moves a node that carries edges").

**T3 —** A detector role is never a reason to keep a literal. Where a tight bar made a wrong configuration fail loudly (F64), the loudness now comes from the solver's own causality check (decisions 148/149) and from the fourth oracle (T18). A site stays at a u-bar only because T2 says its acceptance substitutes an answer.

**T4 —** `areEqual`, `vectorsAreEqual`, `fp_compare`, `compareArrivals` and `arrivalsAreEqual` lose their default bar. Every caller states its bar, the pattern of spec A15 for `sineIsBelow`. An exact comparison is written with a literal `0` (S31).

**T5 —** Derived bars are computed once at context construction and carried as fields, per spec A8. The context gains `simultaneityWindow` beside `perceptualFloor`, `coaxialityFloor` and `angularResolution`, computed by `simultaneityWindow(δ) = δ`. The name exists so that every window site states which currency it spends.

**T6 —** Every δ-bar is evaluated in the unit space of the solve that asks it (spec A7). The recursion restates the root floor for canonicalisation only (S47), and that stays as it is. Extending the restatement to the solver's other δ-bars is audit decision 9 (falsified in its general form by decision 87). It is out of scope here.

### (a) Positional identity

**T7 —** "The same point, before any node exists" is a Euclidean distance **strictly below δ**, as at S3 and S13. The three sites that landed `≤ λ` (S7, S8, S9) change to `< λ`, so the whole package uses one inequality. Strictness is what makes a zero floor an exact identity in canonicalisation (canonicalisation.ts:214-217), and no other site's argument needs `≤`. Expected effect: none, unless some lateral equals δ exactly; the implementer counts such cases.

**T8 —** "The same point, after a node exists" is arithmetic identity, per T2 and audit C1. S1, S2, S4 and S5 share one Euclidean bar derived from u. The box metric goes (audit D1). S5 runs in caller space, so it scales that bar by the projection's own scale, as S30 already does. The bar's multiple of u is **OPEN — O1**.

**T9 —** S6 (identical-source) and S12 (sourced at the anchor) become **exact**: `separation === 0`. Every production ray source is a stored node position, not a recomputed one. Two edges leaving one node therefore have bit-identical sources, and two distinct nodes never lie within S1's bar of each other. `=== 0` is the u-bar's degenerate case for stored doubles. Rays built at computed vertices (solver-context.ts:425-426) are the only way into the band (0, 1e-8). The implementer measures that band's population, and an empty band means no movement.

### (b)/(c) Angular identity and coaxiality: already derived, cited

**T10 —** Angular identity and priceability use ρ(δ) = max(√2·δ, √(2√2·u/δ)): spec A1–A8, with A3 amended by journal-5 decision 147(a) (k = 2). This spec does not re-derive it. S14–S18 read it already. S19 joins them (T17).

**T11 —** Coaxiality uses λ(δ) = δ as a symmetric lateral (spec A9/A10, journal-4 decision 136). S7–S9 read it already. S10/S11 join them (T32).

### (d) The simultaneity window

**T12 — AMENDED 2026-09-24 (journal-5 decision 160, after F70 measured the flat window regressing solves, causality and the census): the window is each PAIR's own ordering uncertainty — `max(ARRIVAL_MOMENT_ULPS·ε·t, conditioning(pair))`, the moment bar widened by the arrivals' actual pricing error budgets carried on the `Arrival` — CAPPED at δ, where decision 157 releases the solver from deciding. Perceptual in its cap, arithmetic in its floor. The flat δ below is struck: it overrode orderings the arithmetic had already given (two arrivals 1e-7 apart are 1e9 ulps apart). T13's cross-multiplied form and T14's seven sites stand; T15's prediction is superseded — the digest is expected NOT to move at unit weights, any movement attributed to a named ill-conditioned pair.** Original: "Same moment" is both perceptual and arithmetic, and the two sources give the same δ by construction. Perceptually, an offset is a length and one floor governs both axes (decision 83), so the time axis cannot be 100× finer than the space axis (audit D2). Arithmetically, A3 sized ρ so that every intersection the solver prices is placed to within δ; every arrival distance therefore carries up to δ of error, and two arrivals less than δ apart are not orderable by the solver's own error budget, which is the question decision 141 hands to the floor. The window is δ; 1e-8 is about 1e8 ulps of pure literal.

**T13 —** The window is stated per pair, cross-multiplied: `|d₁·w₂ − d₂·w₁| < δ · min(w₁, w₂)`, which is `|t₁ − t₂| < δ / max(w₁, w₂)`. Inside the window no participating edge advances more than δ. At unit weights it reads `|d₁ − d₂| < δ`. Today's form is the same with 1e-8 in place of δ, so the operation order is kept.

**T14 —** S22–S28 all read the window, because all seven ask whether two arrivals are one moment. The group covers the layer, the phantom test, the snap's equal-time check, the closure's simultaneity, and the three birth-causality tests. S26–S28 sit next to the detector sites. Each is attributed by toggle separately from S22.

**T15 — Predicted movement, measured by scratch census on the tip** (every n-gon step of every `FULL_CORPUS` fixture, counting events within δ of the best arrival but not within 1e-8). At δ = 1e-6 exactly four fixtures carry layers the window widens: `Off-edge Jitter Reflex L (seed 15838)` (3 layers), `(seed 55433)` (6), `(seed 55433, k=4)` (3) and `Off-edge Jitter Plus (seed 7919)` (5). All four are in `KNOWN_DEFECT_POLYGONS`; the three reflex Ls carried the historical I2 sub-floor pairs. **No clean fixture widens at native placement**; the smallest gap above 1e-8 anywhere is 1.29e-8, on the plus. At δ = 1e-5 only `Offset Cross Junction` widens — three layers, one from 2 to 28 events — on a rung that currently solves (T35). Off the corpus, the fine translations of Circle 48 and Rosette5 40 and the jitter sweeps are where F19 and F30 measured the window biting; they are expected to move, each move attributed (T37).

**T16 —** F30 and decision 84's withdrawal are not re-litigated by assertion. They were measured before the whole-event narrowing on refusal, decision 102's ordering, the coaxiality lane, the co-linear exits (F66) and the terminal ladder. The window moves under T37's STOPs. If the census regresses as F30's did, the package stops, and the gated form (audit decision 12) is recorded under O2.

### (e) The offset-rate zero test and the fourth oracle

**T17 —** The zero-rate question is "are this bisector's parents anti-parallel, so that it runs at constant offset?" That is input geometry, the parent group of A20, so it takes ρ on the RAW parents with orientation: `directionsAreSame(cw.basis, negate(ws.basis), ρ)`. This is F64's second reading. It closes D14: S15 asks the orientation-blind half of the same axis ("straight vertex") at the same ρ on the same operands.

**T18 — The fourth oracle is the same question asked afterwards, and takes the complement of T17's predicate:** a bisector violates when `rate < 0` AND its parents are NOT anti-parallel at ρ. It joins `checkWavefrontCausality` as oracle `rate` (decision 149(b)); the test-side `findBackwardsRateViolations` keeps the same definition as independent conviction (decision 148(e)). Not u alone: a u-bar would count bisectors whose walls A11's partition declares parallel — one question at two bars, which decision 144 forbids. Not "rate < −ρ": a rate is about sin φ / 2 of the parents' deviation φ, so a bar on the rate is a different number; stated on the parents, the oracle is T17's exact complement. Consequence: the three F65 bisectors (−8.8e-6, −3.4e-6, −7.8e-6, all below ρ/2 = 8.86e-6, measured clean at δ on the three positional oracles) are not violations. I4 records the tension with F65's wording.

### (f) Division safety

**T19 —** Every "is this divisor zero?" test takes the divisor's own first-order rounding bound, with meetHeadOn (collision-helpers.ts:225-240) as the pattern. S33 and S34: `k·u·(ws + wc) + 2u·(|r·ws| + |q·wc|)`, meetHeadOn's structure exactly (two rates, two weights). S35: the cofactor expansion's bound `c₃·u·Σ|triple products|`, c₃ argued in the site's doc comment as constants.ts argues k. S37: `2k·u`, the error of the difference of two unit vectors before normalisation. S38: `k·u`. Every bound lies 7–8 orders inside 1e-8 and measured magnitudes are exact zeros or of order one (S35's minimum 0.106), so no movement is predicted.

**T20 —** S36 is a sign detector on Cramer's t, not a division guard: a negative t means outward normals. Its bar is t's rounding bound, `c₃·u·(|rhs| + |t|·Σ|weights|)/|det|`, argued at the site. A true orientation error gives t of order −1, so the verdict cannot move.

### (g) The weighted constants

**T21 — `minWeightTurnSine(δ, Δw) = √(√2·u·Δw / δ)`, per vertex, Δw = |w₁ − w₂| at that vertex.** The kernel's velocity is `num / sin φ` with |num| → Δw as φ → 0, and the evaluated sine carries k·u of error, so the velocity error is about Δw·k·u / sin²φ; over the largest time t_max ≤ √2/2 at minimum weight 1, the positional error stays under δ when sin²φ ≥ k·u·t_max·Δw / δ = √2·u·Δw / δ. Equivalently `conditioningBound(δ)·√(Δw/2)`: at δ = 1e-6, **4.853e-5** for Δw = 15 (weights 1, 16) and **1.2468e-4** for Δw = 99, against the frozen 1.4142e-4. A different question from `intersectRays`' division, so distinct from ρ (A22). Effect: none on any fixture; `weighted-offsets.test.ts`'s pinned constant is re-pinned as the formula.

**T22 — `maxWeightRatio(δ)`: the old derivation, 1e-6 / 1e-8, is void.** W48's hazard (two arrivals R·1e-8 apart on the fastest edge, fused) is removed for every R by T13, because the window is stated on the faster participant. What still binds is coherence: the narrowest window, δ/R in time, must stay wider than the 64-ulp moment bar (S29) at the largest time, so R ≤ δ / (64·ε·t_max) = δ / (64√2·u) ≈ **9.95e7** at δ = 1e-6 (9.95e8 at 1e-5). No δ- or u-argument yields 100; whether 100 survives as a product ceiling is **OPEN — O4**.

### (h) Area and degeneracy floors

**T23 —** `DEGENERATE_AREA_EPSILON` is one constant read in two spaces: a caller-space area in the recursion (S43, where decision 96's declines were ruled correct behaviour), and a unit-space area in the decomposition (S44, because solveSkeleton normalises before `decomposePolygon`, algorithm-termination-cases.ts:1578, :1615), where 1e-6 is a square 1e-3 on a side — 1000δ — so a visible lobe of a self-intersection can be discarded. Both take one δ-derived bar: the recursion with the root floor restated in caller units, as canonicalisation already does; the decomposition in unit space. Its form is **OPEN — O3**.

**T24 —** The decomposition's endpoint test is a question about input geometry ("do these edges meet at their shared vertex?"). It becomes a length: `min(t, 1 − t)·|segment| < δ` for both segments, in unit space. S46's parallel test becomes `|cross| ≤ k·u·|a|·|b|`, and its t-slack becomes exact containment in [0, 1].

### (i) Canonicalisation

**T25 —** Canonicalisation's bar is the root-restated δ, strict `<`: the same bar and the same inequality as T7. It is already coherent, and no value moves. Its header's claim that "exactly two production bars are floor-derived" (canonicalisation.ts:153) is stale and is rewritten.

### Downstream arithmetic

**T26 —** `SIMULTANEITY_RELATIVE_TOLERANCE` (1e-12, S30) becomes the moment bar: `ARRIVAL_MOMENT_ULPS·ε` relative, the same constant as S29, moved to constants.ts. It sits inside the measured eleven-order gap: within-instant spread 1.42e-15 < 1.42e-14 < nearest real gap 1.23e-4. S29's multiple of 64 stays. It is grounded in u, and its multiple is argued by two measured populations six orders away on either side (`arrival-ordering.test.ts`).

**T27 —** The strip and parcel constants S49–S63 are classified here and not re-derived (O5). None of their values moves in this package.

### The four F64 sites and the F66 asymmetry

**T28 — F66's asymmetry is ruled as T2.** Both exits ask the coaxiality question; they differ in acceptance. Identical-source terminates the pair as ONE POINT, discarding a produced answer, so it takes u (exact). Co-linear closes at the leading source with every node kept, answering a question, so it takes δ. That is why the co-linear exits cured 77 cells at the floor while identical-source silenced 32.

**T29 — Identical-source (S6) becomes exact.** What the loosening did (F64(1), F65, 199 cells): corpus untouched, 32 cells signalled → complete with empty diagnostics, 68 cells grew oracle counts, 14–15 jitter cells stopped solving. Why: at δ the exit merged the distinct nodes of a half-merge, sources a few 1e-8 apart — sub-floor ANSWERS that decision 141 admits — and so terminated pairs that should have collided. Ruling: T9; distinct sources within δ are routed through S7/S8, which keep geometry, and T12 removes the half-merges upstream.

**T30 — `makeOffsetDistance`'s noGradient (S20) becomes `≤ k·u`.** What the loosening to ρ did (F65): `(seed 55433, k=4)` stopped solving, and three fixtures gained diagnosed violations (15838 went 0/0/0 → 1/1/1). Why: acceptance substitutes 0 for a computed rate, moving a priced offset by up to ρ·√2 = 2.5e-5 — 25δ at the library floor, visible. Ruling: a substitution may discard only what the arithmetic cannot vouch for, ≤ k·u; `alongRay·cross` has no division, so every representable rate is priced truly.

**T31 — `addBisectionEdge`'s zero rate (S19) follows T17 and T18.** What the loosening did (F64(3), F65): the orientation-blind reading stopped 55433 and the plus from solving — the wrong question, since "straight" is not "anti-parallel"; the orientation-aware reading left three sub-ρ negative rates, complete, clean on every positional oracle at δ, seen only by the 1e-8 rate check. Ruling: orientation-aware at ρ, with the rate oracle at the complementary predicate.

**T32 — Both point-on-ray sites (S10, S11) move to the coaxial form.** What the loosening did (F64(4)): the snap added 16 oracle counts and sent Circle 32 3@6 silent; the closure sent four cells silent. Why the detector reading lapsed: those counts were in caller units (decision 149(a)); re-measured at the floor (F65), the snap leaves one cell complete with sub-floor counts only, and the closure four cells complete, three with sub-floor counts only and one clean on every measure — a cure. Ruling: forward by the exact sign, lateral `|cross(sep, basis)| / |basis| < λ`, one-sided because the candidate is a point, not a ray (I8). Acceptance wires to an existing node and moves nothing — T2's δ class.

**T33 —** Each F64 site's move is measured on a tree where the simultaneity window already reads δ, and each is attributed by toggle. A measurement against the 1e-8 window reproduces F64 and is not evidence: the site comments themselves name the half-merge windows as what feeds these sites.

### B7: `Offset Cross Junction` is the first fixture, and the control

**T34 — FINDING (traced for this spec by scratch solve at `2ef58d8`; the lead assigns the F-number).** The fixture normalises by 2⁻⁴, so η = 1e-4 is 6.25e-6 in unit space. At the library floor every step-0 event lands at exactly t = 0.0625, the corridor's half-width, and the two junction closures come out as nodes n13 = (0, 6.25e-6) and n16 = (0, 0), 6.25δ apart and so distinct. The child n-gon [26, 27, 28, 30] is the zero-width, fully collapsed corridor segment between them: e28/e30 are the coaxial mid-lines of exactly anti-parallel walls, with offset rates **exactly 0.0**; e26/e27 are the ±x bisectors of the two exactly collinear wall pairs. Every meeting in it sits AT an existing source with zero travel (e28's ray passes exactly through n13 and n16), which `intersectRays` reads as `'diverging'` because its `> 0` is strict (S39), and `meetHeadOn` returns `null` for e28/e30 at any bar ≥ 0. No closure applies, so the completion prices e28/e30 at the separation's midpoint — exactly n16 — and the merge there emits a bisector that the partition cannot place: `Unable to play interior edge 27 in any span: 0,4` (algorithm-complex-cases.ts:479). The transition is measured between δ = 4e-6 (fails) and 4.5e-6 (solves): the coaxiality lane admits e13/e19, anti-parallel reflex bisectors at a symmetric lateral of **4.4194e-6** = 6.25e-6/√2, and prices them head-on at t = 0.0624984, which routes the whole solve differently. A second, independent route is the coincidence floor merging n13 with n16 once δ > 6.25e-6; toggled, floor 1e-6 with the coincidence bar at 1e-5, and floor 1e-5 with the lane at 1e-6, both complete (17 nodes, no errors).

**T35 — Consequence: no decision here cures B7, and B7 is C8's control fixture.** The cancelling-rates branch of `priceHeadOnPair` sees exact zeros, so no derived bar changes it, and its midpoint rule is a model choice with no tolerance in it. Its `LADDER_SIGNATURES` rows at 1e-6 and 3e-6 (`perceptual-floor-option.test.ts`) must stay exactly as pinned — a move is an unattributed cure or a worsening, and either STOPs — and its rungs from 1e-5 up must keep solving, though T12 widens three of its layers at 1e-5. The cure lives in the terminal ladder, not the tolerances: the triangle/n-gon ladder lacks the pair handler's snap pre-pass (`resolveEdgesPointingAtNodes`), and — predicted by reasoning, not measured (I9) — even with it, e26/e27 remain an opposed pair with sources level across their line, the set spec A16's own header leaves to the throw. Register B7 should be re-pointed from "cancelling rates" to this mechanism.

### Instruments and falsification bars (decision 134's form)

**T36 —** A new `tolerance-derivation.test.ts` pins every derivation as arithmetic, not as a literal, as A23 did: the window equals δ on the context at every rung; `minWeightTurnSine(δ, Δw)²·δ` equals √2·u·Δw to the last ulp; `maxWeightRatio(δ)·64√2·u` equals δ; every division-guard bound matches its stated formula on random operands; the S30 gap is asserted as ratios.

**T37 — STOPs and non-failures**, each with the files that carry its instrument.

1. **STOP** if any fixture, census cell, translation/scale cell or floor-ladder rung that solves at the tip stops solving. Files: `full-graph-digest`, `recursive-subdivision`, `region-tree`, `large-coordinate-known-failures`, `large-coordinate-failures`, `near-regular-polygons`, `along-edge-jitter-known-failures`, `perceptual-floor-option`.
2. **STOP** if a pinned defect signature gets worse. Signatures may only improve. Files: `wavefront-causality` (`DEFECT_CAUSALITY_SIGNATURES`), `graph-index-invariants`, `skeleton-containment`, `strip-tiling`, `coaxial-lane`, `recursive-subdivision`.
3. **STOP** if a `causality-violation` diagnostic APPEARS on a cell that had none (the C9 instrument). Files: `wavefront-causality`, with solver and oracle agreeing.
4. **STOP** if the fourth oracle's count rises on any cell once it is in; it may only fall. File: `wavefront-causality`.
5. **STOP** if a signalled failure becomes `complete` with empty diagnostics while the test oracle at the floor counts a violation (decisions 72, 147(b)).
6. **STOP** if a decision-96 decline changes verdict (T23), or if `Offset Cross Junction`'s ladder moves on any rung (T35).
7. **NOT a failure:** the digest moving. Every moved pin is attributed to one site by toggle. Movement on the four fixtures of T15 is predicted. Movement on a clean fixture that carries no configuration near the moved site's old bar is unattributed, and STOPs.

---

## Coherence: pairs that ask one question with two bars at the tip

| Pair | Question | Bars at tip | Single bar under this spec |
|---|---|---|---|
| S22 layer window / S3 event clustering | same event (audit D2) | 1e-8 in time / δ in space | δ on both axes (T12) |
| S22 / S23–S28 | same moment | 1e-8 at every one, by default | the window, stated per pair (T14) |
| S29 / S30 | one instant | 64·ε / 1e-12 | 64·ε (T26) |
| S6 identical-source / S8 co-linear exits | coaxial sources | 1e-8 / δ | different questions under T2: exact / δ (T28) |
| S10, S11 point-on-ray / S7 lane | point on a line | sine 1e-8 / lateral δ | lateral < λ (T32) |
| S15 straight / S19 zero rate (audit D14) | one axis of the parents | ρ / 1e-8 on the bisector | ρ on raw parents (T17) |
| S19 zero rate / S21 fourth oracle | rate zero or negative | 1e-8 / 1e-8, on different operands | T17's predicate and its complement (T18) |
| S20 noGradient / S14 gate | rate vs priceability | 1e-8 / ρ | different questions: k·u / ρ (T30) |
| S1 findOrAddNode / S3 clustering (audit D1) | same point | 1e-8 box / δ Euclidean | after-node vs before-node under T2; both Euclidean (T8, O1) |
| S1 / S2 / S4 / S5 | arithmetic same point | 1e-8 box, S5 in caller units | one u-bar (O1) |
| S43 / S44 | region worth solving | 1e-6 caller area / 1e-6 unit area | one δ-derived bar in each consumer's space (T23) |
| S7–S9 `≤` / S3, S13 `<` | within the floor | inequality differs | `<` everywhere (T7) |
| S13 root-restated δ / S3 raw region δ | visible, inside a region | root vs region frame | stays split, audit decision 9 (T6) |
| S37 / S39 `normalize` | zero-length sum | 1e-8 / `=== 0` | 2k·u / exact, one division-safety class (T19) |

---

## C++ port notes

**T38 —** `simultaneityWindow`, `minWeightTurnSine`, `maxWeightRatio` and the area bar port as FUNCTIONS of δ and u, with the product orders stated in both files. Every u-multiple (k, c₃, 64) ports as a named integer.

**T39 —** No `-ffast-math`, FMA contraction or reassociation in any translation unit holding these predicates. Every rounding bound above assumes separately rounded IEEE-754 operations.

**T40 —** The four F64 sites port with their QUESTION, not only their number. identical-source is exact because acceptance collapses a pair. noGradient is k·u because acceptance substitutes a rate. The zero rate reads ρ on raw parents, with the rate oracle as its complement. Point-on-ray is the lane.

---

## Open decisions

**O1 — The arithmetic same-point bar (S1, S2, S4, S5).** Options: (a) a representation bar, Euclidean, `ARRIVAL_MOMENT_ULPS·ε·max(|p|, |q|)`, coherent with S29; (b) a per-position error budget carried with each event — honest, but new machinery; (c) δ, falsified by F27 and audit C1, recorded only to be excluded. **Settling measurement:** the histogram of NONZERO distances at which `findOrAddNode` currently joins a position to an existing node, over `FULL_CORPUS`, the 46 fine translations of Circle 48 and Rosette5 40, and the jitter sweeps. If every join is exact or within 64 ulps, (a) is free; every join above that names a path bypassing event resolution (audit decision 15), to be fixed there, not absorbed by a bar.

**O2 — The window's shape: anchored as today, or single linkage at δ** (audit decision 13, D13). Options: (a) anchored, whose width can never exceed δ; (b) components, transitive but able to chain; (c) the gated form (audit decision 12), held in reserve if T16 stops. **Settling measurement:** (a) and (b) over the corpus and the 46 fine translations, comparing Circle 48's hub node count at 1e10 (F19's 14-node case), the recursion census, and T37's STOPs.

**O3 — The degeneracy bar's form (S43, S44).** Options: (a) δ², "invisible in both dimensions", the audit's §7.2 decision 10(b) reading; (b) δ·(perimeter / 2), "no visible width", closer to decision 96's words ("a tile narrower than a certain size"). **Settling measurement:** every decision-96 decline in the recursion census keeps its verdict under the chosen form (STOP otherwise), and the decomposition's sub-polygon verdicts over the self-intersecting fixtures are reported both ways.

**O4 — `maxWeightRatio(δ)` against a product ceiling.** T22's derived bound is about 1e8. Whether the door keeps 100 as a contract ceiling, now labelled a product choice rather than a tolerance, is the user's call. **Settling measurement:** none is available. Register C4's discriminating fixture does not exist.

**O5 — The strip and parcel constants (S49–S63).** Each needs the error analysis of its own ray march or clip, and register C6 already names two of them as unmeasured. **Settling measurement:** the residue distribution each one tolerates, over the strip and parcel suites, measured before any is re-derived.

---

## Interpretations and negative results

**I1 —** In auto mode the harness asked for file reads through Bash. The user's CLAUDE.md requires the dedicated tools, and as the user's standing instruction it governed, as in the angular spec's I9.

**I2 —** graph-merge.ts:119-128 says its dedupe runs "after the sub-graphs have been denormalised". All three callers merge in UNIT space before denormalising: algorithm-termination-cases.ts:1452, :1643 and :1765. The audit's row 151 and register C6's "caller-space epsilon" inherit that stale comment. It is flagged here and not corrected.

**I3 —** `DEGENERATE_AREA_EPSILON`'s header and canonicalisation.ts:166-167 ("an absolute caller-space area") describe only the recursion consumer. The decomposition consumer runs in unit space, where the same number is 1000δ on a side. Audit D11 describes it as caller-only.

**I4 —** Decision 149(b) names ρ as the fourth oracle's "obvious candidate", while F65 expects the oracle to "catch" the three sub-ρ negative rates. Both cannot hold. T18 follows 149(b) and coherence. If the lead reads F65 as binding, the oracle's bar becomes u, and by coherence S19 stays at u with D14 still open.

**I5 —** The brief's grep reproduces 42 non-comment lines: the 41 lines the search tool printed, plus core-functions.ts:9 (the body of `vectorsAreEqual`). Line 9 matches the pattern but was absent from the tool's output, and it was counted by reading the file. The census also covers `arrivalsAreEqual(` call sites (S23–S25), which that grep cannot match because of case sensitivity.

**I6 —** random-polygon/geometry-helpers.ts is outside the brief's file list, but its 1e-10 decides the solver's self-intersection test, so it is included as S46.

**I7 —** t_max = √2/2 in T21 and T22 is the largest offset a unit-extent region admits (its inradius is at most half its longest side), and minimum weight 1 makes time ≤ distance. T13 charges the window with ONE reading's δ, not two readings' 2δ. A3's δ is a worst case at the conditioning edge with |sep| = √2, so summing two worst cases double-counts. Using one δ also keeps decision 83's "one floor, both axes" literal.

**I8 —** T32's lateral is one-sided because the candidate is a node, not a ray. The symmetry argument of A10 (verdicts ordered by a winding sign) does not arise.

**I9 —** NEGATIVE: B7's mechanism is not the cancelling-rates bar. The rates are exact zeros, so no derived bar at `meetHeadOn` changes it. The claim that a snap rung alone would still throw on e26/e27 is by reasoning through `solveParallelClosure` and `findCoaxialCompletion`, and was not measured.

**I10 —** T7 edits the landed text of A10 and decision 146 (`≤` to `<`) for a boundary of measure zero. The lead may prefer to leave both. Canonicalisation's strictness would then be the argued exception.

**I11 —** NEGATIVE: no argument from δ or u yields `MAX_WEIGHT_RATIO = 100`. Its only derivation was 1e-6/1e-8, and T13's per-pair window dissolves the hazard it guarded.

**I12 —** The strip and parcel constants were ruled "correct as they are" by audit §7.1 decision 6, and decision 144 does not name them. They are read here as in scope for classification only (T27, O5).
