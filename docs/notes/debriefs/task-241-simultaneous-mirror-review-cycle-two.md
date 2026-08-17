# Task 241 — Review cycle two: canonicalised node-offset table

## Task Summary

Revision pass over commit `331e0f4` ("Address the cycle-one notes on the canonicalised offset
table"), against reviews `1282` (decomposition, **REQUEST CHANGES**) and `1283` (correctness,
**APPROVE**) of cycle one.

One BLOCKING finding and two NOTEs. All three are addressed. No decision in
`docs/notes/simultaneous-mirror-events-decisions.md` is reopened: decisions 1–13 are delivered as
they were at `331e0f4`, nothing in this pass touches a lifetime comparison, a production tolerance,
or a single entry of the offset table, and every pinned measurement comes out unmoved.

## Changes Made

### `packages/core/tests/straight-skeleton/wavefront-measurement-helpers.ts`

- **Added `measureMutationReport(fixtures: SolvedFixture[]): MutationReportMeasurement`** — the
  mutation-conviction sweep the two offset suites had a copy of each, now one definition.
  Addresses decomp **B1**. Named-and-exported `SolvedFixture` (`{name, result}`) and
  `MutationReportMeasurement` (`{silentLosses, fired, mutated}`) rather than inline object shapes,
  per the project's type-discipline rule. The body is the previous loop verbatim: same skip guard,
  same "clean before, break, re-check `unclosedChains`, else compare `totalRingArea` through
  `isContinuous`" verdict, same problem-line wording.
- **Added `TERMINAL_BAND = 1e-6`**, moved out of the two suites that each declared it with the same
  value and the same doc. `measureMutationReport` needs it for its skip guard, and taking it as a
  parameter would have re-invited exactly the per-caller drift B1 objects to.
- **Added `SIMULTANEITY_RELATIVE_BAND = 1e-12`**, moved out of `near-regular-ring-loss-diagnosis`
  (same name) and `offset-projection` (as `SIMULTANEITY_BAND`), which held identical values for
  identical reasons. Its doc records why the suites restate production's
  `SIMULTANEITY_RELATIVE_TOLERANCE` rather than importing it: a suite reading the constant under
  test cannot tell a changed tolerance from a satisfied guarantee.
- **Added `ulpSeparatedPairs(offsets, tolerance): string[]`** — the "no two entries within one
  instant" check, previously spelled out in `near-regular-ring-loss-diagnosis` and
  `offset-projection`. Addresses decomp **N1**. Deduplicates and sorts its input rather than
  assuming order, because adjacency in value is what the check is about; the `<=` edge behaviour the
  finding worried about is now one decision in one place.
- **`distanceToSupportingLine` gained the `length === 0` fallback** its production counterpart in
  `offset-projection.ts` already carried. Addresses correctness **N1**. Without it a degenerate
  parent edge yields `0/0`, and because `NaN` compares false against every threshold, the
  `drift > maxOffset * SIMULTANEITY_RELATIVE_BAND` assertion that `rawOffsetsOfNode` feeds would
  have gone silently green instead of reporting. The fallback matches production exactly: with no
  line to be perpendicular to, the distance to the line is the distance to the point.
- `MUTATION_DISPLACEMENT` and `withNodeOffsetDelayed` are **no longer exported** — the only callers
  were the two extracted loops, and they now live beside `measureMutationReport` in this module.
- Header prose extended to say that the sweep is shared for the same reason the quantities are.

### `packages/core/tests/straight-skeleton/offset-event-boundary-regression.test.ts`

- `'is a live report: breaking a hand-over by hand either fires it or costs no area'` now calls
  `measureMutationReport` over `SWEPT_FIXTURES` and keeps its own pinned counts. `mutated` is still
  **233** and `fired` still **103**, unchanged by the extraction.
- Local `TERMINAL_BAND` removed in favour of the shared constant; `MID_SOLVE_EVENT` reads it
  unchanged.

### `packages/core/tests/straight-skeleton/near-regular-ring-loss-diagnosis.test.ts`

- `'fires when a hand-over on these fixtures is broken by hand'` now calls the same
  `measureMutationReport` over the four held-out fixtures. `mutated` is still **48** and `fired`
  still **40**.
- `'leaves no ulp-separated pair of event offsets anywhere in the table'` now calls
  `ulpSeparatedPairs`, prefixing each returned line with the fixture name.
- Local `SIMULTANEITY_RELATIVE_BAND` and `TERMINAL_BAND` removed in favour of the shared constants.
  `WITHIN_INSTANT_RELATIVE_SPREAD` stays local and stays at `1e-14`: it is a measurement of this
  file's own wider derivation, not the canonicalisation band, and the cycle-one debrief records why
  the two must not be conflated.

### `packages/core/tests/straight-skeleton/offset-projection.test.ts`

- **New test** `'stays finite for an edge of no length, rather than reporting NaN'`, under a new
  `'the distance the canonicalisation properties are measured in'` block. Written first and
  confirmed **red** against the unguarded helper (`Number.isFinite(NaN) === false`), then green
  after the guard. This is the test that makes correctness **N1** a behavioural change rather than a
  comment.
- `'gives one instant one value, however many nodes read it'` now calls `ulpSeparatedPairs`.
- Local `SIMULTANEITY_BAND` removed in favour of the shared `SIMULTANEITY_RELATIVE_BAND`; the
  drift assertion reads the shared name.

## Design Decisions

- **The extracted sweep is parameterised only by its fixtures, exactly as B1 asked.** Everything
  that decides *what is measured* — which events are mutable, how far the node is pushed, what
  counts as a silent loss — is inside the helper; each caller supplies its own corpus and asserts
  its own pinned counts. That is the whole point of the pinning: the two suites' counts are only
  comparable statements if the sweep behind them is one sweep.
- **The two shared constants came with the sweep rather than after it.** `measureMutationReport`
  cannot run without a terminal band, and a `terminalBand` parameter would have left each suite free
  to pass its own — the drift the finding names, relocated rather than removed. The simultaneity band
  followed for the same reason once two suites had two names for one value.
- **`nodeOffsetsOf`'s WeakMap cache in the near-regular suite is bypassed** by the shared helper,
  which calls `computeNodeOffsets` itself. That is one extra table build per fixture (four in total)
  and the values are identical and deterministic, which the unmoved 48/40 counts confirm. Keeping
  the cache in the signature would have made the helper's contract depend on a caller's memoisation.
- **The degenerate-edge guard is asserted directly rather than via a fixture.** The reviewer offered
  "assert no exterior edge in the swept fixtures is zero-length" as an alternative; that would pin a
  property of today's corpus instead of fixing the helper, and would go quiet the moment a fixture
  with a repeated vertex is added. The guard plus a direct assertion states the intended behaviour.
- **`ulpSeparatedPairs` returns lines, not a boolean.** Both call sites report *which* pair failed,
  and a boolean would have forced each of them to re-find the pair to name it.

## Build & Test Results

- `pnpm --filter @proc-geo/core test` — **63 suites, 2735 tests, all passing**, run twice with the
  failure sets intersected (both runs green, so the intersection is empty). 2735 rather than the
  2734 of cycle one: the one new test is the degenerate-edge assertion above.
- `pnpm build` — clean across `core`, `test-fixtures`, `dashboard`, and `demo`.
- `pnpm exec tsc --noEmit` over `packages/core` — clean.
- Every pinned measurement is unmoved by this pass: 270 distinct event offsets over
  `ALL_TEST_POLYGONS`, `mutated` 233 / `fired` 103 there, `mutated` 48 / `fired` 40 over the four
  near-regular fixtures, and their four unclosed-chain counts all still zero (decision 10).
- No failure needed resolving; the extraction was green on its first run, which is the evidence that
  it is behaviour-preserving.

## Open Questions / Risks

- The `mutated` counts remain corpus-sized measurements: promoting the near-regular fixtures
  (deferred, decision 12) will move both suites' counts, and the shared helper means that shows up
  as one re-measurement rather than two divergent ones.
- `SIMULTANEITY_RELATIVE_BAND` in the test helpers and `SIMULTANEITY_RELATIVE_TOLERANCE` in
  `offset-projection.ts` are deliberately two constants holding one value. If the production
  tolerance is ever re-measured, the test band must be re-measured with it by hand — the alternative
  (exporting the production constant to the suites) is worse, and both docs now say so.
- Scope: only the five files named in this task's ownership list were touched.

## Suggested Follow-ups

- Promote the four near-regular fixtures into `ALL_TEST_POLYGONS` (decision 12, explicitly
  deferred). With the sweep now shared, that becomes a single re-measurement of the event count and
  the two count pairs.
- The 101-of-810 unclosed-chain reports at 1e-13 to 1e-15 *below* an event, recorded in the
  near-regular suite's prose, remain a finding rather than a defect: it is a property of an exact
  lifetime comparison and is unchanged in either direction by this work.
