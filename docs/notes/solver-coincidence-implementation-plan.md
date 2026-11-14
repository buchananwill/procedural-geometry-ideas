---
title: "Solver Coincidence and Terminal Cases: Implementation Plan"
type: workflow
area: straight-skeleton
status: archived
date: 2026-08-16
# spec: ./solver-coincidence-and-terminal-cases-decisions.md
---

# Implementation plan — solver coincidence and terminal cases

Derived from [the decision spec](./solver-coincidence-and-terminal-cases-decisions.md). The spec is
the contract; this file is only the order of work and the recovery baseline, so an interrupted run
can resume at the last committed phase instead of restarting.

**Baseline measured before any change** (decision 21): `packages/core`, 58 suites, **2599 tests, all
passing**. The spec's remembered figure of 2207 is stale; 2599 is the number a later run must
compare against.

**Prerequisite confirmed:** the deferred unit-extent normalisation has landed (`789f790`, "Solve the
skeleton in unit extent, denormalising on output"), so this work rebases onto it rather than
against it.

**Convention verified before reuse** (decision 9): the spec cites `strip-decomposition.ts` for
`FaceEdge.normal`, but that type lives in
[parcel-slicing.ts](../../packages/core/src/straight-skeleton/parcel-slicing.ts) — `FaceEdge.normal`
is documented there as the inward unit normal with `(p - start) . normal` the skeleton offset within
the face, and is built as `{x: run.y / len, y: -run.x / len}` for a clockwise ring, which is exactly
`rotateCw90` of the unit edge basis. `initBoundingPolygon` orients every exterior edge from node `i`
to node `i + 1` on clockwise input, so `rotateCw90(edge.basisVector)` is the inward unit normal and
`nodes[edge.source].position` is a point on its line. The 6-8-10 worked example reproduces under
that reading: `t = +2`, `P = (2, 2)`, determinant `2.4`.

## Phase 1 — plan committed (this file)

Recovery baseline. No code.

## Phase 2 — coincidence clustering (decisions 1-7, and the 6/19 gate)

`packages/core/src/straight-skeleton/coincident-events.ts`,
`packages/core/tests/straight-skeleton/coincident-events.test.ts`.

- Replace first-match grouping in `clusterCoincidentMerges` with connected components under the
  unchanged `vectorsAreEqual` predicate at its unchanged default tolerance. Signature and
  `CoincidentMerge` shape are untouched; `edgeIds` stays in first-seen order.
- Representative is the **medoid** — the member position nearest the component centroid, exact ties
  broken lexicographically on `(x, y)`. The centroid is the yardstick, never the answer.
- Gate: no two merges of one layer may carry positions comparing equal under `vectorsAreEqual`.
- Tests: order independence (permuted arrival orders give one partition), single-linkage chaining is
  recorded as intended behaviour, the medoid is always a member, positional tie-breaking, and the
  gate convicted against a centroid-representative mutant built in the test file.

## Phase 3 — three-edge terminal case (decisions 8-11, 19)

`packages/core/src/straight-skeleton/algorithm-termination-cases.ts`,
`packages/core/tests/straight-skeleton/terminal-cases.test.ts`.

- Module-private closed-form solver over the three distinct exterior parents: each contributes
  `n . P - t = n . A`; three of them determine `(x, y, t)` by Cramer's rule. Returns position and
  offset together, or `undefined` when unsolvable.
- `handleInteriorEdgeTriangle` uses it, then falls through to the existing collision path — logging
  the fall-through — when there are not exactly three distinct parents (decision 11), when the
  determinant guard trips (decision 10), or when the solved offset is negative, which is the
  outward-normal signature decision 9 exists to prevent.
- Tests: the 6-8-10 worked example end to end (incentre at `(2, 2)`); the sign tripwire, convicted by
  feeding the same triangle wound counter-clockwise, which negates every normal; the fall-through log
  for a system with fewer than three distinct parents.

## Phase 4 — two-edge terminal case and the node guard (decisions 12-15)

`algorithm-termination-cases.ts`, `solver-context.ts`, `terminal-cases.test.ts`.

- `handleInteriorEdgePair` gains one branch: an `identical-source` verdict from the `intersectRays`
  call it already makes terminates both edges at their shared source. No new predicate, no new
  tolerance. No closed form for this case (decision 13).
- `findOrAddNode` throws on a non-finite position.
- Tests: the pair branch resolves rather than throwing; the guard throws on NaN and on Infinity and
  still deduplicates finite positions.

## Phase 5 — the dumbbell fixture and its characterisation (decisions 16-18)

`packages/test-fixtures/src/test-constants.ts`, `packages/test-fixtures/src/index.ts`,
`packages/core/tests/straight-skeleton/collinear-dumbbell.test.ts`.

- `COLLINEAR_DUMBBELL` exported individually, **not** in `ALL_TEST_POLYGONS`, documented as a
  shared-supporting-line degeneracy and explicitly not a redundant-vertex one.
- Characterisation test pinning the current wrong behaviour: `complete: true` with empty
  diagnostics, and strip overlap at depths 0.2 and 0.5 of max offset.

## Phase 6 — verification and report (decisions 20, 21)

- Re-measure `SYMMETRICAL_OCTAGON` and the near-regular fixtures; report, promote nothing.
- Full core suite twice, failure sets intersected, counts before and after reported in the debrief.
