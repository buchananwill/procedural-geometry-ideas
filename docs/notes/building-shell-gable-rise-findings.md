---
title: "Building Shell: Gable Rise Findings"
type: technical-reference
area: building-shell
status: active
date: 2026-11-12
---

# Gable rise findings

Gable rise decision 22's measurement sweep (WP-G1), taken on 2026-11-12 at `2b941cb` on the TypeScript prototype only.
It measures the [gable rise proposal](./building-shell-gable-rise-proposal.md), with decisions 11 and 12 as amended, by
building every rise through the unchanged pipeline. No production code changed. The probes and raw outputs are in
[experiments/gable-rises](../../apps/building-shell/experiments/gable-rises/), which sits outside `tsconfig`, vitest and
the golden set.

**WP-G2 (added 2026-11-13, journal decision 206): `maxHeight` and `limit` do not survive `input@1`.** Both are in-memory
fields of a gable run (decisions 11 and 12). `writeInput` writes a run's span, form and pitch only, so a fixture read
back from its own file has the rise uncapped and on the default limit. `FlatTopRise` reads back as the uncapped rise
(tests/rise.test.ts).

**WP-G1.1 (added 2026-11-12, after journal decision 203)** re-ran the sweep with `ridgeSlope` as the default limit, and
measured the cases where its definition is strained, the floor cap with a gap, and a cap under the storey directly
above. Its sections come first. The WP-G1 sections after them were measured under `farSlope`, which decision 203
strikes; they are kept as evidence.

## WP-G1.1: the `ridgeSlope` limit

### The definition

1. **Read the storey's solved hip roof.** That is the straight-skeleton faces of the rise's island, every wall a hip
   at its own pitch, gabled and cut walls included, before any gable piece or rise is added.
2. **Take the rise's centreline**: the half-line from the middle of its band, square to its wall, pointing into the
   footprint.
3. **Walk the centreline from the wall.** The limit is the plane of the first skeleton face it enters whose slope falls
   in the walking direction: the gradient of the face's plane, dotted with the wall's inward normal, is negative.
   - On these axis-aligned footprints that face belongs to a wall facing back at the rise's wall.
   - In a rectangle it is the slope across the main ridge.
   - Elsewhere the walk passes over rising faces and level faces (hip ends, whose slope is square to the walk) until
     it meets the first falling one.
4. **When the walk meets a vertex or an edge exactly**, read the face just past it.
5. **When the walk leaves the footprint without meeting a falling face, the definition gives nothing.**

**What the probe did** (`walkCentreline` in [rise.ts](../../apps/building-shell/experiments/gable-rises/rise.ts)):

- it samples the line every 0.5 cm from 0.25 cm, and classifies slopes with a tolerance of 1e-9;
- it reads only the band's middle line.

A C++ version should intersect the line with the face polygons exactly. That is the only difference from the
definition above.

**Where the definition falls short (measured below):**

- it gives nothing on a courtyard cut;
- against a gabled wall it reads a plane that is no roof face;
- it reads one line for the whole band;
- its literal reading, "across a ridge", fails often.

### The WP-G1 classes re-run under `ridgeSlope`

There were 232 builds: 217 clean and 15 not. In 22 builds the limit plane differs from `farSlope`'s, and 13 of those
build a different shell. That count leaves out 7 rows that name their limit explicitly, where the comparison means
nothing. The results are in [results/ridge-slope](../../apps/building-shell/experiments/gable-rises/results/ridge-slope/).

| Class | Builds | Under `ridgeSlope` | Differs from `farSlope` |
|---|---|---|---|
| Convex rectangle: mid-wall, corner, decisions 9 and 10, widened rise | 43 + 6 | Clean, apart from the 2 deliberate toggles (9 and 10 off) | No: same plane everywhere. The widened rise is still today's whole-wall gable with decision 10 |
| L, T, U, including decision 9 away from corners | 58 | Clean, apart from 1 deliberate toggle (decision 9 off, L [600, 1000]) | Yes, the T and L bands in front of a continuing wing. The shell differs in 4 T builds (60/30 and 75/45). The rise stops at the bar's ridge instead of running over the stem |
| Two rises; adjacent walls; crossing ridges; gabled end wall | 29 | Clean | No |
| Courtyard: band in front of the cut | 6 | **Clean (WP-G1: 4 Cheeks)** | Yes: the limit is the cut's plane, which equals the collinear hole wall's |
| **Courtyard: outer W wall, band across the cut's end** | 3 | **Not clean: 1 Cheek each. `ridgeSlope` gives nothing** | Yes (WP-G1 was clean) |
| Courtyard, other walls | 21 | Clean | No |
| Tall and truncated rises; pitches 7 to 75 | 28 | Clean | No |
| Far wall a whole-wall gable | 3 | Clean | Yes at 75°: the front is truncated at 500, where WP-G1 stood 746 cm at the far wall |
| Storeys (flush and set-back upper storeys, overhang, `maxHeight`) | 25 | As WP-G1: 2 breakthroughs, 5 genus changes, the other reading of decision 195 throws | No |
| Flush Rings (decision 3) | 16 | As WP-G1: `StoreyRingConflictSwapped`'s 1 conflict (F69) | Yes in the 3 swapped flush-T builds; the shell differs only at 60° |

**The one new class that is not clean: the centreline runs along a courtyard cut.**

- **Smallest input:** the roster `Courtyard` at 30°. Ring 0's W side runs `{from: 0, to: 100, form: 'gable', deg: 45}`
  and Ring 2's W side runs `{from: 300, to: 400, ...}`, which together make one rise over y 200 to 400 on x = 0.
- **What happens:** the cut runs along y = 300, the centreline lies on it, and the hip roof there stands at the plate
  (a zero-width slit). The walk crosses only level faces and leaves the footprint through the hole's corner (300, 300).
- **Result:** with no limit, the rise's back face stands proud on x = 300, giving 1 Cheek at 30/30, 45/30 and 60/45.

### The strained cases

This probe made 157 builds in [strained.ts](../../apps/building-shell/experiments/gable-rises/strained.ts), each
case under every variant that answers differently, at two pitch pairs at least. These are the variants:

- `ridgeStrict`: the literal reading, a falling face met directly from a rising one, so the walk crosses a ridge;
- `ridgeRoof`: the same walk on the roof as built before any rise, with today's gable pieces included;
- `ridgeSplit`: one limit per line of the band;
- `ridgeAll`: every line's plane on one piece;
- `peakCap`: a horizontal cap at the hip roof's highest point on the centreline;
- `farSlope`, which is struck.

Of the 34 `ridgeSlope` builds here, 32 are clean.

| Case | `ridgeSlope` gives | Clean | Shape |
|---|---|---|---|
| Opposite wall a whole-wall gable (75/45, 60/30, 60/45) | the gabled wall's skeleton plane, which is no visible roof face | yes | front truncated at 500 (75°); the rise falls back to the main slope at y = 250. Plausible, but the plane is not a roof face. `ridgeRoof` and `farSlope` give nothing, and the rise then stands 746 cm high to the far wall |
| Hip end: centreline along the main ridge (E side, 75/45, 60/30) | the far end's hip plane, 1000 cm away | yes | **a 75° rise stands 373 cm high, 123 above the main ridge, for 750 of 1000 cm.** Not what a person would expect, in my reading. `ridgeStrict` gives nothing (it runs 1000 cm). `peakCap` is clean: a flat top at the ridge height |
| L wing end: centreline along the stem's ridge (75/45) | the bar's S wall plane, 1000 cm away | yes | the same: proud for 800 cm over the stem. `peakCap` is clean |
| Near a corner: centreline over a hip face (75/45, 60/30) | the N slope, across the E hip face | yes | the ridge runs back over the hip end to the N slope. Plausible. `ridgeStrict` gives nothing |
| Centreline into a reflex corner (L, 60/45, 75/30) | the stem's W slope | yes | plausible. `peakCap` gives 1 Cheek |
| Square plan, centred and off-centre (75/45, 60/30) | the N slope in all four | yes | plausible. `ridgeStrict` gives nothing off-centre |
| Wide band over two slopes (L, U, T) | the centreline's plane for the whole band | yes | `ridgeSplit` gives **2 Cheeks** on the L at 75/30, because the limit jumps at the split. `ridgeAll` is clean in all 4 |
| Beyond the ridge, a courtyard cut (60/30, 75/45) | the cut's plane, which is the hole S wall's | yes | `farSlope`: 1 Cheek. `peakCap`: 2 |
| Centreline along the cut (45/30, 60/45) | **nothing** | **no, 1 Cheek** | `ridgeRoof` and `farSlope` are clean, using the hole W wall's plane. `peakCap` throws, because the peak along the cut is 0 |
| Opposite rises facing each other (75/75, 75/45) | each the other wall's plane | yes | they meet in a saddle at the main ridge |
| Courtyard hole walls facing out across the ring (4) | the outer wall's plane | yes | the same as `farSlope` |
| Mixed pitch, ridge off-centre (S 30 / N 60, S 60 / N 22.5) | the far side's plane | yes | the same as `farSlope` |

**Where the definition gives nothing:**

- **`ridgeSlope` gives nothing only along the cut.** Three fallbacks were measured there:
  - read the built roof (`ridgeRoof`): clean;
  - algorithm B's far wall (struck): clean;
  - no limit: a Cheek.
- **The literal ridge-crossing reading also gives nothing** at hip ends, wing ends, near corners and off-centre on a
  square. It is not a usable definition on its own.
- **No reading tried covers both the gabled far wall and the cut.** `ridgeRoof` gives nothing for the gabled wall, and
  `ridgeSlope` gives nothing for the cut.

### The overhang, both ways (item 4)

[caps.ts](../../apps/building-shell/experiments/gable-rises/caps.ts) builds three overhangs: one covering the band, one
covering half of it, and one projecting 100 cm past the rise's wall. Each takes two rises, at 75° and 60° on a 30° roof.

| Cap | Genus | Faces of the gap | Defects |
|---|---|---|---|
| At the floor (fused), 6 builds | 1, against 0 without the rise | no gap. Where the overhang covers the rise, its top fuses with the floor | `Roof–Underside` edges, classified as `SoffitJunction` (2 or 3 per build). **Where the overhang projects past the wall, 1 `Gable–Underside` edge, `Unclassified`**: session 1 §5's pair arises, along the rise front's top at z = 500 |
| 1 cm below the floor, 6 builds | 0 | a `Roof` flat top at 499, under the overhang's `Underside` | none: clean, no Underside pair, no face under 10 cm² |
| 5 cm below the floor, 6 builds | 0 | as for 1 cm, at 495 | none: clean |

### The storey directly above: a wall-top cap (item 5, a candidate)

The candidate is a horizontal cap at the upper storey's plate, applied when that storey overlaps the rise's plan.

- **Under a set-back upper storey** (100 cm back, at 60° and 75°), the cap cures both breakthroughs, of 9.4 cm and
  149.7 cm. Both builds are clean. The flat top sits at the upper eave height and meets the upper roof in a `Valley`.
- **Under a flush upper wall** (75° and 60°), the cap buries the rise wholly inside the upper storey. No Gable face
  survives, and the breakthrough of 122.6 or 9.4 cm is gone. One conflict is left, F69's Wall-over-Gable re-tag report.

### Interpretations added by WP-G1.1

11. The definition reads the hip roof without rises, so one rise never limits another, and the order of rises does not
    matter.
12. The `vs farSlope` column compares faces (kind, plane, area to 0.1 cm²), Edge kinds and the Cell count. It leaves
    out the triangle count, which buried geometry changes.
13. The floor gap and the wall-top cap apply to the whole rise, as decision 12's cap does.

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

## Classes under `farSlope` (WP-G1; the limit is struck)

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
node $E/run.mjs convex           # also: nonconvex, multi, courtyard, tall, storeys, flush (ridgeSlope, WP-G1.1)
node $E/run.mjs strained         # WP-G1.1 item 3
node $E/run.mjs caps             # WP-G1.1 items 4 and 5
node $E/run.mjs convex --limit farSlope   # WP-G1's struck default, as first measured
```

Each probe writes to stdout. The saved outputs are in
[results](../../apps/building-shell/experiments/gable-rises/results/), one file per probe:

- the files at the top level are WP-G1's, under `farSlope`;
- `results/ridge-slope/` holds WP-G1.1's.

`--limit farSlope` reproduces WP-G1's verdicts. For the courtyard this was checked: 4 not clean. The detail lines'
wording changed since WP-G1.

## WP-G4.1: a gable belongs to the Ring side that asked for it (2026-11-13)

Measured at `951b86e` for journal decision 219, on F75 and F76. **Measurement only: no production code changed.**
The probes build each rule's plan in the probe and hand it to the unchanged union and classification. The files are
[claimed-band.ts](../../apps/building-shell/experiments/gable-rises/claimed-band.ts) (bands, rules, sub-rules),
[claimed-band-sweep.ts](../../apps/building-shell/experiments/gable-rises/claimed-band-sweep.ts) (the corpus),
[claimed-band-cases.ts](../../apps/building-shell/experiments/gable-rises/claimed-band-cases.ts) (named cases),
[claimed-band-digest.mjs](../../apps/building-shell/experiments/gable-rises/claimed-band-digest.mjs) (the tables) and
[f76-extents.ts](../../apps/building-shell/experiments/gable-rises/f76-extents.ts) (F76's probe, brought in). Outputs are
in [results/claimed-band](../../apps/building-shell/experiments/gable-rises/results/claimed-band/).

**The principle.** A gable's **band** is a maximal stretch of a line that Ring sides claim as gable, at each point by
the lowest-index Ring whose side lies there, buried stretches included. Adjacent claims that differ in pitch, limit or
`maxHeight` are separate bands. A band counts only if part of it is on a union wall.

- **Rule A**: algorithm B keeps a wall gabled along its whole length where its piece's span equals the band.
  Otherwise the wall is a hip at its decision-5 pitch, and each band on it is one rise.
- **Rule B**: every band is a rise. Every wall enters the roof solve as a hip.

**The harness matches.** F76's headline reproduced: 933 of 6,296 all-gable union walls have a piece wider than the
wall, over 5,562 cases and 9,911 storeys, with 29 pinned keys among them. The probe's re-statement of today's rise
agrees with production in shape and verdict on all 45 roster and rise fixtures.

**The corpus.** 5,276 distinct fixtures after removing duplicate geometry: both sweeps, the grid, 1,120 random,
217 courtyard, 164 split courtyard, 162 U, the nudge, pitch-end, jut-cut and gap sets, 1,400 roster-pitch cases, the
named probes, the roster, the 13 rise fixtures, the goldens, and every pinned seeded key. **Nothing was sampled.**

**"Clean"** is the full sense: the suite's invariants with zero Cheeks, zero conflicts, the height oracle within
0.05 cm, and no breakthrough above a storey over it. A verdict is a fixture's, not a storey's. Most multi-storey
fixtures carry F69 conflicts today, so each changed fixture is also compared with today: worse means a new kind of
violation, more conflicts, or more breakthrough.

### 1. What changes shape

| | Rule A | Rule B |
|---|---|---|
| Fixtures whose plan changes | 173 | 3,543 |
| Fixtures whose shape changes | 163 | 958 |
| Storeys whose plan changes | 293 | 4,818 |
| Storeys whose shape changes | 218 | 1,334 |

Storeys by F76's class of the converted walls (hole and outer walls together; a storey with two classes is listed
under both names joined):

| Class of the walls turned into rises | Rule A: storeys, shape changed | Rule B: storeys, shape changed |
|---|---|---|
| Not wider (algorithm B's piece is the wall) | kept by algorithm B | 4,196, 1,061 |
| Wider, the line beyond holds a buried gable side | kept, except 6, 6 | 254, 21 |
| Wider, the line beyond crosses a Ring's interior (no side) | 171, 125 | 86, 64 |
| No side and a buried gable side | 98, 73 | 102, 73 |
| Mixes of the above with not-wider walls | none | 180, 115 |
| Not wider, but gabled at two pitches (two bands) | 18, 14 | counted in not wider |
| Another Ring's hip side beyond (F75) | 0 in the corpus; the user's draft | 0 in the corpus; the user's draft |

- **Under Rule A the F75 class is empty in the corpus.** What Rule A changes instead is the **no-side class**: a wall
  whose line runs on through another Ring's interior. Algorithm B builds those as a slice of a wider gable today.
- **A buried gable side is kept by Rule A** wherever the band is algorithm B's piece. That is `SingleStoreyT`.
- **Roster and goldens under Rule A**: two goldens change shape. `SplitBandAllGable75` is clean before and after;
  `Court16Seed1h250` has 4 conflicts before and after. Under Rule B the narrow-upper-storey family and
  `ValleyWingsPierced` change too.
- **F76's sub-counts do not all reproduce.** Its own classifier gives 557 walls for the winning Ring's buried gable
  side, where F76 says 421. The other three counts (49, 220, 106) reproduce, and one wall is the user's draft.
  Read by claim, none of the 49 "another Ring's gable side" walls is one: both Rings win part of the wall.

**Rule B where algorithm B's piece already is the band** (4,196 storeys whose only converted walls are not wider):
1,061 change shape. The causes, counted per storey and wall:

| How the rise differs from algorithm B's piece | Same shape | Shape differs |
|---|---|---|
| Same planes, and a wall-top or floor cap that algorithm B never had | 1,559 | 957 |
| Same planes, no cap | 1,709 | 155 |
| Algorithm B had no far plane (the far wall is gabled); the walk adds one | 253 | 141 |
| The walk's limit is not algorithm B's far plane | 0 | 8 |
| Two bands on the wall (two pitches) | 8 | 20 |

- **The caps are the largest difference, not the back limit.** A wall-top cap flattens a whole gable end at the top
  of the storey above. Smallest: `[0,0,1000,500]` W gabled at 55° under `[300,100,700,400]`.
- With the caps left off algorithm B's pieces and no limit against a gabled far wall, 109 of the 4,196 still change
  shape, and Rule B changes 230 fixtures against Rule A's 163.

**A plain gable-ended building** (36 rectangles: 1000×1000, 1000×500, 1200×400; pitches 45/45, 22.5/22.5 and hip 30
with gable 60; gabled on the short ends, the long sides, all four, and one end). All 36 are clean under Rule B.

- **Gabled on both short ends: the same shape as today**, at every aspect and pitch.
- **Gabled on both long sides: yes, the limit plane from the opposite gabled wall's skeleton face clips the ridge.**
  On 1000×500 at 45° the roof's middle drops from 499.9 to 250.1 cm above the plate, and on 1200×400 from 599.9 to
  200.1. Each gable falls away from its own wall and the two meet in a valley across the middle. 10 of the 36 differ.
- Rule A builds today's shell on all 36.

### 2. Clean or not

Per changed fixture, today against the rule:

| Today to rule | Rule A | Rule A, two-pitch walls kept | Rule B |
|---|---|---|---|
| Clean to clean | 24 | 22 | 2,023 |
| Not clean to clean | 7 | 6 | 10 |
| Not clean both, same or better | 124 | 122 | 1,283 |
| Not clean both, **worse** | 17 | 13 | 38 |
| Not clean both, worse only by breakthrough or oracle that today's roof already has | 0 | 0 | 37 |
| Clean to not clean, only breakthrough that today's roof already has | 0 | 0 | 102 |
| **Clean to not clean** | 0 | 0 | 10 |
| **Built to throws** | 0 | 0 | 8 |
| Throws both | 1 | 1 | 32 |

"Breakthrough that today's roof already has": the suite's breakthrough and oracle measures read rises only. A
whole-wall gable, or the hip roof under it, that stands through the storey above is unmeasured today and is seen once
the gable is a rise. Measured over every gable piece, those fixtures stand no further through than today.

**Not clean and worse than today, with the smallest input found:**

| Class | Rule | Fixtures | Smallest input |
|---|---|---|---|
| A new Cheek: the rise's prism stops at the nearest far wall while its limit plane is a further one | A (only on two-pitch walls) and B | A 6, B 14 | `s1h300/Fuzz86`, 2 Rings: `[190,20,600,270]` S gabled at 60°, `[260,220,630,590]` |
| 2 new `Unclassified` Edges on a courtyard hole wall whose band runs on under a taller Ring | A and B | 2 | `s10h263/Court18`, 4 Rings |
| More F69 conflicts | A and B | A 9, B about 30 | `s2h300/Court14`, 4 Rings (2 to 3) |
| New conflicts on a clean fixture | B | 2 | `s2h300/Court32`, 4 Rings |
| New throws (Cell/NetEdge mismatch; Cell outside its face fan) | B | 8 | `s1h300/Court25`, `s12h250/Court1`, 4 Rings |

- **The Cheek class is a rise mechanic, not the principle's.** The prism's reach is algorithm B's piece rule, the
  nearest wall facing back that overlaps the band. The limit is the centreline walk's plane. Where the nearest far
  wall covers only part of the band, the walk passes beside it, and the prism is cut off while still tall. Today's
  mixed-wall rises are built the same way. This was confirmed on the two 2-Ring cases, where a longer reach is
  clean. On the six split-courtyard fixtures it is inferred from the planes; there a longer reach throws.
- **Hand reductions that did not reproduce**: `Court18` without its Ring 1 is as clean as today, and a taller Ring
  burying a band's middle or end is clean.

### 3. The pins

185 pin rows. F76's 29 pinned keys:

| | Rule A | Rule B |
|---|---|---|
| Plan unchanged, pin the same | 16 | 0 |
| Plan changed, pin the same | 9 | 17 |
| Changed signature | 2 (`s1h263/Court25` throws elsewhere; `s13h250/SplitCourt30` conflicts 3 to 2) | 3 |
| Cured of its defect, conflicts remain | 0 | 4 |
| Worse | 2 (`s10h263/Court18`, `s10h300/Court18`: the Unclassified Edges) | 5 (those two; `Court25` at 250 and 300 now throw; one conflict count 1 to 2) |

- **Rule A cures none of the 29.** The 3 Cheek pins (`Court9`) and the 3 `Court13` overshoot pins are walls
  algorithm B keeps.
- **The other 156 rows.** Rule A: 153 unchanged, and `s5/Court34` at three heights cured with conflicts remaining
  (a two-pitch wall). Rule B: 144 the same, 10 cured (8 with conflicts remaining), and `s12/Court1` at 250 and 300
  now throws.
- **Rule B cures the 3 `Court9` Cheek pins and the `SplitCourt9` pin**, each with conflicts remaining.

### 4. The rise mechanics the principle strains

Over the corpus under Rule B, 6,887 bands are built.

| Mechanic | Bands |
|---|---|
| Wider than its exposed walls | 576 |
| Exposed in two or more stretches | 502 |
| Middle buried | 226 |
| Both ends at a footprint corner (decision 10's rule) | 5,494 |
| One end raked at its own pitch, mid-wall or at a reflex corner | 1,074 |
| Both ends raked at their own pitch | 319 |
| **An end buried inside the footprint, with no wall across it** | **0** |
| The walk's limit is a gabled wall's skeleton plane | 741 |
| Wall-top cap, floor cap, `maxHeight` | 3,227, 542, 1 |

Sub-rules, each a named candidate in the probe:

| Sub-rule | Candidates | Measured |
|---|---|---|
| A band end buried inside the footprint | `ownRake`: rake at the band's pitch. `adjacentPitch`: the hip plane of the claiming Ring's own adjacent side | **Not exercised by the corpus (0 bands).** Hand case, `[0,0,1000,400]` S gabled at 45° with `[-200,-400,300,200]` over its corner: both clean, both cut level at 230.9 cm by the limit. `adjacentPitch` builds the gable front the Ring has when its corner is exposed; `ownRake` gives a steeper rake at the buried end |
| Where the limit walk starts when the middle is buried | The band's middle; the middle of the longest exposed stretch | **No difference on any of the 226 bands**, nor on the hand cases |
| The limit against a gabled far wall | `skeletonPlane` (production). `none` (algorithm B). `farRakes`: the far band's two rakes | `skeletonPlane` clips the long-sides building. `none` and `farRakes` give today's shell on all 36 rectangles and differ from each other on 2 storeys of the corpus. Under `none`, Rule B: 929 shapes change, 5 new throws, 14 new Cheeks. Both change a rise production builds today: a 75° rise facing a wall gabled along its whole length runs through at 373 cm instead of being clipped at 250 |
| Caps on a band that is algorithm B's piece | `capped`; `uncapped` (as today) | See section 1 |
| The prism's reach | `nearestFar` (production). `bbox`. `limitZero`: to where the limit plane meets the plate | `bbox` and `limitZero` cure the 2-Ring Cheeks and throw on 10 courtyards under Rule A ("a Cheek face off an axis-aligned vertical plane"). Under Rule B `bbox` gives 18 new throws for 8. **None is clean** |
| Rule A on a wall gabled at two pitches | `twoRises`; `keepPiece`: algorithm B's one gable, as decision 5 has it today | `keepPiece` removes every new Cheek under Rule A (164 fixtures change, 13 worse: 11 on conflicts, 2 on the `Court18` Edges) |

**The caps' reach** is the band, buried stretches included, back to the prism's reach. A taller Ring that buries part
of a band lies in front of the line, not in the reach, so it does not cap the rise.

### 5. Mixed walls already built as rises

- **None of the 13 `RISE_FIXTURES` changes under either rule.** Every band is today's rise.
- **No mixed wall in the corpus changes**: in 5,276 fixtures no mixed wall has a band that is not one of today's rises.
- **Hand cases.** A hip side with a gable run from 300 to 700, its middle buried by a 100 cm wing: today two rises,
  apexes at x = 375 and 625, 75 cm up. By claim, one rise over [300, 700], apex at x = 500, 200 cm up, standing above
  the wing's roof. A run whose end a wing buries: today's rise over [100, 400] with its apex at x = 250, 150 cm up,
  becomes one over [100, 600] with its apex at x = 350, 250 cm up. Both are clean. **Whether these are the shapes a
  person expects is the user's call**; they are what the author's run says.

### 6. The three named buildings

| Building | Today | Rule A | Rule B |
|---|---|---|---|
| `SingleStoreyT` | One gable end on x = 1000 over [0, 500], apex at y = 250, 250 cm above the plate, the stem's roof dying into it. Clean | The same shell; algorithm B keeps both walls | The same shell, as one rise with its middle buried. Clean |
| The draft without the wing | A gable on x = 0 over [0, 600], apex at y = 300; a rise on y = 0 over [600, 1200], apex at x = 900. Both 124.3 cm up. Clean | The same shell | The same shell |
| The draft with the wing | The y = 0 gable is half of a 1200-wide one: apex at x = 600, 248.5 cm up, over Ring 0. 1 conflict | A rise over [600, 1200], apex at x = 900, 124.3 cm up; the x = 0 gable unchanged. Clean | The same as Rule A. Clean |

### Interpretations (WP-G4.1)

1. Under Rule A a mixed wall's rises are its claimed bands too, so the two rules differ only on walls algorithm B
   keeps. The corpus cannot tell this from "mixed walls as today" (section 5).
2. A wall gabled along its whole length at two pitches has two bands, so by default Rule A makes it a hip with two
   rises. `keepPiece` is the other reading.
3. "The far wall is gabled" means a gable on the limit's wall faces the band's whole span.
4. "Algorithm B's piece" is the probe's copy of `extentOf`, which matched all 6,296 walls.
5. A converted wall is a hip at the pitch the gable had (decision 218's wording).
6. A band's piece stands on the storey wall that holds its middle, else on its longest exposed wall.
7. "Worse than today" is defined above; it is the probe's, not the suite's.
8. The sub-rule sweeps other than the default keep only their summaries; re-run to get every storey.

### Reproduce (WP-G4.1)

```bash
node $E/run.mjs f76-extents                                  # F76's headline
node $E/run.mjs claimed-band-cases self                      # also: drafts, ends, rises, buried, strain
node $E/run.mjs claimed-band-cases one s1h300/Fuzz86         # one corpus case by key, with its Rings
node $E/run.mjs claimed-band-sweep 1                         # both rules, the whole corpus, about 20 minutes
node $E/run.mjs claimed-band-sweep 1 rules=B far=none caps=uncapped
node $E/run.mjs claimed-band-sweep 1 rules=A two=keepPiece changedOnly
node $E/run.mjs claimed-band-sweep mechanics 1
node $E/claimed-band-digest.mjs sweep-stride1.txt            # the transition and pin tables
```
