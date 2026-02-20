# Testing A Pentagon Straight Skeleton

**Outcome**: A series of unit tests that step through creating a straight skeleton from the PENTAGON polygon vertices in
the `algorithm.test.ts` file.

Read the implementation of `computeStraightSkeleton` in `algorithm.ts`. You can also see in `algorithm.test.ts` the
first few of steps are already tested. Continue this process, explicitly stepping through the process that should
compute a straight skeleton from the supplied constant array of `Vector2`.

The following distinct results are expected:

1. Interior edges 5, 6 and 9 are accepted in the first `heap.pop()` call.
2. Exterior edges 0 and 4 are accepted.
3. Edge id:10 is pushed.
4. Interior edges 7, 10 and 8 are accepted in the second `heap.pop()` call.
5. Exterior edges 1, 2 and 3 are accepted.
6. All exterior edges have node been accepted and no new interior edges are pushed.
7. The function `graphIsComplete` returns true.

Construct the tests so that each of the listed results can be verified, and any bugs can be isolated to particular stages of the process.