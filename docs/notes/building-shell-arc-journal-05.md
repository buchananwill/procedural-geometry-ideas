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
- **335. The user, 2026-11-15: The pairwise fallback's order among simultaneous events becomes geometric, built in two
  stages by one delegate: first the shared-bisector case, then the general case.**
  - Stage 1: of two simultaneous events that share a bisector, the one whose meeting point is nearer along that
    bisector's ray from its source is resolved first (BSA.F107). The user's restatement, confirmed: on a level bisector
    time no longer stands in for position along the ray, so the order goes back to position.
  - Stage 2: simultaneous events that share no bisector stop being ordered by edge id. What replaces it is not fixed
    here: the delegate first measures whether their order changes any result, and reports before building if it does.
  - This is the user's ruling on a change to how single-loop events resolve (BSA.D301). It is dispatched from this
    decision and BSA.F107 without a separate spec, by the lead's choice: the rule is one comparator.
  - The user's expectation, to be tested and not assumed: the change only removes defects. A clean fixture whose answer
    moves, or a pinned defect signature that moves, is reported to the user with its diagnosis and is not re-pinned by
    the delegate.
  - An independent review follows each stage's commit.
- **336. The user, 2026-11-15: The user, on the five core tests that turned red when their defect was cured: "that's why
  we don't write tests that are green when the code is defective."** BSA.D266 restated, this time against core's own
  pins.
  - The five are in `along-edge-jitter.test.ts` (three), `stroke-derived-polygons.test.ts` and `holed-guard.test.ts`
    (BSA.F108). Each was green while the solver was wrong and went red when it was fixed, which cost a diagnosis to tell
    a cure from a regression.
  - **The lead's reading, not the user's words:** this settles the part of BSA.D266 left "not ruled" in principle, that
    the ruling reaches core's defect pins and so `KNOWN_DEFECT_POLYGONS`' pinned signatures, which the project CLAUDE.md
    states as policy. Whether the remaining pins are converted now, and the CLAUDE.md policy rewritten, is asked of the
    user and not assumed.
  - **Acted on for the five:** once the review of `2977b43..6dab6b0` returns, each is rewritten to assert the correct
    result, so it is green because the code is right.
- **337. The user, 2026-11-15: The project CLAUDE.md's pinned-signature policy is rewritten at once, on the user's
  instruction.** Its test-fixtures section now states BSA.D266 and BSA.D336 as the rule for the whole repo: a defect is
  a red test of the correct result with an issue note, or a guard by name; a pin of a defect's signature is not written.
  The existing pins of `KNOWN_DEFECT_POLYGONS` and core's "still alive" tests are named there as legacy awaiting
  conversion, never added to and never re-pinned. Converting them is not yet ordered.
- **338. The review's stage 1 fixes and the rewrite of the five cured pins are dispatched now; stage 2's fate waits on
  the user.**
  - Stage 1's follow-up, from BSA.F109: along-edge cells in `start-vertex-invariance.test.ts`; the
    `alongedge:plus:k2:s63352` test that convicts the `> perceptualFloor` bar; one cross-kind case, split against pair
    on one ray, if a fixture can be found; `mixed-pitch-island.test.ts` moved onto the shared checker now that it is
    green.
  - The five pins of BSA.D336 are rewritten to assert the correct result, each checked against the reviewer's hand
    derivation where one exists.
  - **Not done until the user rules on stage 2:** re-recording the along-edge sweep records, whose node numbering
    differs between stage 1 alone and stage 2. The lead and the reviewer both recommend reverting `6dab6b0`; the user
    ordered the general case in BSA.D335, so the revert is the user's.
  - None of the dispatched tests may depend on node numbering, so they hold either way.
- **339. The user, 2026-11-15: The three-front meeting refusal is the next high-priority investigation, on the user's
  layout `CourtL-draft` (the "lower-case b").**
  - The layout: five Rings at 30 degrees on every side, one storey. Outline (0,0) (1700,0) (1700,300) (1000,300)
    (1000,1000) (0,1000) with a courtyard (300,300) to (700,700). The file is the user's upload
    `lower_case_b_failure.json`; it is `CourtL` of the eight layouts BSA.D321 refuses.
  - The user's reading: three ridge lines and one valley should meet at (850,150), where the stem of the b meets its
    loop, and the solver refuses. Anything that separates the convergence into separate events, three for instance,
    unblocks it.
  - The error is the refusal by name of BSA.D311 and BSA.D313: in step `[10..19]`, rings `[10..15]` and `[16..19]`, the
    split `[12, 4]` at time 0.0732421875 "meets a third front: its instigator arrives at the vertex event [12, 16]".
  - Dispatched as a read-only investigation that returns a mechanism and a proposed rule; nothing is built from it
    without the user.
- **340. The user, 2026-11-15: The whole-event rule for a merge on a third front (BSA.F111) is to be built, and the
  user's understanding of what the refusal is and why the cure works is the bar for proceeding.**
  - The user's words: "Yes build it, though I'm not fully understanding yet what the false negative is, and why the cure
    works. That understanding is my bar for proceeding, so we need to drill into that."
  - **The lead's reading:** the build is approved in principle and nothing is dispatched, spec included, until the user
    says the explanation has landed, since their understanding may reshape the rule.
  - Scope when it proceeds: multi-ring steps only, as an amendment to node 5's cross-ring rules; a delegate drafts the
    spec, the lead reviews it, one Opus implementer builds, an independent review follows.
- **341. The user, 2026-11-15: The user's alternative to the third-front rule of BSA.F111 is measured before any spec:
  let the corner events resolve first and glue the level ridges they bear onto the node at a temporal offset of zero.**
  - The user's reading: at the five-way meeting the bottom wall has live bisectors at each end, which collide at that
    same instant and have not yet borne the ridge bisectors that also take part. There is a spatial happens-before
    between the primary bisectors colliding and the secondary ridge bisectors reaching the node, and no temporal one,
    because the rectilinear layout closes at one offset. The user's question: why can the solver not tolerate the
    corners collapsing first and the ridges being glued on at offset zero.
  - The layout is a lower-case d, not a b; the name in BSA.D339 was the user's slip.
  - **The lead's reading, flagged as inference:** this is nearly the "merge first" sequence BSA.F111 found refused on a
    ring of area 0, so the question becomes whether a zero-area ring that closes to one point can be accepted as a node;
    if it can, it may also reach the sliver class the rule of BSA.F111 leaves refused. It holds only where the third
    front is itself closing against a parallel front at that instant, which the lead argues is always so for
    axis-aligned walls and is not so for a slanted third front.
  - A read-only delegate checks the inference and measures the alternative against BSA.F111's rule on the same samples.
- **342. The user, 2026-11-15: The user corrects the lead's framing: a zero-area ring is not an anomaly, it is one of
  the commonest termination states of rectilinear geometry.** In the d layout the first layer of events creates nodes
  only on the ridge lines, so what remains is flat by nature.
  - The lead had described a zero-area ring as having "nothing left inside it to sweep" and as "what a defect looks
    like", which treats it as an exception to be gated. The user: "This scenario is rife in rectilinear geometry, so in
    fact zero area rings are one of the most common termination states."
  - **The lead's reading of what follows, not the user's words:** the closure of BSA.F112 should be designed as a
    termination case beside the pair and the triangle, generalising the corridor exemption, and not as a gated
    exception. A flat ring bounds nothing, so the outer-or-hole question that the refusal guards does not arise for it.
    The one-point gate of BSA.F112 is then one sub-case: a flat ring with nodes at several places on its line (the 40
    equal-gap islands, the three-hole case) is equally a finished skeleton, and the ungated closure went wrong there
    because it glued everything to one point, not because the ring was illegitimate.
  - A read-only delegate measures that general flat-ring termination, with a positive test of flatness in place of the
    area sign, against the combination of BSA.F112.
- **343. The user, 2026-11-15: The user did not mean the closure as strictly as the flat rule of BSA.F113: their picture
  is any scenario with a transitive relationship of zero-area rings, meant to cover the V case too, and they ask what
  hole that opens.**
  - **The lead's answer, reasoned and not measured:** the V case leaves no zero-area ring. With the stem top and hole
    bottom in a V over the wall, the merge's newborn vertex stands on the wall's front and the two regions either side
    still have area; the ring is pinched at a point, not flat. What would cover it is the wider principle behind the
    user's picture: a newborn vertex may take part in an event at its birth point, at a time offset of zero, and such
    events may chain. For the V case that is merge, then the newborn vertex splitting the wall at zero distance, which
    gives BSA.F111's result.
  - **The holes the lead named:** a chain at one instant has no time order, so its result must not depend on processing
    order, which is today's lesson of BSA.F107 and is unproved here (merge-first and split-first each left a different
    ring in BSA.F111); a chain needs a progress measure other than time to be sure it ends; and events at zero offset
    bear zero-length or micro edges whose direction cannot be read, so the time-order and direction oracles that catch
    mis-pairings go blind exactly there. BSA.F112's ungated closure coming out silently wrong on the three-hole case is
    the measured instance.
  - Nothing is dispatched: the lead asked the user to confirm this reading of "transitive" before measuring it.
- **344. The user, 2026-11-15: The user worked the V case by hand as an ordinary reflex split followed by ordinary
  closures, and asks what is still not aligned. The difference is that in the measured V case the reflex vertex does not
  exist until the instant it must split.**
  - The user's steps: the reflex vertex at the centre of the V splits the base edge, leaving a ring in each half; four
    simultaneous events, two per arm, leave the ridge-wise bisectors; the remaining rings of two close. "That should be
    a straightforward result from the existing handling of pairs of vertices that point at each other."
  - **The lead's answer:** those steps are right, and production solves them when the V's point exists beforehand. In
    the measured case (BSA.F112, S2 and S3) the two arms belong to different rings, the outline's stem top and the
    courtyard's bottom, and the V's point is born by the merge of two corner vertices at the same point and instant at
    which it must split the base. BSA.F111's rule, which the lead had called the wall-cut rule, is the user's first step
    performed at the merge: the vertex that would have zero lifetime is not born, and the wall is cut there.
  - **Not known, and now measured by a narrow read-only delegate:** why the existing split handling does not fire for
    that newborn vertex at zero distance under merge-first, and whether admitting it, with the flat rule of BSA.F113,
    replaces BSA.F111's rule entirely.
- **345. The user, 2026-11-15: The user accepts the flat-ring termination of BSA.F113 together with the third-front rule
  of BSA.F111 as the solution, and the build proceeds.** The user's words: "I think I will have to admit defeat on this
  one for now. The maths/empirical verification is unambiguous, so I'll accept flat + wall-cut rule as a solution."
  - This lifts the gate of BSA.D340: the user accepts on the measurements, saying the explanation of why the newborn
    vertex cannot simply split has not fully landed. The delegate of BSA.D344 is left running, since its answer is that
    explanation and may simplify the rule; its result is reported and changes the spec only if the user says so.
  - **Scope, by the lead's recommendation as put to the user:** steps of several rings only. Single-loop steps keep
    their present path; applying the flat rule there moves a defect fixture and leans on the 4-floor bar, and is a
    separate unit for the user to rule on (BSA.D301).
  - **Process:** a delegate drafts the decision spec, amending node 5's cross-ring decisions; the lead reviews and
    approves it; one Opus implementer builds; an independent review follows.

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
- **F108. The geometric order in the pairwise fallback is built in two commits, and by every oracle the project has it
  only cures: 136 along-edge sweep cells, the 4 mixed-pitch tests, one straight-bisector test and five pinned defects,
  with no clean answer moved and no golden byte moved.** (the implementing Opus delegate of @D335, 2026-11-15; commits
  ec96bc4 and 6dab6b0; figures measured by the delegate, not re-run by the lead)
  - **Stage 1, `ec96bc4`:** of two events in one moment on the same bisector, more than `context.perceptualFloor` apart
    along its ray, the nearer is resolved first. `inArrivalOrder` takes a `mustPrecede` relation and orders each moment
    topologically; a cycle falls back to the old order. It applies to every event kind ahead of priority, so a split and
    a pair on one ray are ordered by position (33 such layers in the wide fuzz; restricting to equal priority changed no
    skeleton). Not applied to the whole-event path's split order: no layer measured had two splits of one instigator
    more than the floor apart, the sweep harness not counted.
  - **Stage 2, `6dab6b0`:** measured first. Reversing edge-id order inside the fallback changed no skeleton over
    FULL_CORPUS, HOLED and WEIGHTED at sampled starting vertices (809 solve pairs) or the 11,878 fuzz islands; 135
    along-edge digests moved by numbering only. The delegate read "numbering alone moved" as not a changed result and
    built: events left unordered by stage 1 go by priority, then by place (columns on x then cells on y, single linkage
    at the floor), then by edge id within one cell.
  - **The cost of stage 2's place order, argued and not measured:** two events about one floor apart in x or y can
    change cells under an ulp of movement and swap their nodes' ids. Edge-id order had no such sensitivity.
  - **Suites.** Baseline re-measured at `2977b43`: core 6,634 passed, 10 failed, 10 skipped; building-shell 9,710
    passed, 4 failed; dashboard 609. At `6dab6b0`: core 6,655 passed, 14 failed, 10 skipped; building-shell 9,728
    passed, 0 failed; dashboard 609. Typechecks clean; the golden drift test passed.
  - **Turned green:** all 4 of `mixed-pitch-island.test.ts`; K1 in `straight-bisector.test.ts`. The other nine
    red-by-design tests are unchanged.
  - **Turned red, each a pinned defect now cured, left failing for the user:** three in `along-edge-jitter.test.ts`
    ("the recorded defect, still alive", counts now 0); one in `stroke-derived-polygons.test.ts` (the reflex L with
    canonicalisation off, k = 1 to 10 now complete, oracles 0, tiling at most 4.2e-16); one in `holed-guard.test.ts`
    ("K1, overlapping ridge arcs": the guard no longer fires because the solve is right).
  - **Sweep records:** alongedge moved in 136 of 160 cells at stage 1, every one a cure by the delegate's classifier;
    corpus, fine, offedge, ladder, regular, holed and the three region depths byte-identical. Not re-pinned.
  - **Fuzzes match the counterfactual of BSA.F107 exactly.** The user's seven layouts are tests in
    `apps/building-shell/tests/mixed-pitch-layouts.test.ts`.
  - **Gates not convicted:** `start-vertex-invariance.test.ts` passes on the parent too, because the far pairing joins a
    primary bisector whose id is lower at every rotation; and replacing `> perceptualFloor` with `> 0` leaves the core
    suite unchanged. `inPlaceOrder`'s unit tests were not mutated.
  - **Rotating the starting vertex still changes three roster cases, as at `2977b43`:** Off-edge Jitter Reflex L (seed
    55433, k=4) at one rotation, where the fallback does not run, and two weighted refusal messages naming a different
    vertex index.
  - **Not established:** correctness beyond the oracles; the tie at unit weights without straight bisectors; the
    whole-event split path in the sweep harness.
- **F109. The independent review: stage 1 (`ec96bc4`) is sound to keep with two test fixes; stage 2 (`6dab6b0`) should
  be reverted.** (an independent read-only Opus reviewer of 2977b43..6dab6b0, 2026-11-15; scratch work in
  apps/building-shell/experiments/d335-review/, uncommitted)
  - **Stage 1's answers were checked by hand, not only by the oracles.** On all 160 along-edge cells every live arc lies
    on the hand-derived roof and the arcs cover the whole canonical skeleton, where the parent left 54 cells incomplete.
    The holed-guard K1 ridge (1100 to 1250 to 1400 to 1500 at y = 1100) matches a hand derivation exactly. The
    level-ridge tie resolves nearer-first by hand. The wide fuzz re-run: 58 cured, 0 broken.
  - **Stage 1 cannot reverse a true time order (argued):** on a bisector that moves in time, position along it is time;
    the rule speaks only where time is silent. Position uncertainty exceeded the gap being ordered in 0 of 322,788
    ordered pairs.
  - **"No clean answer moved" is vacuous for the rosters:** the pairwise fallback runs on 0 layers of FULL_CORPUS,
    HOLED, WEIGHTED and off-edge at default options. The evidence for the change is the along-edge cells, the fuzzes,
    the tie fixtures and a few K1 tests.
  - **Stage 2 does not deliver its claim.** Matching nodes by position over 160 rotated along-edge solves, 100 still
    renumber under the place order against 113 under edge-id order, geometry identical in all. Mirroring x-then-y gives
    the same 100, so the choice is arbitrary. One ulp flips `inPlaceOrder` on a synthetic pair at the floor; no effect
    was seen on real inputs. Its only test pins left-before-right, not an invariance. The reviewer reads the 135 moved
    sweep digests as a changed result under BSA.D335's stop condition, so the delegate should have reported before
    building.
  - **Test gaps, each with a measured way to bite.** `start-vertex-invariance.test.ts`: add along-edge cells at
    `{noiseFloor: 0}` (L k2 s15838 differs at 8 of 11 rotations on the parent, plus k5 s23757 at 49 of 59; none at
    HEAD). The `> perceptualFloor` bar: at `> 0`, 19 along-edge cells get worse and 1,030 cycle fallbacks fire against
    0; `alongedge:plus:k2:s63352` at `{noiseFloor: 0}`, asserting a tree and no causality violation, convicts it. The
    rule's reach across event kinds is unconvicted: restricting it to one kind passes every test, though half the
    ordered pairs in the along-edge sweep are cross-kind.
  - **Low:** the cycle fallback in `inPrecedenceOrder` may place an event downstream of the cycle (0 cycles measured at
    any nonzero bar); the precedence rule treats a gap of exactly the floor as one point where `isOneEvent` does not;
    `roof-coverage.ts` claims to be shared with `mixed-pitch-island.test.ts`, which still has its own copy.
- **F110. Stage 1's gates now bite and the five pins assert correct results; and two claims the lead relayed were too
  strong: the along-edge class is cured only at magnitudes 0.1 and 1.0, and the order of events that share no bisector
  does change a skeleton.** (the implementing Opus delegate of @D338, 2026-11-15; commits 0fe9001 and 9307395; figures
  measured by the delegate)
  - **Commits:** `0fe9001` (start-vertex cells, `near-first-rule.test.ts`, a hand-derived roof oracle in
    `jitter-helpers.ts`, `mixed-pitch-island.test.ts` on the shared checker) and `9307395` (the five pins of BSA.D336
    rewritten).
  - **Suites at `9307395`:** core 6,668 passed, 9 failed, 10 skipped; building-shell 9,728 passed, 0 failed, typecheck
    clean. The nine red, all by design: weighted time-order 1, 2a, 2b, 3a, 3b; straight-bisector K3 "three holes in a
    row" and "two holes in an outline with two wings"; straight-bisector "no interior edge that is not culled ends at
    its own source"; "two holes with collinear walls (2h-int-1)". No sweep record or golden re-recorded.
  - **Mutations:** the parent's fallback turns every new and rewritten test red except as noted. The zero bar turns
    `plus:k2:s63352` red (not a tree, tiling off 2 to 10 percent). Restricting the rule to one event kind turns two
    found cases red, `alongedge:plus:k8:s47514` and `plus:k10:s63352` at 1e-3, found in a search of 1,763 inputs; the
    reordered pair is a non-adjacent collision against an adjacent pair, not literally a split. The start-vertex gate
    convicts the parent only.
  - **CORRECTS BSA.F108's "every one a cure" and BSA.F109's "geometry identical".** Wrong along-edge cells of 160,
    canonicalisation off, by the full checks, parent then now: 59 and 57 at 1e-9; 144 and 144 at 1e-6; 133 and 44 at
    1e-3; 136 and 0 at 0.1; 136 and 0 at 1.0. Every wrong cell now completes; at 1e-3, 40 carry direction violations; at
    1e-6, 36 are not trees. The old tables counted incomplete cells only. Whether the small-magnitude tiling misses are
    skeleton defects or the instruments at near-event depth is not established.
  - **CORRECTS BSA.D338's premise and the lead's advice to revert stage 2.** `plus k4 s47514` at 1e-3 is a tree under
    stage 2's place order and not a tree under edge-id order, so the rewritten test "both shapes correctly at 1e-3" goes
    red if `6dab6b0` is reverted. BSA.F109 measured order-independence at magnitude 1.0 only. So some simultaneous
    events that share no bisector are not independent, and what relates them is not known; whether left-first is right
    there by rule or by luck is not known either.
  - **The holed guard's K1 branch is still covered** by two courtyard specimens and a constructed graph; their regex is
    `/./`, not tightened.
  - "Goes quiet at 1e-9" asserts completeness only, and 5 of its 12 cells fail the full checks; left alone as outside
    the five.
- **F111. The three-front meeting on `CourtL` can be resolved as one whole event: the one gap of the merge that moves
  into the struck wall is not born, the wall is cut at the node, and two bisectors are born in its place.** (a read-only
  Opus investigation delegate under @D339, 2026-11-15, measured on 27d9cc1; scratch in
  apps/building-shell/experiments/three-front-meeting/, uncommitted) A counterfactual of that rule cures every
  third-front refusal sampled and changes nothing else.
  - **The correct answer at (850,150), by hand and matched by the counterfactual:** five wall fronts meet there at t =
    150 cm (outline bottom, loop right, stem top; hole bottom, hole right). Two valleys arrive, from the outline's
    reflex corner (1000,300) and the courtyard corner (700,300), and three level ridges leave, west and east along y =
    150 and north along x = 850. One node of degree 5. The user's count of one valley misses the courtyard corner's.
    Every gap in this layout is 300, so the whole roof closes at that instant.
  - **Why the solver refuses:** the layer holds four cross-ring head-ons, the stem-end collapse and two splits of the
    bottom wall at the node. `multiRingRefusal` (`algorithm-complex-cases.ts` about 520 to 530, called about 780 to 787)
    fires because `e12` is an arrival of merge `[12,16]` and neither end of the struck segment is. The cross-ring
    rewrite would bear a bisector between the stem top and the hole bottom, two collinear walls facing the same way: a
    straight vertex moving into the bottom front.
  - **The user's claim holds:** six one-step lattice moves and four one-pitch changes each separate the convergence, and
    each solves sound on production code.
  - **Sequencing the coincident events fails in both orders,** each leaving a ring of area 0. The whole event works.
  - **The rule, as measured:** in a step of several rings, a merge whose node lies on a third front is resolved whole.
    Each gap is priced by its vertex velocity from v.n = w; the single gap with v.n_wall < 0 is not born, the struck
    segment is cut there by a new link write recording both successors, and bisectors {gap's cw parent, wall} and {wall,
    gap's ws parent} are born. Zero or two such gaps, or splits on more than one wall, stay refused by name. A first
    version that re-pointed a link failed 22 of 51 grid layouts; recording both successors fixed all.
  - **Reach.** Of the eight layouts of BSA.D321: `CourtL`, `JutMidWall`, `BandRunsOnPastWing` and its mirror are cured;
    the four sliver layouts, `JutAlignedS` among them, are not reached. `JutMidWall` needs the rule on a one-ring merge
    inside a multi-ring step. Of 2,000 two-courtyard grid islands at 30 degrees: production refuses 51 as third front,
    28 as sliver, 2 under decision 21 and 1 other; the rule cures all 51, sound by checker, height oracle and
    invariants, and changes no digest where it did not fire. Of 1,000 equal-gap islands, all third-front today, 945
    become sound and 55 go on to the sliver defect.
  - `FULL_CORPUS` and `HOLED_TEST_POLYGONS` are byte-identical apart from the issue note's specimen, which completes in
    the note's closed form. Single-loop solves are untouched by construction and by 60 identical digests. Reverting
    `6dab6b0` changes no verdict.
  - **Not established:** core's and building-shell's suites were not run under the counterfactual; weighted cases only
    at skeleton level; that at most one gap can face the wall is measured (0 ambiguities), not proved; the grid samples
    are the delegate's own generator, not the issue note's.
  - **Still refused after the rule:** the sliver class, a straight vertex born between collinear walls
    ([ISSUE-skeleton-straight-vertex-in-zero-area-ring](./ISSUE-skeleton-straight-vertex-in-zero-area-ring.md)), which
    this rule exposes more often; decision 21's three-run meetings; ambiguous or multi-wall third fronts.
- **F112. The user's zero-offset gluing works on their layout and gives the same roof as BSA.F111's rule; it is two
  changes, and its zero-area closure is the only thing sampled that reaches the sliver class. The combination of that
  closure with BSA.F111's rule cured everything sampled and changed nothing where it did not fire.** (a read-only Opus
  investigation delegate under @D341, 2026-11-15, measured on 88a3fe8 (core source unchanged since 27d9cc1); scratch in
  apps/building-shell/experiments/zero-offset-glue/, uncommitted)
  - **CORRECTS the lead's account to the user: the area-0 ring is not three vertices at one point.** Under merge-first
    the ring `[26,28,27]` is the straight vertex `e26` {stem top | hole bottom} at (850,150) heading down, the level
    ridge `e28` {outline bottom | stem top} sourced at (1550,150) heading west, and the level ridge `e27` {hole bottom |
    outline bottom} sourced at (150,150) heading east. Its members stand at three places on y = 150: it is the bottom
    strip collapsed flat, a segment 1400 cm long. It can be closed at one point because the two ridges are level, so
    their whole length is skeleton at that instant and they reach (850,150) at a time offset of zero. The edges'
    identity was as the lead inferred.
  - **What the refusal is for:** `wavefront.ts` about 815 to 820, in `componentsOfRings`. The sign of a ring's area
    decides whether it starts a component or is assigned as a hole; at area 0 the sign is noise, so the ring is refused
    and not guessed. It guards classification and is not a detector of bad geometry. A ring of two is already exempt as
    a corridor.
  - **The closure that works (gated):** a ring of three or more members and area 0 is closed at C exactly when every
    non-level member stands at one point C and every level member's ray reaches C going forward; a level member is one
    whose parents are antiparallel. All members end at C and a newborn straight vertex becomes a culled zero-length
    edge. Any other zero-area ring stays refused.
  - **On the user's layout,** merge-first plus the closure: complete, the node at (850,150) of degree 5, roof checker
    clean, built, height oracle worst error 2.27e-13 cm. Deferring the merge to the child step also works there and
    fails `TwoHolesProbe`.
  - **Compared on the same samples** (BSA.F111's rule; the user's rule, merge-first plus closure; the closure alone; the
    combination of BSA.F111's rule and the closure). The four third-front layouts of BSA.D321: sound under all but the
    closure alone. The four sliver layouts, `JutAlignedS` among them, and `TwoCourtyardsDraft`: refused under BSA.F111's
    rule, sound under the other three. Grid sample 1, 2,000 islands: 51, 79, 28 and 79 cured of 82 refusals. Grid sample
    2, 1,000 equal-gap islands: 945, 960, 0 and 1,000 cured. `FULL_CORPUS` and `HOLED_TEST_POLYGONS`: 81 digests
    identical under every rule. Every cure sound by checker, height oracle and genus invariants; no digest changed where
    a rule did not fire.
  - **The 40 the user's rule leaves refused** hold two straight vertices at different places on one collapsed strip; the
    gate rightly declines them and BSA.F111's rule cures them by never bearing those vertices.
  - **Where merge-first is wrong:** when the gap facing the wall is not a straight vertex (a V of stem top and hole
    bottom over a level or slanted wall), it leaves the solve incomplete with causality violations; BSA.F111's rule
    solves both. What decides it is whether the walls either side of the wall-facing gap are collinear and face the same
    way, not the slope of the third front, which corrects the lead's condition in BSA.D341. With collinear walls either
    side and a slanted wall, no three-front meeting exists at all.
  - **The gate is load-bearing:** without it, a three-hole case with two straight vertices comes out complete, with no
    diagnostic, and wrong.
  - **On level cases the two rules give the same nodes and byte-identical built faces;** they differ in edge
    multiplicity only.
  - **Not established:** no suite was run under any counterfactual; the slanted and three-hole probes were checked at
    skeleton level by the delegate's own equidistance and direction check; weights only on the issue specimen's
    variants; that a ring passing the gate cannot hide an untraced level piece is measured, not proved; the closure was
    applied within the step and the triangle handler path was not tested.
- **F113. The user is right by census: flat termination is the common state, and a general flat-ring termination case,
  with a positive test of flatness and no single point required, cures everything the one-point closure cured plus the
  40 equal-gap islands and the three-hole case it declined.** (a read-only Opus investigation delegate under @D342,
  2026-11-15, measured on 3451055 (core source unchanged since 27d9cc1); scratch in
  apps/building-shell/experiments/flat-ring-termination/, uncommitted)
  - **Census on production, rings left by a layer.** Grid sample 1 (2,000 two-courtyard islands): on one-ring steps
    8,525 corridors of two, and every one of the 291 rings of three is flat; on steps of several rings 5,357 corridors
    and 28 flat rings of three, every one refused (the sliver class). The ten courtyard layouts: 6 flat rings of three
    on multi-ring steps, all refused. `FULL_CORPUS`: 21 corridors, 6 flat rings of three, 3 flat of four or more.
  - **One-ring steps survive flat rings by accident of the dispatch:** corridors through the pair handler; flat rings of
    three through the triangle handler (261 of grid 1's by its best collision, ending all three members at one point, 29
    by its ladder closure); flat rings of four or more through the n-gon as head-on pairs at dt = 0. Only steps of
    several rings refuse them, at `componentsOfRings`.
  - **The test of flatness, positive and never reading the area's sign:** cluster the members' positions into nodes at
    the perceptual floor; every segment between neighbours lies along its own wall's front at the layer's time; every
    stretch between two nodes is covered exactly once each way, on antiparallel walls, with no overlap or crossing; the
    stretches form one line; every level member is newborn and runs along a stretch whose walls are its parents; every
    stretch is longer than 4 floors.
  - **The wiring:** one node per cluster; a point member ends at its node, a newborn one as a culled zero-length edge; a
    level member ends at the far node of its stretch; a stretch no level member runs along is born as a terminal ridge
    between its two walls; the ring is accepted and not passed to classification. A flat-by-area ring that fails the
    test stays refused, naming the clause.
  - **Measured against BSA.F112's combination** (one-point closure plus BSA.F111's rule). Flat alone: cures the sliver
    four, `TwoCourtyardsDraft`, the 28 and the three-hole case; third fronts stay refused. Flat plus merge-first: the
    user's layout, all ten courtyard layouts, 79 of 82 in grid 1, 1,000 of 1,000 in grid 2, the three-hole case; the V
    cases incomplete and signalled, or refused by name with the straight-vertex gate. Flat plus BSA.F111's rule: all of
    those and the V cases sound, byte-identical to BSA.F112's combination on both grids and the 81 digests. Every cure
    built and checked by roof checker, height oracle at 1e-13 cm and genus invariants. Nothing silently wrong on steps
    of several rings.
  - **On rectilinear input, merge-first plus the flat rule makes BSA.F111's rule unnecessary** on every sample, with the
    same nodes and one to three fewer edges. BSA.F111's rule is still the only measured cure for a wall-facing gap that
    is not a straight vertex.
  - **No tree-shaped flat ring arose** in any sample or in constructed T, L and plus junctions; the delegate infers a
    junction's arrivals are priced as one vertex event that splits the tour into line rings first. A non-collinear flat
    ring stays refused until one is measured.
  - **Single loops, measured only (BSA.D301):** applying the rule to one-ring steps with the 4-floor bar changes 1 of 60
    `FULL_CORPUS` digests, Offset Cross Junction, a defect fixture that becomes complete and passes equidistance,
    direction and height. Without the bar, two jittered defect fixtures gain a silent direction violation: stretches of
    1.6 and 1.95 floors have no readable direction. On grid 1 all 363 layouts where it fired are sound, 1 of them newly
    cured.
  - **The hardest case found** is that near-flat jittered ring; the 4-floor bar rests on two fixtures and reading the
    nodes' position budgets would be the principled form. The test trusts the links for each front's extent, so a ring
    mis-paired upstream whose ends lie on the right lines would pass; none was constructed.
  - **Not established:** no suite run under any switch; no weighted case; no tree-shaped ring exercised; that the test
    cannot pass a mis-paired ring is not proved.
