---
title: "Building Shell: a single-loop island of mixed pitch can be roofed with a folded roof and no refusal"
type: issue
area: building-shell
status: resolved
date: 2026-11-15
verified_by: [apps/building-shell/tests/mixed-pitch-island.test.ts]
---

# Building Shell: a single-loop island of mixed pitch can be roofed with a folded roof and no refusal

**RESOLVED 2026-11-16.** The four specimens' tests in
[mixed-pitch-island.test.ts](../../apps/building-shell/tests/mixed-pitch-island.test.ts), `S13R20`, `S7R26`, `S15R29`
and `M4902`, have been green since `ec96bc4` (BSA.D335 stage 1), with the control beside them: of two simultaneous
events on one bisector, the solver's pairwise fallback now resolves the nearer along its ray first. Neither cure below
was built; the cure was that change to core's event ordering (BSA.F108). Each specimen is kept as a passing test of its
sound roof. The text below is the record of the defect as it stood.

Found by the independent review of roadmap node 9 (BSA.F105) and filed for the user by BSA.D326. **It predates the
holed-roof arc:** the reviewer found it identical at `9c0389a`, the arc's parent commit, and node 9's closing pass
re-ran the three specimens there and found the same roofs. **Nothing has been changed for it.** Both cures would turn
buildings that build today into errors, so choosing one is the user's call.

The red tests are in [mixed-pitch-island.test.ts](../../apps/building-shell/tests/mixed-pitch-island.test.ts), one
per specimen. Each asserts the property below on the final union mesh and is red by design (BSA.D266). A control
case, a sound mixed-pitch L, passes the same checker.

## What goes wrong

An island with no courtyard is solved by `solveSkeleton(outline, {weights})`, each wall at its own pitch. On some
footprints of 2 to 4 Rings whose sides all have different pitches, the solver returns `complete: true` with a
skeleton that is wrong. The roof built from it folds over itself, has Roof triangles facing down, or stands outside
the footprint. Nothing in the roof stage refuses it:

- **The solver's own signal is dropped.** On a single-loop island, `facesOfSolve` counts a `causality-violation`
  diagnostic into `SolveOk.causality` and goes on (holed roof decision 14 keeps that only for islands with a hole).
  `solveRoofParts` ([algoB.ts](../../apps/building-shell/src/roof/algoB.ts), through `solveIslandFaces`) reads only
  the island's `faces`, and `RoofParts` has no field for the count, so nothing downstream sees it. The app's
  "count and continue" amounts to "ignore".
- **On some of these footprints the solver gives no signal at all.** About two in five of the wrong roofs measured
  carry no causality diagnostic.
- **Core's holed guard does not run on single loops.** It runs on a result of more than one loop only
  (`solve-entry.ts`, "THE GUARD ON A HOLED SOLVE"; the guard itself is `holed-guard.ts`). The reviewer found that if a courtyard is attached
  to the same footprint, every such footprint is refused by name, mostly as `holed-planarity-violation`. This was not
  re-measured here.

**What the user sees.** Measured in the closing pass's fuzz (below), 52 of the 53 wrong roofs go on to throw in Cell
laying. The error names a Cell corner or a vertex (`face 17 (Roof|0|p5): a Cell corner at (…) is neither on a
ShellEdge nor a lattice corner`), not the roof. **One builds its whole shell with no error at all** (`M4902`). The
union mesh, the golden set's raw stages and anything else read before Cell laying get the wrong roof silently in all
53. The reviewer's summary, "a wrong roof and no error", holds for the roof and the union. For the whole pipeline it
holds only for the `M4902` kind of case.

## The property that fails

The property is read only from the union's output triangles tagged `Roof`. A single storey of hipped Rings has no
other roof, so every sound build has it:

- every plan point of the footprint lies under exactly one Roof triangle, and no point outside it lies under any;
- no Roof triangle faces down (signed plan area below −1e-3 cm²).

The test samples a 5 cm grid over the storey's plan, offset 0.37 cm in x and 0.29 cm in y off the 50 cm lattice, plus
the plan centroid of every Roof triangle. A point counts as "under" a triangle when it lies strictly inside it. For the
bare-footprint check, a point on a triangle's edge also counts, so that a hip line is not read as a gap.

## Specimens

Each specimen is one storey, built as `ring(rect, 0, 1, 30, sides)`, every side `{form: 'hip', deg}` at the pitch
given, in the order S, E, N, W. None has a courtyard. The first three are the reviewer's, verbatim. The violations
listed are what the red test reports at this tree. The reviewer's checker found the same kinds.

- **S13R20, no causality diagnostic.** Rings `[150,750,650,1000]` S30 E30 N22.5 W37; `[300,550,750,800]` S60 E30
  N30 W22.5; `[700,550,1150,1100]` S60 E30 N30 W37; `[150,350,700,950]` S52.5 E30 N60 W60. **Three Roof layers over
  one plan point:** 42 sample points lie under more than one layer, the first at (896.68, 705.66) at z 398.21 / 398.21
  / 396.25, and 1 Roof triangle faces down. The reviewer's point was (896.87, 641.21), at z 398.35 / 398.62 / 396.15.
- **S7R26, one `causality-violation`, dropped.** Rings `[450,0,950,150]` S30 E37 N52.5 W60; `[550,500,1150,1100]`
  S37 E22.5 N22.5 W30; `[600,150,1100,600]` S22.5 E30 N60 W60. **A triangle facing down,** its plan centroid at
  (757.28, 90.13), and 294 sample points under more than one layer.
- **S15R29, two `causality-violation`s, dropped.** Rings `[150,600,400,800]` S52.5 E37 N37 W45; `[300,300,650,750]`
  S22.5 E60 N60 W30; `[750,0,1000,450]` S52.5 E37 N60 W22.5; `[550,600,750,800]` S37 E52.5 N22.5 W60. It has two
  islands, and the wrong one is the first. **Roof outside the footprint:** 96 sample points outside it lie under
  Roof, the first at (235.37, 595.29), next to the reviewer's (239.87, 587.91). Also 327 points under more than one
  layer and 1 triangle facing down.
- **M4902, one `causality-violation`, dropped, and the whole shell builds.** Draw 4902 of the closing pass's fuzz:
  `[800,350,1400,550]` S30 E60 N52.5 W52.5; `[850,0,1250,600]` S52.5 E22.5 N22.5 W30; `[800,600,1300,850]` S60
  E52.5 N45 W22.5; `[450,850,900,1050]` S60 E30 N37 W22.5. **2 Roof triangles face down,** the first at (1032.97,
  485.23), and 11 points lie under three layers there. `buildShell` returns a shell with no error, at this tree and at
  `9c0389a`.

## How often

- **The reviewer's measure:** 36 of 5,000 random single-loop islands, 2 to 4 Rings, every side its own pitch from
  22.5° to 60°. 20 carried a causality diagnostic and 16 none.
- **The closing pass's re-measure, at `96148ec` plus this pass:** 5,000 draws of 2 to 4 Rings. Each Ring's corner is on
  the 50 cm lattice in [0, 950], its width and depth run from 200 to 600 cm in 50 cm steps, and each side's pitch is
  drawn from {22.5, 30, 37, 45, 52.5, 60}. The generator is mulberry32 with seed 20261115. 48 draws are refused by
  name at planning and 4 hold a courtyard, which leaves 4,948 single-loop storeys. **53 of them (1.1%) build a wrong
  roof by the checker above.** 32 carry a causality diagnostic and 21 none. 52 throw later in Cell laying (46 on a
  Cell corner, 6 on a vertex) and 1 (`M4902`) builds whole. **None of the 4,895 sound roofs carries a causality
  diagnostic.** The two rates differ in recipe and checker, since this checker also samples every triangle's centroid,
  so they are not one figure measured twice.

## The two cures, and what each would cost

Neither is built. Each changes what some buildings do today, so it is the user's to rule on.

1. **Make a causality diagnostic a hard error on a single-loop island**, as holed roof decision 14 already does for
   an island with a hole. It is a change in the app only, in `facesOfSolve`'s condition. In the fuzz above it would
   refuse 32 of the 53 wrong roofs by name and no sound roof. Of those 32, 31 already throw in Cell laying with a
   message that misnames the cause, and 1 (`M4902`) builds today and would become an error. **It misses the 21 wrong
   roofs that carry no diagnostic**, `S13R20` among them. The cost is that any building with a diagnostic that
   builds today becomes an error, whether its roof is right or wrong. None was measured with a sound roof, but the
   suite's own single-loop fixtures have not been swept for diagnostics under this rule.
2. **Run core's guard on single-loop solves** (`holed-guard.ts`: topology, equal time, time order and planarity, made
   blocking). This is a change in `packages/core`, already on the user's list (BSA.D314). The reviewer found the
   guard catches these footprints when a courtyard is attached, so it would likely catch the 21 with no diagnostic
   too. **Its cost was not measured here.** The guard reads the solver's graph in unit space before the solve returns,
   and is not exported, so measuring how many sound single-loop solves it would refuse needs a change in core or a
   copy of it. The spec's §2 measured 14,626 sound single-loop islands under the holed checker, which is evidence but
   not the guard itself.

A cure turns the red tests green, and each specimen is then kept as a passing test of that cure: either its refusal
by name, or its sound roof.

## How it relates to the core issues

- [Weighted edges running backwards in time](./ISSUE-skeleton-weighted-edge-runs-backwards-in-time.md) is the
  solver defect behind the specimens that carry a `causality-violation`: an interior edge whose target is earlier
  than its source, which the `direction` and `offset` oracles report. That note says the defect predates holes, and
  its cure is reserved to the user (BSA.D309). Curing it in core would cure those specimens at the source.
- [The straight bisector between collinear walls](./ISSUE-skeleton-straight-bisector-between-collinear-walls.md)
  describes single-loop results that are complete and wrong with no guard. That is the same silent path as the
  specimens with no diagnostic. Whether those specimens are that defect or the weighted one with no oracle firing is
  **not established**: none of the four was traced through the solver.
- This note is the app's side of both: the roof stage passes a wrong single-loop skeleton on as a roof. It stays
  open until either core cures the specimens or the app refuses them by name.
