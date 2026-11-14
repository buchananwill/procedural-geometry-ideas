---
title: "Task 239 — Recursive segment subdivision, review cycle 2"
type: workflow
area: subdivision
status: archived
date: 2026-08-16
# spec: ../recursive-segment-subdivision-decisions.md
---

# Task 239 debrief — review cycle 2

## Task Summary

Address every finding of review cycle 1 (runs 1270 `decomp` — request changes, 1271 `correctness` —
approve): two BLOCKING from the decomposition reviewer, two NOTEs from the correctness reviewer. No
behaviour specified by decisions 1–17 changes; both blocking findings are duplication/placement
findings and the observable output of `subdivideRecursively` and `/recursive` is identical.

## Changes Made

### `packages/core/src/straight-skeleton/recursive-subdivision.ts`

- **[decomp B1]** Deleted the private `toClockwise` and imported `ensureClockwise` from
  `./polygon-decomposition` — the package's one winding-normalisation formula, in the same directory,
  no barrel round-trip. Decision 3 is untouched: a child is still handed its segment's own boundary.
- **[decomp B1, ordering]** Extracted decision 5's degeneracy test from `divideIntoSegments` into
  `degenerateRegionFailure(boundary): string | undefined`, called from `subdivideNode` *before* the
  winding is normalised. `ensureClockwise` and the deleted `toClockwise` differ at exactly one input —
  zero signed area, where `toClockwise` left the vertex order alone and `ensureClockwise` reverses it —
  and that input reaches this driver in the shape of a failed node whose `boundary` a caller draws.
  Screening first keeps a degenerate region recorded exactly as it was handed in (the behaviour the
  existing "too few vertices" test pins, which went red on the naive swap) and reads correctly besides:
  a region with no area has no winding to normalise. The test is still written once, still runs first,
  and its wording and thresholds are unchanged.

### `packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`

- **[decomp B1]** New test: the same fixture handed in clockwise and counter-clockwise both come back
  with `signedArea(root.boundary) < 0` (the `isClockwise` convention `ensureClockwise` uses) and with
  the same vertices — reversed, never re-derived. This pins the shared formula's behaviour at the one
  call site, which nothing previously asserted.

### `packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts` *(new)*

- **[decomp B2]** The whole tree→scene mapping, moved verbatim out of the canvas component:
  `RecursiveLevelStyle`, `RECURSIVE_LEVEL_STYLES`, `styleForLevel`, `FAILURE_COLOUR`,
  `INPUT_POLYGON_COLOUR`, `flatten`, `centroidOf`, `skeletonEdges`, `failedCell`, `segmentPrimitives`,
  `nodePrimitives`, `recursiveTreeToScene`. Pure, no React — the shape `parcelsToScene.ts` and
  `skeletonToScene.ts` already have.

### `packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx`

- **[decomp B2]** Now owns only the viewport lifecycle — `Bounds`, `CanvasSize`, `CanvasView`,
  `FIT_MARGIN_FRACTION`, `boundsOf`, `fitView`, and the component — and calls the adapter the way
  `/parcels` calls `parcelsToScene`. No logic changed.

### `packages/dashboard/src/components/RecursiveControlsPanel.tsx`

- **[decomp B2]** Imports `styleForLevel` from `../scene/adapters/recursiveSubdivisionToScene` instead
  of reaching into a sibling React component. That cross-import was the finding's own evidence.

### `packages/dashboard/src/scene/adapters/index.ts`

- **[decomp B2]** Re-exports `recursiveTreeToScene`, `styleForLevel`, `RECURSIVE_LEVEL_STYLES` and the
  `RecursiveLevelStyle` type.

### `packages/dashboard/src/index.ts`

- **[decomp B2]** The four moved symbols now leave via the "Scene DSL" section with the other
  adapters; the "Recursive segment subdivision" section exports only the component, `fitView` and the
  viewport types. The public surface of the package is unchanged, name for name.

### `packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts` *(new)*

- **[correctness N1]** Four tests for `summariseRecursiveTree` against a hand-built three-level tree
  containing one failed node and one branch that stops a level early, so per-level nodes/segments/
  failures are three distinct numbers: per-level counts, `leafSegments` counting only childless nodes,
  the whole-tree totals, and a failed root summarised as one level with no segments.

## Design Decisions

- **`centroidOf` moved with the adapter, not left on the canvas.** The finding's fix listed it among
  the canvas's remaining members, but its only caller is `failedCell`, which is now in the adapter.
  Leaving it behind would have made the pure adapter import from the React component — exactly the
  backwards dependency the finding exists to remove. Behaviour identical; the function is unexported
  either way.
- **[correctness N2] left alone, as the reviewer directed.** `RecursiveNode` has no diagnostics field
  in the spec's type roster, so `solveSkeleton`'s `winding-normalised` diagnostic has nowhere to go
  and inventing a channel for it would be adding surface decisions 1–17 do not ask for. The
  normalisation itself is now pinned by a test, which at least makes it visible rather than implicit.

## Build & Test Results

- `pnpm --filter @proc-geo/core test` — **63 suites, 2731 tests, all passing** (2730 before; +1 for the
  winding test).
- `pnpm --filter @proc-geo/dashboard test` — **12 suites, 150 tests, all passing** (11/146 before; +1
  suite, +4 tests for `summariseRecursiveTree`).
- `pnpm build` — all four packages green, `/recursive` still prerendered as a static route.
- `pnpm lint` — the same **1 pre-existing error + 1 pre-existing warning** reported last cycle, both in
  files outside this task (`apps/demo/src/app/dol-system/page.tsx:51`,
  `apps/demo/src/app/AppShellLayout.tsx:17`). Verified by stashing this change and re-running: byte
  for byte the same output. Nothing in the recursive files lints.

## Open Questions / Risks

- **Scope extension, declared before the work.** Three of the paths touched are outside the task's
  file-ownership list: `packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts` (new),
  `packages/dashboard/src/scene/adapters/index.ts`, and
  `packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts` (new). All three are named
  explicitly by the findings being addressed (B2's fix and N1's fix), and B2 cannot be satisfied inside
  the ownership list at all, since the destination directory is the finding's whole point. Posted to
  the message board before starting rather than widened silently.
- `ensureClockwise` returns its argument unchanged (same array reference) when the input is already
  clockwise, whereas `toClockwise` always copied. Nothing in this driver mutates a boundary, and every
  recursive input is a fresh `Strip.boundary` from `computeStrips`, so the only aliasing is between a
  caller's array and a root node's `boundary`. Worth knowing if a future caller mutates what it passes
  in.

## Suggested Follow-ups

- Give the moved adapter its own test alongside `tests/scene/parcels-terrain-scene.test.ts` — group
  ids, level ordering, and the `visible` flag are all pure functions of the tree now, and nothing
  pins them.
- Still open from last cycle: export `AREA_EPSILON` from `polygon-decomposition.ts` so the codebase
  has one degeneracy floor rather than two equal constants (that file is not in this task's
  ownership), and clear the two pre-existing demo lint failures under a task that owns those files.
