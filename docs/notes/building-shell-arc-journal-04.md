---
title: "Building Shell Arc: Session 4 Journal"
type: workflow
area: building-shell
status: active
date: 2026-11-14
record_of: ["./building-shell-gable-rise-proposal.md", "./building-shell-viewer-editing-proposal.md", "./building-shell-gable-stretch-settings-decisions.md", "./building-shell-prototype-decisions.md", "./skeleton-wavefront-order-decisions.md", "./holed-skeleton-roadmap.md", "./holed-skeleton-vision.md", "./skeleton-loops-input-decisions.md", "./skeleton-join-and-divide-decisions.md", "./skeleton-edge-acceptance-decisions.md", "./ISSUE-skeleton-edge-accepted-before-its-face-closes.md", "./skeleton-loop-consumers-decisions.md", "./skeleton-simultaneous-rings-decisions.md", "./skeleton-loop-contact-decisions.md", "./dashboard-holed-fixtures-decisions.md", "./building-shell-holed-roof-decisions.md"]
---

# Building shell arc: session 4 journal

**Superseded as head by [session 5](./building-shell-arc-journal-05.md),** closed at session 4 closed (BSA.D333); a
fresh context on 2026-11-15 with decision 333 and finding F106. Continues [session
3](./building-shell-arc-journal-03.md). Decisions continue at 281 and findings at F91, cited project-wide as BSA.D281
and BSA.F91.

## Reading order for a fresh context

**Read §4 in full**: it is the state at the close of session 4, the list of what waits on the user, how the user is
steering, and the next work. Then §5 for the smaller open items, and §3, the operational manual, whose session 4
additions are at its end.

**Do not read this journal's Decisions and Findings end to end.** There are 53 decisions and 16 findings from this
session. Fetch one by its id when §4 or §5 cites it, with `journal.py show <id>`. Do not read sessions 1 to 3 except by
id.

For the holed skeleton, these are enough to start:

- The vision and the roadmap, both short: [holed-skeleton-vision.md](./holed-skeleton-vision.md),
  [holed-skeleton-roadmap.md](./holed-skeleton-roadmap.md).
- BSA.F91: why the solver needed its wavefront order stored. BSA.D282: the four stages the user approved.
- BSA.F103 and BSA.D318: the collinear-wall defect and what the guard on holed solves does and does not catch.
- BSA.F102 and BSA.D312: the weighted defect and its confirmed cause.
- BSA.D321 and BSA.D330: building-shell on the holed solve, its measurement and its eight refused layouts.
- BSA.F106 and BSA.D331: why the hip solid keeps two forms.

Each roadmap node's spec is under `docs/notes/` and is named in §4; read a spec only for the node being worked on.

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

- Branch `feature/building-shell-covered-storeys-and-sections` at `ee84976` ("j3 wrapped"), in step with its remote as
  `git status` reports it, clean apart from this journal and the closing mark on session 3's.
- **The suite's figure is inherited, not re-run this session**: 9,992 passed and none failed in 46 files of
  `@proc-geo/building-shell`, typecheck clean, measured by the WP-C4 delegate at `011455d` (BSA.D279).
  `@proc-geo/core`'s Jest suite, which this session's work lands in, has no figure yet.
- Session 4 opened with the user's objective (BSA.D281): a straight skeleton that takes a footprint with a hole.

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

- **281. The user, 2026-11-14: Session 4's objective is to make the TypeScript straight skeleton in `@proc-geo/core`
  solve a footprint with a hole, in this arc's journal.**
  - The user's words: "make the straight skeleton algorithm in this repo able to solve toroidal shapes", opened as
    "journal 4" of this arc, which settles the open question of BSA.D280 on ownership: the work is recorded here, under
    BSA, though the code is `packages/core`.
  - **The C++ port is out of scope for now:** "The downstream impact on the C++ port is not your immediate concern: the
    objective is to upgrade the Typescript, as always the easier-to-iterate frontier."
  - **Method the user set:** Sonnet delegates summarize the system broadly; the lead then reads only the parts of the
    algorithm that break on a holed input; the lead's first reply is its picture of the system and the modification it
    recommends.
- **282. The user, 2026-11-14: The holed skeleton is built in four stages, and the pin on the roof copy is released for
  the files stage 4 must change.**
  - The lead put the four stages to the user, the user restated them and asked "Agree?", the lead agreed with four
    qualifications, and the user answered the one that needed a ruling: "pin released."
  - **Stage 1:** the wavefront's order becomes an explicit linked structure on the live bisectors, and the id arithmetic
    of BSA.F91 is retired. No solver behaviour changes; the gate is the existing corpus solving byte-identically. A
    split event names the segment it struck, not only the edge.
  - **Stage 2:** the solver takes one outer loop and any number of oppositely wound holes. A strike within a ring
    divides it, a strike across two rings joins them, and a containment test hands a hole's ring to the right child when
    a ring divides. Grouping an arbitrary set of closed, simple, non-crossing loops into such inputs by nesting depth is
    a thin helper beside the solver, not the solver. The self-crossing decomposition refuses a holed input at first.
  - **Stage 3:** offset projection, the causality check, strip decomposition and the invariant tests read the loop-based
    graph. The tree-based consumers (`skeleton-tree`, spine, recursive subdivision, parcel slicing) refuse a holed input
    for now, because its skeleton has a cycle.
  - **Stage 4:** building-shell's `solveFaces` passes `outer` and `holes`, and the courtyard cut goes. `solveFaces` and
    the cut branch of `buildPieces` are in `apps/building-shell/src/roof/`, the pinned copy; **the user released the pin
    for those files**, so the copy-integrity test changes with them. This amends the freeze of session 1's spec decision
    31 for those files only.
  - The qualifications on stages 2 and 3 are the lead's, put to the user and not objected to.
- **283. Stage 1 of BSA.D282 is specified in `skeleton-wavefront-order-decisions.md`, status `proposed`, and is built in
  two parts with a stop between them.**
  - **Part A** maintains the neighbour links through every event while nothing reads them, checks their invariants at
    every step boundary, and compares four link-derived answers against today's arithmetic over the corpus, the sweep
    and the census. **Part B** switches the readers, and only those the lead clears.
  - **Why two parts:** the neighbour guard counts un-accepted exterior edges over the whole id space, not places along a
    ring, and the partition gives a bisector to the first id interval holding both its parents. Neither is provably the
    wavefront's true order on a sub-ring, so byte-identity after the switch is a thing to measure, not to assume (read
    in `generate-split-event.ts` and `algorithm-complex-cases.ts`, not run).
  - **A disagreement between links and arithmetic is the lead's to rule on,** never the implementer's (spec decision
    18).
  - **`ringsOfSubPolygon` keeps its `null` verdict through stage 1** (spec decision 20), because that verdict selects
    the pairwise fallback and so is behaviour. Its retirement is stage 2's.
  - **The spec has no `part_of`:** no vision or roadmap for the skeleton exists in the corpus, and the completed
    weighted-offsets spec stands the same way. Approval is the user's by the notes schema; nothing is dispatched before
    it.
  - **The implementer will be one Opus delegate** on the arc branch, by the arc-lead model table for production
    TypeScript.
- **284. The user, 2026-11-14: The user's rulings on the holed skeleton's open points, and approval of the stage 1 spec
  ("The spec looks good").**
  - **Several holes per footprint are supported from the start** ("Yes, from get-go").
  - **Byte-identity for single-loop input is the working bar through every stage, and a divergence is not a hard stop.**
    The user: byte identity "is only a cheap way to say things are the same. It doesn't tell you that the new thing is
    less valid than the old thing. Byte-divergency cannot be a hard stop: you/your delegate must make all reasonable
    efforts to diagnose and either fix the divergence, or document why it can be accepted." The stage 1 spec's decisions
    18, 24 and 28 are amended to this.
  - **A failing holed fixture is a red test with an issue note** (BSA.D266), not an entry in a pinned-defect roster.
    Approved.
  - **The dashboard's fixture loader shows holed fixtures,** with no hole editing: "my eyes have more than earned their
    value in this system."
  - **Stage 4's change to every courtyard golden is expected:** re-export and report the diff, without asking each time.
    Approved.
  - **The work moves to `feature/skeleton-holes`, cut from the tip of
    `feature/building-shell-covered-storeys-and-sections`.** The merge of the older work to `main` stays its own
    question. Approved.
  - **Contact between loops is to be canonicalised, not refused for good.** The user asked whether a hole touching the
    outline is not simply a non-toroidal input the present solver would take with its vertices suitably numbered, and
    whether two touching holes cannot be merged. The lead's answer, by reasoning and not measured: both are right. Loops
    that share a length of wall are one loop once merged (a hole on the outline is a notch in it; two such holes are one
    hole). Loops that share only a point become one loop that visits that point twice, which the solver's contract of no
    coincident nodes does not admit today. So contact is a canonicalisation node of the roadmap, opened by measuring a
    loop with a repeated vertex; until it lands, contact is refused with a diagnostic.
- **285. Part A of the stage 1 spec is dispatched to one Opus delegate on `feature/skeleton-holes`, cut from `ee84976`;
  the vision and roadmap for the holed skeleton are written.**
  - **The dispatch:** spec decisions 1 to 18 and gates 27 to 29, one local commit, no push, stop before part B. The
    delegate measures its own baseline; the figures the lead holds (core 5810 at 2026-09-27, building-shell 9,992 at
    `011455d`) are inherited.
  - **The spec is `approved` by the user** (BSA.D284) and now `part_of` `holed-skeleton-roadmap.md`. Its decisions 18,
    24 and 28 are amended and decision 31 added, for the user's ruling that a divergence is diagnosed and then fixed or
    accepted with a written reason.
  - **`holed-skeleton-vision.md` is set `active` by the lead's reading** of BSA.D280, BSA.D281, BSA.D282 and BSA.D284,
    which made this the session's work. The user has not said the word "active" of it; if that reading is wrong the
    status is theirs to change.
  - **`holed-skeleton-roadmap.md` is `proposed`, nine nodes:** wavefront order; input surface and loop table; boundary
    stage for loops; join and divide; simultaneous events across rings; loop-aware consumers and the holed roster; holed
    fixtures in the dashboard; contact between loops; building-shell. The user's approval of it is what lets the lead
    approve each later node's spec (notes schema, Who Moves What).
  - **The notes of this session are uncommitted** on the new branch; the delegate stages only the spec, to mark it
    `implementing`.
- **286. The user, 2026-11-14: The holed-skeleton vision and roadmap are approved** ("Vision and roadmap approved.").
  The vision stands `active` by the user's word, which settles the reading the lead flagged in BSA.D285, and the roadmap
  is `approved`. From here the lead approves the spec for each roadmap node as a numbered decision, and brings back to
  the user only what the roadmap's standing rules name.
- **287. The user, 2026-11-14: Commit regularly: code after a unit is built and tested and before its review, again
  after the review; notes never left uncommitted for long.**
  - The user's words: "code commits should be after a unit is built and tested, before reviews, and again after reviews.
    Documentation/notes edits can land as is appropriate, but do not leave long stretches of uncommitted notes edits. If
    a work unit is wrapped and the tree is clean of code edits, the notes should be also committed to draw a clear line
    between that unit and the next."
  - **This is standing authority to commit on the arc's branch** without asking each time. Pushing and merging to `main`
    still wait for the user's word.
  - **How the lead applies it:** a delegate commits its unit when its gates are green; the lead commits the notes at
    each ruling that closes a unit, and by path, so a delegate's uncommitted code in the same tree is never swept into a
    notes commit.
- **288. The user, 2026-11-14: Specs are drafted by a delegate; the lead reads, corrects and approves.**
  - The user's words: "have the specs written by delegate, so you only need to read and approve. Otherwise your context
    is bearing the load of gathering the understanding, writing the spec, and dispatching it to an implementer."
  - **Applied from the next spec on:** the lead's brief names the roadmap node, the findings and rulings that bind it,
    and the questions the lead wants settled; the delegate does the reading, verifies the roster by opening each file,
    and returns a spec at `proposed`. The lead approves it as a numbered decision (BSA.D286).
  - The stage 1 spec was written by the lead before this ruling and stands.
- **289. The spec for roadmap nodes 2 and 3, `skeleton-loops-input-decisions.md`, is approved by the lead under
  BSA.D286, with one amendment.** Drafted by an Opus delegate under BSA.D288; read in full by the lead. 48 decisions,
  about 255 lines; it starts when the stage 1 spec is completed.
  - **Its shape:** holes arrive on `solveSkeleton`'s options, each carrying its own weights; the graph gains a loop
    table and the result a per-loop map from the caller's vertices and edges to solved ids, reversal included;
    normalisation, the weight ratio and the division by the smallest weight are global, and canonicalisation, its pins,
    the visible-corner test and winding are per loop; a holed solve stops after initialisation with a blocking
    `holes-not-solved` diagnostic and `complete: false` until node 4.
  - **Rulings on the delegate's interpretations, all accepted:** a refusal is a throw, as the boundary refuses today,
    and "refused with a diagnostic" in BSA.D284 and the roadmap meant a message naming the place (the roadmap's wording
    is corrected); weights sit on the hole object; a merged graph has an empty loop table; the legacy entries refuse
    `holes`; a degenerate hole and a mis-wound loop under `normaliseWinding: false` are refused; contact is anything
    closer than the perceptual floor; the nesting test imports `isPointInPolygon` from `terrain/`.
  - **The lead's amendment (spec decision 38):** the grouping helper and a group's solve measure the floor in different
    unit spaces, so a pair of loops near the floor apart may pass one and fail the other; the solve's throw stands, and
    it is signalled.
  - **Checked by the lead:** the reversal example of spec decision 24 and the reflex count of decision 15, by hand.
  - **Left where the delegate put it:** the causality check's single-ring arithmetic stays for node 4's spec to address;
    collinear overlap within one loop stays unseen, as today.
  - **The delegate's note that the dependency on stage 1 is real:** until part B removes it, `addBisectionEdge` calls
    the span arithmetic during initialisation, across loop boundaries.
- **290. Part A is accepted for commit with the early acceptance of BSA.F95 as a red test and an issue note, and all
  four readers are cleared for part B.**
  - **The early acceptance is not fixed in stage 1 and is not pinned.** Fixing when an exterior edge is accepted changes
    the solver on the existing corpus, which the roadmap returns to the user; pinning the two cells as exceptions would
    make a gate green by asserting a defect, which BSA.D266 forbids. So the invariant gate excludes a solve by the cause
    (an accepted parent on a live bisector), the two complete cells get their own red test, and
    `ISSUE-skeleton-edge-accepted-before-its-face-closes.md` carries the reproduction. Stage 1 spec decision 32.
  - **All four readers switch in part B.** The rings agree everywhere. On segments, the guard and the partition the
    links are the valid answer by the delegate's diagnosis, which the lead accepts on the examples given: a symmetric
    sort key that ties, a span that counts a sibling ring's edges, and a partition that shatters a true ring.
  - **Expected divergences in part B, to be handled under spec decision 31:** the three `offedge:plus` sweep cells whose
    misread split resolves today, and the incomplete along-edge cells whose step failures the partition causes. Each is
    measured before and after on the four oracles, containment and tiling, and reported.
  - **The triangle closure by best collision and the splice of a never-born bisector lack a corpus-level mutation
    conviction.** The first is convicted by the sweep, which is in the suite; the second is recorded as open.
  - **For the user:** the early acceptance is evidence that today's solver is wrong on two complete cells of the
    existing sweep, and whether to fix acceptance, and when, is theirs.
- **291. The user, 2026-11-14: Where the stored links and the old id arithmetic diverge, the old approach was wrong.**
  The user's words: "I agree with your framing that the explicit linked list is flushing out edge case bugs, and the old
  approach was wrong on those divergences." This confirms the lead's clearing of all four readers in BSA.D290, and sets
  the presumption for part B's divergences under the stage 1 spec's decision 31: a changed graph on those paths is the
  cure of a defect, still measured and written up before a pin moves. The user did not rule on fixing the early
  acceptance of BSA.F95; the lead proceeds as it proposed, with a confirming diagnosis after part B is committed and no
  fix until the user asks for one.
- **292. Stage 1's parts A and B are accepted as built at `a997110`, with three rulings, a small follow-up to the
  implementer and an independent review before the spec is marked completed.**
  - **`partitionSpan` stays through stage 1** (stage 1 spec decision 33): keeping ids as they are outranks removing the
    last id arithmetic while it decides no child step. Node 4's spec replaces it.
  - **The guard gets a standing test** on `offedge:plus:k7:s7919`, the one cell it decides. Conviction by a harness the
    suite skips is not a gate.
  - **The never-born splice gets a constructed unit test,** as the pair collapse and the vertex-to-vertex event did,
    since no roster reaches it outside the excluded path.
  - **A measurement, not a change:** what moves if the neighbour guard is also asked on the direct-strike path, where
    the three `offedge:plus` misread splits arrive (BSA.F96). Reported, committed nowhere. Whether to apply it follows
    BSA.D291's presumption once the figures are in.
  - **The review** is one Opus reviewer on `60fcbed..a997110` against the spec, read-only, by BSA.D287's order: commit,
    review, commit again.
  - **After the follow-up,** the confirming diagnosis of the early acceptance (BSA.D291), in the same tree and so not
    alongside it.
- **293. The lead's rulings on the stage 1 review (BSA.F97): three findings are fixed in stage 1, two go to node 4's
  spec, and the fix pass waits for the implementer's follow-up to land.**
  - **Fixed now, coincident splits (finding 1):** the piece a coincident split takes is decided from the links, by where
    its instigator stands on the ring, never by a position that ties; and the dedupe may not drop a bisector whose
    neighbours are live. Constructed tests state both, because no roster reaches them. The reason to fix an unreached
    path now: the concentric courtyard of roadmap node 5 is made of coincident events.
  - **Fixed now, the gate (finding 2):** a solve's violations are discarded only from the first boundary at which the
    cause holds, so earlier ones are asserted; every solve in a roster is counted, a thrown one included; and the red
    early-acceptance test sweeps every roster and names each solve that trips the cause. That keeps the excluded set
    visible without a green test that asserts a defect (BSA.D266).
  - **Fixed now, adjacency (finding 3):** a pair of bisectors is a collapse of neighbours when the links say they are
    neighbours, and `linkPairCollapse` refuses a pair that is not. Measured first: the reviewer found the two readings
    equal on 1,503 collapses, so no solve should move; if one does, it is handled under the stage 1 spec's decision 31.
  - **Also now:** the stale comments, and the silent drop of a segment with a broken link becomes a throw.
  - **To node 4's spec:** the search for a struck segment limited to the step's rings, and the guard asked of every
    validating segment (finding 4); and the reviewer's list of single-ring assumptions. They change nothing on one loop
    and are decided with the join event.
  - **Recorded, not fixed:** the never-born splice is sound only for a whole ring, and a throw in mid-layer leaves
    tokens in the arrays of a step that has already failed.
  - **Who:** a fresh Opus delegate, since the implementer's context is very long and the fixes are bounded by the
    review's own file and line citations.
- **294. The spec for roadmap node 4, `skeleton-join-and-divide-decisions.md`, is approved by the lead under BSA.D286,
  with its decision 31 held for the user.** Drafted by an Opus delegate under BSA.D288 from a copy of the sources at
  `b5e139a`; read in full by the lead. 49 decisions, 293 lines.
  - **Its shape:** a step's rings are always the links' rings and `ringsOfSubPolygon` is deleted; one split rewrite
    serves join and divide, and what a layer did is read from the rings it leaves; a step's children are its components,
    an outer ring and the inner rings inside it, told apart by the sign of the ring's area at the layer's time and
    assigned by a hole vertex tested against the outer rings; a step of several rings never reaches the pair or triangle
    handler or the terminal ladder; `partitionSpan` gives way to `partitionArc`, a sum of gaps round the ring that
    telescopes to today's span on one loop; a layer with events of two rings coinciding is refused by name for node 5;
    the solver's causality check reads each exterior edge's own ends, in this node and not node 6.
  - **Checked by the lead by hand:** the join time and place of fixture F1, `t = 2(√2 − 1)` at `(12 − 2√2, 5.5)`; the
    top strike at `3.5(√2 − 1)`; the top-right triangle at `6.5 / (2 + √2)`, which equals the table's `3.25(2 − √2)`;
    the count of 8 interior nodes by Euler; and the sign convention of spec decision 13 against the outline's clockwise
    winding.
  - **Interpretations accepted:** `holes-not-solved` is retired outright; two new blocking kinds,
    `simultaneous-across-rings` and `multi-ring-step-refused`; ambiguity in assigning a ring is refused and never
    guessed; the refusal of spec decision 19 is deliberately wide and node 5 narrows it; the perceptual floor and
    `degenerateAreaBar` are read at new sites with no value changed, which the lead does not count as moving a
    tolerance.
  - **The finding that goes to the user (spec decisions 28 to 31):** `hasInteriorLoop` tests that an edge's two ends are
    joined by accepted interior edges, which equals face closure only on a tree. A holed skeleton has a cycle round each
    hole, so the last open face of a hole is accepted as soon as the others close. Traced by hand on F1 with its outline
    stretched: the hole's south-west edge is accepted at `t = 4.5` with a live segment, and the next bisector naming it
    is refused at birth. F1 itself escapes because its last two hole faces close in one pass. **Holed solves in general
    are blocked by this.**
  - **The proposed cure, not built without the user's word:** accept an exterior edge exactly when no live bisector and
    no pending birth names it as a parent, which is face closure read from the links.
  - **Roadmap node 6 loses the solver's causality check to node 4;** the roadmap's text stands and this entry records
    it.
  - **BSA.F91's line that `hasInteriorLoop` is loop-neutral is wrong** and is amended where it stands.
- **295. Stage 1 is complete at `823211a`: the wavefront's order is stored, every reader uses it, the review's fixes are
  in, and no complete solve changed.** The spec `skeleton-wavefront-order-decisions.md` is set `completed` with its
  tests as evidence. Roadmap node 1 is traversed.
  - **The commits:** part A `7b6ef97`, part B `a997110`, the follow-up tests `c9c1b30`, the review fixes `823211a`, all
    local on `feature/skeleton-holes`. The lead confirmed the last commit and a clean tree, and re-ran nothing.
  - **The figures, by the fix-pass delegate:** core 5,851 passed, 7 failed, 9 skipped in 95 suites, all 7 in the red
    early-acceptance file by design; building-shell 9,992 in 46 files, typecheck clean; the sweep harness's 32,335
    records identical to the baseline.
  - **The review's three fixes, each measured before it was switched:** adjacency read from the links, with no
    disagreement against shared parents in 1.18 million priced events, 1,503 pair collapses and 246 vertex-to-vertex
    events; the piece a later split takes chosen by the instigator's ring, with no disagreement against position in 145
    layers; the gate's exclusion from the cause's first boundary on, with every roster entry counted. A segment with a
    broken link now throws, having been met in none of 6.1 million reads.
  - **17 of 18 mutations convicted.** The one that is not, the dedupe's "neighbour not live" branch, is unreached in
    every roster.
  - **Found on the way: the partition dedupe's re-report rule is load-bearing on 11 complete sweep cells** that no
    standing test covered; `wavefront-dedupe-whole-ring.test.ts` now does. Node 4's spec keeps the dedupe's key (its
    decision 6), and its implementer is to be told.
  - **The red test names six solves** that trip the early acceptance: `Offset Cross Junction` (and its census regions),
    `fine:circle48@2e11`, `ladder:1x:s1`, `ladder:1x:s2` and `ladder:3x:s3`. Seven failing cases in one file, by design,
    until the user rules on the acceptance cure (BSA.D294).
  - **Known gap, recorded:** the event cache stores a pair's classification as priced, and links change adjacency only
    through the never-born splice; no roster shows it. Node 4's spec decision 3 asks the question at resolution, which
    closes it.
  - **The suite is about 34 seconds longer** (337 s to 371 s), from the red file sweeping every roster.
- **296. The user, 2026-11-14: The acceptance cure is approved: an exterior edge is accepted exactly when no live
  bisector and no pending birth names it as a parent, built as its own small unit on single-loop input.** The user
  quoted the lead's recommendation of BSA.D294 and answered "approved".
  - **Sequence, and one departure the lead owns:** the recommendation said "before any holed work", and the lead had
    already dispatched the implementation of roadmap nodes 2 and 3 (holes as input, stopping after initialisation)
    before the answer came. That delegate is editing the solver in the one working tree, so the acceptance unit cannot
    run beside it. It runs next, after nodes 2 and 3 land and before node 4, the join event, which is the first unit
    that steps a holed solve and the one the cure is needed for.
  - **Its spec is drafted by a delegate now** (BSA.D288), notes only, so it is ready when the tree is free. It is
    `part_of` the issue note, and the user's approval here covers it; the lead reads and corrects the draft.
  - **Its measure of success:** the six solves the red test names (BSA.D295) are each measured before and after under
    the stage 1 spec's decision 31, the red file goes green because the defect is cured, and the issue note is resolved
    with that evidence.
- **297. Roadmap nodes 2 and 3 are built at `57f6967` and accepted for review, with two spec corrections the implementer
  found.** The lead confirmed the commit and a clean tree, and re-ran nothing.
  - **The figures, by the delegate:** core 5,890 passed, 7 failed, 9 skipped in 96 suites, the 7 being the red
    early-acceptance file with its failure output identical line for line to before; building-shell 9,992 in 46 files,
    typecheck clean; dashboard 331 in 24 suites; the sweep harness's 32,340 records byte-identical. No pin moved. All 9
    mutation gates of the spec's decision 48 convicted.
  - **No other arithmetic on exterior ids is reached** by a holed solve before it stops: the three readers of spec
    decision 9 moved, and the rest is loop-local, loop-neutral, or runs only on interior nodes (search named in the
    report).
  - **Correction 1, spec decision 38:** the grouping helper cannot call `findLoopConflict` whole, because it returns the
    first conflict in order and a self-crossing or degenerate loop then masks a crossing or contact, which is returned
    as groups and never signalled. The helper runs the crossing and contact tests directly. The spec is amended; the
    code change and a test of the masked case go in with the review's fixes.
  - **Correction 2, spec decision 39:** the pipeline branches on the hole count in three places, not two; decision 22's
    refusal of a mis-wound loop is the third. Wording only.
  - **Interpretations accepted,** thirteen, among them: a mis-wound outline of a holed input is refused under
    `normaliseWinding: false` as a mis-wound hole is; the visible-corner test reads the raw weights against the global
    slowest, which keeps single-loop arithmetic bit-identical; `isEndpointTouch` is exported so the crossing rule is
    shared and not copied.
  - **Not convictable yet:** that `holes-not-solved` blocks by itself, since `unresolved-edges` blocks beside it. Node 4
    retires the kind.
  - **The commit's co-author line names Claude Opus 5.5,** the delegate's own model, where the lead's brief gave the
    session's Fable 5.2 line. Left as written; told to the user.
  - **Core's tests are not type-checked by the suite** (ts-jest runs with `isolatedModules`); the delegate's separate
    check leaves 9 errors it believes older, unverified on the starting tree. Open item.
  - **Next for this unit:** one independent Opus review of `57f6967` against the spec.
- **298. The spec for the acceptance cure, `skeleton-edge-acceptance-decisions.md`, is approved, on the user's approval
  of the cure (BSA.D296) and the lead's reading of the draft.** Drafted by an Opus delegate under BSA.D288 from the
  sources at `79efab9`; 31 decisions, 190 lines; `part_of` the issue note.
  - **Its one departure from the lead's brief, accepted:** the predicate is asked at step boundaries only, and the two
    acceptance calls inside the n-gon are removed. Between steps nothing is pending, so there the predicate is exactly
    the one the user approved; and once acceptance changes only at boundaries no birth can meet an accepted parent, so
    the accepted-parent birth filters, which are how the defect broke rings silently, are deleted and
    `addBisectionEdge`'s throw is the one guard left. The pending-birth clause survives in the measuring step and as a
    mutant expected to survive, which is the measured proof that removing the in-step call changes nothing.
  - **Measure before the switch:** the new predicate runs beside `hasInteriorLoop` over every roster, expecting
    disagreement only on the six solves the red test names, and recording the chain the old rule walked, which settles
    the issue note's diagnosis.
  - **One foreseen risk, by the drafter's hand trace and not run:** a vertex event resolved pairwise can leave a birth
    at a node where the edge's face has already closed. The old rule refuses it by early acceptance; the new rule bears
    it, and two zero-length self-loops follow. If the measuring step meets it off the six, it comes to the lead and the
    predicate is not bent.
  - **`hasInteriorLoop` and its export from the package index are deleted.** Nothing in the monorepo calls it;
    `@proc-geo/core` is publishable, so a consumer outside is possible and unknown.
  - **`Offset Cross Junction`:** if the cure makes every one of its pins reach the clean bar, it is promoted to the
    clean roster in the same change and the recursion suite's `unsolvableRegion()` needs a new constructed failure,
    chosen with the lead. If it still fails it stays enrolled with re-measured pins.
  - **The red file must go green with its assertions word for word.** It asserts two of its cells complete; if one comes
    out incomplete that is diagnosed, not reworded.
  - **The lead's correction:** the corpus is 53 clean and 7 defect, so a promotion makes 54 and 6, not the draft's 54
    and 5.
  - **Node 4's spec is to be amended by the lead when this lands:** its roster line for `hasInteriorLoop` and its
    decisions 29, 31 and 46.
  - **Sequence:** one Opus delegate takes the review fixes for nodes 2 and 3 and then this unit, as separate commits,
    once that review is in, so the tree has one editor at a time.
- **299. The review of nodes 2 and 3 at `57f6967` found no correctness defect in the caller map, the refusals, the
  per-loop and global split, single-loop identity, initialisation or the stop; four small things are fixed and tests
  added.** One independent Opus reviewer, read-only, with hand-worked cases and probes run against core's source; it
  re-ran the core suite at 5,890 passed and 7 failed by design, which is the first independent confirmation of the
  implementer's figure.
  - **Fixed, the grouping helper crashes without a name** where crossing loops get past the masked check: a `TypeError`
    from a non-null assertion. The masking fix of BSA.D297 closes the route and the assertion becomes a named refusal
    (spec decision 51).
  - **Fixed, a hole that touches itself is accepted** and would hand the join event a pinched ring. In a holed input,
    two edges of one loop that share no vertex and lie closer than the floor are refused as contact (spec decision 49).
    A single loop without holes is untouched.
  - **Fixed, a sliver hole under `normaliseWinding: false` is refused as mis-wound,** on a sign the spec itself calls
    untrustworthy. Degenerate area is tested first (spec decision 50).
  - **Tests added** for the paths the reviewer probed and found correct but untested (spec decision 52). The shared-wall
    test cannot convict the distance rule, since any collinear overlap puts an endpoint on the other segment; the gap
    test does, and the test says so.
  - **Verified sound by the reviewer, by hand and by probe:** the map through removal at index 0, at the last index and
    at both, with and without reversal and weights; every refusal kind, including a hole equal to another hole, a hole
    enclosing the outline, and gaps at 0.99 and 1.01 of the floor; the nesting test's precondition; the weight door per
    loop and globally; the same operations in the same order for a single loop.
  - **Who:** one Opus delegate takes these fixes as one commit and then the acceptance unit (BSA.D298), so the tree has
    one editor.
- **300. The lead's rulings on the acceptance measurement (BSA.F99): the switch goes ahead, with one rule added for a
  ring born whole at one node, and `circle48`'s changed answer accepted.** Written into the acceptance spec as decisions
  32 to 38.
  - **A ring made only of one layer's pending births, all sourced at one node, is closed there and none of it is born**
    (spec decision 32). It has no extent. This is the `rosette40` case: the residue of a vertex event resolved pairwise,
    which the old rule disposed of by accepting an edge early. The predicate the user approved is unchanged, because
    births that are never born are not pending; the rule reads links and a source node, no position and no tolerance.
    The four cells are expected to stay byte-identical. **Why this and not accepting two extra edges:** a zero-extent
    ring born and then closed adds edges of no length to a clean, complete solve, which is a worse graph for nothing.
  - **`ladder:1x:s5` is harmless** (spec decision 33).
  - **`fine:circle48@2e11` is accepted as cured-with-a-cost** (spec decision 34): a graph that tiles the polygon to 1e-8
    is more valid than a tree that misses half of it, and its two new violations are both on one bisector leaving a node
    that was already 2e-6 out of clearance. It is a known-defect cell, not a clean fixture, and Circle 48 stays
    enrolled.
  - **`Offset Cross Junction` is not cured and stays enrolled** (spec decision 36). The recursion suite keeps its
    failing specimen.
  - **The lead's acceptance for moved pins of the six is given in advance,** each to its measured value with the cause
    written at the pin and listed in the report, and withdrawn for any solve that does worse in a way not already
    described (spec decision 37).
  - **Open, asked of the implementer and not blocking:** `ladder:1x:s1` and `ladder:1x:s2` end complete and not trees. A
    complete single-loop skeleton that is not a tree carries a degenerate cycle, and each is to be identified once
    decision 32 is in (spec decision 38).
  - **For the user:** the cure does what was approved on the six; the one addition is decision 32, which the lead judges
    to be inside the approval, and says so in case it is not.
- **301. The user, 2026-11-15: The lead steers through the rest of the roadmap unattended.** The user's words on signing
  off for the night: "Your goal is to steer through the rest of the road map."
  - **What this covers:** every remaining node of `holed-skeleton-roadmap.md`, with specs drafted by delegates and
    approved by the lead (BSA.D286, BSA.D288), implementation and independent review by delegates, and local commits at
    each unit (BSA.D287).
  - **What it does not change:** nothing is pushed and nothing is merged to `main`. The items the roadmap's standing
    rules return to the user (a tolerance or constant that must move, a clean fixture whose answer changes, a design for
    node 5 that changes how single-loop events resolve) are not decided by the lead in the user's absence.
  - **How the lead handles such an item overnight:** it is recorded with its evidence, the unit takes the route that
    changes nothing the user has not approved, a red test and an issue note mark what is left (BSA.D266), and work
    carries on with whatever does not depend on the answer. The journal's next-work section is kept current so the user
    can read the state in one place.
- **302. The acceptance cure is accepted for commit, including the sixteen records its same-node ring rule moves off the
  six.** The delegate's uncommitted tree: core 5,928 passed, 2 failed, 9 skipped; building-shell 9,992, typecheck clean;
  the red early-acceptance file green with its assertions word for word. Not re-run by the lead.
  - **The rule of acceptance spec decision 32 reaches further than the `rosette40` cells:** it also closes, unborn, one
    mirrored pair of zero-length self-loops on `Off-edge Jitter Reflex L (seed 55433, k=4)` (corpus, its sweep cell and
    12 census regions) and on six unpinned `offedge:plus` sweep cells. These solves never had early acceptance; the old
    code bore the pair because neither parent was accepted.
  - **Why it is accepted:** on every one, nodes, both oracle instruments, tiling and completion are unchanged, two edges
    of no length go, and the skeleton goes from not a tree to a tree. That is the same graph without its degenerate
    residue. No clean fixture moves; the two fixtures touched are in `KNOWN_DEFECT_POLYGONS`, and the census failure
    counts do not change.
  - **Pins moved with the lead's acceptance:** the jitter L fixture's digest and its I2 retired pin (renumbering only:
    the joining edge `e50` becomes `e48`), each with the cause written at the pin. With the three pins of the six (the
    `Offset Cross Junction` digest, its two fine rungs at 34 edges, and `circle48`'s signature of offset 1, clearance 3,
    direction 1), five pins move in all.
  - **The cure's effect on the six, as measured:** `ladder:1x:s1` completes; `ladder:1x:s2` and `circle48` tile to about
    1e-8; `ladder:3x:s3` is identical; `Offset Cross Junction` goes from two step failures to one and from 10 wavefront
    violations to 2, still incomplete, every other pin holding.
  - **The cycles of spec decision 38 are identified and stay:** on `circle48`, six zero-length self-loops that predate
    the cure and a three-edge duplicate ridge between two coincident nodes; on `ladder:1x:s1`, a self-loop on the
    formerly refused birth and a loop of edges each under 3e-7 of the extent round the hub nodes; on `ladder:1x:s2`, a
    four-edge loop under 2e-7 of the extent. All are structure below the perceptual floor at a hub where many bisectors
    end, which is the solver's coincident-node question (RSA's register C12), not acceptance. Open item.
  - **Mutation:** nine mutants convicted, and the one expected to survive survives: restoring the in-step acceptance
    call with pending births changes nothing over 1,399 tests.
  - **Next:** commit, then one independent review, then the issue is resolved and the spec completed.
  - **AMENDED by finding BSA.F100:** The claim that every moved cell goes from not a tree to a tree is unverified for
    four of the six offedge:plus cells, which keep other self-loops. The acceptance stands on the unchanged nodes,
    oracles, tiling and completion.
- **303. The acceptance cure is committed at `8170011` and the core suite is fully green for the first time this
  session: 5,930 passed, none failed, 9 skipped.** The delegate's figure; the lead confirmed nothing beyond the report,
  and an independent review of `f008560..8170011` is dispatched.
  - **Building-shell's 9,992 was measured before the two last pin edits,** which touch core test files only. Not re-run
    after them.
  - **Node 4's spec is amended for the cure** (its decisions 50 to 53): the predicate is used unchanged on holes; the
    stretched first fixture becomes an ordinary green fixture and the specimen for a hole's last face; the same-node
    ring rule applies to steps of several rings, before components are read; nothing in the spec relies on acceptance in
    mid-layer.
  - **The stage 1 spec's decision 32 carries its closing sentence.**
  - **The issue note and the acceptance spec stay `open` and `implementing`** until the review is answered.
  - **All four delegate commits since `57f6967` carry a Claude Opus 5.5 co-author line,** the delegates' own model under
    their own harness rule, where the lead's briefs gave the session's line. Left as written.
- **304. The acceptance cure is closed: the issue note is `resolved` and its spec `completed` at `8170011`, on a clean
  independent review (BSA.F100). Node 4, the join event, is dispatched with the review's small fixes as its first
  commit.**
  - **Carried into node 4's first commit:** the public `tryToAcceptExteriorEdge` returns false on a context with no
    interior edges, as the old one did; the constructed ring tests assert the links after the layer settles; the five
    stale or inverted comments and titles; `types.ts`'s statement of `complete` corrected to what production reads.
  - **Not changed:** the end-of-solve check stays in the test probe. Putting exterior acceptance into production's
    `complete` would be a change to the result's meaning, and nothing on any roster ends with an unaccepted face and no
    blocking diagnostic.
  - **The early-acceptance file keeps its roster cases** as the guard against the old rule returning, at four minutes of
    suite time. Open item: whether that cost is worth it.
  - **Node 4's implementer is one fresh Opus delegate,** told that the partition dedupe's re-report rule is load-bearing
    on 11 sweep cells (BSA.D295), that the same-node ring rule precedes the reading of components, and that no tolerance
    moves.
- **305. The spec for roadmap node 6, `skeleton-loop-consumers-decisions.md`, is approved by the lead under BSA.D286.**
  Drafted by an Opus delegate under BSA.D288 from the sources at `8170011`; read by the lead from its decisions on. 48
  decisions, 276 lines; it depends on node 4.
  - **Its shape:** a consumer reads the node after exterior edge `e` as that edge's own target, which is `(e + 1) % n`
    on one loop and needs no loop table; offset projection has one such site and strip decomposition six groups of them;
    runs, the merging of short runs and corners work per loop and never join two loops; with default options
    `computeStrips` returns one strip per exterior edge of every loop, which is the contract building-shell reads; an
    offset contour is a flat list of rings, clockwise for an outer ring and counter-clockwise round holes, and the
    tiling identity sums them signed.
  - **The holed roster is a third roster, `HOLED_TEST_POLYGONS`, outside `FULL_CORPUS`,** so the single-loop sweeps keep
    their meaning and their counts. It holds node 4's nine fixtures, weighted ones among them, and no holed fixture is
    ever pinned as a defect. Each invariant keeps one definition with a second block over the roster; node 4's test-side
    helpers are promoted into their home files and not duplicated.
  - **The tree-based consumers refuse:** `buildSkeletonTree` throws on a holed result, the spine refuses through it, and
    the recursive driver throws when its options carry holes.
  - **Checked by the lead by hand:** the tiling example of spec decision 18 on F1 at depth 0.5 (81, 5.83 and 22.83
    summing to 98).
  - **BSA.D282 is corrected on one point, and BSA.F92 with it:** parcel slicing reads no skeleton, only a strip's own
    edges, so the cycle is no reason for it to refuse and no refusal can be built without new provenance on `Strip`. It
    gets none; no caller in the repo slices a holed result.
  - **Interpretations accepted:** `buildSkeletonTree` throws where it could have returned `isTree: false`, because false
    there means a solver defect and a holed skeleton is not one; offset rings carry no nesting; the sweep harness gains
    144 holed cells, about a quarter more root-cell time, as records and not tests; the project CLAUDE.md gains one
    sentence naming the roster and its counts are set to the measured 53 and 7.
  - **Owed to node 4's spec when this lands:** a line that its fixtures moved to the roster and its decision 42 is met
    by the roster sweeps.
  - **Left open by the lead:** whether node 6 may be called completed while a holed fixture is red. The lead's answer
    when it arises: yes if the red test has its issue note and the failure is the solver's and not a consumer's, since
    node 6 is the consumers.
- **306. The draft spec for roadmap node 9, `building-shell-holed-roof-decisions.md`, is received and held at
  `proposed`: the lead reads and rules on it when nodes 5 and 6 have landed, because both can change it.** Drafted by an
  Opus delegate under BSA.D288 from the tree at `0ec7e58`; 52 decisions, 273 lines; not yet read in full by the lead.
  - **The sequencing fact it states, by reasoning and not run:** Rings are axis-aligned, so every courtyard has walls
    parallel to and facing outline walls, which is the case node 4 refuses as simultaneous across rings. **With node 4
    alone every courtyard fixture in the corpus would be a hard error; building-shell cannot move to the holed solve
    before node 5.** It also needs node 6's one strip per exterior edge. `depends_on` now names node 6's spec; node 5's
    is added when it exists.
  - **Its shape, from the delegate's report:** `Comp.ring` goes and walls are built loop by loop with a loop and edge on
    each; `solveFaces` passes outline and holes and maps strips to walls through `loopMaps`; `courtyard.ts` is deleted
    whole, with the cut branch of `buildPieces` and the `'cut'` wall form; a height oracle for all-hip islands at one
    pitch, the plate plus the tangent of the pitch times the L-infinity distance to the outside or a hole, giving
    336.603 cm for the concentric courtyard's ridge and about 365.47 cm for the top of BSA.F90's layout.
  - **Points the lead must rule on before approving,** from the delegate's interpretations: grouping loops by
    building-shell's own containment test and not core's helper, which might refuse two islands 1/1024 cm apart that
    build today; whether a holed hip solid goes back to its bottom at the plate; whether the copy-integrity tally moves
    (the delegate argues it need not, since cases 9a to 9d already expect the true annulus roof); the renamed goldens;
    and a gable on a courtyard wall along the old cut's line, left to measurement.
  - **The count of courtyard goldens is 20 by the delegate's reading of the manifest,** where BSA.F94 said 5.
    Unreconciled; to be counted at implementation.
  - **The amendments owed to `building-shell-prototype-decisions.md`** are listed in the draft's decision 52 and are the
    lead's to make when node 9 lands.
- **307. Roadmap node 4 is built at `a8ba71f`: the solver completes every generic holed fixture, the first one to its
  hand-derived answer, and no single-loop record moves. Accepted for review.** The delegate's report; the lead confirmed
  nothing beyond it. Unit 1, the acceptance review's small fixes, is `3a92a28`.
  - **The figures:** core 5,954 passed, none failed, 9 skipped in 98 suites; building-shell 9,992 in 46 files, typecheck
    clean; the sweep harness's 32,335 records identical; 125 digests pass.
  - **F1 against its closed form:** all 8 interior nodes within 2.5e-15, the 16 edges as specified, the join the root
    step's only event. **All nine fixtures are complete with cycle rank equal to the hole count and tiling errors of 0
    or 1.2e-16:** F1, F1 stretched, F2 (two holes, which join each other first), F3 (L-shaped hole), F4 (weighted), F5
    and its mirror (the outline divides with a hole in the step, the hole going to each child once), F6, F7. No issue
    note was needed.
  - **The refusals, measured:** the concentric square and the parallel-walled rectangle are both refused at the root
    step as `simultaneous-across-rings`, on a corner of each ring meeting head-on. A centred diamond, added by the
    delegate, is refused for four simultaneous joins and is what convicts the join-against-divide mutation.
  - **The measuring run over corpus, sweep and census:** no step of more than one ring, no split validating on two
    segments or outside its step, no refused layer. **`partitionArc` differs from the old span on 404 of 3,703 calls in
    the sweep, all in the 54 incomplete along-edge cells,** where the arc is the span plus two whole loops; the sorted
    birth order differs in no layer and no record moves. Cause unconfirmed: the ring's parents wind round the loop more
    than once on those broken solves.
  - **All 10 mutation gates convicted.**
  - **To be ruled on at review, the weighted fixture F4:** the delegate reports the causality oracles date a node by
    distance and not time, so a weighted fixture shows clearance violations that are the oracle's and not the solver's,
    as three single-loop weighted fixtures already do; and that F4's test pins a clearance count with the reason
    written. The report gives the count once as one and once as 8. A pinned count of an oracle's known blindness is
    close to what BSA.D266 forbids, so the reviewer is asked to establish what is true and the lead rules then.
  - **Next:** an independent review; and, since nothing edits the tree meanwhile, the measurement-led spec drafts for
    nodes 5 and 8 and the spec draft for node 7.
- **308. The draft spec for roadmap node 7, `dashboard-holed-fixtures-decisions.md`, is received and held at `proposed`;
  the lead reads and approves it when node 6, which it depends on, has landed.** Drafted by an Opus delegate under
  BSA.D288 from the tree at `a8ba71f`; 48 decisions, 244 lines; not yet read in full by the lead.
  - **Its shape, from the delegate's report:** holes are read-only state set by the fixture loader, and outline editing
    stays allowed while they are loaded; a new core entry `solveSkeletonStepped` gives holed snapshots through an
    optional observer in `runSimplePolygon`, leaving `solveSkeleton` and the legacy stepped entry as they are; the scene
    adapter's boundary, edge labels and polygon fill go per loop, with the hole emptied by Konva's even-odd fill rule;
    the tree-based overlays and the bridge to the recursive page are disabled while holes are loaded.
  - **Found on the way, existing today on single loops:** `runSimplePolygonStepped` throws away the errors of
    `stepAlgorithm`, so the dashboard's step-through shows a step failure as no error at all. Not this arc's to change;
    open item.
  - **Also found:** the dashboard's Jest reads core and the fixtures from `dist/`, so both must be built before its
    tests run; and the parcels page solves unweighted whatever the fixture's weights.
  - **The lead's leanings for when it rules:** node 5's fixtures join the roster when they solve, so no separate group
    for refusal specimens; a pinned scene digest for every single-loop fixture is heavier than the unit needs, and the
    adapter's single-loop identity can be held by the existing scene tests plus one digest per debug setting on a
    handful of fixtures.
- **309. The lead's rulings on node 4's review (BSA.F101): node 4 stands for unweighted input; the clearance oracle is
  made weight-aware; the weighted solver defect is filed for the user with red tests and is not fixed tonight.**
  - **F4's pin of the oracle's false report goes.** A test that is green by asserting a defect is what BSA.D266 forbids,
    whichever component the defect is in. F4 asserts the weight-aware properties: equal time at every node, time never
    decreasing along an edge, a closed face per edge, tiling.
  - **The clearance oracle is corrected to compare times:** a node at time `t` must lie at distance at least `w · t`
    from every wall of weight `w`, and a node is dated by distance over its parent's weight. This changes a diagnostic
    and no graph, moves no tolerance, and at unit weights is today's arithmetic. It is measured first over every roster:
    the expectation is that only weighted solves change, losing false reports. **Why now and not later:**
    building-shell's pitches are weights, a mixed-pitch building is a weighted solve, and today a wrong weighted
    skeleton cannot be told from a right one by the solver's own check.
  - **The weighted defect in the solver is the user's:** it is evidence that today's solver is wrong on single-loop
    input (5.6 percent of a random weighted fuzz), which the roadmap returns to them, and a cure would change how
    single-loop events resolve. It gets an issue note and red tests on the reviewer's smallest reproducers, single-loop
    and holed, asserting the weight-aware property. Nothing in the solver is changed for it. **Until it is cured,
    "weighted holes solve" is claimed for nothing beyond F4,** and node 9 must say what building-shell does with mixed
    pitches round a courtyard.
  - **Added to node 4 by this review:** a fixture that pins the least-area rule, a C-shaped hole with a second hole in
    the pocket it pinches off; a ring whose polygon crosses itself at the layer's time is refused as
    `multi-ring-step-refused` and never classified by the sign of its area; the dropped assertion in
    `skeleton-loops-input.test.ts` is restored in a form that holds; the generic counts of interior nodes and edges are
    asserted on the fixtures that are generic.
  - **Left:** the pinned step-by-step stories stay, marked as the reason each fixture was chosen and not as a property
    of the solver.
  - **Who:** one fresh Opus delegate for the fixes, once the reviewer has returned the exact reproducers.
- **310. The draft spec for roadmap node 8, `skeleton-loop-contact-decisions.md`, is received and held at `proposed`;
  its opening measurement answers the user's question of BSA.D284, and nothing in it needs the user's ruling.** Drafted
  by an Opus delegate under BSA.D288 from probes on a copy of core at `a8ba71f`; 38 decisions, 255 lines; not yet read
  in full by the lead.
  - **The answer, measured:** the solver takes a loop with a repeated vertex, single-loop or holed, when each visit of
    the point bounds one wedge of the region. Four such single loops solve right (a hole stitched to a reflex corner, a
    diamond stitched to a wall, a point visited three times, a triangle stitched to an outline corner), each tiling to
    3e-16 with nodes at their hand-derived places. It fails, signalled, when one visit spans two wedges: a figure-eight
    of two squares sharing a corner is incomplete today, on a single loop. The boundary does nothing to a repeated
    vertex: canonicalisation removes none, the crossing test sees an endpoint touch, and the two exterior nodes at the
    point stay two.
  - **The user's two instincts hold as measured:** a hole sharing a wall, merged by hand into a notch or one hole,
    solves right in every case tried; and loops touching at a point, stitched into one loop, solve right where the
    stitch keeps one wedge per visit. Left as two loops with the refusal off, every contact case fails or is refused,
    none silently wrong.
  - **Its design, from the report:** one stage in the boundary, for holed inputs only, that identifies coincident points
    and walls at the perceptual floor, cancels opposite coincident pieces, relinks and traces the loops again; a gap
    under the floor is contact and is merged; a region that falls into pieces is refused as `divides-region`, and walls
    coinciding the same way as `overlap`. No tolerance, constant or event rule moves.
  - **It changes the caller's map:** after a merge several caller loops map into one solved loop, a caller edge can map
    to several solved edges or to none, and `loopMaps` no longer lines up with `graph.loops`. Node 9's draft reads that
    map and must follow.
  - **One thing found that precedes this arc:** rounding can tilt two collinear walls of touching loops into a
    "crossing", so today such an input is refused under the wrong name; the stage must run before the crossing test.
  - **Held because** axis-aligned merged holes meet node 5's refusals, and node 9 reads its map. The lead rules on its
    open points when it approves: whether a refusal that is node 5's is "specified behaviour" or a red test, which by
    BSA.D266 turns on whether the solver is wrong or merely not finished; the riskiest part by the drafter's own account
    is exempting a repeated point inside one loop from the self-contact refusal.
- **311. The spec for roadmap node 5, `skeleton-simultaneous-rings-decisions.md`, is approved by the lead under BSA.D286
  and BSA.D301, as a design that leaves single-loop resolution alone, with four amendments.** Drafted by an Opus
  delegate under BSA.D288 after measuring ten fixtures on a copy of core at `a8ba71f`; read in full by the lead. 46
  decisions.
  - **What the measurement found:** with the cross-ring refusal lifted, the existing machinery already bears the right
    bisectors and writes the right links on the concentric square, the off-centre rectangle, the weighted squares, the
    courtyard with wings of BSA.F90, two holes, and an octagon in an octagon. It fails in three places only: the
    corridor rings of two bisectors the layer leaves are refused as having no area; the pairwise fallback strands an
    arrival when a meeting holds a run of two (a chamfered corner); and after a join the second strike of a segment can
    take the wrong piece, which on one ordering of a weighted square's hole gave a complete and wrong skeleton with a
    node outside the region.
  - **The design:** a meeting of one run on each of two rings is resolved whole, bearing two bisectors by the merge-gap
    rewrite, of which a head-on is the case of single arrivals; a ring of two left by a layer of several rings is its
    own child, and the existing pair handler closes it as it closes a single loop's corridor; in `linkSplit`, when two
    pieces of a struck segment stand on the instigator's ring, the strike takes the piece that contains it. The closed
    ridge ring needs nothing new for termination, acceptance or faces.
  - **Why the lead may approve it in the user's absence:** every rule but one is reached only in a step of more than one
    ring, which no single-loop solve has; the one exception, the piece rule, needs two pieces of a segment on one ring,
    which only a join makes. The draft measured that at zero on the 60 corpus fixtures only. **The lead's amendment
    (spec decision 43): it is counted over the sweep and the census before it is relied on, and if it is ever non-zero
    on a single loop the rule is not landed there and goes to the user.**
  - **Checked by the lead by hand:** the concentric square's ridge at `t = 2`; the off-centre rectangle's times of 1.5
    and 2 from its gaps of 3 and 4; the winged courtyard's `t = 150` from its gap of 300; the worked piece choice on the
    weighted square.
  - **What stays refused, and how it is held (spec decision 44):** a meeting of more than two runs, or on a third front.
    Its specimen, two courtyards with every gap equal, is a realistic building. By BSA.D266 a defect is a red test with
    an issue note or is guarded in production code; a refusal by name is the guard, so its test is green on the guard
    and an issue note records it. **This reading also answers the same question in node 8's draft.**
  - **The oracle question is closed by BSA.D309** (spec decision 45): the weighted fixtures assert no causality
    diagnostic.
  - **For the user, not blocking:** real courtyards with equal wall thickness all round, or two courtyards a wall's
    thickness apart, will meet the three-front refusal; how often is unmeasured.
  - **Node 9's draft gains this spec in its `depends_on`.**
  - **AMENDED by decision BSA.D311:** The lead's last bullet misstates the case. One courtyard with equal wall thickness
    all round is the concentric square and is solved. The three-front refusal is met where a corner of each of two holes
    reaches a third front at one point and time, as with two courtyards whose separating wall is as thick as the outer
    walls.
- **312. Node 4 is complete at `9164e92`; the causality check compares times at `8887d65`, with the lead's own clearance
  rule corrected by the implementer; and the weighted solver defect has red tests, an issue note and a confirmed cause
  at `4536b17`. Node 5 is dispatched.** The delegate's figures, not re-run: core 5,989 passed, 5 failed by design, 9
  skipped; building-shell 9,992; all sweep records byte-identical.
  - **The lead's rule in BSA.D309 was wrong and the implementer was right to depart from it.** "At least `w · t` from
    every wall of weight `w`" is false on correct skeletons, because a fast wall's front reaches only as far as its own
    face: on `Weighted L` a node at time 1 lies 1.41 from the end of a weight-4 wall. Measured, that rule reported 583
    of 740 correct weighted single loops. **What is committed and accepted: a node at time `t` lies at least `w_min · t`
    from every wall,** the slowest weight, which every front satisfies; it reports none of 1,331 correct random weighted
    solves and is today's arithmetic at unit weights. Its cost is weak detection: clearance now catches one wrong
    weighted solve, and detection rests on the offset and direction oracles, which fire on every complete wrong one
    measured.
  - **The oracle's effect, measured:** no unweighted solve's diagnostics or graph changed; 734 of 740 correct weighted
    single loops and all 589 correct weighted holed solves carried false reports before and none after; the four
    weighted fixtures and F4 lose theirs. No pin moved.
  - **Node 4's fixes:** F4 asserts weighted time order and no pinned count; the pocket fixture F8 pins the least-area
    rule, convicted both ways; a ring that crosses itself is refused, which moved no valid unweighted input of 760 and
    now refuses 46 weighted holed fuzz solves, every one already wrong. The spec is `completed`.
  - **The weighted defect's cause, confirmed on the smallest single-loop reproducer by asking the solver directly:** a
    reflex bisector that is not primary is never tested for a split, because both split paths require a primary bisector
    (`createCollisions` and `canGenerateSplits`). The solver prices the missed split exactly when asked. **Under weights
    an edge event can leave a reflex vertex; at unit weights it cannot** (argued, not measured), which is why the
    restriction was sound until weights came. A second cause, unconfirmed, on two of the holed reproducers:
    `isReflexEdge` reads the sign of a dot product that calls a reflex corner convex when its weighted bisector leans
    forward.
  - **Both causes are in how single-loop events are generated, so the cure is the user's** (BSA.D301). The issue note
    `ISSUE-skeleton-weighted-edge-runs-backwards-in-time.md` is open with five red tests in
    `weighted-time-order.test.ts`.
  - **Left by node 4 and found by this pass:** three test-side helpers still date by `(parent + 1) % n`; node 6's spec
    generalises them.
  - **Dispatched:** node 5 to one fresh Opus delegate, with the measuring run of its decision 43 first.
- **313. Roadmap node 5 is built at `3abb3ac`: the concentric courtyard, the courtyard with wings of BSA.F90 and every
  other fixture of the spec solve to their closed forms, the piece rule's guard measured zero on every single-loop
  solve, and no single-loop record moved. Accepted for review.** The delegate's figures, not re-run.
  - **The figures:** core 6,028 passed, 7 failed by design, 9 skipped (the 5 weighted red tests and 2 new ones);
    building-shell 9,992, typecheck clean; all 9 sweep outputs byte-identical.
  - **The measuring run of spec decision 43, on the old code and the new:** over the corpus, the census at three depths
    and the sweep, strikes on an already cut segment occur (2, 24, 48, 69 and 2), and **never with two pieces on the
    instigator's ring; no multi-ring step and no cross-ring merge on any single-loop solve.** So the piece rule is
    landed.
  - **The fixtures:** A, A′, B, C1, C2, C2′, D, E, F, G and H each solve, each node within 1e-9 of the extent of its
    closed form, each passing node 4's whole battery and two translations; no closed form in the spec needed correcting.
    E′ is refused by name with its issue note. All five mutation gates convicted.
  - **How much of courtyard space it covers, by fuzz of 400 each:** one axis-aligned rectangular hole in a rectangle, at
    integer and at non-integer positions, 400 of 400 sound both times, where all were refused before; two holes at
    non-integer positions, 400 sound; **two holes at integer positions, 375 sound, 20 refused as three-front meetings, 4
    refused for a ring of three with no area, 1 complete with a self-loop.** With the piece rule reverted the total
    falls from 1,575 to 1,356 with 122 complete and wrong, so that rule carries much of the space.
  - **Two new defects, each a red test with an issue note, both from two holes whose walls lie on one line:** a bisector
    born between two collinear walls is a straight vertex, not reflex, so it is never tested for a strike and is left in
    a ring of no area (4 of 400); and a three-front meeting after the rings have joined, which the refusal cannot see
    because it guards steps of several rings only, bears a self-loop (1 of 400). The first's cure is either the lead's
    (how a ring of no area is treated) or the user's (split generation); the second's is the user's.
  - **BSA.D311's unmeasured question is answered:** the three-front refusal met 20 of 400 two-hole courtyards at integer
    positions and none at non-integer positions or with one hole. Buildings are drawn on a grid, so the integer row is
    the relevant one.
  - **Nine holed cases in `skeleton-loops-input.test.ts` that pinned node 4's refusal now solve** and assert
    completeness; the delegate ran the whole battery over them.
  - **Next:** an independent review working from a copy of `3abb3ac`, and node 6's implementation in the tree at the
    same time.
- **314. The lead's rulings on node 5's review (BSA.F103): node 5 stands; a holed solve gains a guard that turns the
  silent wrong answers into signalled ones; the single-ring defect behind them is filed for the user with red tests and
  is not touched.**
  - **Node 5's own rules are accepted as reviewed.**
  - **The defect, a straight bisector between collinear walls that face the same way, is in how one-ring steps resolve
    and exists on single loops today.** Its cure is the user's (BSA.D301). It gets one issue note with its three
    mechanisms and red tests on the reviewer's reproducers, the single-loop ones first, since they show it owes nothing
    to holes.
  - **What the lead can and does do without touching single-loop resolution: a guard on holed solves only.** After a
    solve with holes, the result is checked for the two things every silent wrong answer shows: the interior edges that
    are not culled must form one connected graph whose cycle rank equals the hole count, with no self-loop that is not
    culled; and every interior node must be at one time from all the walls that meet there, within the perceptual floor.
    A failure is a blocking diagnostic, so the result is `complete: false` and a caller cannot mistake it. **Why this is
    within the lead's remit:** it reads a finished graph, changes no event, moves no tolerance (it reads the perceptual
    floor at one new site), and runs only when the input has holes, so no single-loop result changes. **It is measured
    before it lands:** over a fuzz like the reviewer's it must flag no sound solve, and the report says how many of the
    wrong ones it catches and which it misses.
  - **Why not the same guard on single loops:** it would turn existing single-loop results from complete to incomplete,
    which changes single-loop results and is the user's to rule. The lead recommends it to the user: the reviewer
    measured that the solver's own oracles miss K1 entirely.
  - **The red test `2h-int-113` is corrected:** it is replaced by the specimens that are truly wrong (a self-loop not
    marked culled), and the test helper stops counting culled loops, as the solver's own tree check does.
  - **Small, with the same pass:** the piece rule's fallback takes the piece by position, as the branch beside it does,
    with a constructed test; the nine holed cases in `skeleton-loops-input.test.ts` run the whole battery; a rotated
    holed fixture joins the tests.
  - **For node 9:** building-shell's footprints are axis-aligned and grid-drawn. One courtyard in an L, T, U or plus is
    sound in every case tried; several courtyards in one island meet refusals often. Building-shell must turn a refusal
    or a guard failure into a hard error naming the island.
  - **Who:** one fresh Opus delegate, after node 6's implementer leaves the tree.
- **315. Roadmap node 6 is built at `9b5f90c`: the consumers read every loop, the holed roster of 21 fixtures tiles at
  every depth, and no single-loop output moved. Accepted for review; node 5's fix pass is dispatched into the tree
  beside it.** The delegate's figures, not re-run.
  - **The figures:** core 6,438 passed, 7 failed by design, 10 skipped; building-shell 9,992, typecheck clean; dashboard
    331; every existing sweep record byte-identical; the 60 single-loop digests unmoved. All 16 mutation gates
    convicted.
  - **The contract building-shell reads holds on all 21 fixtures:** one strip per exterior edge of every loop at full
    depth, tiling under 3e-16 at depths 0.2, 0.5 and 1.0. The roster is node 4's F1 to F8 and node 5's A to H.
  - **The sweep harness's new holed group, 336 cells:** all 42 cells at the two floors complete and clean; of 126
    translated cells 123 complete; **of 168 jittered cells 125 complete, and 43 are refused** as a ring with area under
    the bar, all on the fixtures with parallel facing walls, which jitter turns into near-coincidence.
  - **A silent wrong answer found in those cells: the courtyard with wings, jittered at seeds 1 and 3, reports complete
    with no diagnostic,** and has 5 self-loops, two cycles for one hole, and strips short by 0.24 percent. Other
    jittered cells that complete also carry self-loops. This is the straight-bisector family of BSA.F103 under
    perturbation, and it is what the guard of BSA.D314 is for.
  - **Interpretations accepted:** the holed tiling has one definition in the measurement helpers; the test-side oracles
    read an edge's own target and keep the old arithmetic on a merged graph; the project CLAUDE.md's fixture counts are
    corrected to 53 clean, 7 defect and 60 in all.
  - **Owed to node 4's spec by the lead:** the line that its fixtures moved to the roster.
  - **The fix pass for node 5 (BSA.D314) now also takes the two jittered cells as specimens for the guard.**
- **316. The lead's rulings on node 6's review (BSA.F104): the consumers stand; five small fixes go in the next pass
  through the tree, after which the spec is marked completed.**
  - **Fixed:** F1 to F8 get back the equal-time and time-order checks at 1e-9 of the extent, the weighted F4 among them;
    the sweep harness's holed records gain the count of self-loops that are not culled and the cycle rank against the
    hole count, so a wrong holed cell shows in a field and not only in a digest; a result with a context and an empty
    loop table is refused by the strip consumer with a message, not answered with nothing; the orphaned comment; the
    project CLAUDE.md's "two rosters" wording names the holed roster as the third.
  - **Left:** the two test-side checks that read the solver's exterior target. Independent cover exists in three other
    tests, and the reviewer's own run is the stronger evidence.
  - **Carried to node 9's ruling:** `solveFaces` must not skip a strip silently; a strip with no boundary on a holed
    island is a hard error naming the island.
  - **Order of what remains, one editor in the tree at a time:** node 5's fix pass and guard (running); then these fixes
    with node 7, the dashboard; then node 8, contact; then node 9, building-shell. Each of the three held drafts is read
    and ruled on by the lead before its dispatch.
- **317. The spec for roadmap node 7, `dashboard-holed-fixtures-decisions.md`, is approved by the lead under BSA.D286,
  with five amendments; it is dispatched when node 5's fix pass leaves the tree.** Read by the lead from its decisions
  on; 53 decisions.
  - **Accepted as drafted:** holes are read-only state set by the loader and the outline stays editable; a new core
    entry `solveSkeletonStepped` through an optional observer in `runSimplePolygon`, with `solveSkeleton` byte-identical
    when there is no observer; the scene's region drawn by the even-odd rule, one closed stroke per loop, labels by the
    solver's global exterior ids; tree-based overlays disabled with a reason; the parcels page stops at slicing; a
    browser run by the implementer, fixture by fixture, as the evidence for the canvas.
  - **Amended (spec decisions 49 to 53):** the roster is 21 fixtures; the table of blocking diagnostics follows core as
    it now stands, node 5 having landed, and gains the guard's kinds, with a test that fails when core has a blocking
    kind the dashboard gives no heading; the refusal specimen is node 5's two courtyards with every gap equal; a result
    the guard marks incomplete is drawn as incomplete; and the unit's first commit is the five fixes of node 6's review.
  - **Kept though heavier than the lead leaned in BSA.D308:** a pinned scene digest for every single-loop fixture. It is
    the one gate that holds "the dashboard's single-loop picture did not change", and the user's eyes are the reason
    this node exists.
  - **Parcel slicing stays refused on the parcels page** although BSA.F104 found slicing a holed strip unusual and not
    wrong: lots of a holed footprint are outside this arc.
- **318. Node 5's fix pass is in at `ad45ddd`, `fae1b8d` and `de00f3e`; the holed guard flags none of 8,168 sound solves
  and catches most of the silent wrong ones; the lead widens it by three cheap checks and softens one.** The delegate's
  figures, not re-run: core 6,482 passed, 10 failed by design, 10 skipped; building-shell 9,992; dashboard 331; every
  single-loop sweep cell, region and the census byte-identical.
  - **The guard, two blocking kinds, `holed-topology-violation` and `holed-equal-time-violation`:** over about 9,500
    fuzzed holed solves in seven families it flags no sound solve, at the checker's ordinary and tightened bars. It
    catches 20 of 23 wrong answers on exact axis-aligned unions, 238 of 242 rotated, all 47 on rotated rectangles, and
    under jitter 253 of 379 and 25 of 49. **It reads the graph in unit space:** read in the caller's space it flagged 42
    sound solves at translations of 1e11 and beyond, where carrying coordinates back rounds by more than the floor.
  - **What it misses, and the lead's ruling to add each to the guard, measured the same way:** overlapping or crossing
    arcs with every node right (all 7 misses on exact input, 2 with no other diagnostic); an arc recorded twice that
    names two different pairs of walls (15 of the 30 silent misses under jitter); and an edge running backwards in
    weighted time, which is the open weighted defect on a holed input. So the guard gains: every interior edge's target
    is no earlier than its source; an arc recorded from both ends names one pair of walls; and no two arcs cross or
    overlap, at the perceptual floor. Each must flag no sound solve.
  - **Softened: a zero-length self-loop that is not marked culled, on a result sound in every other respect, is reported
    and does not block.** 184 of the guard's catches fail on nothing else and tile to 1e-9; turning those into hard
    errors would refuse good roofs for a bookkeeping mark the solver forgot. It becomes an informational diagnostic, and
    a self-loop no longer counts as a cycle.
  - **The eight harness cells that moved** are the courtyard with wings at jitter seeds 1 and 3 (two cycles for one
    hole) and six cells with one self-loop each, which the softening returns to complete.
  - **The cause of the overlapping ridge, confirmed by trace on a single loop and a holed input:** a ring of four,
    straight, ridge, straight, ridge, with every event at one moment. Whole-event resolution gives up because the two
    merges share both ridge bisectors, the moment cannot be narrowed, and the pairwise fallback's tie-break by edge id
    pairs a ridge bisector with the far straight vertex. Near and far differ only in distance along the ridge, 0.171
    against 0.269. Every complete and wrong solve on exact input carries a straight bisector (379 of 379), and many
    sound ones do too.
  - **Red by design now, ten tests:** five weighted, one two-hole courtyard, and four for the straight bisector, two of
    them on single loops. `2h-int-113` is green: its solve was sound all along.
  - **The issue note `ISSUE-skeleton-straight-bisector-between-collinear-walls.md` is open** and is the user's to rule
    on, with the weighted one.
- **319. Roadmap node 8, contact, is taken after node 9 and not before it; its draft is revised against everything that
  has landed and stays `proposed` until then.** The roadmap's order is an estimate, and the lead records why it departs
  from it, as the notes schema asks.
  - **Why after:** no caller in the repo needs it. Building-shell's own union already merges walls that coincide and
    refuses corner touches, and the dashboard has no hole editing, so only a gap under the perceptual floor would reach
    the stage. Node 9 is what the user's objective is for.
  - **The revised draft's re-measurement at `68546eb`, by an Opus delegate on a copy of core, not re-run by the lead:**
    every contact fixture is sound once canonicalised, including the three the first draft left waiting for node 5: four
    outline-and-hole point contacts, six two-hole point contacts, six notches, five shared-wall merges, a slit ring with
    a second hole. Refusals by name for a hole that spans the outline, walls coinciding the same way, and a crossing
    through vertices.
  - **The lead's worry in the brief was wrong, as measured:** a single notch never bears a straight bisector (0 of
    1,000). The defect's precondition arises only when merged walls fall in line across building that collapses, as with
    two notches of equal depth on one wall. Notch fuzz: 400 of 400 one-notch inputs sound, 300 of 300 turned, 1,998 of
    2,000 with two notches, 1,984 of 2,000 turned.
  - **A merge can leave no hole,** and the result is then a single-loop graph from a holed input, node for node what the
    same loop drawn by hand gives. **The draft has the guard run whenever the caller gave holes, with the hole count
    read from the solved graph,** so those results are guarded where a hand-drawn loop is not: it blocked all 18 wrong
    merged answers and flagged none of 4,982 sound ones.
  - **For the guard as now being widened:** planarity compared by node id flags every sound stitched solve, because two
    bisectors leave two exterior nodes at one point; compared by position it is silent. No stitched input reaches the
    solver today, since contact is refused, so nothing is wrong now; node 8's spec carries the amendment.
  - **Found on the way, a single-loop defect with no issue note, signalled by the causality check:** an 11-vertex
    outline in which a reflex vertex born when a wedge closes reaches a front after later nodes were made. It is the
    secondary-reflex cause of the weighted issue appearing at unit weights, which the lead recorded in BSA.D312 as
    argued and not measured to be impossible. **That argument is now contradicted by a specimen**, and the issue note is
    to be amended with it.
- **320. Node 5 is complete at `7e6105c`: the widened guard flags none of 8,352 sound holed solves and catches 263 of
  270 wrong ones on exact input; what it still misses is stated. Node 7 is dispatched.** The delegate's figures, not
  re-run: core 6,489 passed, 10 failed by design, 10 skipped; building-shell 9,992; dashboard 331; single-loop sweep
  cells, regions and census byte-identical.
  - **The guard as landed, in `holed-guard.ts`, on holed solves only, read in unit space:** blocking kinds for topology
    (connected, cycle rank equal to the hole count, one pair of walls per arc), equal time, time order, and planarity
    (two arcs crossing inside both); an informational kind for a self-loop not marked culled. It costs 2 to 7.5 percent
    of a roster fixture's solve and 0.3 percent on a 245-edge input.
  - **Left out, with the lead's agreement: the collinear-overlap and T-junction tests.** At the perceptual floor they
    cannot be told from a sound sliver face between two walls that are collinear to within the floor, and flagged 153
    sound jittered solves; telling them apart needs a bar below the floor, which would be a new tolerance and is the
    user's.
  - **Still missed, and silent in 15 of the fuzz's solves:** overlapping arcs, or an arc running through another arc's
    node, with rank, times and wall pairs all right. Two are on exact rotated input; the rest under jitter, some leaving
    a face short by up to 10 percent. **So a holed result marked complete is not proved right;** it has passed five
    checks that the measured wrong answers mostly fail.
  - **The softening returned 196 solves to complete,** 184 sound and 12 wrong ones that only the self-loop had been
    catching. That cost is accepted: the 184 are good roofs.
  - **The weighted holed reproducer now comes back incomplete** with a time-order violation; its red test stays red on
    the property.
  - **Node 5's spec is set `completed`.** Its amendments to node 4's spec, listed in its decisions 41 and 42, are
    recorded by this entry; the earlier spec's text stands as written and is read with them.
  - **Dispatched:** node 7, the dashboard, with node 6's five review fixes as its first commit.
- **321. The spec for roadmap node 9, `building-shell-holed-roof-decisions.md`, is approved by the lead under BSA.D286
  and BSA.D301 as revised and measured, with four amendments; it is dispatched when node 7 leaves the tree.** Revised by
  an Opus delegate against a copy of the repo at `68546eb`; the lead read its decisions 1 to 43 and the report. About
  385 lines.
  - **The measurement that makes it viable, the delegate's and not re-run: of some 34,000 holed islands taken from the
    app's own courtyards, none came back complete and wrong and core threw on none.** Every fixture, rise, courtyard
    golden (20 of them, not 5 as BSA.F94 said), pinned case, roster-pitch case and research case 9a to 9d is sound, 288
    of 288; BSA.F89's jut family and BSA.F90's layout, 161 of 161; 29,292 islands from 24,000 draws of the courtyard
    generator, all sound; 15,001 mixed-pitch one-hole islands, all sound, so the open weighted defect is not met on the
    app's courtyards. Each complete result was checked by the delegate's own checker, and on single-pitch islands
    against the L-infinity distance to the nearest wall.
  - **Several courtyards in one island are refused often, by name:** of 3,000 layouts of 2 to 4 courtyards on the 50 cm
    grid, 1,732 are sound and 1,268 refused. Every one of those is a hard error today, since the app takes one hole per
    island.
  - **The regression, stated plainly: 8 footprints that build clean today are refused by the holed solve.** All are
    layouts inside `tests/courtyard.test.ts`; none is a fixture, golden, pin, catalogue entry or generator draw.
    `CourtL` (Rings `[0,0,1000,300] [0,700,1000,1000] [0,300,300,700] [700,300,1000,700] [1000,0,1400,300]`),
    `JutMidWall`, `BandRunsOnPastCut` and its mirror are refused as three fronts meeting; `JutAlignedS`
    (`[0,0,1000,300] [0,300,300,700] [-250,300,0,500] [0,700,1000,1000] [700,300,1000,700]`), `JutAlignedN`,
    `JutBelowCutLine` and its mirror as a sliver between walls in line. Each becomes a hard error naming the island and
    the cause, with a green test on that guard and its issue note.
  - **Why the lead lands it in the user's absence:** the user ruled the cut a workaround to be removed (BSA.D280,
    BSA.D282) and asked for the roadmap to be steered through (BSA.D301); the alternative of keeping the cut as a
    fallback recovers at most those 8 and keeps the defects of BSA.F89 and BSA.F90; the branch is neither pushed nor
    merged, so the choice is the user's to reverse. **What the user should look at first:** two of the 8 are layouts a
    person would draw, a wing carrying a band's line past the courtyard and a wing in line with a band, and the
    generator's clean draws say nothing about them because it draws no wing beside a courtyard.
  - **Rulings on the draft's open points, as the revision settled them:** holes are grouped by building-shell's own
    containment test, since core's helper refuses the two gap fixtures that build today; a holed hip solid has its
    bottom at the plate; a gable piece is trimmed to the island with its holes; the copy-integrity tally and its 53
    verdicts stay; `solveFaces` never skips a strip; on a holed island a causality diagnostic is a refusal, which closes
    the weighted defect's silent path.
  - **The lead's amendments (spec decisions 55 to 58):** the guard's kinds as landed, the self-loop kind not a refusal;
    **the implementer re-measures on its own tree before deleting the cut and stops if it finds a wrong roof or a wider
    regression;** option A is what is built; the viewer can load a refused layout and shows the cause.
- **322. Roadmap node 7 is built at `9c0389a`, with node 6's review fixes at `dd191e5`: the dashboard lists and draws
  the 21 holed fixtures, steps through them, and no single-loop picture changed. Accepted for review; node 9 is
  dispatched.** The delegate's figures, not re-run: core 6,634 passed, 10 failed by design, 10 skipped; building-shell
  9,992; dashboard 538 in 29 suites; every existing sweep record byte-identical.
  - **The single-loop gate:** a pinned digest of the scene for all 60 corpus fixtures with every debug flag off and on,
    measured before any dashboard edit and green after every one; widening one stroke turns 60 of its tests red.
  - **The browser run, by the delegate with Playwright, screenshots kept outside the repo:** all 21 holed fixtures solve
    and draw with the hole empty; the concentric square and the courtyard with wings step through to a ridge ring;
    labels sit on their own loop's edges and arrows run the solved way; dragging F1's outline across its hole shows
    core's refusal and keeps the last good solve; the refusal specimen shows its incomplete alert over every frame; the
    recursive loader lists the holed fixtures greyed; `Square` and `Offset Cross Junction` are unchanged.
  - **The lead looked at one screenshot itself,** the courtyard with wings of BSA.F90: the hole reads as empty, a ridge
    square runs round the courtyard, and each wing carries its own ridge to the ring. It was sent to the user.
  - **In core:** `solveSkeletonStepped` through an optional observer in `runSimplePolygon`, with `solveSkeleton`
    delegating to the same private function with no observer; an optional loop table on the primary-bisector preview. No
    event, guard, tolerance or constant code.
  - **All 14 mutation gates of the spec convicted,** and three more.
  - **Small things seen and left:** a refused step's detail is printed twice in the alert, once per diagnostic kind that
    carries it; unresolved rays are drawn 100 world units long whatever the shape's size, as they always were; the sweep
    overlay draws nothing at termination on any fixture.
  - **Node 6's spec is `completed`** by the delegate's first commit.
  - **Dispatched:** node 9 to one fresh Opus delegate in the tree, and an independent review of node 7 from a private
    copy.
- **323. The review of node 7 found `solveSkeleton` byte-identical, the single-loop scene digests genuine, and the
  adapter right on every roster fixture; two medium defects on screen while a refusal stands, and five lower, all fixed
  in a pass through the dashboard only.** One independent Opus reviewer from private copies of `9c0389a` and its parent,
  with the dashboard suite re-run in its copy at 538 passed; not re-run by the lead.
  - **Confirmed by the reviewer by running:** `solveSkeleton` old against new on the 60 corpus fixtures, the same
    reversed, the 21 holed fixtures and three others, identical on every field; the stepped entry's result equal to
    `solveSkeleton`'s, its snapshots matching the legacy stepped entry node for node on all 60 single loops; **the
    pinned scene digests reproduced from the parent commit's own adapter for all 60 fixtures,** so they were measured
    before the change; its own adapter checks on 26 holed cases; all 21 fixtures stopping at slicing on the parcels page
    with the holes always passed. It looked at every screenshot and found none contradicting the implementer's account.
  - **Fixed, medium: after a refusal the removed-vertex mark can sit on the wrong vertex,** because the maps kept on
    screen belong to the last good outline and are indexed against the present one. While a refusal stands, nothing
    derived from the stale solve's maps is drawn against the present outline.
  - **Fixed, medium: while a refusal stands, the part of a hole now outside the outline is filled as building,** with
    the stale skeleton over it. The stale skeleton is drawn visibly as stale, and the region's fill is not drawn from
    loops the solver refused.
  - **Fixed, lower:** outline and holes reach the parcels pipeline through one debounce, so no render pairs one
    fixture's outline with another's holes; with the skeleton hidden, labels and arrows on a reversed hole number the
    same way as when shown; in a step-through, bisectors merely pending are not drawn as never having met anything; a
    refusal's heading says refusal and its detail prints once; the comment on the blocking-kinds test is corrected, and
    the test is noted as only as fresh as core's last build.
  - **Who and when:** one Opus delegate now, in `packages/dashboard` and `apps/demo` only, beside node 9's implementer,
    who is in `apps/building-shell` only. It runs the dashboard's suite and builds, and nothing heavier, so node 9's
    timed tests are not starved.
- **324. Roadmap node 7 is complete at `b575a0c`: the dashboard's review fixes are in, each convicted by reverting it,
  and no single-loop picture changed.** The delegate's figures, not re-run: dashboard 609 passed in 30 suites, the
  pinned single-loop scene digests green; the dashboard's `tsc` and the demo's lint show only the errors that predate
  the arc; the demo builds.
  - **While a refusal stands, the canvas now makes no false claim:** the present loops are stroked red and unfilled,
    since the solver accepted no region bounded by them; the last skeleton that solved is drawn as a dashed grey ghost
    with its own outline; a banner on the canvas says so; and nothing is drawn from the stale solve's maps, so no
    removed mark, label or arrow sits on the wrong vertex. Seen by the delegate in the browser on the reviewer's own
    scenario and on a drag across a hole.
  - **Labels are the solver's global ids whether the skeleton is shown or hidden;** outline and holes reach the parcels
    pipeline in one debounced value; pending bisectors on an early step-through frame are not forced on screen as
    unresolved; a refusal is headed as a refusal and its detail printed once; the blocking-kinds test reads core's
    source and fails by name when core's built declarations are stale.
  - **Seen and left, as open items:** on a single-loop refusal the stale skeleton is still drawn as live over the
    present outline, which is today's behaviour and was not the unit's to change; the side panel's incomplete alert can
    show the last good result's text during a refusal; the canvas banner sits in world coordinates and can be off screen
    until the view is panned.
  - **The spec is `completed`** by the delegate's commit.
- **325. Roadmap node 9 is built in five local commits ending `f822370`: building-shell roofs every island from its
  outline and holes, the cut is deleted, BSA.F90's layout builds, and no non-courtyard golden moved. It also brought a
  regression the spec did not foresee: 36 split-band courtyards gabled on every side, clean before, now fail in Cell
  laying. They are red tests; a diagnosis and an independent review are dispatched.** The delegate's figures, not
  re-run: building-shell 9,631 passed and 36 failed in 48 files, typecheck clean; core untouched.
  - **The re-measurement before the deletion, with the widened guard:** every holed island the suite reaches and 8,000
    generator draws, none complete and wrong, none thrown; the only refusals are the 8 layouts of the spec's decision 41
    and `TwoHolesProbe`, which the cut refused too. The delegate's checker refused six wrong answers built on purpose.
  - **The goldens:** every non-courtyard golden byte-identical. Of the 20 courtyard goldens, 17 change in numbering
    only, their canonical form unmoved; 3 change in roof, each the cut's own defect going: `CutOvershootProbe` and
    `CourtyardAt22.5-45s` lose a surviving Internal face and three Unclassified Edges, `Court14Seed7h250` loses a Cheek
    and a Gable. **`Courtyard`'s ridge is at 336.603 cm, the closed form; BSA.F90's layout tops out at 365.47 cm.** 25
    golden files renamed, each identical to its old bytes but for names.
  - **Cured by the removal of the cut:** all 21 pins of cut-piece overshoot and Cheeks beside the cut, the Courtyard's
    18 mixed-pitch roster rows, and ten tucks that stood on the cut. The class "algorithm-B cut-piece overshoot" is
    empty.
  - **The copy-integrity tally and its 53 verdicts are unchanged.**
  - **The regression:** 36 layouts in `courtyard.test.ts`, split bands gabled on every side. Tuck faces on the line of
    the hole's south wall split one Roof plane into two faces, and Cells are laid across that line. The delegate found
    it does not depend on the gable piece's trim. Left red and not re-pinned, as BSA.D266 requires. **This is beyond the
    8 the lead accepted in BSA.D321,** it is in the app's own code and not the solver, and it is the lead's to have
    diagnosed and, if the cure is in how tucks and Cells are handled under BSA.D272, fixed.
  - **Conflict lists re-pinned by the delegate, 51 rows:** 27 by renumbering alone; 24 with a count moved by 1 to 4 on
    the same kinds of plane, which the delegate attributes to BSA.F69, conflicts being counted where a triangle's
    centroid falls. The reviewer is asked to check that attribution, since a moved count re-pinned on an attribution is
    what BSA.D266 guards against.
  - **Lost with the cut:** the built-roof fallback of session 2's decision 204 has no fixture now.
  - **The lead looked at one viewer screenshot,** BSA.F90's layout: walls, an all-hip roof with a ridge ring round the
    courtyard and a ridge on each wing, no stray face. Sent to the user.
- **326. The lead's rulings on node 9's review (BSA.F105): the holed hip solid goes back to standing from the floor,
  which cures the 36; the lost coverage is restored; the conflict re-pins get their cause measured; and the single-loop
  folded roofs are filed for the user with red tests.**
  - **The node 9 spec's decision 25 was wrong and is reversed:** a holed hip solid stands from the floor, as it did
    under the cut. The reason the old spec gave, that Manifold must not be left coplanar layers at the plate, holds
    without the slit too. The diagnosis delegate already in the tree is told, and makes the fix with a test that would
    have caught it. The lead approved decision 25 on a delegate's reasoning that was labelled as reasoning and not
    built; the error is the lead's.
  - **The single-loop folded roofs are the user's, and are filed:** 36 of 5,000 random mixed-pitch islands with no
    courtyard build a wrong roof and no error, at the arc's parent commit as now. Two things could be done and neither
    is the lead's to do unasked: make a causality diagnostic a hard error on single-loop islands, which would turn some
    buildings that build today into errors; and run the solver's guard on single loops, already on the user's list
    (BSA.D314). An issue note and red tests on the three specimens are written in the next pass.
  - **The conflict re-pins stand provisionally:** the cause, BSA.F69's listing by triangle centroid, is measured on 5 of
    the 18 rows where a plane pair appeared or vanished. The next pass measures the other 13 the same way and writes the
    measured overlap beside each pin; a row whose overlap truly changed is un-pinned and reported.
  - **Restored in the next pass:** the golden test over every rule oracle; a holed tuck case with its closed-form area;
    a fixture and a mutation gate for the built-roof fallback of session 2's decision 204.
  - **Left:** the hard error that changed from "Not manifold" to `strip-missing` on 4 of 5,000 single-loop islands is a
    better message for the same refusal; the refusal text that names a corner where walls are collinear is reworded.
- **327. The 36 are cured at `96148ec`: a holed island's hip solid stands from the floor again, and building-shell is
  fully green at 9,693 passed in 48 files. A last pass on node 9 is dispatched.** The delegate's figures, not re-run; it
  verified the cause on its own copies before the reviewer's finding reached it.
  - **The mechanism, on the smallest case:** on the line of the north band's inner wall a gable piece and a covered rise
    stand back to back; with the hip solid's bottom at the plate the union leaves them unfused over a strip 50 cm wide
    below the apex; that tuck cuts the Roof face on the east wall's plane into two faces of one identity, and their
    Cells meet on an interior edge. With the solid standing from the floor no tuck forms in any of the 162 all-gable
    split bands. Roof heights on a 30 cm grid differ from the parent commit by 0.00 cm before the fix and after.
  - **What moved, each with its cause:** 25 courtyard goldens re-exported, in each of which the only raw part whose
    geometry moved is the holed hip solid; every shell golden keeps its canonical form; every non-courtyard golden
    byte-identical. 15 conflict pins re-pinned: 7 in a winning Wall's part id only, 8 in count, **and for every moved
    row the raw overlap of its two tags on its plane is identical before and after,** so only the listing by triangle
    centroid moved, which is BSA.F69 measured row by row. 5 of the 8 return to their count at the parent commit.
  - **Tests added:** the holed hip solid stands from the floor; the smallest of the 36 leaves no tuck and its Roof is
    one face at the closed-form height; a holed tuck case at three storey heights, restored from what the cut's tests
    lost.
  - **Left open by the delegate and recorded: the face-split is latent.** A tuck whose two rims meet one identity on one
    plane would still split that face and have Cells laid across it. The fix removes the tuck; it does not change how
    such a tuck would be handled. Reading faces through a tuck as Edges are read through it (BSA.D272) is a new rule and
    is the user's. No such tuck is known in the suite.
  - **The node 9 spec's decision 25 is reversed in place** (its decision 59).
  - **The last pass on node 9:** the issue note and red tests for single-loop folded roofs; the golden test over every
    rule oracle; a fixture for the built-roof fallback; the remaining conflict rows measured; the refusal text reworded;
    and the amendments to `building-shell-prototype-decisions.md` that the node 9 spec lists, applied by the delegate
    for the lead to read as a diff.
- **328. The user, 2026-11-15: The user asks whether every island's hip solid should stand from the floor, so that there
  is one rule, and whether that would create a different bug.** The user's words: "Should we move the non-holed branch
  to the same rule then? Or does that create a different bug? Seems like we should have one rule if we can?"
  - **The lead's answer: not known, and so measured before anything is decided.** Session 1's decision 132 allowed the
    extension "if the identity check shows it removes a defect class and moves nothing else", and that check was never
    run; session 1's decision 135 recorded two `cleanMesh` refusals with floor-standing holed solids; and the bottom at
    the plate puts a pair of coplanar faces on every building, which is the kind of place the union leaves a tuck
    (BSA.F87), so one rule might cure tucks that are only labelled today. That last is a guess.
  - **Dispatched:** a read-only measurement on a private copy of `96148ec` with every island's hip solid standing from
    the floor: the suite, the goldens in canonical form, tucks before and after, refusals and defects, roof heights, and
    build time. Nothing is committed. The choice is the user's once the table is in.
- **329. The user, 2026-11-15: The churn of every golden's raw-part bytes is not a cost to weigh against one rule for
  the hip solid.** The user's words, of the lead's remark that every building's raw hip solid and so every golden would
  move: "we just eat this." So the question of BSA.D328 turns only on behaviour: whether a floor-standing hip solid on
  every island cures tucks, breaks nothing, or trades one defect for another. This also stands as the user's steer for
  golden churn in general in this arc, beside the courtyard ruling of BSA.D284: bytes that move for a stated cause are
  re-exported and reported, not avoided.
- **330. Roadmap node 9 is complete at `8be3a7f`: building-shell roofs courtyards on the holed skeleton with no cut; its
  spec is `completed` and the app's own spec is amended in place. The suite is 9,710 passed and 4 failed, the 4 red by
  design for folded single-loop roofs.** The delegate's figures, not re-run; the lead read the amendments to
  `building-shell-prototype-decisions.md` as a diff and found each in place, dated, and citing its decision, with the
  cut block struck and kept.
  - **Single-loop islands of mixed pitch, the issue note `ISSUE-building-shell-mixed-pitch-island-folded-roof.md`, open,
    with four red tests asserting on the union mesh that the Roof covers the footprint once, faces up and stands on the
    footprint.** A correction to BSA.F105: the reviewer's three specimens build a wrong roof and then throw later, in
    Cell laying, with an error that names a Cell; a fourth, found by fuzz, builds its whole shell with no error. Of
    4,948 single-loop storeys in that fuzz, 53 have a wrong roof, 52 of which throw later and 1 builds whole; 32 carry a
    causality diagnostic and 21 none; none of the 4,895 sound roofs carries one. **So making a causality diagnostic a
    hard error would catch 32 of the 53 and refuse no sound roof in this sample.** That softens the cost the lead gave
    in BSA.D326; the choice is still the user's.
  - **Every conflict pin that differs from the parent commit in more than numbering, 21 rows, has its cause measured
    exactly** with Manifold's own booleans: the overlap of the two tags on the plane is identical at both commits in
    every row, and each pin now carries its overlap in a comment. None is un-pinned. The reviewer's sampled figures
    differ slightly from these exact ones.
  - **Coverage restored:** the golden test over every rule oracle; a fixture that reaches the built-roof fallback on the
    holed roof, the Courtyard with its south band gabled, convicted by the mutation the reviewer found unconvicted. The
    fallback is live: 474 generated rises reach it.
  - **The refusal for a pitch change between walls in line now says so.**
  - **The project CLAUDE.md's `src/roof/` line is corrected:** the cut's removal released every file but `surface.ts`,
    and the test pins algorithm B's tally and verdicts.
  - **Open with the user:** the one rule for the hip solid (BSA.D328, BSA.D329), being measured.
- **331. The user, 2026-11-15: The hip solid keeps its two forms for now: a holed island's stands from the floor, an
  island with no hole has its bottom at the plate.** The user's words, on the measurement of BSA.F106: "Fine, Keep the
  split for the moment." One rule buys no correctness, leaves the generators with more tucks and costs the suite its
  tuck reproducers. "For the moment" is the user's: the question reopens when the tuck itself is understood (BSA.F87),
  which the lead recommends as its own investigation.
- **332. The spec for roadmap node 8, `skeleton-loop-contact-decisions.md`, is approved by the lead under BSA.D286 as
  revised and measured (BSA.D319), and dispatched: it is the last node of the roadmap.** The lead read the revision's
  report in full and the spec's decisions by their claims, not every line of their text; that limit is stated here so
  the approval is not taken for more than it is.
  - **What it builds:** one stage in the boundary, for inputs with holes only, that identifies coincident points and
    walls at the perceptual floor, cancels opposite coincident pieces, relinks and traces the loops again. Loops that
    share a wall become one loop; loops that share a point become one loop visiting it once per wedge; a gap under the
    floor is contact and is merged; a region that falls apart, walls coinciding the same way, and a crossing through
    vertices are refused by name. No tolerance, constant or event rule moves, and a single loop never enters the stage.
  - **The conditions the lead attaches, each already a decision of the spec and named here because they are what makes
    it safe:** the holed guard runs whenever the caller gave holes, with the hole count read from the solved graph, so a
    merge that leaves no hole is still guarded (spec decisions 23 and 24); the guard's planarity check treats two arcs
    meeting at a repeated point as meeting at a node, since compared by node id it flagged every sound stitched solve
    the reviser tried (decision 27); and the exemption of a repeated point from the self-contact refusal holds only
    under its three exact clauses, each with its own mutation gate (decisions 21 and 22).
  - **The caller's map changes shape** (`edgeToEdges`; a caller edge can map to several solved edges or none). Without
    contact it is unchanged, and building-shell's own union never produces contact (BSA.D321), so building-shell's suite
    must not move; the implementer runs it to show that.
  - **What the node inherits and cannot claim:** a rebuilt loop solves exactly as the same loop drawn by hand, so it
    inherits the open single-loop defects; the guard blocked all 18 wrong merged answers the reviser measured.
- **333. The user, 2026-11-15: Session 4 closes here.** The user's words: "Wrap up the session here: I want to move to a
  fresh one."
  - **The delegate for roadmap node 8, dispatched minutes before, was stopped by the lead before it made any edit;** the
    tree was clean at `9d907e0` when the lead checked. Node 8's spec is `approved` and unbuilt.
  - **Nothing is pushed or merged.** The branch `feature/skeleton-holes` has no upstream.
  - **The figures the session ends on are delegates', none re-run by the lead:** core 6,634 passed, 10 failed by design,
    10 skipped; building-shell 9,710 passed, 4 failed by design; dashboard 609 passed. Two reviewers re-ran a suite in a
    private copy and matched the implementer's figure (core at node 3, the dashboard at node 7).

## Findings

- **F91. V5 has no stored wavefront order: it derives it from exterior edge ids by modular arithmetic, and that proxy is
  exact only for one loop.** (the lead, reading solver-context.ts, algorithm-complex-cases.ts, collision-handling.ts and
  coincident-events.ts at ee84976 after two Sonnet surveys, 2026-11-14; read, not run)
  - **Where the order is derived:** `initBoundingPolygon` and `initInteriorEdges` wire `(i ± 1) % n`; `span()` in
    `solver-context.ts` walks ids to ask "is the struck edge my neighbour"; `activeExteriorEdgeSegments` sorts an
    exterior edge's live bisectors by an id-rotation key and pairs them two at a time to get its live segments;
    `partitionSpan` and the child assignment at the foot of `handleInteriorNGon` treat a child as an id interval.
  - **Why it works today:** every wavefront ring cut from one loop by splits is a cyclic sub-sequence of the ids, so an
    interval is a ring.
  - **Why a hole breaks it at the root, not at the edges:** when a vertex of one ring strikes an edge of another, the
    two rings become one, and that ring's parents read e.g. `0, 1, 5, 6, 7, 4, 1, 2, 3`. It is no id interval, and the
    struck edge bounds two segments of the same ring. A per-loop offset table would mend the initial wiring and nothing
    after the first join.
  - **What the code does with a cross-ring strike today, by reading:** `handleCollisionEvent` returns the right two
    bisections (`cw = instigator.cw, ws = E` and `cw = E, ws = instigator.ws`), and `recordBisections` then files any
    list of two as a partition, so a join would be built as a split, with children chosen by id interval or the "Unable
    to play interior edge" throw.
  - **`ringsOfSubPolygon` is topological, not arithmetic, and already admits several rings in a step,** but it keys a
    ring's chain on a unique widdershins parent per step, which a joined ring violates (the struck edge is the
    widdershins parent of two of its bisectors), so it would return null and send every layer to the pairwise fallback.
  - **Loop-neutral as read:** `maxOffset` (tests all exterior edges), `hasInteriorLoop` and `tryToAcceptExteriorEdge`
    (walk node in/out lists), `isReflexEdge`, the arrival pricing, and the candidate set for split tests, which is the
    step's own exterior parents and so already holds both loops when both rings sit in the root step.
  - **The CLAUDE.md name `handleInteriorEdges` is stale:** the n-gon handler is `handleInteriorNGon`.
  - **AMENDED by decision BSA.D294:** hasInteriorLoop is not loop-neutral: it tests connectivity through accepted
    interior edges, which is face closure only when the skeleton is a tree. On a holed skeleton the cycle round a hole
    accepts the hole's last open face early. The other items in that bullet stand.
- **F92. Downstream of the solver, a holed result is blocked by index arithmetic in a known, short list, and
  building-shell reaches core through one call.** (a Sonnet consumer survey at ee84976, 2026-11-14; read by the
  delegate, not re-read by the lead)
  - **One call site:** `solveFaces` in `apps/building-shell/src/roof/skeleton.ts` calls
    `solveSkeleton(comp.ring, {weights})`, then `computeStrips` at full depth, and takes one face polygon per exterior
    edge, mapped to a `Wall` by the strip's frontage midpoint. Weights are `1 / tan` per wall in ring order. The roof
    code has no solver of its own.
  - **`Comp` already carries `outer` and `holes`**; `solveFaces` reads only `comp.ring`, which for a courtyard is the
    slit ring `spliceCourtyard` builds.
  - **What a holed solve must hand it:** one face per exterior edge of every loop, a weight per wall, and a tiling sum
    against the true footprint area. With no cut walls the cut branch of `buildPieces` has no input.
  - **Consumers in core that assume one ring by `(i + 1) % n`:** `offset-projection.ts` (dating nodes),
    `causality-check.ts` (`deriveOffsets`, the clearance boundary), `strip-decomposition.ts` (`groupIntoRuns`,
    `frontageOf`, corners; its face trace itself walks edges and is not arithmetic), `debug-helpers.ts`.
    `skeleton-tree.ts` asserts a tree, which a holed skeleton is not; `recursive-subdivision.ts`, `region.ts` and
    `parcel-slicing.ts` take one ring by type.
  - **Tests:** the direction and rate oracles, I3, I5 and the stranded-edge check read only interior edges and parents;
    containment, the tiling reference area, clearance, I1, I4 and every fixture (`{name, vertices}`) assume one loop.
  - **The corpus is 53 clean and 7 defect** by `skeleton-containment.test.ts`, where the project CLAUDE.md says 53
    and 6.
  - **No fixture, store, generator or note anywhere expresses a hole** (greps named in the survey).
- **F93. The boundary stage is a short per-ring pipeline, and most of it applies to a loop as it stands.** (a Sonnet
  survey of the boundary stage at 407a2e5, 2026-11-14; read by the delegate, not re-read by the lead) For roadmap nodes
  2 and 3.
  - **The order in `solveSkeleton`:** fewer than three vertices and non-finite coordinates throw; normalise to unit
    extent; the weight door; canonicalise; reverse to clockwise; decompose if self-crossing; solve; denormalise;
    causality check; `complete`.
  - **Normalisation** is a bounding box over a flat vertex list with a power-of-two scale, so the union of every loop's
    vertices is a drop-in.
  - **Canonicalisation does one thing:** it removes a vertex whose deviation from its neighbours' chord is under the
    floor, smallest first, never below three vertices, never a pinned (weight-change) vertex. It is purely per-ring and
    returns an index map.
  - **The weight door:** finite and positive, the ratio of largest to smallest under `maxWeightRatio`, a change of
    weight only at a visible corner, then division by the smallest. The ratio and the smallest are over one array and so
    would be global across loops by construction; the visible-corner test needs each loop's own wraparound.
  - **Winding** is enforced in one place by reversing the ring and its weights, and **no index map from the caller's
    vertices to the solved nodes is returned** for a reversal. `runAlgorithmV5` never reverses.
  - **`decomposePolygon` discards a counter-clockwise piece as an "exterior island"** and would reverse a hole fed to it
    alone. A holed input must be refused before it.
  - **There is no check for coincident vertices** at the boundary (grep `coincident`); a duplicate is removed only
    because its chord deviation is zero. This bears on roadmap node 8.
  - **Helpers that exist:** `segmentSegmentIntersection` (parallel returns null, so collinear overlap is unseen),
    `findFirstCrossing`, `signedArea`, `isClockwise`, and `isPointInPolygon` in `terrain/polygon-slope.ts`, ambiguous on
    the boundary.
  - **Snapshots of the stepped solve clone the graph only,** so a loop table on the graph reaches the dashboard and
    anything on the context does not.
- **F94. With no cut walls, the roof's piece builder takes its ordinary path, and the work of roadmap node 9 is in how a
  holed `Comp` is built, not in algorithm B.** (a Sonnet read-only assessment of apps/building-shell/src at 407a2e5,
  2026-11-14; traced by the delegate, not run, not re-read by the lead) The opening account node 9 calls for.
  - **A `Comp`'s walls are its `ring`'s edges, in ring order,** and for a courtyard `ring` is the slit ring. `outer` and
    `holes` are the true loops (outline counter-clockwise, hole clockwise, so the left normal is inward on both) and
    produce no walls today. So the change is at `finishBuilding` and `buildingOf`: walls built from every true loop.
  - **`buildPieces` with no cut:** the cut branch is skipped and it is the only code that puts a piece on a cut wall.
    All hips gives no pieces. A gable on an outer wall or on a courtyard wall goes through the same extent, end-wall and
    far-wall logic as any gable; its far wall may be a courtyard wall, as it can be today.
  - **Sites that break and need rework:** `planChecked` in `storey.ts` (throws unless a holed comp has exactly two cut
    walls and one hole); `extrudeOutline` (indexes walls as ring edges); `transformBuilding` in `roof/model.ts`; the
    copies of `extentOf`, `farWall` and `endWall` in `rise.ts`, which read `comp.ring`; `solveFaces`' tiling reference
    area.
  - **Sites that simply lose their input:** every `form === 'cut'` read, the `Internal` zone for cut pieces, the cut
    handling in `roof/measure.ts`.
  - **Plane ids follow wall order,** so removing two cut walls renumbers planes, and roof identity in tags keys on plane
    id. Whether that reaches the golden bytes was not verified.
  - **The copy-integrity test pins behaviour, not bytes:** a tally (`pass 44, cheek 6, fail 3`) and 53 case verdicts
    through `runB`, with no hash (greps for `createHash`, `sha256`, `md5` find none). `algoB.ts` already carries an
    addition by this app. Research cases 9a to 9d use `buildCourtyard` with a slit and would move.
  - **Courtyard surface in the suite:** 22 test files mention courtyards; 5 golden courtyard fixtures in 13 files; the
    three hard errors of holed storeys are asserted by `NoCutProbe`, `TwoHolesProbe` and `CutProbe`.
  - **The project CLAUDE.md's "byte-identical copy" is not literally true** of `src/roof/`.
- **F95. Part A's comparison: the stored links and today's id arithmetic agree except in three places, and in each the
  links are the valid answer; and one event path breaks the wavefront's invariants because an exterior edge is accepted
  too early.** (the stage 1 part A delegate (Opus), measured on its uncommitted tree over 07cf882, 2026-11-14; not
  re-run by the lead)
  - **Rosters:** the corpus at two floors plus the weighted fixtures, the recursion census at three depths, and the
    642-cell sweep. Baseline measured by the delegate before its first edit: core 5,810 passed and 9 skipped in 88
    suites; building-shell 9,992 in 46 files, typecheck clean. With part A: every existing test passes, the sweep
    harness's 32,335 records are identical before and after, and no pin is edited.
  - **`ringsOfSubPolygon` against the links: no disagreement** in any roster, and it returned `null` on no layer at all.
    No split had more than one validating segment (0 of about 405,000 validating calls).
  - **`activeExteriorEdgeSegments`: disagreements only on a ring of two bisectors that share one pair of parents.** The
    arithmetic's sort key is symmetric in the two parents, ties, and id order then labels the segment's ends the wrong
    way round. 64 calls of 5.4 million in the sweep. No split ever resolved on such a segment.
  - **The neighbour guard: every disagreement is the arithmetic permitting a split the links refuse,** never the reverse
    (746 of 3.46 million calls in the sweep, 77 in the corpus). Cause: `span` counts un-accepted exterior ids that
    belong to a sibling ring as though they lay between. The permitted split is an edge event misread as a split.
    **Three such splits actually resolve,** all on complete sweep cells: `offedge:plus:k8:s47514` step 48,
    `offedge:plus:k9:s23757` step 56, `offedge:plus:k10:s47514` step 67. None in the corpus or census.
  - **The partition: no disagreement on any complete solve.** On incomplete along-edge sweep cells, 101 cases where the
    id-interval partition shatters a true ring of four into four single-edge children, which are those cells' recorded
    step failures.
  - **The early acceptance:** on `fine:circle48@2e11` step 8 and `ladder:1x:s2` step 15, both complete solves,
    `tryToAcceptExteriorEdge` accepts an exterior edge while a live bisector still has it as a parent. The bisector that
    would close the ring is then refused at birth for having an accepted parent, and the leftover pair or triangle is
    closed by arithmetic that does not check it is a ring. `Offset Cross Junction`, a known-defect fixture, is on the
    same path. The delegate's diagnosis, not confirmed by experiment: `hasInteriorLoop` accepts an edge when any chain
    of accepted edges joins its ends, through other faces too, and not only when its own face has closed.
  - **`EdgeSection.widdershinsBisector` is the segment's `from` and `clockwiseBisector` its `to`,** established from the
    sort key and the comparison.
  - **Mutation:** 13 of 15 link-writing mutations turn a gate red in the corpus or unit tests; the triangle closure by
    best collision is convicted only by the sweep; splicing out a bisector that is never born is not convicted.
- **F96. Part B switched every reader to the links and no complete solve changed: no pin moved and no clean fixture
  moved.** (the stage 1 delegate (Opus), measured at a997110, 2026-11-14; the lead confirmed the two commits and a tree
  clean of code, and re-ran nothing)
  - **Commits:** part A `7b6ef97`, part B `a997110`, local on `feature/skeleton-holes`. Core: 5,827 passed, 2 failed, 9
    skipped, the 2 being the red early-acceptance file by design. Building-shell: 9,992 in 46 files, golden drift
    holding, typecheck clean.
  - **What diverged, all on solves incomplete before and after, with the four oracle counts, containment and tiling
    unchanged:** 54 along-edge sweep cells, where a true ring is now handed on whole in place of being shattered into
    one-edge children, and the failure moves to "Unable to generate any collisions" on a degenerate ring with no event;
    `ladder:1x:s1`; and `Offset Cross Junction` with its 12 census regions, whose error message changes and whose census
    signature does not. The last two are on the early-acceptance path.
  - **The early acceptance fires on five solves:** the two complete red-test cells, `Offset Cross Junction` and
    `ladder:1x:s1` (incomplete), and `ladder:3x:s3`, complete with no invariant violation.
  - **The three `offedge:plus` cells did not change.** Their misread split arrives by the direct-strike path of
    `generateSplitEventFromTheEdgeItself`, which has no neighbour guard in the old code or the new.
  - **The neighbour guard, now asked after validation, decides one cell in every roster:** `offedge:plus:k7:s7919`.
    Disabling it leaves the whole suite green; only the sweep harness, which the suite skips, sees it.
  - **`partitionSpan` is the one piece of id arithmetic left in the event path.** It decides no child step; it orders
    the births of partition bisectors and breaks a tie between re-reports. Replacing it by a link-derived order
    renumbered 16 pinned digests, clean fixtures among them.
  - **Mutation:** segments, partition order, partition membership and ring direction each turn 33 to 49 tests red. The
    guard and the splice of a never-born bisector are not convicted by any standing test.
- **F97. The review of stage 1 found no link-writing defect a sound single-loop solve reaches, and four real problems,
  two of which matter only once there are holes.** (an independent Opus reviewer of 60fcbed..a997110, read-only, with an
  instrumented run of 772 solves on a throwaway copy, 2026-11-14; not re-run by the lead)
  - **Confirmed by the reviewer:** every rewrite reads current links; W2 holds by construction for the pair collapse,
    the vertex-to-vertex event, the split, the merge gap, births and closures; **the split rewrite is correct for a
    struck segment on a different ring** and for two segments of one edge; `Wavefront` is plain arrays; the probe costs
    production one module read per solve and one optional call per step, and both test probes only read.
  - **1. Coincident splits of one segment are unsound** (`wavefront.ts` near line 360, and the same-start, same-source
    dedupe in `algorithm-complex-cases.ts`). Two splits sited at one point always tie on position along the edge, the
    tie always takes the "after" piece, and that is right only for one ordering of the instigators. The wrong ring still
    satisfies W1 to W4, so the gate cannot see it; the dedupe then drops one bisector and its splice breaks W2. Never
    reached in 772 solves (the walk runs on one layer of `Golf Cart`).
  - **2. The gate's exclusion is solve-wide and sticky.** Once an accepted parent on a live bisector is seen at any
    boundary, every violation of that solve is discarded, earlier and unrelated ones too, and nothing records how many
    solves are excluded (6 in corpus and sweep, 4 per census depth). A solve that throws outside `stepAlgorithm` is
    silently uncounted.
  - **3. The pair collapse finds adjacency by parent id** (`checkSharedParents`, and the `interiorPair` against
    `interiorNonAdjacent` classification), the one remaining instance of what spec decision 10 forbids. With an edge
    bounding two segments of one ring, two bisectors that are not neighbours share a parent and would be collapsed as
    neighbours. 0 of 1,503 pair collapses were non-adjacent by link.
  - **4. The struck segment is searched over the whole graph, not the step's rings,** and the guard is asked only of the
    first validating segment. 0 of about 320,000 validating calls struck outside the step.
  - **Lower:** splicing out a never-born bisector between two live ones can never satisfy W2 and is sound only when a
    whole ring of them goes (22 of 35 observed are a duplicate 2-ring on `rosette40` cells, the rest are the
    early-acceptance path), which is why its mutation is unconvicted; a throw in mid-layer leaves pending tokens in the
    stored arrays; `solver-context.ts` near line 241 silently drops a segment whose `to` link is broken.
  - **Single-ring assumptions left for holes, beyond `partitionSpan`:** `ringsOfSubPolygon` returns `null` whenever an
    edge bounds two segments; `asWholeEvents` wants a merge's arrivals on one ring; the parent-id classification of 3;
    the graph-wide search of 4; the dedupe keyed on exterior id; and `hasInteriorLoop`, which is not segment-aware.
  - **Stale comments:** `wavefront.ts` lines 16 to 19 and 561 to 563, `algorithm-termination-cases.ts` line 1245.
- **F98. Asking the neighbour guard on the direct-strike path moves seven complete sweep cells, cures a surplus edge in
  six and makes one worse; it is not applied.** (the stage 1 delegate (Opus), measured on a reverted edit over c9c1b30,
  2026-11-14; not re-run by the lead)
  - **Follow-up commit `c9c1b30`:** a standing guard test on `offedge:plus:k7:s7919` (red with the guard disabled or
    either side misdirected) and a constructed test of the never-born splice (red with the splice dropped). Core: 5,829
    passed, 2 failed by design, 9 skipped. Tree clean.
  - **The guard test asks about offered splits, not resolved ones,** because on that very cell a direct strike on a
    neighbour's neighbour resolves today, unguarded.
  - **The measurement:** no suite test moves, and no corpus, along-edge, ladder, regular or census record. Seven sweep
    cells move, all complete before and after, all still trees, none with an escaped node.
  - **Six improve by one culled edge:** `fine:rosette40` at 4e10, 5e10 and 6e10, and `offedge:plus` k7:s7919, k9:s23757
    and k10:s47514. In the `offedge:plus` cells the misread split had borne a bisector the solve then retired as a
    surplus self-loop.
  - **One regresses:** `offedge:plus:k8:s47514` goes from no oracle violation to one offset and two direction
    violations, on the solver's oracles and the test's. Not diagnosed.
  - **No structural obstacle** to asking the guard there: the struck segment is in hand once validation passes, and a
    refused direct strike falls through to the guarded incenter path.
- **F99. The acceptance cure, measured before the switch: the old and new rules disagree on the six named solves, on
  four `rosette40` cells and on one harmless ladder cell; the cure fixes three solves, leaves one identical, does not
  cure `Offset Cross Junction`, and trades `circle48`'s tiling miss for two small violations.** (the acceptance delegate
  (Opus), measured at 420c604 with the old rule deciding, and by a reverted trial of the switch, 2026-11-14; not re-run
  by the lead)
  - **Commits:** `f008560`, the review fixes for nodes 2 and 3, with that spec set `completed`; `420c604`, the measuring
    step alone. Core 5,899 passed, 7 failed by design, 9 skipped; building-shell 9,992, typecheck clean; 32,335 sweep
    records unmoved at both. (BSA.D297's 32,340 was the earlier delegate's count; this delegate and the spec say
    32,335.)
  - **The issue's diagnosis is confirmed by measurement:** on all five single-loop offenders the chain `hasInteriorLoop`
    walks leaves the edge's face while a bisector naming the edge is live, and on all five it runs through a hub node
    where many faces' bisectors end within the floor. A cycle is present on only two (`Offset Cross Junction`'s
    duplicate ridge, `circle48`'s zero-length self-loops), so the cycle inference recorded in BSA.D294's spec holds for
    two of five.
  - **Off the six, `fine:rosette40` at 7e10, 8e10, 9e10 and 1e11,** all complete: at step 6 no live bisector names edge
    20 but two pending births do, `(cw 20, ws 26)` and `(cw 26, ws 20)`, both at the node where face 20 closes. The old
    rule accepts the edge and refuses both. Under a plain switch these four gain two edges each.
  - **Off the six, `ladder:1x:s5`:** the old rule is one boundary late on two edges no bisector names. Byte-identical
    under the trial.
  - **The trial of the switch moves 20 of 32,335 records:** `Offset Cross Junction`'s root and its 12 census roots,
    `circle48`, `ladder:1x:s1`, `ladder:1x:s2`, and the four `rosette40` cells.
  - **`ladder:1x:s1`:** incomplete with a step failure becomes complete, all oracles clean, tiling to about 1e-8, not a
    tree.
  - **`ladder:1x:s2`:** complete with a 4 to 12 percent tiling miss and 3 wavefront violations becomes complete with
    none, one more edge, not a tree.
  - **`ladder:3x:s3`:** byte-identical. Its early acceptance refuses no birth.
  - **`fine:circle48@2e11`:** a 49 to 62 percent tiling miss becomes about 1e-8 and its wavefront violations go; it
    gains one offset and one direction violation on one newly born bisector and stops being a tree.
  - **`Offset Cross Junction` at 1e-6:** two step failures become one, still incomplete. At 1e-5 it is byte-identical.
- **F100. The review of the acceptance cure found no correctness defect: the argument for asking at step boundaries
  holds, byte identity holds on 690 of 702 solves compared independently, and the same-node ring rule removes only pairs
  of no extent.** (an independent Opus reviewer of f008560..8170011, read-only, comparing 702 solves at both commits
  from bundled sources, 2026-11-15; not re-run by the lead)
  - **Every in-step reader of an exterior edge's acceptance asks only about an edge a live bisector of its own step
    names,** so each now reads "not accepted" and is right to. The spec's list missed one reader,
    `collision-handling.ts` line 17, which behaves as the others. No birth can meet an accepted parent: every birth's
    parents are its participants' parents.
  - **Late acceptance cannot change a sibling step input's events** except where the old rule accepted an edge a live or
    pending bisector still named, which is the defect itself.
  - **The 12 solves that moved of 702:** four of the six (`Offset Cross Junction` at 1e-6, `circle48@2e11`,
    `ladder:1x:s1`, `ladder:1x:s2`) and eight from the ring rule. No complete solve ends with an exterior edge
    unaccepted. The census and building-shell were not run by the reviewer.
  - **The ring rule fired 23 times over sweep and corpus, always on a ring of two** with mirrored parents, never three
    or more. It reads clockwise links and the source node only. The reviewer could not build a ring of real extent that
    it would remove and argues none exists: every vertex of a ring sourced at one node lies on all its parents' offset
    lines at birth.
  - **BSA.D302 overstated one thing:** it says every moved cell goes from not a tree to a tree. On four of the six
    `offedge:plus` cells other self-loops remain, and whether `isTree` counts them was not checked. The acceptance
    stands on the rest of the reasoning: same nodes, oracles, tiling and completion, two edges of no length fewer.
  - **Cost of the new predicate:** a scan of all interior edges per exterior edge per boundary, 0.35 to 1 percent of
    solve time at 200 and 400 vertices and on the sweep.
  - **Low findings:** on a context with no interior edges the public `tryToAcceptExteriorEdge` now accepts everything,
    where the old one returned false, and no caller does this; the constructed ring tests settle the layer and assert
    nothing about the links afterwards; the end-of-solve check that every face closed lives in the test probe only, and
    production's `complete` never reads exterior acceptance, though `types.ts` line 416 says it does; five stale or
    inverted comments and titles.
  - **The early-acceptance file's roster cases are now true by construction** and serve as a mutation guard against
    restoring the old rule, at about four minutes of suite time.
- **F101. The review of node 4 found the unweighted holed solve correct on every input it tried, the solver's clearance
  check blind to weights, and a weighted defect in the solver that predates holes and that holes make more frequent.**
  (an independent Opus reviewer of a8ba71f, read-only, with its own checker and about 5,000 fuzzed inputs solved from
  core's source, 2026-11-15; not re-run by the lead)
  - **Unweighted, checked by the reviewer's own checker** (equal time at every node, clearance, containment, time never
    decreasing along an edge, a closed face per exterior edge, tiling, and the generic counts of `n + 2h − 2` interior
    nodes and `2n + 3h − 3` interior edges): fixtures F2, F5, F5 mirrored; three inputs of its own; **3,141 random
    generic holed inputs with 1 to 6 holes, all complete and clean, none refused**; 389 rotated rectangular holes; 200
    pocket inputs, 178 of which exercised the least-area rule and were right.
  - **The clearance oracle in `causality-check.ts` never divides by weight.** It dates a node by distance from one
    parent and compares with Euclidean distance to the nearest wall. On weighted input it reports violations on correct
    skeletons: F4's `clearance 8` is one violation at node 8, on a skeleton that passes every weight-aware check. Four
    single-loop weighted fixtures carry the same false reports today (`Weighted L` 3, `Weighted Pentagon House` 2,
    `Weighted Square (1e-3 turn)` 1, `Weighted Invisible Vertex Rectangle (corner)` 2), which no single-loop test pins.
    **F4's test is the first to pin one, and is green because it asserts the oracle's defect.**
  - **A weighted defect in the solver itself, measured by fuzz:** of 800 random holed inputs with each hole edge
    weighted between 0.7 and 1.5, 611 are clean, **84 are complete and wrong** (an interior edge runs backwards in
    weighted time), 47 fail with "Unable to generate any collisions", 4 are refused as `multi-ring-step-refused` and 1
    as `simultaneous-across-rings`. **The same fuzz on weighted single loops gives 5.6 percent wrong and 0.75 percent
    failed,** so the class predates this commit. Holes at one constant weight give 764 clean and 1 wrong. Because the
    oracle fires on nearly every weighted solve, a wrong weighted answer is in effect unsignalled. One refusal was
    traced: an earlier corridor event between an outline edge and a hole edge was missed, a bisector then ran away at
    speed 11.9, and the ring-assignment refusal caught the self-intersecting ring that followed.
  - **The cross-ring refusal's whole width is parallel facing walls of different rings:** 400 of 400 axis-aligned
    rectangles with an axis-aligned rectangular hole are refused at the root, because two corners of the hole reach the
    nearest wall at one moment; in general position it never fired in over 3,500 inputs.
  - **Lower:** nothing tests the least-area rule of spec decision 15; the area-sign classification trusts a ring's
    polygon to be simple; an assertion was dropped from `skeleton-loops-input.test.ts`; the cycle-rank helper would not
    see a duplicate arc; the pinned step-by-step stories are partly over-fit.
  - **Sound by reading:** `partitionArc` terminates and telescopes to the old span on sound links, and can differ only
    on broken ones; a refused layer changes nothing; dispatch and the struck-segment search.
  - **AMENDED by finding BSA.F102:** A wrong weighted answer is signalled by the direction oracle on every measured
    case; the single-loop rate of an edge backwards in time is 4.25 percent, and 5.6 percent counted two other kinds of
    wrong answer with it.
- **F102. The weighted defect's rates, corrected, and its reproducers: 4.25 percent of random weighted single loops come
  back complete with an edge running backwards in weighted time, and every such case is signalled by the solver's
  `direction` oracle.** (the node 4 reviewer's follow-up, regenerated from its fuzz at a8ba71f, 2026-11-15; not re-run
  by the lead)
  - **The correction to BSA.F101:** a wrong weighted answer is not unsignalled. The `direction` oracle does not depend
    on weight and fires on all 34 single-loop and all 84 holed backwards cases. What the weight-blind `clearance` and
    `offset` reports do is bury that signal in false ones.
  - **Weighted single loops, 800 inputs:** 749 clean; 34 with an edge backwards in time; 9 complete with strips short by
    0.2 to 55 percent; 2 complete with two-wall nodes outside the outline, undiagnosed; 6 incomplete. BSA.F101's 5.6
    percent counted the first three together.
  - **Weighted holes, 800 inputs:** 611 clean; 84 backwards (10.5 percent); 56 incomplete, of which 47 "Unable to
    generate any collisions", 4 `multi-ring-step-refused`, 1 `simultaneous-across-rings`; 49 discarded as self-crossing
    by the generator.
  - **The property that fails,** stated independently of any script: with a node's time taken as its distance to a
    parent wall's line over that wall's weight, every interior edge has a target no earlier than its source.
  - **The reproducers, with exact coordinates and the generator's recipe,** are in the lead's scratch file
    `node4-review-reproducers.md` for the fix delegate, who writes them into red tests and the issue note: a 7-vertex
    weighted single loop that is complete and wrong; an 8-vertex one that fails; a 5-vertex outline with a weighted
    5-vertex hole that is complete and wrong; one that fails; one refused at ring assignment after a missed corridor
    event.
  - **The pocket input for the least-area rule** is there too: a C-shaped hole with a pentagon in its cavity, whose
    pinch leaves four rings, the pentagon's ring lying inside both the outline's ring and the pocket's.
- **F103. The review of node 5 found its own rules right and found that it lets holed inputs through to an older
  single-ring defect: wherever two collinear walls face the same way, the solver can return a wrong skeleton, on a
  single loop today as well, and sometimes with no signal.** (an independent Opus reviewer of 3abb3ac, working from
  private copies of that commit and its parent, with its own checker and about 20,000 solves, 2026-11-15; not re-run by
  the lead)
  - **Node 5's code is sound:** no wrong node or arc is ever created inside a step of several rings (216 of 216 traced);
    the cross-ring births keep W2 by construction; every ring of two the new rule passed on, in about 4,300 solves, was
    a true corridor; the refusal is decided before any mutation and refused no sound layer; and over 12,556 single-loop
    solves no new code path was reached and the counts equal the parent commit's.
  - **Realistic footprints with one courtyard are all sound:** L, T, U and plus shapes on a grid with every valid single
    courtyard, 1,098 of 1,098, each checked against the L-infinity distance to the nearest wall, an oracle independent
    of the solver. The spec's fixtures turned through 360 angles are all sound.
  - **The common precondition of every wrong or incomplete answer found, holed or not: a "straight" bisector, born
    between two collinear walls that face the same way** (two hole walls on one line; a hole wall in line with an
    outline wall; two outline walls either side of a wing).
  - **Three mechanisms, all in one-ring steps:** (K1) two straight vertices reach a collapsing ridge together and each
    ridge bisector is paired with the far one, giving overlapping arcs, wrong faces and one cycle too many, **with every
    node in the right place, `complete: true` and no diagnostic**; (K3) a ring of two or three straight bisectors that
    the pair or triangle handler cannot close, signalled as a step failure; and a zero-length self-loop that is not
    marked culled, complete and undiagnosed but detectable.
  - **On single loops today, before any of this arc's work:** K1 and the unculled self-loop both have single-loop
    reproducers; 2 of 1,056 axis-aligned unions of rectangles are wrong, 10 of 6,000 dense ones, and of the same
    outlines turned by an arbitrary angle 112 of 1,500 and 355 of 4,000.
  - **What node 5 changed in outcome:** before it, every axis-aligned holed input was refused at the root. After it, of
    3,000 axis-aligned unions of 2 to 4 rectangles with 1 to 3 holes, 2,752 are sound, 219 refused by name, **15
    complete and wrong, 14 of them with no diagnostic**, 14 incomplete. Turned by an arbitrary angle, 223 of 1,500 are
    complete and wrong, 180 with a causality diagnostic and 43 with none (K2: nodes misplaced by 1 to 35 units on a grid
    of 100 where walls are nearly collinear).
  - **Three courtyards in a row:** 45 of 115 sound, 61 refused, 9 incomplete. The three-front refusal is common there
    (54 of 115), and with it switched off those cases become other refusals, never wrong and never sound.
  - **The red test `2h-int-113` is red for the wrong reason:** its self-loop is marked culled, as sound single-loop
    solves routinely have, and the test's helper counts culled loops.
  - **Unreached and suspect:** the piece rule's fallback when no piece on the ring contains the strike.
  - **Reproducers with exact coordinates** are in the lead's scratch file `node5-review-reproducers.md`.
- **F104. The review of node 6 found no defect in the consumers: for building-shell's call, strips on a holed result are
  one per exterior edge of every loop, each exactly that edge's skeleton face, tiling the region; and every single-loop
  output is bit-identical to the parent commit.** (an independent Opus reviewer of 9b5f90c from private copies of it and
  its parent, with its own checks on 34 holed inputs, 120 random ones and 222 single-loop cases, 2026-11-15; not re-run
  by the lead)
  - **Strips, checked against faces the reviewer traced itself,** on the 21 roster fixtures, 13 footprints of its own
    (L, T, U and plus with courtyards, two courtyards at unequal gaps, weighted holes, an L-shaped hole) and 120 random
    inputs, at full depth, five partial depths and just either side of each of the first 12 event times: no failure. A
    hole edge's strip is clockwise, its frontage runs counter-clockwise round the hole, and it never covers the hole; of
    228,570 sample points inside holes or outside the outline none is covered. **`loopMaps` maps each caller wall onto
    its strip's frontage,** through a hole given clockwise, an outline given counter-clockwise and a vertex
    canonicalisation removes.
  - **Offset rings:** at offset 0 exactly the loops; elsewhere no unclosed chain, no ring crossing itself, none touching
    another, and a counter-clockwise ring holds only hole edges.
  - **Single-loop identity:** offsets, rings at 8 depths and strips under every option, over 222 cases, compared across
    both commits with no differing byte.
  - **Parcel slicing of a holed result is unusual, not wrong:** 1,216 holed strips sliced, parcels tiling their strip.
  - **The roster's 21 fixtures are bit-identical to their definitions before the move,** and the four single-loop
    rosters are unchanged in content and order.
  - **Low findings:** node 4's fixtures F1 to F8 lost the equal-time and time-order checks at 1e-9 when their battery
    moved, so the weighted F4 has no equal-time check; **the sweep harness's holed records cannot show a self-loop or an
    extra cycle** (of 208 complete jittered or translated cells the reviewer found 28 structurally wrong, 25 visible
    only as a changed digest); a hand-built graph with a context and no loop table now gets an empty strip list
    silently; two test-side checks read the same exterior target as the solver; the project CLAUDE.md still says "two
    rosters".
  - **For node 9:** on one wrong jittered cell a full-depth strip has an empty boundary, and building-shell's
    `solveFaces` skips a strip with fewer than three points silently.
- **F105. The review of node 9 found the courtyard roofs right against an oracle independent of the skeleton and of the
  app, found the cause of the 36 red tests, and found that single-loop islands of mixed pitch have built folded roofs
  silently since before this arc.** (an independent Opus reviewer of 9c0389a..f822370 from private copies of both
  commits, with its own checker reading only the final union mesh, 2026-11-15; not re-run by the lead)
  - **Single-pitch all-hip courtyards, the built mesh sampled on a grid against the plate plus the tangent of the pitch
    times the L-infinity distance to the nearest wall of any loop:** the worst error is float32 noise, 1.3e-6 cm on
    `Courtyard`, 3.24e-4 on BSA.F90's layout, 3.27e-4 on `TwoCourtyards`, at most 4.86e-4 over 8,000 generator draws.
    The reviewer's checker convicts the old cut roof of `CutOvershootProbe`, 10.8 cm too high.
  - **Courtyards of mixed pitch and with gables:** every Roof triangle on its own wall's plane at its own pitch, the
    footprint covered exactly once, the mesh closed: no failure in 8,000 all-hip draws at random pitches, 4,800 draws as
    drawn, and 3,000 lattice footprints with 1 to 3 holes at pitches of 15 to 70 degrees, of which 2,678 roofed sound
    and 252 were refused by name. **No silently wrong holed roof in any run.** The hard-error wiring holds on every path
    a user's build takes.
  - **The 36 red tests are caused by the node 9 spec's decision 25,** the holed hip solid's bottom moved from the floor
    to the plate. With that one change reverted on a copy, all 162 all-gable split bands are clean, 649 of 649 tests in
    four files pass, and all 97 goldens keep their geometry. The roof surface of all 162 is right as built; the defect
    is coplanar plate layers the union tucks, and the Cells laid across them. No golden or gate told the two apart, so
    the decision's "sound" was never tested.
  - **Predating this unit, identical at its parent commit: of 5,000 random single-loop islands with every side at its
    own pitch, 36 build a wrong roof and no error:** three Roof layers over one plan point, Roof triangles facing down,
    roof outside the footprint. 20 of them carry a causality diagnostic that `solveRoofParts` drops (`RoofParts` has no
    field for it), so the app's "count and continue" is "ignore"; 16 carry none. Given a courtyard, every such footprint
    is refused by name, mostly by the planarity guard, which does not run on single loops. Three specimens with their
    Rings are in the reviewer's report.
  - **The re-pinned conflict lists:** in 18 of the 24 rows whose count moved, a plane pair appeared or vanished; only 6
    are a change of multiplicity. For 5 of the moved rows the overlap between the two tags' raw triangles on the plane
    was measured at both commits and is identical, so the overlap exists in both builds and only its listing flips,
    which is BSA.F69. The other 13 are unmeasured. The conflict list misses real overlaps of up to about 5 square
    metres, as it did before.
  - **Coverage lost with the cut's tests:** a golden test over every rule oracle that was not about the cut; the only
    holed tuck case and its closed-form area test; the fixture for the built-roof fallback of session 2's decision 204.
  - **Goldens built at both commits and compared as geometry:** all 71 non-courtyard goldens identical; 17 courtyard
    goldens identical; the 3 that changed are each right by the reviewer's checks.
  - **Lower:** 4 of 5,000 single-loop islands that threw "Not manifold" now throw `strip-missing`, a different hard
    error; a refusal message names a corner where two collinear walls differ in pitch.
- **F106. Making every island's hip solid stand from the floor changes no roof and breaks nothing, and it does not cure
  tucks: it moves them. It is a trade, not a cure.** (an Opus measurement on two private copies of 96148ec, 11,822
  builds each side, run twice with identical results, 2026-11-15; not re-run by the lead)
  - **The edit is one line in `hipSolid`.** Over 11,822 builds, no build throws on one side only, no `cleanMesh` failure
    appears on either side, and no defect count rises. Roof heights at 983,188 sample points differ by at most 0.01 cm,
    the rounding grain. In 11,803 builds the canonical shell is identical; the other 19 differ only in Tuck faces.
  - **Tucks:** the 14 curated tuck cases, chosen because they tuck, all stop (28 Tuck faces to 0), with every reproducer
    of BSA.F87 and the port's tuck golden `U8Seed6h300`. **In the seeded courtyard, split-band and U generators, which
    were not chosen for tucks, the count rises from 5 tucked buildings to 17.** 17 buildings lose a tuck and 15 gain
    one. Every new tuck is labelled, carries no Cells, causes no violation and splits no face.
  - **One new tuck traced:** a storey-0 gable standing back to back with storey 1's taller Ring wall, which ends inside
    the gable's span: BSA.F87's own configuration, with the part that changed being storey 1's hip solid. This fits
    BSA.F87's finding that a tuck depends on raw parts away from the contact.
  - **A small cure:** one Unclassified Edge becomes Eaves in each of four nudge cases.
  - **The two courtyards of session 1's decision 135 build clean either way,** and low caps from 5.05 to 25 cm at convex
    corners are clean either way.
  - **Cost of adopting it, beyond golden bytes the user has waived (BSA.D329):** about 3 percent of build time; and the
    suite's reproducers go, since the tuck oracles (about 35 tests), six G1 sheet and pillow cases, nine imprint
    controls and one tuck-unlabel test are built on buildings that would no longer tuck, and would convict nothing until
    rewritten on new ones. About 70 conflict rows and 61 pins carrying ids move with it.
  - **It meets neither bar the record set for it:** session 1's decision 132 asked that it remove a defect class and
    move nothing else, and decision 135 that it regress nothing.
