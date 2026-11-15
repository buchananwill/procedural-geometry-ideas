---
title: "Skeleton: a straight bisector between collinear walls that face the same way can leave a wrong skeleton"
type: issue
area: straight-skeleton
status: open
date: 2026-11-15
---

# Skeleton: a straight bisector between collinear walls that face the same way can leave a wrong skeleton

Found by the independent review of roadmap node 5 (BSA.F103) and ruled on in BSA.D314. **This is a defect of how
one-ring steps resolve, and it exists on single loops today, before any holed work.** Its cure changes how
single-loop events resolve, which the user has reserved (BSA.D301), so nothing in the solver has been changed for it.
Holed solves are guarded instead: a holed result that shows one of the defect's signatures is `complete: false` with
a named blocking diagnostic (`holed-guard.ts`, BSA.D314, widened by BSA.D318; see "What a caller can and cannot
detect"). Single-loop results carry no such guard.

This note is the umbrella for two older notes, which are forms of the same precondition:
[a straight vertex left in a ring of zero area](./ISSUE-skeleton-straight-vertex-in-zero-area-ring.md), and
[a meeting of three fronts on one ring](./ISSUE-skeleton-three-front-meeting-on-one-ring.md), which turned out to be
a sound solve (see "How the older notes relate" below).

## The precondition

Wherever two walls are collinear and face the same way, the solver can bear a **straight** bisector between them: a
bisector whose two parents are parallel and point the same way, so it turns by zero and moves perpendicular to their
common line at unit speed. It is born where a front between the two walls closes: two hole walls on one line, a hole
wall in line with an outline wall, or two outline walls either side of a wing or an arm. The bisector is correct: the
two walls are separate edges, and the line it traces divides their faces.

What goes wrong is what the one-ring steps that follow do with it. **Every complete but wrong answer the guard's
measurement found on exact input carries one** (measured below), as does every wrong or incomplete answer the review
traced; but most solves that carry one are sound.

## The mechanisms

- **K1, overlapping ridge arcs.** Two straight vertices reach a ridge between anti-parallel walls at the moment it
  collapses, and each ridge bisector is paired with the FAR straight vertex instead of the near one. The arcs overlap,
  the faces are wrong and the interior graph has one cycle too many, **with every node in the right place,
  `complete: true` and no diagnostic.** A variant measured by the guard's fuzz overlaps the arcs with the cycle rank
  right, or runs one arc through another's node: only a collinear-overlap or T-junction test would see it, and at the
  perceptual floor neither can be told from a sound sliver face (see "What a caller can and cannot detect").
- **K3, a ring of two or three straight bisectors the pair or triangle handler cannot close.** Signalled:
  `complete: false` with a `step-failure` ("Unable to generate any collision from last two edges", "Failed to collide
  interior edges in triangle").
- **A zero-length self-loop that is not marked culled.** A bisector between two collinear walls is born and ended at
  one node. Complete and undiagnosed, but detectable as `target === source && !culled`. (A CULLED self-loop is the
  solver's deliberate retirement of a surplus bisector at a degenerate closure, and sound solves carry them routinely.)
- **The missed strike of the straight vertex,** recorded in
  [its own note](./ISSUE-skeleton-straight-vertex-in-zero-area-ring.md): a straight vertex is never tested for a
  split, so it survives into a ring of zero area that is refused.
- **K2, misplaced nodes under inexact arithmetic,** on rotated input, where the collinear walls are only nearly
  collinear: nodes off equal time by 1 to 35 units on a grid of 100. Often with a causality diagnostic, sometimes
  without.

## Reproducers, single loop first

Outlines clockwise, holes counter-clockwise, all unweighted, `solveSkeleton(outline, {holes})` with default options.
`[x0, x1] × [y0, y1]` is the axis-aligned rectangle with those extents.

### Single loop (no holes): the defect owes nothing to holes

- **K1 (fuzz seed 413):** `[(800,700),(200,700),(200,1100),(600,1100),(600,1900),(900,1900),(900,1100),(1400,1100),
  (1400,700),(1100,700),(1100,400),(800,400)]`. A bar `[200,1400] × [700,1100]` with an arm up `[600,900] × [1100,1900]`
  and an arm down `[800,1100] × [400,700]`. Each arm collapses at `t = 150` and leaves a straight bisector between the
  bar's two collinear top walls (down from `(750,950)`) and its two collinear bottom walls (up from `(950,850)`). At
  `t = 200` the bar collapses along `y = 900`. The true ridge is `400 → 750 → 950 → 1200`; the solver emits
  `(400,900) → (950,900)` and `(1200,900) → (750,900)`, which overlap. Complete, no diagnostic, cycle rank 1 for 0 holes.
- **Un-culled self-loop (fuzz seed 795):** `[(0,1300),(300,1300),(300,1200),(800,1200),(800,1100),(1200,1100),
  (1200,900),(1700,900),(1700,300),(1200,300),(1200,100),(600,100),(600,600),(300,600),(300,400),(0,400)]`. Edge 43 is a
  self-loop at `(900,600)`, parents 9 and 5, the two collinear `x = 1200` walls, not culled. Complete, no diagnostic.

The red tests are in
[straight-bisector.test.ts](../../packages/core/tests/straight-skeleton/straight-bisector.test.ts), under
`red by design: a straight bisector between collinear walls on a single loop`. Each asserts the property that fails
and `complete`: K1 that the non-culled interior edges are a tree and no two arcs overlap; the self-loop that no
non-culled edge ends at its own source. They are red today and stay red until a cure lands (BSA.D266).

### Holed

- **K1 (fuzz seed 421):** outline `[(400,800),(700,800),(700,1500),(900,1500),(900,1900),(1600,1900),(1600,1500),
  (1900,1500),(1900,700),(1600,700),(1600,300),(400,300)]`, hole `[(1100,400),(1200,400),(1200,700),(1100,700)]`. The
  hole's top wall at `y = 700` is collinear with the outline wall at `y = 700`. The solver emits `(1100,1100) →
  (1400,1100)` and `(1500,1100) → (1250,1100)`; the true ridge is `1100 → 1250 → 1400 → 1500`.
- **Un-culled self-loop (fuzz seed 219):** outline `[(1000,1300),(1100,1300),(1100,1600),(2000,1600),(2000,400),
  (1100,400),(1100,800),(1000,800)]`, holes `[1600,1700] × [1300,1400]` and `[1300,1700] × [600,800]`. Edge 50 is a
  self-loop at `(1350,1050)`, parents 8 and 0.
- **K2:** the rectangle 800 × 700 with holes `[100,300] × [300,600]`, `[500,600] × [500,600]`, `[500,700] × [200,300]`,
  turned by 2.3375797149036646 rad and moved by (−274.1152816452086, 94.97438091784716); exact coordinates in
  [holed-guard.test.ts](../../packages/core/tests/straight-skeleton/holed-guard.test.ts). Node 30 is off equal time by
  4.19 units, with no diagnostic.
- **The review's rotated two-hole specimen:** `[0,900] × [0,400]` with holes `[500,600] × [100,200]` and
  `[200,300] × [100,200]`, turned by 1.4643 rad about the origin. The review reported it as an un-culled self-loop;
  read here it is a node misplaced by 0.57 units, which the causality oracles already report (the axis-aligned
  original carries a culled self-loop and is sound).
- **The courtyard with wings, jittered** (the sweep harness's `holed` cells at 1× jitter, seeds 1 and 3; BSA.D315):
  complete with no diagnostic, five self-loops, two cycles for one hole and strips 0.24% short.
- **K3, two straight bisectors (fuzz seed 10):** outline `[(1500,400),(900,400),(900,0),(100,0),(100,1800),
  (1500,1800),(1500,1600),(2300,1600),(2300,500),(1500,500)]`, holes `[500,1100] × [700,1300]` and
  `[1500,1700] × [800,1200]`: "Unable to generate any collision from last two edges", a ring of two straight
  bisectors with mirrored parents travelling the same way.
- **K3, a triangle:** outline `[0,950] × [0,250]`, holes `[100,300] × [100,200]`, `[400,650] × [100,200]`,
  `[750,850] × [100,200]`: "Failed to collide interior edges in triangle".

The holed K1, K2 and jittered reproducers are held by the guard's GREEN tests in
[holed-guard.test.ts](../../packages/core/tests/straight-skeleton/holed-guard.test.ts): each asserts `complete: false`
with the named diagnostic, which is a guard in production code, not a wrong skeleton. The holed self-loop (seed 219)
is otherwise sound, and since BSA.D318 its test asserts the informational `holed-unculled-self-loop` and `complete`. The two K3 inputs are red tests
in [straight-bisector.test.ts](../../packages/core/tests/straight-skeleton/straight-bisector.test.ts), under
`red by design: a ring of straight bisectors the pair or triangle handler cannot close`, asserting `complete`.

## Diagnosis of K1 on the single-loop reproducer (CONFIRMED by trace)

Read-only, with a probe at every step boundary on seed 413 and on the holed seed 421; the instrumentation lived
outside the repo.

- **The step.** At the boundary before `t = 200` the step is one ring of four: `e26` (straight, parents 0 and 8, the
  two bottom walls, up from `(950,850)`), `e30` (the left ridge bisector, parents 2 and 0, right from `(400,900)`),
  `e27` (straight, parents 6 and 2, the two top walls, down from `(750,950)`) and `e31` (the right ridge bisector,
  parents 8 and 6, left from `(1200,900)`), in that ring order. Each ridge bisector is the ring neighbour of both
  straight vertices, so all four pairs are `interiorPair` events.
- **The events.** `createCollisions` reports `[26,30]` and `[26,31]` at `(950,900)` and `[27,30]` and `[27,31]` at
  `(750,900)`, each from both ends, **every one at exactly one arrival, `d = 0.09765625` in unit space (`t = 200`)**:
  the ridge bisectors have zero offset rate, so every point of the collapsing ridge is reached at one time.
- **The branch.** In `handleInteriorNGon` (`algorithm-complex-cases.ts`), `asWholeEvents` clusters the events at δ
  into two merges, `{26, 30, 31}` at `(950,900)` and `{27, 30, 31}` at `(750,900)`, which share `e30` and `e31`, so
  `mergesShareAnEdge` refuses the whole-event resolution. `earliestArrivalMoment` cannot narrow it, because all four
  events are one moment. The layer goes to **the pairwise fallback**, `inArrivalOrder(eventsToResolve,
  byEventPriority).map(handleCollisionEvent)`. Within one moment `byEventPriority` orders by event priority (all
  `interiorPair`) and then by the colliding edge ids, so `[26,30]` is handled first: the left ridge bisector `e30` is
  consumed with `e26` at `(950,900)`, the FAR straight vertex. `[26,31]` and `[27,30]` are then void, and `[27,31]`
  pairs the right ridge bisector `e31` with `e27` at `(750,900)`, again the far one. The holed K1 takes the same branch
  on its four-ring `[e41, e48, e46, e49]`, where the first pair by id is again the far one.
- **What tells near from far at that point.** Not the arrival: it is identical (or within an ulp) for all four. **The
  distance along each ridge bisector's own ray** does: the collision's `intersectionData`, equivalently its position.
  For `e30` it is 0.1709 to `e27` (near, `(750,900)`) and 0.2686 to `e26` (far); for `e31` it is 0.1221 to `e26` (near,
  `(950,900)`) and 0.2197 to `e27` (far). The straight vertices travel 0.0244 to the ridge in every pairing. So the
  data the fallback holds separates the right pairing from the wrong one, but the fallback's tie-break reads only edge
  ids. A cure would have to read that distance (or resolve the collapsing ring of four as one event along its line),
  which changes how single-loop events resolve: the user's ruling.

## Measured rates

**The review's own checker, at `3abb3ac` (BSA.F103):** single-loop controls, the same outlines with no holes: 1,056
axis-aligned, 2 wrong and 1 incomplete; 1,500 rotated, 112 wrong; 6,000 dense axis-aligned unions, 10 wrong and 10
incomplete; 4,000 dense rotated, 355 wrong. Identical at `4536b17` on the first two sets, so the single-loop defects
predate node 5. Holed: of 3,000 axis-aligned unions of 2 to 4 rectangles with 1 to 3 holes, 2,752 sound, 219 refused by
name, 15 complete and wrong (14 with no diagnostic), 14 incomplete; of 1,500 of them turned by an arbitrary angle, 223
complete and wrong (43 with no diagnostic).

**The guard's measurement (BSA.D314, BSA.D318), an independent checker of its own** (equal time, time order,
containment, one closed simple face per exterior edge tiling the region, planarity, cycle rank, and on axis-aligned
input every node's time equal to its L-infinity distance to the nearest wall), at tolerance `1e-6` of the extent for
times and `1e-10` for crossings, on a fresh fuzz of the same families. An un-culled zero-length self-loop is not, on
its own, a wrong answer (BSA.D318). The guard counted is the widened one:

| Family | Solves | Incomplete | Sound | Complete and wrong | of which caught by the guard |
|---|---|---|---|---|---|
| Unions of 2–4 rectangles, 1–3 holes, axis-aligned | 3,000 | 171 | 2,815 | 14 | 10 |
| The same turned and moved | 1,500 | 78 | 1,202 | 220 | 217 |
| One rectangle, 1–3 holes | 1,000 | 33 | 967 | 0 | 0 |
| The same turned and moved | 1,000 | 33 | 931 | 36 | 36 |
| Star-shaped outlines, 1–6 holes in general position | 1,000 | 0 (2 refused at the door) | 998 | 0 | 0 |
| The unions under the harness's 1× jitter | 1,500 | 223 | 1,026 | 251 | 224 |
| The rectangles under the same jitter | 500 | 52 | 413 | 35 | 33 |
| Single loop: the union outlines, no holes | 1,000 | 0 | 1,000 | 0 | (no guard) |
| Single loop: the same turned and moved | 1,000 | 0 | 942 | 58 (3 with no diagnostic) | (no guard) |

On exact input, **every complete and wrong solve carries a straight bisector** (14 of 14, 220 of 220, 36 of 36, 58 of
58), and so do many sound ones (1,179 of 2,815 axis-aligned union solves). Under the harness's 1× jitter (1e-8 of the
extent) the wrong solves are more frequent and not all carry an exactly straight one (170 of 251 on jittered unions),
so jitter adds near-coincidences of its own.

## What a caller can and cannot detect

- **A holed solve,** with the guard widened by BSA.D318: `complete: false`, with a named blocking diagnostic, for a
  cycle rank other than the hole count or a disconnected interior graph, an arc whose two records name different pairs
  of walls (`holed-topology-violation`), a node off equal time (`holed-equal-time-violation`), an edge running
  backwards in time (`holed-time-order-violation`), and two arcs crossing inside both (`holed-planarity-violation`),
  each judged at the perceptual floor in unit space. An un-culled zero-length self-loop is reported as
  `holed-unculled-self-loop` and blocks nothing: it carries no geometry. Re-measured on the same 11,500-solve fuzz:
  of 8,352 holed solves the independent checker reads as sound, the guard flags none; of 270 complete and wrong solves
  on exact input it catches 263, and of 286 on jittered input 257.
- **What the holed guard still cannot see:** two collinear arcs overlapping along a length, and an arc that runs
  through another arc's node without ending there (a T-junction), where cycle rank, node times, time order and wall
  pairs are all right. At the floor these look exactly like a sound solve's sliver face between two walls collinear to
  within the floor and not exactly, which jitter makes common (an overlap check at the floor flagged 153, then 73,
  sound jittered solves, and was left out). Measured, they are the 7 exact-input misses (2 with no other diagnostic)
  and 29 jittered ones (13 with no other diagnostic), some with faces short of area by up to 10%. Telling them from a
  sliver needs a bar below the floor, which is a new tolerance and the user's to rule.
- **A single-loop solve:** nothing in the solver signals K1 or the un-culled self-loop. A caller can test for an
  un-culled self-loop itself (`graph.edges[id].target === graph.edges[id].source && !interior.culled`), and
  `buildSkeletonTree(result).isTree` is false on both K1 and the self-loop. K2 is usually, not always, reported by a
  `causality-violation`. K3 is signalled as a `step-failure`.

## How the older notes relate

- [A straight vertex left in a ring of zero area](./ISSUE-skeleton-straight-vertex-in-zero-area-ring.md) is the missed
  strike: the same straight vertex, never tested for a split.
- [A meeting of three fronts on one ring](./ISSUE-skeleton-three-front-meeting-on-one-ring.md) recorded `2h-int-113` as
  a defect. It is not one: its self-loop is culled, and its test was red only because the battery's
  `interiorGraphShape` counted culled self-loops (BSA.D314). With the helper corrected it passes the whole battery.

## What a cure needs, and who decides

Any cure reads or changes how a one-ring layer is resolved: the pairwise fallback's order within one moment (K1),
the pair and triangle handlers' closure of straight bisectors (K3), the closure that leaves a self-loop un-culled, or
split generation for a straight vertex. Every one is shared with single-loop solves, so it is the user's (BSA.D301).
The lead also recommends to the user the same guard on single loops (BSA.D314), which would turn existing single-loop
results from complete to incomplete.
