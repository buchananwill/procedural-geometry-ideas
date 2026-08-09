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

---

## 3. Exactly-subdivided reflex polygons

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
fixtures into `ALL_TEST_POLYGONS`.

---

## 5. Promoting the near-regular fixtures

`NEAR_REGULAR_CIRCLE_16/32/48`, `ELLIPSE_16/32`, `PEANUT_32`, `ROSETTE5_40` are exported
individually and deliberately kept **out** of `ALL_TEST_POLYGONS`, because several suites sweep
that list asserting every entry solves completely.

**No solver blocker remains.** `wavefront-causality` and `strip-decomposition` accept all seven.
The two blockers are item 4 above, and the large-coordinate envelope — these are 300-unit shapes
and leave it earlier than the corpus's smaller fixtures.

**`NEAR_REGULAR_CIRCLE_16` is blocked by neither and is promotable on its own.** The only extra
cost is updating the hard-coded event-offset count in
`offset-event-boundary-regression.test.ts` (271 for the present list, 325 with all seven).

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
