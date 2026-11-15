---
title: "Building Shell: All-Gable Courtyards Tucked When the Holed Hip Solid Stood on the Plate"
type: issue
area: building-shell
status: resolved
date: 2026-11-15
part_of: [building-shell-holed-roof-decisions.md]
verified_by:
  - apps/building-shell/tests/courtyard.test.ts
  - "all-gable split bands (journal decisions 151 and 153)"
  - "stands the Courtyard's holed hip solid from the floor, its floor and sides the wall prism's own tags"
  - "the all-gable split band H450-550B100S460D30g leaves no tuck"
  - "journal decision 272 on a holed island (ISSUE-building-shell-all-gable-courtyard-tuck.md)"
---

# All-gable courtyards tucked when the holed hip solid stood on the plate

Roadmap node 9 moved building-shell's courtyards from the cut to the holed skeleton (BSA.D325). That move left 36
tests red in [courtyard.test.ts](../../apps/building-shell/tests/courtyard.test.ts). They are split-band courtyards with
every side gabled, in `all-gable split bands (journal decisions 151 and 153)`. All 36 built clean at `9c0389a`, under
the cut. At `f822370` they failed in Cell laying.

## What failed

- **25 of the 36** failed with `interior NetEdge <n> borders cells <a>,<b>`: a NetEdge on no ShellEdge with Cells of two
  different faces on its sides.
- **10 threw** `vertex (<x>,<y>,<z>): mesh vertices <i> and <j> snap to one grid point`. All 10 are at 60 degrees, at a
  gable apex on the line of the hole's S or N wall.
- **1 threw** `vertex <id> at (...): Cell <c> lies in no triangle of its face's fan`. This is `H400-600B100S410D30g`.

All 36 have a tuck in the union, from 1 to 4. At `9c0389a`, none of the 162 all-gable split bands has a tuck. At
`f822370`, the 36 failing ones are exactly the ones that have a tuck.

## The smallest reproducer

`H450-550B100S460D30g` has one tuck and one violation. It is one storey of 250 cm, every Ring at 30 degrees, and every
side of every Ring gabled:

```
[0, 0, 460, 100]  [460, 0, 1000, 100]  [0, 100, 450, 800]  [550, 100, 1000, 800]  [0, 800, 1000, 1000]
```

It is `splitBandFixture('H450-550B100S460D30g', 450, 550, 100, 460, {a: 30, w: 30})` with `{S, E, N, W}` all gable.

## Mechanism

**The tuck.** On the plane y = 800, the line of the hole's N wall, two gable pieces stand back to back:

- the N band's piece on that line, which runs x 0 to 1000 and faces -y;
- the E wing's covered rise on its N side, which runs x 550 to 1000 and faces +y.

Between x = 750 and x = 800, the hip roof crosses y = 800 at 365.47 cm, which is the plane of the y = 1000 wall. Both
pieces stand above that height there, up to their apex at (775, 800, 379.90). The union left that triangle of the two
pieces' faces unfused, as a zero-volume double sheet of 360.84 cm² on each side. The tuck pass labelled both layers
`Tuck`, as BSA.D272 rules.

**The split face.** The rise's Roof on the x = 1000 wall's plane is exposed south of y = 800, in the triangle (775, 775),
(800, 800), (775, 800) of plan. The N band piece's Roof on the same plane continues north of y = 800. They have one
identity and lie on one plane, so in the true building they are one face. The tuck lies between them, and faces are
joined only across mesh edges, so the shell makes them two faces: 92,375.99 cm² and 360.85 cm². At `9c0389a` they are one
face of 92,736.94 cm².

**The Cells.** The rim rule finds both layers meeting one identity on one plane. That is correct: no edge stands there,
so no ShellEdge is made. Cells of the two faces then meet along y = 800 on an interior NetEdge, and the invariant check
reports it.

## Diagnosis (confirmed)

**The cause is decision 25 of the [holed roof spec](./building-shell-holed-roof-decisions.md): a holed island's hip
solid with its bottom at the plate.** The holed hip solid stood from the floor under the cut (BSA.D132). Its floor and
sides carried the wall prism's own tags. Decision 25 put its bottom at the plate. The measurement:

| Tree | Hip solid of a holed island | All-gable split bands failing (of 162) | Cases with a tuck |
|---|---|---|---|
| `9c0389a`, the cut | from the floor | 0 | 0 |
| `f822370` | at the plate | 36 | 36, the same 36 |
| `f822370`, that one change | from the floor | 0 | 0 |

The raw parts of the reproducer are the same at both commits, apart from three differences:

- the hip solid's bottom;
- the two cut pieces, which stood low, at z of 278.9 cm or less, near x = 460, y 0 to 100, far from the tuck;
- the numbering.

The gable pieces' bands, far distances and planes are the same. The tuck is found by geometry, not by an id. The
hypotheses "the gable pieces' extents moved", "the cut pieces covered something" and "a key moved with the renumbering"
were not toggled one by one, because the single change above clears all 36.

**Not established: why Manifold leaves a tuck when the hip solid's bottom is at the plate.** BSA.F87 found the same of
every tuck: it depends on raw parts away from the contact. Here the contact is at z = 365 cm, and what moved is a face at
the plate.

## The roof was right

The defect was in the labels and the Cells, not in the roof. The roof was compared over all 81 all-gable (`g`) cases,
on a 30 cm plan grid, against `9c0389a`:

- **The roof's top was the same.** The largest difference was 0.00 cm at `f822370`, over the 70 cases that build, and
  0.00 cm after the fix, over all 81.
- **The face areas by kind matched** within 0.5 cm².
- **The gable apex on y = 0 matched its closed form,** 250 + tan(d) × 500, in every case.

## Resolution

A holed island's hip solid stands from the floor again, as under the cut: `extrudeOutline` with no plate cap, in
`hipSolid` in [storey.ts](../../apps/building-shell/src/storey.ts). An island with no hole keeps its bottom at the plate.
Spec decision 25 is the arc lead's to amend.

**The 36 tests pass with their assertions unchanged.** The suite runs 9,693 tests in 48 files, all passing, with
typecheck clean. That is 9,667 before the fix plus 26 new: 1 in storey.test.ts and 25 in tuck.test.ts, where the holed
tuck cases also join the existing per-case, mirror and rim checks. Flipping the hip solid back to the plate turns 38 red: the 36, and two of the
new tests.

**New tests:**

- [storey.test.ts](../../apps/building-shell/tests/storey.test.ts): the Courtyard's holed hip solid stands from the
  floor, and its floor and sides carry the wall prism's own tags.
- [tuck.test.ts](../../apps/building-shell/tests/tuck.test.ts): `H450-550B100S460D30g` leaves no tuck, and its Roof on
  the x = 1000 wall's plane is one face across y = 800, at its closed-form height.
- [tuck.test.ts](../../apps/building-shell/tests/tuck.test.ts): `TuckGableEndCourtyard` at 250, 263 and 300 cm puts
  BSA.F87's smallest tuck input on a holed island. Each case is held to every check on the tuck cases, its x-mirror
  included. Its tuck is exactly `TuckGableEnd`'s at the same height. At 300 cm the tuck is a triangle 100 cm wide and
  50 tan 30° deep. These tests restore a genus-1 tuck case, which the suite lost with the cut. They pass with either
  hip solid.

**What else moved, each with its cause:**

- **25 courtyard goldens re-exported** (38 files). In every one, the only raw part whose geometry moved is the hip solid
  of a holed island. Every shell golden has the same canonical form as before: 12 are byte-identical, and 13 move in ids
  and order only. Every non-courtyard golden is byte-identical.
- **15 conflict pins re-pinned**, in `GABLE_RISE_CONFLICTS` and `GABLE_RISE_SPLIT_CONFLICTS` in
  [residue-pins.ts](../../apps/building-shell/tests/residue-pins.ts).
  - **7 move in a winning Wall's part id only.** The hip solid carries the wall prism's Wall faces again, and a part id
    is provenance only.
  - **8 move in count.** For each moved row, the raw overlap of the two tags on its plane was measured, and it is the
    same before and after the fix. The union's triangles on that plane differ, so whether a triangle's centroid falls in
    the overlap differs. That is BSA.F69's mechanism. 5 of the 8 return to their count at `9c0389a`.
- **8 rows of the viewer's facts table** were regenerated. They are the same 8 count moves.

**The cost:** the holed hip solid's floor-standing sides are the configuration under which journal decision 135, F2,
saw two cleanMesh refusals. Both of those courtyards, `F2_COURTYARDS`, are goldens and build clean after this change.

## Still open

**A tuck whose two rims meet one identity on one plane still splits that face in two.** Here the fix removes the tuck,
but the handling of such a tuck is unchanged:

- the rim rule makes no edge there, which is correct;
- faces are still assembled only across mesh edges, so the two parts stay separate faces;
- Cells are then laid across the line with no ShellEdge under it.

BSA.D272 says each rim is read through to the true building. Joining such faces would extend that reading from Edges to
faces. That is a ruling for the lead, and it is not made here. No such tuck is known in the suite after this fix.
