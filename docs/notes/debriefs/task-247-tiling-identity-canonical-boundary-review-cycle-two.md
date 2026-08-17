# Task 247 — Tiling identity against the canonical boundary (review cycle 2 response)

## Task Summary

Cycle 1 returned one `request_changes` (correctness, run 1309) and one `approve` (decomp, run 1308).
This pass resolves correctness's single BLOCKING finding [B1], its NOTE [N1], and both of decomp's
NOTEs [N1]/[N2]. The behaviour under `docs/notes/tiling-identity-against-canonical-boundary-decisions.md`
is otherwise unchanged: decision 1's identity is still written against `canonicalBoundary`, decision 3's
drift is still reported separately, and decision 7's exactly-zero case is untouched.

The BLOCKING finding was real and is fixed at its root: `divideRegion` canonicalised each region
*before* the `try` block, then **discarded** the ring it had computed whenever the solve came back
incomplete or threw. `subdivideNode` then substituted the region's own `boundary` and hard-coded
`canonicalAreaDrift: 0`, on the false premise that "no solve completed, so no canonicalisation
happened either". Canonicalisation runs ahead of the wavefront and does not depend on it finishing —
five nodes in the corpus lose a vertex to the floor and *then* fail — so that was a real removal
reported as no removal, i.e. a silent correction.

## Changes Made

- **`packages/core/src/straight-skeleton/recursive-subdivision.ts`** (modified) — **[correctness B1]**
  - `SegmentOutcome`'s failure arm now carries `canonicalBoundary: Vector2[]` instead of
    `canonicalBoundary?: undefined`, so the ring is on **both** arms of the union.
  - `divideRegion`'s two failure returns (`Incomplete solve`, `Subdivision threw`) carry the
    `canonicalBoundary` that `canonicaliseRegion` already computed, rather than dropping it.
  - `subdivideNode`'s post-solve failure branch reports `outcome.canonicalBoundary` and the **real**
    `canonicalAreaDrift(clockwise, outcome.canonicalBoundary)`, no longer `clockwise` and `0`.
  - JSDoc corrected on `RecursiveNode.canonicalBoundary` and `RecursiveNode.canonicalAreaDrift`, and
    on `SegmentOutcome` and `divideRegion`: the zero-drift case is now stated as **degenerate only**
    (screened before anything is canonicalised), not "degenerate, failed or throwing".
  - **[decomp N1]** Added `UnsubdividedStreams` (`Pick<RecursiveNode, …>`) and `noSubdivision()`, so
    the two failure returns spread one shared empty-subtree value instead of restating four fields
    each. A function rather than a constant, so no two failed nodes alias the same arrays.
- **`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`** (modified)
  - `structuralProblems`: the "failed node is its own canonical form" rule is now scoped to
    `failureKind(...) === 'degenerate'`. A node that failed to *solve* is no longer required to
    report an unchanged ring — that requirement was the defect written down as an invariant.
  - **New test** `reports what the floor removed from a region that then failed to solve` — a
    metamorphic pair. Takes a region the driver itself produced and cannot solve (`unsolvableRegion`,
    found in the corpus and verified to fail again as a root of its own), inserts one sub-floor vertex
    on its longest edge (`bulgeLongestEdge`), and asserts: the failure is the same kind and carries the
    same solver complaint; the canonical ring is unchanged vertex-for-vertex; and the drift is now
    non-zero, two orders of magnitude above the tiling tolerance, and equal to the ring pair's own
    relative area difference. Verified **red** against the pre-fix code (reported the 11-vertex input
    ring and a drift of 0) and green after.
  - **New test** `reports the canonicalisation its own solve was set up with, at every failed node` —
    corpus sweep at merge group 4 across the three swept depths. For every non-degenerate failed node
    it recomputes the surviving ring from `canonicalisePolygon` at the floor that node was really
    solved at (`canonicalRingOf`) and requires the node to report exactly that ring and exactly that
    drift. Non-vacuity is asserted (`reduced > 0`: five such nodes today). Also verified red pre-fix.
  - Split the old `reports a region that never solved as its own canonical form` into
    `…turned away as degenerate…` (unchanged claim, now correctly justified) and
    `…failed to solve as unchanged only where the floor took nothing` (the Rectangle child, which
    reports no change because its floor found nothing — not because it failed).
  - **[correctness N1]** `leaves the region short by exactly the residue…` now sums against
    `root.canonicalBoundary`, not `root.boundary`, per decision 1.
  - `CORPUS_CANONICAL_AREA_DRIFT_BOUND`'s measurement note re-measured and updated: over the same
    14 404-node sweep, **31** nodes (was 26) now lose a vertex, of which **5** are nodes that went on
    to fail; the maximum drift is unchanged at `1.6e-15` (the failed five top out at `2.2e-16`), so the
    `1e-14` bound keeps its ~6× headroom and is **not** changed. Decision 4's bound stays measured.
  - New helpers: `canonicalRingOf`, `relativeAreaDrift`, `bulgeLongestEdge`, `sameBoundingBox`,
    `unsolvableRegion`, and the `FAILING_REGION_MERGE_GROUP_SIZE` constant.
- **`packages/dashboard/tests/fixtures/recursive-trees.ts`** (modified) — **[decomp N2]** Extracted
  `UNCANONICALISED` (typed `Pick<RecursiveNode, 'canonicalBoundary' | 'canonicalAreaDrift'>`) and
  spread it into all three node factories, replacing the triplicated pair of fields.
- **`packages/core/src/index.ts`** — untouched, as in cycle 1. The barrel already re-exports
  `RecursiveNode` and `SegmentOutcome`; no new public name was added.

## Design Decisions

- **The degenerate branch keeps `canonicalBoundary: boundary` and a hard `0`, and that is not the
  defect being fixed.** `degenerateRegionFailure` runs before `divideRegion`, so no canonicalisation
  has happened at all on that path. It is also the only place a hard zero is safe: a degenerate region
  may have fewer than three vertices or zero area, and running the drift formula there would divide by
  zero. The JSDoc now says exactly this instead of the old blanket claim.
- **The metamorphic test bulges on whichever side leaves the bounding box unmoved.** Measured while
  writing it: `makeSkeletonNormalisation` reads the box, so a vertex that pushes it out by a millionth
  rescales and re-centres every coordinate the solve then runs on — enough to flip one corpus region
  from failing to solving, which would have quietly destroyed the property under test. The helper tries
  both perpendicular directions and takes the box-preserving one, and throws rather than proceeding if
  neither is.
- **The failure string is compared by kind plus containment, not by equality.** The bulged run's
  `Incomplete solve:` prefix gains one extra `vertices-canonicalised` diagnostic — canonicalisation
  reporting the very removal under test — so the plain run's complaint is asserted as a substring of
  the bulged run's rather than as an equal string.
- **`unsolvableRegion` searches the corpus rather than hard-coding an 18-vertex blob.** Hand-authoring
  an unsolvable polygon means guessing at what defeats this solver, which is a moving target; a region
  the recursion cut for itself is the real article. The finder re-checks that the region fails again as
  a root of its own (a node's floor is its root's, said in that node's unit space, so not every failing
  node reproduces standalone) and throws a named error if the corpus stops producing one.
- **The corpus sweep runs at merge group 4 only.** All five failed-and-canonicalised nodes appear at
  that group size and at none smaller, so sweeping the default would check the property against a
  population that does not contain the case. Cost is ~2.7 s.
- **`CORPUS_CANONICAL_AREA_DRIFT_BOUND` was re-measured but deliberately not moved.** The fix adds five
  nodes to the reduced population without moving the maximum, so changing the constant would be churn.

## Build & Test Results

Run standalone, not chained, per decision 8.

- `pnpm --filter @proc-geo/core test` — **67 suites, 3427 tests, all passing**, run twice (33.7 s,
  31.6 s). Failure sets intersected: empty both times. Cycle 1 stood at 3424; the three new tests are
  the two added here plus the split of the old "never solved" test into two.
- `pnpm --filter @proc-geo/dashboard test` — **13 suites, 195 tests, all passing.**
- `pnpm build` — **clean across all four packages** (core, test-fixtures, dashboard, demo; DTS builds
  succeeded, Next.js compiled).
- `pnpm lint` — **fails, pre-existing and unrelated.** One error (`no-explicit-any` at
  `apps/demo/src/app/dol-system/page.tsx:51`) and one warning (`no-unused-vars` at
  `apps/demo/src/app/AppShellLayout.tsx:17`), both in `apps/demo`, which this task does not own and did
  not touch; `git log` puts both on commit `a302d3b`, before this arc. Reported rather than fixed.

Both new tests were confirmed **red** against the pre-fix production code by temporarily restoring the
old failure branch, then green again after restoring the fix.

## Open Questions / Risks

- **The corpus sweep's non-vacuity assertion is solver-dependent.** `expect(reduced).toBeGreaterThan(0)`
  holds because five corpus nodes lose a vertex and then fail. If the solver improves until that count
  is zero, the assertion fails. The comment at the assertion says what to do about it: the metamorphic
  pair still pins the behaviour, and the sweep would then need a region built for it — the assertion is
  not to be quietly deleted.
- **`unsolvableRegion` throws if the corpus ever stops producing a region that fails standalone.** That
  is deliberate — a silent skip would leave the metamorphic test passing on nothing — but it is a
  failure mode a future solver improvement can trigger.
- **The drift on the five corpus nodes is small** (four at exactly zero, one at `2.2e-16`), because the
  vertices the floor removes there are near-exactly collinear. What the corpus sweep really convicts is
  the *ring* (18 vertices reported where 17 survive); the metamorphic test is what makes the drift
  itself load-bearing.

## Suggested Follow-ups

- Decision 5's floor-band re-measurement is recorded in the cycle-1 debrief; nothing here changes it,
  since the drift maximum did not move.
- `apps/demo`'s two standing lint problems want an owner.
- `boundingDiagonal` in the recursive-subdivision suite still derives its own min/max; it could take
  `boundsOfPoints` from core now that the suite imports it. Left alone as out of scope for this cycle.
</content>
</invoke>
