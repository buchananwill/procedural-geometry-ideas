# Solver hardening backlog

Work that is understood, measured, and deliberately parked. A line was drawn under
algorithm hardening on 2026-08-09 to re-orient on elevation-aware lot division; this file
exists so none of it has to be rediscovered.

Everything here is **non-blocking**. The pipeline runs end to end — draw, fit, close,
budget, serialise, parse, solve, offset rings, strips, parcels — and every item below sits
outside the input domain the pen actually produces, or is a UI/design decision rather than a
defect.

Each entry states what is wrong, what was measured, and what a fix would involve. Where a
characterisation test exists it is the live record; this file is the map.

---

## 1. `complete: true` with a wrong skeleton at extreme translation

**CLOSED (annotated 2026-08-27).** Unit-extent normalisation closed it: `solveSkeleton` normalises
to unit extent before solving and denormalises on the way out, which makes the absolute
`FLOATING_POINT_EPSILON` relative by construction. `Broken Polygon` at 1e8 now reports 126.630159636
against a native 126.63015964243034. The record below is kept as the diagnosis, not as open work.

**Where:** `packages/core/tests/straight-skeleton/large-coordinate-failures.test.ts`

At translation 1e8, `Broken Polygon` returns `complete: true` with **empty diagnostics** and a
skeleton whose `maxOffset` is 308.978 against a true 126.630 — impossible for a shape 680
units across. `computeOffsetRings` then returns `[]` past a quarter of the way in. Nothing on
the result reports it, so the completeness guarantee added in Phase 1 cannot see this case.

**Ruled out:** not the shoelace precision bug. That polygon's area is 95 054.85, giving a safe
distance of ~2.07e10 and so 200x headroom at 1e8; the old absolute-form sum there has relative
error 1.6e-6 with the correct sign; and `computeMaxOffset` is bit-for-bit identical before and
after the `signedArea` fix.

**The strongest clue:** the defect is **non-monotonic**. Max offset is correct at 1e6, 1e7
*and* 1e9, and wrong only at 1e8. A steadily degrading sum cannot do that. This is a
comparison or epsilon threshold being crossed — the same absolute `FLOATING_POINT_EPSILON`
family that produced the near-regular class, surfacing at a different magnitude.

**Why parked:** far outside the operating envelope. A 300 m region at 1e6 cm from the origin is
nowhere near onset; every fixture scaled to 150-400 m in centimetres and translated to 1e8
solves, projects and strips cleanly.

**Why it still matters:** "complete with a wrong answer" is the worst failure mode a result type
can have, and this is the last known instance. It bounds what Phase 1's guarantee means.

---

## 2. Near-degenerate reflex shapes are unreliable

**Where:** measured in scratchpad scripts; **no fixture in the repo** — the one gap worth closing
first if this rises.

Reflex shapes whose edge samples are jittered **along** the edge line are unreliable. Over 8
seeds x k=1..10 the reflex L scores 48/80 and the double-reflex plus 25/80.

**Why it is a distinct regime:** jitter along an edge moves sample points but leaves the
supporting **lines** exactly where they were, so wall-to-wall distances stay equal and the
pinches still land in one layer. The shape is still degenerate in the way that matters while no
longer being degenerate in a way the exact-case machinery recognises. Jitter with an off-edge
component moves the supporting lines and every configuration passes (80/80).

**Why it matters more than its measurements suggest:** this is the regime a real hand-drawn
L-shaped or cross-shaped region falls into. Real strokes are near-degenerate, not exactly so.

**But:** the pipeline as it stands does not reach it. Simulated hand-drawn strokes tracing an L
and a cross — per-axis tremor at 0.5, 1.5 and 3.0 units, 16 seeds, three stage combinations,
budgeted and solved — score **288/288**. Smoothing, RDP and Schneider fitting each destroy the
collinearity this needs.

**First step if resumed:** add a fixture, so it stops being invisible.

### CORRECTION, 2026-08-28 — re-measured, and the item above is wrong in two places

The history above is kept as written. What follows corrects it against a re-measurement over the
same construction: 8 seeds x k = 1..10, on the same two shapes, at five jitter magnitudes
(1e-9, 1e-6, 1e-3, 0.1, 1.0 caller units on shapes spanning 300 — the magnitude is the one
parameter the record above does not state). Fixtures now exist: the "first step if resumed" is done.

**1. The along-edge class is DEAD in the default configuration, and dead BY CONSTRUCTION.** 48/80
and 25/80 are now **0/80 and 0/80**, at every magnitude. A sample displaced along its own edge stays
on the chord between its neighbours, so its perpendicular deviation is float noise — worst 1.3e-13
caller units, about 5e-16 in unit space, ten orders below the 1e-6 canonicalisation floor. The stage
removes every jittered sample whatever the magnitude and hands the solver back the bare six- or
twelve-vertex fixture. There is no magnitude at which this family reaches the solver.

Stated at the strength it holds, no higher: canonicalisation removed the **input**, not the defect.
With the stage off (`{noiseFloor: 0}`, the like-for-like comparison since the record above predates
the stage) the class is alive and slightly **worse** — the L fails 34/80 against its recorded 48/80
and the plus 56/80 against its recorded 25/80, 90 of 160 today against 73 of 160 then, redistributed
between the two shapes.

**2. "Jitter with an off-edge component ... every configuration passes (80/80)" is FALSE near the
noise floor.** It is true far from it. At an off-edge magnitude of **1e-3** caller units — about
3.9e-6 in unit space, a few times the 1e-6 floor: large enough to survive canonicalisation, small
enough that the shape is still near-degenerate — the reflex L fails **22/80** and the double-reflex
plus **46/80**, **with default solver options**. A decade either side is quiet (1e-6: 0/80 both;
0.1: 1/80 both). So the control this item rests on is a band, not a threshold, and the failing band
sits just above the floor. Every failure is signalled — `complete: false`, `step-failure` then
`unresolved-edges` — never a silent wrong answer.

That off-edge band is now the live half of this item, and the "why it matters more than its
measurements suggest" paragraph above transfers to it unchanged: it is the near-degenerate regime a
real hand-drawn L or cross falls into. The "**But:** the pipeline does not reach it" paragraph also
still stands — 288/288 on simulated strokes — so this remains a bound on the solver rather than a
broken feature.

### SECOND CORRECTION, later on 2026-08-28 — both columns re-measured, both fell

Three solver changes landed after the reading above: journal decision 78's event-floor clustering,
the parallel-vertex closure in `algorithm-termination-cases.ts` (a terminal sub-polygon whose
wavefront vertices all travel the same way can never meet, so it closes at its leading source
instead of throwing), and render-floor position identity for the split/partition pass in
`coincident-events.ts`. The full 8 seeds x k = 1..10 grid, re-measured on that solver:

- **Stage ON.** The near-floor off-edge band is down again: the reflex L is **0/80** at every
  magnitude, and the plus **10/80** at 1e-3 (was 46/80, then 13/80, then 11/80). The plus's failing
  counts are [3, 4, 5, 6, 8, 9, 10]; k = 2 — the fixture `OFF_EDGE_JITTER_PLUS_SEED_7919` — is the
  cell that left, and it left because its two exterior walls at x = 200 are EXACTLY collinear once
  canonicalisation removes the two samples that broke them.
- **Stage OFF.** The along-edge class is alive but smaller: L **19/80** (was 34/80) and plus
  **40/80** (was 56/80), 59 of 160 against 90 of 160 earlier that day and 73 of 160 in the
  2026-08-09 record. The plateau across 1e-3 / 0.1 / 1.0 is unchanged in shape; only its height fell.

The item's verdict is unchanged: canonicalisation removed the INPUT, and the class survives with the
stage off. What is new is that the near-floor off-edge half now has a named mechanism for part of it
— the exactly-collinear non-adjacent wall pair, which is item 7's degeneracy arriving by a different
road — and a solver-side answer for the terminal case of it.

**Where it now lives, instead of in scratchpad scripts:**

- [along-edge-jitter.test.ts](../../packages/core/tests/straight-skeleton/along-edge-jitter.test.ts)
  — the closed along-edge class. Carries the full 40-cell measured table above as dated prose and
  runs a representative subset as the standing regression (journal decision 68; the eighty-cell form
  cost 222 s and became the critical path of the core suite).
- [along-edge-jitter-known-failures.test.ts](../../packages/core/tests/straight-skeleton/along-edge-jitter-known-failures.test.ts)
  — the live off-edge near-floor defect, pinned per journal decision 53, keeping the **full**
  eighty-cell grid because it is measuring something still broken.
- [near-floor-jitter.ts](../../packages/test-fixtures/src/near-floor-jitter.ts) — four literal
  fixtures, enrolled in `KNOWN_DEFECT_POLYGONS` under journal decision 72 and swept against their
  measured signatures rather than held out.
- [jitter-helpers.ts](../../packages/core/tests/straight-skeleton/jitter-helpers.ts) — the
  generator, with every constant documented.

---

## 3. Exactly-subdivided reflex polygons

**CLOSED (annotated 2026-08-27), twice over.** Input canonicalisation removed the failing input —
the inserted vertices deviate ~1e-16 from the chord and are normalised out — and the double-split
partition fix (`GOLF_CART`, journal decision 56) then fixed the defect underneath: re-measured with
the canonicalisation stage OFF, both regular-insertion failure sets are empty. What remains open is
narrower and is item 2's regime, not this one: the plus still fails 4 of 10 irregular seeds with the
stage off.

**Where:** `packages/core/tests/straight-skeleton/reflex-subdivision.test.ts` — records the
failing counts exactly, with a test pinning the set so drift in either direction is loud.

Subdividing each edge into k equal pieces: convex shapes and the double-reflex plus pass at
every k; the reflex L passes k=1,2,3,4,7,9 and fails 5,6,8,10.

**Cause, fully diagnosed:** `handleInteriorNGon` calls `bisectionsForMerge` once per merge,
each time against the whole unmodified ring. That contract holds only when the merge is the
sole event removing edges from that ring in the layer. Several ring-partitioning merges in one
layer each compute their surviving arcs as though the others had not happened, producing
overlapping spans that the dedupe cannot collapse and the first-containing-span assignment then
resolves wrongly.

**A fix was written, landed, measured and reverted** (see `0e2f233`, reverted by `872bc4c`). It
worked — both reflex shapes reached 10/10 out to k=16 — but the drawn-stroke measurement said
**288/288 before and 288/288 after**, so it bought nothing for any input this project produces,
while costing several hundred lines in the most delicate part of the solver and a measured loss
in the near-degenerate regime (item 2). **Recoverable from git history** if a consumer ever
feeds exactly-subdivided polygons: a mesh importer, a CAD interchange, or any
resample-to-N-points operation.

**Also latent and known:** the `co-linear-from-1` branch cross-wires symmetrically, but the
relationship is asymmetric — by the classification's own definition the leader always receives a
target behind itself. It is provably wrong for every input that reaches it, and fires **zero
times** across the corpus. Fix it if anything ever lands there.

---

## 4. Terminal many-way events cannot be projected

**CLOSED (annotated 2026-08-27).** Simultaneous mirror-event canonicalisation closed it. Re-measured
2026-08-27 over all eight historically excluded fixtures (journal F14): the unclosed-chain sweep,
the ring-presence sweep and the area-continuity sweep all come back clean on every one of them,
including `NEAR_REGULAR_ELLIPSE_16`, whose chain the note below reports as surviving every fix. It
is no longer a blocker on item 5.

**Where:** `packages/core/tests/straight-skeleton/offset-event-boundary-regression.test.ts`

At the exact offset of a terminal many-way event, the wavefront projection reports an unclosed
chain rather than closing the ring: `Near Regular Ellipse 16 @72.361834`, `Ellipse 32
@68.277064`, `Rosette5 40 @37.456461` and `@55.672712`, `Peanut 32 @106.597832`. Area recovers
cleanly a nanometre either side.

The peanut's is the two-ring form: its lobes' terminal events sit **one ULP apart**, so at
either exact offset one lobe's ring closes and the other reports `no-successor`.

**Pre-existing and not solver-caused** — the projection reports it honestly rather than
returning a bare empty list.

**Consequence:** this is one of the two remaining blockers on promoting the near-regular
fixtures into `CLEAN_TEST_POLYGONS` (the roster named `ALL_TEST_POLYGONS` when this was written;
renamed under journal decision 74).

---

## 5. Promoting the near-regular fixtures

**PARTLY DONE, RE-STATED TWICE ON 2026-08-27.** `NEAR_REGULAR_CIRCLE_16` and `NEAR_REGULAR_CIRCLE_32`
are in `CLEAN_TEST_POLYGONS`, alongside `GOLF_CART`. Both blockers named in the original item are
dead: item 4 closed, and the translation envelope now carries every one of the seven out to 1e9.
The pinned counts that promotion moved: event offsets 271 → 276, mutation `mutated` 232 → 237 and
`fired` 101 → 103 in `offset-event-boundary-regression.test.ts`; corpus size 39 → 42 and the
hop-count offender count 23 → 24 in `skeleton-tree.test.ts`. All attributed per fixture at each pin.

**THEN `NEAR_REGULAR_PEANUT_32` AND `SHORT_EDGE_PROMONTORY` FOLLOWED, under journal decision 64.**
What held them out was the bit-exact normalisation round trip, and decision 64 ruled that
`normalisation.test.ts`'s exact-scale list is corpus-scoped bookkeeping — a measured record of
which placements the corpus happens to round-trip bit-exactly in the CENTRING subtraction, which
decision 4 of the normalisation brief never claimed — rather than a designed invariant. The
designed invariant, exactness in the SCALING everywhere, is untouched and green. That table was
re-measured over the grown corpus with the moved cells attributed per fixture, and its sub-ulp bar
restated against the polygon's EXTENT rather than against the coordinate. Counts this second
promotion moved: event offsets 276 → 298, `mutated` 237 → 263, `fired` 103 → 124; corpus size
42 → 44 and hop-count offenders 24 → 26; the canonicalisation decade sweep's `touchedAt(1e-2)`
10 → 12. All attributed per fixture at each pin.

**THEN BOTH ELLIPSES FOLLOWED ON 2026-08-28, under journal decision 65 — by a solver fix, not a
ruling.** The scale sweep's blocker was node LABELLING: their geometry is bit-stable under a scale
of 7 while the two interior nodes of a mirror pair swapped ids, against `skeleton-tree.test.ts`.
Exact mirror symmetry makes those two events simultaneous, and the solver numbered the nodes it
created in the order the offset sort delivered them — an order that turns on an ulp once the input
is scaled. `clusterCoincidentMerges` now returns one offset layer's vertex events in a canonical
order taken from their interior-edge ids. Counts this third promotion moved: event offsets
298 → 310, `mutated` 263 → 283, `fired` 133 → 150; corpus size 44 → 46 and hop-count offenders
26 → 28. All attributed per fixture at each pin. `fired` had separately moved 124 → 133 in the same
package, with the corpus untouched, for a different cause: `inEdges` is now kept sorted at
construction, which changes which incident parent `offset-projection.ts` dates a node from, and the
report fires on 9 more mutations than it did. `corpus-enrolment-blockers.test.ts` recorded no
further defect and was deleted; its history is in the git log.

**Two remain out — Circle 48 and Rosette5 40 — each as a pinned failing test rather than a claim in
prose**, journal decision 53 permitting an exclusion only in that form:

- **The large-coordinate envelope is down to two cells**, both signalled step failures rather than
  silent wrong answers, both in
  `packages/core/tests/straight-skeleton/large-coordinate-known-failures.test.ts`:
  `NEAR_REGULAR_CIRCLE_48` at translation 1e10 ONLY (non-monotonic — 1e9 and 1e11 pass), and
  `NEAR_REGULAR_ROSETTE5_40` at 1e11 only, dying in a two-edge base case with its two source nodes
  6e-8 apart on the terminal ring. The second is the terminal-ring-finer-than-tolerance regime
  journal decision 54 leaves open.

---

## 6. Cubic solve cost

Measured on a wobbly closed stroke, same fixture subsampled: 40 vertices 0.22 s, 64 0.70 s,
106 3.1 s, 150 9.0 s, 212 26.6 s, 318 96.4 s, **576 611.9 s**. Log-log exponent ~2.9 and
steepening — 2.5 at the low end, 3.2 between 212 and 318. All return `complete: true`, so this
is cost, not failure.

**Mitigated, not fixed.** The vertex budget caps input at a chosen count; the pen defaults to 16
(~2 ms). Attacking the cost itself would be its own piece of work, and is only worth it if a
consumer genuinely needs hundreds of vertices.

---

## 7. Strip overlap on exactly-collinear input, with `complete: true` and empty diagnostics

> **CLOSED 2026-08-28** (journal decision 90). The cause was not the strip decomposition and not
> the item-3 layer partitioning: it was the DIRECTION a corridor's midline bisector was born with.
> `addBisectionEdge` derived the basis from the two exterior parents and then let a caller-supplied
> `approximateDirection` flip it wherever the offset rate is zero — which is exactly the
> anti-parallel-parent case, and exactly what a corridor's two walls are. The hint
> `bisectionsForMerge` supplied was the bisection of the two arrivals bracketing the gap, symmetric
> in them, so a two-run vertex event handed the same hint to both of its gaps while the gaps face
> opposite ways. Both of the dumbbell's bar midlines were therefore born pointing OUT of the bar,
> into the globe behind them, where each duplicated that globe's own ridge: the shaft carried no
> skeleton and the two globes' faces covered it twice. The hint is removed and `BisectionParams` no
> longer carries one; the parent ORDERING decides the direction, because a corridor opens the way
> its clockwise wall points.
>
> Measured after: the dumbbell tiles at **zero** at every depth and overlaps nowhere, and it is in
> `CLEAN_TEST_POLYGONS`. The class went with it — `Cross` had each arm's midline drawn along the
> OPPOSITE arm, and `T_SHAPE`'s stem midline was born pointing up into the head and retired as a
> zero-length self-loop. `ASYMMETRIC_DUMBBELL` (6.96e-2 before) and `THREE_GLOBE_CHAIN` (1.29e-1
> before) are enrolled as regression fixtures, and `collinear-dumbbell.test.ts` is now a
> specification rather than a tripwire. A new test-only invariant, **I4** in
> `graph-index-invariants.test.ts`, catches the whole class directly: every exterior edge's two ends
> must be joined by a walk across that edge's own bisectors, which the dumbbell's two shaft walls
> could not do.

**Where:** found 2026-08-09 by adversarial review during the parcel-quality work; **no fixture in
the repo yet** — coordinates below are the measured repro.

An axis-aligned dumbbell tiles with a **1.00e-1 relative error** at depth 0.2 and 0.5 of max
offset — strips overlap strips (1483/20000 bbox samples double-covered ≈ 22 area units, matching
the excess exactly), while the solve reports `complete: true` with empty diagnostics and the ring
accounting is innocent. A perturbed dumbbell of identical topology (non-collinear) tiles to
~2.5e-16 at every depth.

```json
[
  {"x": 0,  "y": 0},  {"x": 0,  "y": 10}, {"x": 10, "y": 10}, {"x": 10, "y": 6},
  {"x": 20, "y": 6},  {"x": 20, "y": 10}, {"x": 30, "y": 10}, {"x": 30, "y": 0},
  {"x": 20, "y": 0},  {"x": 20, "y": 4},  {"x": 10, "y": 4},  {"x": 10, "y": 0}
]
```

(`computeMaxOffset` = 5, area = 220; baseline `computeStrips`, no post-processing options.)

**This is the items 2–3 regime** — exactly-collinear, machine-generated input — surfacing in the
strip decomposition rather than the solve. Two consequences: `result.complete` is **not** a
sufficient precondition for the tiling identity, and any future consumer feeding machine-generated
polygons (mesh import, resample-to-N, recursive subdivision) hits this before it hits item 3.

**First step if resumed:** add the fixture (export-only), then decide whether the overlap is
downstream fallout of the item-3 layer-partitioning defect (`0e2f233` recoverable from history) or
independent.

---

## 8. Near-degenerate corner-geometry fuzz for the corner-correction guards

`cutPointOnEdge` / `cutStaysInside` decide transfer safety with strict sign tests and a single
midpoint ray-cast. The parcel-quality review proved the degenerate limit resolves **both ways**
(a needle's coincident double-cut proceeded to zero frontage; the same configuration on an
axis-aligned rectangle was refused) before the surviving-frontage floor closed the known cases.
Cuts passing within float-noise of a boundary vertex remain unfuzzed; 20k-sample overlap probes
found nothing. Parked per the brief's decision 14: systematic fuzzing across near-degenerate
corner geometries, only if corner correction misbehaviour resurfaces.

---

## 9. Repo hygiene

- **`pnpm lint` fails**, pre-existing: `apps/demo/src/app/dol-system/page.tsx:51`
  (`no-explicit-any`) and an unused variable in `AppShellLayout.tsx`.
- **`node_modules` is fragile.** A filtered `pnpm install` once pruned `loglevel` out of the
  root and broke 35 suites. The remedy is a full
  `pnpm install --config.confirmModulesPurge=false`. If a fresh shell shows mass resolution
  failures, that is why.
