# Task 246 — Partial depth and the residue stream

Spec: [`docs/notes/partial-depth-residue-stream-decisions.md`](../partial-depth-residue-stream-decisions.md)

## 1. Task Summary

Below full depth a solve yields **two** child streams — the segments, and the **residue**, the
interior contour the wavefront has not yet reached. This task adds the second stream to
`subdivideRecursively`, makes each stream independently recursable, renders both on the `/recursive`
page, and wires the canonicalisation spec's decision 7 (the root region's noise floor travelling down
to every descendant) which had been specified and left unconnected.

Full-depth behaviour is preserved exactly and is pinned as a regression gate.

## 2. Changes Made

**`packages/core/src/straight-skeleton/recursive-subdivision.ts`**
- `RecursiveOptions` gains `depthFraction` (a fraction of each node's **own** max offset, decision 1)
  and `residue: ResidueTreatment` (decision 5). `ResidueTreatment` is a named exported union rather
  than an inline one — a behaviour-preserving adaptation of the roster's inline union, made because
  the store, the panel and the driver all spell the same two words (TypeScript type-discipline rule:
  no inline types in signatures, shared types named and exported).
- `RecursiveNode` gains `residueRings: Vector2[][]` and `residueChildren: RecursiveNode[]`.
- `FULL_DEPTH_FRACTION` and `clampDepthFraction` added; anything unusable (zero, negative,
  non-finite) reads as **full depth**, because the interval `(0, 1]` is open at zero and so has no
  least element to clamp to.
- `RecursiveRun` — the per-run policy record (levels, merge predicate, depth fraction, residue
  treatment, root noise floor) threaded through the recursion in place of five parameters.
- `rootNoiseFloor` / `noiseFloorForRegion` — decision 6. The root's floor is measured once in
  **caller** space (`denormaliseLength(makeSkeletonNormalisation(rootBoundary), SKELETON_NOISE_FLOOR)`)
  and converted into each descendant's own unit space before `solveSkeleton` is called.
- `divideIntoSegments` → `divideRegion`: one solve now yields both streams. `residueAt` returns `[]`
  at full depth **without calling** `computeOffsetRings`, so decision 2's exactness is a property of
  the code path rather than of what the projection happens to return at its own boundary.
- `flattenRecursiveTree` walks residue subtrees too, after the segment subtrees of the same node.
- `SegmentOutcome`'s success branch carries `residueRings` alongside `segments`. Name kept (it is
  public API and §4 of the spec deletes nothing); doc updated.

**`packages/core/src/index.ts`** — exports `FULL_DEPTH_FRACTION`, `clampDepthFraction`,
`RecursiveRun`, `ResidueTreatment`.

**`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`** — see §4.

**`packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts`** — `depthFraction` (default
`0.5`), `residue` (default `recurse`), their setters, `clampPanelDepthFraction`
(`[MIN_PANEL_DEPTH_FRACTION, 1]`), and residue counts on the summary: `residueRings` and
`discardedResidueRings` per level, `totalResidueRings` / `totalDiscardedResidueRings` overall
(decision 13). `leafSegments` now means "segments of a node with no children of **either** kind".

**`packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts`** — `residueRingStyle`,
`RESIDUE_RING_COLOURS`, `RESIDUE_RING_DASHES`, `residuePrimitives`, and a
`group:recursive-residue-<level>` layer per level drawn above every segment stroke and below the
input polygon, hidden with the level whose interior it is (decision 11).

**`packages/dashboard/src/components/RecursiveControlsPanel.tsx`** — a depth slider labelled as a
percentage of each region's max offset (decision 10), a `Recurse | Void` segmented control
(decision 12), per-level residue and discard counts, and a total residue line with a swatch
(decision 13). The fills switch is relabelled "Fills" because it now gates the residue fill too.

**`packages/dashboard/tests/fixtures/recursive-trees.ts`** — every hand-built node carries the two
new fields; `nodeWithResidue` and `RESIDUE_TREE` added (two rings at the root, one recursed on and
one discarded, so rings, children, discards and failures are four distinct numbers).

**`packages/dashboard/tests/{stores,scene}/…`** — see §4.

**`apps/demo/src/app/recursive/page.tsx`** — *outside the declared file ownership; changed only to
keep the build green.* Adding two required fields to `RecursiveOptions` breaks the one call site
that constructs them. The minimum viable fix was applied: read `depthFraction` and `residue` from the
store and pass them through, with both added to the `useMemo` dependency list. Nothing else on the
page was touched (the instructions copy still describes full depth only — noted as a follow-up).

## 3. Design Decisions

**A degenerate residue ring is kept in `residueRings` and recorded as a failed residue child**
(decision 4). "Discarded rather than recursed, and the discard is recorded on the node the same way a
failed child is" — a failed child is a `RecursiveNode` carrying a reason, and `residueChildren` is
"one per ring, in the same order", so the ring stays (it is still part of the region, and still
counts towards the tiling identity, which decision 5 requires of every ring) while its child says why
it was not subdivided. Mechanically this is the **existing** `degenerateRegionFailure` screen inside
`subdivideNode`: rings are simply handed to the same function segments are, so there is one
degeneracy predicate rather than two.

**Under `void` there are no residue children at all, so the discard count is zero.** Nothing was a
candidate for recursion, so nothing was discarded. The panel reads correspondingly.

**Residue children are grown at the same level budget as segment children** — none at the leaf
level. The two streams are children in the same sense and stop at the same depth.

**Residue fills follow the page's fills switch; residue strokes do not.** Turning fills off has
always been the honest stroke-only comparison on this page, and a residue fill exempt from the switch
would quietly break that. With fills off the rings are dashed green outlines and nothing else.

**Territory tints do not reach residue subtrees.** `leafTerritories.ts` credits every leaf cell to a
level-0 **segment**, and a residue subtree descends from no level-0 segment; that file is outside this
task's ownership and was not changed. Residue-descended cells are therefore stroked at their level
but not tinted. Arguably correct (they belong to no territory) — flagged in §5 for a reviewer.

## 4. Verification

**Core — decision 15's sweep.** `ALL_TEST_POLYGONS` at depth fractions `0.25 / 0.6 / 1.0`, levels
1–3: no throw, structural invariants (including one residue child per ring, in order, on that ring),
and decision 8's tiling identity **segments + residue rings = node area** at every node, relative
tolerance `1e-12`. The census reports the failure table rather than excluding fixtures:

```
37 fixtures at 3 levels, depths 0.25/0.6/1, merge groups 1/2/3/4 —
14259 node(s) subdivided, 145 recorded a failure;
10795 residue ring(s), 13 of them discarded as degenerate.
```

Failures concentrate at merge group 4 and at level 2, and are `Incomplete solve` (the solver's
standing partition/span defects) plus `Degenerate region: 0 boundary vertices` where a merged run's
strip has no outer contour. No unexplained reasons.

**Decision 2's regression gate.** A restated pre-residue driver (solve → `computeStrips` at
`computeMaxOffset` → recurse, default noise floor) is compared against `subdivideRecursively` at
`depthFraction: 1` over the whole corpus at 3 levels, merge groups 2 and 3 — node for node, segment
for segment, **vertex for vertex, with no tolerance**. Identical. Separately, no node anywhere in the
corpus carries a residue ring or residue child at full depth.

**Decision 14 — the pinching fixtures, and where they split.** Measured across the corpus:

| Fixture | Depth fraction | Rings |
|---|---|---|
| `Long Unbroken Side Then Extreme Acute Angle` | 0.20 / 0.25 | 2 |
| `Long Unbroken Side Then Extreme Acute Angle` | **0.30** | **3** |
| `Premature Bisector Split (passes)` | 0.20 / 0.25 / 0.30 | 2 |
| `Duck Octagon (passes)` — the page default | **0.50** | **2** |
| `Missing Edge at Node 11`, `Premature Split Octagon` | 0.50–0.70 | 2 |

The first is the suite's pincher (three rings at 0.3); the second is asserted too, so the first is
not a one-off of its own geometry. The page default splits in two at the depth the page opens on.

**The residue is load-bearing in the identity**, not a rounding term: on the pincher at 0.3 the rings
are >10 % of the region's area, the segments alone miss the region by >10 %, and segments + rings
agree to `<1e-12`.

**Dashboard.** Residue style (no colour shared with the segment or skeleton ramps at any level;
distinct colour *and* distinct dash per ring of one node; palette cycles; width tracks the level
ramp; fill faint), residue layering (above all segment strokes, below the input polygon, hidden with
its level, absent entirely when nothing was left over, unfilled when fills are off), and the store
(defaults, panel clamp including the "slider at the left stop must not land on full depth" case,
residue counts distinguishing rings from children from discards from failures).

**Decision 16 — the acceptance gate.**

- `pnpm --filter @proc-geo/core test`, **twice**: 67 suites, 3418 tests, 0 failures both runs.
  The intersection of the failure sets is empty because both sets are empty. (Baseline was 67
  suites / 3403 tests before this task; +15 tests.)
- `pnpm --filter @proc-geo/dashboard test`: 13 suites, 195 tests, green.
- `pnpm build`: clean across `core`, `test-fixtures`, `dashboard`, `demo`.
- `pnpm lint`: **one pre-existing error**, `apps/demo/src/app/dol-system/page.tsx:51` "Unexpected
  any", reproduced on the unmodified tree (verified by stashing this task's changes). Untouched: it
  is outside this task's ownership and is not a build error.

## 5. Decision 7 — the band, re-measured, and the diagnosis it overturns

Decision 7 asked for both bounds after wiring the root floor, and asked explicitly for a negative
result to be reported if the upper bound did not move. **It moved — downwards.**

Method: the driver's own per-node tiling identity, swept over `ALL_TEST_POLYGONS`, with
`SKELETON_NOISE_FLOOR` edited to each candidate value in turn (edit reverted; the working tree is
clean). Measured under both floor policies and both sweep shapes, counting failing fixtures:

| Floor | per-region floors (before) | **root floor (after)** |
|---|---|---|
| `1e-6` | 0 | **0** |
| `2e-6` | 0 | **2** |
| `3e-6` | 0 | **2** |
| `5e-6` | 2 | **4** |
| `1e-5` | 2 | **4 (full depth) / 5 (all depths)** |

- **Before (per-region floors): the usable band is `[1e-6, 3e-6]`** — the prior arc's measurement
  reproduced exactly, including the first failure at `5e-6`.
- **After (root floor): the usable band is `[1e-6, 1e-6]`.** The first failure is at `2e-6`, on
  `Premature Bisector Split (fails)` and `(passes)`, out by `1.033e-6` relative — *the same magnitude
  the previous debrief recorded for the `5e-6` failure*, which is the mechanism showing itself: at
  level 2 the root's floor is several times a sub-region's own floor in world terms, so `2e-6` rooted
  does what `5e-6` per-region used to do.
- **The partial-depth sweep does not move the bound.** Full-depth-only and all-depths sweeps give the
  same numbers, so the residue stream is not what narrowed it.

**The diagnosis in the canonicalisation debrief was wrong in sign.** It expected the band's upper
bound to *rise* once sub-regions stopped canonicalising against their own extent. The opposite
happens, and necessarily: a sub-region's own floor is *smaller* in world terms than the root's, so
per-region canonicalisation removes **less** at depth, not more. Wiring the root floor makes
canonicalisation strictly more aggressive on descendants — which is exactly what decision 6 wants
(recursion must not manufacture invisible geometry) — and the arc's tiling identity, which compares
the segments against the node's **pre-canonicalisation** boundary, is what pays for it.

**Nothing regresses at the standing floor.** Independently measured before writing the tests: across
`ALL_TEST_POLYGONS` × depth fractions `0.25/0.5/0.75/0.9/0.95` × merge groups 1–3 at 3 levels — 555
runs — the two floor policies produce **bit-identical** trees at `1e-6`. The wiring is behaviour-
neutral on today's corpus; its value is that it cannot go wrong later.

## 6. Open Questions / Risks

- **`SKELETON_NOISE_FLOOR` now sits *on* its upper bound rather than inside a factor-of-three band.**
  At `1e-6` everything passes; at `2e-6` it does not. That is a real loss of headroom and the
  operator should know it. It is a consequence of decision 6, which is mandated, so it was not
  worked around.
- **The tiling identity measures the node's un-canonicalised boundary.** The segments tile the
  *canonicalised* polygon, so above the floor's threshold the identity is measuring how much area
  canonicalisation removed, not a defect in the strip decomposition. Deciding whether the identity
  should compare against the canonicalised region is a design question this task had no mandate to
  settle — it would decouple the band from the floor entirely. Recommended as the next move on this
  thread.
- **`canonicalisation.ts` still documents the band as `[1e-6, 3e-6]` "pending decision 7 being
  wired"**, which this task has now wired. That file is outside this task's ownership so the comment
  was not corrected; it should be, with the table in §5.
- **No behavioural test convicts decision 6's wiring**, because on today's corpus the two policies
  are indistinguishable (555 runs, bit-identical). The wiring is convicted only by the floor-sweep
  measurement above, which is reported rather than pinned. A conviction test would need geometry
  where the strip decomposition or the offset projection *creates* a vertex whose deviation falls
  between a sub-region's floor and the root's; no fixture in the corpus does.
- **Residue-descended leaf cells are not tinted** (see §3) — `leafTerritories.ts` is outside this
  task's ownership.
- **The `/recursive` page's instructions copy still describes full depth only.** Outside ownership;
  the controls themselves explain both dials inline.

## 7. Suggested Follow-ups

1. **Correct `canonicalisation.ts`'s band note** with §5's table, and decide whether the floor should
   stay at `1e-6` now that it has no headroom above it.
2. **Reconsider what the tiling identity is measured against** (un-canonicalised vs canonicalised
   region boundary) — the single change most likely to give the floor its decades back.
3. **Radial promotion** — a partial-depth pass creates an inner void, and the arc design requires any
   level creating one to promote a connector. Explicitly deferred by §3 of the spec, and this task is
   what makes it reachable.
4. **Tint the residue subtrees** — either credit a residue-descended cell to its residue ring as a
   territory of its own, or state in the panel that only segment-descended cells are tinted.
5. **`projectOffsetWavefront` instead of `computeOffsetRings`** in the driver, so a residue that was
   *lost* by the projection (`unclosedChains`) can be told apart from a residue that was genuinely
   empty. The spec named `computeOffsetRings` in its reuse list, so this was not done here; the
   distinction matters the moment a ring goes missing.

---

# Revision cycle 1 — review response

Reviews read directly from `GET ${SERVER_URL}/tasks/246/reviews/0` (runs 1299 decomp: **approve**,
1301 correctness: **request_changes**). One BLOCKING finding, no NOTE findings.

## R1. Finding addressed

**[B1, finding 2627] Test calls `subdivideRecursively` with an incomplete `RecursiveOptions`** —
`packages/dashboard/tests/scene/recursiveSubdivisionToScene.test.ts:382`.

The finding is correct as written. `RecursiveOptions` declares `depthFraction` and `residue` without
`?` (Type Roster §1, source `recursive-subdivision.ts:100-116`), and the call passed only `levels` and
`mergeGroupSize`. The suite was green for the two reasons the reviewer names and neither is a defence:
the dashboard `tsconfig.json` scopes `include` to `src`, so ts-jest raised no diagnostic for a file
under `tests/`; and at runtime `clampDepthFraction(undefined)` falls back to `FULL_DEPTH_FRACTION`
while `run.residue !== 'recurse'` absorbs `undefined` as void. The assertions happened to remain true
only because this suite depends on neither dial.

**Fix applied:** the call now passes `depthFraction: FULL_DEPTH_FRACTION, residue: 'void'`, and the
suite's doc comment says why those two values and not the store defaults. They are the values the call
was *already* getting from the clamps, chosen deliberately so the fix is provably behaviour-preserving
rather than a re-aimed test: at full depth the wavefront is fully consumed, `residueRings` is empty
(driver line 357), and so the residue treatment is unreachable. That keeps this suite's fill census
about exactly what its title claims — a failure patch among territory tints — with no residue layer
competing for fills. Taking the store's `DEFAULT_DEPTH_FRACTION` of `0.5` instead would have been a
different test: it would put residue rings into the scene and change the failure census the fixture
was selected for.

`FULL_DEPTH_FRACTION` is imported from `@proc-geo/core` (it is already exported, `index.ts:335`) — no
literal `1` was written at the call site.

## R2. Verification that the fix has teeth

The reviewer's reproduction was re-run on both sides of the change, using a temporary out-of-tree
tsconfig that extends the dashboard's and adds `tests/` to `include` (no repo file was created):

- On `3abade7` (unmodified): `tests/scene/recursiveSubdivisionToScene.test.ts(382,64): error TS2345:
  ... is missing the following properties from type 'RecursiveOptions': depthFraction, residue` —
  the finding reproduced exactly.
- With the fix: clean, zero diagnostics.

The same pass also type-checked the other two dashboard test files in this task's ownership
(`tests/stores/useRecursiveSubdivisionStore.test.ts`, `tests/fixtures/recursive-trees.ts`) against the
strict config; both are clean, so B1 was the only instance of this class in the owned surface.

## R3. Build & test results (this cycle)

| Gate | Result |
|---|---|
| `pnpm --filter @proc-geo/core test` | **67 suites / 3418 tests, all pass** |
| `pnpm --filter @proc-geo/dashboard test` | **13 suites / 195 tests, all pass** |
| `pnpm build` (all four packages) | **clean** — core, test-fixtures, dashboard ESM+CJS+DTS; demo prerenders all 7 routes |
| `pnpm lint` | **fails, pre-existing** — see below |

The Pentagon House solver stack traces in the dashboard test output are the expected logged failure
this suite exists to exercise, not a regression; `totalFailures > 0` is an assertion of the suite.

## R4. Pre-existing lint failure, deliberately not fixed

`pnpm lint` (demo-only) fails with `@typescript-eslint/no-explicit-any` at
`apps/demo/src/app/dol-system/page.tsx:51:40`, plus an unused-var warning in
`apps/demo/src/app/AppShellLayout.tsx:17:34`. Both reproduce on a stashed, unmodified tree, are in the
`dol-system` feature rather than recursive subdivision, and are outside this task's file ownership.
This cycle's change touches one dashboard test file, which `pnpm lint` does not even read. It is not a
build error — `pnpm build` is clean — so the build-gate exception to scope discipline does not apply
and the files were left alone. Flagged here for whoever owns that page.

## R5. Open questions / risks

- **The real gap B1 exposed is structural and outside ownership**: `packages/dashboard/tsconfig.json`
  scopes `include` to `src`, so nothing type-checks `packages/dashboard/tests/**` in the standing
  gates. The fix above closes the one instance; it does not close the hole. A `tsconfig.test.json`
  (or adding `tests` to `include` with `rootDir` widened) would make ts-jest's diagnostics fire and
  catch the next one. `tsconfig.json` is not in this task's ownership, and it cannot simply be widened
  without first resolving the four pre-existing `src/components/dol-system/DolProductionComposer.tsx`
  type errors that the current `include` already surfaces — so this is left as a recommendation.
- Everything in §6 of the original debrief stands unchanged; this cycle altered no production code.

## R6. Suggested follow-ups (additional)

6. **Type-check the dashboard test tree.** Add a test-scoped tsconfig and point ts-jest at it, so a
   test that violates a published type contract fails the suite instead of passing by clamp. Fixing
   the four `DolProductionComposer.tsx` errors is the prerequisite.
