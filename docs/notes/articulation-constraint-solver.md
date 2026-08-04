# Articulation Constraint Solver

The purpose of this module is to allow exploration of constraint solving on a series of connected elements, by treating
them as articulation points in a linkage. The constraints vary: both element separation and joint angle can be free or
constrained. This document captures the philosophical intent of the solver set: what each strategy means, which
invariants are load-bearing, and which behaviours were deliberate decisions rather than accidents. It is a the guide for
porting the TypeScript implementation into other languages and paradigms. Where a number or an algorithm appears here,
it is part of the design; where something is absent, the port is free.

Two priorities govern every solving strategy, in order: the solver must never produce an invalid pose, and within that
limit it must accommodate the user's input delta as closely as possible. From a valid pose the solver must never
produce an invalid one; from an invalid pose (which may result from e.g. editing the constraints of an existing pose) it
must never worsen any constraint's violation, and must permit deltas that reduce them, so the user can drag the chain
back toward validity. Validity is a property of poses, never of paths: the user is searching a constrained space for
a visually pleasing arrangement, not simulating physical motion. "Tunnelling" through regions of invalid pose space to
reach a valid pose is therefore desirable behaviour, not a defect, and no strategy should trade accommodation away to
preserve continuity of motion.

"Valid" and "never worsen" are both read to the solver's epsilon tolerance: every bound admits an epsilon margin, and
the non-worsening rule likewise permits growth of up to epsilon per solve (per cascade iteration for saturate). A pose
riding exactly on a bound can therefore drift within that tolerance class across repeated gestures. This is accepted
deliberately, since epsilon is orders of magnitude below anything visible on canvas and capping it exactly would trade
floating-point robustness for no observable behaviour.

A joint angle is unevaluable when either of its segments is degenerate (shorter than epsilon), and an unevaluable
angle bound is skipped, not violated. This is deliberate: a linkage authored with no minimum separation is already
modelling something that ignores normal physical expectations, and the solver does not enforce on the author's behalf
a premise they declined to adopt. Angle bounds that must always hold should be paired with a minimum distance.

Three modes of constraint satisfaction are offered, ordered by the degree to which the input delta is interpreted
against the selection as a rigid assembly versus as individual elements:

1. Rigid Assembly: the selection moves as one body.
2. Saturate Articulation: the selection moves as one body until boundary elements bind, then sheds them and carries
   the remainder onward.
3. Spread Articulation: the delta is distributed across the selection element by element.

Each mode interprets both delta kinds, rotation and translation, giving a six-way matrix. The strategies are
implemented behind a polymorphic Strategy Pattern so further resolution algorithms can be added later; the six here
are a deliberate curation of the proportional-editing space. Fully open-ended proportional editing — variable falloff
curves, falloff radii, custom weighting — is the acknowledged continuation beyond this module's scope, and nothing in
the design should be read as precluding it.

## Core UI

1. One single line of elements.
2. No branching, looping or disjunct sets.
3. LMB on the canvas to add an element. It attaches to the nearest end.
4. Marquee to select elements.
5. LMB an element to select.
6. Shift + LMB to add/remove an element to/from selection.
7. Marquee and Shift can be combined.
8. Ctrl + LMB to set the pivot/focus element.
9. LMB + drag an already selected element to transform all selected elements.
10. Transform can be toggled via a UI button between translate or rotate.
11. Delete key removes selected element(s).
12. Delete button also in UI panel.

## Constraint UI

1. Panel affordance to edit constraints for each element.
2. Constraint parameter: min/max distance from previous/next element.
3. Constraint parameter: min/max joint angle at element.
4. Angle and distance constraints are disabled (unconstrained) by default for all elements.
5. Affordances to copy constraint struct for an element, and pasting constraint struct from clipboard. Allows easy
   duplication across elements.

## Constraint Algorithms

- All transforms attempt to act on all selected elements.
- The constraint solving algorithms determine how a given input delta is interpreted into a new pose for the selected
  elements. The pose implied by a given input delta is different for each algorithm.
- The definition of "valid pose" is shared across all algorithmic interpretations: a pose invalid in one algorithm is
  invalid in all algorithms. It is a property of the elements' constraint data. A link is governed by the intersection
  of both endpoints' entries — whichever element declares a bound on their shared link, the bound holds.
- Where an attribute (distance or angle) is described as "able to change freely", this does NOT imply that any value
  is valid: it means the algorithm is permitted to mutate it to produce a pose from the input delta.
- The *caller* caches the pose the gesture started from and hands it to the solver on every pointer move; the solver
  itself keeps nothing between solves. Every candidate pose is derived from that base pose and a fraction of the input
  delta — never accumulated from a previous candidate. When the raw delta cannot be accommodated whole, the algorithm
  applies as much of it, in the same direction, as yields an acceptable pose.
- The largest-acceptable-fraction search is a descending coarse scan of 64 even steps followed by bisection refinement
  of the accepted step, to a resolution of `2^-12` of the delta. The coarse scan is what lets the search reach a valid
  island beyond a forbidden region — a link may pass through its minimum and recover on the far side — which pure
  bisection cannot; that is the tunnelling the philosophy asks for. Every sampled fraction is exact in floating point,
  so "one resolution past the accepted fraction" reproduces a fraction the search proved unacceptable, which the
  saturate cascade relies on to attribute which element bound.
- The pose function the search samples must return the base pose *exactly* at fraction zero. Zero is what the search
  falls back on when no fraction is acceptable, so a pose function that quietly moves an element at `t = 0` would
  answer an unaccommodatable drag with a pose the user never asked for. Spread Translate has to take an explicit step
  to honour this; see its determinism bullet.
- The three algorithm sections below describe rotation; their pivot-preservation bullets are rotation-only
  invariants. Translation, common to all three, is described afterwards in its own section.

### Dispatch and degenerate inputs

The solver, not the strategies, owns input normalisation, and a port must reproduce these rules exactly:

- The selection is sanitised before anything else: duplicates removed, out-of-range and non-integer indices dropped,
  the remainder sorted ascending.
- Identity (the unchanged pose, `appliedFraction = 1`) is returned for: a chain shorter than two elements; an empty
  sanitised selection; a delta with a non-finite component, or a magnitude at or below epsilon (a sub-epsilon delta
  must never read as a full clamp); a rotation whose pivot is not a valid element index — integer *and* in range, so
  a fractional pivot is identity just as an out-of-range one is; and a rotation whose selection is exactly the pivot.
  Identity results still report the strategy that would have run, and are still measured for element clamps.
- A discontiguous selection dispatches to Rigid Assembly regardless of the requested strategy, for every delta kind.
  An unknown strategy id likewise falls back to Rigid Assembly. The result reports the strategy that actually ran.
- Translation does not require a valid pivot — except Spread Translate, whose falloff has no origin without one; an
  out-of-range pivot there degrades to rigid-unit translation, attributed to spread since it is spread's own
  degenerate-input behaviour rather than a solver substitution.

### Data For Worked Examples

```javascript
const elements = [
    {x: 0, y: 0},
    {x: 0, y: 1},
    {x: 0, y: 2},
    {x: 0, y: 3},
    {x: 0, y: 4},
    {x: 0, y: 5},
];

let selected = [1, 2, 3];

const pivot = 0;

const inputDelta = PI_OVER_THREE;
```

### Rigid Assembly

- Distances between selected elements must be preserved by the transformation.
- The distance from the pivot to each selected element must be preserved.
- Internal joint angles of selected elements must be preserved by the transformation.
- Joints that include at least one non-selected element and one selected element are permitted to change angle.
- Distances between an unselected element that is not the pivot, and a selected element, are permitted to change.
- Distances between any pair of unselected elements are not permitted to change.
- Joint angles where all three elements are unselected are not permitted to change.
- Rotations transform the locations of the selected elements by using the local space of the pivot, and the input
  delta for angle. When constraints bind, the largest acceptable fraction of the angle is applied, and
  `appliedFraction` is that scale factor.

#### Worked Example

- The distance `[3,4]` is free to change.
- The distance `[0,1]` is _not_ free to change, because this is a pivot-to-element distance.
- The joint angles `[[2,3,4], [3,4,5]]` are free to change.
- All other joint angles and element spacings must be unmutated.

### Saturate Articulation

- The distance between the pivot, and the closest selected element by walking along the array towards the selection,
  must be preserved.
- The distances between unselected elements must be preserved.
- The distances between a selected element and an unselected, non-pivot element, are free to change.
- The distances between *neighbouring* selected elements must be preserved: every link inside the selection is carried
  rigidly by whichever stage of the cascade still holds both its endpoints. Distances between selected elements that
  are not neighbours are not preserved, and are not meant to be — the chain articulates between them as elements are
  shed. Bound joints `1`, `2` and `3` to ±20° in the six elements above and a `PI/3` saturate rotation of `[2,3,4]`
  about element `0` ends with `d(2,4)` at `1.970`, where it began at `2`.
- All selected elements are ordered by ascending index distance from the pivot element. A pivot inside the selection
  yields two such orderings — one per side — and each side is saturated in turn. The sides are *not* independent:
  every step clamps on the whole-pose predicate, and the pivot joint couples the two, so the second side is measured
  against a pose the first has already moved and can absorb more of the angle than it would have on its own. The order
  is therefore part of the design and a port must reproduce it: the below-pivot span first, then the above-pivot one.
- The input delta is applied to the first selected element, by rotating it — and everything beyond it — around the
  pivot element until the pose can go no further. The limit is the whole-pose non-worsening predicate, not that one
  element's own constraints: any constraint the rotation touches can stop the step. The element then withdrawn from
  the active set is unconditionally the one nearest the pivot, whichever constraint actually bound. That is positional
  attribution, in deliberate contrast to Saturate Translate, which asks a lookahead probe which boundary failed and
  sheds whichever ones it names.
- The other selected elements receive the same rotation and translation in the pivot space, as if performed by the
  Rigid Assembly algorithm.
- If this results in surplus input delta, the algorithm recurses, using the now-saturated element as the new pivot,
  and transforming the remaining selected elements.
- If all selected elements are saturated (no further delta can be applied to any without resulting in an invalid
  pose) then the remaining delta is discarded.
- `appliedFraction` is the consumed delta over the requested delta; with the pivot inside the selection it is the
  mean of the two sides' fractions. It is a report of absorption, not a factor that reproduces the pose by scaling
  the input.

#### Worked Example

```javascript
selected = [2,3,4];
let maxJointAngle = { elements: [0,1,2], limit: PI_OVER_NINE};
```

- The initial rotation will translate `selected` around a pivot at element `[0]`.
- The joint formed by elements `[0,1,2]` will saturate before the full input delta is applied.
- The remaining portion of the input delta will be applied by translating and rotating `[3,4]` around `[2]` as a
  pivot.

### Spread Articulation

- Distances between *neighbouring* selected elements must be preserved — each link inside the selection is carried
  rigidly by the share rotations. Distances between selected elements that are not neighbours change as the chain
  articulates between them: in the worked example below, `d(1,3)` goes from `2` to `1.970`.
- Distances between unselected elements must be preserved.
- Walking from the pivot towards the selection, the distance between the last unselected element (may or may not be
  the pivot itself) and first selected element must be preserved.
- Other distances when one element is selected, and one unselected, may change freely.
- Joint angles where all three elements are unselected must be preserved.
- Walking away from the pivot, the delta is divided equally across every consecutive pair of elements whose second
  element is selected; each such pair's yaw is mutated by one share. The divisor is the total number of such pairs.
- Joint angles where the last element, walking away from the pivot, is _NOT_ selected, may be mutated freely.
- A pivot inside the selection yields two spans, and each receives the *whole* angle divided by its own count of
  qualifying pairs — not half the angle each. Both spans turn in the same rotational sense rather than mirroring, so
  the two arms swing the same way about the pivot instead of opening like a pair of scissors. With the six elements
  above, `selected = [0,1,2,3,4]`, `pivot = 2` and a delta of `0.6`: each side has two qualifying pairs, so each pair
  takes `0.3`, and both far ends — elements `0` and `4` — come to rest `0.45` radians around the pivot, in the same
  direction.

#### Worked Example

- The distance `[3,4]` is free to change.
- All other neighbour-element distances are fixed.
- The qualifying pairs are `[0,1]`, `[1,2]` and `[2,3]` (each second element is selected), so the deviation at each is
  `inputDelta / 3`, i.e. `PI / 9`.
- Element `[1]` is rotated `PI/9` about the pivot.
- Joints `[[0,1,2],[1,2,3]]` are each rotated `PI / 9` radians, propagating local transforms to the other selected
  elements further from the pivot.
- Elements `[4,5]` are not translated.
- If the resulting pose is found to be invalid, the largest-acceptable-fraction search applies as much of the delta
  as it can. For each candidate fraction the deviation per pair is always that fraction of the delta divided by
  three, because there are three qualifying pairs to distribute it evenly across.

### Translate

- Translation applies the input delta, a vector, to the selected elements. For Rigid Assembly and Saturate
  Articulation the pivot plays no role in it — there it is a rotation-only concept. Spread Articulation is the
  exception: its falloff is measured from the pivot, so the pivot is the one selected element its translate never
  moves.
- Rigid Assembly translates the selection as a single rigid unit: every selected element receives the same offset. If
  the raw delta does not produce an acceptable pose, the algorithm applies the largest acceptable scale of the
  vector, in the same direction.
- Saturate Articulation translates the selection as a rigid unit for as long as it can, then drops elements from the
  ends of the selection as they bind.
  - The selection's boundary is whichever selected elements sit next to an inactive neighbour — unselected, or
    already stopped. An interior element has no boundary; a selection with no unselected neighbour on either side has
    no boundary at all and translates freely.
  - Moving the active elements as a rigid body can only disturb the link to each boundary's inactive neighbour and
    the joint angles at both ends of that link — everything else in the active set is unaffected. The step is clamped
    to the largest fraction of the remaining vector for which every boundary's link-distance and joint-angle bounds
    hold at once: it is the conjunction of all boundary predicates, not any one alone, that makes the clamp sound. A
    per-boundary minimum is not equivalent — a minimum-distance bound makes a boundary's validity non-monotone in the
    fraction, so one boundary's individually largest fraction can sit inside another's forbidden dip.
  - The cascade stops whichever boundary elements' predicates fail one clamp resolution past the accepted fraction —
    always at least one, since that fraction is the search's known-unacceptable upper bound — and the boundary moves
    inward to the stopped element's still-active neighbour. A defensive fallback stops the boundary with the smallest
    individually-permitted fraction, together with any boundary inside a tie window of it. That window is the
    world-distance epsilon re-expressed as a fraction of this step, `ARTICULATION_EPSILON / |stepVector|`, rather than
    an epsilon in fraction space, so it stays a fixed distance on canvas and does not widen with the length of the
    drag.
  - The remaining, unconsumed portion of the delta is then applied to whatever is still active, and the cycle repeats
    until either the vector is exhausted or every selected element has stopped. If every selected element stops
    first, the remainder is discarded, exactly as in Saturate Rotate.
  - `appliedFraction` is the consumed distance divided by the requested distance.
- Spread Articulation ramps the vector along the chain instead, then relaxes the bounded links the ramp sheared —
  described in its own section below.

#### Worked Example (Saturate Translate)

- Four elements at `x = 0, 1, 2, 3`; `selected = [1, 2, 3]`; the link `[0,1]` has a maximum distance of `2`.
- The drag is `+x` by `5`.
- Element `1` can travel only to just short of `x = 2` before that maximum binds (to within the search's `2^-12`
  resolution), so it stops there; elements `2` and `3` are still active.
- The link `[1,2]` becomes the new lower boundary for the remaining active elements.
- With nothing left to bind, elements `2` and `3` absorb the whole remainder of the drag, ending at `x = 7` and
  `x = 8`.

#### Spread Translate

- **The ramp — intent.** Element `e` is seeded at `origin(e) + delta · (arcLength(e) / arcLength(f))`, where `f` is
  the furthest element of `e`'s span and arc length is measured along the chain from the pivot, at the pose the drag
  started from: the sum of the link lengths walked from the pivot to reach the element. A physically nearer element
  therefore moves less however the chain is folded, and the furthest element of each span receives the whole vector.
  A pivot inside the selection mirrors Spread Rotate — two spans, each with its own furthest element and its own
  ramp. A span whose furthest element sits at zero arc length, the chain having collapsed onto coincident points, has
  no ramp to normalise by and stays where it is — and scores as vacuously complete in the report, since it requested
  nothing.
- **The relaxation — feasibility.** The ramp shears the links, so a fixed-count constraint projection restores those
  that carry bounds while preserving the ramp's intent; a link no endpoint constrains has nothing to project against
  and is left wherever the ramp put it. The **anchor set** — every unselected element and the pivot, and in future
  whatever a user-authored Freeze state adds to it — never moves. Each span is then swept a fixed number of times
  (sixteen) with FABRIK's two half-sweeps: backward from the far element pinned at its ramp target toward the
  anchored side, then forward from the anchor back out, projecting each link's length into the interval both of its
  endpoints' entries admit and each joint angle into its bound.
  - It is the forward sweep that makes the pose feasible: walking outward from an immovable anchor it settles every
    link in the span in turn, and a later placement never disturbs an earlier one. It is equally what lets an
    unreachable target pull the far element short of it — or a minimum bound push it past — which is the FABRIK
    behaviour the design wants: the span reaches toward the target and falls where it can.
  - **Every joint the span's motion can reach is projected, boundary joints included** — with one exception, set out
    below — and that is load-bearing rather than a refinement. An unprojected joint is not merely unhelped: its
    violation survives into the candidate pose, the whole-pose acceptance then refuses that pose, and so the first
    joint to saturate stops the entire armature instead of parking on its limit. Observed in play, and measured on a
    six-element chain spaced a hundred units apart, every joint bounded to thirty degrees and every link to between 20
    and 200 units, dragged from an unselected interior pivot with the selection running beyond it: the drag delivered
    its far element 120 units and not a unit more, however much harder it was dragged — every further fraction vetoed
    by the one joint next to the pivot. With that joint projected the same drag delivers the full 300, the near joint
    resting on its thirty degrees while the joints beyond it bend to make up the difference.
  - A joint is the sweep's to project when the arm behind it cannot move afterwards — either the sweep has already
    placed it, or it is an anchor. That covers the interior joints, the joint at the anchor itself (outer arm
    immovable), and the joint at the far element (outer arm the anchor just past the span). One boundary joint has no
    legal correction and stays with the acceptance predicate: the joint at that anchor beyond the span, whose only
    movable arm is the far element, since every turn of the far element that would settle it breaks a link the sweep
    has just settled. Forcing one anyway was measured to cost more than it bought — it swung the far element away
    from its target to buy a joint validity was already handling. The link beyond the far element likewise belongs to
    the acceptance predicate.
  - Where a sweep has collapsed a link onto a point there is no current direction to place its far endpoint along, so
    the projection falls back on that link's direction in the *base* pose, which lets a minimum bound push the two
    endpoints apart deterministically instead of down whichever axis floating point happened to leave them on. Where
    the base link is degenerate too there is no direction to be had, and the projection leaves the element alone.
  - The sweep order and the iteration count are fixed, nothing is random, and every pose is rebuilt from the pose the
    drag started from: `relax(ramp(t))` is deterministic and never cumulative, which is exactly what the fraction
    search requires of the poses it samples. It must also reproduce the base pose exactly at `t = 0`, which does not
    come for free here: the relaxation moves elements even at a zero delta, since an invalid start gives it violations
    to project away. The pose function therefore short-circuits an exactly-zero scaled vector to a copy of the base
    pose, so the candidate the search falls back on when nothing else is acceptable really is the pose the solve
    started from.
- **The selection — validity, then achievement.** `poseAt(t) = relax(ramp(t))` is evaluated across a fixed grid of
  fractions — the coarse samples of the shared search, then a finer raster either side of the coarse winner — and
  every candidate must satisfy the same whole-pose non-worsening predicate as every other strategy. That raster is ±8
  steps of `1 / (64 · 8)` about the coarse winner — seventeen fractions spanning exactly one coarse cell either side,
  at the `1/512` resolution named among the constants. One global `t` covers both spans; they do NOT clamp
  independently, which is load-bearing when the pivot joint carries an angle bound, since both spans tighten it
  jointly and only a whole-pose predicate honours that coupling.
  - Where this parts company with the other strategies is in **which acceptable candidate it takes: the most
    accommodating one, not the largest fraction**. Largest-valid only ever meant most-accommodating because validity
    was the limiter. Once boundary joints are projected almost every fraction is valid, and the fractions above the
    best one buy nothing: they hand the ramp a target the joint cones forbid, and the relaxation curls the span round
    to somewhere it can legally sit — measured on the same six-element, thirty-degree armature, a leftward drag of
    300 units put the far element 286 units the *other* way, while the same gesture at 225 units tracked the cursor
    exactly. The pose jumped five hundred units in the middle of a drag. Selecting on measured achievement removes
    that cliff and beats the largest-fraction behaviour in every direction tried.
  - Ties go to the larger fraction *within each scan*: every scan runs downward and only a strict improvement
    displaces the incumbent, so an unobstructed drag still takes the whole vector. Across the two passes the rule is
    the incumbent's — the coarse winner stands in the refinement, so a refined fraction that merely ties it loses to
    it even where it is the larger of the two. That costs nothing observable, since full achievement returns from the
    coarse pass before the refinement runs at all. Standing still is always among the candidates, so the search cannot
    come away with less than the pose it started from — a drag the joint cones forbid outright returns the unchanged
    pose, not a curl. The whole search is an argmax over a fixed grid: no randomness, no assumption that achievement
    is smooth or single-peaked between samples, and the same answer every time.
- **The pivot joint.** Where the selection straddles the pivot there are two spans, and the joint at the pivot is the
  one joint both contend for, so no sweep may claim it: each span's motion opens it, and whichever span went last
  would otherwise take the whole cone. It is split instead — once the iterations are done, any excess bend is undone
  by turning each span rigidly about the pivot through half of it, in opposite senses. Rigid rotation about the pivot
  preserves every link the sweeps just settled and every distance to the pivot, so the correction costs the spans
  nothing but their share of the bend, and the outcome does not depend on which span was relaxed first. It is applied
  after the iterations rather than inside them because each iteration re-pins the far elements at their ramp targets,
  which would undo the share of whichever span is nothing but its far element and quietly skew the split.
  - The split runs only for a straddling selection. With a single span there is nothing to contend for: the pivot is
    simply that span's anchor, and its joint is projected by the forward sweep under the ordinary anchor rule — that
    is exactly the joint next to the pivot in the thirty-degree measurement above, and the reason projecting it lets
    the armature park on its limit instead of stopping there.
- **The report.** `appliedFraction` is *measured*, not a fraction handed down by the search: the mean across spans of
  the furthest element's displacement resolved along the drag direction, over the drag's magnitude, read off the pose
  being returned — the same quantity the selection above maximised, snapped to exactly `1` within epsilon so a free
  drag never reads as clamped. Each span's achievement is clamped into `[0, 1]` before the mean is taken; the floor
  at `0` is what stops a span the relaxation curled the wrong way round from reporting a negative fraction and
  dragging the mean below what the other span honestly achieved. Measurement and search would part company whenever
  the relaxation absorbs a shortfall validity is content with: every fraction of an out-of-reach drag relaxes to a
  perfectly valid pose, so a fraction would report the whole delta applied while the far element sat a third of the
  way to the cursor. The badge follows the element, not the search.
- Because the projection repairs the links inside a span, Spread Translate is the one strategy whose drag actively
  pulls a violated link back to its bound as it passes. Anything outside the swept spans is governed by the usual
  rule, and only ever gets no worse.
- A selection of nothing but the pivot is entirely anchor, so Spread Translate returns the identity — where Rigid
  Assembly and Saturate Articulation would translate that single element.

##### Worked Example

- The six elements at `y = 0..5`, `selected = [1, 2, 3]`, `pivot = 0`, and an input delta of `+x` by `9`.
- Arc lengths from the pivot are `1`, `2` and `3`, so the ramp weights are `1/3`, `2/3` and `1`: elements `1`, `2`
  and `3` are seeded at `x = 3`, `6` and `9`. The pivot and elements `4` and `5` do not move. With nothing
  constrained the relaxation is a no-op and that seeded pose is the answer, at `appliedFraction = 1`.
- Now give the links `[0,1]`, `[1,2]` and `[2,3]` a maximum distance of `1`, their starting length. Element `3` can
  never leave the circle of radius `3` about the anchored pivot, and its seeded target at `(9, 3)` is far outside it,
  so the relaxation straightens the three links toward that target and element `3` comes to rest on the circle,
  around `(2.85, 0.95)`. The pose is acceptable at every fraction, so nothing is discarded — but the far element
  travelled `2.85` of the `9` it was asked for, and `appliedFraction` is that `0.32`, not `1`.
- Add a maximum distance to the link `[3,4]` and the drag has something outside the span to answer for as well: that
  link is no part of any sweep, so the acceptance predicate holds it too, and the fraction reported is the far
  element's achievement under both limits at once.

## Reporting: selection clamp and element clamp

- A **selection clamp** is the solve not delivering the whole input delta: `appliedFraction < 1`. The badge is its
  only indicator, and it fires on `appliedFraction < 1 - 1e-6` rather than on a bare `< 1`, so the floating-point
  noise a *measured* fraction carries cannot light it after a drag that was in fact fully absorbed. For most
  strategies that means delta discarded by the search; for Spread Translate it also covers a span that reached toward
  its target and fell short, since there the fraction is measured off the far element rather than taken from the
  search. Every solve also reports `appliedStrategyId` — the strategy that actually ran, which is
  Rigid Assembly whenever the solver substituted it.
- An **element clamp** is an individual element sitting at one of its constraint bounds. `clampedElementIndices`
  lists the selected elements in that state, in ascending index order.
- The set is measured once, by the solver, off whatever pose the strategy returned — identically for every strategy
  and for identity results. It is a property of the pose, not a history of the solve, so the strategies collect
  nothing.
- One uniform rule: a constraint sitting at one of its limits marks every selected element that participates in it. A
  link's distance bound (declared by whichever endpoint's constraint entry) marks both of its endpoints. A joint
  angle bound at element `j` marks `j - 1`, `j` and `j + 1` — the three elements whose positions form the angle — so
  a joint bound owned by an *unselected* element still names the selected elements pressing against it, which is the
  common case for a drag blocked at the edge of its selection. Because only selected elements move, the binding
  constraint of a clamped drag has a selected participant *whenever the base pose was valid*: from a valid base, a
  selection clamp can never report an empty element set. From an already-violated base the guarantee lapses, and
  deliberately so — there the limiter is the non-worsening rule rather than a bound, so the constraint that stopped
  the drag can be sitting far outside its tolerance window rather than resting at it, nothing is measured as
  at-bound, and the set can come back empty while the badge is lit.
- "At" is measured from either side of the limit, so an element resting just inside a bound and one pushed just
  outside it by an invalid starting pose both count. A clamped solve stops up to one search resolution short of the
  true edge, which a bare epsilon would miss, so the tolerance is a fixed world-space one — a presentation concern,
  supplied per solve with defaults of `0.5` world units and `0.005` radians, so a zoomable canvas can keep the
  rendered epsilon visually constant. The dashboard supplies nothing today and takes those defaults; the per-solve
  parameter is there for the zoom case rather than because anything currently varies it. From a *valid* base pose,
  and with distance tolerance τ, the binding constraint of a clamped drag is provably within τ for any translation
  step up to `τ / CLAMP_RESOLUTION` — the envelope is about a bound the drag came to rest against, so it lapses along
  with the previous bullet's guarantee whenever the base was already violated. The angle envelope additionally depends
  on the delta kind: for a translation step of magnitude `s` one resolution of it turns a joint by roughly
  `s / (4096 · linkLength)` radians, whereas for a rotation delta `θ` one resolution turns each joint by `θ / 4096`,
  with no link length in it at all. At demo scale both are orders of magnitude inside the default tolerance. Spread
  Translate's achievement grid samples at `1/512` rather than `2^-12`, so its validity-limited stops can sit one
  `1/512` step shy of the search's — still far inside the tolerance; bounds its own relaxation parks land exactly on
  their limits.
- The canvas rule is simply: red means element-clamped, for as long as a drag is live. A fully absorbed drag can
  still show elements resting on bounds; a selection-clamped rigid drag shows the binding element rather than the
  whole body; an unconstrained drag shows nothing. A pivot inside the selection is excluded from a saturate
  rotation's spans and from spread's spans, but it is still measured like any other selected element, so it can be
  reported. Saturate Translate has no pivot concept at all — there a selected pivot simply translates with the rest of
  the selection.

## Porting Notes

The invariants a port must preserve, independent of language or paradigm:

- **Separation of duties.** The solver owns input sanitisation, dispatch (including every fallback in "Dispatch and
  degenerate inputs"), and the post-solve element-clamp measurement. Strategies are pure interpreters: pose in, pose
  and fraction out. Nothing about a solve is stateful: the caller is what holds the gesture's origin pose, and passes
  it in on every pointer move, so the solver has nothing to remember between solves. That is what makes violations
  monotone within a gesture and results independent of event timing.
- **Determinism.** Every search and every relaxation runs a fixed schedule — fixed grids, fixed iteration counts,
  fixed sweep orders, no randomness, no convergence-dependent early exits that change results. Identical inputs must
  produce bit-identical poses. Candidate poses are always derived from the cached base pose and a fraction; never
  from one another.
- **The acceptance predicate** is shared by every strategy: no constraint's violation may exceed its base-pose
  violation plus epsilon. For a valid base this coincides with plain validity; for an invalid base it is what permits
  recovery. Saturate's cascade applies it per iteration against that iteration's base; everything else applies it
  whole-pose against the gesture origin.
- **Anchors never move.** Unselected elements, the pivot under spread, and the pinned elements of any future Freeze
  state are bit-immobile through every strategy, sweep, and correction.
- **Named constants**, all part of the design: epsilon `1e-6`; coarse search samples `64`; refinement depth `6`
  (resolution `2^-12`); spread relaxation iterations `16`; spread refinement samples `8` either side of the coarse
  winner, giving the achievement raster of `1 / (64 · 8)` = `1/512`; element-clamp tolerance defaults `0.5` units /
  `0.005` radians.
- **Report semantics.** `appliedFraction` means: scale factor for Rigid (both kinds) and Spread Rotate; consumed over
  requested for Saturate (mean across two spans for an interior-pivot rotation); measured far-element achievement,
  mean across spans, for Spread Translate. The one seam is Spread Translate with an out-of-range pivot: it degrades to
  rigid-unit translation, so the fraction reported there is a rigid scale factor rather than a measured achievement,
  while `appliedStrategyId` still reads `spread`. `appliedStrategyId` names what ran. `clampedElementIndices` is the
  at-bound participant measurement above. Honest reporting is a design goal in itself: the UI must never imply the
  solver did something it did not.
