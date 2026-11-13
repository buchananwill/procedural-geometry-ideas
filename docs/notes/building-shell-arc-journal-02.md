---
title: "Building Shell Arc: Session 2 Journal"
type: workflow
status: active
---

# Building shell arc: session 2 journal

**This is the head of the thread**, continuing [session 1](./building-shell-arc-journal.md). Decisions continue at
**187** and findings at **F57**.

## Reading order for a fresh context

Read §1 and §4 here, then the two proposals §4 names. **Do not read the session 1 journal end to end** (3,000
lines): fetch a decision or finding from it by number only when something here cites it. Read
[the covered-storeys findings](./building-shell-covered-storeys-and-sections-findings.md) for its "Rulings so far"
only.

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

## 2. State as at bootstrap

- Branch `feature/building-shell-covered-storeys-and-sections` at `6b4c80b`, clean, pushed. It is one commit ahead
  of `main` (`1b415fb`): the covered-storey experiments and their findings document.
- No test figure measured this session. The findings document records 8,275 passing at `1b415fb` (inherited, not
  re-run).
- The session's deliverables are documents. Nothing is committed by the lead without the user's word.

## 3. Operational manual

Carried by reference: [session 1 §3](./building-shell-arc-journal.md#3-operational-manual), with one addition.

- **The C++ UI/UX polish arc lead is the Claude session `claude-work-ec`** (arc MBU, modular-building-ux; it
  confirmed this on 2026-11-12). It cannot read this repo, so send it essentials as text. The data-typing refactor
  is led by a different session.
- **The C++ project is at `D:\Coding\resort_game\PistePerfect_5_7`** and this session may read it (the user,
  2026-11-12). It is about 500k lines on top of the engine, so **go in with a named target, never a browse**. F63
  names the first ones: `Shell/BuildingShellTags.h` (`EBuildingShellKind`), `Roof/ModularRoof.h`
  (`IsModularClampFlatFace`), `Rules/ModularClampRoof.h`, and decision MB.D525 in that project's journal.

## 4. Next work

**State at 2026-11-13, late in the user's first day with the editor.** Both features of the charter are built on
the arc branch, reviewed and accepted, and the user has been steering by building cases in the editor. Nothing is in
flight. Nothing is pushed. The blow-by-blow is in decisions 196 to 242, and is not repeated here.

- **The editor** (decisions 197 to 202) and **its stretches** (212, 214 to 217): accepted at `56e1c1b`.
- **The gable rise in the pipeline and the wire** (decisions 203 to 211, 213): accepted at `be16d6d`.
- **A gable belongs to the Ring side that asked for it** (F75 to F77, decisions 218 to 225): accepted at `887b1f7`.
- **A slope not in the finished building does not limit a rise; a rise with no limit runs through** (decisions 231
  to 233, 236, 238): accepted at `9646bba`.
- **The selector lists every hand-authored fixture, the 53 research cases, and the 196 pinned cases, with what each
  builds as words in its label** (F78, F79, decisions 226, 228 to 230, 237, 239, 240, 242): accepted at `958f587`.
- **The tree's figure, measured by the lead on 2026-11-13 at `958f587`**: 9,591 passed in 43 files, none failed, in
  306 s; `tsc --noEmit` clean. It matches the last delegate's record. The golden drift test is inside that run.
- **The measurement record**: `apps/building-shell/experiments/gable-rises/` and
  [the gable rise findings](./building-shell-gable-rise-findings.md).
- **Delegates**: a delegate carried across many packages exhausts its context (the rise's first delegate did, and
  the selector's ended near 500k tokens). A fresh delegate needs a self-contained brief; the proposal, the findings
  note and this journal's cited entries are enough for one.

**How the user is steering, which a new session must hold to** (decisions 218, 233, 235, 237, 241):

- A golden that pins an incorrect shape is not golden. A change is judged by whether the new shape is right.
- **Do not tame what the inputs justify.** Geometry that is closed, classified and follows the stated rules is
  correct, however odd. Add a limit, cap or refusal only where the user specifies one or the result is
  mathematically dangerous.
- **A Cheek is not a defect in itself.** It is likely an anomaly and may not be intended. The aim is that the
  author can see what causes it and remove it by a minimal change, never that it cannot appear. The user rules on
  Cheeks by looking at them, not in the abstract. `Court14Seed7h250`'s is ruled not a defect.
- The user builds the case in the editor before agreeing something is wrong. Give exact inputs.

**Next, in order:**

1. **The user looks at the Cheeks.** Typing "cheek" in the selector's filter lists the 16 fixtures that build one,
   all courtyards (F79). Their rulings decide what "clean" means from here, and whether conflicts and Unclassified
   Edges are in the dangerous class.
2. **Then revisit what was traded away to avoid Cheeks**: first the two-pitch sub-rule (decisions 220, 222), which
   suppresses one Ring's gable pitch. It needs a way to show the user the variant that builds both.
3. **One path for all gables** (decisions 220, 227): with the limit rule fixed by decision 231 and Cheeks no longer
   counted against it, what remains measured is 8 fixtures that throw and a couple of Unclassified Edges. Re-measure
   before building; F77's figures predate decisions 231 and 237. Not started; it waits for the user's word.
4. **Unruled**: a wall gabled along its whole length that decision 220 turned into a hip with a rise still limits a
   rise facing it (about 68 rises; decisions 232, 236).
5. **Proposals owed, none started**:
   - a viewer feature that says which sides, stretches and pitches produce a given Cheek (decision 237);
   - a height clamp on any roof section above its owning wall, in the editor (decision 234), which needs a clamp
     on hip slopes and whole-wall gables, a wire field, and a view on the C++ roof stage's flat clamp (F63);
   - direct manipulation, starting with inserting a slice along a Ring (decision 241). The user marked the last
     two as stretch goals, and the slice as not for today.
6. **Fold the amendments into the spec** [building-shell-prototype-decisions.md](./building-shell-prototype-decisions.md):
   spec 3 (form per extent), and the spec decisions that say pieces come only from algorithm B (5, 8 and 9). Mark
   session 1's decisions 116 and 149 as amended where they stand. Not done this session.
7. **Re-run the full suite and the typecheck after any further change**, before a merge.
8. **Merge to `main` when the user agrees.** The branch name no longer describes its contents.
9. **Tell `claude-work-ec`** what has changed since its last message (decision 225): the limit rule of decision
   231 and the accepted run-through, the golden changes of decision 236, and the user's position on Cheeks. Not
   yet sent.

## 5. Open items

Carried by reference: [session 1 §5](./building-shell-arc-journal.md#5-open-items), plus the "Raised and not yet
ruled" list in the covered-storeys findings. Added this session:

- **A pipeline hard error reached by ordinary editing** (F64): one of eight random ten-Ring layouts threw a
  Cell/ShellEdge mismatch. Unexamined. `s1h263/Court25` throws the same class of error and stays pinned (F74).
- **Conflict reporting depends on triangulation** (F69). 29 pinned cases now carry only such conflicts (F74), and a
  rise buried under the storey above always reports one. A fix belongs to the re-tag pass, not to rises.
- **Fused contact between a rise and an overhanging floor** needs an Edge kind for Gable–Underside (F71) before it
  can be a policy.
- **16 golden inputs are not C++-replayable** until the port builds rises (F74).
- **Whether the C++ shell-to-net adapter accepts a horizontal Roof face** (F63, F65). Unread on the C++ side.
- **The limit walk gives a phantom plane against a gabled opposite wall** (F70). It builds clean. Whether the shape
  is wanted is for the user.
- **Shrinking a Ring past a rise and growing it back loses the rise** (decision 216). Two undo steps; history is
  not persisted.
- **The build blocks the main thread**: 244 ms for ten two-storey Rings, and 3.2 s for a 106-storey draft (F64,
  decision 198). No Worker.
- **Type backlog**: `saveMark` takes an inline object type (decision 202); `offsetAlong` in `viewer/edit.ts`
  repeats `sideOffset` in `ring-forms.ts` (decision 217).
- **The long links** (F64): about 1,000 characters per Ring, uncompressed.

## Decisions

187. **Session 2 works on the existing branch `feature/building-shell-covered-storeys-and-sections`** (the lead,
     2026-11-12). The findings document's ruling 5 (the user, 2026-11-09) already puts viewer editing on this
     thread, ahead of sections, so the two proposals are this branch's kind of work. Implementation branches are
     decided when a proposal is accepted.
188. **The lead proposes that a mid-wall gable is a raw part added to the union, never a change to the roof solve**
     (2026-11-12; [the proposal](./building-shell-gable-rise-proposal.md)). The storey is solved fully hipped along
     the wall, and each rise is a synthetic gable piece built by the unchanged `gablePiece`. The reasons are F58
     (core refuses the weight change by design), F59 (algorithm B's segment is the wrong shape) and F60 (the
     synthetic piece measured clean). Authoring is by runs on a Ring side, with form decided per extent of a union
     wall, which would amend spec 3 and decisions 116 and 149. `input@1` needs no schema change. **Proposed, not
     adopted: it waits on the user.**
189. **The lead proposes that the viewer's editor edits `ShellFixture` directly, with the wire round trip
     `readInput(writeInput(draft))` as its only validity law** (2026-11-12;
     [the proposal](./building-shell-viewer-editing-proposal.md)). The first version is a numeric form panel on
     pure edit functions, saves `input@1` JSON, and touches no pipeline, wire or golden file. The reason is F62:
     the in-memory path has no validation of its own, and the wire's rules already exist and are browser-safe.
     **Proposed, not adopted: it waits on the user.**
190. **The editor is built before gable rises** (the lead, 2026-11-12), following the user's ruling 5 of
     2026-11-09. The editor ships on today's one-form-per-side model, and gains a run list when rises land.
191. **The whole-wall tie-break is not what ships** (the user, 2026-11-12). The game UI already lets a player
     request a gable or a hip on one Ring's wall plate, then place another Ring flush with it so the two form one
     straight wall. Decision 116's lowest-index rule then hides one of the two requests. The user accepted that as
     a simplification to merge an MVP, and rules it out for the shipped game. **This answers the question that
     gable rise decision 18 reserved for the port lead**: content reaches a mixed wall through flush Rings today,
     with form requested per Ring side. It also supports gable rise decision 3 (form per extent), which the user
     has not yet ruled on in terms.
192. **The user accepts the direction of the gable rise proposal and its three limits, and agrees the editor is
     built first** (the user, 2026-11-12). Accepted: a hipped skeleton solve as the baseline with rises stitched in
     on mixed walls; one hip pitch per straight wall (gable rise decision 4); lowest index as the tie-break only
     where two Rings' sides cover the same stretch (decisions 3 and 7); and a measurement sweep before production
     code (decision 22). **The lead reads the second limit as accepting form per extent**, since the limit only
     makes sense under it, and has said so to the user. Decision 190's order stands.
193. **The editor's validity law is the wire round trip** (the lead, 2026-11-12; viewer editing decision 6). It
     was merely undecided, so the lead decides it. The cost is stated: the editor cannot build what the wire
     refuses, such as a pitch below 7°. It is revisited if the user wants to explore outside the wire's range.
194. **The pipeline supports several solutions for a tall rise, with the data choosing; the default is the far
     slope** (the user, 2026-11-12). The user's default: the gable's apex may rise above the orthogonal ridge, but
     no point of the gable may be higher than the roof slope from the other side of that ridge, extended towards
     the wall the gable rises from. The user can imagine other solutions. **The lead's reading**: this is the same
     geometry the proposal already had (the far wall's hip plane in the piece's plane set), so nothing measured in
     F60 is invalidated. The change is structural: the limit becomes a named policy on the rise, `farSlope` first.
     Gable rise decision 11 is amended in place. The lead decided that `input@1` gains no field until a second
     policy exists.
195. **A rise is clamped so its ridge cannot rise up through the floor of an overhanging storey above it, unless it
     first hits a maximum height of its own; data may choose otherwise** (the user, 2026-11-12). Gable rise
     decision 12 is amended in place. **The lead's readings, flagged to the user and not yet confirmed**: both
     limits are horizontal caps over the whole rise; a rise gains an optional authored `maxHeight`; and
     "overhanging" means a storey whose floor is above the rise's plate and whose plan overlaps the rise's plan.
     Under that reading the storey directly above the rise's own storey is not an overhang, so a rise running back
     into its wall stays with the unruled covered-storeys items. A capped rise has a horizontal top face, which
     the pipeline has never produced: its tag and Edge kinds are owed by the measurement sweep.
196. **The user gives the go to commit the notes on the arc branch and dispatch the editor there, and to message
     the C++ side now** (the user, 2026-11-12). The recipient is the session that will lead the UI/UX polish arc,
     because this work links more directly to it than to the session leading the data-typing refactor.
197. **WP-E1 landed at `c00b8cf` and is provisionally accepted, pending two reviews** (the lead, 2026-11-12). The
     range `aa9b09b..c00b8cf` is three commits touching exactly the nine files of the proposal's roster (the lead
     checked `git diff --stat`). The delegate's record, on that tree: baseline 8,275 passed in 36 files, final
     8,421 passed in 38 files, typecheck clean, and the four gates of decision 23 each convicted by mutation. The
     lead has not re-run them. Rulings on what it reported:
     - **No Worker** (viewer editing decision 12): the worst measured ten-Ring draft is 244 ms, under the 250 ms
       line, but only just (F64). It is reopened if drafts grow.
     - **The link stays uncompressed for now** (decision 20). At about 1,000 characters per Ring it works in a
       browser. The measured deflate alternative is noted in F64 and offered to the user.
     - **The delegate's `parseDraftJson` and `canonicalRing` are accepted in principle**, since the wire round
       trip does not return an equal fixture (F64). Their soundness is the correctness reviewer's first target.
     - **Its additions beyond the proposal stand unless a review objects**: a confirm dialog before replacing a
       changed draft, Ctrl+Z and Ctrl+Shift+Z, and Download and Copy link disabled on an invalid draft.
198. **Both reviews of WP-E1 are ruled on, and WP-E1.1 carries the fixes** (the lead, 2026-11-12). The correctness
     review found no High: no draft path bypasses the validity gate, and no round trip changes what is built. The
     type review asked for changes. Rulings, by the reviewers' own labels:
     - **Type B1 is rejected as unreachable.** It says two Rings with `modelIndex` -1 would share a lookup. The
       lead opened `input-adapter.ts:287-294`: an index of -1 is itself refused, and duplicates are refused, so an
       accepted file has unique model indices. The silent `?? 'Auto'` fallback still becomes a thrown invariant.
     - **Type B2 to B6 are accepted**: use `RingSides`; tie the persistence schema to `ShellFixture` at compile
       time; clone by spread so a future field is not dropped; name `SetBuildOptions`, `DraftOrigin` and use
       `ParsedDraft`.
     - **Type N1, N2, N5 and N6 are accepted**; N4's casts are tidied where a narrowing costs a line; **N3 stands
       as written**, because the wire gives no machine-readable refusal and the wire is outside this package.
     - **Correctness M1: a listed side always carries its own pitch.** The wire cannot tell a listed side that
       follows the default from one pinned at the default's value. The editor removes the ambiguity at its source:
       choosing a form on a side pins that side's pitch at its current value, and "Default" unlists it. Download
       then load must then return the draft itself. **The one named exception** is `defaultDeg` on a Ring with all
       four sides listed, which the wire has no field to carry. Gate 3 compares against the draft, not against a
       canonical respelling. This amends viewer editing decisions 14 and 23.
     - **Correctness M2: a build that did not finish is not retried on reload, and a very tall draft asks first.**
       The saved draft records that a build is in progress. A reload that finds that mark shows the draft unbuilt,
       with Build and Undo offered. A draft whose Rings' storeys sum above 100 asks before building. Neither is a
       validity rule, so decision 193 stands.
     - **Correctness Low 1, 2, 3, 4, 5 and 7 are accepted** as written. **Low 6 stands as an interpretation**:
       only Wall and Gable faces carry a Ring identity (F64), so viewer editing decision 15 is amended to say so.
     - **The three vacuous tests are rewritten** to be able to fail.
     - No test proves `main.ts` calls the gate. Accepted under decision 22; the reviewer confirmed it by reading.
     - **After WP-E1.1**: the correctness reviewer re-reads the fix diff only. The full suite and the golden drift
       test are run on the final tree, since the reviewer did not run them.
199. **The user finds the editor a "pragmatically useable starting point", and gives the go for gable rises once
     the reviewers are satisfied** (the user, 2026-11-12, after trying the editor at `c00b8cf`). The lead holds the
     rise work until WP-E1.1 has landed and its re-review is ruled on, as the user conditioned it. The first rise
     package is the measurement sweep of gable rise decision 22, and it stops if any class is not clean.
200. **The user signs off for the night and authorises the planned work to continue, with regular commits as
     appropriate** (the user, 2026-11-12). The plan is §4: accept the editor after WP-E1.1's re-review, then the
     rise measurement sweep, then the rise itself if the sweep is clean. Commits stay on the arc branch and nothing
     is pushed, because pushing was not mentioned. **What waits for the user**: any ruling the sweep shows is
     needed (a class that is not clean, the flat top's classification, the storey directly above a rise), and the
     unconfirmed readings of decision 195.
201. **WP-E1 and WP-E1.1 are accepted at `4e969a5`, with one small fix owed as WP-E1.2** (the lead, 2026-11-12).
     The re-review of `c00b8cf..4e969a5` found no High and closed every accepted finding but one. It confirmed M1
     by a fuzz of 300 seeds and 7,914 valid drafts: none differed after download then load, apart from the named
     exception. Rulings on what it raised:
     - **Medium, accepted: a Ring click erases the reload mark.** `act` saves the draft without the mark on every
       action, so after a held reload one click lets the next reload build by itself. WP-E1.2 saves with the mark
       while the draft is held or a build is in flight, with a test convicted by mutation. It is small enough that
       the lead reads the diff and does not send it back to review.
     - **Low, stands: Redo onto the held draft builds it.** That is a deliberate act by the user, and the over-100
       ask still guards it.
     - **The reviewers are satisfied in the sense of decision 199**, so the rise sweep is dispatched alongside
       WP-E1.2. The two touch disjoint files.
202. **WP-E1.2 is accepted at `e4de021`, and the editor is complete for this version** (the lead, 2026-11-12). The
     lead read the diff: one pure `saveMark` decides the mark from the held state and the in-flight count, every
     save asks it, and `act` clears the held state before its save when the fixture changed. The delegate's record
     on that tree: 8,437 passed in 38 files, typecheck clean, and the new test fails under both mutations. **Not
     exercised in a browser**: the fix was tested only through the pure function. One type nit is left for the
     backlog: `saveMark` takes an inline object type.
203. **WP-G1 is accepted at `e45304b` as a measurement, and the rise is not built yet** (the lead, 2026-11-12). The
     commit adds 21 new files, all under `apps/building-shell/experiments/gable-rises/` plus
     [the findings note](./building-shell-gable-rise-findings.md) (the lead checked `git show --stat`). F60 and
     F61 reproduced exactly. Of 232 builds, 215 are clean and 17 are not (F65 to F69). Rulings:
     - **The lead mis-read the user's decision 194, and corrects it.** The user said the limit is "the roof slope
       from the other side of the orthogonal ridge". The lead mapped that to algorithm B's far wall, which is the
       same plane on a rectangle and a different one elsewhere (F66). **The default limit is the slope just beyond
       the main ridge that the rise's own ridge runs into**, which the sweep's probe calls `ridgeSlope`. Gable rise
       decision 11 is amended in place. The probe measured `ridgeSlope` on 7 builds only, so WP-G1.1 re-runs the
       whole sweep under it before anything is built.
     - **A rise that reaches the floor cap fuses with the overhang, and the genus that follows is correct**
       (F67). The user ruled the ridge cannot pass *through* the floor; a rise clamped at the floor touches it, so
       the two solids join and can close a tunnel. Genus is derived from the geometry, not authored, so the
       invariant for a capped rise takes its genus from the shape. **This is the lead's reading and is flagged to
       the user**, who may prefer a gap below the floor.
     - **A rise that breaks through the storey directly above stays with the user** (F68). It is the covered-storeys
       precondition, and the alternative reading of decision 195 does not build at all.
     - **Gable rise decisions 3, 6 and 21 are corrected in place** where the sweep showed their wording wrong.
     - **Building the rise waits for the user** (decision 200), on F68 and on confirming the two readings above.
       WP-G1.1 is measurement and proceeds.
204. **WP-G1.1 is accepted at `3a8c469`, and the rise is built on provisional defaults that the user can reverse**
     (the lead, 2026-11-13). The lead told the user the rise would be built only if every class is clean or clean
     under a stated condition. After WP-G1.1 every class is clean under a stated limit policy (F70 to F72). The
     limits are policies chosen by data (decision 194), so a default the user reverses is a default swapped, not a
     rebuild. The work stays on the arc branch, unpushed. **Each default below is the lead's, is provisional, and
     is put to the user:**
     - **`ridgeSlope` is defined by a walk** (F70): from the middle of the rise's band, square to its wall and
       inward, over the storey's solved hip roof with no rise added; the limit is the plane of the first skeleton
       face entered whose slope falls in the walking direction.
     - **Where the walk finds no such face, the limit is read from the built roof at the same walk** (the sweep's
       `ridgeRoof`). Measured: this happens only along a courtyard cut, and the fallback is clean there.
     - **STRUCK: decision 203's reading that a rise fuses with an overhanging floor.** Fused contact gives an
       `Unclassified` Gable–Underside Edge (F71), which is not clean. **The floor cap sits 1 cm below the floor**,
       which measured clean at genus 0. Fused contact is a later policy, and needs an Edge kind first.
     - **A rise is also capped at the wall top of the storey directly above its own**, where that storey's plan
       overlaps the rise's reach (F72). This cures the breakthroughs of F68, and a rise under a flush upper wall
       is buried whole, which is right. It extends the user's decision 195 to the case that decision's reading
       left open.
     - **A rise on a hip end, taller than the main ridge, rides along that ridge** to the far end's hip plane
       (F70). It is clean and follows from the rule. The author's `maxHeight` is the remedy. Flagged to the user as
       a shape they may not want.
     - **Rises do not limit each other**: the walk reads the hip roof without rises.
     Gable rise decisions 11 and 12 are amended in place. WP-G2 builds the pipeline and the wire; the editor's run
     list follows as WP-G3.
205. **WP-G2 may add the `runs` line to the editor's saved-draft schema, and nothing else under `src/viewer/`** (the
     lead, 2026-11-13). WP-G2 stopped before any change, correctly: adding `runs` to `SideForm` (gable rise
     decision 1) fails the compile-time tie that decision 198's B3 put on `SideFormSchema` in
     `src/viewer/draft.ts:374`. The tie did its job. The one schema line makes saved drafts keep their runs. **Known
     and left for WP-G3**: the editor's `setSideForm` and `setSidePitch` replace the side object and so drop its
     runs. Until WP-G3, a file with runs loaded into the editor keeps them only while that side is not edited.
206. **WP-G2's second stop is ruled: the wide effect of form per extent is accepted as the feature working, and the
     suite's pins follow it by attributed promotion** (the lead, 2026-11-13). WP-G2 stopped at the WIP commit
     `7464c40`, **which is red: 141 failed, 8,296 passed**. The pipeline code is built. The failures are tests and
     goldens that pin the whole-wall rule (F73). Rulings:
     - **The 37 cured robustness pins are promoted, each attributed to gable rise decision 3**, and
       `s1h263/Court25` is re-pinned at its new signature. This is the project's enrolment rule working as meant: a
       fixture leaves the defect set by being cured, and an unattributed cure would have broken the suite. A
       residue class left with no member is reported as emptied, not refilled with a weaker case.
     - **The golden set's residue representatives are re-chosen from the pins that remain.**
     - **WP-G2 may change the one case name in `tests/viewer-defects.test.ts:163`** to a case that still has a
       Cheek. That test is about the legend's colour, and its case was incidental. If no case has a Cheek any more,
       it stops and reports.
     - **`SB400-600B100S500g60r0` is re-authored so its wall is gabled along its whole length**, because the rule
       it is an oracle for is the free cut taking a gable's pitch. Its name follows the roster's convention for
       the new input.
     - **A rise for which the limit walk finds nothing on either roof is a `PlanRefusal`**, not a bare error, so
       the editor shows it as a refusal.
     - **A None side that now wins its own extent is refused**, as the per-extent reading of decision 140 requires.
       Accepted, and owed to the C++ side as a consequence.
     - **Cost, accepted and flagged to the user**: 37 golden files change and 21 golden inputs stop being
       C++-replayable until the port builds rises (gable rise decision 17).
207. **WP-G2 returned at `1d6c137` with 3 failures, all one cause, and the lead authorises the fix** (the lead,
     2026-11-13). 8,529 pass and 3 fail in 39 files; typecheck clean; goldens re-exported once. The 3 are lines 34,
     86 and 116 of `tests/viewer-defects.test.ts`, which read the cured case `Court14Seed1h250` from the manifest
     by name. Decision 206 had allowed only line 163. The delegate may point those lines at `Court14Seed7h250`
     too. **Correction to decision 206 and F73**: the delegate's first count, "37 of 38 become clean", did not
     survive its own full check. See F74. The lead repeated the first count to the user and corrects it.
208. **WP-G2 landed green at `c1dc136` and is provisionally accepted, pending two reviews** (the lead, 2026-11-13).
     It is commits `7464c40`, `1d6c137` and `c1dc136`. The delegate's record on that tree: 8,532 passed in 39 files,
     typecheck clean, the drift test green after one re-export, and eight mutation gates convicted. The lead
     checked `git diff --stat 8d184f0..HEAD`: 17 source and test files, all in the roster or authorised by
     decisions 205 to 207, and nothing under `src/roof/`, `packages/`, `edges.ts`, `cells.ts` or `tags.ts`. **Two
     reviews dispatched**: `typescript-type-reviewer`, and a correctness reviewer (general-purpose, Opus) whose
     brief includes the honesty of the pin and golden changes and the independence of the height oracle.
209. **Both reviews of WP-G2 are ruled on, and WP-G2.1 carries the fixes** (the lead, 2026-11-13). The correctness
     review found one High and two Medium, each confirmed by a run or by reading; the type review asked for two
     changes. Everything else it checked was sound, including the extents, the limit walk, the caps, the exactness
     of the new conflict pins, and the boundary. Rulings:
     - **High H1, accepted: a whole-wall gable shared by several Rings can take the wrong pitch.** Merging adjacent
       gable extents across Rings keeps the first extent's Ring, so the lowest index is lost
       (`ring-forms.ts:158`). Three gabled Rings at indices 0, 1, 2 with pitches 45°, 60°, 45° give a 60° wall
       where decision 5 gives 45°. A merge keeps the lowest index. A test with that input, convicted by mutation.
     - **Medium M1, accepted: the height oracle cannot catch a wrong limit plane**, because it reads the planes
       the code chose. Every rise fixture gains an assertion that does not pass through `rise.ts`'s choice: the
       wall whose plane is the limit, named by hand, and one height from a closed form. The oracle's doc comment
       states what it does and does not prove. This corrects gable rise decision 19, which claimed more.
     - **Medium M2, ruled: on a whole-wall gable, a tie inside one Ring goes to the extent first along that
       side's own direction**, from the side's start, never by world coordinate. One Ring side authored with
       gable runs of two pitches gave 20° on S and 70° on N. Gable rise decision 5 is amended. The other pitch on
       such a wall is not built, as with hip pitches under decision 4.
     - **Low L2, accepted: runs are checked in memory.** A run outside its side, overlapping another, out of order
       or of zero length is a `PlanRefusal`, as gable rise decision 1 requires. **L1, L4 and L5 stand**: `request`
       is information only, the wider golden change is recorded in F74, and the model-order test reading the
       in-memory document follows from decision 17. **L3 is already ruled** (decision 206) and is now named in
       gable rise decision 15.
     - **Type B1 and B2 accepted**: one `RISE_LIMITS` tuple that the union, the policy table and the saved-draft
       schema derive from; `GableRise` and `Claim` derived, not hand-copied. **N1 accepted**: the caps are keyed
       by name like the limits, and a built rise records which cap won. **N3 accepted. N4 goes to WP-G3. N5 is
       declined.**
     - **After WP-G2.1**: the correctness reviewer re-reads the fix diff only.
210. **WP-G3, the editor's run list, is dispatched alongside WP-G2.1's re-review, and it does not expose
     `maxHeight` or `limit`** (the lead, 2026-11-13). WP-G2.1 is green at `f4dbe88` and the run types it exports are
     settled, and WP-G3 touches only `src/viewer/` and its tests, so the two do not collide. The run list edits a
     run's ends, form and pitch. **`maxHeight` and `limit` are left out because they do not survive `input@1`**
     (F74): a downloaded draft would load back as a different building, which breaks the editor's round-trip law.
     They return when the wire carries them, which is a wire change for the user and the C++ side. The viewer
     editing proposal is amended.
211. **WP-G2 and WP-G2.1 are accepted at `f4dbe88`, with one small fix owed as WP-G2.2** (the lead, 2026-11-13).
     The re-review closed H1, M1, M2 and L2 and found no High or Medium. It tried to break H1 again with five
     Rings, gable-hip-gable, and a merged rise, and could not; it re-derived all 13 closed forms by hand. Rulings:
     - **Low 1, accepted: one side's hip runs must agree in pitch in memory too.** A side with hip runs of two
       pitches builds, then writes a document the reader refuses. WP-G2.2 makes it a `PlanRefusal`, matching
       gable rise decision 15. Small enough that the lead reads the diff.
     - **Low 2 stands**: the in-memory run check is stricter than the reader at the snap tolerance, which is the
       safe direction.
     - **The C++ UI/UX lead was sent the built facts on 2026-11-13**: kinds and Cell sources on a rise, the rule
       as built, the limits, the adapter's two changed behaviours with the None refusal's text, and the golden
       changes. That discharges §4 item 9 and the item owed after WP-G2. No reply was asked for.
212. **WP-G3 landed at `7274126` and is provisionally accepted, pending two reviews** (the lead, 2026-11-13). The
     delegate's record: 8,631 passed in 39 files, typecheck clean, three mutation gates convicted, and the run list
     exercised in a browser, where a gable run on a blank draft produced a Gable face with Valley and Verge edges.
     It also exercised WP-E1.2's reload mark in a browser for the first time: held, Ring clicked, reloaded, still
     held. **One thing the lead does not yet accept**: the round trip returns four spellings of a side with runs
     in a different spelling of the same building, pinned as exceptions. That is the class of defect decision 198
     removed at its source for sides. The correctness reviewer is asked whether one canonical spelling, runs
     covering the whole side, would remove the exceptions. Reviews dispatched: the editor's correctness reviewer,
     resumed, and `typescript-type-reviewer`. `RISE_FIXTURES` are now in the viewer's selector under "Gable
     rises".
213. **WP-G2.2 is accepted at `be16d6d`, and the gable rise is complete in the pipeline for this version** (the
     lead, 2026-11-13). The lead read the diff: one check, `checkedHipPitches`, beside the existing run checks in
     `unionWallForms`. The delegate's record on that tree, which includes WP-G3: 8,631 passed in 39 files,
     typecheck clean, drift test green, no golden or pin changed, and the check convicted by mutation. Its
     agreement grid of 1,200 run lists shows the in-memory check and `readInput` refuse the same ones.
214. **Both reviews of WP-G3 are ruled on: a side with runs gets one canonical spelling, stretches that tile the
     whole side, and WP-G3.1 rebuilds the run list on it** (the lead, 2026-11-13). The correctness review found no
     High. Its Medium confirmed the lead's doubt in decision 212 by a fuzz: of 2,773 valid drafts, 683 came back
     from download then load in a different spelling; the built shell was identical in every pair built; but the
     same follow-up edit gave **different roofs in 93 of the 683**. All four spellings are reachable from the
     panel. Rulings:
     - **A side is either plain or split.** A plain side has no runs. A split side's runs cover its whole length
       in order, with no gap and no overlap, and neighbours that agree in form, pitch, `maxHeight` and `limit`
       are merged. A split side that merges down to one stretch becomes a plain side. The side's own `form` and
       `deg` are then derived (the first hip stretch, else the first stretch), so `writeInput` of a draft and of
       its loaded copy are the same bytes. The editor applies this spelling after every valid edit, and
       `parseDraftJson` rebuilds it on load.
     - **The panel edits stretches, not free runs.** Splitting a stretch makes neighbours. Moving a boundary moves
       both stretches that share it. On a split side the stretches are the truth, and the side's own form and
       pitch controls do not act; "Default" returns the side to plain. Chosen over the wire's own spelling because
       there a side's form changes under the user when a run is added.
     - **Download then load returns the draft itself for every valid draft**, with the two exceptions already
       named: `defaultDeg` on a Ring with all four sides listed, and `maxHeight` and `limit`, which the wire does
       not carry. The four pinned spelling exceptions are removed. A seeded fuzz in the suite holds this, and is
       the gate.
     - **Low 2 accepted**: a new hip stretch takes the side's existing hip pitch, so splitting never makes a
       refused draft. **Low 3 accepted**: the note says Download and Copy link both drop `maxHeight` and `limit`.
       **Low 4 ruled**: setting a stretch to hip clears its `maxHeight` and `limit`, which belong to a rise.
       **Low 1 falls away** with splitting; a stretch too short to split says so.
     - **Type B1 accepted** (`RING_FORMS` in `fixture.ts`, one authorised line outside the viewer). **N1, N2, N3
       and N5 accepted. N4 falls away** if a tiled side's runs are written as authored with no fill; if the
       duplicate of `writeInput`'s layout must stay, it is tied by a test on positions, not on a count.
     The viewer editing proposal is amended.
215. **WP-G3.1 landed at `93aaf2d` and goes to a targeted re-review** (the lead, 2026-11-13). It is `636e622` and
     `93aaf2d`, six files, all in the roster (the lead checked `git diff --stat 7e313df..HEAD`); the working tree
     is clean. The delegate's record: 8,634 passed in 39 files, typecheck clean. **Its first full run was red**:
     the new fuzz exceeded the 5 s default timeout at 6.7 s, with the property holding; `93aaf2d` gives that test
     60 s. The fuzz covers 19,200 edit steps and 6,521 valid drafts, asserts its own coverage, and fails under
     three mutations. The four pinned spelling exceptions are gone. **Interpretations the reviewer is asked to
     test, since each can lose data**: a resize refits a split side and drops stretches past the new length; a
     stretch with limits that merges to the whole side loses them; a malformed side is left as typed.
216. **WP-G3.1 is accepted at `93aaf2d`, with WP-G3.2 owed for one Medium** (the lead, 2026-11-13). The re-review
     closed the respelling finding: its fuzz of 3,072 valid drafts found 0 respelled (was 683), 0 built-shell
     differences in 640 pairs, and 35 diverging follow-up edits, all of them "Default" on a Ring with all four
     sides listed, which is the named `defaultDeg` exception. No High. Rulings:
     - **Medium, accepted: a resize keeps stretch boundaries where they are in the world.** Stretches kept their
       distance from the side's start, so moving that end slid every rise: on `[0,0,1000,500]`, setting x1 to 800
       moved the N rise from x [400, 600] to [200, 400]. After WP-G3.2 a surviving boundary stays at its world
       coordinate; the end stretches take up the change; a stretch outside the new side is dropped.
     - **Accepted as a known behaviour, for the user**: shrinking a Ring past a rise and growing it back does not
       bring the rise back. It is two undo steps. History is not persisted, so a reload in between loses it.
     - **Low, accepted**: a boundary moved onto its neighbour's far end removes that neighbour; the halving
       branch and its comment are made to agree.
     - **Low, stands**: a whole-side stretch that carries `maxHeight` loses it on becoming plain. It is not
       reachable from the panel. Whether the pipeline reads `maxHeight` on a whole-wall gable is unverified, and
       gable rise decision 5 says no rise is built there.
     - The lead reads WP-G3.2's diff; no further review.
217. **WP-G3.2 is accepted at `56e1c1b`, and the editor's stretches are complete for this version** (the lead,
     2026-11-13). The lead read the diff: `refit` carries each stretch to the resized side by world coordinate,
     clips or drops what falls outside, and re-canonicalises; `moveBoundary` removes a neighbour the boundary
     lands on; a split needs two whole cells. The delegate's record: 8,640 passed in 39 files, typecheck clean,
     and the resize tests fail when the old rule is restored. One nit for the backlog: `offsetAlong` repeats
     `sideOffset` in `ring-forms.ts`, which is not exported. **With this, both features of the charter are built,
     reviewed and accepted on the arc branch.**
218. **A golden that pins an incorrect shape is not golden** (the user, 2026-11-13, on F75: "They're not 'golden'
     if they pin an incorrect shape. That is obvious to me."). The cost the lead raised, that fixing F75 changes
     committed goldens, is no objection. **The lead takes this as the go for the fix it recommended**: a wall
     gabled along its whole length is built by algorithm B only when algorithm B's piece for it spans the wall's
     own length and no more. Where the piece would span more, because the wall's line runs on through the
     building, the wall is solved as a hip at the gable's pitch with a rise across its whole length. Gable rise
     decision 5 is amended. **Standing consequence for the arc**: a changed golden is weighed by whether the new
     shape is right, never by the fact of the change. WP-G4 measures the affected set first, then builds.
219. **Decision 218's rule as the lead wrote it is wrong, and WP-G4 rightly stopped on it; the lead proposes that a
     gable belongs to the Ring side that asked for it** (the lead, 2026-11-13). The lead's rule keyed on "algorithm
     B's piece is wider than the wall". F76 shows that is true of 933 walls, among them `SingleStoreyT`, whose
     wide piece is the intended gable end: Ring 0's E side is gabled along its whole length, and a stem buries
     its middle. The user's ruling (a wrong golden is not golden) stands; what falls is the lead's predicate.
     **The proposed principle**: a gable's band is the stretch of the line that Ring sides claim as gable, buried
     stretches included. `SingleStoreyT`'s band is Ring 0's whole E side. F75's band is Ring 1's S side and no
     more, because the stretch beyond the inside corner is Ring 0's hip side. This is also the one-path model the
     lead put to the user: every gable is a piece over its claimed band. **Not adopted. WP-G4.1 measures it,
     changing no production code, and the user rules.** WP-G4 made no commit.
220. **The narrow rule is built; the one-path rule is measured unfit and stays open as a design question** (the
     lead, 2026-11-13, on F77). The lead had told the user the choice between the two was theirs. The measurement
     removed the choice for now: the one-path rule throws on 8 fixtures that build today, changes plain
     gable-ended buildings, and needs three sub-rules of which one has no clean candidate. The lead therefore
     proceeds with the narrow rule as the fix for F75 under decision 218, says so to the user, and withdraws its
     own earlier recommendation of one path. **The rule**: algorithm B builds an all-gable wall where its piece's
     span equals the gable band that Ring sides claim on that line, buried stretches included; otherwise the wall
     is a hip with one rise over the claimed band. **Sub-rule**: a wall claimed gable at two pitches stays
     algorithm B's one gable, which removes every new Cheek the rule would add. **Accepted costs, to be pinned
     exactly**: 2 new Unclassified Edges on `Court18` at 263 and 300 cm, and more F69 conflicts on 11 fixtures.
     Gable rise decision 5 is amended again. WP-G4.2 builds it, with a fresh Opus delegate.
221. **WP-G4.2 landed at `b1cff3e` and is provisionally accepted, pending a correctness review** (the lead,
     2026-11-13). One commit; nine source and test files, all in the roster (the lead checked `git diff --stat`);
     the working tree is clean. The delegate's record on that tree: 8,683 passed in 39 files, typecheck clean,
     drift test green after one re-export, four mutation gates convicted. **Production matched the measurement on
     every predicted case**: over 5,278 fixtures, 0 disagreements, 165 changes all as the probe predicted, no clean
     fixture made unclean, nothing new throwing. The user's with-wing draft is the fixture
     `GableBesideHipSouthWing`, and builds the symmetric gable.
     - **Correction to F77 and to the lead's brief**: `s5/Court34` is not cured. That cure came from the
       measurement's default run without the two-pitch sub-rule; with the sub-rule nothing changes there.
     - **Pins**: none promoted. Six re-pinned on changed text or counts. `Court18` at 263 and 300 cm is back in
       the defect table with 2 Unclassified Gable–Wall Edges each: a 26.8 cm² sliver of a storey 0 rise front
       lying flat against the storey 1 wall of a taller Ring. No smaller case reproduces it. 11 fixtures gained
       F69 conflicts and are enrolled.
     - **Goldens**: `SplitBandAllGable75` and `Court16Seed1h250` change shape, each hole wall now carrying its own
       gable instead of a slice of a wider one; `Court25Seed1h263` changes its error text only. Added:
       `GableBesideHip` and `GableBesideHipSouthWing`. `SplitBandAllGable75` now builds a rise, so it is no longer
       C++-replayable.
     - A correctness review is dispatched (general-purpose, Opus) on `b1cff3e`. **Owed to `claude-work-ec`**: the
       goldens moved again.
222. **The review of WP-G4.2 found one High, and WP-G4.3 carries the fixes** (the lead, 2026-11-13). Everything
     else held: the band computation, the user's case under six variations (each the symmetric gable, apex at
     (900, 374.3), clean), the boundary, and the exactness of every pin. Rulings:
     - **High H1, accepted: the verdict is decided once per line extent, not per wall.** `claimedWalls`
       (`rise.ts:138-147`) asks per union wall, but algorithm B builds one piece per line extent, so two walls on
       one extent can get opposite answers and a band is then built twice. Three hand inputs go from clean to 1
       Cheek. The smallest: Rings `[0,0,500,500]` S gable at 30° and `[500,0,1000,500]` S gable at 45°, with a
       hip wing `[600,-300,800,0]`. **The corpus sweep could not see this**, which is why "0 disagreements over
       5,278 fixtures" (decision 221) was true and not enough. All three inputs become tests.
     - **Medium M1, accepted as correct behaviour and now tested**: on a mixed wall, a gable run whose middle a
       wing buries builds one rise over the whole run where it built two. That is decision 220's "buried
       stretches included". The claim in decision 221 that mixed walls are unchanged holds for the corpus only.
     - **Medium M2, a correction to decision 221**: `SplitBandAllGable75` changed more than reported. Its outer
       gable ends at x = 0 and x = 1000 had an apex at 2,116 cm and now have a flat top at 1,369.6 cm from y = 300
       to 700, because algorithm B's far-wall limit now reads a hole wall that has become a hip. The hole gables
       on y = 200 and y = 800 widen from [200, 800] to [150, 850]. The reviewer finds the roof plausible. **For
       the user to look at.**
     - **Low L1, L2, L3 accepted**: `buildsARise` falls back only on a `PlanRefusal`; band ends compare within
       the same 1e-9 as the rest; the `extentOf` tie test gains footprints off the 50 cm lattice.
     - **For the user: the two-pitch sub-rule can hide a request.** Where a wing buries only part of a gabled
       side, so that one exposed wall is claimed gable at two pitches, algorithm B builds one gable at the
       lowest index's pitch across the whole line, and the other Ring's pitch is not built. That is the sub-rule
       as written, chosen because building two rises there added Cheeks in 6 fixtures.
     - After WP-G4.3 the same reviewer re-reads the fix diff.
223. **WP-G4.3 landed at `1852281` and goes to a targeted re-review** (the lead, 2026-11-13). The delegate's
     record: 8,689 passed in 39 files, typecheck clean, drift test green, no golden changed, and the per-wall
     mutation fails the three H1 tests. The verdict is now taken once per line extent. All three of the
     reviewer's inputs build algorithm B's one gable over [0, 1000], apex at x = 500, 288.7 cm above the plate,
     clean, which is their roof before `b1cff3e`.
     - **Corrections to decision 221's figures, from the delegate**: its corpus comparison matched fixtures by
       name, and the 250 cm and 300 cm sweeps share names, so 4,700 of 5,278 were compared. Redone over all
       5,278: still 0 disagreements with the measurement and 0 unpredicted moves; **157 fixtures move, not 165;
       7 are cured, not 6; 13 are worse.**
     - **`SplitBandAllGable75` in full** (decision 222's M2): before, each side wing had a ridge across it at
       y = 500, 1,866 cm above the plate. Now the outer gable ends are flat-topped at 1,119.6 cm from y = 300 to
       700, each courtyard wall carries a 600 cm gable with its apex at 1,119.6 cm, and the two slopes meet in a
       valley down each wing at 560 cm. The courtyard gables on y = 200 and y = 800 show over [150, 850]. The
       delegate judges it consistent with the rule. **The user's call.**
     - **A departure the lead has not accepted**: decision 222 ruled that `buildsARise` falls back only on a
       `PlanRefusal`. The delegate built "reads no rise from a storey whose walls cannot be derived, whatever the
       error". The reviewer is asked which is safer for the port's replay set.
     - The M1 tie-break and the L2 tolerance are not convicted by a fixture. The reviewer is asked whether they
       matter.
224. **WP-G4.2 and WP-G4.3 are accepted at `1852281`, with WP-G4.4 owed for one Medium** (the lead, 2026-11-13).
     The re-review closed H1 by running: the three inputs each build one clean gable over [0, 1000]. Four further
     attempts to break the per-extent verdict all built clean: three walls with a buried middle band, bands that
     tile except for a buried hip stretch, a mixed wall and an all-gable wall on one extent in both orders, and
     two extents separated by a gap. Rulings:
     - **Medium, accepted: `buildsARise` is built as decision 222 ruled.** It falls back only on a `PlanRefusal`,
       and any other error propagates. The reviewer confirmed the catch-all is the less safe: a document that
       fails at one of decision 220's new throw sites would be marked as building no rise and could enter the
       C++ replay set. The test helper copied the same catch-all and could not see it.
     - **The wall a buried-middle rise stands on does not matter** (the reviewer, by reading and one built case):
       the limit walk starts at the band's middle, and the caps and far wall read only the wall's line.
     - **Noted, no action**: where three bands lie on a line and the middle one is wholly buried, the buried band
       is not built and the outer two become separate rises. That is decision 220's "counts only if part of it is
       on a union wall". Before `b1cff3e` it was one gable.
     - **Low, stands**: the off-lattice fixture does not guard the 1e-9 tolerance; the unit cases do. A run end
       within 1e-9 of another Ring's corner could split a band on a sliver. Suspected, not built; editor values
       sit on the 50 cm lattice.
     - The lead reads WP-G4.4's diff; no further review.
225. **WP-G4.4 is accepted at `887b1f7`, and the claimed-band rule is complete for this version** (the lead,
     2026-11-13). The lead read the diff: `buildsARise` falls back to the per-extent derivation on a `PlanRefusal`,
     reads a refusal from that as no rise, and rethrows anything else; `forms` is injectable so a test reaches
     each branch. The delegate's record: 8,691 passed in 39 files, typecheck clean, no golden or manifest entry
     changed, and the propagate test fails under both mutations. **`claude-work-ec` was told on 2026-11-13** what
     the user found, the rule as built, the golden changes, and the case to check in the C++ roof stage.
226. **The viewer's selector is to list every fixture the repo holds, the original gable research included** (the
     user, 2026-11-13: "The original gable research had several examples that are not in this menu. Can they be
     added, as well as any other fixtures the web page doesn't show?"). The lead confirmed by opening the files:
     the selector lists `SHELL_FIXTURES`, `RISE_FIXTURES` and the manifest's defect cases only
     (`viewer/main.ts:344-371`). Not listed: `RING_CONFLICT_FIXTURES`, `PORT_FIXTURES`, goldens that are not
     defect cases, and the 53 research cases of `src/roof/cases.ts`, which are roof `Building`s from rects and
     `Sel`s and need converting to Rings with runs. **WP-V1 dispatched 2026-11-13** (general-purpose, Opus,
     fresh) at `35df7a7`. A research case that cannot be expressed as Rings and runs is listed with its reason and
     left out. Its hand-back includes what each converted case does through today's pipeline, as a finding.
227. **The lead's "unfit" for the one-path model overstated its case, and is restated** (the lead, 2026-11-13,
     after the user asked what is objectively wrong rather than different). Of what F77 measured under one path,
     **three things are defects by the project's own tests of a roof, and each belongs to the rise's present
     mechanics, not to the model**: 8 fixtures that build today throw; 10 clean fixtures gain a Cheek or an
     Unclassified Edge, traced on the two-Ring cases to the rise's prism stopping at the nearest far wall while
     its limit plane lies further; and a rectangle gabled on both long sides has its ridge sag from 499.9 to
     250.1 cm, because the limit is a gabled wall's skeleton plane, which is no part of the built roof.
     **Everything else is change, not error**, and the largest part of it, caps flattening 957 gable ends that
     stand above storeys over them, moves towards what the user has ruled for rises. The lead was wrong to count
     "changes plain gable-ended buildings" and "958 fixtures change" against it. One path is the lead's
     recommended next package, as three named problems: the limit against a gabled far wall (two candidates
     already measured clean on 36 rectangles), the prism's reach (no clean candidate yet), and the 8 throws
     (undiagnosed).
228. **WP-V1 landed at `07c99cd` and is provisionally accepted, pending a type review** (the lead, 2026-11-13). One
     commit, seven files, all under `src/viewer/`, `index.html` and `tests/viewer-*` (the lead checked
     `git show --stat`); the tree is clean. The delegate's record: 8,926 passed in 41 files, typecheck clean. The
     selector now offers 126 entries in nine groups with a text filter (F78). Rulings:
     - **The research conversion reads each case's resolved walls, not its `Sel`s.** Accepted: the resolved walls
       are what the `Sel`s mean, and a test holds every converted case to the same form and pitch at every stretch
       through the pipeline's own `unionWallForms`, convicted by mutation.
     - **Seven research cases are left out, shown disabled with their reason.** Accepted. 5a to 5e are monopitch,
       which a Ring cannot author; 4g has two hip pitches on one Ring side, which the pipeline refuses; 9b's
       subject is an authored corner cut and as Rings it is 9a.
     - **The generated robustness fixtures (about 5,300) and the pinned residue keys (about 200) are not listed.**
       The delegate's scope choice, since they are made by test code. **For the user**: the pinned keys are the
       defect cases a person would most want to see, and listing them means the page importing the generators
       from `tests/`.
     - A type review is dispatched. No correctness review: the conversion's exactness is the risk, and it is held
       by a test with a convicting mutation.
229. **The type review of WP-V1 is ruled on, and WP-V1.1 carries the fixes** (the lead, 2026-11-13). Two blocking
     items and five notes, none behavioural. **Accepted**: B1, the research footprint table keyed by a derived id
     union so a missing case is a compile error; B2, a named return type for `inputOf`; N1, one named sources
     object for `selectionFromHash`; N2, no two research fixtures share a rect array (they alias one today,
     because `ring()` stores the rect uncopied); N3 and N5. **N4**: a stale file-backed selection does no build.
     The lead reads the diff; no further review.
230. **WP-V1.1 is accepted at `4d6a993`, and the selector work is complete for this version** (the lead,
     2026-11-13). The lead read the behaviour-bearing parts of the diff (`main.ts`, `defect-cases.ts`): one named
     sources object for the hash, one reading of the manifest's shape, and a token check before the build of a
     file-backed selection, which is the only behaviour change. The delegate's record: 8,928 passed in 41 files,
     typecheck clean. Its rect-aliasing test was not run against the old code, so that test is unconvicted. The
     commit also touched `defect-cases.ts` and three existing viewer tests, as the review's findings required.
231. **A slope that is not in the finished building does not limit a gable** (the user, 2026-11-13, on the sagging
     ridge of F77: "an obvious misapplication of the rule. The limiting slope here isn't in the finished building:
     it's replaced by its own gable. It therefore shouldn't be used to clamp the opposite gable."). This amends
     gable rise decision 11 and overrules two things the lead had let stand: F70's "against a gabled opposite wall
     the walk gives that wall's skeleton plane ... the result is clean", which decision 204 accepted, and the
     open item that asked whether that phantom plane was wanted. **The lead's reading, to be built**: the limit
     walk passes over the skeleton face of any wall whose hip slope is not built because the wall is gabled along
     its whole length, and goes on to the next falling face. **Where the walk and the built-roof fallback then
     find no slope, the rise has no slope limit**; its caps still apply. That replaces the `PlanRefusal` of
     decision 206, which no fixture reached. A wall that carries a rise on part of its length still has its hip
     slope in the finished building, and still limits. It applies to rises as built today, not only to the
     one-path model, of whose three problems it is the first. WP-L1 builds it.
232. **WP-L1 stopped for a ruling, and the branch head is red** (the lead, 2026-11-13). The only commit is the WIP
     `9f9cb64`: 8,937 passed and 13 failed, the failures being golden drift and three `Court0` conflict pins that
     wait on the ruling; typecheck clean; no viewer test fails. The predicate of decision 231 is built
     (`slopeInBuilding` in `rise.ts`). The corpus sweep of 5,280 fixtures: 45 change limit, 14 change shape, 63
     rises have no limit, **0 clean fixtures become unclean and 0 new throws**, 5 already-unclean cases gain one
     conflict each.
     - **The stop, which is the user's to rule**: a rise with no slope limit runs through to the far wall. On
       `[0,0,1000,500]` at 45° with N gabled and a 75° rise on S over [300, 700], the rise's ridge at 746.4 cm
       rides above the main ridge (500) the whole depth of the building, and the N gable's apex becomes 746.4: a
       second, narrower gable standing on the first. It is clean: no Cheek, no conflict. Before decision 231 the
       rise was cut off at 500 by the plane the user has now ruled out.
     - **The lead's recommendation, not adopted**: where no slope limits a rise, cap it at the height of the main
       roof along its walk, so it dies level into the ridge it runs along. The sweep's probe measured such a cap
       clean in these cases (F70). The alternatives are to accept the run-through, or to refuse the input.
     - **Accepted from the delegate**: the built-roof fallback reads the built roof literally, so it can return a
       gabled wall's face where no piece covers it. That is the user's principle applied exactly: such a slope is
       in the finished building. Passing over those faces left `Court14` 18.7 cm proud.
     - **Noted, the same class as decision 231 and not yet ruled**: a wall gabled along its whole length that
       decision 220 turns into a rise enters the solve as a hip, so its slope still limits a rise facing it,
       though most of it lies under its own rise. About 68 rises in the corpus.
     - **One gate is not convicted**: skipping the slope of a wall that merely carries a rise fails only the
       predicate's unit test, because the fallback reads the uncovered face back.
233. **The run-through is accepted, and the lead is not to tame what the inputs justify** (the user, 2026-11-13).
     On decision 232's question the user chose "Accept the run-through", having built the case: "what I saw
     looked exactly correct for the already slightly silly inputs I provided." And as a standing steer:
     "Fundamentally, this is a mad set of inputs. The result justifiably looks mad. Trying to tame it is presuming
     something the user hasn't specified. You're being an LLM, trying to regress back to some mean that will feel
     secure." **What this rules for the arc**: geometry that is clean and follows the rules as stated is correct,
     however odd it looks. A limit, cap or refusal is added only where the user specifies one or where the result
     is a defect by the project's tests (not closed, an Unclassified Edge, a Cheek, a part through another
     storey). The lead's recommendation in decision 232 to cap such a rise at the main roof is withdrawn. **The
     lead applies the same test to its own provisional defaults in decision 204**: the wall-top cap stays,
     because without it a rise breaks through the storey above (F68), which is a defect; the "tall rise on a hip
     end" item is no longer a question, since it is the same run-through and is accepted. WP-L1 is resumed to
     finish.
234. **A stretch goal: the editor gains a parameter that clamps the height of any roof section above its owning
     wall** (the user, 2026-11-13: "as a separate stretch goal ... I can't see this currently if it does
     exist"). It does not exist in the editor. The pipeline has `maxHeight` on a gable run only (gable rise
     decision 12), kept out of the editor by decision 210 because `input@1` has no field for it. **The lead's
     reading of the goal, to be confirmed in a proposal before it is built**: every side, hipped or gabled, whole
     or a stretch, may carry a maximum height above its plate, giving a flat top; the author sets it, and nothing
     sets it for them. It needs three things that are each a decision: the clamp on a hip slope and on a
     whole-wall gable, which the pipeline cannot do today; a wire field, which the C++ side must mirror; and its
     meeting with the C++ roof stage's existing flat clamp (F63). Not started. It follows WP-L1.
235. **Not every Cheek is a defect; the only true defects are those that create mathematically dangerous
     parameters** (the user, 2026-11-13, correcting decision 233's list: "not all Cheeks are inherently defects.
     Sometimes even they make sense, in the context of a roof solver that should return a best-effort, and not
     aesthetic judgement."). The user wants to talk this through; **nothing is re-ruled yet**. The lead notes what
     it bears on, so the talk has the facts:
     - `Cheek` is already a first-class face kind in the spec and in the C++ `EBuildingShellKind` (F63). The
       rule "zero Cheeks" was added by this session's sweeps as part of "clean" (F65) and by gable rise
       decision 20. It was the lead's and the delegates' strictness, not the user's.
     - **Decisions that rest on "a Cheek is a defect"**: the two-pitch sub-rule of decision 220, kept only to
       avoid 6 new Cheeks, at the cost of not building one Ring's pitch (decision 222); the "10 clean fixtures
       become unclean" counted against one path (decision 227), most of them Cheeks; the unresolved "prism
       reach" problem, which is a Cheek problem; and the 15 pinned Cheek-class cases (F74).
     - **To settle in the talk**: which properties are the dangerous ones, and which Cheeks, if any, signal one.
236. **WP-L1 landed green at `9646bba` and is provisionally accepted, pending a correctness review** (the lead,
     2026-11-13). It is `9f9cb64` and `9646bba`; four source and test files (`fixture.ts`, `rise.ts`,
     `residue-pins.ts`, `rise.test.ts`), all in the roster, plus the golden re-export (the lead checked
     `git diff --stat`); the tree is clean. The delegate's record: 8,983 passed in 41 files, typecheck clean,
     drift test green, three mutation gates convicted, the third by a new fixture `RiseBeforeTStemBarRisen`.
     - **Goldens**: `SplitBandAllGable75`'s hole-wall rises lose the outer walls' skeleton planes as limits and
       run on under those walls' gables; every Gable apex is unchanged (1,119.6 and 1,866.0). `Court5Seed1h300`
       changes in its raw-part bytes only; its shell file is byte-identical. Four rise fixtures are added,
       among them `RiseRunsToFarGable`, the user's accepted run-through, asserting 746.4 cm at the far wall.
     - **Pins**: `s9/Court0` at three heights gains one F69 conflict each and is re-pinned. **`s1h250/U3` and
       `s5h250/Court34` each gained a conflict that no table pins**, so those counts move unseen. Left as it is
       while the user and the lead settle what a defect is (decision 235); the reviewer is asked how far that
       gap reaches.
     - **Still unruled**: about 68 rises are limited by a wall gabled along its whole length that decision 220
       turned into a rise.
     - The rise reviewer is resumed on `73af1e5..9646bba`, briefed to report Cheeks and conflicts as facts, not
       verdicts.
237. **A Cheek is a UI and UX matter, not a rule to be made in the abstract** (the user, 2026-11-13). The user
     cannot rule on Cheeks from a rule-making position and needs to see them. Their framing:
     - A Cheek is likely an anomaly, and so **may not** be intended by the author. The user stresses that this
       is an assumption and is not binding. (CORRECTED by the user the same day: the first wording, "may be
       intentional", had lost its "not". The lead had recorded it as "may be intended".)
     - **The goal is not that Cheeks never appear.** It is that a person can easily understand which features
       lead to one (the user's examples: heterogeneous pitches, conflicting gables) and choose how to remove it.
     - An acceptable Cheek is no issue. An unacceptable one should be removable by a **minimal** change to the
       design that leaves the rest of the author's intent unchanged.
     - **Ruled on one case**: the Cheek of `Court14Seed7h250` is not a defect. "It would be sitting above a
       structural wall in a real building, and would be the logical result of choosing a steep gable on that part
       of the layout."
     - **Asked for now**: every Cheek-producing fixture findable by typing "cheek" in the selector's filter. Only
       one appears today, because the pinned cases are not listed. This answers the lead's question in decision
       228: list them. WP-V2 is dispatched to the selector's delegate, resumed.
     **What the lead takes from it**: "zero Cheeks" leaves the definition of clean (it was added by F65 and gable
     rise decision 20, not by the user). The Cheek pins stay as exact records of what is built, so a change still
     shows, but they are no longer called defects. Two things follow later and are not started: a viewer feature
     that says which sides, stretches and pitches produce a given Cheek; and a second look at what was traded
     away to avoid Cheeks, first of all the two-pitch sub-rule (decision 222).
238. **WP-L1 is accepted at `9646bba`** (the lead, 2026-11-13). The review of `73af1e5..9646bba` found no High and
     no Medium, and every rule of decisions 231 and 233 built as written: the predicate skips both walls of
     `SingleStoreyT` and of a kept two-pitch extent, keeps cut walls and walls that carry a rise; a rise with no
     limit stops at a courtyard hole and does not cross it; under a tower it breaks through nothing; the fallback
     returns a skipped face only where no piece covers it. Its Lows, none needing a change:
     - **After a skip the walk can take a slope in another wing.** On a T whose bar is gabled along its N side,
       a rise on the bar's S side is limited by the stem's far end slope, 1,000 cm away. That is "the next falling
       face" as ruled, and it is clean. Recorded, not tamed (decision 233).
     - **Conflict counts are asserted only for fixtures in the conflict tables, the rise fixtures and the
       goldens.** Every other sweep fixture's conflicts can move unseen, defect-pinned ones included. This
       predates WP-L1. It is an open item, to be settled with what a defect is (decisions 235, 237).
     - **The measurement probes `experiments/gable-rises/claimed-band-cases.ts` and `claimed-band-sweep.ts` now
       throw on a rise with no limit**, since they index the limit plane. They are outside the typecheck. An open
       item: the record should still run.
239. **WP-V2 landed at `a2c36b7` and is provisionally accepted, pending a type review** (the lead, 2026-11-13). One
     commit, eight files, all under `src/viewer/` and `tests/viewer-*` (the lead checked `git show --stat`); the
     tree is clean. The delegate's record: 9,588 passed in 43 files, typecheck clean. The selector holds 326
     entries; the 196 pinned cases are listed by the class their pin names; every entry's label carries what it
     builds as words, from a table a test regenerates and holds (F79). Rulings:
     - **The viewer imports the tests' own pin tables and generators**, so no test file changed and the list
       cannot drift from the suite. Accepted. The bundle grows from 954.8 to 1,037.6 kB, and load time is
       unchanged within noise (about 345 ms warm), because a pinned fixture is drawn only when selected.
     - **Still not listed, accepted for now**: 13 clean goldens with no input file, and six defect cases with no
       input file, four of which are reachable as pinned cases.
240. **The type review of WP-V2 is ruled on, and WP-V2.1 carries the fixes** (the lead, 2026-11-13). Two blocking
     items and three notes accepted, none behavioural: the facts table keyed by a generated tuple of catalogue
     values, so a stale row is a compile error; `PinnedCase` as a discriminated union with no cast; the seeded
     generators keyed by their family union; a test that ties the viewer's list of pin tables to the exports of
     `tests/residue-pins.ts`, which is the drift "one source of truth" is meant to prevent; and the fact tags
     derived from one spec. `Selection` was found sound. The lead reads the diff.
241. **The T layout of decision 238 is correct, and a second stretch goal: direct manipulation, starting with
     inserting a slice along a Ring** (the user, 2026-11-13, having built the T: "nothing here is illogical. The
     output is correct for inputs which no self-respecting architect would ask for."). The user notes the editor
     is "still primitively field based". **Stretch goal, explicitly not for today**: a UI that lets the author do
     things such as insert a slice along a Ring, as "a quick way to place extra geometry if the user wants to
     provide a limit where a rogue gable needs to terminate". **The lead's reading, to be confirmed when it is
     taken up**: an edit that cuts a Ring across at a chosen position, giving the author a new Ring (or a new
     band of one) whose roof can stop a gable, done by pointing in the viewport and not by typing coordinates.
     It joins decision 234's height clamp as a stretch goal. Both follow the same idea as decision 237: the
     author removes an unwanted feature by a small, deliberate change, and the solver does not presume one.
242. **WP-V2.1 is accepted at `958f587`, and the selector work is complete for this version** (the lead,
     2026-11-13). The lead read `pinned-cases.ts`'s diff: discriminated unions for a pinned case and its pins, the
     table names split into residue and conflict tuples in the same order as before, a guard on the seeded
     family, and no change to which cases are listed or how they are built. The facts table's 180 rows were
     regenerated byte-identical. **The lead ran the suite on this tree**: 9,591 passed in 43 files, none failed,
     in 306 s; typecheck clean.
243. **Two logical defects found by the user in opposite gables on a T, and the lead's reading of the rules that
     remove them** (the user, 2026-11-13, with three drafts; F80): "4 and 5 are incorrect because they apply a rule
     inconsistently, due to more complex surrounding geometry. This isn't an aesthetic defect: it's a logical one."
     - **The user's verdicts.** Opposite gable stretches on a crossbar at 65°: correct. The same at 75°:
       incorrect, because "the roof slopes of the hipped sections clamp the gable ridge, even though the gables
       sit opposite each other (the ridge should continue cleanly from one gable to the other)". A north gable
       under the abutting stem: incorrect, because it "gets swallowed by the ring that abuts it, preventing it
       from matching the gable on the south side".
     - **This rules the question the lead had left open three times** (decisions 232, 236, 238): a wall that
       carries a rise does not limit a rise facing it where its slope is replaced by that rise.
     - **The lead's reading, as three rules, to be built and measured (WP-L2)**:
       1. **A hip slope limits a rise only where it is in the finished building on the rise's walk.** Where the
          wall's own gable, whole or a stretch, stands over the walk line, the slope is replaced and does not
          limit. This extends decision 231 from whole-wall gables to stretches.
       2. **A rise that meets such a gabled wall runs to that wall and ends there**, joining the gable on it. It
          does not go on to whatever slope lies beyond. This is what `RiseRunsToFarGable` already does at a
          footprint's far wall (decision 233), applied where the gabled wall has a neighbouring Ring behind it.
          It replaces "goes on to the next falling face" for this case, and so changes the limit the reviewer
          found on the gabled-bar T (decision 238), which had no visible effect.
       3. **A gable stretch is built even where a neighbouring Ring covers all of it at plate level.** The union
          shows whatever stands above the neighbour's roof. This strikes "it counts only if part of it is on a
          union wall" from decision 220.
     - Gable rise decisions 5 and 11 are amended. The rules are the lead's wording of the user's verdicts, and
       the user has not seen them as rules.
244. **WP-L2 stopped at the red WIP `8b8bc3c`, and the lead rules that rule 3 stays general** (the lead,
     2026-11-13). 144 failed and 8,825 passed. Rules 1 and 2 are built and the user's cases pass their closed
     forms: the 75° ridge holds 466.5 cm from one gable to the other, and in the covered case both gables are
     built with matching apexes. The stop is rule 3: a gable built on a line that holds no union wall makes 12
     corpus entries throw that build today, most with `a Gable Cell … lies on no Ring side`, because
     `provenance.ts` looks for a union wall on the line.
     - **The delegate's two options were to extend provenance or to limit rule 3 to lines that hold a union
       wall.** The lead takes the first. The second would build or drop a gable according to what else lies on
       its line, which is the inconsistency the user called a logical defect (decision 243). `provenance.ts`
       joins the roster so a covered gable's Cells name the Ring side that claims them (gable rise decision 14),
       with the source's shape unchanged for the C++ side.
     - **Residual throws of the existing Cell-laying class are pinned, not worked round.** One reduced case, from
       `s13/Court21`, throws `two Cells run the same way along one NetEdge`. That class is a known pipeline defect
       (F64, F74), and rule 3 only reaches it. Any other new error, or anything else new in the dangerous class,
       stops the work again.
     - **What the sweep already shows under the full rules** (F81): 477 gable stretches in the corpus are wholly
       covered today and so not built; 9 entries are cured of throws or Unclassified Edges; Unclassified Edges
       fall from 153 to 132.
245. **WP-L2's second stop is ruled: `s1/Court29` is pinned, and rule 3 is not narrowed** (the lead, 2026-11-13).
     After the provenance fix (`a38eeaf`, still red: 61 failed, 8,917 passed) the only new throw is `s13/Court21`
     at two heights, the Cell-laying class decision 244 already ruled on. The stop is `s1/Court29` at 250 and
     300 cm, which gains a surviving Internal face and 3 Unclassified Edges: a covered rise on y = 150 lies on the
     same line as the courtyard's cut, and the result carries the cut-piece overshoot signature. **That signature
     is an existing pinned class of 36 cases, belonging to the courtyard cut** (session 1 §5, decision 172). The
     lead pins both `Court29` cases exactly, with their smallest input kept as a reproducer, because narrowing
     rule 3 to avoid them would be the inconsistency of decision 243 again. **The balance, to be re-measured at
     the finish and stated plainly to the user**: two fixtures gain an Internal face and Unclassified Edges, two
     newly throw, and nine are cured of the same classes; over the sweep Unclassified Edges fall from 153 to 138
     and throws go from 32 to 33. The courtyard cut and Cell laying are where those defects live, and both are
     open items.
     - Provenance: a Gable Cell on a covered rise's line names the lowest-index Ring side lying there, with the
       source's shape unchanged. A covered rise's tags carry wall -1, the existing "no wall" value of Roof,
       Internal and Ground faces. Accepted as traced.
     - `GableOnSharedWall` is a roster fixture: a gable on the wall two Rings share.
246. **WP-L2 landed at `81930ae` with the pipeline done and 7 viewer tests red, which go to WP-V3** (the lead,
     2026-11-13). It is `8b8bc3c`, `a38eeaf` and `81930ae`; twelve source and test files, all in the roster as
     widened by decision 244 (the lead checked `git diff --stat`); the tree is clean. **The suite is red on 7
     viewer tests** that hard-code pins and goldens the rulings moved; the delegate rightly did not edit them.
     It did not re-run the full suite after its last fix, so the figure is its expectation, not a measurement.
     - **Pins**: `s8/Court4` promoted at three heights. `s1/Court29` pinned under the cut-overshoot class and
       `s13/Court21` as a throw, each with a named reproducer (`COVERED_RISE_ON_CUT_LINE`,
       `COVERED_RISE_CELL_CLASH`). Six cases cured of a throw or Unclassified Edges and re-pinned on conflicts
       alone. Two residue classes are now empty: the `Court25` throw class and the `SplitCourt9` class.
     - **The sweep, 5,752 entries, before and after**: throws 32 to 33; Unclassified Edges 153 to 138; surviving
       Internal faces 37 to 34; Cheeks 24 to 22; conflicts 2,564 to 2,597.
     - **Goldens**: `RiseFacingRiseWall`'s gable apexes go from 750 and 423 to 996.4, the 75° rise running through
       the opposite rise to the far wall. `Court14Seed7h250`, `Court16Seed1h250`, `SplitBandAllGable75` and
       `Court5Seed1h300` change in raw parts only. Five fixtures are added. `SplitCourt9Seed7h250` and
       `Court25Seed1h263` are removed, as cured representatives.
     - **A cost the lead had not foreseen**: `Court14Seed7h250` and `U8Seed6h300` now build a covered rise that
       shows no face, are therefore marked not C++-replayable, and ship no input file, so the viewer could not
       load them as defect cases. `Court14Seed7h250` is the user's reference Cheek. WP-V3 makes a defect case
       load from its generator where the repo can build it. **Open**: whether a rise that shows no face should
       cost a document its replayability; the reviewer is asked.
     - **Accepted departure**: `OppositeGablesTPartFacing` is left out of the golden set, its Cheek pinned in
       `rise.test.ts`, because the golden writer takes a violation only as a residue.
     - **Dispatched**: WP-V3 (general-purpose, Opus, fresh) for the viewer tests and the unloadable defect cases;
       and the rise reviewer, resumed, on `fd84720..81930ae`, asked above all whether any rule is applied
       inconsistently because of surrounding geometry.

## Findings

All six were reported by read-only onboarding delegates on 2026-11-12 at `6b4c80b`. The lead confirmed F58's
assertion and F59's comment by opening the files, and has **not** re-run the measurements in F57, F59 and F60.
Their probes are in the session scratch directory under `midgable/`, which is session-local.

- **F57. Roof form is authored per Ring side and decided per union wall, and a contested wall is never refused.**
  A union wall is a maximal straight stretch of a union loop (`loopRuns`, `ring-forms.ts:41`). The lowest-index
  Ring whose side overlaps it gives the whole wall its form and pitch (`unionWallForms`, `ring-forms.ts:74`).
  Measured on a flush T, Ring 0 `[0,0,1000,500]` hip and Ring 1 `[400,0,600,900]` with S gabled, at 45°: the whole
  y = 0 wall is hip and the gable is dropped. With the indices swapped, the whole wall is one gable over
  [0, 1000], apex 750. The only refusal in this area is the wire's "side j's runs disagree"
  (`input-adapter.ts:274`). There is no `CutPitchConflict` error: that name is a clean golden fixture.
- **F58. `@proc-geo/core` refuses a weight change at a straight vertex, on purpose.**
  `assertWeightsChangeOnlyAtVisibleCorners` (`algorithm-termination-cases.ts:1443`) throws, and its own text says
  a dormer "is a feature stitched into the roof the skeleton produces". Gable walls are not zero-speed edges:
  core refuses non-positive weights, so a gable wall enters the skeleton at weight `1/tan` like any hip. The
  courtyard cut already bends to this rule (`courtyard.ts:70`).
- **F59. Algorithm B's partial-line gable is a slice of a whole-line gable, not a rise.** `algoB.ts:139` applies
  "the whole line's planes over the segment's own band". Measured with equal 45° pitches, a gable run [400, 600]
  on a 1000 cm wall rises from 660 to 750 at the wall and has 2 Cheeks. The roof-gable cases 2b, 4b and 8b are
  this shape and are three of its six CHEEK verdicts. No case in `cases.ts` is a mid-wall gable with its own apex.
- **F60. A synthetic gable piece on a fully hipped storey builds clean through the unchanged pipeline.** On a
  hipped `[0,0,1000,500]`, one extra `Piece` (wall y = 0, the band, far 500, planes = two rakes plus the far hip
  plane) went through `gablePiece`, the union and step 4. Band [400, 600] at 45° on 45°, and band [330, 610] at
  45° on a 30° wall, were both closed, genus 0, with 0 Cheeks, 0 conflicts, 0 Unclassified Edges and 0 surviving
  Internal faces. The first gave `Valley` 2, `Verge` 2, `WallPlate` 1, one Gable face above the single Wall face,
  a ridge at 350 that dies into the main slope near y = 100, and 6 Gable Cells sourced to Ring 0 side S. Only a
  convex rectangle was measured.
- **F61. A rake that coincides with an existing roof plane must share its plane id.** Band [800, 1000] at 45° gave
  1 conflict and 1 `RoofSeam`, because the rake from x = 1000 duplicated the x = 1000 hip plane under a new id.
  Roof identity is `Roof|storey|p<planeId>` (`tags.ts:176`).
- **F62. The viewer is plain three.js and DOM with no editing, no import and no export, and the in-memory build
  path validates nothing.** `buildShellDetailed(fixture)` is synchronous after the WASM loads and runs on the main
  thread. No build time is recorded anywhere in the repo. `readInput`, `writeInput` and `refineInput` are
  browser-safe, and the wire refuses what the in-memory path does not check: pitch outside 7° to 75°, non-grid
  corners, non-positive area. `scene.setBuild` re-frames the camera on every load, and `Selection` has no kind for
  an edited building. The viewer tests are Node tests of pure modules; `main.ts` and `scene.ts` are untested.
- **F63. The C++ side ships the whole-wall tie-break, has no per-stretch form request, and has flat roof faces
  downstream of the shell but no flat kind in it** (reported by `claude-work-ec` on 2026-11-12 from its own reading
  of the C++ project; not seen by this session).
  - The gizmo has one roof-form handle per wall of a Ring (Auto, Hip, Gable). A per-stretch request is neither
    built nor planned. A "brush to paint hips/gables" is an unscheduled, undesigned nice-to-have.
  - The completed C++ "one form per wall" spec gives a wall group the form of its lowest Ring's lowest run
    (MB.D525). **Form per extent therefore supersedes shipped C++ behaviour and its tests, not only the adapter's
    refusal.**
  - The player's massing unit is a "block": one rectangular Ring with a height in storeys, and a second Ring only
    for a different footprint. A mixed wall is reached through flush Rings, which confirms decision 191.
  - `EBuildingShellKind` is Wall, Gable, Roof, Underside, Ground, Cheek, Internal. A flat top could only be a
    Roof face on a horizontal plane. The roof stage after the shell does have flat faces (a clamp at pitch 0,
    `EModularRoofForm::Flat`). Whether the shell-to-net adapter maps a horizontal shell Roof face onto that, or
    refuses it, is unread on the C++ side.
  - Its first unit is a shell preview that draws `FBuildingShell` faces as a greybox while massing.
- **F64. Build times, link lengths and the wire round trip, as measured by the WP-E1 delegate at `c00b8cf`** (in
  Chrome through Playwright, main thread; not re-run by the lead).
  - **Build time.** The 12 roster fixtures take 24 to 79 ms. A flush row of ten one-storey Rings takes 157 ms,
    growing roughly linearly from 14 ms at one Ring. Ten two-storey Rings with five gabled sides take 244 ms. Ten
    random overlapping Rings take 116 to 215 ms.
  - **Two of eight random ten-Ring seeds were refused by the pipeline**: a corner pinch, and a Cell/ShellEdge
    mismatch. The second is a pipeline hard error reached by ordinary editing, and is unexamined.
  - **Link length.** About 1,000 hash characters per Ring: 3,271 for three Rings and 9,707 for ten. Deflate before
    base64url gave 1,022 for the same ten Rings, at the cost of an async hash parse.
  - **`readInput(writeInput(f))` does not return `f`.** Every side comes back listed with an explicit pitch,
    `defaultDeg` is re-derived from the first hip, and `request` is ignored, so a listed hip at the default pitch
    cannot be told from an unlisted side. The round trip preserves what the pipeline builds, not the fixture's
    spelling.
  - **Only Wall and Gable faces carry a Ring identity.** Click-to-select works on those and on nothing else.

F65 to F69 are the WP-G1 delegate's measurements at `e45304b`, detailed in
[the gable rise findings](./building-shell-gable-rise-findings.md). The lead has not re-run them. "Clean" there means
the suite's invariant check with zero Cheeks and zero conflicts, the height oracle within 0.05 cm, and the rise never
above a storey over it.

- **F65. A gable rise builds clean through the unchanged pipeline in every class but three.** 232 builds, 215
  clean. Clean: the convex rectangle at 5 pitch pairs and 4 bands; convex corners; L, T and U footprints, over a
  reflex corner, into a wing and ending at a reflex corner (54 builds); two rises on a wall, adjacent walls and
  crossing ridges (29); courtyard outer and hole walls and the walls the cut is spliced through (21); tall and
  self-truncated rises; pitches from 7° to 75° (21); `maxHeight` flat tops (8); and flush Rings under form per
  extent (15 of 16). The height oracle agreed within 0.001 cm, and was itself convicted by mutation. Cell
  provenance on the rise's Gable named the winning Ring and side everywhere.
  - **Plane canonicalisation (gable rise decision 9) is necessary and sufficient, and not only at corners.** It
    fired 8 times on rakes away from any corner.
  - **The corner rule (decision 10) is sufficient**, and a rise widened to the whole wall then gives the same
    shell as today's whole-wall gable. At equal pitch decision 9 alone gives that shell, so decision 10's gate
    needs unequal pitches.
  - **A flat top is a `Roof` face on its own horizontal plane.** Its edges are Ridge, Valley, Verge, and
    RingJunction against a wall. Its Cells are Roof Cells with a null source. Nothing is Unclassified and no new
    kind appears. This answers the question F63 left open on the TypeScript side.
  - **Adjacent rises of unequal pitch meet at a point on the plate**, with the hip slope between them, not in a
    valley.
- **F66. The far-wall limit fails where the far wall is not a hip, and is not the slope a person would name off a
  rectangle.**
  - Where algorithm B's far wall is the courtyard cut, the limit adds no plane: 4 of 6 builds have 1 Cheek. The
    smallest: the roster `Courtyard` at 30°, Ring 0 side S with a 45° gable run from 100 to 300.
  - Where the far wall is a whole-wall gable, nothing limits the rise: its apex reaches 996 against the gable's
    750, and it stands 746 cm above the plate at the far wall.
  - In front of a continuing wing (a T stem, an L junction) the far wall is the wing's far end, so a 75° rise runs
    900 cm back where the slope beyond the ridge would stop it at 200. Both are clean.
  - A probe-only limit using the slope beyond the main ridge was clean in all 7 builds tried and cures the Cheek.
- **F67. A rise that reaches an overhanging storey's floor changes the genus from 0 to 1**, with the cap on or off
  (5 of 7 builds). The rise fuses with the floor and closes a real tunnel between itself, the tower holding the
  overhang up, and the floor. Smallest: `[0,0,1000,500]` on storey 0 at 30° with S gabled from 400 to 600 at 75°;
  a tower `[800,0,1000,500]` on storeys 0 and 1; `[300,0,1000,500]` on storey 2.
- **F68. A rise under the storey directly above is clean only while it stays under that storey's top.** It breaks
  through by 9.4 cm at 60° and by 122.6 cm at 75°. Smallest: `[0,0,1000,500]` at 45° with S gabled from 350 to
  650 at 60°, under `[300,100,700,400]` on storey 1. Capping at that storey's floor instead (the other reading of
  decision 195) leaves the piece empty, and `gablePiece` throws.
- **F69. The re-tag pass reports a Wall-over-Gable conflict only when a triangle's centroid lands in the overlap.**
  `StoreyRingConflictSwapped` with a rise reports 1 conflict where today's build reports 2, and the same overlap
  elsewhere reports none. The Wall winning is correct. This is a property of today's pipeline, not of rises, and
  it means conflict counts are not a stable measure across re-triangulation.

F70 to F72 are the same delegate's WP-G1.1 measurements at `3a8c469`. The lead has not re-run them.

- **F70. Under `ridgeSlope` the sweep is clean everywhere except where the rise's centreline runs along a courtyard
  cut.** 232 builds re-run: 217 clean. The limit plane differs from the far wall's in 22 builds, and the shell
  differs in 13.
  - **Cured**: the rise facing the cut (4 Cheeks under the far-wall limit, none now). In front of a T stem the
    rise now stops at the bar's ridge.
  - **New, 1 Cheek each in 3 builds**: a rise on the courtyard's outer wall whose band lies across the end of the
    zero-width cut. The hip roof is at plate height along the cut, so the walk meets only level faces and finds no
    limit. Smallest: the roster `Courtyard` at 30°, Ring 0 W gabled from 0 to 100 at 45° and Ring 2 W gabled from
    300 to 400 at 45°. Reading the limit from the built roof instead is clean there.
  - **Strained cases, 157 builds**: clean near a corner, into a reflex corner, at a pyramid apex, on a wide band,
    for opposite rises, on courtyard hole walls and with an off-centre ridge. Against a gabled opposite wall the
    walk gives that wall's skeleton plane, which is not a visible roof face, and the result is clean. Splitting a
    wide band by the faces behind it gives 2 Cheeks, so the centreline's one plane serves the whole band.
  - **On a hip end or a wing end the centreline runs along the main ridge**, and the limit is the far end's hip
    plane. A 75° rise then stands 123 cm above the main ridge for 750 of 1000 cm. Clean.
  - **No single alternative covers every case**: reading the built roof gives nothing against a gabled far wall,
    and a flat cap at ridge height throws along the cut.
- **F71. A rise fused to an overhanging floor produces an `Unclassified` Gable–Underside Edge; a gap does not.**
  Fused, 6 builds: genus 1, Roof–Underside Edges classify as `SoffitJunction`, and where the overhang projects past
  the wall 1 Gable–Underside Edge is `Unclassified`. This is the pair session 1 §5 predicted. With a 1 cm or 5 cm
  gap, 12 builds: genus 0, clean, a `Roof` flat top under the `Underside`, no face under 10 cm².
- **F72. A horizontal cap at the wall top of the storey directly above cures the breakthroughs of F68.** Under a
  set-back storey at 60° and 75° (9.4 cm and 149.7 cm uncapped) the capped rise is clean. Under a flush upper wall
  the cap buries the rise wholly inside the upper storey, leaving only F69's conflict.
- **F73. Form per extent reaches far beyond the Ring-conflict fixtures, and cures most of the pinned defects**
  (the WP-G2 delegate at `7464c40`, a red WIP commit; not re-run by the lead, and the promotions are not yet made).
  - **37 golden files change**, each on a mixed wall that gains a rise. Besides the Ring-conflict family they are
    eight random courtyard fixtures (`Court5`, `Court14`, `Court16`, `Court23`, `Court25`, `Court35`,
    `SplitCourt9`, `SplitCourt10`) and the rule oracle `SB400-600B100S500g60r0`. Unchanged, as predicted:
    `OverlapSwapped`, `Pitch`, `Storey`, `Hole` and `CutPitch` in both orders.
  - **38 pinned robustness cases move, and 37 become clean**: the Cheeks, Internal faces, Unclassified triples and
    throws of Court 0, 2, 7, 14, 15, 18, 22, 23, 25, 27 and 35 and SplitCourt 10, 29 and 30. The one that still
    fails, `s1h263/Court25`, throws the same Cell/NetEdge error at another index. **The Cheek class and most of
    F51's residues were artefacts of spreading one Ring's gable along a whole shared wall.**
  - **Every robustness sweep now exercises rises**, because random layouts routinely put a gabled side on a shared
    wall.
  - The exact limit walk agreed with the sampled probe on every case checked through production code.
  - **CORRECTED by F74**: "37 become clean" and "37 golden files change" were the delegate's first counts on the
    red commit. The full check gives 6 promoted, and 15 changed golden fixtures.
- **F74. On the full check, form per extent promotes 6 pinned cases and leaves 30 re-pinned; it removes their
  structural defects but not their conflicts** (the WP-G2 delegate at `1d6c137`; not re-run by the lead).
  - **36 pinned cases moved.** All 36 pass the invariants, the height oracle (worst miss 0.0019 cm) and the
    breakthrough check.
  - **6 are promoted**: `s4/Court7` and `s6/Court23` at 250, 263 and 300 cm.
  - **29 are re-pinned on F69 conflicts alone**: a Wall or Gable of the storey above reported over the Gable
    below. Most carried conflicts before, up to 19, that were never pinned. **Two gained conflicts**:
    `s10h250/Court15` (0 to 1) and `s11h263/Court35` (0 to 2).
  - **1 still throws**: `s1h263/Court25`, now at cell 826 / ShellEdge 73.
  - **33 courtyard pins, 2 U8 pins and 1 SplitCourt9 pin remain.** Two residue classes are emptied:
    `cleanMesh stuck cap` and `Cell outside its face fan`. The Cheek class keeps 15 members, and they are algorithm
    B's own partial-line Cheeks, which build no rise.
  - **Goldens**: 15 fixtures change, all on a mixed wall that gains a rise. 15 are added (the 13 rise fixtures,
    `Court14Seed7h250`, the re-authored `SB400-600B100S500g60r024`). 3 are removed whole and 3 lose their inputs.
    **16 inputs are no longer C++-replayable.**
  - **File order no longer moves `FlushRingConflict` or `DistantRingConflict`**, because each Ring wins its own
    stretch.
  - **`maxHeight` and `limit` do not survive `input@1`.**
- **F75. A wall that is gabled along its whole length, but whose line runs on through the building, is built by
  algorithm B as a slice of a gable spanning the whole line** (the lead, 2026-11-13, measured at `70c8118` on two
  drafts the user made in the editor; probe in the session scratch directory under `wing/`).
  - **Without the wing**: Rings `[0,0,600,600]` (S hip) and `[600,0,1200,800]` (S gable) at 22.5°. The y = 0 union
    wall is [0, 1200], mixed, so it is a hip with a rise over [600, 1200]. The rise's planes are the x = 600 wall's
    plane, the x = 1200 wall's hip plane (the corner rule) and the y = 800 limit: a symmetric gable, apex at
    x = 900. The user calls this correct.
  - **With a south wing** `[0,-400,600,0]`: the stretch [0, 600] of y = 0 is now inside the building, so the union
    wall is [600, 1200] alone and is gable along its whole length. Gable rise decision 5 sends it to algorithm B
    unchanged, whose piece is labelled `line y=0 whole [0,1200]`: band [0, 1200], rakes from the x = 0 and
    x = 1200 walls, far plane y = 600. The gable is half of a 1200-wide one, climbing to x = 600 and reaching over
    Ring 0's hipped area.
  - This is F59's shape and session 1's CHEEK cases 2d, 3c and 4l ("lines that run on through the footprint"),
    reached now through decision 5's routing. **The same stretch is built two ways depending on whether a
    neighbour makes it a whole wall.**
- **F76. Algorithm B's gable piece is wider than its wall on 933 of 6,296 all-gable union walls, and always for one
  reason: an inside corner at an end of the wall** (the WP-G4 delegate at `da3053a`, measurement only, over 5,562
  cases and 9,911 storeys; scratch files under `wpg4/`; not re-run by the lead). Its copy of `extentOf` matched
  algorithm B's band on all 6,296.
  - **What lies on the line beyond the corner** sorts the 933: the winning Ring's own gable side, buried under
    another Ring (421, including `SingleStoreyT`, U8, Court5); another Ring's buried gable side (49); no Ring side
    at all, the line crossing another Ring's interior (220); a mix of those (106); **another Ring's hip side, which
    is F75, 0 in the corpus** and present only in the user's draft.
  - Every courtyard hole corner is an inside corner, so hole walls are over-represented.
  - A line cannot leave the footprint and re-enter: `extentOf` stops at the first stretch whose inward side is
    outside (`algoB.ts:41-50`). No all-gable wall has a segment piece.
  - **Pinned cases among the 933: 29**, of which 3 are Cheek pins (`Court9` at seed 13), 6 cut-overshoot, 16
    conflict re-pins, and one each or two of the Court25, U8 and SplitCourt9 classes.
  - 7 golden fixtures are among them.
- **F77. Band-by-claim fixes F75 and keeps `SingleStoreyT` under either rule; the narrow rule harms nothing clean,
  and the one-path rule throws** (the WP-G4.1 delegate at `7f057f4`, measurement only, 5,276 distinct fixtures,
  none sampled; detail in [the gable rise findings](./building-shell-gable-rise-findings.md), section "WP-G4.1";
  not re-run by the lead). F76's headline reproduced. One of F76's sub-counts did not: "own buried gable side" is
  557 by F76's own classifier, not 421.
  - **The user's with-wing draft**: today's apex is at x = 600, 248.5 cm; both rules give x = 900, 124.3 cm, clean.
    `SingleStoreyT` keeps its shell under both, apex y = 250 at 250 cm. No `RISE_FIXTURES` and no mixed wall in
    the corpus changes.
  - **Rule A (narrow)**: 163 fixtures and 218 storeys change shape, in the class whose line crosses another Ring's
    interior. **No fixture clean today becomes unclean, and nothing new throws.** 17 fixtures that are unclean
    today get worse: 6 gain a Cheek, 9 gain F69 conflicts, and `s10h263/Court18` gains 2 Unclassified Edges. Two
    goldens change: `SplitBandAllGable75` and `Court16Seed1h250`. Of F76's 29 pins: 25 the same, 2 changed, 2
    worse, none cured. `s5/Court34` is cured at three heights, conflicts remaining.
  - **Rule A's sub-rule**: keeping a two-pitch all-gable wall as algorithm B's one gable removes every new Cheek
    (164 fixtures change, 13 worse: 11 on conflicts, 2 on `Court18`).
  - **Rule B (one path)**: 958 fixtures and 1,334 storeys change. 10 clean fixtures become unclean, 8 that build
    today throw, 38 unclean ones get worse. **Its main difference from today is the caps, not the back limit**:
    of 4,196 storeys where algorithm B's piece already is the band, 1,061 change, 957 because a wall-top or
    floor cap flattens a gable end. So today's whole-wall gables stand above storeys over them in those cases.
  - **A rectangle gabled on both long sides has its ridge clipped under Rule B**: on 1000 × 500 at 45° the middle
    drops from 499.9 to 250.1 cm. Gabled on both short ends, it is unchanged.
  - **Unreconciled in the report**: Rule A's "31 of 173 changed fixtures clean" against 163 changed fixtures, and
    Rule B's "2,033 of 3,543" against 958. The denominators are not explained.
- **F78. 46 of the 53 roof-gable research cases convert exactly to Rings with runs, and all 46 build through
  today's pipeline with no Cheek, no Unclassified Edge, no conflict and no surviving Internal face** (the WP-V1
  delegate at `07c99cd`; not re-run by the lead; the full table is in the session scratch directory as
  `research-table.md`, which is session-local).
  - **Five build a rise: 2b, 2d, 3c, 4b and 8b.** Those are five of the research's six CHEEK verdicts (session 1's
    inventory, F59). The sixth, 4l, builds no rise and is also clean here.
  - **These are two different measures**, so this is not yet "the Cheek class is cured". The research's CHEEK is an
    unforced height step in the roof surface, judged by `src/roof/measure.ts` on the solver alone. The pipeline's
    Cheek is a face kind on the built shell. Nobody has compared the two on these cases, nor looked at what the
    three FAIL cases (7g to 7i, mixed pitch) build.
  - **What the selector did not show before**: 16 Ring-conflict fixtures, 4 port fixtures, 13 clean goldens with a
    committed input, the playtest seed `MultiRunSide`, and the 53 research cases. 13 clean goldens have no input
    and are built only in test code.
  - 7e and 7f have walls at 85° and 5°. They build in memory, and the wire refuses those pitches, so "Edit" on
    them gives a draft that shows the refusal.
- **F79. Across the whole catalogue of 321 buildable entries, 16 distinct fixtures build a Cheek, and every one is
  a courtyard** (the WP-V2 delegate at `a2c36b7`, by building every entry in a test that also checks each pinned
  case against its pin and each golden against its manifest entry; not re-run by the lead).
  - **The 16**: `Court14Seed7h250`; `CourtyardJutCutSwapped`; and `s5/Court34`, `s7/Court14`, `s12/Court1`,
    `s13/Court9` and `s13/Court21`, each at 250, 263 and 300 cm. They are 18 entries, since two are listed twice.
  - **No roster, rise, Ring-conflict, port, research, clean-golden or playtest entry builds a Cheek.**
  - **Other facts in the same table**: 96 entries build a rise, 70 report conflicts, 54 have an Unclassified Edge,
    and 33 throw.
  - **Every built entry agrees with its pin or manifest entry.**
- **F80. Opposite gable stretches on one Ring clamp each other, and a gable stretch wholly under an abutting Ring
  is not built** (the lead, 2026-11-13, at `958f587`, by planning storey 0 of the user's three drafts; probe in
  the session scratch directory under `wing/opp-probe.ts`). The layout: a crossbar `[0,0,1000,400]` with S and N
  at 60° and E and W at 22.5°, and a stem `[400,400,600,1000]` at 45°.
  - **Drafts 3 and 4** carry a gable stretch on S over x [400, 650] and one on N over the same x [400, 650], at
    65° and at 75°. Both build two rises. **The S rise's limit plane is the N walls' hip plane, and the N rise's is
    the S wall's**: each is limited by the slope the other replaces. At 65° the apex, 125 tan 65° = 268 cm, is
    below the crossbar's ridge, 200 tan 60° = 346 cm, so the limit never bites, and the user calls it correct. At
    75° the apex is 466 cm, above the ridge, so each rise is cut down by the opposite slope and the ridge dips
    between the gables.
  - **Draft 5 as uploaded has no gable on any side**: every side is one hipped run. It cannot show what the user
    describes. The lead built the likely intent instead: S and N gable stretches both over x [400, 600] at 75°.
    **Only the S rise is built.** The N stretch lies wholly on the stem's S side, so it is on no union wall, and
    decision 220 does not count it. `writeInput` of that fixture does keep both gable runs. **Explained by the
    user the same day**: they downloaded the wrong layout by accident while making several. No editor defect.
  - The N wall is two union walls, [0, 400] and [600, 1000], sharing one plane. In drafts 3 and 4 the N rise is
    built once over [400, 650] and stands on the [600, 1000] wall, though only 50 cm of its band is exposed at
    plate level.
- **F81. How far the two defects of F80 reach in the corpus, and what the three rules of decision 243 do to it**
  (the WP-L2 delegate at the red WIP `8b8bc3c`, before the provenance fix; 5,288 entries, 9,413 storeys, 1,346
  rises; not re-run by the lead; figures will move when the work finishes).
  - **156 rises in 69 fixtures are limited today by a slope whose wall carries a gable over the rise's walk line.**
    In 145 of them that gable is a rise.
  - **477 gable stretches in 228 fixtures are wholly covered at plate level, and so not built today.** Every one
    is covered by a neighbouring Ring abutting flush on its outward side. 476 lie on a line with no union wall at
    all; only the user's case lies on a line with walls elsewhere. About 166 would stand above the roof at their
    line.
  - **Under all three rules**: 59 entries change shape and rises go from 1,342 to 1,739. Nine entries are cured:
    `s1h263/Court25` no longer throws; `Court18` at 263 and 300 cm, `Court15`, `Court4` and `SplitCourt9` lose
    Unclassified Edges, and some a surviving Internal face. Unclassified Edges fall from 153 to 132, Cheeks from
    24 to 22, and conflicts rise from 2,564 to 2,578.
  - **12 entries newly throw**, plus 45 split-band courtyard cases and 15 cut reproducers that the sweep corpus
    had missed. Most are provenance finding no union wall on the covered rise's line. Smallest: Rings
    `[0,0,500,500]` at 30° with a gable run from 100 to 400 at 60° on E, and `[500,0,1000,500]` at 30°.
  - **Opposite gables can be one-sided**: where one rise's walk line is inside the other's band and not the
    reverse, one runs through and the other is limited. `OppositeGablesTPartFacing` has 1 Cheek from it.
  - **The 196 pinned cases by class**: roof meets the floor above 57; algorithm-B cut-piece overshoot 36;
    low-pitch pocket 30; `GABLE_RISE_CONFLICTS` 27; algorithm-B Cheek 15; `GABLE_RISE_SPLIT_CONFLICTS` 11;
    sub-tolerance roof feature 9; near-touching islands 4; Gable–Wall edge Unclassified 3; edge contact between
    opposite coplanar faces 2; partial coplanar contact 1; courtyard cut collinear with a jutting wall 1.
  - **The None-side refusal's text**, for the C++ side: `Ring 1 (model index 1) side 0 (S) is solved None but wins
    the union wall y = 0 [0, 1000] over [500, 1000] on storey 0, where its form is undefined (journal decision
    140)`.
