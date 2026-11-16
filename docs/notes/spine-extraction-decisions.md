---
title: "Spine Extraction: Fixed Design Decisions"
type: decision-spec
area: subdivision
status: completed
date: 2026-08-17
part_of: [recursive-skeleton-subdivision.md]
verified_by: [packages/core/tests/straight-skeleton/spine.test.ts, packages/dashboard/tests/scene/regionSpine.test.ts, packages/dashboard/tests/components/recursive-readout-text.test.ts, packages/dashboard/tests/scene/recursiveSubdivisionToScene.test.ts, packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts]
---

# Spine extraction

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

A region's straight skeleton is a tree. Its **spine** is the part of that tree that would carry a road
— and which part that is has three candidate definitions that have never been compared, because until
now there was no tree structure to compare them on.

**This task extracts and draws them. It does not retarget frontage.** Lots do not exist yet, so there
is nothing yet to face a spine; wiring the spine into the access model belongs with leaf slicing. The
deliverable is the ability to look at all three on real strokes and settle which definition is right,
which is a judgement the geometry cannot make for itself.

The substrate is already built: `buildSkeletonTree` gives adjacency, degree, leaves, edge lengths and
per-node offsets, and `skeletonTreeDiameter` gives the weighted longest path. **Each strategy is a
filter over that, and should be thirty to sixty lines.** If one is turning into a traversal of its
own, the substrate is being bypassed.

## 1. Type Roster

**New — [spine.ts](../../packages/core/src/straight-skeleton/spine.ts)**

```ts
export type SpineStrategy =
    | {kind: 'diameter'}
    | {kind: 'wavefront-time'; fraction: number}
    | {kind: 'whisker-prune'; fraction: number};

export interface Spine {
    /** Node ids retained, and the tree edges between them. */
    nodeIds: number[];
    edges: SkeletonTreeEdge[];
    /** Connected component count over the retained edges. 1 is a usable spine. */
    componentCount: number;
    /** Total length of the retained edges. */
    length: number;
}

export function extractSpine(tree: SkeletonTree, strategy: SpineStrategy): Spine;
```

**Changed:** the `/recursive` page, its store, controls panel and scene adapter, to select a strategy
per level and draw the result.

**Reused unchanged:** `buildSkeletonTree`, `skeletonTreeDiameter`, `SkeletonTree`, `SkeletonTreeEdge`.

## 2. Decisions / Specification

### The three strategies

1. **`diameter` retains exactly the weighted longest leaf-to-leaf path** from
   `skeletonTreeDiameter`. No parameter. Always connected, always ends at two extremities, and so
   always a through-route rather than a cul-de-sac.

2. **`wavefront-time` retains every tree edge both of whose endpoints have an offset at or above
   `fraction × maxOffset`.** Keeps the deep interior and discards everything near the boundary.
   Exterior nodes have offset zero and so are always discarded, which is intended.

3. **`whisker-prune` iteratively removes leaf edges shorter than `fraction × <the tree's own
   scale>` and repeats to a fixed point.** Stays connected by construction, because only leaves are
   ever removed. **State which scale the fraction is of** — the diameter's length is the natural
   choice — and put it in the function's doc comment, not only in the tests.

4. **Both fractions are dimensionless and in `[0, 1]`**, so a slider means the same thing on a
   courtyard and on a whole region. This is the same rule the arc applies to every threshold; a spine
   threshold in world units would be meaningless across levels.

5. **A strategy returns a `Spine` whatever happens, including an empty one.** A threshold above
   everything retains nothing, and that is a legitimate answer to draw and count rather than an error
   to throw.

### Disconnection

6. **`componentCount` is computed, and a `wavefront-time` spine may legitimately exceed one.** In a
   lobed region the lobe centres can survive the threshold while the thin neck between them does not.
   **Do not repair it, do not take the largest component, and do not fail** — report it, because a
   disconnected spine is exactly the evidence needed to judge the strategy, and silently patching it
   would hide the strategy's main weakness.

7. **`diameter` and `whisker-prune` must always return `componentCount === 1` on a connected tree**,
   by construction. Assert it rather than assuming it — if either ever reports otherwise, the bug is
   in the strategy and the assertion is where it surfaces.

### The page

8. **Strategy is selected per level**, alongside the existing per-level depth, merge size and stream
   controls. Spine is a per-level property in the design, and the panel already has the shape for it.

9. **The two thresholds are sliders, shown only for the strategy that uses them.** `diameter` takes no
   parameter and must not display a dead control.

10. **The spine is drawn over the existing rendering, distinctly enough to read against the skeleton
    it is a subset of.** It is a *selection* from lines already on screen, so it needs weight or
    colour that reads as emphasis rather than as new geometry.

11. **A disconnected spine is drawn as disconnected and said to be**, with the component count in the
    readout. This is the single most important thing the picture has to communicate, since it is the
    difference between a usable definition and an unusable one for a given region.

12. **Report spine length as a fraction of the tree's total edge length**, per level. Comparing three
    strategies by eye is much easier with one number that says how much of the skeleton each kept.

### Verification

13. **A rectangle is the worked example.** Its skeleton has a central ridge between two degree-three
    nodes. `diameter` retains the ridge plus one bisector at each end; a mid-range `wavefront-time`
    retains the ridge alone; `whisker-prune` at a small fraction retains everything and at a large one
    converges on the ridge. **If all three give the same answer on a rectangle, at least two are
    wrong.**

14. **A lobed fixture must be tested for the disconnection case**, and the debrief must name which
    fixture and at what fraction `wavefront-time` splits. If nothing in the corpus splits, say so —
    that is a finding about the corpus, and it means decision 6 is untested rather than satisfied.

15. **Determinism: the same tree and strategy give the same spine, node for node**, independent of
    traversal order. Symmetric input is the normal case here and ties are routine.

16. **The acceptance gate is the full core suite twice with the failure sets intersected, then
    `pnpm build`, then the dashboard suite twice.** That order is required, not stylistic: the
    dashboard resolves `@proc-geo/core` through `dist`, so running it before the build tests a stale
    surface. Core stood at 67 suites and 3451 tests; dashboard at 14 and 219. Report actual counts.

## 3. Deferred (explicitly out of scope)

- **Frontage retargeting and egress via the spine.** No lots exist to face it. This is the deferral
  that keeps the task small, and it is why the spine is drawn rather than wired.
- **Radial promotion**, and anchoring a spine to region entrances.
- **Through-road versus cul-de-sac topology selection.** Decision 1 notes `diameter` implies one; the
  choice is downstream work.
- **Sub-region spines below the level that extracted one.**
- **Retiring any strategy.** All three are kept; the arc's design says spine extraction stays
  parameterisable because a spine must eventually be anchorable to entrances.

## 4. Retirement

Nothing is deleted.
