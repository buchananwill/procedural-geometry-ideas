---
title: "Building-shell holed roof: decision spec"
type: decision-spec
area: building-shell
status: implementing
date: 2026-11-15
part_of: [holed-skeleton-roadmap.md]
depends_on: [skeleton-join-and-divide-decisions.md, skeleton-loop-consumers-decisions.md, skeleton-simultaneous-rings-decisions.md]
---

# Building-shell holed roof: decision spec

## 1. Intent

Node 9 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md). `apps/building-shell` stops slitting a courtyard
footprint along a cut and hands `solveSkeleton` each island's outline and holes with their per-wall weights. The cut and
every rule that places, pitches or tags it go, with the one-hole-per-island limit (BSA.D280, BSA.D282, BSA.D284). An
island the solver refuses is a hard error naming it, and never a roof. The spec fixes the measurement it rests on (§2),
the roster (§3) and the decisions (§4). It was drafted at `0ec7e58` and revised at `68546eb`, after nodes 4 to 6 and the
holed guard (BSA.D314, BSA.D318). **A storey with no hole builds byte-identically.**

## 2. What the holed solve does with the app's courtyards (measured)

Measured on 2026-11-15 by the revising delegate, from a throwaway copy of core, test-fixtures and building-shell at
`68546eb`. The copy's own suite passed 9,992 tests with the recording hook in place. Each island's loops come from
`storeyLoops`, its pitches from `unionWallForms` and its grouping from building-shell's least-area containment. Each
island is solved by `solveSkeleton(outer, {weights, holes})` with weights `1 / tan`. A complete result then goes to a
checker independent of the solver, which convicts three constructed wrong answers. It asserts equal time at every node,
time never decreasing along an edge, clearance at the slowest weight, one strip per solved edge, every caller wall mapped
by `loopMaps`, tiling to 1e-9, and every point of a 37 × 37 grid covered once inside the footprint and never outside. On
a single-pitch island it also asserts each node's and sample's height against `d∞`, the L∞ distance to the nearest wall.

| Source (holed islands) | Islands | Sound | Refused by name | Complete and wrong | Threw |
|---|---|---|---|---|---|
| Fixtures, rise, the 20 courtyard goldens, 91 pinned cases, 130 roster-pitch cases, probes, research 9a–9d | 288 | 288 | 0 | 0 | 0 |
| BSA.F89's jut family (juts 50–800, 30° and 45°, mirrored, transposed, two storeys) and BSA.F90 | 161 | 161 | 0 | 0 | 0 |
| Every distinct footprint the app's suite reaches (recorded in `buildingOf`) | 1,152 | 1,143 | 9 | 0 | 0 |
| Seeded courtyards, 300 seeds × 40 draws, classic and split (24,000 draws) | 29,292 | 29,292 | 0 | 0 | 0 |
| 2 to 4 courtyards per island on the 50 cm lattice, in a row or 2 × 2 (3,000 layouts) | 3,000 | 1,732 | 1,268 | 0 | 0 |
| The draft's `TwoCourtyards` and `CourtyardInCourtyard` | 3 | 2 | 1 | 0 | 0 |

| Split, all holed sources | Islands | Sound | Refused by name |
|---|---|---|---|
| One pitch, one hole | 15,893 | 15,885 | 8: 4 `simultaneous-across-rings`, 4 `multi-ring-step-refused` |
| Mixed pitch, one hole | 15,001 | 15,001 | 0 |
| One pitch, 2 to 4 holes | 1,511 | 709 | 802: 592 `simultaneous-across-rings`, 136 `multi-ring-step-refused`, 74 `step-failure` |
| Mixed pitch, 2 to 4 holes | 1,491 | 1,023 | 468: 142, 283 and 19 of the same, 24 `holed-topology-violation` |
| Loops in contact | 0 | — | — |

- **Nothing is complete and wrong, and core throws on nothing.** The weighted defect
  (`ISSUE-skeleton-weighted-edge-runs-backwards-in-time.md`) does not appear in 16,492 mixed-pitch holed islands. The
  straight-bisector defect (`ISSUE-skeleton-straight-bisector-between-collinear-walls.md`) appears only as refusals by
  name.
- **The 24 `holed-topology-violation` results fail on un-culled zero-length self-loops alone.** The checker finds them
  sound in every other respect, and BSA.D318 makes that kind informational.
- **No sound solve carries a `causality-violation` diagnostic,** holed (32,618) or single-loop (14,626).
- **The regression is 8 distinct footprints that build clean today and are refused.** They are 6 layouts of
  `tests/courtyard.test.ts` and 3 mirror partners built inside those tests. `CourtL`, `JutMidWall`, `BandRunsOnPastCut`
  and its y-mirror are refused as `simultaneous-across-rings`. `JutAlignedS`, its y-mirror (which is `JutAlignedN`'s
  footprint), `JutBelowCutLine` and its y-mirror are refused as `multi-ring-step-refused`. **None is a roster fixture,
  golden, pinned case, catalogue entry or generator draw.**
- **Gains:** BSA.F90's layout builds, sound. 1,732 of the 3,000 multi-courtyard layouts build, 1,756 after BSA.D318's
  softening; today all 3,000 are hard errors.
- **Single-loop islands, which this node leaves unchanged:** 14,626 are sound, 12,481 of them checked against `d∞`.
  They are 6,727 from `randomFixtures` (30 seeds), 3,511 U shapes, and 4,388 named and suite footprints. The app's
  footprints do not meet the straight-bisector defect today.
- **Grouping:** the app's containment test and `groupLoopsByNesting` agree on 39,551 multi-loop storeys. The helper
  throws `Loop conflict (contact)` on 4 more, `GapAligned` and `GapOffset` at gaps of 0.5/1024 and 1/1024 cm, which
  build today as two islands solved apart.
- **Contact:** the least gap between two loops of any island is 100 cm. `unionLoops` refuses a corner-only pinch and
  merges a shared length, so no app footprint reaches core's contact refusal.

**One specimen per non-sound outcome.** Each is one storey, with every Ring hipped at the pitch given.

- `simultaneous-across-rings`, one hole (`CourtL`, 30°): `[0,0,1000,300]`, `[0,700,1000,1000]`, `[0,300,300,700]`,
  `[700,300,1000,700]`, `[1000,0,1400,300]`.
- `multi-ring-step-refused`, one hole (`JutAlignedS`, 30°): `[0,0,1000,300]`, `[0,300,300,700]`, `[-250,300,0,500]`,
  `[0,700,1000,1000]`, `[700,300,1000,700]`.
- `simultaneous-across-rings`, two holes (`TwoHolesProbe`, 30°): `[0,0,700,100]`, `[0,200,700,300]`, `[0,100,100,200]`,
  `[300,100,400,200]`, `[600,100,700,200]`.
- `multi-ring-step-refused`, two holes (the draft's `TwoCourtyards`, 30°): `[0,0,1600,300]`, `[0,700,1600,1000]`,
  `[0,300,300,700]`, `[700,300,900,700]`, `[1300,300,1600,700]`.
- `step-failure`, three holes (37°): `[0,0,1450,300]`, `[0,300,200,400]`, `[400,300,700,400]`, `[900,300,1200,400]`,
  `[1300,300,1450,400]`, `[0,400,1450,550]`.

## 3. Type and surface roster

`+` added, `~` changed, `-` removed. Files are under `apps/building-shell/src/` unless a path is given.

| | Surface | File |
|---|---|---|
| ~ | `Form = 'hip' \| 'gable' \| 'mono'` (was `\| 'cut'`) | [roof/model.ts](../../apps/building-shell/src/roof/model.ts) |
| ~ | `Wall` gains `loop: number` (0 the outer loop, `k` the comp's hole `k - 1`) and `edge: number` (its index in that loop) | roof/model.ts |
| ~ | `Comp { walls: Wall[]; outer: Pt[]; holes: Pt[][] }`; `ring` removed | roof/model.ts |
| + | `compLoops(c: Comp): Pt[][]`, `[c.outer, ...c.holes]` | roof/model.ts |
| ~ | `finishBuilding(rawComps: {outer: Pt[]; holes: Pt[][]; attrs: Partial<Wall>[][]}[])`, `attrs[k][j]` for loop `k`'s edge `j` | roof/model.ts |
| ~ | `buildFromRects(rects, sels, defaultTan)` takes holes; `buildCourtyard(outerR, innerR, defaultTan = 1)`; `transformBuilding` per loop | roof/model.ts |
| ~ | `solveFaces(comp, weights: number[][])`; `SolveRefused.kind` gains `'door-loops'` and `'strip-missing'`, and `SolveRefused` gains `cause: string` | [roof/skeleton.ts](../../apps/building-shell/src/roof/skeleton.ts) |
| + | `HOLED_CAUSES: Readonly<Record<string, string>>` | roof/skeleton.ts |
| ~ | `extentOf`, `buildPieces` (cut branch removed), `planeUsable`, `solveRoofParts`, `runB`; `BOptions.literalCut` removed | [roof/algoB.ts](../../apps/building-shell/src/roof/algoB.ts) |
| ~ | `measure` (its two cut lines removed); cases 9a to 9d; `SLIT` removed | [roof/measure.ts](../../apps/building-shell/src/roof/measure.ts), [roof/cases.ts](../../apps/building-shell/src/roof/cases.ts) |
| - | `courtyard.ts` whole: `selectCut`, `leavesBothSides`, `cutPitch`, `freeCutPitch`, `spliceCourtyard`, `CourtyardCut`, `SplicedCourtyard` | [courtyard.ts](../../apps/building-shell/src/courtyard.ts) |
| ~ | `buildingOf`, `planChecked`, `extrudeOutline`, `plateBottom`, `hipSolid`, `gablePiece`, `gableGenerating`, `zoneTag`; `GableZone` loses `kind`; `pickedAttrs`, `capLoops` removed | [storey.ts](../../apps/building-shell/src/storey.ts) |
| ~ | `checkedSide` and `checkedRun` messages; `selPicks` removed (its one reader was `pickedAttrs`) | [ring-forms.ts](../../apps/building-shell/src/ring-forms.ts) |
| ~ | the copies of `extentOf` and `farWall`, `wallsOnLine`, `risePieces`' corner rule | [rise.ts](../../apps/building-shell/src/rise.ts) |
| + | `HOLED_FIXTURES` | [fixture.ts](../../apps/building-shell/src/fixture.ts) |
| ~ | research conversion and catalogue label; `catalogue-facts.ts` regenerated | [viewer/research-cases.ts](../../apps/building-shell/src/viewer/research-cases.ts), [viewer/catalogue.ts](../../apps/building-shell/src/viewer/catalogue.ts) |
| + | `HOLED_REFUSALS`: each refused layout, its Rings, its skeleton kind and its issue note | [tests/robustness-fixtures.ts](../../apps/building-shell/tests/robustness-fixtures.ts) |
| - | `cutPlaneViolations` and its call in `invariantViolations` | [tests/shell-invariants.ts](../../apps/building-shell/tests/shell-invariants.ts) |
| = | `roof/surface.ts`, `tags.ts`, `union.ts`, `tuck.ts`, `ShellKind` (`Internal` stays for plate caps) | |

## 4. Decisions

### What core gives, as built

1. **Relied on, all built:** `options.holes` with per-hole `weights`, `loopMaps` (outline first, `reversed` per loop),
   holed steps through join, divide and two-ring meetings (nodes 4 and 5), and `computeStrips(result, {depth:
   computeMaxOffset(result)})`, which gives one strip per exterior edge of every loop (node 6, BSA.F104).
2. **Refused by core by name, with `complete: false`:** `simultaneous-across-rings`, `multi-ring-step-refused`,
   `step-failure`, `unresolved-edges` and the holed guard's blocking kinds, `holed-topology-violation` and
   `holed-equal-time-violation`. BSA.D318's widening, in the working tree at this revision, adds the blocking
   `holed-time-order-violation` and `holed-planarity-violation` and the informational `holed-unculled-self-loop`.
3. **Contact between loops stays a throw whose message contains `Loop conflict (`, until node 8.** This unit does not
   wait for node 8, because no app footprint measured reaches it.

### The holed Comp

4. **`comp.walls` holds the outer loop's edges in loop order from vertex 0, then each hole's edges from its vertex 0,**
   holes in `unionLoops`' order. The outline stays counter-clockwise and each hole clockwise, so the left normal is
   inward on every wall (BSA.F94), and a storey with no hole lists exactly today's walls.
5. **`Comp.ring` is removed, not kept as the outline,** so no reader of the slit ring silently reads the outline as the
   footprint. `extentOf` in `algoB.ts`, and its `rise.ts` copy, take their breaks from every vertex of `compLoops`.
   `extrudeOutline` and `plateBottom` read `compLoops`, and `transformBuilding` maps and reverses each loop alone.
6. **Walls follow loop order:** a monopitch's dead wall is the previous or next edge of its own loop, and wall `j` of
   loop `k` is the prism side from that loop's vertex `j` to `j + 1`.
7. **`buildingOf` always calls `buildFromRects`, which takes holes and reads each loop's attributes by
   `applySelectors`;** `pickedAttrs` and `selPicks` go, since a traced wall lies on one union wall and so one `Sel`.
8. **Each hole joins the outer loop of least area containing its vertex 0, by building-shell's own `pointInPoly`, not by
   `groupLoopsByNesting`.** The two agree on 39,551 measured storeys. The helper refuses `GapAligned` and `GapOffset` at
   0.5/1024 and 1/1024 cm, which build today, because it tests contact across the whole storey and islands are solved
   apart. A hole that no outer loop contains is a hard error.

### The solve and its refusals

9. **`solveFaces` calls `solveSkeleton(comp.outer, {weights: w[0], holes: comp.holes.map((h, k) => ({vertices: h,
   weights: w[k + 1]}))})`,** `w[k]` being `1 / tan` of loop `k`'s walls in edge order. With no hole the call is today's
   `solveSkeleton(comp.outer, {weights: w[0]})`, and each `winding-normalised` diagnostic is filtered as today.
10. **A strip's wall is the first wall in `comp.walls` whose `loopMaps[w.loop].edgeToEdge[w.edge]` is the strip's
    supporting edge and whose span holds the frontage midpoint,** and finding none is the `'unmapped'` refusal. The
    midpoint keeps today's choice among the collinear walls that canonicalisation merges.
11. **`solveFaces` never skips a strip.** A boundary of fewer than three points is the `'strip-missing'` refusal naming
    the edge, and so is an edge with no strip or two, and so is a strip count other than the solved edge count
    (BSA.D316). It holds on every island: no strip of the 14,626 single-loop islands measured is empty, so no single-loop
    output moves.
12. **The tiling reference area is `|area(outer)| - Σ |area(hole)|`,** today's slit-ring area.
13. **`complete: false` is the `'incomplete'` refusal.** Its `cause` lists every blocking diagnostic, each by
    `HOLED_CAUSES` and then by its own kind and detail. A kind that `HOLED_CAUSES` does not name is given verbatim, so no
    future kind is dropped.
14. **On an island with a hole, a `causality-violation` diagnostic is also the `'incomplete'` refusal.** No sound solve
    measured carries one, and the direction oracle fires on every weighted backwards edge measured (BSA.F102), so this
    closes the open weighted defect's silent path. A single-loop island keeps today's count-and-continue.
15. **A throw containing `Loop conflict (` is the `'door-loops'` refusal,** which `classify` tests first.
16. **`HOLED_CAUSES` gives each refusal the app's cause in the user's terms:**

    ```ts
    export const HOLED_CAUSES: Readonly<Record<string, string>> = {
      'simultaneous-across-rings': 'three wall fronts meet at one point at one moment, which the roof solver refuses',
      'multi-ring-step-refused': 'walls in line, facing the same way, leave a sliver the roof solver cannot place',
      'step-failure': 'a step of the roof solver failed, as it can where walls lie in line',
      'unresolved-edges': 'the roof solver left a hip or valley unfinished',
      'holed-topology-violation': "the roof solver's own check found its answer wrong",
      'holed-equal-time-violation': "the roof solver's own check found its answer wrong",
      'holed-time-order-violation': "the roof solver's own check found its answer wrong",
      'holed-planarity-violation': "the roof solver's own check found its answer wrong",
      'causality-violation': 'the roof solver found a hip or valley running backwards, as it can with mixed pitches',
      'door-loops': "two of the island's loops touch or cross, which the roof solver does not take yet",
    };
    ```

17. **Every refusal is a hard error naming the island:** `solveRoofParts` throws `solveRoofParts: island <ci> at (<x>,
    <y>) with <h> holes cannot be roofed: <cause> [<kind>: <message>]`, where `(x, y)` is the outer loop's vertex 0,
    and `planBuilding` prefixes `<label> storey <n>: `. The viewer shows it in its failure panel. `runB` keeps its
    note-and-continue, so a research case reads `BLOCKED`.

### Pitches and weights

18. **Every wall takes its own union wall's derived pitch, a courtyard wall like any other,** and nothing picks a pitch
    for a wall the footprint does not have.
19. **Core's refusal of a weight change at a straight vertex is never met.** A straight vertex joins two traced walls of
    one union wall, which has one pitch, and the cut was the only other source. §2 measured no throw at all.
20. **A mixed-pitch courtyard is roofed by the weighted holed solve.** All 15,001 mixed-pitch one-hole islands measured
    are sound, and decisions 13 and 14 make any wrong weighted answer a hard error, never a roof.

### Algorithm B with no cut

21. **The cut branch of `buildPieces` is deleted,** with `BOptions.literalCut`, `planeUsable`'s `form !== 'cut'` and
    `runB`'s comment on a cut's pitch. All hips give no piece. A gable on any wall reads `extentOf`, `endWall` and
    `farWall` over every loop's walls, and its far wall may be a courtyard wall, as today.
22. **A gable on a courtyard wall runs its extent along its line wherever the line stays inside the footprint, as any
    wall's does.** No rule names the old cut's line, since no cut wall breaks it now. Journal decision 220's
    claimed-band rule decides whether B keeps the gable or a rise is built. `CourtyardRiseFacingWing` and
    `CourtyardRiseOnOuterWall` show it.
23. **`endWall` is unchanged, since no two walls hold the point `EPS` inside a line's end; `farWall` and its `rise.ts`
    copy break a tie at one distance by `comp.walls` order.** A tie moves a plane only between walls on one line, at
    one distance, with different pitches, and any such move shows in the re-export's canonical diff.

### The raw solids and tags

24. **`extrudeOutline` writes each loop at the floor and at the plate, triangulates its caps from `compLoops`, and
    builds wall `j` of loop `k` from that loop's vertices.** An island with no hole writes today's positions in today's
    order.
25. **Every hip solid has its bottom at the plate, triangulated from `compLoops`, and `plateCap` goes.** A holed hip
    solid stood from the floor only because the hip fell to the plate along the slit, which Manifold could take as a
    diagonal (BSA.D132). With no slit, the roof meets the plate only at its eaves, as on every island.
26. **A gable piece's footprint trim is `compLoops(comp)`, the island with its holes.** `farWall` already stops the
    rectangle at a hole's near wall, so the trim moves nothing where that holds and keeps a piece off a hole where it
    does not. An island with no hole trims as today.
27. **The `Internal` zone of `gableGenerating` goes, with every `form !== 'cut'` test there,** so `GableZone` loses
    `kind`. `Internal` stays the plate caps' tag, and `survivingInternal` stays a defect asserted 0.
28. **The hard errors of holed storeys are deleted:** `planChecked`'s cut check, `buildingOf`'s "no raw Ring wall cuts
    the courtyard" and "holds <n> holes", `buildFromRects`' "holes need a cut", and the cut-end errors.
29. **An authored side or run of a form other than hip or gable stays a hard error,** and its message drops "and only
    the courtyard rule places a cut". `measure` loses its cut skip and its "a cut is not a wall" plane rule, and
    `rise.ts` loses its cut tests.

### Islands and contact

30. **An island takes any number of holes, solved in one call, and its genus per component is its hole count.** An
    island inside another island's courtyard is its own Comp, and its own holes join it by least containing area.
31. **Contact reaches the user in two forms, neither of which a measured footprint meets.** A corner-only touch is
    `storeyLoops`' `PlanRefusal`, as today. Two loops of one island closer than δ are the `'door-loops'` hard error.
    A shared length is no contact, since the union merges it.
32. **A fully internal Ring is still dropped before the plan (BSA.D261), and a tuck stays `Tuck` (BSA.D272).**
    BSA.F90's fifth Ring is dropped so.

### Numbering

33. **Walls are numbered storey-wide in Comp order, the outer loop first and then each hole, and planes by their first
    wall, keyed as today.** On a holed island and every island after it, this moves wall and plane ids, their labels,
    `FaceTag.wall`, `FaceTag.plane` and the faceID order. The renumbering is a bijection, and Roof identity keys on
    plane, so no face splits or merges; a plane only a cut wall held goes.
34. **What moves because the roof changes is reported apart from the numbering:** Roof faces near the old cut, the cut
    pieces' Gable and Cheek faces, Internal faces on the cut's plane, the hip solid's bottom, and their Cells and Edges.

### The copy and the research table

35. **The pin on `roof/model.ts`, `skeleton.ts`, `algoB.ts`, `measure.ts` and `cases.ts` is released (BSA.D282), and
    `roof/surface.ts` stays unedited.**
36. **`buildCourtyard(outerR, innerR, defaultTan = 1)` builds one Comp, the outer rectangle with the inner one as its
    hole,** and 9a to 9d call it. 9b becomes 9a's building, keeps its id, place and worked number at (900, 150), and is
    retitled "Courtyard, the true roof beside a corner".
37. **The copy-integrity test keeps the tally `pass 44, cheek 6, fail 3, blocked 0, none 0` and its 53 verdicts,** 9a to
    9d `PASS`: all four measured sound and equal at every sample to `d∞`, which is their `annulus` expectation. It claims
    that 49 cases, not 53, match roof-gable's `run.ts`.

### Fixtures and closed forms

38. **The height oracle for an all-hip island at one pitch θ is `z(p) = plate + tan θ · d∞(p)`,** since at equal weights
    an axis-aligned region's skeleton is its L∞ erosion. Every one-pitch island measured that is not refused meets it.
39. **`HOLED_FIXTURES`, listed by the golden set and the viewer, every Ring one storey hipped at 30°, each measured
    sound:**
    - `Courtyard`, 1000 square round a 400 square hole: the ridge loop at `250 + 150 tan 30° = 336.603` cm, with outer
      Roof faces of 127,500 cm² and hole faces of 82,500 cm² in plan.
    - `CourtyardWingsBothSides`, BSA.F90's Rings `[0,0,1000,300]`, `[-250,300,300,700]`, `[700,300,1300,700]`,
      `[0,700,1000,1000]` and `[700,300,1000,700]`, the last dropped. Its top is at `250 + 200 tan 30° = 365.47` cm, on
      y = 500 over x [-50, 100] and [900, 1100].
    - `CourtyardJutWing`, BSA.F88's Rings, moved here from the tests.
    - `TwoCourtyards`: `[0,0,1800,300]`, `[0,700,1800,1000]`, `[0,300,300,700]`, `[700,300,1100,700]` and
      `[1500,300,1800,700]`. Genus 2, with the middle wing's top at `250 + 200 tan 30°` at (900, 500). The draft's
      equal-wing layout is refused.
    - `CourtyardInCourtyard`: a 2000 square ring 300 deep round an 800 square island `[600, 1400]²` ring 250 deep.
      Genus `[1, 1]`, with ridges at `250 + 150 tan 30°` and `250 + 125 tan 30°`.
40. **Every holed fixture asserts** the building-shell spec's decision 32 invariants with genus per component its hole
    count, `survivingInternal` 0, no conflict, `tilingError` under `1e-9`, no Gable or Cheek face, and the L∞
    oracle's height at its listed points within `SHELL_TOLERANCE_CM`.

### Refused layouts and the regression

41. **The regression is stated plainly: 8 footprints that build clean today are refused.** `CourtL`, `JutMidWall`,
    `BandRunsOnPastCut` and its y-mirror are refused as `simultaneous-across-rings`. `JutAlignedS`, `JutAlignedN`,
    `JutBelowCutLine` and its y-mirror are refused as `multi-ring-step-refused`.
42. **`HOLED_REFUSALS` holds those 8 with `TwoHolesProbe` and the draft's `TwoCourtyards`.** Each entry gives its Rings,
    its skeleton kind and its issue note: `ISSUE-skeleton-three-front-meeting-refused.md` for
    `simultaneous-across-rings`, and `ISSUE-skeleton-straight-vertex-in-zero-area-ring.md` for
    `multi-ring-step-refused`. Each note gains its specimens' Rings.
43. **Each entry's test asserts decision 17's hard error with the island and its kind,** and so is green on a guard in
    production code, as BSA.D311 reads BSA.D266 for a refusal by name. A cure turns it red, and the entry is promoted
    to a fixture. None is asserted as roofed.

### Goldens and pins

44. **The courtyard goldens are the 20 manifest entries with a hole, counted from `GOLDEN_FIXTURES`, all measured
    sound:** `Courtyard`; `HoleRingConflict` and `CutPitchConflict`, each with its `Swapped` and `FileReversed`;
    `FullWingsProbe`, `CutOvershootProbe`, `Court5Seed1h300`, `Court16Seed1h250`, `Court14Seed7h250`; `SplitBandFreeCut`,
    `SplitBandFreeCut45`, `SplitBandAllGable75`, `SB400-600B100S500g60r024`; `CourtyardAt22.5-45s`,
    `CourtyardJutCutSwapped`, `CourtyardRiseFacingCut` and `CourtyardRiseAlongCut`. This count supersedes BSA.F94's 5.
    Each is expected to change (BSA.D284), and its doc comment is restated without the cut.
45. **Every golden with no hole on any storey stays byte-identical,** held by the drift test. A divergence is diagnosed,
    then fixed or accepted with a written reason (BSA.D284).
46. **The re-export's diff is reported per entry in the head journal** as one of four things: byte-identical; numbering
    only, with its shell's canonical diff (`wire/canonical.ts`) empty; roof changed, with that diff's lines; or its
    manifest state changed, old and new.
47. **A golden whose name names the cut is renamed for its layout, and its doc comment keeps its former name:**
    `CutPitchConflict` to `BandPitchConflict` (with its `Swapped` and `FileReversed`), `CutOvershootProbe` to
    `OffCentreCourtyard`, `SplitBandFreeCut` to `SplitBandMixedPitch`, `SplitBandFreeCut45` to `SplitBand45`,
    `CourtyardJutCutSwapped` to `CourtyardJutSwapped`, `CourtyardRiseFacingCut` to `CourtyardRiseFacingWing`, and
    `CourtyardRiseAlongCut` to `CourtyardRiseOnOuterWall`. Test-only fixtures follow the same rule.
48. **Every courtyard pin is re-measured,** and their 91 holed cases all solve sound. The tables are
    `COURTYARD_DEFECTS`, `SPLIT_COURTYARD_DEFECTS`, `ROSTER_PITCH_DEFECTS`' `Courtyard@` entries,
    `CUT_OVERSHOOT_DEFECTS`, and the courtyard entries of `GABLE_RISE_CONFLICTS` and `GABLE_RISE_SPLIT_CONFLICTS`. A
    case now clean leaves its table with a "cured by the holed roof" comment, and its golden is promoted;
    `OffCentreCourtyard` then asserts (127.3, 251.7) at `250 + 101.7 tan 30°`.
49. **A pin whose outcome changes to another defect is reported, never re-pinned by the implementer,** and the lead
    rules it a fact pin (BSA.D260) or a red test with an issue note (BSA.D266). An emptied `'algorithm-B cut-piece
    overshoot'` joins a new `EMPTIED_BY_HOLED_ROOF`.

### Tests deleted and replaced

50. **`courtyard.test.ts`'s cut tests are deleted** (place, splice, pitch, free pitch, `expectSplitCut`, every `cutAt`
    and `endsOf`). Every invariant check over the same layouts is kept, and the BSA.D279 cases that solve keep their
    mirror partners and closed-form heights.
51. **`NoCutProbe` builds with genus 1 and no Gable or Cheek face, and `HoleProbe` asserts its ridge at `250 + 50 tan
    30°`;** both are measured sound. `CutProbe` is deleted, with every `Sel` carrying a cut, `storey.test.ts`'s among
    them. `AuthoredCutProbe`, `BuriedCutProbe` and `CutSide` stay, as tests of an unknown authored form.
52. **Elsewhere the cut assertions go and their subjects stay:** `ring-forms.test.ts` keeps the hole wall's pitch,
    `rise.test.ts` asserts that a courtyard wall keeps its slope, `gable-settings.test.ts` loses its `form !== 'cut'`
    filter, `golden.test.ts`' free-cut tests become clean-golden checks, and `robustness.test.ts`' "cut along its split"
    asserts that a uniform-pitch split-band layout's canonical shell equals its unsplit twin's.

### Gates and the viewer

53. **The baseline is measured before the first edit:** the Vitest count passed (9,992 at `68546eb`) and its named red
    tests.
54. **Mutation gates, each turning a test red:** the outline alone to `solveFaces` (every holed fixture); hole weights
    all ones (`CourtyardMixedPitch`, `HoleSide45`); the strip match reading `loopMaps[0]`; a hole's walls reversed;
    `extentOf`'s breaks from the outer loop alone (`CourtGabled`); a hole joining the first containing outer loop
    (`CourtyardInCourtyard`); the tiling area of the outer loop alone; `complete: false` read as complete (every
    `HOLED_REFUSALS` entry); an empty strip skipped and a holed `causality-violation` ignored (constructed results);
    the island dropped from decision 17's message; and `buildCourtyard` without its hole (copy integrity).
55. **The viewer's research conversion keeps its four Rings about the hole and drops the cut:** the catalogue's "(cut
    placed by the pipeline)", the conversion's cut sentence and its `form === 'cut'` skips go. 9b's reason becomes "as
    Rings it is 9a", and `catalogue-facts.ts` is regenerated with `CATALOGUE_FACTS_WRITE=1`.
56. **Owed to [building-shell-prototype-decisions.md](./building-shell-prototype-decisions.md), for the lead when this
    lands:** in §1, "copied unchanged" holds for `surface.ts` only, and `courtyard.ts` is gone; decision 1 loses its
    courtyard-cut clause on `defaultDeg`; decision 2's cut block becomes "an island holds any number of holes, roofed by
    the skeleton of its outline and holes, its prism the true outline, a refused island a hard error naming it";
    decision 7 loses the hip solid standing from the floor; decision 9's "behaviour exactly" holds for islands with no
    hole; decision 31 records 9a to 9d on the holed roof; decision 32's genus per component is its hole count; the
    fixtures' preamble re-measures `Courtyard`; and §3 says courtyards are roofed on the holed skeleton.

### The lead's amendments on approval (BSA.D321)

55. **The guard's widening is landed at `7e6105c`,** so decision 2's "in the working tree" clause is void: the blocking
    kinds are `holed-topology-violation`, `holed-equal-time-violation`, `holed-time-order-violation` and
    `holed-planarity-violation`, each in `HOLED_CAUSES`. `holed-unculled-self-loop` is informational: it is not a
    refusal, and the island is roofed. §2's 24 refusals for a self-loop alone therefore build.
56. **The implementer re-measures §2 on the tree it builds on, before deleting the cut,** with the widened guard, and
    reports the table again. The spec's counts were taken at `68546eb`. If the re-measurement finds a footprint that
    is complete and wrong by an independent check, or a regression beyond the 8 layouts of decision 41 among the app's
    fixtures, goldens, pins, catalogue or generator draws, the implementer stops before the deletion and reports.
57. **Option A of section 6 is what this spec builds, on the arc's branch, which is not pushed or merged without the
    user.** The 8 refused layouts are listed for the user in the journal with their Rings. Two of them, a wing that
    carries a band's line on past the courtyard (`CourtL`) and a wing in line with a band (`JutAlignedS`), are layouts
    a person would draw; the generator draws no wing beside a courtyard (BSA.F89), so its 24,000 clean draws say
    nothing about how often an editor's user would meet the refusal.
58. **The viewer's failure panel shows decision 17's message whole,** and the catalogue marks each `HOLED_REFUSALS`
    entry as refused with its cause, so a refused layout can be loaded and looked at.

## 5. Deferred

- **Merging touching loops:** roadmap node 8. Until then contact is the `'door-loops'` hard error.
- **The cures of the refused layouts:** the three-front meeting, the straight vertex in a zero-area ring and the
  straight-bisector family are the user's to rule on (BSA.D301, BSA.D314). This unit changes nothing in core.
- **The C++ port:** not a consideration (BSA.D281). Its courtyard path is the cut, and every courtyard golden moves.
- **`experiments/`:** neither typechecked nor tested. It stays as a record and no longer builds against `src/`.

## 6. For the user's ruling (not blocking)

The spec as written is option A. It needs no ruling beyond BSA.D282, BSA.D284 and BSA.D266, as BSA.D311 reads that
decision. The other two options are recorded with their counts so that the user can reverse the choice.

- **A. Land now.** 8 footprints that build clean today become hard errors. All 8 are test-local: 6 layouts and 3
  mirror partners in `tests/courtyard.test.ts`. No fixture, golden, pinned case, catalogue entry or generator draw is
  lost. BSA.F90 builds, and so do 1,732 of 3,000 multi-courtyard layouts, where today all 3,000 error. No silent roof
  was measured.
- **B. Keep the cut as a fallback for refused islands.** It recovers at most those 8 one-hole footprints and no
  multi-hole island, since a cut takes one hole. It keeps `courtyard.ts`, the cut branch of the pinned copy and the
  defects BSA.F89 and BSA.F90 found there, against BSA.D280's steer.
- **C. Wait for the cures.** It holds back 32,618 sound holed islands, BSA.F90's among them, for 8 test layouts.
