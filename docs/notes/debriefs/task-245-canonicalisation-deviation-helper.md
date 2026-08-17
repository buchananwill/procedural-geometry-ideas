# Debrief 0001 — Canonicalisation deviation helper (task 245, revision cycle 2)

## Task Summary

Task 245, "Access run provenance and the Region type", against
`docs/notes/access-run-provenance-decisions.md`. This is a revision pass: the implementation
itself landed in commits `392e4b9` and `f88c519` and was reviewed in cycle 1. My job this pass
was to address the review findings from reviewRuns 1295 (decomposition) and 1296 (correctness),
not to add new behaviour.

Review outcome going in:

- reviewRun 1296 (correctness): **APPROVE**, 0 BLOCKING, 1 NOTE.
- reviewRun 1295 (decomposition): **REQUEST CHANGES**, 1 BLOCKING (`B1`), 1 NOTE.

So there was exactly one BLOCKING finding to clear, and it was a DRY finding rather than a
behaviour-fidelity finding.

## Changes Made

- **`packages/core/src/straight-skeleton/canonicalisation.ts`** — modified. Extracted a
  file-local `deviationAt(ring, index)` helper holding the single spelling of "perpendicular
  deviation of `ring[index]` from the chord between its cyclic neighbours", including the
  wraparound index arithmetic and the `distanceToSegment` call. Rewired both existing call
  sites — `countPinnedUnderFloor` and `findWeakestVertex` — to call it.

No other file was touched. No test file changed. No behaviour changed.

## Design Decisions

**B1 (BLOCKING, dry-violation) — resolved exactly as the reviewer's suggested fix specified.**
The reviewer proposed a file-local helper with the signature
`deviationAt(ring: readonly Vector2[], index: number): number`; I took that signature verbatim
rather than inventing a variant. The helper carries a short doc comment explaining *why* the
formula is centralised — the module header records that deviation-from-chord was deliberately
chosen over turn-angle, and that decision having been argued once is precisely the reason two
hand-maintained copies of the predicate were the defect.

This is a pure extraction. `findWeakestVertex` still returns the lowest-index tie-break and
still skips pinned vertices as candidates while keeping them as neighbours; `countPinnedUnderFloor`
still measures on the returned ring and still counts nothing under a `NaN` floor, because the
strict `<` comparison is unchanged and now lives in the caller, not the helper. I deliberately
did *not* move the `< noiseFloor` comparison into `deviationAt` — the two callers compare the
deviation for different purposes (search minimum vs. floor tally), and folding the comparison in
would have widened the helper's remit beyond the duplicated formula.

Placement: `deviationAt` is declared between `countPinnedUnderFloor` and `findWeakestVertex`,
adjacent to both users. Function declarations hoist, so the forward reference from
`countPinnedUnderFloor` is well-defined.

**Note dispositions.** The task brief says NOTE findings are to be addressed as well. Both NOTEs
in this cycle are reviewer-stated no-action items, and in both cases the reviewer named the
condition under which action *would* become correct. I have taken them as deferrals rather than
as work, and I record the reasoning here rather than acting silently:

- **1295 N1** (`assertEdgeIndex` in `region.ts` vs. `validatePinnedIndices` in
  `canonicalisation.ts`, confidence 25) — the reviewer classified this as shape duplication, not
  formula duplication, and wrote "No action required... not requesting action this cycle",
  identifying the trigger for extraction as a *third* near-identical validator appearing in
  `straight-skeleton/`. I agree with the classification: the two validators guard different index
  spaces (a region's edge index, a polygon's vertex index for pinning) and their error messages
  are written for different audiences on purpose — collapsing them today would trade two legible
  three-line functions for a cross-module dependency and a genericised message that tells the
  caller less. Acting on it now would also have put me outside my declared file ownership in the
  direction of `core-functions.ts`, which the reviewer floated as the eventual home.
- **1296 N1** (`remapRuns` does not itself assert its output is a partition, confidence 15) — the
  reviewer explicitly recorded this as "a deliberate API shape, not an oversight" and directed
  the awareness at the recursion-driver task, which will be the first production caller composing
  `assertRunPartition(remapRuns(...))`. Making `remapRuns` self-asserting would be a behaviour
  change to a function the correctness reviewer approved against the spec, so I have left it and
  carried the flag forward under Suggested Follow-ups instead.

**Why no new test.** The test-first rule binds behavioural change. This commit contains none: it
is a mechanical extraction with byte-identical arithmetic at both call sites. The behaviour that
`deviationAt` now carries is already convicted by the existing suite — `findWeakestVertex` through
the removal/fixed-point and tie-break tests, and `countPinnedUnderFloor` through the
`pinnedUnderFloorCount` tests including the `LANE_MOUTH` under-floor-pin case at
`0.3 * SKELETON_NOISE_FLOOR`. Adding a direct unit test for the helper would require exporting a
private function purely for a test to reach, which the production-code rule forbids. If the
extraction had been wrong, those existing tests would have caught it; they were run and passed.

## Build & Test Results

- `pnpm install --frozen-lockfile` — clean, lockfile honoured, no rewrite.
- `pnpm --filter @proc-geo/core test` — **PASS**. 67 suites, 3403 tests, 3403 passed, 0 failed.
  Same totals as the correctness reviewer measured on the pre-revision tree, which is the result
  a behaviour-neutral extraction should produce.
- `pnpm build` — **SUCCESS**. All four packages built in dependency order (core →
  test-fixtures → dashboard → demo); the demo's Next.js build emitted all seven routes. No
  errors or warnings on a grep of the full output.
- No lint run: this change touches neither `packages/dashboard/` nor `apps/demo/`.
- No build or test failures occurred, so there were no retries to report.

## Open Questions / Risks

- Low risk overall. The change is confined to one file, is a straight extraction, and the full
  suite result is unchanged in both count and composition.
- The one thing worth a human eye: `deviationAt` takes `origins`-free indices — it indexes the
  *current* ring, not the input ring. Both callers already worked in current-ring index space and
  map through `origins` only to test pin membership, so this is consistent, but a future caller
  that has an input-space index must remap before calling. The helper's doc comment says "ring",
  not "polygon", to make that explicit.

## Suggested Follow-ups

- Carry 1296's N1 into the recursion-driver task: that task will be the first production code to
  compose `remapRuns` with `assertRunPartition`, and should assert rather than trust.
- Keep 1295's N1 on file: if a third `[0, count)` integer validator appears under
  `straight-skeleton/`, extract a shared `assertIntegerInRange` into `core-functions.ts`
  alongside `assertIsNumber` and fold all three in at once.
- Spec decision 8 remains deliberately unfinished by design: `solveSkeleton` does not yet forward
  `pinnedIndices`. The correctness reviewer confirmed this is correctly deferred to the
  recursion-driver task per §3, and it should be picked up there rather than retrofitted here.
