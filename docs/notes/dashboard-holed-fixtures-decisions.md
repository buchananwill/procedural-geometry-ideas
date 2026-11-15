---
title: "Dashboard holed fixtures: decision spec"
type: decision-spec
area: dashboard
status: implementing
date: 2026-11-15
part_of: [holed-skeleton-roadmap.md]
depends_on: [skeleton-loop-consumers-decisions.md]
---

# Dashboard holed fixtures: decision spec

Node 7 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md), "holed fixtures in the dashboard", written from
BSA.D284, BSA.F92 and BSA.F93 and a reading of the files in the roster at `a8ba71f`. It is built on the holed solve of
[node 4](./skeleton-join-and-divide-decisions.md) and the holed roster of [node 6](./skeleton-loop-consumers-decisions.md),
and starts only when the node 6 spec is completed.

## 1. Intent

The dashboard is how defects in this solver are found, so a holed fixture must be inspectable as a single-loop one is
(BSA.D284: "my eyes have more than earned their value in this system"). This spec lets the skeleton editor load any
fixture of `HOLED_TEST_POLYGONS` and draw it, its skeleton, its step-through and its debug overlays, with every refusal
and every incomplete solve stated on screen. **Holes are displayed, never edited** (BSA.D284). **Every single-loop path
of the dashboard is unchanged.** It touches `packages/core` for two surfaces: a stepped twin of `solveSkeleton`, and a
loop table on the primary-bisector preview.

## 2. Type and surface roster

`+` added, `~` changed, `=` unchanged but named because a reader will look for it. Line numbers are at `a8ba71f`.

| | Surface | File |
|---|---|---|
| + | `StoredHole`, `holes`, `holedFixtureName`, `loadHoledFixture`; `~` `setVertices`, `resetPolygon` | [usePolygonStore.ts](../../packages/dashboard/src/stores/usePolygonStore.ts) |
| + | `HOLED_FIXTURE_OPTION_GROUP`, `SKELETON_FIXTURE_OPTION_GROUPS`, `RECURSIVE_FIXTURE_OPTION_GROUPS`, `holedFixtureByName`, `FixtureOption.disabled?`; `=` `FIXTURE_OPTION_GROUPS`, `fixtureByName` | [fixture-options.ts](../../packages/dashboard/src/components/fixture-options.ts) |
| ~ | the loaders (lines 113 to 125; line 106), the holed notice, Copy Vertices, the editor bridge (lines 136 to 144), hole weights | [ControlsPanel.tsx](../../packages/dashboard/src/components/ControlsPanel.tsx), [RecursivePolygonPanel.tsx](../../packages/dashboard/src/components/RecursivePolygonPanel.tsx), [EdgeWeightsPanel.tsx](../../packages/dashboard/src/components/EdgeWeightsPanel.tsx) |
| + | `SkeletonSolveOptions.holes`, `solveHoledSkeletonGuarded`, `solveHoledSkeletonSteppedGuarded`, `describeBlockingDiagnostics`; `=` the three single-loop functions | [skeleton-solve-boundary.ts](../../packages/dashboard/src/hooks/skeleton-solve-boundary.ts) |
| ~ | `useSkeletonAnimation(vertices, perceptualFloor?, weights?, holes?)`, `+ holedSolve`, `+ solverLoopMaps`; `useCollisionSweep(…, holedGraph?)` | [useSkeletonAnimation.ts](../../packages/dashboard/src/hooks/useSkeletonAnimation.ts), [useCollisionSweep.ts](../../packages/dashboard/src/hooks/useCollisionSweep.ts) |
| ~ | `skeletonToScene` `+ holes`, `+ solverLoopMaps`, `+ incomplete`: lines 84 to 104, 322 to 357, 368, 518 | [skeletonToScene.ts](../../packages/dashboard/src/scene/adapters/skeletonToScene.ts) |
| + | `SceneRegion` and its `renderPrimitive` case; hole vertex markers | [scene/types.ts](../../packages/dashboard/src/scene/types.ts), [SceneCanvas.tsx](../../packages/dashboard/src/scene/SceneCanvas.tsx), [SkeletonInteractionOverlay.tsx](../../packages/dashboard/src/components/SkeletonInteractionOverlay.tsx) |
| ~ | the holed solve report; the removed-vertex count | [AlgorithmPanel.tsx](../../packages/dashboard/src/components/AlgorithmPanel.tsx), [DebugPanel.tsx](../../packages/dashboard/src/components/DebugPanel.tsx) |
| ~ | `PipelineParams.holes`, the slice refusal, the region area; hole strokes | [parcel-pipeline.ts](../../packages/dashboard/src/hooks/parcel-pipeline.ts), [parcelsToScene.ts](../../packages/dashboard/src/scene/adapters/parcelsToScene.ts) |
| + | the holed notice, the bridge, slice and incomplete texts, as constants | new `holed-fixture-text.ts` in `packages/dashboard/src/components/` |
| = | `PolygonCanvas`, deprecated, no consumer in the repo | [PolygonCanvas.tsx](../../packages/dashboard/src/components/PolygonCanvas.tsx) |
| + | `solveSkeletonStepped`, `SteppedSkeletonSolveResult`; `~` `runSimplePolygon`'s observer, the stepped refusal's text; `=` `runAlgorithmV5`, `runAlgorithmV5Stepped`, `canonicaliseForSolve` | [algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts) |
| ~ | `computePrimaryInteriorEdges(…, weights?, loops?)`; `=` the other three functions | [debug-helpers.ts](../../packages/core/src/straight-skeleton/debug-helpers.ts) |
| ~ | `holes` threaded through; exports of every `+` | [straight-skeleton/page.tsx](../../apps/demo/src/app/straight-skeleton/page.tsx), [parcels/page.tsx](../../apps/demo/src/app/parcels/page.tsx); both `index.ts` |

## 3. Decisions

### Where holes live

1. **The holes live in `usePolygonStore`, beside the outline,** because both canvases, the solve and the outline editor
   read this store, and a second store could hold one fixture's outline and another's holes:
   ```ts
   export interface StoredHole { vertices: Vertex[]; weights: number[] }   // weights all ones where the fixture gives none
   holes: StoredHole[];                // [] for a single-loop polygon
   holedFixtureName: string | null;    // null exactly when holes is []
   loadHoledFixture: (fixture: HoledTestPolygon) => void;
   ```
2. **`loadHoledFixture` is the only writer of `holes`.** It copies the outline, its weights (all ones where omitted) and
   every hole, sets the name and clears `selectedVertex`; no array is shared with the roster.
3. **`setVertices` and `resetPolygon` clear both hole fields,** so a single-loop fixture load, a paste, a random
   generation (useRandomPolygonStore.ts lines 41, 59, 75) and a reset each leave a single-loop polygon.
4. **The outline stays editable while holes are loaded.** The five outline mutators act as today and leave `holes`
   untouched. The ruling forbids editing holes, not the outline; dragging a wall against a fixed courtyard is an
   inspection; and every placement the solver cannot take (outside, crossing, contact) is a throw core names.
5. **The holes are read-only on screen.** The overlay draws each hole vertex as a non-draggable, unselectable marker
   (radius 5, `#868e96`); click-to-insert reads `vertices` only (line 197). `EdgeWeightsPanel` lists hole weights as
   text, `Hole k, edge j → j+1`, wrapping in the hole.
6. **`ControlsPanel` states the holed state:** `“{name}”: {h} hole(s), drawn read-only. Outline vertices and weights stay
   editable. Loading a fixture, pasting, generating or Reset Polygon removes the holes.` **Copy Vertices is disabled,**
   with `Copy holds one ring, so it is off while holes are loaded.`, since copying the outline alone drops the holes.

### The loader

7. **The holed roster is a third group, in the skeleton editor's loader only:** `HOLED_FIXTURE_OPTION_GROUP`, headed
   `Holed`, lists `HOLED_TEST_POLYGONS` in roster order, and `SKELETON_FIXTURE_OPTION_GROUPS` is `FIXTURE_OPTION_GROUPS`
   then it. `FIXTURE_OPTION_GROUPS` and `fixtureByName` keep meaning `FULL_CORPUS`, so the test pinning them stands.
8. **A holed option carries no prefix:** every roster name begins `Holed ` (node 6, decision 29), so the mark survives
   the search that flattens groups. Holed names must not equal a `FULL_CORPUS` name, since the values must be unique.
9. **`ControlsPanel`'s loader calls `loadHoledFixture` for a name `holedFixtureByName` resolves, else `setVertices`.**
   The straight-skeleton and parcels pages share it.
10. **The recursive loader lists the holed group with every item disabled,** headed `Holed (recursive subdivision refuses
    holes)`. Every fixture is listed (journal decision 72), and there one could only show `subdivideRecursively`'s throw.
11. **A holed fixture that is a red test in core loads like any other, marked nothing in advance.** The roster has no
    defect half (node 6, decision 31), a list kept here would drift from core's tests, and the solve's report marks it.

### Solving

12. **Each path calls this; the holed path is taken exactly when `holes` is non-empty:**

    | Path | Single loop (unchanged) | Holed |
    |---|---|---|
    | final solve | `runAlgorithmV5` (boundary file line 87) | `solveSkeleton(vertices, {perceptualFloor, weights, holes})` |
    | remap, refusal on edit | `canonicaliseForSolve` (line 68) | that same holed solve; the remap is `loopMaps` |
    | step-through | `runAlgorithmV5Stepped` (line 110) | `solveSkeletonStepped`, same options |
    | init sweep | `makeStraightSkeletonSolverContext(vertices)` | the holed graph's exterior positions, `undefined`, `exteriorWeights`, `loops` |
    | full sweep, offset labels | ids `n .. 2n − 1`; `computeNodeOffsetDistances` | the same, loop-neutral |
    | primary preview | `computePrimaryInteriorEdges(vertices, …, weights)` | the holed graph's exterior positions, `result.weights`, `loops` |

    A single loop keeps `runAlgorithmV5`, which never normalises winding: moving it would change a counter-clockwise ring.
13. **The holed solve runs whenever holes are loaded, shown or not, in one memo;** `showSkeleton` gates drawing only. It
    is the boundary stage and the final solve at once, because `canonicaliseForSolve` stays single-loop and a holed caller
    reads `loopMaps` (nodes 2 and 3, decision 5), so a refusal appears as the outline is dragged.
14. **`useSkeletonAnimation` passes `holes` to every path,** and adds `holedSolve: SkeletonSolveResult | null` and
    `solverLoopMaps`, both `null` on a single loop. On the holed path `solverContext` is `holedSolve.context`,
    `solverVertexRemap` is `loopMaps[0].vertexToNode`, the reset effect (lines 183 to 188) lists `holes`, and a throw
    keeps the last good holed result on the canvas, as a single loop does.
15. **The boundary file turns each holed throw into a message:** `solveHoledSkeletonGuarded` returns `{result:
    SkeletonSolveResult | null; error: string | null}`, `solveHoledSkeletonSteppedGuarded` the same over
    `SteppedSkeletonSolveResult`, and `describeBlockingDiagnostics(diagnostics)` the `Skeleton incomplete` alert's text,
    `null` with no blocking kind.
16. **A holed step-through is adapted to `SteppedAlgorithmResult` as `{snapshots, error: describeBlockingDiagnostics(
    result.diagnostics)}`,** so `AlgorithmPanel`'s error label and modal serve both paths.

### Core: the stepped entry with holes

17. **This unit touches `packages/core`, and adds one entry,** which throws exactly what `solveSkeleton` throws:
    ```ts
    export interface SteppedSkeletonSolveResult {
        snapshots: StraightSkeletonGraph[];   // 0 after initialisation, then one per step boundary; caller space
        result: SkeletonSolveResult;          // what solveSkeleton(vertices, options) returns
        firstFailedSnapshot: number | null;   // the snapshot after the first step that recorded a failure
    }
    export function solveSkeletonStepped(vertices: Vector2[], options?: SolveSkeletonOptions): SteppedSkeletonSolveResult;
    ```
18. **`runAlgorithmV5Stepped` keeps refusing holes,** for nodes 2 and 3's reason (decision 4): it has no diagnostics
    channel. Its refusal gains `For snapshots of a holed solve, call solveSkeletonStepped.` This replaces that
    decision's "the stepped entry gains holes with roadmap node 7".
19. **The two entries run one pipeline.** `runSimplePolygon` (line 1269) takes an optional observer, called after
    `initInteriorEdges` and after each `tryToAcceptExteriorEdge` pass; with none the run is today's, so `solveSkeleton`
    is byte-identical.
20. **A snapshot is `structuredClone(context.graph)`, so it carries `loops`,** which is plain graph data for this reason
    (nodes 2 and 3, decision 6; BSA.F93). Each is denormalised once, and the last deep-equals `result.graph`. On the
    self-intersecting path `snapshots` is `[structuredClone(result.graph)]`.
21. **A failed step is never silent:** `result.diagnostics` carries every failure and refusal, which the legacy runner
    drops (`runSimplePolygonStepped` discards `stepAlgorithm`'s `errors` at line 2289).
22. **`computePrimaryInteriorEdges` takes an optional `loops`.** With it, `vertices` and `weights` are in exterior id order,
    a vertex's two edges wrap in its loop, and every edge of every loop is a target; a table that does not tile
    `vertices`, or holds a count under 3, is thrown. Omitted, the single-ring wrap (lines 133 to 156) is today's.
23. **Nothing else in core changes:** `generateCollisionSweep` (line 38), `computeNodeOffsetDistances` (line 69) and
    `computePrimaryEdgeIntersections` are loop-neutral.

### Drawing

24. **A hole is drawn empty by the even-odd rule.** `SceneRegion { type: 'region'; rings: number[][]; fill: FillStyle }`,
    ring 0 the outline, renders as a Konva `Shape` tracing each ring as a closed subpath with `fillRule="evenodd"` (Konva
    10.2) and `listening={false}`. It empties a hole however the caller wound it, and the door refuses crossing loops.
25. **With holes, the polygon group (lines 322 to 357) is one region (fill `#4c6ef5` at 0.1) and one closed line per
    loop (stroke `#4c6ef5`, width 2).** A hole wall is stroked as the outline is, because the solver treats it as a wall
    like any other; the empty fill tells it apart. With no holes the group is today's.
26. **Edge directions on a holed polygon give each loop one arrow per edge, wrapping in its loop, the way the solver walks
    it:** vertex `i` to `i + 1`, or `i + 1` to `i` where `loopMaps[k].reversed`; caller order when the solve threw.
    Worked example: F1's hole given clockwise, `(8,5.5), (7,4.5), (6,5.5), (7,6.5)`, is reversed, so caller edge 0 is
    drawn from `(7,4.5)` to `(8,5.5)`, which is a solved edge.
27. **The boundary labels (lines 84 to 104, 368) read the loop table:** the node after exterior edge `e` is
    `skeleton.edges[e].target`, and today's `(index + 1) % ring.length` only on a merged graph, whose `loops` is `[]`.
    Worked example on F1: `e3`'s label sits at `(5, 0)`; the modulo over all eight nodes would put it at `(9, 2.75)`.
28. **Exterior labels are the solver's global ids** (F1's hole is `4` to `7`), because every parent pair `[cw, ws]` names
    global ids, and per-loop numbers would be a second index space in one picture (journal decision 75).
29. **The removed mark (line 518) is per loop:** loop `k`'s vertex is marked `x` where `loopMaps[k].vertexToNode` is
    `REMOVED_VERTEX_INDEX`. The single-loop survivor-count rule stays.
30. **`incomplete`, passed as `holedSolve.complete === false`, shows the unresolved-edges group whatever its toggle,**
    so the part of the skeleton the solver did not finish reads as missing.
31. **These are loop-neutral and stay:** the skeleton, unresolved, selected-node and parent-label edges, the interior node
    labels (line 539), the sweep drawing and the full sweep's ids (useCollisionSweep.ts line 96). The holed init sweep
    builds its context from `holedGraph`, in caller space at the library floor, as the single-loop one does.
32. **`PolygonCanvas` gains one doc sentence, that it draws the outline only, and nothing else:** `Grep PolygonCanvas`
    over `packages` and `apps` finds only its export in the dashboard's `index.ts`.

### Overlays

33. **Every overlay of the straight-skeleton page works on a holed fixture:** the skeleton, the step-through, the primary
    preview and its intersections, both sweeps, offset times, every label and edge directions.
34. **The skeleton tree, the spine and recursive subdivision never see a hole:** the recursive loader disables holed
    items, and its editor bridge is disabled while `holes` is non-empty, with `The editor holds a holed fixture, and
    recursive subdivision needs a skeleton that is a tree.`
35. **The parcels page draws a holed fixture's skeleton, offset rings and strips, and refuses slicing.** It passes
    `holes` without weights, as it passes the outline; stops with `{stage: 'slice', message: 'Parcel slicing takes no
    holed region: a strip carries no loop, and lots of a holed footprint are outside this arc (BSA.D282). The skeleton,
    offset rings and strips shown are the holed solve's.'}`; reports the area less the holes'; and strokes each hole.

### Refusals and incomplete results on screen

36. **A core refusal is shown verbatim** under `Solver refused the input`, in `EdgeWeightsPanel`'s alert as today: each
    names its loop and the caller's vertex (nodes 2 and 3, decision 26), so no text is added.
37. **A holed result with `complete: false` shows an alert, `Skeleton incomplete`, outside `AlgorithmPanel`'s collapse,**
    each blocking diagnostic as its heading and then its `detail` verbatim:

    | Kind | Heading |
    |---|---|
    | `simultaneous-across-rings` | Events of two rings coincide. The solver refuses such a layer until roadmap node 5, and every courtyard with walls parallel to the outline's meets one. The skeleton stops at the refused step. |
    | `multi-ring-step-refused` | A step of several rings could not be resolved without guessing, and was refused. The skeleton stops there. |
    | `step-failure` | A step threw and was skipped; its bisectors stay unresolved. |
    | `unresolved-edges` | These bisectors never met anything; they are drawn as dashed rays. |

38. **Informational diagnostics are listed inside the collapse:** `causality-violation` in yellow as `{oracle} at
    {elementId}: {detail}`; `winding-normalised` and `vertices-canonicalised` dimmed, verbatim.
39. **A holed step-through's modal shows the `Skeleton incomplete` text, and that alert stands over every frame of an
    incomplete run,** so no frame reads as a finished skeleton.

### apps/demo and boundaries

40. **The straight-skeleton page passes `holes` to `useSkeletonAnimation`, `skeletonToScene` and `useCollisionSweep`, and
    the parcels page to `useParcelPipeline` and `parcelsToScene`.** The skeleton page's instructions gain `A holed
    fixture's holes are read-only; its outline can still be edited.` The recursive page does not change.
41. **Every single-loop path is unchanged; no tolerance, constant or comparison moves; the C++ port is not a
    consideration** (BSA.D281). Changes are confined to the dashboard, `solveSkeletonStepped` and the preview's `loops` in
    core, the two demo pages,
    and one sentence of the project CLAUDE.md naming the holed group of the skeleton loader.

### Tests and gates

42. **The baseline is measured before the first edit:** the dashboard and core Jest figures, and a SHA-256 of
    `skeletonToScene`'s output for every `FULL_CORPUS` fixture with every debug flag off and every flag on, pinned as
    `SINGLE_LOOP_SCENE_DIGESTS`. The dashboard's Jest reads core and the fixtures from `dist/`; build both first.
43. **Store and loader tests:** `loadHoledFixture` on F4 sets all four fields and copies; `setVertices` and `resetPolygon`
    clear both; each outline mutator leaves `holes` deep-equal; the holed group is the roster in order, prefixed
    `Holed `, disjoint from `FULL_CORPUS`, resolved by `holedFixtureByName`; every recursive holed item is disabled.
44. **Boundary tests:** F1 solves complete; a hole crossing the outline returns the throw's text; a concentric square
    built in the test gives `complete: false` and a text holding each present blocking kind's heading.
45. **Adapter tests, on every holed fixture:** one region of `1 + h` rings equal to the loops; one closed stroke per loop;
    every arrow and exterior edge label on one loop's own edge, so no segment joins two loops; node labels
    `0 .. numExteriorNodes − 1`; a built hole with a collinear vertex marked `x`; `incomplete` showing unresolved rays.
46. **Core tests:** `solveSkeletonStepped(…).result` deep-equals `solveSkeleton` on every holed and `FULL_CORPUS`
    fixture; every snapshot's `loops` equals the result's; the last snapshot deep-equals `result.graph`; the concentric
    square gives a non-null `firstFailedSnapshot`; the preview with F1's loops gives 8 edges, each target on a wall.
    **Parcel test:** F1 stops at `slice` with the slice refusal's message, strips and offset rings non-empty.
47. **Mutation gates, each turning a named test red:** the label's next node by `(index + 1) % numExteriorNodes`; the
    region without its holes; every loop stroked as one polyline; arrows ignoring `reversed`; removed marks from the
    outline's map; `incomplete` ignored; `setVertices` keeping holes; an outline edit clearing them; the holed group
    dropped; a recursive holed item enabled; the observer called at initialisation only; snapshots not denormalised;
    `loops` ignored by the preview; a holed parcel slice.
48. **The implementer runs `pnpm dev` and reports, fixture by fixture, what was seen:** every holed fixture with the
    skeleton, a full step-through, all labels, edge directions, the primary preview and both sweeps; F1 and F2 on the
    parcels page; F1's outline dragged across its hole; the recursive loader's disabled group; and `Square` and one
    defect fixture, unchanged. The canvas has no unit test, so this is the evidence that a hole reads as empty.

### The lead's amendments on approval (BSA.D317)

49. **The roster is 21 fixtures, not 9:** node 4's F1 to F8 and node 5's A to H, all of which solve (BSA.D315). The
    loader lists them all, so the concentric courtyard and the courtyard with wings can be looked at.
50. **Decision 37's table follows core as it now stands.** Node 5 landed, so `simultaneous-across-rings` no longer
    means every courtyard: its heading reads `Events of more than two fronts coincide (for example a corner of each of
    two holes reaching one wall together). The solver refuses such a layer; the skeleton stops at the refused step.`
    The blocking kinds the holed guard adds (BSA.D314) each get a heading in the same table, worded from the kind's own
    doc comment in core: the implementer reads `SkeletonDiagnosticKind` and gives every blocking kind a row, and a test
    fails when core has a blocking kind with no heading.
51. **Decision 44's refusal specimen is node 5's E′** (the outline `[0,21]×[0,10]` with holes `[3,9]×[3,7]` and
    `[12,18]×[3,7]`), since the concentric square solves. Decision 46's `firstFailedSnapshot` test uses it too.
52. **A holed fixture whose result the guard marks incomplete is drawn as incomplete** under decisions 30 and 37, so a
    skeleton the solver itself distrusts never reads as finished.
53. **This unit's first commit is the five small fixes of node 6's review** (BSA.D316), which touch core's tests, the
    sweep harness, one consumer message and one line of the project CLAUDE.md; node 6's spec is then set `completed`.

## 4. Deferred

- **Editing holes, and copying or pasting holed geometry:** BSA.D284; the clipboard payload holds one ring.
- **Node 5's refusal specimens in the loader:** when node 5 moves them into the roster (node 6, decision 29).
- **Parcels and subdivision of a holed region:** not this arc (BSA.D282). **Weights on the parcels page:** unweighted, as
  today.
