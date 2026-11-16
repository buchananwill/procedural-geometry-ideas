---
title: "Skeleton flat-ring termination and the third-front rule: decision spec"
type: decision-spec
area: straight-skeleton
status: implementing
date: 2026-11-15
part_of: [holed-skeleton-roadmap.md, ISSUE-skeleton-three-front-meeting-refused.md, ISSUE-skeleton-straight-vertex-in-zero-area-ring.md]
depends_on: [skeleton-simultaneous-rings-decisions.md]
---

# Skeleton flat-ring termination and the third-front rule: decision spec

## 1. Intent

This spec follows node 5 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md) and amends
[the simultaneous-rings spec](./skeleton-simultaneous-rings-decisions.md) (cited below as "node 5 decision n"). It
fixes two rules for the holed solver in `packages/core/src/straight-skeleton/`, both reached only in a step of
several rings (BSA.D345). **Flat-ring termination:** a ring a layer leaves that is flat by a positive test is a
finished piece of skeleton and is closed in its step, which generalises node 5's corridor exemption from rings of two
to every flat ring. **The third-front rule:** a vertex event whose node lies on a third front is resolved as one whole
event, in which the one gap that faces the struck wall is not born and the wall is cut at the node instead. Today both
cases are refused by name, and they are the whole of `HOLED_REFUSALS` and both issue notes this spec is `part_of`.
The spec fixes the roster (§3) and the decisions (§4); it carries no function bodies.

## 2. Measured basis

Measured by read-only counterfactuals on core source unchanged since `27d9cc1` (BSA.F111, BSA.F112, BSA.F113). The
code of record is `apps/building-shell/experiments/flat-ring-termination/flat.ts` and
`apps/building-shell/experiments/three-front-meeting/cf-wavefront.ts` (`linkMergeGapOnWall`), uncommitted.

| Sample | Production | Both rules |
|---|---|---|
| `HOLED_REFUSALS`, 10 building-shell layouts | 10 refused | 10 sound (checker, L∞ height oracle to ~1e-13 cm, genus) |
| Grid 1: 2,000 two-courtyard islands, seed 1 | 51 third front, 28 flat, 2 decision 21, 1 step failure | 79 more sound; the last 3 unchanged |
| Grid 2: 1,000 equal-gap islands, seed 2 | 1,000 third front | 1,000 sound |
| `FULL_CORPUS` and `HOLED_TEST_POLYGONS`, 81 digests | | byte-identical; neither rule fires |
| E′ | refused | complete, in its issue note's closed form |

Not established by the measurement: any suite run under the rules, so core's `2h-int-1` and the other fuzz cases of
its issue note; any weighted input to either rule; that at most one gap faces the wall (0 counter-cases, no proof);
that a mis-paired ring cannot pass the flatness test.

## 3. Type and surface roster

`+` added, `~` changed, `=` unchanged but named because a reader will look for it.

| | Surface | File |
|---|---|---|
| + | `type FlatRingClause = 'segment-against-wall' \| 'segment-off-front' \| 'stretch-cover-count' \| 'stretch-same-way' \| 'stretch-walls-not-antiparallel' \| 'stretches-meet' \| 'not-a-tree' \| 'not-one-line' \| 'stretch-under-bar' \| 'level-not-newborn' \| 'level-off-stretch' \| 'level-doubled'` | `flat-rings.ts` (new) |
| + | `interface FlatStretch { from: number; to: number; clockwiseWall: number; widdershinsWall: number; forward?: number; backward?: number }` (node indices; the level member running from→to, and to→from) | `flat-rings.ts` |
| + | `interface FlatRingPlan { ring: number[]; nodes: Vector2[]; nodeOf: number[]; stretches: FlatStretch[] }` | `flat-rings.ts` |
| + | `type FlatRingVerdict = {flat: true; plan: FlatRingPlan} \| {flat: false; clause: FlatRingClause; detail: string}` | `flat-rings.ts` |
| + | `flatRingVerdict(context, ring: number[], time: number, newborn: ReadonlySet<number>): FlatRingVerdict` | `flat-rings.ts` |
| + | `closeFlatRings(context, outgoing: number[], time: number, newborn: ReadonlySet<number>): Set<number>` (the ids closed; refuses by name) | `flat-rings.ts` |
| + | `FLAT_STRETCH_BAR_FLOORS = 4` (provisional and incidental, §6 item 1) | [constants.ts](../../packages/core/src/straight-skeleton/constants.ts) |
| + | `interface MergeGap { lastArrival: number; firstDeparture: number; clockwiseWall: number; widdershinsWall: number }` | [coincident-events.ts](../../packages/core/src/straight-skeleton/coincident-events.ts) |
| + | `mergeGaps(runs: readonly (readonly number[])[], context): MergeGap[]` | coincident-events.ts |
| + | `wallFacingGap(gaps: readonly MergeGap[], wall: number, context): number \| string` (the facing gap's index, or the refusal's reason) | coincident-events.ts |
| + | `bisectionsForMergeOnWall(gaps: readonly MergeGap[], facing: number, wall: number, segment: WavefrontSegment, position: Vector2, sourceNodeId: number, context): BisectionParams[]` | coincident-events.ts |
| + | `linkMergeGapOnWall(context, lastArrival, firstDeparture, segment, position, towardsClockwise, towardsWiddershins): void` | [wavefront.ts](../../packages/core/src/straight-skeleton/wavefront.ts) |
| ~ | `WavefrontProbe` gains `flatRingClosed?(context, ring: readonly number[])` and `thirdFrontResolved?(context, merge: readonly number[], wall: number)` | wavefront.ts |
| ~ | `handleInteriorNGon`: the third fronts of a whole layer, their refusals before resolution, their resolution in the merge loop, and `closeFlatRings` before `componentsAsChildren` | [algorithm-complex-cases.ts](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts) |
| ~ | `multiRingRefusal`: its decision-22 clause is asked only of a layer not resolved whole; it gains the third-front clauses of decision 44 | algorithm-complex-cases.ts |
| ~ | doc comments of `simultaneous-across-rings` and `multi-ring-step-refused` | [types.ts](../../packages/core/src/straight-skeleton/types.ts) |
| = | `componentsOfRings`, `linkSplit`, `linkMergeGap`, `bisectionsForMerge`, `bisectionsForCrossRingMerge`, `crossRingRuns`, `contiguousRuns`, `applyDegenerateClosure`, `addBisectionEdge`, `holed-guard.ts`, `SkeletonDiagnosticKind` | |
| ~ | `BLOCKING_DIAGNOSTIC_HEADINGS` for the two kinds | [holed-fixture-text.ts](../../packages/dashboard/src/components/holed-fixture-text.ts) |
| ~ | `HOLED_CAUSES` for the two kinds | [skeleton.ts](../../apps/building-shell/src/roof/skeleton.ts) |
| ~ | `HOLED_REFUSALS` (cured layouts leave, a remaining refusal enters), `HOLED_FIXTURES` (cured layouts enter) | [robustness-fixtures.ts](../../apps/building-shell/tests/robustness-fixtures.ts), [fixture.ts](../../apps/building-shell/src/fixture.ts) |
| + | `holed-flat-and-third-front.test.ts` | `packages/core/tests/straight-skeleton/` |
| + | `holed-grid-fuzz.test.ts` | `apps/building-shell/tests/` |
| ~ | `holed-simultaneous-rings.test.ts`, `solve-skeleton-stepped.test.ts`, `holed-solve-boundary.test.ts`, `skeletonToScene-holes.test.ts`, `holed-specimens.ts`, `holed-roof.test.ts`, `holed-fixtures.test.ts`, `courtyard.test.ts` (comments) | core, dashboard and building-shell tests |

## 4. Decisions

### Scope and boundary

1. **Both rules are reached only in a step of more than one ring** (`multiRing` in `handleInteriorNGon`). A step of
   one ring keeps its present dispatch to the pair, triangle and n-gon handlers, flat rings of one-ring steps included.
2. **Every solve whose graph changes is one refused today,** by `componentsOfRings`' crossing or area clause on a ring
   the flatness test passes, or by node 5 decision 22. Every other solve, complete or refused, is byte-identical.
3. **Single-loop identity is a gate:** the 60 `FULL_CORPUS` digests, the sweep harness's output sets for every group
   (generated on the parent tree and on the built tree and compared per cell; no set is committed, BSA.F114), the
   census, the wavefront-order sweeps and building-shell's single-loop goldens are byte-identical, and the probe of
   decision 47 counts zero
   firings of either rule over `FULL_CORPUS` at both floors, the weighted fixtures and the 642-cell sweep.
4. **Holed identity where neither rule fires is a gate:** the 21 `HOLED_TEST_POLYGONS` digests and every existing
   building-shell holed golden are byte-identical, and the probe counts zero firings on the roster.
5. **No tolerance, window or constant moves.** The rules read δ (`perceptualFloor`), `angularResolution` and
   `degenerateAreaBar(δ, perimeter)`; the one new quantity is the stretch bar of decision 18.
6. **A result reported complete has passed the holed guard as today.** No diagnostic kind is added or removed.

### Flat-ring termination: which rings

7. **A candidate is a ring the layer left, of three members or more, whose polygon has `|signedArea|` at or under
   `degenerateAreaBar(δ, perimeter)`,** its members placed as `componentsOfRings` places them: a newborn member at its
   source node, an older one at `wavefrontVertexAt(id, t)`, `t` the layer's time. The magnitude selects candidates;
   the sign is read for no candidate.
8. **Candidates are tested after `settleLayerLinks` and before `componentsAsChildren`.** A candidate that passes is
   closed in this step and is not passed to `componentsOfRings`. A ring of two, and a ring above the bar, go to
   `componentsOfRings` as today.
9. **A flat ring bounds nothing, so the outer-or-hole question that `componentsOfRings` refuses does not arise for
   it.** This is node 5 decision 12's reason, applied to every flat ring.
10. **The closure is all or nothing per layer:** every candidate is tested first, and if any fails the step is refused
    with no ring closed.

### The flatness test

The clauses are tested in this order and the first that fails is named. `W_i` is member `i`'s clockwise parent, its
basis `b_W`, inward normal `n_W = rotateCw90(b_W)`, source position `A_W` and weight `w_W`.

11. **Nodes.** Members are taken in ring order; each joins the first node whose seed lies within δ of its position, or
    seeds a new node.
12. **`segment-against-wall`.** For each member whose clockwise neighbour is at another node, the segment from its node
    to that node satisfies `directionsAreSame(segment, b_W, angularResolution)`.
13. **`segment-off-front`.** Both ends of that segment satisfy `|n_W · (p − A_W) − w_W · t| ≤ δ`.
14. **Pieces.** Each segment is cut at every other node lying within δ of its line and more than δ from both its ends
    along it.
15. **`stretch-cover-count`, `stretch-same-way`, `stretch-walls-not-antiparallel`.** Every pair of nodes joined by a
    piece is joined by exactly two pieces, running opposite ways, on walls `a`, `b` with
    `directionsAreSame(b_a, −b_b, angularResolution)`. That pair is a **stretch**; its clockwise wall is the wall of the
    piece running from `from` to `to`.
16. **`stretches-meet`.** No two stretches cross, or overlap by more than δ along a common line, except at a node they
    share.
17. **`not-a-tree`, `not-one-line`.** The stretches number one fewer than the nodes; and every stretch's walls satisfy
    `sineIsBelow` against the first stretch's walls at `angularResolution` and every node lies within δ of the first
    stretch's line. **Every node lies on a stretch by construction, and no clause tests it** (amended by BSA.D351, on
    BSA.F117's argument): every node holds a member; on a ring of more than one node, every node's block of members in
    ring order is entered by a segment ending there; and every pair of nodes a piece joins becomes a stretch or is refused
    under `stretch-cover-count` first. The clause the build carried for it, `node-off-stretches`, could not fail, and its
    mutation gate left every test green (BSA.F116), so it is removed. The same walk joins every node, so `not-a-tree`'s
    count enforces the tree alone.
18. **`stretch-under-bar`.** Every stretch is longer than `FLAT_STRETCH_BAR_FLOORS · δ`. A stretch at or under the bar is
    refused, never closed: its failure without the bar is a silent direction violation (two jittered single-loop
    fixtures, BSA.F113), and the refusal is signalled.
19. **`level-not-newborn`, `level-off-stretch`, `level-doubled`.** A member is **level** when
    `directionsAreSame(b_cw, −b_ws, angularResolution)` holds of its parents. Every level member is newborn; it runs
    along a stretch at its node whose two walls are its parents, its clockwise parent being that stretch's wall for the
    way its ray points; and at most one level member runs each way along a stretch.
20. **A ring whose members all fall in one node has no segment and no stretch.** Decisions 12 to 18 hold vacuously, and
    of decision 19 only `level-not-newborn` applies.
21. **A non-level member carries no condition beyond its node.**

### Flat-ring termination: the wiring

22. **One graph node per cluster:** the source node of the first newborn member of the cluster in ring order, or else
    `findOrAddNode(seed, 0)`.
23. **Every non-level member ends at its cluster's node;** one that ends at its own source is marked `culled`, as
    `applyDegenerateClosure` marks it.
24. **A level member ends at the far node of its stretch.** A stretch run both ways carries both members, each ending at
    the other's source: two half-edges, one per face.
25. **A stretch no level member runs along is born as one interior edge** `{cw: clockwiseWall, ws: widdershinsWall}`
    sourced at `from`'s node and ended at `to`'s. Its parents are antiparallel, so its basis is its clockwise wall's
    basis, which runs from `from` to `to` by decision 15.
26. **Every member and every born ridge is accepted and the members are retired from the wavefront.** Nothing is linked
    into a ring and no exterior edge is accepted in the step (edge-acceptance spec, decision 5).
27. **A closed ring leaves no child.** The step's other rings go to `componentsAsChildren` unchanged, and a step with no
    ring left leaves no child (node 5 decision 26).

**Worked example, `2h-int-1` at t = 1.** The ring `[27, 30, 31]` holds e27, the straight vertex between the two hole
tops, at (5.5, 10), and the newborn level ridges e30 at (2, 10) and e31 at (8, 10). Nodes: three. Each segment lies on
the outline top's front `11 − t = 10` or a hole top's front `9 + t = 10`. Stretches: (2,10)–(5.5,10) and
(5.5,10)–(8,10), each covered once on the outline top and once on a hole top, running opposite ways; two stretches on
three nodes, one line. e30 runs east along the first and ends at (5.5, 10); e31 runs west along the second and ends
there; e27 ends where it stands. Nothing is born. The node at (5.5, 10) is the true skeleton's (issue note, step 3).
Traced by hand from the issue note; this ring was not in the measured samples.

### The flat-ring refusal

28. **A candidate that fails pushes `multi-ring-step-refused` through `refuseStep`** with the detail
    `ring [ids] has area A at time t, at or under the B degenerate-area bar, and is not a flat termination: <clause>:
    <detail>.` and throws. As today, the layer's events stand and the step leaves no child (join-and-divide decision 16).
29. **A flat ring whose stretches do not lie on one line is refused under `not-one-line`.** No such ring arose in any
    sample, including constructed T, L and plus junctions (BSA.F113).

### The third-front rule: which meetings

30. **A third-front meeting is a merge `M` of a layer resolved whole (`asWholeEvents` not null) in a step of several
    rings, with its splits `S(M)`:** every `interiorAgainstExterior` event whose instigator is an arrival of `M` and
    neither end of whose struck segment is. `M` may lie on two rings (`crossRingRuns`) or on one.
31. **In a layer not resolved whole, a meeting on a third front stays refused** under node 5 decision 22, with today's
    message.
32. **`M`'s runs are read at the layer's start:** `crossRingRuns` for a merge across rings, `contiguousRuns` on its ring
    for a merge on one ring.
33. **`M`'s gaps are `mergeGaps(runs)`:** one per run `k`, with `lastArrival` the last of run `k`, `firstDeparture` the
    first of run `k + 1` cyclically, `clockwiseWall = cp(lastArrival)` and `widdershinsWall = wp(firstDeparture)`,
    exactly the gaps `bisectionsForMerge` and `bisectionsForCrossRingMerge` bear.
34. **The struck wall is the exterior edge every split of `S(M)` strikes,** and the struck segment is that of the first
    split of `S(M)` by `byEventPriority`.
35. **A gap's direction `v` is the kernel's:** `v · n_cw = w_cw` and `v · n_ws = w_ws`, `n` the inward normal. Walls
    parallel and facing the same way with equal weights give `n · w`; antiparallel walls give the clockwise wall's
    basis, as `addBisectionEdge` does.
36. **A gap faces the wall when `v̂ · n_wall < −angularResolution`, is clear when it is above `+angularResolution`, and
    grazes it otherwise,** `n_wall` the struck wall's inward normal. `wallFacingGap` returns the facing gap when exactly
    one gap faces and none grazes.

**Worked example, E′ at (10.5, 1.5).** The arrivals are hole 1's corner (9,3) `{cw: right x = 9, ws: bottom}` and hole
2's corner (12,3) `{cw: bottom, ws: left x = 12}`; the struck wall is the outline's bottom, basis (−1, 0),
`n_wall = (0, 1)`. Gap X `{cw: hole 1 right, ws: hole 2 left}` has antiparallel walls, so `v` is hole 1 right's basis
(0, 1): `v̂ · n_wall = +1`, clear. Gap Y `{cw: hole 2 bottom, ws: hole 1 bottom}` has same-facing walls, so
`v = (0, −1)`: `v̂ · n_wall = −1`, facing. X is born and runs up x = 10.5; Y is not born. The cut bears
`{cw: hole 2 bottom, ws: outline bottom}`, basis (1, 0), east to (19.5, 1.5), and `{cw: outline bottom, ws: hole 1
bottom}`, basis (−1, 0), west to (1.5, 1.5). Choosing X instead would bear a straight vertex moving into the bottom
front.

### The third-front rule: the resolution

37. **Every arrival is terminated at the merge node and accepted, as for every merge.** The clear gaps are linked by
    `linkMergeGap` and returned as today, before the facing gap is linked.
38. **The facing gap is not born; the struck segment is cut at the node.** Two bisectors are born there:
    `towardsClockwise = {cw: gap.clockwiseWall, ws: wall}` and `towardsWiddershins = {cw: wall, ws: gap.widdershinsWall}`.
39. **`linkMergeGapOnWall` links them and records both successors:** `towardsClockwise` between the struck piece's
    `from` (its widdershins side) and `clockwiseOf(lastArrival)`; `towardsWiddershins` between
    `widdershinsOf(firstDeparture)` and the piece's end; `clockwiseSuccessor[lastArrival]` and
    `widdershinsSuccessor[firstDeparture]` set to the two tokens; and the division `{edge: wall, position, after}`
    recorded at `towardsClockwise`'s token. A later strike in the layer may read either arrival; a variant recording
    one successor failed 22 of 51 grid layouts (BSA.F111).
40. **The struck piece is chosen by `linkSplit`'s piece rule** (node 5 decision 17), the ring being the union of the
    rings through `lastArrival` and `firstDeparture`.
41. **The merge returns its clear gaps' params, then `towardsClockwise`, then `towardsWiddershins`,** recorded as
    partition births when more than one, and `chargeSitingResidual` is charged over all of them.
42. **The splits of `S(M)` are void** by `handleCollisionEvent`'s acceptance return, their instigators consumed by the
    merge (node 5 decision 16).

### The third-front rule: what stays refused

43. **Every third-front refusal is decided with `multiRingRefusal`, once the layer's event set is final and before its
    first event is resolved,** so a refused layer changes no link, node or acceptance (node 5 decision 20). The
    classification reads runs, walls and weights only.
44. **Each pushes `simultaneous-across-rings`, naming the step, the merge, the wall and the reason, with the phrase
    `meets a third front`:** (a) `S(M)` strikes more than one wall; (b) a run of `M` is its whole ring; (c) no gap, or
    more than one, faces the wall; (d) a gap grazes the wall, or lies between same-facing parallel walls of unequal
    weight.
45. **`multiRingRefusal`'s decision-21 clauses are asked of the layer's events less the splits of resolved third-front
    meetings.**

### Weights

46. **Weighted input is supported, not refused.** Decision 13 reads `w · t` and decision 35 the kernel. E′w,
    `2h-int-1w` and the facing-band specimen of BSA.F118 with its asymmetric variant (decision 50) are its proof.
    **The sign of `n_wall · v` does not depend on the weights, on any input** (restated by BSA.D353 on BSA.F118): on a
    legal input `n_wall` or `−n_wall` lies in the cone of the gap's two inward normals, `±n_wall = λ n_cw + μ n_ws` with
    λ, μ ≥ 0, so `n_wall · v = ±(λ w_cw + μ w_ws)` keeps its sign at every positive weight. Decision 35's weight terms
    set the direction of `v`, and so the grazing margin of decision 36; they decide no facing verdict. Decision 36 reads
    the sign and never compares `n_wall · v` with `w_wall`: a clear gap can have `0 < n_wall · v < w_wall` at unequal
    weights, as the specimen's does, and it is born, because after the cut no inner vertex is adjacent to the struck
    wall's front.

### Diagnostics and instruments

47. **The probe's two hooks fire once per closed flat ring and once per resolved third-front meeting,** and do nothing
    when no probe is installed, so a normal solve is unchanged.
48. **The two kinds' doc comments in `types.ts` name the forms that stay refused** and keep the phrases
    `a meeting on a third front` and `a ring of fewer than three bisectors at its start, no event at all`;
    `BLOCKING_DIAGNOSTIC_HEADINGS` is re-worded from them (BSA.D323).
49. **`HOLED_CAUSES` stops saying that three fronts meeting, or walls in line, are refused:** each cause describes the
    form that stays refused in the user's terms.

### Tests

Every test is green because the code is right, or because a named guard holds; none asserts a defect (BSA.D266,
BSA.D336).

50. **Core closed forms, in `holed-flat-and-third-front.test.ts`, under `expectSoundHoledSolve` and to `1e-9` of the
    extent:**
    - **E′:** 6 interior nodes at t = 1.5 (the four corners of the ridge rectangle (1.5,1.5)–(19.5,8.5), and (10.5,1.5)
      and (10.5,8.5) of degree 5), 26 interior edges, 7 ridges of two half-edges; translated by (1/3, 1/7) and turned by
      √2 rad and moved.
    - **E′w:** E′ with holes [3,9]×[4.5,7] and [12,18]×[4.5,7] and both holes' bottom walls of weight 2: the same six
      nodes, every one at t = 1.5 by `distance / weight`. Hand-derived and unmeasured.
    - **`2h-int-1`:** the issue note's input, sound, one node at (5.5, 10).
    - **`2h-int-1w`:** outline [0,9]×[0,12], holes [6,7]×[8,9] and [3,5]×[8,9], both hole tops of weight 2: sound, one
      node at (5.5, 11) at t = 1. Hand-derived and unmeasured.
    - **`2h-int-1` and `2h-int-1w` moved** by E′'s translation and turn (BSA.D351): their flat rings' area is exactly 0
      in place. Measured by the sign mutants of decision 55, three of the four moved cells give a candidate of positive
      area and none one of negative area; the negative sign is held by the unit test of decision 51.
    - **The facing-band specimen of BSA.F118 (BSA.D353):** outline [−300,300]×[0,300] with its bottom wall at weight 2,
      holes the triangle (70,60), (190,110), (190,150) and its mirror. Ten interior nodes: P (0,20) at t = 10 of degree
      5, where the hole-top gap is born though `n_wall · v = 1.25 < 2`; Q (±231.25, 82.5) at 41.25; S (±240, 250) at 50;
      U (±245, 110) and V (±245, 245) at 55, joined by a ridge of two half-edges; Z (0, 170) at 130. 20 nodes, 23
      interior edges. **Its asymmetric variant,** hole 2 the triangle (−26,38), (−146,198), (−146,73): the same right
      side, S2 (−171.5, 274.5) at 25.5, Q2 (−1898/11, 584/11) at 292/11, U2 (−223, 154) and V2 (−223, 223) at 77, Z
      (22.5, 177.5) at 122.5. Hand-derived.
    - **`2h-int-86`, `2h-int-144`, `2h-int-371`:** sound, or red with their issue note if the rules do not cure them.
51. **Unit tests of the pure functions:** `flatRingVerdict` on hand-built rings, one failing each clause of decisions
    12 to 19; `closeFlatRings` closing one flat ring perturbed within the floor to an area of each sign (BSA.D351); and
    `wallFacingGap` on synthetic gaps for one facing, none, two, and a grazing gap, and on gaps at many weights whose
    verdict does not move (decision 46). Every non-antiparallel gap of these tests is on walls a legal input can pair:
    `n_wall` or `−n_wall` in the cone of the gap's two normals (BSA.D353).
52. **The cured building-shell layouts** (the ten of `HOLED_REFUSALS`, and the user's layout, read today from the
    scratch `lower_case_b.json` as `CourtL-draft`, as a committed input) **join `HOLED_FIXTURES`** and the `CASES` of `holed-fixtures.test.ts`: `invariantViolations` with genus 1
    (2 for `TwoHolesProbe` and `TwoCourtyardsDraft`) and no Cheek, no conflict, no Gable, tiling to 1e-9,
    `roofViolations` empty, and the L∞ oracle within `SHELL_TOLERANCE_CM` on a 10 cm grid. Their goldens are exported
    and the diff reported: additions only.
53. **Each remaining refusal is a guard by name with a test green on it,** and `HOLED_REFUSALS` keeps at least one
    real entry, so the viewer's refused group and its tests are never vacuous. Grid draws `uniform-1-523` and
    `uniform-1-1977` are refused today and under both rules with neither firing; they are the candidates for the
    building-shell entry, and for the replacement of E′ as the refusal specimen in `solve-skeleton-stepped.test.ts`,
    `holed-simultaneous-rings.test.ts` and the dashboard's tests.
54. **`holed-grid-fuzz.test.ts`** ports the measurement's draw law (`grid.ts`, mulberry32). Grid 1 at seed 1: no
    complete draw fails `roofViolations` or the oracle; every draw on which a rule fires is complete and sound; no draw
    is refused under decisions 28 or 44. Grid 2 at seed 2: every draw is complete and sound.
55. **Mutation gates, each turning a named test red:** recording one successor only in `linkMergeGapOnWall` (grid
    fuzz); choosing the clear gap (E′); a `closeFlatRings` that refuses candidates of positive area, and one that
    refuses candidates of negative area, each a mutant refusing on one strict sign (restated by BSA.D351: the unit test
    of decision 51 at that sign; the positive mutant also `2h-int-1` turned and `2h-int-1w` translated and turned);
    comparing `n_wall · v` with `w_wall` in place of decision 36's sign test on gaps whose walls are not antiparallel
    (the facing-band specimen, BSA.D353); each clause of decisions 12 to 19 dropped (its unit test); dropping `w` from
    decision 13 (`2h-int-1w`); refusing before the layer instead of resolving (the cured layouts); removing the
    `multiRing` guard on the flat rule (`Offset Cross Junction`'s digest, BSA.F113).
56. **Every suite of core, test-fixtures, dashboard and building-shell is run,** and reported as a count passed plus a
    named list of red tests, each with its document.

## 5. Amendments owed once built

- **Node 5's spec:** decision 15 narrows to rings of three or more that are not flat; decision 22 is replaced by
  decisions 30 to 45 here; decision 24 gains the flat refusal of decision 28; decisions 26, 29 and 40 gain these rules'
  scope and gates; decision 38's E′ refusal and decision 39's gate "decision 22 removed" become this spec's tests;
  decision 44 is discharged; the Deferred item narrows to meetings of more than two runs and the refusals of decision
  44.
- **[ISSUE-skeleton-three-front-meeting-refused](./ISSUE-skeleton-three-front-meeting-refused.md):** E′ and its five
  layouts are cured; it is resolved, or narrowed to decision 44's forms if a specimen of them is kept.
- **[ISSUE-skeleton-straight-vertex-in-zero-area-ring](./ISSUE-skeleton-straight-vertex-in-zero-area-ring.md):**
  resolved for multi-ring steps if its four fuzz cases and five layouts are sound; its first "cure" paragraph is the one
  built; the umbrella note on collinear walls keeps its single-loop forms.
- **[The holed roof spec](./building-shell-holed-roof-decisions.md):** decisions 41 to 43 and 58 describe a set this
  removes. **[The dashboard holed spec](./dashboard-holed-fixtures-decisions.md):** decision 51's specimen is replaced.
- **CLAUDE.md** and the courtyard tests' comments that call these layouts refused.

## 6. The lead's rulings, and what the build must settle

Ruled by the arc lead at approval (BSA.D348).

1. **The stretch bar is 4 floors, provisional.** The value is incidental: it rests on two jittered single-loop
   fixtures. It is landed because it only refuses, by name, a ring that is refused today, so it changes no answer. The
   build reports the shortest stretch any multi-ring step produced over every sample and suite, and whether decision
   12's sine bar already refuses every stretch at or under the bar. The constant's comment says it is incidental. A
   derived form is left open.
2. **Weights are supported** (decision 46). The build tries one non-rectilinear weighted specimen to convict decision
   35's weight terms; if none can be built in a bounded search, the terms are reported as unconvicted and this spec
   says so.
3. **The cured layouts and the user's layout join `HOLED_FIXTURES` and the goldens** (decision 52), additions only.
   E′, E′w and `2h-int-1` stay in core's closed-form tests and do not join `HOLED_TEST_POLYGONS` in this build.
4. **The departures from the counterfactual are accepted, each re-measured, with a stop and a report if any measured
   cure is lost:** the sine predicates of decisions 12, 15, 17 and 19 (scratch: cosine `1 − ρ` and a `1e-6`
   collinearity bar); decision 36's `angularResolution` bar and its grazing refusal (scratch: `1e-9·|v|`, no grazing
   case); decision 10's all-or-nothing closure; decision 43's refusals before resolution (scratch: thrown mid-layer);
   `level-doubled` (scratch: allowed).
5. **A flat node's position budget is 0,** as measured (decision 22). Whether a node created at a computed position
   should carry a budget is an open item, not part of this build.
6. **The flat test trusts the links for each front's extent;** a ring mis-paired upstream whose ends lie on the right
   lines would pass. None was constructed. This is a known limit, recorded and not designed against here.
7. **The replacement refusal specimens** of decision 53 are settled by the build: which clause refuses
   `uniform-1-523` and `uniform-1-1977`, and whether either meets the dashboard's step-through tests (more than one
   frame, targetless bisectors on the first). If neither does, the build stops on that item and reports.
8. **Grid draw `uniform-1-129`,** incomplete with a step failure today and under the rules, gets a red test of its
   sound roof and an open issue note, written by the build (BSA.D266).
9. **Whether the third-front rule can be had as a split of a newborn vertex** (BSA.D344) does not change this spec
   unless the user says so.

### What the build settled

Measured on the built tree (commits `8e14378` to `add41b8`).

1. **The stretch bar decided nothing.** Over every candidate ring any multi-ring step produced (core's suite, the sweep
   harness's holed group, the ten cured layouts and the user's, and both grids: 429 candidates), the shortest stretch was
   12,207 floors and the shortest segment between two nodes the same. No stretch at or under 4 floors arose, and no
   ring refused under decision 12 had a segment that short. So whether decision 12's sine bar already refuses every
   stretch at or under the bar is not established: the only short stretches measured are BSA.F113's, on one-ring steps,
   which this build does not reach. Building-shell's own suite was not traced (its console was not captured); its holed
   fixtures are the layouts traced directly.
2. **The build built no non-rectilinear weighted specimen; BSA.F118 did, and it joins the closed forms** (decision 50,
   BSA.D353). The build's claim that decision 35's weight terms decide a facing verdict is **withdrawn** (BSA.D353): the
   function test it rested on, walls of inward normals (1, 0) and (0.6, −0.8) against the bottom wall, pairs walls no
   legal input pairs as a gap, since neither `n_wall` nor `−n_wall` lies in the cone of their normals. On every legal
   input the sign of `n_wall · v` is independent of the weights (decision 46, restated); the weight terms set `v`'s
   direction and move only the grazing margin. The facing-band specimen and its asymmetric variant, the bottom wall at
   weight 2, put a clear gap in the band `0 < n_wall · v < w_wall`, and the built code solves both in their closed
   forms. E′w and `2h-int-1w` are sound.
3. As ruled. The goldens gained 33 files and the manifest 319 lines; no existing golden byte moved.
4. **No measured cure was lost.** Grid 1: 79 more draws complete and sound, the other three unchanged. Grid 2: 1,000 of
   1,000 sound. The ten layouts and `CourtL-draft` sound (oracle worst 2.27e-13 cm). E′ and `2h-int-1` in their closed
   forms; `2h-int-86`, `2h-int-144` and `2h-int-371` sound.
5. As ruled: a node at a cluster's seed carries a budget of 0.
6. **The known limit, and one form of it measured.** On the sweep harness's holed group 36 of 336 cells moved, every one
   refused on the parent tree: 15 now complete and clean, 19 still refused (most under `not-one-line`, three under
   `not-a-tree`), and two signalled. `Holed A′` jittered, seed 0, completes with a `causality-violation`: its flat ring's
   stretch is born as a ridge whose walls are antiparallel only to within the jitter, so `addBisectionEdge` prices it by
   the sign of a sub-resolution rate and reverses its basis; decision 25's premise that the basis is the clockwise
   wall's does not hold there. `Holed E` jittered, seed 0, is blocked by the holed guard. Contrary to BSA.F113's
   samples, tree-shaped flat rings do arise: the jitter parts the concentric fixtures' corner meetings and leaves
   L-shaped flat rings, refused under decision 29.
7. **The refusal specimens:** `uniform-1-523` and `uniform-1-1977` are refused under simultaneous-rings decision 21, a
   vertex event across rings of three runs, neither rule firing. `uniform-1-523` meets the dashboard's step-through
   tests and replaces E′ in core and the dashboard; both are building-shell's `HOLED_REFUSALS`.
8. **`uniform-1-129`** ends on a ring of two straight bisectors between the collinear outline walls either side of its
   wing, K3 of the collinear-walls umbrella note: a red test in `holed-grid-fuzz.test.ts` and
   [ISSUE-skeleton-grid-draw-straight-bisector-pair](./ISSUE-skeleton-grid-draw-straight-bisector-pair.md).
9. **One clause could not fail, and is removed.** `node-off-stretches` held by construction, since every node is an end
   of some piece; its mutation gate left every test green. Decision 17 is amended and the clause is gone from the code
   (BSA.D351).

## 7. Deferred

- **One-ring steps:** the flat rule on single-loop steps moves a defect fixture and leans on the bar, and the
  [three-front meeting on one ring](./ISSUE-skeleton-three-front-meeting-on-one-ring.md) stays as it is (BSA.D301,
  BSA.D345).
- **Meetings of more than two runs** (node 5 decision 21), and the refusals of decisions 29, 31 and 44, until a
  specimen of each is measured.
- **Merge-first sequencing with the flat rule,** which needs the third-front rule on no rectilinear sample (BSA.F113),
  is not built.
