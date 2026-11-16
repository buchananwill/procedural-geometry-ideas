---
title: "Skeleton: on weighted input an interior edge can run backwards in time"
type: issue
area: straight-skeleton
status: open
date: 2026-11-15
---

# Skeleton: on weighted input an interior edge can run backwards in time

Found by the node 4 review (BSA.F101, BSA.F102). BSA.D309 records it as the user's to cure: a cure would change how
single-loop events resolve. **Nothing in the solver has been changed for it.** The defect predates holes, and holes
make it more frequent.

The red tests are in
[weighted-time-order.test.ts](../../packages/core/tests/straight-skeleton/weighted-time-order.test.ts), one per
reproducer. Each asserts the property below, and the incomplete ones also assert `complete`. They are red by design
(BSA.D266) and stay red until the cure lands.

## The property that fails

For an interior node `p`, `W(p)` is the set of clockwise and widdershins parents over every interior edge incident to
`p`. `d(p, e)` is the perpendicular distance from `p` to the line through exterior edge `e`'s own source and target,
and `w_e` is `e`'s weight in `graph.exteriorWeights`. The node's time is `T(p) = d(p, e) / w_e` for an `e` in `W(p)`,
and an exterior node has `T = 0`.

**For every interior edge, `T(target) >= T(source) - 1e-9 * extent`**, where `extent` is the largest absolute outline
coordinate, or 1 if that is smaller. The solver's `direction` oracle fires on every offending edge measured. Since
[the causality check reads weights](./ISSUE-skeleton-causality-check-ignores-weights.md), the `offset` oracle does
too, and correct weighted solves carry no false report to bury the signal.

## Reproducers

The coordinates are the reviewer's, verbatim. Each input is solved with `solveSkeleton(outline, {holes, weights})`
and every other option at its default. Outlines are clockwise and holes counter-clockwise. The two smallest are
inlined here. The other three are in the test file:

- **1**: a 5-vertex outline with a weighted 5-vertex hole, complete and wrong (fuzz 199);
- **2a**: a weighted holed input that fails with a step failure (fuzz 800);
- **2b**: a weighted holed input with two holes, refused at ring assignment (fuzz 139).

**3a. A weighted single loop of 7 vertices, complete and wrong (fuzz 147).**

```json
{"outline":[{"x":5.923079498004734,"y":-0.1713378555338003},{"x":2.401883588600462,"y":-1.2806078059524135},{"x":1.3022974957801552,"y":-1.5867918178415665},{"x":3.0108975486652887,"y":-7.76956801766187},{"x":-2.6442745993218235,"y":-8.964820521275756},{"x":0.09005796436641586,"y":2.595975424656179},{"x":6.619116675708805,"y":4.326486552930545}],
 "weights":[1.4820723602548243,1.1649640571326016,1.1237987250089645,1.059144739806652,1.4333649205043912,0.9666668130084872,1.438003096729517]}
```

`complete: true`. Bisector 16 (cw 0, ws 4) runs from node 9 at T 1.699 to node 11. Bisector 17 (cw 4, ws 2) runs
from node 10 at T 1.706 to node 11. Node 11, at `(0.2937, -0.8660)`, is at T 0.671.

**3b. A weighted single loop of 8 vertices, incomplete (fuzz 138).**

```json
{"outline":[{"x":0.15787535625951496,"y":-4.804208917022127},{"x":-2.062023612171879,"y":-1.9386386163760727},{"x":-8.41758414381089,"y":-1.955849803234976},{"x":-7.195861956604123,"y":4.411866299047293},{"x":1.7786980909564174,"y":4.557528821571131},{"x":0.7720089168703295,"y":1.896508598321967},{"x":2.7148462647050873,"y":2.5401482210520556},{"x":6.936145514102714,"y":3.894288976340948}],
 "weights":[0.7998054536059498,0.9329725854098796,1.3161114612594247,0.9600393081083893,1.4540400480851532,1.1018779234960676,1.2871540801599621,1.3080091727897525]}
```

`complete: false`: a step failure ("Unable to generate any collisions"), with edges 10, 16, 18 and 19 unresolved.

## Rates

**The reviewer's figures, from 800 inputs each (BSA.F102).**

- Weighted single loops: 749 clean; 34 complete with an edge backwards in time (4.25 percent); 9 complete with
  strips short by 0.2 to 55 percent; 2 complete with two-wall nodes outside the outline, not diagnosed; 6 incomplete.
- Weighted holes: 611 clean; 84 backwards (10.5 percent); 56 incomplete, of which 47 are "Unable to generate any
  collisions", 4 `multi-ring-step-refused` and 1 `simultaneous-across-rings`; 49 discarded as self-crossing.

**Re-measured at `9164e92` on a reconstruction of the generator.** The reconstruction is not byte-for-byte the
reviewer's inputs.

- Weighted single loops: 740 correct by equal time and time order; 38 complete with an edge backwards (4.75 percent),
  every one carrying `direction`; 4 step failures; 18 self-intersecting inputs solved on the merged path, not
  classified.
- Weighted holes: 591 correct; 71 backwards (8.9 percent), every one carrying `direction`; 47 refused as
  `multi-ring-step-refused`; 41 step failures; 50 refused at the door as self-crossing.

Before `9164e92`, 14 more of the holed solves came back complete and backwards. That commit refuses a ring whose
polygon crosses itself, so they are now refused at the step where the ring stopped being simple (BSA.D309).

**The generator** (BSA.F102). It uses mulberry32 with seed 23, and each `u` is one draw. For each input:

1. Draw `m = 5 + floor(8u)` outline vertices at angles `2πu`, sorted ascending, each at radius `rmin + (10 − rmin)u`
   about the origin, then reverse them to clockwise. `rmin` is 2 for single loops and 5 for holes.
2. Draw 1 to 3 holes. Each has radius `r = 0.4 + 1.4u`, centre `(16u − 8, 16u − 8)`, and `3 + floor(4u)` vertices of
   the same star construction with radii between `0.6r` and `r`, counter-clockwise. A hole is kept only if it lies
   inside the outline and more than 0.3 from it and from the other holes; 200 tries are allowed. In the single-loop
   run the holes are drawn and then discarded, because they consume draws.
3. Draw weights `0.7 + 0.8u`, one per outline edge in the single-loop run and one per hole edge in the holed run.

## Mechanism: what is known

**The reviewer's trace of 2b (BSA.F101, read and not re-run):**

1. An earlier corridor event between outline edge 2 and hole edge 16, two anti-parallel walls of different weights,
   was missed.
2. Bisector 40 (cw 16, ws 2), born at node 20, then runs away at a speed of about 11.9.
3. The ring that follows is the pocket of outline edges 0, 1 and 2 and hole-2 edges 16 and 17. Its polygon crosses
   itself.
4. Ring assignment refused it. At `a8ba71f` the refusal said the inner ring's witness lies in no outer ring. Since
   `9164e92` the step is refused for the self-crossing ring itself.

## Diagnosis of 3a: CONFIRMED

The method was a read-only scratch test that installs the wavefront probe and, at every step boundary, runs an
independent weighted-wavefront simulation from the probe's live bisectors. A bisector `b` with clockwise parent `c`
and widdershins parent `w` moves at `v` with `v · n_c = w_c` and `v · n_w = w_w` (W-spec W9). The simulation predicts
each ring's next edge event, and the next strike of any live bisector on a live segment's front, and compares the
prediction with the layer the solver resolves next. All times below are in the solver's unit space, which is the
caller's divided by 16.

1. **The root layer is right.** At `t = 0.008274` wall 1 collapses: node 7, from bisectors 8 and 9. It bears
   bisector 14 (cw 2, ws 0).
2. **The next layer is wrong.** The simulation's next event is a split: **bisector 14 strikes wall 4's front at
   `t = 0.041941`**, at `u = 0.70` along the segment between bisectors 11 and 12. The solver resolves wall 6's
   collapse at `t = 0.104653` instead, then two more events at `0.106194` and `0.106633`. It ends with a triangle of
   bisectors 14, 16 and 17 whose intersection is node 11, **at `t = 0.041941`, the missed split's time and place**.
   Bisectors 16 and 17 were born after that time, so both run backwards to it. These are the `direction` and `offset`
   reports on edges 16 and 17.
3. **The event was missed, not mis-priced.** Asked directly at that boundary, the solver's own
   `generateSplitEvent(bisector 14, wall 4)` returns `interiorAgainstExterior` at `t = 0.0419413905`, at exactly node
   11's position, on segment (11, 12). The solver never asks it. Bisector 14 is reflex: the solver's `isReflexEdge` and
   the corner's geometric turn agree. It is `secondary`, though, and both split paths require a `primary` bisector:
   - `createCollisions` in `algorithm-complex-cases.ts`: `checkExteriorCollisions = isReflexEdge(...) &&
     edgeRank(...) === 'primary'`;
   - `collideInteriorEdges` in `collision-helpers.ts`: `canGenerateSplits = isReflexEdge(edgeA) &&
     edgeRank(edgeA.id) === 'primary'`.
4. **Why only weights reach it (argued, not measured):** without weights, an edge event cannot bear a reflex vertex.
   Edge `k` shrinks between corners of interior angles `θa` and `θb` only when `θa + θb < 360°`, so the new corner's
   angle, `θa + θb − 180°`, is under 180°. With weights the collapsing edge's length rate depends on the weights, and
   here bisector 8 moves at speed 9.9 along wall 1. Wall 1 collapses between a convex corner and a reflex one and
   leaves a reflex corner. The rule that only primary bisectors split assumes that secondary bisectors are convex.

## Diagnosis of the others: UNCONFIRMED

The same simulation found the first missed event in every reproducer. Each is a split that the simulation predicts
before the solver's next layer. The counterfactual call was not made for these four.

| Reproducer | First missed event (simulation) | Bisector's rank | `isReflexEdge` | Geometric turn | `cw · basis` |
|---|---|---|---|---|---|
| 3b | b16 (cw 6, ws 4) strikes wall 1 at t 0.06347 | secondary | true | reflex | −0.91 |
| 2a | b22 (cw 7, ws 5) strikes wall 2 at t 0.10250 | secondary | true | reflex | −0.77 |
| 1 | b15 (cw 5, ws 9) strikes wall 4 at t 0.04920 | primary | **false** | reflex | **+0.42** |
| 2b | b36 (cw 17, ws 16) strikes wall 1 at t 0.01498 | primary | **false** | reflex | **+0.12** |

Two mechanisms are suggested, and both are rules that hold only at unit weights:

- **(A) Secondary reflex bisectors are never asked for splits** (3a confirmed; 3b and 2a). Only weights make an edge
  event bear a reflex vertex.
- **(B) `isReflexEdge` reads reflexness as `dot(clockwise parent's basis, bisector's basis) < 0`** (1 and 2b). At
  unit weights that is the corner's turn. Under weights the bisector leans with the weights, and a reflex corner (a
  left turn of the solved ring) can have a bisector with a positive component along its clockwise parent. Its splits
  are then never generated. A hole vertex is reflex in the region, which is why holes make the defect more frequent.

A cure would ask a reflex secondary bisector for splits and read reflexness from the corner's turn. Either would
change which events single-loop solves resolve, and so possibly unweighted graphs, which is why it is the user's
(BSA.D309). Neither was tried.
