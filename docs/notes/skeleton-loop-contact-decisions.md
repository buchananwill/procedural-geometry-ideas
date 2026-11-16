---
title: "Skeleton loop contact: decision spec"
type: decision-spec
area: straight-skeleton
status: approved
date: 2026-11-15
part_of: [holed-skeleton-roadmap.md]
depends_on: [skeleton-join-and-divide-decisions.md, skeleton-simultaneous-rings-decisions.md, skeleton-loop-consumers-decisions.md]
---

# Skeleton loop contact: decision spec

Node 8 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md), "contact between loops", written from BSA.D284,
BSA.D266, BSA.D301, BSA.D311, BSA.D314, BSA.D318 and BSA.F103, a reading of the files in the roster at `68546eb`, and
the measurements of section 2, run on a throwaway copy of `packages/core` at that commit. It builds on the boundary
stage of [nodes 2 and 3](./skeleton-loops-input-decisions.md), the holed solve of
[node 4](./skeleton-join-and-divide-decisions.md), the cross-ring meetings of
[node 5](./skeleton-simultaneous-rings-decisions.md), the roster and sweeps of
[node 6](./skeleton-loop-consumers-decisions.md), and the holed guard of BSA.D314 and BSA.D318. Node 9 (building-shell)
is not in this document.

## 1. Intent

Today a holed input whose loops come within the perceptual floor δ of each other, or of themselves, is refused by a
throw. BSA.D284 rules that contact is canonicalised instead. This spec adds one stage to the boundary of a holed solve
that rebuilds the loops the solver is given: points closer than δ become one point, a vertex within δ of an edge is
inserted into it, two walls that coincide in opposite directions are deleted together, and at every point where loops
meet the walls are relinked so that each visit bounds one wedge of the region. A hole on the outline becomes a notch,
two holes that share a wall become one hole, and loops that share only a point become one loop that visits the point
once per wedge. **The solver takes the rebuilt loops as they stand:** no event rule, tolerance, constant or
`findOrAddNode`'s box changes. **An input with no holes, and a holed input with no contact, solve to the
byte-identical graph.** **A rebuilt loop solves exactly as the same loop drawn by a caller does,** so this node
inherits the single-loop solver's open defects on the loops it makes (section 6), and the holed guard runs on every
solve whose caller gave holes, so a wrong answer on a rebuilt loop is blocked as on any holed input.

## 2. What was measured

All on the copy at `68546eb`, bundled with esbuild. "The stage" is a prototype of decisions 7 to 13. "Sound" means
complete, and by an independent checker: faces tiling the region to 1e-9 through `computeStrips` at full depth; every
interior node at one time from its walls and, on axis-aligned input, at its L∞ distance to the boundary (elsewhere no
later than its clearance); no edge backwards in time; containment; cycle rank equal to the solved hole count; no
un-culled self-loop; no two arcs crossing or overlapping; an arc recorded twice naming one pair of walls; all at 1e-7 of
the extent.

| Input | Today | After the stage |
|---|---|---|
| Outline and hole at a point: the L `(0,0) (0,10) (5,10) (5,5) (10,5) (10,0)` with hole `[3,5]²` at its reflex corner; the diamond `(5,0) (7,2) (5,4) (3,2)` on the wall of `[0,10]²`; the quad `(0,0) (3,1) (2.5,2.5) (1,3)` at its corner; two triangles `(5,0) (8,2) (6.3,3.2)` and `(5,0) (4,3) (2,2.5)` on its wall, three visits | refused `contact` | one stitched loop: sound, 4 of 4 |
| The same three visits with the symmetric triangles `(5,0) (8,2) (6,3)` and `(5,0) (4,3) (2,2)` | refused `contact` | complete, 4 `causality-violation`s, two edges backwards in time; **the same loop with its point opened by 0.01, which repeats no vertex, is identical:** a single-loop defect, not contact's (section 6) |
| Two holes at a point, one stitched hole: turned squares at `(9,5)` in `[0,20]×[0,10]`; vertex `(8,6)` on a diamond's edge; triangles tip to tip; axis-aligned `[4,7]×[2,5]` and `[7,10]×[5,8]`; the loops-input tests' `[2,4]²` and `[4,6]²`, and their pinched hole | refused `contact` | sound, 6 of 6, cycle rank 1, the guard silent. Node 5 made the axis-aligned rows solve |
| Hole on a wall, one notched loop: `[0,4]×[3,6]` on the left wall of `[0,10]²`; `[3,6]×[0,4]` mid-bottom; the corner `[0,4]²`; the L with `[3,8]×[3,5]`; the chain `[0,3]×[4,6]`, `[3,6]×[4,6.5]`; `[3,6]×[0,4]` turned 0.3 with its square | refused `contact` | sound, 6 of 6; node lists as decision 45 |
| A notch and a separate hole; two holes sharing a whole or part wall, turned and axis-aligned | refused `contact` | sound, 5 of 5, cycle rank 1 |
| A slit outline to a courtyard `[3,7]²`, with a hole `[1,2]×[8,9]` | refused, outline touches itself | outline, courtyard and hole: sound, cycle rank 2 |
| Point and parallel-wall gaps of 0.5δ / of 1δ, 1.1δ and 2δ | refused / sound | merged, sound / unchanged |
| A hole spanning the outline; a hole outside on its wall | refused `contact` | `divides-region`; `overlap` |
| A hole crossing a wall through two of its vertices, or through one and properly once | refused `contact` | the relink is not one-to-one: `crossing` |

With the contact refusal off and no stage, of the 24 inputs 17 fail inside the solver, 5 are refused as nesting, and
only the pinched hole and the slit ring solve. Every merged loop starts and runs as decision 12 says. `buildSkeletonTree` gives `isTree` true on all 10 merged single loops.

**The guard on stitched results.** The guard at `68546eb` (topology and equal time) is silent on every sound stitched
fixture: the visits of a repeated point are distinct exterior nodes, and counting by node id gives the right rank. The
widening of BSA.D318 is not committed, so its three checks were run from the checker above: time order and the wall
pair are silent on every sound stitched fixture; **planarity, if arcs are compared by node id, flags every one of
them,** once per pair of visits (three times at three visits), on the two bisectors that leave the coincident exterior
nodes; compared at their endpoints' positions it is silent.

**The straight-bisector defect on merged loops (BSA.F103).** A fuzz of grid rectangles `[0,W]×[0,H]`, `W, H` in 6 to
30, with rectangular holes on their walls merged into notches, some turned by a random angle:

| Family | Solves | Solved loops | Sound | Refused by name | Wrong | Wrong with no diagnostic today | Blocked by the guard of decision 23 |
|---|---|---|---|---|---|---|---|
| One notch | 400 | 1 | 400 | 0 | 0 | 0 | |
| One notch, turned | 300 | 1 | 300 | 0 | 0 | 0 | |
| A corner hole (an L) | 300 | 1 | 300 | 0 | 0 | 0 | |
| Two notches | 2,000 | 1 | 1,998 | 0 | 2 | 2 | 2 |
| Two notches, turned | 2,000 | 1 | 1,984 | 0 | 16 | 2 | 16 |
| One notch and a free hole | 400 | 2 | 394 | 6 | 0 | 0 | |
| Two notches and a free hole | 400 | 2 | 391 | 9 | 0 | 0 | |
| Two notches and a free hole, turned | 400 | 2 | 377 | 7 | 16 | — | 16 (as today) |

- **A single notch never bears a straight bisector** (0 of 1,000): its flanking walls are collinear and face one way,
  but the walls between them are the notch's own, whose fronts move apart and never close, so the bisector between
  the flanking walls is never born. **The precondition is made when merged walls fall in line across building that
  collapses:** two notches of one depth on one wall, whose bottoms are in line, or a notch wall in line with another.
  Straight bisectors appear in 96 of the 1,600 two-notch solves, and every wrong answer carries one.
- **A merged single loop solves node for node as the same loop given as a single-loop input** (the first 100 of each
  single-loop family): the stage adds no solve path, and a merged result is wrong exactly when that loop is.
- **The guard, run with hole count 0 on a merged single loop, flags none of 4,982 sound ones and blocks all 18 wrong
  ones;** on holed merges it flags none of 1,162 sound. The two silent wrong answers are un-culled self-loops, e.g.
  `[0,28]×[0,9]` with holes `[5,13]×[8,9]` and `[21,23]×[8,9]`: edge 31 at `(17,4)` between the notch bottoms.
- The refusals are node 5's `simultaneous-across-rings`, signalled.

## 3. Type and surface roster

`+` added, `~` changed, `=` unchanged but named because a reader will look for it. Line numbers are at `68546eb`.

| | Surface | File |
|---|---|---|
| + | `LoopPiece`, `LoopContact`, `canonicaliseLoopContact(loops, weights, perceptualFloor): LoopContact` | new `loop-contact.ts` beside skeleton-loops.ts |
| ~ | `LoopConflictKind` (line 20) `+ 'overlap' \| 'divides-region'`; `describeLoopConflict` (line 231) | [skeleton-loops.ts](../../packages/core/src/straight-skeleton/skeleton-loops.ts) |
| ~ | `findLoopConflict` (line 213), through `findContact` (line 176): the repeated-point exemption | skeleton-loops.ts |
| = | `groupLoopsByNesting` (line 293), its contact refusal included | skeleton-loops.ts |
| ~ | `SkeletonLoopMap` (line 130) `+ edgeToEdges: number[][]`; `SkeletonDiagnosticKind` (line 449) `+ 'contact-merged'`; `loopMaps`' doc (line 545) | [types.ts](../../packages/core/src/straight-skeleton/types.ts) |
| ~ | `solveSkeleton`: the stage between winding and the loop relations, the second canonicalisation, the guard's condition; `buildLoopMap` composed through the stage. Since BSA.D356 the winding, the canonicalisation, the loop maps and the loop relations are phases of `prepareBoundary`, and the guard's condition is in `verifySolvedGraph` | [boundary-stage.ts](../../packages/core/src/straight-skeleton/boundary-stage.ts) (`prepareBoundary`, `buildLoopMap`), [solve-entry.ts](../../packages/core/src/straight-skeleton/solve-entry.ts) (`solveSkeleton`, `verifySolvedGraph`); all in `algorithm-termination-cases.ts` when this spec was drafted |
| = | `assertWeightsChangeOnlyAtVisibleCorners`, `weightChangeVertexIndices`, `remapWeightsThroughCanonicalisation` | boundary-stage.ts |
| ~ | `holedSkeletonViolations`: the doc of `holeCount`; the planarity check of BSA.D318 reads decision 27 | [holed-guard.ts](../../packages/core/src/straight-skeleton/holed-guard.ts) |
| = | `canonicalisePolygon` (line 240); `distanceToSegment`; `signedArea`; `initBoundingPolygon` (line 129), `skeletonHoleCount` (line 85); `findOrAddNode` (line 187); `findFirstCrossing` (line 60) | [canonicalisation.ts](../../packages/core/src/straight-skeleton/canonicalisation.ts), [planar-geometry.ts](../../packages/core/src/straight-skeleton/planar-geometry.ts) (`distanceToSegment` and `signedArea`, which `vertex-budget.ts` and `random-polygon/geometry-helpers.ts` re-export), [graph-helpers.ts](../../packages/core/src/straight-skeleton/graph-helpers.ts), [solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts), [polygon-decomposition.ts](../../packages/core/src/straight-skeleton/polygon-decomposition.ts) |
| ~ | `HoledTestPolygon` `+ solvedHoleCount?: number`; `HOLED_TEST_POLYGONS` gains the contact fixtures | [holed-fixtures.ts](../../packages/test-fixtures/src/holed-fixtures.ts) |
| ~ | the hole-count sites: `expectSoundHoledSolve` (line 304), the cycle rank (line 1194), `loops` (line 165), the battery (line 242) | [holed-test-helpers.ts](../../packages/core/tests/straight-skeleton/holed-test-helpers.ts), [graph-index-invariants.test.ts](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts), [solve-result.test.ts](../../packages/core/tests/straight-skeleton/solve-result.test.ts), [holed-join-divide.test.ts](../../packages/core/tests/straight-skeleton/holed-join-divide.test.ts) |
| + | `skeleton-loop-contact.test.ts`; ~ the contact cases of `skeleton-loops-input.test.ts` | `packages/core/tests/straight-skeleton/` |

```ts
interface LoopPiece { loop: number; edge: number }   // an input loop and the loop-local input edge a piece lies on
interface LoopContact {
    loops: Vector2[][];        // [0] the one clockwise loop, then the counter-clockwise loops
    weights: number[][];       // parallel to loops: each edge carries the weight of the input edge it lies on
    pieces: LoopPiece[][];     // parallel to loops: the input edge each output edge lies on
    changed: boolean;          // false: nothing identified, inserted or cancelled; loops and weights are the inputs
    conflict: LoopConflict | null;  // 'overlap', 'divides-region' or 'crossing', naming input loops and edges
}
```

## 4. Decisions

### Where the stage runs

1. **`canonicaliseLoopContact` runs only when the caller's `holes` is non-empty, after per-loop canonicalisation and
   winding and before `findLoopConflict`, in unit space at δ.** It reads the region as lying on the right of every
   edge, which needs the winding, and it precedes the crossing test, which reads a shared wall turned by rounding as a
   crossing.
2. **Its input is the solved loops, loop 0 the outline, each with its normalised door weights;** every index it
   reports is loop-local to that input, and the caller's map translates it into the caller's numbering.
3. **A single loop with no holes never enters the stage** and solves as today, its figure-eight included (nodes 2
   and 3, decision 49).
4. **The stage's loops never reach `decomposePolygon`,** because the holed path is chosen by the caller's `holes`, so a
   merge that leaves one loop is still solved by `runSimplePolygon` with its loop table.

### Detection

5. **Contact is the distance of nodes 2 and 3, decision 30, unchanged: two points, or a point and an edge, strictly
   closer than δ by `distanceToSegment`.** It covers a shared wall, vertex on vertex, vertex on edge, near-contact and a
   loop touching itself. No predicate is added.
6. **A gap under δ is contact and is merged, never refused;** a gap at δ or over is not contact (measured: 0.5δ
   merges and solves, 1δ, 1.1δ and 2δ are unchanged and solve).

### The construction

7. **Identify.** Taking loops in order and vertices in order, each vertex within δ of a point already placed takes
   that point's exact coordinates, and otherwise places a new one, so distinct points end at least δ apart. The two
   ends of one edge are never identified.
8. **Insert.** Every point within δ of the interior of an edge, of any loop including the edge's own, splits that edge
   at the point's coordinates, in order along the edge. Each piece lies on its input edge and carries its weight.
9. **Cancel.** Two pieces with the same end points in opposite directions are deleted together. **Two with the same
   ends in one direction are refused as `overlap`:** both loops claim the region on one side, as a hole outside the
   outline on its wall, or two overlapping holes, do.
10. **No zero-width residue survives:** inserted points take an existing point's exact coordinates, so every overlap
    becomes pairs of pieces with identical ends, and each pair cancels.
11. **Relink.** At every point where more than one piece arrives, each arriving piece is followed by the leaving piece
    met first turning counter-clockwise from the arriving piece's reversed direction, counter-clockwise in the frame
    where a clockwise ring's `signedArea` is negative. With the region on the right of every piece, that is the
    leaving piece bounding the same region wedge. **A relink that is not one-to-one is refused as `crossing`:** the
    loops pass through each other at that point (measured on a hole crossing a wall through its vertices).
    **Worked example** (measured): the diamond hole `(5,0) (7,2) (5,4) (3,2)` on the wall of the square `(0,0) (0,10)
    (10,10) (10,0)`. At `(5,0)` the outline's piece from `(10,0)` arrives with reversed direction 0°, and the hole's
    piece from `(3,2)` with reversed direction 135°; the leaving pieces go to `(7,2)` at 45° and to `(0,0)` at 180°.
    So `(10,0)` is followed by `(7,2)`, and `(3,2)` by `(0,0)`: one loop `(0,0) (0,10) (10,10) (10,0) (5,0) (7,2)
    (5,4) (3,2) (5,0)`, which solves sound. Turning clockwise instead returns the two loops as given.
12. **Trace, classify, order.** The relinked pieces are traced into loops. **Exactly one may have negative signed area,
    and it is the outline; two or more are refused as `divides-region`.** Each loop starts at its piece of least
    `(loop, edge, position along the edge)`, and the holes follow the outline in order of their least piece. When
    nothing was identified, inserted or cancelled, the stage returns its input arrays with `changed: false`.
13. **The stage refuses only `overlap`, `divides-region` and `crossing`;** an input it does not recognise as contact
    passes through, and `findLoopConflict` after it refuses it as today. Crossing loops stay refused permanently
    (nodes 2 and 3, decision 29), so no general boolean is needed.
14. **A straight vertex left where a cancelled wall ended goes in the second canonicalisation,** `canonicalisePolygon`
    at the noise floor with each loop's weight-change vertices pinned, run on every loop the stage changed.

### Point contact

15. **Loops that share only a point become one loop that visits the point once per region wedge,** with nothing
    cancelled. The visits are distinct exterior nodes at bit-identical coordinates, since `initBoundingPolygon` never
    asks `findOrAddNode`; their bisectors share a source position and each runs into its own wedge.
16. **A visit spanning two wedges is never handed to the solver:** in a holed input the relink splits such a pinch into
    two clockwise loops, refused as `divides-region`.

### Weights

17. **Each changed loop is checked again, in this order:** the re-division of the next decision; the visible-corner
    test with the loop's own wraparound, refused by name where collinear surviving edges carry different weights
    (W-spec W49); then the second canonicalisation. A shared wall's weights vanish with it.
18. **When the smallest surviving weight of all the loops is not 1, every surviving weight is divided by it** (W-spec
    W4), so the solve keeps one time unit; the ratio can only shrink. An unweighted input is all ones throughout.

### Self-contact and the repeated-point exemption

19. **A loop of a holed input that touches itself goes through the same stage,** in place of the refusal of nodes 2
    and 3, decision 49: a pinch whose visits each bound one wedge is relinked to itself; a pinch joining two lobes of
    building is split and refused as `divides-region`; a zero-width slit cancels into an outline and a courtyard.
20. **After the stage, `findLoopConflict` runs whole on the stage's loops as the guard it always was,** and its
    refusals name each edge by the caller loop and edge its piece lies on.
21. **Two edges `a` and `b` of one loop that share no vertex index are not contact exactly when all three hold:** (i)
    an endpoint of `a` and an endpoint of `b` are two distinct vertex indices of that loop with bit-identical
    coordinates, a repeated point `p`; (ii) the other endpoint of each lies at least δ from the other edge by
    `distanceToSegment`; (iii) at `p`, every visit's outgoing edge is the one met first turning counter-clockwise from
    the reversed direction of that visit's incoming edge, among the outgoing edges of every visit at `p`, by exact angle
    order with no tolerance. Any other pair keeps decision 30's test, and two different loops are never exempt.
22. **Each clause has its own mutation gate in `findLoopConflict`'s direct tests, and each turns a named test red:**
    (i) read as "within δ" passes a loop whose two visits are 0.5δ apart, which must be `contact`; (ii) dropped passes
    a repeated point whose far endpoints lie within δ of each other's edges, which must be `contact`; (iii) dropped
    passes the figure-eight `(0,0) (0,1) (1,1) (1,2) (2,2) (2,1) (1,1) (1,0)` as a hole, which must be `contact`;
    applied across loops, it passes the holes `[2,4]²` and `[4,6]²`, which must be `contact`.

### The guard

23. **The guard runs on every solve whose caller gave holes, with `holeCount` the solved hole count,
    `graph.loops.length − 1`, which may be 0.** BSA.D314 put it on every input with holes; keyed on the graph, a holed
    input whose holes all merged would escape it. No input without holes reaches it, so no single-loop result changes,
    and a holed input with no contact is guarded exactly as today.
24. **On a merged single loop the guard's topology is the tree check:** one component and cycle rank 0. Measured: it
    flags none of 4,982 sound merged single loops and blocks all 18 wrong ones.
25. **The guard counts nodes by id, never by position:** the visits of a repeated point are distinct nodes, which is
    what makes the stitched fixtures' rank right.
26. **The time-order and wall-pair checks of BSA.D318 need nothing for contact:** measured silent on every sound
    stitched fixture.
27. **The planarity check of BSA.D318 treats two arcs whose only common point is an endpoint of each, at bit-identical
    coordinates held by two exterior nodes of one loop, as meeting at a node and not crossing.** Compared by node id it
    flags every sound stitched solve. Where the widening lands first, this decision amends it; its gate is the stitched
    fixtures of decision 46 under the guard.

### The caller's map

28. **`loopMaps[k]` stays indexed by the caller's loop `k`, and `graph.loops` lists the solved loops;** they agree
    index for index exactly when no `contact-merged` diagnostic was pushed. The map is composed through
    canonicalisation, the reversal, the stage's pieces and the second canonicalisation, in that order.
29. **`edgeToEdges[i]` lists every exterior edge carrying any part of caller edge `i`, in order along it from caller
    vertex `i`, without repeats, and is empty when all of it was a cancelled wall.** `edgeToEdge[i]` is its first entry,
    or `REMOVED_VERTEX_INDEX` (−1) when it is empty. One exterior edge may carry parts of several caller edges, of one
    loop or several, where the second canonicalisation removed a straight vertex between them.
30. **`vertexToNode[i]` is the source of the exterior edge carrying the part of caller edge `i` that starts at vertex
    `i`; where that part was cancelled, the target of the edge carrying the part of edge `i − 1` that ends there; where
    both were cancelled or canonicalisation removed the vertex, `REMOVED_VERTEX_INDEX`.** At a repeated point this
    names the visit the caller's own walls pass through. `reversed` keeps its meaning per caller loop.
31. **Without contact every `edgeToEdges[i]` is `[edgeToEdge[i]]`,** so the field is additive and every existing map
    reads as today. A caller matching faces to walls reads `edgeToEdges`: a wall cut by a contact has several faces.
32. **Worked example, a hole merged as a notch** (measured): the outline `(0,0) (0,10) (10,10) (10,0)` and the hole
    `(3,0) (6,0) (6,4) (3,4)` on its bottom wall solve as one loop, ids 0 to 7: `(0,0) (0,10) (10,10) (10,0) (6,0)
    (6,4) (3,4) (3,0)`. Outline edge 3, `(10,0)→(0,0)`, is split by the notch: `edgeToEdges [[0], [1], [2], [3, 7]]`,
    edge 3 running `(10,0)→(6,0)` and edge 7 `(3,0)→(0,0)`, and `vertexToNode [0, 1, 2, 3]`. Hole edge 0, `(3,0)→(6,0)`,
    is the wall that vanishes: `edgeToEdges [[], [4], [5], [6]]`, `edgeToEdge [−1, 4, 5, 6]`, and `vertexToNode [7, 4,
    5, 6]`, vertex 0 being the target of edge 6, which carries hole edge 3. Read the other way, faces 3 and 7 are the
    outline's bottom wall, faces 4 to 6 the notch, and no face is hole edge 0's. `graph.loops` is `[{start: 0, count:
    8}]`, `result.weights` has 8 entries, `loopMaps` has 2, and the roster's `holedSolveOptions` still hands the
    solve the caller's one hole. Interior nodes `(1.5,1.5)`, `(1.5,5.5)`, `(8,2)`, `(8,6)`, `(3,7)`, `(7,7)`.
33. **`contact-merged` is informational and not blocking:** one diagnostic per solve that changed, naming the caller
    loops joined, the walls cancelled and the points stitched, in the caller's vertex numbers.

### A merge that leaves no hole

34. **A holed input whose every hole merged into the outline returns a single-loop graph:** `graph.loops` is one
    loop, `skeletonHoleCount` reads 0, `context` and `loopMaps` are non-null, and `loopMaps` still has one map per
    caller loop. Its graph is node for node the graph of the same loop given as a single-loop input (measured); its
    `complete` may differ from that input's, because the guard reads it (decision 23).
35. **The tree-based consumers take it:** `buildSkeletonTree` and `extractSpine` read the result and no longer refuse,
    and `isTree` is meaningful there (true on all 10 measured merges). `subdivideRecursively` still refuses it, because
    it reads the caller's `holes` on its options (node 6, decision 23).
36. **Offsets and strips read it as one loop,** the strips' `supportingEdgeIds` naming solved ids that the map's
    `edgeToEdges` translates.

### What is still refused

37. **At the door, by a throw naming the caller's loops and vertices:** `self-crossing`, `degenerate-hole`,
    `crossing`, `hole-outside-outline` and `hole-inside-hole` as today; `overlap`, `divides-region` and a crossing at a
    shared point from the stage; a weight change at a straight vertex the merge left; a mis-wound loop under
    `normaliseWinding: false`; holes on the legacy entries. `contact` remains only as the guard of decision 20, and its
    message no longer points at node 8.
38. **In the solve, signalled and blocking as today:** node 5's `simultaneous-across-rings` and
    `multi-ring-step-refused`, and the guard's kinds.
39. **`groupLoopsByNesting` keeps refusing contact between any two loops,** because it decides nesting by one vertex,
    which a contact puts on a boundary.

### Boundaries

40. **An input with no holes is byte-identical by construction and pays nothing; a holed input with no contact pays
    one pass over point and edge pairs and is byte-identical,** because the stage returns its input arrays and the
    guard's condition is unchanged for it. The 21 roster fixtures and their pinned digests hold it.
41. **No tolerance, window, constant or comparison moves, and no event rule changes.** The stage and the exemption
    read δ at new sites, as node 4's decision 37 did; `findOrAddNode`'s box is untouched; the C++ port is not a
    consideration (BSA.D281).
42. **Nothing outside `packages/core` and `packages/test-fixtures` changes.**

### Fixtures, roster and gates

43. **Every contact fixture that solves joins `HOLED_TEST_POLYGONS`,** with `solvedHoleCount` set where the solve has
    fewer holes than the record; omitted means `holes.length`. Each sweep's holed `describe` runs them, and the four
    hole-count sites of the roster read `solvedHoleCount ?? holes.length`. The harness's holed group takes them, 16
    cells each.
44. **A contact fixture that fails stays in the roster as a red test with an issue note** (BSA.D266); a refusal by
    name is a guard and its test is green on the guard (BSA.D311). No contact fixture is pinned as a defect.
45. **Single-loop outcomes, each asserting its merged loop, its node list at the L∞ height within 1e-9 and the
    tiling:** the notch of decision 32; `[0,4]×[3,6]` on the left wall (`(1.5,1.5)`, `(5.5,1.5)` at 1.5; `(2,8)`,
    `(6,8)` at 2; `(7,3)`, `(7,7)` at 3); the corner `[0,4]²` (`(3,7)`, `(7,7)`, `(7,3)` at 3); the L with `[3,5]²` at
    its reflex corner (`(1.5,1.5)`, `(1.5,6.5)`, `(6.5,1.5)` at 1.5; `(2.5,7.5)`, `(7.5,2.5)` at 2.5); the L with
    `[3,8]×[3,5]` (`(9,2)`, `(9,4)` at 1; `(1.5,1.5)`, `(8.5,1.5)`, `(1.5,6.5)` at 1.5; `(2.5,7.5)` at 2.5); the chain
    (`(1.5,7.5)`, `(1.5,8)` at 1.5; `(1.75,8.25)`, `(7.75,8.25)` at 1.75; `(2,2)`, `(8,2)`, `(8,8)` at 2).
46. **Stitched and turned outcomes, each asserting its merged loops and the battery of `expectSoundHoledSolve`:** the
    diamond on a wall, the quad at a corner, the asymmetric three visits, the six stitched holes of section 2, the
    four shared-wall pairs, the notch with a separate hole, and the slit ring with a second hole.
47. **Near-contact and refusals:** point and parallel wall at 0.5δ merge and solve, and at 1.1δ neither merges;
    `overlap`, `divides-region` and the shared-point `crossing` each on the measured inputs; a weighted wall merge with
    unequal collinear weights refused by name. **The guard on a merge with no hole:** the two-notch specimen of
    section 2 asserts `complete: false` with `holed-topology-violation`, green on the guard.
48. **Mutation gates, each turning a named test red:** the relink clockwise (the point fixtures); cancellation off (the
    wall fixtures); insertion off (vertex on edge); identification off (vertex on vertex); `divides-region` off; the
    stage before winding (a touching hole given clockwise); the stage on a single loop (the figure-eight stays as
    today); `edgeToEdges` keeping first pieces only (decision 32); the re-division off (a weighted merge whose slowest
    wall cancels); the guard keyed on `graph.loops.length > 1` (the two-notch specimen comes back complete); and the
    four gates of decision 22.
49. **The baseline is measured before the first edit,** and single-loop byte identity is held by full-graph-digest's
    pins, the sweep harness, the recursion census and building-shell's golden drift test.

### Amendments this spec requires of earlier specs

50. **Not made here; each goes with this spec's approval:**
    - Nodes 2 and 3: decision 23 (the stage precedes the loop relations); 24 (`edgeToEdges`, the composed map);
      30 and 49 (contact and self-contact canonicalised; decision 21 here is the exemption); 52's contact tests
      become solves.
    - Node 4: decision 42's cycle rank reads the solved hole count.
    - Node 6: decision 27 (`solvedHoleCount`); 37 and 41 read it; 13's map is `edgeToEdges`.
    - The guard of BSA.D314 and BSA.D318: decisions 23 and 27 here.
    - Node 9's draft, decision 12: a strip's wall is matched through `edgeToEdges`.

## 5. Deferred

- **Contact in `groupLoopsByNesting`:** it would need the stage over loops of unknown nesting.
- **Building-shell handing core its loops unmerged:** its own union merges shared walls and refuses corner touches
  (node 9's draft, decisions 9 and 29), so in the repo only sub-δ gaps reach this stage; whether to change that is
  node 9's.
- **A collinear overlap within a single loop with no holes** stays unseen, as nodes 2 and 3 deferred.
- **The tilted sliver,** a hole wall from 0.5δ to 3δ off the outline wall, measured sound at `a8ba71f` as one
  inserted vertex and a needle wedge, is not re-measured here; it joins decision 47's fixtures.

## 6. For the user's ruling

Nothing in the design waits on a ruling. These are reported because they are the user's:

- **The straight-bisector defect (BSA.F103, [its issue note](./ISSUE-skeleton-straight-bisector-between-collinear-walls.md))
  is inherited, not made worse.** This node can claim that each rebuilt loop is the loop a caller would draw for the
  same region, and that its solve is node for node that loop's single-loop solve. It cannot claim the solve is sound:
  where merged walls fall in line it meets the defect at the single-loop rate (2 of 2,000 two-notch merges, 16 of
  2,000 turned). Decision 23 blocks every such answer measured, while the same loop given as a single-loop input stays
  unguarded; whether to guard single loops is the user's (BSA.D314's recommendation).
- **A single-loop defect found on the way:** the outline `(0,0) (0,10) (10,10) (10,0) (5.01,0) (8,2) (6,3) (5,0.01)
  (4,3) (2,2) (4.99,0)`, with no repeated vertex, is complete with two interior edges backwards in time and four
  `causality-violation`s. Traced on its stitched version: a reflex vertex born where the middle wedge closes at `(5, 5.41)` reaches the top wall's front
  at `(5, 6.93)` at time 3.07, after nodes at time 3.44 were made. It is signalled, has no issue note, and is not
  contact's; the stitched version is excluded from the fixtures in favour of the asymmetric one, which is sound.
- **Running the stage on a single loop with no holes** would complete nothing that solves today, would turn the
  single-loop figure-eight from an incomplete solve into a `divides-region` refusal, and would turn building-shell's
  slit courtyard rings into an outline and a hole, which is node 9's change. It is left out.
