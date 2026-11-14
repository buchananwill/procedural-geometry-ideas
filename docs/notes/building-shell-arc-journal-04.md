---
title: "Building Shell Arc: Session 4 Journal"
type: workflow
area: building-shell
status: active
date: 2026-11-14
record_of: ["./building-shell-gable-rise-proposal.md", "./building-shell-viewer-editing-proposal.md", "./building-shell-gable-stretch-settings-decisions.md", "./building-shell-prototype-decisions.md", "./skeleton-wavefront-order-decisions.md", "./holed-skeleton-roadmap.md", "./holed-skeleton-vision.md", "./skeleton-loops-input-decisions.md"]
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

**Session 4, 2026-11-14: the lead's proposal for the holed skeleton is with the user and is not yet a decision.** It
rests on BSA.F91 and BSA.F92, both read and not run. In brief: store the wavefront's order explicitly (neighbour links
on live bisectors, rings read from them) and retire the id arithmetic, held to a byte-identical corpus; then admit
several input loops, with a strike across rings joining them and a strike within a ring dividing it, and a containment
test to hand a hole's ring to the right child; then the loop-aware consumers and a holed fixture roster; then
building-shell's `solveFaces` on `outer` plus `holes`. The first thing to measure is the concentric courtyard, where
every front meets its opposite along a whole line at once.

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
