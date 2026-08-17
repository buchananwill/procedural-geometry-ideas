---
title: "Tiling Identity Against the Canonical Boundary: Fixed Design Decisions"
type: decision-spec
status: implementer-handoff
---

# Tiling identity against the canonical boundary

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

The recursive driver's per-node tiling identity compares its segments against the boundary that was
**handed in**, not the boundary they were **derived from**. Canonicalisation runs inside the solve and
deliberately removes sub-noise-floor vertices, so those two polygons differ in area on purpose. The
identity is therefore charging an intended change as tiling error.

**The cost is measured and it is not small.** Wiring the root canonicalisation floor down to
descendants collapsed the usable floor band from `[1e-6, 3e-6]` to the single point `1e-6`, with the
first failure at `2e-6` out by `1.033e-6` relative. That is the signature of an area delta the size of
a floor-times-perimeter sliver — canonicalisation's own footprint — being scored against a tolerance
meant to catch gaps and overlaps between strips.

**This is not a request to loosen a tolerance.** It is a request to compare against the right polygon,
after which the tolerance can stay where it is.

## 1. Type Roster

**Changed — [recursive-subdivision.ts](../../packages/core/src/straight-skeleton/recursive-subdivision.ts)**

```ts
export interface RecursiveNode {
    // ...unchanged fields...
    /** The polygon handed to this node, before canonicalisation. */
    boundary: Vector2[];
    /** The polygon the solve actually ran on, after canonicalisation. Segments derive from this. */
    canonicalBoundary: Vector2[];
    /** |area(boundary) - area(canonicalBoundary)| / area(boundary). See decision 4. */
    canonicalAreaDrift: number;
}
```

No other module changes. `canonicalisePolygon` is not edited; it already returns what is needed.

## 2. Decisions / Specification

1. **The tiling identity compares segments plus residue rings against `canonicalBoundary`, never
   against `boundary`.** That is the polygon the wavefront ran on, so it is the only one the strips
   can be expected to tile. This is the arc design's decision 19 made concrete.

2. **`canonicalBoundary` is exposed on the node rather than recomputed by the caller.** Recomputing it
   means running canonicalisation a second time and trusting the two runs to agree — a second
   derivation of a quantity that already has a canonical source, which is the fault pattern the
   offset-projection header records as having cost whole rings.

3. **The drift between the two boundaries is a SEPARATE, reported quantity, not folded into the
   identity.** `canonicalAreaDrift` records it per node. Two different things are being asserted —
   that the strips tile what they were built from, and that what they were built from resembles what
   was handed in — and collapsing them into one check is what produced the current confusion.

4. **The drift bound is MEASURED, not guessed.** Sweep the corpus at several floors and depths and
   report the distribution of `canonicalAreaDrift`; then set a bound with headroom above the observed
   maximum and state both numbers where the constant lives. A bound chosen before the measurement is a
   number nobody can defend later.

5. **Re-measure the floor band and report it.** The expectation is that it reopens to at least
   `[1e-6, 3e-6]` and plausibly wider, since the mechanism that closed it is exactly what decision 1
   removes. **If it does not reopen, report that and stop** — it would mean the drift is not the cause
   and something else is, and this arc has already had one diagnosis come back wrong in sign.

6. **Full-depth behaviour is unchanged and pinned.** At `depthFraction` 1 the residue term is zero, and
   the identity's only change is which boundary it compares to. Assert the existing full-depth results
   node for node.

7. **A node whose canonicalisation removed nothing must have `canonicalBoundary` equal to `boundary`
   and a drift of exactly zero** — not approximately zero. Most of the corpus is in this case, so a
   non-zero drift there means canonicalisation is perturbing coordinates rather than only deleting
   vertices, which would be a defect in it rather than here.

8. **The acceptance gate is the full core suite twice with the failure sets intersected, the dashboard
   suite green, and `pnpm build` clean across all four packages.** Core stood at 67 suites and 3418
   tests; report actual counts. **Run the suites standalone rather than chained** — a piped, chained
   invocation produced a spurious failure during this arc's verification.

## 3. Deferred (explicitly out of scope)

- **Changing `SKELETON_NOISE_FLOOR`.** Decision 5 re-measures the band; choosing a new value from it is
  a separate call.
- **Radial promotion, spine labelling, access-run wiring, merge heuristics, leaf slicing.**
- **The canonicalisation stage itself.** It is behaving as specified; only the accounting around it is
  wrong.

## 4. Retirement

Nothing is deleted. `boundary` keeps its current meaning — the polygon handed in — and gains a
sibling rather than being redefined.
