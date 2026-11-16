---
title: "Skeleton: a meeting of three fronts at one point is refused (two courtyards a wall apart)"
type: issue
area: straight-skeleton
status: open
date: 2026-11-15
---

# Skeleton: a meeting of three fronts at one point is refused (two courtyards a wall apart)

Recorded under [the simultaneous-rings spec](./skeleton-simultaneous-rings-decisions.md), decisions 22 and 44
(BSA.D311). **The solver refuses this input by name. It does not solve it.** The refusal is a guard in production code
(BSA.D266), so its test is green: it asserts the guard, never a wrong skeleton. This note records what the guard holds
back.

## The input: E′

The outline is `[0, 21] × [0, 10]`, wound clockwise. The two holes are `[3, 9] × [3, 7]` and `[12, 18] × [3, 7]`, wound
counter-clockwise. Every gap is 3: from each hole to the outline's walls, and between the two holes. This is two
courtyards whose separating wall is as thick as the outer walls, which is a realistic footprint.

The test is `what stays refused (decisions 21, 22 and 44)` in
[holed-simultaneous-rings.test.ts](../../packages/core/tests/straight-skeleton/holed-simultaneous-rings.test.ts).

## The true skeleton

Every node is at `t = 1.5`. The ridges are the rectangle `(1.5, 1.5)`–`(19.5, 8.5)` and the line `x = 10.5` from
`(10.5, 1.5)` to `(10.5, 8.5)`:

- The four corners of the ridge rectangle are head-ons. An outline corner meets the hole corner on its diagonal.
- `(10.5, 1.5)` and `(10.5, 8.5)` are three-front meetings. At `(10.5, 1.5)` the corner `(9, 3)` of the first hole and the
  corner `(12, 3)` of the second meet each other on the bottom wall's front. Two bisectors arrive, and three ridges
  leave: the bottom ridge to the left, the bottom ridge to the right, and `x = 10.5` upwards. The node has degree five.

That gives 6 interior nodes and 26 interior edges: 12 corner bisectors and 7 ridges of two half-edges each.

## What the solver does

The root step holds three rings: the outline and the two holes. Its layer at `t = 1.5` holds two kinds of event. The
first kind is the vertex events at `(10.5, 1.5)` and `(10.5, 8.5)`. Each is one hole corner from each hole, so it is one
run on each of two rings, which decision 3 resolves. The second kind is a split by each of those corners: it strikes the
outline's bottom or top segment at the same point. **Decision 22** refuses the layer before any event is resolved. The
step pushes `simultaneous-across-rings`, and its message contains
`meets a third front: its instigator arrives at the vertex event [...]`. Then it throws. No node is made, and
`complete` is `false`.

The guard was removed for measurement (spec decision 39's gate). The layer then resolves the vertex event as two runs.
It bears a bisector between two collinear walls, the bottom wall's two pieces, and the bottom front is lost. A
degenerate ring of three is left behind, and `componentsOfRings` refuses it as `multi-ring-step-refused` at area 0.
Six nodes have been made by then. The guard turns that late, unattributed refusal into an early one that names its
cause.

## Why the links cannot pair more than two runs (decision 44)

A vertex event is resolved from the links. Each wavefront ring stores, for every bisector, its clockwise and
widdershins neighbours along that ring. A meeting of one run on each of two rings has exactly one cyclic order, which
is `(R1, R2)`. So each of its two gaps is closed by one forced bisector (decision 5): the clockwise parent of one run's
last arrival, and the widdershins parent of the other run's first.

At `(10.5, 1.5)` there are three fronts: hole 1's run, hole 2's run, and the outline's bottom segment, cut at the node.
Three bisectors must be born, one per gap between consecutive fronts round the node. Three fronts have two cyclic
orders, `(R1, R2, R3)` and `(R1, R3, R2)`, and the births differ between them. The order is an angular fact about the
node. The links record order along each ring, never the order of rings round a point. So any pairing chosen from the
links alone is a guess, and decision 21 refuses to guess.

## How often, measured

In a fuzz of axis-aligned rectangles with rectangular holes (400 inputs per row), this refusal is met only when two holes
have a wall on one line and the gap between them closes on that line's front:

| Holes, positions | Inputs | Refused under decision 22 |
|---|---|---|
| one hole, integer | 400 | 0 |
| one hole, non-integer | 400 | 0 |
| two holes, integer | 400 | 20 |
| two holes, non-integer | 400 | 0 |

## The same meeting on one ring

Decision 22 is asked only in a step of more than one ring (spec decision 1). Once the rings have joined, the same
meeting on one ring is not refused. It reaches the one-ring machinery, which is
[the three-front meeting on one ring](./ISSUE-skeleton-three-front-meeting-on-one-ring.md).

## The building-shell specimens

Roadmap node 9 ([the holed roof spec](./building-shell-holed-roof-decisions.md), decisions 41 to 43) hands
`solveSkeleton` each island's outline and holes, and these layouts are refused under this kind. Each is one storey,
every Ring hipped at 30°, Rings as `[x0, y0, x1, y1]` in cm. The first four built clean under the courtyard cut and are
the regression the spec states. Each is an entry of `HOLED_REFUSALS` in `apps/building-shell/src/fixture.ts`,
whose test in `tests/holed-roof.test.ts` asserts the hard error naming the island and this kind; the guard is green, and
a cure turns it red.

| Layout | Rings |
|---|---|
| `CourtL` | `[0,0,1000,300]`, `[0,700,1000,1000]`, `[0,300,300,700]`, `[700,300,1000,700]`, `[1000,0,1400,300]` |
| `JutMidWall` | `[0,0,1000,300]`, `[0,300,300,700]`, `[-250,350,0,650]`, `[0,700,1000,1000]`, `[700,300,1000,700]` |
| `BandRunsOnPastWing` (was `BandRunsOnPastCut`) | `[-250,0,1000,300]`, `[0,300,300,700]`, `[0,700,1000,1000]`, `[700,300,1000,700]` |
| `BandRunsOnPastWingMirrorY` | `[-250,700,1000,1000]`, `[0,300,300,700]`, `[0,0,1000,300]`, `[700,300,1000,700]` |
| `TwoHolesProbe` (two holes; the cut refused it too) | `[0,0,700,100]`, `[0,200,700,300]`, `[0,100,100,200]`, `[300,100,400,200]`, `[600,100,700,200]` |

`CourtL` is a layout a person would draw: a wing carrying a band's line on past the courtyard (BSA.D321).

## What a cure needs

A cure needs an angular pairing round the node: the fronts' directions of arrival, sorted about the node, then the gap
births read off that order. This is the spec's Deferred item. It would be reached only in steps of several rings, and
in the one-ring case only if the user rules that it may be (BSA.D301).
