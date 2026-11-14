---
title: "Skeleton: an exterior edge is accepted before its face closes"
type: issue
area: straight-skeleton
status: open
date: 2026-11-14
---

# Skeleton: an exterior edge is accepted before its face closes

Found by part A of the [wavefront-order spec](./skeleton-wavefront-order-decisions.md) (BSA.F95, BSA.D290; spec
decision 32). The red test is
[wavefront-order-early-acceptance.test.ts](../../packages/core/tests/straight-skeleton/wavefront-order-early-acceptance.test.ts).

## Reproduction

Each case is solved with `solveSkeleton` and the wavefront probe installed, and `checkWavefront` is read at every step
boundary. The cells come from `allCells()` in
[sweep.ts](../../packages/core/tests/sweep-harness/sweep.ts).

| Solve | Complete | Step | Accepted edge | Live bisector naming it | Refused birth |
|---|---|---|---|---|---|
| `fine:circle48@200000000000` (Near Regular Circle 48 translated by 2e11) | yes | 8 | 11 | e126 (cw 40, ws 11) | (cw 11, ws 42) from a merge at n71 |
| `ladder:1x:s2` (Circle 32 jittered at 1e-8, seed 2) | yes | 15 | 0 | e71 (cw 0, ws 18) | (cw 17, ws 0) from a merge at n45 |
| `Offset Cross Junction` (corpus, floor 1e-6) | no: step failure "Unable to play interior edge 27" | 2 | 6 and 10 | e27 (cw 10, ws 6) | (cw 6, ws 10) from the coaxial completion of e28 against e30 |

The cause is detected in the gate: at a step boundary, a live bisector names an accepted exterior edge as a parent.
Over the corpus, the census and the 642-cell sweep it fires on five solves. Three are in the table. The other two are
`ladder:1x:s1`, which is incomplete (step 13: live e76 names accepted edge 19, 7 violations), and `ladder:3x:s3`, which
is complete with no W1 to W4 violation (step 13: live e70 names accepted edge 3). The census meets the cause only on
`Offset Cross Junction`, at every depth and merge group.

## Mechanism, as measured

1. At the step boundary before the event, edge E is not accepted and has a live segment.
2. In the step, an event bears a bisector that has E as a parent. For example, on `ladder:1x:s2` the merge of
   e33, e80, e38, e82, e46 and e69 at n45 leaves the gap [e50, e71], which a new bisector (cw 17, ws 0) should close.
3. `tryToAcceptExteriorEdge` runs after the events and accepts E. Another live bisector still names E as a parent: e71
   (cw 0) on the ladder cell, e126 (ws 11) on the circle cell.
4. The birth filter in `handleInteriorNGon` refuses the new bisector because its parent E is accepted.
5. The ring the new bisector would have closed is left with two neighbours whose parents do not meet: on the ladder
   cell, e71's clockwise parent 0 is not e50's widdershins parent 17. W2 fails at the next boundary.
6. The id-interval partition does not check this. It hands the leftover bisectors on as a pair, [e50, e71], or as a
   triangle, [e126, e89, e90], and the pair or triangle handler closes them. The solve reports complete.

On `Offset Cross Junction` the same sequence leaves e27 alone in its ring, and the arithmetic throws.

## Diagnosis — unconfirmed

`hasInteriorLoop` (algorithm-helpers.ts) accepts an exterior edge when its target node and its source node are
joined by any chain of accepted interior edges. Such a chain can run through other faces as well as through the
edge's own face. So an edge can be accepted while its own face is still open. This is read from the code. It is
consistent with step 3 but not measured.

## What would confirm it

At step 3 on each case, record the chain of accepted edges `hasInteriorLoop` found for E. Check whether that chain
passes through an interior edge that does not bound E's face, that is, an edge with neither E as a parent nor a place
on E's face boundary. The diagnosis holds if, on all three cases, the chain leaves E's face while a bisector naming E
is still live.
