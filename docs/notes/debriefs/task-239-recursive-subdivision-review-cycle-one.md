---
title: "Task 239 — Recursive segment subdivision, review cycle 1"
type: workflow
area: subdivision
status: archived
date: 2026-08-16
# spec: ../recursive-segment-subdivision-decisions.md
---

# Task 239 debrief — review cycle 1

## Task Summary

Address every finding of review cycle 0 (runs 1268 `decomp`, 1269 `correctness`) on the recursive
segment subdivision driver and its `/recursive` page: three BLOCKING and one NOTE from the
decomposition reviewer, one BLOCKING and one NOTE from the correctness reviewer. No behaviour
specified by decisions 1–17 changes, with one exception the correctness reviewer required and
decision 5 covers: what counts as a "zero area" region.

## Changes Made

### `packages/core/src/straight-skeleton/recursive-subdivision.ts`

- **[correctness B1]** Added `DEGENERATE_AREA_EPSILON = 1e-6` and replaced
  `signedArea(boundary) === 0` with `Math.abs(signedArea(boundary)) < DEGENERATE_AREA_EPSILON`.
  The failure message now carries the measured area and the floor it fell under. Decision 5 asks
  that "a segment with … zero area is not recursed", and the objects it is about are *computed*
  segment boundaries (decision 3) — those arrive as `1e-13`, never as an exact `0`, so the exact
  test was dead for the case the decision names. The value matches the `AREA_EPSILON` that
  `polygon-decomposition.ts:5` already uses for the same "is this sub-polygon degenerate" question;
  that constant is not exported and `polygon-decomposition.ts` is outside my file ownership, so the
  driver carries its own named and justified constant, which is the alternative the reviewer's fix
  offered.
- **[decomp N1]** `export`ed the `SegmentOutcome` type alias.
- **[decomp N2]** Added and exported `flattenRecursiveTree`, the depth-first tree walk that was
  previously written out once in the dashboard store and once in the core test.

### `packages/core/src/index.ts`

- Barrel: added `DEGENERATE_AREA_EPSILON`, `flattenRecursiveTree`, and the `SegmentOutcome` type.

### `packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`

- **[correctness B1]** Two new tests around the degeneracy floor, written before the source change
  and red against the exact-equality version: a sliver of area `5e-14` (non-zero, sub-floor) must be
  reported as `Degenerate region` rather than handed to the solver, and a small-but-real square whose
  area clears the floor must still subdivide into four segments. The existing exact-collinear test
  now asserts the `Degenerate region` prefix and the floor wording.
- **[correctness N1]** Deleted the local `signedRingArea` and routed every area through the library's
  `signedArea`, which takes its terms relative to the ring's first vertex and so does not lose the
  `D^2` cancellation that `AREA_TOLERANCE_FRACTION = 1e-12` is calibrated against.
- **[decomp N2]** Deleted the local `collectNodes`; the suite uses `flattenRecursiveTree`, and a new
  test pins that helper's own contract (root first, then children in order).

### `packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx`

- **[decomp B1]** `styleForLevel` is now exported — the single place the level→style clamp is written.
- **[decomp B2]** `Bounds`, `CanvasSize` and `CanvasView` are exported and documented; they are the
  parameter and return types of the barrel-exported `fitView`.
- **[decomp B3]** Extracted `segmentPrimitives(segment, style)` and `nodePrimitives(node, style)`.
  `recursiveTreeToScene` is now one level loop with a `filter` + `flatMap`, no nested loops at all.
- **[decomp N2]** Imports `flattenRecursiveTree` from `@proc-geo/core` instead of the store.

### `packages/dashboard/src/components/RecursiveControlsPanel.tsx`

- **[decomp B1]** The swatch colour is `styleForLevel(level.level).segmentColour`; the restated clamp
  is gone.
- **[decomp N2]** Failure reasons are collected with `flattenRecursiveTree`.

### `packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts`

- **[decomp N2]** `collectRecursiveNodes` deleted; `summariseRecursiveTree` calls
  `flattenRecursiveTree`.

### `packages/dashboard/src/index.ts`

- Removed `collectRecursiveNodes` (an export added by this same, unmerged task — no consumer outside
  it), added `styleForLevel`, and added the `Bounds` / `CanvasSize` / `CanvasView` types.

## Design Decisions

- **The degeneracy floor is absolute, not relative to the region.** A relative floor would be more
  scale-honest, but the precedent this codebase already sets for the identical question is absolute
  (`AREA_EPSILON = 1e-6`), and having two degeneracy notions disagree by a factor of the polygon's
  own size is worse than the scale dependence. Recorded as a risk below.
- **`flattenRecursiveTree` lives in core, not dashboard.** The reviewer flagged this as a NOTE with an
  explicit "weigh the cross-package surface cost" caveat. It goes in core because the core *test*
  needs it too and cannot import from dashboard (`demo → dashboard → core`), so leaving it in the
  store guarantees at least two copies. It is a pure `RecursiveNode` walk with no React or DOM
  dependency, so it does not compromise core's independence.
- **`Bounds`/`CanvasSize`/`CanvasView` keep the reviewer's names.** They are generic for a package
  barrel, but the finding named them explicitly and renaming them would churn `fitView`'s published
  signature for no behavioural gain.

## Build & Test Results

- `pnpm --filter @proc-geo/core test` — **63 suites, 2730 tests, all passing** (2727 before; the three
  new tests are the degeneracy sliver, the small-but-real square, and the `flattenRecursiveTree`
  order test).
- `pnpm build` — all four packages green, `/recursive` still prerendered.
- `pnpm lint` — **1 pre-existing error and 1 pre-existing warning**, both outside this task:
  `apps/demo/src/app/dol-system/page.tsx:51` (`no-explicit-any`, introduced in `ed26de8`) and
  `apps/demo/src/app/AppShellLayout.tsx:17` (unused `openNavbar`, `9db9280`). Neither file is in my
  ownership and neither is touched by this change; nothing in the recursive files lints.
- The census the suite prints is unchanged in character: 3708 nodes subdivided, 4 failures, all
  `Incomplete solve`. No fixture in `ALL_TEST_POLYGONS` produces a region small enough to be caught by
  the new floor, which is the expected result — the floor exists for near-degenerate slivers, and the
  corpus does not currently generate any.

## Open Questions / Risks

- **The floor is in absolute area units.** A caller working at millimetre scale, where a legitimate
  cell can be smaller than `1e-6`, would see real regions labelled degenerate. That is inherited from
  `polygon-decomposition.ts`'s own constant rather than introduced here, and the "small square"
  test pins the live side of the boundary, but it is a genuine scale assumption worth an operator's
  eye.
- Removing `collectRecursiveNodes` from the dashboard barrel is an API removal. It was added by this
  same task and has never shipped, so nothing outside the branch can depend on it.

## Suggested Follow-ups

- Export `AREA_EPSILON` from `polygon-decomposition.ts` and have both call sites share it, so the
  codebase has exactly one degeneracy floor rather than two equal constants. Out of scope here:
  `polygon-decomposition.ts` is not in this task's file ownership.
- Clear the two pre-existing demo lint failures under a task that owns those files.
