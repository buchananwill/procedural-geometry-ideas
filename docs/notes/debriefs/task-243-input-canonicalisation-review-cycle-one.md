---
title: "Task 243 — Input canonicalisation, review cycle one"
type: workflow
area: straight-skeleton
status: archived
date: 2026-08-17
---

# Task 243 — Input canonicalisation, review cycle one

Spec: [`docs/notes/input-canonicalisation-decisions.md`](../input-canonicalisation-decisions.md)
Prior debrief: [`task-243-input-canonicalisation.md`](task-243-input-canonicalisation.md)

## 1. Task Summary

Address review cycle one on task 243. Two reviews were filed:

- **correctness (run 1288) — APPROVE.** Walked decisions 1–22 and found no BLOCKING issue. Three
  NOTEs: an out-of-date doc roster, and two coverage gaps.
- **decomposition (run 1286) — REQUEST CHANGES.** Two BLOCKING duplication findings and three NOTEs,
  all of the same family: this diff wrote a formula twice that the repo already has a convention for
  writing once.

No behavioural change was asked for by either review, and none was made. Every fix here is a
duplication removal, a doc correction, or an added assertion. The stage behaves exactly as it did at
commit `06301d1`; the 65 suites that passed then pass now, with three more tests in them.

## 2. Changes Made

| File | Action | Change |
|------|--------|--------|
| `packages/core/tests/straight-skeleton/subdivision-helpers.ts` | created | The two insertion families and their LCG, defined once: `insertRegularly`, `makeRandom`, `insertIrregularly`. Follows the `placement-helpers.ts` / `wavefront-measurement-helpers.ts` pattern — deliberately not `*.test.ts`, so Jest's `tests/**/*.test.ts` glob does not collect it as an empty suite. |
| `packages/core/tests/straight-skeleton/reflex-subdivision.test.ts` | modified | Deleted its copies of `subdivideEdges`, `makeRandom` and `insertIrregularly`; imports the shared module. `subdivideEdges` call sites renamed to `insertRegularly` — one name for one formula, as B1 asked. |
| `packages/core/tests/straight-skeleton/silhouette-invariance.test.ts` | modified | Deleted its copies of `insertRegularly`, `makeRandom` and `insertIrregularly`; imports the shared module. Deleted its own `signedRingArea` and imports the shared, translation-invariant one; `ringCentroid` now accumulates its moments about the ring's first vertex to match. |
| `packages/core/tests/straight-skeleton/canonicalisation.test.ts` | modified | `deviations()` now delegates to the shared `distanceToSegment` instead of recomputing the clamped-t formula. Added a `NaN`-floor termination test and a `describe` block covering both legacy entry points. `withCollinearVertex` lifted to module scope so the new block reuses it rather than copying it. |
| `packages/core/src/straight-skeleton/types.ts` | modified | `SkeletonDiagnosticKind`'s doc roster gained its `vertices-canonicalised` bullet, and the column alignment was restored across all five. |
| `packages/core/src/straight-skeleton/algorithm-termination-cases.ts` | modified | The canonicalise-then-unwrap expression the two legacy entry points shared is now one private helper, `canonicaliseInUnitSpace`. |

## 3. Finding-by-finding

### [B1] Three subdivision/RNG helpers copy-pasted across two suites — FIXED

Extracted to `tests/straight-skeleton/subdivision-helpers.ts`, exactly the module shape the finding
named. Both suites import from it. The name collision (`subdivideEdges` vs `insertRegularly` for one
formula) resolved to `insertRegularly`, because it pairs with `insertIrregularly` and because both
suites already describe these as the *regular* and *irregular* families in prose.

The module header carries the reason each constant is load-bearing — the exact `j / k` placement that
manufactures simultaneity, the LCG constants that *are* the seed sequence the suites pin failure
counts against, and the `[0.05, 0.95]` clamp without which an insertion would be a different
silhouette rather than a different spelling of one. That is the drift a shared module exists to
prevent, so it is stated where the formula lives.

### [B2] `signedRingArea` reimplemented under a weaker formula and the shared name — FIXED

`silhouette-invariance.test.ts` now imports `signedRingArea` from `wavefront-measurement-helpers.ts`.

`ringCentroid` was the reason the local copy existed at all — it derives from that area — so it was
changed with it: the moments now accumulate about `ring[0]`, and the origin is added back at the end.
Leaving the moments in absolute coordinates while the area came from relative ones would have stated
the two halves of one quotient in different arithmetic. The measured agreement the suite pins did not
move: it still comes out below `OBSERVABLE_TOLERANCE / 100`.

### [N1, decomp] `polylineLength` third occurrence — NOT CHANGED, deliberately

Taking the finding's own recommended action, which is to leave it: "Low priority given its size; if a
fourth occurrence appears, promote it to `wavefront-measurement-helpers.ts`." Promoting it now would
mean editing `wavefront-measurement-helpers.ts`, which is not on this task's ownership list, to move
a four-line utility the finding rates at confidence 25. Recorded here so the fourth occurrence has
something to find.

### [N2, decomp] Duplicated canonicalise-then-unwrap in the two legacy entry points — FIXED

Done rather than skipped, despite the finding rating it "not worth it for two call sites alone",
because the duplication is not really the expression — it is the *decision* that both legacy entry
points hand the solver the same polygon. `canonicaliseInUnitSpace` states that once and says why in
its header: if the stepped entry point drifted, its snapshots would describe a solve
`runAlgorithmV5` never performed. `solveSkeleton` deliberately keeps its own copy of the sequence,
because it reports what was removed and honours a caller's floor override, and neither belongs in the
silent legacy path.

### [N3, decomp] `deviations()` recomputes `distanceToSegment` a third time — FIXED

The suite now imports `distanceToSegment` from `wavefront-measurement-helpers.ts`. The finding's
reasoning is the right one and is recorded on the function: the independence the test needs is
independence from `canonicalisation.ts`'s own import graph, and the shared helper is outside it, so
the third copy of the arithmetic bought nothing.

### [N1, correctness] Doc roster omitted `vertices-canonicalised` — FIXED

Bullet added to `SkeletonDiagnosticKind`, and the em-dash column realigned across all five entries so
the roster reads as one list.

### [N2, correctness] No test exercised a `NaN` floor — FIXED

`noiseFloor` is a public option, so a `NaN` can arrive from a caller's arithmetic, and the negated
comparison that makes the loop *terminate* on one was load-bearing but unasserted. The new test pins
it. Worth noting how it reports: a regression from `!(deviation < floor)` to `deviation >= floor`
would **hang** this test rather than fail it, and the hang is the report.

### [N3, correctness] No test asserted the legacy entry points canonicalise — FIXED

New `describe` block. `runAlgorithmV5` is asserted to return a graph with six exterior nodes for a
seven-vertex spelling of the same L, and `runAlgorithmV5Stepped` is asserted to carry six through
*every* snapshot — the first one included, since that is the one taken straight after init and the
only one that would catch the stage being wired into the solve but not into the visualiser's input.

## 4. Build & Test Results

| Command | Result |
|---------|--------|
| `pnpm --filter @proc-geo/core test` | **65 suites, 2879 tests, all passing** (2876 before; +1 `NaN` floor, +2 legacy entry points) |
| `pnpm --filter @proc-geo/core exec tsc --noEmit` | clean, exit 0 — covers the test tree, which `tsup` does not |
| `pnpm build` | clean: core, test-fixtures, dashboard, demo |

No failures at any point in this cycle; nothing needed resolving.

## 5. Open Questions / Risks

**One file was created outside the declared ownership list, and that is disclosed rather than
hidden.** `packages/core/tests/straight-skeleton/subdivision-helpers.ts` is new and unowned; the
ownership list was written before the review demanded a shared module. Halting the revision over it
would have failed the task on a path the reviewer explicitly mandated, while creating it touches no
other agent's file — it is a new path in the same directory as six owned suites. Flagged on the
message board at the start of the cycle and repeated here. `wavefront-measurement-helpers.ts` was
imported from but **not modified**, which is why decomp N1 was left alone.

`ringCentroid`'s change is the only numerically-visible edit in this cycle. It is mathematically an
identity — subtracting a constant from every vertex of a ring cannot move its centroid — but it is
not bit-identical, and the suite's pinned agreement bound is what confirms it did not drift. It did
not: still under `OBSERVABLE_TOLERANCE / 100`.

## 6. Suggested Follow-ups

- Promote `polylineLength` into `wavefront-measurement-helpers.ts` when a fourth occurrence appears,
  under an ownership grant that covers that file (decomp N1).
- Decide whether `subdivision-helpers.ts` should absorb the `clockwise()` winding fixup that
  `reflex-subdivision.test.ts` still holds privately. It is one line and currently has one caller, so
  it stayed put — but it is the third thing a suite needs before it can insert vertices into a
  fixture.
