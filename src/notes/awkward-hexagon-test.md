# Awkward Hexagon Test

In `awkward-hexagon.test.ts` there is a particularly problematic polygon. According to my manual working out of the
algorithm (as I understand it ought to function) the following conditions ought to test true:

1. 6 exterior nodes.
2. 6 exterior edges.
3. 6 initial interior edges.
4. The first accepted intersection event, called a `Collision` should accept edges [10, 11] leading to exterior edge [4]
   getting accepted.
5. One interior node added. One interior edge added, with [5,3] as parents (clockwise, widdershins).
6. Second `Collison` accepts edges [9, 12], creating edge [13] with [5, 2] as parents.
7. Third `Collision` accepts edges [13, 6] creating edge [14] with [0,2] as parents.
8. Fourth and final `Collision` accepts [14,7,8] and finalizes the straight skeleton.

## Hypothesis

This sequence is *not* the outcome produced by the current code implementation. At least one bug still present is that when the
ordering of `collisions` results in the skeleton proceeded into a narrowing region, the secondary interior edges are
bisected pointing in the wrong direction. The algorithm proceeds under the assumption that secondary interior edges
point *outwards* from non-reflex vertices, but when the ordering walks *into* such a region, the basis vector needs to
point *towards* the implicit vertex belonging to the parent exterior edges - a vertex that does exist but is implied by
the bisection of the parents.

## Task

1. Write a test in `awkward-hexagon.test.ts` that like the default pentagon steps through the algorithm, verifying the expected conditions I've outline above.
2. Run the test, to confirm it currently fails.
3. Propose how to fix the algorithm so the test passes, likely by addressing the faulty assumption given above.