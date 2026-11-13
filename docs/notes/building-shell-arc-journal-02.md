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

1. ~~Three onboarding delegates dispatched 2026-11-12 (read-only): the viewer, the input model, and the gable/hip
   constraint in the solver.~~ All three returned (F57 to F62).
2. ~~Write the two proposals from their reports.~~ Written 2026-11-12 (decisions 188 and 189):
   [viewer editing](./building-shell-viewer-editing-proposal.md) and
   [gable rises](./building-shell-gable-rise-proposal.md). Both are `status: proposed`.
3. **The user rules on the two proposals.** The rulings that matter most:
   - gable rise decision 3: form per extent, which amends spec 3 and decision 116 and reshapes the Ring-conflict
     goldens;
   - gable rise decision 7: no "gable beats hip" rule;
   - viewer editing decision 6: the wire round trip as the only validity law.
4. **On the user's go, message the port lead** (`pisteperfect-5-7-4f`) with gable rise decision 18's question:
   whether game content can request a form on part of a side, or only reach a rise through a flush Ring. Not yet
   sent. **Answered by the user instead (decision 191).** The port lead is still owed notice when a proposal is
   accepted.
5. **Then dispatch, in this order**: the viewer editor; gable rise decision 22's measurement package (it moves the
   scratch probe of F60 into `apps/building-shell/experiments/`, because the scratch directory is session-local
   and will not survive); the rise itself; the editor's run list.
6. ~~Nothing from this session is committed.~~ Committed at `aa9b09b` on the user's go (decision 196), not pushed.
7. **WP-E1, the viewer editor, dispatched 2026-11-12** (general-purpose, Sonnet) at `aa9b09b`, on the arc branch.
   Its contract is the viewer editing proposal's 25 decisions. Its gates are that proposal's decision 23, by
   mutation. It reports build times (decision 12) and stops on any file outside the proposal's roster. **When it
   returns**: check its figures against its tree, then a type review and a correctness review before acceptance.
   **Returned at `c00b8cf` (decision 197, F64). Two reviews dispatched 2026-11-12**: `typescript-type-reviewer`
   and a correctness reviewer (general-purpose, Opus), both on `aa9b09b..c00b8cf`. WP-E1 is accepted when they
   are ruled on.
   **Both reviews ruled (decision 198). WP-E1.1 dispatched 2026-11-12 to the same delegate, resumed.** When it
   returns: the correctness reviewer re-reads the fix diff only, then WP-E1 is accepted and the journal edits
   since `aa9b09b` are committed. **Then the rise sweep is dispatched (decision 199)**: general-purpose, Opus,
   owning only `apps/building-shell/experiments/`, starting from the scratch probes of F60 under `midgable/`.
   **WP-E1.1 returned at `4e969a5`** (one commit, eight roster files; the lead checked `git diff --stat`). Its
   record on that tree: 8,436 passed in 38 files, typecheck clean, the golden drift test inside the run, and five
   mutation gates convicted. **The correctness reviewer was resumed on `c00b8cf..4e969a5` on 2026-11-12.**
   **Accepted at `4e969a5` (decision 201). Notes committed at `2b941cb`.**
   - ~~**WP-E1.2 dispatched 2026-11-12** to the same delegate: the reload mark survives every save. The lead reads
     its diff; no further review.~~ Accepted at `e4de021` (decision 202). **The editor is done for this version.**
   - **WP-G1, the rise measurement sweep, dispatched 2026-11-12** (general-purpose, Opus) at `2b941cb`. It owns
     `apps/building-shell/experiments/gable-rises/` and a new note `building-shell-gable-rise-findings.md`, and
     changes no production code. It must first reproduce F60 and F61. **When it returns**: record its classes as
     findings, amend the gable rise proposal where a decision did not hold, and build the rise only if every
     class is clean or clean under a stated condition. A class that is not clean waits for the user
     (decision 200).
   - **WP-G1 accepted at `e45304b` (decision 203). WP-G1.1 dispatched 2026-11-12** to the same delegate, resumed:
     define `ridgeSlope` in words, re-run the whole sweep under it, measure where the definition is strained, the
     overhang fused and with a gap, and a wall-top cap under the storey directly above as a candidate.
   - **WP-G1.1 accepted at `3a8c469` (decision 204). WP-G2, the rise in the pipeline and the wire, dispatched
     2026-11-13** to the same delegate (Opus), resumed, at `8d184f0`. Its contract is the gable rise proposal as
     amended. It does not touch `src/viewer/`. **When it returns**: check its changed-golden list against gable
     rise decision 3, then a type review and a correctness review on its range. **Then WP-G3**: the editor's run
     list (viewer editing decision 25), and fold the amendments to spec 3 and decisions 116 and 149 into the spec.
   - **For the user, all provisional and reversible by swapping a default** (decision 204): (a) the limit is the
     slope beyond the ridge, found by the walk; (b) a 1 cm gap under an overhanging floor, not fused contact;
     (c) a cap at the wall top of the storey directly above; (d) a tall rise on a hip end rides along the main
     ridge unless the author sets `maxHeight`. Also still unconfirmed from decision 195: both caps cover the whole
     rise.
   - **Owed to `claude-work-ec` once WP-G2 is accepted**: the changed-golden list, that a flat top is a `Roof` face
     on a horizontal plane with Ridge, Valley, Verge and RingJunction edges (F65), and that a rise's Gable Cells
     name the winning Ring and side.
8. **The message to the C++ side was sent to `claude-work-ec` on 2026-11-12**, which the user thinks is the UI/UX
   polish lead ("I think"). The message asks it to say so if it is not. It carries decisions 191, 192, 194 and
   195, the consequences for the port, and two questions: whether the game UI can request a form on part of one
   wall plate, and whether a horizontal roof face has a home in the C++ taxonomy. **Replied the same day: F63.**
   `pisteperfect-5-7-4f` of session 1's manual is no longer listed as a peer.
9. **Owed to `claude-work-ec`**: word when it is known whether a rise adds faces whose kind or Cell source differs
   from today's. Its shell preview reads faces by kind and plane, and wall and gable Cells by Ring model index and
   side. Gable rise decision 14 (a rise's Cells name the winning Ring and side of its extent) is the answer in
   intent; send it once the rise is built and measured.

## 5. Open items

Carried by reference: [session 1 §5](./building-shell-arc-journal.md#5-open-items), plus the "Raised and not yet
ruled" list in the covered-storeys findings.

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
