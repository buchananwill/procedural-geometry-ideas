# Coarse-Scan-Then-Refine Clamp — Design

**Date:** 2026-08-03
**Status:** Draft, awaiting approval
**Scope:** Replace the search inside `clampToValid` so it discovers valid poses in disconnected regions of the step fraction, increasing how much of the user's input delta is accommodated. Signature and call sites unchanged; saturate's freeze-attribution constant re-derived from the new resolution.

## Motivation

The module's governing priorities (design note, opening) are: never produce an invalid pose; otherwise accommodate the
input delta as closely as possible — with validity a property of poses, never paths, and tunnelling explicitly
desirable.

`clampToValid` currently under-delivers on the second priority. Its depth-8 bisection keeps the largest valid fraction
it happens to sample, and over a disconnected valid set (which minimum-distance bounds produce routinely) it commits to
whichever valid island the midpoints land in. A higher universally valid fraction in an unsampled island is silently
lost, and the user gets less of their drag than the constraints permit. The `poseAt(1)` early-accept catches only the
case where the full delta is valid.

## Design

`clampToValid(poseAt, isValid)` keeps its exact signature and contract (returns the elements and fraction of the
largest known-valid pose; `poseAt` deterministic, derived from the base pose scaled by `t`; returns the `t = 0` pose
with fraction 0 when nothing valid is found). Only the search changes, in two phases:

**Phase 1 — descending coarse scan.** Evaluate `t = k / CLAMP_COARSE_SAMPLE_COUNT` for `k` from
`CLAMP_COARSE_SAMPLE_COUNT` down to `0`, stopping at the first valid sample. That sample is the highest valid coarse
fraction; every coarser sample above it is known invalid. `k = CLAMP_COARSE_SAMPLE_COUNT` (i.e. `t = 1`) accepted here
preserves the existing full-delta early-accept, including its endpoint tunnelling. If no sample is valid (the base
pose itself fails), return the `t = 0` pose with fraction 0, as today.

**Phase 2 — upward bisection refinement.** With highest valid sample `k < CLAMP_COARSE_SAMPLE_COUNT`, bisect inside
`[k / N, (k + 1) / N]` to `CLAMP_REFINEMENT_DEPTH`, maintaining the invariant `lowFraction` is known valid and
`highFraction` is known invalid. Return the final `lowFraction` pose.

**Constants** (exported from `clamping.ts`, all powers of two so every sampled fraction is a dyadic rational and
floating-point arithmetic on them is exact):

- `CLAMP_COARSE_SAMPLE_COUNT = 64`
- `CLAMP_REFINEMENT_DEPTH = 6`
- `CLAMP_RESOLUTION = 1 / (CLAMP_COARSE_SAMPLE_COUNT * 2 ** CLAMP_REFINEMENT_DEPTH)` — `2^-12 ≈ 0.000244`

`CLAMP_BISECTION_DEPTH` is removed (breaking change to the core barrel, acceptable pre-1.0). Cost per clamp rises from
at most 9 predicate evaluations to at most 71 (65 descending samples, k = 64 … 0, plus 6 refinement steps); with
six-element chains and at most three clamps per saturate iteration this stays trivially inside a pointer-move frame.

### The attribution invariant (the one subtle coupling)

Saturate translate's freeze attribution asks which boundary predicates fail at
`acceptedFraction + PROBE_LOOKAHEAD_FRACTION`, relying on that expression reproducing the search's known-invalid upper
bound **bit-exactly** so at least one predicate provably fails there. The new search preserves this:

- Phase 2 ends with `highFraction - lowFraction = CLAMP_RESOLUTION` exactly (dyadic arithmetic), and `highFraction`
  was tested invalid.
- Phase 1 always hands Phase 2 a valid bracket: when `k < N`, the sample `(k + 1) / N` was tested and found invalid
  during the descending scan, so refinement starts from a known-valid lower bound and a known-invalid upper bound.

`PROBE_LOOKAHEAD_FRACTION` in `saturate.ts` is redefined as `CLAMP_RESOLUTION` (imported, not a literal). The argmin
fallback tier stays as defensive structure, unreachable as before.

### Behavioural consequences (intended)

- All strategies — rigid and spread included — may now accept a **larger** fraction than before when the valid set is
  disconnected, e.g. a drag that pulls a link through a minimum-distance dip into valid territory beyond it. This is
  mid-search tunnelling, aligned with the stated philosophy; previously only the endpoint (`t = 1`) could tunnel.
- Clamp resolution tightens from `2^-8` to `2^-12` of a step, so clamped poses sit closer to their bounds. Existing
  tests with tolerances derived from the old granularity still pass (finer error is strictly smaller); tests that
  *name* the granularity should switch to `CLAMP_RESOLUTION`.
- No UI change: `appliedFraction` simply reports larger values in the newly-discovered cases.

## Tests

- Unit tests on `clampToValid` with synthetic predicates: monotone valid prefix (parity with old behaviour); valid set
  `[0, 0.1] ∪ [0.6, 0.8]` (must return ≈ 0.8, not ≈ 0.1); all-invalid (fraction 0, base pose); valid only at exactly
  `t = 1`; resolution check (returned fraction within `CLAMP_RESOLUTION` of a known analytic bound).
- End-to-end saturate translate island case: a chain where the old clamp stopped in front of a minimum-distance dip
  and the new clamp lands beyond it; assert the larger `appliedFraction` and global pose validity.
- Attribution invariant fuzz: seeded, over random constrained chains, assert every clamped saturate iteration freezes
  at least one element and the final pose is globally valid (extend the existing fuzz rather than duplicating it).
- Existing suites: update any assertion or helper that names the `1/256` granularity to use `CLAMP_RESOLUTION`;
  re-verify tolerances.

## Housekeeping

- Barrels: replace the `CLAMP_BISECTION_DEPTH` export with the three new constants.
- Design note: the two passages that mention "bisection to a depth of 8" / "found by bisection" get one-line updates
  naming the coarse-scan-then-refine search and its resolution.
- Adversarial review per the established unit protocol before commit.

## Considered alternatives

Any black-box sampling search juggles three quantities: island-detection pitch (set solely by the first layer's
spacing — an island narrower than it can be missed outright, and no later layer can recover it), edge precision within
the chosen bracket, and evaluation budget.

- **Hierarchical linear scans** (layers of pitch `1/k`, `1/k²`, …, ascending fine sweep stopping at the first invalid
  sample). Legitimate — it maintains every invariant this design needs — but dominated twice over: a linear fine layer
  buys factor-`k` precision for up to `k` evaluations where bisection buys factor-2 per single evaluation (driving the
  per-layer base to its optimum of 2 turns the scheme *into* bisection), and stopping at the first invalid sample
  structurally forfeits intra-bracket tunnelling, which bisection gets opportunistically for free. A descending fine
  sweep would keep tunnelling but pays full `k` every time.
- **Galloping refinement** (doubling strides up from the accepted coarse sample, then bisecting the final stride).
  Beats plain bisection on expected cost when the true edge sits just above a coarse sample; worst case still
  logarithmic. Immaterial at this module's budgets; the right upgrade if chains ever grow by orders of magnitude.
- **Analytic interval computation.** For translation, every constraint boundary is a low-degree equation in `t`
  (distances quadratic; joint-angle bounds reduce to linear equations via cross/dot products), so the valid set is
  exactly computable and the largest universally valid `t` needs no sampling at all; rotation is sinusoidal but
  tractable. Rejected for now because the black-box predicate is what lets future constraint types plug in without a
  per-constraint solver — this is the endpoint of the efficiency curve if real performance needs ever appear.

## Out of scope

- Path-continuity ("no-tunnelling") clamp modes — explicitly contrary to the module's stated philosophy.
- Adaptive or constraint-aware sampling (analytically locating dip edges); revisit only if profiling ever shows the
  fixed scan mattering.
- Any UI or store change.
