# Straight Skeleton Bug Investigation

## Coordinate System Convention

Canvas/screen coordinates use **Y-down** (Y increases downward). The polygon vertices
are ordered **clockwise in screen space** (equivalently counter-clockwise/widdershins
in standard Cartesian Y-up). The algorithm's winding convention is internally consistent
throughout — the cross-product direction check in `addBisectionEdge`, the CW/WS exterior
parent naming, and the edge ordering in `initStraightSkeletonGraph` all agree.

**Winding order is not a source of bugs.**

---

## Bug A: Negative distances accepted by `updateInteriorEdgeIntersections`

**File:** `algorithm-helpers.ts`, `updateInteriorEdgeIntersections`

**Symptom:** Edge 12 in the awkward hexagon gets `length: -879`, producing a collision
node at `(-393, 633)` — far outside the polygon.

**Root cause:** `updateInteriorEdgeIntersections` accepted any distance shorter than the
current length, including negative values. When `applyEvaluation` processes an edge's
intersectors, it calls `updateInteriorEdgeIntersections(otherEdge, selfId, distanceAlongOther)`.
If `distanceAlongOther` is negative (intersection is behind the other ray's source), this
was blindly accepted as "shorter" than the current length.

**Trace:** Edge 13 evaluates against edge 12. The ray-ray intersection yields
`distanceNew=902` (forward along 13) and `distanceOther=-879` (behind edge 12's source).
Phase 2 in `evaluateEdgeIntersections` correctly requires `distanceNew > 0` for the
evaluated edge, so edge 13 accepts this as valid for itself. But `applyEvaluation` then
calls `updateInteriorEdgeIntersections(edge12, edge13, -879)`, which sets
`edge12.length = -879`.

**Fix:** Added an early return guard:

```ts
if (fp_compare(length, 0) <= 0) {
    return false;
}
```

---

## Bug B: Stale intersector references after edge acceptance

**File:** `algorithm-helpers.ts`, new function `acceptEdgeAndPropagate`

**Symptom:** After an interior edge is accepted (consumed by a collision event), other
edges that had it as their closest intersector retain stale `.length` and
`.intersectingEdges`. This causes `evaluateEdgeIntersections` to incorrectly filter valid
intersection candidates via the `distanceOther <= otherEdgeData.length` check (line 248).

**Root cause:** `updateInteriorEdgeIntersections` is monotonically decreasing — it only
shortens lengths, never increases them. When an edge's intersector is accepted, the edge
needs a full re-evaluation to find its next-closest intersector, but nothing triggers this.
The dirty-queue propagation in `reEvaluateEdge` only enqueues edges that need *shorter*
lengths, missing the case where an edge's length should *increase* after its partner
disappears.

**Fix:** Created `acceptEdgeAndPropagate(edge, context)` which wraps `acceptEdge` and,
when accepting an interior edge, iterates all active interior edges to find any whose
`intersectingEdges` includes the just-accepted edge, then calls `reEvaluateEdge` on each.

Replaced all `acceptEdge` calls in `performOneStep` (algorithm-helpers.ts) and
`computeStraightSkeleton` (algorithm.ts) with `acceptEdgeAndPropagate`.

**Important note:** An earlier version of this fix also reset `ie.length = MAX_VALUE` and
`ie.intersectingEdges = []` before calling `reEvaluateEdge`. This was actively harmful —
it made the edge appear to extend infinitely during concurrent dirty-queue evaluations,
causing spurious far-away intersections. The reset is unnecessary because
`evaluateEdgeIntersections` computes fresh and `applyEvaluation` directly overwrites the
edge's state.

---

## Bug C (unfixed): Wrong parent pairing in `pushHeapInteriorEdgesFromParentPairs`

**File:** `algorithm-helpers.ts`, `pushHeapInteriorEdgesFromParentPairs`

**Symptom:** After fixing bugs A and B, the awkward hexagon still fails at step 3 with
`"Expected both arrays to be equal length: clockwise = 1; widdershins = 2"`.

**Root cause:** The sort-and-zip pairing algorithm creates non-adjacent exterior edge
pairings. At step 1, `buildExteriorParentLists` produces CW=[2,5] and WS=[1,4]. The
algorithm sorts both, then pairs CW[0] with the first WS element >= CW[0]:

- CW=2 pairs with WS=4 (skipping WS=1 because 1 < 2)
- CW=5 pairs with WS=1 (wrapping around)

This creates edge 13 = (CW=2, WS=4) and edge 14 = (CW=5, WS=1). Both bridge over
exterior edge 3 — they are topologically wrong.

**Correct pairings:** Each new bisector should connect adjacent exterior edges in the
remaining polygon. After accepting exterior edge 0, the remaining polygon edge order is
1,2,3,4,5. The correct pairings are:

- (CW=2, WS=1) — adjacent
- (CW=5, WS=4) — adjacent

**Impact:** The wrong pairings cascade: edge 13 (CW=2, WS=4) eventually collides with
edge 10 (CW=4, WS=3) at a node where exterior edge 4 gets accepted. But since the
parents are wrong, this removes one CW parent without a matching WS parent, causing the
array-length assertion to fail.

**Status:** Not yet fixed. The pairing logic needs to be rewritten to respect the circular
ordering of exterior edges around the polygon, pairing each CW parent with the WS parent
that is its immediate predecessor in the remaining (non-accepted) edge ring.
