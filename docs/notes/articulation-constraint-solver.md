# Articulation Constraint Solver

The purpose of this module is to allow exploration of constraint solving on a series of connected elements, by treating
them as articulation points in a linkage. The constraints will vary: both element separation and joint angle can be free
or constrained.

Two priorities govern every solving strategy, in order: the solver must never produce an invalid pose, and within that
limit it must accommodate the user's input delta as closely as possible. From a valid pose the solver must never
produce an invalid one; from an invalid pose — which constraint edits under an existing pose can always create — it
must never worsen any constraint's violation, and must permit deltas that reduce them, so the user can drag the chain
back toward validity. Validity is a property of poses, never of paths — the user is searching a constrained space for
a visually pleasing arrangement, not simulating physical motion. "Tunnelling" through regions of invalid pose space to
reach a valid pose is therefore desirable behaviour, not a defect, and no strategy should trade accommodation away to
preserve continuity of motion.

"Valid" and "never worsen" are both read to the solver's epsilon tolerance: every bound has always admitted an
epsilon margin, and the non-worsening rule likewise permits growth of up to epsilon per solve (per cascade iteration
for saturate). A pose riding exactly on a bound can therefore drift within that tolerance class across repeated
gestures — accepted deliberately, since epsilon is orders of magnitude below anything visible on canvas and capping it
exactly would trade floating-point robustness for no observable behaviour.

Three modes of constraint satisfaction will initially be offered:

1. Rigid Assembly
2. Spread Articulation
3. Saturate Articulation

These need to be implemented using a polymorphic Strategy Pattern, so that it is straightforward to add other resolution
algorithms later.

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
2. Constraint parameter: min/max distance from previous/next element
3. Constraint parameter:: min/max joint angle at element
4. Angle and distance constraints are disabled (unconstrained) by default for all elements.
5. Affordances to copy constraint struct for an element, and pasting constraint struct from clipboard. Allows easy
   duplication across elements.

## Constraint Algorithms

- All transforms attempt to act on all selected elements.
- The constraint solving algorithms determine how a given input delta is interpreted into a new pose for the selected
  elements.
- The pose implied by a given input delta is different for each algorithm.
- The definition of "valid pose" is shared across all algorithmic interpretations. I.e. a pose invalid in one algorithm
  is invalid in all algorithms. It is a property of the elements' constraint data.
- Where an attribute (i.e. distance/angle) is described as "able to change freely", this does NOT imply that any value
  is valid: it means the algorithm is permitted to mutate it to produce a pose from the input delta.
- The solver must cache the pre-delta pose, and if the raw input delta cannot be interpreted into a valid pose, the
  algorithm must apply the largest delta in the same direction that results in a valid new pose, given the original
  pose.
- The three algorithm sections below (Rigid Assembly, Spread Articulation, Saturate Articulation) describe rotation;
  their pivot-preservation bullets are rotation-only invariants. Translation, common to all three, is described
  afterwards in its own section.

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
- The distance from the pivot to each selected element must be preserved
- Internal joint angles of selected elements must be preserved by the transformation.
- Joints that include at least one non-selected element and one selected element are permitted to change angle.
- Distances between an unselected element that is not the pivot, and a selected element, are permitted to change.
- Distances between any pair of unselected elements are not permitted to change.
- Joint angles where all three elements are unselected are not permitted to change.
- Rotations transform the locations of the selected elements by using the local space of the pivot, and the input delta
  for angle.

#### Worked Example

- The distance`[3,4]` is free to change.
- The distance `[0,1]` is _not_ free to change, because this is a pivot-to-element distance.
- The joint angles `[[2,3,4], [3,4,5]` are free to change
- All other joint angles and element spacings must be unmutated.

### Spread Articulation

- Distances between selected elements must be preserved.
- Distances between unselected elements must be preserved.
- Walking from the pivot towards the selection, the distance between the last unselected element (may or may not be the
  pivot itself) and first selected element must be preserved.
- Other distances when one element is selected, and one unselected, may change freely.
- Joint angles where all three elements are unselected must be preserved.
- Walking away from the pivot, the delta is divided equally across every consecutive pair of elements whose second
  element is selected; each such pair's yaw is mutated by one share. The divisor is the total number of such pairs.
- Joint angles where the last element, walking away from the pivot, is _NOT_ selected, may be mutated freely.

#### Worked Example

- The distance `[3,4]` is free to change.
- All other neighbour-element distances are fixed.
- The qualifying pairs are `[0,1]`, `[1,2]` and `[2,3]` (each second element is selected), so the deviation at each is
  `inputDelta / 3`, i.e. `PI / 9`.
- Element `[1]` is rotated `PI/9` about the pivot.
- Joints `[[0,1,2],[1,2,3]]` are each rotated `PI / 9` radians, propagated local transforms to the other selected
  elements further from the pivot.
- Elements `[4,5]` are not translated.
- If the resulting pose is found to be invalid, then a search is carried out to find the largest input delta that is
  valid: a descending coarse scan of 64 even steps, then bisection refinement of the accepted step down to a resolution
  of `2^-12` of the delta.
- For each `candidate_delta`, the deviation per pair is always `candidate_delta / 3`, because there are three
  qualifying pairs to distribute that delta evenly across.

### Saturate Articulation

- The distance between the pivot, and the closest selected element by walking along the array towards the selection,
  must be preserved.
- The distances between unselected elements must be preserved.
- The distances between a selected element and an unselected, non-pivot element, are free to change.
- The distances between selected elements must be preserved.
- All selected elements are ordered by ascending index distance from the pivot element.
- The input delta is applied to the first selected element, by rotating it around the pivot element until the element's
  constraints do not permit it to move further.
- The other selected elements received the same rotation and translation in the pivot space, as it performed by the
  Rigid Assembly algorithm.
- If this results in surplus input delta, the algorithm recurses, using the now-saturated element as the new pivot, and
  transforming the remaining selected elements.
- If all selected elements are saturated (no further delta can be applied to any without resulting in an invalid pose)
  then the remaining delta is discarded.

#### Worked Example

```javascript
selected = [2,3,4];
let maxJointAngle = { elements: [0,1,2], limit: PI_OVER_NINE};
```

- The initial rotation will translate `selected` around a pivot at element `[0]`
- The joint formed by elements `[0,1,2]` will saturate before the full input delta is applied.
- The remaining portion of the input delta will be applied by translating and rotating `[3,4]` around `[2]` as a pivot.

### Translate

- Translation applies the input delta, a vector, to the selected elements. For Rigid Assembly and Saturate
  Articulation the pivot plays no role in it — there it is a rotation-only concept. Spread Articulation is the
  exception: its falloff is measured from the pivot, so the pivot is the one selected element its translate never
  moves.
- Rigid Assembly translates the selection as a single rigid unit: every selected element receives the same offset. If
  the raw delta does not produce a valid pose, the algorithm clamps to the largest scale of the vector, in the same
  direction, that does.
- Spread Articulation ramps the vector along the chain instead, then relaxes the links the ramp sheared — described
  in its own section below.
- Saturate Articulation translates the selection as a rigid unit for as long as it can, then drops elements from the
  ends of the selection as they bind. A discontiguous selection never reaches this cascade: the solver dispatches it
  to Rigid Assembly, for every delta kind.
  - The selection's boundary is whichever selected elements sit next to an inactive neighbour — unselected, or
    already stopped. An interior element has no boundary; a selection with no unselected neighbour on either side has
    no boundary at all and translates freely.
  - Moving the active elements as a rigid body can only disturb the link to each boundary's inactive neighbour and the
    joint angles at both ends of that link — everything else in the active set is unaffected. The step is clamped to
    the largest fraction of the remaining vector for which every boundary's link-distance and joint-angle bounds hold
    at once: it is the conjunction of all boundary predicates, not any one alone, that makes the clamp valid.
  - The cascade stops whichever boundary elements' predicates fail one clamp resolution past the accepted fraction — always at
    least one, since that fraction is the clamp's known-invalid upper bound — and the boundary moves inward to the
    stopped element's still-active neighbour. A defensive fallback stops the boundary, or boundaries on an
    ε-tie, with the smallest individually-permitted fraction.
  - The remaining, unconsumed portion of the delta is then applied to whatever is still active, and the cycle repeats
    until either the vector is exhausted or every selected element has stopped.
  - If every selected element stops before the vector is exhausted, the remaining delta is discarded, exactly as in
    Saturate Rotate.
  - `appliedFraction` for Saturate Translate is the consumed distance divided by the requested distance, the same
    convention as Saturate Rotate (whose own fraction is the mean of the per-span fractions when the pivot lies inside
    the selection).

#### Worked Example (Saturate Translate)

- Four elements at `x = 0, 1, 2, 3`; `selected = [1, 2, 3]`; the link `[0,1]` has a maximum distance of `2`.
- The drag is `+x` by `5`.
- Element `1` can travel only to just short of `x = 2` before that maximum binds (the clamp is found by the
  coarse-scan-then-refine search, to `2^-12` of the drag), so
  it stops there; elements `2` and `3` are still active.
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
  no ramp to normalise by and stays where it is.
- **The relaxation — feasibility.** The ramp shears the links, so a fixed-count constraint projection restores them
  while preserving the ramp's intent. The **anchor set** — every unselected element and the pivot, and in future
  whatever the user-authored Freeze state adds to it — never moves. Each span is then swept
  `SPREAD_RELAXATION_ITERATIONS` (16) times with FABRIK's two half-sweeps: backward from the far element pinned at
  its ramp target toward the anchored side, then forward from the anchor back out, projecting each link's length into
  the interval both of its endpoints' entries admit and each joint angle into its bound.
  - It is the forward sweep that makes the pose feasible: walking outward from an immovable anchor it settles every
    link in the span in turn, and a later placement never disturbs an earlier one. It is equally what lets an
    unreachable target pull the far element short of it — or a minimum bound push it past — which is the FABRIK
    behaviour the design wants: the span reaches toward the target and falls where it can.
  - **Every joint the span's motion can reach is projected, boundary joints included**, and that is load-bearing
    rather than a refinement. An unprojected joint is not merely unhelped: its violation survives into the candidate
    pose, the whole-pose clamp then refuses that pose, and so the first joint to saturate stops the entire armature
    instead of parking on its limit. Observed in play, and measured: a chain whose joints are bounded to thirty
    degrees, dragged from an unselected interior pivot, delivered its far element 120 units and not a unit more,
    however much harder it was dragged — every further fraction vetoed by the one joint next to the pivot. With that
    joint projected the same drag delivers the full 300, the near joint resting on its thirty degrees while the
    joints beyond it bend to make up the difference.
  - A joint is the sweep's to project when the arm behind it cannot move afterwards — either the sweep has already
    placed it, or it is an anchor. That covers the interior joints, the joint at the anchor itself (outer arm
    immovable), and the joint at the far element (outer arm the anchor just past the span). One boundary joint has no
    legal correction and stays with the clamp: the joint at that anchor beyond the span, whose only movable arm is
    the far element, since every turn of the far element that would settle it breaks a link the sweep has just
    settled. Forcing one anyway was measured to cost more than it bought — it swung the far element away from its
    target to buy a joint the clamp was already handling.
  - The link beyond the far element likewise belongs to the clamp.
  - The sweep order and the iteration count are fixed, nothing is random, and every pose is rebuilt from the pose the
    drag started from: `relax(ramp(t))` is deterministic and never cumulative, which is exactly what the clamp search
    requires of the poses it samples.
- **The clamp — validity, then achievement.** `poseAt(t) = relax(ramp(t))` is evaluated across the same fixed grid of
  fractions the largest-valid-delta search scans, and every candidate must satisfy the same whole-pose non-worsening
  predicate as every other strategy. One global `t` covers both spans; they do NOT clamp independently, which is
  load-bearing when the pivot joint carries an angle bound, since both spans tighten it jointly and only a whole-pose
  predicate honours that coupling.
  - Where this parts company with the other strategies is in **which valid candidate it takes: the most accommodating
    one, not the largest fraction**. Largest-valid only ever meant most-accommodating because validity was the
    limiter. Once boundary joints are projected almost every fraction is valid, and the fractions above the best one
    buy nothing: they hand the ramp a target the joint cones forbid, and the relaxation curls the span round to
    somewhere it can legally sit — measured on a thirty-degree armature, a leftward drag of 300 units put the far
    element 286 units the *other* way, while the same gesture at 225 units tracked the cursor exactly. The pose
    jumped five hundred units in the middle of a drag. Selecting on measured achievement removes that cliff and beats
    the old behaviour in every direction tried.
  - Ties go to the larger fraction, so an unobstructed drag still takes the whole vector. A finer pass across the
    bracket either side of the coarse winner keeps that winner as its incumbent, so it can only improve on it. The
    whole search is an argmax over a fixed grid: no randomness, no assumption that achievement is smooth or
    single-peaked between samples, and the same answer every time.
- **The pivot joint** is the one joint two spans contend for, so no sweep may claim it: each span's motion opens it,
  and whichever span went last would otherwise take the whole cone. It is split instead — once the iterations are
  done, any excess bend is undone by turning each span rigidly about the pivot through half of it, in opposite
  senses. Rigid rotation about the pivot preserves every link the sweeps just settled and every distance to the
  pivot, so the correction costs the spans nothing but their share of the bend, and the outcome does not depend on
  which span was relaxed first. It is applied after the iterations rather than inside them because each iteration
  re-pins the far elements at their ramp targets, which would undo the share of whichever span is nothing but its
  far element and quietly skew the split.
- **The report.** `appliedFraction` is *measured*, not a fraction handed down by the search: the mean across spans of
  the furthest element's displacement resolved along the drag direction, over the drag's magnitude, read off the pose
  being returned — the same quantity the selection above maximised. The two would part company whenever the
  relaxation absorbs a shortfall validity is content with: every fraction of an out-of-reach drag relaxes to a
  perfectly valid pose, so a fraction would report the whole delta applied while the far element sat a third of the
  way to the cursor. The badge follows the element, not the search.
- Because the projection repairs the links inside a span, Spread Translate is the one strategy whose drag actively
  pulls a violated link back to its bound as it passes. Anything outside the swept spans is governed by the usual
  rule, and only ever gets no worse.
- A selection of nothing but the pivot is entirely anchor, so Spread Translate returns the identity — where Rigid
  Assembly and Saturate Articulation would translate that single element. A discontiguous selection falls back to
  Rigid Assembly at dispatch, as for every delta kind.

##### Worked Example

- The six elements at `y = 0..5`, `selected = [1, 2, 3]`, `pivot = 0`, and an input delta of `+x` by `9`.
- Arc lengths from the pivot are `1`, `2` and `3`, so the ramp weights are `1/3`, `2/3` and `1`: elements `1`, `2`
  and `3` are seeded at `x = 3`, `6` and `9`. The pivot and elements `4` and `5` do not move. With nothing
  constrained the relaxation is a no-op and that seeded pose is the answer, at `appliedFraction = 1`.
- Now give the links `[0,1]`, `[1,2]` and `[2,3]` a maximum distance of `1`, their starting length. Element `3` can
  never leave the circle of radius `3` about the anchored pivot, and its seeded target at `(9, 3)` is far outside it,
  so the relaxation straightens the three links toward that target and element `3` comes to rest on the circle,
  around `(2.85, 0.95)`. The pose is valid at every fraction, so the clamp discards nothing — but the far element
  travelled `2.85` of the `9` it was asked for, and `appliedFraction` is that `0.32`, not `1`.
- Add a maximum distance to the link `[3,4]` and the drag has something outside the span to answer for as well: that
  link is no part of any sweep, so the clamp holds it too, and the fraction reported is the far element's achievement
  under both limits at once.

## Reporting: selection clamp and element clamp

- A **selection clamp** is the solve not delivering the whole input delta: `appliedFraction < 1`. The badge is its
  only indicator. For most strategies that means delta discarded by the clamp; for Spread Translate it also covers a
  span that reached toward its target and fell short, since there the fraction is measured off the far element rather
  than taken from the clamp. Every solve also reports `appliedStrategyId` — the strategy that actually ran, which is Rigid Assembly
  whenever the solver substituted it.
- An **element clamp** is an individual element sitting at one of its constraint bounds. `clampedElementIndices` lists
  the selected elements in that state, in ascending index order.
- The set is measured once, by `solveArticulation`, off whatever pose the strategy returned — identically for rigid,
  spread, saturate, and identity results. It is a property of the pose, not a history of the solve, so the strategies
  collect nothing.
- One uniform rule: a constraint sitting at one of its limits marks every selected element that participates in it. A
  link's distance bound (declared by whichever endpoint's constraint entry) marks both of its endpoints. A joint angle
  bound at element `j` marks `j - 1`, `j` and `j + 1` — the three elements whose positions form the angle — so a joint
  bound owned by an *unselected* element still names the selected elements pressing against it, which is the common
  case for a drag blocked at the edge of its selection.
- "At" is measured from either side of the limit, so an element resting just inside a bound and one pushed just
  outside it by an invalid starting pose both count. A clamped solve stops up to one clamp resolution short of the
  true edge, which a bare ε would miss, so the tolerance is a fixed world-space one: `SolveInput`'s optional
  `elementClampTolerance`, defaulting to `DEFAULT_ELEMENT_CLAMP_TOLERANCE` (`0.5` world units, `0.005` radians). With
  distance tolerance τ the binding constraint of a clamped drag is provably within τ for any step up to
  `τ / CLAMP_RESOLUTION`. The angle envelope additionally depends on link length, since one clamp resolution of a step
  turns a joint by roughly `stepMagnitude / (4096 · linkLength)` radians; at demo scale — links of order tens of units
  against drags of the same order — that is orders of magnitude inside the default `0.005` rad tolerance, and only
  sub-unit links paired with very long drags could approach it.
- The canvas rule is simply: red means element-clamped, for as long as a drag is live. A fully absorbed drag can still
  show elements resting on bounds; a selection-clamped rigid drag shows the binding element rather than the whole
  body; an unconstrained drag shows nothing. A pivot inside a saturate selection is excluded from both spans but is
  still measured like any other selected element, so it can be reported.
