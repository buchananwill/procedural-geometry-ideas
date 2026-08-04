# Spread Translate & Element-Clamp Reporting — Design

**Date:** 2026-08-04
**Status:** Approved; implemented (§1–§2 in Unit 9, §3 Spread Translate in Unit 10)
**Scope:** Three coupled changes: (1) terminology — "clamp" throughout, element clamp vs selection clamp, retiring
"freeze" from solver vocabulary; (2) uniform at-bound element-clamp reporting replacing the event-based frozen list;
(3) the Spread Translate strategy — ramp-seeded, relaxation-based articulation completing the 6-way strategy × delta
matrix.

## 1. Terminology

- **Selection clamp**: the solve discarded some of the input delta (`appliedFraction < 1`). Badge territory.
- **Element clamp**: an individual element is at one of its constraint bounds. Canvas territory.
- **Freeze** is retired from solver vocabulary entirely. The name is reserved for a future user-authored per-element
  Freeze state (independent no-translate / no-joint-rotation flags), out of scope here but anticipated in §3's anchor
  design.
- Renames: `SolveResult.frozenElementIndices` → `clampedElementIndices`; all prose, comments, and test names follow.

## 2. Element-clamp reporting: at-bound measurement

The event-based frozen list (saturate collecting its cascade's freeze moments) is replaced by one uniform post-solve
measurement in `solveArticulation`, applied identically to every strategy:

- A **selected** element is element-clamped iff, in the result pose, any enabled bound it participates in sits within
  detection tolerance of its limit. One uniform rule: an at-bound constraint marks every selected element that
  participates in it. A link at its bound marks both its endpoints (whichever endpoint's constraint entry enables the
  bound). A joint angle at its bound marks all three elements whose positions form it — the element it turns at and
  its two neighbours — so a joint bound owned by an unselected element still highlights the selected elements moving
  against it.
- `clampedElementIndices` lists them in ascending index order. Freeze order is gone — no UI consumed it, and the
  at-bound set is a property of the pose, not a history of the solve.
- Strategies stop collecting anything: saturate's `peeledElements` / `appendNewlyFrozenElements` plumbing is deleted.
  The strategies return elements + `appliedFraction` (+ `appliedStrategyId` from the dispatch); the measurement is the
  solver's job.

**Detection tolerance.** A clamped solve stops up to one clamp-resolution notch short of the true edge — at most
`stepMagnitude · 2^-12` in constraint-value space, sub-unit for any realistic gesture — so a bare
`ARTICULATION_EPSILON` (1e-6) would routinely miss the binding constraint, but a modest **fixed world-space
tolerance** covers everything real. The tolerance is a presentation concern (how close counts as "at" the bound on
screen), so it lives on `SolveInput` as an optional `elementClampTolerance: { distance, angle }` with exported
defaults (`0.5` world units, `0.005` radians initially — tune freely). The dashboard passes nothing today; if the
canvas ever gains zoom it passes a viewport-scaled value so the rendered epsilon stays visually constant. Guaranteed
detection envelope, stated and tested: with distance tolerance `τ`, the binding constraint of a clamped solve is
provably within `τ` of its bound for any step up to `τ / CLAMP_RESOLUTION` (~2000 units at the default) — the
property test asserts the binding constraint is always reported within that envelope, and a second property bounds
over-reporting (nothing reported whose every bound is farther than the tolerance). Spread translate's
achievement-maximising selection samples fractions at `1/512` rather than the clamp's `2^-12`, so a validity-limited
spread drag can stop one `1/512` step shy of where the clamp would have; constraints the relaxation itself parks land
exactly on their bounds, so at-bound reporting is unaffected in the common cases.

**Canvas rule simplifies.** Red = element-clamped, whenever a drag is active — no `appliedFraction` gate, no
whole-selection fallback. A clamped rigid drag now highlights the binding element(s) rather than the whole body
(more informative: it shows *where* the body is stuck); a fully absorbed saturate drag shows its at-bound elements
(the previously invisible state); an unconstrained drag shows nothing. The badge remains the only selection-clamp
indicator.

## 3. Spread Translate

Completes the 6-way matrix (three strategies × rotate/translate); the segmented control is unchanged. Distinct
per-delta labels can come later if wanted.

### Intent: the ramp

- Falloff origin is the pivot. Falloff metric is **arc length along the chain at drag start** (sum of link lengths
  from the pivot), so a physically nearer element moves less regardless of chain folding.
- Pivot inside the selection mirrors Spread Rotate: `splitSpans` yields two contiguous spans, each with its own
  furthest element and its own ramp. The pivot itself has arc length 0 and never moves — it is an anchor.
- Element `e` in a span with furthest element `f` is seeded at `origin(e) + t · delta · (arcLength(e) / arcLength(f))`.
  The furthest element of each span receives the full scaled delta.

### Feasibility: anchored relaxation

The ramp shears links, so a fixed-count local constraint-projection pass (FABRIK / position-based-dynamics family)
restores feasibility while preserving the ramp's intent:

- **Anchor set**: every unselected element, and the pivot. Each span's furthest element is pinned at its ramp target
  during projection (the reach objective). The anchor set is a first-class concept so the future Freeze state can add
  members without restructuring.
- Per iteration, sweep each span backward from its pinned far end toward the pivot, then forward from the anchored
  side, projecting each link's length into its `[min, max]` and each joint angle into its bounds (rotate the outgoing
  link direction into the allowed cone). Fixed iteration count (16 initially, an exported constant), fixed sweep
  order, no randomness: `relaxedPoseAt(t)` is deterministic and derived from the base pose every call.
- **Every joint the span's motion can affect is projected — boundary joints included.** An unprojected joint is a
  global veto: its violation survives into the candidate pose and the outer clamp refuses the whole pose, so the
  first joint to saturate halts all further rotation of the armature in that direction (observed in play: a single
  contiguous selection with an unselected pivot stops dead once the nearest joint hits its bound, permitting only
  extension). Instead, the sweep clamps each boundary joint AT its bound and carries on — the joint parks at its
  limit and the remaining joints bend further to keep accommodating the distal target. Concretely that adds: the
  joint at the anchor-side element (one arm fixed, one arm the first selected element), and for an interior
  selection the joint at the far element (its outer arm being the anchor just past the span). The rule is that a
  joint is projectable once the arm behind it cannot move again — already placed by this sweep, or an anchor.
- **One boundary joint has no legal correction and stays with validity**: the joint at that anchor just past the
  span. Its only movable arm is the far element, and every turn of the far element that would settle it breaks a
  link the sweep has just settled, so there is nothing to project with. Implemented and measured anyway, it cost
  more than it bought — it swung the far element away from its target (achievement 0.0996 → 0.0000 on a short
  interior span) to buy a joint validity was already handling. Removed; the link beyond the far element is likewise
  validity's business.
- **The shared pivot joint (pivot inside the selection) is the one boundary joint two spans contend for**, so it is
  split symmetrically: after each iteration, any excess bend at the pivot joint is corrected by rigidly rotating
  each span about the pivot by half the excess, keeping the projection deterministic and order-independent between
  the spans.
- Unreachable targets behave like FABRIK: the span extends toward the target and falls short — then the outer clamp
  decides how much of `t` survives (with boundary joints projected, the clamp is a safety net rather than the
  routine limiter).

### Validity, and selecting on achievement

`poseAt(t) = relax(ramp(t))` is evaluated over the fixed grid of fractions the clamp search scans — the coarse
`CLAMP_COARSE_SAMPLE_COUNT` samples, then a finer pass across the bracket either side of the winner — and every
candidate must satisfy the same whole-pose non-worsening predicate every other strategy clamps on. One global `t`
covers both spans; they do NOT clamp independently, which is load-bearing for the pivot-caveat: when the pivot joint
carries an angle constraint, both spans' motion tightens it jointly, and only a whole-pose predicate honours that
coupling.

What differs from every other strategy is **which valid candidate is selected: the one maximising measured
achievement, ties going to the larger fraction** — not the largest valid fraction. Largest-valid only ever tracked
accommodation because validity was the limiter; once boundary joints are projected the relaxation makes nearly every
fraction valid, and achievement stops being monotone in `t`. The fractions above the best one feed the ramp targets
the joint cones forbid, and the relaxation curls the span round to somewhere it can legally sit — measured on the
armature fixture, a leftward drag of 300 units sent the far element 286 units the OTHER way, and the same gesture at
225 units tracked the cursor perfectly, so the pose jumped 500 units mid-drag. Selecting on achievement removes the
discontinuity and dominates the old behaviour on every direction measured. The selected fraction is therefore a
multiple of `1 / (CLAMP_COARSE_SAMPLE_COUNT · SPREAD_REFINEMENT_SAMPLE_COUNT)`; the refinement pass keeps the coarse
winner as its incumbent, so it can only improve on it, and the search is a pure argmax over a fixed grid — no
randomness, no assumption about the shape of achievement between samples.

`appliedFraction` is **measured, not `t`**: the mean across spans of the furthest element's achieved displacement
along the requested direction, over the requested magnitude, read off the accepted pose. The two differ whenever the
relaxation absorbs a shortfall the clamp is content with — an out-of-reach target straightens the span and every `t`
stays valid, so `t` would report 1 while the far element sits a third of the way to the cursor. A doubly limited
drag (clamped *and* short of reach) reports the genuine achievement of the pose that came back.

Degenerate cases follow house rules: a pivot-only selection yields no spans (the pivot is an anchor with arc length
0) and returns identity — unlike rigid and saturate, spread translate never moves the pivot; discontiguous selections
fall back to rigid at dispatch as ever; and an unconstrained chain reproduces the ramp exactly (relaxation is a
no-op), which is the closed-form test anchor.

## 4. Tests

- Ramp exactness on unconstrained chains: displacements proportional to arc length, furthest element exactly at
  `origin + delta`, pivot and unselected elements untouched, both pivot-outside and pivot-inside (two-span) cases.
- Reach behaviour: a chain dragged beyond its maximum extension straightens and clamps; `appliedFraction` matches the
  achievable fraction; result globally valid (or non-worsening from an invalid start).
- Pivot-joint coupling: an angle bound at an interior pivot clamps both spans together — assert the spans do not
  overshoot jointly what the pivot joint permits.
- Min-bound compression: dragging a span toward its anchor compresses links only to their minima.
- At-bound reporting (all strategies): the two property tests from §2 (binding constraint always reported; nothing
  far from every bound reported), plus targeted cases — rigid clamped drag reports exactly the binding element(s);
  fully absorbed saturate drag reports its at-bound elements; unconstrained drags report nothing. Existing
  freeze-order assertions are replaced by ascending-index at-bound assertions.
- Fuzz: extend the existing seeded suites to spread translate (valid and invalid starts, non-worsening property,
  applied fraction in [0, 1], clamped indices ⊆ selection).
- Determinism: identical inputs produce identical poses across repeated solves.

## 5. UI

- Canvas: the simplified rule from §2.
- No badge changes. Spread's translate path stops delegating to rigid; its "no distinct translate semantics" comment
  and the design-note passages saying so are replaced by a Translate section for spread describing ramp + relaxation.

## Out of scope

- The user-authored Freeze state (anticipated via the anchor set; own unit later).
- Per-delta strategy labels in the segmented control.
- Analytic interval computation; galloping refinement.
- Any change to Saturate or Rigid semantics beyond the shared reporting rework.
