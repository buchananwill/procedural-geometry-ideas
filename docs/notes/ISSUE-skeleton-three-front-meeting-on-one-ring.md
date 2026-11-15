---
title: "Skeleton: a meeting of three fronts on one ring bears a bisector of zero length"
type: issue
area: straight-skeleton
status: open
date: 2026-11-15
---

# Skeleton: a meeting of three fronts on one ring bears a bisector of zero length

Found by the courtyard fuzz run during the work on
[the simultaneous-rings spec](./skeleton-simultaneous-rings-decisions.md) (roadmap node 5). Before that unit, the
input was refused at its root as `simultaneous-across-rings`. Now it passes its root, and the solve completes with one
self-loop. **Nothing in the solver has been changed for it.**

The red test is `red by design: two holes with collinear walls`, case `2h-int-113`, in
[holed-simultaneous-rings.test.ts](../../packages/core/tests/straight-skeleton/holed-simultaneous-rings.test.ts). It
asserts join-and-divide decision 42's battery and a single node at `(2, 10)`. It is red by design (BSA.D266) until a cure
lands.

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
  `e36` is born at node 18 `(2, 10)` and ends on the ring of three `[35, 38, 36]` back at node 18. It is a self-loop.

Every other check holds. The solve is complete, every face is closed, the tiling error is 0, the cycle rank is 2, and
equal time, time order, the direction and rate oracles and `checkWavefront` are all clean. The self-loop is the only
defect, and the battery's `selfLoops` check fails on it.

## Why it is not cured here

This is the one-ring form of
[the three-front meeting the simultaneous-rings spec refuses](./ISSUE-skeleton-three-front-meeting-refused.md). That
refusal, decision 22, is asked only in a step of several rings (decision 1). Here the rings have already joined, so the
meeting is resolved by the machinery every single-loop solve runs. A cure, or a guard there, changes how single-loop
events resolve, which the user has reserved (BSA.D301). Whether a single-loop input can reach the same state, with a
bisector born between two collinear walls facing the same way at a node where it also closes, is not measured.

## How often, measured

In the courtyard fuzz (axis-aligned rectangles, 400 inputs per row), this was 1 of 400 with two holes at integer
positions, and 0 in every other row.
