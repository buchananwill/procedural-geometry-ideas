# Task 241 — Review cycle one: canonicalised node-offset table

## Task Summary

Revision pass over commit `e30577a` ("Canonicalise the node-offset table for simultaneous mirror
events"), against reviews `1280` (decomposition) and `1281` (correctness) of cycle 0.

Both reviewers returned **APPROVE with zero BLOCKING findings**. Four NOTE findings were raised;
this pass addresses the three that call for a code change and records the reasoning for the one
whose stated fix is "no action required". No behavioural decision from
`docs/notes/simultaneous-mirror-events-decisions.md` was reopened — decisions 1–13 are delivered
exactly as they were at `e30577a`, and nothing in this pass touches a comparison, a tolerance the
production code reads, or the table's contents.

## Changes Made

### `packages/core/src/straight-skeleton/offset-projection.ts`

- Added module-private `largestOffset(offsets: Iterable<number>): number` and routed all three
  copies of the manual max-finding loop through it: `canonicaliseSimultaneousOffsets` (the instance
  this task introduced), `computeMaxOffset`, and `projectWavefront`. Addresses decomp **N1**.
  Behaviour identical — the extracted function is the same loop with the same zero floor, and the
  zero floor's meaning (offsets are distances, so it is only ever the empty case) is now stated
  once in its doc rather than implied three times.

### `packages/core/tests/straight-skeleton/near-regular-ring-loss-diagnosis.test.ts`

- Replaced the absolute `SIMULTANEITY_BAND = 1e-12` with two **relative** bands, each scaled by the
  solve's own maximum offset, addressing correctness **N2**:
  - `SIMULTANEITY_RELATIVE_BAND = 1e-12` — the band production canonicalises within. Used by the
    "leaves no ulp-separated pair of event offsets" assertion, which is the one the finding named.
    These fixtures' maximum offsets are 88.7–106.9, so the old absolute band asked for roughly a
    hundredth of what production guarantees; the assertion is now ~100x **stronger** and states the
    same quantity as the sibling assertion in `offset-projection.test.ts`.
  - `WITHIN_INSTANT_RELATIVE_SPREAD = 1e-14` — the measured within-instant spread bound. Used by
    the "raw offsets disagree in the last bits and no further" assertion.

### `packages/core/tests/straight-skeleton/offset-event-boundary-regression.test.ts`

- Added `EventSample`, `EventFilter`, the three named filters (`EVERY_EVENT`, `MID_SOLVE_EVENT`,
  `EVENT_CLEAR_OF_MAXIMUM`) and the `eventSamples` generator; rewrote five sweeps to consume it.
  Addresses decomp **N2**. The flagged four-deep sweep ("reports no unclosed chain at, or either
  side of, any event of any fixture") is now two levels, and so are the four other sweeps that were
  walking the identical fixture → event → delta nest.

## Design Decisions

**Why the spread assertion is not scaled by the canonicalisation band.** Making both near-regular
bands `1e-12` relative would have loosened the spread assertion by ~240x. That assertion exists to
catch a set that swallowed a genuinely distinct event, and a swallowed event is by construction
inside the band that swallowed it — so the band cannot detect the thing the assertion is for. It is
therefore asserted against a measurement instead, per the project's test-format rule that a spec's
measured bound beats an invented looser one. Measured on this file's own derivation
(`rawOffsetsOfNode`, which dates a node against *every* parent edge of every incident bisector,
where `computeNodeOffsets` reads only the first, hence wider than the bound recorded against
`SIMULTANEITY_RELATIVE_TOLERANCE`):

| fixture                 | maxOffset | widest spread | relative |
|-------------------------|-----------|---------------|----------|
| Near Regular Ellipse 16 | 99.132    | 7.105e-14     | 7.17e-16 |
| Near Regular Ellipse 32 | 99.785    | 1.705e-13     | 1.71e-15 |
| Near Regular Rosette5 40| 88.670    | 3.695e-13     | 4.17e-15 |
| Near Regular Peanut 32  | 106.940   | 1.279e-13     | 1.20e-15 |

Worst is 4.17e-15 against a bound of 1e-14 — the same ~2.4x margin the previous absolute band
carried on the worst fixture, so the assertion is no more brittle than it was and is now
scale-invariant. The narrowest gap between *distinct* events on these fixtures is 3.54e-4 relative
(Peanut 32), eleven orders above the bound, so the assertion still discriminates by a wide margin.

**Why `eventSamples` throws on an empty enumeration.** Every sweep it feeds asserts that a list of
problems came out empty, which an empty population satisfies just as well as a sound projection
does. Collapsing five hand-written walks into one shared enumeration concentrates that risk in one
function, so the function refuses to be vacuous. Verified live by mutation: forcing `EVERY_EVENT`
to `() => false` fails the two sweeps that use it with `eventSamples enumerated nothing`, and the
mutation was then reverted (`git diff --stat` confirmed the file back to the intended edit).

**Correctness N1 — deliberately no code change.** The finding records that `computeMaxOffset` can
sit up to `maxOffset * SIMULTANEITY_RELATIVE_TOLERANCE` below the largest raw re-derivation, because
the top simultaneous set collapses onto its nearest-to-mean member rather than its maximum. The
reviewer's stated fix is "no action required — flagged for visibility only", and acting on it would
mean either taking the max of a set (breaking decision 4's deterministic nearest-to-mean rule) or
reading an uncanonicalised value into a quantity the projection compares against (breaking decision
1). The drift is bounded at ~1e-10 absolute on this corpus, four orders below the `TERMINAL_BAND`
that governs behaviour near the maximum. Left as documented behaviour.

## Build & Test Results

- `pnpm --filter @proc-geo/core test` — **63 suites, 2734 tests, all passing**. Identical counts to
  the cycle-0 commit, and every pinned measurement in the touched suites is unmoved: 270 distinct
  event offsets, `mutated = 233` / `fired = 103`, unclosed-chain counts `{0, 0, 0, 0}` on the four
  near-regular fixtures.
- `pnpm build` — **clean** across core, test-fixtures, dashboard and demo.
- No failures needed resolving during this pass.

## Open Questions / Risks

- The five rewritten sweeps are a mechanical transformation of loops that were already green, so a
  transcription error would most plausibly show up as a *narrower* population rather than a failure.
  The vacuity guard catches total emptiness only; per-sweep sample counts are not pinned. Pinning
  them would be a separate change and would need re-measuring whenever the fixture corpus moves,
  which is the churn the existing `270 events` assertion already absorbs.
- `WITHIN_INSTANT_RELATIVE_SPREAD` is a measurement of this corpus at this commit. A new near-regular
  fixture with a materially different conditioning could sit above 1e-14 legitimately; that is drift
  to re-measure and explain, in the same spirit as the `mutated`/`fired` counts.

## Suggested Follow-ups

- `offset-projection.test.ts` and the near-regular suite now both scale a `1e-12` band by the solve's
  maximum offset under different constant names. A single shared constant in
  `wavefront-measurement-helpers.ts` would stop the two drifting apart.
- Promoting the four near-regular fixtures into `ALL_TEST_POLYGONS` remains the deliberate separate
  change decision 12 describes; it will move the `270` event count this file pins.
