---
title: "Skeleton loops input: decision spec"
type: decision-spec
area: straight-skeleton
status: completed
date: 2026-11-14
part_of: [holed-skeleton-roadmap.md]
depends_on: [skeleton-wavefront-order-decisions.md]
verified_by: [packages/core/tests/straight-skeleton/skeleton-loops-input.test.ts, packages/core/tests/straight-skeleton/full-graph-digest.test.ts]
---

# Skeleton loops input: decision spec

Nodes 2 and 3 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md), as one unit of work, written from BSA.F91
to BSA.F94 and a reading of the files in the roster. It is built on the stored wavefront of
[stage 1](./skeleton-wavefront-order-decisions.md) and starts only when that spec is completed. Roadmap nodes 4 and 6 to
9 are not in this document, and nothing here builds them.

## 1. Intent

`solveSkeleton` takes one closed outline today. This spec lets it take an outline and any number of holes, each hole
with its own per-edge weights (BSA.D284). Every loop goes through the boundary stage, and each step of that stage is
fixed below as per loop or global. Holes are wound opposite to the outline, so the building lies on the same side of
every exterior edge (BSA.D282). Loops that cross, touch or nest wrongly are refused at the door. The graph gains a loop
table, exterior ids run the outline first and then each hole in the order given, and initialisation builds one
wavefront ring per loop. **A holed solve then stops:** it returns its initialised graph with a `holes-not-solved`
diagnostic and `complete: false` until node 4 gives it a join event. **A single-loop input solves to the byte-identical
graph.**

## 2. Type and surface roster

`+` added, `~` changed, `=` unchanged but named because a reader will look for it.

| | Surface | File |
|---|---|---|
| + | `SkeletonHole { vertices: readonly Vector2[]; weights?: readonly number[] }`, `HoleOptions { holes?: readonly SkeletonHole[] }` | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) |
| ~ | `SolveSkeletonOptions extends PerceptualFloorOptions, WeightOptions, HoleOptions`; `solveSkeleton`'s signature unchanged | algorithm-termination-cases.ts |
| = | `runAlgorithmV5`, `runAlgorithmV5Stepped`, `canonicaliseForSolve`: signatures and options types unchanged | algorithm-termination-cases.ts |
| + | `SkeletonLoop`, `SkeletonLoopMap`; `StraightSkeletonGraph.loops`; `SkeletonSolveResult.loopMaps`; `SkeletonDiagnosticKind` gains `'holes-not-solved'` | [types.ts](../../packages/core/src/straight-skeleton/types.ts) |
| + | `adjacentExteriorEdge(graph, exteriorEdgeId, direction: SkeletonDirection): number`, `loopOfExteriorEdge(graph, exteriorEdgeId): number` | [graph-helpers.ts](../../packages/core/src/straight-skeleton/graph-helpers.ts) |
| ~ | `initBoundingPolygon(nodes, weights?, loops?)` | graph-helpers.ts, line 43 |
| ~ | `makeStraightSkeletonSolverContext(nodes, perceptualFloor?, weights?, loops?)` | [solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts) |
| ~ | `initInteriorEdges(context)`: one ring per loop | [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) |
| ~ | `mergeSkeletonGraphs`: the merged graph carries `loops: []` | [graph-merge.ts](../../packages/core/src/straight-skeleton/graph-merge.ts) |
| + | `LoopConflict`, `findLoopConflict(loops, perceptualFloor): LoopConflict \| null`, `LoopGroup { outline: number; holes: number[] }`, `groupLoopsByNesting(loops, options?): LoopGroup[]` | new file `skeleton-loops.ts` beside the others |
| ~ | exports of every `+` above | [index.ts](../../packages/core/src/index.ts) |
| = | `checkWavefront`, `ringsOfWavefront` (stage 1) | `wavefront.ts` |
| = | `makeSkeletonNormalisation` (line 213), `canonicalisePolygon` (line 240) | [normalisation.ts](../../packages/core/src/straight-skeleton/normalisation.ts), [canonicalisation.ts](../../packages/core/src/straight-skeleton/canonicalisation.ts) |
| = | `findFirstCrossing` (line 57), `decomposePolygon` (line 195) | [polygon-decomposition.ts](../../packages/core/src/straight-skeleton/polygon-decomposition.ts) |
| = | `segmentSegmentIntersection` (line 22), `isClockwise` (line 91); `distanceToSegment` (line 111); `isPointInPolygon` (line 106); `degenerateAreaBar` | [geometry-helpers.ts](../../packages/core/src/random-polygon/geometry-helpers.ts), [vertex-budget.ts](../../packages/core/src/stroke-spline/vertex-budget.ts), [polygon-slope.ts](../../packages/core/src/terrain/polygon-slope.ts), [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) |
| = | `checkWavefrontCausality`, body unchanged | [causality-check.ts](../../packages/core/src/straight-skeleton/causality-check.ts) |
| = | the dashboard's solve boundary and scene adapter | [skeleton-solve-boundary.ts](../../packages/dashboard/src/hooks/skeleton-solve-boundary.ts), [skeletonToScene.ts](../../packages/dashboard/src/scene/adapters/skeletonToScene.ts) |

## 3. Decisions

### Input and result

1. **The first argument of `solveSkeleton` stays the outline, and holes arrive on `options.holes`.** Omitted or empty
   means a single-loop solve. Every caller today passes one ring, so none of them changes.
2. **A hole's weights travel on the hole object,** with the meaning of `WeightOptions.weights`; omitted or empty means
   all ones, and `options.weights` stays the outline's. No parallel array can then disagree with the hole list.
3. **The result contract grows by three additive fields,** and nothing existing changes meaning:
   ```ts
   interface SkeletonLoop { start: number; count: number }   // exterior ids start .. start + count - 1
   interface SkeletonLoopMap {
       vertexToNode: number[];   // caller vertex i -> exterior node id, or REMOVED_VERTEX_INDEX
       edgeToEdge: number[];     // caller edge i (vertex i to i + 1) -> the exterior edge id that carries it
       reversed: boolean;        // winding normalisation reversed this loop
   }
   StraightSkeletonGraph.loops: SkeletonLoop[];
   SkeletonSolveResult.loopMaps: SkeletonLoopMap[] | null;   // index 0 the outline, then holes in the order given
   ```
4. **`runAlgorithmV5` and `runAlgorithmV5Stepped` take no holes,** and their options type does not gain the field. An
   options object that carries a non-empty `holes` anyway is refused, naming `solveSkeleton`: `runAlgorithmV5` throws,
   and the stepped entry returns no snapshots and the message on `error`. Neither has a diagnostics channel, so a holed
   run would come back silently incomplete, and ignoring the field would silently solve the outline alone. The stepped
   entry gains holes with roadmap node 7.
5. **`canonicaliseForSolve` stays single-loop;** a holed caller reads `loopMaps` from the result.

### The loop table

6. **The loop table is plain data on the graph,** because stepped snapshots clone the graph only (BSA.F93). Loop 0 is
   the outline and loop `k` is hole `k - 1`. Loops are contiguous from 0, each `count` is at least 3, and the counts sum
   to `numExteriorNodes`. An exterior node's id equals its exterior edge's id.
7. **Exterior ids run the outline first, then each hole in the order given,** each loop in its solved vertex order
   (after canonicalisation and winding). The outline's ids are therefore exactly today's.
8. **`adjacentExteriorEdge` is the one accessor for the next or previous exterior edge.** `Clockwise` returns the edge
   leaving the given edge's target node, `start + (i - start + 1) mod count`; `Widdershins` returns the edge arriving at
   its source node. The names are ring-relative, as the bisector parents use them. `loopOfExteriorEdge` returns the
   loop index. Both throw on an id that is not an exterior edge and on a graph whose `loops` is empty.
9. **This spec moves three readers onto the accessor and no others:** the exterior edge target in
   `initBoundingPolygon`, the widdershins parent in `initInteriorEdges`, and the first-ring links. Arithmetic on one
   loop's own local array (the visible-corner test, the pins, `reverseWeights`, canonicalisation's chord) stays local,
   because each is called once per loop. The post-solve `% numExteriorNodes` readers (BSA.F92) move in node 6.
10. **`initBoundingPolygon` and `makeStraightSkeletonSolverContext` take an optional `loops`;** omitted means one loop of
    all the nodes, so every direct test caller stays as it is. A table that does not tile the nodes, or holds a count
    below 3, is thrown.
11. **A merged graph carries `loops: []`,** and the accessors throw on it by name. Its exterior ids are not
    `0 .. numExteriorNodes - 1` (graph-merge.ts says so for `exteriorWeights`), so no table can describe them. A holed
    input never reaches the merge.

### Initialisation

12. **`initInteriorEdges` builds one ring per loop, in loop order.** The bisector at local vertex `j` of loop `k` has
    source node and clockwise parent `start_k + j`, and the accessor's `Widdershins` answer as its widdershins parent.
    Creation follows exterior id order, so a single loop gets today's ids.
13. **The first links make one ring per loop,** wrapping within the loop, and W1 to W4 of the stage 1 spec hold after
    initialisation. The root step input holds every bisector, a union of whole rings, which stage 1's W3 permits.
14. **A bisector's first `maxOffset` tests every exterior edge of every loop, as today.** BSA.F91 reads this as
    loop-neutral: a hole wall bounds an outline bisector's life exactly as an outline wall does.
15. **Hole bisectors take their direction from `addBisectionEdge` unchanged.** It makes the offset rate against the
    clockwise parent non-negative, which puts every bisector on one side of its parents; with the hole wound opposite,
    that side is the building. So a corner that is convex in the hole's own shape is reflex in the region. Worked
    example: a square hole gives four bisectors with `isReflexEdge` true; an L-shaped hole gives five, and one that is
    not, at the L's inner corner.

### The boundary stage

16. **Vertex count and finiteness are checked per loop, before normalisation, by a throw.** The outline's messages stay
    word for word; a hole's are the same text prefixed `Hole k: `, `k` being the caller's hole index.
17. **Normalisation is global:** one `SkeletonNormalisation` from the bounding box of all loops together. One solve has
    one unit space, and the result's `normalisation` then describes every loop.
18. **The weight door runs per loop for length, finiteness, positivity and the visible-corner test,** the last with each
    loop's own wraparound, so a hole's last edge meets its own first edge and not the next loop's.
19. **The weight ratio and the division by the smallest weight are global,** across every edge of every loop, and the
    visible-corner test reads `Δw` on the globally divided weights. The ratio bound protects the narrowest simultaneity
    window, edges of different loops meet in events, and the solve has one time unit (W-spec W4). A ratio refusal names
    each extreme edge with its loop.
20. **Canonicalisation runs per loop, at the one noise floor.** A loop's pins are its own weight-change vertices, no loop
    is reduced below three vertices, and each loop that loses vertices gets its own `vertices-canonicalised`
    diagnostic, the outline's in today's text and a hole's prefixed `Hole k: `.
21. **Winding is set per loop: the outline clockwise and each hole counter-clockwise,** by `isClockwise` (signed area
    below zero). A reversed loop's weights go through `reverseWeights`, and each reversed loop gets one
    `winding-normalised` diagnostic, which for a hole names it and the winding it was given.
22. **With `normaliseWinding: false`, a single loop solves as today and a holed input with a mis-wound loop is refused by
    a throw.** The option says the caller's winding is already right, and a holed solve has no meaning on the wrong side
    of a wall (BSA.D282).
23. **The loop relation checks run after canonicalisation and winding, in unit space, at the perceptual floor δ,** on the
    loops the solver will be given. `decomposePolygon` never sees a holed input, because it discards a counter-clockwise
    ring as an exterior island (BSA.F93).

### The caller's map

24. **`loopMaps[k]` maps loop `k` of the caller's input onto the solved graph,** built from canonicalisation's
    `indexRemap` and then the reversal. A surviving vertex maps to its exterior node. A caller edge maps to the solved
    edge that carries it, which, when its start vertex was removed, is the merged edge from the nearest surviving vertex
    before it. Reversal sends local vertex `c` of an `m`-loop to `m - 1 - c` and local edge `c` to `m - 2 - c` (mod `m`),
    the map `reverseWeights` already uses. Worked example: a hole given clockwise as `[a, b, c, d]` at start `s`, with
    nothing removed, is solved as `[d, c, b, a]`; `vertexToNode` is `[s+3, s+2, s+1, s]`, and caller edge 0 (`a` to `b`)
    maps to `s+2`, the solved edge from node `s+2` (b) to node `s+3` (a).
25. **`loopMaps` is `null` exactly when `context` is `null`,** on the self-intersecting single-loop path, because the
    decomposition renumbers. Every other solve carries a map per loop, reversal included, which closes BSA.F93's gap
    for single loops too.

### Refusals

26. **Every refusal is a throw** naming its kind, the loops and the caller's own vertex index, translated through the
    loop's map. This matches the boundary today: a throw is for input the solver cannot solve, and `diagnostics` is for a
    solve that ran and came back degraded. "Refused with a diagnostic" in BSA.D284 is read as a message naming the place.
    No refusal adds a tolerance: each comparison reads δ, a helper's own arithmetic bar, or an exact predicate.
27. **`findLoopConflict(loops, perceptualFloor)` returns the first conflict in the order of decisions 28 to 32, or
    `null`,** with `loops[0]` the outline. `solveSkeleton` and `groupLoopsByNesting` both call it.
    ```ts
    interface LoopConflict {
        kind: 'self-crossing' | 'degenerate-hole' | 'crossing' | 'contact' | 'hole-outside-outline' | 'hole-inside-hole';
        loops: number[];   // the loop indices involved, 0 = the outline
        edges: number[];   // one loop-local edge index per entry of `loops`; empty for the two nesting kinds
    }
    ```
28. **A holed input with a self-crossing loop is refused,** by `findFirstCrossing` on each loop. A single loop with no
    holes still decomposes, as today. **A hole whose area is under `degenerateAreaBar(δ, perimeter)` is refused,**
    because its signed area has no sign the solver can trust.
29. **Two loops cross** when `segmentSegmentIntersection` finds a hit between an edge of each that is not an endpoint
    touch at δ on either edge, the rule `findFirstCrossing` applies. Crossing is refused permanently.
30. **Two loops are in contact** when an edge of each, not crossing, lie closer than δ: the least of the four
    endpoint-to-segment distances by `distanceToSegment` is strictly under δ. This catches a shared wall, which
    `segmentSegmentIntersection` misses because it returns `null` for parallel segments, as well as a shared point and a
    near-contact. δ is the client's bar for "two things or one". Contact is refused until roadmap node 8.
31. **Nesting is decided by one vertex,** which is sound once no two loops cross or touch: vertex 0 of each hole must lie
    inside the outline by `isPointInPolygon`. No vertex is then within δ of another loop, so that test's ambiguity on a
    boundary cannot arise.
32. **A hole whose vertex 0 lies inside another hole is refused** by the same test.

### What a holed solve returns until node 4

33. **A holed solve stops after initialisation and never calls `stepAlgorithm`.** A strike across two rings would be
    built as a split (BSA.F91), and a ring that divides while another shares its step has no rule before node 4, so
    stepping could return a wrong skeleton that looks complete.
34. **It returns the initialised graph, denormalised,** with its context, the weights concatenated in exterior id order,
    `loopMaps` and `complete: false`. The diagnostics run: the boundary stage's, `holes-not-solved`, any causality
    violations, then `unresolved-edges` naming every initial bisector.
35. **`holes-not-solved` is blocking,** so it makes `complete` false by itself. Its detail gives the hole and ring counts
    and says the solve waits for the join event of roadmap node 4. The holed tests assert this state as specified
    behaviour; BSA.D284's red-test rule for a failing holed fixture applies from node 4, which replaces them.
36. **`checkWavefrontCausality` runs on the holed graph unchanged.** With no interior node and no target, the offset,
    clearance and direction oracles read nothing; the rate oracle reads parents and bases only, which are loop-neutral.
    Its single-ring arithmetic (`(parent + 1) % edgeCount` at line 85, the clearance ring at line 155) moves in node 6,
    and node 4's spec states what the check does once a holed solve produces interior nodes.

### The grouping helper

37. **`groupLoopsByNesting(loops, options?: PerceptualFloorOptions)` groups closed, simple loops into outline-and-holes
    inputs by nesting depth** (BSA.D282). A loop's depth is the number of other loops containing its vertex 0; an even
    depth is an outline, and an odd depth is a hole of its deepest container. Groups are ordered by outline index and
    holes by index, winding is ignored, and the result is indices, so each caller carries its own weights across.
38. **The helper refuses crossing and contact between any two loops by a throw,** with the crossing and contact tests
    of `findLoopConflict` run directly, in one normalisation over all the loops, because loops in different groups are
    solved apart and only the helper sees them together. It does not run `findLoopConflict` whole: that returns the
    first conflict in decision order, so a self-crossing or degenerate loop would mask a crossing or contact behind it
    (BSA.D297). It leaves self-crossing and degenerate area to each group's solve. The solver never calls it. The helper measures δ in the unit
    space of all the loops and each group's solve measures it in that group's own, so a pair of loops near δ apart may
    pass the helper and be refused by the solve. The solve's verdict stands: it is a throw, so the difference is
    signalled and never silent.

### Boundaries

39. **There is one boundary pipeline, and a single loop is its one-loop case,** so byte identity proves that case and
    two pipelines cannot drift. It branches on the hole count in three places only: a self-crossing loop decomposes
    without holes and is refused with them, a mis-wound loop under `normaliseWinding: false` is refused only with holes
    (decision 22), and a holed solve stops after initialisation.
40. **No tolerance, window, constant or comparison moves, and the C++ port is not a consideration** (BSA.D281).
41. **Nothing outside `packages/core` changes.** The dashboard, the fixtures package and building-shell compile and pass
    untouched; the graph and result literals in core's own tests gain the new fields.

### Gates

42. **The baseline is measured before the first edit:** the `@proc-geo/core` Jest and `@proc-geo/building-shell` Vitest
    figures.
43. **Byte identity for single-loop input is held by
    [full-graph-digest.test.ts](../../packages/core/tests/straight-skeleton/full-graph-digest.test.ts), the sweep
    harness, the recursion census and building-shell's golden drift test.** A divergence is diagnosed, then fixed or
    accepted with a written reason and the lead's acceptance, never waved through and never a bare stop (BSA.D284,
    stage 1 decision 31).
44. **A single-loop test asserts** `loops` is `[{start: 0, count: n}]`, `loopMaps[0].vertexToNode` equals
    `canonicaliseForSolve`'s `indexRemap` on a clockwise fixture, and the map is decision 24's reversal on a
    counter-clockwise one.
45. **The holed initialisation tests** take an off-centre turned square hole, two holes, an L-shaped hole, a weighted
    hole, a hole given clockwise, and a hole with a collinear vertex. Each asserts one ring per loop, with
    `ringsOfWavefront` giving loop `k`'s bisectors in vertex order; `checkWavefront` empty over the root input; decision
    15's reflex classification; `exteriorWeights` per loop; no causality diagnostic; `holes-not-solved` and
    `complete: false`; and both endpoints of every caller edge within the test tolerance of the edge `loopMaps` names.
46. **Each refusal has a test that throws and names the offender:** a two-vertex hole, a non-finite hole vertex, each
    weight-door refusal on a hole, a ratio within bound per loop and out of bound across loops, a self-crossing hole, a
    self-crossing outline with a hole, a hole crossing the outline, two holes crossing, a hole outside the outline, a hole
    in a hole, a hole vertex on an outline edge, a shared length of wall, a gap just under δ, a mis-wound hole under
    `normaliseWinding: false`, a degenerate hole, and `holes` on each legacy entry. A gap just over δ is accepted.
47. **The helper's tests** cover two islands, an island in a courtyard (depth 2), input order, and an island touching
    its courtyard.
48. **Mutation gates, each turning a test red:** a widdershins parent wrapped over all ids; a hole left unreversed; the
    contact test reduced to `segmentSegmentIntersection`; a per-loop weight ratio; a per-loop normalisation; `loopMaps`
    without the reversal; `holes-not-solved` not pushed; the nesting test dropped; the legacy entries' guard removed.

### Amendments after the review (BSA.D299)

49. **A loop of a holed input that touches itself is refused as `contact`, with both entries of `loops` the same
    loop.** Two edges of one loop that share no vertex and lie closer than δ, by decision 30's distance test, are a
    pinch, and a pinched ring cannot be handed to the join event. A single loop with no holes is not tested and solves
    as today. This closes, for holed inputs, the gap decision 28 left by naming only `findFirstCrossing`.
50. **A hole's degenerate area is tested before its winding is judged,** so a sliver hole under
    `normaliseWinding: false` is refused as `degenerate-hole` and never as mis-wound on a sign decision 28 calls
    untrustworthy. This amends the order of decision 23 for that one test.
51. **`groupLoopsByNesting` refuses by name where the nesting it finds is not a chain,** in place of a non-null
    assertion: a loop whose deepest container has no group throws a refusal naming both loops.
52. **Tests added:** a hole both canonicalised and reversed, asserting `edgeToEdge`; a removal at index 0 and at the
    last index; a weight change at a hole's vertex 0; contact between two holes; the order of `findLoopConflict`'s
    kinds; the masked case of decision 38; a self-touching hole; a sliver hole under `normaliseWinding: false`. The
    shared-wall test stays, with a comment that any collinear overlap puts an endpoint on the other segment, so the
    gap test alone convicts the distance rule.

## 4. Deferred

- **Join and divide, and any stepping of a holed solve:** roadmap node 4.
- **The causality check, offset projection and strip decomposition on the loop table:** node 6.
- **The stepped entry and `canonicaliseForSolve` with holes, and drawing holed fixtures:** node 7.
- **Merging loops that touch, in place of refusing them:** node 8. **Building-shell on the holed solve:** node 9.
- **A collinear overlap between two non-adjacent edges of one loop** stays unseen by `findFirstCrossing`, as today.
