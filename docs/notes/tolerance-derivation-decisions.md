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

---

## Measurement record

The measurements behind rules the code states, moved here from the code's comments by the entropy pass (P8a, BSA.D356) so that each site states its rule and its reason and points here. Each subsection is named exactly as its site's pointer names it (`Measured: <spec>, "Measurement record", "<subsection>"`). The text is the record as the comment held it, with its dates, dispatches and the state of the tree it was measured on; it is history, and the code's comment is the current rule.

### degenerateAreaBar: O3's settling measurement

*Moved from constants.ts, `degenerateAreaBar`.*

Measured before the bar moved from `DEGENERATE_AREA_EPSILON = 1e-6` (C8 dispatches 1 and 2, 2026-09-24). Of the recursion census's 22 decision-96 declines (all at full depth, on `Off-edge Jitter Plus (seed 7919)` and `Off-edge Jitter Reflex L (seed 55433, k=4)`, root floor 2.56e-4 in caller units), the form `floor · perimeter / 2` keeps 16 and releases 6 (areas 4.6e-7..8.5e-7 against bars 4.0e-7..5.5e-7); `δ²` would have kept 1. Decision 159(b) ruled that the six be SOLVED before the bar moved: all six solve complete, with zero causality violations on every oracle, I2 and I5 clean, and their strips tiling the canonical region to ≤ 1.25e-16. The decomposition's sub-polygon verdicts over the self-intersecting fixtures agree under the old and the new bar.

The constant it replaced, `DEGENERATE_AREA_EPSILON = 1e-6`, was an absolute area with no derivation, read in two spaces (I3): a caller-space area in the recursion, and a unit-space area in the decomposition, where it was a square 1e-3 on a side — 1000δ.

### The window and the box: register C12's measurement

*Moved from constants.ts, the section "THE WINDOW AND THE BOX".*

F74 traced what the pair does: the box absorbs genuinely later or earlier events 1e-10 to 4e-7 away in time (41 of C11's 44 joins), and if the window moves alone to its per-pair bar, the held box re-joins a later layer's merge onto an orphan edge's own source and leaves a one-edge ring (which the step dropped silently at the time, and now reports as a `step-failure`). Decision 162 rules a perceptual window wrong in principle, and decision 167 chose to move both, together, to the arithmetic bar: the window to each pair's own, the moment bar widened by the two arrivals' complete first-order error budgets, capped at `simultaneityWindow`; the box to exact coordinate equality at S1, S2, S4 and S5.

**Register C12 measured that move and it stopped; both were held by inverse edit (2026-09-25).** The complete model was landed on every `Arrival` and every node (`Arrival.uncertainty`, `positionUncertainties`) and convicted against exact arithmetic, and left unspent, as the division-only budget was after C8 dispatch 2. Measured over 642 cells (`FULL_CORPUS` at 1e-6 and 1e-5, Circle 48 and Rosette5 40 at the 46 fine translations, the off-edge 1e-3 and along-edge 1.0 jitter grids, the jittered Circle 32 ladder, the 62 regular circles of the vertex-count sweep):

- **Decision 167's conviction held.** `Near Regular Circle 48` (native), `Near Regular Peanut 32` and `Slightly Deformed Peanut 2` did not move; every regular circle solved, digest unmoved.
- **The window stopped.** The complete model is honest and it is wide where a bisector is ill-conditioned: a unit-weight bisector's direction error is `5u + 4u·cot(φ/2)` (the parents `φ` apart), so a near-straight jittered vertex carries budgets of up to 2.9e13 moment bars on the corpus (median 1.5, 99th percentile 2.1e4) and reaches the δ cap — the perceptual window again, locally. An anchored per-pair layer then resolves a wide-budget arrival with the earliest while leaving out a narrow-budget arrival of the same edges that is unorderable against it: `Off-edge Jitter Plus`, k = 9, seed 23757, strips 1.1% short with every oracle clean (F73's class); k = 7, seed 31676, an offset and a direction violation; four cells off machine-precision tiling (1.7e-13 to 3.6e-10). Filtering the whole list rather than cutting at the first refusal also gave `Off-edge Jitter Plus (seed 7919)` a direction violation and stopped two off-edge cells solving.
- **The box, exact, is mostly what decision 167 said** — sub-floor fans become separate nodes, trees and tilings improve on the translated circles — but alone it gives `Near Regular Circle 48` at 2e11 an offset and a direction violation (while curing that cell's 57% tiling miss), and at S5 the offset projection's two ends of a zero-length segment are computed independently and differ by ulps, so an exact S5 keeps a repeated vertex (`offset-event-boundary-regression.test.ts`, two tests).

The package's own report carries every table; the lead rules on the next mechanism.

### HELD_SIMULTANEITY_WINDOW: the three measured moves

*Moved from constants.ts, `HELD_SIMULTANEITY_WINDOW`.*

Held at `1e-8` as a measured STOP three times (T14, T16, T37; register C12).

- **Dispatch 1 (the flat δ window, F70):** S22 alone moved the four predicted defect digests and stopped fixtures solving, grew a direction violation and a diagnostic on `(seed 55433)`, moved the recursion census and `Offset Cross Junction`'s ladder; S28 alone stopped one plus cell solving — STOPs 1, 2, 3, 6.
- **Dispatch 2 (T12 as amended by journal decision 160, the per-pair window `pairSimultaneityWindow` in collision-helpers.ts, capped at δ, division-only budget):** with all seven sites at it, 211 of 580 sweep cells move and 45 core tests fail — `Near Regular Circle 48` and the vertex-count sweep's regular circles stop solving, and two clean digests move (`Near Regular Peanut 32`, `Slightly Deformed Peanut 2`).
- **Register C12 (the per-pair window with the complete first-order model, beside an exact box):** the three fixtures dispatch 2 split are gathered and unmoved, and the move stops elsewhere — see "The window and the box: register C12's measurement".

### ARITHMETIC_SAME_POINT_BOX: O1's histogram and the exact box

*Moved from constants.ts, `ARITHMETIC_SAME_POINT_BOX`.*

O1's settling histogram (dispatch 1, 2026-09-24) found joins above 64 ulps — 43 of them at 5e5 to 5.2e7 ulps of the unit extent (7e-10 to 1.16e-8), on Circle 48 and Rosette5 40 at fine translations, one off-edge jitter cell and eight cells of the jittered Circle 32 ladder — that do not correlate with the pricing's conditioning. F74 traced them: 41 of 44 are this box absorbing a genuinely later or earlier event (1e-10 to 4e-7 away in time), which decision 141 would admit as a distinct node.

Register C12 measured the box at the arithmetic bar beside the per-pair window and the move stopped (see "The window and the box: register C12's measurement"). At S2, coordinate equality alone (without "or one instigator") moved seven clean digests by at most 1.93 ulps.

### POINT_ON_RAY_SINE_BAR (held)

*Moved from constants.ts, `POINT_ON_RAY_SINE_BAR`.*

T32 moves the snap's point-on-ray sine (S10) to the coaxial form, as the closure's (S11) moved. Measured in dispatch 2, and again in dispatch 3 on a tree with S6, S11 and S20 landed: at the lane the snap gives `Off-edge Jitter Plus`, k = 3, seed 47514 (the off-edge 1e-3 grid) an offset violation of its own, diagnosed as a `causality-violation` on a cell that had none — T37 STOP 3 — and moves 39 of the 580 sweep cells by digest (15 of Circle 48's fine translations, 5e9..1e11; 18 off-edge plus cells and one L cell; 5 cells of the jittered Circle 32 ladder, one of which, 1 × 1e-8 seed 2, loses a node). So it stays at `1e-8`. `tolerance-derivation.test.ts` asserts the held state on that cell. The site's own record is "pointLiesOnRay: the snap's measurements".

### ZERO_RATE_SINE_BAR (held)

*Moved from constants.ts, `ZERO_RATE_SINE_BAR`.*

`addBisectionEdge`'s zero-rate sine (census S19) is held at `1e-8`. Three re-derivations were measured and refused: T17's ρ (dispatch 2, decision 161(b)), `k·u` and the forward bound 8u (dispatch 3, decision 164). The measurements are under "addBisectionEdge: the zero-rate bar's re-derivations".

### pointLiesOnRay: the snap's measurements

*Moved from algorithm-termination-cases.ts, `pointLiesOnRay` doc comment.*

`pointLiesOnRay` was the predicate of BOTH point-on-ray sites until C8 dispatch 3, when the closure's (S11) moved to
the coaxial form (`anchorLiesOnRay`); the snap's did not (see `POINT_ON_RAY_SINE_BAR`).

It stayed at the scratch epsilon, as a sine — a measured STOP, not an omission (spec A15's point-on-ray row, A25
STOP 4; journal decision 146). The spec moves it into the floor's category: forward by the exact sign and LATERAL
within the coaxiality floor, the form `sourceLiesAhead` uses, so a node the coincidence merge displaced by a sub-floor
distance is recognised on the ray it sits on. That form was written and measured on 2026-09-23, each site alone and
all other sites at their old bars, over `FULL_CORPUS`, Circle 48 and Rosette5 40 at the forty-six fine translations
1e8..1e13, and `NEAR_REGULAR_CIRCLE_32` jittered at 1..100 epsilons over eight seeds:

- the corpus is untouched at both sites;
- at the SNAP (`tryAttachEdgeToNode`) 16 cells grow a causality count — Circle 48 at 5e9..8e9 gains an offset and a
  clearance violation, at 2e10..1e11 an offset violation — and the jittered circle at 3 epsilons, seed 6, goes from a
  signalled failure to `complete: true` with empty diagnostics while carrying 3 offset and 1 direction violations;
- at the CLOSURE (`solveDegenerateClosure`) four cells go from a signalled failure to complete with empty
  diagnostics: Circle 48 at 2e9 — leaving the pinned failing list of `large-coordinate-known-failures.test.ts` while
  still carrying its clearance violation — and three jittered circles, one of which gains an offset violation it did
  not have. One of the four (30 epsilons, seed 7) comes out clean.

A defect that stops announcing itself is a defect that got worse (journal decisions 72 and 134(c)): the same failure
mode decision 138(a) measured at `intersectRays`' identical-source exit. Both sites therefore kept the arithmetic bar
they had, `directionsAreSame` at the epsilon, until the tolerance package (register C8) moved the half-merge windows
these displaced nodes come from.

### anchorLiesOnRay: the closure's point-on-ray at the lane

*Moved from terminal-ladder.ts, `anchorLiesOnRay` doc comment, and `solveDegenerateClosure`'s exact-separation note.*

`anchorLiesOnRay` was `pointLiesOnRay`'s sine at `1e-8` — the sine form on a raw separation is a lateral bar that
grows with the separation (spec A9). MEASURED over dispatch 2's 580 cells, and again on landing (C8 dispatch 3): the
verdict flips 45 times on 26 cells (Circle 48 and Rosette5 40 at fine translations, one off-edge plus cell, five
Circle 32 ladder cells) and 0 cells move — node positions, edge targets and bases, verdict, node count and all four
oracles — and no full-graph digest pin moves.

In `solveDegenerateClosure`, the zero-separation test (census S12, C8 spec T9) was `areEqual(distance, 0)` at the
scratch 1e-8; measured before it moved to exact, no separation on the corpus, the fine translations or the jitter
sweeps fell in the band (0, 1e-8).

### addBisectionEdge: the zero-rate bar's re-derivations

*Moved from algorithm-helpers.ts, `addBisectionEdge`, the zero-rate test (census S19).*

THE ZERO TEST IS IN THE ONE ANGULAR FORM; ONLY THE SIGN COMES FROM THE RATE ITSELF. The rate is
`cross(bisectedBasis, clockwiseParent)` and both operands are unit, so `sineIsBelow` is the same bar and the same
number as the `areEqual(offsetRate, 0)` it replaced — but it names the space, which `areEqual` on a cross product never
did (journal decision 105). HELD at 1e-8 (census S19): three re-derivations were measured and each refused — see the
last three paragraphs.

HISTORY: IT STAYED AT THE SCRATCH EPSILON, ON THE RATE'S OWN OPERANDS — A MEASURED STOP, NOT AN OMISSION (spec A15's
`addBisectionEdge` row, A25 STOPs 3 and 4; journal decision 146). The spec moves it to the angular resolution on the
RAW PARENT directions `(cw, ws)`, the operands `ensureBisectionIsInterior` reads, to close D14. Both readings of that
row were measured on 2026-09-23 and both were refused by the corpus:

- LITERALLY, orientation-blind — `sineIsBelow(cw, ws, angularResolution)`: a near-STRAIGHT vertex (parents pointing
  the same way, sine under the bar) then takes this branch, where `ensureBisectionIsInterior` calls it straight and
  never flips a bisector that `normalize(c − b)` pointed out of the polygon. `Off-edge Jitter Reflex L (seed 55433)`
  and `Off-edge Jitter Plus (seed 7919)` STOP SOLVING (STOP 3), and four clean fixtures (T-Shape, both dumbbells, Three
  Globe Chain) reach the branch they never reached.
- ORIENTATION-AWARE — `directionsAreSame(cw, −ws, angularResolution)`, anti-parallel parents only, which is what "a
  zero rate" means: three bisectors are born with a NEGATIVE offset rate — `Off-edge Jitter Plus (seed 7919)` e48 at
  −8.8e-6 and e52 at −3.4e-6, `Off-edge Jitter Reflex L (seed 55433, k=4)` e48 at −7.8e-6, every one below the angular
  resolution — breaking the bisector rate rule, which `wavefront-causality.test.ts` holds universal over `FULL_CORPUS`
  (STOP 4). Re-measured 2026-09-23 under the solver's own causality check (journal-5 decisions 148, 149): both fixtures
  stay complete, the offset, clearance and direction counts do not move on either instrument, and NO diagnostic is
  raised — the negative rates are seen ONLY by the test-side rate check, which the solver does not run.

A rate of a few parts in 1e6 is a real, if slow, wavefront direction: pricing it as zero hands the direction to the
parent ordering, which disagrees with the rate's sign. So the rate's own zero test keeps the arithmetic bar it had, and
D14 stays open — now with `ensureBisectionIsInterior` at the resolution, where the rate's zero is reached only below
`1e-8` and every such vertex reads straight. The tolerance package (register C8) owns this site's re-derivation.

C8 DISPATCH 2 MEASURED T17 AND IT STOPS (2026-09-24, T37 STOPs 1 and 3). `directionsAreSame(cw, −ws, ρ)` on the raw
parents, with the fourth oracle landed at T18: the three sub-ρ negative rates appear as F65 found them and the oracle
correctly leaves them unflagged, three off-edge jitter cells lose a direction violation (the L at k = 2 seed 55433, the
plus at k = 4 seed 47514 and k = 6 seed 15838) — but the jittered Circle 32 at 3 × 1e-8, seed 7, STOPS SOLVING (a
pair-handler step failure on e71/e76), and the plus at k = 2, seed 23757 gains an offset violation of 1.77e-6 with its
`causality-violation` diagnostic. The fourth oracle stands on its own (causality-check.ts).

C8 DISPATCH 3 MEASURED `|rate| ≤ k·u` (decision 161(b)) AND IT MOVES A CLEAN FIXTURE. Over dispatch 2's 580 cells five
births have a rate in (k·u, 1e-8): `Golf Cart` e16 (−7.28e-16) and e21 (+7.28e-16) at 1e-6 and at 1e-5, and the
jittered Circle 32 at 1 × 1e-8, seed 5, e70 (−6.22e-9). The two negative ones are flipped by the sign rule where the
parent ordering kept them, and the clean `Golf Cart` became a SILENT wrong answer — complete, empty diagnostics, all
four oracles clean, but its skeleton no longer a tree and its strips 3.2% short of the canonical area.

C8 DISPATCH 3 THEN MEASURED THE FORWARD BOUND, 8u (`offsetRateIsArithmeticZero`, journal-5 decision 164), AND IT
MOVES THE SAME FIXTURE ONE LEVEL DOWN. At the ROOT it does what decision 164 asked: `Golf Cart`'s 3.3u rates are
zeroed, and over the 580 cells ONE cell moves — the Circle 32 cell above, 52 → 53 nodes, e70 a true negative priced by
its sign, still complete and clean on all four oracles; no digest pin moves. But in the recursion, `Golf Cart`'s
LEVEL-1 regions carry the same corridor at rates of 5.2u to 24u (±1.16e-15, ±1.53e-15, ±4.32e-15, ±5.35e-15, on walls
tilted 2.3e-15 to 1.07e-14 in the region's own unit space), above 8u; priced by sign, a level-1 region's strips cover
3.2% less than its canonical area — the root's failure again — and `recursive-subdivision.test.ts` fails (2 tests).
Attributed by toggle: this site back at 1e-8, the recursion passes. So the site stays HELD (journal-5 decision 164's
instruction). NOTE, MEASURED: `Golf Cart`'s root rate is NOT rounding. Its vertex 3 sits at y = 399.99999999999994,
one ulp below 400, so wall e2 is tilted by 1.456e-15 and the exact rate is ±7.28e-16, the computed value; the regions'
larger tilts are that same ulp read on shorter, re-normalised walls. The rates this site must not price by sign are
TRUE rates of a sub-perceptual tilt, which no rounding bound on the rate separates from e70's −6.22e-9.

REGISTER C12 MEASURED IT AGAIN, AS THE THIRD MEMBER OF THE WINDOW/BOX SET (journal-5 decisions 165, 167(d)), at the
forward bound 8u on the tree with the per-pair window and the exact box: at the root 0 of 642 sweep cells move; in the
recursion `Golf Cart`'s level-1 regions still cover 3.23% less than their canonical area and `Golf Cart` throws in
"subdivides without throwing". The window and box moving did not change it. HELD by inverse edit, and the window and
the box are held beside it (constants.ts, "THE WINDOW AND THE BOX").

### The per-pair layer window, filtered and as a prefix

*Moved from algorithm-complex-cases.ts, `layerWindow`.*

Register C12 measured the per-pair form of the layer window with the complete error model (journal-5 decision 167),
and it stopped (see "The window and the box" for the whole move). Two readings of "every arrival within the per-pair
window of the earliest" were measured.

- **Filtering the whole list** admits a later arrival with a wide budget while refusing an earlier one of the same
  edge with a narrow budget. On `Off-edge Jitter Plus (seed 7919)` the ring [22, 25, 26, 43, 45] took 26 × 43
  (4.07e-11 after the earliest, budget 2.79e-11) into the layer with 25 × 45 (budget 1.52e-11) and left 22 × 43
  (2.29e-11 after it, budget 2.2e-15) out, and a direction violation appeared.
- **The prefix form** — `layerWindow`'s own shape, cut at the first refusal — removes that, but still resolves a
  wide-budget arrival with the earliest while a narrow-budget arrival of the same edges, unorderable against it, is
  left out: `Off-edge Jitter Plus`, k = 9, seed 23757 took 164 × 229 (8.6e-11 after a split, budget 9.5e-10) with the
  split and left 164 × 237 (2.8e-12 later still, budget 1.1e-11), and its strips came out 1.1% short.

The window the layer reads is therefore the held `HELD_SIMULTANEITY_WINDOW`, applied as a prefix.

### The component-diameter census of the coincidence clustering

*Moved from coincident-events.ts, `clusterCoincidentMerges`.*

The clustering used to be CONNECTED COMPONENTS under `isOneEvent` — single linkage, so a run of events each within the
floor of the next became one group however far its extremes lay apart. Journal decision 155(b) (C8 dispatch 1) made it
anchored.

**Measured before it moved** (C8 dispatch 1, the component-diameter census): over `FULL_CORPUS` at 1e-6 and 1e-5,
Circle 48 and Rosette5 40 at the 46 fine translations, and the jitter sweeps (the 160-cell off-edge 1e-3 grid, the
160-cell along-edge stage-off grid, the 48-cell jittered Circle 32 ladder), 23 421 components were formed. On the corpus
the widest was 5.44e-7 at 1e-6 and 4.42e-6 at 1e-5 — inside the floor, so there the anchored partition IS the
component partition and nothing moves. Off it, 15 components were wider than the floor (Circle 48 at 4e10, 5e10, 6e10
and 2e11; eleven off-edge jitter cells; widest 1.906e-6), and those are the cells the anchored restatement moved.

The oldest form of the function joined each event to the first group already within tolerance of it in the order the
layer happened to list them, which made the partition depend on list order (a 48-gon fan left it as four groups).

### The split sites' same-point bar read exact

*Moved from coincident-events.ts, `coincidentEventPositions`.*

Register C12 measured this bar (census S2) exact, with the box, and it is held with it (journal-5 decision 167; see
"The window and the box"). Read as coordinate equality alone it re-points the re-report groups of seven CLEAN fixtures
(`Failing Long Octagon`, `Not Solvable Heptagon`, `Long Unbroken Side Then Extreme Acute Angle`, `Incorrect Ordering
e38-e30 Collision`, both `Premature Bisector Split`s, `Short Edge Promontory`) — every one a group of reports of ONE
split, one instigator, 0.03 to 1.93 ulps apart — and moves their digests by that much. The exact form that moved no
clean digest also left alone any group whose members all name one instigator, which acceptance already resolves to one
node (the first resolved consumes the instigator; the rest place nothing).

Re-pointing a group the box already unifies at its medoid was also measured: it moves one coordinate by one ulp on four
CLEAN fixtures, for no gain at all — they were one node before and one node after.

### The per-pair simultaneity window spent at the seven sites

*Moved from collision-helpers.ts, `pairSimultaneityWindow` (and the matching notes at `compareArrivals`, `compareArrivalsAtPairWindow` and the S23 phantom test in `collideInteriorEdges`).*

Landed and measured twice, not spent — a measured STOP both times (T16, T37).

**C8 dispatch 2, the division-only budget.** This window, with the DIVISION-ONLY budget, STOPPED: 211 of 580 sweep cells
moved, `Near Regular Circle 48` and the regular circles stopped solving, and two CLEAN digests moved (`Near Regular
Peanut 32`: `e37 × e57`, readings 5.0e-15 apart against a moment bar of 2.9e-15 and budgets of 6.4e-16 each; `Slightly
Deformed Peanut 2`). F71 read the gap as the rounding of the bases, the rates and the source offsets that budget did not
charge; F74 found the circles' failure was the held BOX re-joining a later layer's merge onto an orphan's own source.

**Register C12, the complete model.** Register C12 (journal-5 decision 167) spent it at all seven sites S22–S28, through
`compareArrivalsAtPairWindow`, each passing the solve's `simultaneityWindow` (δ) as the cap, with the budgets of the
COMPLETE first-order model and the same-point box exact beside it: the three fixtures dispatch 2 split were gathered and
unmoved, and the move STOPPED elsewhere (see "The window and the box"). The S23 phantom test's window was held with the
other six through C8 dispatches 1 and 2 and register C12.

### The offset-rate zero test (S20)

*Moved from collision-helpers.ts, `offsetDistanceWithBudget` (the `noGradient` bar), and the `meetHeadOn` division guard.*

**The move to the angular resolution, refused.** The bar stayed at the scratch epsilon — a measured STOP, not an
omission (spec A15's `makeOffsetDistance` row, A25 STOP 3; journal decision 146). Moved to the angular resolution, on
its own and with every other site at its old bar, and RE-MEASURED 2026-09-23 under the solver's own causality check
(journal-5 decisions 148, 149): ONE defect fixture stops solving — `Off-edge Jitter Reflex L (seed 55433, k=4)`, with
step failures and unresolved edges — and three stay complete while gaining violations, every one of them diagnosed as
a `causality-violation` (offset/clearance/direction): `(seed 15838)` 0/0/0 → 1/1/1, `(seed 55433)` 0/0/0 → 1/0/1,
`Off-edge Jitter Plus (seed 7919)` 0/0/0 → 0/1/0. (An earlier measurement had all three reflex-L fixtures stop solving;
it no longer held at that date.) The mechanism is inferred rather than traced: a ray whose rate against its parent is a
few parts in 1e6 — a slightly skewed corridor mid-line — is then priced as travelling at CONSTANT offset while its
partner's arrival is priced at its true rate, and the equi-time check that follows (`arrivalsAreEqual`, at the scratch
epsilon) reads the pair as phantom.

**The forward bound, 8u, since C8 dispatch 3** (census S20; spec T2, T30; journal decisions 161(e) and 164). The bar was
held at a named sine literal `1e-8` through dispatches 1 and 2 (T33's precondition, dissolved by decision 161(e)).
Measured on dispatch 2's 580 cells: at the retired 1e-8, 37 evaluations of a rate in (2u, 1e-8) were zeroed, on three
cells: `Golf Cart` at 1e-6 and at 1e-5 (e16 and e21, |rate| 7.28e-16 = 3.3u) and the jittered Circle 32 at 1 × 1e-8,
seed 5 (e70, 6.22e-9). `k·u`, landed first in dispatch 3, priced all of them and moved the `Golf Cart` digest pin (e16
and e21's `maxOffset` by tens of ulps); at 8u the `Golf Cart` rates are zeroed again and its pin is back to native.
What 8u prices that 1e-8 zeroed is e70 alone — one bisector on one cell, 19 evaluations — and the site moves no cell:
geometry, verdict, node count, every oracle and every digest pin unmoved.

**`meetHeadOn`'s division guard** was `FLOATING_POINT_EPSILON·wA·wB` before it was re-derived from the unit roundoff
(spec A6 as amended, journal decision 144). At unit weights the new bound is at most 8u ≈ 8.9e-16, seven orders inside
the old 1e-8; measured 2026-09-23, no evaluation on `FULL_CORPUS` falls between the two.

### The identical-source exit (S6)

*Moved from intersection-edges.ts, `intersectRays` (the identical-source exit), and the forward test of `sourceLiesAhead`.*

**The exit stayed at the arithmetic bar, a measured negative result rather than an omission** — spec A15's
identical-source row, measured 2026-09-11 and referred back to the lead. The spec's argument for moving it is sound on
its face: "are these two sources one point?" is the degenerate case of "are these two sources on one line?", so asking
the first at `1e-8` while the second is answered at the floor leaves a band in which a pair is one line and not one
point, decided by nothing. The row was therefore written as `distanceToRay2 <= coaxialityFloor` and run over the whole
corpus at the library floor.

What it did is not a cure. Twenty pinned assertions across four suites moved, and every one of them moved the same
way: a solve that FAILED LOUDLY started reporting `complete: true` with an empty diagnostics list, while still carrying
the violations that made it a defect. Audited with `wavefront-causality.test.ts`'s own three oracles, re-derived from
geometry:

- `NEAR_REGULAR_CIRCLE_32` jittered 15 epsilons at seed 2 — the cell `near-regular-polygons.test.ts` pins expressly as
  "a signalled failure rather than a backwards-bisector pass" — came back complete with 2 offset violations, 2
  DIRECTION violations (one at `dot = -0.98`, a bisector wired essentially straight backwards) and 2 clearance
  violations;
- `NEAR_REGULAR_CIRCLE_48` at translation 1e10: complete, with 2 offset, 4 direction and 5 clearance violations;
- `NEAR_REGULAR_ROSETTE5_40` at translation 1e11: complete, with 1 offset and 13 clearance violations.

A defect that stops announcing itself is a defect that got WORSE (journal decision 72's doctrine, decision 134(c), spec
A25's STOP 4), and rewriting the corpus's failure register was the lead's call and not a delegate's — the precedent is
journal decision 126, which left W-spec W33 unimplemented on exactly this reasoning. The mechanism: these fixtures fail
because a k-way convergence half-merges into hubs a few times `1e-8` apart, and a `1e-6` identical-source exit swallows
the whole half-merge, terminating pairs that should have collided and reporting the wreck as finished. The coaxiality
lane itself (`sourceLiesAhead`) was untouched by this; it is a different site with a different measurement.

**Re-measured 2026-09-23 under journal decision 138(a)'s instrument, and reverted again** (journal decisions 144 and
146, dispatch 1 of the angular package). The move was made again on top of the derived angular resolution, to STAND
only if every causality oracle count (offset, clearance, direction) was zero or unchanged on every cell AND no solve
went from a signalled failure to `complete: true` with empty diagnostics. Measured over `FULL_CORPUS`, Circle 48 and
Rosette5 40 at the forty-six fine translations 1e8..1e13, and `NEAR_REGULAR_CIRCLE_32` jittered at 1/3/10/15/30/100
epsilons of its span over seeds 0..7 (199 cells):

- the corpus itself was untouched — every fixture's verdict and oracle counts identical;
- 32 cells went from a signalled failure to complete with empty diagnostics — 12 of Circle 48 (2e9, 5e9..1e10,
  2e10..6e10), 13 of Rosette5 40 (7e10..1e12) and 7 jittered circles, among them 15@2 again (offset 0→2, clearance
  0→2, direction 0→2);
- 68 cells grew an oracle count — Circle 48 at 4e10..6e10 went to 8 offset and 8 direction violations from 2 and 1 —
  and 15 jittered-circle cells that solved then failed.

Both halves of the instrument failed, so the exit stayed at the arithmetic bar until the tolerance package (register
C8) moved the half-merge windows that feed it.

**Exact since C8 dispatch 3.** Held at a named literal `1e-8` through dispatches 1 and 2 while T33 waited on the window;
decision 161(e) dissolved that precondition (the held window IS the tree these sites live on). The band (0, 1e-8) was
measured EMPTY in dispatch 2 over its 580 cells — `FULL_CORPUS` at 1e-6 and 1e-5, Circle 48 and Rosette5 40 at the 46
fine translations, the off-edge 1e-3 and along-edge 1.0 jitter grids, the jittered Circle 32 ladder — with 0 cells
moving, and RE-MEASURED on landing: still empty, 0 of 580 cells moving. Until then, a pair of distinct sources closer
than δ left `intersectRays` by this exit before reaching `sourceLiesAhead`'s forward test; with the exit exact, such a
pair reaches the forward test and its exact sign decides — on the 580 measured cells, with no verdict moving.

### The near-parallel gate at the angular resolution

*Moved from intersection-edges.ts, `intersectRays` (the near-parallel guard).*

The gate was the retired `PARALLEL_GATE_SINE_BAR` (1.4142e-4), the scratch epsilon read through `areEqual(|dot|, 1)`.
Measured 2026-09-23 on the move to the angular resolution: the full-graph digest is bit-identical across all 59
fixtures, and on the off-edge jitter sweeps the move re-pairs four cells structurally (node counts ±1, no oracle
moves) and gives ONE unpinned cell — the plus at k = 10, seed 23757 — one offset and one direction violation it did not
have, while it still completes. Reported, not pinned.

The coaxiality lane (`sourceLiesAhead`) was formerly answered at `FLOATING_POINT_EPSILON`, hybridised with a
`Math.max(1, separation)` that made it relative above unit separation and absolute below; that is the defect journal
finding F57 traced (the reading of `r0.2.1` stays at the site). The collinearity exits were formerly asked as a sine at
the angular resolution on the raw separation.
