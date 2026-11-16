---
title: "Task 238 — Offset projection at terminal events: review cycle two"
type: workflow
area: straight-skeleton
status: archived
date: 2026-08-16
# task: 238
# cycle: 2
---

# Task 238, revision cycle 2

## Task Summary

Cycle 1 was reviewed by two reviewers. The correctness reviewer **approved** (0 BLOCKING, 1 NOTE);
the decomposition reviewer **requested changes** (2 BLOCKING, 1 NOTE). No behavioural finding was
raised against the solver or against `offset-projection.ts` — decision 1's refutation of the
terminal-event hypothesis stands, and decisions 3–6 remain correctly unimplemented. Every finding
in this cycle is about how the work is *organised* and how strongly the gate is *tested*.

Findings addressed:

- **B1 (decomp, blocking)** — `wavefront-causality.test.ts` re-derived the node-offset formula twice
  inside one file.
- **B2 (decomp, blocking)** — the ~460-line near-regular diagnosis was a second responsibility group
  bolted onto `offset-event-boundary-regression.test.ts`.
- **N1 (decomp, note)** — the death-node derivation was repeated across four test bodies.
- **N1 (correctness, note)** — decision 9's mutation gate had been exercised by hand during
  development but was never persisted as a test.

## Changes Made

| File | Action | Change |
|---|---|---|
| `packages/core/tests/straight-skeleton/wavefront-measurement-helpers.ts` | created | `signedRingArea`, `totalRingArea`, `eventOffsets` lifted out of the regression suite so the guarantee suite and the diagnosis suite state their measurements over the same quantities. Not named `*.test.ts`, following the `placement-helpers.ts` precedent, so Jest does not collect it as an empty suite. |
| `packages/core/tests/straight-skeleton/near-regular-ring-loss-diagnosis.test.ts` | created | The whole `describe('the near-regular ring loss, diagnosed', ...)` section and its banner, moved verbatim out of the regression file (B2). Adds `deathNodeOf` and a per-solve offset-table memo (N1 decomp). |
| `packages/core/tests/straight-skeleton/offset-event-boundary-regression.test.ts` | modified | Near-regular section removed; measurement helpers imported rather than defined; header gains a "what this file is not" section pointing at the diagnosis file; new mutation test under "nothing is discarded silently" (N1 correctness). |
| `packages/core/tests/straight-skeleton/wavefront-causality.test.ts` | modified | `deriveNodeOffsets(vertices, graph)` extracted; `findOffsetViolations` and `findClearanceViolations` now both read it (B1). |
| `packages/core/src/straight-skeleton/offset-projection.ts` | modified | One doc line: the module header's pointer at the diagnosis now names the file the diagnosis moved to. No executable line changed. |

## Design Decisions

**B2 — where the seam runs.** The two suites are separated by *reason to change*, exactly as the
reviewer framed it. `offset-event-boundary-regression.test.ts` asserts a guarantee over
`ALL_TEST_POLYGONS` and changes only if that guarantee regresses;
`near-regular-ring-loss-diagnosis.test.ts` pins broken behaviour over four held-out fixtures and is
expected to change the day the mirror-event defect is fixed. Both files now say so in their headers,
and the production module header points at the second by name. Nothing was promoted into
`ALL_TEST_POLYGONS` (decision 10 holds).

**B1 — the oracle stays independent of production.** `deriveNodeOffsets` deliberately does *not*
call `computeNodeOffsets` from `offset-projection.ts`, even though the two compute the same
quantity. The whole point of `wavefront-causality.test.ts` is to trust nothing the solver recorded;
sharing the derivation with the code under audit would give that up. The reviewer's fix explicitly
called for this separation, and the doc comment on the new helper records why.

**N1 correctness — how the mutation is made, given decision 6.** Decision 9 asks for a node's offset
to be perturbed so a bisector's `death` no longer matches its successor's `birth`. That cannot be
done by moving a node "a bit": since the fix, both ends are read from the same entry of the same
table, so a node moving takes its own birth and death with it. The mutation therefore delays *one*
node's re-derived offset while every other node keeps the solve's dating of the same instant. The
bisectors meeting at that node are then alive past their own meeting point and the bisector born
there is not yet alive — which is the broken hand-over, produced from outside the module rather than
by loosening anything inside it. **No tolerance was introduced anywhere**; the 1e-6 displacement is
a distance a node is moved, not a slack any comparison is made against, and the area comparison
reuses the file's existing `isContinuous` slack rather than inventing a second one.

The direction of the displacement is chosen by measurement — four axis displacements are tried and
the one that dates the node latest is kept — rather than by re-deriving which parent edge
`computeNodeOffsets` reads the node against. Restating that choice in the test would be a second
route to a quantity the module owns, which is the exact fault the file exists to record.

**What the mutation test asserts.** Every mutation must be either *reported* or *harmless*: a
silently smaller ring set is the outcome the module exists to prevent. Measured at this commit: 233
clean events across the corpus, the report fires on 103 of them and the other 130 cost no area at
all. The assertion is `silentLosses === ''` plus a non-vacuity floor of `fired > mutated / 4`, so it
cannot be satisfied by a mutation that never bites.

**The mutation test was itself convicted.** Suppressing the report in production
(`assembleRings` returning `unclosedChains: []`) makes it fail with 95 silent area losses named,
including `Duck Octagon (passes) @37.052158: 11653.38 -> 0`. The production edit was reverted
immediately; `git diff` on `offset-projection.ts` shows the one doc line and nothing else.

## Build & Test Results

- `pnpm --filter @proc-geo/core test` — **62 suites, 2679 tests, all passing**, run twice with
  identical results (decision 11's intersected-failure-set gate: the intersection is empty). Counts
  moved from 61/2678 by exactly the one new suite file and the one new mutation test.
- `pnpm build` — **clean** across all four packages (core, test-fixtures, dashboard, demo).

## Open Questions / Risks

- `signedRingArea` and its variants also exist, independently, in `offset-projection.test.ts`,
  `strip-decomposition.test.ts`, `parcel-slicing.test.ts`, `collinear-dumbbell.test.ts` and
  `near-regular-polygons.test.ts`. Those files are outside this task's ownership, so they were left
  alone and are flagged rather than fixed. `wavefront-measurement-helpers.ts` is now the obvious
  home for them if a later task owns those files.
- The mutation sweep's `fired > mutated / 4` floor is a judgement, not a measurement. It was set
  well below the observed 103/233 so that ordinary numerical drift cannot trip it, while a change
  that silenced the report wholesale still would.
- The 130 mutations that cost no area are not proof that nothing was lost — only that no *area* was.
  A ring could in principle change shape at constant area. That is not a scenario the corpus
  produces, and chasing it would need a per-vertex comparison the diagnosis does not currently need.

## Suggested Follow-ups

1. Fix the mirror-event defect the diagnosis file pins (simultaneous events re-derived to
   femtometre-different offsets), then re-measure `LOST_RINGS_PER_FIXTURE` and
   `LOST_RINGS_PER_REASON` — they are expected to go to zero, at which point that file becomes a
   regression suite rather than a diagnosis.
2. Then decision 10's promotion of the near-regular fixtures into `ALL_TEST_POLYGONS`, which needs
   the hard-coded 271-event count in `offset-event-boundary-regression.test.ts` re-taken.
3. Consolidate the remaining `signedRingArea` copies onto `wavefront-measurement-helpers.ts`.
