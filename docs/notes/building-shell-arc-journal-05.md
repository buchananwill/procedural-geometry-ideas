---
title: "Building Shell Arc: Session 5 Journal"
type: workflow
area: building-shell
status: active
date: 2026-11-15
record_of: ["./building-shell-gable-rise-proposal.md", "./building-shell-viewer-editing-proposal.md", "./building-shell-gable-stretch-settings-decisions.md", "./building-shell-prototype-decisions.md", "./skeleton-wavefront-order-decisions.md", "./holed-skeleton-roadmap.md", "./holed-skeleton-vision.md", "./skeleton-loops-input-decisions.md", "./skeleton-join-and-divide-decisions.md", "./skeleton-edge-acceptance-decisions.md", "./ISSUE-skeleton-edge-accepted-before-its-face-closes.md", "./skeleton-loop-consumers-decisions.md", "./skeleton-simultaneous-rings-decisions.md", "./skeleton-loop-contact-decisions.md", "./dashboard-holed-fixtures-decisions.md", "./building-shell-holed-roof-decisions.md"]
---

# Building shell arc: session 5 journal

**This is the head of the thread**, continuing [session 4](./building-shell-arc-journal-04.md). Decisions continue at
334 and findings at F107, cited project-wide as BSA.D334 and BSA.F107.

## Reading order for a fresh context

1. §2, §4 and §5 below, then §3 for the operational manual.
2. Earlier decisions and findings only where this journal cites them, each with `journal.py show <id>`. **Do not read
   any journal end to end**, this one included.

## 1. The arc's charter

The user (2026-11-12): the manifold-based roof solver is now ported to C++. Two extensions are wanted, and this
session produces a **proposal for each**, with the lead onboarding through delegates:

1. **Editing in the web viewer**: the simplest UI for adding Rings and storeys, resizing Rings, adjusting the pitch
   of roof sections, and choosing hipped or gable runs.
2. **Gables at (at least somewhat) arbitrary locations along a straight wall** whose remainder is hipped. Today the
   solver does not support the mix. A narrow step-out in plan fakes it, and the user rules that workaround
   unsatisfactory.

The vision is still the spec's four-step model: every storey built alone, stacked, one union on raw geometry, Cells
only on the final faces.

**What the charter became.** The user accepted both proposals on the first day, and both were built overnight
(decisions 192, 196, 200). On the second day the user tried the editor, and the session turned into the user
finding wrong roofs by building them and the lead tracing each to a rule and changing it. The charter's second
item is now wider than "a gable on part of a wall": it is that the roof's rules apply consistently whatever
surrounds a gable, and that what has no objective answer is the author's setting (§4, "How the user is steering").

## 2. State as at bootstrap

- Branch `feature/skeleton-holes` at `0ddb56b` (session 4's closing commit), no upstream, nothing pushed or merged.
  Clean at bootstrap apart from this journal and the closing mark on session 4's.
- **The suite's figures are inherited, not re-run this session:** core 6,634 passed, 10 failed by design, 10 skipped;
  building-shell 9,710 passed, 4 failed by design; dashboard 609. Measured by session 4's delegates (BSA.D333).
- Session 5 opened on 2026-11-15 with the user's steer: node 8 is the arc's remaining unit, and the mixed-pitch island
  issue note is discussed first.

## 3. Operational manual

Carried by reference: [session 1 §3](./building-shell-arc-journal.md#3-operational-manual), with one addition.

- **The C++ UI/UX polish arc lead is the Claude session `claude-work-ec`** (arc MBU, modular-building-ux; it
  confirmed this on 2026-11-12). It cannot read this repo, so send it essentials as text. The data-typing refactor
  is led by a different session.
- **The C++ project is at `D:\Coding\resort_game\PistePerfect_5_7`** and this session may read it (the user,
  2026-11-12). It is about 500k lines on top of the engine, so **go in with a named target, never a browse**. F63
  names the first ones: `Shell/BuildingShellTags.h` (`EBuildingShellKind`), `Roof/ModularRoof.h`
  (`IsModularClampFlatFace`), `Rules/ModularClampRoof.h`, and decision MB.D525 in that project's journal.

- **A delegate's browser snapshot goes in a folder below `D:\Coding\`, never at the root of a drive** (learned
  2026-11-13). The snapshot must be on D: for the WASM to load (the selector's delegate found Vite would not serve
  `manifold.wasm` across drives). The harness refuses to remove a folder at a drive's root, so a snapshot at
  `D:\wpv3-snapshot` could not be cleaned up by the delegate or the lead and was left for the user. Explorer then
  reported it "in use", wrongly: nothing held it, and a pnpm install's nested junctions defeat Explorer. What
  removes one is `cmd /c "rd /s /q <folder>"` from PowerShell. From the `!` prefix, which is Git Bash, write
  `cmd //c "rd /s /q <folder>"`, or Git Bash rewrites `/c` as a path.
- **In PowerShell `rd` is `Remove-Item`** and takes no `/s /q`. Windows PowerShell 5.1's `Remove-Item -Recurse` is
  unreliable on junctions.

**Added in session 4, for work in `packages/core` and across packages:**

- **One editor in the working tree at a time.** A reviewer or a measurement works from its own copy:
  `git archive <commit> | tar -x -C <a directory of its own under the system temp directory>`, with junctions to the
  repo's `node_modules` removed by `rmdir` before the copy is deleted. The session scratchpad is shared between agents,
  and one agent's copy there was deleted by another: each agent names a directory of its own.
- **Heavy suites are run one at a time.** Building-shell's Vitest has a 5 s timeout per test, and it failed spuriously
  twice when core's Jest or the sweep harness ran beside it.
- **The sweep harness** is run from `packages/core` with `SWEEP_OUT=<prefix>` and `--testPathPatterns=sweep-harness`;
  without `SWEEP_OUT` it is skipped. Its output files are compared between trees; they are the byte-identity gate for
  single-loop solves, with `full-graph-digest.test.ts`, the recursion census and building-shell's golden drift test.
- **The dashboard's Jest reads `@proc-geo/core` and `@proc-geo/test-fixtures` from `dist/`.** Build both before running
  it, and again after changing either. One of its tests fails by name when core's built declarations are stale.
- **Core's Jest does not type-check its tests** (ts-jest runs with `isolatedModules`); `tsc --noEmit` on core covers the
  source only.
- **A delegate's commit carries its own model's co-author line,** whatever line the brief gives it; the delegates'
  harness rule takes precedence.
- **A stated closed form is checked by building it.** Twice this session a rule the lead approved on reasoning alone was
  wrong when built: a clearance bound per wall (BSA.D312) and the holed hip solid's bottom at the plate (BSA.D326).
- **Fourteen tests are red by design** at the close of session 4, listed in §4. A suite figure is read against that
  list, not against zero.

## 4. Next work

**Session 4 closed on 2026-11-15 (BSA.D333).** Its work was the straight skeleton for a footprint with holes, under an
approved vision and roadmap (BSA.D286): [holed-skeleton-vision.md](./holed-skeleton-vision.md),
[holed-skeleton-roadmap.md](./holed-skeleton-roadmap.md). Branch `feature/skeleton-holes`, cut from `ee84976`, at
`9d907e0` plus this journal's closing commit, with no upstream. **Nothing is pushed or merged.**

**Built, as local commits, each reviewed independently and its review answered:**
- Node 1, the wavefront's order stored as links: `7b6ef97`, `a997110`, `c9c1b30`, `823211a` (BSA.D295).
- Nodes 2 and 3, an outline with holes as input: `57f6967`, `f008560` (BSA.D299).
- The edge-acceptance cure, approved by the user: `420c604`, `8170011`, `3a92a28` (BSA.D296, BSA.D304).
- Node 4, join and divide: `a8ba71f`, `9164e92` (BSA.D312). The causality check compares times: `8887d65`.
- Node 5, simultaneous events across rings, so axis-aligned courtyards solve: `3abb3ac`, `ad45ddd`; the guard on holed
  solves: `fae1b8d`, `7e6105c` (BSA.D320).
- Node 6, loop-aware consumers and a holed roster of 21 fixtures: `9b5f90c`, `dd191e5` (BSA.D316).
- Node 7, the dashboard: `9c0389a`, `b575a0c` (BSA.D324).
- Node 9, building-shell on the holed solve, the cut deleted: `a66d122` to `f822370`, `96148ec`, `2a5a44d`, `8be3a7f`
  (BSA.D330).
- **Not built: node 8, contact between loops.** Its spec,
  [skeleton-loop-contact-decisions.md](./skeleton-loop-contact-decisions.md), is `approved` (BSA.D332) with three
  conditions. No caller needs it yet (BSA.D319).

**Figures at close, by delegates, not re-run by the lead:** core 6,634 passed, 10 failed by design, 10 skipped;
building-shell 9,710 passed, 4 failed by design; dashboard 609. Single-loop sweep records were byte-identical at every
unit.

**Fourteen tests are red by design, each with an open issue note:** five in `weighted-time-order.test.ts`, one in
`holed-simultaneous-rings.test.ts`, four in `straight-bisector.test.ts` (core); four in `mixed-pitch-island.test.ts`
(building-shell).

**For the user to rule on. None of it was decided by the lead.**
1. **A reflex bisector that is not primary is never tested for a split.** Wrong skeletons on 4.25 percent of a random
   weighted single-loop fuzz, and by one specimen at unit weights too. Cause confirmed by asking the solver directly.
   [ISSUE-skeleton-weighted-edge-runs-backwards-in-time.md](./ISSUE-skeleton-weighted-edge-runs-backwards-in-time.md);
   BSA.F102, BSA.D312, BSA.D319. The unit-weight specimen is in BSA.D319 and not yet in the note.
2. **A straight bisector between collinear walls that face the same way** goes wrong in one-ring steps, on single loops
   today; the mis-pairing in the pairwise fallback is traced.
   [ISSUE-skeleton-straight-bisector-between-collinear-walls.md](./ISSUE-skeleton-straight-bisector-between-collinear-walls.md);
   BSA.F103, BSA.D318.
3. **Single-loop islands of mixed pitch build folded roofs in building-shell,** since before this arc. Making a
   causality diagnostic a hard error there would catch 32 of 53 measured and refuse no sound roof in that sample.
   [ISSUE-building-shell-mixed-pitch-island-folded-roof.md](./ISSUE-building-shell-mixed-pitch-island-folded-roof.md);
   BSA.F105, BSA.D330.
4. **Whether the holed guard should also run on single loops** (BSA.D314). The lead recommends it; it would turn some
   existing results from complete to incomplete.
5. **Eight layouts in `tests/courtyard.test.ts` that built under the cut are refused by the holed solve** and are hard
   errors naming the island; two are shapes a person would draw, `CourtL` and `JutAlignedS`. Landed by the lead in the
   user's absence, reversible (BSA.D321).
6. **What stays refused by name:** three fronts meeting at one point, met by 20 of 400 two-courtyard layouts on a grid.
   [ISSUE-skeleton-three-front-meeting-refused.md](./ISSUE-skeleton-three-front-meeting-refused.md); BSA.D311, BSA.D313.
7. **What the holed guard cannot see:** overlapping collinear arcs. Telling them from a sound sliver needs a bar below
   the perceptual floor (BSA.D320). A holed result marked complete has passed five checks and is not proved right.
8. **A tuck that splits a face is still unhandled** if one arises; reading faces through a tuck would be a new rule
   (BSA.D327). And why Manifold leaves a tuck is still unknown; the lead recommends its own investigation (BSA.D331).
9. **Push, and merge to `main`.**

**How the user is steering,** added to session 3's list:
- Specs are drafted by a delegate; the lead reads and approves, each node's spec under the approved roadmap (BSA.D286,
  BSA.D288).
- Commit code after a unit is built and tested, before review and after; never leave notes uncommitted for long
  (BSA.D287).
- Byte identity is the cheap test of sameness, not a hard stop: diagnose a divergence, then fix it or write why it is
  acceptable (BSA.D284). Golden bytes that move for a stated cause are simply re-exported and reported (BSA.D329).
- Where the stored links and the old id arithmetic differ, the old approach was wrong (BSA.D291).
- A failing holed fixture is a red test with an issue note (BSA.D284). A refusal by name is a guard in production code,
  and its test is green on the guard (BSA.D311).
- One rule is preferred to two where it can be had (BSA.D328), and a rule that only trades defects is not adopted
  (BSA.D331).
- The lead may steer through an approved roadmap unattended, leaving to the user anything that changes how single-loop
  events resolve, moves a tolerance, or changes a clean fixture's answer (BSA.D301).

**Next, in order:**
1. **The user's rulings on the list above,** items 1 to 4 first: they decide whether weighted and collinear-wall inputs
   can be trusted, which building-shell's mixed pitches and grid-drawn footprints depend on.
2. **Node 8,** if wanted now: dispatch its approved spec to one Opus delegate with the conditions of BSA.D332, then an
   independent review.
3. **Amendments owed by the lead and not made:** node 4's spec, a line that its fixtures moved to the roster (BSA.D305)
   and the amendments node 5's spec lists in its decisions 41 and 42 (BSA.D320); the unit-weight specimen into the
   weighted issue note (BSA.D319).
4. **Session 3's carried items** (its section 4, items 2 to 8), untouched this session: the review of
   `f388632..011455d`, the scope of BSA.D266, the corner sliver, one path for all gables, and the merge of
   `feature/building-shell-covered-storeys-and-sections` to `main`, from which this branch was cut.

## 5. Open items

Carried by reference: [session 1 §5](./building-shell-arc-journal.md#5-open-items), plus the "Raised and not yet ruled"
list in the covered-storeys findings. Session 2's items follow, with those session 3 closed or changed marked, and then
session 3's own.

**From session 2:**

- ~~**A pipeline hard error reached by ordinary editing** (F64), and `s1h263/Court25`'s class.~~ Both Cell-laying throws
  are the union's tuck, labelled since `150e45c` (BSA.F87, BSA.D277). F64's own random layout was not rebuilt to confirm
  it.
- **Conflict reporting depends on triangulation** (F69). A fix belongs to the re-tag pass, not to rises.
- **Fused contact between a rise and an overhanging floor** needs an Edge kind for Gable–Underside (F71) before it can
  be a policy.
- **Golden inputs that build a rise are not C++-replayable** until the port builds rises (F74, session 2's decision
  249).
- **Whether the C++ shell-to-net adapter accepts a horizontal Roof face** (F63, F65). Unread on the C++ side.
- **The courtyard cut's overshoot** (session 1's decision 172): six of its fixtures were tucks and are cured (BSA.D276,
  BSA.D277). `s13/Court13`, `s2/Court15`, `s7/Court38`, `CutOvershootProbe` and the `Courtyard@` cases have no fold and
  are unchanged. A skeleton that takes a hole would remove the cut they depend on (BSA.D280).
- ~~**`s13/Court21` throws in Cell laying.**~~ Cured by the tuck pass; it builds with 1 Cheek (BSA.D277).
- **`cleanMesh` fails on a low cap at a convex corner** (F83). `RISE_MIN_CAP_CM = 5` guards it.
- **A stretch standing apart that a file splits into several runs builds several gables** (session 2's decision 256,
  M1).
- **The page imports the golden fixture set at start-up** (session 2's decision 248). Its load time is unmeasured.
- **Two measurement probes throw on a rise with no limit** (session 2's decision 238), and
  `experiments/gable-rises/claimed-band.ts` still restates the two-pitch sub-rule that BSA.D264 removed.
- **The editor's tests of `main.ts` and `edit-panel.ts` are browser runs by delegates**, not suite tests.
- **Shrinking a Ring past a rise and growing it back loses the rise** (session 2's decision 216).
- **The build blocks the main thread** (F64). No Worker.
- **Type backlog**: `saveMark` takes an inline object type; `offsetAlong` in `viewer/edit.ts` repeats `sideOffset` in
  `ring-forms.ts`.
- **The long links** (F64): about 1,000 characters per Ring, uncompressed.

**Added in session 3:**

- **A courtyard with a wing jutting out on both sides throws "no raw Ring wall cuts the courtyard"** (BSA.F90). It has
  no red test and no issue note, which BSA.D266 calls for; neither was written because the user said to dispatch no fix.
  Input in BSA.F90.
- **The cut branch of `buildPieces` in the pinned roof copy** still shapes a cut piece's ends from walls beyond the cut
  (BSA.F89). BSA.D278's rule only keeps such cuts away from it.
- **The scope of BSA.D266 is not ruled:** the older throw pins (33 throwing catalogue entries at F79, fewer since the
  tuck pass); pins of surviving Internal faces, Unclassified Edges and conflicts; and `KNOWN_DEFECT_POLYGONS` in
  `@proc-geo/test-fixtures`, whose pinned signatures the project's CLAUDE.md states as policy.
- **Five opt-in throws had no record** (BSA.F85): `s12/Court16` at three heights and `s6/Court8` at two. BSA.F87 found
  them to be tucks; whether they build since `150e45c` was not measured.
- **None of the four packages of this session has had an independent review** (`f388632..011455d`).
- **Why Manifold leaves a tuck is unknown** (BSA.F87, BSA.D277). The experiment of pushing a covered gable into the Ring
  that covers it was offered and not run.
- **A Ring of zero area or zero storeys is dropped as vacuously covered**, and the `input@1` report says nothing of
  dropped Rings (BSA.D271).
- **The random generator draws a Ring inside another in about 9 percent of its draws**, which are now single-Ring cases
  (BSA.F86); and no generator draws a wing beside a courtyard (BSA.F89).
- **Stale names left in the code:** the emptied residue classes in `golden.ts` and `pin-table.ts` (BSA.D277, BSA.D279),
  and Cheek pins worded "cheeks 1, expected 0", which predates BSA.D260.
- **`COURTYARD_JUT_WING` is a test fixture only**, so the viewer's selector does not list it (BSA.D279).
- **BSA.D268 links two issue notes that were merged** into [the union tuck note](./ISSUE-building-shell-union-tuck.md).
- **Owed to the C++ port** when a session has it: `droppedRings`, `tucks`, the `Tuck` kind, the cut rule of BSA.D278,
  and the removal of the two-pitch sub-rule.

**Added in session 4, the holed skeleton:**
- **An exterior edge is accepted before its face closes** on five solves (BSA.F95, BSA.F96), with an open issue note and
  a red test. Whether and when to fix it is the user's (BSA.D291).
- **The direct-strike split path has no neighbour guard** (BSA.F96, BSA.F98). Guarding it helps six sweep cells and
  harms `offedge:plus:k8:s47514`; that cell is undiagnosed and nothing is applied.
- **`partitionSpan` is the last id arithmetic in the event path** (stage 1 spec decision 33). Node 4's spec replaces it.
- **For node 4's spec, from the stage 1 review (BSA.F97):** the struck segment is searched over the whole graph; the
  guard is asked of the first validating segment only; `ringsOfSubPolygon` returns `null` when an edge bounds two
  segments; `asWholeEvents` wants one ring per merge; the partition dedupe is keyed on exterior id; `hasInteriorLoop` is
  not segment-aware.
- **54 along-edge sweep cells now fail on a degenerate ring with no event,** where they used to fail on a shattered
  partition (BSA.F96). Incomplete before and after.
- **The never-born splice is sound only for a whole ring of unborn bisectors,** and a throw in mid-layer leaves pending
  tokens in the link arrays (BSA.F97).
- **The project CLAUDE.md is stale in three places:** `handleInteriorEdges` is `handleInteriorNGon` (BSA.F91); the
  corpus is 53 clean and 7 defect (BSA.F92); `src/roof/` is not a byte-identical copy and its test pins behaviour
  (BSA.F94).
- **Added at the close of session 4, each smaller than §4's list for the user:** the direct-strike split path has no
  neighbour guard, and guarding it helps six sweep cells and harms one (BSA.F98); sub-floor cycles round hub nodes on
  three sweep cells (BSA.D302); 54 along-edge sweep cells fail on a degenerate ring with no event (BSA.F96); the
  dashboard's step-through drops step failures on single loops, and on a single-loop refusal draws the stale skeleton as
  live (BSA.D308, BSA.D324); the conflict list misses real overlaps of up to about 5 square metres, as before
  (BSA.F105); the early-acceptance file's roster cases cost four minutes of suite time for a guard that is now true by
  construction (BSA.D304); the piece rule's fallback and the splice of a never-born bisector are reached by no roster
  (BSA.D318, BSA.F97).
- **Owed to the C++ port, recorded and not designed** (BSA.D281): everything in this session. The solver's wavefront
  links, the holed input and loop table, the acceptance predicate, join and divide, the cross-ring events, the guard,
  the loop-aware consumers; and in building-shell the holed `Comp`, the deletion of the cut, 25 renamed goldens and
  every courtyard golden's bytes.

## Decisions

- **334. The user, 2026-11-15: A delegate analyses the user's seven hand-made layouts to find the failure mechanism
  behind the mixed-pitch folded roof,** before any ruling between the issue note's two cures.
  - The inputs are `apps/building-shell/out/CourtyardJutCutSwapped-draft.input (3).json` to `(9).json`, git-ignored
    downloads from the viewer. The user's verdicts: 3 passes, 4 fails, 5, 6 and 8 pass, 7 and 9 fail.
  - The user's observation on 6 to 9: varying a roof pitch moved the point where a hip meets a ridge until it collided
    with or overtook a valley, and there the model failed.
  - The user's advice: fuzz on the parameters that differ between these files.
  - The work is read-only on production code; it returns a finding, and no cure is built.

## Findings

- **F107. The mixed-pitch folded roof is one tie-break in core's pairwise fallback: a level ridge reached at one moment
  by two vertices at two points is paired with the farther one, by edge id.** (a read-only Opus diagnosis delegate under
  @D334, 2026-11-15; scratch scripts and results in apps/building-shell/experiments/mixed-pitch-mechanism/, uncommitted)
  It is the branch the collinear-wall note calls K1, without that note's precondition.
  - The user's seven layouts are all single-loop islands. Files 4, 7 and 9 return `complete: true` with no causality
    diagnostic and no refusal, build a wrong roof, and then throw in Cell laying on a Cell corner. Files 3, 5, 6 and 8
    are sound.
  - **The trigger is the order of two edge events at Ring 0's tab:** its N wall collapses at t0 = 200 / (w9 + w1), its E
    wall at t1 = 100 / (w0 - w2). The layout is sound when t0 < t1 and folds when t1 < t0. The thresholds are E =
    23.0815 degrees with N 22.5, and E = 41.596 degrees with N 29; fine sweeps bracket both. File 4 reaches the same
    flip through Ring 3's top wall.
  - **The fold itself is downstream,** at Ring 2's level ridge (x = 895.21, t = 84.93 in file 7): merges `[21,22]` at
    150.4 cm along the ridge's ray and `[16,22]` at 210.3 cm arrive together. `asWholeEvents` refuses them because they
    share an edge (`algorithm-complex-cases.ts`, `mergesShareAnEdge`, about line 569), the pairwise fallback runs (about
    624 to 627), and `byEventPriority` falls through to `compareEdgeIdLists`, which takes `[16,22]`, the far one. A node
    then lands inside another wall's face.
  - **The user's reading is partly right:** the tab's hip-hip meeting point passing the valley's meeting point is
    exactly the trigger; the fold is about 600 cm east and 53 time units later.
  - **Tested by counterfactual, not by resemblance.** A scratch copy of `algorithm-complex-cases.ts` that orders two
    pairs sharing a bisector by distance along that bisector's ray, nearer first, and changes nothing else: all 7 files
    sound and built; all 4 specimens of the issue note sound, their causality diagnostics gone; 571 of 574 failures of a
    local fuzz of 3,000 cured and 0 of 2,426 sound roofs broken; in a reconstruction of the issue note's wide fuzz
    (5,000 draws, mulberry32 seed 20261115, reproducing its 53 wrong roofs, 32 with a diagnostic and 21 without, and
    M4902 at draw 4902) all 53 wrong roofs and 7 roof-stage refusals cured and 0 of 4,899 sound roofs broken. Every one
    of those failures carries a far pairing and no sound roof does.
  - **It is not the weighted note's missed split of a secondary reflex bisector:** opening that path in
    `createCollisions` makes files 4, 7 and 9 worse, by a spurious split. The event the solver needed was already in the
    layer and lost on the tie-break.
  - **The collinear-wall note's precondition is absent in the user's files and three of the four specimens:** the ridge
    lies between facing walls of different pitch. Only M4902's near partner is a true collinear straight bisector.
  - A tie-break on the sum of both rays' distances is wrong: it missed S13R20 and broke 66 sound local roofs.
  - The local fuzz's three leftovers are signalled, `complete: false` with "Failed to collide interior", and carry no
    far pairing.
  - **Not established:** that nearer-first is a sound cure. Core's suite and the pinned sweeps were not run under it,
    and it changes how single-loop events resolve, which BSA.D301 reserves for the user. Also not checked: the
    convention that a gentle face overtakes a parallel slower wall in one instant, against an independent oracle; and
    whether the tie can arise at unit weights without straight bisectors. The roof checker is necessary for a sound
    roof, not sufficient.
