---
title: "Debrief 0001 — Exact normalisation round trip via a power-of-two scale"
type: workflow
area: straight-skeleton
status: archived
date: 2026-08-16
---

# Debrief 0001 — Exact normalisation round trip via a power-of-two scale

Task 236 · spec `docs/notes/normalisation-exact-round-trip-decisions.md` · cycle 0

## 1. Task Summary

Change the solver's unit-extent normalisation so it scales by the power of two NEAREST the longest
bounding-box side rather than by the side itself, making `normalise` → `denormalise` bit-exactly
invertible in its scaling instead of merely accurate. Decisions 1–7 govern the transform and its
guards; 8–11 are the verification gate. Working scope was three files:
`packages/core/src/straight-skeleton/normalisation.ts`,
`packages/core/tests/straight-skeleton/normalisation.test.ts`,
`packages/core/tests/straight-skeleton/large-coordinate-failures.test.ts`.

Git log showed no prior plan or partial work for this task — greenfield. This debrief doubles as the
committed recovery baseline; the work is small enough to be one checkpoint.

## 2. Changes Made

**`packages/core/src/straight-skeleton/normalisation.ts`** (modified)

- `makeSkeletonNormalisation` now derives `exponent = Math.round(Math.log2(longestSide))` and returns
  `toUnitScale: 2 ** -exponent`, `fromUnitScale: 2 ** exponent` — each computed from the exponent
  directly, so the two are exact reciprocals by construction rather than by division (decision 1).
- Added module-private `MIN_EXACT_SCALE_EXPONENT = -1022` / `MAX_EXACT_SCALE_EXPONENT = 1022`, the
  range in which BOTH `2 ** e` and `2 ** -e` are normal doubles. Outside it the transform falls back
  to `identityNormalisation`, flagged with `degenerateExtent`, exactly as a degenerate extent is
  (decision 6). The ceiling is 1022, not 1023, because `2 ** -1023` is subnormal.
- The existing degeneracy guard is untouched and still runs first, so `Math.log2` can never see a
  zero, a subnormal, an infinity or a NaN (decision 5).
- Header extended, not rewritten (retirement clause): the "what scales and what does not" enumeration
  is unchanged; added the power-of-two rule, the `[1/sqrt(2), sqrt(2)]` extent bound and its worked
  example, the exponent clamp, and an honest restatement of the round trip — exact in the SCALING
  unconditionally, exact in the CENTRING only inside Sterbenz range (decision 4). The
  "ROUND-TRIPPING IS NOT BIT-EXACT" paragraph is now false as written and was replaced by that
  honest statement; nothing else in the header was removed. The "no vertex further than 0.5 from the
  centre" claim became `1/sqrt(2)`, which is what the new scale actually guarantees.
- `SkeletonNormalisation` field docs updated: shape unchanged, `degenerateExtent` now documents both
  causes.

**`packages/core/tests/straight-skeleton/normalisation.test.ts`** (modified)

- Updated every assertion that pinned a non-power-of-two scale: 40→32, 80→64, 200→256, 400→512, and
  the derived length/area figures. The "longest side, not the diagonal" test still discriminates,
  because 40 and 50 round to different powers of two (32 vs 64).
- Coordinate bound test relaxed from `0.5` to `Math.SQRT1_2`, with the reason stated inline.
- New block *the scale is a power of two*: nearest-power-of-two scale with the spec's 300/256/150
  worked example; exact reciprocity in both orders over the corpus; both scales are exact powers of
  two; normalised extent inside `[1/sqrt(2), sqrt(2)]` over the corpus plus a contrived span sweep;
  the `Math.round` tie at `2 ** 2.5` (decision 7).
- New guard tests: `2 ** 1023` extent rejected because its reciprocal is subnormal; `2 ** 1022`
  accepted; a side of `1.5 * 2 ** 1022` rejected because the EXPONENT rounds up past the ceiling.
- New block *the round trip is BIT-EXACT* (decision 8): round-trips every fixture at every placement
  of the operating-envelope sweep — translate 0…1e11 and scale 1e-6…1e8 — asserting `Object.is` per
  coordinate where exact, and pinning the achieved error where not. Plus a test isolating the
  scaling from the centring, and one showing 25 of 300 integer offsets fail to return under a
  /300 scale while all 300 return under /256.

**`packages/core/tests/straight-skeleton/large-coordinate-failures.test.ts`** (modified)

- Header carries the re-measured full envelope table under the new scale (decision 9).
- Header records the canary figures, and a new test pins them (decision 10).

## 3. Design Decisions

- **Both clamp bounds are checked, though only the ceiling is reachable.** With the degeneracy guard
  ahead of it, `Math.log2(longestSide) >= -1022` always, so `Math.round` cannot produce an exponent
  below the floor. Decision 6 asks for the range where both directions stay normal, so both bounds
  are present; the floor's unreachability is documented at the constant rather than left as a puzzle.
- **The exponent, not the side, is what the ceiling rejects.** A side of `1.5 * 2 ** 1022` is finite
  and normal but rounds to exponent 1023, so it is rejected. Covered by its own test.
- **Where a regime is not bit-exact, the test pins a per-cell inexact COUNT as an upper bound and a
  worst relative error, rather than an exact count.** A cell that improves passes; a cell that
  regresses fails — the same philosophy decision 9 applies to the envelope table.
- **The tie test compares to within an ulp, not on the bit.** The double nearest `2 ** 2.5` is itself
  an ulp below the real value, so `side / 8` is an ulp below `Math.SQRT1_2`. That slack is the
  representation of the tie, not slack in the bound, and is stated inline.

## 4. Build & Test Results

`pnpm build` — SUCCESS (core, test-fixtures, dashboard, demo; no errors or warnings).

`pnpm --filter @proc-geo/core test` — run twice, **identical failure sets** (decision 11):

| run | suites | tests | failed |
|-----|--------|-------|--------|
| baseline (HEAD, stashed change) | 61 passed / 61 | 2637 passed / 2637 | 0 |
| this change, run 1 | 59 passed, 2 failed / 61 | 2663 passed / 2665 | 2 |
| this change, run 2 | 59 passed, 2 failed / 61 | 2663 passed / 2665 | 2 |

The spec's stated baseline of "58 suites and 2599 tests" is stale; the tree stands at 61 and 2637
before this change and 2665 after (+28 from the new bit-exactness and guard tests). Reported as
measured, per decision 11.

### Decision 9 — the full envelope, re-measured, no cell regressing

All 37 `ALL_TEST_POLYGONS` through solve + offset ring at 50% of max + strips at the same depth.

```
translate      0    1e3    1e4    1e5    1e6    1e7    1e8    1e9   1e10   1e11
power-of-two  37     37     37     37     37     37     37     37     37     37

scale       1e-6   1e-4   1e-2      1    1e2    1e4    1e6    1e8
power-of-two  37     37     37     37     37     37     37     37

translate      0    1e4    1e5    1e6    1e7    1e8       (world-space, scale 50)
power-of-two  37     37     37     37     37     37
```

Every cell is 37 of 37. Not one cell moved from the pre-change table.

### Decision 10 — the `BROKEN_POLYGON` @ 1e8 canary

| | scale used | native | @ 1e8 | gap |
|---|---|---|---|---|
| before | 461 (the longest side) | 126.63015964243039 | 126.630159636494 | 5.936385605309624e-9 |
| after | 512 (nearest power of two) | 126.63015964243037 | 126.630159636494 | 5.936371394454909e-9 |

The @1e8 figure is unmoved bit for bit; the native figure moved by 1.4e-14 and the gap **closed** by
the same amount. The canary moved towards native, which is the required direction. Both figures are
pinned in `large-coordinate-failures.test.ts`. (The spec quotes native as 126.63015964243034; the
tree measures ...037 after and ...039 before. Reported as measured.)

### Decision 11 — the two failures, and why they are not in my scope to change

Both failures are deterministic across runs and both are in files **outside my declared file
ownership**. I did not touch them.

1. `reflex-subdivision.test.ts` › *solves the plus subdivided 9 times per edge*. Was passing.
2. `stroke-derived-polygons.test.ts` › *still loses the reflex L-shape at some subdivisions*: the
   pinned failing-subdivision list `[4, 7, 8, 9, 10]` gains `6`.

Both live in the exact-simultaneity regime those files document at length: exactly-subdivided edges
manufacture several ring-partitioning events landing in one offset layer. Evidence that this is the
knife edge shifting rather than a new defect:

- The failure is **signalled**, not silent — `step-failure: Unable to play interior edge 279 in any
  span` plus `unresolved-edges`. No wrong-but-complete result.
- **Which k fails is a function of the arithmetic, not of the shape.** Rescaling the same plus so its
  span is exactly 256 — i.e. so the new scale reproduces an extent of exactly 1 — moves the failure
  from k=9 to k=10. The membership of the failing set shuffles under any perturbation; the set's
  size does not grow.
- The reflex-L failing set inside `reflex-subdivision.test.ts` is unchanged at `[5, 6, 8, 10]`.
- This is the same class as the `inEdges` ordering instability the spec's Deferred section names —
  "if a test fails on `inEdges` order, that is the pre-existing instability surfacing and it is a
  finding to report, not a defect to fix here" — but on a different observable, so I am reporting it
  rather than assuming the clause covers it.

The mechanism is decision 3 operating as specified: the normalised extent is now up to sqrt(2) from
unity, so the absolute `FLOATING_POINT_EPSILON` is up to 17% tighter relative to this fixture (span
300, scaled by 256) than it was under a scale of 300. Events that the tolerance used to merge now
separate. That is inherent to decisions 1 and 3 and cannot be removed without abandoning them.

Escalated on `general` rather than resolved, because re-pinning those two suites means editing files
outside my scope.

## 5. Open Questions / Risks

- **Who re-pins the two suites.** `reflex-subdivision.test.ts` states "a regression here is a bug"
  for the plus fixture, so an owner of that file must decide whether to re-pin k=9 as a known
  failure or to treat the boundary shift as unacceptable. I have not edited it.
- **The spec's 147/300 illustration is wrong.** Decision 3 claims `147 / 300` does not round-trip; in
  IEEE-754 doubles `(147 / 300) * 300 === 147`. 21 is the first integer under 300 that genuinely
  fails, and 25 of the 300 fail. The property being illustrated is real and the decision is
  unaffected, so I implemented as specified and used a genuine witness in the test, noting the
  discrepancy inline.
- **Native figures for the canary differ from the spec's quoted value in the last two digits**
  (...037 / ...039 here versus ...034 in the spec). Likely a different measurement environment; the
  direction-of-travel gate that decision 10 actually asks for is met either way.
- The `MIN_EXACT_SCALE_EXPONENT` branch is unreachable given the guard above it, so it carries no
  test that reaches the fallback through it; the reachable ceiling is tested three ways.

## 6. Suggested Follow-ups

- Re-pin or re-examine the two subdivision suites above (out of scope here).
- The deferred item from the spec still stands: threading the transform into the solver context so
  assertions report caller-space coordinates.
- Sorting `inEdges` where it is built, likewise deferred and likewise perturbed by this change.

---

**SUPERSEDED IN PART by `debrief-0002-normalisation-review-cycle-one.md`.** Section 4's "Decision
11 — the two failures" attributes both to the tightened effective epsilon from the `[1/sqrt(2),
sqrt(2)]` extent band. That diagnosis is WRONG and is withdrawn: taking the exponent by `Math.ceil`
(extent `<= 1`, epsilon relatively looser) reproduces both failures identically. The cause is that
the old scale was exactly the fixtures' 300-unit span and so preserved uniform subdivision spacing
bit-exactly in unit space, which no power of two can. Both failures are resolved in cycle 1.
Everything else in this debrief stands.
