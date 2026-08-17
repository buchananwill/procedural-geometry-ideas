---
title: "Per-Level Recursion Specs: Fixed Design Decisions"
type: decision-spec
status: implementer-handoff
---

# Per-level recursion specs

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

`RecursiveOptions` carries `depthFraction`, `mergeGroupSize` and `residue` as scalars applied
uniformly to every level. The arc's design says a level is its own spec with its own treatment of its
own two child streams — the segments and the residue — and the flat shape cannot express the
compositions the whole recursive model exists to produce.

It also cannot express three of the four segment/residue combinations at all: **segments always
recurse**, so "residue only", "segments only" and "neither" are unreachable. The most interesting
reading in the design — a boundary pass whose courtyard is subdivided differently from its ring — is
one of the ones that cannot currently be asked for.

**This is a parameter-shape change, not a geometry change.** No solver file is touched and the
subdivision arithmetic is unchanged.

## 1. Type Roster

**Changed — [recursive-subdivision.ts](../../packages/core/src/straight-skeleton/recursive-subdivision.ts)**

```ts
/** What one level does to the region it is given. */
export interface LevelSpec {
    /** Inward depth as a fraction of this region's own max offset, in (0, 1]. */
    depthFraction: number;
    /** Adjacent exterior edges fused into one segment at this level. */
    mergeGroupSize: number;
    /** Whether this level's segments become regions at the next level. */
    segments: 'recurse' | 'leaf';
    /** Whether this level's residue rings become regions at the next level. */
    residue: 'recurse' | 'void';
}

export interface RecursiveOptions {
    /** One spec per level, outermost first. Length 1..3; the length IS the depth. */
    levels: LevelSpec[];
}
```

**Changed:** the `/recursive` page, its store, its controls panel and its scene adapter.

## 2. Decisions / Specification

### Shape

1. **`levels` is an ordered array of specs and its LENGTH is the recursion depth.** The separate
   numeric `levels` count is retired: a count plus uniform options cannot say what the design requires
   a level to say, and keeping both would let them disagree.

2. **A level's spec governs the region it is handed, not the regions it produces.** `levels[0]`
   describes how the root is divided; `levels[1]` describes how each of the root's children is
   divided. This is the only reading under which `segments` and `residue` mean the same thing at every
   level.

3. **At the last level both streams are terminal regardless of what the spec says.** A `recurse` on
   `levels[levels.length - 1]` has nowhere to go. Treat it as `leaf`/`void`, and **say so in the UI**
   rather than silently ignoring it — a control that appears to do nothing is worse than one that is
   visibly disabled.

4. **All four segment/residue combinations are legal and must work**, including `leaf` + `void`, which
   makes that level terminal, and `leaf` + `recurse`, which is the droste reading proper: the ring of
   segments is final and only the courtyard subdivides further.

5. **A level with `depthFraction` of 1 produces no residue, so its `residue` setting is inert.**
   Disable it in the UI at that depth and state why. This is the design's validity rule showing up in
   the one place it currently can.

### Compatibility

6. **A convenience constructor builds a uniform `levels` array from the old scalar arguments**, so
   existing call sites and tests have a one-line migration and the old behaviour keeps a name. It is a
   helper, not a second source of truth — the driver reads `levels` only.

7. **The default configuration must still produce a recursive picture on first paint**, unchanged in
   spirit from the previous task. Choose per-level defaults that do so, and prefer defaults that show
   the levels *differing* from each other over defaults that are uniform — the point of the change is
   visible in a heterogeneous tree and invisible in a homogeneous one.

### The page

8. **One row of controls per level, labelled by level, with the level count controlled by adding and
   removing rows.** Depth, merge group size, segments and residue each per row. The panel is the only
   place the composition is legible, so it should read as a list of levels rather than as a set of
   globals.

9. **The readout reports per level what each stream actually did** — segments produced and recursed or
   left as leaves, residue rings produced and recursed or left as voids. **A level whose setting was
   overridden by decision 3 must show that**, because a spec that says `recurse` and a tree that shows
   leaves is exactly the disagreement the readout exists to catch.

10. **Rendering distinguishes a recursed stream from a terminal one.** A leaf segment and a segment
    that happens to have no children are different things, and the picture should not present them
    identically.

### Verification

11. **Every one of the four combinations is covered by a test at more than one level**, asserting the
    resulting tree shape: which nodes have segment children, which have residue children, and which
    have neither. Decision 4's `leaf` + `recurse` case is the one most likely to be quietly broken,
    because it is the only one where a node has residue children and no segment children.

12. **A heterogeneous tree is the headline test** — different `depthFraction`, `mergeGroupSize` and
    stream settings at each level — asserting that each level's spec governed the level it was handed
    and not a neighbour. An off-by-one in decision 2 would pass every uniform test.

13. **The existing per-node tiling identity holds unchanged**, against `canonicalBoundary`, at every
    node of a heterogeneous tree. This change must not touch it.

14. **The acceptance gate is the full core suite twice with the failure sets intersected, the
    dashboard suite green, and `pnpm build` clean across all four packages.** Run the suites
    standalone rather than chained. Core stood at 67 suites and 3427 tests; report actual counts.

## 3. Deferred (explicitly out of scope)

- **Spine labelling and the skeleton tree.** The next axis to become per-level, and not this task.
- **Radial promotion, access-run wiring, leaf slicing into parcels.**
- **Merge objectives beyond `mergeGroupSize`.** The field becomes per-level here; what it means does
  not change.
- **Depth beyond three levels.**

## 4. Retirement

The scalar `depthFraction`, `mergeGroupSize`, `residue` and numeric `levels` fields on
`RecursiveOptions` are **removed**, not deprecated in place. Decision 6's constructor is the migration
path, and leaving the old fields alongside the array would create two ways to say the same thing that
can disagree.
