---
title: "Recursive Segment Subdivision: Fixed Design Decisions"
type: decision-spec
area: subdivision
status: completed
date: 2026-08-16
part_of: [recursive-skeleton-subdivision.md]
verified_by: [packages/core/tests/straight-skeleton/recursive-subdivision.test.ts, packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts]
---

# Recursive segment subdivision

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

Solve a polygon's straight skeleton, take its segments at full depth, merge adjacent ones into
groups, and run the whole algorithm again on each group. Render every level on one canvas.

**The deliverable is a picture.** This is the first visible output of the recursive arc, and the
acceptance test is that a page loads with a recursive subdivision already drawn on it, with no
interaction required. Everything below serves that.

**Every piece it needs already exists.** `solveSkeleton` solves a boundary; `computeStrips` at full
depth partitions a region into segments that tile it exactly; `sameLogicalStreet` fuses runs of
adjacent exterior edges into one segment before any geometry is built. This task writes the driver
that loops them and the page that draws the result. **Resist the urge to build new geometry** — if you
find yourself writing a polygon operation, stop and check whether `computeStrips` already gives it to
you.

## 1. Type Roster

**New — [recursive-subdivision.ts](../../packages/core/src/straight-skeleton/recursive-subdivision.ts)**

```ts
export interface RecursiveOptions {
    /** How many times to subdivide. 1 = one pass, no recursion. Clamped to [1, 3]. */
    levels: number;
    /** Adjacent segments per merged group at every level. Clamped to at least 1. */
    mergeGroupSize: number;
}

export interface RecursiveNode {
    /** Depth in the tree. The root is 0. */
    level: number;
    /** The polygon solved at this node, clockwise. */
    boundary: Vector2[];
    /** Segments this node was divided into, in boundary order. Empty when `failure` is set. */
    segments: Strip[];
    /** One child per merged group, in the same order. Empty at the leaf level. */
    children: RecursiveNode[];
    /** Why this node was not subdivided, or `undefined` when it was. See decision 6. */
    failure?: string;
}

export function subdivideRecursively(
    boundary: Vector2[],
    options: RecursiveOptions,
): RecursiveNode;
```

**New — [apps/demo/src/app/recursive/page.tsx](../../apps/demo/src/app/recursive/page.tsx)** and whatever dashboard components it needs, modelled on the existing `/parcels` page.

**Reused unchanged:** `solveSkeleton`, `computeStrips`, `StripOptions.sameLogicalStreet`, `computeMaxOffset`, `Strip`.

## 2. Decisions / Specification

### The driver

1. **Full depth only. No partial depth, no offset rings, no residue.** At full depth the segments tile
   the region exactly and there is no interior void, which sidesteps a known and currently-unfixed
   defect in projecting the wavefront at many-way events. Depth is `computeMaxOffset(result)`.

2. **Merging is done by `sameLogicalStreet`, before geometry is built — never by unioning polygons.**
   Group the exterior edges into runs of `mergeGroupSize` consecutive edges and return true for a pair
   inside the same run. `computeStrips` then emits one segment per group. **There is no polygon union
   anywhere in this task**, and if you are writing one you have taken a wrong turn.

3. **A child's input polygon is its segment's `boundary`, solved by the same `solveSkeleton`.** That is
   the whole of the recursion: the output of one pass is the input of the next. Nothing is transformed
   in between.

4. **Recurse to `options.levels`, clamped to at most 3.** Two is the interesting default. The clamp is
   a runaway guard, not a design position.

5. **A segment with fewer than three boundary vertices, or with zero area, is not recursed.** Record it
   as a failure on the child node and carry on with its siblings.

### Failure is data, not an exception

6. **A child that fails to solve is recorded and rendered, never thrown.** Set `failure` to the reason,
   leave `segments` empty, and continue with every sibling. **This is the single most important
   decision in the task**: a demo that throws on one awkward sub-polygon shows nothing at all, and a
   half-subdivided picture that honestly marks which cells failed is far more useful than an exception.
   Sources of failure to expect: an incomplete solve (`result.complete === false`), a `computeStrips`
   throw, or decision 5's degenerate segment.

7. **The root failing is still a returned node, with `failure` set and no children.** The page renders
   the input polygon and the reason.

### The page

8. **A new route `/recursive`, modelled closely on the existing `/parcels` page** — reuse its canvas,
   its zoom and pan, and its panel idioms rather than inventing new ones. Read that page before writing
   this one.

9. **It renders a recursive subdivision on first paint, with no interaction.** Pick a default fixture
   and default options that produce a clearly recursive picture, and have them selected on load.
   **A page that requires a click before it shows anything fails this task.**

10. **Levels are visually distinguished, and the distinction must survive a greyscale screenshot.** Use
    both colour and stroke weight per level — the root's skeleton heaviest, each level lighter and
    thinner. Draw the input polygon, every level's segment boundaries, and every level's skeleton
    edges.

11. **Failed cells are drawn distinctly** — a hatch, a tint, or an outline in a reserved colour — so a
    picture with failures reads as a picture with failures rather than as a picture with a gap.

12. **Controls: fixture picker, `levels`, `mergeGroupSize`, and a per-level visibility toggle.** The
    visibility toggles matter more than they look: the difference between one pass and two is hard to
    see when both are drawn, and being able to turn the root off is how you check the children are real.

13. **Show the counts.** Segments per level and total leaves, as text on the page. A picture that looks
    subdivided while reporting one leaf is a bug the eye will not catch.

### Verification

14. **Unit tests for the driver over `ALL_TEST_POLYGONS`**, asserting: the tree's depth matches
    `levels`; every node's segments are non-empty or its `failure` is set; and no call throws for any
    fixture at `levels` 1, 2 and 3. **Report which fixtures produce failures at which level rather than
    excluding them** — that measurement is a genuine finding about how solver output behaves as solver
    input, and it is the first data this project has on it.

15. **The tiling identity per node, where the node solved:** its segments' areas sum to its boundary's
    area, to the tolerance the existing strip tests use. This is the check that catches a subdivision
    that looks right and is not.

16. **Do NOT add a `levels`-deep sweep to the default test run if it is slow.** The solver is roughly
    cubic and this runs it once per segment per level. If the sweep exceeds a few seconds, reduce the
    fixture set and say which you kept.

17. **The gate is the full suite twice with the failure sets intersected, plus `pnpm build` green
    across all four packages** — the demo app included, since this task adds a route. The suite stood at
    62 suites and 2679 tests; report actual counts.

## 3. Deferred (explicitly out of scope)

- **Spine labelling, access runs, radial promotion, parcel slicing at the leaves.** None of it is
  needed for the picture. The leaves are segments, not lots.
- **Partial depth and the residue stream.** Decision 1.
- **Input canonicalisation.** Specced separately and not required here; if a merged segment fails to
  re-solve because of collinear vertices, decision 6 records it and decision 14 reports it, which is
  exactly the evidence that task wants.
- **Any merge heuristic beyond `mergeGroupSize`.** Area targets, aspect constraints and the partition
  DP are a later task; a fixed group size is enough to produce the picture and to show the mechanism.
- **OBB, the size ladder, and the strategy matrix.**

## 4. Retirement

Nothing is deleted. `/parcels` is untouched.
