---
title: "Skeleton simultaneous events across rings: decision spec"
type: decision-spec
area: straight-skeleton
status: completed
date: 2026-11-15
verified_by: [packages/core/tests/straight-skeleton/holed-simultaneous-rings.test.ts, packages/core/tests/straight-skeleton/holed-guard.test.ts, packages/core/tests/straight-skeleton/full-graph-digest.test.ts]
part_of: [holed-skeleton-roadmap.md]
depends_on: [skeleton-join-and-divide-decisions.md]
---

# Skeleton simultaneous events across rings: decision spec

## 1. Intent

This is node 5 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md). It was written from a measurement of a
throwaway copy of the sources at `a8ba71f` (§2), from BSA.F97, BSA.D284, BSA.D291, BSA.D294, BSA.D302, BSA.D306 and
BSA.D307, and it builds on [join and divide](./skeleton-join-and-divide-decisions.md),
[edge acceptance](./skeleton-edge-acceptance-decisions.md), [loops input](./skeleton-loops-input-decisions.md) and
[wavefront order](./skeleton-wavefront-order-decisions.md). Today the solver refuses, as `simultaneous-across-rings`, any
layer in which events of two rings coincide, and the concentric courtyard is made of such layers. The measurement found
that once the refusal is lifted, the existing machinery already bears the right bisectors and writes the right links.
Three things fail. First, the corridor rings of two bisectors that the layer leaves are refused as unclassifiable.
Second, the pairwise fallback strands an arrival when a cross-ring meeting holds a run of two. Third, after a join, the
second strike of a segment can take the wrong piece. This spec fixes those three, keeps everything else, and refuses by
name what it does not settle. **It is of kind (A).** Every new rule is reached only in a step of several rings, or
after a join, so a single-loop input solves to the byte-identical graph by construction, and nothing goes to the user's
ruling. **No tolerance, window or constant moves.**

## 2. What was measured

All fixtures are caller-unit, with clockwise outlines and counter-clockwise holes. The copy was bundled with esbuild.
"Unrefused" means the as-built tree with the cross-ring refusal disabled. "This spec" means unrefused plus decisions
3 to 8, 12 and 17. Every fixture that this spec solves is exact: tiling error 0 to 3e-16, equi-time clean, no escaped
node, no self-loop, and cycle rank equal to the hole count. Each also gives identical arcs with its splits resolved in
reverse order, and under translations by (1/3, 1/7) and (1234.5678, −987.654321).

| Fixture | True skeleton | Today | Unrefused: what the machinery does | This spec |
|---|---|---|---|---|
| A concentric square | ridge square (2,2)–(8,8), t = 2 | refused at root: `interiorNonAdjacent [8, 12]` meets two rings | `asWholeEvents` null (its merges span rings); the narrowing keeps all 8 reports (one moment); the pairwise fallback resolves 4 head-ons by `linkVertexToVertex`. All 8 births and links are true (four 2-rings of midlines). Then `componentsOfRings` refuses ring [16, 23] at area 0 | solved |
| A′ chamfered | as A; the chamfer and the hole corner (4,4) meet at (2,2) | refused | the pair collapse of the chamfer consumes both its bisectors, and the hole corner's head-on reports become no-ops; a degenerate 3-ring [24, 26, 25] is refused | solved |
| B off-centre rectangle | 7 nodes at t = 1.5, 2, 5 (decision 34) | refused: `[8, 12]` | as A, with 2 joins by `linkSplit`; rings true; 2-ring [16, 19] refused | solved |
| C1 hole weight 2 | ridge square at t = 4/3 | refused | as A | solved |
| C2 bottom wall weight 2 | joins at t = 4/3, then a one-ring C closes at t = 2 | refused: `the join [12, 3] shares the layer` | splits only; 2-ring [16, 17] refused. **C2′** (hole listed from (6,4)): the second strike of the bottom segment takes the wrong piece and the solve reports complete with 10 nodes, cycle rank 3, tiling 23% off and a node outside the region | solved; two weight-naive causality reports (decision 33) |
| D courtyard with wings | 12 nodes at t = 150, 200 (decision 35) | refused: `[16, 28]` | 4 head-ons, 4 strikes; rings true (2 pockets, six 2-rings); [32, 43] refused. With strikes resolved before head-ons, the rings are wrong and a step throws | solved |
| E two holes | 10 nodes at t = 1.5, 2 | refused: `[12, 16]` | as D; [24, 32] refused | solved |
| E′ two holes, every gap 3 | ridge rectangle plus x = 10.5, t = 1.5 | refused | two hole corners meet at (10.5, 1.5) on the bottom wall's front; the meeting births a bisector between two collinear walls and the front is lost; a degenerate 3-ring is refused | refused by name (decision 22) |
| F octagon in octagon | ridge octagon r = 7, t = 3cos(π/8) | refused: `[18, 29]` | 8 head-ons and 12 strike reports at the head-on points; priority resolves the head-ons first and voids the strikes; then a 2-ring is refused. Strikes first: 6 self-loops | solved |
| G centred diamond, H square turned 0.3 | 4 strikes, then 4 triangles | refused: `the join [12, 2] shares the layer` | complete and exact | solved |

Over `FULL_CORPUS` (60 fixtures) with every rule enabled: 0 graphs moved, 0 steps of more than one ring, and 0 strikes
with two pieces on the instigator's ring. Node 4's F1 to F7: unmoved.

## 3. Type and surface roster

`+` added, `~` changed, `-` removed, `=` unchanged but named because a reader will look for it.

| | Surface | File |
|---|---|---|
| + | `type CrossRingRuns = readonly [first: readonly number[], second: readonly number[]]` | [vertex-event.ts](../../packages/core/src/straight-skeleton/vertex-event.ts) (built in `coincident-events.ts`; moved by BSA.D356) |
| + | `crossRingRuns(rings: readonly number[][], merge: Pick<CoincidentMerge, 'edgeIds'>): CrossRingRuns \| undefined` | vertex-event.ts |
| + | `bisectionsForCrossRingMerge(runs: CrossRingRuns, sourceNodeId: number, context): BisectionParams[]` (folded by BSA.D356 into `bearGaps(mergeGaps(runs), …)`, the one bearing of a merge's gaps) | vertex-event.ts |
| ~ | `handleInteriorNGon`: `asWholeEvents` admits a cross-ring merge, the merge loop bears its births, the new refusal | [algorithm-complex-cases.ts](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts); `asWholeEvents` in [whole-events.ts](../../packages/core/src/straight-skeleton/whole-events.ts) |
| + | `multiRingRefusal(context, rings, events, resolution): string \| undefined` (module-private; split by BSA.D356 into `wholeLayerRefusal` and `pairwiseLayerRefusal`, each returning a `Verdict`) | whole-events.ts |
| - | `crossRingCoincidence`, `isJoin` | algorithm-complex-cases.ts |
| ~ | `linkSplit`: the struck piece when two pieces stand on the instigator's ring | [layer-links.ts](../../packages/core/src/straight-skeleton/layer-links.ts) (`wavefront.ts` until BSA.D356) |
| ~ | `componentsOfRings`: a ring of two bisectors is its own component | [ring-components.ts](../../packages/core/src/straight-skeleton/ring-components.ts) |
| = | `linkMergeGap`, `linkVertexToVertex`, `contiguousRuns`, `bisectionsForMerge`, `clusterCoincidentMerges`, `mergesShareAnEdge`, `coincidentEventPositions`, `birthsClosedAtOneNode`, `exteriorFaceIsClosed` | layer-links.ts (the link writers and `birthsClosedAtOneNode`), vertex-event.ts (`contiguousRuns`, `bisectionsForMerge`), [coincident-events.ts](../../packages/core/src/straight-skeleton/coincident-events.ts) (the clustering), [wavefront-links.ts](../../packages/core/src/straight-skeleton/wavefront-links.ts) (`exteriorFaceIsClosed`) |
| = | `handleInteriorEdgePair`, `crossWireEdges`, `climbTerminalLadder`; `addBisectionEdge`'s zero-rate branch; `SkeletonDiagnosticKind` | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts), [terminal-ladder.ts](../../packages/core/src/straight-skeleton/terminal-ladder.ts) (`climbTerminalLadder`), [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts), types.ts |
| + | `holed-simultaneous-rings.test.ts`; ~ `holed-join-divide.test.ts` (its refusal block goes) | `packages/core/tests/straight-skeleton/` |

## 4. Decisions

### Scope

1. **Every rule of this spec is reached only in a step of more than one ring** (`multiRing` in `handleInteriorNGon`).
   The one exception is the piece rule of decision 17, which is reached only when more than one piece of a struck
   segment stands on the instigator's ring, and that needs a join earlier in the same layer.
   **AMENDED 2026-11-16** (BSA.D356): the local `multiRing` is gone; `handleInteriorNGon`'s phases test
   `rings.length > 1` (`resolveLayerEvents`, `refuseUnsettledLayer`), and a step of several rings leaves its children
   through `childrenOfSeveralRings`.
2. **The layer's event set is formed as today:** the same window, narrowing and clustering at δ. This spec changes only
   how a multi-ring layer's events are resolved and which of them are refused.

### A vertex event across rings

3. **A merge whose arrivals lie on more than one ring is a cross-ring vertex event.** It resolves whole exactly when
   `crossRingRuns` finds its arrivals to be one run on each of exactly two rings of the step at the layer's start, with
   neither run its whole ring (the runs are `contiguousRuns` per ring). Any other cross-ring merge refuses its layer
   (decision 21).
4. **The model, on the links.** Every arrival retires and two bisectors are born at the merge node, which is
   `linkMergeGap` applied to the cycle `(R1, R2)`:
   ```text
   X = {cw: cp(last R1), ws: wp(first R2)}   linked between ws(first R2) and cw(last R1)
   Y = {cw: cp(last R2), ws: wp(first R1)}   linked between ws(first R1) and cw(last R2)
   ```
   On two single arrivals, this is exactly the rewrite `linkVertexToVertex` makes (stage 1 decision 9).
5. **The pairing is forced, not chosen.** Two runs have one cyclic order. Each birth's widdershins neighbour has a
   clockwise parent equal to the birth's widdershins parent, so W2 holds by construction. Whether the event joined two
   rings or divided one is read from the rings it leaves (node 4 decision 10).
6. **`R1` is the run on the ring that comes first in the step's `rings`, and the births are returned as `[X, Y]`.**
   Both are partition births, ordered by `partitionArc` like any other.
7. **`asWholeEvents` admits such merges, so a multi-ring layer whose merges are each one-ring or two-run is resolved
   whole:** never narrowed and never pairwise. The pairwise fallback resolves a run of two arrivals as a pair collapse
   first, and that strands the other ring's arrival (A′, measured).
8. **The merge node is charged as every merge node is:** with the largest budget among its events, and with
   `chargeSitingResidual` over its two births.

### Head-on meeting of two rings

9. **A vertex of each ring meeting head-on is decision 4 with single arrivals.** It bears the two ridge bisectors along
   the two ridge lines. Each has anti-parallel parents, an outline wall and the hole wall facing it, so
   `addBisectionEdge`'s zero-rate branch gives it its clockwise parent's basis. **Worked example, A at (2,2):** outline
   corner `e8 (cw 0, ws 3)` meets hole corner `e12 (cw 4, ws 7)`. X is `(cw 0, ws 7)`, where wall 0 runs (0,0)→(0,10),
   so its basis is (0,1), up towards (2,8). Y is `(cw 4, ws 3)`, where wall 4 runs (4,4)→(6,4), so its basis is (1,0),
   towards (8,2). At (2,8) the partner `(cw 7, ws 0)` gets basis (0,−1), down towards (2,2). The two point at each
   other, as measured.
10. **No code path is specific to a head-on meeting.** The event reaches decision 3 as a cluster of
    `interiorNonAdjacent` reports, whatever `intersectRays` called the pair: `'head-on'` in A, `'converging'` at
    E′'s meeting.

### Fronts meeting along a line

11. **The ridge between two end nodes is the existing corridor.** Each end event bears a zero-rate midline. The two
    midlines link as a ring of two, and `handleInteriorEdgePair` closes that ring with each midline ending on the
    other's source: two half-edges, one per face. This is how a single loop's corridors already close.
12. **A ring of exactly two bisectors left by a multi-ring layer is its own child, and is not classified,** just as
    every ring a one-ring layer leaves is its own child. Its polygon has two points, so its `signedArea` is exactly 0,
    and node 4 decision 16 refused it. That refusal was the one failure point on A to F. A ring of two bounds nothing
    and cannot hold a hole.
13. **Weights change no mechanism.** Anti-parallel walls give a zero rate at any weights. The ridge comes at
    `t = gap / (w₁ + w₂)`, at `w₁·t` from wall 1 (C1: `4/3`). Fronts that meet along different lines at different
    times do so in different layers, each closed the same way (B).
14. **A ring of two whose births share one node is closed there, unborn** (edge-acceptance decision 32, node 4
    decision 52): this is a ridge of no length.
15. **Rings of three bisectors or more keep node 4's classification** by area sign and witness, and keep its refusal.

### Several events in one layer

16. **Within a layer, the merges are resolved first and whole, in canonical order, and the splits after them, in
    today's `byEventPriority` order.** A split whose instigator a merge has consumed is void, by `handleCollisionEvent`'s
    acceptance return. The rings a layer leaves do not depend on the order of its splits (measured with the splits
    reversed) or of its vertex events among themselves (measured with each kind shuffled, on the pairwise path). The rule of node 4 decision 19 that a join may not share its layer is retired.
    **AMENDED 2026-11-16** (BSA.D356): `byEventPriority` is gone. `resolveSplits` sorts the layer's splits, all of one
    priority, by their edge ids (`byEdgeIds`, `event-order.ts`), the order `byEventPriority` gave them.
17. **The piece rule.** In `linkSplit`, when the `from` of more than one piece of the struck segment stands on the
    instigator's ring, the struck piece is the first of those pieces whose closing cut lies ahead of the strike along
    the edge. That is the existing fallback's test, applied only to those pieces. Elsewhere the choice is today's.
    **Worked example, C2′:** bottom wall 3 runs (10,0)→(0,0), basis (−1,0), and its segment runs from the bisector at
    x = 26/3 to the one at x = 4/3. The strike at x = 22/3 resolves first and cuts the segment into P0, from x = 26/3 to
    22/3, and P1, from 22/3 to 4/3. After that join both pieces are on one ring. The strike at x = 8/3 reads
    `alongEdge(cut 22/3 → 8/3) = (8/3 − 22/3)·(−1) = +14/3`, which is not below 0, so P0 is passed over and P1 is taken.
    Today's rule takes P0, which is the measured wrong answer.
18. **A split whose instigator is an arrival of a merge, and whose struck segment's `from` or `to` is an arrival of
    that merge, is a re-report of the vertex event.** It is void under decision 16. F's hole corners are reported as
    strikes of the outline segment at its end.
19. **No rule reads join against divide.** `isJoin` and `crossRingCoincidence` are deleted, and node 4 decision 9's
    reading of a split as a join goes with them (node 4 decision 8 stands).

### What remains refused

20. **Refusals are decided once the layer's event set is final and before its first event is resolved,** so a refused
    layer changes no link, node or acceptance. They push `simultaneous-across-rings` naming the step, the case and the
    events, then throw (node 4 decision 20).
21. **A cross-ring merge that is not two runs is refused.** That covers three or more runs, two runs on one ring with a
    third ring, and a run that is its whole ring, because the pairing would then depend on the angular order around the
    node, which the links do not hold. So is a multi-ring layer that cannot be resolved whole (`mergesShareAnEdge`) and
    holds an interior event with participants on two rings.
22. **A meeting on a third front is refused.** This is a split whose instigator is an arrival of a merge while neither
    end of its struck segment is. The specimen is E′, where a corner of each hole meets the outline's bottom front at
    (10.5, 1.5).
23. **Two strikes at one point are not a separate case.** Two arrivals at one point at one time are clustered as one
    merge, and their splits fall under decision 18 or decision 22. No further guard is built.
24. **`multi-ring-step-refused` keeps exactly node 4's three causes,** except for the rings of two of decision 12:
    a multi-ring step with no event; one with a ring of fewer than three bisectors at its start; and an
    unclassifiable ring of three or more.
25. **The terminal ladder stays barred for multi-ring steps** (node 4 decision 23). Every fixture reaches its terminal
    states through one-ring children, so no multi-ring form is designed.

### The closed ridge ring

26. **Termination needs nothing new.** A's root layer leaves four rings of two, which close as decision 11 describes.
    No step input remains, and the solve ends as a single loop's does (node 4 decision 24).
27. **Acceptance is the approved predicate, unchanged:** at the step boundary after the corridors close, no live
    bisector names a wall, so every wall is accepted there.
28. **Each wall's face closes.** It is the wall, its two corner bisectors, and the ridge half-edge that names it. The
    ridge cycle is counted once per arc by `interiorGraphShape`, so its cycle rank is the hole count.

### Single-loop behaviour, tolerances, the oracle

29. **Kind (A), by construction.** Decisions 3 to 8, 12, 20 to 22 and the deletions of decision 19 are guarded by the
    step having more than one ring, and node 4's measuring run found no such step on one loop. Decision 17 is guarded by
    two pieces of a segment standing on the instigator's ring. On one ring, rings only divide within a layer: a split, a
    vertex-to-vertex event and a merge gap each divide, and nothing joins. So each ring holds at most one piece, by
    induction over the layer's cuts. Measured: 0 of 60 corpus solves reach it.
30. **No tolerance, window, constant or comparison moves.** Decision 12 reads a ring's size. Decision 17 reads the
    sign test already in `linkSplit`. The window, the moment bar and δ are unchanged.
31. **A divergence on a single-loop roster is diagnosed** under stage 1 decision 31 and BSA.D284. None is expected.
32. **Nothing outside `packages/core` changes.**
33. **C2 carries the causality oracle's known weight-blindness:** `offset e25` and `clearance n13`. They date its
    weight-2 wall's nodes by distance, while equi-time is clean. It gets whatever the lead rules for F4 under BSA.D307.
    It is not pinned here, as a defect or otherwise.

### Fixtures and expected answers

34. **B** is the outline [0,20]×[0,10] with the hole [3,8]×[3,6]. Every node is equidistant from its walls (`1e-9` of
    the extent); ridges carry two half-edges:

    | Node | Event | t | Position | Walls |
    |---|---|---|---|---|
    | J1 | head-on of outline (0,0) and hole (3,3) | 1.5 | (1.5, 1.5) | left, bottom, hole-left, hole-bottom |
    | J2 | hole corner (3,6) strikes the left wall | 1.5 | (1.5, 7.5) | left, hole-left, hole-top |
    | J3 | hole corner (8,3) strikes the bottom wall | 1.5 | (9.5, 1.5) | bottom, hole-bottom, hole-right |
    | P1 | outline (0,10) meets J2's (left, hole-top) bisector | 2 | (2, 8) | left, top, hole-top |
    | P2 | hole corner (8,6) strikes the top wall | 2 | (10, 8) | top, hole-top, hole-right |
    | Q1 | J3's (bottom, hole-right) meets P2's (hole-right, top) | 5 | (13, 5) | bottom, top, hole-right |
    | Q2 | outline (20,10) and (20,0) meet | 5 | (15, 5) | top, right, bottom |

    The ridges are J1–J2, J1–J3, P1–P2 and Q1–Q2. It has 15 nodes and 19 interior edges.
35. **D** is the union of [0,0,1000,300], [−250,300,300,700], [700,300,1300,700] and [0,700,1000,1000]. Its outline
    is the 12-gon (0,0), (0,300), (−250,300), (−250,700), (0,700), (0,1000), (1000,1000), (1000,700), (1300,700),
    (1300,300), (1000,300), (1000,0), and its hole is [300,700]². At t = 150 there are four head-ons: A1 (150,150) of
    the outline corner (0,0) and the hole corner (300,300), A2 (850,150), A3 (850,850) and A4 (150,850). There are also
    four strikes on the hole's side walls: S1 (150,450) by the outline corner (0,300), S2 (150,550) by (0,700), S3
    (850,450) by (1000,300) and S4 (850,550) by (1000,700). At t = 200, the wing pockets close at P1 (−50,500) and
    P2 (100,500), where S1's and S2's bisectors meet, and at P3 (900,500) and P4 (1100,500). The ridges are A1–A2, A4–A3,
    A1–S1, S2–A4, A2–S3, S4–A3, P1–P2 and P3–P4. It has 28 nodes, 36 interior edges and cycle rank 1.
36. **A** is the outline [0,10]² with the hole [4,6]². Its one layer is at t = 2, with nodes (2,2), (2,8), (8,8) and
    (8,2). Each node is an outline corner and the hole corner on its diagonal, and the ridges are the square's four
    sides. It has 12 nodes and 16 interior edges. **A′** cuts A's corner (0,0) by the edge (0, 4−2√2)–(4−2√2, 0), whose
    two bisectors and the hole corner (4,4) meet at (2,2) at t = 2; otherwise it is A, with 17 interior edges. **C1** is A
    with hole weight 2: t = 4/3, with nodes at 4/3 and 26/3. **C2** is A with bottom-wall weight 2. At t = 4/3 come the
    joins (8/3, 8/3) and (22/3, 8/3). At t = 2 come (2,4) and (8,4), where each outline bottom corner meets a join's
    bisector, and the head-ons (2,8) and (8,8), on one ring by then; it has 18 interior edges. **C2′** is C2 with the
    hole listed from (6,4), and has the same answer.
37. **E** is the outline [0,22]×[0,10] with the holes [3,9]×[3,7] and [13,19]×[3,7]. At t = 1.5 come the head-ons
    (1.5,1.5), (1.5,8.5), (20.5,8.5) and (20.5,1.5), and the strikes (10.5,1.5), (10.5,8.5), (11.5,1.5) and (11.5,8.5).
    At t = 2 the middle pocket closes at (11,2) and (11,8). It has 30 interior edges and cycle rank 2. **F** is two
    regular octagons of radius 10 and 4, with vertices at angles π/8 + kπ/4: one layer at t = 3cos(π/8), with 8 nodes
    at radius 7 on the vertex rays and 32 interior edges. **G** is node 4's centred diamond. Its strikes come at
    t = 4(√2−1), at (14−4√2, 5) and its turns, and its triangles at t = 4.5(2−√2), at (1+4.5√2, 1+4.5√2) and its
    mirrors. **H** is a centred square of half-diagonal 1.2 turned 0.3 rad: four strikes at one moment.
38. **Every solved fixture asserts node 4 decision 42's battery** and its closed form to `1e-9` of the extent; C2 and C1
    as decision 33 says. **E′** asserts its refusal by name: `complete: false`, `simultaneous-across-rings`, the
    message of decision 22, and no node made.
39. **Mutation gates, each turning a test red:**
    - Decision 12 removed: A, A′, B, C1, C2, D, E and F are refused.
    - `crossRingRuns` always `undefined`: A′ is refused. A to F pass pairwise, so A′ alone convicts it.
    - Decision 17 reverted: C2′ gives the wrong answer.
    - Decision 22 removed: E′ is refused under the other kind.
    - Decision 4's pairing swapped to `{cp(last R1), wp(first R1)}`: every head-on fixture fails.

    A unit test of `crossRingRuns` holds its cases: one run on each of two rings; two runs on one ring with a third
    ring; three rings; a whole ring.
40. **Single-loop identity is held by node 4 decision 40's gates:** the digests, the sweep harness, the census and
    building-shell's goldens. A measuring run must count zero multi-ring steps, zero strikes with two pieces on the
    ring, and zero cross-ring merges over those rosters.

### Amendments to earlier specs

41. **This spec amends [join and divide](./skeleton-join-and-divide-decisions.md) as follows:**
    - Decisions 2 and 18 to 21 are replaced by decisions 3 to 10 and 20 to 23 here.
    - Decision 9's join reading is retired.
    - Decision 16 no longer refuses a ring of two.
    - Decision 35's list of stops becomes decisions 21, 22 and 24.
    - Decision 44's refusal tests become fixtures A, B and G here.
    - Decision 45's three gates on the join reading and on the refusal are void.
42. **It also amends the [wavefront order](./skeleton-wavefront-order-decisions.md) spec's decision 12, and the piece
    choice BSA.D293 landed in `linkSplit`,** by decision 17.

### The lead's amendments on approval (BSA.D311)

43. **Decision 17 is the one rule inside a function a single-loop solve also runs, and its guard is measured before it
    is relied on.** The implementer's measuring run counts, over the corpus at both floors, the weighted fixtures, the
    census and the 642-cell sweep, every strike that finds more than one piece of its struck segment on the
    instigator's ring. The count must be zero on every single-loop solve. If it is not, decision 17 is not landed for
    those solves: the implementer stops, reports the solves, and the rule goes to the user, who has reserved any change
    to how single-loop events resolve (BSA.D301).
44. **What stays refused is a guard in production code and has an issue note** (BSA.D266). E′, two courtyards with
    every gap equal, is a realistic footprint. Its refusal test is green because it asserts the guard, never a wrong
    skeleton; and `ISSUE-skeleton-three-front-meeting-refused.md` records the input, the true skeleton of the Deferred
    section, and why the links cannot pair more than two runs.
45. **Decision 33 is settled by BSA.D309:** the clearance and offset oracles compare times. C1 and C2 assert no
    causality diagnostic, like every other fixture, and nothing of the oracle's is pinned.
46. **The whole-event resolution of decision 7 is kept over the smaller pairwise change,** on A′'s evidence: a pairwise
    path that is right on A to F and strands an arrival on A′ is right by the luck of the fixtures.

## 5. Deferred

- **Meetings of more than two runs, or on a third front (E′):** these need an angular pairing around the node, which
  the links do not carry. They stay refused, and E′'s true skeleton is the ridge rectangle (1.5,1.5)–(19.5,8.5) plus
  the ridge x = 10.5.
- **Whether a weighted fixture's oracle reports are pinned (C2, F4):** the lead's ruling under BSA.D307.
- **The holed roster and the loop-aware consumers:** node 6. **The dashboard:** node 7. **Building-shell:** node 9,
  whose spec should name this one in `depends_on` (BSA.D306).
