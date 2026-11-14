---
title: "Task 249 — Per-level recursion specs (review cycle 1 response)"
type: workflow
area: subdivision
status: archived
date: 2026-08-17
---

# Task 249 — Per-level recursion specs (review cycle 1 response)

## Task Summary

Cycle 1 returned two `request_changes`: decomp (run 1318, one BLOCKING + one NOTE) and correctness
(run 1319, one BLOCKING + one NOTE). Correctness confirmed all fourteen decisions of
`docs/notes/per-level-recursion-specs-decisions.md` are implemented as written — D1–D2's per-level
spec lookup, D3's terminal override, D4's four combinations, D5's inert residue, D6–D7's
constructors and defaults, D8–D10's rows/readout/rendering, D11–D14's coverage and gate — and raised
no fidelity finding. So this pass changes no solver geometry: it corrects one CLAIM the readout was
making that the summary never established, and moves two subcomponents into their own files.

Findings addressed: decomp **[B1]**, decomp **[N1]**, correctness **[B1]**, correctness **[N1]**.

## Changes Made

### Correctness [B1] — a ring the recursion did not reach is no longer called degenerate

- **`packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts`** (modified) — Renamed
  `RecursiveLevelSummary.discardedResidueRings` → `unsubdividedResidueRings` and
  `RecursiveTreeSummary.totalDiscardedResidueRings` → `totalUnsubdividedResidueRings`, with the
  private counter renamed to match. The JSDoc no longer claims the count is degeneracy: it now says
  outright that a residue ring recurses through exactly the path a segment child does, so it stops
  for any of the three reasons the driver reports, and that the count names none of them. Took
  option (a) of the reviewer's fix — reason-agnostic — rather than (b), filtering on
  `Degenerate region`: the reviewer measured 22 residue-ring failures reported as `Incomplete solve`
  on the corpus, including on the store's own default fixture, and (b) would have dropped those from
  the readout entirely. A ring the picture still draws and the tiling identity still accounts for,
  reported nowhere, is a worse readout than one that declines to name a cause.
- **`packages/dashboard/src/components/recursive-readout-text.ts`** (created) — The readout's
  sentences as pure functions of a summary: `pluralize`, `streamLine`, `residueLine`,
  `residueTotalLine`. The per-level line now reads `2 residue rings → recursed (1 not subdivided)`
  and the total reads `3 residue rings, 1 not subdivided.` — both previously said "discarded as
  degenerate". These are functions rather than JSX expressions because decision 9 makes what the
  readout CLAIMS load-bearing, and a claim built inline is a claim nothing can assert on. This is
  ordinary production decomposition, not a test seam: the components import and render these, and
  the directory already holds pure sibling modules (`geometry-clipboard.ts`, `screen-to-world.ts`,
  `dol-config-utils.ts`) tested the same way.
- **`packages/dashboard/tests/components/recursive-readout-text.test.ts`** (created) — Pins both
  claims: that an overridden level says "overridden" out loud, and that the "not subdivided" count
  reads identically whether the ring stopped on the degeneracy floor or on an incomplete solve, and
  matches no `/degenerate/i` in either case.
- **`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`** (modified) — The census
  helper `discardedResidueChildren` → `unsubdividedResidueChildren` with the same correction to its
  comment, and the printed census line now says `N of them not subdivided` instead of
  `N of them discarded as degenerate`. This is the log the reviewer identified as making the
  identical mislabelling; its own output lists dozens of `Incomplete solve` reasons directly beneath
  the sentence that called them degenerate.

### Correctness [N1] — a fixture that fails for a non-degenerate reason

- **`packages/dashboard/tests/fixtures/recursive-trees.ts`** (modified) — `failedNode(level, failure?)`
  now takes the reason, defaulting to the exported `DEGENERATE_FAILURE` so every existing call site
  is unchanged. Added `INCOMPLETE_SOLVE_FAILURE` and `UNSOLVED_RESIDUE_TREE`: `RESIDUE_TREE` in
  every respect except the sentence its unrecursed ring carries.
- **`packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts`** (modified) — Field
  renames, plus a new test asserting the two trees summarise to byte-identical level counts. That is
  the metamorphic statement of the defect: the counts cannot tell the two reasons apart, so a readout
  that names one is asserting something it never checked.

### Decomp [B1] — one component per file

- **`packages/dashboard/src/components/RecursiveLevelRow.tsx`** (created) — `RecursiveLevelRow` and
  its supporting `residueDisabledReason`, `SEGMENT_OPTIONS`, `RESIDUE_OPTIONS`, `depthLabel`,
  `ResidueOption`, `SegmentOption`, moved verbatim. `RecursiveLevelRowProps` is now exported.
- **`packages/dashboard/src/components/RecursiveLevelReadout.tsx`** (created) — `RecursiveLevelReadout`
  moved verbatim; its `streamLine` went to `recursive-readout-text.ts` instead, where the [B1]
  correctness work needed it anyway. `RecursiveLevelReadoutProps` is now exported.
- **`packages/dashboard/src/components/RecursiveControlsPanel.tsx`** (modified) — Down from 427 to
  174 lines, in line with its siblings (`ControlsPanel` 131, `AlgorithmPanel` 131, `DebugPanel` 165).
  Imports the two components and the two text helpers it still uses.

### Decomp [N1] — one last-level predicate

- **`packages/core/src/straight-skeleton/recursive-subdivision.ts`** (modified) — Exported
  `isLastLevel(level, levels)`, called by `subdivideNode` (whose local is now `terminal`, so nothing
  shadows the import at the two dashboard call sites). Typed against `readonly unknown[]` because it
  asks only for the array's length, which makes it answerable for both `LevelSpec[]` and
  `LevelPolicy[]` — the same composition at two stages of preparation.
- **`packages/core/src/index.ts`** (modified) — Barrel export for `isLastLevel`.
- Both dashboard sites now call it: `summariseRecursiveTree` and the panel's row mapping. The
  arithmetic `level + 1 >= levels.length` appears exactly once in the repository.
- **`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`** (modified) — A test for
  the new export that is not merely a restatement of it: over a real two-level tree, the set of
  solved nodes the predicate calls last is asserted to be exactly the set that grew no children of
  either kind. A predicate that disagreed with the driver by one would fail it.

## Design Decisions

- **Renaming the summary fields rather than only the label.** The reviewer's fix (a) names the label,
  but the field name `discardedResidueRings` and its doc comment were where the false claim was
  written down; leaving them would have left the next reader of the store to re-derive the same wrong
  label. Every consumer is inside this task's ownership, so the rename is contained.
- **`residueTotalLine` was extracted as well as `residueLine`.** The panel's whole-tree line carried
  the same "discarded as degenerate" wording as the per-level one. Both are now asserted by the same
  suite; leaving one of the two inline would have left half the defect untested.
- **`failedNode`'s reason is an optional parameter with the old string as its default.** Adding a
  second factory would have left `RESIDUE_TREE` and the new tree structurally divergent for reasons
  unrelated to what they are contrasting, and the whole point of `UNSOLVED_RESIDUE_TREE` is that it
  differs in exactly one string.

## Files Outside the Declared Ownership List

Four files were created that the task's ownership list does not name:
`RecursiveLevelRow.tsx`, `RecursiveLevelReadout.tsx` and `recursive-readout-text.ts` under
`packages/dashboard/src/components/`, and `tests/components/recursive-readout-text.test.ts`. The
first two are the exact paths decomp [B1] prescribed; the third and fourth are the text module the
[B1] correctness fix needed to be assertable, and its suite. No file outside those was touched — in
particular `packages/dashboard/src/index.ts` needed no change, since the two extracted components are
internal to the panel and were never on the barrel.

## Build & Test Results

- `pnpm --filter @proc-geo/core test` — **67 suites, 3451 tests, all passing** (3450 before; the new
  `isLastLevel` test is the +1).
- `pnpm --filter @proc-geo/dashboard test` — **14 suites, 219 tests, all passing** (13/209 before; +1
  suite and +10 tests from the readout-text suite and the fixture-reason test).
- `pnpm build` — clean across core, test-fixtures, dashboard and demo; the demo's static export
  renders all eight routes including `/recursive`.
- `pnpm lint` — reports one pre-existing error (`apps/demo/src/app/dol-system/page.tsx:51`, explicit
  `any`) and one pre-existing warning (`AppShellLayout.tsx:17`). Both reproduce on a stashed working
  tree, both are in files this task does not own, and neither is in the recursive feature.

## Open Questions / Risks

- **`tsc --noEmit` on the dashboard reports four pre-existing errors in
  `src/components/dol-system/DolProductionComposer.tsx`** (a `@dnd-kit/react` signature mismatch).
  They reproduce on the stashed tree and are unrelated to this task; `pnpm build` is unaffected
  because tsup emits declarations without full app typechecking.
- **The readout now declines to name a cause at all.** If the intended reading was specifically
  "degenerate", the reviewer's option (b) is the alternative and would need a separate count so the
  incomplete-solve rings are still reported. I judged one honest count better than two, but this is a
  product call rather than a correctness one.

## Suggested Follow-ups

- The corpus produces `Incomplete solve` on residue rings often enough that a per-reason breakdown in
  the panel (rather than a single count) would be genuinely informative — the reasons are already on
  each child, and the panel already lists distinct failure reasons lower down.
- `pluralize` now exists twice in the dashboard: once here and once in `PenStrokePipelinePanel` /
  `ParcelControlsPanel` as an inline ternary. Lifting one shared helper would need edits to files
  outside this task's ownership.
