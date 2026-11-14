---
title: "Access Run Provenance: Fixed Design Decisions"
type: decision-spec
area: subdivision
status: completed
date: 2026-08-16
part_of: [recursive-skeleton-subdivision.md]
verified_by: [packages/core/tests/straight-skeleton/region.test.ts, packages/core/tests/straight-skeleton/canonicalisation.test.ts]
---

# Access run provenance

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

A region carries its polygon and the subset of its boundary that carries access. When a region is
subdivided, each child's boundary is **entirely new geometry** — some of it lying on the parent's
boundary, some being skeleton ridge, some a slice cut, some the offset contour — and each child must
know which of its own runs are roads.

**Get this wrong in the obvious way and lots front onto back fences.** A block's boundary is only
partly street; a boundary pass that treats all of it as frontage produces parcels with no access, and
the egress invariant passes them because their frontage is non-degenerate and contiguous. The
invariant is a proxy for reachability that happens to be exact only at the first level.

This is the third of the four substrates the recursive arc rests on, and the last piece of its design.
It builds no recursion driver and no labelling strategy.

## 1. Type Roster

**New — [region.ts](../../packages/core/src/straight-skeleton/region.ts)**

```ts
/** Where a run of a region's boundary came from, which is what decides whether it carries access. */
export type BoundaryProvenance =
    | 'perimeter-access'    // lies on a parent access run: inherited road
    | 'perimeter-plain'     // lies on the parent boundary, but not on an access run
    | 'ridge'               // a skeleton bisector chain: shared with the region behind
    | 'cut'                 // a slice cut: shared with the neighbour alongside
    | 'contour'             // the offset contour: the inner edge of a partial-depth pass
    | 'lane'                // a promoted radial connector, this level or an ancestor's
    | 'spine';              // a spine extracted at this level

/** A contiguous, cyclic run of a region's boundary, `[startIndex, endIndex]` inclusive. */
export interface BoundaryRun {
    startIndex: number;
    endIndex: number;
    provenance: BoundaryProvenance;
}

export interface Region {
    /** Closed polygon, clockwise, no duplicated closing vertex. */
    boundary: Vector2[];
    /** Partitions the boundary exactly: every edge belongs to exactly one run. */
    runs: BoundaryRun[];
}

/** The runs a parcel in this region may take frontage on. */
export function accessRuns(region: Region): BoundaryRun[];

/** A root region from a bare polygon, per decision 9. */
export function makeRootRegion(boundary: Vector2[], access?: BoundaryRun[]): Region;
```

**Changed**

- `canonicalisePolygon` ([canonicalisation.ts](../../packages/core/src/straight-skeleton/canonicalisation.ts)) — returns an index remap and accepts pinned indices, per decisions 6 and 7.

## 2. Decisions / Specification

### Provenance is carried, never recovered

1. **Provenance is EMITTED by the operation that creates a boundary, never recovered afterwards by
   geometry.** Recovering it would mean testing each child edge for coincidence with a parent access
   run — a proximity test, on machine-generated geometry, at tolerances this codebase has already been
   bitten by. **Proximity is never a criterion for a topological fact.** The subdivision knows the
   provenance of every edge it emits at the moment it emits it; the cost of carrying it is a tag per
   run.

2. **`Strip` already half-carries this and generalises to it.** `supportingEdgeIds` names the exterior
   edges a strip fronts and `frontage` is their polyline — which is exactly "the road-bearing part of
   this region's boundary", derived from exterior-edge identity. The generalisation is that frontage
   stops being *derived* from exterior edges and becomes *labelled* on the boundary, so that a
   spine-facing or lane-facing run can be frontage on the same footing.

3. **The runs partition the boundary exactly.** Every boundary edge belongs to exactly one run, runs
   are contiguous and cyclic, and adjacent runs never share a provenance — two adjacent runs with the
   same tag are one run. **Assert the partition**, because a gap or an overlap is silent: it produces a
   region whose frontage is quietly shorter or double-counted, and every downstream invariant still
   passes.

4. **`accessRuns` returns exactly the runs tagged `perimeter-access`, `lane` or `spine`.** Those three
   are roads. `ridge`, `cut` and `contour` are shared boundaries with a neighbour, and `perimeter-plain`
   is a parent boundary that was never a road — a region marked against a cliff or an existing piste.

5. **A region may legitimately have ZERO access runs, and that is not an error at construction.** A
   gated courtyard that stays a shared garden has no connector by design. It becomes an error only when
   something tries to slice or recurse it, which is where the check belongs.

### Surviving canonicalisation

6. **`canonicalisePolygon` returns an index remap from input index to surviving index, and runs are
   remapped through it rather than recomputed.** Removing a vertex renumbers every index after it, so
   a `BoundaryRun` recorded before canonicalisation refers to the wrong edges after it. Recomputing
   runs from geometry is decision 1's forbidden proximity test wearing a different hat. There is
   precedent for the remap in this codebase: the stroke pipeline's `inputToDeduped` maps original
   indices onto deduplicated ones for exactly this reason.

7. **Canonicalisation NEVER removes a vertex that bounds a run.** A run boundary is where access
   changes to non-access, which is semantically significant however small its deviation happens to be —
   and a lane mouth can meet a frontage almost tangentially, so the deviation genuinely can fall under
   the floor. Pinning them costs nothing (they are a handful of vertices) and removes the whole class
   of failure where a canonicalisation silently fuses a road run into the fence beside it.

8. **A pinned vertex is reported in the canonicalisation diagnostic, distinguished from a removed
   one.** A polygon whose vertices are mostly pinned is a signal the runs are fragmented, and that is
   worth seeing rather than inferring later from a strange-looking slice.

### The root

9. **A root region's access runs default to the WHOLE perimeter, and a caller may supply a subset.**
   The default matches today's behaviour, where the perimeter is the street, so nothing existing
   changes. The subset is what a region marked against a cliff, an existing piste or another region
   needs, and it is the same mechanism a region's entrance points will use — so it is built now and
   left unused rather than retrofitted through the recursion driver later.

10. **A supplied subset is validated against the boundary at construction.** Indices in range, runs
    non-overlapping, and the complement filled with `perimeter-plain` so decision 3's partition holds.
    Reject a malformed set loudly; this is caller input, and a silently-dropped access run produces
    parcels with no road and no complaint.

### Verification

11. **The partition assertion is convicted by mutation.** Hand the constructor runs with a one-edge gap
    and show it rejects them; hand it two overlapping runs and show the same. A partition check that
    cannot fail is not a check.

12. **The remap is tested against a canonicalisation that actually removes vertices**, not one that is
    a no-op on a hand-authored fixture. Subdivide a fixture's edges to create removable collinear
    vertices, tag a run that spans the subdivided stretch, canonicalise, and assert the run still
    covers the same geometry — compare positions, not indices, since the indices are exactly what
    changed.

13. **The pinning rule is tested at its hard case.** Construct a run boundary whose perpendicular
    deviation falls below the noise floor — a lane meeting a frontage almost tangentially — and assert
    the vertex survives and the runs remain distinct. **Without this test decision 7 is a comment.**

14. **The acceptance gate is the full suite twice with the failure sets intersected.** This task adds a
    module and extends one function's return; no existing test should change state, and the
    canonicalisation suite must stay green with the remap threaded through. Report actual counts.

## 3. Deferred (explicitly out of scope)

- **The recursion driver.** It consumes `Region`; it is not this.
- **Emitting provenance from `computeStrips` and `sliceStrip`.** Those are the producers and they are
  changed in the task that makes them recursive. This task defines the vocabulary and the root, so that
  when they are changed there is a fixed target to emit into rather than a shape invented at the call
  site.
- **Radial promotion itself.** The `lane` provenance exists here; creating lanes is its own task.
- **Spine extraction.** The `spine` provenance exists here; deriving spines is its own task.
- **The egress invariant re-expressed over access runs.** It consumes this vocabulary and follows it.

## 4. Retirement

Nothing is deleted. `Strip.frontage` and `Strip.supportingEdgeIds` stay exactly as they are — decision
2 describes where they generalise to, and nothing in this task performs that generalisation.
