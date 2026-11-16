---
title: "Debrief 0001 — solver coincidence clustering and terminal base cases"
type: workflow
area: straight-skeleton
status: archived
date: 2026-08-16
---

# Debrief 0001 — solver coincidence clustering and terminal base cases

Task 235. Spec: `docs/notes/solver-coincidence-and-terminal-cases-decisions.md`.
Plan committed as the recovery baseline: `docs/notes/solver-coincidence-implementation-plan.md`.

## 1. Task summary

Three defects in one mechanism — how the solver resolves events arriving at the same point — plus
one guard and one fixture:

- `clusterCoincidentMerges` was not an equivalence relation (first-match grouping under a
  non-transitive predicate), so its partition depended on arrival order.
- The three-edge terminal case answered a well-defined terminal state with a `throw` whenever its
  bisectors shared a source, because it read sources at all.
- The two-edge terminal case threw on a shared source for the same reason, discarding a verdict
  `intersectRays` had already reached.
- `findOrAddNode` appended a fresh node on every call for a non-finite position.
- `COLLINEAR_DUMBBELL` was added as an export-only fixture with its current wrong behaviour pinned.

Greenfield: `git log` showed no prior plan or partial work for this task, and the deferred
unit-extent normalisation had landed (`789f790`), so the plan was authored, committed first as the
recovery baseline, and then executed phase by phase with a commit per phase.

## 2. Changes made

| File | Action | Change |
|---|---|---|
| `docs/notes/solver-coincidence-implementation-plan.md` | created | Six-phase plan and recovery baseline, per the spec's implementer brief. |
| `packages/core/src/straight-skeleton/coincident-events.ts` | modified | `clusterCoincidentMerges` partitions by connected components under the unchanged `vectorsAreEqual` predicate at its unchanged tolerance; the representative is the medoid, exact ties broken lexicographically on (x, y); `assertMergePositionsAreDistinct` gates the layer. New module-private helpers: `coincidentComponents`, `medoidPosition`, `centroidOf`, `squaredDistance`, `precedesLexicographically`, `distinctEdgeIds`. |
| `packages/core/src/straight-skeleton/algorithm-termination-cases.ts` | modified | Module-private `solveTerminalPoint` (closed form over three supporting lines, returning position and offset) and `solveTerminalTriangle` (parent-count, determinant and sign guards, each logging its fall-through); `handleInteriorEdgeTriangle` uses them and otherwise falls through to the existing collision path; `handleInteriorEdgePair` gains one `identical-source` branch. Both existing throws remain. |
| `packages/core/src/straight-skeleton/solver-context.ts` | modified | `findOrAddNode` throws on a non-finite position. |
| `packages/core/tests/straight-skeleton/coincident-events.test.ts` | created | 12 tests: transitive closure, order independence, medoid membership, positional tie-breaks, and the gate convicted against a centroid-representative mutant. |
| `packages/core/tests/straight-skeleton/terminal-cases.test.ts` | created | 14 tests: the 6-8-10 worked example (unit and end to end), coincident sources, the three fall-through guards, the pair's shared-source branch, and the `findOrAddNode` guard. |
| `packages/core/tests/straight-skeleton/collinear-dumbbell.test.ts` | created | 12 tests: the fixture's shape properties, the pinned defect, and a perturbed control. |
| `packages/test-fixtures/src/test-constants.ts` | modified | `COLLINEAR_DUMBBELL` with its degeneracy documented. |
| `packages/test-fixtures/src/index.ts` | modified | Exports it individually; deliberately not in `ALL_TEST_POLYGONS`. |

Commits: `0c14d7c` (plan), `b43bb5b` (clustering), `35aed25` (terminal triangle), `d307547` (pair
and node guard), `0616175` (fixture and characterisation).

## 3. Design decisions

**The inward-normal convention was verified before reuse, and the spec's citation is wrong.**
Decision 9 cites `strip-decomposition.ts` for `FaceEdge.normal`; that type lives in
`parcel-slicing.ts`, where the normal is built as `{x: run.y / len, y: -run.x / len}` for a
clockwise ring — exactly `rotateCw90` of the unit basis. `initBoundingPolygon` orients each exterior
edge from its own node to the next, so `rotateCw90(edge.basisVector)` is the inward normal and
`sourcePosition(edge)` is a point on its line. The worked example reproduces: determinant 2.4,
`t = +2`, `P = (2, 2)`.

**One export beyond the type roster, argued.** The roster says the new helpers for component
discovery and representative selection are module-private. `assertMergePositionsAreDistinct` is
neither of those: it is the decision-6 gate, and decision 19 requires every gate to be convicted by
mutation. The gate is provably unfirable through `clusterCoincidentMerges` — distinct components
contain no cross-pair within tolerance, and a medoid is a member — so the only way to show it fires
is to hand it the centroid partition it exists to reject. It is exported from the module and
**not** added to `packages/core/src/index.ts`, so the package's public surface is unchanged.

**The sign guard is new, and is what makes decision 9's tripwire enforceable.** Negating every
normal leaves the position untouched and negates `t`, so an outward normal is invisible in the
answer and visible only in the sign. The guard rejects a negative offset (`< 0 && !areEqual(·, 0)`,
the same convention as `notYetBorn`), logs, and falls through to the collision path exactly as the
determinant and parent-count guards do. The test exercises it by reversing the winding of the worked
example, which negates every normal without mutating the solver.

**"Not exactly three" rather than "fewer than three" distinct parents falls through.** Decision 11
specifies the fewer-than-three case. Decision 8's construction is defined for exactly three, so with
four the closed form would have to choose three lines arbitrarily; falling through preserves today's
behaviour for a case no corpus has produced, and the log names the actual count.

**The determinant guard uses the project's standard zero test, `areEqual(det, 0)`.** Decision 10
forbids tuning a threshold for conditioning, so no new constant was introduced.

**The pair's shared source terminates at `sourcePosition(id1)`.** `terminateEdgesAtPoint` routes
through `findOrAddNode`, which matches the existing source node, so no node is added — asserted.

## 4. Build and test results

- `pnpm build` (core → test-fixtures → dashboard → demo): **success**.
- Core suite, run twice as decision 21 requires: **2637 passed, 61 suites, 0 failed, both runs**.
  The intersected failure set is empty.
- Counts: **2599 before** (58 suites) → **2637 after** (61 suites). The spec's remembered 2207 is
  stale. The whole +38 is the three new test files (12 + 14 + 12); no pre-existing test changed
  state in either direction.

Failures encountered and resolved during the loop: two, both in my own new tests — a `-0` versus
`0` exact comparison on the dumbbell's right-angle check (fixed by comparing the magnitude), and the
red phase of each TDD cycle behaving as intended.

## 5. Decision 20 — re-measurement, nothing promoted

Measured before and after by swapping the changed sources against `789f790`, with everything else
held fixed. `unclosedChains` counts the chains `projectOffsetWavefront` fails to close at, and a
nanometre and micrometre either side of, every non-terminal event.

| Fixture | complete | unclosedChains before → after | events before → after | placement sweep |
|---|---|---|---|---|
| `SYMMETRICAL_OCTAGON` | true (both) | 0 → 0 | 2 → 2 | unchanged, survives every placement measured |
| `NEAR_REGULAR_CIRCLE_16` | true | 0 → 0 | 1 → 1 | unchanged |
| `NEAR_REGULAR_CIRCLE_32` | true | 0 → 0 | 1 → 1 | unchanged |
| `NEAR_REGULAR_CIRCLE_48` | true | 0 → 0 | 1 → 1 | **improved**: now survives translation to 1e9 (still fails 1e11) |
| `NEAR_REGULAR_ELLIPSE_16` | true | 1 → 4 | 7 → 7 | unchanged |
| `NEAR_REGULAR_ELLIPSE_32` | true | 4 → 5 | 14 → 14 | unchanged |
| `NEAR_REGULAR_PEANUT_32` | true | 0 → 4 | 14 → 13 | unchanged |
| `NEAR_REGULAR_ROSETTE5_40` | true | 6 → 22 | 16 → 15 | unchanged (still fails 1e11) |

Every one still solves completely with empty diagnostics, and every one still produces one strip per
exterior edge. **Nothing is promoted into `ALL_TEST_POLYGONS`**, and the measurements say nothing
should be: the offset-projection blocker recorded in the near-regular fixture header is worse on four
of the seven.

Attributed by isolation — reverting the clustering alone restores every baseline number, reverting
the terminal-case file alone changes nothing — so **all of the movement above is decision 1**, not
decisions 8 or 12. That is consistent with the mechanism: connected components fuse events the
first-match partition split, so the peanut and rosette resolve one fewer distinct event offset and
their nodes land in slightly different places, and the projection limit — documented as a downstream
limit, not a solver one — is exercised at more of them. None of these fixtures is swept by any suite,
so nothing regressed in the gate; but this is the one measured cost of the change and it should be
weighed before that projection work is scheduled.

## 6. Open questions and risks

- **The projection regression above is the main thing warranting human review.** It is confined to
  fixtures outside `ALL_TEST_POLYGONS`, and the offset projection is already a known downstream
  limit, but "four of seven got worse" is a real number and not one the spec anticipated naming.
- **The gate cannot fire in production.** By the partition argument it never can, which is what
  decision 6 says; it is a proof-carrying assertion, and its only live exercise is the mutation test.
  If it ever does fire in a solve, the components code has a bug, not the geometry.
- **Clustering is O(n²) in the layer's event count.** 1424 events is ~1M predicate calls in the worst
  measured layer; the suite time did not move (15.7 s before, 13.5 s after), but a far denser input
  would notice.
- **The plan document lives in `docs/notes/`**, outside this task's declared file ownership. The
  spec's implementer brief requires a committed plan as the recovery baseline, and that is the
  directory this project keeps plans in; it is a documentation artefact, and no owned source file
  depends on it.
- **`COLLINEAR_DUMBBELL`'s pinned numbers are Monte-Carlo** for the overlap area (deterministic
  sampler, 20 000 samples, asserted to the nearest integer area unit). The tiling error itself is
  exact arithmetic and pinned to six decimal places.

## 7. Suggested follow-ups

- Decide whether the dumbbell's strip overlap is downstream fallout of the reverted
  layer-partitioning defect (`0e2f233`) or independent — the question the fixture exists to answer.
- Revisit `offset-event-boundary-regression.test.ts`'s inability to close the wavefront at a many-way
  event; it is now the sole blocker for three of the near-regular fixtures and got worse for four.
- Fix the spec's citation of `strip-decomposition.ts` for `FaceEdge.normal`, which is in
  `parcel-slicing.ts`.
- Decision 18 names three shared supporting lines in the dumbbell; there are four (`x = 20` as well).
  The fixture and its test record all four.
