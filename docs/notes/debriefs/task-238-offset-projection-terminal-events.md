---
title: "Task 238 — Offset projection at terminal many-way events"
type: debrief
spec: docs/notes/offset-projection-terminal-events-decisions.md
outcome: hypothesis refuted by measurement; decisions 3–8 not implemented, per decision 1
---

# Task 238 debrief — the hypothesis is refuted

## 1. Task summary

The spec asked for the offset projection to stop reporting an unclosed chain at the exact offset of a
**terminal many-way event**. Its decision 1 makes the whole of the rest of the work conditional:

> **Confirm or refute the hypothesis by measurement, and report the result, BEFORE changing any
> behaviour.** … **A refuted hypothesis is a successful outcome of this task**: report it and stop
> rather than implementing decisions 3 to 6 against a mechanism that is not the one operating.

I measured first. **The hypothesis is refuted — on every one of its clauses, in every named case.**
Decisions 3–8 are therefore not implemented, and no behaviour of any kind has been changed. What this
task delivers is the measurement, pinned in a test so it cannot rot, plus the corrected module-header
argument.

## 2. What decision 1 asked me to establish, and what I measured

For each of the five named cases the spec asked three questions. All three answers come out against
the hypothesis.

| Question (decision 1) | Hypothesis | Measured |
|---|---|---|
| Does every bisector in the failing chain die at one node? | yes | **No.** Ellipse-16 @72.361834 walks 13 bisectors dying at 6 distinct nodes (n16, n18, n19, n20, n21, n22). |
| Does that node have any bisector born at it? | no | **Yes — in 100% of cases,** without exception. |
| Is the node terminal? | yes | **No.** Rosette5-40 fails at 37.456461 of a maximum 88.670259; the ring is fully present and the projection sound (`unclosedChains: []`, one ring) a nanometre either side. |

The spec's own framing — "the chain has no successor because its ring has legitimately ceased to
exist" — is the one thing that is not happening. At every failing offset the ring exists, has area,
and is recovered intact one nanometre away in either direction.

Two of the five named offsets no longer fail at all: `NEAR_REGULAR_ROSETTE5_40 @55.672712` and
`NEAR_REGULAR_PEANUT_32 @106.597832` both project cleanly at this commit. The peanut offset in
particular is the one decision 7 was built on; see §4.

## 3. The mechanism that *is* operating

**Simultaneous mirror events, whose nodes get re-derived offsets a few femtometres apart.**

These fixtures are symmetric, so they produce events at genuinely different places in the plane that
happen at the same instant. `computeNodeOffsets` re-derives each node's offset from the supporting
line of one of *its own* parent edges (`incident[0]`'s `clockwiseExteriorEdgeIndex`), and mirror nodes
have different parent edges, so one instant comes back as two or more offsets **7.1e-15 to 3.5e-13
apart**. Example, Ellipse-16:

```
n16 at (374.485865211, 300)  offset 72.361834217974177
n17 at (225.514134789, 300)  offset 72.361834217974106     ← 149 units apart, 7.1e-14 apart in time
```

Query at the **lower** of the pair and the two bisectors meeting at the higher node are still alive by
the table (`death > offset`) while having already met in the plane. Their span along the exterior edge
they share therefore comes out **zero-length or inverted**:

```
ELLIPSE_16  @72.361834217974106  b30 opens e14 @18.344932495162535, b31 closes @18.344932495162464  → -7.1e-14  INVERTED
ELLIPSE_32  @95.641314778338895  b41 opens  e9 @ 6.8390936275080598, b72 closes @ 6.8390936275079319 → -1.3e-13  INVERTED
ELLIPSE_32  @68.277063655872581  b63 opens e31, b32 closes at the identical coordinate               →  0.0     ZERO
PEANUT_32   @104.49869406923173  b67 opens e24, b57 closes                                           → -3.5e-13  INVERTED
```

`segmentsAlongExteriorEdge` drops both endpoints of such a span: an inverted one sorts close-before-open
so the close finds no `pendingStart`, and an exactly-zero-length one hits the deliberate
close-before-open tie-break to the same effect. The chain running through that bisector then has
nothing to continue to — `no-successor` — and the ring is lost. Downstream chains in the same walk
report `rejoined-mid-chain` for the same root cause.

The signature is unambiguous and holds without exception across all 36 measured chains: **the failure
is always at the lowest member of an ULP-separated set, and the higher members always project cleanly.**

This directly contradicts the module header of `offset-projection.ts`, which states that "two live
bisectors bounding a genuinely zero-length span cannot occur … a span of zero length means its two
bisectors have met, and bisectors that have met are dead". True at one node; false across a
simultaneous pair, where the two have met while the table dates their death femtometres later. That
false sentence is, I think, how the terminal-event hypothesis came to be written.

Note what the fix is **not**: no tolerance is admissible (decision 6 is right about that, and the
argument survives), and a "terminated chain" predicate (decision 3) would be answering a question none
of these cases asks. A real fix has to make one instant read as one number, which is a change to how
node offsets are derived — upstream of the walk, and outside this task's remit as written.

## 4. Decision 7's discriminating case does not discriminate

Decision 7 states that the peanut's "two lobes' terminal events sit **one ULP apart**, so at either
exact offset one lobe has genuinely finished while the other is still alive". Measured, that is not
so. The peanut's two lobes are exact mirrors and finish **together**:

```
max offset 106.94023959877826
@ 94.346888908665761   rings 2 [1516.751939, 1516.751939]  chains 0
@ 98.596658386560719   rings 2 [ 725.343834,  725.343834]  chains 0
@106.59783228554593    rings 2 [   4.266985,    4.266985]  chains 0   ← the offset decision 7 names
@106.59783228554598    rings 2 [   4.266985,    4.266985]  chains 0
probe 106.9            rings 2 [   0.058931,    0.058931]  chains 0
@106.94023959877826    rings 0                             chains 0   ← both lobes end at one offset
```

There is no offset at which one lobe has finished and the other is alive. The peanut's actual failures
are at @98.871601, @101.475119, @104.460846 and @104.498694, and at each of them the projection loses
**exactly one of the two identical mirror rings** (2 rings → 1 ring + 2 chains), the surviving ring
being bit-for-bit the twin offset's. That is the simultaneous-mirror mechanism again, not a lobe
finishing.

## 5. Re-measured baseline (decision 2)

Counts of `(event offset, unclosed chain)` pairs over every event offset of each fixture, at this
commit:

| Fixture | Item 4 | Spec decision 2 | **Measured now** | Event offsets |
|---|---|---|---|---|
| `NEAR_REGULAR_ELLIPSE_16` | — | 4 | **4** | 6 |
| `NEAR_REGULAR_ELLIPSE_32` | — | 5 | **6** | 15 |
| `NEAR_REGULAR_PEANUT_32` | — | 4 | **7** | 13 |
| `NEAR_REGULAR_ROSETTE5_40` | — | 22 | **19** | 14 |

Failing offsets now: ellipse-16 @72.361834, @95.018845; ellipse-32 @68.277064, @72.481167, @78.376552,
@95.641315; rosette5-40 @37.456461 (three of the cluster's four readings), @48.460697 (three of five);
peanut-32 @98.871601, @101.475119, @104.460846, @104.498694.

## 6. Promotability of the near-regular fixtures (decision 10) — measured, nothing promoted

| Fixture | Solves | Event offsets | Unclosed chains |
|---|---|---|---|
| `NEAR_REGULAR_CIRCLE_16` | yes | 1 | **0** |
| `NEAR_REGULAR_CIRCLE_32` | yes | 1 | **0** |
| `NEAR_REGULAR_CIRCLE_48` | yes | 1 | **0** |
| `NEAR_REGULAR_ELLIPSE_16` | yes | 6 | 4 |
| `NEAR_REGULAR_ELLIPSE_32` | yes | 15 | 6 |
| `NEAR_REGULAR_PEANUT_32` | yes | 13 | 7 |
| `NEAR_REGULAR_ROSETTE5_40` | yes | 14 | 19 |

**This task does not clear the blocker**, contrary to the spec's expectation in decision 10, because
the blocker is not the mechanism the spec described. The three circles remain free of it (as item 5
already recorded for `CIRCLE_16`); the other four are still held out. For whoever does the promotion:
the hard-coded event-offset count in `offset-event-boundary-regression.test.ts` would go from 271 to
**322** with all seven added (item 5 estimates 325; 322 is the measured figure at this commit).

## 7. Changes made

- **`packages/core/src/straight-skeleton/offset-projection.ts`** — *documentation only, no behavioural
  change of any kind.* Extended the module header with a section recording the simultaneous-mirror
  case and pointing at the measurement, and appended two sentences to `segmentsAlongExteriorEdge`'s
  doc-comment where it asserts the zero-length case cannot occur. Per the spec's "Retirement" section
  the existing argument is extended, not rewritten; every prior sentence is intact. I judged leaving a
  demonstrably false claim next to the code to be the larger risk, since it is what the refuted
  hypothesis was built on.
- **`packages/core/tests/straight-skeleton/offset-event-boundary-regression.test.ts`** — added the
  `the near-regular ring loss, diagnosed` section: 10 tests that pin the measurement above. They assert
  the mechanism positively (a bisector *is* born at the node the chain runs into; the node is *not*
  terminal; the query is the lower member of a simultaneous pair whose nodes are >1 unit apart in the
  plane; the dropped span has length ≤ 0 and > −1e-12), pin the per-fixture counts so drift in either
  direction is loud, and pin the peanut's lobes finishing together. The near-regular fixtures are
  imported individually and stay out of `ALL_TEST_POLYGONS` and out of this file's `SWEPT_FIXTURES`.

Files in my ownership that I did **not** need to touch: `offset-projection.test.ts`,
`placement-helpers.ts`, `wavefront-causality.test.ts`.

## 8. Design decisions

- **Stopping at diagnosis is compliance, not incompleteness.** Decision 1 names a refuted hypothesis a
  successful outcome and forbids implementing decisions 3–6 against a mechanism that is not operating.
  Implementing a "terminated chain" predicate here would have made the tests pass by classifying a live
  ring as a finished one — precisely the inversion decision 3 warns is "the single most dangerous way
  to make this task's tests pass".
- **No tolerance was introduced anywhere** (decision 6). The 1e-12 constant in the new tests is
  `SIMULTANEITY_BAND`, an *upper bound asserted on a measured quantity* — it makes the tests fail if a
  gap ever exceeds it. It is not used to widen, shift or compare any lifetime, and no production
  comparison changed.
- **The tests assert present, defective behaviour deliberately.** Same convention as
  `reflex-subdivision.test.ts` and `collinear-dumbbell.test.ts`: a pinned failing set makes movement in
  either direction loud. If a later change fixes the projection, `is still present, in the numbers this
  comment was written against` fails — which is the intended alarm, not a test to relax.
- **Decision 9's mutation conviction is not applicable and was not performed.** It convicts a
  termination predicate that does not exist, since none was written. The new tests are not
  vulnerable to the failure it guards against: they identify the mechanism positively (born-at,
  not-terminal, twin-node, span sign) and would fail if the loss were caused by anything else.

## 9. Build and test results

- `pnpm install --frozen-lockfile` — clean.
- `pnpm --filter @proc-geo/core test` — **run 1: 61 suites, 2676 tests, all passing. Run 2: identical.**
  The intersection of the two failure sets is empty (decision 11). The suite stood at 61/2637 in the
  spec; the delta is prior committed work on this branch plus the 10 tests added here.
- The translation and scale envelope suites (`large-coordinate-failures.test.ts`,
  `normalisation.test.ts`) pass unchanged — they cannot have moved, as no behaviour was changed.
- `pnpm build` — clean across `core`, `test-fixtures`, `dashboard` and `demo`.
- `pnpm lint` not run: nothing under `apps/demo/` or `packages/dashboard/` was touched, and item 9 of
  the backlog records it as failing for pre-existing reasons.

## 10. Open questions and risks

- **The real fix is upstream of this module and outside this task's file scope.** Making one instant
  read as one number means changing how `computeNodeOffsets` derives an offset — for instance by
  deriving mirror nodes' offsets from a common reference, or by canonicalising a node's parent-edge
  choice — and that is a change to the derivation, not to the walk. It needs its own spec. Note that
  simply clustering equal-to-within-epsilon offsets would be exactly the tolerance decision 6 forbids.
- **`incident[0]` is order-dependent.** `computeNodeOffsets` picks the first incident interior edge to
  supply the parent edge, and the spec's own deferred list records the `inEdges` ordering as unstable
  under arithmetic perturbation. Which parent edge a mirror node draws its offset from is therefore
  not stable, which is plausibly why two of the five named offsets stopped failing and several new ones
  appeared since the figures in decision 2 were taken. Any fix should assume the counts will move again.
- **The counts I pinned will move if the solver changes.** That is the intent, but it means an
  unrelated solver change will land a red test in this file. The failure message names the fixture and
  the count, and §5 above is the table to re-measure against.

## 11. Suggested follow-ups

1. **Spec the offset derivation, not the walk.** A successor task should target
   `computeNodeOffsets`: make simultaneous events yield one offset by construction rather than by
   comparison. The tests added here are the acceptance gate for it — they will go red, loudly, the
   moment the mechanism changes, and §3 states exactly what "fixed" looks like.
2. **Promote `NEAR_REGULAR_CIRCLE_16/32/48` on their own.** All three are measured clean here (0
   unclosed chains, 1 event offset each). The only cost is the event-offset count in this file. Still a
   separate change, per decision 10.
3. **Update backlog item 4.** Its diagnosis is superseded by §3, its named offsets by §5, and item 5's
   "325" by the measured 322.
</content>
</invoke>
