# Articulation Constraint Solver

The purpose of this module is to allow exploration of constraint solving on a series of connected elements, by treating
them as articulation points in a linkage. The constraints will vary: both element separation and joint angle can be free
or constrained.

Two priorities govern every solving strategy, in order: the solver must never produce an invalid pose, and within that
limit it must accommodate the user's input delta as closely as possible. Validity is a property of poses, never of
paths — the user is searching a constrained space for a visually pleasing arrangement, not simulating physical motion.
"Tunnelling" through regions of invalid pose space to reach a valid pose is therefore desirable behaviour, not a
defect, and no strategy should trade accommodation away to preserve continuity of motion.

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

- Translation applies the input delta, a vector, to every selected element. The pivot plays no role in translation
  for any of the three algorithms — it is a rotation-only concept.
- Rigid Assembly and Spread Articulation translate the selection as a single rigid unit: every selected element
  receives the same offset. If the raw delta does not produce a valid pose, the algorithm clamps to the largest scale
  of the vector, in the same direction, that does. Spread Articulation defines no distinct translate semantics; it
  delegates to the same rigid-unit behaviour.
- Saturate Articulation translates the selection as a rigid unit for as long as it can, then peels elements off the
  ends of the selection as they bind. A discontiguous selection never reaches this cascade: the solver dispatches it
  to Rigid Assembly, for every delta kind.
  - The selection's boundary is whichever selected elements sit next to an inactive neighbour — unselected, or
    already frozen. An interior element has no boundary; a selection with no unselected neighbour on either side has
    no boundary at all and translates freely.
  - Moving the active elements as a rigid body can only disturb the link to each boundary's inactive neighbour and the
    joint angles at both ends of that link — everything else in the active set is unaffected. The step is clamped to
    the largest fraction of the remaining vector for which every boundary's link-distance and joint-angle bounds hold
    at once: it is the conjunction of all boundary predicates, not any one alone, that makes the clamp valid.
  - The cascade freezes whichever boundary elements' predicates fail one clamp resolution past the accepted fraction — always at
    least one, since that fraction is the clamp's known-invalid upper bound — and the boundary moves inward to the
    newly-frozen element's still-active neighbour. A defensive fallback freezes the boundary, or boundaries on an
    ε-tie, with the smallest individually-permitted fraction.
  - The remaining, unconsumed portion of the delta is then applied to whatever is still active, and the cycle repeats
    until either the vector is exhausted or every selected element has frozen.
  - If every selected element freezes before the vector is exhausted, the remaining delta is discarded, exactly as in
    Saturate Rotate.
  - `appliedFraction` for Saturate Translate is the consumed distance divided by the requested distance, the same
    convention as Saturate Rotate (whose own fraction is the mean of the per-span fractions when the pivot lies inside
    the selection).

#### Worked Example

- Four elements at `x = 0, 1, 2, 3`; `selected = [1, 2, 3]`; the link `[0,1]` has a maximum distance of `2`.
- The drag is `+x` by `5`.
- Element `1` can travel only to just short of `x = 2` before that maximum binds (the clamp is found by the
  coarse-scan-then-refine search, to `2^-12` of the drag), so
  it freezes there; elements `2` and `3` are still active.
- The link `[1,2]` becomes the new lower boundary for the remaining active elements.
- With nothing left to bind, elements `2` and `3` absorb the whole remainder of the drag, ending at `x = 7` and
  `x = 8`.
