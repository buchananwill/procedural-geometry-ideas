---
title: "Task 238 — Offset projection at terminal events: review cycle three"
type: debrief
task: 238
cycle: 3
---

# Task 238, revision cycle 3

## Task Summary

Both cycle-2 reviewers **approved** with zero BLOCKING findings (decomp run 1263, correctness run
1265). The task instruction is that NOTE findings are to be addressed also, so this cycle is
entirely NOTE clean-up: no production behaviour changed, and `offset-projection.ts` is untouched —
decision 1's refutation of the terminal-event hypothesis stands, and decisions 3–8 remain correctly
unimplemented per decision 1.

Findings addressed:

- **N1 (decomp, id 2573)** — `offset-projection.test.ts` still carried its own, already-diverged
  copy of the ring-area formula, plus a second copy of `distanceToSupportingLine`.
- **N2 (decomp, id 2574)** — the repeated-vertex sweep in the regression file nested seven levels.
- **N1 (correctness)** — two of the five assigned files carry no task-238 diff; flagged as a
  scope-list artifact, "no action needed on the code". No code action taken; see Open Questions.
- **N2 (correctness)** — decision 9's mutation gate accepted a loose `fired > mutated / 4`
  non-vacuity bound that would survive a halving of the report's sensitivity.

## Changes Made

| File | Action | Change |
|---|---|---|
| `packages/core/tests/straight-skeleton/wavefront-measurement-helpers.ts` | modified | Gains `distanceToSegment` and `distanceToSupportingLine`, the two point-to-line distances every offset suite states its properties in. Header explains why sharing them costs the causality suite none of its independence from production. |
| `packages/core/tests/straight-skeleton/offset-projection.test.ts` | modified | Local `signedRingArea`, `totalRingArea`, `distanceToSegment` and `distanceToSupportingLine` deleted; all four now imported from `wavefront-measurement-helpers.ts` (N1 decomp). Header notes where its measurements come from. |
| `packages/core/tests/straight-skeleton/wavefront-causality.test.ts` | modified | Local `distanceToSupportingLine` and `distanceToSegment` deleted in favour of the shared ones; `deriveNodeOffsets`' doc says precisely what is now shared and what deliberately is not (N1 decomp). |
| `packages/core/tests/straight-skeleton/offset-event-boundary-regression.test.ts` | modified | `hasRepeatedVertex(ring, tolerance)` extracted, cutting the repeated-vertex sweep from seven levels to five (N2 decomp). The mutation gate's non-vacuity check is now the pinned pair `mutated === 233`, `fired === 103` instead of `fired > mutated / 4` (N2 correctness). |

## Design Decisions

**The area formula that had drifted.** `offset-projection.test.ts`'s copy of `signedRingArea`
accumulated raw cross products; the shared one subtracts the ring's first vertex first, so the
shoelace sum stays stable at the translated envelopes this task's own gate exercises. Switching the
file onto the shared version therefore changes its numbers slightly — that is the point of the
finding, and the suite's assertions are all comparative (monotone decrease, `> 0`), so the change is
an improvement in the measurement rather than a change in what is asserted. Verified green.

**Why the distances are shareable but the offset derivation is not.**
`wavefront-causality.test.ts` exists to trust nothing the solver recorded, which is why
`deriveNodeOffsets` stays independent of production's `computeNodeOffsets`. That independence is
about the *derivation of a node's offset* — which interior edges define a node, which polygon edge
dates it. The perpendicular distance from a point to a line reads nothing the solver produced, so
sharing it with the offset suites leaves the audit exactly as strong while making all three suites'
notion of a distance the same one. Both doc comments now say so explicitly, so a future reader does
not undo one and re-derive the other.

**Pinning the mutation split rather than bounding it.** `expect(fired).toBeGreaterThan(mutated / 4)`
would still pass if the report's fire rate halved. The counts are a deterministic function of the
corpus and the projection, so they are now pinned exactly, in the same style as the file's existing
`271 distinct event offsets` pin and the diagnosis file's pinned counts. Both values were re-measured
against this commit and are unchanged from cycle 2 (233 clean events mutated, 103 of which the report
fires on). The comment states which of the two moves for which reason, so a future failure is
diagnosable rather than merely annoying: a wider corpus moves `mutated`, only a change in what the
projection reports moves `fired`.

**Nesting, minimally.** The repeated-vertex helper takes the two innermost `for` levels and the
comparison, exactly the extraction the reviewer named. The sweep axes (fixture, event, delta, ring)
are genuinely orthogonal test dimensions and were left alone; the message now also names the ring
index, which the flattened form makes available for free.

## Build & Test Results

- `pnpm --filter @proc-geo/core exec jest --testPathPatterns="offset-event-boundary-regression|offset-projection|wavefront-causality|near-regular-ring-loss-diagnosis"` — 4 suites, 393 tests, all green.
- `pnpm --filter @proc-geo/core test` — 62 suites, 2679 tests, all green (identical to cycle 2's counts).
- `pnpm --filter @proc-geo/core exec tsc --noEmit` — clean.
- `pnpm build` — clean across all four packages.

No failures were encountered during this cycle; the pinned `233`/`103` were confirmed by running the
gate rather than copied from the prior cycle's comment.

## Open Questions / Risks

- **The pinned counts are drift-sensitive by design.** Adding a fixture to `ALL_TEST_POLYGONS`, or
  any solver change that moves an event offset, will fail `mutated === 233` even though nothing about
  the projection is wrong. That is the sensitivity correctness N2 asked for; the failure message and
  the comment beside it say how to re-measure.
- **`wavefront-measurement-helpers.ts` is not on this task's declared file-ownership list**, although
  it was created under this task in cycle 2 and both reviewers reviewed it as part of it. Correctness
  N1 independently observes that the list is a stale artifact (it names two files with no task-238
  diff at all). Editing it was unavoidable to address decomp N1 — the finding's stated fix is
  consolidating onto that module. Flagging rather than assuming.
- **`placement-helpers.ts` remains untouched**, as does `offset-projection.ts`. Correctness N1 needs
  no code change; it is a request to correct the CHANGED_FILES list upstream, which is outside any
  file I can write.

## Suggested Follow-ups

- Three further suites (`parcel-slicing.test.ts`, `strip-decomposition.test.ts`,
  `near-regular-polygons.test.ts`) still carry ring-area or clearance formulae of their own, tracked
  since cycle 2. Now that `wavefront-measurement-helpers.ts` holds both the stabilised area and the
  two distances, consolidating them is a mechanical change — but each is outside this task's scope.
- The near-regular mirror-event defect that `near-regular-ring-loss-diagnosis.test.ts` pins is still
  live. Decision 1 refuted the terminal-event hypothesis for it; the diagnosis file records the real
  mechanism and is the natural starting point for whoever specifies the fix.
