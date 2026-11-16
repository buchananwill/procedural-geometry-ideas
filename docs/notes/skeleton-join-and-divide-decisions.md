---
title: "Skeleton join and divide: decision spec"
type: decision-spec
area: straight-skeleton
status: completed
date: 2026-11-14
verified_by: [packages/core/tests/straight-skeleton/holed-join-divide.test.ts, packages/core/tests/straight-skeleton/full-graph-digest.test.ts]
part_of: [holed-skeleton-roadmap.md]
depends_on: [skeleton-loops-input-decisions.md]
---

# Skeleton join and divide: decision spec

Node 4 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md), written from BSA.F91, BSA.F95 to BSA.F98, BSA.D284
and BSA.D290 to BSA.D293, and a reading of the files in the roster at `b5e139a`. It is built on the loop table and holed
input of [nodes 2 and 3](./skeleton-loops-input-decisions.md) and the stored wavefront of
[stage 1](./skeleton-wavefront-order-decisions.md), and starts only when the nodes 2 and 3 spec is completed. Roadmap
node 5 (simultaneous events across rings) and nodes 6 to 9 are not in this document.

## 1. Intent

The V5 event loop solves an outline with holes in the generic case, where no two events of different rings coincide.
A split already rewrites the links one way whether it divides one ring or joins two (stage 1 decision 12). This spec
makes the rest of the layer agree: a step's rings are always the links' rings, a step's children are its components (an
outer ring and the inner rings inside it), a step of more than one ring never reaches the pair or triangle handler, and
`partitionSpan`, the last id arithmetic in the event path, gives way to an order defined on any ring and equal to
today's on one loop. A layer in which events of different rings coincide is refused by name, for node 5. The
`holes-not-solved` stop goes. **A single-loop input solves to the byte-identical graph.** **One finding goes to the user
before approval:** `hasInteriorLoop` accepts the last open face of a hole too early (decisions 28 to 31).

## 2. Type and surface roster

`+` added, `~` changed, `-` removed, `=` unchanged but named because a reader will look for it.

| | Surface | File |
|---|---|---|
| ~ | `handleAlgorithmStepInput`: records the current step, then dispatches by ring count before edge count | [step-driver.ts](../../packages/core/src/straight-skeleton/step-driver.ts) |
| ~ | `solveSkeleton`: the holed stop removed; `blocking` gains the two new kinds | [solve-entry.ts](../../packages/core/src/straight-skeleton/solve-entry.ts) (the blocking kinds in [diagnostic-kinds.ts](../../packages/core/src/straight-skeleton/diagnostic-kinds.ts)) |
| ~ | `handleInteriorNGon`: rings from the links only, the cross-ring refusal, the partition order, children as components | [algorithm-complex-cases.ts](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts) |
| - | `ringsOfSubPolygon` | [coincident-events.ts](../../packages/core/src/straight-skeleton/coincident-events.ts) |
| + | `beginStep(context, interiorEdgeIds)`, `currentStepMembers(context): ReadonlySet<number> \| null` | [step-scope.ts](../../packages/core/src/straight-skeleton/step-scope.ts) |
| + | `partitionArc(context, params: BisectionParams): number` (its first argument the layer's `LayerLinks` since BSA.D356) | [layer-links.ts](../../packages/core/src/straight-skeleton/layer-links.ts) |
| + | `RingComponent { outer: number[]; inner: number[][] }`, `componentsOfRings(context, rings: number[][], time: number): RingComponent[]` | [ring-components.ts](../../packages/core/src/straight-skeleton/ring-components.ts) |
| + | `StraightSkeletonSolverContext.wavefrontVertexAt(bisectorId: number, time: number): Vector2` | [types.ts](../../packages/core/src/straight-skeleton/types.ts), [solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts) |
| ~ | `validateSplitReachesEdge(...)` returns `WavefrontSegment[]`, every validating segment in the current step | solver-context.ts |
| ~ | `generateSplitEvent`, `generateSplitEventFromTheEdgeItself`: choose from that list | [generate-split-event.ts](../../packages/core/src/straight-skeleton/generate-split-event.ts) |
| ~ | `SkeletonDiagnosticKind`: `+ 'simultaneous-across-rings'`, `+ 'multi-ring-step-refused'`, `- 'holes-not-solved'` | types.ts |
| ~ | `checkWavefrontCausality`: `deriveOffsets` and the clearance boundary read each exterior edge's own ends | [causality-check.ts](../../packages/core/src/straight-skeleton/causality-check.ts) |
| = | `linkSplit`, `linkVertexToVertex`, `linkGuardRefuses`, `ringsOfWavefront`, `checkWavefront` | layer-links.ts (the first two), [wavefront-links.ts](../../packages/core/src/straight-skeleton/wavefront-links.ts) (the next two), [wavefront-check.ts](../../packages/core/src/straight-skeleton/wavefront-check.ts) |
| = | `clusterCoincidentMerges`, `mergesShareAnEdge`, `bisectionsForMerge`; `handleCollisionEvent` | coincident-events.ts, [vertex-event.ts](../../packages/core/src/straight-skeleton/vertex-event.ts) (`bisectionsForMerge`), [collision-handling.ts](../../packages/core/src/straight-skeleton/collision-handling.ts) |
| = | `hasInteriorLoop`, `tryToAcceptExteriorEdge`, until the user rules on decision 31 | [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) |
| = | `adjacentExteriorEdge`, `loopOfExteriorEdge`, `StraightSkeletonGraph.loops` (nodes 2 and 3) | graph-helpers.ts, types.ts |
| = | `isPointInPolygon`, `signedArea`, `distanceToSegment`, `degenerateAreaBar`, `birthArrivalOf`, `timeOf` | [planar-geometry.ts](../../packages/core/src/straight-skeleton/planar-geometry.ts) (the first three, re-exported by their former homes `terrain/polygon-slope.ts`, `random-polygon/geometry-helpers.ts` and `stroke-spline/vertex-budget.ts`), constants.ts, collision-helpers.ts |
| + | `holed-join-divide.test.ts`, `holed-test-helpers.ts` | `packages/core/tests/straight-skeleton/` |

## 3. Decisions

### The rings of a step

1. **A step's rings are `ringsOfWavefront` over its input, always, and `ringsOfSubPolygon` is deleted.** Its `null`
   came from keying a ring on a unique widdershins parent, which every joined ring breaks (BSA.F91), and part A found
   it `null` on no layer of any roster (BSA.F95), so removing its gate to whole-event resolution moves no single loop.
2. **A merge is resolved whole only when all its arrivals lie on one ring,** as `asWholeEvents` requires today. A merge
   with arrivals on two rings is a vertex meeting across rings and refuses its layer (decision 19).
3. **An interior pair is a neighbour collapse exactly when the links make the two neighbours** (BSA.D293, landed by
   stage 1's fix pass), and the question is asked of the links when the event is resolved, never answered from the
   type a cached `CollisionEvent` was priced with: a shared parent no longer means adjacency once an edge bounds two
   segments of one ring.
4. **The struck segment is searched only among segments whose `from` stands in the current step.**
   `handleAlgorithmStepInput` records the step with `beginStep`; outside a step, as in a direct unit-test call, every
   segment of the edge is searched, as today. On one loop 0 of about 320,000 validating calls struck outside the step
   (BSA.F97).
5. **`validateSplitReachesEdge` returns every validating segment in the step, in today's order; the incenter path and
   `generateSplitEvent` take the first the neighbour guard does not refuse.** The direct-strike path takes the first
   validating segment unguarded, as today, because guarding it moves seven complete sweep cells (BSA.F98). On one loop
   no split validated on more than one segment (BSA.F95). This amends stage 1 decision 11.
6. **The partition dedupe keeps its key, clockwise parent and source node.** One event bears at most one bisector per
   clockwise parent at its node, so in the generic case two births sharing the key are re-reports; the rule of
   BSA.D293 that no bisector with live neighbours is dropped applies unchanged.
7. **The step's exterior parents are read as today, duplicates included.** An edge bounding two segments of one step
   is listed twice, and its two reports of one split are one event, consumed as today's duplicate (the widdershins
   parent `exteriorParentsOfSubPolygon` appends) is consumed: the first resolved retires the instigator.

### Join and divide

8. **Every split is resolved by the one rewrite of stage 1 decision 12.** The solver never branches on join against
   divide when it writes links or bears bisectors.
9. **A split is a join when its instigator and its struck segment's `from` lie on different rings of the step at the
   layer's start, and a divide otherwise.** It is read once, before the layer resolves any event, and only the
   cross-ring refusal of decision 19 reads it.
10. **What a layer did is read from the rings it leaves.** The child steps are the step's components after the layer:
    a join leaves one child where the step had two rings, a divide leaves two components, and a layer holding a join
    and an unrelated divide leaves whatever its rings make, by the same rule.

### Components: which child each ring goes to

11. **A step of one ring leaves only outer rings, and each is its own child, in today's order.** One ring bounds a
    disc and dividing a disc leaves discs. Every step of a single-loop solve is of this kind, so nothing is classified
    on one loop.
12. **A step of more than one ring has the rings it leaves classified at the layer's time `t`, the time of the earliest
    arrival the layer resolved.** A ring's polygon is its bisectors' positions at `t` in clockwise-neighbour order: a
    bisector born in the layer stands at its source node, and an older one at `context.wavefrontVertexAt(id, t)`, the
    construction `validateSplitReachesEdge` already uses (the bisector's birth arrival, its clockwise parent's weight).
13. **A ring whose polygon has negative `signedArea` is outer, and positive is inner.** Outer is the outline's clockwise
    winding (nodes 2 and 3, decision 21). Worked example on fixture F1: at the root the hole's ring is the hole, area
    `+2`, inner; the ring the join leaves at `t = 2√2 − 2` has area `−(10 − 2t)² + 2(1 + √2·t)² ≈ −60.2`, outer.
14. **Each outer ring founds one child, and each inner ring joins the child of the outer ring of least `|area|` whose
    polygon contains the inner ring's witness, by `isPointInPolygon`.** The witness is the source node of the clockwise
    parent of the ring's first member. An inner ring holds only hole edges, since a join with an outer ring makes an
    outer ring, so the witness is a vertex of a hole the ring encloses.
15. **It is sound in the generic case:** at `t` the rings are simple, disjoint but for the nodes this layer created,
    and nested. The witness lies on a wall, which every front left at offset zero, so it lies on no ring. The outer
    rings that contain it are nested, and the least area is the innermost; so a hole inside the pocket an inner ring
    pinches off goes to the pocket, and every other hole goes to the ring around the pinched ring.
16. **Ambiguity is refused, never guessed.** A ring with `|area|` at or under `degenerateAreaBar(δ, perimeter)`, a
    witness closer than δ to an edge of a candidate polygon by `distanceToSegment`, or an inner ring that no outer ring
    contains pushes `multi-ring-step-refused` naming the step and the ring, and throws. The layer's events stand and the
    step leaves no child.
17. **A component's child lists its members in the order they were gathered, and children are ordered by today's
    claim:** the earliest partition event whose bisector the component holds, then the position of its first member.

### Coincidence across rings: the boundary with node 5

18. **A vertex-to-vertex event between bisectors of two rings is not generic and belongs to node 5.** It needs a vertex
    of each ring to arrive together, which is two strikes coinciding; the concentric courtyard is made of such meetings.
    It is refused by decision 19 under any reported type: `interiorPair`, `interiorNonAdjacent` or a merge.
19. **A layer is refused as simultaneous across rings when, among the events it will resolve, an interior-to-interior
    event (a pair, a non-adjacent pair or a merge) has participants on two rings, or a join shares the layer with
    another event touching either of its two rings.** Reports that name one instigator are one event. The events are
    the layer's own, chosen by `HELD_SIMULTANEITY_WINDOW`, the narrowing to the earliest moment and
    `clusterCoincidentMerges` at δ, so no window or tolerance is added.
20. **The check runs once the layer's event set is final and before its first event is resolved,** so a refused layer
    changes no link, node or acceptance. The n-gon pushes `simultaneous-across-rings`, naming the step's rings, the
    events and their arrival, then throws, and `stepAlgorithm` records the step failure as it records any throw.
21. **On one loop the check cannot fire,** because every step is one ring and no event touches two.

### Dispatch and termination

22. **`handleAlgorithmStepInput` counts the step's rings first.** A step of one ring dispatches by edge count as
    today; a step of more than one ring always goes to `handleInteriorNGon`. A multi-ring step with a ring of fewer
    than three bisectors is refused with `multi-ring-step-refused`, because in the generic case every ring has three.
23. **A multi-ring step with no event is refused with `multi-ring-step-refused` and never climbs the terminal ladder.**
    The ladder's closures and its coaxial completion are statements about one live set, and would pair bisectors of
    different rings.
24. **A holed solve terminates as a single loop does, when no step input remains.** Once every hole has joined, every
    step is one ring and the base cases close it. `complete` keeps its meaning, with the two new kinds blocking.

### The partition order

25. **`partitionSpan` is replaced by `partitionArc`.** It walks the pending bisector's ring clockwise from the bisector
    to the last member before it returns, and sums the gaps between consecutive clockwise parents. A gap between two
    edges of one loop is the number of `adjacentExteriorEdge(·, Clockwise)` steps from the first to the second; a gap
    between edges of two loops is 1. The sort stays stable and its tie-break (clockwise parent id) stays.
    ```text
    partitionArc(b) = Σ_{k=0..m-1} gap(cp(e_k), cp(e_{k+1}))
      e_0 = b,  e_{k+1} = clockwise neighbour of e_k,  clockwise neighbour of e_m = b,  cp = clockwise parent
    ```
26. **On one loop it equals today's span exactly.** A ring cut from one loop has clockwise parents that rise cyclically
    through less than one turn from the bisector's `cw` to its `ws` (W2 makes the last parent `ws`), so the gaps
    telescope to `(ws − cw + n) mod n`. Ordering by ring size (BSA.F96) leaves out the closed edges inside the arc,
    which is why it moved 16 digests. Worked example: on a loop of 10 edges, a newborn with `cw` 3 and `ws` 7 on a ring
    whose parents are 3, 4, 6, 7 (edge 5 closed) has gaps 1, 2 and 1, summing to 4, which is `(7 − 3) mod 10`.
27. **The walk reads pending births through the layer's link state,** because the order is taken before births. A
    ring the links cannot close (the early-acceptance path) gives whatever it walks, and a digest that moves there is
    handled under stage 1 decision 31.

### Acceptance and face closure: a finding for the user

28. **`hasInteriorLoop` accepts an exterior edge when its two end nodes are joined by any chain of accepted interior
    edges, which is connectivity and not face closure.** On a single loop's tree the only chain is the face's own
    boundary. A holed skeleton has one cycle per hole, so a second chain exists. BSA.F91 called the function
    loop-neutral; it is not.
29. **Finding, read and traced by hand, not run:** for a hole of `k` edges, once `k − 1` of its faces are closed, their
    boundaries join the last edge's two ends round the hole, and the edge is accepted whether its own face has closed or
    not. When that face still has an event to come that bears a bisector naming the edge, the birth is refused and the
    ring breaks, as in [the early-acceptance issue](./ISSUE-skeleton-edge-accepted-before-its-face-closes.md). Traced on
    F1 with its outline stretched to `[−20, 10] × [0, 10]`: at `t = 4.5` the hole's NW segment collapses at
    `(6 − 4.5√2, 5.5)`, the layer's acceptance finds the chain round the hole and accepts the SW edge, and the bisector
    between the top wall and SW is refused at birth. F1 itself is clear, because its last two hole faces close in the
    same `stepAlgorithm` pass.
30. **The outline edge a hole vertex strikes, and the hole edges beside the strike, are accepted correctly today.** The
    chain through the join node is their own face's boundary, and the search stops at a hole node because it never
    walks an exterior edge. An edge bounding two segments is therefore not the defect; the hole's cycle is.
31. **Proposed to the user, and not built without the user's word: an exterior edge is accepted exactly when no live
    bisector and no pending birth of the layer names it as a parent,** which is W4's "no live segment", and is face
    closure read from the links. Wherever a single-loop solve is sound it agrees with `hasInteriorLoop`, and it differs
    on the solves that trip BSA.F95's cause, where it is the cure; every changed solve is handled under stage 1 decision
    31. Until the user rules, each holed fixture that trips the cause is a red test pointing at the issue note
    (BSA.D266), and node 4 cannot be completed on it.

### The causality check

32. **`checkWavefrontCausality` moves onto every loop in this spec, not in node 6** (amending nodes 2 and 3, decision
    36). `deriveOffsets` dates a node against the line through its parent's own source and target nodes in place of
    `(parent + 1) % edgeCount`, and the clearance boundary is each exterior edge's own segment in place of the ring
    `(k + 1) % boundary.length`. Both need no loop table, and both give today's numbers on one loop, where edge `i`'s
    target is node `i + 1 mod n`. Clearance is then the distance to the nearest wall of any loop, as a holed region
    needs.
33. **The offset, direction and rate oracles need nothing more.** The check stays always on and read-only.

### What still stops

34. **`holes-not-solved` is retired with the stop that pushed it.** A holed solve steps like any other, and this spec
    replaces decisions 33 to 35 of nodes 2 and 3.
35. **What still stops, each signalled and blocking:** a layer refused as `simultaneous-across-rings` (node 5's
    work); a step refused as `multi-ring-step-refused`; the refusals at the door of nodes 2 and 3; and the legacy
    entries' refusal of holes. A refused step's bisectors stay unresolved, so `unresolved-edges` follows. No holed solve
    reports `complete: true` past a refused layer.

### Boundaries

36. **A single-loop input solves to the byte-identical graph,** held by the gates of decision 40. A divergence is
    diagnosed, then fixed or accepted with a written reason and the lead's acceptance (BSA.D284, stage 1 decision 31).
37. **No tolerance, window, constant or comparison moves.** Decision 16 reads δ and `degenerateAreaBar` at new sites
    without changing either. The C++ port is not a consideration (BSA.D281).
38. **Nothing outside `packages/core` changes.** The dashboard, the fixtures package and building-shell pass untouched.

### Fixtures and gates

39. **The baseline is measured before the first edit:** the `@proc-geo/core` Jest and `@proc-geo/building-shell`
    Vitest figures.
40. **Single-loop byte identity is held by
    [full-graph-digest.test.ts](../../packages/core/tests/straight-skeleton/full-graph-digest.test.ts), the sweep
    harness, the recursion census and building-shell's golden drift test.** A measuring run over the same rosters
    reports: steps of more than one ring, splits validating on more than one segment or outside the step, refused
    layers, and calls where `partitionArc` differs from `partitionSpan`. Each is expected to be zero.
41. **The holed fixtures live in `holed-join-divide.test.ts`,** because the fixtures package's `{name, vertices}`
    cannot hold a hole; node 6 makes them a roster. Each fixture is chosen so that no two events of different rings
    share a layer, and its test asserts that no refusal was raised:
    - **F1**, decision 47; and **F1 stretched** to `[−20, 10] × [0, 10]`, the specimen of decision 29.
    - **F2**, two holes, one joining the other before either reaches the outline.
    - **F3**, an L-shaped hole, whose inner corner is convex in the region (nodes 2 and 3, decision 15).
    - **F4**, a weighted hole.
    - **F5**, a reflex outline whose own split divides it while the hole ring shares the step, and F5's mirror image,
      so that the hole lies in the first child once and the second once.
    - **F6**, a hole near one wall that joins first; **F7**, a hole deep inside that joins after an outline event.
42. **Every holed fixture asserts:** `complete`; no refusal and no causality diagnostic; `checkWavefront` empty at
    every step boundary; one face per exterior edge of every loop, traced from the edge's own source and target by
    I4's walk across its own bisectors; every interior node inside the outline and outside every hole; the traced
    faces' areas summing to the outline's area less the holes'; the rate and direction oracles clean; and the graph
    of interior edges connected, with no self-loop and a cycle rank equal to the hole count.
43. **The single-loop helpers that need a holed variant (BSA.F92)** read each exterior edge's own ends or the loop
    table: `isInside`, `distanceToBoundary` and `escapedNodes` in
    [containment-helpers.ts](../../packages/core/tests/straight-skeleton/containment-helpers.ts); `deriveNodeArrivals`,
    the clearance boundary of `causalityViolations` and `rawOffsetsOfNode` in
    [wavefront-measurement-helpers.ts](../../packages/core/tests/straight-skeleton/wavefront-measurement-helpers.ts);
    I1's widdershins parent and I4's walk goal in
    [graph-index-invariants.test.ts](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts); and
    the tiling of [strip-tiling.test.ts](../../packages/core/tests/straight-skeleton/strip-tiling.test.ts), which
    goes through `computeStrips` and its arithmetic (node 6), so the holed tiling sums traced faces instead.
44. **The refusal is tested on node 5's concentric square and its off-centre rectangle with parallel walls.** Each
    returns `complete: false` with a blocking refusal naming the step; which of the two kinds each meets is measured
    and written into its test. This is specified behaviour until node 5 replaces it, as nodes 2 and 3 decision 35 was.
45. **Mutation gates, each turning a test red:** every split read as a divide (the refusal tests); every split read as
    a join (`Golf Cart`, whose two same-ring splits share a layer); each inner ring sent to the first outer ring (F5
    or its mirror); each ring its own child, today's rule (every holed fixture); the area sign inverted (F2);
    `partitionArc` by ring size (the digests); `(parent + 1) % edgeCount` restored in the causality check (a holed node
    dated against a loop's last edge, named by the test); the cross-ring check removed (the refusal tests). The step
    restriction of the struck segment and the guard on every validating segment get constructed unit tests over a
    step holding two segments of one edge, because no generic fixture reaches them.
46. **The early-acceptance red test sweeps the holed fixtures by its cause** (BSA.D293). F1 stretched is expected
    there until the user rules on decision 31.

### The first fixture's expected answer

47. **F1 is the outline `(0,0), (0,10), (10,10), (10,0)`, clockwise, and the hole `(8,5.5), (7,6.5), (6,5.5),
    (7,4.5)`, counter-clockwise:** a square of side √2 turned 45°, centred at `(7, 5.5)`. Its edges are named NE, NW,
    SW and SE in that order. It has no parallel walls and no two events at one time.
48. **Its skeleton has 16 nodes, 8 exterior and 8 interior, and 16 interior edges.** For a generic skeleton with
    every interior node of degree three, Euler gives `n + 2h − 2` interior nodes, here `8 + 2 − 2`. Every node below is
    equidistant from its three walls, and the test asserts each within `1e-9` of the extent of its closed form:

    | Node | Event, in order | `t` | Position | Walls |
    |---|---|---|---|---|
    | J | join: hole corner `(8,5.5)` strikes `x = 10` | `2√2 − 2 ≈ 0.828427` | `(12 − 2√2, 5.5)` | right, NE, SE |
    | S_T | divide: corner `(7,6.5)` strikes `y = 10` | `3.5(√2 − 1) ≈ 1.449747` | `(7, 13.5 − 3.5√2)` | top, NE, NW |
    | S_B | divide: corner `(7,4.5)` strikes `y = 0` | `4.5(√2 − 1) ≈ 1.863961` | `(7, 4.5√2 − 4.5)` | bottom, SE, SW |
    | P_TR | triangle closes | `3.25(2 − √2) ≈ 1.903806` | `(3.5 + 3.25√2, 3.5 + 3.25√2)` | right, top, NE |
    | P_BR | triangle closes | `3.75(2 − √2) ≈ 2.196699` | `(2.5 + 3.75√2, 7.5 − 3.75√2)` | right, bottom, SE |
    | S_L | divide: corner `(6,5.5)` strikes `x = 0` | `6(√2 − 1) ≈ 2.485281` | `(6√2 − 6, 5.5)` | left, NW, SW |
    | P_TL | triangle closes | `5.25(2 − √2) ≈ 3.075379` | `(10.5 − 5.25√2, 5.25√2 − 0.5)` | left, top, NW |
    | P_BL | triangle closes | `5.75(2 − √2) ≈ 3.368272` | `(11.5 − 5.75√2, 11.5 − 5.75√2)` | left, bottom, SW |

49. **Its topology, asserted edge by edge:** each hole corner's bisector ends at its strike node; each outline
    corner's bisector ends at the P node of its corner; J sends edges to P_TR and P_BR, S_T to P_TR and P_TL, S_B to
    P_BR and P_BL, and S_L to P_TL and P_BL. The one cycle is J, P_TR, S_T, P_TL, S_L, P_BL, S_B, P_BR. The join is the
    root step's only event; the three later strikes are divides of the joined ring.

### Amendments after the acceptance cure (BSA.D296, BSA.D303)

50. **Decision 31 is built:** the user approved it (BSA.D296), and it landed at `8170011` under
    [the edge-acceptance spec](./skeleton-edge-acceptance-decisions.md). An exterior edge is accepted at a step boundary
    exactly when no live bisector names it as a parent; `hasInteriorLoop` and the in-step acceptance calls are gone,
    and the roster's line for them is void. Decisions 28 to 30 stand as the record of why.
51. **This spec uses that predicate unchanged, and tests it on a hole.** It reads no loop and no topology, so the cycle
    round a hole cannot accept an edge. **F1 stretched is an ordinary green fixture of decision 41,** asserting all of
    decision 42, and it is the specimen that the last open face of a hole is accepted only when it closes. Decision 46
    is void: the early-acceptance file is green and its cause cannot hold.
52. **The same-node ring rule of the edge-acceptance spec's decision 32 applies to every step, of one ring or several:**
    a ring made only of one layer's pending births, all sourced at one node, is closed there unborn. It is applied
    before the components of decision 10 are read, so such a ring founds no child.
53. **Acceptance is read at step boundaries only, so within a layer every exterior edge of the step reads as not
    accepted.** Nothing in decisions 1 to 27 relies on an edge being accepted in mid-layer.

## 4. Deferred

- **Simultaneous events across rings, and so the concentric courtyard:** roadmap node 5.
- **Offset projection, strip decomposition and a holed roster:** node 6. **The dashboard:** node 7.
- **A direct strike asked of the neighbour guard:** measured and not applied (BSA.F98).
