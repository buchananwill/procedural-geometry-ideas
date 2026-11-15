---
title: "Skeleton loop consumers: decision spec"
type: decision-spec
area: straight-skeleton
status: approved
date: 2026-11-15
part_of: [holed-skeleton-roadmap.md]
depends_on: [skeleton-join-and-divide-decisions.md]
---

# Skeleton loop consumers: decision spec

Node 6 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md), "loop-aware consumers and the holed roster",
written from BSA.F92, BSA.F94, BSA.D282, BSA.D284 and BSA.D294 and a reading of the files in the roster at `8170011`.
It is built on the loop table of [nodes 2 and 3](./skeleton-loops-input-decisions.md) and the holed solve of
[node 4](./skeleton-join-and-divide-decisions.md), and starts only when the node 4 spec is completed. Node 5
(simultaneous events across rings), node 7 (the dashboard) and node 9 (building-shell) are not in this document.

## 1. Intent

After node 4, `solveSkeleton` returns a complete skeleton for an outline with holes. This spec makes the post-solve
consumers in `packages/core/src/straight-skeleton/` read it. Offset projection and strip decomposition read every
loop. The tree-based consumers refuse a holed result with a named message, and a predicate tells a caller in advance
(BSA.D282). The holed fixtures become a roster in the fixtures package, outside `FULL_CORPUS`, and the invariant sweeps
run over it. **Building-shell's call, `computeStrips(result, {depth: computeMaxOffset(result)})`, gets one strip per
exterior edge of every loop, with its frontage on that edge, tiling the outline's area less the holes' (BSA.F94).**
**A single-loop result gives byte-identical output from every consumer** (BSA.D284).

## 2. Type and surface roster

`+` added, `~` changed, `=` unchanged but named because a reader will look for it. Line numbers are at `8170011`.

| | Surface | File |
|---|---|---|
| ~ | `rederiveInteriorNodeOffsets` (private): dates a node against its parent's own target node, line 402 | [offset-projection.ts](../../packages/core/src/straight-skeleton/offset-projection.ts) |
| ~ | `computeOffsetRings`, `computeOffsetRingsDetailed`, `projectOffsetWavefront`, `OffsetRing`: doc comments only | offset-projection.ts |
| = | `computeNodeOffsets`, `computeMaxOffset`, `collectAliveBisectors`, `requireProjectableResult` | offset-projection.ts |
| + | `requireSingleLoopResult(result, caller): StraightSkeletonSolverContext` | offset-projection.ts |
| ~ | `groupIntoRuns(graph, sameLogicalStreet)` line 793, `mergeShortRuns` line 880, `cornersBetweenStrips(graph, strips)` line 1024: per loop | [strip-decomposition.ts](../../packages/core/src/straight-skeleton/strip-decomposition.ts) |
| ~ | `exteriorEdgeLength` line 851, `frontageOf` line 920, `interiorAngleAt` line 1047: read edge targets | strip-decomposition.ts |
| = | `Strip`, `StripOptions`, `CornerContext`, `computeStrips`' signature; doc comments of `holes`, `sameLogicalStreet`, `minEdgeLength` change | strip-decomposition.ts |
| + | `skeletonHoleCount(graph: StraightSkeletonGraph): number` | [graph-helpers.ts](../../packages/core/src/straight-skeleton/graph-helpers.ts) |
| ~ | `buildSkeletonTree` refuses a holed result, line 147 | [skeleton-tree.ts](../../packages/core/src/straight-skeleton/skeleton-tree.ts) |
| ~ | `subdivideRecursively` refuses an options object carrying holes, line 550 | [recursive-subdivision.ts](../../packages/core/src/straight-skeleton/recursive-subdivision.ts) |
| = | `extractSpine`; `sliceStrip`, `sliceStrips`; `Region`, `makeRootRegion`; the three functions of debug-helpers.ts | [spine.ts](../../packages/core/src/straight-skeleton/spine.ts), [parcel-slicing.ts](../../packages/core/src/straight-skeleton/parcel-slicing.ts), [region.ts](../../packages/core/src/straight-skeleton/region.ts), [debug-helpers.ts](../../packages/core/src/straight-skeleton/debug-helpers.ts) |
| = | `checkWavefrontCausality`, moved onto every loop by node 4 (its decision 32) | [causality-check.ts](../../packages/core/src/straight-skeleton/causality-check.ts) |
| ~ | exports of `requireSingleLoopResult`, `skeletonHoleCount` | [index.ts](../../packages/core/src/index.ts) |
| + | `HoledTestPolygon`, `HOLED_TEST_POLYGONS`, `holedSolveOptions` | new `holed-fixtures.ts` in `packages/test-fixtures/src/`; [index.ts](../../packages/test-fixtures/src/index.ts) |
| ~ | `escapedNodes`; `deriveNodeArrivals`, `causalityViolations`' clearance, `rawOffsetsOfNode`; `primaryParentProblems`, `faceWalkFailures`; `digestOf` | [containment-helpers.ts](../../packages/core/tests/straight-skeleton/containment-helpers.ts), [wavefront-measurement-helpers.ts](../../packages/core/tests/straight-skeleton/wavefront-measurement-helpers.ts), [graph-index-invariants.test.ts](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts), [full-graph-digest.test.ts](../../packages/core/tests/straight-skeleton/full-graph-digest.test.ts) |
| + | `regionArea(graph): number`, `netRingArea(rings): number` | wavefront-measurement-helpers.ts |
| ~ | a holed `describe` in each sweep file; node 4's `holed-test-helpers.ts` and `holed-join-divide.test.ts` | `packages/core/tests/straight-skeleton/` |
| ~ | the `holed` group; `tiling`'s holed path | [sweep.ts](../../packages/core/tests/sweep-harness/sweep.ts), [README.md](../../packages/core/tests/sweep-harness/README.md) |

## 3. Decisions

### The rule for every site

1. **A site moves when it reads a ring by id arithmetic or takes `numExteriorNodes` as one ring's length.** A site that
   iterates every exterior id or every exterior node is loop-neutral and stays, because on a holed graph that is every
   loop. The lists below name every site of each file in the roster, each found by opening the file.
2. **The node after exterior edge `e` is read as `graph.edges[e].target`,** never `(e + 1) % numExteriorNodes`.
   `initBoundingPolygon` sets that target through `adjacentExteriorEdge` (graph-helpers.ts lines 143 to 150), so it is
   `(e + 1) % n` on one loop and needs no loop table. A site that needs loop membership (runs, corners) reads
   `graph.loops`.
3. **A single-loop result gives byte-identical output from every consumer:** the same strips in the same order, the same
   rings, the same offsets, the same refusals. A divergence is diagnosed, then fixed or accepted with a written reason
   and the lead's acceptance, never waved through and never a bare stop (BSA.D284).
4. **No tolerance, constant or comparison moves, and the C++ port is not a consideration** (BSA.D281). Changes are
   confined to `packages/core`, `packages/test-fixtures` and one paragraph of the project CLAUDE.md. The dashboard is
   node 7 and building-shell is node 9.

### Offset projection

5. **offset-projection.ts has one single-ring site, line 402,** the dating line `(parentEdgeId + 1) %
   exteriorEdgeCount`, which reads the parent's target node under decision 2. The zeroing of exterior nodes (line 350),
   the interior range (line 391), the per-edge segment loop (line 856) and `segmentsAlongExteriorEdge`, which reads the
   edge's own source and basis, are loop-neutral and stay.
6. **A holed projection returns a flat list of rings in today's types, with no nesting.** An outer ring is wound
   clockwise and has negative signed area. A ring round one or more holes is wound counter-clockwise, has positive
   signed area, and holds only hole edges (node 4, decision 14). Nesting is not returned: the winding sign is all the
   tiling needs, every caller of a holed projection in the repo is a test, and a field can be added later without
   changing any ring.
7. **Rings come in today's order,** the order in which `assembleRings` seeds them: a ring comes first when it holds
   the segment of the lowest exterior edge id.
8. **At offset 0 a projection returns one ring per loop, in loop order,** and ring `k` is exactly the positions of
   `graph.nodes[start_k .. start_k + count_k − 1]`, the outline clockwise and each hole counter-clockwise. On one loop
   that is today's "exactly one ring: the original polygon". At or past `computeMaxOffset` it returns `[]`, as today.
9. **`computeNodeOffsets` and `computeMaxOffset` change only by line 402.** Every loop's exterior nodes are at time 0,
   and the maximum offset is the time the last ring is consumed. The doc comments of `computeOffsetRings` and
   `OffsetRing.vertices` state decisions 6 and 8 in place of "clockwise" and "exactly one ring".

### Strip decomposition

10. **strip-decomposition.ts has these single-ring sites, each changed:** `groupIntoRuns` (lines 803, 806, 811, 820),
    `exteriorEdgeLength` (line 853), `mergeShortRuns` (lines 888, 892, 899, 911), `frontageOf` (line 923),
    `cornersBetweenStrips` (lines 1029, 1033, 1034) and `interiorAngleAt` (lines 1049, 1051). These are loop-neutral and
    stay: `buildAdjacency`, `faceIncidence`, `traceFace`, `traceFaceByGeometry`, `clipFaceToDepth`, `unionOfTiles`, the
    face loop of `computeStrips` (line 983), the corner transfer, and `exteriorScale`, whose box is the outline's
    because every hole lies inside it.
11. **`groupIntoRuns(graph, sameLogicalStreet)` groups each loop's edges on its own, and a run never holds edges of
    two loops.** Within a loop it applies today's rule, with the wrap taken inside the loop. `sameLogicalStreet(e,
    next)` is called once per exterior edge, where `next` is `adjacentExteriorEdge(graph, e, Clockwise)`. A run starts
    at the first edge not merged with its predecessor, and a loop whose every pair merges is one run of `start ..
    start + count − 1`. The runs are concatenated in loop order, so one loop gives today's calls in today's order.
12. **`mergeShortRuns` runs per loop, with today's floor of two runs per loop.** No junction lies between loops, so a
    merge cannot cross one. A single run on a hole loop would be the band that closes round the hole, which is the
    `holes` strip `sliceStrip` will not cut, the same reason the floor exists today.
13. **A strip of a hole edge is that edge's skeleton face, clipped:** `supportingEdgeIds` holds solved exterior ids,
    `boundary` is clockwise because the face lies to the right of the edge, and `frontage` runs from the edge's source
    to its target, counter-clockwise round the hole. A caller maps its own walls to exterior ids through
    `result.loopMaps[k].edgeToEdge`.
14. **With default options, `computeStrips` returns `numExteriorNodes` strips, and strip `i` has `supportingEdgeIds`
    `[i]` and `frontage` `[nodes[i], nodes[edges[i].target]]`.** This is the contract building-shell reads: one face
    per exterior edge of every loop, its frontage midpoint on that edge.
15. **Corners are taken per loop,** one between each pair of consecutive strips of a loop, wrapping inside the loop.
    A loop that is one strip has no corner, as `strips.length < 2` gives today. `vertexNode` is
    `graph.edges[incomingEdgeId].target`. The corners are visited in loop order and then strip order, and
    `CornerContext`'s strip indices keep indexing the whole returned array.
16. **`interiorAngleAt` reads the edges' targets and keeps its formula, because the building lies to the right of
    travel on every exterior edge:** the outline is clockwise and every hole counter-clockwise. Worked example: on F1's
    hole `(8,5.5), (7,6.5), (6,5.5), (7,4.5)`, at `(7,6.5)` `toBefore` is `atan2(−1, 1) = −π/4` and `toAfter` is
    `atan2(−1, −1) = −3π/4`, so the angle is `−π/2 + 2π = 3π/2`, which is reflex, and the mitre classifier returns
    `'none'`. At the outline's `(0,10)` it is `0 − (−π/2) = π/2`, which is convex.
17. **`Strip.holes` keeps its meaning: the counter-clockwise inner contours of the strip.** A holed input adds one more
    source of them. A run that covers a whole hole loop is a band round that hole, and its inner contour is the hole's
    own wall. `sliceStrip` returns such a strip whole, as it returns every strip with a hole today. The doc comment
    states both sources.
18. **The tiling identity on a holed result is `Σ area(strip) + Σ −signedArea(ring) = area(outline) − Σ area(hole)`.**
    Worked example on F1 at depth `t = 0.5`, before the join at `2√2 − 2`: the outline ring has signed area `−(10 −
    2t)² = −81`, the hole ring `+(√2 + 2t)² ≈ +5.83`, and the swept bands `19 + 3.83 = 22.83`. The sum is
    `22.83 + 81 − 5.83 = 98 = 100 − 2`. Summed as absolute areas it would come to `109.66`.

### The tree-based consumers refuse

19. **`skeletonHoleCount(graph)` is `max(0, graph.loops.length − 1)`, and a caller tests it against zero before
    calling a tree-based consumer.** A merged graph carries `loops: []` and has no hole, so it reads 0.
20. **`requireSingleLoopResult(result, caller)` runs `requireProjectableResult` and then refuses a holed result by a
    throw:**
    ```text
    ${caller} requires a skeleton of one loop, but this result has ${h} hole(s): the skeleton of a region with holes
    has a cycle round each hole and is not a tree. computeStrips and computeOffsetRings read every loop.
    ```
21. **`buildSkeletonTree` calls `requireSingleLoopResult` in place of `requireProjectableResult`, so `isTree` is never
    computed on a holed skeleton.** It would always be false there (`h` more edges than a tree has), and `isTree`
    false means a solver defect, so it would report a correct skeleton as broken.
22. **`extractSpine` refuses through its input.** A `SkeletonTree` of a holed result cannot be built, so spine.ts does
    not change.
23. **`subdivideRecursively` throws when `options` carries a non-empty `holes`,** naming itself and `computeStrips`.
    Otherwise it takes one ring by type and solves it without holes (line 734), so ignoring the field would solve the
    outline alone and say nothing. That is the guard nodes 2 and 3 put on the legacy entries (their decision 4).
24. **Parcel slicing gets no runtime refusal, because a `Strip` carries no loop and no graph.** No caller in the repo
    slices a holed result: `git grep -n "sliceStrip" 8170011 -- packages apps ":!*.test.ts"` finds, beyond
    parcel-slicing.ts and doc comments, only the dashboard's `parcel-pipeline.ts`, which solves the one ring of the
    polygon store. The recursive driver does not slice.
    `Region` and `makeRootRegion` take one boundary by type and hold no skeleton, so region.ts does not change.
25. **debug-helpers.ts does not change.** `computePrimaryInteriorEdges` wraps the caller's own vertex array (lines 133,
    135, 140, 153, 156) and so takes one ring by type. `generateCollisionSweep` (line 38) and
    `computeNodeOffsetDistances` (line 69) iterate every exterior id, which makes them loop-neutral. Drawing holed
    fixtures is node 7.
26. **causality-check.ts is node 4's (its decision 32: line 85 and the boundary of lines 155 to 162),** and this spec
    adds nothing to it.

### The holed roster

27. **A holed fixture is one record holding the outline, its weights and its holes:**
    ```ts
    export interface HoledTestPolygon {
        name: string;
        outline: Vector2[];
        weights?: number[];        // the outline's, as SolveSkeletonOptions.weights; omitted means all ones
        holes: SkeletonHole[];     // each with its own optional weights (nodes 2 and 3, decision 2)
    }
    export const HOLED_TEST_POLYGONS: HoledTestPolygon[];
    export function holedSolveOptions(fixture: HoledTestPolygon, options?: SolveSkeletonOptions): SolveSkeletonOptions;
    ```
    `holedSolveOptions` returns `{...options, weights: fixture.weights, holes: fixture.holes}`. It is the one way any
    sweep solves a holed fixture.
28. **`HOLED_TEST_POLYGONS` is a third roster, outside `CLEAN_TEST_POLYGONS`, `KNOWN_DEFECT_POLYGONS` and
    `FULL_CORPUS`.** A `{name, vertices}` cannot hold a hole. The single-loop sweeps also pin `FULL_CORPUS` at 53 clean
    and 7 defect entries and 60 digests, and `FULL_CORPUS` goes on meaning every single-loop fixture. The project
    CLAUDE.md's test-fixtures section gains one sentence naming this roster as outside `FULL_CORPUS`, and its counts
    are set to the measured 53 and 7.
29. **The roster holds node 4's fixtures, moved verbatim out of `holed-join-divide.test.ts`, in this order:**
    `Holed F1: turned square`, `Holed F1 stretched`, `Holed F2: two holes`, `Holed F3: L-shaped hole`, `Holed F4:
    weighted hole`, `Holed F5: reflex outline divides`, `Holed F5 mirrored`, `Holed F6: hole near a wall`, `Holed F7:
    deep hole`. Node 5 adds the concentric square and its other fixtures when they solve. Node 4's refusal specimens
    (its decision 44) stay in node 4's file until then.
30. **Weighted holed fixtures live in this roster,** and F4 is the first. A holed fixture is already a record and not a
    bare ring, and the weights travel on it, so the reason `WEIGHTED_TEST_POLYGONS` stands apart (W-spec W50) does not
    apply. Every sweep solves through `holedSolveOptions`.
31. **No holed fixture is ever pinned as a defect or held out.** A holed fixture that fails stays in the roster, its
    cell is a red test, and it gets an issue note (BSA.D266, BSA.D284). There is no holed counterpart of
    `KNOWN_DEFECT_POLYGONS`.

### The sweeps over the holed roster

32. **Each invariant keeps one definition, in its own sweep file,** with a `describe` over `HOLED_TEST_POLYGONS`
    beside the single-loop one. That is skeleton-containment, strip-tiling, wavefront-causality, offset-projection,
    graph-index-invariants, full-graph-digest and solve-result.
33. **Node 4's holed helpers are promoted, not duplicated.** Every helper named in its decision 43 is generalised in
    its home file under decision 2, and its copy in `holed-test-helpers.ts` is deleted. That file keeps only what has
    no home, such as the cycle rank. Node 4's per-fixture assertions (its decision 42) move into these sweeps. Two stay
    in `holed-join-divide.test.ts`: `checkWavefront` at every step boundary, iterated over the roster, and F1's closed
    form (its decisions 47 to 49). The traced-face area sum is retired, because the strip tiling at depth fraction 1.0
    asserts the same identity through `computeStrips`.
34. **Containment:** `escapedNodes(polygon, options?)` passes `options` to `solveSkeleton` and reports a node outside
    the outline, or inside any hole of `options.holes`, beyond `containmentTolerance(outline)`. With `options` omitted
    the call is today's. A second test asserts every interior node strictly inside the outline and strictly outside
    every hole by `isInside`.
35. **Tiling:** at depth fractions 0.2, 0.5 and 1.0 of `computeMaxOffset`, the relative miss of
    `Σ stripArea + netRingArea(rings)` against `regionArea(graph)` is under `TILING_TOLERANCE` (1e-14). `regionArea` is
    `Σ_k −signedRingArea` of loop `k`'s nodes, and `netRingArea` is `Σ −signedRingArea(ring)`. The single-loop
    `tilingError` keeps its absolute ring areas, so no single-loop number moves.
36. **Causality:** at floors 1e-6 and 1e-5, the solver's `causality-violation` count equals the test oracle's per
    oracle and is zero, and the `rate` ids agree id for id. The clearance boundary of `causalityViolations` becomes
    each exterior edge's own segment, and `deriveNodeArrivals` and `rawOffsetsOfNode` date against the parent's
    target.
37. **Graph index:** I1's widdershins parent is `adjacentExteriorEdge(graph, source, Widdershins)` in place of line 140.
    I4's goal is `graph.edges[e].target` in place of line 609. I2 reads the generalised `deriveNodeArrivals`. I3 (line
    415) and I5 read edge targets already and stay. A holed block adds the cycle rank: the interior-edge graph, with
    node pairs counted once, is connected and has rank equal to the hole count.
38. **Offset projection:** at 0.2 and 0.5, `unclosedChains` is empty, every ring's sign obeys decision 6, and every
    segment of an inner ring is a hole edge. At offset 0 the rings equal the loops, exactly (decision 8).
39. **Strips:** decision 14 is asserted on every holed fixture at `depth: computeMaxOffset(result)`, with each
    frontage midpoint within the test tolerance of its edge and the areas tiling at 1e-14. A recording `classifyCorner`
    asserts that no corner joins two loops, and checks each corner's edge lengths and interior angle against the
    fixture's own geometry.
40. **Digests:** `digestOf(vertices, options?)` solves with `options`, and the serialiser is unchanged, because the
    exterior targets of section (c) carry the loop table. `HOLED_PINNED_DIGESTS` is a second table, measured on the
    first green run, with a determinism test and a coverage test against the roster's names.
41. **Solves completely:** every holed fixture is `complete`, with no `step-failure`, `unresolved-edges`,
    `simultaneous-across-rings` or `multi-ring-step-refused`, and with `loops.length` equal to its hole count plus one.
42. **Refusals:** `buildSkeletonTree` and `subdivideRecursively` each throw on F1 with the message of decision 20 or
    23, and `skeletonHoleCount` reads 1 on F1, 2 on F2 and 0 on `Square`.

### The sweep harness

43. **The harness gains a group `holed`:** each holed fixture at floors 1e-6 and 1e-5, at the six decades `1e8` to
    `1e13` through `place` applied to every loop, and at the eight jitter seeds at 1×, applied to every loop in loop
    order. That is 16 cells per fixture, 144 for nine fixtures, against 642 root cells today, so about a quarter more
    root-cell time. It adds no regions, because the recursive driver refuses holes.
44. **`tiling` takes decision 35's holed path when `skeletonHoleCount` is non-zero, and keeps its own code otherwise.**
    `buildSkeletonTree`'s refusal leaves `isTree` undefined through the existing `catch`. The README's grid table
    gains the row. Harness cells are records compared between trees, not tests: a failing holed cell is listed in the
    implementer's report.
45. **Every record of the six existing groups and the regions stays byte-identical.**

### Gates

46. **The baseline is measured before the first edit:** the `@proc-geo/core` Jest and `@proc-geo/building-shell` Vitest
    figures, and the harness's records.
47. **Single-loop byte identity is held by full-graph-digest's 60 pins, the harness's existing records, the recursion
    census, the strip and offset-projection suites, and building-shell's golden drift test.**
48. **Mutation gates, each turning a named test red:**
    - `groupIntoRuns` wrapping over all ids (a strips test with `sameLogicalStreet` always true on F2, one run per loop);
    - `frontageOf` by modulo (decision 39 on the outline's last edge);
    - `exteriorEdgeLength` and `interiorAngleAt` by modulo, and corners over all strips (the recording classifier);
    - `mergeShortRuns` across loops (a `minEdgeLength` test on F2);
    - line 402 restored (a node dated against a loop's last edge, named by the test);
    - `netRingArea` by absolute areas (F1 at 0.2);
    - `escapedNodes` ignoring holes (a constructed node inside a hole);
    - I1, I4, `deriveNodeArrivals` and the clearance ring by modulo (the holed sweeps, each naming its fixture, or a
      constructed graph where no fixture reaches the site);
    - each refusal removed (decision 42).

## 4. Deferred

- **Subdivision, spines and parcels of a holed region:** not this arc (BSA.D282, and the vision's last section).
- **Nesting of offset rings:** decision 6. **The dashboard's holed fixtures and overlays:** node 7.
- **Contact between loops:** node 8. **Building-shell on the holed solve, and its reference area:** node 9.

## 5. Retirement

- Node 4's holed copies in `holed-test-helpers.ts` of every helper decision 33 generalises.
- The fixtures inline in `holed-join-divide.test.ts`, moved to `holed-fixtures.ts`.
- The traced-face area sum of node 4's decision 42, superseded by decision 35.
