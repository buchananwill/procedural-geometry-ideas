---
title: "Skeleton wavefront order: decision spec"
type: decision-spec
area: straight-skeleton
status: approved
date: 2026-11-14
part_of: [holed-skeleton-roadmap.md]
---

# Skeleton wavefront order: decision spec

Stage 1 of the holed skeleton (BSA.D282), written by the arc lead from BSA.F91 and a reading of the files in the
roster. Stages 2 to 4 (several input loops and the join event, loop-aware consumers, building-shell) are not in this
document and nothing here builds them.

## 1. Intent

The V5 solver identifies a wavefront vertex by the two exterior edges its bisector divides, and it never stores the
order of those vertices around the wavefront. It derives that order from exterior edge ids by modular arithmetic. The
derivation is exact for one input loop, because every ring that splits cut from one loop is a cyclic run of ids. It is
wrong for a footprint with a hole from the first moment two rings join, because the joined ring is no run of ids and
the struck edge bounds two segments of one ring (BSA.F91). This spec makes the order a stored fact: every live bisector
holds its two neighbours, a ring is an orbit of those links, a segment of an exterior edge is a linked pair, and each
event that changes the wavefront's shape rewrites the links from its own participants. Every reader of order then
reads the links. **The solver's output does not change: every fixture and sweep cell solves to the byte-identical
graph.** The work is done in two parts so that the claim is measured before it is relied on: first the links are
maintained and compared against the arithmetic while nothing reads them, then the readers are switched.

## 2. Type and surface roster

`+` added, `~` changed, `-` removed, `=` unchanged but named because a reader will look for it.

| | Surface | File |
|---|---|---|
| + | `interface Wavefront { clockwiseNeighbour: number[]; widdershinsNeighbour: number[] }`, both indexed by interior edge id, `-1` where the bisector is not live | [types.ts](../../packages/core/src/straight-skeleton/types.ts) |
| + | `StraightSkeletonSolverContext.wavefront: Wavefront` | types.ts; built in [solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts) |
| + | `interface WavefrontSegment { exteriorEdge: number; from: number; to: number }`: `from` is the bisector whose clockwise parent is `exteriorEdge`, `to` is `from`'s clockwise neighbour | types.ts |
| + | `CollisionEvent.struckSegment?: WavefrontSegment`, set on every `interiorAgainstExterior` event | types.ts |
| + | `ringsOfWavefront(context, interiorEdgeIds): number[][]`, the orbits of `clockwiseNeighbour` over the given bisectors | new file `wavefront.ts` beside the others |
| + | `checkWavefront(context, inputs: AlgorithmStepInput[]): string[]`, the violations of W1 to W4, empty when sound | `wavefront.ts`; exported from [index.ts](../../packages/core/src/index.ts) |
| ~ | `validateSplitReachesEdge(...)` returns `WavefrontSegment \| null`, the segment that validated | solver-context.ts |
| ~ | `activeExteriorEdgeSegments(edgeId)` reads the links | solver-context.ts |
| ~ | `generateSplitEvent`, `generateSplitEventFromTheEdgeItself`: the neighbour guard reads the links | [generate-split-event.ts](../../packages/core/src/straight-skeleton/generate-split-event.ts) |
| ~ | `handleCollisionEvent`, the whole-event merge and the terminal handlers write the links | [collision-handling.ts](../../packages/core/src/straight-skeleton/collision-handling.ts), [algorithm-complex-cases.ts](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts), [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts), [coincident-events.ts](../../packages/core/src/straight-skeleton/coincident-events.ts) |
| ~ | `handleInteriorNGon`: child steps are the rings left by the layer | algorithm-complex-cases.ts |
| ~ | `addBisectionEdge`: an accepted parent throws by a direct test | [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) |
| - | `span`, `clockwiseSpanExcludingAccepted`, `clockwiseSpanIncludingAccepted` | solver-context.ts, types.ts |
| = | `initBoundingPolygon`, `initInteriorEdges`: one loop, wired `(i ± 1) % n` as today | [graph-helpers.ts](../../packages/core/src/straight-skeleton/graph-helpers.ts), algorithm-helpers.ts |
| = | `ringsOfSubPolygon`: kept, and still the function whose `null` sends a layer to the pairwise fallback | coincident-events.ts |
| = | `solveSkeleton`, `runAlgorithmV5`, `runAlgorithmV5Stepped`, every option, every constant | algorithm-termination-cases.ts, [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) |

## 3. Decisions

### The model

1. **A bisector is live from its creation until it is accepted.** The clockwise neighbour of a live bisector `b` is
   the live bisector that bounds the same wavefront segment of `b`'s clockwise parent. The widdershins neighbour is the
   inverse.
2. **W1.** Every live bisector has exactly one clockwise and one widdershins neighbour, both live, and each is the
   other's inverse. A bisector that is not live holds `-1` in both arrays.
3. **W2.** The clockwise parent of a live bisector is the widdershins parent of its clockwise neighbour.
4. **W3.** A ring is an orbit of `clockwiseNeighbour`. Every step input is a union of whole rings: it holds every
   bisector of each ring it touches and no bisector that is not live.
5. **W4.** The live segments of an exterior edge are exactly the pairs `(from, to)` with `from`'s clockwise parent equal
   to that edge and `to` equal to `from`'s clockwise neighbour.
6. **W1 to W4 are stated at step boundaries**: after `initInteriorEdges`, and after each `stepAlgorithm` returns, over
   the step inputs still to run. They are not required to hold in the middle of a layer.
7. **`Wavefront` is plain data**, two arrays of numbers, so a `structuredClone` of the context carries it.

### Writing the links

8. **`initInteriorEdges` writes the first ring** from the loop's vertex order.
9. **Every event that removes or creates a bisector writes the links in the same act,** from the participants it
   holds: the pair collapse, the vertex-to-vertex event of two bisectors that share no parent, the split, the
   whole-event merge and its `bisectionsForMerge`, and the pair, triangle and terminal-ladder closures.
10. **A link is never recovered from parent ids after the fact.** No code finds a neighbour by searching for a bisector
    with a matching parent, and none finds one by id distance. This is the property the whole spec exists for: a
    search by parent is ambiguous as soon as one exterior edge bounds two segments of one ring.
11. **A split names the segment it struck.** `validateSplitReachesEdge` returns the segment that validated, and the
    event carries it as `struckSegment`. Where more than one live segment of the edge validates, the first in today's
    order is taken, and part A counts how often that happens.
12. **A split rewrites four links:** the struck segment `(from, to)` and the instigator's two neighbours become
    `from` to the new bisector whose widdershins parent is the struck edge, to the instigator's clockwise neighbour;
    and the instigator's widdershins neighbour to the new bisector whose clockwise parent is the struck edge, to `to`.
    The same rewrite divides a ring when the instigator and the struck segment share one, and joins two rings when they
    do not. Stage 1 meets only the first.
13. **The ids of new bisectors and nodes are assigned in today's order.** Creation order, child-step order and the
    order events are resolved in a layer do not change, because the graph digests pin ids.

### Part A: maintained and compared, read by nothing

14. **Part A lands decisions 1 to 13 with no reader switched.** The arithmetic still decides everything, so part A
    cannot change a solve.
15. **Part A's test runs `checkWavefront` at every step boundary** of every `FULL_CORPUS` fixture, the weighted
    fixtures, the 642-cell sweep and the recursion census's regions, and asserts no violation on every solve that
    completes.
16. **Part A compares four answers at every call, links against arithmetic, and reports the disagreements:**
    - the segments `activeExteriorEdgeSegments` returns, as sets of bisector pairs;
    - the verdict of the neighbour guard at each of its two sites, where the link form refuses a split whose struck
      segment has `from` equal to the instigator or to its clockwise neighbour, or `to` equal to the instigator or to
      its widdershins neighbour;
    - the child steps of each partitioning layer, as sets of bisector sets, against the rings left by the layer;
    - the rings `ringsOfSubPolygon` returns when it does not return `null`, against `ringsOfWavefront`.
17. **Part A's report gives, for each of the four,** the number of calls, the number of disagreements, and for each
    distinct disagreement the fixture, the step and both answers. It also gives the number of layers on which
    `ringsOfSubPolygon` returned `null`, and the count of decision 11.
18. **Part A stops and reports to the arc lead before part B.** Every disagreement is diagnosed to its cause by the
    implementer. A defect in the link writing is fixed. A place where today's arithmetic and the wavefront's true
    order differ is reported with the diagnosis and with which of the two answers is the valid one and why; accepting
    it is the lead's ruling.

### Part B: the readers switch

19. **Part B switches each of the four readers of decision 16 to the links,** and only those the lead has cleared.
20. **`ringsOfSubPolygon` keeps deciding `null` as it does today** and its `null` still sends the layer to the pairwise
    fallback. Its non-null rings are the wavefront's rings. Retiring it belongs to stage 2.
21. **`addBisectionEdge` throws on an accepted parent by testing `isAccepted`,** with today's message. The
    `parentsInverted` log line goes with the span calls that fed it.
22. **`span` and its two context methods are deleted** once no caller remains. No modular arithmetic on exterior edge
    ids remains in the solver's event path; what remains is the single-loop wiring of `initBoundingPolygon` and
    `initInteriorEdges`, and the boundary stage and post-solve consumers, which stage 1 does not touch.
23. **`checkWavefront` stays in the suite** over the same rosters as decision 15, as the standing gate on link writing.

### Boundaries

24. **No tolerance, window, constant or comparison moves.**
25. **No public signature of the solve changes,** and no input with more than one loop is accepted.
26. **Nothing outside `packages/core` changes.** The dashboard, the fixtures package and building-shell compile and
    pass untouched.

### Gates

27. **The baseline is measured on the starting tree before the first edit:** the `@proc-geo/core` Jest figure, and the
    `@proc-geo/building-shell` Vitest figure, which runs on core's source.
28. **Byte-identity is held by `full-graph-digest.test.ts`, the sweep harness, the recursion census and
    building-shell's golden drift test,** after part A and after part B. Part A edits no pin, since nothing reads the
    links. After part B a pin is edited only under decision 31.
29. **`checkWavefront` is convicted by mutation:** for each event kind of decision 9, a mutation that drops or
    misdirects one of its link writes turns the gate red.
30. **The switched readers are convicted by mutation:** restoring a wrong neighbour answer in each of the four turns at
    least one existing test red.
31. **A graph that diverges from today's is diagnosed, never waved through and never left as a bare stop**
    (BSA.D284). Byte identity is the cheap test that two answers are the same; it does not say which is the more
    valid. The implementer makes every reasonable effort to find the cause, then either fixes it or writes why the new
    answer is acceptable, with the measurements that show it is no less valid than the old one (the four causality
    oracles, containment, tiling). A pin moves only with that written reason and the lead's acceptance.
