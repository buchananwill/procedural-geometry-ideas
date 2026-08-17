# Debrief 0001 — Spine extraction: the core module

## Task Summary

Task 250, `docs/notes/spine-extraction-decisions.md`. Extract a region's **spine** from the skeleton
tree under three candidate definitions (`diameter`, `wavefront-time`, `whisker-prune`), report the
result honestly including disconnection, and draw and measure it on the `/recursive` page so the
three can be compared. Frontage retargeting is explicitly out of scope.

This debrief covers the **core** half: `packages/core/src/straight-skeleton/spine.ts`, its barrel
export, and `packages/core/tests/straight-skeleton/spine.test.ts`. The dashboard half follows in
debrief 0002.

## Plan Placement

The spec's implementer's brief asks for a phased plan committed to the repository as the first
action. My task's file-ownership list does not include `docs/notes/**` or any other plan location,
and the working-scope rule is strict, so the plan is recorded here in the debrief directory — the
one path my debrief protocol grants — rather than as a new file outside my scope. The phases are:

1. **Core** — `spine.ts`, the three strategies, the barrel export, the Jest suite. (This debrief.)
2. **Dashboard** — per-level strategy in the store, the controls, the readout sentences, the scene
   adapter, and the three dashboard suites. (Debrief 0002.)

## Changes Made

- **`packages/core/src/straight-skeleton/spine.ts`** (created) — `SpineStrategy`, `Spine`,
  `extractSpine`, exactly the roster in §1. Each strategy is a predicate over `tree.edges`; the
  shared bookkeeping (sort, node set, component count, length) lives in one place, so no strategy
  walks the tree itself.
- **`packages/core/src/index.ts`** (modified) — exports `extractSpine`, `Spine`, `SpineStrategy`
  under a new section beside the skeleton-tree substrate.
- **`packages/core/tests/straight-skeleton/spine.test.ts`** (created) — 13 tests: the rectangle
  worked example, threshold behaviour, connectivity, and the invariants.

## Design Decisions

- **`whisker-prune`'s scale is the diameter's length** (decision 3 asks for the scale to be named in
  the doc comment; it is, on `whiskerPrunedEdges`). The natural choice: the longest road the region
  could carry, so a fraction of it reads as "a whisker next to the through-route". Verified
  discriminating — mutating the scale to `maxOffset` fails two tests.
- **Fractions are read as given, never clamped** (decisions 4, 5). `Spine` has no diagnostic
  channel, so a clamp would be an unreportable silent correction. A fraction above everything lands
  on the empty spine, which is a legitimate answer.
- **Decisions 5 and 7 together**: `componentCount === 1` is asserted for `diameter` and
  `whisker-prune` on a connected tree, in the form "never more than one component". An **empty**
  spine has zero components and passes the assertion — retaining nothing is decision 5's explicit
  legitimate answer to a threshold above everything, and it is not a disconnection since there is
  nothing to disconnect. The assertion throws on two-or-more, which is the defect decision 7 names.
  It is skipped where `tree.isTree` is false: a strategy is not entitled to be connected over a
  graph that was not connected to begin with.
- **`nodeIds` is exactly the endpoints of the retained edges.** A spine is a set of arcs; an
  isolated node carries no road, and `componentCount` is defined over the retained edges.
- **Output edges are sorted by `(a, b)`** rather than left in the order a strategy produced them, so
  the result is a pure function of the tree — this is what makes decision 15's traversal-order
  independence testable as an equality rather than as a set comparison.
- **`diameter` and `whisker-prune` inherit `skeletonTreeDiameter`'s throw on a non-tree**, since
  both need the longest path. `wavefront-time` reads only offsets and lengths and works on any
  graph. Documented on `extractSpine`.

## Verification Findings (decisions 13, 14)

**Rectangle (4 × 2), decision 13.** Nodes 4 and 5 are the degree-three ends of the ridge.

| strategy | retained | length |
|---|---|---|
| `diameter` | ridge + one bisector at each end (nodes 0, 2, 4, 5) | √2 + 2 + √2 ≈ 4.828 |
| `wavefront-time`, 0.5 | the ridge alone | 2 |
| `whisker-prune`, 0.1 | everything (5 edges) | 7.657 |
| `whisker-prune`, 0.35 | the ridge alone | 2 |
| `whisker-prune`, ≥ 0.414 | empty | 0 |

All three give different answers, which is asserted directly. The whisker band that converges on the
ridge is (√2/4.83, 2/4.83) ≈ (0.293, 0.414); above it the ridge is itself a whisker and the spine is
empty.

**Disconnection, decision 14.** The corpus **does** split. Of the 37 `ALL_TEST_POLYGONS` fixtures
that solve and whose skeleton is a tree, **8** produce a disconnected `wavefront-time` spine at some
fraction in a 0.05-step sweep of (0, 1): *Duck Octagon (fails)*, *Convergence Towards Isthmus
(succeeds)*, *Missing Edge at Node 11*, *Premature Split Octagon*, *Long Unbroken Side Then Extreme
Acute Angle*, *Incorrect Ordering e38-e30 Collision*, and both *Premature Bisector Split* variants.

Two are pinned as tests:

- **`Convergence Towards Isthmus (succeeds)` at fraction 0.55** — two components. This is decision
  6's picture exactly: two lobes joined by a thin neck, both lobe centres above the threshold and
  the neck below it. It is a narrow band (0.50 gives one component, 0.60 gives one), so it is
  reported as the *named* worked example rather than the robust one.
- **`Premature Bisector Split (passes)` at 0.1, 0.2, 0.3 and 0.4** — two components throughout, a
  broad band rather than a knife edge, so the disconnection case stays covered under small solver
  drift.

Nothing repairs either: no bridging, no largest-component selection, no failure.

## Build & Test Results

`pnpm --filter @proc-geo/core exec jest --testPathPatterns=spine` — 13 passed. Baseline core suite
before this work: 67 suites / 3451 tests, all passing, which matches decision 16's stated figures.
The full acceptance gate (core twice, `pnpm build`, dashboard twice) runs at the end of phase 2 and
is reported in debrief 0002.

## Open Questions / Risks

- The isthmus split at 0.55 is a one-step band. If the solver's offsets shift, that test is the
  first to move. It is deliberately paired with the broad-band fixture so the decision-6 coverage
  does not rest on it alone.
- `whisker-prune` removes every qualifying leaf edge in a sweep and then re-reads degrees. A
  one-at-a-time removal order would give a different fixed point on some trees; the simultaneous
  sweep was chosen because it is order-independent and therefore deterministic, which decision 15
  requires.

## Suggested Follow-ups

- The eight splitting fixtures are a ready-made corpus for judging `wavefront-time` against the
  other two, which is the judgement this task exists to enable.
- Nothing here is wired to frontage or egress, per §3.
