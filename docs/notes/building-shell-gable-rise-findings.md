---
title: "Building Shell: Gable Rise Findings"
type: findings
status: open
---

# Gable rise findings

Gable rise decision 22's measurement sweep (WP-G1), taken on 2026-11-12 at `2b941cb` on the TypeScript prototype only.
It measures the [gable rise proposal](./building-shell-gable-rise-proposal.md), with decisions 11 and 12 as amended, by
building every rise through the unchanged pipeline. No production code changed. The probes and raw outputs are in
[experiments/gable-rises](../../apps/building-shell/experiments/gable-rises/), which sits outside `tsconfig`, vitest and
the golden set.

## The harness

[rise.ts](../../apps/building-shell/experiments/gable-rises/rise.ts) holds every rule the proposal adds. Ring sides
carry `runs` (decision 1). Each union wall is split into extents, the lowest index winning at each point (decisions 3
to 6). Each rise becomes one synthetic `Piece`, pushed into the storey's `plan.roof.pieces` before the unchanged
`gablePiece`, union and step 4 run (decision 8). Decisions 9, 10, 11 (`farSlope`) and 12 (floor cap, `maxHeight`) are
switchable.

- **F60 and F61 reproduce exactly.** [f60-f61.ts](../../apps/building-shell/experiments/gable-rises/f60-f61.ts) is the
  scratch `dormer.ts` with only its imports changed. Bands [400, 600] at 45 on 45 and [330, 610] at 45 on 30 are closed,
  genus 0, with no Cheek, conflict, Unclassified Edge or Internal face. The first has `Valley` 2, `Verge` 2 and
  `WallPlate` 1, a ridge at 350, and 6 Gable Cells from Ring 0 side S. Band [800, 1000] gives 1 conflict and 1
  `RoofSeam`. The harness gives the same figures through authored runs.
- **Clean** means four things. First, spec 32's invariants, read by the suite's own `invariantViolations`: the genus is
  the same storeys built without their rises, and the Cheek count is 0. Second, no conflict. Third, decision 19's
  oracle within 0.05 cm. Fourth, the covered-storeys precondition: the rise's storey never stands above the top of a
  storey over it, sampled on a 2 cm grid.
- **The oracle was checked by mutation** ([harness-check](../../apps/building-shell/experiments/gable-rises/harness-check.ts)).
  With the rise piece dropped from the oracle, the worst error is 89.2 cm. With the far plane dropped from the build,
  it is 735.4 cm.

## Classes

There were 232 builds with a verdict: 215 clean and 17 not. Six more builds compared a widened rise with today's
whole-wall gable. Unless a row says otherwise, pitches were 7 to 75 degrees in pairs, and bands were mid-wall, at a
corner and across features.

| Class | Builds | Verdict | Key figure |
|---|---|---|---|
| Convex rectangle, mid-wall: 5 pitch pairs × 4 bands, and a short wall | 24 | Clean | oracle ≤ 0.001 cm |
| Convex corner, decisions 9 and 10 each on or off; 45/45, 60/45, 30/45, 75/30; and the F61 reproduction | 19 | Clean unless 9 and 10 are both off at equal pitch | both off: F61, 1 conflict and 1 `RoofSeam` |
| Rise widened to the whole wall against today's whole-wall gable | 6 | Same shell with decision 10, at 45, 60 and 30 | without decision 10, same only at equal pitch: 686 against 630 Cells at 60 on 45 |
| L, T and U: prism over a reflex corner or into a wing, rise ending at a reflex corner (3 of them with `ridgeSlope`) | 54 | Clean | |
| Decision 9 away from any corner (L: the rake from x = 600 lies on the stem's W-wall plane) | 4 | Clean with decision 9; 1 conflict without it | |
| Two rises on one wall: apart, 20 cm apart, adjacent at equal and unequal pitch, across two flush Rings | 14 | Clean | |
| Rises on adjacent walls whose prisms overlap or whose ridges cross; a corner rise against a gabled end wall | 15 | Clean | crossing at 60/60: `Hip` 11, `Valley` 12 |
| Courtyard: outer wall, hole walls, both walls the cut is spliced through | 21 | Clean | |
| **Courtyard: band in front of the cut** | 6, and 3 with `ridgeSlope` | **Not clean when the rise is steeper than the roof** (4 of 6); the 3 with `ridgeSlope` are clean | **1 Cheek** |
| Taller than the main ridge; truncated by the far slope at its own wall | 7 | Clean | |
| **Far wall a whole-wall gable** | 2, and 1 with `ridgeSlope` | Clean, but **nothing limits the rise** | stands 746 cm above the plate at the far wall |
| Pitches near the wire limits (7/7, 7/45, 7/75, 75/7, 75/75, 8/74, 74/8) × 3 bands | 21 | Clean | |
| Under a flush upper wall | 4 | Clean while it stays below the upper storey's top | 75°: breaks through by 122.6 cm, 1 conflict |
| Under a set-back storey directly above | 4, and 1 under the other reading of decision 195 | Clean while it stays below | 60° under a 100 cm set-back: breaks through by 9.4 cm |
| **Under an overhang two storeys up, with the floor cap** | 7, and the building without a rise | **Genus 0 becomes 1 when the rise reaches the floor**, whether the cap is on or off (5 of 7) | clean when it stays below the floor |
| Own `maxHeight` (one storey, at a corner, on an L, two rises sharing a cap) | 8 | Clean | flat top: see below |
| Flush Rings by decision 3: F57's T both ways round, an inner Ring, and 10 Ring-conflict roster pairs | 16 | Clean, except `StoreyRingConflictSwapped` | 1 conflict (today's build of it has 2) |

The rows that are not clean, each with its smallest input:

1. **Courtyard cut.** The roster `Courtyard` Rings at 30°, with Ring 0 side S running `{from: 100, to: 300, form:
   'gable', deg: 45}`, give 1 Cheek at (173.2, 300, 323.2). The cut runs along y = 300 from x = 0 to 300, so the
   existing rule names the cut as the far wall. A cut is not a hip, so `farSlope` adds no plane, and the rise's back
   face stands proud on the cut's plane. The oracle agrees with the mesh, so the defect is in the definition, not the
   construction. It is clean at 30 on 30, where the rise meets the roof exactly at the cut.
2. **Overhang genus.** Three Rings at 30°: `[0,0,1000,500]` on storey 0 with S running `[400, 600]` at 75°;
   `[800,0,1000,500]` on storeys 0 and 1; and `[300,0,1000,500]` on storey 2. The capped rise's flat top lies on the
   overhang's floor, and the union fuses them. With the tower, that closes a real tunnel, so the genus is 1 against 0.
   The output is closed, with no Internal face and no Unclassified Edge.
3. **Breakthrough under the storey directly above.** `[0,0,1000,500]` at 45° with S running `[350, 650]` at 60°,
   under `[300,100,700,400]` on storey 1. The rise's ridge, 260 cm high, enters the upper eave and stands 9.4 cm proud.
   This is the covered-storeys precondition. Decision 12 does not cap this storey, under the lead's reading.
4. **`StoreyRingConflictSwapped`** (roster): 1 conflict, Wall of storey 1 over Gable of storey 0 on y = 0. The rise's
   front lies under the upper storey's flush wall, and Wall wins it, which is correct. A conflict is reported only when
   an output centroid lands in the overlap. The same overlap with upper `[300,0,700,300]` over a 45° rise reports none.
   This is a property of today's re-tag pass, not of rises.
5. The other four not-clean builds are the deliberate toggles that switch decision 9 off.

## The open questions

**Decision 9 is necessary and sufficient as written, and is needed away from corners too.** It fired in 10 builds:

- 8 away from any corner, each time a rake lay on another wing's plane: the T and flush-T stem walls, the L stem's W
  wall, a courtyard hole wall, and `OverlapRingConflict`'s y = 400;
- 1 on a cap, where two caps of equal height share one id;
- 1 at a corner, with decision 10 off.

With decision 9 switched off, the L case alone gives a conflict, even with decision 10 on.

**Decision 10 is sufficient at equal and unequal pitch, and against a gabled end wall.** That end wall's plane is used,
as `endPlanes` does for today's gable. At unequal pitch it changes the shape: the apex is 376.8 against 423.2 for 60
on 45, and a 75° rise at the corner of a 30° roof becomes a lopsided gable with its apex at 100. At equal pitch
decision 9 gives the same planes by itself. So decision 21's gate "removing decision 10 fails a test" needs a fixture
with unequal pitches.

**"Far wall" is well defined off a rectangle, but it is not always the slope a person would name.** The rule picks the
nearest wall that faces back across the band. The slope a person would name was measured as the face that the band's
midline meets just past the first ridge on the hip surface. The two agree on rectangles, the U, the L's bar and every
courtyard band except the one in front of the cut. They disagree in these places:

- **in front of a wing that continues in the rise's direction** (the T within the stem's width; the L at x 600 to 800).
  The rule names the wing's far end, so a 75° rise stays proud for 900 of 1000 cm, over the wing. The slope beyond the
  ridge stops it at 200. Both are clean;
- **the far wall is a cut** (row 1 of the list above);
- **the far wall is a gable.** `farSlope` has no plane, so a 75° rise runs back at full height. Its apex is 996.4,
  against the main gable's apex of 750.

A probe-only `ridgeSlope` limit, which uses the slope beyond the ridge, was clean in all 7 builds tried. It cures the
courtyard Cheek. It is not in the proposal.

**A flat top is a `Roof` face on its own horizontal plane: `Roof|storey|p<cap plane>`.**

- **Edges:** `Ridge` to the rakes and the far slope (a convex, horizontal Roof–Roof edge), `Valley` to the main slope,
  `Verge` to the front, and `RingJunction` where it abuts an overhang's wall. A capped front that meets a wall above it
  adds a `GableHorizontal` edge.
- **Cells:** they are laid as Roof Cells with a null source, for example 12 Cells (8 whole) at a `maxHeight` of 100.
- **Classification:** no Edge is Unclassified, and no new kind appears.

Decision 13 holds under this reading. Where an overhang covers the cap, no flat top survives: the rise fuses with the
floor. This matches F63's guess on the C++ side.

**Decision 11's geometry is right on rectangles.** A rise above the main ridge comes down under the far slope. A rise
taller than the far slope at its own wall is truncated there: its front's top edge is horizontal and meets the
truncated top in a `Verge`. It is not sufficient as written, for the three cases listed above.

**Decision 12, and the other readings of decision 195:**

- **The storey directly above caps (the other reading).** The cap is then at the plate and the rise is empty: `gablePiece`
  throws. Every rise under any storey above would be lost.
- **Caps applied only where the overhang covers.** Not built separately. It equals "cap off" beside the overhang. Cap
  off was measured: the same genus change, and the rise climbs past the floor beside the overhang's wall.

**Other measured statements that correct the proposal's text:**

- **Decision 6.** Adjacent rises of unequal pitch do not "meet in a valley". Both rakes are 0 at the shared end, so the
  two rises touch at one point on the plate, and the hip slope shows between them. Each rise has its own 2 valleys;
  `WallPlate` is 2. The result is clean.
- **Decision 3's prose.** On F57's T with the main Ring at index 0, the stem's S side overlaps the main Ring's side,
  so the main Ring wins and there is no rise, as today. A rise comes only from a gabled Ring of lower index, or from a
  side-by-side pair. `FlushRingConflict` and its swap then build the same geometry and differ only in Cell provenance.
- **Decision 14 held in every case.** The rise's Gable Cells name the winning Ring and side: R1 side S in
  `FlushRingConflict`, R0 side S in its swap, and R0 side S with R1 side S split for one rise merged across two Rings.

## Interpretations

1. A run with no `deg` takes its side's pitch, then the Ring's default.
2. Adjacent gable extents merge only when their pitch, cap and limit all agree. They merge across Rings.
3. Under decision 10, "a convex corner" is where algorithm B's `endWall` finds a wall across the end. Its plane is used
   unless it is dead or a cut, even when that wall is gabled.
4. Decision 9 compares planes within one island, with tolerances of 1e-9 on slope and 1e-6 cm on offset, as
   `finishBuilding` keys them. It covers cap planes too.
5. The far wall is algorithm B's `farWall`, copied verbatim. Its plane is added only when that wall is a hip and not
   dead, as `addPiece` does.
6. The floor cap reads "overhanging" as the lead does. The storey's floor is at least one storey above the rise's
   plate, and a Ring of it overlaps the rectangle from the band to the rise's far reach. The cap is the lowest such
   floor, applied to the whole rise.
7. Rises are pushed after the storey's existing pieces.
8. Conflicts count against "clean". Decision 20 does not list them; F61 is the precedent.
9. The oracle is decision 19's, generalised to every piece of the storey. It is read as the top of the solid interval
   that holds the point at the plate plus 0.5 cm. Points that a higher storey covers are skipped. The precondition
   measure covers them.
10. The widened-rise comparison forces past decision 5, with the wall hipped at the rise's pitch.

## Reproduce

From the repo root, with `E` as `apps/building-shell/experiments/gable-rises`:

```bash
node $E/run.mjs f60-f61          # the scratch probe, as first measured
node $E/run.mjs harness-check    # the oracle convicted by mutation
node $E/run.mjs convex           # also: nonconvex, multi, courtyard, tall, storeys, flush
```

Each probe writes to stdout. The saved outputs are in
[results](../../apps/building-shell/experiments/gable-rises/results/), one file per probe.
