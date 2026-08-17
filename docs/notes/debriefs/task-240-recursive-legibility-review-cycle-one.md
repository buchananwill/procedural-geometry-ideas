---
title: "Task 240 — Review cycle 1: splitting the adapter, and moving its tests"
type: debrief
task: 240
spec: docs/notes/recursive-subdivision-legibility-decisions.md
supersedes: docs/notes/debriefs/task-240-recursive-legibility-ancestor-tints.md
---

# Task Summary

Cycle 0 was approved by the correctness reviewer (0 BLOCKING, decisions 1–9 all verified) and blocked
by the decomposition reviewer with two BLOCKING findings. Both concern where the cycle-0 code and
tests were put, not what they do. **No behaviour changed in this cycle** — the two follow-ups the
cycle-0 debrief deferred are the two findings, and they are done here instead.

# Changes Made

| File | Action | Change |
|------|--------|--------|
| `packages/dashboard/src/scene/adapters/recursiveTerritoryTint.ts` | created | `FAILURE_COLOUR`, the reserved-hue constants, the leaf-fill palette constants, `hslHex`, `ancestorTint` — moved verbatim from the adapter. |
| `packages/dashboard/src/scene/adapters/leafTerritories.ts` | created | `LeafTerritoryCell`, `LeafTerritories`, `UncountedLeafCell`, `collectLeafCells`, `leafTerritories` — moved verbatim from the adapter. |
| `packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts` | modified | Now owns only the tree→primitives mapping and draw order; imports the two modules above. 402 → 264 lines. |
| `packages/dashboard/tests/scene/recursiveSubdivisionToScene.test.ts` | created | The `leafTerritories`, `ancestorTint`, `RECURSIVE_LEVEL_STYLES`, `recursiveTreeToScene` and failed-cell describes, moved from the store's test file. |
| `packages/dashboard/tests/fixtures/recursive-trees.ts` | created | The hand-built `TREE`, `node`, `failedNode` and `TREE_TERRITORY_COUNT`, so both suites read one definition. |
| `packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts` | modified | Store concerns only: `summariseRecursiveTree` and the page defaults. 371 → 66 lines. |

# Design Decisions

**[B1] — the two seams the reviewer named, cut where they were named.** The colour math went to
`recursiveTerritoryTint.ts` and the ancestry walk to `leafTerritories.ts`, leaving the adapter with
one reason to change: how the tree is drawn. Every moved function is byte-identical to its cycle-0
form apart from two JSDoc `{@link}` targets that no longer resolve across the new file boundary.

**`FAILURE_COLOUR` moved with the tint module, not with the adapter.** It is the adapter that draws
the failure patch, so the obvious split leaves the colour behind — but the reserved arc
(`FAILURE_HUE_DEGREES` ± 30°) exists *because of* that colour's hue, and splitting the two apart
would let a later change to the colour leave the reservation guarding the wrong hue with nothing to
catch it. One fact, one module; the adapter imports it.

**[B2] — the move, plus one thing the move exposed.** The adapter describes went to
`tests/scene/recursiveSubdivisionToScene.test.ts` exactly as the finding prescribes: one file, matching
the `tests/scene/parcels-terrain-scene.test.ts` precedent, rather than three files mirroring the three
source modules. What the move exposed is that both suites assert against the *same* hand-built `TREE`
— the store test counts its leaves and the scene test tints them — so copying the builders into the
second file would have left two definitions of one fixture free to drift. They are in
`tests/fixtures/recursive-trees.ts` instead. Jest's `testMatch` is `tests/**/*.test.ts`, so that file
is a module, not a suite.

**The scene test still imports `summariseRecursiveTree` from the store.** Two assertions cross-check
the adapter's cell count against the panel's leaf count. That coupling is the point of those
assertions — the picture and the number beside it must agree about how many leaves there are — so it
survived the move rather than being weakened into a literal.

**[N1] `hslHex` is still duplicated with `parcelsToScene.ts`.** Not actioned, as the finding itself
states: the true fix is to export one copy from a shared module, which requires editing
`parcelsToScene.ts` — outside this task's ownership. The duplicate now lives in
`recursiveTerritoryTint.ts`, which is a better home for whichever task next consolidates the two.

**[N2] and [N3] — no action, per the reviewer.** N2 (the canvas's store wiring is covered
transitively, not directly) matches the package's standing convention that no `.tsx` component has a
test. N3 (`FAILURE_HUE_DEGREES = 340` against an actual 339°) is ~1° inside a 30° margin; changing it
would move every territory hue for no gain.

**[N1 of the correctness review] — nothing to fix.** Recorded as visibility-only there; the 75°
spacing at four territories is what decision 2's "spread evenly" and decision 7's mandatory 60°
reservation jointly produce. Unchanged this cycle.

# Build & Test Results

- `pnpm --filter @proc-geo/dashboard test` — **169 passed / 169**, 13 suites (was 12; the count is
  unchanged because tests moved rather than being added).
- `pnpm --filter @proc-geo/core test` — **2731 passed / 2731**, 63 suites. No regression.
- `pnpm build` — **SUCCESS**: core, test-fixtures, dashboard, and the Next.js demo (all 8 routes).
- `pnpm lint` — same **pre-existing** failure as cycle 0: `no-explicit-any` at
  `apps/demo/src/app/dol-system/page.tsx:51` and an unused-var warning in `AppShellLayout.tsx`.
  Neither file is touched here and ESLint does not cover `packages/dashboard` at all.
- `tsc --noEmit` on the dashboard reports errors in `src/components/dol-system/DolProductionComposer.tsx`
  only (a `@dnd-kit/react` typing mismatch). Pre-existing, unrelated, and not surfaced by `tsup`.

No test needed rewriting to pass: the assertions are the cycle-0 assertions against the same inputs,
which is the evidence that this cycle changed no behaviour.

# Open Questions / Risks

- **The one-test-file-per-source-module question is still open.** Three source modules are now covered
  by one `tests/scene/` suite, which is what B2's fix text prescribes and what the `parcelsToScene`
  precedent does. If the convention is meant to be one suite per module, the split is cheap now that
  the fixture is shared.
- The cycle-0 risks stand unchanged: holes in a leaf cell are tinted over, nothing was verified in a
  browser, and territory hues crowd at high counts.

# Suggested Follow-ups

- Consolidate `hslHex` into a shared `scene/colour.ts` used by both `parcelsToScene.ts` and
  `recursiveTerritoryTint.ts` — needs a task that owns `parcelsToScene.ts`.
- `RecursiveSceneOptions` is not re-exported from `scene/adapters/index.ts`, so a consumer of the
  published package can call `recursiveTreeToScene` but cannot name its argument type.
- Fix the pre-existing `no-explicit-any` that keeps `pnpm lint` red for everyone.
</content>
