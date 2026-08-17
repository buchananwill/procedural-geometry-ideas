# Task 243 — Input canonicalisation (reissue, expanded ownership)

Spec: [`docs/notes/input-canonicalisation-decisions.md`](../input-canonicalisation-decisions.md)

## 0. Recovery baseline — the phase plan

`git log` showed task 242 left **no implementation on this branch**: `canonicalisation.ts` existed in
no commit reachable from here. What landed from 242 was the spec amendment alone — commit `a85360e`,
decisions 19–22. So this was a **greenfield implementation** of a spec whose measurement half had
already been performed and ruled on.

That changed one thing about the work. Decision 5 says establishing the floor is the first work of
the task; decision 19 has since **ruled** `SKELETON_NOISE_FLOOR = 1e-6` and recorded the sweep behind
it. Re-deriving the floor would be re-litigating a ruling, so what this task owed instead was the
*reporting* half of decisions 5, 14, 14a, 17 and 18, re-measured against the code that actually
landed. Every one of decision 19's recorded measurements reproduced exactly.

| Phase | Content | Commit |
|-------|---------|--------|
| A | Plan committed as the recovery baseline. | `2296eb4` |
| B–D | The stage, its contract, and the wiring into all three entry points. | `6ef6294` |
| E–F | Failure lists emptied, pinned counts repinned, metamorphic suite. | `ce3cf4d` + this one |
| G | Reports, full suite twice, build. | this one |

## 1. Task Summary

Add a normalisation stage that removes boundary vertices whose perpendicular deviation from the
chord between their neighbours falls below a render-scale noise floor, before the skeleton sees the
polygon — eliminating an input class the solver has a standing defect on, rather than handling it.

## 2. Changes Made

### Production

- **`packages/core/src/straight-skeleton/canonicalisation.ts`** — created. `CanonicalPolygon`,
  `canonicalisePolygon`, `SKELETON_NOISE_FLOOR = 1e-6`. Reuses `distanceToSegment` from
  `vertex-budget.ts` rather than reimplementing the predicate (decision 1).
- **`packages/core/src/straight-skeleton/types.ts`** — `SkeletonDiagnosticKind` gains
  `'vertices-canonicalised'`; the `complete` doc-comment names it alongside `winding-normalised` and
  `self-intersecting` as informational (decision 9).
- **`packages/core/src/straight-skeleton/algorithm-termination-cases.ts`** — `SolveSkeletonOptions`
  gains `noiseFloor`; `solveSkeleton`, `runAlgorithmV5` and `runAlgorithmV5Stepped` canonicalise
  immediately after normalising, inside unit space (decision 4). `solveSkeleton` reports the removal
  on `diagnostics` (decision 8). `runAlgorithmV5`'s header gains a fourth silent-failure mode.
- **`packages/core/src/index.ts`** — barrel exports for `CanonicalPolygon`, `canonicalisePolygon`,
  `SKELETON_NOISE_FLOOR`.

### Tests

- **`canonicalisation.test.ts`** — created, 22 tests. The predicate, the fixed point, the
  three-vertex floor, the parameterised floor, the epsilon gap, the reporting, and decision 18's
  corpus report as a live set-equality guard.
- **`silhouette-invariance.test.ts`** — created, 114 tests. Decision 10's metamorphic invariant over
  37 fixtures × 3 strip configurations × 6 insertions, with decision 16's mutation conviction.
- **`reflex-subdivision.test.ts`** — both failure lists emptied and repinned against the stage off;
  header rewritten; irregular-insertion measurement added.
- **`stroke-derived-polygons.test.ts`** — `failingSubdivisions(L_SHAPE)` emptied and repinned
  against the stage off.
- **`offset-event-boundary-regression.test.ts`** — three pinned counts updated (decision 21).
- **`parcel-slicing.test.ts`** — `KNOWN_AMAX_SATURATION` named, with a set-equality test; the
  fixture is **not** excluded (decision 22).

## 3. Design Decisions

**Smallest-deviation-first, one vertex per iteration.** Decision 2 mandates a fixed point rather
than a single pass but does not name the order. A simultaneous sweep of every under-floor vertex
would flatten a staircase whose steps are individually invisible and whose run is not; taking the
smallest first and recomputing means every removal is justified against the ring as it stands, and
`maxDeviation` is a true bound on what was discarded. Ties break to the lowest index so an
exactly-subdivided edge — where deviations are bit-identical in runs — cannot make the result depend
on scan direction.

**Canonicalisation before the winding test in `solveSkeleton`.** Decision 4 and the type roster both
say "after normalising"; the winding check sits between. Removing an invisible vertex cannot flip a
non-degenerate polygon's signed area, so the order is immaterial to behaviour, and running the stage
first means `isClockwise` sees the canonical ring. The winding diagnostic's vertex count changed
from the input count to the count actually reversed, which is what that sentence claims. Only the
diagnostic `kind` is asserted anywhere, never the detail text.

**A zero floor is an exact identity, and that is the mutation seam.** The comparison is strict
(`deviation < noiseFloor`), so a zero floor removes nothing, including exactly-collinear vertices.
This gives decision 16 its conviction through the **public option** rather than through a test seam
in production code — no `ForTesting` surface was added anywhere.

**`fired` was repinned although decision 21 did not name it.** See §5.

**The narrow band is documented as narrow.** Decision 19 explicitly forbids describing the band as a
plateau in the code. `canonicalisation.ts` records that the corpus is insensitive across four
decades, that the corpus is *not* what binds, and that the usable band is `[1e-6, 3e-6]` pending
decision 7 being wired through the recursion driver.

## 4. Build & Test Results

**Full suite run twice, both clean. Intersection of failure sets is empty.**

```
Test Suites: 65 passed, 65 total
Tests:       2876 passed, 2876 total
```

`pnpm build` — clean across `core`, `test-fixtures`, `dashboard` and `demo`.

### Decision 14 / 14a — the headline result: all three lists go empty

| List | Before | At floor 1e-6 | With stage off |
|------|--------|---------------|----------------|
| `REFLEX_L_KNOWN_FAILURES` | `[5, 6, 8, 10]` | `[]` | `[5, 6, 8, 10]` |
| `DOUBLE_REFLEX_PLUS_KNOWN_FAILURES` | `[9]` (open regression) | `[]` | `[9]` |
| `failingSubdivisions(L_SHAPE)` | `[4, 6, 7, 8, 9, 10]` | `[]` | `[4, 6, 7, 8, 9, 10]` |

The defect underneath is untouched — `handleInteriorNGon` was not modified. The mechanism decision
14a predicted is confirmed by measurement: at every k the canonicalised polygon is back to the
fixture's original corner count, asserted rather than described. None of the historical sets were
deleted; each is repinned against `noiseFloor: 0` where it reproduces exactly.

### Decision 5 / 18 — the corpus sweep

| Floor | Fixtures touched | Vertices removed | Incomplete solves |
|-------|------------------|------------------|-------------------|
| 1e-12 … 1e-4 | 1 / 37 | 1 | 0 |
| 1e-3 | 2 / 37 | 2 | 0 |
| 1e-2 | 10 / 37 | 19 | 0 |

The only vertex removed anywhere below `1e-3` is one exactly-collinear vertex in `Long Unbroken Side
Then Extreme Acute Angle`, at deviation `7.850462293418876e-17` — decision 19's measurement,
reproduced to every digit. Most of the corpus is untouched, which is what decision 18 requires; the
`1e-2` row is what "too high" looks like, and is pinned so it is caught rather than discovered.

### Decision 11 — probing both insertion families is load-bearing

With the stage off, the two families catch **different** failures:

| Fixture | Regular (k = 1…10) | Irregular (10 seeds) |
|---------|--------------------|----------------------|
| Reflex L | 4 of 10 fail | 0 of 10 fail |
| Double-reflex plus | 1 of 10 fail | **4 of 10 fail** |

A suite probing either family alone would have declared one of these two shapes clean. With the
stage on, both are 0 of 10 either way.

### Decision 16 — the metamorphic gate convicted by mutation

With the removal switched off, **222 of 222** (fixture, insertion) pairs break the invariant — the
full cross-product. No fixture is invariant under any insertion. The mechanism is decision 13's: the
default configuration cuts one strip per exterior edge, so an inserted vertex adds a strip and the
lot set moves with it. That coupling is exactly what the stage breaks.

Measured agreement with the stage on is below `1e-11` relative, against an asserted bound of `1e-9`.

### Decision 15 — the collinear dumbbell is NOT retired, as required

Still fails in exactly the way it failed before: tiling identity out by a tenth of its area at both
depths, ~22 area units of strip-on-strip overlap, four skeleton nodes fused. Out of reach of a
vertex-local predicate by construction.

### Decision 17 — the translation and scale envelope is unmoved

37 of 37 `ALL_TEST_POLYGONS` at every translate from native to 1e11 and every scale from 1e-6 to
1e8. Not one cell moved.

### Decision 21 — pinned counts updated

| Count | Before | After |
|-------|--------|-------|
| Distinct event offsets | 270 | **269** |
| `mutated` hand-overs | 233 | **232** |
| `fired` | 103 | **101** |

## 5. Open Questions / Risks

- **A third pinned count moved that decision 21 did not name.** The decision names two counts;
  `fired` in the same file moved 103 → 101. I attributed all three deltas per fixture **before**
  repinning rather than re-baselining: every one traces to `Long Unbroken Side Then Extreme Acute
  Angle` losing one exterior edge (events 30 → 29, mutated 29 → 28, fired 14 → 12), and the other 36
  fixtures are bit-unmoved on all three. The file's old note asserting that only a change in what
  the projection reports could move `fired` held while the corpus geometry was fixed; it is
  corrected in place rather than left to mislead. **Worth a reviewer's eye** — it is a repin the
  spec did not explicitly authorise, justified by the same decision 12 reasoning as the two it did.
- **Decision 22's saturation is recorded, not fixed** — explicitly out of scope per section 3. The
  fixture keeps a `toBeGreaterThanOrEqual` assertion and the known-saturation list has its own
  set-equality test, so it cannot silently grow.
- **Decision 20's band stays narrow at the end of this task, by design.** Wiring the root floor
  through the recursion driver is deferred by section 3, so sub-regions still canonicalise against
  their own extent and the usable band remains `[1e-6, 3e-6]`.
- **The two legacy entry points canonicalise silently.** `runAlgorithmV5` and
  `runAlgorithmV5Stepped` have no diagnostics channel to report through. I documented it as a fourth
  silent-failure mode on `runAlgorithmV5` rather than invent a channel; decision 8's requirement is
  discharged on `solveSkeleton`, which is the entry point that has one.

## 6. Suggested Follow-ups

1. **Wire decision 7 through the recursion driver** — pass the root region's floor down instead of
   letting each sub-region canonicalise against its own extent. Decision 20 promotes this from
   tidiness to the thing that widens the usable band beyond a factor of three.
2. **The strip partition's coupling to exterior edge count** (decision 13's finding, arriving where
   the spec said to look). `sameLogicalStreet` and `minEdgeLength` are keyed to edge identity and
   count rather than to shape; that is what saturates `Long Unbroken Side`. Separate defect,
   separate evidence.
3. **Rejecting non-finite input vertices** — explicitly out of scope here, and still a real gap: a
   lone `NaN` is invisible to a bounding-box scan and travels into the solve intact.
