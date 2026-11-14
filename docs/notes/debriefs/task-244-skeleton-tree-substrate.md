---
title: "Task 244 — Skeleton tree substrate"
type: workflow
area: subdivision
status: archived
date: 2026-08-17
---

# Task 244 — Skeleton tree substrate

Spec: [`docs/notes/skeleton-tree-substrate-decisions.md`](../skeleton-tree-substrate-decisions.md)

## 0. Recovery baseline

`git log` showed **no prior work on task 244**: no `skeleton-tree.ts` in any reachable commit, no
committed plan. Greenfield. The work is one module, one barrel entry and one suite — small enough
that the plan is the phase table below rather than a separate document, and it lands with the code
in a single commit.

| Phase | Content |
|-------|---------|
| A | `skeleton-tree.ts`: the two types and the two functions (decisions 1–11). |
| B | Corpus measurement: which fixtures build a tree, and what the solver's arc records look like. |
| C | `skeleton-tree.test.ts`: the square, the rectangle, the corpus sweep, the mutations (12–14). |
| D | Full suite twice, baseline comparison, build (15). |

## 1. Task Summary

A read-only view of a solved skeleton as a weighted undirected graph — adjacency, degree, leaves,
edge lengths, per-node wavefront offsets — plus the weighted diameter. A substrate only: it builds
no spine, prunes nothing, and makes no policy choice. The three spine-extraction strategies that
will consume it are explicitly out of scope.

## 2. Changes Made

- **`packages/core/src/straight-skeleton/skeleton-tree.ts`** — created. `SkeletonTreeEdge`,
  `SkeletonTree`, `buildSkeletonTree`, `skeletonTreeDiameter`. Plain data plus free functions, no
  methods (decision 1). Offsets copied from `computeNodeOffsets` (decision 3); preconditions through
  the projection module's own `requireProjectableResult` (decision 8).
- **`packages/core/src/index.ts`** — barrel exports for the two functions and the two types.
- **`packages/core/tests/straight-skeleton/skeleton-tree.test.ts`** — created, **463 tests**.

No solver file is touched, nothing is deleted and nothing is relocated, as section 4 of the spec
requires.

## 3. Design Decisions

### 3.1 An arc recorded from both ends is one edge (decision 5, and what it costs decision 13)

Measured, not assumed: the solver writes the **terminal collapse arc twice**, once from each of the
two bisectors that closed it. The rectangle's central ridge comes back as interior edge `8: 4 -> 5`
*and* interior edge `9: 5 -> 4`; the pentagon house does the same with `10`/`11`. Kept as two edges,
every fixture whose skeleton ends in a collapse reports `isTree === false` — the rectangle came out
as 6 nodes and 6 edges — which is a false alarm on precisely the shape decision 13 names as the one
with a genuine internal edge.

Two straight arcs sharing both endpoints are the same arc; there is no second straight route between
two points. So the builder keys edges by node pair and keeps one, which is decision 5's "an
undirected edge has one representation" applied to the case that actually produces two. The
representative `interiorEdgeId` is the **lower** of the pair, so the field is a function of the solve
and not of which end the solver recorded first. With that, all 37 fixtures build `isTree === true`
and the rectangle is 6 nodes / 5 edges with two degree-three ridge nodes, exactly as decision 13
predicts. The collapse is pinned by its own test, which asserts the raw pair `[8, 9]` is present in
the graph and appears once in the tree.

### 3.2 Decision 12's "opposite corner", and where it meets decision 10

Flagged rather than quietly resolved, and posted to the board when it was found.

Every one of the square's four bisectors is exactly the half-diagonal long — at scale 1 all four come
back as the *identical* double, `1.4142135623730951455` — so all **six** pairs of corners are tied at
the diagonal, not just the two opposite pairs. The square has six diameters. Decision 10 says ties
break to the lowest node id, which selects corner 0 → centre → corner **1**: an adjacent corner, not
the opposite one decision 12's prose describes.

Both of decision 12's measurable claims hold and are pinned: **three nodes, not two** (the criterion
the decision itself gives for whether decision 2 was implemented), and a length equal to the square's
diagonal, `2√2`. The test asserts those, asserts that the middle node is the degree-four centre, and
asserts all six corner pairs measure the diagonal — so the tie is documented in the suite rather than
hidden by it. Decision 10 is implemented literally; no tolerance was introduced to make the intuitive
pair win, and none would be admissible.

### 3.3 The node set includes every polygon vertex unconditionally

Decision 2 makes the exterior vertices nodes, so they are added from `numExteriorNodes` rather than
because an edge happened to reach them. A vertex whose bisector went missing then shows up as an
isolated node and hence as `isTree === false`, instead of quietly leaving the node set — which is
what makes the third mutation test possible.

### 3.4 The diameter path is oriented from its lower-numbered endpoint

The spec fixes the endpoints but not which end the returned list starts at. Orienting by the lower
node id makes the whole return value, and not merely its endpoint set, a pure function of the tree
(decision 10).

### 3.5 A node the projection has no offset for is absent here too

`computeNodeOffsets` omits a node with no incident interior edge "rather than guessed at". Copying
that omission rather than defaulting to zero keeps decision 3 honest: an invented zero would be
indistinguishable from a polygon vertex's genuine zero. Measured: no fixture in the corpus has such a
node, and the suite asserts `offsets.size === nodeIds.length` for all 37.

## 4. Build & Test Results

**Decision 15's gate, run as specified.**

| Run | Suites | Tests | Failures |
|-----|--------|-------|----------|
| Baseline (this branch, changes stashed) | 65 | 2879 | none |
| Full suite, run 1 | 66 | 3342 | none |
| Full suite, run 2 | 66 | 3342 | none |

Both runs' failure sets are empty, so their intersection is empty. `3342 − 2879 = 463`, which is
exactly the new suite: **no existing test changed state**, and none needed to — this task adds a
module and touches no solver file.

The spec records the suite as standing at 61 suites and 2666 tests; the actual figure on this branch
before the change is **65 suites and 2879 tests**, reported as asked.

`pnpm build` — clean, all four packages (core → test-fixtures → dashboard → demo).

Corpus report (decision 13): **37 of 37** fixtures in `ALL_TEST_POLYGONS` build a tree with
`isTree === true`, every one of them with every polygon vertex as a leaf. There is nothing to report
as a solver finding.

Decision 9's weighting is convicted by measurement rather than by assertion alone: on **22 of the 37**
fixtures the longest *hop-count* leaf-to-leaf path is strictly shorter than the weighted diameter.
The widest margin is `Mid-case Failure End` at 532.52 against 350.42 — a third of the length lost —
so a hop-count implementation fails the suite rather than passing it quietly.

## 5. Open Questions / Risks

- **Decision 12 versus decision 10 on the square** (§3.2). Resolved in favour of decision 10's
  literal rule, with decision 12's two measurable claims pinned. If the intent was that the square's
  diameter must end on the *opposite* corner, that needs a rule the spec does not currently contain,
  and the decision should be reissued rather than guessed at.
- **A tie is only a tie in exact arithmetic.** Measured on the square at scale 7: the bisector to
  corner 2 comes back one ulp longer than the other three (`9.8994949366116671285` against
  `9.8994949366116653522`), so there is no tie left to break and corner 2 wins outright. Decision 10
  makes the diameter a pure function of *the tree*, which it is; it cannot make two different sets of
  numbers tie the same way. The scale-covariance test therefore asserts the diameter's **length**
  scales, not that its endpoints are preserved, and records the measurement in place.
- **Parallel edges are collapsed, so a genuine two-cycle would not be seen by `isTree`.** For straight
  arcs between two fixed points that case cannot arise, but it is a stated limit of the check rather
  than an oversight.

## 6. Suggested Follow-ups

- The three spine-extraction strategies (longest path, wavefront-time threshold, degree-based whisker
  pruning), each of which this exists to keep short. Explicitly deferred by the spec.
- If a consumer ever needs both records of a collapse arc, `SkeletonTreeEdge` would gain a sibling id
  — deliberately not added here, since the type roster is the contract and no consumer exists.
