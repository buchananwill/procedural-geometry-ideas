---
title: "Partial Depth and the Residue Stream: Fixed Design Decisions"
type: decision-spec
status: implementer-handoff
---

# Partial depth and the residue stream

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

The recursive driver currently solves at full depth only, where the segments tile the region exactly
and there is nothing left over. Below full depth a solve yields **two** child streams: the segments,
and the **residue** — the interior contour the wavefront has not yet reached. This task adds the
second stream, makes each independently recursable, and renders both.

**The residue is what makes droste-style recursion possible**, and it is only now reachable: at exactly
the offsets symmetric geometry produces, `computeOffsetRings` used to drop rings, and the
simultaneous-mirror-event fix closed that. This task is the first consumer of that fix.

It also wires the one canonicalisation decision that was specified and then left unconnected, which
is currently costing real headroom — see decision 6.

## 1. Type Roster

**Changed — [recursive-subdivision.ts](../../packages/core/src/straight-skeleton/recursive-subdivision.ts)**

```ts
export interface RecursiveOptions {
    levels: number;                 // clamped to [1, 3], unchanged
    mergeGroupSize: number;         // unchanged
    /** Inward depth as a fraction of each node's own max offset, in (0, 1]. 1 = full depth. */
    depthFraction: number;
    /** What becomes of a node's residue. `void` leaves it whole and undivided. */
    residue: 'recurse' | 'void';
}

export interface RecursiveNode {
    level: number;
    boundary: Vector2[];
    segments: Strip[];
    /** Children grown from the segments. Unchanged in meaning. */
    children: RecursiveNode[];
    /** Inner contours at this node's depth, empty at full depth. See decisions 3 and 4. */
    residueRings: Vector2[][];
    /** Children grown from the residue rings, one per ring, in the same order. */
    residueChildren: RecursiveNode[];
    failure?: string;
}
```

**Changed — the `/recursive` page and its dashboard components:** a depth control, a residue-treatment
control, and residue rendering.

**Reused unchanged:** `solveSkeleton`, `computeStrips`, `computeOffsetRings`, `computeMaxOffset`,
`canonicalisePolygon`, `SKELETON_NOISE_FLOOR`.

## 2. Decisions / Specification

### Depth

1. **Depth is a FRACTION of each node's own maximum offset, not an absolute length.** A sub-region is
   smaller than its parent, so an absolute depth that is a shallow rim at level 0 would consume a
   level-2 cell entirely. The fraction is dimensionless and crosses the normalisation seam untouched.

2. **`depthFraction` of 1 reproduces today's behaviour exactly**, with no residue and no residue
   children. This is a regression gate, not a description: assert that the existing full-depth results
   are unchanged, node for node.

### The residue

3. **`computeOffsetRings` returns rings PLURAL and the driver must honour that.** Offsetting a
   non-convex polygon inward is not shape-preserving — where the boundary pinches, the wavefront
   separates into disconnected loops. Each ring is its own child region with its own recursion.
   **Treating the residue as a single polygon is the obvious wrong implementation** and will appear
   correct on convex fixtures.

4. **A ring with fewer than three vertices, or with zero area, is discarded rather than recursed**, and
   the discard is recorded on the node the same way a failed child is.

5. **`residue: 'void'` keeps the rings and grows no children from them.** They still render, still
   count towards the tiling identity, and are the courtyard of the boundary-mode reading. This is not
   the same as having no residue.

### The floor, finally connected

6. **The ROOT region's canonicalisation floor is computed once and passed down to every descendant.**
   This is the canonicalisation spec's decision 7, specified and never wired. Today each sub-region
   canonicalises against its own extent, so a thin sliver scales up and its floor shrinks in world
   terms — the exact failure that decision exists to prevent. **It is currently costing measurable
   headroom**: the usable floor band is `[1e-6, 3e-6]`, bounded above by this arc's own per-level
   tiling identity failing at `5e-6`, where the corpus alone would permit four decades.

7. **Re-measure the band after wiring it and report both bounds.** The expectation is that the upper
   bound rises once sub-regions stop canonicalising against their own extent. **If it does not move,
   say so** — that would mean the diagnosis in the canonicalisation debrief is wrong, which is worth
   more than a silent confirmation.

### Accounting

8. **The tiling identity per node becomes segments plus residue rings equals the node's area**, to the
   tolerance the existing strip tests use. At full depth the residue term is zero and this reduces to
   today's check.

9. **Failure stays data, never an exception** — unchanged, and it now covers the residue path too. A
   residue ring that fails to solve is recorded on its child node and its siblings continue.

### The page

10. **A depth control, defaulting to a value that shows a residue.** Full depth is the current default
    and shows none, so a page that opens at 1.0 demonstrates nothing new. Pick a default that makes the
    residue plainly visible on the default fixture.

11. **Residue rings are rendered distinctly from segments at every level**, and distinguishably from
    each other when a pinch splits them. The point of the picture is that the interior is a *different
    kind of thing* from the ring of segments around it.

12. **A control for the residue treatment**, so `recurse` and `void` can be compared directly. The
    difference between a subdivided core and a courtyard is the whole boundary-versus-droste question,
    and it should be one click.

13. **Report the counts**, extending the existing readout: residue rings per level, and how many were
    discarded under decision 4.

### Verification

14. **A pinching fixture is mandatory in the tests**, chosen so its residue genuinely splits into more
    than one ring at some depth. Decision 3 is invisible without one. Report which fixture and at what
    depth it splits.

15. **Sweep `ALL_TEST_POLYGONS` at several depth fractions** — include a shallow one, a middle one and
    1.0 — at `levels` 1 to 3, asserting no throw, decision 8's tiling per node, and recording which
    fixtures produce failures where. **Report the failure table rather than excluding fixtures**; how
    solver output behaves as solver input is the measurement this arc most wants.

16. **The acceptance gate is the full core suite twice with the failure sets intersected, the dashboard
    suite green, and `pnpm build` clean across all four packages.** Core stood at 67 suites and 3403
    tests; report actual counts.

## 3. Deferred (explicitly out of scope)

- **Radial promotion.** A partial-depth pass creates an inner void, and the arc design requires any
  level creating one to promote a connector. That is its own task and its absence does not block this
  one — nothing here slices lots, so nothing yet needs egress.
- **Spine labelling and the skeleton tree.** The substrate exists; using it is separate.
- **Access-run provenance on the emitted boundaries.** `Region` exists and has no consumer yet;
  wiring it belongs with the task that slices leaves into lots, where access finally matters.
- **Any merge heuristic beyond `mergeGroupSize`.**
- **Parcel slicing at the leaves.**

## 4. Retirement

Nothing is deleted. Full-depth behaviour is preserved exactly and is pinned by decision 2.
