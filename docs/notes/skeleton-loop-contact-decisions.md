---
title: "Skeleton loop contact: decision spec"
type: decision-spec
area: straight-skeleton
status: proposed
date: 2026-11-15
part_of: [holed-skeleton-roadmap.md]
depends_on: [skeleton-join-and-divide-decisions.md]
---

# Skeleton loop contact: decision spec

Node 8 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md), "contact between loops", written from BSA.F93,
BSA.D284, BSA.D289 and BSA.D299, a reading of the files in the roster at `a8ba71f`, and the measurements of section 2,
run on a throwaway copy of `packages/core` at that commit. It is built on the boundary stage of
[nodes 2 and 3](./skeleton-loops-input-decisions.md) and the holed solve of [node 4](./skeleton-join-and-divide-decisions.md).
Node 5 (simultaneous events across rings) and node 9 (building-shell) are not in this document.

## 1. Intent

Today a holed input whose loops come within the perceptual floor δ of each other, or of themselves, is refused by a
throw. BSA.D284 rules that contact is canonicalised instead. This spec adds one stage to the boundary of a holed solve
that rebuilds the loops the solver is given: points closer than δ become one point, a vertex within δ of an edge is
inserted into it, two walls that coincide in opposite directions are deleted together, and at every point where loops
meet the walls are relinked so that each loop visit bounds one wedge of the region. A hole on the outline becomes a
notch, two holes that share a wall become one hole, and loops that share only a point become one loop that visits the
point once per wedge. **The solver takes such a loop as it stands:** no event rule, tolerance, constant or
`findOrAddNode`'s box changes. **An input with no holes, and a holed input with no contact, solve to the
byte-identical graph,** because the stage does not run on the first and returns the second untouched.

## 2. What was measured

Every row is a solve of `solveSkeleton` on the copy; "raw" means the contact refusal (and, for shared walls, the
nesting test) was switched off in the copy. "Right" means complete, faces tiling the true area to 3e-16, no escaped
node, no equi-time or direction violation and, for the axis-aligned rows, every interior node at its L∞ roof height.

| Input | Raw solve | After this spec's construction |
|---|---|---|
| Single loop visiting a point twice, each visit one wedge (stitched hole at an L's reflex corner; diamond stitched at a wall; two triangles stitched at one point, three visits; triangle stitched at a corner) | right, all four | (unchanged) |
| Single-loop figure-eight, two squares sharing a corner: each visit spans both wedges | 2 of 4 faces closed, 4 unresolved | split in two, refused |
| Outline and hole at a point, 4 inputs (vertex on vertex at a reflex corner, vertex on edge, three-way, at a corner) | each refused as `simultaneous-across-rings` | right, all 4, one loop |
| Two holes at a point, merged hole visiting it twice (two turned squares; vertex on edge; triangles tip to tip, one wedge 229°) | triangles: `multi-ring-step-refused`; the others not run raw | right, cycle rank 1, all 3 |
| The same with axis-aligned squares, and the loops-input spec's pinched-hole test | refused | node-5 refusal: the merged loop is right, the solve meets coincident events |
| Hole on a wall (whole hole side; corner, two walls; L with overlap on both sides; chain of three) | incomplete, 20–23% area missing, or node-5 refusal | right, single loop, all 4 |
| Two turned holes sharing a whole or part wall | node-5 refusal; part wall refused as `crossing` by rounding | right, cycle rank 1 |
| Hole spanning the outline; diamond touching four walls; figure-eight outline with a hole; C-shaped hole closing on itself | first two `multi-ring-step-refused`; last two not run raw | 2 to 4 clockwise loops: refused as dividing the region |
| Hole outside the outline sharing its wall; two holes overlapping along a wall | not run raw | coincident walls in one direction: refused |
| Point gap 0.5δ, 1δ, 2δ (turned hole) | today 0.5δ and 1δ refused (1δ rounds under the bar), 2δ solves; raw solves at all three | 0.5δ merged: right; 2δ unchanged |
| Parallel-wall gap 0.5δ, 1δ, 2δ | today 0.5δ refused; 1δ and 2δ `simultaneous-across-rings` | 0.5δ merged: right; 1δ, 2δ unchanged (node 5's corridor) |
| Tilted sliver, hole wall from 0.5δ to 3δ, and to 30δ | today refused | one vertex inserted, a needle wedge: right |
| Zero-width slit ring with a second hole | today refused | outline, courtyard and hole: complete |

Also measured: 0 of `FULL_CORPUS`'s 60 loops touch themselves at δ; `computeStrips` and `buildSkeletonTree` take
the stitched single loops, the L case's strips covering 23 and 44 at depths 0.5 and 1 (the band formula) and 71 in full.

## 3. Type and surface roster

`+` added, `~` changed, `=` unchanged but named because a reader will look for it. Line numbers are at `a8ba71f`.

| | Surface | File |
|---|---|---|
| + | `LoopPiece`, `LoopContact`, `canonicaliseLoopContact(loops, weights, perceptualFloor): LoopContact` | new file `loop-contact.ts` beside the others |
| ~ | `LoopConflictKind` `+ 'overlap' \| 'divides-region'`; `describeLoopConflict` (line 231) names both | [skeleton-loops.ts](../../packages/core/src/straight-skeleton/skeleton-loops.ts) |
| ~ | `findLoopConflict` (line 213): within a loop, edges meeting at a relinked repeated point are not contact | skeleton-loops.ts |
| = | `groupLoopsByNesting` (line 293), its contact refusal included | skeleton-loops.ts |
| ~ | `SkeletonLoopMap` (line 130) `+ edgeToEdges: number[][]`; `SkeletonDiagnosticKind` (line 441) `+ 'contact-merged'` | [types.ts](../../packages/core/src/straight-skeleton/types.ts) |
| ~ | `solveSkeleton` (line 1967): the stage, the second canonicalisation, the map composed through the stage; `buildLoopMap` (line 1744) | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) |
| = | `assertWeightsChangeOnlyAtVisibleCorners` (line 1511), `weightChangeVertexIndices` (line 1633) | algorithm-termination-cases.ts |
| = | `canonicalisePolygon` (line 240); `distanceToSegment` (line 111); `signedArea` (line 63) | [canonicalisation.ts](../../packages/core/src/straight-skeleton/canonicalisation.ts), [vertex-budget.ts](../../packages/core/src/stroke-spline/vertex-budget.ts), [geometry-helpers.ts](../../packages/core/src/random-polygon/geometry-helpers.ts) |
| = | `initBoundingPolygon` (line 118), `findOrAddNode` (line 187), `findFirstCrossing` (line 60) | [graph-helpers.ts](../../packages/core/src/straight-skeleton/graph-helpers.ts), [solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts), [polygon-decomposition.ts](../../packages/core/src/straight-skeleton/polygon-decomposition.ts) |
| + | `skeleton-loop-contact.test.ts`; amended cases in `skeleton-loops-input.test.ts` | `packages/core/tests/straight-skeleton/` |

```ts
interface LoopPiece { loop: number; edge: number }   // an input loop and the loop-local input edge a piece lies on
interface LoopContact {
    loops: Vector2[][];        // [0] the one clockwise loop, then the counter-clockwise loops
    weights: number[][];       // parallel to loops: each edge carries the weight of the input edge it lies on
    pieces: LoopPiece[][];     // parallel to loops: the input edge each output edge lies on
    changed: boolean;          // false: nothing identified, inserted or cancelled; loops and weights are the inputs
    conflict: LoopConflict | null;
}
```

## 4. Decisions

### Where the stage runs

1. **`canonicaliseLoopContact` runs only when `holes` is non-empty, after per-loop canonicalisation and winding and
   before `findLoopConflict`, in unit space at the perceptual floor δ.** It reads the region as lying on the right of
   every edge, which needs the winding, and it precedes the crossing test, which reads a shared wall turned by
   rounding as a crossing (measured).
2. **Its input is the solved loops, loop 0 the outline, each with its normalised door weights;** every index it
   reports is a loop-local index of that input, and the caller's map translates it into the caller's numbering.
3. **A single loop with no holes never enters the stage** and solves as today, the figure-eight's incomplete answer
   included (nodes 2 and 3, decision 49: "a single loop with no holes is not tested").

### Detection

4. **Contact is the distance of nodes 2 and 3, decision 30, unchanged: two points, or a point and an edge, strictly
   closer than δ by `distanceToSegment`.** It covers a shared wall (any collinear overlap puts an endpoint on the
   other edge), vertex on vertex, vertex on edge, near-contact and a loop touching itself. No predicate is added.
5. **A gap under δ is contact and is merged, never refused.** δ is the client's bar for "two things or one" (BSA.D289),
   and the gaps measured at 0.5δ merged and solved where today they throw; a gap at δ or over is not contact.

### The construction

6. **Identify.** Taking loops in order and vertices in order, each vertex within δ of a point already placed takes
   that point's position, and otherwise places a new one, so distinct points end at least δ apart. The two ends of one
   edge are never identified. A vertex moves by less than δ, as canonicalisation already moves the boundary.
7. **Insert.** Every point within δ of the interior of an edge, of any loop including the edge's own, splits that edge
   at the point's own position, in order along the edge. Each piece lies on its input edge and carries its weight.
8. **Cancel.** Two pieces with the same end points in opposite directions, a wall with no region on either side, are
   deleted together. **Two with the same ends in one direction are refused as `overlap`:** both loops claim the region
   on one side, as a hole outside the outline on its wall, or two overlapping holes, do.
9. **No zero-width residue survives.** Inserted points take an existing point's exact position, so every overlap
   becomes pairs of pieces with identical ends, and each pair cancels; a sliver wider than δ at one end keeps its
   visible part as a needle wedge, which measured right.
10. **Relink.** At every point where more than one piece arrives, each arriving piece is followed by the leaving piece
    met first turning counter-clockwise from the arriving piece's reversed direction (counter-clockwise in the frame
    where a clockwise ring's `signedArea` is negative). With the region on the right of every piece, that is the
    leaving piece that bounds the same region wedge. A relink that is not one-to-one is refused as `overlap`.
    **Worked example** (measured): the diamond hole `(5,0) (7,2) (5,4) (3,2)` on the wall of the square `(0,0) (0,10)
    (10,10) (10,0)`. At `(5,0)` the outline's piece from `(10,0)` arrives with reversed direction 0°, and the hole's
    edge from `(3,2)` arrives with reversed direction 135°; the leaving pieces go to `(7,2)` at 45° and to `(0,0)` at
    180°. So `(10,0)` is followed by `(7,2)`, and `(3,2)` by `(0,0)`: one loop, `(0,0) (0,10) (10,10) (10,0) (5,0)
    (7,2) (5,4) (3,2) (5,0)`, which solves right. Turning clockwise instead would return the two loops as given.
11. **Trace and classify.** The relinked pieces are traced into loops. **Exactly one loop may have negative signed
    area, and it is the outline; two or more are refused as `divides-region`,** because the region has fallen into
    pieces that no single outline describes (a hole spanning the outline, a loop pinched into two lobes of building).
12. **Order and start.** Each output loop starts at its piece of least `(loop, edge, position along the edge)`, and the
    holes follow the outline in order of their least piece. When nothing was identified, inserted or cancelled the
    stage returns its input arrays as they are, with `changed: false`.
13. **No general boolean is needed:** contact only joins boundaries, and crossing loops stay refused permanently
    (nodes 2 and 3, decision 29).
14. **Shapes, each measured:** a hole sharing its whole side with part of an outline wall gives a notch, a corner hole
    an L, a hole overlapping an outline wall past both ends a notch, a chain of three loops one notch, two holes sharing
    a whole or part wall one hole. A straight vertex left where a cancelled wall ended goes in the second canonicalisation.

### Point contact and the repeated vertex

15. **Loops that share only a point become one loop that visits the point once per region wedge there,** by
    identification or insertion and the counter-clockwise relink, with nothing cancelled. Measured on V5: the point's
    two exterior nodes stay two, since `initBoundingPolygon` never asks `findOrAddNode`; their bisectors share a source,
    which `NO_COLLISION_RESULTS` skips as `identical-source`; each runs into its own wedge; no interior node lands there.
16. **A visit spanning two wedges is never handed to the solver.** It is the single-loop figure-eight, which V5 does
    not complete; in a holed input the relink splits it into two clockwise loops, refused as `divides-region`.

### Weights

17. **Each changed loop is checked and canonicalised again, in this order:** the re-division of the next decision; the
    visible-corner test with the loop's own wraparound, refused by name where collinear surviving edges carry
    different weights (W-spec W49); then `canonicalisePolygon` at the noise floor with its weight-change vertices
    pinned. A shared wall's weights vanish with it, and every surviving piece keeps its edge's weight.
18. **When the smallest surviving weight of all the loops is not 1, every surviving weight is divided by it** (W-spec
    W4), so the solve keeps one time unit. The ratio can only shrink. An unweighted input is all ones throughout.

### Self-contact

19. **A loop of a holed input that touches itself goes through the same stage,** in place of the refusal of nodes 2
    and 3, decision 49:
    a pinch whose visits each bound one wedge is relinked to itself and solves (measured, outline and hole); a pinch
    that joins two lobes is split and refused as `divides-region`; a zero-width slit cancels, splitting the loop into
    an outline and a courtyard.
20. **After the stage, `findLoopConflict` runs as the guard it always was, on the stage's loops,** and within one loop
    it does not count as contact two edges that end at one repeated point whose visits the counter-clockwise relink
    reproduces. A pinch spanning two wedges, passed to `findLoopConflict` directly, is still `contact`, and the contact
    message no longer points at node 8.

### The caller's map

21. **`loopMaps[k]` stays indexed by the caller's loop `k`, while `graph.loops` lists the solved loops;** the two agree
    index for index exactly when no `contact-merged` diagnostic was pushed. `loopOfExteriorEdge` names the solved loop
    of any exterior id the map gives. The map is composed through canonicalisation, the reversal, the stage's pieces
    and the second canonicalisation, in that order.
22. **`edgeToEdges[i]` lists every exterior edge carrying any part of caller edge `i`, in order along it from caller
    vertex `i`, without repeats; it is empty when all of it was a cancelled wall.** `edgeToEdge[i]` is its first entry,
    or `REMOVED_VERTEX_INDEX` when it is empty. One exterior edge may carry parts of several caller edges, of one loop
    or of several, where the second canonicalisation removed a straight vertex between them.
23. **`vertexToNode[i]` is the source of the exterior edge carrying the part of caller edge `i` that starts at vertex
    `i`; where that part was cancelled, the target of the edge carrying the part of edge `i - 1` that ends there; where
    both were cancelled or canonicalisation removed the vertex, `REMOVED_VERTEX_INDEX`.** At a repeated point this
    names the visit the caller's own walls pass through. `reversed` keeps its meaning.
24. **Worked example** (measured): the hole `(0,3) (4,3) (4,6) (0,6)` on the left wall of the square `(0,0) (0,10)
    (10,10) (10,0)` is solved as one loop `(0,0) (0,3) (4,3) (4,6) (0,6) (0,10) (10,10) (10,0)`, ids 0 to 7. The
    outline's map is `vertexToNode [0, 5, 6, 7]`, `edgeToEdges [[0, 4], [5], [6], [7]]`; the hole's is
    `vertexToNode [1, 2, 3, 4]`, `edgeToEdges [[1], [2], [3], []]`, `edgeToEdge [1, 2, 3, -1]`.
25. **Without contact every `edgeToEdges[i]` is `[edgeToEdge[i]]`,** so the field is additive and every existing map
    reads as today. Building-shell's wall match (node 9's draft, decision 12) must read `edgeToEdges`, since a wall cut
    by a contact carries more than one supporting edge.
26. **`contact-merged` is informational and not blocking:** one diagnostic per solve that changed, naming the caller
    loops joined, the walls cancelled and the points stitched, in the caller's vertex numbers.

### What is still refused

27. **At the door, by a throw naming the caller's loops and vertices:** `self-crossing`, `degenerate-hole`, `crossing`,
    `hole-outside-outline` and `hole-inside-hole` as today; `overlap` and `divides-region` from the stage; a weight
    change at a straight vertex the merge left; a mis-wound loop under `normaliseWinding: false`; holes on the legacy
    entries. `contact` remains only as the guard `findLoopConflict` runs after the stage.
28. **In the solve, signalled and blocking as today:** `simultaneous-across-rings` and `multi-ring-step-refused`, which
    axis-aligned merged holes meet (node 5's work).
29. **`groupLoopsByNesting` keeps refusing contact between any two loops,** because it decides nesting by one vertex,
    which a contact puts on a boundary.

### Boundaries

30. **An input with no holes is byte-identical by construction and pays nothing; a holed input with no contact pays
    one pass over point and edge pairs, as today's contact test does, and is byte-identical** because the stage returns
    its input arrays. Node 4's holed fixtures hold it.
31. **No tolerance, window, constant or comparison moves.** The stage reads δ at new sites, as node 4's decision 37
    did; `findOrAddNode`'s box and every event rule are untouched; the C++ port is not a consideration (BSA.D281).
32. **Nothing outside `packages/core` changes.**

### Fixtures and gates

33. **Hand-derived single-loop outcomes, each asserting its merged loop, its node list at the L∞ roof height within
    1e-9, and the faces tiling the true area:** the hole `[0,4]×[3,6]` on the left wall (interior nodes `(1.5,1.5)` and
    `(5.5,1.5)` at 1.5, `(2,8)` and `(6,8)` at 2, `(7,3)` and `(7,7)` at 3); the corner hole `[0,4]²` (`(3,7)`,
    `(7,7)`, `(7,3)` at 3); the L `(0,0) (0,10) (5,10) (5,5) (10,5) (10,0)` with hole `[3,5]²` at its reflex corner
    (`(1.5,1.5)`, `(1.5,6.5)`, `(6.5,1.5)` at 1.5, `(2.5,7.5)`, `(7.5,2.5)` at 2.5); the same L with hole `[3,8]×[3,5]`
    (`(9,2)`, `(9,4)` at 1; `(1.5,1.5)`, `(8.5,1.5)`, `(1.5,6.5)` at 1.5; `(2.5,7.5)` at 2.5); and the chain of the
    square, hole `[0,3]×[4,6]` and hole `[3,6]×[4,6.5]` (`(1.5,7.5)`, `(1.5,8)` at 1.5; `(1.75,8.25)`, `(7.75,8.25)` at
    1.75; `(2,2)`, `(8,2)`, `(8,8)` at 2).
34. **Turned holed outcomes, each asserting the merged loops and node 4's decision 42 in full (complete, tiling,
    containment, cycle rank equal to the solved hole count):** two turned squares at a corner, a turned vertex on a
    turned edge, triangles tip to tip, two turned holes sharing a whole and a part wall, a notch with a separate hole,
    an already-stitched outline with a hole, and the slit ring with a second hole.
35. **Near-contact:** a point and a parallel wall at 0.5δ merge and solve; at 1.1δ neither merges. **Refusals:**
    `overlap` and `divides-region` each on two measured inputs, and a weighted wall merge with unequal collinear weights.
36. **Axis-aligned two holes at a corner, and the pinched hole of the loops-input tests,** assert the stage's loops
    and the signalled node-5 refusal, as specified behaviour until node 5 (node 4, decision 44); a fixture this design
    cannot solve for any other reason is a red test with an issue note (BSA.D266, BSA.D284).
37. **Mutation gates, each turning a named test red:** the relink turning clockwise (the point fixtures); cancellation
    off (the wall fixtures); insertion off (vertex on edge, by the guard); identification off (vertex on vertex); the
    `divides-region` check off; the stage before winding (a touching hole given clockwise); the stage on a single loop
    (the figure-eight and slit single loops stay as today); `edgeToEdges` keeping first pieces only (the wall-hole
    map); the within-loop exemption without the relink test (a figure-eight outline passed to `findLoopConflict`); the
    re-division off (a weighted merge whose slowest wall cancels).
38. **The baseline is measured before the first edit,** and single-loop byte identity is held by
    full-graph-digest's pins, the sweep harness, the recursion census and building-shell's golden drift test.

## 5. Deferred

- **Coincident events across rings,** which axis-aligned merged holes meet: node 5.
- **Contact in `groupLoopsByNesting`:** it would need the stage over loops of unknown nesting; node 9 decides whether
  its footprints need it (that draft refuses corner contact itself, its decision 29).
- **A collinear overlap within a single loop with no holes** stays unseen, as nodes 2 and 3 deferred.

## 6. For the user's ruling

Nothing in this spec waits on a ruling: the measurements found no change needed to how events resolve, to
`findOrAddNode`'s box, or to any tolerance. One extension is left out because it would change answers the roadmap
holds fixed. **Running the stage on a single loop with no holes** would complete nothing that solves today
(`FULL_CORPUS`: 0 of 60 loops touched), would turn the single-loop figure-eight from an incomplete solve into a
`divides-region` refusal, and would turn building-shell's zero-width courtyard slit rings
([courtyard.ts](../../apps/building-shell/src/courtyard.ts)) into an outline and a hole, which is node 9's change.
