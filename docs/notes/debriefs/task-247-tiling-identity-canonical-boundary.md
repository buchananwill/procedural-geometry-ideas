---
title: "Task 247 — Tiling identity against the canonical boundary"
type: workflow
area: subdivision
status: archived
date: 2026-08-17
---

# Task 247 — Tiling identity against the canonical boundary

Spec: `docs/notes/tiling-identity-against-canonical-boundary-decisions.md`
Ownership: `packages/core/src/index.ts`, `packages/core/src/straight-skeleton/recursive-subdivision.ts`,
`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`,
`packages/dashboard/tests/fixtures/recursive-trees.ts`.

## 1. Case: greenfield

`git log` tipped at `43765ea Specify the tiling identity against the canonical boundary` with nothing
after it — no plan, no partial implementation. The plan half of this document was committed first
(`05079de`) as the recovery baseline, before any code moved. This revision adds the measurements and
the results.

## 2. Task Summary

The recursive driver's per-node tiling identity summed a node's segment areas plus its residue-ring
areas and compared them against `RecursiveNode.boundary` — the polygon **handed in**. `solveSkeleton`
canonicalises before solving, so the segments and the offset rings both derive from a **smaller**
polygon. Where canonicalisation removed anything, the identity charged that intended removal as
tiling error, which is what collapsed the usable noise-floor band to a single point.

The node now carries both polygons, the identity is written against the one the strips came from, and
the difference between them is reported as a quantity of its own.

## 3. Changes Made

- **`packages/core/src/straight-skeleton/recursive-subdivision.ts`**
  - `RecursiveNode` gains `canonicalBoundary: Vector2[]` and `canonicalAreaDrift: number`, exactly as
    the spec's type roster states (decision 3's separation is in the field docs).
  - `noiseFloorForRegion` is replaced by `canonicaliseRegion`, which builds **one** normalisation of
    the region and returns both the unit-space floor `solveSkeleton` is handed and the ring that floor
    leaves standing. The surviving ring is selected from the caller's own vertices through
    `canonicalisePolygon`'s `indexRemap`.
  - `SegmentOutcome`'s success arm carries `canonicalBoundary`; `subdivideNode` computes the drift.
  - A node that never solved — degenerate, incomplete or throwing — reports its own boundary as its
    canonical form and a drift of zero, because no canonicalisation happened there.
  - Module header gains the section stating which polygon the strips tile.
- **`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`**
  - `tilingProblems` sums against `canonicalBoundary` (decision 1).
  - `driftProblems` is a **separate** sweep against `CORPUS_CANONICAL_AREA_DRIFT_BOUND` (decision 3).
  - `structuralProblems` gains three invariants: the canonical ring never gains a vertex, never falls
    below three on a node that divided, and a failed node is its own canonical form at zero drift.
  - New `describe`: the bulged-square conviction case, the corpus exactness case (decision 7), the
    agreement-with-the-solved-graph case (decision 2), and the never-solved case.
  - New full-depth test pinning the identity with the residue term at zero (decision 6).
- **`packages/dashboard/tests/fixtures/recursive-trees.ts`** — the hand-built nodes carry the two new
  fields; nothing was canonicalised in a hand-built tree, so the ring is its own and the drift is 0.
- **`packages/core/src/index.ts`** — unchanged. Both new fields ride on the already-exported
  `RecursiveNode`, and no new symbol needed exporting.

## 4. Design Decisions

### 4.1 Where `canonicalBoundary` comes from — decision 2, and a measurement that changed the answer

The plan chose the solved graph's exterior ring, `graph.nodes[0 .. numExteriorNodes)`, on the grounds
that `computeStrips` and `computeOffsetRings` read their geometry off those very nodes, so no second
derivation of anything is involved. That was measured first: across `ALL_TEST_POLYGONS` the
normalise/denormalise round trip reproduced every fixture vertex with **zero** mismatching components.

**That measurement was on the corpus roots only, and it does not hold for sub-regions.** Implemented
and swept over the recursion — 14 404 nodes at three depths and four merge groups — the graph's ring
differs from the input by up to **`1.4e-14`** on rings that lost no vertex at all, on 174 nodes, 30 of
which then reported a non-zero drift. The cause is not canonicalisation: normalisation's power-of-two
*scale* is exactly invertible but its *centring translation* is not, so `(v − c) + c` returns a
neighbouring double for a vertex far from its region's bounding-box centre. Decision 7 requires drift
to be **exactly** zero and says a non-zero one indicts canonicalisation — which here would have been
a false accusation.

So the ring is instead **selected from the caller's own coordinates through `indexRemap`**. That makes
"canonicalisation deletes vertices and never moves the ones it keeps" true by construction in caller
space, and decision 7 exact rather than approximate. It does mean `canonicalisePolygon` runs a second
time — but decision 2's objection is to the *caller* recomputing, and the spec's own §1 says
"`canonicalisePolygon` is not edited; it already returns what is needed", which is what `indexRemap`
is for. The two runs are given identical arguments by construction, and **are not trusted to agree:**
a test convicts them, against the solved graph's own exterior ring.

### 4.2 The drift bound lives in the suite, not in `src`

`CORPUS_CANONICAL_AREA_DRIFT_BOUND` is a test tolerance in the same sense `AREA_TOLERANCE_FRACTION`
is, and nothing in the driver reads it. Putting it in `src` would have added a public constant no
production path consumes, and the spec's type roster lists exactly three additions to
`recursive-subdivision.ts`. Both numbers — the observed maximum and the headroom — are stated at the
constant, as decision 4 requires.

### 4.3 The conviction fixture is sized against the floor

A hand-built square of side 10 with one extra vertex bulging `4e-6` off an edge midpoint. The
normalisation scale for a side of 10 is 8, so the unit-space deviation is `5e-7` — half the `1e-6`
floor, so the vertex is removed, while the area it takes with it is `2e-5` against a region of 100,
a relative drift of `2e-7`. That is five orders of magnitude above the tiling tolerance, which is what
makes the two identities distinguishable at the standing floor without touching the floor at all.

## 5. Measurements

### 5.1 `canonicalAreaDrift` distribution — decision 4

`ALL_TEST_POLYGONS` × depth fractions `0.25 / 0.6 / 1` × merge groups `1–4` at `MAX_RECURSION_LEVELS`,
at the standing floor of `1e-6`. **14 404 nodes.**

| quantity | value |
|---|---|
| nodes losing at least one vertex | 26 |
| nodes losing none | 14 378 |
| drift on a node that lost none | `0` exactly, on every one of them |
| median drift among the 26 | `1.57e-16` |
| **maximum drift** | **`1.60e-15`** (`Premature Bisector Split (fails)`, depth 0.25, merge 4, level 2, 6 → 5 vertices) |

**Bound set at `1e-14`** — a little over six times the observed maximum. Stated at the constant along
with the measurement.

Drift is not a fixed property of the corpus: it is what the floor removes, so it scales with the
floor. Same sweep shape at candidate floors: `3.2e-5` at `5e-6`, `2.3e-4` at `3e-5`, `0.43` at `1e-4`,
`3.53` at `1e-3`. Which is exactly why it is reported separately rather than folded into the identity.

### 5.2 The driver's ring against the solve's own — decision 2

Same corpus, three depths, three levels. Vertex-count mismatches: **0**. Worst positional
disagreement: **`4.03e-17` of the region's bounding-box diagonal** (`1.42e-14` absolute). Bound set at
`1e-15` of the diagonal — twenty-five times the observed worst.

### 5.3 The floor band, re-measured — decision 5

Method as task 246 §5: `SKELETON_NOISE_FLOOR` edited to each candidate in turn, the corpus swept at
merge group 2 and three levels, the edit reverted (`canonicalisation.ts` is outside this task's
ownership and is untouched in the commit). Counting **fixtures with at least one failing node** under
the `1e-12` tiling tolerance, under both the old identity (against `boundary`) and the new one
(against `canonicalBoundary`):

| Floor | old: vs `boundary` (full / all depths) | **new: vs `canonicalBoundary`** | worst new error | max drift |
|---|---|---|---|---|
| `1e-6` | 0 / 0 | **0 / 0** | `2.41e-13` | `1.57e-16` |
| `2e-6` | 2 / 2 | **0 / 0** | `2.41e-13` | `1.03e-6` |
| `3e-6` | 2 / 2 | **0 / 0** | `2.41e-13` | `1.03e-6` |
| `5e-6` | 4 / 4 | **0 / 0** | `2.41e-13` | `3.23e-5` |
| `1e-5` | 4 / 5 | **0 / 0** | `2.41e-13` | `3.23e-5` |
| `3e-5` | 5 / 6 | **0 / 0** | `2.41e-13` | `2.32e-4` |
| `1e-4` | 7 / 10 | **0 / 0** | `6.83e-13` | `4.29e-1` |
| `3e-4` | 12 / 16 | **0 / 0** | `6.83e-13` | `4.29e-1` |
| `1e-3` | 20 / 24 | **0 / 0** | `6.83e-13` | `3.53e0` |

**The band reopens, and by more than decision 5 expected.** It went `[1e-6, 3e-6]` before the root
floor was wired, `[1e-6, 1e-6]` after; it is now **at least `[1e-6, 1e-3]`** — three decades, and the
sweep found no upper end within it rather than finding one. The old-identity column reproduces task
246 §5 exactly, including the first failure at `2e-6` out by `1.033e-6`, which is the control.

The load-bearing observation is the "worst new error" column: it is **flat at `2.41e-13`** across three
decades of floor, rising to `6.83e-13` only at `1e-4` and staying there. The identity is now
independent of the floor, which is what decision 1 predicted and what "the tolerance can stay where it
is" means. The tolerance did stay where it is: `AREA_TOLERANCE_FRACTION` is unchanged at `1e-12`.

**No tolerance was loosened anywhere in this task.**

### 5.4 The tests are convicting, not decorative

Each new assertion was run against a deliberate mutant of the implementation:

| mutant | tests that failed |
|---|---|
| identity summed against `boundary` again | the bulged-square case, and its partial-depth sibling |
| `canonicalBoundary` read off the solved graph | the corpus exactness case (decision 7) |
| `canonicalBoundary` set to `boundary` (no canonicalisation modelled) | all four of the above |

## 6. Build & Test Results

Run standalone rather than chained, per decision 8.

- `pnpm --filter @proc-geo/core test`, first run: **67 suites, 3424 tests, all passing.**
- `pnpm --filter @proc-geo/core test`, second run: **67 suites, 3424 tests, all passing.**
  Failure-set intersection: **empty.** (Baseline was 67 suites / 3418 tests; the six added tests are
  the five in the new `describe` plus the full-depth identity pin.)
- `pnpm --filter @proc-geo/dashboard test`: **13 suites, 195 tests, all passing.** The dashboard
  resolves `@proc-geo/core` from its build output, so `pnpm build` must precede it.
- `pnpm build`: **clean across `core`, `test-fixtures`, `dashboard`, `demo`.**

No failures to resolve; nothing was quarantined or skipped.

## 7. Open Questions / Risks

- **The corpus barely exercises canonicalisation at the standing floor.** 26 nodes out of 14 404 lose
  a vertex, all of them exactly-collinear ones. The `2e-7` drift the identity now correctly excuses is
  therefore demonstrated by a hand-built fixture rather than found in the corpus. That is the honest
  situation and it is why the fixture exists; it is not a substitute for corpus geometry that removes
  visible vertices, which the corpus does not contain.
- **`SKELETON_NOISE_FLOOR` now has three decades of headroom it did not have.** Whether to spend any
  of it is explicitly out of scope (spec §3) and is a separate call; §5.3 is the measurement that call
  would be made from.
- **`canonicalisation.ts` still documents the band as `[1e-6, 3e-6]` "pending decision 7 being
  wired"**, and now understates it in the other direction as well. Outside ownership, untouched; task
  246 flagged the same comment.
- **The tiling identity is swept at merge group 2 only**, as it was before this task. Measured while
  taking §5.1, the identity fails badly at merge groups 3 and 4 — worst relative error `0.35` at merge
  3 and `33.8` at merge 4 — and it fails by **identically the same amount** against `boundary` and
  against `canonicalBoundary`, so it has nothing to do with canonicalisation and nothing to do with
  this change. It is a strip-decomposition question at heavy merging. Reported, not touched, and not
  swept into the identity gate: doing so would have been a scope the spec did not grant.
- **Self-intersecting regions**: `solveSkeleton` decomposes them and merges the graphs, and the
  driver's canonical ring is then the input ring minus removed vertices while the merged graph's
  exterior nodes are a concatenation. No corpus fixture reaches that state through the recursion, so
  the case is unmeasured rather than known-good.

## 8. Suggested Follow-ups

1. **Decide whether the floor moves**, now that §5.3 shows it has room. Spec §3 defers this
   deliberately; the measurement is now on the record.
2. **Correct `canonicalisation.ts`'s band note** with §5.3's table — the second task in a row to ask
   for this.
3. **Investigate the merge-group 3 and 4 tiling failures** in `computeStrips`. They are large,
   pre-existing, unrelated to this change, and currently outside every gate.
4. **Surface `canonicalAreaDrift` in the dashboard's recursive panel.** It is a per-node number that
   says how much of a region the noise floor ate, which is exactly the sort of thing the debug panel
   exists to show, and nothing renders it today.
