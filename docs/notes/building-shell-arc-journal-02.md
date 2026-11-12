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

Carried by reference: [session 1 §3](./building-shell-arc-journal.md#3-operational-manual). It is unchanged.

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
6. Nothing from this session is committed. The three new notes and the session 1 head-of-thread edit are in the
   working tree.

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
