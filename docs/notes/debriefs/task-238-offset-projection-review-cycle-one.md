---
title: "Task 238 — Offset projection at terminal many-way events, revision cycle 1"
type: workflow
area: straight-skeleton
status: archived
date: 2026-08-16
---

# Task 238 — Offset projection at terminal many-way events, revision cycle 1

## Task Summary

Both cycle-0 reviews **approved** (decomp run 1257, correctness run 1258) with zero BLOCKING
findings and five NOTE findings between them. This pass addresses the NOTEs. No behaviour of the
solver or the projection changed; the diagnosis pinned in cycle 0 is unchanged and re-measured.

Decision 1 of `docs/notes/offset-projection-terminal-events-decisions.md` remains the operative
decision: the terminal-event hypothesis was refuted by measurement, so decisions 3–8 are still
correctly not implemented and nothing in this pass reopens them.

## Findings addressed

### [1257/N1, id 2562] Test helpers re-derived two production formulas — FIXED

`liveBisectorIds` restated `collectAliveBisectors`'s half-open `[birth, death)` rule and
`bisectorPositionAt` restated `bisectorPositionAtOffset`'s perpendicular-to-along-ray conversion.
The reviewer's own point is the decisive one: the module header of `offset-projection.ts` exists
because deriving one quantity by two routes cost whole rings, and the diagnostic tests were doing
exactly that in test code — so a change to the real formula would have left the "diagnosis" passing
against a stale one.

Taken the reviewer's suggested fix: `collectAliveBisectors` and its `AliveBisector` result type are
now **exported** from `offset-projection.ts`, and both test helpers are **deleted**. `failedSpanOf`
now calls the production function and reads `id`, `position`, `clockwiseParentId` and
`widdershinsParentId` straight off it.

Two notes on how that export was framed:

- It is **not** a test seam. The JSDoc justifies it in production terms and mirrors the rationale
  already carried by `requireProjectableResult` in the same file ("exported so that modules built on
  top of the projection … instead of inventing their own checks"). No `ForTesting` naming, no
  test-scenario prose, no `friend`-equivalent.
- It is exported from the **module**, not from the package barrel. `packages/core/src/index.ts` is
  outside this task's file ownership, so it was not touched; the test imports the primitive by an
  in-package relative path, which is the established pattern in `tests/articulation/*.test.ts`.
  Promoting it to the public barrel is a separate call for whoever owns that file.

`failedSpanOf` also gained an explicit throw where the chain's terminal bisector is not among the
alive set. That is structurally impossible — the walk only reached it because the projection called
it alive — so the old code's unchecked `find(...)!` was silently assuming it. Now it says so.

### [1258/N1, id 2566] `rejoined-mid-chain` subset was claimed, not verified — FIXED

The cycle-0 debrief said the mechanism holds "across all 36 measured chains", but four tests skipped
every `rejoined-mid-chain` case, so 13 of the 36 were counted in the aggregate and never explained.
That prose claim is now replaced by two measured assertions:

1. **`reports every loss as one of exactly two chain reasons, in known proportion`** — counts the
   population into a record seeded with the two known reasons. A third reason adds a key and fails
   the `toEqual`, so this is simultaneously the "reason is one of the two expected values" check the
   reviewer asked for. Pinned at `no-successor: 23`, `rejoined-mid-chain: 13` (measured, sums to the
   36 the per-fixture table already pins).

2. **`accounts for the rejoined chains as the far side of a broken chain, not a second defect`** —
   the linkage. Every rejoined chain's **last** bisector is the **first** bisector of a
   `no-successor` chain at the same fixture and the same offset. That is not a coincidence but the
   exact mechanics of `assembleRings`: the first walk stops at the dropped span with
   `no-successor`; a later seed picks up the remainder of the same loop and walks forward into the
   segment that first walk seeded from, finds it visited, and stops with `rejoined-mid-chain`. One
   break, reported twice. Holds for all 13 with no exception.

The section's header comment gained a `ONE BREAK IS REPORTED TWICE` block stating this, and the new
`noSuccessorLosses()` helper documents why the mechanism tests measure that half only.

Both new tests were mutation-checked before being accepted: flipping the linkage index from
`bisectorIds[0]` to `[1]` and the pinned count from 13 to 12 fails them both, and only them.

### [1257/N2, id 2563] Repeated `no-successor` filter-loop — FIXED

Added `noSuccessorLosses()` (and its counterpart `rejoinedLosses()`). All five `it` blocks now open
with `for (const lost of noSuccessorLosses())` and the repeated `if (… !== 'no-successor') continue;`
guard is gone. The helper's doc comment carries the reason the subset exists, which the inline guard
never could.

### [1257/N3, id 2564] `solvedFixture` / `solvedHeldOutFixture` — NO ACTION, deliberate

The reviewer explicitly did not request action and gave the reason I agree with: the two draw from
genuinely different sources (`ALL_TEST_POLYGONS` by name vs. a held-out fixture object), and merging
them would mean one helper that either searches a list or does not depending on an argument. Shape
duplication with different meaning stays separate.

### [1257/N4, id 2565] Near-regular roster duplicated across two suites — NO ACTION, scope

Agreed as a real duplication, and the reviewer's `placement-helpers.ts` precedent is the right
pattern for it. Not done, for a scope reason rather than a design one: the fix needs a new shared
helper module (`near-regular-fixtures.ts` beside the suites), and this task's file ownership is a
fixed five-file list that does not include it. Folding a fixture roster into `placement-helpers.ts`
instead was rejected — that module is documented as being *only* the operating-envelope placement
formula, and making it a grab-bag would trade one finding for a worse one. Carried to follow-ups.

## Changes Made

- **`packages/core/src/straight-skeleton/offset-projection.ts`** — exported `AliveBisector` and
  `collectAliveBisectors`; extended both doc comments with the production rationale for the export.
  No executable line changed; the function body, the lifetime rule and every tolerance are identical.
- **`packages/core/tests/straight-skeleton/offset-event-boundary-regression.test.ts`** — deleted
  `liveBisectorIds` and `bisectorPositionAt`; rewrote `failedSpanOf` on the production primitive;
  added `noSuccessorLosses`, `rejoinedLosses`, `LOST_RINGS_PER_REASON`, and the two new tests;
  replaced the five inline reason guards; imported `UnclosedChainReason`; dropped the now-unused
  `projectFromPerpendicular` import; added the `ONE BREAK IS REPORTED TWICE` header section.

The other three files named in the ownership list (`offset-projection.test.ts`,
`placement-helpers.ts`, `wavefront-causality.test.ts`) needed no change and were not touched.

## Design Decisions

- **No new tolerance.** `SIMULTANEITY_BAND` (1e-12) is unchanged and still lives only in the test
  file. Nothing in this pass introduces a tolerance into `packages/core/src/`, and
  `FLOATING_POINT_EPSILON` was not conflated with it.
- **Counts pinned in both directions.** `LOST_RINGS_PER_REASON` is asserted with `toEqual`, so a
  *reduction* in losses fails the suite just as a growth does. That is the same deliberate stance
  `LOST_RINGS_PER_FIXTURE` already takes: this section is a diagnosis, and a movement in either
  direction means it needs re-measuring rather than adjusting.
- **The linkage is exact, not approximate.** `bisectorIds[0] === rejoinTarget` and
  `lost.offset === rejoined.offset` are both exact comparisons. No slack was needed because both
  sides come from the same projection call on the same result.

## Build & Test Results

- `pnpm --filter @proc-geo/core test` — **PASS**, 61 suites / 2678 tests, 0 failures.
  The target suite went 24 → 26 tests, all green.
- `pnpm build` — **SUCCESS**, all four packages (core → test-fixtures → dashboard → demo).
- `pnpm --filter @proc-geo/core exec tsc --noEmit` — clean.
- No lint run: nothing under `packages/dashboard/` or `apps/demo/` was touched.

## Open Questions / Risks

- `collectAliveBisectors` is now a package-internal export rather than a private function. If the
  owner of `src/index.ts` wants it on the public surface it is ready for that; if they would rather
  it stayed private, the diagnostic tests lose their access to the one true formula and finding 2562
  comes back. Worth a decision by whoever owns the barrel.
- `LOST_RINGS_PER_REASON`'s split (23/13) is measured at this commit against the same solve the
  per-fixture table was measured against. It is a property of the seeding order in `assembleRings`
  as much as of the defect, so a change to that walk's seeding would move the split without the
  underlying loss changing. The per-fixture total is the invariant of the two; the split is the
  finer-grained tripwire.

## Suggested Follow-ups

- Extract the near-regular fixture roster into a shared helper module beside the suites, per finding
  2565, and point both `offset-event-boundary-regression.test.ts` and `wavefront-causality.test.ts`
  at it. Needs a task whose scope permits a new file in `tests/straight-skeleton/`.
- The defect itself is still open and still upstream of the projection walk: one physical instant
  coming back as several offsets 7e-15 to 3.5e-13 apart, because each node re-derives its offset
  from its own parent edge. Fixing it means giving simultaneous mirror nodes one shared offset at
  the point the table is built, not widening a comparison downstream. That is a solver-side or
  `computeNodeOffsets`-side task, not a projection-side one.
