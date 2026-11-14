---
title: "Building Shell Arc: Session 3 Journal"
type: workflow
area: building-shell
status: active
date: 2026-11-14
record_of: ["./building-shell-gable-rise-proposal.md", "./building-shell-viewer-editing-proposal.md", "./building-shell-gable-stretch-settings-decisions.md", "./building-shell-prototype-decisions.md"]
---

# Building shell arc: session 3 journal

**This is the head of the thread**, continuing [session 2](./building-shell-arc-journal-02.md). Decisions continue at
260 and findings at F84, cited project-wide as BSA.D260 and BSA.F84.

## Reading order for a fresh context

**Read §4 in full**: it is the state, how the user is steering, and the next work, and is the whole of what a new
session needs to start. Then §5, the open items, and §3, the operational manual.

**Do not read this journal's Decisions and Findings end to end.** Fetch one by its id when §4 or §5 cites it, with
`journal.py show <id>`. Do not read the session 1 or session 2 journals except by id.

For the next work, the skeleton with a hole, these are enough to start:

- BSA.F89 and BSA.F90: the two courtyards that show the cut to be a workaround, with their exact inputs.
- BSA.D278 and BSA.D279: the cut rule that stands in the meantime, and what it does not cure.
- BSA.D280: the user's direction and the lead's unmeasured account of the work.
- Session 1's decision 132, for why a cut is a segment of a raw Ring wall and where the roof solver's fault was first
  named.

For the tuck, if it comes up again: BSA.F87 for the cause, BSA.D272 for the ruling, BSA.D277 for what was built, and
[the union tuck note](./ISSUE-building-shell-union-tuck.md).

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

- Branch `feature/building-shell-covered-storeys-and-sections` at `f388632`, clean apart from this journal and the
  closing mark on session 2's.
- **The suite's figure is inherited, not re-run this session**: 9,805 passed in 44 files, none failed, typecheck clean,
  measured by the session 2 lead at `e2052d9`. The lead checked that `git diff --stat e2052d9 HEAD -- apps packages` is
  empty, so the code that figure vouches for is the code on this tree.
- Session 3 opened with the user's reading of the Cheek fixtures (BSA.D260) and the rulings that followed (BSA.D261 to
  BSA.D264).

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

## 4. Next work

**Session 3 closed on 2026-11-14 (BSA.D280).** The arc branch `feature/building-shell-covered-storeys-and-sections` is
at `011455d`, four local commits ahead of `f388632`, nothing pushed, and this journal uncommitted. The suite is 9,992
passed and none failed in 46 files, typecheck clean, measured by the WP-C4 delegate at `011455d` (BSA.D279); the lead
never re-ran it this session.

**What the session did**, each in its accepting decision: the Cheek fixtures ruled (BSA.D260); the two-pitch sub-rule
removed, `51a233e` (BSA.D268); fully internal Rings dropped and reported, `8025ead` (BSA.D271); the union's tucks
labelled, which cured both Cell-laying throws, `150e45c` (BSA.D277); a courtyard cut refused where its outer end is a
corner, `011455d` (BSA.D279).

**How the user is steering.** Session 2's list in its §4 still holds. Added this session:

- **A test must not be green because it asserts a defect** (BSA.D266). A defect is a red test with an issue note, or is
  guarded in production code. Never propose a pin for a throw.
- **A Cheek is a legitimate section of wall, and a Cheek count is evidence of nothing** (BSA.D260, BSA.D263).
- **A fully internal Ring is an input defect**, dropped from the solve and reported (BSA.D261, BSA.D262).
- **A tuck left by the union is labelled, not removed** (BSA.D272).
- **Emptying a defect's class is not curing the defect; say which happened** (BSA.F88). And "none in the corpus" is no
  evidence where the generators cannot draw the case (BSA.F90).
- **The user asks whether the work is harder than it need be**, and prefers the fix that removes a workaround to one
  that manages it (BSA.D280). Offer the root cause with its cost before the patch.
- **Do not dispatch a fix the user has not asked for** once they are weighing directions (BSA.F90).

**Next, in order:**

1. **The straight skeleton for a footprint with a hole** (BSA.D280), in a fresh session. Before any design, a read-only
   assessment of three things the lead could not answer: how V5 in `packages/core/src/straight-skeleton/` represents a
   loop and what an event joining two loops would cost; what the roof solver needs from a holed skeleton, given that its
   cut branch would be deleted and its copy here is frozen; and whether the C++ skeleton supports holes. Read BSA.F89
   and BSA.F90 for the two inputs that motivate it, and decide which arc owns the work.
2. **A red test and an issue note for BSA.F90's courtyard**, which BSA.D266 calls for and which were held back with the
   fix. Ask the user first.
3. **An independent review of `f388632..011455d`** before any push. The lead recommends it; the user has not answered.
4. **The scope of BSA.D266** (§5), waiting on the user.
5. **The corner sliver in `cleanMesh`** (F83, session 2's decision 257).
6. **One path for all gables**: re-measure with Cheeks neutral (BSA.D263) and the sub-rule gone (BSA.D264).
7. **Fold the amendments into the spec**, session 2's item 7, now with this session's: the `Tuck` kind is in, by the
   WP-C3 delegate; `droppedRings` and the report's `tucks` are not checked.
8. **Push and merge to `main` when the user agrees.** The branch name no longer describes its contents.

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

## Decisions

- **260. The user, 2026-11-14: The user has looked at every fixture the selector lists under "cheek", and none of their
  Cheeks convicts the solver.** This is item 3 of session 2's next work, done.
  - **All but one are legitimate sections of wall**, which the user "would expect to see on a real building, if such a
    building were built with the layout in the fixture". Many of the layouts are themselves highly unorthodox, and that
    does not count against the output.
  - **`CourtyardJutCutSwapped` is the only one whose Cheek is unambiguously an anomaly**, and the only one that fits the
    lead's earlier description of a Cheek as "a step introduced into a roof slope". The user reads its Cheek as a
    superficial symptom of the layout having one Ring fully overlapping another, which is "a defect in user input of
    itself", so the solver's output is not convicted.
  - **Checked by the lead in `tests/robustness-fixtures.ts`:** the fixture's Ring `[-200,300,0,700]` lies wholly inside
    its Ring `[-200,300,300,700]` on the same storey. Its sibling `CourtyardJutCut` has the same two Rings in the other
    order and builds clean.
  - **The lead's description of a Cheek was wrong.** The spec's decision 8 defines it as a residual tag: any face of a
    gable piece that is neither Roof nor a Gable on a wall's own span. The user's reading agrees with session 1's
    decision 77, which the spec already carries: a surviving Cheek is a legitimate face of its own.
  - **The lead's interpretation, not yet the user's word:** a Cheek count is no evidence of a defect anywhere in this
    arc; a Ring wholly inside another on one storey is a candidate input error; and the two-pitch sub-rule of BSA.D220
    and BSA.D222 has lost its only stated reason.
- **261. The user, 2026-11-14: A Ring fully inside another is dropped from the solve, and the output warns that it
  was.** The user's words: the editor "drops the ring, and warns the user in the output that one or more fully internal
  rings were dropped from the solve". This answers the question BSA.D260 left open.
  - **The lead's reading, to be confirmed in the work package's brief:** the drop happens in the pipeline, not only in
    the editor, so every caller gets the same building and the warning travels in the shell's report.
  - **The lead's reading of "fully internal":** the Ring's footprint and its storey extent both lie within one other
    Ring's. A Ring that is inside another in plan but stands taller is not dropped. Of two identical Rings the later is
    dropped.
  - **Not ruled:** a Ring covered only by the union of several Rings, and whether a dropped Ring's gable requests are
    reported with it.
  - **Expected effect, not measured:** `CourtyardJutCut` and `CourtyardJutCutSwapped` become the same building, and the
    residue class "courtyard cut collinear with a jutting wall" loses its only member.
- **262. The user, 2026-11-14: A Ring covered only by several Rings together is dropped too, and a dropped Ring's side
  settings go with it.** Both settle what BSA.D261 left unruled.
  - **The lead's reading:** a Ring is dropped when, on every storey of its extent, its footprint lies within the union
    of the other Rings kept on that storey.
  - **The lead's note on order:** two Rings can each be covered with the other's help, so the test runs over the Rings
    one at a time in a fixed order, each against the Rings still kept. Later Rings are tested first, which keeps
    BSA.D261's rule that of two identical Rings the later is dropped.
- **263. The user, 2026-11-14: The one-path re-measure counts Cheeks as neutral.** The user agreed with the lead's
  reading in BSA.D260: a fixture that gains a Cheek under one path for all gables is not thereby made unclean.
  - It bears on BSA.D227, where most of the "10 clean fixtures become unclean" were Cheeks, and on F77's figures, which
    are re-measured before one path is built.
  - **Not yet ruled:** removing the two-pitch sub-rule of BSA.D220 and BSA.D222.
- **264. The user, 2026-11-14: The two-pitch sub-rule is removed.** The user said yes to the lead's recommendation in
  BSA.D260: the rule of BSA.D220 and BSA.D222 suppressed one Ring's gable pitch only to avoid Cheeks, and by BSA.D260 a
  Cheek is no reason to withhold what the author asked for.
  - **Expected effect, not measured:** the 6 Cheeks that BSA.D222 counted return, and the fixtures concerned build the
    pitch that was suppressed. Their pins change to the new facts.
- **265. Two work packages are opened and run one after the other, because both rewrite pins and goldens.** WP-C1
  removes the two-pitch sub-rule (BSA.D264) and is dispatched now to a fresh Opus delegate. WP-C2 drops fully internal
  Rings and reports them (BSA.D261, BSA.D262) and is dispatched when WP-C1 is accepted.
  - **WP-C1's site, opened by the lead:** `apps/building-shell/src/rise.ts`, the doc comment and test at lines 133 to
    150, whose own comment says that without the sub-rule a two-pitch extent becomes two rises.
  - **WP-C1's baseline:** 9,805 passed in 44 files at `e2052d9`, the code on this tree.
  - **Stops for a ruling:** a fixture that builds today and throws after the change, or a shell that is not closed. A
    new Cheek, conflict or Unclassified Edge is a fact to pin and report, by BSA.D260 and BSA.D263.
  - Each package commits locally on the arc branch and pushes nothing.
- **266. The user, 2026-11-14: A test must not be green because it asserts a defect.** The user rejected the lead's
  proposal to pin WP-C1's 7 throws as expected outcomes: "A test that is green because we have a defect we're enshrining
  is awful engineering." The user had stated this before, and the lead proposed it regardless.
  - **The two acceptable forms, in the user's words:** "The test must be red, and there be a document stating why, or
    the cause of the failure should be guarded in production code, so the test can be green."
  - **The reason:** a pinned defect ships "something which is neither complete nor safe, under the justification that
    the test suite shows when it isn't safe even though we've done nothing about it. Green-washing a failure is not the
    same as tolerating a red that has a planned remedy in the queue."
  - **The lead's reading:** this bears on every pin in the app that asserts a throw, of which the catalogue had 33 at
    F79, and on the suite's figure, which from here is stated as a count passed plus a named list of red tests, each
    with its document. A Cheek pin is not touched by it: by BSA.D260 it records a fact, not a defect.
  - **Not ruled:** whether the existing throw pins are converted now, whether pins of surviving Internal faces,
    Unclassified Edges and conflicts are defect pins in this sense, and whether the ruling reaches
    `KNOWN_DEFECT_POLYGONS` in `@proc-geo/test-fixtures`, whose pinned signatures the project's CLAUDE.md describes as
    policy.
- **267. WP-C1 is finished with its throws red, each class with an issue note, and no pin.** The lead takes the first of
  BSA.D266's two forms, because the remedy is already queued: Cell laying is the next fix (session 2, next work item 1).
  A guard in production code would need a design of its own and is not attempted here.
  - The removal of the two-pitch sub-rule stands (BSA.D264). The 7 fixtures of BSA.F84 that now throw, and the 2 that
    already threw unrecorded, each get a test in the default run that asserts the fixture builds. Those tests fail until
    the cause is fixed.
  - One issue note per class of throw states the cause as far as it is known, lists its red tests by name, and names the
    queued remedy.
  - **The accepted figure for the commit** is every other test passing, the typecheck clean, and the red tests being
    exactly those the issue notes list.
  - WP-C1b, a fresh Opus delegate, finishes it on the tree the first delegate left.
  - **AMENDED by decision BSA.D268:** the remedy is queued for one class only. Cell laying as queued names the two-Cells
    error of s13/Court21; nothing shows it reaches the Cell side and ShellEdge mismatch, which has 7 of the 9 red tests
    and no fix queued by name.
- **268. WP-C1 is accepted at `51a233e`: the two-pitch sub-rule is removed, and the suite is red on 9 named tests by
  BSA.D266.** One local commit of 9 files, not pushed; the lead read `git show --stat` and the tree is clean apart from
  the journals.
  - **The figure, measured by the WP-C1b delegate on that tree and not re-run by the lead:** 9,830 passed and 9 failed
    of 9,839 in 44 files; typecheck clean; no change under `golden/`. The 9 are in `tests/robustness.test.ts`, each
    named `split-band courtyard <key> builds`, under two describes named for their issue notes.
  - **The issue notes, both new:** [the Cell side and ShellEdge
    mismatch](./ISSUE-building-shell-cell-side-shell-edge-mismatch.md), 7 red tests, and [two Cells the same way along
    one NetEdge](./ISSUE-building-shell-two-cells-same-way-along-net-edge.md), 2 red tests. They are the corpus's first
    issue notes.
  - **Not independently reviewed.** The first delegate's mutation run covers the two new tests only; the mutation
    comments in three rewritten tests are reasoned, not run.
  - **Left for the conversion of older pins, which waits on the user:** the 9 red fixtures are not in the viewer's
    selector, because its catalogue is built from the pin tables.
- **269. WP-C2 is dispatched on `51a233e`: fully internal Rings are dropped from the solve and reported** (BSA.D261,
  BSA.D262), to a fresh Opus delegate.
  - **Its first step is a count, before any edit:** which catalogue and opt-in entries hold a Ring that would be
    dropped, by one Ring and by a union, and whether a dropped Ring's side settings were visible in the building. The
    delegate stops and reports if more than a handful of buildings change, so the user sees the list.
  - **The property the lead fixes beyond the user's words:** a dropped Ring keeps its place in the author's numbering.
    The warning, provenance and the editor's list name Rings by the index the author gave them, and the editor still
    shows a dropped Ring so the author can move or delete it.
  - **Under BSA.D266** a fixture that stops building is a red test with an issue note, never a pin.
  - **Baseline:** 9,830 passed and the 9 red tests of BSA.D268.
- **270. The user, 2026-11-14: Cell laying is looked at as soon as WP-C2 lands.** The user confirmed the order: "we will
  look at this as soon as your in-flight lands." It covers the two-Cells clash, whose reproducers are
  `COVERED_RISE_CELL_CLASH` and the 2 red tests of BSA.D268, with BSA.F85's caution that `s13/SplitCourt38` reaches it
  without a covered rise.
- **271. WP-C2 is accepted at `8025ead`: fully internal Rings are dropped from the solve and named in the report.** One
  local commit of 108 files, not pushed; the lead confirmed the commit and a clean tree, and did not re-run the suite.
  - **The delegate went past the stop of BSA.D269 on its own reading, and the lead upholds it.** More than 10 fixtures
    differ by bytes, but only one building changes (BSA.F86). The stop was written to show the user a wide change of
    buildings, and there is none.
  - **The figure, measured by the delegate on that tree:** 9,846 passed and 9 failed of 9,855 in 45 files; typecheck
    clean. The 9 are exactly those of BSA.D268, and none is cured.
  - **The rule** is `internalRings` in `src/fixture.ts`; `storeyRings` and `storeysOf` return the kept Rings under the
    author's indices, which is how every entry point drops them.
  - **The wire changes in one place:** `ShellReport.droppedRings: number[]`, always present, in every golden shell file
    and manifest report. 86 golden shells gain only the empty field.
  - **`CourtyardJutCutSwapped` is now a clean golden**, its residue pin is removed, and its class "courtyard cut
    collinear with a jutting wall" is empty.
  - **The editor**, checked by the delegate in a browser through DOM queries: a dropped Ring stays in the list with a
    "dropped" tag and a note, moving it out brings it back, and undo restores the mark.
  - **Ten mutations each turned new tests red.** Not independently reviewed.
  - **For the user:** a Ring of zero area or zero storeys is dropped as vacuously covered; the `input@1` report says
    nothing of dropped Rings; and the random generator spends about 9 percent of its draws on a Ring that is now
    dropped.
  - **Owed to the C++ port** when a session has it: the rule and the `droppedRings` field.
- **272. The user, 2026-11-14: The tuck is labelled, not removed.** The user's ruling on BSA.F87: "we don't remove it
  then? We just label it. The downstream Grammar doesn't need to care that the label is a special one that all Grammars
  ignore. We just need a distinct label and teach it to the Grammar (or Cell layer, whoever best should own it)."
  - **The user's picture of the defect, which the lead confirmed:** an origami fold. The surface is one closed sheet
    that turns back on itself and tucks part of its area away in zero volume. The lead's word for the tucked region from
    here is a tuck, and for the edge where it turns, the fold.
  - **The lead's rulings under it, to be corrected by the user if wrong:**
    - **The label is a new face kind, `Tuck`,** distinct from `Internal`, which means a courtyard cut face that should
      not have survived.
    - **The shell owns it.** The pass that tags faces after clean-up finds each tuck and labels both of its layers; Cell
      laying lays nothing on a `Tuck` face, as it lays nothing on `Internal`. No Grammar sees a Cell from it.
    - **An Edge on a tuck's rim is classified by looking through the tuck** to the exposed faces that meet there in the
      true building, so the junction of gable and tower wall keeps a real Edge kind and the fold itself is no Edge.
    - **A fold between two faces neither of which is a `Tuck` is an error after this pass**, so no tuck ships
      unlabelled.
  - **What labelling does not save:** the tuck's outline does not follow triangle edges on both layers, so faces are
    still cut along it. Only the deletion and the weld are avoided.
  - **When it lands**, the 9 red tests of BSA.D268 are expected to pass because the buildings build, and the two issue
    notes become one and close. Measured, not assumed.
- **273. WP-C3 is dispatched on `8025ead` to build BSA.D272: find each tuck, label both layers `Tuck`, lay no Cells on
  it, and classify its rim by looking through it.** A fresh Opus delegate. It stops for a ruling if the rim rule cannot
  give every rim Edge a kind from the existing table, if cutting along a tuck's outline opens the mesh or changes a
  building that has no tuck, or if any of the 9 red tests stays red for another reason. Baseline: 9,846 passed and the 9
  red tests of BSA.D268.
- **274. The user, 2026-11-14: The main complication of labelling a tuck is that one true edge becomes two coincident
  mesh edges with the tuck between them, and the Cell net must treat them as one set of locations.** The user stated it
  from their own picture of the defect; the lead agrees and adds that it is the rule on every rim line, not an
  occasional case.
  - **The user's picture:** within the tuck the two layers have nothing to distinguish them; where they separate, one or
    both has created an edge; and where both reach the same line, those edges are far apart along the surface, because
    the tuck lies between them.
  - **The lead's working-through on the two-Ring case of BSA.F87, by reasoning and not measured:** on each rim line
    other than the fold, one layer ends against a face X and the other continues into its exposed remainder W, so the
    mesh has X against Tuck and Tuck against W where the true building has X against W. Along the rake that is Roof
    against Wall; along the tower's vertical end it is Wall against Gable.
  - **Fixed for WP-C3 and sent to its delegate:** each such pair is one ShellEdge with X and W as its faces, and the
    Cells of X and W along it attach to the same NetEdge. If that needs a change to how NetEdges are keyed that reaches
    buildings with no tuck, the delegate stops.
- **275. WP-C3 must prove it leaves no false seam, by comparing each tucked build with its clean mirror image.** The
  user named the hazard: a roof slope with a false seam that breaks the tile courses. No predicate in the app guards
  against one; `cutsRoofCell` in `src/shell.ts` only describes roof lines cut off the lattice.
  - **The oracle:** by BSA.F87 the reduced inputs build clean when mirrored in x. The labelled build with its `Tuck`
    faces set aside must equal the mirror image of the clean build in faces, Edges, Cells and NetEdges, compared
    order-free. Sent to the delegate as a required test.
  - **The lead's reasoning, not measured:** the measured tucks lie on vertical planes and the Roof meets them only along
    its own boundary, so a seam across a slope needs either a wrong rim rule or a tuck on a roof plane, which no sweep
    has found.
  - The delegate also reports whether Cells are laid per face or per triangle.
- **276. A surviving Internal cut face back to back with a Wall is the same tuck, and is labelled like any other.**
  WP-C3's delegate stopped because the unlabelled-fold error of BSA.D272 made six pinned fixtures of the cut-overshoot
  class throw: `s1/Court29` at 250 and 300 cm, `s10/Court35` at 250, 263 and 300 cm, and `CoveredRiseOnCutLine`. It
  offered to exempt folds beside an Internal face or to let the pins go red. The lead ruled neither.
  - **Why:** it is BSA.F87's configuration with a cut face in place of the gable, and BSA.F87 had already recorded tucks
    on Internal faces. BSA.D272 does not depend on the layers' kinds. The old pin of 1 surviving Internal face and 3
    Unclassified Edges described the tuck's symptoms.
  - **The rule:** only the doubled region becomes `Tuck`. An Internal face surviving outside a tuck stays `Internal` and
    counted. A cut piece that stands proud of the wall with real volume is not a tuck, and the delegate stops if it
    finds one.
  - **Each of the six** asserts clean if it builds clean, or has its pin updated to exactly what remains.
  - **Accepted from the delegate:** a plane holds a tuck only where a fold joins its two orientations, so near-touching
    islands a thousandth of a centimetre apart (the Gap fixtures) are not tucks.
  - **For the user:** this may close the courtyard cut overshoot, open since session 1's decision 172, or show what is
    left of it once the tuck is set aside.
- **277. WP-C3 is accepted at `150e45c`: the union's tucks are labelled `Tuck`, carry no Cells, and their rims are read
  through. The suite is green with no red test.** One local commit, not pushed; the lead confirmed the commit, its file
  list and a clean tree, and did not re-run the suite.
  - **The figure, measured by the delegate on that tree:** 9,915 passed and none failed in 46 files, in 354 s; typecheck
    clean. The 9 red tests of BSA.D268 pass because their buildings build.
  - **The issue notes** are merged into [the union tuck note](./ISSUE-building-shell-union-tuck.md), status resolved.
    The two notes BSA.D268 links no longer exist.
  - **The pass** is `src/tuck.ts`, run in `unionRawParts`: find, cut, retag, label. The cut reuses the imprint's own
    cutting, extracted as `cutAlongBoundaries`, and is re-checked closed and of the same genus. The rim rule is
    `rimSegments` in `src/edges.ts`.
  - **The false-seam oracle of BSA.D275 holds:** for the reduced inputs at every height and the silent variants, the
    labelled build less its `Tuck` faces equals the clean mirror image with no difference, the worst coordinate match
    being 1/1024 cm. Cells are laid per face, not per triangle, measured.
  - **Every rim met took a kind from the existing Edge table.** The case where both layers end against two different
    faces does occur, in the Cheek reproducer.
  - **Cured beyond the 9:** `s6/U8` at 263 and 300 cm; and, by BSA.D276, `s1/Court29` at 250 and 300, `s10/Court35` at
    three heights and `CoveredRiseOnCutLine`, whose surviving Internal face was a tuck and which now build clean.
    `U8Seed6h300` becomes a clean golden.
  - **Re-pinned, not cured:** `s13/Court21` at 250 and 300 cm and `CoveredRiseCellClash` no longer throw and build with
    1 Cheek, which by BSA.D260 is a fact. Their pin's wording "cheeks 1, expected 0" predates that ruling.
  - **Not a tuck, unchanged:** the cut-overshoot pins `s13/Court13`, `s2/Court15`, `s7/Court38`, `CutOvershootProbe` and
    the `Courtyard@` cases have no fold. The overshoot of session 1's decision 172 is therefore still open for those.
  - **The wire:** `report.tucks` on every shell, the face kind `Tuck`, and no fold Edges. 90 golden shells change only
    by `tucks: 0`.
  - **Cost, measured on a ten-Ring building:** 6.3 ms of a 196 ms build with 2 tucks; 0.5 ms with none.
  - **Nine mutations each turned tests red.** Not independently reviewed.
  - **Done without being asked, kept:** the spec's decisions 10, 21 and 22 amended for `Tuck`. **The commit's trailer**
    names Claude Opus 5.5, the model that wrote it, where the brief gave the lead's own.
  - **Still open:** why Manifold leaves a tuck. Five copies of the two-Ring case in one building gave 2 tucks.
- **278. The user, 2026-11-14: A courtyard cut qualifies only if its outer end leaves the building on both sides of its
  line.** The user's rule for BSA.F89, and their word to dispatch it: a cut that reaches the outline at a corner where a
  wall carries on in line with it has hit "a corner, not a clean plane at right-angles", and its shortness is a false
  positive.
  - **Why the rule reads the outer end only:** every cut starts at a corner of the courtyard, where the courtyard's wall
    carries on along one face of the slit, so a rule on both ends would refuse every cut. The lead's first wording, that
    at least one face of the slit must stop at the cut's ends, is the weaker form; the user's is preferred because it is
    stated on the outline alone.
  - **Known cost:** it also refuses a cut whose outer end is a corner with the wall carrying on along the same face as
    the courtyard's, which builds clean today (BSA.F89).
  - **WP-C4 builds it** in `selectCut` in `src/courtyard.ts`, to a fresh Opus delegate on `150e45c`. It counts first
    which chosen cuts the rule refuses, and stops if a courtyard is left with no qualifying cut or if more than a
    handful of catalogue buildings change. The user's draft becomes a test that fails under the old rule. `src/roof/` is
    not touched.
- **279. WP-C4 is accepted at `011455d`: a courtyard cut whose outer end is a corner with a wall carrying on in line is
  refused, and the user's all-hip draft builds all hips.** One local commit of 5 files, not pushed; the lead confirmed
  the commit and a clean tree.
  - **Measured by the lead on that tree:** the draft of BSA.F88 builds 12 Wall, 12 Roof and 1 Ground face, with no
    Gable, no Cheek, no conflict and no Unclassified Edge.
  - **The figure, measured by the delegate and not re-run by the lead:** 9,992 passed and none failed in 46 files;
    typecheck clean. 77 tests are new.
  - **Nothing in the corpus moves:** over 5,314 distinct inputs and 4,167 courtyard storeys the rule refuses no selected
    cut, leaves no courtyard without a cut, and changes no building. No golden, pin or catalogue fact changed.
  - **The rule** is `leavesBothSides` in `src/courtyard.ts`, called from `selectCut`: a refusal moves selection to the
    next candidate, as the pitch rule does. Spec decision 2 is amended.
  - **Every boundary case of BSA.F89 now builds clean**, each checked against the mirror image of a partner layout whose
    cut the rule does not touch, or against closed-form heights. **The protrusion of 300 cm that threw "Not manifold"
    builds clean**, at 263 cm storeys and at 45 degrees too; its cause was never found and is only avoided.
  - **The rule's known cost, measured:** the case that built clean on a cut it now refuses takes the next cut and builds
    the same shell, order-free.
  - **Three mutations turned 59, 59 and 112 tests red.** Not independently reviewed.
  - **Not reconciled:** the delegate gives the draft's old top as 408.77, where the lead measured the flat top of the
    gable at 394.34. They may be different points.
  - **Left as it was:** the fixture is in the tests only, so it is not in the viewer's selector or the golden set; and
    `golden.ts` still lists the emptied class "courtyard cut collinear with a jutting wall".
  - **Still open behind the rule:** the cut branch of `buildPieces` in the pinned roof copy is unchanged. A courtyard
    whose every cut meets the refusal would fail with "no raw Ring wall cuts the courtyard"; none exists in the corpus.
- **280. The user, 2026-11-14: Session 3 closes here, and the next session takes on the straight skeleton's lack of
  support for a footprint with a hole, directly.** The user's words: "I'll start a fresh one to tackle the straight
  skeleton's non-handling of toroidal shapes directly."
  - **What it replaces:** the courtyard cut and everything built on it, which BSA.F89 and BSA.F90 show to be a
    workaround whose outcome depends on which cut is taken. No further fix to the cut is dispatched (BSA.F90).
  - **The lead's account of the work, given to the user and not measured:** a skeleton of a polygon with holes is well
    defined; its new ingredient is an event that joins two loops where today's split event divides one; V5 is built on
    one loop of interior edges per step, so this is likely a change to the step model. It also reaches the roof solver's
    cut branch in the pinned copy, the pitch weights on a hole's loop, and the C++ skeleton, whose support for holes is
    unknown.
  - **Not decided:** which arc the work belongs to. The solver is `@proc-geo/core`, whose arc is recursive-subdivision
    (RSA); the consumer is this one.

## Findings

- **F84. Removing the two-pitch sub-rule makes 7 split-band courtyards throw that built clean, all on the opt-in seed
  range, and none on the default run.** (the WP-C1 delegate on the uncommitted tree over f388632, 2026-11-14; not re-run
  by the lead) WP-C1 stopped there under BSA.D265 and committed nothing.
  - **The 7:** `s6h250/SplitCourt8`; `s12/SplitCourt20` at 250 and 300 cm; `s13/SplitCourt38` at 250, 263 and 300 cm;
    `s13h300/SplitCourt11`. The sweep was seeds 1 to 14 at three storey heights, 40 draws each, run with the sub-rule
    and without.
  - **Two classes of throw, both already known:** a Cell reading a ShellEdge with no NetEdge (the Court25 class, which
    WP-L2 had emptied) and "two Cells run the same way along one NetEdge" (the class of `s13/Court21`, BSA.D247).
  - **Already throwing before the change, and unpinned:** `s6/SplitCourt8` at 263 and 300 cm. They now throw the other
    class.
  - **On the default run:** no new throw and no shell opened. `s5/Court34` goes from 4, 2 and 2 Cheeks to none at its
    three heights. Six fixtures gain one Cheek each: `s1/SplitCourt1`, `s2/SplitCourt11` and `s2/SplitCourt29`, each at
    250 and 300 cm. The three hand inputs of BSA.D222 build two rises each with no Cheek.
  - **Over all seeds:** split-band cases with any violation go from 2 to 45, courtyards from 53 to 50, U shapes stay
    at 8.
  - **One example located, not reduced:** `s6h250/SplitCourt8` builds rises `[0,350]` at 52.5 degrees and `[350,600]` at
    45 on y = 550, and throws at x = 450 under a three-storey Ring, at the boundary of storeys 1 and 2.
  - **The tree as left:** 9,825 passed and 5 failed, the 5 being `tests/viewer-facts.test.ts` waiting on a regenerated
    `src/viewer/catalogue-facts.ts`; typecheck clean; no change under `golden/`. Two new tests fail with the sub-rule
    restored, which the delegate ran.
- **F85. The two-Cells clash is reached without a covered rise, and five more opt-in cases throw with no record.** (the
  WP-C1b delegate at 51a233e, 2026-11-14; not re-run by the lead)
  - **`s13/SplitCourt38` builds no covered rise on any storey at 250, 263 or 300 cm and still throws "two Cells run the
    same way along one NetEdge"** (measured with `storeyForms`). BSA.D247 tied that throw to covered rises, so a fix
    proven only on `COVERED_RISE_CELL_CLASH` may not cure it.
  - **Unrecorded throws, the same before and after WP-C1:** `s12/Court16` at 250 and 300 cm throws the mirror of the
    mismatch (`reads ShellEdge -1, its NetEdge 33`); `s6/Court8` at 263 and 300 cm and `s12h263/Court16` throw the
    two-Cells clash. They have no pin and no red test, and the issue notes list them.
  - **The mismatch throws at the same place in all 7 of its red cases** (inferred from the fixtures and error texts, not
    reduced): a vertical side at the end of a three-storey Ring's wall, on the line of the two-pitch split, from the
    two-storey plate to the next lattice line.
  - **The mismatch's error text misleads:** in `reads ShellEdge <n>, its NetEdge <m>`, `<m>` is the other NetEdge's
    ShellEdge index, not a NetEdge id.
- **F86. Across 7,713 entries, dropping fully internal Rings changes one building, and no Ring anywhere is internal to a
  union only.** (the WP-C2 delegate, measured before its edits on 51a233e, 2026-11-14; not re-run by the lead)
  - **Scanned:** the catalogue's choosable entries, the golden set, and the random, courtyard, split-courtyard and U
    generators at seeds 1 to 14 and two heights. Each was built with and without the drop and compared byte for byte and
    order-free.
  - **The one building that changes is `CourtyardJutCutSwapped`:** its dropped Ring's 30 degree S side was winning the
    jut's S wall. It goes from 2 surviving Internal faces, 4 Unclassified Edges and 1 Cheek to clean, and is then the
    same building as `CourtyardJutCut` once the jutting Ring's index is mapped.
  - **`CutPitchConflict`, `CutPitchConflictSwapped` and `CutPitchConflictFileReversed`** each hold two identical bands.
    The later one is dropped and the shells are byte-identical, because it never won a wall.
  - **The random generator draws a second lower Ring inside the first in 184 of 1,960 draws** (368 fixtures at two
    heights). Their geometry is unchanged: 274 are byte-identical and 90 differ only in wall indices, loop starts and
    element order. The delegate's table leaves 4 unaccounted for, which are probably the 4 fixtures (`s6/Fuzz94`,
    `s12/Fuzz118`) whose conflict strings change by a raw wall index. None is a golden or a pin.
  - **The courtyard, split-courtyard and U generators draw no internal Ring.**
- **F87. Both Cell-laying throws have one cause, and it is in the shell before Cell laying: Manifold's union leaves part
  of a back-to-back contact unfused, as a zero-volume double sheet.** (a read-only diagnosis delegate at 8025ead,
  2026-11-14; not re-run by the lead) The delegate calls it a slit: two faces on one plane with opposite normals over
  the same ground, joined by an `Unclassified` fold Edge. Cells are then laid on both sheets.
  - **The situation, the same in every member measured:** a lower storey's roof-piece face lies on a wall line (a
    whole-line gable end, a rise's gable, or a covered rise's Cheek); a taller Ring's wall on the storey above stands
    back to back with it on that line; and the taller Ring's end lies inside the gable's span.
  - **The smallest input, two Rings at 250 cm, found by a grid and not by reduction:**
    `ring([0,0,200,50], 0, 3, 30, {S: gable})` and `ring([0,50,350,150], 0, 1, 30, {S: gable})`. It throws the two-Cells
    clash at (150, 50, 278.87), and at 263 and 300 cm too.
  - **Other reduced inputs:** `s13h250/SplitCourt38` to 3 Rings (`[50,100,300,250]` 2 storeys 30 S gable;
    `[0,100,50,150]` 2 storeys 45 S gable; `[100,0,250,100]` 3 storeys 30); `s6h263/U8` to 2 Rings at 263 cm
    (`[0,0,200,50]` 3 storeys 30 S gable; `[0,50,300,100]` 1 storey 45 S gable); `COVERED_RISE_CELL_CLASH` only by two
    coordinate moves.
  - **Which error appears depends on where the lattice falls on the slit:** the mismatch where a Cell side is on a
    ShellEdge in one sheet and interior to the other; the two-Cells clash where both sheets share an interior side.
    Inputs flip between the two with storey height or depth alone. All 9 mismatch throws in the sweep have a slit.
  - **A third outcome is silent:** the input builds, with overlapping Cells and 1 or 2 Unclassified Edges. Measured in 5
    variants.
  - **Three routes reach it:** a whole-line gable end (`U8`, `Court8`, `Court16`), a two-pitch rise's gable
    (`SplitCourt38`), and a covered rise's Cheek (`Court21`). This corrects BSA.D247, which tied the throw to covered
    rises.
  - **In a grid of 180 two-Ring inputs:** 155 clean with no slit, 19 mismatch, 5 two-Cells and 1 silent, every one of
    the 25 with a slit. No throw without a slit and no clean build with one on a Cell-bearing face, within the sweep's
    range.
  - **Where:** the slit is already in `wasm.Manifold.union`'s output in `unionParts` (`src/union.ts`), and
    `removeSheets` in `src/clean.ts` does not remove it; `sheetTris` is 0 in every member. Inferred: its tests miss the
    slit because each sheet is edge-connected to real surface on its own plane.
  - **Not established:** why Manifold leaves the slit. It depends on raw parts away from the contact (mirroring in x
    removes it; so does dropping any of several parts), so there is no rule that predicts it from the inputs. Whether
    the fault is manifold-3d 3.2.1's or the overlapping raw parts' is open.
  - The probes are in the session scratchpad and are not kept.
- **F88. The jutting-wall cut defect of session 1's F55 is still reachable by an all-hip courtyard with no internal
  Ring; WP-C2 removed its only fixture, not the defect.** (the lead, by building the user's draft with a scratch probe
  on the working tree, on 8025ead and on f388632, 2026-11-14) The user reached it from `CourtyardJutCutSwapped` by
  removing the dropped Ring and setting every side to hip at 30 degrees.
  - **The input:** Rings `[0,0,1000,300]`, `[-250,300,300,700]`, `[0,700,1000,1000]` and `[700,300,1000,700]`, one
    storey each, hipped at 30 degrees, storey height 250.
  - **What it builds, the same on all three trees:** the whole line x = 0 from y = 0 to 1000 as a flat-topped gable
    facing west. Ring 0's and Ring 2's W sides are `Gable` faces rising to z = 394.34, and between them a `Cheek` stands
    above the jutting wing's roof from y = 300 to 700. No conflict, no Unclassified Edge, no surviving Internal face; 1
    Cheek.
  - **With the wing at x = -200** the top is at 365.47 and there are 2 Cheeks.
  - **It predates this session:** the build at `f388632` is identical, so neither WP-C1, WP-C2 nor WP-C3's uncommitted
    work causes it.
  - **The cause as far as it is known:** the courtyard's shortest cut is y = 300 over x 0 to 300, which ends at the
    corner where the wing juts out and is collinear with the wing's S wall. F55 names that configuration;
    `CourtyardJutCut`, where the wing's pitch differs and the cut is refused for the east one, builds clean. Why the cut
    turns the x = 0 walls into a gable is not diagnosed.
  - **The lead's error:** BSA.D271 and BSA.F86 reported the class "courtyard cut collinear with a jutting wall" as
    emptied without saying that the defect behind it was untouched and now had no fixture.
- **F89. The unrequested gable of BSA.F88 is wrong geometry, not a wrong tag: algorithm B builds a courtyard cut's two
  pieces with end planes taken from beyond the cut's own end.** (a read-only diagnosis delegate on the working tree
  during WP-C3, 2026-11-14; not re-run by the lead)
  - **Mechanism, measured:** `selectCut` takes y = 300 over x 0 to 300, and it qualifies because the walls collinear
    with it at both ends are at one pitch. In `buildPieces` (`src/roof/algoB.ts`, lines 144 to 155, the pinned copy)
    each cut side's extent is walked along the line while it stays inside the footprint: one side runs west through the
    wing to x = -250, the other east to x = 1000. Neither equals the cut's span. The shorter is chosen, its end planes
    are read at x = -250 and x = 300, and the pieces are still built over the cut's span, x 0 to 300. At x = 0 their
    roof stands min(250, 300) tan 30 = 144.34 cm above the plate, as a vertical face on the plane of the x = 0 walls.
  - **The tag follows from the shape:** the face lies on those walls' plane, so it is `Gable` over their spans and
    `Cheek` over the wing.
  - **Against the same layout with the east cut forced:** the roofs differ only over x 0 to 150, where the default is up
    to 144.34 cm higher. The east-cut roof is the correct all-hip roof, with no Gable and no Cheek.
  - **The rule:** the defect occurs when both sides of the cut run past it, which needs the cut's outer end at a reflex
    corner of the outline where a collinear outer wall carries on, on the opposite side from the hole wall that carries
    on at the hole end. The face's height is the smaller of the overshoot and the cut's length, times the tangent of the
    pitch.
  - **Boundary cases, measured:** a flush wing, a wing mid-wall and a wing on the hole wall's side are clean; any
    protrusion from 50 to 700 cm is defective; a protrusion of 750 or more moves the face to the hole end, on the
    courtyard's own wall; mirrors, the transpose, 45 degrees and two storeys are defective. **A protrusion exactly equal
    to the cut's length, 300, throws "Manifold refuses the part: Not manifold"**, cause not found.
  - **Session 1's F55 is this mechanism** with mixed pitches adding a surviving Internal face (inferred from matching
    counts and span).
  - **No fixture anywhere reaches it:** 0 hits in 563 listed, golden, playtest and pinned entries, and 0 in 5,040 seeded
    courtyards, whose Rings always tile a rectangle and so have no reflex outer corner. The pinned cut-piece overshoot
    class (`Court13`, `Court15`, `Court38`) does not meet the rule and is a different mechanism.
  - **Where a cure could go, none chosen:** the cut branch of `buildPieces`, which the app may not edit; `selectCut` and
    `cutPitch` in `src/courtyard.ts`, which qualify a cut on pitch alone; or what `buildingOf` hands algorithm B.
    Re-tagging in `gableGenerating` would not cure it.
- **F90. A courtyard with a wing jutting out on both sides has no qualifying cut under BSA.D278 and throws.** (the lead,
  by building the user's second draft with a scratch probe at 011455d, 2026-11-14) The user made one in the editor
  straight after WP-C4 landed, and said it "was easy to make".
  - **The input:** Rings `[0,0,1000,300]`, `[-250,300,300,700]`, `[700,300,1300,700]`, `[0,700,1000,1000]` and
    `[700,300,1000,700]`, one storey each, hipped at 30 degrees. The last lies inside the third and is dropped by
    BSA.D261.
  - **What it does:** `no raw Ring wall cuts the courtyard ring from the hole at (300, 300) to its outer loop`. All four
    candidate cuts, y = 300 and y = 700 on each side, end at a corner where a wing's wall carries on in line, so
    `leavesBothSides` refuses each.
  - **This is the gap BSA.D279 named as open** and called absent from the corpus. The corpus could not have shown it:
    its generators never draw a wing beside a courtyard (BSA.F89).
  - **Before WP-C4** the same layout would have built with the unrequested gable of BSA.F88. The rule turns a silently
    wrong roof into a hard error; it does not make the layout roof.
  - **What the rule cannot reach:** the candidates are only segments of raw Ring walls, by session 1's decision 132, and
    the cause is the cut branch of `buildPieces` in the pinned roof copy, which decision 132 already named as
    roof-gable's own to fix ("its cut pieces' end planes").
  - **No fix is dispatched,** by the user's word.
