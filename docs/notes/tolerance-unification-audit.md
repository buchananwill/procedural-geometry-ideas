---
title: "Tolerance Unification: Audit and Draft Decision Spec"
type: decision-spec
status: awaiting-ruling
---

# Tolerance unification — audit and draft decision spec

## 0. What this document is

This is the **tolerance audit** mandated by journal decision 101, plus the **draft decision spec**
it was commissioned to produce. It is written to stand alone: a reader who has never opened
[the session-3 journal](./recursive-subdivision-arc-journal-3.md) can follow it, and every claim
carries either a `file:line` citation into the source or a journal citation for provenance.

**No code changed to produce this document.** It contains evidence and a proposal. The numbered
decisions in §7 are a *draft*: they are for the arc lead to rule on with the user, and several are
explicitly marked **OPEN** with the measurement that would settle them.

Reading order if you are short of time: §1 (the ruling), §4 (the disagreement map — this is the
evidence), §7 (the draft spec). §3 is the reference table.

---

## 1. The ruling this serves

The user, 2026-08-29, after stepping through the rendered skeleton on the dashboard (journal
decision 101, near-verbatim):

> "The measure of a tolerance's value is whether it normalizes minimum-perceptual-difference for
> the system it serves. It isn't doing that here. The nodes do not visibly separate at any zoom
> level. That's a first-class numerical precision defect, and the fact that it causes downstream
> defects is a pure artifact of having different tolerance thresholds that aren't conceptually
> agreeing on what is signal and what is noise. Picking the right winner wouldn't fix this defect —
> it would just give us a different degenerate-level edge."

Two earlier rulings set the frame this one completes:

- **Decision 54 (user, 2026-08-27).** `FLOATING_POINT_EPSILON = 1e-8` is a deliberate choice — the
  Unreal Engine "small number" constant — and the precision bar is **pragmatic, not analytic**. The
  criterion in the user's words: *"can you see this on a screen?"* This is a practical solver for
  practical geometry; an infinitely small roof section can no more be built than rendered.
- **Decision 78 (2026-08-28).** The node-merge bar was restated at the render-scale floor: two
  skeleton nodes within `SKELETON_NOISE_FLOOR` (1e-6, unit space) of each other are one node. Ruled
  on the user's own criterion, twice stated, and after measuring that separating the disputed pair
  visually would need a **7480× zoom**
  ([coincident-events.ts:20-25](../../packages/core/src/straight-skeleton/coincident-events.ts)).

Decision 101's charge is that the solver has **more than one answer** to "what is too small to be
real", that those answers differ by up to eleven orders of magnitude, and that they are applied to
quantities of the same kind — sometimes to the *same* quantity. §4 is that charge, evidenced.

---

## 2. The spaces — vocabulary, because most of the confusion is here

Every threshold in this codebase lives in exactly one of these spaces. Two thresholds that look
comparable but sit in different spaces are not comparable at all, and several of the disagreements
in §4 are exactly that mistake.

| Space | What it means | Established by |
| --- | --- | --- |
| **Caller space** | The coordinates the user handed in. A polygon may span 1e-3 or 1e8. | the API boundary |
| **Root unit space** | Caller space scaled so the root polygon's **longest bounding-box side is 1**, and centred. The scale is rounded to a **power of two**, so the scaling is exactly invertible; the centring is not. | [normalisation.ts](../../packages/core/src/straight-skeleton/normalisation.ts) |
| **Region unit space** | The same normalisation applied to a *sub-region* against **its own** extent. A thin sliver scales up enormously here. | [recursive-subdivision.ts:618](../../packages/core/src/straight-skeleton/recursive-subdivision.ts) |
| **Offset / time** | The wavefront's clock. An offset **is a length** in whatever space the solve runs in — this is why decision 83 could say "one floor governs both axes". | [offset-projection.ts](../../packages/core/src/straight-skeleton/offset-projection.ts) |
| **Area** | A squared length. Scales as the square of whatever the length space is. | [constants.ts:19](../../packages/core/src/straight-skeleton/constants.ts) |
| **Dimensionless** | Dot products, sines, parametric `t ∈ [0,1]`, area ratios. A tolerance here is *not* a length and does not transform. | many sites |
| **Angle (radians)** | Mitre tolerances, turn deviations. | [strip-decomposition.ts:132](../../packages/core/src/straight-skeleton/strip-decomposition.ts) |
| **Relative-to-measured-scale** | A fraction of a quantity the solve itself produced (max offset, strip scale, segment-length product). | [offset-projection.ts:290](../../packages/core/src/straight-skeleton/offset-projection.ts) |

Three facts about these spaces are load-bearing for everything below.

1. **Normalisation exists precisely to make an absolute epsilon relative.** `FLOATING_POINT_EPSILON`
   is an absolute `1e-8` compared against raw coordinates; against a 500-unit span that is a
   relative tolerance of 2e-11, and against a 30 000-unit span it is 3.3e-13 — "at exactly the
   scale where doubles start to hurt". Normalising to unit extent "keeps the `1e-8` and makes it
   relative BY CONSTRUCTION, because the solver never again sees a magnitude it did not choose"
   ([normalisation.ts:11-16](../../packages/core/src/straight-skeleton/normalisation.ts)).
2. **The root-to-region conversion is the recursion's open wound.** The canonicalisation floor is
   measured once against the **root** extent and passed down as a caller-space length
   ([recursive-subdivision.ts:573-575](../../packages/core/src/straight-skeleton/recursive-subdivision.ts)),
   because letting each sub-region use its own extent would scale a sliver up and shrink its floor
   in world terms. Every *other* tolerance in the solver is evaluated in whatever unit space the
   region it is running on happens to have. So one tolerance is root-anchored and the rest are
   region-anchored, in the same solve.
3. **The pass-down is not free, and this was measured, not assumed.** Threading the root floor into
   the *coincidence* rule was falsified before implementation (journal decision 87): the one
   blocking clean region has a root/child extent ratio of **1.000** — inheritance moves its floor by
   nothing — and the failing set includes five slivers at ratios up to **496 939**, where the
   inherited floor is *half the region* and only a cap (a forbidden new threshold) could contain it.
   Independently, F4 recorded that when the canonicalisation root floor *was* threaded down the
   band **narrowed** against prediction, because a sub-region's own floor is smaller in world terms
   than the root's.

---

## 3. The threshold inventory

Grouped by what a threshold *is*, not by which file it lives in. The last column states each one's
conceptual role as a **signal-vs-noise claim** — the form decision 101 asks for.

Line numbers were verified by reading, at the tree state of 2026-08-29. **Caveat:**
`algorithm-complex-cases.ts` and `collision-helpers.ts` were being edited by another worker while this
audit was written; their citations were re-verified against the working tree at the end and are
current as of then, but the predicate text quoted in each row is the durable identifier — search for
it if a line number has moved.

### 3.1 The two production geometric constants

| Constant | Value | Site | Space | Signal-vs-noise claim |
| --- | --- | --- | --- | --- |
| `FLOATING_POINT_EPSILON` | `1e-8` | [constants.ts:3](../../packages/core/src/straight-skeleton/constants.ts) | root unit space; *absolute*, made relative by normalising the polygon to unit extent | "Two numbers differing by less than this are the same number as far as the arithmetic that produced them can tell." Decision 54: a deliberate choice, the Unreal Engine small-number constant, pragmatic not analytic. |
| `SKELETON_NOISE_FLOOR` | `1e-6` | [canonicalisation.ts:141](../../packages/core/src/straight-skeleton/canonicalisation.ts) | root unit space | "A boundary feature deviating less than this from its chord cannot be seen and contributes only numerical difficulty." Clears the epsilon by two orders "and that gap is the entire point of the stage". Measured usable band `[1e-6, 3e-6]`. |

Every other production tolerance in the solver is one of these two, applied through
`areEqual` / `vectorsAreEqual` / `fp_compare`
([core-functions.ts:4-20](../../packages/core/src/straight-skeleton/core-functions.ts)), or a
scale-relative tolerance of the downstream pipeline (§3.4).

### 3.2 Where the epsilon is applied, and in which space

`areEqual(a, b)` is `|a − b| < 1e-8`. The **space** column is what makes this table worth reading:
the same constant is applied to lengths, to dot products, to cross products, to offset rates and to
parametric fractions.

| Site | Predicate | Space the quantity lives in | What it claims is noise |
| --- | --- | --- | --- |
| [solver-context.ts:131-133](../../packages/core/src/straight-skeleton/solver-context.ts) | `vectorsAreEqual(n.position, position)` in `findOrAddNode` | root unit space, **component-wise box** | "Two positions this close are the same node." |
| [algorithm-complex-cases.ts:152](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts) | `fp_compare(collision.offsetDistance, bestOffset) <= 0` | root unit space **offset** (a length) | "Two arrivals this close in time are in the same layer." |
| [intersection-edges.ts:30](../../packages/core/src/straight-skeleton/intersection-edges.ts) | `lateral <= FLOATING_POINT_EPSILON * Math.max(1, separationDistance)` | length, **relative above unit separation, absolute below** | "This much lateral offset does not stop two anti-parallel rays being head-on." |
| [intersection-edges.ts:46](../../packages/core/src/straight-skeleton/intersection-edges.ts) | `areEqual(distanceToRay2, 0)` | length | "Two ray sources this close are one source (`identical-source`, a terminal state)." |
| [intersection-edges.ts:54](../../packages/core/src/straight-skeleton/intersection-edges.ts) | `areEqual(Math.abs(dotOfBasisVectors), 1)` | **dimensionless dot product** ⇒ effective angle **1.41e-4 rad** | "Two directions this close are parallel." |
| [intersection-edges.ts:56](../../packages/core/src/straight-skeleton/intersection-edges.ts) | `vectorsAreEqual(r1SourceToR2Source, ray1.basisVector, 1e-4)` | **dimensionless unit direction**, explicit `1e-4` ⇒ ≈ **1e-4 rad** | "Two directions this close are collinear-same-way." *No comment, no measurement anywhere in the record.* |
| [algorithm-termination-cases.ts:109](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `vectorsAreEqual(direction, edgeData.basisVector)` in `tryAttachEdgeToNode` | dimensionless unit direction ⇒ ≈ **1e-8 rad** | "This node lies on this bisector's ray." |
| [algorithm-termination-cases.ts:117](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `localOffset < 0 && !areEqual(localOffset, 0)` | offset (length) | "A snap this close to the birth offset is not before it." (causality) |
| [algorithm-termination-cases.ts:133](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `!areEqual(candidateOffset, snapOffset)` | offset (length) | "Both sides agree on when the meeting happens." |
| [algorithm-termination-cases.ts:228](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `areEqual(distance, 0)` in `solveDegenerateClosure` | length | "This edge is already sourced at the anchor." |
| [algorithm-termination-cases.ts:233](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `vectorsAreEqual(direction, ray.basisVector)` | unit direction ⇒ ≈ 1e-8 rad | "The anchor lies ahead on this ray." |
| [algorithm-termination-cases.ts:252](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `arrivalOffsets.every(o => areEqual(o, arrivalOffsets[0]))` | offset (length) | "All these arrivals are simultaneous — a terminal closure, not an ordinary collision." |
| [algorithm-termination-cases.ts:304](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `areEqual(crossProduct(parents[i], parents[j]), 0)` | **cross product of two unit bases** ⇒ ≈ 1e-8 rad | "All exterior parents are parallel." (the gate on `solveParallelClosure`) |
| [algorithm-termination-cases.ts:313](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `areEqual(dotProduct(bases[i], bases[j]), 1)` | dot product ⇒ **1.41e-4 rad** | "All these bisectors point the same way." |
| [algorithm-termination-cases.ts:503](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `areEqual(determinant, 0)` in `solveTerminalPoint` | **3×3 determinant**, dimensionless | "This three-line system is singular." Measured: "across 785 terminals the determinant never fell below 0.106 in magnitude." |
| [algorithm-termination-cases.ts:552](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `solution.offset < 0 && !areEqual(solution.offset, 0)` | offset | "A terminal offset this close to zero is not negative." |
| [algorithm-helpers.ts:44](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) | `cross < 0 && !areEqual(cross, 0)` | cross product of parent bases | "The turn at this vertex is zero." |
| [algorithm-helpers.ts:155](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) | `!areEqual(offsetRate, 0)` | **offset rate** = `cross(cw, ws) / |c + w|` | "A zero rate means anti-parallel parents and nothing else." |
| [collision-helpers.ts:76](../../packages/core/src/straight-skeleton/collision-helpers.ts) | `areEqual(crossWithParent, 0)` | cross product | "There is no offset gradient against this parent." |
| [collision-helpers.ts:107](../../packages/core/src/straight-skeleton/collision-helpers.ts) | `areEqual(combinedRate, 0)` | offset rate | "These two rays never close, so no collision is priced." |
| [collision-helpers.ts:181](../../packages/core/src/straight-skeleton/collision-helpers.ts) | `!areEqual(offsetDistance, offsetTarget)` | offset | "Both edges reach the meeting at the same time." |
| [generate-split-event.ts:226](../../packages/core/src/straight-skeleton/generate-split-event.ts) | `areEqual(alongEdge, 0)` | length along the supporting edge | "The bisector reaches the edge's supporting line." |
| [graph-merge.ts:110](../../packages/core/src/straight-skeleton/graph-merge.ts) | `vectorsAreEqual(node.position, crossingPoint)` | **caller/world position** — *not normalised at this stage* | "This sub-graph node is the decomposition's crossing point." |
| [polygon-decomposition.ts:5,50-51](../../packages/core/src/straight-skeleton/polygon-decomposition.ts) | `ENDPOINT_EPSILON = 1e-8`; `tA < ε \|\| tA > 1 − ε` | **dimensionless parametric `t ∈ [0,1]`** | "A crossing this close to a segment end is an endpoint touch, not a crossing." |

### 3.3 Where the render floor is applied

| Site | Predicate | Space | Signal-vs-noise claim |
| --- | --- | --- | --- |
| [canonicalisation.ts:196](../../packages/core/src/straight-skeleton/canonicalisation.ts) | `weakest.deviation < noiseFloor` | root unit space (or the root floor restated in region unit space) | "This vertex contributes nothing to the silhouette and is removed before the solver sees it." |
| [coincident-events.ts:41](../../packages/core/src/straight-skeleton/coincident-events.ts) | `Math.hypot(dx, dy) < SKELETON_NOISE_FLOOR` | root unit space, **Euclidean** | "Two arrivals this close are one vertex event, as far as anything that will ever look at the skeleton is concerned." |
| [coincident-events.ts:131](../../packages/core/src/straight-skeleton/coincident-events.ts) | the same predicate, as a **postcondition assertion** | root unit space | "No layer may produce two merges the picture cannot tell apart." |
| [recursive-subdivision.ts:573-575](../../packages/core/src/straight-skeleton/recursive-subdivision.ts) | `denormaliseLength(makeSkeletonNormalisation(boundary), SKELETON_NOISE_FLOOR)` | converts unit → **caller space**, measured on the ROOT | "Invisibility is a property of the region the caller handed in, not of whichever sliver the recursion is holding." |
| [recursive-subdivision.ts:620](../../packages/core/src/straight-skeleton/recursive-subdivision.ts) | `normaliseLength(regionNormalisation, rootFloor)` | converts caller → **region unit space** | "The same physical distance, said in the units the comparison happens in." |
| [algorithm-termination-cases.ts:817,868](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `options?.noiseFloor ?? SKELETON_NOISE_FLOOR` | region unit space | "The floor belongs to the root region, which is why it is accepted here rather than derived." |
| [region-boundary-folds.test.ts:110-111,166](../../packages/core/tests/straight-skeleton/region-boundary-folds.test.ts) | `line < region.floor` | region unit space, root-derived | **Fold invariant:** "No region boundary handed to a solve retains a vertex whose unclamped chord-line deviation is below the root floor." 24 pre-fix violators, 0 post-fix. |

### 3.4 Everything else, by kind

**Area thresholds.**

| Constant | Value | Site | Space | Claim |
| --- | --- | --- | --- | --- |
| `DEGENERATE_AREA_EPSILON` | `1e-6` | [constants.ts:19](../../packages/core/src/straight-skeleton/constants.ts) | **AREA in CALLER units — never normalised** | "A region enclosing less than this is not worth solving." The decision-96 decline floor. Consumers: [recursive-subdivision.ts:667](../../packages/core/src/straight-skeleton/recursive-subdivision.ts), [polygon-decomposition.ts:100](../../packages/core/src/straight-skeleton/polygon-decomposition.ts). |

**Relative-to-measured-scale tolerances** — these are correct by construction and are *not* candidates
for unification with the two constants above.

| Constant | Value | Site | Relative to what | Claim |
| --- | --- | --- | --- | --- |
| `SIMULTANEITY_RELATIVE_TOLERANCE` | `1e-12` | [offset-projection.ts:290](../../packages/core/src/straight-skeleton/offset-projection.ts) | the skeleton's own **maximum offset** | "Re-derived offsets this close are one instant." Measured: widest within-instant spread 1.42e-15, narrowest genuine gap 1.23e-4 — **eleven orders apart**. |
| `EPSILON` (strips) | `1e-9` | [strip-decomposition.ts:33](../../packages/core/src/straight-skeleton/strip-decomposition.ts) | absolute at [:539-540](../../packages/core/src/straight-skeleton/strip-decomposition.ts) (offset vs clip depth); dimensionless at [:1085](../../packages/core/src/straight-skeleton/strip-decomposition.ts) (parametric fraction); **a sine** at [:1109](../../packages/core/src/straight-skeleton/strip-decomposition.ts) | one constant, three spaces. "A sine of 1e-9 is far below any real crossing and far above any rounding residue." |
| `exteriorScale(graph) * EPSILON` | `1e-9 ×` boundary diagonal | [strip-decomposition.ts:999](../../packages/core/src/straight-skeleton/strip-decomposition.ts) | exterior bounding diagonal | "A frontage shorter than this is numerically nothing and may not be transferred away." |
| `RELATIVE_EPSILON` | `1e-9` | [parcel-slicing.ts:63](../../packages/core/src/straight-skeleton/parcel-slicing.ts), materialised [:449](../../packages/core/src/straight-skeleton/parcel-slicing.ts) | the strip's own bounding scale | "These two points are the same, and this root is positive." |
| `COLLINEAR_EPSILON` | `1e-9`, applied as `scale² × ε` | [parcel-slicing.ts:66,661](../../packages/core/src/straight-skeleton/parcel-slicing.ts) | `scale²` — an **area-dimensioned** bar on a cross product | "This vertex is not a real corner when counting a parcel's corners." |
| `scale * 1e-7` | | [parcel-slicing.ts:276](../../packages/core/src/straight-skeleton/parcel-slicing.ts) | strip boundary bounding scale | "This boundary vertex is the frontage vertex." **Two orders looser than every other parcel bar, unexplained.** |
| bare `1e-12` × 4, `1e-15`, `1e-9` × 4 | | [parcel-slicing.ts:346,351,377,423,430,479,529,602](../../packages/core/src/straight-skeleton/parcel-slicing.ts) | ring parameters, unit-normal determinants, dot products, parametric `t` | Eight uncommented inline literals across four different dimensionless spaces. |

**Angles.**

| Threshold | Value | Site | Claim |
| --- | --- | --- | --- |
| `StripOptions.mitreTolerance` | no default (off); range `[0, π]` | declared [strip-decomposition.ts:155](../../packages/core/src/straight-skeleton/strip-decomposition.ts), validated [:859](../../packages/core/src/straight-skeleton/strip-decomposition.ts), applied [:974](../../packages/core/src/straight-skeleton/strip-decomposition.ts) | "A junction deviating from straight by more than this looks mitred and its corner is reassigned." Radians; values above π are rejected as degrees-where-radians-belong. |

**Structural / combinatorial guards — not tolerances at all, and §5's C9 says these are the arc's
most reliable instrument.**

| Guard | Value | Site | Role |
| --- | --- | --- | --- |
| `MINIMUM_RING_SIZE` | `3` | [canonicalisation.ts:144](../../packages/core/src/straight-skeleton/canonicalisation.ts) | "Below this a ring is not a polygon, and no floor is allowed to take it there." **The only thing standing between the pass-down and the sliver pathology (D7).** |
| `MINIMUM_BOUNDARY_SIZE` | `3` | [region.ts:99](../../packages/core/src/straight-skeleton/region.ts) | A region boundary needs three vertices. `region.ts` contains **no numeric tolerance at all** — "PROXIMITY IS NEVER A CRITERION FOR A TOPOLOGICAL FACT" ([region.ts:12-13](../../packages/core/src/straight-skeleton/region.ts)). |
| minimum run count | `2` | [strip-decomposition.ts:786](../../packages/core/src/straight-skeleton/strip-decomposition.ts) | "The floor is two runs" — one run would union every clipped face into the band `sliceStrip` refuses to cut. |
| `walkLimit` | `2·N + 8` | [strip-decomposition.ts:874](../../packages/core/src/straight-skeleton/strip-decomposition.ts) | Bounds the parentage face walk; exceeding it falls back to the geometric walk rather than throwing. |
| `MAX_RAY_STEPS` / `MAX_POST_PROCESSING_STEPS` | `32` / `512` | [parcel-slicing.ts:69-70](../../packages/core/src/straight-skeleton/parcel-slicing.ts) | "Every loop below terminates on its own; these only bound pathological input." |
| `MIN_EXACT_SCALE_EXPONENT` / `MAX_EXACT_SCALE_EXPONENT` | `−1022` / `1022` | [normalisation.ts:180,190](../../packages/core/src/straight-skeleton/normalisation.ts) | Normalisation falls back to identity outside the representable power-of-two range. |
| `SMALLEST_NORMAL_DOUBLE` | `2.2250738585072014e-308` | [normalisation.ts:168](../../packages/core/src/straight-skeleton/normalisation.ts) | "The test is on the reciprocal's representability, not on geometric smallness." |

**The two chord primitives — one quantity, two questions.**

| Primitive | Site | Question it answers |
| --- | --- | --- |
| `distanceToSupportingLine` (unclamped) | [vertex-budget.ts:102](../../packages/core/src/stroke-spline/vertex-budget.ts) | "How far off this chord is it?" — canonicalisation's question (decision 100). |
| `distanceToSegment` (clamped, `t ∈ [0,1]`) | [vertex-budget.ts:111-116](../../packages/core/src/stroke-spline/vertex-budget.ts) | "How close to this segment is it?" — RDP's error bound. **The clamp at :116 is the D5 defect.** |

### 3.5 Test-side verification bars

Deliberately tighter than the perceptual floor: their job is to catch a class *before* it becomes
visible. These are not production thresholds and should not be unified with them.

| Bar | Value | Site | What it verifies |
| --- | --- | --- | --- |
| I2 coincidence bar | `SKELETON_NOISE_FLOOR` | [graph-index-invariants.test.ts:126](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts) | No two nodes inside the floor. 4 pinned exceptions on 3 fixtures; 56 fixtures carry none. |
| `EQUIDISTANCE_BAR` (I3) | `1e-9` | [graph-index-invariants.test.ts:269](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts) | Every bisector's source is equidistant from its two named parents. Corpus worst 6.1e-16. |
| `PARALLEL_PARENTS_BAR` (I5) | `1e-9` | [graph-index-invariants.test.ts:565](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts) | Two bisectors share a ridge only where their parents are parallel. Legitimate ≤1.46e-15, defect 6.46e-6…1.76e-5 — **nine orders of gap**. |
| `TILING_TOLERANCE` | `1e-14` | [strip-tiling.test.ts:54](../../packages/core/tests/straight-skeleton/strip-tiling.test.ts) | Strips tile their canonical boundary. Ten times the measured worst (8.52e-16). |
| `CORPUS_CANONICAL_AREA_DRIFT_BOUND` | `1e-14` | [recursive-subdivision.test.ts:112](../../packages/core/tests/straight-skeleton/recursive-subdivision.test.ts) | Canonicalisation's area change per region. **F24a: re-measured worst 5.19e-15 — the bound is under 2× the measured maximum, thin for a bound written as headroom.** |
| `AREA_TOLERANCE_FRACTION` | `1e-12` | [strip-decomposition.test.ts:35](../../packages/core/tests/straight-skeleton/strip-decomposition.test.ts), [parcel-slicing.test.ts:34](../../packages/core/tests/straight-skeleton/parcel-slicing.test.ts), [recursive-subdivision.test.ts:78](../../packages/core/tests/straight-skeleton/recursive-subdivision.test.ts) | Relative area identity. |
| `FOLDS_HANDED_IN` | `24` | [region-boundary-folds.test.ts:89](../../packages/core/tests/straight-skeleton/region-boundary-folds.test.ts) | The fold sweep's pre-fix violator count; 0 survive post-fix. |
| causality `TOLERANCE` | `1e-6` | [wavefront-causality.test.ts:51](../../packages/core/tests/straight-skeleton/wavefront-causality.test.ts) | `targetOffset < sourceOffset − TOLERANCE` is a violation. **Note: this bar is the render floor, in caller space, on an offset.** |
| `WITHIN_INSTANT_RELATIVE_SPREAD` | `1e-14` | [near-regular-ring-loss-diagnosis.test.ts:157](../../packages/core/tests/straight-skeleton/near-regular-ring-loss-diagnosis.test.ts) | Offsets grouped into one instant. |
| `TERMINAL_BAND` / `MUTATION_DISPLACEMENT` | `1e-6` / `1e-6` | [wavefront-measurement-helpers.ts:144,210](../../packages/core/tests/straight-skeleton/wavefront-measurement-helpers.ts) | Which events count as terminal; how far a mutation probe pushes a node. |
| `GEOMETRIC_TOLERANCE`, `OBSERVABLE_TOLERANCE` | `1e-9` | [skeleton-tree.test.ts:47](../../packages/core/tests/straight-skeleton/skeleton-tree.test.ts), [spine.test.ts:61](../../packages/core/tests/straight-skeleton/spine.test.ts), [silhouette-invariance.test.ts:98](../../packages/core/tests/straight-skeleton/silhouette-invariance.test.ts) | Caller-space position/length equality — **absolute, in caller units, so fixture-scale dependent.** |
| `CLUSTERING_BAR` | `= SKELETON_NOISE_FLOOR` | [coincident-events.test.ts:37](../../packages/core/tests/straight-skeleton/coincident-events.test.ts) | The clustering suite tracks the production constant by reference, not by copy. |

### 3.6 What the sweep found absent

Verified absences, recorded so a future reader does not re-derive them:
`skeleton-tree.ts` and `types.ts` carry **no threshold at all**; `graph-merge.ts`,
`collision-handling.ts`, `collision-helpers.ts`, `algorithm-helpers.ts`, `generate-split-event.ts`,
`spine.ts` and `debug-helpers.ts` carry **no hard-coded numeric literal** — every tolerance they
apply is inherited through `areEqual` / `vectorsAreEqual`; `region.ts` carries none by design.
`SliceOptions` has **no defaults at all** — every parcel threshold is caller-required
([parcel-slicing.ts:74-92](../../packages/core/src/straight-skeleton/parcel-slicing.ts)).

---

## 4. The disagreement map

Each entry names **two thresholds that can judge the same quantity differently**, and gives a
concrete corpus case with measured numbers. These are the evidence for decision 101's charge.

### D1 — Node identity and event identity are 100× apart, and use different metrics

| | event identity | node identity |
| --- | --- | --- |
| predicate | `Math.hypot(a.x-b.x, a.y-b.y) < SKELETON_NOISE_FLOOR` | `areEqual(a.x,b.x) && areEqual(a.y,b.y)` |
| site | [coincident-events.ts:40-42](../../packages/core/src/straight-skeleton/coincident-events.ts) | [solver-context.ts:127-139](../../packages/core/src/straight-skeleton/solver-context.ts) |
| value | 1e-6, unit space | 1e-8, unit space |
| metric | Euclidean disc | component-wise box, up to √2 wider on the diagonal |

Both answer "are these the same point?". Concrete case, recorded at the first site: on
`OFF_EDGE_JITTER_L_SEED_15838` the wavefront reaches a ridge where four walls are equidistant and
resolves it as two events **3.13e-7 apart in unit space — correctly distinct at 31 times the
epsilon**, and 2.7e-7 of the polygon's extent, so a **7480× zoom** would be needed to put two pixels
between the nodes they produced. The pair then carried a bisector leaving one of them 5.2e-6 radians
from its neighbour, "a distinction no downstream planar consumer can act on".

The gap is live, not historical: any position reaching `findOrAddNode` by a path that bypasses event
clustering is judged at 1e-8. Until journal decision 85 was partly addressed, the split/partition
path was exactly such a route — `handleCollisionEvent` "places a node at whatever position it is
handed, so two simultaneous splits a fraction of the render floor apart used to build two nodes
joined by a degenerate pair of bisectors"
([algorithm-complex-cases.ts:234-238](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts)).
The `rings === null` and shared-edge fallbacks
([algorithm-complex-cases.ts:217-227](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts))
are still such routes.

### D2 — The same physical quantity is judged at 1e-8 in time and 1e-6 in space

An offset **is a length**. Journal decision 83 states it outright: "offset is a length; one floor
governs both axes."

- **Time axis:** the offset-layer window, `fp_compare(collision.offsetDistance, bestOffset) <= 0`,
  i.e. `|Δoffset| < 1e-8`
  ([algorithm-complex-cases.ts:144-160](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts)).
- **Space axis:** 1e-6, as above.

So two arrivals 5e-7 apart in space and 5e-7 apart in time are **one event in space and two events
in time**. Decision 83 ruled the time half should widen to the floor. The ungated implementation was
built and measured (F30): it **cured the entire large-coordinate class** — Circle 48 @1e10 and
Rosette5 @1e11 both go complete, Circle 48 resolves its native single 48-way hub at 1e10, no clean
fixture moves at root native placement across 57 × 6 placements — and cost the recursion: census
26 → 52, k4 causality violations, tiling k4 1e-16 → 1.67e-7. Withdrawn under its own STOP (decision
84). The proposed **gate** — widen in time only where the spatial clustering already has something
to join, needing no new threshold — was never tried.

Both sides of this gap have measured failures:

- epsilon **too coarse in time nowhere**, but **too fine** at scale: at 1e10 translation the window
  cuts a genuine 48-way convergence into **14 nodes (hubs of 8 and 13 beside pairs)** (F19).
- epsilon **coarse enough** on the live defect: `(seed 55433)`'s arm collapses as a near-degenerate
  4-ring where **all eight arrival events land inside one epsilon layer, 7e-11 apart**
  ([graph-index-invariants.test.ts:500-505](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts)).

### D3 — The headline: 3.88× the render floor is "real" to the solver and invisible to the user

Nodes **29 and 30** of `Off-edge Jitter Reflex L (seed 55433)` sit **3.88e-6 apart in unit space —
3.88 times the render floor**. Every instrument in the suite passes them:

- **I2** (no two nodes inside the coincidence floor) passes: the bar is 1e-6 and they are at 3.88e-6
  ([graph-index-invariants.test.ts:118-133](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts)).
- **I3** (equidistance) passes to 1.4e-14 — *satisfied by the WRONG parents*, because the arm is
  near-symmetric top to bottom and the wrong pair defines the same locus as the right one (F36,
  recorded as I3's blind spot).
- **I4** (face closure) passes; the **tiling identity** passes, because the resulting needle is a
  fold with cancelling area.

The user, at maximum UI zoom, cannot separate them. The ridge they span is one of the four
crossed-pairing ridges I5 pins, and I5's own comment records the class's scale: the four defect
ridges run **1.60e-6, 1.79e-6, 3.88e-6 and 6.05e-6 in unit space — between 1.6 and 6.1 times the
render floor, sub-visible ridges that no picture shows and no eye-pass could have found**
([graph-index-invariants.test.ts:544-548](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts)).

**The floor is set at the arithmetic-safety end of its band, not at the perceptual end.**
`SKELETON_NOISE_FLOOR`'s own header states the measured usable band is `[1e-6, 3e-6]` — "a factor of
three" — and that "`1e-6` sits at the bottom of a narrow band by deliberate choice, not on a
plateau" ([canonicalisation.ts:127-139](../../packages/core/src/straight-skeleton/canonicalisation.ts)).
Even the top of that band, 3e-6, does not reach 3.88e-6. **No available value of the current floor
makes the 29/30 pair one point.** That is precisely decision 101's finding: the bar the system uses
and the bar the user's eye uses are different numbers.

Downstream cost, measured: region `r0.10` transcribes both nodes as boundary vertices 4 and 5 — "zero
not bit-exactly a graph node; nothing is manufactured at d = 1.0" (F37) — producing a zero-area
needle that makes the region unsolvable. Dropping either fold vertex makes both failing regions
solve.

### D4 — Four pairs are pinned BELOW the floor as real structure

The I2 invariant's exception table
([graph-index-invariants.test.ts:142-148](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts)):

```
'Off-edge Jitter Reflex L (seed 15838)':       [[19, 21]]
'Off-edge Jitter Reflex L (seed 55433)':       [[19, 20], [24, 26]]
'Off-edge Jitter Reflex L (seed 55433, k=4)':  [[27, 29]]
```

Journal decision 92 re-read three of these as **real micro-structure**: they are joined by real
skeleton edges — one event creates the bisector the next terminates — so they are causally ordered
and in different layers by construction, and no event-identity rule can merge them. Only k4's
one-layer split 2-cycle was genuinely mergeable, and it merged.

So the 1e-6 bar simultaneously: **(a)** merges events; **(b)** asserts node distinctness as an
invariant; **(c)** is overridden by a pinned table for four pairs that violate (b) legitimately.
Decision 92's honest resolution — a **post-solve presentation-layer contraction** of sub-floor
edges, leaving solve semantics exact — is parked, and is the correct home for this population.

Measured separations of these pairs: see §6.

### D5 — One fold vertex, two readings five orders apart

Until journal decision 100 (2026-08-29), canonicalisation's deviation predicate used the **clamped**
`distanceToSegment`. A *fold* is a vertex whose perpendicular foot overshoots the end of the chord
between its neighbours, so the clamp stops measuring the perpendicular and starts measuring the
distance to the endpoint — "the fold's LENGTH along the boundary rather than its WIDTH across it"
([canonicalisation.ts:27-37](../../packages/core/src/straight-skeleton/canonicalisation.ts)).

Measured on the corpus (F37), for the fold in one jitter fixture's sub-region:

| reading | caller space | unit space, as a multiple of the floor |
| --- | --- | --- |
| width (perpendicular — what the charter asks for) | 8.4e-9 | **3.3e-5 ×** |
| length (clamped — what was measured) | 9.9e-4 | **3.88 ×** |

The ratio, 1.18e5, is identical in both spaces — these are one quantity read two ways. The stage
screened the vertex as *visible* on the reading its own charter forbids. Note the coincidence that
is not a coincidence: the fold's length, 3.88× the floor, **is** the 29/30 separation of D3 — the
fold's two ends are those two nodes.

Fixed by decision 100 (unclamped `distanceToSupportingLine`,
[canonicalisation.ts:279-283](../../packages/core/src/straight-skeleton/canonicalisation.ts)).
Census 29 → 20; F38 records that "the fold fix emptied the census of non-degenerate failures at full
depth entirely".

**What is not fixed:** `distanceToSegment` remains correct for RDP's error bound in
`vertex-budget.ts` and `distanceToSupportingLine` is correct here — the same two points, two
questions, two answers. The choice is now argued in the header and convicted in both directions by
tests, but nothing structural prevents a third caller choosing the wrong primitive.

### D6 — The root-floor pass-down can make a region unsolvable (F38a)

`r0.3.1` of seed 55433 (depth 0.5, merge group 4) **solves standing alone with zero drift and fails
inside the tree**, where the root's floor removes one vertex. Removing an invisible vertex turned a
solvable region into an unsolvable one — inverting the canonicalisation charter's assumption that
removal can only help.

Corpus-wide, only **five** regions still fail a solve anywhere on the 6×6 grid (all at depth
0.5/0.75, merge groups 4–6), and **all five lose a vertex to the floor first**; the "failed with
nothing removed" population is extinct. So the pass-down is simultaneously the mechanism that keeps
the floor meaningful across levels and the proximate cause of every remaining region failure.

### D7 — The inherited floor is half a region (decision 87)

The pass-down direction is `inherited floor = 1e-6 × E_root / E_child` — always **coarser** in the
child's own unit space. Measured extent ratios before implementing:

- the one blocking **clean** region (Crazy Polygon, depth 1 / merge 4) has ratio **1.000** —
  inheritance moves its floor by nothing;
- k4's failing set includes **five slivers at ratios up to 496 939**, where the inherited floor is
  **half the region** and only a cap — a forbidden new threshold — could contain it.

Either alone is fatal, and decision 86 was **STRUCK before implementation** on the strength of it.
The instructive detail: canonicalisation survives this pathology **only** via
`MINIMUM_RING_SIZE = 3` ([canonicalisation.ts:144](../../packages/core/src/straight-skeleton/canonicalisation.ts))
— a *combinatorial* guard doing the job a *metric* one demonstrably cannot.

### D8 — Below the floor there is genuine structure, at scale (F28 / decisions 66, 81)

Event-floor clustering breaks Circle 32 at translations of 1e10/1e11 because the centring
quantisation (~1.1e-6 caller units) compresses **genuine 17-node fine structure** below the floor.
That structure spans ≤2e-6 of the shape's extent at those placements — invisible under decision 54
at any plausible zoom, **and below the input's own quantisation noise there**. The disputed geometry
is 5.6e-5 px (Circle 48 @1e10) and 3.2e-4 px (Rosette5 40 @1e11) on a 4K render of the whole shape,
and **under two ulps of the quantised input itself** (decision 66).

Accepted by construction, loud never silent, with a per-fixture attributed-exception table. So the
floor is right as a *perceptual* bar and wrong as a *structural* one, in the same corpus, four-plus
orders past the operating envelope.

### D9 — Three different angular bars, all deciding "same direction"

| predicate | site | effective angular bar |
| --- | --- | --- |
| `vectorsAreEqual(direction, edge.basisVector)` (default 1e-8, components) | [algorithm-termination-cases.ts:109](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts), [:233](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | ≈ **1e-8 rad** |
| `areEqual(Math.abs(dotOfBasisVectors), 1)` (1e-8, in dot space) | [intersection-edges.ts:54](../../packages/core/src/straight-skeleton/intersection-edges.ts), [algorithm-termination-cases.ts:313](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) | `1−cos θ < 1e-8` ⇒ **θ < 1.41e-4 rad** |
| `vectorsAreEqual(r1SourceToR2Source, ray1.basisVector, 1e-4)` | [intersection-edges.ts:56](../../packages/core/src/straight-skeleton/intersection-edges.ts) | ≈ **1e-4 rad** |

Four orders of magnitude between tightest and loosest, all deciding parallelism or collinearity, all
described in comments as "the standing tolerance". Note that the **same constant 1e-8** means 1e-8
rad in component space and 1.41e-4 rad in dot space: one number, two meanings, four orders apart.

The quantity that falls in the gap is not hypothetical. F26: `traceFace` walked faces by
sharpest-turn geometry, and at the user's circled node the two candidate branches leave **5.2e-6
radians apart (4.8e-10 transversely — not decidable in doubles)**. The walk took the wrong branch and
fused the faces of two opposing walls: `OFF_EDGE_JITTER_L_SEED_15838`'s strips covered **160% of its
own area** while reporting `complete: true`, with zero causality violations, zero escaped nodes, and
every node within 1e-11 of truth. Three fixtures failed the tiling identity by 50–67%. The fix was
**not a new tolerance**: faces are now ordered by parentage — combinatorial and exact — with geometry
only a tie-break.

The `1e-4` at [intersection-edges.ts:56](../../packages/core/src/straight-skeleton/intersection-edges.ts)
carries no comment and no measurement anywhere in the record. It is the loosest geometric tolerance
in the solver and **100× the render floor**.

### D10 — I3 is 1000× tighter than the perceptual floor, deliberately — and that is what makes every floor-scale merge a violation

`EQUIDISTANCE_BAR = 1e-9`
([graph-index-invariants.test.ts:269](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts)),
justified in its own header: "six orders of headroom against arithmetic, and still **three orders
tighter than the render floor**, so it cannot be satisfied by a bisector that is merely close to
belonging to its parents". Corpus worst is 6.1e-16 — machine precision.

This is the exact collision journal decision 89 names. Any mechanism that resolves two events by
**choosing** one position displaces the merged node by up to the floor, and a displaced node emits
bisectors that are not equidistant from the parents they name. Measured (F32):

- under decision 84's gate, `bisectionsForMerge` computed correct parents for a corrupted input — a
  merged node **1.03e-6 off the `{2,3}` locus** — and I3 flagged that edge as the solve's only
  violator;
- with the gate reintroduced as a mutation, I3 fires on a **clean** corpus fixture (k4, edge 50,
  **9.4e-7 off-locus**) — the instrument catches the class, not just the specimen;
- the split-position resolution that **did** land costs **8.34e-12** on one fixture — two orders
  inside the bar — and is pinned as a set so a second fixture leaning on the headroom is a failure
  ([graph-index-invariants.test.ts:299-319](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts)).

Node identity says 1e-6 is noise. Bisector identity says 1e-9 is signal. **Both are correct about
their own question, and nothing today reconciles them.** The placed-node design (§6) is the
reconciliation: a node solved from its parents is equidistant by construction, so the merge distance
stops feeding into the equidistance residual at all.

### D11 — The degeneracy floor is an absolute area in caller units; every length floor is relative

`DEGENERATE_AREA_EPSILON = 1e-6`
([constants.ts:19](../../packages/core/src/straight-skeleton/constants.ts)). Its own header places it
"on the same footing as `FLOATING_POINT_EPSILON`" — but `FLOATING_POINT_EPSILON` was made relative by
normalisation and this one never is. Both its consumers evaluate it in the **caller's** coordinates:

- [recursive-subdivision.ts:660-673](../../packages/core/src/straight-skeleton/recursive-subdivision.ts)
  — `Math.abs(signedArea(boundary))` on the caller-space region boundary; this is the decision-96
  decline floor;
- [polygon-decomposition.ts:100](../../packages/core/src/straight-skeleton/polygon-decomposition.ts)
  — the same test on a decomposition sub-polygon.

Scale the input by 1000 and this threshold's meaning moves by 1e6, while the render floor does not
move at all. Journal decision 96 ratified the *behaviour* as correct — the user's words: "exactly the
sort of pragmatically null escape hatch that is a strong mirror of reality — a sensible tiler knows
not to try and slice a tile narrower than a certain size" — so this entry is about the *space*, not
the verdict. As written, the "certain size" is only stable if the caller's units are.

Its neighbour has the same problem in the other direction: `ENDPOINT_EPSILON = 1e-8`
([polygon-decomposition.ts:5](../../packages/core/src/straight-skeleton/polygon-decomposition.ts)) is
the solver's *length* epsilon applied to a **dimensionless parametric `t ∈ [0,1]`**.

### D12 — The clustering bar is not the bar it claims, because the relation is transitively closed

`clusterCoincidentMerges` partitions events into **connected components** under the 1e-6 relation,
deliberately and for a measured reason: first-match joining is order-dependent, and a 48-gon fan of
1424 events over 48 edge ids left the function as *four* groups where the identical relation replayed
as components gives one
([coincident-events.ts:60-81](../../packages/core/src/straight-skeleton/coincident-events.ts)).

The stated cost: "a run of events each within tolerance of the next becomes one group however far its
extremes lie apart" — measured reuniting a fan whose extremes are **1.95e-8** apart — and the
medoid's drift from its own extremes grows as `(k − 1) · ε / 2`
([coincident-events.ts:239-243](../../packages/core/src/straight-skeleton/coincident-events.ts)).

So the *effective* identity bar is `(k − 1) × 1e-6`, data-dependent, not 1e-6. The alternative —
gap-based partitioning, which bounds a group's diameter — was declined because it costs a second
threshold nothing has measured. The same accepted-chaining note appears independently at
[offset-projection.ts:437-442](../../packages/core/src/straight-skeleton/offset-projection.ts) for
the simultaneity table, where it is benign (the widest observed set spans 1.42e-15 against a 1e-12
tolerance).

### D13 — The layer window is non-transitive against a clustering that is transitive

The window is anchored: `bestOffset` is the smallest offset in the ascending list, and events are
taken while `fp_compare(offset, bestOffset) <= 0`, then the loop **breaks**
([algorithm-complex-cases.ts:144-160](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts)).
Two events 1.5e-8 apart, each within 1e-8 of a third between them, land in different layers; the
in-layer clustering that follows is transitive.

F19's measurement of the consequence: "a convergence straddling the window is cut across layers and
partially merged — Circle 48 @1e10 resolves its 48-way centre as **14 nodes** (hubs of 8 and 13
beside pairs)". And critically: **"no safe upper threshold exists"** — the widened grid shows Circle
48 failing at {2e9, 9e9, 1e10} and Rosette5 40 failing 9 cells including 3e12/4e12. Non-monotonic —
"a rounding lottery, not a band". Widening the number does not fix the shape of the rule.

### D14 — Normalised and un-normalised readings of one quantity, compared at one absolute bar

Two independent sites record the same pathology.

- [algorithm-helpers.ts:36-38](../../packages/core/src/straight-skeleton/algorithm-helpers.ts): "the
  two tolerances do not coincide exactly: the rate divides the cross product by `|c + w|`, which
  [means a sliver] between one and two epsilons reads as a **zero rate and a non-zero turn**." Same
  geometric fact, two predicates, an acknowledged tolerance hole — resolved by deciding the sliver
  the same way in one predicate.
- [intersection-edges.ts:18-25](../../packages/core/src/straight-skeleton/intersection-edges.ts):
  normalising divides the separation by its own length, so at small separations it amplifies float
  noise without bound — "a genuinely head-on pair whose sources were **3.9e-8** apart came out with a
  lateral component of **6.2e-9** (numerically zero) yet a unit direction **0.15** away from the
  basis, and was misread as 'parallel'."

The general form: an absolute tolerance means one thing on a raw quantity and another on the same
quantity divided by its own magnitude. Any unified model must say which form each comparison is
made in.

---

## 5. The constraint set

These are **falsified experiments**, not opinions. Every one was built, measured and reverted, and
each has a mutation conviction attached. Any unification proposal that violates one of them has
already been tried and has already failed.

**C1 — No mechanism may move a node that already carries edges.** Journal F27: merging by absorption
in `findOrAddNode` (Euclidean floor, first-established wins) delivered every promised cure — clean
roster bit-identical at native placement, both user-circled clusters resolved to one node each,
Rosette5's 10 scatter cells cured — and broke four independent axes at once: **Circle 16/32 (CLEAN)
stop solving at 1e10/1e11**; Circle 48's scatter went **3 → 28 cells**; seed 15838 regrew an
offset+direction causality violation (an edge terminating behind its own source, dot = −1); census
**26 → 42**; tiling **exact → ~1e-7**, inherently — "merging nodes 8e-5 apart moves the skeleton
8e-5". Mutation conviction: reverting the one file restored 4706/4706 exactly.

**C2 — Resolution must happen before any node exists.** F27's decisive observation: **Circle 48
natively solves a single 48-way hub through the coincidence machinery** — the solver already handles
high-degree hubs when the EVENT layer builds them, and fails only when node-level absorption
assembles the same hub incrementally. This is why decision 78 was amended from node-level to
event-level.

**C3 — The decision-66/81 accepted cells may not be silently un-accepted.** F28: event-floor
clustering costs Circle 32 its 1e10/1e11 cells because the centring quantisation compresses genuine
17-node fine structure below the floor; those cells are accepted by construction with an attributed
per-fixture exception table, loud never silent. A unification that changes their verdict must
attribute the change cell by cell. Decision 84 names the prize on the other side: if the gated time
window holds, **the decision-66 accept-by-construction class and the decision-81 exceptions dissolve
entirely**.

**C4 — I3 at 1e-9 is the falsifier of every merge mechanism, and it is not negotiable.** F32: any
coincidence rule that merges spatially-separated events displaces the merged node by up to the floor;
a displaced node emits bisectors that are not bisectors, and I3 catches it at machine precision.
Measured violations: 1.03e-6 off-locus under the gate; 9.4e-7 on a clean fixture under mutation.
Decision 89 asserted that the placed-node design keeps I3 true *by construction* — **§6 measures that
claim and finds it holds only in a special case.**

**C5 — Any root-floor pass-down must survive the sliver pathology and must not remove a vertex a
standalone solve needs.** Decision 87 (extent ratios 1.000 and up to 496 939 — inheritance either
does nothing or hands a sliver a floor half its own size, and only a forbidden cap could contain it)
and F38a (`r0.3.1` solves standing alone and fails inside the tree because the root's floor removes a
vertex; all five remaining failing regions lose a vertex to the floor first).

**C6 — Naming must be ulp-stable: every rule's output must be a canonical function of the event set.**
Decision 65. Node identity turned on an ulp twice: `NEAR_REGULAR_ELLIPSE_16/32`'s exact mirror pair
swapped node ids between a polygon and the same polygon scaled by 7; `Golf Cart`'s two simultaneous
splits of its top edge swapped ids under a translation of 1e3. Both fixed by keying on **integer edge
ids**, which "carry no arithmetic at all"
([coincident-events.ts:83-90](../../packages/core/src/straight-skeleton/coincident-events.ts),
[algorithm-complex-cases.ts:182-195](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts)).

**C7 — The perceptual bar is the user's ruled criterion, and it is pragmatic rather than analytic.**
Decisions 54 and 101. A threshold that fails to normalise minimum-perceptual-difference is a defect
**regardless of how well-behaved its own tests are** — which is exactly the 29/30 case, where every
invariant passes.

**C8 — Linear causality is the basic invariant: the pairing winner is the lower offset, within
tolerance, always.** Decision 102 (user): "Any defect that appears from adhering to this invariant is
a numerical bug implying something upstream — e.g. an offset has been miscalculated." This makes D2 —
what "within tolerance" means for an offset comparison — a *required* output of the tolerance model
rather than an optional one.

**C9 — Where a metric bar cannot be made scale-safe, the answer has been a combinatorial guard, and
it has worked.** Three precedents, all measured: `MINIMUM_RING_SIZE = 3` is what carries
canonicalisation through the sliver pathology (decision 87); F26 fixed the 160%-of-area tiling defect
by ordering faces **by parentage — combinatorial and exact — with geometry only a tie-break**, where
no angular tolerance could have separated 5.2e-6 radians from a real branch; and event grouping keys
on integer edge ids for C6. A proposal that reaches for a new number where a combinatorial invariant
is available is going against the arc's own evidence.

---

## 6. The placed-node design

### 6.1 The design, as decision 89 recorded it

> The only mechanism that keeps I3 true by construction is solving the merged node as the point
> **equidistant from the arrival set's parents** instead of taking the medoid member — new event
> semantics, with the three-edge closed-form solve (decision 22) as precedent and real
> overdetermination questions beyond it.

The precedent is real and is already in the solver.
[`solveTerminalPoint`](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts)
(line 490) solves "where three offset lines meet, and when" **in closed form with no tolerance
anywhere**: each supporting line contributes `n · P − t = n · A` where `n` is the edge's inward unit
normal (`rotateCw90` of its basis), giving three equations in three unknowns `(x, y, t)`, solved by
Cramer's rule. Its own header states the property that matters here:

> THE WAVEFRONT CLOCK IS AN UNKNOWN, NOT A CONSTRAINT CHECKED AFTERWARDS … the returned point is by
> construction the one place all three offset lines coincide at a single common offset. It also means
> the solve never reads a bisector source, so **coincident sources stop being a case**.

It is gated on having **exactly three** distinct parents
([algorithm-termination-cases.ts:531-538](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts));
anything else falls through, logged. Measured across 785 terminals: all had exactly three distinct
parents and the determinant never fell below 0.106.

So the extension decision 89 proposes is: **generalise this solve from 3 lines to k lines, and use it
to place a merged coincidence node.** The questions it leaves open — how often k > 3, whether the
overdetermined system is consistent, and how far the placed point sits from the events it replaces —
are what §6.2 measures.

### 6.2 Measurements

Run from the scratchpad against the built CommonJS bundles
(`packages/core/dist/index.cjs`, `packages/test-fixtures/dist/index.cjs`); **no repository file was
written or rebuilt.** All quantities in root unit space; `toUnitScale = 1/256` for the three target
fixtures. All 59 corpus fixtures (53 clean + 6 known-defect) solved with `complete === true`.

#### How often does a component have more than three distinct parents?

Over all **487 interior nodes** of the corpus, taking each node's parent set as the union of the
named parents of every incident interior edge:

| distinct parents | nodes | share |
| --- | --- | --- |
| 3 | 383 | 78.6% |
| 4 | 91 | 18.7% |
| 5 | 7 | 1.4% |
| 6, 8, 10 | 3 | 0.6% |
| 16 / 32 / 48 | 3 | 0.6% |
| **≥ 4** | **104** | **21.4%** |

The 16/32/48 entries are the single central node of `Near Regular Circle 16/32/48`, where every edge
converges — genuine high-degree hubs, not noise, and precisely the population F27 observed the solver
already handles when the *event layer* builds them. Excluding them, the answer is: **more than three
parents happens on about one interior node in five, and is overwhelmingly exactly four.**

**A k-line solve is therefore not an edge case. Any placed-node design must specify the k > 3
behaviour as its main path, not as a fallback.**

#### Is the equidistant point well-defined?

The four pairs I2 pins, plus the 29/30 pair decision 101 is about. `det(N)` and `cond(N)` are of the
3×3 normal matrix of the least-squares system; "resid" is the maximum over parents of
`|distance(X, line) − t|`, in multiples of the render floor.

| fixture | pair | separation ×1e-6 | under floor? | \|P\| | parent ids | max resid ×1e-6 | det(N) | cond(N) | X→first ×1e-6 | X→second ×1e-6 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| seed 15838 | 19, 21 | 0.730 | yes | 4 | 0, 7, 8, 14 | **0.258** | 16.0 | 2.0 | 0.517 | 0.517 |
| seed 55433 | 19, 20 | 0.194 | yes | 4 | 4, 5, 6, 7 | ~0 (3.7e-12) | **5.33e-9** | **1.35e10** | 0.219 | 0.413 |
| seed 55433 | 24, 26 | 0.276 | yes | 4 | 0, 8, 9, 17 | **0.098** | 16.0 | 2.0 | 0.196 | 0.196 |
| seed 55433 | **29, 30** | **3.880** | **no** | 4 | 9, 10, 15, 16 | ~0 (2.7e-11) | **1.29e-8** | **4.94e9** | 0.693 | **3.187** |
| seed 55433 k=4 | 27, 29 | 0.666 | yes | 4 | 0, 11, 18, 19 | ~0 (2.5e-12) | 8.0 | 7.3 | 0.666 | ~0 |

**Every one of the five has \|P\| = 4. Not one is the three-parent case the closed form handles.**

Two failure modes appear, and they are different failures:

**(a) Rank deficiency — the locus is a line, not a point.** For the **29/30** pair all four parents
(e9, e10, e15, e16) are essentially horizontal: their directions are 0.0011°, −0.0010°, −179.9996°,
179.9994°. After sign orientation there are only **two distinct oriented normals**, and they are
antiparallel — so the system carries **no information about x at all**. `N[0][0] = 8.2e-10`;
eigenvalues `[8.09e-10, 4.000, 4.000]` — one eigenvalue nine orders below the others. The near-zero
residual is a symptom of **rank deficiency, not of a good fit**: any x satisfies the system. And the
two nodes differ *only* in x: `Δ = (−3.880e-6, +5.3e-11)`. **They lie on the null line.** The exact
3-edge solve on parents [9,10,15] has `det = 5.3e-9`, `cond = 6.0e9` and the same degeneracy; it
lands on node 29 (displacement 4e-11) and 3.880e-6 from node 30, and adding the fourth parent moves
X by 6.93e-7 while changing `t` by 1.5e-11 — the extra constraint only re-picks a point inside the
null space.

The `[19,20]` pair is the same failure in a different orientation: parents e4/e5 horizontal, e6/e7
vertical, but after sign orientation only two distinct oriented normals survive, leaving a 1-D null
space along the 45° diagonal — **and the node separation lies exactly along that diagonal**
(`Δ = (−1.3694e-7, −1.3694e-7)`). `det(N) = 5.3e-9`, `cond = 1.35e10`.

**(b) Well-conditioned but inconsistent — no equidistant point exists.** For **[19,21]** and
**[24,26]** the four parents give four distinct oriented normals spanning all four cardinal
directions: `det(N) = 16.0`, `cond = 2.0`. Here the system is genuinely overdetermined and has **no
exact solution** — maximum residuals of **0.258 × floor** and **0.098 × floor**. The least-squares
point sits symmetrically between the two nodes. Exact 3-parent solves land precisely on one node
(residual ~1e-16) and 0.730 / 0.277 × floor from the other, so **which three of the four parents you
use decides which node you reproduce.**

Only **k=4 [27,29]** behaves as decision 89 hoped: three distinct oriented normals, `cond = 7.3`,
residual 2.5e-12, and the solve lands *on node 29* leaving node 27 misplaced by 0.666 × floor. Here
the placed node is well-defined and one of the two arrivals is simply in the wrong place.

#### The near-coincident ladder on seed 55433

All interior node pairs within ten floors, of 16 interior nodes (ids 18–33):

```
[19, 20]   0.194 × floor    (below the floor)
[24, 26]   0.276 × floor    (below the floor)
[32, 33]   1.597 × floor
[21, 23]   2.318 × floor
[29, 30]   3.880 × floor
```

**There is no gap in this ladder.** 0.19, 0.28, 1.60, 2.32, 3.88 — any single threshold placed in
that band is a judgement call, not a natural separation. This is direct evidence for decision 101's
framing and against "raise the floor until 29/30 merges": there is nothing to raise it *to*.

The 3.880 figure reproduces the journal's "3.88× the render floor" (F37) to four significant figures,
and matches the third of I5's four crossed-pairing ridge lengths (3.88e-6) exactly — confirming that
the 29/30 pair, the F37 fold, and one of I5's pinned crossed pairings are **one object**.

### 6.3 What the measurements do to decision 89

Decision 89's central claim — *"the only mechanism that keeps I3 true by construction is solving the
merged node as the point equidistant from the arrival set's parents"* — **does not survive contact
with the corpus as stated.**

1. **The k = 3 assumption is false in ~21% of cases and false in 5 of the 5 pairs that matter.**
   Every audited pair has four parents.
2. **Where the parent set has rank 3 but is inconsistent (2 of 5), the placed node is off each
   individual parent-pair locus by ~1e-7 — one hundred times the `EQUIDISTANCE_BAR` of 1e-9.**
   I3 measures each bisector's source against *its own two named parents*; a least-squares compromise
   over four lines is not on any of those four pairwise bisectors. So the placed node does **not**
   keep I3 true by construction; it keeps I3 true only when the parent set is *concurrent*.
3. **Where the parent set has rank 2 (2 of 5, including 29/30), there is no point to place.** The
   equidistant locus is a line — geometrically correct, because two near-parallel walls have a
   mid-line, not a meeting point. The two nodes are two points on that mid-line, and no
   equidistance-based rule can prefer one. **The 3.88e-6 gap is not a rounding artefact. It is the
   solver making an arbitrary choice inside a genuinely underdetermined direction.**

This is a strengthening of F32, not a contradiction of it. F32 said *merging spatially-separated
events displaces the merged node, and I3 catches it*. The measurement says the same thing at the
source: **for a non-concurrent parent set there is no undisplaced answer to find.** The generalised
statement:

> A coincidence component can be resolved to a single node without violating I3 **if and only if its
> parent set is concurrent** — i.e. the `k × 3` system `n·X − t = n·A` has an exact solution.
> Concurrency is a property of the parents, decidable from the normal matrix's rank and residual
> before any node is placed, and it is *not* implied by the arrivals being close together.

That is the pivot of §7: the mechanism the arc has been reaching for is **not** "merge everything
under a bar". It is **"decide from the parents whether these arrivals CAN be one node, and be loud
when they cannot."** The distance bar becomes the *trigger* for asking the question; the parent
system gives the *answer*.

### 6.4 What that leaves for the 29/30 pair

Three routes remain, and they are not equivalent. The arc lead rules; the audit records what each
costs.

- **Upstream (decision 102).** The rank-2 corridor at 29/30 is the same site as I5's crossed pairing
  and F36's lexicographic mis-pairing. Under decision 102 — earliest arrival wins, always — the
  duplicate ridge should not exist, and with it gone there is one node on the mid-line, not two.
  This is the only route that removes the pair rather than concealing it. **It is not a tolerance
  change at all**, which is consistent with decision 101's own reading that "picking the right winner
  wouldn't fix this defect" — but the converse also holds: fixing the tolerance would not fix the
  crossed pairing.
- **Presentation-layer contraction (decision 92).** Contract sub-floor and near-floor skeleton edges
  for downstream consumers that opt in, leaving solve semantics exact. Honest, cheap, and it is what
  makes the *picture* match the user's eye. It does not make the region solvable.
- **Region-boundary screening (F37's own finding).** "No feature-level degeneracy screen exists
  anywhere — a region can be arbitrarily large and carry a zero-area feature unexamined;
  canonicalisation is the correctly-positioned local screen and was simply fold-blind." Decision 100
  fixed the fold blindness. F37 also measured that **dropping either fold vertex makes both failing
  regions solve.** The 29/30 pair reaches the child region as two boundary vertices 3.88 floors
  apart forming a zero-area needle; a *feature-level* screen (a fold/needle predicate over a run of
  vertices, not a single vertex against its own chord) would remove it there without touching the
  root skeleton.

---

## 7. Draft decision spec

This is a **draft**. Numbered decisions are for the arc lead to rule on with the user; items marked
**OPEN** carry their options and the measurement that would settle each. Every decision is written so
it can be falsified against §5.

### 7.1 The conceptual roles

**1. The solver has exactly TWO production geometric tolerances, and they answer different questions.**
`SKELETON_NOISE_FLOOR` answers *"can this be seen?"*. `FLOATING_POINT_EPSILON` answers *"can the
arithmetic tell these apart?"*. No third production tolerance is admitted. Every existing site is
reclassified under one of them, or under decision 3 or 4 below. **Falsifiable:** a grep of the solver
finds a numeric literal used as a geometric tolerance that is neither of the two constants and is not
a scale-relative tolerance of §3.4.

**2. The render floor is THE perceptual identity bar, and it is the only bar allowed to decide that
two positions are the same point.** Per decisions 54/78/101. It governs: input canonicalisation, event
identity in space, event identity in time (decision 8 below), node distinctness as an invariant (I2),
and the region-boundary fold screen. **Falsifiable:** any site deciding positional identity at a value
other than the floor is a violation, and D1's `findOrAddNode` box is the first one to arraign.

**3. The epsilon is THE arithmetic-equality bar and NEVER decides whether two positions are the same
point.** It is legitimate on: determinants that should be exactly singular, cross and dot products
that should be exactly zero or one, offset rates that should be exactly zero, and the "not earlier
than birth" causality comparisons — quantities that are exactly equal in exact arithmetic and differ
only by rounding. **Falsifiable:** §3.2 lists every current site; each must be classified as
arithmetic-equality or moved.

**4. Where a metric bar cannot be made scale-safe, the answer is a combinatorial guard, and reaching
for a new number instead is against the arc's own evidence.** Precedents, all measured: `MINIMUM_RING_SIZE`
carrying canonicalisation through the sliver pathology (D7), parentage face-ordering curing the
160%-of-area tiling defect where no angular tolerance could (D9/F26), integer edge ids making event
grouping ulp-stable (C6). **Falsifiable against C9.**

**5. Test-side verification bars stay deliberately tighter than the perceptual floor and stay
test-only.** I3 at 1e-9, I5 at 1e-9, tiling at 1e-14, drift at 1e-14. Their job is to catch a class
*before* it is visible, so unifying them with the render floor would delete the instruments. This is
also the boundary decision 93 drew for I4 ("test-only is a hard boundary, stated by the user with its
reason").

**6. Scale-relative tolerances of the downstream pipeline are correct as they are and are not
unified.** `SIMULTANEITY_RELATIVE_TOLERANCE`, the strip and parcel scale-relative epsilons, the
tiling area fractions. They are relative to a quantity the solve itself produced, which is the right
construction; the audit's finding about them is only that several are **uncommented inline literals**
(D-list entries in §3.4) and should be named constants with a measured band.

### 7.2 The render floor's value and space

**7. The floor stays a unit-space constant at the root and travels as a caller-space LENGTH
everywhere else.** This is already the construction
([recursive-subdivision.ts:573-575, 620](../../packages/core/src/straight-skeleton/recursive-subdivision.ts))
and it is right: "the floor is the same physical distance said in the units the comparison happens
in". No change; recorded so the unification does not accidentally undo it.

**8. OPEN — the floor's VALUE.** The measured band `[1e-6, 3e-6]`
([canonicalisation.ts:127-139](../../packages/core/src/straight-skeleton/canonicalisation.ts)) was
established *before* decision 100's fold fix, and its upper bound was set by a per-level tiling
failure at 5e-6 that the clamped predicate may itself have caused. **§6.2 shows that no value inside
that band reaches the 29/30 pair at 3.88e-6, and that the near-coincidence ladder has no gap** — so
raising the floor is not a route to the ruling, only possibly to a wider safety margin.
*Options:* (a) keep 1e-6; (b) re-measure the band on the post-fold-fix tree and move to the middle of
whatever band results; (c) leave the value and take the ruling entirely through decisions 9–16.
*Settling measurement:* re-run the per-level tiling identity and the recursion census across
`[1e-6, 1e-5]` on the current tree, and report where the upper bound now sits. **Recommendation:**
(c), with (b) run as evidence — the audit found no case that a different number fixes.

**9. OPEN — how the floor translates into region space.** Today only canonicalisation gets the
pass-down; every other tolerance is evaluated in whatever unit space the region happens to have.
*Options:* (a) status quo; (b) pass down to everything — **already falsified by decision 87's ratio
table (C5)**, so this option is closed; (c) pass down with `MINIMUM_RING_SIZE`-style combinatorial
guards replacing the metric cap the ratio table forbids; (d) region-anchored with the root floor as
an upper clamp — needs an argument for why a clamp is not the "forbidden new threshold" decision 87
rejected. *Settling measurement:* re-run the extent-ratio table on the post-fold-fix tree, together
with F38a's five remaining failing regions, and report for each whether the region would still lose
its vertex under (c).

**10. OPEN — the degeneracy area floor's space.** `DEGENERATE_AREA_EPSILON` is an absolute area in
caller units while every length floor is relative (D11). Decision 96 ratified its *behaviour*, so
this is about the space only. *Options:* (a) leave it — the caller's units are the tiler's units and
a tile floor is legitimately absolute; (b) restate it as `floor²` in the space it is evaluated in,
making it move with the polygon as the render floor does; (c) split it: an absolute *product* floor
for the decision-96 decline, and a relative *numerical* floor for `isValidSubPolygon`. *Settling
measurement:* sweep the corpus translation/scale grid and report which regions change verdict under
(b) — decision 96's declines are behaviour the user has ruled correct, so any movement there is a
STOP, and (a) survives unless the sweep is clean.

### 7.3 Event identity — the mechanism

**11. Event identity is judged at the render floor in BOTH space and time.** An offset is a length;
one bar governs both axes (decision 83). This closes D2. **Falsifiable against C3:** the ungated
version of exactly this cured the whole large-coordinate class and regressed two clean fixtures with
manufactured causality violations (F30/decision 84) — so it lands only with decision 12.

**12. The time widening is GATED: widen the layer window to the floor only where the spatial
clustering already has something to join.** Decision 84's own proposal, never tried, and it needs no
new threshold. **Falsification set, inherited verbatim from decisions 78/84:** clean roster
bit-identical including the translation sweep; zero causality violations; tiling stays at machine
precision; census does not regress from its current figure; I3 and I5 pins unmoved. **Prize named by
decision 84:** if it holds, the decision-66 accept-by-construction class and the decision-81
exceptions dissolve entirely.

**13. The layer window becomes a transitive relation, not an anchored cut.** D13/F19: the current
window takes events while `fp_compare(offset, bestOffset) <= 0` and then **breaks**, so a convergence
straddling the boundary is cut across layers and partially merged — Circle 48 @1e10 resolving its
48-way centre as 14 nodes. F19's finding that **"no safe upper threshold exists"** (failures at
{2e9, 9e9, 1e10} and at 3e12/4e12, non-monotonic) says the *shape* of the rule is wrong, not its
value. Connected components under the bar, as
[coincident-events.ts:194-233](../../packages/core/src/straight-skeleton/coincident-events.ts)
already does in space, is the same construction applied to the time axis. **Falsifiable against C6:**
the resulting partition must remain a canonical function of the event set — the offset sort must not
re-enter the ordering of what is produced.

**14. `findOrAddNode` keeps the epsilon and is never widened — it is an arithmetic-equality lookup,
not a merge mechanism.** C1 is its conviction: widening it to the floor was measured and broke four
independent axes. Its role after this spec is to recognise a position two code paths computed by
different arithmetic, nothing more. **Falsifiable:** if any position reaching it still needs a
*geometric* merge, the defect is that the path bypassed event resolution — see decision 15.

**15. Every path that creates a node goes through event resolution first.** Decision 85's deferred
restructure. Today the split/partition path gets only a position fix
([algorithm-complex-cases.ts:239-246](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts))
and the `rings === null` / shared-edge fallbacks
([algorithm-complex-cases.ts:217-227](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts))
bypass clustering entirely. **Falsifiable against C2:** F27's decisive observation is that the solver
handles a 48-way hub correctly when the event layer builds it and incorrectly when nodes are
assembled one at a time; any remaining bypass is a route back to that failure.

### 7.4 The placed node

**16. A coincidence component is resolved to one node only when its parent set is CONCURRENT, and
concurrency is decided from the parents before any node is placed.** Build the `k × 3` system
`n·X − t = n·A` over the component's distinct parents — the generalisation of
[`solveTerminalPoint`](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts)
(line 490) from three lines to k — and read two things off it: the **rank** of the normal matrix and
the **residual** of the least-squares solution. Concurrent means full rank *and* residual under the
bar. This replaces "are these arrivals close together?" as the merge criterion; closeness becomes the
trigger for asking, not the answer. **Falsifiable against §6.2:** on the five audited pairs this
predicate must return *not concurrent* for 29/30 (rank 2), *not concurrent* for [19,20] (rank 2),
*not concurrent* for [19,21] and [24,26] (residual 0.258 and 0.098 × floor), and *concurrent* for
k4 [27,29] (residual 2.5e-12).

**17. Where the component IS concurrent, the node is PLACED — solved from the parent system — never
CHOSEN from a member.** This is decision 89's mechanism, now correctly scoped. Because the point is
the one place all k offset lines coincide at a single common offset, it is equidistant from every
parent pair by construction, so I3 holds *by construction* and C4 is satisfied. It also means the
merged node's offset `t` is solved rather than inherited from one arrival — which is what makes it
consistent with C8's linear causality rather than merely near it. The medoid convention
([coincident-events.ts:253-268](../../packages/core/src/straight-skeleton/coincident-events.ts))
retires at this site.

**18. Where the component is NOT concurrent, nothing is merged and the solver says so.** A rank-2
component means the parents' equidistant locus is a **line** and the arrivals are legitimately at
different places on it (§6.2a); an inconsistent full-rank component means **no equidistant point
exists** (§6.2b). Both are real geometry, and both are evidence of a defect *upstream* of the
tolerance system — under C8, "a numerical bug implying something upstream". Silent splitting is what
produced the 29/30 pair; silent merging is what F27 rejected. **Falsifiable:** the corpus must report
these loudly and the count must be pinned per fixture in the decision-72 style, so a new one is a
test failure rather than a number that grew.

**19. OPEN — the concurrency residual bar.** *Options:* (a) `EQUIDISTANCE_BAR` (1e-9), so that
"concurrent enough to merge" and "equidistant enough to be a bisector" are literally the same
statement — the tidiest, and it makes decision 17's by-construction claim exact; (b) the render
floor, which would admit the [19,21] and [24,26] merges at residual ~0.1–0.26 × floor and then need
I3's pins widened, contradicting C4; (c) a relative bar against the component's own diameter.
*Settling measurement:* the distribution of concurrency residuals over **all** corpus coincidence
components, not just the five audited pairs — if there is an eleven-order gap like
`SIMULTANEITY_RELATIVE_TOLERANCE`'s, the bar is not marginal and (a) is safe.
**Recommendation:** (a), because it makes decisions 17 and 5 consistent and needs no new number.

**20. OPEN — rank detection.** Rank 2 must be detected from the parent normals, not from a condition
number chosen by hand: `cond(N)` was 4.9e9–1.4e10 in the degenerate cases and 2.0–7.3 in the healthy
ones, so the gap is nine orders — but a condition-number threshold is exactly the "new number" C9
warns against. *Options:* (a) count **distinct oriented normals** after sign orientation — a
combinatorial test, and in all four degenerate cases the count was exactly 2 while the healthy cases
had 3 or 4; (b) rank-revealing QR with a tolerance; (c) reuse the existing `areEqual(determinant, 0)`
convention from [algorithm-termination-cases.ts:503](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts),
whose measured headroom is 0.106 versus 1e-8. *Settling measurement:* the distribution of distinct
oriented normal counts against `det(N)` over all corpus components. **Recommendation:** (a) — a count
is combinatorial, ulp-stable (C6) and needs no threshold at all; (c) as the corroborating assertion.

### 7.5 Sites the audit says are simply wrong, independent of the unification

**21. `vectorsAreEqual(r1SourceToR2Source, ray1.basisVector, 1e-4)` at
[intersection-edges.ts:56](../../packages/core/src/straight-skeleton/intersection-edges.ts) is the
loosest geometric tolerance in the solver — 100× the render floor — and carries no comment and no
measurement anywhere in the record.** *Settling measurement:* sweep it from 1e-4 down to the epsilon
over the corpus and report what moves. If nothing moves it is dead slack and goes to the epsilon; if
something moves, whatever that is needs an argument.

**22. One constant meaning two things four orders apart is a defect of expression.** `1e-8` applied
in component space is ≈1e-8 rad; applied in dot-product space it is `1 − cos θ < 1e-8` ⇒ **1.41e-4
rad** (D9). Every angular decision should be written as an explicit **angular or sine** bar with its
own name, in the manner I5's `PARALLEL_PARENTS_BAR` already is — I5's instrument measured a nine-order
gap between legitimate and defect parallelism, which is the standard the production sites should meet.
**Falsifiable:** re-express each site of §3.2 whose space column says "dot product" or "cross product"
as an explicit sine bar and show the corpus is bit-identical.

**23. `ENDPOINT_EPSILON` is the solver's length epsilon applied to a dimensionless parametric `t`**
([polygon-decomposition.ts:5](../../packages/core/src/straight-skeleton/polygon-decomposition.ts)).
It is not wrong by accident of value, but it is unclassified: a `t`-tolerance of 1e-8 means a
different absolute distance on every segment. Restate as a length against the segment's own length,
or name it and record the band.

**24. The uncommented inline literals of `parcel-slicing.ts` are named or removed.** Eight of them
across four dimensionless spaces
([parcel-slicing.ts:346, 351, 377, 423, 430, 479, 529, 602](../../packages/core/src/straight-skeleton/parcel-slicing.ts)),
plus the unexplained `scale * 1e-7` at
[:276](../../packages/core/src/straight-skeleton/parcel-slicing.ts) which is two orders looser than
every other parcel bar. Hygiene, not semantics — but decision 101's charge is precisely that the
system does not know what it thinks is noise, and nine anonymous numbers are nine unstated opinions.

**25. `CORPUS_CANONICAL_AREA_DRIFT_BOUND` is thin and should be re-measured or re-argued.** F24a:
re-measured worst 5.19e-15 against a 1e-14 bound — **under 2×**, for a bound written as headroom. It
is also the bound blocking `OFF_EDGE_JITTER_L_SEED_15838`'s promotion (decision 79) and the near-flat
rectangle's enrolment (decision 76), so it is load-bearing for the root-floor package's acceptance
criteria.

### 7.6 What this spec deliberately does NOT do

**26. It does not attempt to make the 29/30 pair one node by moving any tolerance.** §6.2 shows the
pair is a rank-2 degeneracy on a corridor mid-line, that the near-coincidence ladder has no gap, and
that the pair is the same object as I5's third crossed pairing and F37's fold. **The tolerance system
is what let it stand unexamined; it is not what created it.** Decision 101's "picking the right winner
wouldn't fix this defect" is correct — and its converse is also true, and is this audit's finding.
The routes are §6.4's three, and decision 102's upstream fix is the only one that removes the pair.

**27. It does not retire decision 92's presentation-layer contraction.** Sub-floor skeleton edges that
are real, causally ordered structure (D4) are not a solver problem and cannot be made one. Contracting
them for downstream consumers that opt in is still the decision-54-honest answer for that population,
and it is what makes the picture match the eye.

**28. It proposes no change to any test bar.** Per decision 5, the instruments are the falsifiers of
everything above. If a proposed change requires widening I3, I5, the tiling bar or the drift bound,
that is the change failing, not the instrument.

---

## 8. Provenance index

### Journal citations used above

All from [the session-3 journal](./recursive-subdivision-arc-journal-3.md) unless noted.

| Ref | What it establishes |
| --- | --- |
| Decision 54 | The epsilon is a deliberate pragmatic choice; the criterion is "can you see this on a screen?" |
| Decision 65 | Determinism: simultaneous-event tie-breaks must be canonical, not creation-ordered. |
| Decision 66 | The two surviving translation failures are accepted by construction; the disputed geometry is under two ulps of the quantised input. |
| Decision 70 | A wavefront bisector's offset rate is non-negative by definition; the rate decides direction. |
| Decision 76 | The near-flat rectangle is the root-floor package's acceptance fixture; `canonicalAreaDrift` 2.3e-10 against the 1e-14 bound. |
| Decision 77 | The user's two screenshots; "at maximum UI zoom the two nodes cannot be discerned separating". |
| Decision 78 (+ F27 amendment) | The node-merge bar at the render floor; mechanism re-ruled from node absorption to event clustering. |
| Decision 79 | 15838's promotion is gated on the root-floor package. |
| Decision 81 | The ≥1e10 translation cells accepted by construction, with the measured group diameters. |
| Decision 82 | The tiling bar stays 1e-14; 15838's 7.36e-13 becomes a defect signature. |
| Decision 83 | "Offset is a length; one floor governs both axes." |
| Decision 84 | The gated time-window, authorised and never tried; the prize if it holds. |
| Decision 85 | The split/partition path never reaches coincidence clustering. |
| Decisions 86 / 87 | Root-floor inheritance for the coincidence rule, ruled then STRUCK on the extent-ratio table. |
| Decision 88 | The duplicate-bisector trace; I3 first proposed as a counting invariant. |
| Decision 89 | The "placed, not chosen" merged node, recorded and parked. |
| Decision 92 | Surviving sub-floor pairs are real micro-structure; presentation-layer contraction is the honest route. |
| Decision 93 | I4 face-closure walkability; test-only as a hard boundary. |
| Decision 96 | The sliver-declines accepted as correct behaviour ("a sensible tiler knows not to try and slice a tile narrower than a certain size"). |
| Decisions 97–99 | The region tree; the near-degenerate pairing question; the full-depth boundary hypothesis. |
| Decision 100 | The fold fix — perpendicular distance to the chord LINE, unclamped. |
| **Decision 101** | **The governing ruling this audit serves.** |
| Decision 102 | Linear causality: the pairing winner is the lower offset, within tolerance, always. |
| F4 (session-1 journal) | Threading the canonicalisation root floor down NARROWED the band against prediction. |
| F5 (session-1 journal) | The floor band was bounded by an accounting error; the tiling identity is floor-independent. |
| F6 (session-1 journal) | The power-of-two scale is exactly invertible in its scale and not in its centring. |
| F19 | Sub-epsilon node scatter from a non-transitive layer window; "no safe upper threshold exists". |
| F20 | The along-edge jitter class is dead by construction; the live defect sits just above the noise floor. |
| F26 | The 160%-of-area tiling defect; faces re-ordered by parentage, combinatorial and exact. |
| F27 | The absorption merge's four independent failure axes, and the observation that located the right mechanism. |
| F28 | Event-layer render-floor clustering: right mechanism, one narrow blocker, five-pair remainder. |
| F32 | I3 reformulated to the definition and landed at machine precision; merge displacement as the single mechanism. |
| F36 | The region tree's first use: a root-solve silent wrong answer, and I3's blind spot. |
| F37 | The full-depth boundary is already discrete; the needle's evasion is the clamp; nodes 29/30 at 3.88× the floor. |
| F38 | The fold fix landed; I5 landed at a 1e-9 bar with a nine-order gap; census 29 → 20. |
| F38a | A region can be made unsolvable BY the pass-down. |

### A note on F10

F10 is cited throughout the journals as the session-2 tolerance-frontier finding, but **session 2
left no journal and F10's body was never written down** — the session-3 journal's numbering note
(line 14) reserves the number, and every later reference cites *items* of it rather than the finding.
Reconstructed from those citations, F10's items are: the absolute epsilon never revisited (re-ruled
as closed by decision 54); the root-floor pass-down reconciliation (decisions 19–20 vs F4/F5 — still
open, and §7 decision 9 here); the `inEdges` ordering instability (folded into the decision-65
determinism package); the collinear dumbbell's non-adjacent shared-supporting-line degeneracy (still
a solver defect under decision 53); the caller-space debug overlay and unit-space assert text
(documented-risk tier); and the regime where the terminal ring becomes finer than the tolerance
(evidenced by F15b — Rosette5-40 @1e11 dying in a two-edge base case with two source nodes 6e-8
apart, later 4.7e-9 per F23). This is an interpretation, flagged as one.

### Measurement provenance

The §6.2 figures were produced from the **built CommonJS bundles**
(`packages/core/dist/index.cjs`, `packages/test-fixtures/dist/index.cjs`) by a script held only in a
scratchpad directory; no repository file was written, edited or rebuilt, and no test suite was run.
The bundles reflect a corpus of 59 fixtures (53 clean + 6 known-defect), which matches the
post-decision-100 state recorded in F38 and in
[graph-index-invariants.test.ts:168-178](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts).
The 3.880 × floor separation for nodes 29/30 reproduces F37's independently-measured "3.88× the
floor" to four significant figures, and the four I2-pinned pairs reproduce the pinned table exactly,
which is the cross-check that the bundles are the tree this audit describes.
