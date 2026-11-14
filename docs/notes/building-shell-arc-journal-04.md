---
title: "Building Shell Arc: Session 4 Journal"
type: workflow
area: building-shell
status: active
date: 2026-11-14
record_of: ["./building-shell-gable-rise-proposal.md", "./building-shell-viewer-editing-proposal.md", "./building-shell-gable-stretch-settings-decisions.md", "./building-shell-prototype-decisions.md", "./skeleton-wavefront-order-decisions.md", "./holed-skeleton-roadmap.md", "./holed-skeleton-vision.md", "./skeleton-loops-input-decisions.md", "./skeleton-join-and-divide-decisions.md"]
---

# Building shell arc: session 4 journal

**This is the head of the thread**, continuing [session 3](./building-shell-arc-journal-03.md). Decisions continue at
281 and findings at F91, cited project-wide as BSA.D281 and BSA.F91.

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

## 4. Next work

**Session 4 state, 2026-11-14.** The arc's work is the holed skeleton, on `feature/skeleton-holes` (cut from `ee84976`),
under an approved vision and roadmap (BSA.D286). Nothing is pushed.

**Done:** roadmap node 1, the stored wavefront order, complete at `823211a` (BSA.D295). Core is 5,851 passed and 7
failed, the 7 being the red early-acceptance file by design; building-shell 9,992. Figures are delegates', not re-run by
the lead.

**Specs approved and waiting:** nodes 2 and 3, `skeleton-loops-input-decisions.md` (BSA.D289); node 4,
`skeleton-join-and-divide-decisions.md` (BSA.D294).

**How the user is steering,** added to session 3's list:
- Specs are drafted by a delegate; the lead reads and approves (BSA.D288). The lead approves each node's spec under the
  roadmap (BSA.D286).
- Commit code after a unit is built and tested, before review and after; never leave notes uncommitted for long
  (BSA.D287). Push and merge wait for the user.
- Byte identity is the cheap test of sameness, not a hard stop: diagnose a divergence, then fix it or write why it is
  acceptable (BSA.D284).
- Where the links and the old arithmetic differ, the old approach was wrong (BSA.D291).
- A failing holed fixture is a red test with an issue note (BSA.D284).

**Next, in order:**
1. **The user's ruling on the acceptance cure** (BSA.D294; node 4 spec decisions 28 to 31): accept an exterior edge
   exactly when no live bisector and no pending birth names it. The lead recommends building it first, as its own unit
   on single-loop input, measured on the six solves the red test names. Holed solves in general are blocked without it.
2. **Implement nodes 2 and 3** to one Opus delegate, then an independent review, then commit again.
3. **Implement node 4,** telling the implementer the dedupe's re-report rule is load-bearing (BSA.D295). Review.
4. **Node 5,** opening with a measurement of the concentric courtyard on node 4's solver, then a delegate-drafted spec.
5. **Nodes 6 to 9** by the roadmap. Node 9 opens from BSA.F94.
6. **Session 3's carried items** (its §4 items 2 to 8) are untouched: the review of `f388632..011455d`, the scope of
   BSA.D266, the corner sliver, one path for all gables, folding amendments into the building-shell spec, and the merge
   of the older branch to `main`.

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
