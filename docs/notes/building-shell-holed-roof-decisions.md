---
title: "Building-shell holed roof: decision spec"
type: decision-spec
area: building-shell
status: proposed
date: 2026-11-15
part_of: [holed-skeleton-roadmap.md]
depends_on: [skeleton-join-and-divide-decisions.md, skeleton-loop-consumers-decisions.md]
---

# Building-shell holed roof: decision spec

Node 9 of the [holed-skeleton roadmap](./holed-skeleton-roadmap.md), written from BSA.F89, BSA.F90, BSA.F94, BSA.D132,
BSA.D278 to BSA.D284, BSA.D261 and BSA.D266, the [loops input spec](./skeleton-loops-input-decisions.md), the
[join and divide spec](./skeleton-join-and-divide-decisions.md), and a reading of `apps/building-shell/` at `0ec7e58`.

## 1. Intent

A storey island with a courtyard is roofed today by slitting its footprint along a cut and solving the slit ring as one
outline. This spec makes `apps/building-shell` hand `solveSkeleton` the island's outline and its holes, deletes the cut
and every rule that places, pitches or tags it, and lifts the limit of one hole per island (BSA.D282, BSA.D284). It fixes
the roster below and the decisions of section 3. **A storey with no hole builds byte-identically.** **It cannot be
accepted before roadmap nodes 4, 5 and 6 are completed:** node 4 is approved and not built, and nodes 5 and 6 have no
spec. Rings are axis-aligned, so every courtyard has hole walls facing parallel outline walls across its bands, the
case node 4 refuses as `simultaneous-across-rings` and leaves to node 5 (node 4, decisions 19 and 44); with node 4
alone every courtyard fixture in the corpus is expected, not measured, to be a hard error.

## 2. Type and surface roster

`+` added, `~` changed, `-` removed. Files are under `apps/building-shell/src/` unless a path is given.

| | Surface | File |
|---|---|---|
| ~ | `Form = 'hip' \| 'gable' \| 'mono'` (was `\| 'cut'`) | [roof/model.ts](../../apps/building-shell/src/roof/model.ts) |
| ~ | `Wall` gains `loop: number` (0 the outer loop, `k` the comp's hole `k - 1`) and `edge: number` (its index in that loop) | roof/model.ts |
| ~ | `Comp { walls: Wall[]; outer: Pt[]; holes: Pt[][] }`; `ring` removed | roof/model.ts |
| + | `compLoops(c: Comp): Pt[][]`, `[c.outer, ...c.holes]` | roof/model.ts |
| ~ | `finishBuilding(rawComps: {outer: Pt[]; holes: Pt[][]; attrs: Partial<Wall>[][]}[])`, `attrs[k][j]` for loop `k`'s edge `j` | roof/model.ts |
| ~ | `buildFromRects(rects, sels, defaultTan)` takes holes; `buildCourtyard(outerR, innerR, defaultTan = 1)`; `transformBuilding` per loop | roof/model.ts |
| ~ | `solveFaces(comp, weights)`; `SolveRefused.kind` gains `'door-loops'` | [roof/skeleton.ts](../../apps/building-shell/src/roof/skeleton.ts) |
| ~ | `extentOf`, `buildPieces` (cut branch removed), `planeUsable`, `solveRoofParts`; `BOptions.literalCut` removed | [roof/algoB.ts](../../apps/building-shell/src/roof/algoB.ts) |
| ~ | `measure` (two cut lines removed); cases 9a to 9d; `SLIT` removed | [roof/measure.ts](../../apps/building-shell/src/roof/measure.ts), [roof/cases.ts](../../apps/building-shell/src/roof/cases.ts) |
| - | `courtyard.ts` whole: `selectCut`, `leavesBothSides`, `cutPitch`, `freeCutPitch`, `spliceCourtyard`, `CourtyardCut`, `SplicedCourtyard` | [courtyard.ts](../../apps/building-shell/src/courtyard.ts) |
| ~ | `buildingOf`, `planChecked`, `extrudeOutline`, `plateBottom`, `hipSolid`, `gableGenerating`, `zoneTag`; `GableZone` loses `kind`; `pickedAttrs`, `capLoops` removed | [storey.ts](../../apps/building-shell/src/storey.ts) |
| - | `selPicks` (its one reader was `pickedAttrs`) | [ring-forms.ts](../../apps/building-shell/src/ring-forms.ts) |
| ~ | the `extentOf` copy, `wallsOnLine`, `risePieces`' corner rule | [rise.ts](../../apps/building-shell/src/rise.ts) |
| + | `HOLED_FIXTURES` | [fixture.ts](../../apps/building-shell/src/fixture.ts) |
| ~ | research conversion and catalogue label; `catalogue-facts.ts` regenerated | [viewer/research-cases.ts](../../apps/building-shell/src/viewer/research-cases.ts), [viewer/catalogue.ts](../../apps/building-shell/src/viewer/catalogue.ts) |
| - | `cutPlaneViolations` and its call in `invariantViolations` | [tests/shell-invariants.ts](../../apps/building-shell/tests/shell-invariants.ts) |
| = | `roof/surface.ts`, `tags.ts`, `union.ts`, `tuck.ts`, `ShellKind` (`Internal` stays for plate caps) | |

## 3. Decisions

### What this unit needs from core

1. **From nodes 2 and 3, built:** `options.holes` with per-hole `weights`, `loopMaps` (outline first, `reversed` per
   loop), and every loop refusal a throw whose message starts `Loop conflict (`.
2. **From node 4, approved and not built:** a holed solve that steps to `complete: true`, with
   `simultaneous-across-rings` and `multi-ring-step-refused` blocking.
3. **From node 5, unspecified:** a hole wall facing a parallel outline wall solves. **From node 6, unspecified:**
   `computeMaxOffset` and `computeStrips` take a holed result, one `Strip` per exterior edge of every loop, its
   `supportingEdgeIds` that edge and its `frontage` that edge's own two ends.
4. **Contact stays refused until node 8,** and this unit does not wait for it.

### The holed Comp

5. **`comp.walls` holds the outer loop's edges in loop order from vertex 0, then each hole's edges from its vertex 0,
   holes in the order `unionLoops` returns them.** `outer` stays counter-clockwise and each hole clockwise, so the left
   normal is inward on every wall (BSA.F94), and a storey with no hole lists exactly today's walls.
6. **`Comp.ring` is removed, not kept as the outline,** so no reader of the slit ring silently reads the outline as the
   footprint. `solveFaces` reads `outer` and `holes`; `extentOf` in `algoB.ts` and its `rise.ts` copy take their breaks
   from every vertex of `compLoops(comp)`, the vertex set the slit ring held, so every extent is today's;
   `extrudeOutline` and `plateBottom` read `compLoops`; `transformBuilding` maps and reverses each loop alone.
7. **"Walls follow ring order" becomes "walls follow loop order":** a monopitch's dead wall in `finishBuilding` is the
   previous or next edge of its own loop, and wall `j` of loop `k` is the prism side from that loop's vertex `j` to `j + 1`.
8. **`buildFromRects` takes holes and `buildingOf` always calls it:** each hole joins the outer loop of least area
   containing its vertex 0 by `pointInPoly`, each loop's attributes come from `applySelectors`, and `pickedAttrs` goes;
   a traced wall lies on one union wall, one `Sel`, so the two agree on every wall.
9. **The nesting is building-shell's own exact test, not `groupLoopsByNesting`,** because that helper tests contact
   across every pair of the storey's loops at δ, and can refuse islands 1/1024 cm apart that build today
   (`GapAligned1`, `GapOffset1`). `unionLoops` refuses a corner-only pinch and merges a shared length, so its loops
   never cross or touch and one vertex decides containment. A hole no outer loop contains is a hard error.

### The solve

10. **`solveFaces` calls `solveSkeleton(comp.outer, {weights: w[0], holes: comp.holes.map((h, k) => ({vertices: h,
    weights: w[k + 1]}))})`,** where `w[k]` is `1 / tan` of loop `k`'s walls in edge order.
11. **Winding is passed as building-shell holds it and core normalises it:** every loop is `reversed`, each
    `winding-normalised` diagnostic is filtered as today, and a single loop reaches core exactly as today.
12. **A strip's wall is the first wall in `comp.walls` order whose `loopMaps[w.loop].edgeToEdge[w.edge]` is the
    strip's supporting edge and whose span holds the frontage midpoint;** none is the `'unmapped'` refusal. The map
    fixes the loop, and the midpoint keeps today's choice among the collinear walls canonicalisation merges, which share
    a plane but not a span, and `slopeInBuilding` reads the span.
13. **The tiling reference area is `|area(outer)| - Σ |area(hole)|`,** today's slit-ring area.
14. **`classify` reads a message starting `Loop conflict (` as `'door-loops'`, before its other tests.**
15. **A core refusal and a `complete: false` result are hard errors naming the island:** `solveRoofParts` throws
    `solveRoofParts: island <ci> at (<x>, <y>) with <h> holes: default hip refused by the skeleton: <kind>: <message>`,
    `(x, y)` the outer loop's vertex 0, and `planBuilding` prefixes `<label> storey <n>: `; an `incomplete` message
    carries every blocking diagnostic's kind and detail. `runB` keeps its note-and-continue, so a research case reads
    `BLOCKED`.

### Pitches and weights

16. **Every wall takes its own union wall's derived pitch, a courtyard wall as any other,** and nothing picks a pitch
    for a wall the footprint does not have.
17. **Building-shell never meets core's refusal of a weight change at a straight vertex:** a straight vertex joins two
    traced walls of one union wall, which `unionWallForms` gives one pitch; the cut was the only other source, and the
    visible-corner test runs per loop. A refusal anyway is decision 15's hard error.

### Algorithm B with no cut

18. **The cut branch of `buildPieces` is deleted, with `BOptions.literalCut`, `planeUsable`'s `form !== 'cut'` and
    `runB`'s comment on a cut's pitch.** The loop over promoted walls is left, read for three cases: all hips give no
    piece; a gable on an outer wall reads `extentOf`, `endWall` and `farWall` over every loop's walls, its far wall
    perhaps a courtyard wall, as today; a gable on a courtyard wall runs its extent along the line past the hole wall
    into the band, as today, and journal decision 220's claimed-band rule decides whether B keeps it or a rise is built.
19. **`endWall` is unchanged:** no two walls hold the point `EPS` inside a line's end, so wall order moves nothing; where
    a cut wall gave no plane today, the wall found there now, if any, is real and gives its plane.
20. **`farWall` breaks a tie at one distance by `comp.walls` order,** in `algoB.ts` and its `rise.ts` copy, so on a
    holed island decision 5's order can move a pushed plane; such a move shows in decision 42's canonical diff.

### The raw solids and tags

21. **`extrudeOutline` writes each loop once at the floor and once at the plate, triangulates its caps from
    `compLoops`, and builds wall `j` of loop `k` from that loop's own vertices.** The courtyard's duplicate cap
    vertices go. An island with no hole writes today's positions in today's order.
22. **Every hip solid has its bottom at the plate, triangulated from `compLoops`,** and `extrudeOutline` loses its
    `plateCap` parameter. A holed hip solid stood from the floor only because the hip fell to the plate along the slit,
    which Manifold could take as a diagonal (BSA.D132); with no slit it meets the plate only at the eaves.
23. **A gable piece's footprint trim stays `comp.outer`:** its rectangle reaches only to the nearest wall facing back
    across its band, and the near wall of a hole in front of it is such a wall, so no piece reaches a hole.
24. **The `Internal` zone of `gableGenerating` is deleted, with every `form !== 'cut'` test there,** so `GableZone`
    loses its `kind` field and `zoneTag` its Internal branch. `Internal` stays the plate caps' tag, and
    `survivingInternal` stays a defect asserted 0.
25. **The hard errors of holed storeys are deleted:** `planChecked`'s cut check, `buildingOf`'s "no raw Ring wall cuts
    the courtyard" and "holds <n> holes", `buildFromRects`' "holes need a cut", and the cut-end errors.
26. **An authored side or run of a form other than hip or gable stays a hard error,** and its message drops "and only
    the courtyard rule places a cut". `measure` loses its skip of cut walls and its "a cut is not a wall" plane rule;
    `rise.ts` loses `wallsOnLine`'s and the corner rule's cut tests.

### Islands, nesting and contact

27. **An island takes any number of holes,** each solved in its one call, its genus per component the hole count.
28. **An island inside another island's courtyard is its own Comp,** the outer loop of its group by decision 8's least
    containing area, and a hole of that inner island joins the inner island.
29. **Contact reaches the user in three forms:** a corner-only touch between loops is `storeyLoops`' `PlanRefusal`, as
    today; a shared length is no contact, since the union merges it into a notch or one hole; and two loops closer than
    core's perceptual floor δ in the island's unit space are core's `contact` refusal, decision 15's hard error, until
    node 8. The viewer shows each message in its failure panel.
30. **A fully internal Ring is still dropped before the plan and named in `droppedRings` (BSA.D261), and a tuck stays
    labelled `Tuck` (BSA.D272).** BSA.F90's fifth Ring is dropped so.

### Numbering

31. **Walls are numbered storey-wide in Comp order and, within a Comp, by decision 5; planes by their first wall in
    that order, keyed as today.** On a holed island, and every island after it on the storey, this moves wall ids, plane
    ids and labels, `FaceTag.wall` and `FaceTag.plane`, and the faceID order and all ordered by it. A plane only a cut
    wall held goes. Roof identity keys on plane, and the renumbering is a bijection, so it splits or merges no face.
32. **What moves because the roof changes is separate:** Roof faces near the old cut, Gable and Cheek faces the cut
    pieces stood, Internal faces on the cut's plane, the hip solid's bottom, and every Cell and Edge on them.

### The copy and the research table

33. **The pin on `roof/model.ts`, `roof/skeleton.ts`, `roof/algoB.ts`, `roof/measure.ts` and `roof/cases.ts` is
    released (BSA.D282); `roof/surface.ts` stays unedited.**
34. **`buildCourtyard(outerR, innerR, defaultTan = 1)` builds one Comp of the outer rectangle with the inner one as its
    hole,** and cases 9a to 9d call it with their own rectangles. 9b becomes the same building as 9a; it keeps its id,
    its worked number at (900, 150) and its place, and is retitled "Courtyard, the true roof beside a corner".
35. **The copy-integrity test pins the tally `pass 44, cheek 6, fail 3, blocked 0, none 0` and the 53 verdicts
    unchanged,** 9a to 9d `PASS` against their `annulus` expectation, the true holed roof; it no longer claims all 53
    match roof-gable's `run.ts`, only 49. Before node 5 they read `BLOCKED`, a red test with an issue note (BSA.D266).

### Fixtures and closed forms

36. **The height oracle for an all-hip island at one pitch θ is `z(p) = plate + tan θ · d∞(p)`,** `d∞(p)` the L∞
    distance from `p` to outside the outline or inside a hole: at equal weights an axis-aligned region's straight
    skeleton is its L∞ erosion, and the courtyard tests' "time read off the rectangles" is this.
37. **The concentric square courtyard** (outline side `L`, hole side `h`, every wall at θ) has its ridge on the square
    loop at offset `(L - h)/4` from both loops, at `z = plate + ((L - h)/4) tan θ`, with hips from the outer corners
    and valleys from the hole corners to the loop's corners; each outer Roof face has plan area
    `(L + (L + h)/2)/2 · (L - h)/4` and each hole face `(h + (L + h)/2)/2 · (L - h)/4`. `Courtyard` (1000, 400, 30°):
    ridge `250 + 150 tan 30° = 336.603` cm, faces 127,500 and 82,500 cm² in plan.
38. **`HOLED_FIXTURES` in `fixture.ts`, listed by the golden set and the viewer,** every Ring one storey hipped at 30°:
    - `CourtyardWingsBothSides`, BSA.F90's Rings `[0,0,1000,300]`, `[-250,300,300,700]`, `[700,300,1300,700]`,
      `[0,700,1000,1000]`, `[700,300,1000,700]`, the last dropped. Top `250 + 200 tan 30° = 365.47` cm, on y = 500
      over x [-50, 100] and [900, 1100].
    - `CourtyardJutWing`, BSA.F88's Rings, moved here from the tests.
    - `TwoCourtyards`: `[0,0,1600,300]`, `[0,700,1600,1000]`, `[0,300,300,700]`, `[700,300,900,700]`,
      `[1300,300,1600,700]`; genus 2, the middle wing's ridge at `250 + 100 tan 30°` on x = 800.
    - `CourtyardInCourtyard`: a 2000 square ring 300 deep round an 800 square island `[600, 1400]²` ring 250 deep;
      genus `[1, 1]`, ridges at `250 + 150 tan 30°` and `250 + 125 tan 30°`.
39. **Every holed fixture asserts** the building-shell spec's decision 32 invariants with genus per component its hole
    count, `survivingInternal` 0, no conflict and every solve's `tilingError` under `1e-9`; all hip at one pitch, no
    Gable or Cheek face and decision 36's height at its listed points within `SHELL_TOLERANCE_CM`.

### Goldens and pins

40. **The courtyard goldens are the 20 manifest entries with a hole:** `Courtyard`, `HoleRingConflict` and its
    `Swapped` and `FileReversed`, `CutPitchConflict` and its `Swapped` and `FileReversed`, `FullWingsProbe`,
    `CutOvershootProbe`, `Court5Seed1h300`, `Court16Seed1h250`, `Court14Seed7h250`, `SplitBandFreeCut`,
    `SplitBandFreeCut45`, `SplitBandAllGable75`, `SB400-600B100S500g60r024`, `CourtyardAt22.5-45s`,
    `CourtyardJutCutSwapped`, `CourtyardRiseFacingCut` and `CourtyardRiseAlongCut`. Each is expected to change
    (BSA.D284), and each doc comment is restated without the cut.
41. **Every golden with no hole on any storey stays byte-identical,** held by the drift test; a divergence is diagnosed
    and fixed or accepted with a written reason (BSA.D284).
42. **The re-export's diff is reported per entry in the head journal as one of:** byte-identical; numbering only, its
    shell's canonical diff (`wire/canonical.ts`) empty; roof changed, with that diff's lines; or its manifest state
    (clean, residue, error) changed, old and new.
43. **A golden whose name names the cut is renamed for its layout:** `CutPitchConflict` to `BandPitchConflict` (and its
    `Swapped` and `FileReversed`), `CutOvershootProbe` to `OffCentreCourtyard`, `SplitBandFreeCut` to
    `SplitBandMixedPitch`, `SplitBandFreeCut45` to `SplitBand45`, `CourtyardJutCutSwapped` to `CourtyardJutSwapped`,
    `CourtyardRiseFacingCut` to `CourtyardRiseFacingWing`, `CourtyardRiseAlongCut` to `CourtyardRiseOnOuterWall`;
    test-only fixtures named for the cut follow the same rule.
44. **Every courtyard pin is re-measured** (`COURTYARD_DEFECTS`, `SPLIT_COURTYARD_DEFECTS`, `ROSTER_PITCH_DEFECTS`'
    `Courtyard@` entries, `CUT_OVERSHOOT_DEFECTS`, and the courtyard entries of `GABLE_RISE_CONFLICTS` and
    `GABLE_RISE_SPLIT_CONFLICTS`): a case now clean leaves its table with a "cured by the holed roof" comment and its
    golden is promoted; `OffCentreCourtyard` then asserts (127.3, 251.7) at `250 + 101.7 tan 30°`.
45. **A pin whose outcome changes to another defect is reported, never re-pinned by the implementer,** and the lead
    rules it a fact pin (a Cheek, BSA.D260) or a red test with an issue note (BSA.D266). An emptied
    `'algorithm-B cut-piece overshoot'` joins a new `EMPTIED_BY_HOLED_ROOF`; both cut class names stay as the record.

### Tests deleted and replaced

46. **`courtyard.test.ts`'s cut tests are deleted** (place, splice, pitch, free pitch, `expectSplitCut`, and every
    `cutAt` and `endsOf` check of the BSA.D279 cases); **every invariant check over the same layouts is kept,** and the
    BSA.D279 cases keep their mirror partners and closed-form heights, which are decision 36's.
47. **`NoCutProbe` and `TwoHolesProbe` must build,** genus 1 and 2, no Gable or Cheek face; `HoleProbe` asserts its
    ridge at `250 + 50 tan 30°`. **`CutProbe` is deleted,** no `Sel` carrying a cut; `AuthoredCutProbe`,
    `BuriedCutProbe` and `CutSide` stay, as tests of an unknown authored form.
48. **Elsewhere the cut assertions go and their subjects stay:** `ring-forms.test.ts` keeps the hole wall's pitch;
    `rise.test.ts` asserts a courtyard wall keeps its slope; `golden.test.ts`' free-cut tests become clean-golden
    checks; and `robustness.test.ts`' "cut along its split" becomes: a uniform-pitch split-band layout's canonical shell
    equals its unsplit twin's.

### Gates

49. **The baseline is measured before the first edit:** the building-shell Vitest count passed and its named red tests.
50. **Mutation gates, each turning a test red:** the outline alone to `solveFaces` (every holed fixture); hole weights
    all ones (`CourtyardMixedPitch`, `HoleSide45`); the strip match reading `loopMaps[0]` (`unmapped`); a hole's walls
    reversed (the prism); `extentOf`'s breaks from the outer loop alone (`CourtGabled`); a hole joining the first
    containing outer loop (`CourtyardInCourtyard`); the tiling area of the outer loop alone (decision 39); the island
    dropped from decision 15's message; and `buildCourtyard` without its hole (copy integrity).

### The viewer

51. **The viewer's research conversion keeps its four Rings about the hole and drops the cut:** the catalogue label's
    "(cut placed by the pipeline)" and the conversion's cut sentence go, its `form === 'cut'` skips go, and 9b's reason
    becomes "as Rings it is 9a". `catalogue-facts.ts` is regenerated with `CATALOGUE_FACTS_WRITE=1`.

### Amendments owed to the building-shell spec

52. **These are owed to [building-shell-prototype-decisions.md](./building-shell-prototype-decisions.md), for the
    lead to make:**
    - §1's copied files: "copied unchanged", "nothing else changes" and "no other edit is allowed" hold for
      `surface.ts` only; the other five are released by BSA.D282. `courtyard.ts`, "places decision 2's cut", is gone.
    - Decision 1: strike "which only a courtyard cut collinear with no wall reads (decision 2)" from `defaultDeg`.
    - Decision 2: the block "A hole (a courtyard) is roofed through a cut" and all its bullets are replaced by: an
      island may hold any number of holes, roofed by the skeleton of its outline with its holes; the wall prism is the
      true outline; an authored side form other than hip or gable is a hard error.
    - Decision 7: strike the holed hip solid standing from the floor; every hip solid's bottom is at the plate.
    - Decision 9: "`runB` keeps its behaviour exactly" holds for islands with no hole.
    - Decision 31: the pinned tally and verdicts are unchanged, and 9a to 9d are measured on the holed roof.
    - Decision 32: a component's genus is its hole count.
    - The fixtures' preamble: `Courtyard`'s report figures, re-measured.
    - §3: courtyards are roofed on the holed skeleton, not through a cut.

## 4. Deferred

- **Merging touching loops:** node 8. Until then contact is decision 29's refusal.
- **The C++ port:** not a consideration (BSA.D281). Owed to it, recorded only: its courtyard path is the cut, and every
  courtyard golden it diffs against moves.
- **`experiments/`:** neither typechecked nor tested; it stays as the record of its findings and no longer builds
  against `src/`.
