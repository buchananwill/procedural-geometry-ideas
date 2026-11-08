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
- **`pnpm --filter @proc-geo/building-shell test -- viewer` does not filter.** It runs the whole suite. For the viewer
  alone, use `pnpm --filter @proc-geo/building-shell exec vitest run viewer`.
- **Agents running a browser serve a `git archive` snapshot extracted into a new scratch folder**, never the live
  tree, which holds other agents' uncommitted work. Each uses only tabs it opened itself. The `:5199` tab belongs to
  another session.
- **The spec's author is the Claude session `pisteperfect-5-7-27`**, which confirmed it on 2026-11-07. Confer with it
  by cross-session message on anything that touches the C++ project.
- **The C++ port's arc lead is the Claude session `pisteperfect-5-7-4f`** (contact made 2026-11-08). It cannot read
  this repo, so send it essentials as text. It was sent a handover: location, the spec as the contract, the export as
  oracle, answers on clipping, straddling Cells and soffits, and the lessons for the port. It was promised a message
  when the pipeline is port-ready, and asked for the Ring layouts of its two in-game regressions (MB.D486) so they
  can become fixtures.

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
   delegate stops if it does not. When it returns, it gets decision 67's two reviews before acceptance. While it ran,
   it was handed decision 68's `RoofParts` naming and decision 69's test that the parts agree with `runB`.
   **Returned at `2ec9e98` (decision 71). Reviews are in (decisions 72 and 73). WP2.1 dispatched to the same delegate
   at `07981cd`.** When WP2.1 returns, its fix diff goes back to both reviewers for a targeted re-review before WP2 is
   accepted.
   **WP2 accepted at `3fbc6de` (decision 82).**
6. **Pre-WP3 batch: WP1.1 plus decision 82's two items, dispatched 2026-11-07.** WP1.1 is: decision 68's typecheck script with `@types/node`, plus decision 69's
   per-case verdict pin and its vite-alias test. It covers raw parts, tagging (decision 45), welding and snapping (decision 51), the
   union, and the re-tag pass (decisions 43 and 41). It also carries decision 64's `notes` change and spec 32's
   invariants on all nine fixtures.

### In flight at 2026-11-08 sign-off (for a compacted or fresh context)

The user signed off for the night, and the lead's context was compacted afterwards. **Use `ListAgents` to find the
running subagents.** Their reports arrive as notifications.

**Running:**
- **WP3.6** (general-purpose, Opus, fresh).
  - Its brief: courtyards (decision 115), Ring forms (decision 116 and its addenda), F43's Cell-existence rule with the
    three 270 cm regressions enrolled, and decision 107's N10/N11 leftovers.
  - Addendum 1: decision 120's type items.
  - Addendum 2: decision 121's four port-regression fixtures.
  - When it returns: decision 67's two reviews, on fresh reviewers. The previous ones have full contexts.

**Queued, in order:**
- **WP3.7**, after WP3.6 lands (decisions 122 and 123): pillow removal, vertex clustering, holed Cells, 3D vertex
  identity, the exact straddle check, Hausdorff loop checks, a move bound, and spec 16's constants. Its gate is fresh
  seeds 5 to 12 at 250, 263 and 300 cm, plus δ-nudges. **After WP3.7, fresh failures are enrolled, not chased.**
- **WP5**, the wire format (decisions 124 to 126): it starts after WP3.6 and may run alongside WP3.7, since it only adds
  new files. It builds the ingestion folder and the diff tool against a hand-written stand-in schema until the UE
  Zod file exists.

**Waiting on the C++ port lead (`pisteperfect-5-7-4f`):**
- the Zod generator's details (version, mappings, output path, versioning conventions);
- whether the C++ conflict rule keys on model index or root order;
- the C++-to-prototype structure mapping from its read-only comparison.

**Promised:** a message to the port lead when the pipeline is port-ready, after WP3.6 and WP3.7 have landed and been
reviewed. It must include the measured residual fresh-input failure rate.

**The branch is red on nothing committed.** The 3 F43 tests at `3575aa7` are WP3.6's to turn green.

## 5. Open items

- ~~**Bridge (spec decision 38).**~~ Closed by decision 55.
- ~~**Fixture corrections in decisions 49 and 50.**~~ Closed by decision 56.
- ~~**What a surviving Cheek is (F32).**~~ Closed by decision 77.
- ~~**Roof lines in the C++ port: exact cut or staircase (F20, point 2).**~~ Closed by decision 89: exact cuts.
- ~~**Corners between two Rings (F20, point 1).**~~ Closed by decision 90: named by geometry.
- **Unsolved problems the C++ port inherits** (the user asked on 2026-11-07; the lead's inventory):
  - **Courtyards.** A storey plan with a hole is refused. Roof-gable needs a cut to roof one, and up to 4 Rings can
    enclose one, so content can reach this.
  - **Roof forms per union wall, not per Ring** (spec §3 deferred). The rule for a wall run merged from several Rings
    is undecided.
  - **Roof-gable algorithm B's measured defects** are inherited unchanged: 3 FAIL (7g to 7i, all mixed pitch) and 6
    CHEEK.
  - **A straight-skeleton refusal is a hard error with no fallback.** The risk lives in mixed-pitch weights.
  - **No sliver-Cell policy.** Exact cuts keep partial Cells down to 1e-4 cm², with no merge rule or minimum size for
    content.
  - **Edge-table pairs that would be `Unclassified`** if they ever arose: Roof–Underside, Gable–Underside, and sloped
    flat Gable–Gable. None has been seen yet.
  - **The cleaning tolerance was measured on manifold-3d's float32 output.** It must be re-measured on whichever C++
    boolean is chosen, by decision 109's sweeps, with this prototype as the oracle.
  - **Divergences listed in `newConventions`:** roof-line cuts, Underside Cells, the Cheek kind, inward-corner naming,
    and C30 vertex slots.
  - **"Builds on any valid union" is unproven until WP3.4 and WP3.5 land** and fresh seeds pass.
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
66. **RESTORED 2026-11-07 by decision 89**, after decision 87 had struck it the same day. **The prototype keeps
    exact cuts at roof lines**: Cells are cut at hips, valleys and off-lattice ridges, so those
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
69. **Rulings on WP1's correctness review** (general-purpose, Opus, on `da766c4`). It found the copies byte-identical
    or allowed, and the tally equal to `run.ts`'s. It re-ran the app's tests (2/2) on a tree it showed unchanged from
    the commit.
    - **Discarded `notes` (rated High):** already decision 64. Its amendment postdates `da766c4`, so this is no WP1
      defect; WP2 delivers it.
    - **`solveRoofParts` re-types `runB`'s logic, with no test that they agree (Medium):** accepted. WP2 adds a test
      for every hole-free `CASES` entry: the union of that storey's raw parts has top-surface height
      `runB(b).eval(p).h + plate` on a plan grid inside the footprint. The test is convicted by mutating `1 / w.tan`.
      Handed to the WP2 delegate. This ties the shell's parts to roof-gable's own answer, not to the README's counts.
    - **The tally compares counts only (Medium):** accepted in part. The test pins the per-case B verdict for all 53
      cases. The verdicts are captured by running roof-gable's own `run.ts` read-only at `f7b6091`, and the counts
      assertion stays. Drift in code the shell never runs (`transformBuilding`, `buildCourtyard`, the
      `contact`/`ridge` branches, `compareSurfaces`) is out of scope. Spec 31's claim is narrowed to "drift on the
      path the shell uses".
    - **The alias test only observes vitest (Low):** accepted. A test asserts that `vite.config.ts` holds the alias
      and that `vitest.config.ts` defines none of its own.
    - **`src/constants.ts` is missing from the roster (Low):** the roster gains it.
    - The per-case verdicts and the alias test land with decision 68's typecheck as **WP1.1**, after WP2 merges and
      before WP3.
    - **WP1 is accepted at `da766c4`**, which lifts decision 62's provisional status. The open follow-ups are all
      named here.
70. **The roster is ten fixtures, not nine** (F21). Decisions 55 and 56 counted wrong, and the spec's preamble is
    corrected. The ten are:
    - NarrowUpperStorey and NarrowUpperStoreyGabled;
    - TallerUpper;
    - Overhang and OverhangApexOnEave;
    - Bridge and BridgeOverBlock;
    - ValleyWings and ValleyWingsPierced;
    - SingleStoreyT.
71. **WP2 returned at `2ec9e98`, 110/110, `tsc --noEmit` clean, per the delegate.** It is not accepted until decision
    67's two reviews return; both were dispatched on `2ec9e98`.
    - `src/manifold.ts`, the single WASM loader, joins the roster.
    - Rule on the NoPlane hard error once the reviews are in: it matches the substring `': NoPlane,'` in the frozen
      `buildPieces`' note text.
72. **Rulings on WP2's type review** (`typescript-type-reviewer`, REQUEST CHANGES, 6 blocking, 6 notes, on
    `2ec9e98`). None of the findings touches a shape the spec fixes.
    - **B1 to B6 are all accepted:**
      - named result types for `weldAndSnap`, `unionParts`, `retagPass` and the `Pick`s, each derived from
        `ShellUnion` where its fields come from there;
      - named `RawTriEdge` and `Deletable`;
      - `Vec3` and named index tuples instead of written-out tuples, with the redundant `triangulate` cast removed;
      - `Rect[]` and `Sel[]` in the tests, with no casts;
      - `ErrorStatus` instead of `string`;
      - one `errorMessage(e: unknown)` helper at every catch site.
    - **N1 to N4 are accepted:**
      - `RetaggableKind = Exclude<ShellKind, 'Internal'>`, with a completeness-checked rank table;
      - the module-private types exported, and the repeated `Omit`s named;
      - explicit return types on `storeyRects` and `makeShellTags`;
      - named failures instead of `!` in the tests.
    - **N5:** the canonical `Vec3` is manifold-3d's, re-exported from `tags.ts`, so there is one definition.
    - **N6, a rejected WASM load cached forever:** no change. It is a dev tool, and a failed load is fatal anyway.
    - These fixes form **WP2.1**, together with any accepted findings from the correctness review. WP2 is accepted only
      after WP2.1 is verified.
73. **Rulings on WP2's correctness review** (general-purpose, Opus, on `2ec9e98`). It found no blocking defect, and it
    re-ran 110/110 on a tree it showed equal to the commit. All accepted findings go into WP2.1.
    - **Positive controls (Medium), accepted.**
      - `cheeks` is pinned per case in the 49-case agreement test, as measured. The delegate reports the cross-table
        of union Cheeks against roof-gable's per-case B verdict (F27).
      - A test omits the hip solid and asserts `survivingInternal > 0`.
    - **The footprint trim and the bbox cap are never exercised (Medium-Low), accepted.** A constructed storey whose
      gable band leaves its island's footprint is asserted and convicted by deleting `intersect(foot)`. The bbox cap
      gets the same treatment.
    - **"Closed" adds nothing beyond Manifold's status (Low), accepted and strengthened.** Each fixture asserts its
      expected genus: 1 for `Bridge` and `BridgeOverBlock`, which each have a tunnel under the bridge, open at both
      y faces, and 0 for the other clean fixtures. The degenerate twins' genus is measured, then pinned. The dead
      merge-vector code goes.
    - **Re-tag containment slack of 0.01 cm (Low), accepted.** It could launder a thin Cheek into Wall. The slack
      becomes its own named constant, `RETAG_SLACK_CM = 1e-3`, which is above float32 noise (about 1e-4) and below
      the 0.01 tolerance. Spec 16 is amended to name it. A unit test convicts setting it to 0 and setting it to 0.01.
    - **The gable piece drops silently when it is empty or `H <= tol` (Low), accepted.** This is a hard error naming
      the fixture, storey and line, by decision 64's reasoning.
    - **`onEdge` can return the triangle's own third vertex (Low), accepted.** A sliver whose third vertex lies on
      its own opposite edge is dropped, not split. A unit test covers it.
    - **Gable-piece tagging picks the nearest plane by normal sign alone (Low), accepted.** A triangle first matches
      generating planes whose normal agrees within 1e-5, then the nearest offset. Two candidates tying within
      tolerance is a hard error.
    - **NoPlane matched by substring (Low), accepted.** Any `solveRoofParts` note is a hard error, because notes are
      produced only on a drop.
    - **A lone `cut` wall silently becomes a hip (Low), accepted.** Any `cut` form in a shell storey is a hard error,
      because courtyards are deferred.
    - **The `1e-9` area threshold:** derived from `SHELL_TOLERANCE_CM²`. `cheeks` counts Cheek identities with area
      above `SHELL_TOLERANCE_CM²`.
    - **The case-count floor:** exactly 49, not `> 40`.
    - **A manifold leak when `partManifold` throws:** freed in a `finally`.
    - **Interpretations accepted as rulings:**
      - A Cheek carries its piece's wall.
      - Equal kind and storey falls to the lower wall id, then the lower plane id.
      - The tests keep their own assertion tolerances.
    - **The spec still said "All nine" (Low):** already corrected in `6555588`. The reviewer read an earlier text.
    - **AMENDED 2026-11-07 by decision 74:** Bridge's genus is 0, not 1.
74. **Bridge's genus is 0, and the lead's "1" is STRUCK** (F28). The open-ground towers and bridge form a ∏, which is
    open at z = 0 as well as at both y faces, so it is topologically a ball. Only BridgeOverBlock's block closes the
    loop, giving genus 1. The delegate measured this and kept the wrong expectation as an `it.fails` test, as
    briefed. It now becomes a plain assertion of 0. Spec 32 is amended.
75. **A gable piece's face on any island wall line is tagged `Gable` with that wall; `Cheek` is only a face on no wall
    line.** This amends spec 8, which tagged every face other than the piece's own wall line as Cheek. A monopitch's
    vertical face on its dead high-end wall, as in cases 5a to 5e (F29), is a genuine exterior face standing on a
    wall line. It is no artefact. Tagging it Cheek made a B PASS look like a defect. The per-case `cheeks` pins are
    re-measured after the change.
76. **WP2.1 (`ee32857`) is accepted subject to WP2.2, which carries decisions 74 and 75.** These interpretations stand
    as rulings:
    - gable tagging runs on Manifold's mesh before the weld and snap, and the `faceID`s are carried through the weld
      (F30);
    - `RETAG_SLACK_CM` lives in `union.ts`, `errorMessage` in `storey.ts`, and the plane predicates in `tags.ts`;
    - the footprint and bbox tests use a hand-made `Piece`.

    After WP2.2, the WP2.1 and WP2.2 diff goes to both reviewers for a targeted re-review.
77. **A surviving Cheek is a legitimate face of its own kind, with Cells** (user, 2026-11-07, choosing over "Cheek
    is a Gable" and "Cheek stays a defect"). It amends spec 21, 22, 25 and 32, and decision 46. The amendments land
    in WP3.
    - **Cells:** a Cheek face is laid in `(u, z)` exactly as a Gable face (spec 22). Its interior lattice sides are
      `GableVertical` and `GableHorizontal` (spec 25).
    - **Edges:** for the edge table (spec 21), a Cheek reads as a Gable. Every row that names Gable applies to Cheek
      in Gable's place, and a Cheek against a Gable reads as Gable against Gable. The face keeps its own `ShellKind`,
      so reports and the viewer can tell a cheek from a wall-line Gable.
    - **Fixtures:** decision 46's "every fixture asserts `cheeks` is 0" is STRUCK. `cheeks` is information. Each
      fixture and case pins its measured count, which is 0 for all ten fixtures and 1 for cases 2b, 4b and 8b.
    - **Report:** `newConventions` lists `Cheek`, because the C++ makes a cheek a Gable over no run
      (`AddCheekGable`, F32).
78. **WP2.2 returned at `9d90583`, 131/131, `tsc --noEmit` clean**, per the delegate. Both gates convicted:
    - with the old wall-line rule restored, exactly the 5a to 5e pins fail;
    - with a wrong genus expectation on Overhang or Bridge, that fixture's genus test fails.

    The delegate's interpretation stands as a ruling: collinear walls share one Gable plane, and a face on that line
    takes the piece's own wall when it is on the piece's line, otherwise the first wall in ring order. The
    `2ec9e98..9d90583` diff goes to both reviewers for a targeted re-review.
79. **Rulings on the type re-review of `2ec9e98..9d90583`** (REQUEST CHANGES). B1 to B6 and N1 to N5 are all fixed,
    and the reviewer typechecked them clean.
    - **B7, a type declared inside a test's `it` callback (`AxisPlane`):** accepted. Hoist it to module scope.
    - **N7, an orphaned doc comment above `splitByY0`:** accepted.
    - **N8, the generic `errorMessage` living in `storey.ts`:** accepted now rather than later, because WP3's modules
      will need it too. It moves to `src/errors.ts`, which joins the roster.

    These join any accepted correctness re-review findings as **WP2.3**.
80. **Rulings on the correctness re-review of `2ec9e98..9d90583`.** Every accepted finding is fixed as ruled. The
    reviewer re-ran 131/131 on a tree it showed equal to `9d90583`. F30's faceID carriage through the weld is
    sound.
    - **N1 (Medium), accepted: decision 75 is AMENDED.** "Wall line" means the wall, not its infinite plane (F34).
      - A gable-piece face is Gable on its own wall over the piece's whole band `[bandLo, bandHi]`, because the line
        is promoted across its extent. Case 2a's gable over the T's stem is the example.
      - It is Gable on any other island wall only where it stands within that wall's own span.
      - Everywhere else on such a plane it is Cheek.
      - A triangle that straddles a span end must not be classified by its centroid. The face is divided at the span
        end.
      - Pin: the reviewer's U case reports `cheeks` 1, with a Cheek on x = 200.
    - **N2 (Low), accepted.** A gable-piece triangle matches a generating plane when all three vertices lie within
      `SHELL_TOLERANCE_CM` of it and its normal points the plane's way. The 1e-5 normal bound is dropped: on
      float32 noise it falsely rejects triangles under about 6 cm altitude. Two planes both matching is a hard
      error. Each error path gets a test.
    - **N3, the bbox cap's value cannot be observed:** no change. The cap guards against `Infinity`, which its test
      convicts.
    - **N4 (Low), accepted.** A test with a piece on the later of two collinear walls pins "own wall first".
    - **N5:** `gablePiece` frees `live` in a `finally`.
    - **WP2.3 carries decisions 79 and 80.** Its check is that one reviewer, the correctness reviewer, re-reads the
      WP2.3 diff for N1, N2 and N4, and that the delegate shows `tsc --noEmit` clean. Decision 79's type items are
      mechanical, so the type reviewer is not recalled. **WP2 is accepted when that check passes.**
81. **WP2.3 returned at `3fbc6de`, 137/137, `tsc --noEmit` clean**, per the delegate. No fixture and no case pin
    moved.
    - The U pins `cheeks` 1: a 30000 cm² Cheek on x = 200 above the spine's hip. The arm wall's Gable is 60000 cm²,
      on its own span only.
    - Gate 1 convicted: with plane-only matching restored, the U reads 0. Gate 2 convicted: with the own-wall order
      swapped, the N4 test fails.
    - The delegate's interpretations stand pending the check:
      - zone ends are inclusive within tolerance;
      - band-end and far-side planes hold Gable zones where they lie on a wall line;
      - triangles under the area floor match by offset only.
    - The correctness reviewer's targeted check of `8f7fb86..3fbc6de` is dispatched.
82. **WP2 is accepted at `3fbc6de`.** The final check found N1, N2 and N4 fixed as ruled, with no crack, sliver or
    misplaced faceID. It probed the split path over SingleStoreyT, 11 cases and stress inputs, all NoError, closed
    and genus 0. Its three new Low findings:
    - **The span-end division is never shown to change a tag:** accepted. A test has one triangle crossing a wall's
      span end on a band-end or far-side plane, and is convicted by deleting the split loop.
    - **Opposite gables across collinear walls report conflicts on an ordinary gabled box:** accepted. On a plane
      that is any piece's own promoted line, every gable piece of the storey takes that piece's own-wall zone over
      its band, ahead of span zones. One face then has one identity, whichever piece made it. Pin: the reviewer's
      three-rect box, gabled at y = 0 and y = 300 at 50°, has 0 conflicts. Spec 8's text already implies this; the
      ruling makes it storey-wide.
    - **Dropping the normal bound widens tie errors to crease slivers under about 0.02 cm:** no change. The failure
      is loud, and none occurs in any fixture, case or stress input.

    These two items join WP1.1 as one **pre-WP3 batch**, given to the WP2 delegate. Their check is the correctness
    reviewer re-reading that diff, plus the new typecheck gate.
83. **The pre-WP3 batch returned at `c7d674f`, 142/142, `typecheck` clean**, per the delegate. All four gates
    convicted: deleting the split loop, restoring per-piece zones, breaking the alias in `vite.config.ts` only, and
    swapping 2a's and 2b's verdicts.
    - **Roof-gable's own `run.ts` reproduced the README's B line at `f7b6091`**, and its 53 verdicts are pinned:
      CHEEK on 2b, 2d, 3c, 4b, 4l and 8b; FAIL on 7g, 7h and 7i; PASS on the other 44.
    - **`@types/node` is pinned at 22.12.0, not the workspace's 20.19.33**, because vitest 5.0.5's peer range
      requires `^22.0.0` or later. It and `undici-types` 6.20.0 are both MIT.
    - Storey-wide own-wall zones are scoped to one island.
    - The correctness reviewer's targeted check is dispatched.
84. **The user gave the go for WP3 (2026-11-07), to dispatch once decision 83's check passes.** The two C++ open
    items, roof-line staircase and cross-Ring corners, stay open; neither changes WP3.
    - WP3 goes to a fresh Opus delegate. The WP2 delegate's context is past 450k tokens, and WP3's surface is new.
85. **The pre-WP3 batch is accepted at `c7d674f`.** The correctness reviewer's check found:
    - the 53-verdict pin equals roof-gable's committed `roof-prototype.html` case for case;
    - the storey-wide zones are as ruled, and a face cannot take an identity from a piece whose band misses it;
    - `typecheck` covers both config files against `@types/node` 22.12.0.

    Its findings:
    - **The span-end split is unit-tested only through `divideAtZoneEnds`, not through `gablePiece` (Low):**
      accepted, and it goes to WP3. An end-to-end test through `buildStoreyParts` uses a hand-made `Piece` whose
      band-end face Manifold leaves unvertexed at a span end, and asserts the tagged areas on each side.
    - **The alias "not redefined" test would pass if `vitest.config.ts` stopped merging and declared an identical
      alias:** no change. It is cosmetic while the two arrays are identical.
    - **The results page's commit predates roof-gable's last source commit by 44 minutes:** noted. The delegate's
      live run of `run.ts` on current source produced the same verdicts, so the pin stands on that run.
86. **WP3 dispatched 2026-11-07** (general-purpose, Opus, fresh) at `0636dd0`. It delivers step 4: ShellFaces,
    ShellEdges, NetEdges, vertices, Cells, `buildShell`, the export CLI, and every fixture's own assertions.
    Decision 67's two reviews follow its return.
87. **STRUCK AND REVERSED 2026-11-07 by decision 89** (the user reverted it). **Roof lines follow the C++ net in every
    respect** (user, 2026-11-07): "For 1, follow the C++ in all respects.
    Any changes can be considered once the prototype has a viewport I can inspect."
    - **Roof Cells:** whole 50 cm plan squares, each assigned to one roof face.
    - **Hips and valleys:** a staircase of whole-Cell sides between squares of different faces.
    - **Ridges:** snapped to the nearest Cell line.
    - **What stays exact:** the manifold's ShellFaces and ShellEdges. Only the Cell net, meaning the Cells,
      NetEdges and vertices on Roof faces, staircases.
    - **Exact rules are pending.** The assignment, snapping and kind rules come from the C++ source, by way of the spec
      author (asked 2026-11-07). The spec's decisions 22 to 24 and 32 ("every Cell's polygon lies on its face") are
      amended once those rules are in hand.
    - **WP3 was told mid-run** to hold roof-Cell work and continue everything else.
    - **Any departure from the C++ waits until WP4's viewer exists for the user to inspect.**
    - **The cross-Ring corner question** (F20, point 1) is still open. This ruling does not cover it.
88. **STRUCK 2026-11-07 by decision 89**, with its spec 22 and 32 amendments removed from the spec. **The prototype's
    roof-Cell rule is spec 22's amendment, transcribed from the C++** (F35). Where the C++ depends
    on Ring identity, the prototype substitutes its own rule:
    - **Which squares are roof Cells:** storey N's footprint minus storey N+1's. This equals the C++ for
      lattice-aligned Rings.
    - **Assignment ties:** the lower canonical plane id. The C++ uses PlateRun order.
    - **Eaves versus RingJunction:** by the storey's plate. The C++ reads a Ring's top row.

    There are also prototype conventions with no C++ precedent:
    - a square partly buried by the union is kept;
    - each roof Cell's polygon is its plan square at plate height. The C++ never lifts a square, and the viewer may
      draw squares lifted onto their faces' planes.

    Spec 32's "every Cell lies on its face" is amended for Roof Cells. Gables, Walls, Cheeks and Undersides stay
    exact: decision 87's ruling covers roof lines only.
89. **The prototype is a clean-room design, and the C++ is not a constraint** (user, 2026-11-07, reverting decision
    87): "Maybe I should just let you 'clean room' this and not be saddled with the bad decisions C++ has. That was
    half the initial point. I revert my previous ruling. Do whatever is cleanest and most logical in all cases, to
    produce the _desired_ manifold clipping prototype. Don't let the C++ force you to do something that is obviously
    limiting."
    - **Exact roof cuts stand** (decision 66 restored, decisions 87 and 88 struck). Spec 22, 32 and 33 are back to
      exact cuts. WP3 was told mid-run to lift its hold.
    - **The C++ is read for vocabulary and as a point of comparison only.** Every C++-driven ruling was re-examined.
      Each of these stands on its own merits, not because the C++ does it:
      - decision 59, NetEdges pairing one to one: each side is exactly one edge between at most two Cells;
      - decision 61, `GableVertical` and `GableHorizontal` inside Gable faces: a lattice line inside a gable is a
        gable line;
      - decision 75, wall-line faces as Gable: a face standing on a wall is that wall's face;
      - spec 21's reuse of `EModularEdgeKind` names, which keeps the vocabulary the content uses.
    - **`newConventions`** (decision 65) stays, now as a list of where the prototype differs from the C++, kept for
      the port.
    - **F35 stays as a record** of what the C++ does.
90. **A corner between two Rings is named by its geometry: `ExternalCorner` or `InternalCorner`, never
    `RingJunction`** (F20, point 1, ruled under decision 89). There are three reasons:
    - the four-step model drops Ring identity at the union;
    - one building shape must give the same edges however it was split into Rings;
    - `RingJunction` already names the roof-against-upper-wall line, so one kind would cover two geometrically
      different things.

    The report's `newConventions` lists the difference for the port.
91. **WP3 returned at `1f28bc6`: 392/392, `typecheck` clean, all ten fixtures' assertions passing**, per the
    delegate.
    - **The export:** the CLI writes ten `out/<fixture>.json` files, each deep-equal to `buildShell` run in vitest.
      `out/` is gitignored, since the JSON is regenerated rather than committed.
    - **Gates:** all six named gates convicted, as did one mutation per fixture.
    - **Not accepted yet:** decision 67's two reviews are dispatched on `8c5d752..1f28bc6`, to fresh reviewers.
92. **"The report is empty" (spec 40) means that no defect field is set.** `conflicts`, `survivingInternal`,
    `unclassifiedEdges`, `cheeks` and `newEdgeKinds` are empty or 0. `partialCells` and `newConventions` are
    information and are pinned as measured. Exact roof cuts give SingleStoreyT 42 partial Cells, and its two
    InternalCorners list decision 90's convention, so a literal "empty" could not hold. Spec 40 is amended. The
    delegate's other interpretations stand as rulings:
    - `whole` is judged on the Cell's area in its own lattice plane;
    - a lattice square split by a face gives one Cell per piece, and a square that contains a hole of its face is a
      hard error;
    - convexity reads `q` from the run's manifold edge furthest from A's plane;
    - a flat sloped Gable–Gable edge is `Unclassified`;
    - `ShellFace.area` comes from its loops.
93. **WP4 is dispatched while WP3's reviews run** (user, 2026-11-07). The overlap is safe for these reasons:
    - The viewer reads `BuildingShell`, whose shapes the spec fixes, so a WP3 review fix is unlikely to touch it.
    - WP4 owns only `apps/building-shell/index.html`, `src/viewer/`, its tests and the `dev` script. A change it
      needs elsewhere in `src/` is a stop and a report, never an edit, so it cannot collide with WP3 fixes.
    - **The delegate is general-purpose on Sonnet**, as decision 57 set: the viewer is low-risk front-end work.
    - **When it returns**, it gets decision 67's two reviews. The correctness review checks the viewer against
      spec 26 to 30 in a real browser.
94. **Rulings on WP3's type review** (REQUEST CHANGES, 7 blocking, 4 notes, on `8c5d752..1f28bc6`):
    - **B1, `newEdgeKinds: EdgeKind[]` against the spec's `string[]`:** the code is right. Spec 33 is amended to
      `EdgeKind[]`; the narrower type costs nothing in the JSON. The lead owns the spec, and the clean-room ruling
      (decision 89) favours the precise type.
    - **B2 to B7, accepted:**
      - name `UnionFind`;
      - hoist `EdgeCrossing`, `SidePoint` and `CellRun`, and drop the casts;
      - export `BoundaryPoint`, typing the test with it and `FaceFrame`;
      - type the `classifyEdge` test helper from `EdgeShape` and `EdgeGeometry`;
      - add `ReportPin` by `Pick`;
      - name `ShellBuilder`.
    - **N1, accepted:** `FrameTable`.
    - **N2, accepted:** one exported vector module (`dot3`, `cross3`, `sub3`) replaces the private copies in
      `faces.ts`, `edges.ts` and `union.ts`. This is a behaviour-neutral change to WP2's `union.ts`.
    - **N3, accepted:** parsed JSON goes through `unknown`.
    - **N4, sequential builds in a test:** no change.
    - These make up **WP3.1**, together with any accepted findings from the correctness review.
95. **WP4 returned at `def8c95`, 426/426, `typecheck` clean**, per the delegate.
    - **Browser sweep:** the delegate ran all ten fixtures in Chromium. Each built and rendered, the page's report
      matched `out/<fixture>.json`, the legend covered every kind in use, and the console was clean. Hover, pin,
      every toggle and raw mode were exercised. The colour-completeness test was convicted by mutation.
    - **What the lead checked:** the NarrowUpperStorey screenshot, by eye. It shows the Ridge, the upper Wall flush
      on the Gable with a FloorLine between them, WallPlates either side, partial Cells along the rake and hip, and
      zero defect rows.
    - **Its interpretations stand pending review:**
      - it uses `buildShellDetailed`, for the raw parts and the triangle-to-face map;
      - storey membership comes from the face's tag;
      - hover priority is vertex, then Edge, then face;
      - raw `Internal` faces are grey, because they are removed;
      - the defect rows are always listed.
    - **The WASM fix moves to `vite.config.ts`:** `optimizeDeps: {exclude: ['manifold-3d']}` goes there, `dev` goes
      back to plain `vite`, and `src/viewer/vite.viewer.config.ts` is removed. One config serves dev, test and
      export, and a second config only for dev is a trap. This is a WP4.1 item.
    - Decision 67's two reviews are dispatched on `bc35eff..def8c95`.
96. **Rulings on WP3's correctness review** (fresh Opus, on `8c5d752..1f28bc6`). It found convexity, the table,
    Cells, pairing, vertex identity and cyclic order correct over all ten fixtures, with the export deterministic.
    It ran 392/392 before WP4's files appeared.
    - **F1 (Medium-high), accepted.** A ShellEdge endpoint lying inside another face's ShellEdge (a T-point) is
      missing from `edgePoints`, so `buildShell` throws on a valid shell. Storey 1 at `[30,70,70,170]` on storey 0's
      45° hip reproduces it. Every registered ShellEdge endpoint inside an edge becomes one of that edge's boundary
      points. The reproducer becomes a test.
    - **F2 (Medium-low), accepted.** A hole that touches its face's outer loop is stored as one self-touching loop,
      and the area still checks out. Loops are split at every touching vertex into simple loops, outer first. A test
      checks the on-lattice twin, storey 1 at `[50,100,100,200]`, loop by loop.
    - **F3 (Low), accepted.** A face meeting a vertex twice is no longer a hard error. The vertex's cyclic lists
      follow the triangle fan and may name that face twice.
    - **F4 (Medium, test gap), accepted.** Every Cell's `lattice` index, on both axes and on partial Cells, is
      asserted independently from its polygon.
    - **F5 (Low), accepted.** `newConventions` records the exact roof cut whenever a Roof Cell is cut by a Hip,
      Valley or Ridge ShellEdge: "Roof lines cut exactly (C++: staircase)". The `newConventions` pins move with it.
    - **F6 (Medium, spec tension), accepted, and decision 41 is AMENDED.** The identity of a Wall, Gable or Cheek face
      is `(kind, storey, oriented vertical plane)`. `wall` becomes provenance only, as `part` is.
      - The traced outline keeps collinear Ring corners, so collinear walls had distinct wall ids. Bridge's storey 2
        then split into 31 faces with spurious flat `WallVertical` edges, against 27 faces as one Ring.
      - Keying by plane makes the shell independent of how the plan was split into Rings, which is decision 90's
        stated reason.
      - Faces on one plane that are not edge-connected stay separate under spec 18.
      - The fixture pins that move are re-measured. A test asserts that Bridge built from 3 Rings equals Bridge built
        as 1 Ring, face for face and Edge for Edge.
    - **F7, a non-vertical surviving Cheek throws:** no change. It is latent, and it fails loud, not silent.
    - **F8 (Low), accepted.** Spec 39's "no storey-0 Roof meets a storey-1 Roof" covers a shared vertex as well as a
      shared Edge.
    - **WP3.1 is these items plus decision 94's type items.** It goes to the WP3 delegate. The two reviewers re-check
      the diff before WP3 is accepted. **Dispatched at `16f57d6`.**
97. **Rulings on WP4's type review** (REQUEST CHANGES, 9 blocking, 7 notes, on `bc35eff..def8c95`). All are accepted
    except where marked.
    - **B1 to B9:**
      - the shared `errorMessage`;
      - a typed `ViewerHook` through a `Window` declaration, with no casts;
      - one `DrawBuffers` shape;
      - `LegendOptions` as a `Pick` of `ToggleState`;
      - named `ScreenPoint`, `PointerDown`, `PickedFace`, `Bounds`, `RGB` and `TriIndices`, with `Layers` exported;
      - a typed owners record instead of `userData`, and the needless `Line2` cast deleted;
      - guards instead of `!`;
      - a malformed `#hash` falling back to the first fixture instead of killing the page;
      - `Readonly<Vec3>` parameters.
    - **N1:** `Hit` becomes a discriminated union.
    - **N2:** `LegendNote` is a literal union.
    - **N3 to N7:** the housekeeping, the `Disposable3D` cast, the test helpers, `SHELL_KINDS` keyed to the colour
      `Record`, and `count.get` without `!`.
    - These make up **WP4.1**, together with decision 95's single-config change and any accepted findings from WP4's
      correctness review, which is still running.
98. **Rulings on WP4's correctness review** (fresh Opus, browser, on `def8c95`, served from a snapshot after WP3.1's
    edits began). The data side is sound: readouts, picking, the panel, toggle state and legend kinds all match the
    data, with a pick sweep over 5 views of all 10 fixtures. **The drawing misleads.** All findings are accepted.
    - **F1 (High).** Concave and flat Edges are hidden by the faces: `LineSegments2` uses a plain depth test. With
      faces on, the user cannot see TallerUpper's RingJunctions, Overhang's `^`, ValleyWings' valley, or any
      SoffitJunction or InternalCorner.
      - **Requirement:** every Edge is visible wherever no non-adjacent face occludes it.
      - **Gate:** screenshots with faces on show all of those, and the reviewer re-checks.
      - The lead's message to the user had called the WP4 screenshots right on the strength of NarrowUpperStorey
        alone, which has no concave Edge. **That was wrong, and is corrected here.**
    - **F2 (High).** The partial-Cell overlay covers Cell outlines and thins Edges. Draw order is faces, then any
      partial-Cell fill, then Cell outlines, then Edges.
    - **F3 (Medium), and spec 28 is AMENDED.** A partial Cell is no longer a lighter fill by default. It shows through
      its outline, with a "highlight partial Cells" toggle. The lighter fill made a tan staircase that read as Wall
      on NarrowUpperStorey and hid the true Hip line. That contradicts the exact cut.
    - **F4 (Medium).** The palette is revised with a measured floor:
      - every Edge colour is at least ΔE76 30 from every fill it can lie on;
      - Edge kinds that can meet at one vertex are at least 25 apart;
      - the hover and pin colours are distinct from every kind colour;
      - a test computes ΔE76 over the tables and asserts these floors.
    - **F5 (Medium).** Raw mode draws the union's faces translucent, so the removed parts inside show. The legend
      says "raw Internal face", not "removed by the union".
    - **F6 (Low).** The origin AxesHelper is replaced by a corner orientation gizmo, listed in the legend.
    - **F7 (Low).** Legend counts follow the storey toggles. The outline, hover and pin colours are listed. Defects
      count ShellEdges and NetEdges separately.
    - **F8 (Low).** A failed build clears the scene and shows its error. A hash change loads that fixture.
    - **F9 (Low).** Materials are disposed along with geometries.
    - **Q6 (tests pass on wrong colours).** The pure colour-buffer path gets tests that convict the reviewer's four
      colour mutations: every face drawn as Wall, partial Cells unlightened, every Edge Ridge-red, and an
      sRGB/linear mix-up. Readout tests assert whole lines, not `toContain`.
    - **WP4.1 is these items plus decisions 95 and 97.** It goes to the WP4 delegate. Its browser verification runs on
      a tree that includes WP3.1, and the WP4 correctness reviewer re-checks in the browser before WP4 is accepted.
    - **Side effect, reported:** the reviewer briefly drove another session's browser tab on :5199, then sent it
      back.
99. **WP3.1 returned at `e117f4f`: 472/472, `typecheck` clean, all four gates convicted**, per the delegate. Probe5
    and probe8 now build.
    - **Pins moved under F6, plane identity:**
      - ValleyWingsPierced: Wall0 faces 8 → 6, `WallVertical` 2 → 0, Eaves 12 → 10, GroundLine 8 → 6.
      - Case 4b: `cheeks` 1 → 2. Its one Cheek stands on two planes, y = 150 and y = 350.
    - **Unpinned counts that moved under F6:**
      - Bridge: faces 31 → 27.
      - BridgeOverBlock: faces 34 → 26.
      - ValleyWings: faces 23 → 21.
      - `WallVertical` is now 0 in all three.
    - **Moved under F5:** every fixture's `newConventions` now lists "Roof lines cut exactly".
    - **Unchanged:** the conflicts, `partialCells`, and the vertex, NetEdge and Cell counts.
    - **Pending re-review**, before acceptance:
      - Cells whose square pieces touch at one vertex are split into one Cell per piece.
      - F5 is listed only for off-lattice Hip, Valley or Ridge edges.
      - `storey.ts` keys gable faceIDs by generating plane.
    - Both WP3 reviewers are re-checking `16f57d6..e117f4f`. WP4.1 was told WP3.1 had landed.
100. **Rulings on the type re-review of WP3.1** (REQUEST CHANGES). B1 to B7 and N1 to N3 are all fixed; B1 was
     resolved through the spec amendment. All of its new findings are accepted.
     - **B8:** `vertexRecords` narrows once with a `switch` on `VertexOrigin`, checked by `never`. The `-1` face
       sentinel goes; it could otherwise leak into `ShellVertex.faces` and the export.
     - **N5:** one exported `onLattice` replaces the two copies.
     - **N6:** `BuildOutcome` is named, and the test wraps with `errorMessage`.
     - **N7:** the F4 test uses `Vec2` and the shared `cross`.
     - These form **WP3.2**, together with any findings from the correctness re-review.
101. **Rulings on the correctness re-review of WP3.1.** F1 to F6 and F8 are fixed as ruled. The reviewer's invariant
     probes over all ten fixtures (about 9.2k vertices) find nothing wrong, and they measured 472/472 at `e117f4f`.
     - **N1 (High, a regression), accepted (F37).** F3's 1e-4 rad nudge fails against wedges from unsnapped
       positions. Cell sides under about 17 cm, or Cell corners under 1e-4 rad, fall outside every wedge.
       - **The fix:** a run's fan triangle is chosen by a point strictly inside the Cell's own corner, on the
         bisector of its leaving and arriving sides, with every coordinate taken from one consistent set.
       - **The reproducer becomes a test:** the `[0,0,600,400]` box with y = 0 gabled at 26.574°.
     - **Pre-existing near-coincident vertices (High for the arc), accepted (F36).** The union's float32 output
       leaves distinct vertices 7.6e-5 to 2.3e-4 cm apart, so `vertexAt` throws "snap to one grid point". This hits
       16 of 80 random Ring fixtures and 161 of 580 pitch-sweep cases, at both commits. Fuzz54's Hip and Valley
       6e-4 cm apart is the same class of fault. **A prototype that works only at the fixtures' pitches is not
       the desired clipping prototype.**
       - **The requirement:** step 4 must build on any valid union. Between the union and step 4, the union's
         output is cleaned at a stated tolerance: near-coincident vertices are merged and the resulting
         degenerate triangles collapsed, through Manifold's own simplification or an equivalent. The result
         must still be a closed manifold, and its tags must survive.
       - **The gate:** the reviewer's pitch sweep (20° to 70°, with and without an upper storey) and its 80
         random Ring fixtures become tests. Every case must build and pass spec 32's invariants. Any case that
         still fails is reported with its cause, never skipped.
     - **Low items, accepted:**
       - `planeKey` assigns plane ids by `samePlane` clustering, not by rounding;
       - a Cell lobe with negative area is a hard error, as a contour hole is;
       - `ShellReport.cheeks` counts Cheek ShellFaces, as spec 30 says (case 4b stays at 2).
     - **Its other answers stand as rulings:**
       - one Cell per piece is sound;
       - F5's off-lattice rule is sound;
       - case 4b's 2 Cheeks is correct;
       - the re-tag pass's provenance `wall` may name a wall whose span misses the point, which is harmless.
     - **WP3.2 is these items plus decision 100.** It goes to a fresh Opus delegate. The WP3 delegate's context is
       past 480k tokens, and the robustness work needs a clear head. **Dispatched.** It was told mid-run that `src/`
       runs in the browser, so no `process.env` and no `node:` imports; its work in progress had read `process.env`.
102. **The storey height is 250 cm, not 300** (user, 2026-11-07: "Default storey size in use in the C++ project is
     250cm"; confirmed in F38). Every height in spec 34 to 40 and in spec 20's worked examples was recomputed by the
     lead, and the spec amended in place.
     - **Each clean fixture still tests what it tests,** because the fixtures keep their own steeper pitches:
       - NarrowUpperStorey's upper storey stays buried (lower roof at 596.4 against the upper plate at 500);
       - TallerUpper's apex (423.2) and Overhang's apex (423.2) stay under the upper plate (500);
       - BridgeOverBlock's tunnel stays open (ridge 423.2, bridge floor 500);
       - ValleyWings' ridges (450) stay under the upper plate (500).
     - **ValleyWingsPierced is still pierced:** its ridges reach 596.4, above 500.
     - **OverhangApexOnEave is redesigned.** At 250 its old apex (550) would pierce storey 1's roof rather than touch
       its eave. The new geometry is `[0,0,500,500]` and `[250,0,750,500]`, both at 45°, which puts the apex at
       (250, 250, 500), exactly on storey 1's eave line. Its topology is re-measured and pinned.
     - **This lands as WP3.3, after WP3.2,** so that pin changes from the two packages are not confused. The new
       numbers are spec 34 to 40's.
103. **Add `DefaultChalet`, Piste Perfect's default building, as the eleventh fixture** (from F38). It is
     `[0,0,1000,1000]` on storey 0, gabled on x = 0 and x = 1000, at 22.5°. Its assertions are in spec 40. The
     roster's fixtures exist to stress geometry, and none of them is the building a player sees first. WP3.3 carries
     it.
104. **The type re-review of WP4.1 APPROVES** it: all nine blocking findings are closed by changes of shape, and
     there are 5 new notes. All the notes are accepted for **WP4.2**, alongside any findings from the browser
     re-review:
     - `SHELL_KINDS` becomes `readonly`;
     - the residual `group: LegendGroup | ''`, and `SPEC_SHELL_KINDS` typed as `readonly ShellKind[]` with no cast;
     - an `RGB` built without a cast;
     - `LayerOwners` derived from `Layers`, and the viewer's named types exported;
     - **the `uBias` shader patch fails loudly.** Patching by string replacement goes silent if a three.js upgrade
       changes the source lines, so `lineMaterial` throws when the patched shader lacks `uBias`, and a test pins it.
105. **WP4.1 is accepted at `c16fe9c` on the browser re-review**, with WP4.2 to follow. The reviewer served a
     `git archive c16fe9c` snapshot and confirmed every one of the seven faces-on checks. Its sweep read Edge pixels
     off the canvas over 7 fixtures and 5 views (for example RingJunction 342/342, Valley 18/18, InternalCorner
     68/68). Ten colour mutations each fail a test. The depth bias lets an Edge show through a face only within its
     stated allowance, at most about 8 px.
     - **Accepted for WP4.2:**
       - **M1 (Medium).** The ΔE floors are measured against each fill's lit range, not its flat table colour. The
         range runs from its darkest to its lightest Lambert appearance, and a downward face (Underside) is
         ambient-only. The opt-in partial tint counts as a fill. Colours tuned to exactly 32.0 unlit had no margin;
         SoffitJunction on a lit Wall measured 29.5.
       - **M2 (Medium).** `EDGE_KIND_LIES_ON` adds Cheek wherever it names Gable, per spec 21. Verge on Cheek
         measured ΔE 13.5.
       - **L2 (Low).** "Can meet at one vertex" also takes every pair of Edge kinds that actually meets at a vertex
         across all eleven fixtures, computed from the shells, alongside the share-a-face-kind rule.
       - **L3 (Low).** SoffitEdge moves away from ExternalCorner's dark blue.
       - **L1 (Low).** The gizmo shows its labels in every view, and its X colour matches the legend.
       - **L4 (Low).** The hover overlay must not read as the partial tint: at least ΔE 25 from the tint at lit
         appearance, or an outline emphasis instead of a white fill.
       - **L5 (Low).** The legend lists the ghost-outline grey.
     - **Decision 104's five notes** join WP4.2.
     - **WP4.2's check:** the browser reviewer re-reads SoffitJunction and Underside RoofInterior on screen, and the
       ΔE test is convicted by darkening Wall to its lit minimum.
106. **WP3.2 returned at `fb150ed`.** The robustness requirement of decision 101 is met: 580/580 sweep cases and
     80/80 random fixtures build and pass, against 384 and 60 before. The tests excluding the viewer's are
     1124/1124. Five viewer-palette failures came from WP4.2's uncommitted work in progress, not from WP3.2. No
     fixture pin moved, and all five gates convicted (F39).
     - **The cleaning pass is accepted** (`src/clean.ts`). It collapses short edges, drops degenerate triangles,
       flips caps, and re-enters the mesh through `ofMesh`, which must accept it as closed.
       - `CLEAN_TOLERANCE_CM = 4/1024`, with a hard error if any vertex would move more than 0.005 cm.
       - Measured over 670 raw unions: noise edges run 1e-4 to 1.74e-3 cm, with none between 2e-3 and 0.05; caps are
         at most 1e-3 cm high; the thinnest genuine triangle is 1.0e-2 cm.
       - Manifold 3.2.1's `simplify` and `setTolerance` were measured to collapse nothing at this scale, and a test
         pins that.
     - **STRUCK 2026-11-07 by decision 110 (C5): the bound scaled with perimeter and could hide a lost notch.**
       **Fuzz46 is ruled by a principled area bound, not a pin.** Decision 32's area invariant becomes per face:
       `|loop area − area of the face's own triangles| ≤ loop perimeter × the run-straightness tolerance`. Straightening
       a run moves its boundary by at most that tolerance, so the bound is exactly what loop reduction can cost.
       Fuzz46's kink of 2.47e-4 cm on a 559 cm Hip falls within it. Its pin is removed, and it must pass the
       derived bound. The flat 0.05 cm² sum check goes, since it was arbitrary at any scale. Spec 32 is amended.
     - **The delegate's interpretations stand as rulings:**
       - `cross2` lives in `vec3.ts`;
       - plane clusters are per build, in `ShellTags.clusters`;
       - B8 is convicted by a forged-origin test;
       - the net invariants (tiling, pairing, winding, grid vertices, face ids) join decision 32's;
       - capped triangles take the faceID across the long edge.
     - **WP3.2 goes to both reviewers** on `2c0bb2e..fb150ed`. The decision above goes into WP3.3, which the same
       delegate starts now so the demo is not held up. Anything the reviews raise becomes WP3.4.
107. **The type review of WP3.2 APPROVES it** (0 blocking; WP3.1's B8 and N5 to N7 are confirmed fixed). Its notes,
     all accepted for **WP3.4**:
     - **N8:** `shell.test.ts` imports `AREA_TOL`, `SNAP_MOVE` and `planHolds` from `shell-invariants.ts`; the copies
       go.
     - **N9:** `nextHalf`, `triOf` and `makeUnionFind` move to a leaf module, as `vec3.ts` was done, so `clean.ts`
       stops copying them and the import cycle is avoided.
     - **N10:** one exported `meshOf(out): ShellMesh` and one exported `NO_CLEAN`.
     - **N11:** `planeKey` is renamed to say it registers (`clusterKeyOf`), and `PlaneClusters` holds `{rep, key}[]`.
     - **N12:** `Partial<Record<…>>` for the residuals; this one may vanish under decision 106.
     - **N13:** `unit` moves to `vec3.ts`, and `CapTri` is named.
108. **The robustness sweep also varies storey height**, as a grid of pitch × storey height. The grid includes 250
     and 300, with steps between them. This lands in WP3.4.
     - **The problem it targets:** fixtures fixed at one parameter value can test a different regime from the
       content they stand for. Which side of a threshold a fixture falls on (ridge against the plate above it,
       apex against eave) moves with storey height.
     - **Prompted by the user** (2026-11-07). They asked whether repeated C++ bugs that tests never flushed out came
       partly from the C++ fixtures using 300 cm storeys while content uses 250. That is plausible but unverified;
       F36 shows the same failure mode with pitch in this arc.
     - **Offered to the user:** ask the spec author which C++ suites hard-code 300, and what a C++ parameter sweep
       would need.
109. **The arc's headline recommendation to the C++ side is aggressive sweeps and fuzzing** (user, 2026-11-07:
     hand-written C++ tests give no real assurance of robustness without sweeps across a wide range of inputs).
     Evidence: F36. Here ten reasoned fixtures passed while a pitch sweep failed 161 of 580.
     1. **Invariant-only assertions:** closed, genus, no surviving Internal, no Unclassified, Cells tile their faces,
        NetEdges pair, vertex order, and areas consistent.
     2. **Inputs sampled from the Grammar's reachable space,** then wider: random Ring layouts within the content
        caps (3 storeys, 4 Rings, 12 corners, right angles, wing aspect 4), the content pitch set at 250 cm, then a
        continuous pitch × storey-height sweep.
     3. **Seeded and reproducible.** A failing seed is shrunk and enrolled as a named fixture with its failure pinned,
        following the `test-fixtures` package's enrol-don't-exclude rule.
     4. **A differential oracle:** the same layouts run through the C++ net and through this prototype, comparing
        kinds, counts and areas. The JSON export exists for this.
     5. **Budget:** a fixed-seed slice on every build and the full sweep nightly. Measure the failure rate before
        fixing.

     Offered to the user: a brief for the C++ team, or scoping it against the UE suites through the spec author's
     session.
110. **Rulings on the correctness review of WP3.2** (`2c0bb2e..fb150ed`, on a `git archive` extract: 1124/1124).
     **Cleaning is sound:** across 960 unions it moved no vertex more than 1.6e-3 cm, and the capped triangles' faceIDs
     are correct. **Decision 101's requirement is not yet met** (F40). Everything below is accepted for **WP3.4**,
     together with decisions 107 and 108.
     - **C1 (High).** Manifold writes a non-manifold pinch as two vertices at one exact position with no edge between
       them, and `vertexAt` throws on it. That shape is ordinary: an upper storey overhanging a reflex corner. Such
       vertices become one ShellVertex carrying both sheets' fans. Its lists are each sheet's counter-clockwise run in
       turn, the sheets ordered by lowest face id, as spec 19 amends. Fuzz109 (seed 2) and Fuzz3 (seed 3) become
       named regression fixtures.
     - **C2 (High).** `cleanMesh` oscillates on two caps that share a long edge. The fix flips only against a non-cap
       neighbour, and otherwise merges the near-collinear vertex into the long edge. Fuzz134 (seed 4) becomes a
       named regression fixture.
     - **C3 (Medium).** The robustness gate is blind to tags. It adds:
       - every output triangle lies on its tag's generating plane, which convicts the reviewer's cap-faceID mutation;
       - `unclassifiedEdges` is 0, and an Unclassified edge in a random case is a finding to report, never to waive;
       - no ShellEdge joins two faces of one identity;
       - decision 60's cyclic order.
     - **C4 (Medium).** The gate re-ran only the inputs it was tuned on. It now runs random seeds 1 to 4, at both 250
       and 300, plus decision 108's pitch × storey-height grid. A larger seeded fuzz is opt-in, through a test-only
       setting. Its failing seeds are shrunk and enrolled as named fixtures with their failure pinned.
     - **C5 (Medium). Decision 106's per-face area bound is STRUCK.** A bound that scales with perimeter could pass a
       loop that dropped a genuine 4 × 4 cm notch. In its place:
       - every vertex `reduceFaceLoops` drops lies within `SHELL_TOLERANCE_CM` of the chord it is dropped onto;
       - a run's straightness is measured against the run's final chord, not segment by segment;
       - each face's loop area equals its own triangles' area minus the exact area of the dropped vertices'
         triangles, within float epsilon.

       Fuzz46 must pass on that accounting. Spec 32 is amended again.
     - **C6 (Low).** Plane clusters become the connected components of the `samePlane` graph, which is independent of
       query order.
     - **C7 (Low).** The bisector test is non-strict, with first-match tie-breaking.
     - **C8 (Low).** Each edge collapse is preceded by a link-condition check, and a collapse that would pinch is a
       hard error.
111. **WP3.3 returned at `8c8dda8`.** It delivers 250 cm storeys, the redesigned OverhangApexOnEave, `DefaultChalet`,
     and re-pins. The delegate ran 1799/1810 outside the viewer.
     - **Every hand-computed spec number is confirmed**, except DefaultChalet's Gable at 103553.23 against
       103553.4. The apex's 1/1024 snap costs 0.165 cm², so spec 40 now states the snap bound.
     - **11 tests are red, all NarrowUpperStoreyGabled's, and correctly unpinned.** The cause is F41, a design defect
       in spec 15.
     - **Spec 15 is amended: the re-tag pass imprints the boundaries between coplanar raw faces of different winners
       onto the output mesh before tagging.**
       - Straddling triangles are split along those boundaries.
       - Neighbours are split at each new vertex, reusing the weld's T-junction split.
       - The mesh is re-validated through `ofMesh`.
       - A new invariant holds that no output triangle straddles a winning-region boundary, checked at corners, edge
         midpoints and centroid against the raw faces. It runs on every fixture and robustness case.
       - The 300 cm cases the delegate's corner probe found mislabelled (P36.089u, P39.376u, P49.583u, P55.984u,
         Fuzz47) become named regression fixtures. The probe is corners-only, so the invariant is the real net.
     - **Delegation.** The imprint goes to a fresh Opus delegate as **WP3.5**, which owns `union.ts`'s re-tag pass,
       `tags.ts` and its own new test file. WP3.4 (decision 110's C1 to C8, plus decisions 107 and 108) goes to the
       WP3.2/3.3 delegate in parallel, which owns `clean.ts`, `edges.ts`, `cells.ts`, `faces.ts`,
       `shell-invariants.ts` and the robustness tests. The file split keeps them apart. The branch stays red on
       NarrowUpperStoreyGabled until WP3.5 lands.
     - **WP3.3's review** is folded into one correctness review over WP3.3 to WP3.5 together.
112. **Dispatches and returns, 2026-11-07.**
     - **WP3.4** has gone to the WP3.2/3.3 delegate, scoped to C1–C8 (C6 excepted) plus decisions 107 and 108. It
       includes a hand-made minimal C1 fixture: an L-shaped storey 0 with a flush upper wall over the reflex corner.
     - **WP3.5,** the imprint plus C6, has gone to a fresh Opus delegate in parallel. The two hold disjoint file
       rosters.
     - **WP4.2 returned at `72cf919`.**
       - The delegate ran 1199/1199 on a snapshot, viewer 75/75.
       - The lit-range floors come from one `lighting.ts` shared by the renderer and the test, with a margin of 3. All
         210 Edge-kind pairs are at least 31 apart.
       - Hover and pin are outline-only.
       - The `uBias` patch throws when it does not apply.
       - Three gates and two further mutations were convicted.

       Both WP4 reviewers re-check it before it is accepted.
     - **The user asked for a diagnosis of C1.** The lead checked the reviewer's account against the geometry of
       Fuzz109 (F42).
113. **The type re-review of WP4.2 APPROVES it**: 0 blocking, and WP4.1's N1 to N5 and their residuals are all closed.
     Its five new notes are accepted for a final viewer polish batch, **WP4.3**, to follow the browser re-review:
     - `lineMaterial` takes `LineMaterialOptions`;
     - `PickLayer` is derived from `keyof Pick<Layers, …>`;
     - "Cheek reads as Gable" becomes true by construction through a `readsAsGable` helper over
       `EDGE_KIND_LIES_ON`;
     - `DirectionalSpec` gains `color`, and the gizmo camera takes `GIZMO_FOV`;
     - `gizmoWorstExtent` takes overrides, so its clip test exercises the real function.
114. **WP4.2 is accepted at `72cf919` on the browser re-review.** The reviewer measured the lighting model against
     screen pixels and found them matching: Roof worst ΔE 0.57 over 151 samples; Wall 555 of 559, the other 4
     explained.
     - **The previously failing pairs now clear on screen:**
       - SoffitJunction on lit Wall: 46.5 (was 29.5);
       - Underside RoofInterior: 39.6 (was 24.9);
       - Verge on a constructed Cheek: 38.1 (was 13.5);
       - ExternalCorner against SoffitEdge: 36.1 (was 27.0).
     - **The lowest Edge-on-fill pair on screen** is Ridge on Roof at 37.4.
     - **The tests convict the old colours:** 11 of 12 colour mutations fail a test. Gizmo labels fit in every view,
       and hover reads apart from the tint.
     - **Accepted for WP4.3,** alongside decision 113:
       - **L-a.** The scene's lights are built by one pure, exported function from `lighting.ts`, and a test pins
         it. The directional colour joins the spec, and `lambertFactor` uses the light colours. Hard-coding the
         scene's ambient light currently passes every test.
       - **L-b.** Hover and pin outline materials leave `clearLayers`' map, or have their bias refreshed every
         frame and on resize. A pin rebuilt at one zoom keeps a stale bias.
       - **Dark blues.** A luminance-contrast floor of at least 3:1 against the background applies to Edge colours
         and gizmo labels, beside ΔE76, which overstates contrast for dark blues. ExternalCorner measures 1.19:1,
         and the Z label 2.07:1.
       - **L-c.** The lit-normal model adds Ground seen from above and downward-facing Cheek.
     - **Side effect, reported:** the reviewer's first extraction overwrote `scratchpad\snap42`, another agent's
       folder. Both running WP3 delegates were warned.
115. **Courtyards are roofed by a cut along a raw Ring wall** (user, 2026-11-07: "use one of the raw rings walls to
     make a cut across the courtyards building ring, and that produces a shape the solver can handle without any
     changes to it"). Spec 2 is amended with the cut-selection rule, the true-outline wall prism and Internal cut
     faces. Spec §3 no longer defers courtyards. Decision 73's "any `cut` form is a hard error" now applies only to
     authored cuts.
     - **The machinery exists already.** Roof-gable's `buildCourtyard` and algorithm B's cut pieces do the work,
       measured on cases 9a to 9d.
     - **WP3.6 delivers it** after WP3.4 and WP3.5 land. It touches `storey.ts` and `fixture.ts` and the fixture
       roster's tests, which overlap both delegates' work. It delivers:
       - **A `Courtyard` fixture:** four Rings, `[0,0,1000,300]`, `[0,700,1000,1000]`, `[0,300,300,700]` and
         `[700,300,1000,700]`, at 250 cm and 30°. Its assertions:
         - spec 32's invariants with genus 1;
         - Wall faces on all four courtyard walls;
         - no ShellEdge on the cut's line beyond the geometry's own (the cut leaves no trace);
         - an empty report in spec 40's sense.
       - **Cases 9a to 9d join the roof-parts agreement test** through their own cut.
       - **The random generator may produce courtyards** within the Grammar's caps.
     - The open item "Courtyards" closes on WP3.6's acceptance.
116. **Union wall forms come from Rings: the lowest parent `FBuildableComponentModel` index wins, and the whole wall
     takes its form** (user, 2026-11-07: "This has already been answered in C++. Each ring has a parent
     FBuildableComponentModel index. Lowest index wins and the whole wall takes whatever it asks for.").
     - **The lead's reading:** "the whole wall" is the maximal straight run of the union outline, not the traced
       segment. `unionLoops` breaks walls at every Ring corner, and splitting there would let one wall's halves
       differ, which the rule exists to prevent. The Ring's index in `rings` stands in for the model index.
     - **Spec 3 is amended:** forms are authored per Ring side, with a hip or gable form and a pitch, and derived
       onto the union walls as roof-gable `Sel`s. Spec §3's deferral closes.
     - **WP3.6 carries it with courtyards.** Both are storey planning (`storey.ts`, `fixture.ts`):
       - Every existing fixture is re-authored with Ring forms. Its shell must come out identical, so every existing
         pin holds unchanged. That makes a strong regression check on the derivation.
       - **A `FlushRingConflict` pair:** Rings `[0,0,500,400]` and `[500,0,1000,400]`, one hipping its S side and
         the other gabling it. In one order the whole y = 0 wall is hipped; with the indices swapped it is
         gabled.
       - **Mono forms stay out of Ring authoring for now.** No fixture uses them, and mono needs a low corner.
     - **Open item "Roof forms per union wall, not per Ring" closes on WP3.6's acceptance.**
     - **The user has confirmed that overlapping Rings follow the same rule** (2026-11-07: "Same answer: the lower
       indexed ring-parent"). Spec 3's "whose side lies on a union wall and overlaps it" already covers it. WP3.6
       adds an `OverlapRingConflict` pair: the L of `[0,0,1000,400]` and `[600,0,1000,1000]`, whose x = 1000 sides
       overlap over y 0 to 400 and disagree. Swapping the indices flips the whole x = 1000 wall.
     - **The user has confirmed that pitch follows the same rule** (2026-11-07: "lowest index wins"). Spec 3 already
       gives the winner "form and pitch". WP3.6 adds a `PitchRingConflict` pair: flush Rings that agree on the shared
       wall's form, both hip, but not on its pitch (30° against 45°). Swapping the indices swaps the whole wall's
       pitch.
     - **Buried Ring sides raise no question,** since a swallowed feature ceases to contribute (user, 2026-11-07).
       Spec 3 already drops their forms. The lead had listed them among the conflicts in error.
117. **WP3.5 returned at `f707edf`**: the imprint (spec 15 as amended) and C6.
     - **NarrowUpperStoreyGabled is green** against the spec's numbers: storey 1 Wall 50000.00, storey 0 Gable
       105884.57.
     - **Test figure:** 1913/1913 on a clean snapshot of HEAD plus WP3.5. The one working-tree failure is an
       untracked file from WP4.3's work in progress.
     - **All three gates convicted, and no pins moved.**
     - **Where the imprint splits:** 7 of 660 robustness cases at 300 cm and 2 at 250 cm; among the fixtures, only
       NarrowUpperStoreyGabled.
     - **`winningRegionViolations` is handed to WP3.4** for the robustness gate.
     - **Interpretations stand pending the combined review:**
       - a straddling triangle is over-cut along the boundary's full line, inside that triangle only;
       - neighbours are split by an edge record, not by the weld's T-split;
       - a triangle's own faceID is a candidate only when its raw triangles hold the centroid;
       - query points are projected onto their plane;
       - samples are pulled inward to be 0.005 cm inside;
       - winners are read 0.004 cm either side of a raw edge.
     - **For the combined review to probe:** the own-faceID change of interpretation 3. Without a holder, a triangle
       keeps its faceID's tag.
     - **The combined correctness and type review over WP3.3 to WP3.6** runs after WP3.4 lands.
     - **WP4.3 returned at `1886b32`:** the viewer's tests are 96/96 and typecheck is clean. All four gates
       convicted.
       - `sceneLights()` is the scene's only light source, guarded by a test that pins it and a scan of
         `scene.ts`'s source.
       - `LineBiasRig` keeps hover and pin bias correct across rebuilds.
       - A WCAG luminance floor of 3:1, with a 0.25 margin, applies to Edge colours and gizmo labels:
         - ExternalCorner becomes `0x008291`;
         - RoofInterior becomes `0x87b400`;
         - SoffitEdge becomes `0x735fc3`;
         - the gizmo Z becomes `0x3b73ff`.

         Every ΔE floor is kept.
       - Label textures are now in sRGB.

       Because it is a small polish batch, a single targeted type check was dispatched, following decision 80's
       precedent. **The viewer is "easily good enough to understand the problem and solution space"** (user,
       2026-11-07), so no further browser rounds are planned.
118. **WP4 is closed: WP4.3 is accepted at `1886b32`.** The type check APPROVES it: 0 blocking, and decision 113's
     N1 to N5 are all closed by changes of shape. Its three notes are recorded and not scheduled, since the viewer
     has no further batch planned:
     - two tests assert on `scene.ts`'s source text where a constructor argument could carry the guarantee;
     - `DirectionalSpec extends AmbientSpec` would read better over a `LightSpec` base;
     - one test restates a type.

     A viewer change in a later arc picks them up.
119. **WP3.4 returned at `3575aa7`.** It delivers C1 to C5, C7 and C8, plus decisions 107 and 108. The delegate's
     figures:
     - **Test figure:** 3432/3435 outside the viewer.
     - **Random seeds:** seeds 1 to 4, 140 cases each, pass 1120/1120 across both heights.
     - **Sweep:** 580/580 at each height.
     - **C1 and C2 regressions:** 4/4.
     - **Gates:** convicted. The order-clustering gate belongs to WP3.5.
     - **Pins:** none moved, beyond the Fuzz46 residual and the flat sum check both going under C5.
     - **C1 is extended to coincident ShellEdges.** The overhang's foot is shared by both sheets along its length, so
       spec 19 now gains "sheets".
     - **The 3 red tests are a new class, F43, and are not enrolled.** The delegate stopped and reported, as its
       rule required. **Ruled: a Cell exists exactly when it has at least three distinct snapped vertices.** The
       area drop under `SHELL_TOLERANCE_CM²` is STRUCK from spec 23. It disagreed with vertex identity, and
       existence now follows the snap grid that defines identity. Whether content can use sliver Cells stays on the
       open sliver-policy item.
     - **Left for WP3.6, in files WP3.4 did not own:** decision 107's N11 (`clusterKeyOf`, `{rep, key}[]` in
       `tags.ts`) and the `union.ts` half of N10 (`meshOf`, `NO_CLEAN`).
     - **WP3.6 goes to a fresh Opus delegate.** It carries:
       - courtyards (decision 115);
       - Ring forms (decision 116 and its addenda);
       - F43's ruling, with G52h270u, G58h270 and G58h270u enrolled as regressions;
       - the N10 and N11 leftovers.
     - **The combined correctness review** goes to a fresh Opus reviewer on `8c8dda8^..3575aa7` (WP3.3 to WP3.5),
       served from a snapshot, in parallel with WP3.6. **The type review** goes to the standing type reviewer on the
       same range.
120. **Rulings on the type review of WP3.3 to WP3.5** (REQUEST CHANGES: 2 blocking, 5 notes). Decision 107's N9 and N12
     are fixed. N8 and N13 are fixed apart from some residue, N10 is half done, and N11 is open as expected. Every
     item is accepted and added to the running WP3.6 package as an addendum, since WP3.6 is the only package writing
     the pipeline:
     - **B9:** `PieceVertex`, `CapAcross` and `CapAt` hoisted to module scope.
     - **B10:** `unit3`, `add3`, `scale3` and `dist3` all live in `vec3.ts`.
     - **N14:** one `lineDistance`, in `vec3.ts`.
     - **N15:** `clusterKeys` uses `makeUnionFind`.
     - **N16:** `notchedSolid` uses `meshOf`.
     - **N8 residue:** the shared `AREA_TOL` and `dist`.
     - **N17:** non-empty origin tuples.
     - **N18:** `FaceOrigin`, a `Pick`-based return type, `ShellFixture`, a throw instead of a default, and a tuple
       literal.
121. **The C++ port's two in-game regressions become four Ring-authored fixtures,** added to WP3.6 as a second
     addendum. The port lead (`pisteperfect-5-7-4f`) sent the C++ fixtures that reproduce its defects (MB.D486).
     - **`PortNarrowUpper300` and `PortNarrowUpperGabled300`:** NarrowUpperStorey and its gabled variant at their
       native 300 cm.
     - **`PortPokeOut300`:** upper Ring `[150,0,450,200]`. It pokes about 40 cm out of the 60° lower roof.
     - **`PortPokeOut250`:** upper Ring widened to `[100,0,500,200]`, to keep the poke-out on the lattice (F44).
     - **Assertions:**
       - *Missing tiles:* storey 0's Roof Cells tile the whole 360000 cm² plan, and no storey-1 Roof survives.
       - *Lost ridge:* the lower Ridge survives whole, and the poking walls survive.
       - Full topology is pinned as reference data.
122. **The combined correctness review of WP3.3 to WP3.5** (fresh Opus, on a `git archive 3575aa7` snapshot,
     3432/3435 reproduced). Confirmed sound:
     - **The imprint:** a dense check of 91 to 325 samples per triangle, over 1331 cases, found 0 straddles, 0
       mis-tags and 0 unheld samples. The own-faceID rule is sound.
     - **Sheets:** all 34 constructed pinch shapes pass every invariant, and all 8 orientations of FlushOverReflex give
       identical signatures.
     - **C2's flip terminates.**
     - **WP3.3's re-pins match spec 34 to 40.**

     **Findings, with provisional rulings** (the next package's scope waits on the user, decision 123):
     - **F-A (Medium).** The winning-region invariant samples 7 points per triangle and misses straddles that the
       dense check catches (3 reproducers, with the imprint disabled). It becomes an exact polygon test of each
       triangle against the winning regions.
     - **F-B (Low).** The invariant shares `regions.ts`'s primitives. Its header claim of independence is corrected.
     - **F-C and G2 (Medium).** C8's link check, and the 0.005 cm move limit, refuse valid unions: Seed5Fuzz89, and
       OverhangApexOnEave nudged by 0.5/1024 to 4/1024 cm. Near-coincident vertices are welded by clustering within
       the tolerance, regardless of connectivity, rather than by edge collapse alone.
     - **F-D (Low).** An apex merge's in-plane move is unbounded; Seed4Fuzz134 moves 0.0142 cm. The total
       displacement is bounded and reported in `maxMoveCm`.
     - **F-E (Medium).** C5's area half is an algebraic identity, so it catches nothing. It goes, the chord check
       stays, and a loop is compared with its face's triangles by Hausdorff distance (≤ `SHELL_TOLERANCE_CM`).
     - **F-F (Low).** `IMPRINT_SIDE_CM` and `IMPRINT_MERGE_CM` join spec 16's list of named exceptions.
     - **G1 (High).** Manifold's own union leaves coincident opposite faces unfused, as a zero-volume pillow or slit
       (Seed5Fuzz46, Seed12Fuzz17, Seed8Fuzz73). Cleaning removes zero-volume sheets: pairs of coincident,
       opposite-facing triangles. The mesh then re-enters `ofMesh`.
     - **G3 (Medium).** A lattice square holding a hole of its face (Seed11Fuzz10) is split by a lattice-parallel line
       through the hole into simple pieces, each a Cell with that square's index. Spec 23 to be amended.
     - **G4 (Medium).** A rake 0.017 cm over a lattice corner, foreshortened in the Roof's plan frame, makes
       `withBoundaryPoints` skip a vertex (P61.866 and P61.866u at 263 cm). **Principle: vertex coincidence is decided
       in 3D, by vertex identity, never in a projected frame.**
     - **G5 (Low to Medium).** Sub-tolerance features give `Indeterminate`, and so Unclassified, Edges. These are
       expected to vanish once F-C's clustering removes the features; any that remain are reported.
     - **The bitwise-equality note** (pinches are recognised only when exactly equal): covered by F-C's clustering.
123. **One more hardening round, then enrol** (user, 2026-11-08, choosing over "harden to zero" and "stop now").
     - **WP3.7** carries decision 122's rulings and goes out after WP3.6 lands, since both touch the pipeline. It
       covers G1 (pillow removal), F-C (clustering), G3, G4, F-A, F-D, F-E and F-F. Its gate is the combined
       reviewer's fresh seeds 5 to 12 at 250, 263 and 300 cm, plus its δ-nudge sweeps.
     - **After WP3.7,** a fresh-seed failure is never chased by default. It is shrunk to a minimal case and enrolled,
       with its failure pinned, under this repo's enrol-don't-exclude rule. A cure or a regression then breaks the
       suite either way.
     - **Port-ready** is declared once WP3.6 and WP3.7 have landed and been reviewed, with the measured residual
       fresh-input failure rate published to the port lead.
124. **The C++ port and this prototype share a versioned JSON wire format**, so that edge cases found by playtesters
     flow back to TS for hardening (user, 2026-11-08: "That would continue to repay the investment in this
     prototype."). This is work package **WP5**, after WP3.6, in parallel with WP3.7, since it only adds new files.
     - **`building-shell/input@1`** is the building as authored. It is WP3.6's Ring-authored fixture shape, plus the
       parent model index, storey height, cell size, units and provenance (game build, session id, timestamp).
     - **`building-shell/output@1`** is today's `BuildingShell` export, plus the producing engine.
     - **A playtest dump carries both,** input and the C++ output, so TS can diff the two engines.
     - **The diff compares a canonical, id-free form:** multisets of face kind and area, and edge kind with snapped
       endpoints, within tolerance.
     - **Ingestion:** a JSON dropped in `fixtures/playtest/` is loaded automatically, validated against the schema,
       and run through every invariant. A failure is shrunk and enrolled per decision 123.
     - **The schema lives in this repo as JSON Schema files,** the source of truth for both sides. The TS tests
       validate every fixture and export against it.
     - **Main risk: axis conventions.** UE is left-handed, with X forward, Y right and Z up. The schema pins one
       mapping, and how compass sides map to axes.
     - **Asked of the port lead, 2026-11-08:** axes, side naming, form enums, Ring identity and ordering, and which
       C++ structures it can serialise. The schema is fixed once those answers are in.
     - **AMENDED 2026-11-08 by decision 125:** the schema's source of truth moves to the C++ USTRUCTs, through the UE
       project's Zod generator. No JSON Schema files are hand-written here.
125. **The wire format's schemas are Zod, generated from the UE project's USTRUCTs by its existing reflection
     generator** (user, 2026-11-08: "a mature system for generating Zod schemas via the UE reflection").
     - **Ownership.** The port owns the USTRUCTs: input, and output per spec 18, 19, 23 and 33. The generated `.ts`
       is vendored into `apps/building-shell/`, with a header naming the UE commit and generator version, refreshed
       by a sync script. A test fails on a missing or edited header.
     - **TS use.** The prototype validates every playtest file, and its own export, against the generated schemas,
       and takes input types from `z.infer`.
     - **Drift guard.** A compile-time test requires the generated output type and the spec-fixed TS types to be
       mutually assignable, so drift on either side fails `typecheck`.
     - **Axes.** A single TS adapter converts UE axes (left-handed, cm) to the prototype frame. It is tested with an
       asymmetric building, an L with one gabled side, so mirroring cannot pass.
     - **Dependency.** `zod` (MIT) is license-checked and exact-pinned, at the major version the generator targets.
     - **Sequencing.** WP5 builds the ingestion folder, diff tool and adapter against a hand-written stand-in schema.
       The generated file replaces the stand-in once it exists.
     - **Asked of the port lead:** the Zod major version, type mappings, existing input USTRUCTs, the output path,
       and conventions for version and provenance fields.
126. **The wire format is settled against the C++ facts** (F46). This amends decisions 124 and 125.
     - **Frame: no conversion.** Files carry UE actor-local centimetres: x = X, y = Y, z = Z up. The schema declares
       "frame: UE actor-local, cm, Z up, left-handed". The actor's world transform goes in provenance only. The
       prototype already uses the same numbers and the same counter-clockwise test, so winding agrees. **Decision
       125's axis adapter is STRUCK**; the viewer may offer a mirrored "as in game" display. The asymmetric-building
       test stays, now asserting that winding and side ownership survive the round trip.
     - **Rings are four corners, not a rectangle.** Side i runs from corner i to corner i+1 and belongs to corner i.
       - The prototype's canonical order for a rect `[x0,y0,x1,y1]` is (x0,y0), (x1,y0), (x1,y1), (x0,y1), counter-
         clockwise from above, so side 0 is y = y0.
       - Fixtures may keep compass names as an authoring convenience, mapped onto that order.
       - A Ring that is not an axis-aligned rectangle is refused with a reported error, never silently snapped.
     - **Per side, both the request and the solve are carried.** The request is `auto`, `Pitched` or `GableEnd`. The
       solved run is `{form, pitchDegrees}`. TS builds from the solve, mapping Pitched to hip and GableEnd to gable.
       A solved `Monopitch` is refused and reported until mono is supported. `Flat` is a polyline clamp, never a run
       form.
     - **Ordering: both keys are carried.** Each Ring carries its ring index (root order) and its parent
       `FBuildableComponentModel` index. **The conflict rule keys on the model index, as the user stated it.** The port
       lead says it is unverified that model index always matches root order. A file where the two orders disagree is
       accepted, flagged in the diff report, and raised with the user.
     - **Storeys are per Ring:** `{baseStorey, storeys, wallHeightCm?}`. A per-Ring wall-height override that differs
       from the building's storey height is refused and reported. Stacked storeys at one height are the four-step
       model's premise, content fixes 250 cm (F38), and per-storey overrides stay deferred (spec §3).
     - **Output: one contract per engine; the input is the only shared shape.** The TS export is the spec's
       `BuildingShell`. The first C++ export serialises the legacy pipeline's net (Cells, Edges, Surfaces) and its
       roof faces and runs, with no vertices. The diff maps each to the canonical id-free form, and the legacy export
       serves as a before-the-port baseline. Decision 125's mutual-assignability test applies once the port's
       output structs implement the spec shapes.
     - **Versioning:** the generated schema's version is bumped on the C++ side, which owns the USTRUCTs. The prototype
       re-vendors on each bump, and the port lead is told of any spec change that implies a bump.

## Findings

## Findings WP3.6 (courtyards
       and Ring forms) is dispatched after the combined review, or alongside it if the reviewers' rosters allow.

## Findings

## Findings

## Findings

## Findings

## Findings

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
- **F21. The original spec said "All six" but listed seven fixtures (34 to 40).** Decisions 55 and 56 built on the
  wrong base, which gives ten, not nine. The WP2 delegate caught it.
- **F22. manifold-3d 3.2.1 carries each input `faceID` through `union` per triangle**, keeps separate parts' ids
  distinct, and keeps exactly one copy of two coincident coplanar faces. The probe is
  `tests/manifold-faceid.test.ts` at `2ec9e98`.
- **F23. All ten fixtures hold spec 32's WP2 invariants**: status OK, closed, `survivingInternal` 0, `cheeks` 0. This
  includes both degenerate twins.
  - Spec 34 and 35's tagged areas hold: storey 1's Wall is 60000.000 on y = 0, and storey 0's Gable is 95884.570.
  - Conflicts appear only on the y = 0 plane of NarrowUpperStorey, NarrowUpperStoreyGabled and TallerUpper. In each,
    Wall wins over Gable, or the lower storey's Gable wins over the upper's.
  - **In NarrowUpperStorey, Manifold already keeps the upper Wall without re-tagging**, so only the conflicts list
    convicts a disabled re-tag pass there. NarrowUpperStoreyGabled convicts it by area.
- **F24. A storey offset of 0.005 cm (snapped to 0.00488) changes tagged areas by about 1 to 2 cm², but no
  topological invariant.** At +0.005, a 0.0049 cm Gable strip at the plate is re-tagged storey-0 Wall, because its
  centroid lies within the re-tag pass's 0.01 cm containment slack. Tolerance-scale offsets are absorbed by the
  re-tag, not detected by it.
- **F25. Only mixed-pitch cases convict the `1 / w.tan` weighting.** Mutating it to `w.tan` fails 10 of the 49
  hole-free CASES (4g and 7a to 7i). Uniform pitch gives the same skeleton under either weighting, so no shell
  fixture can catch it. The CASES agreement test is the only gate.
- **F26. Roof-gable's `runB.eval` returns null on a point exactly on a 45° hip** (case 7i at (62.5, 437.5)): its
  point-in-polygon falls into the float crack between two skeleton faces. The union gives the correct height there.
  This is a defect of the frozen prototype. The agreement test offsets its grid by (+0.3, +0.7) cm to stay off such
  lines.
- **F27. The union leaves surviving Cheeks on roof-gable cases 2b, 4b, 5a to 5e and 8b** (8 cases, `cheeks` 1 or 2),
  per the WP2 correctness reviewer's probe. Roof-gable's B tally has 6 CHEEK verdicts, so the two sets do not map one
  to one. WP2.1 reports the per-case cross-table.
- **F28. Bridge measures genus 0 and BridgeOverBlock genus 1** (WP2.1, `ee32857`). A probe at (500, 300, 300) is in
  air. Slices show the towers alone at z = 300 and 450 (240000 cm²) and the full storey at z = 750 (600000 cm²).
- **F29. The cheek cross-table over the 49 hole-free cases, measured at `ee32857` under spec 8's original tagging:**
  - The union and B agree on 2b, 4b and 8b, which are Cheek in both.
  - On 2d, 3c and 4l, B reports CHEEK and the union shows none.
  - On 5a to 5e, monopitch cases that B passes, the union shows large Cheeks: the vertical face on the dead high-end
    wall, lying on a band end (5a: y = 300, 75000 cm²). Decision 75 retags these.
  - All other cases show none in both.

  **Roof-gable's CHEEK verdict is a height-measurement notion, and the union's Cheek is a tag on a surviving face.** The
  two are not expected to coincide.
- **F30. The 1e-5 normal rule cannot hold on snapped vertices.** Case 7f's 85° face is about 2.3 cm wide in plan, and
  the 1/1024 cm snap tilts its normal by 1.86e-5. Before the snap, the worst over 602 case triangles is 1.85e-7.
- **F31. With `far: 'plane'`, no generated piece's band leaves its island, and none reaches the bbox cap**, over all
  10 fixtures and 49 cases. The footprint trim and the cap act only on hand-made pieces. They are guards, not live
  geometry, today.
- **F32. The C++ net makes the dead high-end wall `ECellNetSurfaceForm::Gable`**, the same as a promoted wall
  (`pisteperfect-5-7-27`, 2026-11-07). Decision 75 matches it.
  - `IsStandingWallSegment` counts promoted and Dead sides (`ModularRoofPieces.h:27`, set by `MarkDeadWalls`).
  - `StandingWallLines` feeds `WallFaceOf` into `Geometry.VerticalFaces` (`ModularRoofComposition.cpp:278-284`).
  - `AddWallGable` builds each one (`ModularRoofAssembly.cpp:47-74`).
  - Its roof meeting gets `WallPlate` and `Verge` from `AppendRunPlatesAndVerges` (`ModularRoofNet.cpp:73-106`). The
    Verge is horizontal at a monopitch's high end, which agrees with table 21's convex Roof-Gable `Verge`.

  **Divergence: the C++ makes Cheeks Gables too.** `AddCheekGable` (`ModularRoofAssembly.cpp:76-98`) adds a Gable
  over no run, carrying `RaisedByRun`, `CheekOrigin` and `CheekAxisU`, with its columns on the plan lattice. The
  prototype instead gives a Cheek no Cells, and decision 46 makes a surviving Cheek fail every fixture.
- **F33. Under decision 75, the union shows a Cheek only where B says CHEEK: cases 2b, 4b and 8b**, each a band-end
  face standing on no wall line. They are 2b at y = 150 (11250 cm²); 4b at y = 150 and y = 350 (11250 cm² each,
  one identity); and 8b at x = 800 (17500 cm²). Cases 5a to 5e now show none. B's CHEEKs on 2d, 3c and 4l still have
  no surviving Cheek in the union. Measured at `9d90583`.
- **F34. Decision 75 as first ruled matched a wall's infinite plane.** A U with rects `[0,0,200,600]`,
  `[0,0,1000,200]` and `[800,0,1000,600]`, with `{y:0, to:200, form:'gable'}` at 45°, has a band-end cheek at
  x = 200 over the spine's hip. That cheek was tagged Gable on wall 8, the arm wall x = 200 spanning y 200 to 600, on
  30000 cm² where wall 8 does not stand. `cheeks` read 0. The same U without the left arm reads `cheeks` 1. Measured
  by the WP2 correctness reviewer's probe at `9d90583`. Decision 80 amends the rule.
- **F35. The C++ roof Cell rules** (`pisteperfect-5-7-27`, 2026-11-07). Paths are under
  `Source/PistePerfect/Private/Buildables/ModularBuilding/`. `WholeCellTolerance` is 1e-6 Cell
  (`Public/.../ModularWholeNumber.h:12`).
  - **Squares are assigned by their centre.** `FaceHolding` takes the highest face holding the centre, and
    `WinsTie` breaks ties: a face on a gabled run gives way, then the lower PlateRun wins. PlateRun is
    Ring-dependent. See `Roof/ModularRoofAssembly.cpp:171-252`.
  - **Only axis-aligned ridges snap** (`IsOnRidge`, `NearestCellLine`: a halfway tie takes the lower line, at
    `Roof/ModularRoofNet.cpp:203-232`). Ridge edges can lie between Cells of one face.
  - **Hip and Valley are read by plane pair, with no proximity check** (`RoofInteriorKind`, `:234-271`).
    Otherwise the kind is RoofInterior.
  - **No square is ever lifted.** Each level has one flat `RoofGrid` at plate height
    (`Net/CellNetSurfaces.cpp:166-259`). Tiles are laid per face, and line Pieces are framed on the true lines
    (`Realisation/ModularKitFrames.cpp:105-241`).
  - **Roof Cells are a topped-out Ring's interior less whatever Rings stand over it** (`:161-227`). Burial drops only
    a square that is wholly inside another solid (`Roof/ModularBuriedCells.cpp`).
  - **Verge pairs by column**, with the roof Cell matched to the column's highest Gable Cell, and WallPlate replaces
    Eaves at gable columns (`Roof/ModularRoofNet.cpp:73-106`). Eaves versus RingJunction reads a Ring's top row
    (`Net/CellNetEdges.cpp:286`).
  - **Unverified by the author:** how `Plan.RoofOfCell` is built, whether edges cross roof grids, and how
    `ReflexCornersOfCell` is used.
- **F36. The union's float32 output carries distinct vertices 7.6e-5 to 2.3e-4 cm apart**, which step 4's
  `vertexAt` refuses (`edges.ts:85-101`).
  - It fails 16 of 80 random Ring fixtures and 161 of 580 pitch-sweep cases (20° to 70° in 0.173° steps), at both
    `16f57d6` and `e117f4f`. Example: a `[0,0,600,400]` box with y = 0 gabled at 20.346°.
  - The ten fixtures happen to avoid it.
  - Measured by the WP3 correctness reviewer (`probe10.mjs`, `fuzz3.mjs`, `fuzz4.mjs` in the scratchpad).
- **F37. F3's nudge regressed 8 of the 580 sweep cases** that built before. Example: the same box gabled at 26.574°.
  The rake apex sits 0.059 cm above z = 450, so the apex Verge NetEdges are 0.131 cm long, and the run falls outside
  every fan wedge (`probe11.mjs`).
- **F38. Piste Perfect's content defaults** (`pisteperfect-5-7-27`, 2026-11-07, from `ContentSource/Core/tables/`):
  - storeys are 250 cm and fixed (`tagged_architecture_grammar.json:5`). The spec's 300 came from the C++ test
    fixtures (`ModularExteriorManifoldSpec.cpp:5`).
  - Cells are 50 cm (`tagged_modular_building_system.json:4`).
  - **The default Grammar:**
    - roof pitch 22.5°;
    - walls facing E and W are gabled, and walls facing N and S are pitched;
    - the default Ring is 1000 × 1000 at storey 0;
    - limits: at most 3 storeys, 4 Rings and 12 corners per Ring, a wing aspect of at most 4, and right angles only.
  - There is no minimum Ring side.
- **F39. Before WP3.2, raw unions broke step 4 in several ways besides F36 and F37**:
  - "neither on a ShellEdge nor a lattice line", in 24 sweep cases;
  - NetEdge mismatches, in 3 random cases;
  - "closed run with no bend", in 2;
  - "loop keeps 2 endpoints";
  - thrown WASM pointers.

  Cleaning and the bisector fix cured all of them. Cleaning touched 188 of 580 sweep cases and 20 of 80 random ones,
  with a largest move of 1.74e-3 cm. It touched none of the ten fixtures' unions. Measured by the WP3.2 delegate at
  `fb150ed`.
- **F40. At `fb150ed`, fresh random seeds still fail about 1% of cases** (4 of 420 over seeds 2 to 4): three pinched
  unions (C1) and one cap oscillation (C2). The gated seed and the sweep pass, because WP3.2 was tuned on them.
  Measured by the WP3 correctness reviewer (`probe15` to `probe17`). An empirical tolerance gated on its own training
  inputs does not show generality.
- **F41. The re-tag pass tags each output triangle once, at its centroid, but the union can merge coplanar regions
  of different identity into one triangle.**
  - **At 250,** NarrowUpperStoreyGabled's whole y = 0 region becomes one triangle, (0,0,250), (600,0,250),
    (300,0,769.6), carrying storey 0's Gable faceID. Its centroid falls in storey 1's Wall rectangle, so all
    155884.57 cm² is tagged `Wall|1`, and storey 0's Gable comes out at 0.
  - **At 300,** Manifold triangulated differently, and the fixture passed by chance.
  - **The defect is latent:** a corners-only probe found 7 mislabelled robustness cases at 300 and 2 at 250, each
    passing every invariant.
  - Measured by the WP3.2/3.3 delegate (`wp33-probe-c.mjs`).
- **F42. C1's pinch is the ordinary "upper wall flush over a lower reflex corner" shape.** In Fuzz109, storey 0
  `[70,30,290,270]` ∪ `[80,260,460,450]` has a reflex corner at (290, 260). Storey 1 `[180,100,390,260]` has its
  y = 260 wall flush with the lower wing's y = 260 wall, passing over that corner.
  - **The air under the overhang** is the single octant x > 290, y < 260, z < 300.
  - **The air above the lower roof** lies at y > 260 and z > 300, above roof planes that pass through the corner
    point.
  - **The two pockets meet only at (290, 260, 300).** The solid is valid, but its surface is two cones touching at
    one vertex, which Manifold correctly writes as two coincident vertices.
  - **It is routine geometry.** Stacked walls are routinely flush on a 50 cm lattice.
  - Checked by the lead by reasoning over the octants, which agrees with the WP3 correctness reviewer's report.
  - **The pinch extends along an edge,** per the WP3.4 delegate. Both sheets also share the overhang's foot, from the
    corner to the overhang's far end. In FlushOverReflex that runs from (300, 300, h) to (450, 300, h), and the union
    writes it as two coincident ShellEdges.
- **F43. Length and area tolerances disagree on slivers about 0.01 × 0.02 cm.** In G58h270, at 270 cm storeys, the
  rake passes 0.017 cm above the lattice corner (50, 0, 350).
  - **The vertices are kept.** Its two lattice crossings, (49.989, 350) and (50, 350.017), and the corner itself all
    lie more than 0.01 cm apart.
  - **The Cell is dropped.** The piece between them is 9.35e-5 cm², under 0.01², so it goes, and its sides are left
    as one-Cell NetEdges.
  - The same happens at x = 550, and in G52h270u and G58h270u.
  - Found by decision 108's storey-height grid at 270 cm, a height no fixture or earlier sweep used. Measured by
    the WP3.4 delegate.
- **F44. The C++ poke-out regression fixture tests a different regime at content's 250 cm storeys.**
  - **At 300:** Ring 1 `[150,0,450,200]` pokes about 40 cm out of the 60° lower roof (559.8 at x = 150, under the
    600 plate).
  - **At 250:** it is fully enclosed (509.8 at x = 150, over the 500 plate).
  - **Keeping the poke at 250:** on the 50 cm lattice that needs `[100,0,500,200]`, which pokes about 77 cm.
  - This is decision 108's lesson in a real C++ regression. The port lead was told, and advised to carry both
    heights. Hand-computed by the lead.
- **F45. Fresh-input failure rates fall with each hardening round:**
  - pitch sweep before WP3.2: 28%;
  - fresh seeds 2 to 4, at `fb150ed`: 1%;
  - grid, at `3575aa7`: 3 of 612;
  - fresh seeds 5 to 12 at 250, 263 and 300 cm, at `3575aa7`: **9 of 3360 (0.27%)**;
  - sweep at 263 and 275 cm: 2 of 1160.

  Each round surfaces rarer classes, all numerical degeneracies at near-coincidences, and none has been a defect in
  the model. **The generator is tuned to its own inputs:** a fixed pitch list, a 10 cm footprint grid and whole
  degrees, so deliberate near-coincidences (δ-nudges of 1/1024 cm) reach classes that random sampling does not.
  Measured by the combined reviewer (`review-*.test.ts` in the `review-3575aa7` snapshot).
- **F46. The C++ facts for the wire format** (`pisteperfect-5-7-4f`, 2026-11-08, read from its headers):
  - **Geometry** is actor-local plan cm. A Ring is a root component with exactly four Corner children in slot
    order; side i runs from corner i to corner i+1 and is owned by corner i (`ModularRingOps.h`, `ArchitectureRings.h`).
  - **Forms:** `EModularRoofForm {None, Pitched, GableEnd, Monopitch, Flat}`.
    - The player's per-wall request is a PlateRun Stroke: auto, Hip or Gable.
    - Pitch comes from the solved Type, per run (`FModularRoofRun {Form, PitchDegrees}`).
  - **Ordering:** the ring index is root order, and each Ring is its own root.
  - **Storeys:** `FCellNetRingStoreys {BaseStorey, Storeys, WallHeightCm}`.
  - **The current C++ net has no vertices.** Its Cells, Edges, Surfaces and roof faces are cheap to serialise.
  - **Not verified by the port lead:** that ascending component index always matches root order.
