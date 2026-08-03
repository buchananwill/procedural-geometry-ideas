# Invalid-Pose Recovery — Design

**Date:** 2026-08-03
**Status:** Approved bug fix (user-reported)
**Scope:** Replace the absolute-validity clamp predicates with non-worsening predicates relative to the solve's base pose, so an operation beginning from an invalid pose can move — and recover — instead of being wholly declined.

## The bug

When any constraint is violated in the starting pose (e.g. an element begins further from a neighbour than its
maximum separation, typically after editing constraints under an existing pose), the strategies' clamps evaluate
absolute validity (`isPoseValid`), so no candidate fraction is ever acceptable and every input delta is declined
(`appliedFraction = 0`). Confirmed by probe:

- A drag that fully repairs the violation works (the endpoint is absolutely valid).
- A drag that improves but does not fully repair the violation is declined entirely.
- A benign drag elsewhere in the chain is declined because of an unrelated violation it does not touch.
- Saturate translate freezes a violated boundary element at zero motion instead of letting it recover.

## Design

### Violation measures (validity.ts)

- `linkDistanceViolation(elements, constraints, lowerLinkIndex): number` — how far the link's length falls outside
  the intersection of both endpoints' bounds: `max(0, min − d, d − max)` per enabled bound, maximum over the two
  endpoints' entries; `0` when unconstrained.
- `jointAngleViolation(elements, constraints, index): number` — same shape for the joint-angle bound; `0` when
  unconstrained or the angle is degenerate (null), preserving the existing PAKNIB stance on degenerate angles.

The existing boolean helpers (`linkDistanceHolds`, `jointAngleHolds`, `isPoseValid`) remain — validity of the data is
still a meaningful public concept — and are reimplemented as "violation ≤ ARTICULATION_EPSILON" so there is exactly
one copy of the bound arithmetic.

### Non-worsening predicates

`isPoseNoWorse(basePose, candidatePose, constraints): boolean` — true iff, for every link and every joint, the
candidate's violation is at most the base pose's violation plus `ARTICULATION_EPSILON`. For a base pose that is
strictly valid this is exactly today's `isPoseValid` tolerance; the two coincide whenever the base is valid, which is
what makes this change regression-free for the normal case.

Strategy clamps switch from absolute to non-worsening, each relative to its own base:

- **Rigid** and **spread** (both delta kinds): predicate relative to `chain.elements` (the solve's base pose). Base
  violations are computed once per solve, not per candidate.
- **Saturate rotate**: each cascade iteration's predicate is relative to that iteration's base pose (`out`).
- **Saturate translate**: `boundaryPairIsSatisfied` becomes a per-pair non-worsening check — the pair's link-distance
  violation and both endpoint joint-angle violations compared against the iteration base. The conjunction clamp,
  probe, and lookahead attribution all reuse it, so freeze attribution naturally becomes "which pair would *worsen*
  just past the accepted fraction". The perturbation soundness argument is unchanged (the same constraints are the
  only ones the motion can affect; comparing violations instead of testing bounds does not alter the set).

Because the dashboard re-solves every pointer move from the drag-origin pose, violations can only shrink or hold
relative to the gesture's origin; each released gesture then becomes the next one's base, so repeated gestures ratchet
toward validity and can never regress it.

### Philosophy amendment

The design note's opening priorities say the solver must never produce an invalid pose — impossible to honour from an
invalid start. Amend with one clause: from a valid pose the solver must never produce an invalid one; from an invalid
pose it must never worsen any constraint's violation, and must permit deltas that reduce them (recovery).

## Tests

- The four probe scenarios as named tests (partial recovery applies fully; unrelated violation does not block benign
  motion; full recovery still reaches validity; saturate boundary recovers instead of freezing at zero).
- Non-worsening property fuzz: extend the existing seeded fuzz to run a portion of trials from deliberately invalid
  starting poses, asserting every constraint's violation in the result is at most its starting violation plus
  epsilon, and that valid-start trials still end valid (the old invariant, now a corollary).
- Violation-measure unit tests: zero when unconstrained/within bounds; correct magnitude outside min and max;
  endpoint-intersection semantics (tighter of the two endpoints' bounds governs).

## Out of scope

- Reporting which constraints are violated to the UI (candidate for the SolveResult reporting unit).
- Auto-repair (the solver only moves where the user drags; it does not seek validity on its own).
