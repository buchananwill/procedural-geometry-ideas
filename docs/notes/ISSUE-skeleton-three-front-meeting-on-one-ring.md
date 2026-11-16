---
title: "Skeleton: a meeting of three fronts on one ring bears a bisector of zero length"
type: issue
area: straight-skeleton
status: resolved
date: 2026-11-15
verified_by:
  - packages/core/tests/straight-skeleton/holed-simultaneous-rings.test.ts
  - "two holes with collinear left walls meet three fronts on one ring soundly (2h-int-113)"
  - "interiorGraphShape reads a culled self-loop as no edge and an un-culled one as a defect"
---

# Skeleton: a meeting of three fronts on one ring bears a bisector of zero length

**CORRECTED (BSA.F103, BSA.D314): this was not a defect.** The self-loop this note recorded, `e36`, is marked `culled`
by `applyDegenerateClosure`: the solver's deliberate retirement of a surplus bisector at a degenerate closure, which
sound single-loop solves carry routinely. The red test was red only because the battery's `interiorGraphShape`
(`holed-test-helpers.ts`) counted a self-loop before it skipped culled edges. The helper now skips a culled edge before
it counts anything, as `buildSkeletonTree` does, and the solve passes the whole battery. Nothing in the solver changed.
The defect family this input belongs to, a straight bisector between collinear walls that face the same way, is
recorded in [its umbrella note](./ISSUE-skeleton-straight-bisector-between-collinear-walls.md).

Found by the courtyard fuzz run during the work on
[the simultaneous-rings spec](./skeleton-simultaneous-rings-decisions.md) (roadmap node 5). Before that unit, the
input was refused at its root as `simultaneous-across-rings`. Now it passes its root and solves soundly.

The test is `two holes with collinear left walls meet three fronts on one ring soundly (2h-int-113)`, in
[holed-simultaneous-rings.test.ts](../../packages/core/tests/straight-skeleton/holed-simultaneous-rings.test.ts). It
asserts join-and-divide decision 42's battery, a single node at `(2, 10)`, and that the bisector between the collinear
walls is a culled self-loop there. It is green.

## The input

The outline is `[0, 8] × [0, 14]`, clockwise. The holes are `[4, 5] × [6, 8]` and `[4, 7] × [12, 13]`,
counter-clockwise. The two holes' left walls lie on one line, `x = 4`, which is 4 from the outline's left wall. The
holes are 4 apart vertically, from `y = 8` to `y = 12`.

## What happens

The second hole joins the outline at `t = 0.5`, and the first hole joins at `t = 1.5`, when its right corners strike the
right wall. By the boundary before `t = 2`
the step is one ring, the 10-ring `[12, 13, 29, 20, 28, 33, 19, 16, 32, 15]`.

At `t = 2` five fronts close at `(2, 10)`: the outline's left wall, the two holes' collinear left walls, the first
hole's top and the second hole's bottom. The corridors `x = 2` between the left wall and each hole's left wall
collapse, and so does the gap between the holes at `y = 10`. In the true skeleton `(2, 10)` is one node of degree five
where nothing is born. The two hole corners `(4, 8)` and `(4, 12)`, both corridor bisectors and the ridge from
`(6, 10)` all end there.

The solver resolves the step as one ring. The corners' meeting bears two bisectors:

- `e34`, between the second hole's bottom and the first hole's top. This is the true ridge `y = 10`.
- `e36`, with clockwise parent 7 and widdershins parent 11: the two collinear left walls, which face the same way.
  `e36` is born at node 18 `(2, 10)` and ends on the ring of three `[35, 38, 36]` back at node 18, where the degenerate
  closure retires it as a culled self-loop. It carries no geometry.

Every check holds: the solve is complete, every face is closed, the tiling error is 0, the cycle rank is 2, and equal
time, time order, the direction and rate oracles and `checkWavefront` are all clean. The independent checker of the
guard's measurement (BSA.D314), with its L-infinity oracle, also reads it as sound.

## Why it was once read as a defect

This is the one-ring form of
[the three-front meeting the simultaneous-rings spec refuses](./ISSUE-skeleton-three-front-meeting-refused.md). That
refusal, decision 22, is asked only in a step of several rings (decision 1). Here the rings have already joined, so the
meeting is resolved by the machinery every single-loop solve runs, and on this input that machinery is right.

## How often, measured

In the courtyard fuzz (axis-aligned rectangles, 400 inputs per row), this input was 1 of 400 with two holes at integer
positions, and 0 in every other row. It was counted there as a failure only through the same miscounted culled
self-loop.
