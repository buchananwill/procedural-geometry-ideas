# Articulation Constraint Solver

The purpose of this module is to allow exploration of constraint solving on a series of connected elements, by treating
them as articulation points in a linkage. The constraints will vary: both element separation and joint angle can be free
or constrained.

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

### Data For Worked Examples

```javascript
const elements = [
    {x: 0, y: 0},
    {x: 0, y: 1},
    {x: 0, y: 2},
    {x: 0, y: 3},
    {x: 0, y: 4},
    {x: 0, y: 5},
]

const selected = [1, 2, 3]

const pivot = 0

const inputDelta = PI_OVER_THREE
```

### Rigid Rotation

- Distances between selected elements must be preserved by the transformation.
- The distance from the pivot to each selected element must be preserved
- Internal joint angles of selected elements must be preserved by the transformation.
- Joints that include at least one non-selected element are permitted to change angle.
- Distances between an unselected element and a selected element are permitted to change.
- Distances between any pair of unselected elements are not permitted to change.
- Joint angles where all three elements are unselected are not permitted to change.
- Rotations transform the locations of the selected elements by using the local space of the pivot, and the input delta
  for angle.

#### Worked Example

- The distance`[3,4]` is free to change.
- The distance `[0,1]` is _not_ free to change, because this is a pivot-to-element distance.
- The joint angles `[[0,1,2], [2,3,4], [3,4,5]` are free to change
- All other joint angles and element spacings must be unmutated.

### Spread Articulation

- Distances between selected elements must be preserved.
- Distances between unselected elements must be preserved.
- Walking from the pivot towards the selection, the distance between the last unselected element (may or may not be the pivot itself) and first selected element must be preserved.
- Other distances when one element is selected, and one unselected, may change freely.
- Joint angles where all three elements are unselected must be preserved.
- All joints formed where the last element, walking away from the pivot, is selected, must be mutated by an equal division of the delta, where the divisor is the total number of such joints.  
- Joint angles where the last element, walking away from the pivot, is _NOT_ selected, may be mutated freely.

#### Worked Example

- The distance `[3,4]` is free to change.
- All other neighbour-element distances are fixed.
- The pivot is the first element, so although only two selected joints are spanned, the deviation at each is `inputDelta / 3`, i.e. `PI / 9`.
- Element `[1]` is rotated `PI/9` about the pivot.
- Joints `[[0,1,2],[1,2,3]]` are each rotated `PI / 9` radians, propagated local transforms to the other selected elements further from the pivot.
- Elements `[4,5]` are not translated.
- If the resulting pose is found to be invalid, then a search is carried out to find the largest input delta that is valid, e.g. bisection to a depth of 8.
- For each `candidate_delta`, the deviation per "joint" is always `candidate_delta / 3`, because there are three places to distribute that delta evenly. 

### Saturate Articulation

- The distance between the pivot, and the closest selected element by walking along the array towards the selection, must be preserved.
- The distances between unselected elements must be preserved.
- The distances between a selected element and an unselected, non-pivot element, are free to change.
- The distances between selected elements must be preserved.
- All selected elements are ordered by ascending index distance from the pivot element.
- The input delta is applied to the first selected element, by rotating it around the pivot element until the element's constraints do not permit it to move further.
- The other selected elements received the same rotation and translation in the pivot space, as it performed by the Rigid Rotation algorithm.
- If this results in surplus input delta, the algorithm recurses to the 