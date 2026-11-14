---
title: "Skeleton Tree Substrate: Fixed Design Decisions"
type: decision-spec
area: subdivision
status: completed
date: 2026-08-16
part_of: [recursive-skeleton-subdivision.md]
verified_by: [packages/core/tests/straight-skeleton/skeleton-tree.test.ts]
---

# Skeleton tree substrate

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

A read-only view of a solved skeleton as a weighted undirected graph, with the queries a pruning
algorithm needs: adjacency, degree, leaves, edge lengths and per-node wavefront offsets.

**This is a substrate and nothing else.** It builds no spine, prunes nothing and makes no policy
choice. Three spine-extraction strategies will be written on top of it — longest path through the
tree, a wavefront-time threshold, and degree-based whisker pruning — and each is thirty to sixty lines
*given this*. Building any of them before this exists produces three bespoke traversals instead, which
is the outcome this task is dispatched to prevent.

## 1. Type Roster

**New — [skeleton-tree.ts](../../packages/core/src/straight-skeleton/skeleton-tree.ts)**

```ts
export interface SkeletonTreeEdge {
    /** The two node ids this edge joins. Undirected; `a < b` by construction. */
    a: number;
    b: number;
    /** The interior edge in the solved graph this came from. */
    interiorEdgeId: number;
    /** Euclidean distance between the two node positions, in caller space. */
    length: number;
}

export interface SkeletonTree {
    nodeIds: number[];
    edges: SkeletonTreeEdge[];
    /** Node id to the node ids adjacent to it. Every node in `nodeIds` has an entry. */
    adjacency: Map<number, number[]>;
    /** Node id to wavefront offset, taken from `computeNodeOffsets` and never re-derived. */
    offsets: Map<number, number>;
    /** Nodes of degree one — the polygon vertices, and any dangling skeleton node. */
    leafIds: number[];
    /** False when the graph carries a cycle or is disconnected. See decisions 6 and 7. */
    isTree: boolean;
}

export function buildSkeletonTree(result: SkeletonSolveResult): SkeletonTree;

/** The longest path between any two leaves, by summed edge length. Node ids, in order. */
export function skeletonTreeDiameter(tree: SkeletonTree): number[];
```

**Unchanged and reused**

- `computeNodeOffsets` ([offset-projection.ts](../../packages/core/src/straight-skeleton/offset-projection.ts)) — already exported, already returns node id to offset.

Nothing else in the package changes. No solver file is touched.

## 2. Decisions / Specification

### Shape

1. **Plain data plus free functions. No methods on the returned object.** A `SkeletonTree` will be
   passed between the dashboard and workers, where results are `structuredClone`d; methods do not
   survive that and become `undefined` silently. This exact divergence is already recorded for
   `SkeletonNormalisation`, which became free functions over plain data for the same reason. `Map`
   survives `structuredClone` and is fine.

2. **Exterior polygon vertices ARE nodes of the tree, and they are its leaves.** A primary bisector
   runs from a polygon vertex to an interior skeleton node, so excluding exterior nodes would sever
   every leaf and leave a tree whose diameter runs between the wrong endpoints. All three strategies
   depend on this: the diameter is measured vertex to vertex, whisker pruning removes exactly these
   leaf edges, and a wavefront-time threshold discards them because their offset is zero.

3. **Offsets come from `computeNodeOffsets` and are never derived a second way.** The projection
   module's header is explicit that deriving the same quantity by a different route makes the two
   disagree in the last bits. Nothing here needs bit-equality today, but a second derivation of a
   quantity that already has one canonical source is how that guarantee gets lost later.

4. **Edge length is the Euclidean distance between node positions, in caller space.** It is an
   ABSOLUTE length in the sense of the arc's parameter classes, so a consumer expressing a whisker
   threshold as a fraction divides by something — the diameter, or the max offset — rather than
   comparing against a world constant.

5. **Edges are keyed with `a < b` so an undirected edge has one representation.** Adjacency is
   symmetric: if `b` appears in `adjacency.get(a)`, then `a` appears in `adjacency.get(b)`.

### Structure, checked rather than assumed

6. **`isTree` is COMPUTED, not asserted.** The straight skeleton of a simple polygon is a tree, and
   this substrate is entitled to expect one — but it must report rather than assume, because a
   disconnected or cyclic result is a solver defect worth surfacing and the strategies built on this
   will otherwise fail in confusing ways far from the cause. Compute it as: edge count equals node
   count minus one, and a traversal from any node reaches every node.

7. **A non-tree result is still returned, fully populated, with `isTree: false`.** Do not throw and do
   not return a partial structure. The caller decides; a diagnostic tool wanting to look at a broken
   skeleton is precisely the case where throwing is least helpful.

8. **The precondition is `result.complete === true` and `result.context !== null`**, matching every
   entry point in the projection module. A self-intersecting input yields a merged graph with no
   solver context, which cannot be walked this way. Fail loudly on a violated precondition — that is a
   caller error, distinct from decision 7's honest report about the geometry.

### Diameter

9. **`skeletonTreeDiameter` is the standard two-traversal algorithm, weighted by edge length**: from
   any node find the furthest node, then from that node find the furthest again; the path between them
   is a diameter. **Weighted by length, not by hop count** — a skeleton's edges vary enormously in
   length and a hop-count diameter would pick a path through many short whiskers over the long spine
   that is wanted.

10. **Ties are broken by lowest node id, so the result is a pure function of the tree.** A polygon with
    any symmetry has several equal-length diameters — a regular n-gon has one per pair of opposite
    vertices — and a diameter that varies with traversal order makes every downstream spine
    non-deterministic. **Symmetric input is the normal case here, not an edge case.**

11. **`skeletonTreeDiameter` requires `isTree`.** On a cyclic graph the two-traversal argument does not
    hold and the answer would be silently wrong rather than absent. Fail loudly.

### Verification

12. **The square is the worked example, and it pins decision 2.** A square's skeleton is four
    bisectors meeting at the centre: five nodes, four edges, four leaves at the polygon corners, one
    interior node of degree four, `isTree` true. Its diameter is corner to centre to opposite corner —
    **three nodes, not two** — with length equal to the square's diagonal. A result of two nodes means
    exterior vertices were excluded and decision 2 was not implemented.

13. **Cover a shape whose skeleton has a genuine internal edge**, not only fans. A rectangle's skeleton
    has a central ridge between two degree-three nodes; its diameter passes along that ridge. Every
    fixture in `ALL_TEST_POLYGONS` should build a tree with `isTree` true — sweep them and report any
    that do not, since a false there is a solver finding rather than a substrate one.

14. **Convict `isTree` by mutation.** Hand the builder a graph with an added edge closing a cycle and
    show `isTree` goes false. A flag that is always true is not a check.

15. **The acceptance gate is the full suite twice with the failure sets intersected**, and no existing
    test may change state — this task adds a module and touches nothing. The suite stood at 61 suites
    and 2666 tests; report actual counts.

## 3. Deferred (explicitly out of scope)

- **All three spine-extraction strategies.** They consume this; they are not this. Building one here
  would couple the substrate to the first strategy's needs, which is the failure this task exists to
  avoid.
- **Pruning of any kind**, whisker or otherwise.
- **Anything that consumes offsets as a threshold.** The substrate exposes offsets; deciding what to do
  with them is a strategy.
- **Caching.** Build it on demand. No consumer exists yet, so there is no measured cost to optimise
  against.

## 4. Retirement

Nothing is deleted and nothing is relocated.
