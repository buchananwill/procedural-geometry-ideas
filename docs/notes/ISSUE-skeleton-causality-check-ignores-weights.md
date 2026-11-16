---
title: "Skeleton: the causality check ignores weights"
type: issue
area: straight-skeleton
status: resolved
date: 2026-11-15
verified_by: [packages/core/tests/straight-skeleton/weighted-causality-check.test.ts, packages/core/tests/straight-skeleton/holed-join-divide.test.ts]
---

# Skeleton: the causality check ignores weights

Found by the node 4 review (BSA.F101) and ruled on in BSA.D309. The fix is in
[causality-check.ts](../../packages/core/src/straight-skeleton/causality-check.ts) and, independently, in the test
side's `causalityViolations` in
[wavefront-measurement-helpers.ts](../../packages/core/tests/straight-skeleton/wavefront-measurement-helpers.ts). It
changes diagnostics only: no graph, no `complete`, no tolerance and no constant.

## Reproduction

Solve `Weighted L (fast shelf beside slow riser)` from `WEIGHTED_TEST_POLYGONS` with `solveSkeleton(vertices,
{weights})`. The outline is `(0,0), (0,4), (2,4), (2,2), (6,2), (6,0)`, and the shelf from `(2,2)` to `(6,2)` has
weight 4. Every other wall has weight 1. The skeleton is correct: every interior node is at one time from all its walls
(distance over weight), and no interior edge runs backwards in that time. Before the fix the solver reported three
causality violations: `offset 12`, `offset 13` and `clearance 7`.

Before the fix, four single-loop weighted fixtures carried such false reports at both perceptual floors. The holed
fixture F4 carried one, which its test pinned until BSA.D309:

| Fixture | Reports before | After |
|---|---|---|
| `Weighted L (fast shelf beside slow riser)` | offset 12, offset 13, clearance 7 | none |
| `Weighted Pentagon House (asymmetric roof)` | offset 10, clearance 5 | none |
| `Weighted Square (weight change at a 1e-3 turn)` | clearance 5 | none |
| `Weighted Invisible Vertex Rectangle (weight change at a corner)` | offset 41, clearance 26 | none |
| F4, a weighted hole (`holed-join-divide.test.ts`) | clearance 8 | none |

## Cause

The check dated a node by its perpendicular DISTANCE from its first incident bisector's clockwise parent and never
divided by that parent's weight:

- **offset** compared two such distances along an edge, though two nodes dated against walls of different weights
  are at different times;
- **clearance** compared that distance with the Euclidean distance to the nearest wall, so a node dated against a
  fast wall read as late.

The test side's `causalityViolations` made the same comparisons.

## Fix

Every quantity compared is a time: a node's arrival is its distance from its dating wall's line beside that wall's
weight, and its time is the quotient (W-spec W5, W7). Comparisons are cross-multiplied, `d₁ · w₂` against `d₂ · w₁`,
and the tolerance, a length, is stated on the faster of the two weights, `δ · min(w₁, w₂)`. That is how
`compareArrivals` states its window (C8 spec T13). At unit weights every product and quotient is by `1.0`, so the
arithmetic is the old arithmetic, operation for operation.

- **offset**: an edge is a violation when its target's time is earlier than its source's.
- **clearance**: a node at time `t` is a violation when it lies nearer the boundary than `w_min · t`, where `w_min` is
  the slowest wall's weight. That weight is `1` on every graph `solveSkeleton` returns, because the weights come back
  divided by the smallest.
- A weight the graph's table does not hold is read as `1`. This covers the merged path's graph, whose ids interleave
  and which only the test side ever reads, so that graph reads exactly as it did before.

**The clearance bound departs from BSA.D309's text, which says at least `w · t` from every wall of weight `w`.**
That property does not hold on correct skeletons. A fast wall's face can close before its front gets near a node that
the unobstructed front would have reached. On `Weighted L`, node 8 at `(1, 1)` is at time 1 and lies 1.41 from the
end of the weight-4 shelf, not 4. On `Weighted Bump`, a short fast wall whose face closes early puts a node inside its
own slab at less than `w · t`.

Measured on the random weighted solves that pass the equal-time and time-order checks, the ruling's reading reported
583 of 740 single loops and 581 of 591 holed solves, and 3 of the 10 correct fixtures. The slowest-wall bound reported
none of them.

The slowest-wall bound follows from correctness. Every front moves inward at a normal speed of at least `w_min`. A
mitered offset by at least `h` lies inside the erosion by a disc of radius `h`, both at a convex corner (an
intersection of half-planes) and at a reflex one (a union). Erosions compose. So the region the wavefront leaves at
time `t` lies inside the erosion by `w_min · t`.

## Measured

The populations were:

- `FULL_CORPUS` at floors `1e-6` and `1e-5`, 120 solves;
- `WEIGHTED_TEST_POLYGONS` at both floors, 24 solves;
- 800 random inputs in each of four populations: weighted single loops, weighted holes, unweighted single loops and
  unweighted holes. They follow the node 4 reviewer's generator recipe (mulberry32, seed 23; BSA.F102),
  reconstructed from its description, so they are not byte-for-byte the reviewer's inputs;
- the sweep harness, 642 root cells and 31,693 regions.

Each solve's full causality diagnostics (oracle, element, magnitude and detail) and a graph digest were recorded
before and after.

- **Unweighted:** no solve's diagnostics changed, on the solver side or the test side. No graph changed anywhere, and
  the sweep harness output is byte-identical.
- **Weighted single loops, 796 complete:** 740 are correct by equal time and time order. Before the fix 734 of them
  carried a positional report; after, none does. The 38 complete with an edge backwards in time carry a `direction`
  report both before and after, and 29 offset reports were added on them.
- **Weighted holes, 660 complete:** 589 are correct. Before the fix all 589 carried a report; after, none does. All 71
  wrong ones carry `direction`, and 60 offset reports were added on them.
- **No report was gained on a correct skeleton.** Every complete weighted solve that fails equal time or time order
  still carries a positional report. A wrong weighted answer is now told from a right one by the solver's own check,
  which BSA.F101 found it could not do while the false reports buried the signal.

## Gates

[weighted-causality-check.test.ts](../../packages/core/tests/straight-skeleton/weighted-causality-check.test.ts)
first shows every solvable weighted fixture correct by the equal-time and time-order checks, at both floors. It then
asserts that neither oracle reports any of them. F4 in
[holed-join-divide.test.ts](../../packages/core/tests/straight-skeleton/holed-join-divide.test.ts) asserts no
causality diagnostic, as every holed fixture does. Each of these mutations turns tests red:

- the solver's arrival weights read as 1: 9 red;
- the solver's offset compared without weights: 6 red;
- the solver's clearance bound at the fastest wall in place of the slowest: 20 red;
- the test side's arrival weights read as 1: 8 red;
- the test side's bound at the fastest wall: 20 red.
