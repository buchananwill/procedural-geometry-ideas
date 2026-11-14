---
title: "Task 246 — Partial depth and the residue stream (review cycle 1 response)"
type: workflow
area: subdivision
status: archived
date: 2026-08-17
---

# Task 246 — Partial depth and the residue stream (review cycle 1 response)

## Task Summary

Cycle 1 review returned one `request_changes` (decomp, run 1302) and one `approve` (correctness,
run 1303). Correctness raised no findings — every numbered decision D1–D16 of
`docs/notes/partial-depth-residue-stream-decisions.md` was checked and confirmed, so this pass
changes **no behaviour** and touches no solver code. It resolves decomp's one BLOCKING finding and
both NOTE findings.

## Changes Made

- **`packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx`** (modified) — **[B1]** Deleted
  the local `Bounds` interface and the local `boundsOf` reducer; the file now imports `Bounds2` and
  `boundsOfPoints` from `@proc-geo/core` (already a dependency and already imported here for the
  tree type). `fitView` takes `Bounds2`, and the `useMemo` calls `boundsOfPoints(tree.boundary)`.
- **`packages/dashboard/src/index.ts`** (modified) — **[B1], build-green** Dropped `Bounds` from the
  barrel's type re-export block, since the type it named no longer exists. Consumers that want the
  shape take `Bounds2` from `@proc-geo/core`, which already exports it publicly. This file is
  outside the task's declared ownership list; the edit is the minimum needed to keep the package
  compiling after the deletion the reviewer asked for, and nothing else in the file was touched.
- **`packages/dashboard/src/components/RecursiveControlsPanel.tsx`** (modified) — **[N1]** Added a
  module-local `pluralize(n, word)` helper and routed all six `${n} thing${n === 1 ? '' : 's'}`
  sites through it (per-level regions, total segments, leaf cells, residue rings, failed regions,
  surplus failure reasons). **[N2]** Named the previously inline annotation on `RESIDUE_OPTIONS` as
  an exported `ResidueOption` interface.

## Design Decisions

- **`boundsOfPoints` on an empty point set differs from the deleted `boundsOf`, and the difference is
  unobservable.** The local reducer returned `±Infinity` for an empty array; core returns a
  degenerate box at the origin. `fitView` is the only consumer, and its guard is `!(width > 0)` —
  `-Infinity` and `0` both fail it identically, so both inputs return the identity transform. The
  only other read of `bounds` is the fit signature string, which is compared for equality against
  itself and never interpreted. No behaviour change.
- **`pluralize` stays local to the panel, not lifted to a shared util.** Three other dashboard
  components carry the same ternary (`PenStrokePipelinePanel`, `ParcelControlsPanel`), but those
  files are outside this task's ownership and outside the reviewer's stated fix ("extract a *local*
  helper"). Lifting a shared helper would require editing files this task has no mandate over.
  Flagged below as a follow-up rather than acted on.
- **No new test file.** All three findings are behaviour-preserving deduplications on code the
  correctness reviewer independently re-ran and approved; the existing 195 dashboard tests and 3418
  core tests are the regression gate. Adding a `fitView` unit test would mean creating
  `packages/dashboard/tests/components/…`, which is not in the declared ownership list.

## Build & Test Results

- `pnpm --filter @proc-geo/core test` — **67 suites / 3418 tests, all passing**.
- `pnpm --filter @proc-geo/dashboard test` — **13 suites / 195 tests, all passing**.
- `pnpm build` — **clean** across core, test-fixtures, dashboard, demo (all 8 demo routes prerender).
- `pnpm lint` — 1 error + 1 warning, both **pre-existing and unrelated**:
  `apps/demo/src/app/dol-system/page.tsx:51` (`no-explicit-any`) and
  `apps/demo/src/app/AppShellLayout.tsx:17` (`no-unused-vars`). Both files were last modified in
  `ed26de8`/`9db9280`, well before this task, and neither is in its ownership list. Not fixed.
- `tsc --noEmit` on the dashboard reports pre-existing `@dnd-kit` signature errors in
  `src/components/dol-system/DolProductionComposer.tsx`. Zero errors in any file this task owns, and
  `pnpm build` (tsup) is clean.

## Open Questions / Risks

- Removing `Bounds` from the dashboard barrel is a public-API deletion for the package. Nothing in
  this repo imported it (`apps/demo`, `packages/dashboard/tests`, and the rest of `src` were all
  grepped clean), but an external consumer would need to switch to `Bounds2` from `@proc-geo/core`.
  The dashboard is at `0.x` and the type was introduced in this same feature's earlier task.

## Suggested Follow-ups

- The `${n} thing${n === 1 ? '' : 's'}` ternary still appears in `PenStrokePipelinePanel.tsx` (×2)
  and `ParcelControlsPanel.tsx` (×1). A shared `pluralize` in a dashboard-wide util, with those
  three sites and this panel's six routed through it, would finish the job N1 started.
- The pre-existing `@dnd-kit` type errors in `DolProductionComposer.tsx` are invisible to `pnpm
  build` because tsup does not typecheck the app the way `tsc --noEmit` does. Worth a dedicated
  typecheck gate for the dashboard package.
