---
title: "Task 247 — Tiling identity against the canonical boundary — review cycle one"
type: workflow
area: subdivision
status: archived
date: 2026-08-17
---

# Task 247 — Tiling identity against the canonical boundary — review cycle one

Spec: `docs/notes/tiling-identity-against-canonical-boundary-decisions.md`
Base debrief: `docs/notes/debriefs/task-247-tiling-identity-canonical-boundary.md`
Ownership: `packages/core/src/index.ts`, `packages/core/src/straight-skeleton/recursive-subdivision.ts`,
`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`,
`packages/dashboard/tests/fixtures/recursive-trees.ts`.

## 1. Task Summary

Two reviewers requested changes on commit `354ecb0` — one BLOCKING and one NOTE each. All four are
addressed. **No production behaviour changed**: every edit lands in
`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`. The driver, the node fields and
the barrel export are untouched, because none of the findings was about them.

## 2. Findings and how each was answered

### Correctness [B1] — BLOCKING: the re-solve used the wrong noise floor for every non-root node

`'agrees with the solved graph the strips were actually read off'` re-derived the "actual" solve with
`solveSkeleton(node.boundary)` and no options, which falls through to `SKELETON_NOISE_FLOOR` evaluated
in *that node's own* unit space. The driver instead hands each region
`normaliseLength(makeSkeletonNormalisation(region), run.rootNoiseFloor)` — the **root's** floor
reprojected into the node's unit space — so below the root the test was checking a canonicalisation
that nothing under test had performed.

Fixed by the reviewer's second suggested route (recompute in the test rather than open a hole in the
driver — a `ForTesting` seam in production code is not available here):

- `rootFloorOf(boundary)` restates the caller-space root floor from `denormaliseLength` +
  `makeSkeletonNormalisation` + `SKELETON_NOISE_FLOOR`, all already exported from `@proc-geo/core`
  (so `packages/core/src/index.ts` needed no edit).
- `regionNoiseFloor(region, rootFloor)` restates the per-region reprojection.
- `solvedRingProblems(node, noiseFloor, where)` takes the floor as a parameter and passes it as
  `solveSkeleton(node.boundary, {noiseFloor})`.

**The fix is measured, not assumed.** Instrumented over the sweep: of the **854** solved nodes,
**663** carry a floor that differs from `SKELETON_NOISE_FLOOR`, by up to a factor of **128**. The
old test was therefore running most of the tree at the pre-246, region-local floor. That measurement
is now pinned in the test itself as `expect(propagatedFloors).toBeGreaterThan(0)`, so a future
regression back to the bare default cannot pass silently as "the assertion still holds".

The agreement assertion itself still passes at the corrected floor: no node's vertex count or
position moved outside `CANONICAL_RING_AGREEMENT_FRACTION`.

### Correctness [N1] — NOTE: reference identity where the invariant is value equality

`structuralProblems` tested `node.canonicalBoundary !== node.boundary`. Replaced with a named
`sameVertices(ring, other)` helper that keeps reference identity only as a fast path and otherwise
compares contents. The same helper replaces the hand-inlined identity-plus-`JSON.stringify` pair in
the residue-child check three lines below, which was the same comparison written out longhand.

### Decomposition [B1] — BLOCKING: five-deep loop nest inlining a per-node check

The exactness sweep's per-node body is extracted into `exactnessProblems(node, where)`, in the same
family as `structuralProblems` / `tilingProblems` / `driftProblems`. It returns a named
`CanonicalExactness` interface rather than an inline object type (project type-discipline: no
anonymous shapes in signatures), carrying both the problem strings and the `reduced` flag the sweep
needs to prove itself non-vacuous. The sweep body is now a flat map/filter over the flattened tree.
The same treatment was applied to the second new test via `solvedRingProblems`, which had the same
shape.

### Decomposition [N1] — NOTE: the full-depth tree expression written out three times

`fullDepthTree(vertices)` now holds
`subdivideRecursively(vertices, options({levels: MAX_RECURSION_LEVELS}))`, and all three call sites
use it. The reviewer proposed `fullDepthNodes(...): RecursiveNode[]`; one of the three sites needs the
**root** (it passes it to `tilingProblems`), not the flattened list, so the helper returns the root
and the two flattening sites wrap it in `flattenRecursiveTree`. Same de-duplication, one call site
fewer that has to be left out.

## 3. Design Decisions

- **No production edit.** Both BLOCKING findings are about what the tests assert and how they are
  decomposed. Adding a `rootNoiseFloor`-style export to the driver purely so a test could read it
  would be a test seam in production code; restating the two published primitives in the test is the
  cheaper and more honest option, and it keeps the driver's derivation and the test's derivation
  genuinely independent — which is the whole point of that test.
- **The non-vacuity count is an assertion, not a comment.** `propagatedFloors` is the only durable
  guard that the corrected floor is actually in play, since for this corpus the *outcome* happens to
  agree at either floor. Stating the 663-of-854 figure in a comment alone would have left the fix
  reversible without a failing test.
- `sameVertices` keeps `a === b` as a fast path: identity implies value equality, so it weakens
  nothing, and it avoids stringifying 14 000 rings in the sweeps.

## 4. Build & Test Results

Run standalone, never chained (decision 8).

| Gate | Command | Result |
|------|---------|--------|
| Core, run 1 | `npx jest` in `packages/core` | **67 suites, 3424 tests, all pass** |
| Core, run 2 | `npx jest` in `packages/core` | **67 suites, 3424 tests, all pass** |
| Dashboard | `npx jest` in `packages/dashboard` | **13 suites, 195 tests, all pass** |
| Build | `pnpm build` at the root | **clean across all four packages** |

Failure sets intersected: empty ∩ empty. Core is up from the spec's stated 3418 by the six tests this
task added in the previous commit; the count is unchanged by this revision, which moved code between
functions rather than adding cases.

The dashboard suite resolves `@proc-geo/core` through its built `dist`, so it must be run **after**
`pnpm build`; run before the build it reports eight suites failing to resolve the module, which is a
sequencing artefact and not a regression.

## 5. Open Questions / Risks

- The corrected re-solve produces the same rings as the old, defaulted one for every fixture in the
  corpus. So the *agreement* assertion is not what convicts the floor propagation — `propagatedFloors`
  is. A fixture whose sub-regions differ enough for the two floors to disagree about a vertex would
  make the agreement assertion itself load-bearing; none exists today.
- `sameVertices` compares through `JSON.stringify`, which maps `-0` and `0` to the same text. That was
  already true of the two comparisons it replaced, and no path here can produce a signed zero that
  matters, but it is a limit worth naming.

## 6. Suggested Follow-ups

- None arising from this cycle. The floor-band re-measurement (decision 5) and the drift bound
  (decision 4) are unchanged from the base debrief and were not challenged by either reviewer.
