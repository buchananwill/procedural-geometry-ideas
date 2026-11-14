---
title: "Task 240 — Review cycle 2: covering the controls the solver actually reads"
type: workflow
area: subdivision
status: archived
date: 2026-08-17
# task: 240
# spec: docs/notes/recursive-subdivision-legibility-decisions.md
# supersedes: docs/notes/debriefs/task-240-recursive-legibility-review-cycle-one.md
---

# Task Summary

Cycle 1 was **approved by both reviewers** — decomposition (run 1276) and correctness (run 1277)
each returned 0 BLOCKING. Five NOTE findings were raised between them, and the task instruction is
that NOTE findings are addressed too. This cycle actions the one NOTE that is both actionable and
inside this task's declared file ownership, and records why the other four are deliberately not
actioned.

**No production code changed in this cycle.** The only modified file is a test file.

# Changes Made

| File | Action | Change |
|------|--------|--------|
| `packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts` | modified | Added a `subdivision controls` describe covering `setFixtureName`, `setLevels`, `setMergeGroupSize`, `toggleLevel` and `showAllLevels` (correctness N2). Added a `beforeEach` store reset, since the singleton was previously relied on being pristine. 66 → 175 lines. |

# Findings Addressed

## Correctness [N2] — store actions had no coverage (finding 2600). **Actioned.**

The finding is exact: the suite covered `summariseRecursiveTree` and the two behaviours cycle 0
introduced, but none of `setLevels` / `setMergeGroupSize` / `setFixtureName` / `toggleLevel` /
`showAllLevels`. Seven tests now do.

These are worth having rather than box-ticking because every one of these values is handed straight
to `subdivideRecursively`, which clamps again on its own. An unclamped store therefore does not
produce a visibly wrong picture — it produces a solver run at the clamped value while the panel goes
on reporting the number the user typed. That divergence is invisible on the canvas, which is
precisely the class of bug a test has to catch.

**Each new assertion was mutation-checked rather than assumed.** I removed the guard each test
covers, confirmed the test went red, and restored the file:

| Mutation | Result |
|----------|--------|
| `setLevels` stops calling `clampLevels` | ✕ *holds levels inside the range the driver recurses over* |
| `setMergeGroupSize` drops the `MAX_MERGE_GROUP_SIZE` ceiling | ✕ *holds the merge group between one edge and the panel ceiling* |
| `toggleLevel`'s range guard removed entirely | ✕ *ignores a level outside the tree* |
| `toggleLevel`'s **lower** bound only removed | ✓ — **initially did not bite** |

That last row was a real finding against my own test. `toggleLevel(-1)` under Immer writes a `-1`
property that leaves both `length` and `every(...)` untouched, so the obvious assertions pass against
a store with no lower guard at all. The test now asserts on `Object.keys(levelVisibility)`, which is
the only observable that moves, and it bites. Restoring the store confirmed all four mutations are
covered.

## Not actioned, with reasons

**Decomp [N1] (2597) — extract `summariseRecursiveTree` from the store module.** Not actioned on the
reviewer's own instruction: the fix text reads *"Not urgent at current size … not worth churn
today,"* and conditions the extraction on the file growing further. It has not grown — this cycle
touched no production file, and at 166 lines it remains smaller than `usePenStrokeStore.ts` (240) and
`useArticulationStore.ts` (279). Extracting would also mean creating a new source file outside the
five paths this task owns. Left as the standing follow-up it was logged as.

**Decomp [N2] (2598) — `hslHex` duplicated with `parcelsToScene.ts`.** Explicitly "no action needed
in this task" and restated by the reviewer as continuity only. The real fix edits
`parcelsToScene.ts`, which this task does not own. Unchanged from cycle 1.

**Correctness [N1] (2599) — 75° hue gaps, not decision 2's "roughly 90°".** Explicitly
visibility-only, and `recursiveTerritoryTint.ts` is outside this task's ownership. Recording the
trade-off here as the finding asks: decision 7 reserves ±30° around the failure hue as a hard
"must never collide" constraint, leaving a 300° arc; decision 2's number is qualified "roughly" and
is an illustration, not a bound. 300/4 = 75 is what the two decisions jointly produce. Decision 7
wins because it is the absolute one — and it is a closed-form guarantee, not a sampled check, so
weakening the arc to hit exactly 90° would trade a proof for a coincidence.

**Correctness [N3] (2601) — `TREE` encodes a shape the driver cannot produce.** The reviewer confirms
"no production bug"; the invariant genuinely holds and `collectLeafCells` is safe under it.
`tests/fixtures/recursive-trees.ts` is outside this task's ownership, so the fixture comment it
suggests is left to a task that owns the file. Worth noting the fixture's `node(1, 4, [node(2, 2)])`
branch is what makes the level-1 node, segment and failure counts three distinct numbers, so any
correction should preserve that property rather than just flatten the branch.

# Design Decisions

**A `beforeEach` reset was added, not just new tests.** The two pre-existing `page defaults` tests
read the singleton's pristine state, and one of them mutates `showLeafFills` and restores it by hand.
Adding tests that write `levels`, `mergeGroupSize` and `levelVisibility` to that same singleton would
have made the file order-dependent. The reset follows the `useTerrainStore.test.ts` pattern already
in this directory.

**`MAX_RECURSION_LEVELS` is imported rather than restated.** The new assertions derive their expected
key set and upper bound from the core constant, for the same reason the store itself calls
`clampLevels` instead of restating `[1, 3]`: the store, the solver and the test must agree about what
level 3 means, and the only way to guarantee that is to ask the same source.

# Build & Test Results

- `pnpm --filter @proc-geo/dashboard test` — **176 passed / 176**, 13 suites (was 169; +7 new).
- `pnpm --filter @proc-geo/core test` — **2731 passed / 2731**, 63 suites. No regression.
- `pnpm build` — **SUCCESS**: core, test-fixtures, dashboard, demo.
- `pnpm lint` — unchanged **pre-existing** failure: `no-explicit-any` at
  `apps/demo/src/app/dol-system/page.tsx:51` plus an unused-var warning in `AppShellLayout.tsx`.
  Neither file is touched here, and ESLint does not cover `packages/dashboard` at all.

No test was rewritten to pass, and the store file is byte-identical to its cycle-1 form (verified via
`git diff --stat`: one file changed).

# Open Questions / Risks

- The cycle-1 risks stand unchanged: holes in a leaf cell are tinted over, nothing has been verified
  in a browser, and territory hues crowd at high root counts.
- The `Object.keys` assertion for `toggleLevel(-1)` depends on Immer preserving a negative-index
  property through finalisation. It does today, and it is the mutation check that proved so — but if
  Immer's array finalisation changes, that assertion silently stops biting rather than failing. A
  guard clause in the store is the real protection; the test is the second line.

# Suggested Follow-ups

Carried forward from cycle 1, none newly actionable here:

- Consolidate `hslHex` into a shared `scene/colour.ts` — needs a task owning `parcelsToScene.ts`.
- Extract `summariseRecursiveTree` to `recursiveTreeSummary.ts` if the store file grows.
- Add the invariant comment (or an invariant-respecting builder) to `tests/fixtures/recursive-trees.ts`.
- Re-export `RecursiveSceneOptions` from `scene/adapters/index.ts`.
- Fix the pre-existing `no-explicit-any` that keeps `pnpm lint` red for everyone.
</content>
</invoke>
