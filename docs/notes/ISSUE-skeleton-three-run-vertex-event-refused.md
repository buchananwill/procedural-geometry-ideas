---
title: "Skeleton: a vertex event of three runs across two rings is refused (a wing's two corners and a courtyard's corner)"
type: issue
area: straight-skeleton
status: open
date: 2026-11-16
part_of: [holed-skeleton-roadmap.md]
---

# Skeleton: a vertex event of three runs across two rings is refused (a wing's two corners and a courtyard's corner)

Recorded by BSA.D367 for the two refusals left in building-shell's `HOLED_REFUSALS`, grid draws `uniform-1-523` and
`uniform-1-1977`. **The solver refuses these inputs by name, under decision 21 of
[the simultaneous-rings spec](./skeleton-simultaneous-rings-decisions.md) (node 5 of the
[holed-skeleton roadmap](./holed-skeleton-roadmap.md)). It does not solve them.** Neither rule of
[the flat-ring and third-front spec](./skeleton-flat-ring-and-third-front-decisions.md) fires on them (its decision 53
and §6 item 7). They are valid inputs the solver declines, and this note records them so the port sees a known gap.

**Each is a guard that refuses by name, with a test green on the guard,** the form the project CLAUDE.md and BSA.D336
allow for a defect: the tests assert the named refusal, never a wrong skeleton, and a cure turns them red. The tests:

- [holed-simultaneous-rings.test.ts](../../packages/core/tests/straight-skeleton/holed-simultaneous-rings.test.ts):
  `what stays refused (decision 21; flat-ring and third-front spec, decision 53)`, whose test `the refusal specimen,
  grid draw uniform-1-523, is refused by name as a vertex event of three runs` asserts `complete: false`, one
  `simultaneous-across-rings` naming `in other than one run on each of two` and `(decision 21)`, and a `step-failure`.
- [solve-skeleton-stepped.test.ts](../../packages/core/tests/straight-skeleton/solve-skeleton-stepped.test.ts): `the
  refusal specimen (grid draw uniform-1-523, flat-ring and third-front spec, decision 53): the same diagnostics and the
  same incomplete graph`.
- [holed-flat-and-third-front.test.ts](../../packages/core/tests/straight-skeleton/holed-flat-and-third-front.test.ts):
  `fires on neither rule on the refusal specimen, grid draw uniform-1-523`.
- [holed-roof.test.ts](../../apps/building-shell/tests/holed-roof.test.ts): `the layouts the holed solve refuses (holed
  roof decisions 41 to 43; flat-ring and third-front spec, decision 53)`, whose tests `holds the two grid draws of three
  runs at one node, each with its issue note` and `%s is a hard error naming the island, its cause and its kind` (for
  `GridDraw523` and `GridDraw1977`) assert `planStorey`'s `IslandRefusal`.
- [holed-grid-fuzz.test.ts](../../apps/building-shell/tests/holed-grid-fuzz.test.ts): `leaves no draw incomplete but
  uniform-1-129 and the two refused under simultaneous-rings decision 21`.
- The dashboard's `REFUSAL_SPECIMEN` (`packages/dashboard/tests/fixtures/holed-specimens.ts`) is `uniform-1-523`, read
  by its tests in `holed-solve-boundary.test.ts` and `skeletonToScene-holes.test.ts` (dashboard holed spec, decision
  51).

## The input

Two draws of grid 1, seed 1, of building-shell's two-courtyard fuzz (`holed-grid-fuzz.test.ts` ports the draw law,
mulberry32). One storey, every Ring hipped at 30°, in cm; one pitch throughout, so the skeleton is unweighted. Outlines
as core takes them, clockwise; holes as rectangles `[x0, x1] × [y0, y1]`.

| Draw | Building-shell entry | Outline | Holes |
|---|---|---|---|
| `uniform-1-523` | `GridDraw523` | `(0,0) (0,700) (1350,700) (1350,650) (1700,650) (1700,450) (1350,450) (1350,0)`: the block `[0,1350] × [0,700]`, a wing `[1350,1700] × [450,650]` on its E side | `[900,1150] × [300,450]`, `[150,550] × [200,600]` |
| `uniform-1-1977` | `GridDraw1977` | `(0,0) (0,1000) (1750,1000) (1750,900) (2000,900) (2000,700) (1750,700) (1750,0)`: the block `[0,1750] × [0,1000]`, a wing `[1750,2000] × [700,900]` on its E side | `[1050,1550] × [500,700]`, `[100,250] × [450,700]` |

To reproduce in core, `solveSkeleton(outline, {holes: [{vertices: rect(900, 300, 1150, 450)}, {vertices: rect(150,
200, 550, 600)}]})` with `rect` giving the four corners, default options; `GRID_DRAW_523` in
`packages/core/tests/straight-skeleton/holed-test-helpers.ts` is the first. In building-shell, `planStorey(entry.fixture,
0)` on the `HOLED_REFUSALS` entry, whose Rings are in `apps/building-shell/src/fixture.ts`.

Both draws have one shape: a wing 200 deep on the E side, and the near hole's NE corner 200 W of the wing's root, on the
line of the wing's S wall.

## What the solver does

Measured with core's source at `805ca01`, default options.

**`uniform-1-523`.** Earlier layers make 4 interior nodes, at `(600,650)`, `(100,650)`, `(75,625)` and `(75,125)`, and
the far hole `[150,550] × [200,600]` joins the outline's ring. The refused step has two rings: the joined ring
`[16, 37, 29, 34, 18, 19, 20, 21, 22, 23]` and the near hole's `[24, 25, 26, 27]`. Its layer holds a vertex event of
three bisectors:

- `e19` from the wing's NW root corner `(1350,650)`, basis `(−1,−1)/√2`;
- `e22` from the wing's SW root corner `(1350,450)`, basis `(−1,1)/√2`;
- `e26` from the near hole's NE corner `(1150,450)`, basis `(1,1)/√2`.

All three reach `(1250,550)` at `t = 100` (arithmetic on the sources and bases; the refusal comes before any node is
made there). On the joined ring `e19` and `e22` are not adjacent: `e20` and `e21`, the wing's tip corners, lie between
them. So the event is two runs on one ring and one run on the other, three runs. The step pushes, in the run's words:

```text
[step-failure] Step [16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 34, 37]: rings [16, 37, 29, 34, 18, 19, 20, 21, 22, 23], [24, 25, 26, 27]: the vertex event [19, 22, 26] gathers bisectors of 2 rings in other than one run on each of two, so its pairing would depend on the angular order round its node (decision 21). Events of different rings coincide in this layer in a form the simultaneous-rings spec refuses by name.
[simultaneous-across-rings] (the same detail)
[unresolved-edges] 14 interior edge(s) finished without a target node: 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 34, 37.
```

`complete` is `false`, with 4 interior nodes and 23 interior edges.

**`uniform-1-1977`.** The same form. Earlier layers make 2 interior nodes, at `(50,400)` and `(50,750)`, and the far
hole `[100,250] × [450,700]` joins the outline's ring. The vertex event is again `[19, 22, 26]`: the wing's root
corners `(1750,900)` and `(1750,700)` and the near hole's NE corner `(1550,700)`, meeting at `(1650,800)` at `t = 100`.
The detail is the same sentence on rings `[16, 35, 29, 30, 34, 17, 18, 19, 20, 21, 22, 23]` and `[24, 25, 26, 27]`;
16 interior edges are unresolved, and the graph has 2 interior nodes and 20 interior edges.

**In building-shell** `planStorey` throws an `IslandRefusal` that begins `GridDraw523 storey 0: solveRoofParts: island
0 at (0, 0) with 2 holes cannot be roofed:` and carries each blocking kind with its cause in the user's terms, the
refusal's as `walls of the outline and the courtyards close on one point at one moment from more sides than the roof
solver can pair (simultaneous-across-rings: ... the vertex event [18, 21, 29] gathers bisectors of 2 rings in other
than one run on each of two, ...)`. Its ids differ from core's run because building-shell hands the solver its own
loops, whose collinear vertices canonicalisation removes (its `vertices-canonicalised` diagnostics). `GridDraw1977`
reads the same way.

## Why it is refused

Decision 21 of the simultaneous-rings spec: "A cross-ring merge that is not two runs is refused. That covers three or
more runs, two runs on one ring with a third ring, and a run that is its whole ring, because the pairing would then
depend on the angular order around the node, which the links do not hold." The code says the same at the refusal,
`pairwiseLayerRefusal` in [whole-events.ts](../../packages/core/src/straight-skeleton/whole-events.ts) ("Its pairing
would depend on the angular order round the node, which the links do not hold"), and at the test that sends the layer
there, `crossRingRuns` in [vertex-event.ts](../../packages/core/src/straight-skeleton/vertex-event.ts): "ONLY THIS SHAPE
HAS ONE PAIRING (decision 5): two runs have one cyclic order, so each gap's bisector is forced. Any other shape would
need the angular order of the arrivals round the node, which the links do not hold (decision 21)."

A vertex event is resolved from the links, and the links order each ring's bisectors along that ring, never the rings
round a point. Here `crossRingRuns` returns `undefined`, so `asWholeEvents` does not resolve the layer whole and
`pairwiseLayerRefusal` refuses it before any event is resolved (decision 20), so the layer changes no link, node or
acceptance. **A reading of decision 21 on this specimen, not measured:** the joined ring gives its two runs,
`{e19}` and `{e22}`, in their order along the ring, and the hole's run `{e26}` must sit in one of the two gaps between
them, the one on the wing's side (where `e20` and `e21` lie) or the other. The two choices bear different bisectors,
and which is right is an angular fact the links do not carry.

## How often

From the flat-ring and third-front spec's measurement (§2) and building-shell's grid fuzz, not re-run here: 2 of the
2,000 islands of grid 1, seed 1, these two; 0 of the 1,000 equal-gap islands of grid 2, seed 2. A single-loop input
never reaches decision 21, which is asked only in a step of more than one ring (simultaneous-rings decision 1).

## What is not known

- **The true skeleton at the node has not been derived.** Read from the coordinates and not traced through the solver:
  the near hole's N wall and the wing's S wall lie on one line (`y = 450`; in `uniform-1-1977`, `y = 700`) and face the
  same way, and the block's E wall below the wing and the near hole's E wall are 200 apart, so they too close on
  `x = 1250` (`x = 1650`) at `t = 100`. Whether the layer holds further events at that moment, and whether the
  collinear walls bring it into the family of
  [the umbrella note on collinear walls](./ISSUE-skeleton-straight-bisector-between-collinear-walls.md), is not
  established.
- **No cure is designed.** The simultaneous-rings spec defers meetings of more than two runs to an angular pairing
  round the node, which the links do not carry (its §5, as amended), and the flat-ring and third-front spec keeps that
  deferral until a specimen of each form is measured (its §7). These two are specimens of one form, two runs on one ring
  and one on another. Whether an angular pairing would solve them soundly has not been tried.
- **No specimen is kept of decision 21's other forms:** arrivals on three rings, a run that is its whole ring, or a layer
  whose merges share a bisector and that holds an event across rings.
