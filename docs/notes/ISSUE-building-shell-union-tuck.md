---
title: "Building Shell: The Union's Tuck Threw in Cell Laying"
type: issue
area: building-shell
status: resolved
date: 2026-11-14
verified_by:
  - apps/building-shell/tests/tuck.test.ts
  - "ISSUE-building-shell-union-tuck.md: the split-band courtyards a tuck made throw in Cell laying build"
  - "ISSUE-building-shell-union-tuck.md: the pinned cases the tuck pass cured are clean"
---

# The union's tuck threw in Cell laying

This note merges two issue notes that turned out to describe one defect. They were the Cell side and ShellEdge
mismatch (the Court25 class) and two Cells running the same way along one NetEdge (the U8 class). Both were opened by
WP-C1 (BSA.D268) and both are now resolved.

## What threw

Cell laying in [cells.ts](../../apps/building-shell/src/cells.ts) threw one of two errors:

```
cell <id>: side <a>-<b> (<x>, <y>, <z>) to (<x>, <y>, <z>) reads ShellEdge <n>, its NetEdge -1
vertex <id> at (<x>, <y>, <z>): two Cells run the same way along one NetEdge
```

Some inputs threw neither. They built silently with overlapping Cells and one or two Unclassified Edges.

## Cause (BSA.F87)

Manifold's union sometimes leaves a **tuck**. The closed surface turns back on itself through 180 degrees at a **fold**
edge and tucks part of its area away in zero volume. A tuck is two layers on one plane, facing opposite ways over the
same ground. Each layer is part of a real face:

- the lower layer is a lower storey's Gable, Cheek or courtyard cut face (`Internal`) on a wall line;
- the upper layer is the Wall of a taller Ring on the storey above, whose end lies inside the gable's span.

Cells were laid on both layers. Which error appeared depended on where the lattice fell on the tuck:

- the mismatch, where a Cell side lay on a ShellEdge in one layer and was interior to the other;
- the two-Cells clash, where both layers shared an interior side.

The fold itself was an Unclassified Edge. Cleaning's sheet removal (`removeSheets` in
[clean.ts](../../apps/building-shell/src/clean.ts)) did not remove the tuck, because each layer is edge-connected to
real surface on its own plane.

Why Manifold leaves the tuck is not established. It depends on raw parts away from the contact, so no rule predicts it
from the inputs.

## Remedy (BSA.D272, the user's ruling)

The tuck is **labelled, not removed**. No triangle is deleted and nothing is welded. The pass is
[tuck.ts](../../apps/building-shell/src/tuck.ts), run between the imprint and the re-tag pass in
[union.ts](../../apps/building-shell/src/union.ts).

- **Found exactly.** A plane holds a tuck when the mesh covers it from both sides and a fold joins the two orientations.
  A fold is a mesh edge with a triangle of each orientation on its two sides. Coplanar opposite faces with no fold
  between them, such as near-touching islands, are not a tuck. The tuck is the ground both orientations' triangles
  hold, and its outline is read as the imprint reads winner boundaries.
- **Cut.** Both layers are cut along the outline by the imprint's own cut (`cutAlongBoundaries` in
  [imprint.ts](../../apps/building-shell/src/imprint.ts)), and a neighbour that shares a cut edge is split too. Outline
  corners are made at one exact position on both layers. The cut mesh must come back from `Manifold.ofMesh` closed, with
  the same genus.
- **Labelled.** After the re-tag, every triangle of either layer that lies in the tuck takes the new face kind `Tuck`.
  It keeps its storey, wall, plane and part. The rest of each real face keeps its own kind, identity and provenance.
- **No Cells.** No Cells are laid on a `Tuck` face, as none are laid on `Ground` or `Internal`.
- **Rims read through.** On a rim line, one layer meets a real face X and the other meets a real face Y. The true
  building has one edge there, X against Y. That edge is one ShellEdge with faces X and Y and the kind the Edge table
  gives the pair, so the Cells of X and Y share its NetEdges. A rim where both layers meet the same face is not an edge,
  and neither is the fold. Both are in [edges.ts](../../apps/building-shell/src/edges.ts).
- **Guarded.** A fold left between two faces that are not both `Tuck` is a hard error that names its place and faces.
- **Reported.** `ShellReport.tucks` counts the tucks, and the viewer draws `Tuck` in its own colour.

## The fixtures

The 9 split-band courtyards WP-C1 left red now build. Their tests are in
[robustness.test.ts](../../apps/building-shell/tests/robustness.test.ts):

- 7 threw the mismatch: `s6h250`, `s6h263` and `s6h300/SplitCourt8`, `s12h250` and `s12h300/SplitCourt20`,
  `s13h263/SplitCourt38`, and `s13h300/SplitCourt11`;
- 2 threw the clash: `s13h250` and `s13h300/SplitCourt38`.

These pins of the same cause were cured:

- `s6h263/U8` and `s6h300/U8` build clean;
- `s1h250/Court29`, `s1h300/Court29`, `s10/Court35` at all three heights, and `CoveredRiseOnCutLine` build clean;
  their surviving Internal cut face was a tuck's lower layer;
- `s13h250/Court21`, `s13h300/Court21` and `CoveredRiseCellClash` build, and keep the one exposed Cheek of the Cheek
  class.

BSA.F87's reduced inputs, its silent variants and their x-mirrors are held in
[tuck.test.ts](../../apps/building-shell/tests/tuck.test.ts).
