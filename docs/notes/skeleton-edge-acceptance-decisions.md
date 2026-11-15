---
title: "Skeleton edge acceptance: decision spec"
type: decision-spec
area: straight-skeleton
status: completed
date: 2026-11-15
part_of: [ISSUE-skeleton-edge-accepted-before-its-face-closes.md]
depends_on: [skeleton-wavefront-order-decisions.md]
verified_by: [packages/core/tests/straight-skeleton/skeleton-edge-acceptance.test.ts, packages/core/tests/straight-skeleton/wavefront-order-early-acceptance.test.ts, packages/core/tests/straight-skeleton/wavefront-order.test.ts, packages/core/tests/straight-skeleton/full-graph-digest.test.ts]
---

# Skeleton edge acceptance: decision spec

The cure the user approved in BSA.D296 for [the early-acceptance issue](./ISSUE-skeleton-edge-accepted-before-its-face-closes.md),
written from BSA.F95 to BSA.F97, BSA.D290 to BSA.D296, decisions 28 to 31 of the
[node 4 spec](./skeleton-join-and-divide-decisions.md) and a reading of the files in the roster at `79efab9`. It is its
own unit on single-loop input, built after roadmap nodes 2 and 3 land and before node 4 (BSA.D296). No holed solve
reaches it: a holed solve stops after initialisation and never calls `stepAlgorithm`
([nodes 2 and 3](./skeleton-loops-input-decisions.md), decision 33).

## 1. Intent

`tryToAcceptExteriorEdge` accepts an exterior edge when `hasInteriorLoop` finds its two end nodes joined by any chain of
accepted interior edges. That is connectivity, not face closure: on a sound single-loop tree the only chain is the
edge's own face boundary, but a chain through other faces accepts the edge while a bisector still traces its face, the
next birth naming it is refused, and the ring breaks (BSA.F95). This spec makes acceptance read the stored wavefront:
**an exterior edge is accepted exactly when no live bisector and no pending birth names it as a parent** (BSA.D296). The
new predicate is measured beside the old one over every roster before it decides anything. **Every solve outside the six
the red test names solves to the byte-identical graph;** the six are measured before and after, and their moved pins go
to the lead.

## 2. Type and surface roster

`+` added, `~` changed, `-` removed, `=` unchanged but named because a reader will look for it.

| | Surface | File |
|---|---|---|
| + | `exteriorFaceIsClosed(context, exteriorEdge: number): boolean`: no live bisector has the edge as either parent | [wavefront.ts](../../packages/core/src/straight-skeleton/wavefront.ts) |
| ~ | `tryToAcceptExteriorEdge`: signature and export unchanged; accepts on `exteriorFaceIsClosed` | [algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) line 437 |
| - | `hasInteriorLoop` and its export | algorithm-helpers.ts line 338; [index.ts](../../packages/core/src/index.ts) line 141 |
| ~ | `handleInteriorNGon`: its two acceptance calls (lines 356, 551) and its birth filters' accepted-parent clauses (lines 224, 566–569, 575–579) go | [algorithm-complex-cases.ts](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts) |
| = | `runSimplePolygon` line 1255, `runSimplePolygonStepped` line 1981: the call sites that stay | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) |
| = | the accepted-parent throws of `addBisectionEdge` (line 154) and the incenter fallback | algorithm-helpers.ts; [generate-split-event.ts](../../packages/core/src/straight-skeleton/generate-split-event.ts) line 440 |
| + | optional `WavefrontProbe` members for the measuring step, removed again at the switch | wavefront.ts |
| ~ | `closeSolve` loses the cause-based discard; `solveFinished` records unaccepted exterior edges | [wavefront-probe-helpers.ts](../../packages/core/tests/straight-skeleton/wavefront-probe-helpers.ts) |
| ~ | header comment only; every assertion unchanged | [wavefront-order-early-acceptance.test.ts](../../packages/core/tests/straight-skeleton/wavefront-order-early-acceptance.test.ts) |
| + | `skeleton-edge-acceptance.test.ts`, constructed tests of the predicate | `packages/core/tests/straight-skeleton/` |

## 3. Decisions

### The predicate

1. **A live bisector is what `isLiveBisector` in wavefront.ts says: an interior edge not accepted.** It names exterior
   edge E when E is its clockwise or its widdershins parent. Both parents are read, as BSA.D296 words it; where the
   links are sound W2 makes the readings agree, since a live `to` with widdershins parent E has a live widdershins
   neighbour with clockwise parent E.
2. **A pending birth is a bisector a layer's events have linked as a token and not yet born:** in `handleInteriorNGon`,
   the `BisectionParams` in `collapseEvents` and `partitionEvents` between the resolution of the events and the dedupe.
   They exist only inside one call, between `beginLayerLinks` and `settleLayerLinks`. Between steps nothing is pending:
   every n-gon that returns has settled its layer, and the pair, triangle and ladder closures bear nothing. Tokens a
   thrown layer leaves in the link store are not pending births, since nothing will bear them, and the predicate never
   reads that store.
3. **The predicate reads no graph topology** (no `inEdges`, `outEdges`, targets or nodes). A cycle in the accepted
   subgraph, two unified nodes, a duplicate ridge or a bisector wired onto another face cannot accept an edge, which
   is the defect's mechanism; and it is loop-neutral by construction.

### Where it is asked

4. **It is asked at step boundaries only,** where nothing is pending, so there it is the approved predicate exactly:
   `runSimplePolygon` line 1255, `runSimplePolygonStepped` line 1981 (the dashboard's stepped explorer), and the
   test-side runners that follow `stepAlgorithm` the same way. The search
   `git grep -n "tryToAcceptExteriorEdge\|hasInteriorLoop" 79efab9 -- .` (whole tree, dashboard and apps included;
   the working tree gives the same files) finds those two, the two n-gon sites below, and the test-side runners:
   [test-helpers.ts](../../packages/test-fixtures/src/test-helpers.ts) line 80, anti-parallel-corridor line 156,
   fuzz-ellipse line 72, and the crab, crazy-polygon, double-reflex-spaceship, duck-octagon, e38-e30, isthmus and
   step3-trace debug suites. The pair and triangle handlers are not call sites and gain none.
5. **The call after the n-gon's events (line 551) is removed, because under the new rule no reader can observe an
   acceptance made there.** Acceptance then changes only at boundaries, and at the last boundary every parent of every
   birth of the layer was named by a then-live bisector (a participant, or a struck segment's `from`), so no birth meets
   an accepted parent. Every other in-step reader of an exterior edge's acceptance (the split guards,
   `collideInteriorAndExteriorEdge`, `findOrComputeCollision`, `createCollisions`) asks only of edges a live bisector of
   its own step names. The edge is accepted at the next boundary, with the same graph and final `acceptedEdges`.
6. **The call after the n-gon's terminal-ladder closure (line 356) is removed** for the same reason; that layer resolves
   no event, so nothing is pending there either.

### What acceptance is used for

7. **The birth filters' accepted-parent clauses are deleted** (`selectPartitionEvents` line 224, the partition births
   lines 566–569, the collapse births lines 575–579). They cannot fire under the new rule, and a silently refused birth
   is how the defect broke rings; `addBisectionEdge`'s throw stays as the one guard, so a birth with a finished parent
   becomes a step failure. The dedupe and `droppableBirths` are untouched.
8. **Neither termination nor completeness reads exterior acceptance.** The run ends when no step input remains, and
   `complete` reads step failures and unresolved interior edges. The final array is read by the full-graph digest's
   section (e), the sweep harness's record, and the test-side completeness checks (golf-cart, slightly-deformed-peanut,
   regression, algorithm-termination-cases, terminal-cases' T-Shape, anti-parallel-corridor's family harness). On a
   complete solve every bisector ends accepted, so both rules accept every exterior edge.
9. **A face that never closes is signalled.** An exterior edge ends unaccepted exactly when a bisector naming it is
   still live, which only a thrown step, a one-edge child or a ring the links lost can leave. The standing gate's
   roster runs assert in `solveFinished`, with no sweep of their own, that every complete solve ends with every
   exterior edge accepted and every solve ending with one unaccepted carries a `step-failure` or `unresolved-edges`.
10. **Only the six are known to rely on early acceptance.** On the two complete red cells the refused birth left a pair
    or triangle that a base case closed without checking it was a ring (the issue's step 6), so those completions are
    the defect's. That no other solve relies on it to terminate or to prune is the measuring step's claim.

### The measuring step, before the switch

11. **The new predicate lands first beside `hasInteriorLoop`, which still decides,** and the probe records both verdicts
    at all four solver sites. At line 551 the new verdict also counts every pending birth naming the edge. Every birth
    the accepted-parent filters refuse is recorded.
12. **The rosters are the standing gate's:** `corpusRoster` (`FULL_CORPUS` at 1e-6 and 1e-5, then the weighted
    fixtures), `sweepRoster` (642 cells) and `censusRoster` at each of `CENSUS_DEPTH_FRACTIONS`. Each disagreement is
    reported with solve, step boundary, site, edge, which rule accepts and what names the edge, beside each solve's
    final `acceptedEdges` under both rules.
13. **Expected: every disagreement and refused birth lies on the six solves the red test names,** `Offset Cross
    Junction` with its census regions, `fine:circle48@200000000000`, `ladder:1x:s1`, `ladder:1x:s2` and `ladder:3x:s3`.
    One class is foreseen by hand trace and not expected on the rosters: a vertex event resolved pairwise whose pending
    birth starts at the node where the edge's face already closed, which the old rule refuses and the new rule bears.
    Any disagreement off the six is diagnosed and reported to the lead before the switch; the predicate is not bent.
14. **Each old-rule acceptance the new rule refuses records the chain `hasInteriorLoop` walked,** whether that chain
    passes an interior edge that does not have the accepted edge as a parent (so leaves its face), and whether the
    solve's skeleton `isTree`. That confirms or refutes the issue's diagnosis, and the node 4 drafter's inference of a
    cycle, on all five single-loop offenders.

### The six solves

15. **Each is measured before and after:** `complete`, step failures, digest, node and edge counts, `checkWavefront` at
    every boundary, the four causality oracles on both instruments, containment, tiling at depths 0.2, 0.5 and 1.0 of
    the maximum offset, and `isTree`.
16. **The three complete before are expected to change graph.** `fine:circle48@200000000000` is pinned complete with
    clearance 3 and 3 diagnostics in
    [large-coordinate-known-failures.test.ts](../../packages/core/tests/straight-skeleton/large-coordinate-known-failures.test.ts)
    and has a 57% tiling miss (`findOrAddNode`'s header in solver-context.ts). `ladder:1x:s2` and `ladder:3x:s3`, and
    the incomplete `ladder:1x:s1`, are pinned only by the sweep harness's records and the red cells.
17. **`Offset Cross Junction` is a `KNOWN_DEFECT_POLYGONS` fixture** failing at floors 1e-6 and 3e-6 and solving from
    1e-5. Its pins: the digest (full-graph-digest), I4's two walks (graph-index-invariants), the failing floors
    (perceptual-floor-option), census signature 12 (recursive-subdivision), the incomplete-root list
    (skeleton-containment), `UNMEASURABLE` (strip-tiling), its counts (wavefront-causality), the completion
    (coaxial-lane) and the sweep records. It is also the specimen `unsolvableRegion()` in recursive-subdivision returns.
18. **A fixture whose every pin reaches the clean bar is promoted into `CLEAN_TEST_POLYGONS` in the same change and its
    defect pins are deleted** (the repo CLAUDE.md's rule). For `Offset Cross Junction` that also gives
    `unsolvableRegion()` a constructed ring that still fails, chosen with the lead, sets CLAUDE.md's roster counts to
    the measured ones (the corpus is 53 clean and 7 defect today, BSA.F92, where CLAUDE.md says 53 and 6; a promotion
    makes it 54 and 6), and rewrites the fixture's header and enrolment comment.
19. **A fixture that still fails keeps its enrolment,** and each pin it moves is re-measured and moved with the cause
    written at the pin: the new pin is its measured signature, not a softened number.
20. **Every moved pin of the six moves only with a written reason and the lead's acceptance** (stage 1 decision 31,
    BSA.D284), the links being the presumed valid answer (BSA.D291). A solve that does worse on any oracle, containment
    or tiling is diagnosed before it is accepted.

### When the cure lands

21. **The red file goes green because the defect is gone:** its assertions stay word for word, and its header is
    rewritten from "red by design" to a specification of the cured path.
22. **The gate's cause-based exclusion is removed.** After the switch the cause cannot hold at a boundary, since an edge
    is accepted only when no live bisector names it and no bisector naming an accepted edge can be born, so every
    violation of every solve is asserted. `acceptedParentOnLiveBisector` stays as the detector the green file holds
    empty.
23. **`hasInteriorLoop` is deleted with its index.ts export.** By the search above its only other mention is a comment
    in in-edge-ordering.test.ts listing `inEdges` readers, which is restated without it.
24. **Stage 1 decision 32 gains one sentence in place,** that the path it fenced off is cured here and no longer
    excluded. **The issue is set `resolved` in the merge commit,** `verified_by` naming the early-acceptance file and
    `skeleton-edge-acceptance.test.ts`, with a resolution section carrying the measured diagnosis; this spec is set
    `completed` in the same commit. The node 4 spec's `hasInteriorLoop` roster line and its decisions 29, 31 and 46 are
    the lead's to amend.

### Boundaries and gates

25. **No tolerance, window, constant or comparison moves; the C++ port is not a consideration** (BSA.D281).
26. **Nothing outside `packages/core` changes** except, on a promotion, the fixtures roster, the fixture's comments and
    CLAUDE.md's counts. Building-shell runs on core's source and its golden set does not move.
27. **The baseline is measured on the starting tree before the first edit:** the `@proc-geo/core` Jest figure, the red
    file's failing cases counted, and the `@proc-geo/building-shell` Vitest figure.
28. **Byte identity off the six is held by full-graph-digest, the sweep harness's 32,335 records, the recursion census
    and building-shell's golden drift test.** A divergence there is diagnosed and handled as a moved pin.
29. **Constructed tests on a square after `initInteriorEdges`:** every edge is open; accepting only the bisector whose
    clockwise parent is edge i leaves i open; accepting only the one whose widdershins parent is i leaves i open;
    accepting both closes i.
30. **Mutation gates, each turning a test red:** `hasInteriorLoop` restored (the early-acceptance file); accepted
    bisectors counted as live (the end-of-solve assertion and the all-accepted tests); the clockwise parent alone, and
    the widdershins parent alone (the constructed tests); the line 551 call restored reading live bisectors without
    pending births (`Rectangle`: both short walls collapse in one layer, the long walls are then named only by the two
    pending births, are accepted, and those births hit `addBisectionEdge`'s throw).
31. **One mutant is expected to survive, and its survival is recorded:** the line 551 call restored with the approved
    predicate, pending births included. It is the measured form of the claim that removing that call changes nothing.

### Rulings on the measuring step (BSA.F99, BSA.D300)

32. **A ring a layer leaves that is made only of that layer's pending births, all sourced at one node, is closed at
    that node and none of it is born.** It has no extent: every one of its segments has both ends at the one point.
    This is the case decision 13 foresaw, met on `fine:rosette40` at 7e10, 8e10, 9e10 and 1e11, where two births
    `(cw 20, ws 26)` and `(cw 26, ws 20)` at one node are the residue of a vertex event resolved pairwise. The old rule
    disposed of them by accepting the edge early and refusing the births; stage 1's dedupe already drops the same shape
    at lower translations. The rule is stated on the links and the source node, it reads no position and no tolerance,
    and it is applied when the layer settles, before the births. The predicate of decision 1 is unchanged: births that
    are never born are not pending. Those four cells are expected to stay byte-identical; if one does not, it is
    diagnosed and reported.
33. **The one-boundary lateness of the old rule on `ladder:1x:s5` is harmless and needs nothing:** the old rule
    accepted two edges one boundary after no bisector named them, no birth is refused, and the solve is byte-identical
    under the new rule.
34. **`fine:circle48@200000000000` is accepted under the cure, and its pin moves to its measured signature.** Before:
    complete, a tree, 3 clearance violations, 3 wavefront violations, and strips missing 49 to 62 percent of the area.
    After: complete, no wavefront violation, tiling within about 1e-8, the same 3 clearance violations, and one offset
    and one direction violation both on the newly born bisector, which leaves a node that already carried a 2e-6
    clearance violation and runs about 1e-6 backwards against its basis. A graph that tiles the polygon is the more
    valid answer than a tree that misses half of it. The cell is part of Circle 48's known-defect signature, and the
    fixture stays enrolled.
35. **Decision 16 is corrected:** `ladder:3x:s3` trips the old rule and refuses no birth, so it is byte-identical under
    the cure; two of the three complete cells change graph, not three.
36. **`Offset Cross Junction` is not cured** (one step failure in place of two) and stays in `KNOWN_DEFECT_POLYGONS`
    under decision 19. Decision 18's promotion does not arise.
37. **Pins of the six may be moved by the implementer to their measured values, each with the cause written at the
    pin and listed in the report** with its old value, new value and the before and after measurements; this is the
    lead's acceptance of decision 20 given in advance, for the six only, and it is withdrawn for any pin whose solve
    does worse on an oracle, containment or tiling in a way not already described in decisions 34 and 36.
38. **Every solve of the six that ends complete and is not a tree has its cycle identified** (a zero-length
    self-loop, a duplicate ridge, or other) and reported, after decision 32 is applied. It does not block the commit.

## 4. Deferred

- **The in-step reads of exterior acceptance** (split guards, the collision filters) read false always under the new
  rule; retiring them is a separate simplification.
- **Node 4 and holed input** use the predicate unchanged, since it reads no loop.
- **An event of no handled type,** which terminates its instigator without accepting it, stays as it is; the
  end-of-solve assertion reports it if it ever ends a solve.
