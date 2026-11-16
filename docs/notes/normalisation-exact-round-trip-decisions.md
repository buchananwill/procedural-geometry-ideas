---
title: "Exact Normalisation Round Trip: Fixed Design Decisions"
type: decision-spec
area: straight-skeleton
status: completed
date: 2026-08-16
part_of: [recursive-skeleton-subdivision.md]
verified_by: [packages/core/tests/straight-skeleton/normalisation.test.ts, packages/core/tests/straight-skeleton/large-coordinate-failures.test.ts]
---

# Exact normalisation round trip

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

One number changes: the factor the solver's unit-extent normalisation scales by. It becomes a power
of two instead of the bounding box's longest side, which makes normalise-then-denormalise **bit-exactly
invertible** rather than merely accurate. The polygon still lands within a factor of √2 of unit
extent, so every tolerance argument the existing normalisation rests on is untouched.

This is a two-line change with a full-envelope measurement gate. It is dispatched on its own precisely
because it moves the floating-point pass/fail boundary, and a boundary move bundled with anything else
is a boundary move nobody can attribute.

**Why it is worth doing at all, given the current error is 3.2e-14.** A single solve absorbs that
happily. The recursive subdivision arc this repo is building crosses the normalisation seam **once per
level per sub-region**, and asserts a tiling identity at every level against that level's own input. A
round-trip error that is invisible in one solve is injected at every level boundary and compounds
through the tree. The downstream C++ port has no recursion and so had no reason to want this.

## 1. Type Roster

**[normalisation.ts](../../packages/core/src/straight-skeleton/normalisation.ts)**

- `makeSkeletonNormalisation` — behaviour changes, signature unchanged: `(vertices: readonly Vector2[]) => SkeletonNormalisation`.
- `SkeletonNormalisation` — shape unchanged. `toUnitScale` and `fromUnitScale` become exact reciprocal powers of two.
- `SMALLEST_NORMAL_DOUBLE` — unchanged and still the degeneracy threshold.
- New module-private exponent clamp bounds, per decision 6.

Nothing else in the package changes. No call site moves, no export is added or removed.

## 2. Decisions / Specification

### The scale

1. **The scale factor is `2 ** Math.round(Math.log2(longestSide))`, not `longestSide`.** `toUnitScale`
   is `2 ** -exponent` and `fromUnitScale` is `2 ** exponent`, computed from the exponent directly so
   the two are exact reciprocals rather than one being derived by dividing into the other.

2. **The reason is exactness, not speed.** Multiplying or dividing a finite double by a power of two
   adjusts the exponent field and leaves the mantissa untouched, so it is exact in IEEE-754 provided
   the result neither overflows nor falls subnormal. Scaling by an arbitrary `1 / longestSide` rounds
   the mantissa twice — once going in, once coming out — and the two roundings do not cancel.

3. **Normalised extent lands in `[1/√2, √2]`, and that bound is what preserves every existing
   tolerance argument.** Writing `longestSide = 2 ** (e + d)` with `d` in `[-0.5, 0.5]` by
   construction of `Math.round`, the normalised extent is `2 ** d`. The solver therefore still never
   sees a magnitude it was not designed for, which is the entire justification the existing
   normalisation rests on.

   **Worked example.** A 300-unit fixture: `log2(300) = 8.2288…`, rounds to `8`, so the scale is
   `256` and the normalised extent is `300 / 256 = 1.171875`. A vertex offset of `150` from centre
   becomes `150 / 256 = 0.5859375` — exact, terminating in binary — and multiplying by `256` returns
   `150` bit-for-bit. Under the current scale, `150 / 300 = 0.5` happens to round-trip, but
   `147 / 300 = 0.49` does not.

4. **The centring subtraction is exact in the regime that matters, and this decision does NOT claim it
   is exact universally.** By the Sterbenz lemma `p - c` is exact whenever `c / 2 <= p <= 2c`, which
   holds comfortably for a polygon translated away from the origin — a 300-unit span at 1e8 puts every
   vertex within a whisker of the centre. Near the origin, where the span is comparable to the
   coordinates themselves, the subtraction can round and the round trip is then exact in the scaling
   but not in the centring. **State this honestly in the module header rather than claiming a stronger
   invariant than holds**, and let the test in decision 8 record exactly which regimes achieve
   bit-equality.

### Guards

5. **The existing degeneracy guard runs first and is unchanged.** `longestSide` must still be finite
   and at least `SMALLEST_NORMAL_DOUBLE`, and a failing extent still yields an identity scale with the
   centring translation applied and `degenerateExtent` set. `Math.log2` is only ever reached on a
   value that has already passed that guard, so it can neither see zero nor a subnormal nor a NaN.

6. **The exponent is clamped so that BOTH `2 ** exponent` and `2 ** -exponent` are normal doubles.**
   This is the one new failure mode the change introduces and it is easy to miss: an enormous polygon
   gives a large positive exponent, and `2 ** -exponent` then falls subnormal — at which point
   multiplying by it loses mantissa bits and the exactness this whole change exists for is gone,
   silently. Clamp to the range where both directions stay normal and fall back to the identity
   normalisation outside it, flagged the same way a degenerate extent is.

7. **`Math.round` is used as specified and its half-way behaviour is not worked around.** It rounds
   `.5` toward `+Infinity`, which is deterministic and reproducible; the choice of neighbouring power
   of two at an exact half-way point has no consequence, because both satisfy decision 3's bound.

### Verification

8. **A bit-exactness test is the invariant this task exists to establish**, and it must assert exact
   equality rather than closeness. Round-trip every fixture through `normalisePolygon` and back at each
   placement in the existing sweep, and assert `Object.is` equality on each coordinate for the regimes
   decision 4 says are exact. Where a regime is not exact, pin the achieved error rather than skipping
   it — a test that quietly excludes the hard case is not a gate.

9. **The acceptance gate is the FULL translation and scale envelope, re-measured, with no cell
   regressing.** The envelope currently stands at 37 of 37 `ALL_TEST_POLYGONS` solving with rings and
   strips at every translate from native to 1e11 and every scale from 1e-6 to 1e8. **Reproduce that
   table and report it in full.** A cell that improves is a bonus; a cell that regresses fails the
   task, and reporting the table only in summary form defeats its purpose.

10. **`BROKEN_POLYGON` at translate 1e8 is the named regression canary.** It currently returns a max
    offset of `126.630159636494` against a native `126.63015964243034`, having reported
    `308.9784380383704` before normalisation landed. Report its value under the new scale. **It should
    move closer to the native figure, not further** — this change exists to remove round-trip error,
    so a canary drifting away from native means decision 1 has been implemented as an approximation
    somewhere.

11. **Run the full suite twice and intersect the failure sets.** It stands at 58 suites and 2599 tests.
    Report the actual counts rather than the expected ones; a count that moves without a stated reason
    is itself a finding.

## 3. Deferred (explicitly out of scope)

- **Threading the transform into the solver context so assertions report caller-space coordinates.** A
  real debuggability papercut, recorded upstream and here, and not this task.
- **Sorting `inEdges` where it is built.** Its order is unstable under any arithmetic perturbation — 21
  of 37 fixtures reorder at native placement with identical sets — and this change perturbs arithmetic.
  **If a test fails on `inEdges` order, that is the pre-existing instability surfacing and it is a
  finding to report, not a defect to fix here.**
- **Validating non-finite input vertices at the entry points.** A lone NaN vertex is invisible to the
  bounding-box scan because every comparison against it is false, and it travels into the solve intact.
  Out of scope; the guard belongs at the entry points and is tracked separately.
- **Revisiting the absolute epsilon itself.** Unchanged, as always.

## 4. Retirement

Nothing is deleted. The header's existing note on what scales and what does not remains correct in
full and must be **extended** rather than rewritten: the enumeration is unaffected, and what is added
is the exactness property and its limits under decision 4.
