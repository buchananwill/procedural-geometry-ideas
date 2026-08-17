# Task 241 — Canonicalise the node-offset table for simultaneous mirror events

Spec: `docs/notes/simultaneous-mirror-events-decisions.md` (decisions 1–13).
Working scope: `packages/core/src/straight-skeleton/offset-projection.ts`,
`packages/core/tests/straight-skeleton/{near-regular-ring-loss-diagnosis,offset-event-boundary-regression,offset-projection}.test.ts`,
`packages/core/tests/straight-skeleton/wavefront-measurement-helpers.ts`. Nothing outside it was touched.

## 1. Task Summary

`computeNodeOffsets` re-derived each node's offset from the supporting line of one of *its own* parent
edges. Mirror nodes of a symmetric polygon have different parent edges, so one instant came back as
several numbers 7e-15 to 3.5e-13 apart; querying at the lowest of such a set left the bisectors
meeting at the higher nodes alive by the table though they had already met in the plane, their shared
span came out zero or negative, `segmentsAlongExteriorEdge` dropped both endpoints, and the ring was
lost. The task was to canonicalise the table — collapse each simultaneous set to one identical value
— **without** putting slack into any lifetime comparison (decisions 1, 2).

## 2. Changes Made

- **`src/straight-skeleton/offset-projection.ts`** — `computeNodeOffsets` now builds the raw interior
  table (`rederiveInteriorNodeOffsets`, the previous loop, extracted verbatim), then canonicalises it
  (`canonicaliseSimultaneousOffsets` → `simultaneousOffsetSets` → `representativeOffset`). New
  module-private constant `SIMULTANEITY_RELATIVE_TOLERANCE = 1e-12`, new module-private interface
  `SimultaneousOffsetSet`. Signature unchanged. Module header's "one instant is several numbers"
  section extended with the resolution rather than replaced (decision/retirement §4), and
  `segmentsAlongExteriorEdge`'s closing paragraph updated to say the zero-length-span claim now holds
  across a mirror set too.
- **`tests/.../wavefront-measurement-helpers.ts`** — gained `isContinuous`, `MUTATION_DISPLACEMENT`,
  `withNodeOffsetDelayed` (moved out of `offset-event-boundary-regression.test.ts`, unchanged) and a
  new `rawOffsetsOfNode`, the suites' *own* re-derivation of the numbers a node's parent edges date it
  to. Both offset suites now assert their guarantee and their diagnosis over the same measurements.
- **`tests/.../near-regular-ring-loss-diagnosis.test.ts`** — rewritten (decision 9). It keeps the
  positive diagnosis (mirror sets exist, members sit >100 units apart, their parent edges still
  disagree in the last bits) and now asserts the corrected behaviour: zero unclosed chains at every
  event of all four fixtures, area continuity through every event, both peanut lobes kept, and the
  report convicted by mutation on these fixtures (48 clean events, 40 fire, 8 harmless).
- **`tests/.../offset-event-boundary-regression.test.ts`** — event count 271 → 270 with the reason
  recorded inline; Pentagon House case rewritten around its two apex nodes now sharing one bit-exact
  offset; helper functions moved to the shared module. Mutation counts (233 mutated / 103 fired) are
  **unmoved**.
- **`tests/.../offset-projection.test.ts`** — new `the node-offset table is canonical` block: the
  table never moves a node further from its own geometry than the band; no two distinct entries are
  one instant apart; and a metamorphic test that a fixture scaled by 2^±10 and 2^±30 partitions
  identically to the fixture.

## 3. Design Decisions

- **Partition (decision 3).** Connected components under the proximity relation. In one dimension the
  components are exactly the runs of the *sorted distinct values* separated by a gap wider than the
  tolerance — the transitive closure computed exactly, and a function of the value set alone, so it
  cannot depend on visitation order. `clusterCoincidentMerges` is cited in the code as the precedent.
- **Representative (decision 4).** The member nearest the set's mean, exact ties broken towards the
  smaller value — the 1-D analogue of `medoidPosition`. The mean is the yardstick, never the answer.
- **Tolerance (decisions 5, 6).** Relative to the solve's own maximum offset, `1e-12 * maxOffset`.
  Measured over `ALL_TEST_POLYGONS` + the four near-regular fixtures, relative to each solve's max:
  widest gap **within** one instant **1.42e-15** (Ellipse 32; 1.42e-13 absolute at max 99.79), all
  within-instant gaps below 1e-14; narrowest gap to a genuinely **distinct** event **1.23e-4**
  (Duck Octagon (fails); 9.42e-3 absolute at max 76.89). Eleven orders of magnitude apart, so the
  approach is not marginal — the chosen value sits ~700x above the spread it must close and ~1e8x
  below the gap it must not cross. Both bounds are recorded in the constant's doc comment.
- **Exterior nodes stay out of the partition.** Their offset is zero by construction rather than by
  re-derivation, so it carries none of the last-bit disagreement being reconciled, and a set
  straddling the boundary could move `offset === 0` off the original polygon.
- **No comparison was given slack (decision 2).** `collectAliveBisectors` is untouched; only the
  table it reads changed.
- **No graph node was fused (decision 8).** Only map *values* are unified; positions, ids and the
  graph are untouched, and that is asserted directly in both suites.

## 4. Build & Test Results

- `pnpm --filter @proc-geo/core test` — **63 suites, 2734 tests, all passing**, run twice with
  identical results (empty failure set both times; the spec's baseline was 63/2731 and the three new
  tests account for the delta). Decision 13.
- `pnpm build` — clean across core, test-fixtures, dashboard and demo.
- Envelope unmoved (decision 13): `large-coordinate-failures.test.ts` and `normalisation.test.ts`
  pass unchanged — 37/37 `ALL_TEST_POLYGONS` across every translate from native to 1e11 and every
  scale from 1e-6 to 1e8.
- **The headline result (decision 10): all four counts are zero.** `unclosedChains` over every event
  offset: Ellipse 16 4 → **0**, Ellipse 32 6 → **0**, Peanut 32 7 → **0**, Rosette5 40 19 → **0**.
  Both reason populations (23 `no-successor`, 13 `rejoined-mid-chain`) are zero.
- Area continuity at event offsets (decision 11) holds for all four fixtures under the same
  `isContinuous` gate the `ALL_TEST_POLYGONS` sweep uses.
- The unclosed-chain report is still live (decision 7): unchanged at 233 mutated / 103 fired on
  `ALL_TEST_POLYGONS`, and newly convicted on the near-regular four at 48 mutated / 40 fired / 8
  harmless. A micrometre displacement is six orders of magnitude outside the canonicalisation band,
  so the mutation is not absorbed by the fix.
- Mutation-convicted the new production code: making the tolerance absolute fails the scale-partition
  test; returning the set's mean instead of a member fails "collapses each set onto one of its own
  members". (A first-match-style join could not be convicted — on this corpus no set chains, spread
  1.42e-15 against a 1e-12 tolerance, so both partition rules give identical output on every
  measurable input. It is implemented as components regardless, per decision 3.)

## 5. Open Questions / Risks

- **Promotability re-measured, nothing promoted (decision 12).** All seven near-regular fixtures were
  replayed through the offset-event boundary sweeps and the coordinate envelope in a scratch suite
  (not committed): **0 problems across all 27 of their event offsets** — the projection blocker
  recorded in `near-regular-polygons.test.ts` is cleared for all seven. The envelope blocker remains:
  6 of 7 survive translate 1e10 (`NEAR_REGULAR_CIRCLE_48` drops) and 1e11 (`NEAR_REGULAR_ROSETTE5_40`
  drops); the scale row is 7/7 everywhere. Promotion would also move the pinned event count from 270.
- **`near-regular-polygons.test.ts` prose is now stale** — it states the projection blocks five
  fixtures and quotes the event count as 271. That file is outside my file ownership, so it was left
  alone; its assertions all still pass. It needs a prose re-measure when the fixtures are promoted.
- **A femtometre below an event is still not a well-posed query, and this is pre-existing.** A raw
  member that is not its set's representative is no longer a table entry, but it can still be handed
  to `projectOffsetWavefront` directly. Below an event by less than a nanometre the reconstruction of
  a bisector's position is noisier than the distance to the event and a span can sort the wrong way
  round. Measured on `ALL_TEST_POLYGONS`, which contains no mirror sets: **101 of 810 probes** at
  1e-13/1e-14/1e-15 below an event report an unclosed chain. Unchanged in either direction by this
  work, out of scope, recorded in the diagnosis suite's prose and reported here rather than pinned.
- `computeMaxOffset` can now differ from the largest raw re-derivation by up to one instant's worth,
  because the top set collapses onto a member that need not be its largest. No suite moved on it.

## 6. Suggested Follow-ups

- Promote the near-regular fixtures into `ALL_TEST_POLYGONS` as its own change: update the event
  count (270 → 297 with all seven), refresh `near-regular-polygons.test.ts`'s prose, and re-run every
  sweeping suite. Two fixtures still need the translation envelope to reach 300-unit shapes.
- Decide whether an offset within a nanometre below an event should be answerable at all, or whether
  callers should be documented as walking the table rather than approaching it.
