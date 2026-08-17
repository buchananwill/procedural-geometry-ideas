# Task 247 — Tiling identity against the canonical boundary

Spec: `docs/notes/tiling-identity-against-canonical-boundary-decisions.md`
Ownership: `packages/core/src/index.ts`, `packages/core/src/straight-skeleton/recursive-subdivision.ts`,
`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`,
`packages/dashboard/tests/fixtures/recursive-trees.ts`.

## 1. Case: greenfield

`git log` shows `43765ea Specify the tiling identity against the canonical boundary` as the tip, and
nothing after it. No plan, no partial implementation. So this document is authored now, committed
first, and is the recovery baseline for any resumed run.

## 2. Task Summary

The recursive driver's per-node tiling identity sums a node's segment areas plus its residue-ring
areas and compares them against `RecursiveNode.boundary` — the polygon **handed in**. But
`solveSkeleton` canonicalises the polygon before solving, so the segments and the offset rings both
derive from a **smaller** polygon than the one on the node. Where canonicalisation removed anything,
the identity charges that intended removal as tiling error. Task 246 measured the cost: wiring the
root floor down to descendants collapsed the usable floor band from `[1e-6, 3e-6]` to the single
point `1e-6`, first failing at `2e-6` by `1.033e-6` relative.

The fix is to compare against the polygon the strips came from, and to report the difference between
the two polygons as its own quantity.

## 3. Phased plan

### Phase A — plan committed (this document)

Checkpointed before any code moves.

### Phase B — the node carries the polygon it solved

`RecursiveNode` gains `canonicalBoundary: Vector2[]` and `canonicalAreaDrift: number`, exactly as the
spec's type roster states. `SegmentOutcome`'s success arm carries the canonical boundary out of
`divideRegion`, because that is the one function that holds the `SkeletonSolveResult`.

**Where `canonicalBoundary` comes from — decision 2.** Read straight off the solved graph's exterior
ring, `graph.nodes[0 .. numExteriorNodes)`, denormalised into caller space by `solveSkeleton` before
it returns. That ring **is** the polygon the wavefront ran on: `computeStrips` reads its segment
boundaries off the very same nodes (`strip-decomposition.ts` lines 572–586), and `computeOffsetRings`
projects the same graph. Nothing is canonicalised a second time and nothing is re-derived, which is
what decision 2 asks for; recomputing `canonicalisePolygon` here would be a second derivation of a
quantity that already has a canonical source.

Bit-exactness of that route was measured before choosing it: across `ALL_TEST_POLYGONS`,
`denormalisePosition(normalisePosition(v))` reproduces `v` with **zero** mismatching components and a
worst-case delta of exactly `0` — the power-of-two scale of `makeSkeletonNormalisation` is what makes
that hold. So decision 7's *exactly* zero drift is reachable through the graph, not merely
approachable.

`canonicalAreaDrift` = `|area(boundary) − area(canonicalBoundary)| / area(boundary)`, per the roster.

A node that never solved — degenerate, or a failed/throwing solve — has no canonical polygon. It
records `canonicalBoundary` as the boundary it was handed and a drift of zero, which is the honest
reading of "nothing was canonicalised", and keeps both fields non-optional.

### Phase C — the identity moves, and the drift is asserted separately

- `tilingProblems` in the core suite sums segments plus residue rings against
  `canonicalBoundary`, never `boundary` (decision 1). Tolerance stays at `AREA_TOLERANCE_FRACTION`
  = `1e-12`; the spec is explicit that no tolerance loosens.
- A separate check reports `canonicalAreaDrift` against a bound (decision 3). The bound is
  **measured first** (decision 4): sweep the corpus at several floors and depths, record the
  distribution, then set the bound with headroom above the observed maximum and state both numbers
  where the constant lives.
- Decision 7 gets its own test: every node whose `canonicalBoundary` has the same vertex count as its
  `boundary` must have coordinates equal bit for bit and a drift of exactly `0`.
- Decision 6 gets its own test: at `depthFraction` 1 the existing full-depth reference comparison is
  asserted node for node, unchanged.

### Phase D — dashboard fixtures

`packages/dashboard/tests/fixtures/recursive-trees.ts` hand-builds `RecursiveNode`s and must carry the
two new fields or it will not typecheck. Nothing was canonicalised in a hand-built tree, so
`canonicalBoundary` is the same ring and the drift is `0`.

### Phase E — re-measure the floor band (decision 5)

Method as task 246 §5: `SKELETON_NOISE_FLOOR` edited to each candidate in turn, the corpus swept, the
edit reverted (`canonicalisation.ts` is outside this task's ownership, so the measurement is reported
and the constant is not changed — that is explicitly deferred by the spec's §3). Report the band. If
it does not reopen to at least `[1e-6, 3e-6]`, **report and stop** — decision 5 is explicit.

### Phase F — acceptance gate (decision 8)

Core suite twice, standalone invocations, failure sets intersected; dashboard suite; `pnpm build`
across all four packages. Report actual suite and test counts.

## 4. Design Decisions

Recorded as they are taken; see §5 of the final debrief.

## 5. Build & Test Results

Pending initial build.

## 6. Open Questions / Risks

- Whether the floor band reopens is the load-bearing unknown. Decision 5 pre-commits to reporting a
  negative result rather than working around it.
- `canonicalisation.ts` still documents the band as `[1e-6, 3e-6]` "pending decision 7 being wired";
  it is outside ownership and task 246 already flagged it.

## 7. Suggested Follow-ups

To be filled in at the end of the run.
