---
title: "Building Shell Prototype: Fixed Design Decisions"
type: decision-spec
status: proposed
---

# Building shell prototype

A TypeScript prototype of a modular building's exterior shell, built the way the owner specified it for Piste
Perfect's modular buildings, to replace a C++ pipeline whose abstraction proved brittle (Piste Perfect's
[exterior-manifold spec](../../../resort_game/PistePerfect_5_7/Notes/buildables/modular-building-exterior-manifold-decisions.md)
is the failed approach; read it for vocabulary only, not for design). The model is four steps and nothing else:

1. **Every storey is built as if it were the only storey**, from the union of the Ring rectangles that hold it: a
   closed solid with a floor, walls and its own roof.
2. **The storey solids are stacked** at their storey heights.
3. **Their union is taken on the raw geometry.** Every face, or part of a face, inside another solid disappears, and
   so does every face where two solids touch. The result is one closed manifold with no internal faces, each surviving
   face tagged with its source: Wall, Gable, Roof, Underside or Ground, plus its storey and source wall.
4. **Only then is the Cell grid laid on the surviving faces**, and the shell's Edges are read off the manifold's
   edges.

Nothing is ever tested for lying "inside a hull" at Cell level: Cells do not exist until the shell is final. The
deliverable is a three.js viewer that shows the finished shell, colour-coded by face kind, Edge kind and Cell, which
the cursor can rotate and inspect, plus a JSON export per fixture. This document fixes the roster (section 1) and the
decisions (section 2). It carries no function bodies.

**Amended 2026-11-07** by the arc lead's review, recorded as decisions 41 to 103 in
[the building-shell arc journal](./building-shell-arc-journal.md). Every amended decision below says so where it stands
and cites the journal decision behind it.

## 1. Type Roster

**The app**: `apps/building-shell/`, package `@proc-geo/building-shell`, private, not publishable. A Vite app with
plain TypeScript and three.js (no React, no Next), tests by vitest. Piste Perfect's terms (Ring, Storey, Gable, Cell)
live only here, never in `packages/core`.

**Copied from Piste Perfect's roof-gable prototype** (`../../../resort_game/PistePerfect_5_7/Scripts/prototypes/roof-gable/src/`)
into `apps/building-shell/src/roof/`:

- `model.ts`: `Pt`, `Rect`, `Wall`, `Comp`, `Plane`, `Building`, `Sel`, `unionLoops`, `buildFromRects`, `planeAt`.
  Copied unchanged.
- `surface.ts`: `PlaneFace`, `Sample`, `Surface`, `evalFaces`. Copied unchanged.
- `skeleton.ts`: `solveFaces`, `RawFace`. Its `file:///D:/...` import becomes `@proc-geo/core`; nothing else changes.
- `algoB.ts`: `runB` and its `Piece`. Copied, plus one export (decision 9).
- `cases.ts` and `measure.ts`: copied unchanged, used only by the copy-integrity test (decision 31).
- Import specifiers change from `./model.ts` to `./model` if the app's tsconfig refuses `.ts` extensions; no other
  edit is allowed.

**New, in `apps/building-shell/src/`:**

- `constants.ts`: `SHELL_TOLERANCE_CM` (decision 16).
- `fixture.ts`: `ShellFixture`, `FixtureRing`, and the fixture list `SHELL_FIXTURES`. **AMENDED 2026-11-08** (journal
  decision 132): `StoreyRoof` is gone with Ring-authored forms (decision 3). The Ring-conflict and port fixtures live
  in their own lists, `RING_CONFLICT_FIXTURES` and `PORT_FIXTURES`. `courtyard.ts` places decision 2's cut, and
  `ring-forms.ts` derives decision 3's forms.
- `manifold.ts`: the one `manifold-3d` WASM loader. `weld.ts`: decision 11's weld-and-snap primitive, the only rounding
  in the app (journal decision 71).
- `storey.ts`: `StoreyPlan` (one storey's union outline and its solved roof) and `buildStoreyParts` (one storey's
  raw tagged solids).
- `tags.ts`: `ShellKind`, `FaceTag`, `TagTable` (`faceID` to `FaceTag`).
- `union.ts`: `unionShell` (all raw parts to one manifold) and the coplanar re-tag pass.
- `faces.ts`: `ShellFace` assembly from the output triangles.
- `edges.ts`: `EdgeKind`, `ShellEdge`, `NetEdge`, `ShellVertex`, `classifyEdge`.
- `cells.ts`: `ShellCell`, `layCells`.
- `shell.ts`: `BuildingShell`, `ShellReport`, `buildShell(fixture)`, the pipeline's one entry point.
- `export.ts`: a node CLI writing `out/<fixture>.json` for every fixture.
- `viewer/`: the three.js page (decisions 26 to 30).

**Dependencies**, all permissive, pinned to exact versions with no `^`: `three` (MIT), `@types/three`, `manifold-3d`
(Apache 2.0), `vite`, `vitest`, and `@proc-geo/core` (`workspace:*`). **No copyleft dependency may be added**, direct
or transitive: no GPL, LGPL, AGPL or MPL. Any new package's license is checked before it is installed. **AMENDED
2026-11-07** (journal decision 63): `manifold-3d` is pinned at 3.2.1 and `vite` at 7.3.7. manifold-3d 3.3.0 and later
pull in LGPL libvips through `sharp`, and vite 8 depends on MPL `lightningcss`.

## 2. Decisions

### Fixtures and storeys

1. **A fixture is a value**, and every length is in centimetres:

   ```ts
   type RingForm = 'hip' | 'gable';
   type RingSide = 'S' | 'E' | 'N' | 'W';   // S on y = y0, E on x = x1, N on y = y1, W on x = x0
   interface SideForm { form: RingForm; deg?: number }
   interface FixtureRing { rect: Rect; baseStorey: number; storeys: number; defaultDeg: number; sides?: Partial<Record<RingSide, SideForm>> }
   interface ShellFixture {
     name: string;
     cellSize: number;        // 50
     storeyHeight: number;    // 250 (AMENDED 2026-11-07 from 300, journal decision 102); storey N's floor at N * storeyHeight, its plate at (N + 1) * storeyHeight
     rings: FixtureRing[];
   }
   ```

   **AMENDED 2026-11-08** (journal decision 132, recording WP3.6's shape): forms are authored per Ring (decision 3).
   The per-storey `roofs: Record<number, StoreyRoof>` of roof-gable `Sel`s is gone. A side not listed is a hip at the
   Ring's `defaultDeg`. The compass sides map onto the wire format's corner order as S = side 0, E = 1, N = 2,
   W = 3 (journal decision 126). **AMENDED 2026-11-08** (journal decision 136): a Ring read from `input@1` lists all
   four sides with their solved form and pitch. Its `defaultDeg`, which only a courtyard cut collinear with no wall
   reads (decision 2), ~~is the pitch of its first `Auto` side in slot order, or else of side 0~~ **is the solved
   pitch of its first `Pitched` side in compass order (S, E, N, W), or 45° when no side is Pitched** (amended again by
   journal decision 140, because the first rule depended on the Ring's start corner). ~~A gable side takes the Ring's
   `defaultDeg`~~ (STRUCK by journal decision 153) **A gable side takes its wire run's pitch, validated to [7°, 75°]**,
   because algorithm B reads a gable's pitch as real geometry. `defaultDeg` is read only by unlisted sides.
2. **Storey N's plan is the union of every Ring's rectangle with `baseStorey <= N < baseStorey + storeys`**, traced by
   `unionLoops`. Several islands are allowed, each its own `Comp`.

   **A hole (a courtyard) is roofed through a cut, the user's sanctioned solution** (**AMENDED 2026-11-07**, journal
   decision 115; a hole was refused before).
   - **Where the cut goes.** The cut runs along a segment of one raw Ring wall, within that wall's span. A raw Ring
     wall is a side of one of the storey's Ring rectangles, before the union. The segment crosses the island's ring
     from the hole's loop to the outer loop, with the island's interior on both sides along its whole length, and
     either end may be a loop vertex. **AMENDED 2026-11-08** (journal decision 132): this asked for a whole wall, which
     no wall satisfies when two full-depth wings meet two full-width bands. Each wing's inner wall runs along the
     hole in its middle, but both of its buried ends cross a band.
   - **Which segment, when several qualify:** the shortest, then the lowest x of its lower end, then that end's
     lowest y, then the lowest Ring index. If none qualifies, it is a hard error naming the fixture and storey.
   - **The cut's pitch** (**AMENDED 2026-11-08**, journal decision 135; it was the cutting Ring's default):
     - where the cut is collinear with a union wall at one of its ends, it takes that wall's derived pitch (decision 3),
       because a weight change at a straight vertex is refused by the skeleton;
     - where it is collinear with walls of different pitch at both ends, the segment does not qualify, and the next one
       is tried;
     - ~~where it is collinear with no wall, it takes the cutting Ring's default pitch~~ ~~it takes `CUT_FREE_DEG =
       45`~~ (journal decision 143; STRUCK by decision 150: no measured shell had read it, and at 45° it broke
       courtyards with bands at 60°) ~~it takes the steepest derived pitch among the union walls it meets at its two
       ends~~ (journal decision 150; STRUCK by decision 151: it failed 96 of 1057 measured layouts) **where it is
       collinear with no wall, it takes the steepest derived pitch among all the walls of its island, hip and
       gable**, that is, of the outer loop and the hole's loop the cut joins (**AMENDED 2026-11-08**, journal
       decisions 151 and 153). It was green on all 1057 layouts. Decision 151 had left gables out and used a 45° constant
       for an all-gable island. Decision 153 struck that, because a gable's pitch is real geometry and now survives the
       wire.
   - **The roof.** The roof is solved on the slit polygon, exactly as roof-gable's `buildCourtyard` does with a slit
     width of 0. The outer loop and the hole's loop are spliced at the cut's two ends, both slit sides are
     `form: 'cut'`, and algorithm B's cut pieces raise the rake across the slit. Neither the solver nor roof-gable's
     copied files change.
   - **The wall prism** is built from the true outline, the outer loop with the hole's loop as a hole, not from the
     slit polygon. The courtyard's walls are ordinary `Wall` faces, and the cut is not a wall.
   - **Faces on the cut's vertical plane** from the hip solid or the cut pieces are tagged `Internal`. Each has a
     coincident opposite partner across the slit, so the union removes it, and `survivingInternal` 0 proves the cut
     leaves no surface.
   - **Authored `form: 'cut'` selectors stay a hard error.** Only this rule places a cut.
3. **Roof forms are authored per Ring and derived onto the union outline** (**AMENDED 2026-11-07**, journal decision
   116; forms were authored per storey on the union outline with roof-gable's `Sel`s, and Ring inheritance was
   deferred).
   - **Authoring.** Each `FixtureRing` carries its side forms, each `hip` or `gable` with an optional pitch, plus a
     default pitch. Its index in `rings` stands in for the C++ parent `FBuildableComponentModel` index.
   - **The merged wall.** A union wall is a maximal straight run of the storey outline: one line, one facing,
     contiguous, however many Ring corners the traced outline breaks it at.
   - **The rule (the C++'s):** among the Rings whose side lies on a union wall and overlaps it, **the lowest index
     wins, and the whole union wall takes that side's form and pitch.**
   - **What the roof sees.** The derived forms become roof-gable `Sel`s over each union wall's span, so roof-gable is
     unchanged.
   - **Buried sides.** A Ring side lying inside the union produces no union wall, and its form is dropped.
   - **The requirement behind the rule is determinism.** Rings are totally ordered by a unique key, so every set of
     coinciding walls has exactly one winner. Creation order is not required, and a reused index may let a newer Ring
     win. Two Rings with one index is an error (**AMENDED 2026-11-08**, journal decision 128).
4. **Every storey is roofed as if it were the top storey**, whether or not a storey stands over it. A middle storey's
   roof is always built, and the union removes whatever of it lies inside the storey above.

### The raw solids

5. **A storey yields separate raw parts, never pre-unioned:** one wall prism per island, one hip solid per island, and
   one solid per gable piece. Keeping the parts apart is what lets every raw triangle carry exactly one tag before the
   single union in decision 12.
6. **The wall prism** is the island's outline extruded from the storey's floor to its plate. Its side faces are tagged
   `Wall`, each with the union wall it lies on. Its bottom face is tagged `Ground` on storey 0 and `Underside` on every
   storey above. Its top face is tagged `Internal`.
7. **AMENDED 2026-11-08** (journal decision 132): **on a storey with a hole, the hip solid stands from the storey's
   floor**, its sides the prism's own Wall sides and its bottom the prism's floor. With a bottom at plate height,
   Manifold can triangulate the cut as a diagonal, giving one edge four half-edges. **The hip solid** is one closed mesh: bottom face the island's outline at plate height, top faces the skeleton's
   faces from `solveFaces`, each lifted to `z = plate + planeAt(plane, p)`. Each top face is tagged `Roof` with its
   `RawFace.wall`, and the bottom face is tagged `Internal`.
8. **A gable piece's solid** is the piece's band rectangle in plan: along the wall over `[bandLo, bandHi]`, inward from
   the wall line to `farDist` (capped at the storey's bounding box). It is extruded from plate height upward and then
   trimmed:
   - to keep only what lies below every one of the piece's planes;
   - to keep only what lies above the plate;
   - to keep only what lies within the island's footprint.

   Its faces on a piece plane are tagged `Roof` with that canonical plane's id. A face is tagged `Gable`:
   - with the piece's own wall, over the piece's whole band `[bandLo, bandHi]`;
   - with any other island wall, where it stands within that wall's own span, for example on a monopitch's dead
     high-end wall.

   Every other face, including any part of a wall's plane outside the wall's span, is `Cheek`. **AMENDED 2026-11-07**
   (journal decisions 75 and 80): wall-line faces other than the piece's own wall were Cheek, and the first
   amendment wrongly matched a wall's whole plane rather than its span. **AMENDED 2026-11-07** (journal decision 75): only the piece's own wall line was
   Gable, so a monopitch's genuine high-end face came out Cheek. **AMENDED 2026-11-07** (journal decision 41): a Roof face is
   keyed by its canonical plane, not by a wall, because `finishBuilding` merges collinear walls of equal pitch into
   one plane. Spec text that says "that plane's wall" now means that plane.
9. **`algoB.ts` gains one export**, `solveRoofParts(b: Building, opt: BOptions): {defaults: PlaneFace[]; faces: RawFace[]; pieces: Piece[]}`.
   It returns the default hip faces and the pieces `runB` already computes, with `Piece` exported. `runB` keeps its
   behaviour exactly, so the copy-integrity test still holds. **Every storey calls it with `{far: 'plane'}`**,
   roof-gable's chosen rule (**AMENDED 2026-11-07**, journal decision 48).

   **AMENDED 2026-11-07** (journal decisions 64 and 68): it returns a named, exported
   `interface RoofParts { defaults: PlaneFace[]; faces: RawFace[]; pieces: Piece[]; notes: string[] }`. A piece that `buildPieces` drops as
   NoPlane is a hard error naming the fixture, storey and line. A skeleton refusal throws.
10. **Tags are assigned at construction, by geometry**, and every triangle of every raw part gets a `faceID` indexing
    one `TagTable` entry:

    ```ts
    type ShellKind = 'Wall' | 'Gable' | 'Roof' | 'Underside' | 'Ground' | 'Cheek' | 'Internal';
    interface FaceTag { kind: ShellKind; storey: number; wall: number; plane: number; part: number }
    // wall: -1 for Roof, floors and Internal. plane: the storey Building's canonical plane id for Roof, -1 otherwise.
    ```

    **A face's identity is:**
    - `(kind, storey, plane)` for Roof;
    - `(kind, storey, oriented vertical plane)` for Wall, Gable and Cheek;
    - `(kind, storey)` for Underside, Ground and Internal.

    **`part` and `wall` are provenance only, and are never compared.** **AMENDED 2026-11-07 again** (journal decision
    96): vertical kinds were keyed by `wall`, so collinear walls from different Rings split one face in two. The
    shell's edges then depended on how the plan was split into Rings. Face grouping (decision 18), conflict detection (decision 15) and the
    re-tag rule (decision 14) compare identity, never the whole `FaceTag`. **AMENDED 2026-11-07** (journal decision
    41): without it, the hip solid's Roof faces and a gable piece's Roof faces on the same plane would split into
    separate faces, with a spurious `RoofSeam` between them.
11. **Each raw part enters Manifold through `Manifold.ofMesh`**, with its `faceID` array set from the tag table. A part
    Manifold refuses as non-manifold is a hard error naming the fixture, storey and part. **AMENDED 2026-11-07:**
    - **A part may be built with Manifold operations** (decision 8's extrude and trims). It is then tagged on its final
      mesh by matching each triangle's plane to the part's generating planes, and enters the union through `ofMesh`
      with those `faceID`s. A triangle that matches no generating plane is a hard error naming the part (journal
      decision 45).
    - **Before `ofMesh`, every part's vertices are welded within `SHELL_TOLERANCE_CM` and snapped to a 1/1024 cm
      grid**, and any strip vertex lying on another strip's edge is split into that edge. A storey whose default hip
      `solveFaces` refuses is a hard error naming the fixture and storey (journal decision 51).

### The union and provenance

12. **The whole building is one `Manifold.union` over every raw part of every storey**, and nothing else removes
    geometry. There is no containment test, no burial rule and no plan-view mask anywhere in the app.
13. **An output triangle's tag starts as its `faceID`'s entry**, which Manifold carries through the boolean.
14. **Coplanar overlap is re-tagged by one total order: `Wall` > `Gable` > `Roof` > `Underside` > `Ground` > `Cheek`,
    and between equal kinds the lower storey wins.** Overlapping triangles with the same identity (decision 10) are no
    conflict. **`Internal` takes no part in re-tagging**: an output triangle whose `faceID` is Internal stays Internal
    and counts toward decision 17. **AMENDED 2026-11-07** (journal decision 43): the original rule ordered only Wall and
    Gable, and could have relabelled a surviving Internal triangle. Two cases from the fixtures:
    - an upper storey's flush wall on the plane of the lower storey's Gable keeps `Wall`;
    - an upper storey's own Gable lying inside the lower Gable's triangle shows the lower Gable, so one continuous
      Gable stands.
15. **AMENDED 2026-11-07** (journal decision 111). The union can merge coplanar regions of different identity into
    one output triangle, so a single tag per triangle, chosen at its centroid, mislabels part of its area. Before
    deciding any tag, the re-tag pass **imprints** onto the output mesh the boundaries between coplanar raw faces
    whose winners differ:
    - every output triangle that straddles such a boundary is split along it;
    - every new vertex lying on another triangle's edge splits that neighbour, as the weld's T-junction split does;
    - the mesh re-enters through `Manifold.ofMesh`, which must accept it as closed.

    After imprinting, every output triangle lies wholly within one winning region, which is asserted on every fixture
    and robustness case. The steps below then apply per triangle. **AMENDED 2026-11-08** (journal decision 144): the
    assertion is exact. Each triangle, eroded by 0.005 cm, is clipped against the raw triangles; a seven-point sample
    had missed straddles.

    **The re-tag pass:**
    - for each output triangle, collect every raw triangle on the same oriented plane (normals within `1e-5`, offsets
      within `0.01` cm) whose polygon holds the output triangle's centroid;
    - when they carry different identities (decision 10), decision 14's order picks one (**AMENDED 2026-11-07**:
      "different tags" now reads "different identities");
    - every such conflict is listed in the report with its fixture, plane and both tags.
16. **Positions are float32 in `manifold-3d`'s mesh**, so every geometric tolerance in the app is `0.01` cm and lives
    in one constant, `SHELL_TOLERANCE_CM`. **AMENDED 2026-11-07** (journal decision 73): one exception, the re-tag
    pass's containment slack. It is `RETAG_SLACK_CM = 1e-3`, its own named constant, above float32 noise but small
    enough not to relabel a genuine thin face.

    **AMENDED 2026-11-08** (journal decision 144): the full list of named exceptions, all in `constants.ts`, is:
    - `RETAG_SLACK_CM`;
    - `IMPRINT_SIDE_CM` and `IMPRINT_MERGE_CM`;
    - `CLEAN_TOLERANCE_CM`, the cleaning's clustering radius (4/1024);
    - `CLEAN_MAX_MOVE_CM`, the bound on any vertex's total move in cleaning, now equal to `SHELL_TOLERANCE_CM`.

    The cleaning's order is:
    1. vertices cluster within `CLEAN_TOLERANCE_CM`, whatever their connectivity;
    2. zero-volume sheets (coincident opposite triangles) are removed, and the edges they leave are stitched;
    3. caps are resolved, by an apex meeting its edge's end within the move bound, or by dropping a pair of caps that
       share a long edge;
    4. the move bound is checked, on the float32 positions as written. The meeting point aims four float32 ulps short
       of the bound (**AMENDED 2026-11-08**, journal decision 153).

    **AMENDED 2026-11-08** (journal decision 137): a second exception, the wire format's corner slack,
    `WIRE_CORNER_SNAP_CM = 1e-6`.
    - A Ring corner read from `input@1` within it of the 1/1024 cm grid is snapped by `snapCm`, the app's one rounding,
      and the diff report states the largest drift.
    - A corner beyond it is refused.
    - The slack covers double round-off in the C++ transforms, and it does not cover mis-authoring.
    - **AMENDED 2026-11-08** (journal decisions 156 F5, 161 finding 4 and 164): the slack also applies to run ends,
      in this order, on a side's runs as listed:
      1. every run must have its raw start below its raw end, or the file is refused;
      2. the first run's start, if within `WIRE_CORNER_SNAP_CM` of 0, becomes 0;
      3. each later run's start, if within it of the previous run's end, becomes that end, never 0;
      4. the last run's end, if within it of the snapped side length, becomes that length;
      5. interior ends are not snapped.

      After snapping, a run that does not satisfy `0 ≤ start < end ≤ length`, or that overlaps a run before it, is
      refused (**AMENDED 2026-11-08**, journal decision 167). A gap between runs is accepted, because a
      party wall or a missing run leaves one. Pitch agreement between runs is exact.
17. **A surviving `Internal` triangle is a defect, not a face**: it is drawn magenta and counted in
    `ShellReport.survivingInternal`, and every fixture asserts that count is zero.

### Faces

18. **A `ShellFace` is a maximal edge-connected set of output triangles sharing one identity (decision 10) and one
    oriented plane**, stored as outer and hole loops, with the outer loop first. **AMENDED 2026-11-07**: "tag" now reads
    "identity", and triangles that touch only at a vertex are separate faces.

    ```ts
    interface ShellFace { id: number; tag: FaceTag; normal: Vec3; offset: number; loops: Vec3[][]; area: number }
    ```

### Edges

19. **A `ShellEdge` is a maximal straight run of manifold edges with the same two `ShellFace`s on either side**:

    ```ts
    interface ShellEdge { id: number; kind: EdgeKind; a: Vec3; b: Vec3; v: [number, number]; faces: [number, number] }
    interface NetEdge { id: number; kind: EdgeKind; v: [number, number]; cells: number[]; shellEdge: number }
    interface ShellVertex { id: number; p: Vec3; edges: number[]; cells: number[]; faces: number[] }
    ```

    **AMENDED 2026-11-07** (journal decisions 58 to 60): the net's vertices are first-class records, as reference data
    for Piste Perfect's deferred C30, "vertices as net slots".
    - **A `ShellVertex` is every `ShellEdge` endpoint and every Cell corner**, deduplicated by exact equality of its
      position on decision 11's 1/1024 cm grid. A ShellEdge's `v` holds its endpoint vertex ids.
    - **A `NetEdge` is the segment between two consecutive vertices along any Cell side.**
      - `cells` holds the one or two Cells it borders: one where the far face has no Cells.
      - `shellEdge` is the ShellEdge it lies on, or -1 for an interior lattice side.
      - Its `kind` is set by decision 25.
    - **A vertex's `edges` are NetEdge ids, not ShellEdge ids**, so a Cell corner in the middle of a ShellEdge (a
      column line crossing a rake) still lists that ShellEdge's kind.
    - **`edges`, `cells` and `faces` are each in cyclic order, counter-clockwise seen from outside**, read from the
      manifold's triangle fan.
    - **A vertex carries no kind of its own**: its incident NetEdges' kinds and faces' tags are what a Grammar reads.
    - **Sheets.** The union can write a non-manifold pinch: two surface sheets that touch along an edge or at a point,
      for example an upper wall flush over a lower reflex corner. They appear as coincident mesh vertices, or as
      coincident ShellEdges.
      - Coincident vertices are one ShellVertex, whose lists hold each sheet's counter-clockwise run in turn, with the
        sheets ordered by lowest face id.
      - Coincident ShellEdges stay separate ShellEdges, one per sheet, and share their endpoint ShellVertices.

      **AMENDED 2026-11-07** (journal decisions 110 and 119).
20. **Convexity is the only sign-sensitive test in the app, and it is stated once here.** The edge is **flat** when
    `|dot(nA, nB) - 1| < 1e-6`, and **this test runs first**. Otherwise take face A, its outward unit normal `nA`, a
    point `p` on the edge, and `q`, the vertex opposite the edge in face B's output triangle incident to it. The edge
    is **convex** when `dot(nA, q - p) < -SHELL_TOLERANCE_CM` and **concave** when
    `dot(nA, q - p) > SHELL_TOLERANCE_CM`. The edge is **horizontal** when its z extent is within tolerance, and
    **vertical** when its plan extent is.

    **AMENDED 2026-11-07** (journal decision 42): `q` was B's centroid, which lands on the wrong side of the edge for a
    non-convex B. Storey 1's notched wall in `OverhangApexOnEave` would have come out convex, as `Eaves`.

    **Worked example (convex, a Ridge).** Two roof faces at 30 degrees over a 600 cm span, plate at 250.
    - Face A is `z = 250 + 0.577x`, so `nA = (-0.5, 0, 0.866)`.
    - Face B is `z = 250 + 0.577(600 - x)`.
    - The edge point is `p = (300, 250, 423.2)`, and B's incident triangle has the eave vertex `q = (600, 0, 250)`.
    - `dot(nA, q - p) = -0.5·300 + 0.866·(-173.2) = -300 < 0`, so the edge is convex. It is also horizontal, so it is a
      `Ridge`.

    **Worked example (concave, a RingJunction).** Face A is the same lower roof. B is an upper storey's wall at
    `x = 200`. The edge point is `p = (200, 100, 365.5)`, and B's incident triangle has the vertex `q = (200, 0, 500)`.
    `dot(nA, q - p) = 0 + 0.866·134.5 = 116.5 > 0`, so the edge is concave: a `RingJunction`.
21. **Edge kinds reuse Piste Perfect's `EModularEdgeKind` names where they exist**, and the classification is this
    table, read for the unordered pair of tags:

    | Pair | Flat | Convex | Concave |
    |---|---|---|---|
    | Roof, Roof | `RoofSeam` | `Ridge` if horizontal, else `Hip` | `Valley` |
    | Roof, Wall | none | `Eaves` | `RingJunction` |
    | Roof, Gable | none | `Verge` | `RingJunction` |
    | Wall, Wall | `FloorLine` if horizontal, else `WallVertical` | `ExternalCorner` | `InternalCorner` |
    | Wall, Gable | `WallPlate` if horizontal at the Gable's own plate, else `GableHorizontal` if horizontal, `GableVertical` if vertical, `GableSloped` otherwise | `ExternalCorner` | `InternalCorner` |
    | Gable, Gable | `GableVertical` if vertical, `GableHorizontal` if horizontal, `GableSloped` otherwise (**AMENDED 2026-11-08**, journal decision 144) | `ExternalCorner` | `InternalCorner` |
    | Roof, Underside (**AMENDED 2026-11-08**, journal decision 153) | none | none | `SoffitJunction` |
    | Wall or Gable, Ground | none | `GroundLine` | none |
    | Wall, Underside | none | `SoffitEdge` | `SoffitJunction` |

    **A Cheek reads as a Gable for this table**: every row that names Gable applies with Cheek in Gable's place, and a
    Cheek against a Gable or another Cheek reads as Gable against Gable (**AMENDED 2026-11-07**, journal decision 77).

    Any cell of the table marked none, and any pair not in it, gives `Unclassified`: drawn magenta and counted in
    `ShellReport.unclassifiedEdges`. `RoofSeam`, `GableSloped`, `SoffitEdge`, `SoffitJunction` and `Unclassified` are
    new names, not in `EModularEdgeKind`, and the report lists them as such.

    **`EdgeKind` is exactly these 21 members** (**AMENDED 2026-11-07**, journal decision 44). The 16 from
    `EModularEdgeKind`, in its order, are `WallVertical`, `WallHorizontal`, `FloorLine`, `ExternalCorner`,
    `InternalCorner`, `RingJunction`, `Eaves`, `RoofInterior`, `WallPlate`, `GableHorizontal`, `GableVertical`, `Verge`,
    `Ridge`, `Hip`, `Valley` and `GroundLine`. The 5 new ones are `RoofSeam`, `GableSloped`, `SoffitEdge`,
    `SoffitJunction` and `Unclassified`.

### Cells

22. **Cells are laid on the final `ShellFace`s, never before**, on one global lattice of `cellSize` squares anchored at
    the world origin:
    - a `Wall` or `Gable` face is laid in `(u, z)`, where `u` is world x for a face whose normal is ±y and world y for
      one whose normal is ±x;
    - a `Roof` or `Underside` face is laid in plan `(x, y)`;
    - a `Cheek` face is laid in `(u, z)` exactly as a Gable face;
    - `Ground` and `Internal` faces get no Cells.

    **AMENDED 2026-11-07** (journal decision 77, the user's ruling): a surviving Cheek is a legitimate face of its own
    kind with Cells. It had no Cells before.

    (An interim amendment that adopted the C++ net's staircased roof Cells was reverted the same day, 2026-11-07,
    in journal decisions 87 to 89. Roof Cells are cut exactly, as this decision states.)
23. **A Cell is one lattice square intersected with its face's projected region**, by `CrossSection.intersect`, lifted
    back onto the face's plane:

    ```ts
    interface ShellCell { id: number; face: number; lattice: [number, number]; polygon: Vec3[]; corners: number[]; sides: number[]; whole: boolean }
    ```

    **AMENDED 2026-11-07** (journal decisions 44, 58 and 59):
    - **`polygon` carries every vertex on the Cell's boundary**, including the points where the neighbouring face's
      lattice meets their shared ShellEdge. Each side is then exactly one NetEdge.
    - `corners[i]` is the `ShellVertex` id of `polygon[i]`.
    - `sides[i]` is the `NetEdge` id of the side from `polygon[i]` to `polygon[i + 1]`, and its kind is read from that
      NetEdge.

    `whole` is true when its area is `cellSize²` within tolerance. **A partial Cell exists exactly when its polygon has
    at least three distinct vertices on the 1/1024 cm snap grid**, however small its area, and the report counts
    partial Cells. **AMENDED 2026-11-07** (journal decision 119): a Cell under `SHELL_TOLERANCE_CM²` was dropped,
    which disagreed with vertex identity. Its vertices, kept because they lie more than `SHELL_TOLERANCE_CM` apart,
    left NetEdges with nothing on one side. **AMENDED 2026-11-08** (journal decision 135): a polygon of at least three
    distinct snapped vertices whose snapped area is not positive (all collinear, or wound backwards) is a hard error,
    never silently dropped. No case reaches it yet; one that does is enrolled and ruled on.

    **AMENDED 2026-11-08** (journal decisions 122 and 144, G3 and G4):
    - **A lattice square holding a hole of its face** is split by a lattice-parallel line. A hole is a piece of
      negative area of at least `SHELL_TOLERANCE_CM`². The line runs through the middle of the hole's extent along its
      wider axis, snapped to the 1/1024 cm grid, and splitting repeats until no part holds a hole.
      - Each part is a Cell with the square's index.
      - A split line's crossings with ShellEdges are vertices on both faces' Cells.
      - Its ends on lattice lines lie on the neighbouring Cells' sides.
    - **A Cell side lying on one ShellEdge carries exactly that edge's vertices between its ends, by identity.** Corners
      match in 3D, in the face's own plane, never in a projected frame.
    - **A mesh vertex lying inside a ShellEdge whose faces its triangle fans miss** gains that edge's faces as one more
      sheet (decision 19's sheets).

    **AMENDED 2026-11-08** (journal decision 130): wall provenance, which the union otherwise drops.
    - `ShellCell` gains `source: {ringModelIndex: number; side: number} | null`, where `side` is the Ring side index
      (side i runs from corner i to corner i + 1).
    - A Wall Cell takes the Ring side whose raw wall it lies on, and a Gable Cell takes the Ring side whose wall line its
      gable piece stands on. Where several Rings' raw walls coincide, the lowest model index wins.
    - Every other Cell, a Cheek Cell included, has `null`.
    - **AMENDED 2026-11-08** (journal decision 153): a Gable Cell beyond its line's walls takes the Ring side of the
      nearest wall on its line. A gap between two walls is split at its middle.
    - **AMENDED 2026-11-08** (journal decision 156):
      - A Ring side's provenance span is the stretch of that side lying on the storey's union walls, the visible
        stretch, never its buried part.
      - `side` is the compass index (S = 0, E = 1, N = 2, W = 3) for a prototype-native fixture. For a shell read from
        `input@1`, it is the file's own side index, mapped back with the model index.
    - Cells are cut at provenance boundaries, so every Cell has exactly one source.
    - `ShellFace` gains `sources`, the distinct sources of its Cells, ascending by model index and then by side.
24. **A Cell takes its face's tag and never spans two faces**, so a Cell's kind is always unambiguous. A Wall-Gable
    junction cuts Cells along it, exactly as the shell does.
25. **A Cell side on a `ShellEdge` takes that Edge's kind.** Any other side takes:
    - `WallVertical` or `WallHorizontal` on a Wall face;
    - `GableVertical` or `GableHorizontal` on a Gable or Cheek face (Cheek **AMENDED 2026-11-07**, journal decision
      77);
    - `RoofInterior` on a Roof or Underside face.

    **AMENDED 2026-11-07** (journal decision 61): Gable faces took `WallVertical` and `WallHorizontal`, which disagrees
    with Piste Perfect's `ModularRoofNet.cpp`. That code kinds the Edges between neighbouring gable Cells
    `GableVertical` and `GableHorizontal`.

### The viewer

26. **The viewer is one page at `apps/building-shell/index.html`, served by `vite dev`.** It loads `manifold-3d`'s WASM
    in the browser and runs `buildShell` live on the selected fixture.
27. **The camera is a three.js `OrbitControls` rig**: drag to orbit, wheel to dolly, right-drag to track. Hovering a
    face, Cell or Edge shows a readout:
    - for a face: tag kind, storey, source wall label, area;
    - for a Cell: lattice coordinate and whole or partial;
    - for an Edge: kind, length, and its two faces' tags;
    - for a vertex: position, and its incident Edges' kinds (**AMENDED 2026-11-07**, journal decision 58).

    A click pins the readout.
28. **Colours are fixed per kind:**
    - each `ShellKind` has one fill colour, drawn translucent for `Ground`;
    - each `EdgeKind` has one line colour;
    - `Unclassified` and surviving `Internal` are magenta;
    - partial Cells show through their outlines. A "highlight partial Cells" toggle tints them, and is off by default
      (**AMENDED 2026-11-07**, journal decision 98: a default lighter fill hid the exact roof lines and read as
      another kind);
    - every Edge is visible wherever no non-adjacent face occludes it, and the draw order is faces, partial-Cell
      tint, Cell outlines, then Edges (**AMENDED 2026-11-07**, journal decision 98);
    - a legend lists every colour in use.
29. **Toggles:**
    - faces, Edges, vertices, Cell outlines (vertices **AMENDED 2026-11-07**, journal decision 58);
    - each storey;
    - a **raw** mode that draws every raw part before the union as translucent ghosts, so what the union removed is
      visible.
30. **A side panel shows the fixture selector and the `ShellReport`**: conflicts, surviving `Internal`, `Unclassified`
    Edges, `Cheek` faces, partial Cell count, and Manifold's status.

### Output and tests

31. **Copy integrity:** a vitest test runs roof-gable's algorithm B over the copied `cases.ts` with `measure.ts`. Its
    tally must equal the roof-gable README's B line exactly: `pass 44, cheek 6, fail 3, blocked 0, none 0`. The test
    fails if the copy drifted or the skeleton moved off `f7b6091`'s behaviour, on the path the shell uses. **AMENDED
    2026-11-07** (journal decision 69): the test also pins each of the 53 cases' B verdicts, captured from roof-gable's
    own `run.ts` at `f7b6091`. Code the shell never runs is out of its scope. **The app's vite and vitest configs
    alias `@proc-geo/core` to `packages/core/src/index.ts`**, as core's jest config does. Core's `package.json`
    resolves to `dist/`, so without the alias this test would measure the last build (**AMENDED 2026-11-07**, journal
    decision 47).
32. **Every fixture asserts these invariants:**
    - Manifold's status is OK;
    - the output is closed, with its expected genus. That is 1 for `BridgeOverBlock`, whose block closes a tunnel under
      the bridge, and 0 for every other clean fixture, `Bridge` included: its towers on open ground form a ∏, which has
      no tunnel. A degenerate twin's genus is measured, then pinned (**AMENDED 2026-11-07**, journal decisions 73 and
      74). **AMENDED 2026-11-08** (journal decision 135): genus is asserted per connected component. Manifold's single
      figure sums over components, so a courtyard beside a separate island reads 0;
    - `survivingInternal` is 0;
    - `cheeks` equals the fixture's pinned, measured count, which is 0 for all ten. A Cheek is a legitimate face
      (**AMENDED 2026-11-07**, journal decisions 46 and 77; decision 46's "is 0" is struck);
    - every Cell's polygon lies on its face;
    - every vertex that loop reduction drops lies within `SHELL_TOLERANCE_CM` of the chord it is dropped onto, and
      ~~each `ShellFace`'s loop area equals its own triangles' area minus the exact area those dropped vertices cut
      off, within float epsilon~~ **each `ShellFace`'s loops lie within `SHELL_TOLERANCE_CM` of its triangles' boundary,
      and that boundary within them, by Hausdorff distance**. **AMENDED 2026-11-07 twice** (journal decisions 106 and
      110): a flat 0.05 cm² sum bound was arbitrary, and a bound scaled by perimeter could hide a lost notch.
      **AMENDED 2026-11-08** (journal decisions 122 and 144): the area equality was an algebraic identity, so it
      caught nothing;
    - every output triangle lies on its tag's generating plane; no ShellEdge joins two faces of one identity
      (**AMENDED 2026-11-07**, journal decision 110);
    - no two distinct components lie within `CLEAN_TOLERANCE_CM` of each other without touching (**AMENDED
      2026-11-08**, journal decisions 150 and 153).
33. **`pnpm --filter @proc-geo/building-shell export` writes `out/<fixture>.json`**, one `BuildingShell` per fixture:

    ```ts
    interface ShellReport { conflicts: string[]; survivingInternal: number; unclassifiedEdges: number; cheeks: number; partialCells: number; newEdgeKinds: EdgeKind[]; newConventions: string[] }
    // newEdgeKinds: EdgeKind[] AMENDED 2026-11-07 from string[] (journal decision 94)
    interface BuildingShell { fixture: string; faces: ShellFace[]; edges: ShellEdge[]; netEdges: NetEdge[]; vertices: ShellVertex[]; cells: ShellCell[]; report: ShellReport }
    ```

    These files are reference data for Piste Perfect's C++ tests.

    **AMENDED 2026-11-07** (journal decisions 65 and 66):
    - **`newConventions` lists every name used where the C++ net has no precedent**. Today that is `RoofInterior` on
      Underside faces, since the C++ net has no underside Cells, and the `Cheek` kind, which the C++ makes a Gable
      over no run (journal decision 77).
    - **A corner between two Rings is `ExternalCorner` or `InternalCorner`, by its geometry** (journal decision 90).
      The C++ net calls it `RingJunction`. Rings are rectangles, so every `InternalCorner` lies between two Rings.
      `newConventions` therefore lists this convention whenever any `InternalCorner` Edge is emitted. It needs no
      Ring provenance.
    - **The prototype is a clean-room design** (journal decision 89). These entries record where it differs from the
      C++ for the port's benefit; they are not a list of defects.
    - **Roof lines are cut exactly**, so hips, valleys and off-lattice ridges carry triangular and sliver partial
      Cells. The C++ net staircases them on whole plan Cells instead. The prototype is a clean-room design and does
      not follow that (journal decision 89).

### The fixtures

All twelve use `cellSize` 50 and `storeyHeight` 250, Piste Perfect's default. Coordinates are `[x0, y0, x1, y1]`.
**AMENDED 2026-11-07:**
- the storey height was 300; every height below is recomputed for 250 (journal decision 102);
- the roster grew from seven (first miscounted as six) to ten (journal decision 70), then to eleven with
  `DefaultChalet` (journal decision 103), then to twelve with `Courtyard` (journal decisions 115 and 132; genus 1, its
  report empty but for 48 partial Cells and the InternalCorner and roof-line conventions);
- decision 38 now holds two fixtures (journal decision 55);
- decisions 37 and 39 each hold a clean twin and a degenerate twin (journal decision 56).

**A degenerate twin asserts only decision 32's invariants until its topology is measured**, and that measured
topology is then pinned as its assertion. A degenerate twin that breaks an invariant is a finding, never a waived
assertion.

34. **`NarrowUpperStorey`**, Piste Perfect's fixture of that name.
    - **Rings:** `[0,0,600,600]` on storey 0, and `[200,0,400,200]` on storey 1, flush with the lower Ring's y = 0
      wall.
    - **Roofs:** storey 0 has y = 0 gabled and 60 degrees elsewhere, so its apex is at 769.6. Storey 1 is a 45 degree
      hip.
    - **Asserts:**
      - no `Roof` face of storey 1;
      - storey 1 has `Wall` faces only on the plane y = 0, with total area 50000;
      - storey 0's `Gable` area is 155884.6 − 50000 = 105884.6;
      - one `Ridge` from (300, 0, 769.6) to (300, 300, 769.6);
      - `GableVertical` Edges on x = 200 and x = 400 over z 250 to 500, and `GableHorizontal` at z = 500 over x 200
        to 400;
      - `FloorLine` at z = 250 over x 200 to 400, and `WallPlate` at z = 250 over x 0 to 200 and x 400 to 600;
      - the vertex where storey 0's Gable column line x = 50 crosses the rake, at (50, 0, 336.6), lists a `Verge`
        NetEdge and a `GableVertical` NetEdge (**AMENDED 2026-11-07**, journal decision 59). This is C28's bracket
        seat.
35. **`NarrowUpperStoreyGabled`**: `NarrowUpperStorey` with storey 1's y = 0 wall also gabled. Its faces, tags and
    areas equal `NarrowUpperStorey`'s, and no `Gable` face of storey 1 survives. This fails if the coplanar rule lets
    the upper Gable win.
36. **`TallerUpper`**: `NarrowUpperStorey` with storey 0 at 30 degrees instead of 60, so its apex is at 423.2 and
    below storey 1's plate at 500.
    - storey 1's `Roof` faces cover plan area 40000;
    - the lower `Ridge` runs only from y = 200 to y = 300 at x = 300;
    - `RingJunction` Edges run along x = 200 and x = 400 at z = 365.5 over y 0 to 200;
    - two sloped `RingJunction` Edges on y = 200 meet at (300, 200, 423.2).
37. **`Overhang`**: `[0,0,600,600]` on storey 0, a 30 degree hip with its apex at 423.2, and `[300,0,900,600]` on
    storey 1, a 45 degree hip.
    - storey 1's `Underside` survives over x 600 to 900, area 180000;
    - storey 0's `Roof` survives only over x 0 to 300, plan area 180000;
    - `SoffitEdge` along x = 900, and along y = 0 and y = 600 over x 600 to 900;
    - `SoffitJunction` along x = 600 at z = 250;
    - a ^-shaped `RingJunction` on x = 300 through (300, 0, 250), (300, 300, 423.2) and (300, 600, 250).

    **AMENDED 2026-11-07** (journal decision 49): storey 0 was 45 degrees, which put its apex exactly on storey 1's eave
    line. That geometry is kept as the degenerate twin below.

    **`OverhangApexOnEave`** (degenerate twin) puts a hip's apex exactly on the upper storey's eave line. It is
    `[0,0,500,500]` on storey 0, a 45 degree hip, and `[250,0,750,500]` on storey 1, a 45 degree hip. Its apex
    (250, 250, 500) lies on storey 1's eave line x = 250 at plate height 500. Storey 1's x = 250 wall pinches there
    into two faces that touch only at that point. **AMENDED 2026-11-07** (journal decision 102): at 250 cm storeys,
    the old geometry's apex (550) would pierce storey 1's roof rather than touch its eave, so the footprints shrink
    to keep the coincidence.
38. **`Bridge`**, the owner's column case: towers that stand from the ground and a bridge over open air. **AMENDED
    2026-11-07** (journal decision 55, confirmed by the user): the planner's reconstruction, which had a block on
    storey 0, is kept as `BridgeOverBlock` below.
    - **Rings:** towers `[0,0,200,600]` and `[800,0,1000,600]` over storeys 0 to 2, and a bridge `[200,0,800,600]` on
      storey 2. Every storey is a 30 degree hip. Storeys 0 and 1 are two islands each.
    - **Asserts:**
      - no `Roof` face of storey 0 or storey 1;
      - storey 2's `Underside` survives over x 200 to 800, area 360000;
      - a `SoffitJunction` along each tower's inner wall (x = 200 and x = 800) at z = 500;
      - a `FloorLine` at z = 250 on each inner wall;
      - a `GroundLine` under each inner wall.

    **`BridgeOverBlock`** is the planner's reconstruction, unchanged.
    - **Rings:** towers `[0,0,200,600]` and `[800,0,1000,600]` over storeys 0 to 2, a block `[0,0,1000,600]` on
      storey 0, and a bridge `[200,0,800,600]` on storey 2. Every storey is a 30 degree hip.
    - **Asserts:**
      - storey 0's `Roof` survives over x 200 to 800, its `Ridge` whole from x 300 to 700 at z 423.2, under storey 2's
        floor at 500;
      - no `Roof` face of storey 1;
      - storey 2's `Underside` survives over x 200 to 800, area 360000;
      - storey 0's roof meets each tower's inner wall by sloped `RingJunction` Edges.
39. **`ValleyWings`**: `[0,0,1000,400]` and `[600,0,1000,1000]` on storey 0, forming an L, with x = 0 and y = 1000
    gabled and 45 degrees elsewhere, so its ridges stand at 450; and `[650,50,950,300]` on storey 1, a 45 degree hip
    over the L's corner, with its plate at 500.
    - the lower roof has a `Valley` Edge on the line x + y = 1000, and it ends on storey 1's y = 300 wall at
      (700, 300, 350), where two `RingJunction` Edges meet;
    - no `Roof` face of storey 0 meets a `Roof` face of storey 1, by a shared Edge or a shared vertex (**AMENDED
      2026-11-07**, journal decision 96);
    - no Edge is `Unclassified`.

    **AMENDED 2026-11-07** (journal decision 50): the lower roof was 60 degrees, which put its ridges at 596.4 (at 250 cm
    storeys), above storey 1's plate, and storey 1 was `[650,50,950,350]`, whose corner lay exactly on the valley line. That geometry is
    kept as the degenerate twin below.

    **`ValleyWingsPierced`** (degenerate twin) is `ValleyWings` with the lower roof at 60 degrees and storey 1 at
    `[650,50,950,350]`, as first written. The lower ridges pierce storey 1's eaves, and the valley passes through
    storey 1's corner at (650, 350).
40. **`SingleStoreyT`**: roof-gable case `2a`, the T with x = 1000 gabled, on storey 0 alone, at that case's 45 degrees.
    - Its Roof and Gable top surface equals case 2a's own `expected(p)` plus the plate height, at every point of a 25 cm
      plan grid strictly inside the footprint, within `SHELL_TOLERANCE_CM`.
    - Its report is empty: `conflicts`, `survivingInternal`, `unclassifiedEdges`, `cheeks` and `newEdgeKinds` are all 0
      or empty. `partialCells` and `newConventions` are information, pinned as measured (**AMENDED 2026-11-07**,
      journal decision 92).

    This fails if the union changes a single storey's roof away from roof-gable's measured answer. **AMENDED
    2026-11-07** (journal decision 52): the old premise "a building that has nothing to clip" was false, because the T's
    union buries the hip faces under the gable piece and the gable's foot inside the stem.

    **`DefaultChalet`** is Piste Perfect's default building: `[0,0,1000,1000]` on storey 0 alone, with x = 0 and
    x = 1000 gabled and 22.5 degrees elsewhere. **AMENDED 2026-11-07** (journal decision 103): it was added as the
    eleventh fixture.
    - one `Ridge` from (0, 500, 457.1) to (1000, 500, 457.1), since 250 + 500·tan 22.5° = 457.1;
    - two `Gable` faces, each of area 103553.4 within 500/2048 cm². That is the most the 1/1024 cm snap of the apex can
      cost; the measured value is 103553.23;
    - four `Verge` Edges and two `Eaves` Edges;
    - its report is empty in decision 40's sense.

## 3. Deferred

- ~~**Deriving union wall forms from Ring forms.**~~ No longer deferred: decision 3 adopts the C++ rule, in which the
  lowest `FBuildableComponentModel` index wins the whole wall (journal decision 116).
- ~~**Courtyards and holes.**~~ No longer deferred: decision 2 roofs them through a cut along a raw Ring wall
  (journal decision 115).
- **Numerical parity with the C++ Cell counts and indices.** The JSON is reference data for the new C++ design, not a
  regression check on the old one.
- **The C++ boolean**: Manifold vendored, or the engine's `UE::Geometry::FMeshBoolean`. Either is for the C++ spec.
- **Dressing, Pieces, Grammars and the ridge's true end.** Shell and Cells only.
- **Per-storey height overrides.** Every storey is 250.

## 4. Retirement

Nothing in proc-geo is removed. In Piste Perfect, the roof-gable prototype stays as it is, as the frozen record of its
53-case table.
