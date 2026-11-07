---
title: "Building Shell Arc: Session 1 Journal"
type: workflow
status: active
---

# Building shell arc: session 1 journal

**This is the head of the thread**, and the first session of the arc. Decisions continue at **41** (1 to 40 are the
spec's own, in [building-shell-prototype-decisions.md](./building-shell-prototype-decisions.md)); findings start at
**F1**.

## Reading order for a fresh context

Read the spec's intro paragraph and its four-step model (the owner's voice), then §5 Open items and the Findings
below. Read the spec's section 2 only by decision number, as a finding cites it. **Do not read the Piste Perfect
exterior-manifold spec**: it is vocabulary only, and the failed design it records must not leak in.

## 1. The arc's charter

The user (2026-11-07): the spec is a prototype commissioned from the Piste Perfect C++ team; **review it with fresh
eyes for contradictions and obvious gaps, then steer the spec as arc lead.** The vision is the spec's four-step model:
every storey built alone, stacked, one union on raw geometry, Cells only on the final faces. A downstream rule that
departs from those four steps is a defect.

## 2. State as at bootstrap

- `main` at `f7b6091`, with the spec untracked. Arc branch `feature/building-shell` cut from `main` at `f7b6091`
  (2026-11-07), not pushed.
- No test figure measured: this session has run nothing. `apps/building-shell/` does not exist yet.
- Roof-gable README's B line `pass 44, cheek 6, fail 3, blocked 0, none 0` is recorded as measured at `f7b6091`
  (read in the README, not re-run).

## 3. Operational manual

- The roof-gable prototype is at `D:\Coding\resort_game\PistePerfect_5_7\Scripts\prototypes\roof-gable\`.
- `EModularEdgeKind` is at `Source\PistePerfect\Public\Buildables\ModularBuilding\ModularEdgeKind.h` in Piste Perfect:
  16 members, `WallVertical` through `GroundLine`.
- `@proc-geo/core`'s `package.json` resolves to `dist/`, not source (F9).
- **The spec's author is the Claude session `pisteperfect-5-7-27`**, which confirmed it on 2026-11-07. Confer with it
  by cross-session message on anything that touches the C++ project.

## 4. Next work

1. ~~User rules on §5's open questions.~~ Done: decisions 55 and 56.
2. ~~Fold decisions 41 to 56 into the spec in place.~~ Done 2026-11-07. Amended: spec 8, 9, 10, 11, 14, 15, 18, 20,
   21, 23, 31, 32, 37, 38, 39 and 40, plus the fixture preamble. The worked examples in spec 20 were recomputed with
   unit normals and incident-triangle vertices.
3. ~~Cut `feature/building-shell` and commit the spec and this journal on it.~~ Done: `3e833dc`.
4. **WP1 dispatched 2026-11-07** (general-purpose, Opus) at `3e833dc`. Its gates are: a perturbed copy fails the
   copy-integrity test, `@proc-geo/core` resolves to source, and the license check is clean. **Returned and accepted:
   decision 62.**
5. **WP2 dispatched 2026-11-07** (general-purpose, Opus) at `153166a`, on the user's go. Its gates: disabling the
   re-tag pass, offsetting a storey by 0.005 cm, and making the NoPlane drop silent each fail a test, and removing the
   snap is reported. Its first open question is whether manifold-3d 3.2.1 carries `faceID` through `union`; the
   delegate stops if it does not. When it returns, it gets decision 67's two reviews before acceptance. It covers raw parts, tagging (decision 45), welding and snapping (decision 51), the
   union, and the re-tag pass (decisions 43 and 41). It also carries decision 64's `notes` change and spec 32's
   invariants on all nine fixtures.

## 5. Open items

- ~~**Bridge (spec decision 38).**~~ Closed by decision 55.
- ~~**Fixture corrections in decisions 49 and 50.**~~ Closed by decision 56.
- **Roof lines in the C++ port: exact cut or staircase (F20, point 2).** The prototype keeps exact cuts (decision 66).
  The user rules for C++.
- **Corners between two Rings: `RingJunction` (C++) or `ExternalCorner`/`InternalCorner` (prototype) (F20, point 1).**
  The lead recommends the prototype's reading. The four-step model unions Rings per storey, so a junction between Rings
  stops being an edge between faces, and keeping Ring identity would reopen the failed approach. The user rules.
- ~~**The C++ vertex-addition feature (F15).**~~ Located by the user (content journal 01, C30) and closed by decision
  58.

## Decisions

41. **A face's identity is `(kind, storey, plane)` for Roof and `(kind, storey, wall)` for every other kind. `part` is
    provenance only, never compared.** Face grouping (spec 18), conflict detection (spec 15) and the re-tag tie
    (spec 14) all compare identity, not the whole `FaceTag`. Roof keys on the canonical plane because
    `finishBuilding` merges collinear walls of equal pitch into one plane, so "that plane's wall" (spec 8) has no
    single answer. Cures F1 and the ambiguity in F5.
42. **Convexity reads the third vertex of B's triangle incident to the manifold edge, never B's centroid, and the flat
    test runs first.** Replaces spec 20's choice of `q`. Cures F2.
43. **The re-tag order is total: Wall > Gable > Roof > Underside > Ground > Cheek, and equal kinds go to the lower
    storey. Internal takes no part in re-tagging**: an output triangle whose `faceID` is Internal stays Internal and
    counts in `survivingInternal`. Cures F3.
44. **`EdgeKind` is enumerated in the spec**: the 16 `EModularEdgeKind` members plus `RoofSeam`, `GableSloped`,
    `SoffitEdge`, `SoffitJunction`, `Unclassified`. **`ShellCell` gains `sides: EdgeKind[]`**, one per polygon side,
    in order. Cures F4.
45. **A raw part may be built with Manifold operations; it is tagged on its final mesh by matching each triangle's
    plane to the part's generating planes, then enters the union through `Manifold.ofMesh` with those `faceID`s.**
    Reconciles spec 8 with spec 11 (F5). A triangle matching no generating plane is a hard error naming the part.
46. **A surviving Cheek is reported, not failed, and every fixture in this spec asserts `cheeks` is 0.** A fixture that
    shows one is a finding, not a softened assertion. Cures F6.
47. **The app's vite and vitest configs alias `@proc-geo/core` to `packages/core/src/index.ts`**, as core's jest
    config does. Without it, spec 31's copy-integrity test measures the last build, not `f7b6091`'s source (F9).
48. **Every storey solves with `BOptions {far: 'plane'}`**, roof-gable's chosen rule (F10).
49. **Overhang's storey 0 is a 30 degree hip**, so its apex (473.2) clears storey 1's eave at 600. The `^` RingJunction
    then runs through (300, 0, 300), (300, 300, 473.2) and (300, 600, 300); the other assertions are unchanged.
    Cures F7.
50. **ValleyWings' lower roof is 45 degrees, not 60, and storey 1 is `[650,50,950,300]`.** The lower ridge (500) then
    clears storey 1's plate (600), and the valley `x + y = 1000` enters storey 1 through its y = 300 wall mid-span
    instead of through its corner. Cures F8.
51. **Every raw part's vertices are welded within `SHELL_TOLERANCE_CM` and snapped to a 1/1024 cm grid before
    `ofMesh`**, and strip vertices lying on another strip's edge are split into it. A storey whose default hip
    `solveFaces` refuses is a hard error naming the fixture and storey. Cures F11. The grid is exact in float32 for
    every coordinate under 16384 cm.
52. **SingleStoreyT asserts its roof against case 2a's own `expected(p)`**, plus the plate height, on a plan grid
    within `SHELL_TOLERANCE_CM`, together with an empty report. Spec 40's "nothing to clip" premise is dropped. Cures
    F12.
53. **Decision 51 is accepted by the user (2026-11-07)**, who notes that a proposed C++ feature already adds vertices
    to the model, so welding and snapping belong with that work on the C++ side. The prototype's rule stays as
    decision 51 states it. **AMENDED 2026-11-07:** the user has now located the feature. It is "vertices as net slots"
    (Piste Perfect content journal 01, deferred item C30, raised as option A in C28): the grid also stores vertices,
    and a vertex can be a location that fixes a Piece Type in the Grammar. It is not a welding feature. Decision 51
    serves it by making a vertex's identity exact. Decision 58 carries the feature into the prototype.
54. **Open questions go to the user one per turn, each with its own detail** (user, 2026-11-07).
55. **Bridge becomes two fixtures** (user, 2026-11-07), and the spec's fixture roster grows from six to seven.
    - **`Bridge` is the open-ground column case.** Towers `[0,0,200,600]` and `[800,0,1000,600]` over storeys 0 to 2,
      a bridge `[200,0,800,600]` on storey 2, no block, every storey a 30 degree hip. It asserts:
      - no Roof face of storey 0 or storey 1;
      - storey 2's Underside survives over x 200 to 800, area 360000;
      - a `SoffitJunction` along each tower's inner wall (x = 200 and x = 800) at z = 600;
      - a `FloorLine` at z = 300 on each inner wall;
      - a `GroundLine` under each inner wall.
    - **`BridgeOverBlock` is spec decision 38 exactly as written**, block included, with its assertions unchanged.
56. **Each coincidence fixture becomes a clean twin and a degenerate twin** (user, 2026-11-07), and the roster grows
    from seven to nine. Decisions 49 and 50 stand as the clean twins, `Overhang` and `ValleyWings`. The originals are
    kept as **`OverhangApexOnEave`** (spec 37's geometry, storey 0 at 45 degrees) and **`ValleyWingsPierced`** (spec
    39's geometry, 60 degrees, storey 1 at `[650,50,950,350]`). A degenerate twin asserts only spec 32's invariants
    and `cheeks` 0 until its topology is measured. That measured topology is then pinned as its assertion, in the
    same way that defect fixtures are pinned in `@proc-geo/test-fixtures`. A degenerate twin that breaks an invariant
    is a finding, never a waived assertion.

57. **The build is four work packages, dispatched in order, each verified and checkpointed with the user before the
    next is dispatched** (user, 2026-11-07).
    - **WP1 (Opus):** scaffold `apps/building-shell`, copy roof-gable, alias core to source, and land the
      copy-integrity test at 44/6/3/0/0.
    - **WP2 (Opus):** raw parts, tagging, welding and snapping, the union, and the re-tag pass. Spec 32's invariants
      hold on all nine fixtures.
    - **WP3 (Opus):** ShellFace, ShellEdge, convexity, and Cells with their sides. Every fixture's own assertions
      hold, and the export CLI writes them.
    - **WP4 (Sonnet):** the three.js viewer, spec 26 to 30.

    The standing team is Unreal C++ only, so the delegates are `general-purpose` agents with the model set
    explicitly on each dispatch.

58. **The shell exports its vertices as first-class records**, so that the JSON can serve as reference data for C30
    (user, 2026-11-07, when locating the feature):

    ```ts
    interface ShellVertex { id: number; p: Vec3; edges: number[]; cells: number[]; faces: number[] }
    ```

    - **A vertex is every `ShellEdge` endpoint and every Cell corner**, deduplicated by exact equality of its position
      on decision 51's 1/1024 cm grid. That gives every vertex exactly one id.
    - **`ShellEdge` gains `v: [number, number]`**, its two endpoint vertex ids.
    - **`ShellCell` gains `corners: number[]`**, the vertex id of each `polygon` point, in the same order.
    - `BuildingShell` gains `vertices: ShellVertex[]`.
    - **A vertex carries no kind of its own.** The kinds of its incident Edges and the tags of its incident faces are
      enough for a Grammar to fix a Piece Type, and naming vertex kinds is the C++ design's call.
    - Lands in WP3. The viewer gains a vertex toggle and a vertex readout in WP4.

    **AMENDED 2026-11-07 by decision 59**: `ShellVertex.edges` names NetEdges, not ShellEdges.
59. **Vertex incidence is at Cell-side resolution, through a new `NetEdge` record** (from the spec author's review,
    F17, option a):

    ```ts
    interface NetEdge { id: number; kind: EdgeKind; v: [number, number]; cells: number[]; shellEdge: number }
    ```

    - **A NetEdge is the segment between two consecutive vertices along any Cell side.** `cells` holds the one or two
      Cells it borders; it holds one where the far face has no Cells (Ground, Cheek). `shellEdge` is the ShellEdge it
      lies on, or -1 for an interior lattice side. Its `kind` is set by spec decision 25.
    - **Every Cell polygon carries every vertex on its boundary**, including the points where the neighbouring face's
      lattice meets their shared ShellEdge. Each polygon side is then exactly one NetEdge, and coincident sides pair
      one to one, as `FCellNetEdge`'s First/Second Cell and Side do in C++.
    - **`ShellCell.sides` becomes `number[]`, NetEdge ids**, and the kind is read from the NetEdge. This amends
      decision 44's `EdgeKind[]`.
    - `ShellVertex.edges` holds NetEdge ids, and `BuildingShell` gains `netEdges: NetEdge[]`. ShellEdge keeps `v`.
    - **WP3 test:** on `NarrowUpperStorey`, the vertex where storey 0's Gable column line x = 50 crosses the rake, at
      (50, 0, 386.6), lists a `Verge` NetEdge and a `GableVertical` NetEdge.
60. **A vertex's `edges`, `cells` and `faces` are each in cyclic order, counter-clockwise seen from outside**, read from
    the manifold's triangle fan. A Piece seated at a vertex needs a frame, and an unordered set gives none at a saddle
    (F17, point 3).
61. **Spec decision 25 is corrected to the C++ convention: an interior lattice side on a Gable face is
    `GableVertical` or `GableHorizontal`**, not `WallVertical` or `WallHorizontal`. Wall faces keep `WallVertical` and
    `WallHorizontal` (F16).
62. **AMENDED 2026-11-07: WP1's acceptance is provisional until decision 67's reviews return.** The lead accepted it
    on a record check alone, with no independent review, and the user caught that. **WP1 is accepted at
    `da766c4`.** The delegate measured the app at 2/2 and core at 5810/5819 with 9 skipped.
    The lead checked that the record matches the tree: the commit's stat, the test's literal tally, and the diff,
    which is confined to `apps/building-shell/` and the lockfile. Neither figure was re-run.
63. **The pins `manifold-3d` 3.2.1 and `vite` 7.3.7 stand**, as the no-copyleft rule requires (F19). Later packages
    work against manifold-3d 3.2.1's API. A later manifold-3d is taken only once its closure is clean again.
64. **`solveRoofParts` also returns `notes: string[]`, and a piece that `buildPieces` drops as NoPlane is a hard error
    naming the fixture, storey and line.** A gable that no end wall can slope is an authoring error, and dropping it
    silently would let the union build a wrong roof that looks right. Its throw on a skeleton refusal stays, as
    decision 51 rules. The change lands in WP2, which first consumes it.
65. **`ShellReport` gains `newConventions: string[]`**, listing every place where the prototype uses a name in a
    context the C++ net has no precedent for. Today that is `RoofInterior` on Underside faces. `SoffitEdge` and
    `SoffitJunction` stay in `newEdgeKinds` (F20, point 3).
66. **The prototype keeps exact cuts at roof lines**: Cells are cut at hips, valleys and off-lattice ridges, so those
    lines get triangular and sliver partial Cells. The C++ staircase is not copied. Whether the C++ port adopts exact
    cuts is an open item for the user (F20, point 2).
67. **Every work package gets two independent reviews before it is accepted** (prompted by the user, 2026-11-07).
    - A correctness and spec-compliance review: a general-purpose agent on Opus, read-only.
    - A type-discipline review: `typescript-type-reviewer`. The `react-quality-reviewer` would apply only to React
      code, and the viewer is plain three.js.

    The lead dispatches the reviewers and rules on their findings, never the implementer. Reviewers get the commit and
    the spec, not the lead's conclusions. WP1's reviews were dispatched on `da766c4` while WP2 was running.
68. **Rulings on WP1's type review** (`typescript-type-reviewer`, APPROVE, 0 blocking, 4 notes):
    - **N1, an inline return type:** accepted. `solveRoofParts` returns a named, exported `RoofParts`, which carries
      decision 64's `notes`, and spec 9 is amended. Handed to the WP2 delegate, which owns that change.
    - **N2, discarded `notes`:** already ruled as decision 64, in WP2.
    - **N3, no typecheck gate:** accepted. The app gains a `typecheck` script (`tsc --noEmit`) that covers `src`,
      `tests` and both config files. `@types/node` is added after the spec's license check. This lands as a small
      fix after WP2 merges and before WP3 is dispatched, so WP2's lockfile is not contended. From then on, each work
      package's verification includes the typecheck.
    - **N4, the core path declared in both `tsconfig.json` and `vite.config.ts`:** no change. tsconfig cannot import
      it, and the module-identity test convicts a broken vite alias. A broken tsconfig path would surface under N3's
      typecheck. The unused `export` of `CORE_SOURCE` is cosmetic.

## Findings

- **F1. `FaceTag` includes `part`, so coplanar triangles from two parts of one storey never group.** In every gabled
  storey the gable piece's Roof faces lie on the same planes as the hip solid's Roof faces. Under spec 18 they become
  separate ShellFaces split by a flat Roof-Roof edge (a spurious `RoofSeam`, which also cuts Cells), and under spec 15
  every overlap is a listed conflict. Spec 40's "the report is empty" cannot then hold for SingleStoreyT.
- **F2. Spec 20's centroid test misclassifies Overhang's `^` RingJunction as convex.** Storey 1's x = 300 wall is a
  rectangle (y 0 to 600, z 300 to 600) less the triangle under the pyramid, so its centroid is (300, 300, 500). At
  p = (300, 150, 450) on the roof face z = 300 + y, nA ∝ (0, -1, 1): dot(nA, q - p) = -150 + 50 = -100 < 0, so
  "convex", so `Eaves`. The edge is concave. A non-convex face B can put its centroid on the far side of the edge's
  line.
- **F3. Spec 14 orders only Wall and Gable**, and leaves open Roof against Cheek, Underside against Internal, and equal
  kind on equal storey. It could also relabel a surviving Internal triangle as an exterior kind, which would launder
  spec 17's defect counter. No fixture is known to hit this; the rule is incomplete either way.
- **F4. Spec 25 gives Cell sides an Edge kind, but `ShellCell` (spec 23) has no field to hold it, and `EdgeKind` is
  never enumerated.**
- **F5. Spec 8 builds the gable piece by extrusion and trimming, while spec 11 requires every raw part to enter through
  `ofMesh` with `faceID`s from the tag table.** Faces created by a trim carry no tag. Spec 8's "that plane's wall" is
  also ambiguous: `finishBuilding` (model.ts) dedupes planes per component, so one plane can hold several walls.
- **F6. A surviving Cheek is counted (spec 30), drawn, given no Cells (spec 22) and its Edges are Unclassified (spec
  21), but no decision says whether it passes or fails a fixture.**
- **F7. Overhang's storey-0 apex lands exactly on storey 1's eave line, at (300, 300, 600).** `Math.tan(45°)` is
  0.9999999999999999, so the apex is within rounding of the eave, and the topology depends on float32 rounding. Storey
  1's x = 300 wall also pinches into two faces that touch only at that point.
- **F8. ValleyWings' storey-0 ridges (300 + 200·tan 60° = 646.4) stand above storey 1's plate (600).** The lower roof
  pierces storey 1's eaves and makes Roof-Roof concave Valleys between the storeys, which the assertion "every Valley
  that meets storey 1 ends on a RingJunction" does not anticipate. The valley line `x + y = 1000` also passes exactly
  through storey 1's corner (650, 350): a vertex-on-edge coincidence.
- **F9. `@proc-geo/core` resolves to `dist/`** (core's `package.json` `main`, `module` and `exports`). A
  `workspace:*` import alone measures whatever was last built.
- **F10. `solveRoofParts` (spec 9) takes `BOptions`, but no decision fixes them.** algoB.ts names `far: 'plane'` "the
  chosen rule".
- **F11. Two exactness risks the spec does not address.** (a) The hip solid's top is a set of skeleton strip polygons
  from `computeStrips`; adjacent strips must share bitwise-equal vertices with no T-junctions, or `ofMesh` refuses it
  (spec 11 makes that a hard error but gives no welding rule). `solveFaces` can also refuse, and no decision says
  what happens then. (b) The hip Roof and the gable-piece Roof are coplanar but computed separately; in float32 they
  can z-fight into slivers. Spec 17 and spec 32 would catch the result. The spec needs a welding and snapping rule so
  that they do not.
- **F12. Spec 40's premise "a building that has nothing to clip" is false.** Case 2a's union buries the hip faces under
  the gable piece and the gable's foot inside the T's stem. A stronger oracle is in hand: `cases.ts` case 2a's
  `expected(p)` gives the analytic roof height at every plan point.
- **F13. Spec 20's worked examples use a non-unit normal**, though the decision says unit. The upper wall's centroid z
  is 507.7, not 500. Both are cosmetic: the signs are right.
- **F14. Verified as consistent:** NarrowUpperStorey's apex 819.6, Gable area 155884.6 and 95884.6, and Ridge;
  NarrowUpperStoreyGabled's containment (storey 1's gabled roof stays under storey 0's); TallerUpper's 473.2, 415.5 and
  Ridge span; Overhang's areas; Bridge's areas and heights. Every name the spec calls new is absent from
  `EModularEdgeKind`, and every name it calls reused is present. The README's B line sums to 53.
- **F15. The spec's author knows of no C++ vertex-addition feature and found no spec for one** (`pisteperfect-5-7-27`,
  2026-11-07). It searched PistePerfect Notes for vertex addition, insertion, added corners, 1/1024 and quantisation,
  and read the buildables index and modular-building journal 10. The nearest existing mechanisms do something else:
  - `FPathwayNodeHandle` quantises pathway positions onto a 1 cm lattice;
  - the persistence spec's `RehomeModularStroke` handles a removed vertex, not an added one.

  The author agrees that opposite-vertex convexity (decision 42) is right, and raises no objection to decisions 41 to
  57. Decision 53's premise is therefore unlocated, not disproved. **Resolved the same day:** the feature is C30 in
  content journal 01, a branch the spec's author had not read. See decision 58.
- **F16. Piste Perfect's C++ kinds interior Gable lattice sides `GableVertical` and `GableHorizontal`.**
  `ModularRoofNet.cpp:144` and `:152` set them on the Edges between neighbouring gable Cells, and the seam steps at
  `:679` to `:682` do the same. Spec 25 gave every interior side of a Wall or Gable face `WallVertical` or
  `WallHorizontal`.
- **F17. The spec author's review of decision 58** (`pisteperfect-5-7-27`, 2026-11-07, after reading content journal
  01's C28 to C30):
  - It agrees with "no vertex kind".
  - **ShellEdge-endpoint incidence misses the case vertices exist for.** C28's bracket seat is where a Cell column
    line crosses the gable rake. That point is a Cell corner in the middle of a Verge ShellEdge, so under decision 58
    it lists no Verge at all.
  - It offered (a) Cell-side incidence, which matches C++ `FCellNetEdge`, and recommended it, or (b) an `onEdges[]`
    field. Decision 59 takes (a).
  - It suggests cyclic order around the vertex as cheap now and costly later. Decision 60 takes it.
  - None of this blocks WP3 except the incidence point.
- **F18. The copy-integrity tally cannot detect a broken alias today**, because core's current `dist/` behaves the same
  as its source. The WP1 delegate showed the tally still passes with the alias emptied. Only the module-identity test
  (`solveSkeleton` through the alias `toBe` the source's) guards the alias, and the same run convicted it by mutation.
- **F19. Two copyleft chains block the latest releases.** Every `manifold-3d` from 3.3.0 on pulls LGPL-3.0
  `@img/sharp-libvips*` through `@gltf-transform/functions`, then `ndarray-pixels`, then `sharp`. `vite` 8 depends
  hard on MPL-2.0 `lightningcss`. The app's closure at the pinned versions is 96 packages, all MIT, Apache-2.0, ISC or
  BSD-3-Clause, per the WP1 delegate's lockfile walk against registry license fields.
- **F20. The C++ net's edge kinds against spec 21 and 25** (`pisteperfect-5-7-27`, 2026-11-07, reading
  `CellNetEdges.cpp` and `ModularRoofNet.cpp` on `feature/modular-building-content-and-net`). The rake-seat vertex
  (50, 0, 386.6) is confirmed.
  - **These agree:**
    - `WallHorizontal` within a storey, `FloorLine` across storeys (`CellNetEdges.cpp:250`);
    - `WallVertical` between coplanar walls (`:265-266`);
    - `Eaves` versus `RingJunction` for a wall against a roof (`:286`);
    - one-Cell Edges, such as `GroundLine` (`:299-313`).
  - **Three diverge because the models differ:**
    1. **Two Rings' walls meeting at an angle are `RingJunction` in C++** (`:266`). The prototype unions Rings per
       storey, so Ring identity is gone and the corner is `ExternalCorner` or `InternalCorner`. The author prefers
       the prototype's reading, but calls it the user's decision.
    2. **C++ roof Cells are whole plan squares.** A Ridge snaps to the nearest Cell line, and Hip and Valley are a
       staircase of whole-Cell sides (`ModularRoofNet.cpp:217-271`). The prototype cuts Cells exactly at the line.
       A hip Piece over triangular half-Cells is not one over a staircase, so this matters for the port and for
       content.
    3. **Underside has no C++ precedent.** The C++ net has no underside Cells (exterior-manifold spec decision 13), and
       it leaves an overhang's rim without Edges (the comment at `CellNetEdges.cpp:300-302`).
