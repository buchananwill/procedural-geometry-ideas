---
title: "Building Shell Arc: Session 6 Journal"
type: workflow
area: building-shell
status: active
date: 2026-11-16
record_of: ["./building-shell-gable-rise-proposal.md", "./building-shell-viewer-editing-proposal.md", "./building-shell-gable-stretch-settings-decisions.md", "./building-shell-prototype-decisions.md", "./skeleton-wavefront-order-decisions.md", "./holed-skeleton-roadmap.md", "./holed-skeleton-vision.md", "./skeleton-loops-input-decisions.md", "./skeleton-join-and-divide-decisions.md", "./skeleton-edge-acceptance-decisions.md", "./ISSUE-skeleton-edge-accepted-before-its-face-closes.md", "./skeleton-loop-consumers-decisions.md", "./skeleton-simultaneous-rings-decisions.md", "./skeleton-loop-contact-decisions.md", "./dashboard-holed-fixtures-decisions.md", "./building-shell-holed-roof-decisions.md"]
---

# Building shell arc: session 6 journal

**This is the head of the thread**, continuing [session 5](./building-shell-arc-journal-05.md). Decisions continue at
349 and findings at F116, cited project-wide as BSA.D349 and BSA.F116.

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

- Branch `feature/skeleton-holes` at `68a00b3` (session 5's wrap commit), no upstream, nothing pushed or merged.
  Measured at bootstrap on 2026-11-16: the tree holds only this journal, the closing mark on session 5's, and nine
  untracked scratch folders under `apps/building-shell/experiments/`.
- **No suite figure exists for this tree.** The build of BSA.D348 (`8e14378` to `add41b8`) was never verified. The last
  measured figures are the baseline before it, at `9307395`, inherited and not re-run: core 6,668 passed, 9 failed by
  design, 10 skipped; building-shell 9,728 passed, 0 failed; dashboard 609.
- Session 6 opened on 2026-11-16 after the user's reboot. Nothing has been dispatched.

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

**As at 2026-11-16, `ae63ed7`: the build of BSA.D348 is verified, reviewed and revised (BSA.D354), and the
entropy-reducing pass is complete (BSA.D366). Branch `feature/skeleton-holes`, nothing pushed or merged. Session 6's
journal entries from BSA.D355 on are uncommitted.**

**The arc's close-out, what is left, in order:**
1. **An independent verification of `ae63ed7`,** which no verifier has run: the suites of core, building-shell and
   dashboard against the figures below; the sweep against `apps/building-shell/experiments/entropy-pass/baseline/`; and
   the mutation gates of the flat-ring spec's decision 55 run again on the restructured code. Recommended by the lead
   before the merge; not dispatched.
2. **Small things the pass left:** node 5's decision 22 narrowed to layers not resolved whole; `HOLED_REFUSAL_ISSUES`
   re-pointed from the resolved three-front note, which needs a ruling on where decision 21's three-run refusals are
   recorded; core's README moved off the deprecated entries.
3. **The merge to `main`, with the user.** The branch this one was cut from,
   `feature/building-shell-covered-storeys-and-sections`, is not on `main` either.
4. **A handoff document for the C++ port:** the delta in rules since the port's last sync, each tied to its decision and
   tests; a full file map of the solver as the pass left it, by function name and never by line; the ten kinds of
   `SkeletonInputRefusal` and building-shell's `IslandRefusal` as the port's status types; the ownership of `LayerLinks`
   and the step scope (BSA.D360); the nine red-by-design tests as known defects; the refusals that remain by name; the
   parity risk of the position-based tie-break (BSA.D347).
5. **After the merge, its own unit:** the flat rule on single-loop steps, in its shallow form (BSA.D349).

**Figures to verify against, the implementers' own on `aa82032`:** core 6,714 passed, 8 failed, 10 skipped;
building-shell 9,886 passed, 1 failed; dashboard 609; typecheck clean on core, test-fixtures and building-shell, the
dashboard's 4 known errors in `DolProductionComposer.tsx`. The nine red tests: five in `weighted-time-order.test.ts`,
three in `straight-bisector.test.ts`, `uniform-1-129` in `holed-grid-fuzz.test.ts`, each with an open issue note.

**Left for the user, none decided by the lead:**
- Converting the legacy pins of `KNOWN_DEFECT_POLYGONS` and core's remaining "still alive" tests (BSA.D337).
- The weighted defect: BSA.F115 shows the primary-only rule can be relaxed narrowly, at zero offset.
- The along-edge class with canonicalisation off is still wrong below magnitude 0.1 (BSA.F110).
- Node 8, contact between loops: approved spec, not built, no caller.
- The seven items BSA.D356 did not order, chief among them the unechoed step refusal, the selector DSL off the shell
  path, and the dashboard off the legacy entries.
- Whether the ten refusal kinds of BSA.D363 keep their names before the port takes them as an enum.
- Session 4's list, items 4 to 9, and session 3's carried items, untouched.

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
- **The dashboard's typecheck has 4 errors in `DolProductionComposer.tsx`** (lines 107, 170, 171, 224; dnd-kit event
  types), predating the build of BSA.D348 and outside this arc (BSA.F116). Its Jest suite is green.
- **From the review of the build of BSA.D348 (BSA.F117, BSA.D351), none designed against:** a ring mis-paired between
  two collinear, same-facing, equal-weight walls passes the flatness test; no test asserts that a decision-44 refusal
  makes no node, because no specimen of one exists since E′ was cured; decision 19 reads a level member's direction from
  its node and parents and never its basis, which `addBisectionEdge` can reverse on a near-antiparallel ridge; whether
  two gaps can truly face one wall is unproved.
- **Building-shell's viewer imports from `tests/` in six places** (BSA.F122): `GOLDEN_FIXTURES` in `viewer/main.ts`, the
  pin table, residue pins and robustness fixtures in `viewer/pinned-cases.ts`, a type in `viewer/defect-sources.ts`. The
  C++ port does not take the viewer, so it is not fixed in this arc's close-out.

## Decisions

- **349. The user, 2026-11-16: The flat-ring rule is extended to single-loop steps in its shallow form, as its own unit
  after the merge to `main`.** The user's word on the lead's recommendation: "OK, accepted."
  - **The unit:** one-ring steps go through the flatness test and wiring of `flat-rings.ts` ahead of the pair, triangle
    and n-gon dispatch. `FLAT_STRETCH_BAR_FLOORS = 4` stays as it is, labelled incidental, and becomes load-bearing on
    single loops (BSA.F113).
  - **A probe goes with it:** the shortest stretch seen on single-loop steps across the sweeps is logged. If nothing but
    BSA.F113's two jittered fixtures lands between about 2 and 12,000 floors, the constant stands.
  - **Deriving the bar from the nodes' position budgets is not part of the unit** and stays an open item. It opens the
    question of whether a computed node carries a budget at all, with no measured benefit yet.
  - **The unit owes:** a full before-and-after digest comparison over the suites and sweeps, each divergence diagnosed,
    since no suite has run under the rule; Offset Cross Junction leaving `KNOWN_DEFECT_POLYGONS` with its pins rewritten
    to the correct result; a red test and issue note, or a guard test, for each of the two jittered fixtures the bar
    refuses (BSA.D266); the golden and handoff delta for the C++ port.
  - **Not in this arc's close-out** (BSA.D346). One spec, one implementer, one review.
- **350. The build of BSA.D348 is accepted as verified on `68a00b3` (BSA.F116) and goes to independent review; three
  items are batched for the revision that follows it.**
  - **`holed-grid-fuzz.test.ts:203` is rewritten** so no green test counts `uniform-1-129` as incomplete (BSA.D336). The
    two guard refusals stay asserted by name; the third draw is carried by its red test alone.
  - **`node-off-stretches` is either convicted by a unit test or removed as unreachable.** The reviewer says which; a
    clause no test can fail does not stay as it is.
  - **The area-sign gate is read as "no flat ring is selected or closed by the sign of its area",** the form that turns
    the named tests red. Whether the weak substitution form needs a test of its own is put to the reviewer.
  - **The dashboard's four typecheck errors in `DolProductionComposer.tsx` are outside this arc** and go to the open
    items.
  - The spec's unverified stretch-bar census stays marked as the implementer's figure; BSA.D349's probe re-measures it
    on single loops.
- **351. The lead's rulings on the review of BSA.F117: seven items upheld for one revision of the build of BSA.D348, and
  the facing test's correction held for the user before any dispatch.**
  - **Held for the user: the facing test of decision 36.** The lead upholds the finding on its kinematics: the vertex
    starts on the struck front, and after `τ` its lead over the front is `(n_wall·v − w_wall)·τ`. The proposed
    correction compares `n_wall·v` with `w_wall` for every gap whose walls are not antiparallel and rewrites the tests
    at `:475` and `:485`. It changes the rule the user accepted in BSA.D345 outside the measured domain, and it rests on
    reasoning at the function with no end-to-end specimen, which this arc's manual says to check by building. So it is
    not ordered on the lead's authority.
  - **The lead's recommendation for it:** build it in the same revision, proved by a constructed non-rectilinear
    specimen solved end to end against its closed form, with every measured cure and digest byte-identical or the build
    stops and reports. The case `n_wall·v = w_wall` exactly, called clear today, is the one place a measured answer
    could move.
  - **Upheld, `holed-grid-fuzz.test.ts:203`:** the incomplete set less `uniform-1-129` is asserted as the two named
    refusals (BSA.D350, BSA.D336).
  - **Upheld, `node-off-stretches`:** the clause is removed and decision 17 of the spec amended, on the review's
    argument that it is unreachable. This settles BSA.D350's second item.
  - **Upheld, the area's sign:** `2h-int-1` and `2h-int-1w` run their closed forms under the translation and turn E′
    already takes, and a unit test closes one flat ring perturbed to an area of each sign. This settles BSA.D350's third
    item, and decision 55's gate is restated as a mutant that refuses on either strict sign.
  - **Upheld, `:199`:** the count of firing draws is asserted as a floor of 79, so a later cure does not turn it red and
    the rules ceasing to fire still does.
  - **Upheld, the helper near `:180`:** it matches the refusal of decisions 28 and 44 by text a decision-31 refusal does
    not share.
  - **Deferred to the entropy pass of BSA.D346:** decision 45's vacuous filter.
  - **To the open items, not designed against:** the mis-paired ring of collinear same-facing walls; no test that a
    decision-44 refusal makes no node, for want of a specimen; decision 19's direction read against a reversed basis;
    whether two gaps can truly face one wall.
  - **AMENDED by finding BSA.F118:** The lead was wrong to uphold the facing-test finding on its kinematics, and the
    held item closes with no change to the rule. The correction the lead recommended would have broken a sound solve.
    The seven other rulings stand.
- **352. The user, 2026-11-16: A read-only investigation into the V family is dispatched to settle the facing test of
  BSA.F117; the revision of BSA.D351's upheld items is not dispatched with it.** The user's words: "Ok, dispatch the
  investigation into the V family."
  - **Its question:** can a legal holed input have a third-front meeting whose wall-facing candidate lies in the band
    `0 < n_wall·v < w_wall`, where the sign test of decision 36 and the kinematic test disagree. A specimen solved
    against its closed form proves the correction; an argument that none exists closes the finding as unreachable and
    leaves the rule of BSA.D345 as written.
  - **It also counts** how often "no gap faces" (decision 44c) fires on the grids and the sweep's holed group, which the
    user's argument says is never a legitimate answer on a genuine meeting.
  - **The user's argument, 2026-11-16, which reframed the finding:** just before the event no two of the three fronts
    touch and all are closing, so all three close at P; a candidate vertex heading into swept ground is not a motion the
    model allows. The lead agreed: `v` is the velocity of a candidate that is never born, and the test only selects the
    pair of fronts the wall comes between. The user's own chain of zero-offset events is right on level cases (BSA.F112)
    and is order-dependent as a sequence (BSA.F115); the coincidence is not confined to rectilinear input, the V cases
    being exact meetings between walls that are not collinear.
  - The facing test is ruled on when the investigation reports.
- **353. The facing test of decision 36 stands as written and the rule the user accepted in BSA.D345 is unchanged
  (BSA.F118); the revision of BSA.D351 gains the weighted specimen and loses nothing.**
  - **The specimen of BSA.F118 joins core's closed-form tests** in `holed-flat-and-third-front.test.ts`, at bottom
    weight 2, with its asymmetric variant. It is the non-rectilinear weighted third-front specimen the build looked for
    and did not find (spec section 6, item 2).
  - **A new mutation gate:** substituting `n_wall·v < w_wall` for the sign test turns the specimen red.
  - **The function tests at `:475` and `:485` are rewritten on walls a legal input can pair:** `n_wall` or `-n_wall` in
    the cone of the gap's normals. The claim that the weights decide a facing verdict is withdrawn from the test and
    from the spec's section 6; decision 46 is restated as: the sign of `n_wall·v` does not depend on the weights, on any
    input.
  - **Decision 44(c)'s "no gap faces" stays a refusal by name.** It has never fired, and under BSA.F118's premises it
    marks a failed premise.
  - **To the open items:** that `mergeGaps` pairs neighbours in angle is measured, not proved; a facing verdict read
    from the arrangement before the event, with no velocity, is a candidate for the entropy pass of BSA.D346 and is not
    ordered.
  - **The revision is not dispatched.** The user dispatched the investigation alone (BSA.D352); the revision waits on
    the user's word.
- **354. The revision of BSA.D351 and BSA.D353 is in at `0bee318` and `ad8b323`, and the build of BSA.D348 is complete:
  verified, reviewed and revised. The arc's close-out (BSA.D346) is next.**
  - **The implementer's figures on `ad8b323`, not re-run by the lead:** core 6,714 passed, 8 failed, 10 skipped;
    building-shell 9,887 passed, 1 failed; dashboard 609; typecheck clean on core, test-fixtures and building-shell. The
    nine red tests are the nine of BSA.F116, each with its open note. The ten new core tests are green.
  - **Checked by the lead against the tree:** the two commits change four files, the grid fuzz test, the spec, the core
    test file and 8 lines of `flat-rings.ts`, which is the removal of `node-off-stretches`. No golden moved. The
    journals were left out of both commits.
  - **No solver answer moved:** the sweep harness's output is byte-identical in all seven groups between `68a00b3` and
    the revised tree, by the implementer's `cmp`, and matches the verifier's own output for `68a00b3`.
  - **Every gate convicted by mutation:** refusing either sign of area in `closeFlatRings`; the kinematic substitution,
    which turns both specimens, the probe and the weights test red; removing the grazing band; and each of the 12
    remaining clauses of `flat-rings.ts`.
  - **The specimen's closed form was re-derived by hand in full** (20 nodes, 23 interior edges; its asymmetric variant
    beside it) and agrees with BSA.F118. The built code solves both under the full battery.
  - **Measured against BSA.F117:** of the four moved cells of `2h-int-1` and `2h-int-1w`, three give a flat candidate of
    positive area and none a negative one; the negative sign is convicted by the unit test, on a ring lifted or dropped
    by a quarter of the floor.
  - **No second review is ordered.** The production change is the deletion of a clause shown unreachable, with
    byte-identical sweeps, and the entropy pass reads the same files next.
  - **Left as it is:** the message of `0bee318` has a quoting slip, `E'"'"'s` for `E′'s`. Rewriting a commit is the
    user's call.
- **355. The user, 2026-11-16: The journals are committed at `1503dac` and the entropy-reducing pass of BSA.D346
  begins.** The user's words: "Commit then go with the e-r pass."
  - **The lead's shape for it, in two stages.** First, three read-only Opus reviews in parallel: core's event path
    (`algorithm-complex-cases.ts`, `wavefront.ts`, `coincident-events.ts`, `flat-rings.ts`, the collision files,
    `generate-split-event.ts`); core's structure and consumers (`types.ts`, `solver-context.ts`, `graph-helpers.ts`,
    `algorithm-termination-cases.ts`, `algorithm-helpers.ts`, `skeleton-loops.ts`, `holed-guard.ts`,
    `causality-check.ts`, `strip-decomposition.ts`, `offset-projection.ts`); and building-shell's holed roof path
    (`roof/skeleton.ts`, `roof/model.ts`, `roof/algoB.ts`, `storey.ts`, `fixture.ts`, `rise.ts`). Then the lead rules on
    the findings and one implementer at a time applies them.
  - **Scope is what the C++ port must take,** read as the branch's diff from `ee84976`, where it was cut. The dashboard
    and the fixtures package are outside it.
  - **The bar is as the user amended BSA.D346:** the suites and oracles; a before-and-after comparison of sweep output,
    digests and goldens is the detector, each divergence diagnosed.
  - **Carried into it:** decision 45's vacuous filter (BSA.D351) and a facing verdict read from the arrangement before
    the event (BSA.D353), as candidates.
- **356. The lead's rulings on the three entropy reviews (BSA.F119, BSA.F120, BSA.F121): eight work packages in order,
  one implementer in the tree at a time, each committed alone and held to BSA.D346's bar. Put to the user before any is
  dispatched.**
  - **The full reports are kept as files** in the untracked folder `apps/building-shell/experiments/entropy-pass/`
    (`review-core-event-path.md`, `review-core-structure.md`, `review-building-shell.md`), written by the reviewers with
    the labels E, S and R this journal uses. A brief cites a finding by label and the implementer reads it there.
  - **P1, core, dead surface and exact types:** E1, E6, E16, S10's two dead members and its `this`, S9's held bars and
    non-tolerances, S11's `AlgorithmStepOutput` split. Shrinks the surface before anything moves.
  - **P2, core, shared primitives:** S4 and S5 as one planar-geometry and one wall-time module; E8's ordering
    primitives; E12, with one distance from a wall's line and one antiparallel predicate.
  - **P3, core, the link layer:** E2, then E3, then E11, then E9 and E10. E3 keeps each writer's order of read, retire
    and link, which is a hard constraint.
  - **P4, core, verdicts and the n-gon driver:** E7, then E5, E13, E14, then E4.
  - **P5, core, the termination file and the boundary:** S1, then S2 with `canonicaliseForSolve` left out of the fold so
    it refuses nothing new, then S8 with each check kept in the space it runs in today, S7 and S6.
  - **P6, core's diagnostic vocabulary and its readers:** S3's exported set of informational kinds and typed
    `SkeletonInputRefusal`, message text unchanged; the barrel regrouped and the two legacy entries marked deprecated
    (S11); then building-shell reads kinds in place of substrings (R3 and its `classify`).
  - **P7, building-shell:** R1 and R9; R6 and R12; R2, R5, R4 and R13; R8 and R7's first step; R10; R14.
  - **P8, comments and names, last:** E15, S12, R11, with measurement history moved to the specs it belongs to; and the
    amendments the build of BSA.D348 owes other documents (its spec's section 5).
  - **Declined:** E17, a rounding risk for a clearer loop; R15, low value; reading the facing verdict from the
    arrangement (BSA.D353's candidate), which the review shows is not behaviour-preserving, kept as a possible assertion
    only.
  - **Not ordered, to the open items:** S3's unechoed step refusal, which removes a diagnostic from the public list;
    R7's second step, taking the selector DSL off the shell path; unifying `gapDirection` with the bisector's own basis;
    migrating the dashboard off the legacy entries; dropping `context.simultaneityWindow`, which a spec adds; the
    comment at `solver-context.ts:408-410` that says never to remove it; merging the guard's time-order check with the
    causality oracle, which date nodes by different walls.
  - **The possible defects the reviews raised, as the lead reads them:** holed hip solids standing from the floor is the
    amendment of BSA.D326, and the holed roof spec's decision 25 is stale text owed a correction in P8;
    `canonicaliseForSolve` without a finiteness check, the `<= floor` clustering in `flat-rings.ts`, the unreachable
    catch in `runSimplePolygonStepped`, `builtSurface` reading the outer loop only, and `viewer-defects.test.ts` listing
    a short roster are recorded and none is fixed in this pass, which changes no answer. The roster is put right by R10.
  - **Each package's detector:** sweep output for all seven groups, `full-graph-digest`, the recursion census and
    building-shell's goldens compared before and after, each divergence diagnosed; the suites with their nine named red
    tests; typecheck. A package that moves an answer stops and reports.
- **357. The user, 2026-11-16: All eight packages of BSA.D356 go ahead, in order.** The user's words: "Go on all fixes."
  - **The review reports stay where they are,** untracked in `apps/building-shell/experiments/entropy-pass/`. The user:
    committing is inappropriate for transient review documents, and they are moved only if the folder is about to be
    cleaned. Nothing in this arc cleans it; the lead raised the risk and has no plan to.
  - **The pass's shared "before" set** is generated once by the first package's implementer on `1503dac`, into
    `apps/building-shell/experiments/entropy-pass/baseline/`, and every later package compares against it (BSA.F114).
- **358. P1 of the entropy pass is in at `5ec8d0d`, with no solver answer moved; P2 follows.**
  - **The implementer's figures, not re-run by the lead:** sweep output byte-identical to the baseline on all seven
    groups and the three region depths; core 6,714 passed, 8 failed, 10 skipped; building-shell 9,887 passed, 1 failed;
    dashboard 609; typecheck as before. The nine red tests are the nine of BSA.F116.
  - **Checked by the lead against the tree:** one commit of 21 files, 14 of core's source and 7 of its tests, 327 lines
    in and 351 out; the journal left unstaged.
  - **Each "unreachable" was confirmed before deletion:** by throwing traps on the unedited tree run through core's
    suite, the full sweep and building-shell's suite, none firing; or by the type system once `collidingEdges` was a
    pair and a split's `struckSegment` required.
  - **Landed:** `multiRingRefusal` split into `wholeLayerRefusal` and `pairwiseLayerRefusal` with decision 45's filter
    deleted (E1); `CollisionEvent` as a union of pair, split and unresolvable events, with four dead branches gone (E6);
    `NO_COLLISION_SENTINEL` deleted and `createCollisions` returning one flat list (E16); the four held bars together in
    `constants.ts` (S9); two dead `GraphHelpers` members deleted (S10); handlers returning `AlgorithmStepInput[]` (S11).
  - **The implementer's choice, accepted:** `collideEdges` marks an event out of bounds by returning a copy with
    identical fields, where it used to mutate. Only object identity differs, and nothing holds those events.
  - **No consumer outside core needed a change.** Seven core tests were rewritten for the new types; none removed, none
    re-pinned.
  - **The shared baseline of BSA.D357** is in `apps/building-shell/experiments/entropy-pass/baseline/`, with a hash per
    sweep file.
  - **For P8:** `cpp-port-handoff.md`, the flat-ring spec, the simultaneous-rings spec and the weighted-offsets spec
    still name symbols P1 deleted or renamed. The scratch copies under `experiments/` that import core's source no
    longer compile against the new types.
- **359. P2 of the entropy pass is in at `e394418`, `5af80cb` and `4c54bdb`, with no solver answer moved; P3 follows.**
  - **The implementer's figures, not re-run by the lead:** all ten sweep files identical by SHA-256 to the baseline
    after each of the three commits; core 6,714 passed, 8 failed, 10 skipped; building-shell 9,887 passed, 1 failed;
    dashboard 609; typecheck as before; the nine red tests of BSA.F116. The lead checked the three commits are on the
    branch and the tree holds only the unstaged journal.
  - **Landed:** `planar-geometry.ts` and `wall-time.ts` in the solver, the old homes re-exporting what moved, so the
    solver no longer imports from `random-polygon`, `stroke-spline` or `terrain` (S4, S5); `event-order.ts` with the
    ordering toolkit, `byEventPriority` replaced by the edge-id sort it always was (E8); `splitPricing`, `splitEventOf`
    and `incenterSplit` in `generate-split-event.ts`, with `inwardDistanceFromWall` and `wallsAreAntiparallel` serving
    every site (E12).
  - **Every merged duplicate was compared operation by operation, by reading.** Three sites were left on their own
    spelling because the arithmetic is not identical: the two rates towards the struck edge, which differ in the sign of
    an exact zero; the causality oracle's antiparallel test, which scales by `Math.hypot` where `directionsAreSame` uses
    a square root of a sum; and the causality check's comparison form, as S4 asked.
  - **Not merged, for a cycle:** `mergeDisplacementUncertainty` keeps its own body, since `constants.ts` imports only
    types and `wall-time.ts` imports it.
  - **The line count did not fall:** 876 in and 864 out. The reviews' estimates of 60 and 80 fewer lines were not
    reached, because each shared helper carries its own doc. The gain is that each rule is stated once.
  - **One side effect that is not an answer:** path 2 of the split generator now writes the log line
    `generateSplitEvent` writes on a failed validation.
  - **For P8:** specs citing `byEventPriority`, `areSimultaneousArrivals`, `lateness` or the old homes of the planar
    primitives are stale.
- **360. P3 of the entropy pass is in at `249a961`, `b0df174`, `dd029b5`, `71517f9` and `484806b`, every step
  byte-identical on the sweep; P4 follows.**
  - **The implementer's figures, not re-run by the lead:** all ten sweep files identical by SHA-256 to the baseline
    after each of the five steps; core 6,714 passed, 8 failed, 10 skipped; building-shell 9,887 passed, 1 failed;
    dashboard 609; typecheck as before; the nine red tests of BSA.F116. The lead saw the five commits on the branch and
    the tree holding only the unstaged journal.
  - **The ownership model as it now stands:** `handleInteriorNGon` constructs one `LayerLinks` per call and passes it by
    reference to every reader and writer of pending births; it is settled at the foot of the call and dies with it.
    `handleAlgorithmStepInput` sets `context.step` before dispatch and clears it in `finally`. The probe is
    `context.probe`, copied at construction from the test-side install. The module-level `WeakMap`s and the lazy
    `layerOf` are gone.
  - **The five link writers are a gap and a cut** over a `Bracket` read before anything retires, each writer keeping its
    order of read, retire and link (E3).
  - **One `orbit` generator walks the links** (E11). The size caps of `ringThrough` and `ringsOfWavefront` could never
    fire before a natural stop. The hop caps of `partitionArc` and `droppableBirths` are replaced by a revisit guard,
    which differs from them only on links already broken; that equivalence is the implementer's reading and is not
    measured. The 64 of `struckPiece` is kept, named `MAX_CUTS_WALKED`.
  - **`wavefront.ts` is now a re-export of five modules:** `wavefront-links.ts`, `layer-links.ts`, `ring-components.ts`,
    `step-scope.ts` and `wavefront-check.ts` (E9). It can be retired once tests import the new modules.
  - **One definition of a degenerate ring,** `ringArea`, and one ordering of children for both tails (E10). The premise
    that `closeFlatRing` writes no link but its own members' was confirmed in the code.
  - **Callers outside the driver:** `handleCollisionEvent` is called outside core's source only by tests; two debug
    tests that used to get a layer nobody settled now pass one and still do not settle it. No barrel import the
    dashboard uses changed signature.
  - **The source grew by about 160 lines,** five files from one and their headers.
  - **For P8:** `layer-links.ts` still carries the stale "sorted by span" line; specs and `cpp-port-handoff.md` cite
    `wavefront.ts`, `beginLayerLinks` and the `WeakMap`s.
- **361. P4 of the entropy pass is in at `d0faa86`, `d04c75b`, `e6654ae`, `7df20d7` and `6a9f24a`, every step
  byte-identical on the sweep; P5 follows.**
  - **The implementer's figures, not re-run by the lead:** all ten sweep files identical by SHA-256 to the baseline
    after each of the five steps; core 6,714 passed, 8 failed, 10 skipped; building-shell 9,887 passed, 1 failed;
    dashboard 609; typecheck as before; the nine red tests of BSA.F116. The lead saw the five commits on the branch, the
    tree holding only the unstaged journal, and no worktree left behind.
  - **One `Verdict<T, R>` in `verdict.ts`** is returned by `gapDirection`, `wallFacingGap`, the third front's
    resolution, the two layer refusals and every clause of `flat-rings.ts`; the `typeof` tests and the
    `'clause' in value` sniff are gone (E7).
  - **A merge resolved whole is a `WholeMerge` with a placement, ring or cross, and its third front attached;** the
    parallel arrays, the index join and three `!` are gone (E5).
  - **`vertex-event.ts` holds the rewrite of a vertex event and `coincident-events.ts` is pure clustering,** importing
    nothing from the link layer; one `bearGaps` serves ring merges, cross merges and a third front's clear gaps (E13).
  - **`levelRuns` returns the level members' ends and the ridges** where `levelFailure` mutated the stretches it tested
    (E14).
  - **`handleInteriorNGon` reads as eight phases:** `createCollisions`, `layerWindow`, `terminalLadderLayer`,
    `resolveLayerEvents`, `refuseUnsettledLayer`, `resolvePairwise` or `resolveWhole`, `bearBirths`, and
    `childrenOfSeveralRings` or `childrenOfOneRing`; the whole-event machinery is in `whole-events.ts` (E4).
    `componentsAsChildren` stays in the driver beside `orderChildren`, against the review, to avoid a cycle.
  - **Refusal texts were checked unchanged three ways:** by reading; by 18,166 diagnostic lines from both grids and
    every holed fixture, identical before and after; and by logging every step refusal through the holed core tests. The
    third-front and most flat-clause texts are reached only by their exact-text unit tests.
  - **Not unified, an open question:** `thirdFrontOf` reads a merge's runs over its `edgeIds` and bearing reads them
    over its arrivals. They are equal on every path the implementer could read, and it is not proved for the terminal
    ladder's completion. The review's suspected vacuous `arrivals.length < 2` is the same question.
  - **The source grew by about 280 lines,** three new files and a doc per phase.
  - **For P5:** `tolerance-derivation.test.ts` spies on `handleInteriorNGon` through the module object of
    `algorithm-complex-cases.ts`, so that export stays there.
- **362. P5 of the entropy pass is in at `8a7511a`, `b12ba28`, `85bc145`, `900f12f` and `c8e9723`, every step
  byte-identical on the sweep; P6 follows.**
  - **The implementer's figures, not re-run by the lead:** all ten sweep files identical by SHA-256 to the baseline
    after each of the five steps; core 6,714 passed, 8 failed, 10 skipped; building-shell 9,887 passed, 1 failed;
    dashboard 609; typecheck as before; the nine red tests of BSA.F116. The lead saw the five commits on the branch and
    the tree holding only the unstaged journal.
  - **The termination file is five modules and the cycle with the n-gon driver is gone** (S1): `terminal-ladder.ts`,
    `algorithm-termination-cases.ts` (the pair and the triangle), `step-driver.ts`, `boundary-stage.ts` and
    `solve-entry.ts`. Checked by a strongly-connected-components pass over every relative import, before and after. Two
    cycles remain that predate the pass: `collision-helpers.ts` with `generate-split-event.ts`, and a type-only one
    around `types.ts`.
  - **One `prepareBoundary` serves every solve entry** (S2), in seven phases: count and finiteness per loop, one
    normalisation, the weight door, canonicalisation and winding per loop, the loop table and maps, the loop relations,
    the flattening. `canonicaliseForSolve` is left out of it and refuses nothing new.
  - **`solveSkeletonObserved` is four phases** (S8), and `verifySolvedGraph` states the spaces its checks run in, each
    kept as it was: causality per sub-polygon in unit space; the holed guard on the unit-space graph; the simple path's
    causality in caller space.
  - **Loop naming, the loop table's rule and the walk within a loop are each stated once** (S7). Every site whose
    message differs from its twin keeps its own text: three wordings of the weight-length refusal, the two sets of
    loop-table texts, the winding refusals.
  - **One `driveSteps`** serves core's two loops and test-fixtures' capture (S6); the barrel gains that one name, 438
    from 437.
  - **Texts and stepped observations were checked by an observation harness,** 355 keys covering every refusal text
    across the entries, the boundary diagnostics, snapshot hashes for all 60 corpus fixtures and 21 holed ones, and a
    recording probe's 2,148 calls: byte-identical to the tree before P5 after each step.
  - **One flagged difference:** in `runSimplePolygonStepped` the first boundary now calls the probe before the snapshot,
    and inside the `try`. It shows only with a probe that throws or writes the graph; every install in core and
    building-shell only records.
  - **The user, 2026-11-16, on the pass's net growth of a few hundred lines:** "Gaining a few lines for better
    organization is a win." Line count is not a target of this pass, and no package is asked to reduce it.
  - **For P8:** the project CLAUDE.md's V5 table names `algorithm-termination-cases.ts` as the entry point's file, which
    is now `solve-entry.ts`; core's README, `cpp-port-handoff.md` and several specs cite the old file.
- **363. P6 of the entropy pass is in at `efe827d`, `8dfc504`, `f45ed31`, `525ce8a`, `dea5ac3` and `6d8bf3e`, with no
  solver answer moved; P7 follows.**
  - **The implementer's figures, not re-run by the lead:** all ten sweep files identical by SHA-256 to the baseline
    after the first two steps and at the end; P5's observation harness, 355 keys, byte-identical throughout; core 6,714
    passed, 8 failed, 10 skipped; building-shell 9,887 passed, 1 failed; dashboard 609; typecheck as before; the nine
    red tests of BSA.F116. Building-shell's golden test is green by inference, the reporter listing only the one failing
    file. The lead saw the six commits on the branch and the tree holding only the unstaged journal.
  - **Which diagnostic kinds block is stated once,** in `diagnostic-kinds.ts`: six informational kinds and eight
    blocking ones, each kind's status the same as under the inline list it replaces, enumerated against every push site
    in core (S3a). The dashboard's two sets were element-for-element equal to core's and now re-export them.
  - **Input refusals are a `SkeletonInputRefusal` with a kind, a loop and an index,** every message unchanged and `name`
    left as "Error" (S3b). **The ten kinds are the implementer's coinage, accepted by the lead:** `too-few-vertices`,
    `non-finite-vertex`, `weight-count`, `weight-not-finite-positive`, `weight-ratio`, `weight-change-without-corner`,
    `mis-wound-loop`, `loop-conflict`, `loop-table`, `holes-on-legacy-entry`. Three sets of throws stay plain `Error`,
    none on the solver's path: `groupLoopsByNesting`, the debug overlay's, and the pinned-index check.
  - **Building-shell classifies by kind** (R3): `DIAGNOSTIC_CAUSES` keyed on core's diagnostic kinds, `REFUSAL_CAUSES`
    on its own refusal kinds, `HOLED_CAUSES` kept with its ten keys and strings; its informational set is core's less
    `causality-violation`, named `REFUSED_BY_THE_ROOF`. Of 46 refusals run through both the old substring classifier and
    the new table, 44 agree and the other two are plain errors the roof never reaches.
  - **One narrow difference, accepted:** a throw out of the solver that is not an input refusal and whose text contains
    "eight" or "ratio" was classed `door-other` and is now `threw`. No input constructed reaches one.
  - **The barrel is in four groups,** Solve, Consumers, Diagnostics and Internals, 446 names from 438, the eight added
    being this package's; the two legacy entries are marked deprecated (S11).
  - **`wavefront.ts` is retired,** its eleven tracked importers repointed. Nine untracked scripts under `experiments/`
    still import it and no longer resolve; the lead accepts that, as scratch, each a one-line repoint if it is run
    again. Among them are the probes of BSA.F118 in `facing-band/`.
  - **For P8:** a dashboard test reads `SkeletonDiagnosticKind` from core's `types.ts` by regex, so that union stays
    there.
- **364. P7 of the entropy pass is in at `8f6b90f`, `c0ef31a`, `9d49949`, `b3e277e`, `bedf667` and `5327ea3`, with no
  golden byte moved; P8 follows, in two parts.**
  - **The implementer's figures, not re-run by the lead:** the golden test run by name, 814 passed, and no file under
    `golden/` modified after a re-export at every step; copy integrity at 44 pass, 6 cheek, 3 fail, 0 blocked, 0 none,
    and all 53 verdicts; building-shell 9,886 passed, 1 failed, one test fewer than the baseline because the drift test
    between the wall-line copies is retired with the copies; typecheck clean. The red test is `uniform-1-129`, unedited.
    The lead saw the six commits on the branch, and that the range touches neither `golden/` nor `packages/`.
  - **One `roof/wall-line.ts`** (R1): the copies in `algoB.ts`, `rise.ts` and `storey.ts` were read side by side and
    none differed.
  - **The seam's input is assembled in `skeleton.ts`** (`skeletonInput`, `solveIsland`), and `facesOfStrips` is geometry
    only (R2, R5).
  - **An island's refusal is an `IslandRefusal`** (R4) with `island`, `at`, `holes`, `kind`, `reason` and `detail`,
    constructed in `solveRoofParts` with the old message exactly and re-wrapped by `planBuilding` through `relabelled`,
    which keeps the class. Its user-facing field is `reason` and not `cause`, since an error's `cause` is its chain. Its
    `name` is `'IslandRefusal'`, following `PlanRefusal`, where core's `SkeletonInputRefusal` keeps "Error".
  - **Residue classes are `LIVE_RESIDUE_CLASSES`, five, and `RETIRED_RESIDUE_CLASSES`, seven,** the source of truth
    moved into `src` (R12). The implementer read "retired" as all seven the old emptied list held, not only the two the
    review called unreachable; accepted.
  - **`HOLED_REFUSALS` is in `src/fixture.ts`** and the viewer's roster is one export, `viewer/rosters.ts`, read at all
    four sites (R10). `viewer-defects.test.ts` now lists the page's own roster, 15 holed fixtures and two refusals more
    than before, and found nothing. A table in `fixture.ts` names each holed layout's role for the port: oracle input,
    known refusal or legacy-named.
  - **Loops are traced once** (R7, first step), `applySelectors` returns its hits, and wall attributes are `WallAttrs`
    (R8). `runB` and `solveRoofParts` share the island solve and keep their two policies (R14).
  - **Not done, as ordered:** R7's second step; R5's optional derivation of `causality`, which a test asserts as a
    field.
  - **P8 is split by the lead into two runs:** first the code's comments and names (E15, S12, R11, the three legacy
    names), then the documents (stale references in specs, issue notes, core's README, the existing
    `cpp-port-handoff.md` and the project CLAUDE.md, and the amendments the build of BSA.D348 owes).
- **365. P8a of the entropy pass is in at `000f73e`, `097c477`, `6cb388e` and `aa82032`, with no answer moved; P8b, the
  documents, follows and ends the pass.**
  - **The implementer's figures, not re-run by the lead:** core's built JavaScript identical before and after apart from
    two comments the bundler keeps inline; all ten sweep files identical by SHA-256 to the baseline; golden 814 and copy
    integrity 5 passed, nothing under `golden/` modified; core 6,714 passed, 8 failed, 10 skipped; building-shell 9,886
    passed, 1 failed; dashboard 609; typecheck as before; the nine red tests of BSA.F116. The lead saw the four commits
    on the branch, 64 files, and the tree holding only the unstaged journal.
  - **Comments across core's solver and building-shell's roof path now state the rule and its reason.** About thirty
    sites read like history and were kept as reasons in the present tense, each naming what breaks without the rule; the
    report lists them.
  - **Twenty-seven measurement narratives moved to a "Measurement record" section of the spec that owns each,** with a
    one-line pointer at the site: sixteen to the tolerance-derivation spec, five to the coincidence and terminal-cases
    spec, three to the angular-predicate spec, two to the weighted-offsets spec, one to the input-canonicalisation spec.
  - **The three legacy names are `courtyardJutFixtures`, `CourtyardJutName` and `COURTYARD_JUT_DEFECTS`;** `unionLoops`
    throws a typed `PinchError` with the same message and `PINCH_PREFIX` is gone.
  - **Ruled by the lead on the implementer's three flags.** The tolerance-derivation spec grew from 300 lines to 633 and
    now trips the schema's length warning: its measurement record moves to a technical-reference note of its own in P8b,
    the code's pointers following. A throw in `viewer/pinned-cases.ts` that cannot be reached while its table is empty
    now names `courtyardJutFixtures`: accepted, since the message should name a function that exists. Two more scratch
    scripts under `experiments/` no longer resolve: accepted.
  - **How it was run:** the implementer split the files among four forks of itself, which is four editors in the tree
    against this journal's manual. Their file sets were disjoint and the result is verified on the merged tree, so it
    stands; later briefs say one editor means one.
  - **Not covered:** building-shell's `src` outside the roof path was searched for the history wording only and not
    read. `residue-pins.ts`' cure log, the only record of each pin's former signature, was left as written.
  - **Stale and unrecorded:** the input-canonicalisation spec's record says the usable noise-floor band's premise, a
    root floor not yet wired, is stale, and whether the band was re-measured after the wiring is recorded nowhere.
- **366. P8b is in at `c903386`, `bb5b66a`, `7b44926` and `ae63ed7`, and the entropy-reducing pass of BSA.D346 is
  complete: 28 commits from `1503dac` to `ae63ed7`, with no solver answer and no golden byte moved at any package.**
  - **The pass in figures, from `git diff --shortstat 1503dac ae63ed7`:** 129 files, 8,507 lines in and 7,136 out; in
    `packages` and `apps` alone, 108 files, 7,600 in and 6,991 out. The lead ran the notes check on the final tree: 0
    errors, 2 length warnings, both older than the pass.
  - **No independent verifier has run the final tree.** Every package's suite and sweep figures are its own
    implementer's, the last full suites on `aa82032`; P8b after it changed sixteen comment pointers, with core's built
    JavaScript byte-identical. An independent verification of `ae63ed7`, with the mutation gates of the flat-ring spec's
    decision 55 run again on the restructured code, is the lead's recommendation before the merge.
  - **P8b's stale references:** corrected across the specs, the issue notes and `cpp-port-handoff.md`, found by diffing
    the symbols of `1503dac` against the head's and searching the documents for each. Eighteen dated amendment lines sit
    under decisions whose code no longer has their shape, the decisions' text kept. References already stale before the
    pass, records anchored to an earlier commit, and line numbers into files the pass did not split were left, each
    listed in the report.
  - **The amendments the build of BSA.D348 owed are made,** but one. Node 5's decision 22 is not replaced whole, because
    the flat-ring spec's decision 31 and `pairwiseLayerRefusal` still cite it as live for a layer not resolved whole; it
    wants narrowing to those layers, and that wording is not yet written.
  - **Three issue notes are resolved with `verified_by`:** the three-front meeting and the straight vertex in a
    zero-area ring (for multi-ring steps), on `holed-flat-and-third-front.test.ts`, 46 of 46, and
    `holed-fixtures.test.ts`, 111; the mixed-pitch island on `mixed-pitch-island.test.ts`, 5 of 5.
  - **The flat-ring spec is `completed`,** on BSA.D354 and those tests. The holed roof spec's decision 25 is amended to
    the floor-standing holed hip solid of BSA.D326.
  - **The tolerance spec's measurement record is its own technical-reference note,**
    `tolerance-derivation-measurement-record.md`; the spec is back to 305 lines.
  - **The project CLAUDE.md, factual corrections only, in a commit of its own:** the V5 entry point's file is
    `solve-entry.ts`, and the V5 file table gains `step-driver.ts`, `boundary-stage.ts`, `terminal-ladder.ts`,
    `event-order.ts` and `whole-events.ts`. Ten lines.
  - **Left by the pass, to the open items:** `HOLED_REFUSAL_ISSUES` in `apps/building-shell/src/fixture.ts` points the
    two remaining refusals, both decision-21 three-run meetings, at the three-front note that is now resolved; core's
    README teaches the two entries the pass deprecated; the old `cpp-port-handoff.md` never listed the holed modules and
    needs a full file map in the new handoff.
- **367. The tree after the entropy pass is accepted as verified (BSA.F122), and the three things the pass left are
  ordered as one small unit before the merge.**
  - **Node 5's decision 22 is narrowed, not replaced:** it governs a layer not resolved whole, and a layer resolved
    whole goes to the flat-ring spec's decisions 30 to 42. Written as a dated amendment under it, its text kept.
  - **The two remaining refusals get an issue note of their own.** `GridDraw523` and `GridDraw1977` are vertex events
    across rings of three runs, refused by name under node 5's decision 21: valid inputs the solver declines.
    `HOLED_REFUSAL_ISSUES` points at the three-front note, now resolved, so a new open issue note records the three-run
    meeting and the table points at it. Each is a guard with a test green on the guard, which is one of the two forms
    BSA.D336 allows; the note is there so the port sees them as a known gap. Put to the user as the lead's intended
    ruling on 2026-11-16 and not objected to.
  - **Core's README teaches `solveSkeleton` and `solveSkeletonStepped`,** the two legacy entries named once as
    deprecated.
  - **Not ordered:** the viewer's six imports from `tests/` (BSA.F122), an open item.
- **368. The three leftovers of BSA.D367 are in at `805ca01`, `719568c` and `762198f`, and the branch is ready for the
  merge, which waits on the user.**
  - **Node 5's spec is `skeleton-simultaneous-rings-decisions.md`.** Its decision 22 carries an amendment narrowing it
    to a layer not resolved whole; a meeting on a third front in a layer resolved whole is resolved by the flat-ring
    spec's decisions 30 to 42 and refused only under its decision 44.
  - **`ISSUE-skeleton-three-run-vertex-event-refused.md` is open** and `HOLED_REFUSAL_ISSUES` points at it. Measured by
    the implementer's run: on `uniform-1-523` the two root corners of the outline's wing and the near hole's corner
    reach (1250, 550) at t = 100; the two wing corners are separate runs on the joined ring, so the event gathers three
    runs and is refused under decision 21 as `simultaneous-across-rings`. `uniform-1-1977` is the same shape, at (1650,
    800). The true skeleton is not derived and no cure is designed.
  - **Core's README teaches `solveSkeleton` and `solveSkeletonStepped`,** holes included, its samples type-checked
    against core's source and run; the legacy pair is named once as deprecated.
  - **The implementer's figures:** notes check 0 errors and the same 2 length warnings; golden 814 of 814 with nothing
    under `golden/` modified; `holed-roof.test.ts` 16 of 16; `viewer-catalogue.test.ts` 42 of 42; three core suites 229
    of 229; building-shell's typecheck clean.
  - **Corrected by the lead, uncommitted, both text only:** the doc comment on `HOLED_REFUSALS` in
    `apps/building-shell/src/fixture.ts`, which said one hole's two corners where the run shows the wing's two root
    corners; and core's README, which counted 59 fixtures where the rosters hold 60 single loops (BSA.F92) and 21 with
    holes.
  - **Left:** `HOLED_REFUSAL_ISSUES['multi-ring-step-refused']` points at the zero-area-ring note, now resolved for
    multi-ring steps; no entry uses that kind.
  - **Since the independent verification of BSA.F122,** the code has changed by one string in `fixture.ts` and one
    comment; the golden test was re-run on the first.

## Findings

- **F116. The build of BSA.D348 holds on `68a00b3`: core 6,704 passed, 8 failed, 10 skipped; building-shell 9,887
  passed, 1 failed; dashboard 609; every red test has an open issue note, and 18 of decision 55's 19 gates turn their
  named test red.** (a Sonnet verifier on 68a00b3, 2026-11-16; the cured ninth test read by the lead from the diff of
  9307395..68a00b3)
  - **Red in core, 8:** the five of `weighted-time-order.test.ts`
    (ISSUE-skeleton-weighted-edge-runs-backwards-in-time.md) and the three of `straight-bisector.test.ts`
    (ISSUE-skeleton-straight-bisector-between-collinear-walls.md). The baseline's ninth, `2h-int-1` in
    `holed-simultaneous-rings.test.ts`, is cured by the build and now asserted against its closed form in
    `holed-flat-and-third-front.test.ts`.
  - **Red in building-shell, 1:** `holed-grid-fuzz.test.ts`, grid draw `uniform-1-129`
    (ISSUE-skeleton-grid-draw-straight-bisector-pair.md), written by the build under its spec's section 6 item 8.
  - **Typecheck:** core, test-fixtures and building-shell clean. Dashboard has 4 errors, all in
    `DolProductionComposer.tsx` on dnd-kit event types; the build touches neither that file, the lockfile nor the
    dashboard's `package.json`, so they predate it. Not run at the baseline.
  - **The gate that does not hold: `node-off-stretches` (decision 17).** With the clause disabled, all 36 tests of
    `holed-flat-and-third-front.test.ts` pass. The spec's own section 6 says so (claim 9).
  - **The area-sign gate depends on its reading.** Selecting candidates by the sign, or closing no flat ring, turns 6 to
    7 core tests and 30 to 55 building-shell tests red. Substituting the sign for the verdict (refuse when the area is
    negative) leaves every named test green.
  - **The `multiRing` gate:** calling the flat rule on single-ring steps turns 5 pinned digests red, Offset Cross
    Junction and four off-edge jitter fixtures. BSA.F113 measured one digest moving with the bar; the verifier's edit
    and BSA.F113's scratch switch are not known to be the same.
  - **Single-loop identity by sweep:** 0 of 642 cells moved in the six single-loop groups between `9307395` and
    `68a00b3`. In the holed group 36 of 336 moved, all incomplete on the parent: 15 complete and clean, 1 complete with
    a causality violation, 20 incomplete.
  - **Goldens:** 33 files added, the manifest grown by 319 lines, no existing golden byte moved.
  - **Not checked:** the spec's claim that the stretch bar decided nothing (429 candidates, shortest 12,207 floors),
    whose probe output is in untracked scratch; the clause breakdown of the 19 sweep refusals; the oracle's worst
    figure; the clockwise variant of the first gate.
  - **A test that asserts a defect:** `holed-grid-fuzz.test.ts:203`, "leaves the measured three incomplete", is green on
    a count that includes `uniform-1-129`.
  - The tree's tracked files were unchanged by the run. Its scripts and logs are in `%TEMP%\verify-d348-7f3a\`.
- **F117. The review of the build of BSA.D348 finds single-loop isolation, the refusals before resolution and the
  kernel's arithmetic sound, and one defect in the spec that the code follows: the facing test of decision 36 leaves out
  the struck wall's own speed.** (an independent Opus review of 6df75c3..68a00b3, 2026-11-16, read-only; function-level
  verdicts and ring areas run in its own scratch, reach and consequence inferred)
  - **The facing test** (`wallFacingGap`, `coincident-events.ts:559-573`) classes a gap by the sign of `v̂·n_wall`. The
    gap's vertex is at `node + v·τ` and the struck front at `n_wall·(p − node) = w_wall·τ`, so the front overtakes the
    vertex when `n_wall·v < w_wall`. The two disagree wherever `0 < n_wall·v < w_wall`, and the code then calls a facing
    gap clear.
  - **Run at the function:** the build's weighted test walls at weights (2, 1) give `v = (2, 0.25)`, called clear, with
    `n_wall·v = 0.25 < 1`; unit weights with gap normals at ±30° and the wall's at 60° give 0.577 < 1, called "0 of its
    1 gaps face"; the grazing gap G has `n_wall·v = 0 < 1` and is refused as grazing. The tests at
    `holed-flat-and-third-front.test.ts:475` and `:485` assert those verdicts.
  - **Reach, inferred:** on rectilinear input at unit weights the two tests agree except at `n_wall·v = w_wall` exactly,
    so no measured sample reaches it. The code's facing set is a subset of the true one: the error is a refusal where a
    cure exists, or, if two gaps truly face, a born gap the front sweeps at once. No real-input specimen was
    constructed. Antiparallel gap walls keep the sign test.
  - **`node-off-stretches` is unreachable:** every node holds a member, every node's block of members is entered by a
    segment ending there, and every piece pair becomes a stretch or is refused under `stretch-cover-count` first. The
    same walk makes `not-a-tree` enforce the tree alone.
  - **The area's sign decides nothing in the built code:** `signedArea` is read in `flat-rings.ts` only through
    `Math.abs` at `:400`. But the flat rings of `2h-int-1`, `2h-int-1w`, `2h-int-86`, `144` and `371` have area exactly
    0 and every jittered candidate is negative, so a mutant refusing positive-area candidates passes every core test.
    Under a turn or a translation the area of `2h-int-1` and `2h-int-1w` takes either sign, to about 1e-15.
  - **A mis-paired ring passes the flatness test, run:** swapping two collinear, same-facing, equal-weight walls in the
    hand-built base-line ring gives `flat: true` with a stretch on the wrong wall. Unequal weights separate the fronts
    and decision 13 catches it. Not constructed from a real input.
  - **Refusals under decision 44 leave the layer untouched,** by reading `algorithm-complex-cases.ts:856-866`: no token,
    successor, division or array write precedes the throw. No test asserts it, and no decision-44 specimen exists since
    E′ was cured.
  - **Decision 45's filter** (`algorithm-complex-cases.ts:509-510`) changes nothing: the decision-21 clauses read no
    split events.
  - **In the grid fuzz:** `:203` is green on `uniform-1-129` failing; `:199` pins the count of 79 firing draws; the
    helper near `:180` matches "meets a third front", which a decision-31 refusal also says.
  - **Raised and not run:** decision 19 reads a level member's direction from its node and parents, never its basis, and
    the build saw `addBisectionEdge` reverse a near-antiparallel ridge's basis; whether two gaps can truly face one wall
    is unproved.
  - **AMENDED by finding BSA.F118:** Its first claim is disproved: the facing test of decision 36 is right as written.
    The kinematic test refuses a legal weighted specimen the sign test solves soundly, because no inner vertex is
    adjacent to the cut wall's front. The function-level verdicts the review ran are of walls no legal input pairs as a
    gap. Its other claims stand.
- **F118. The sign test of decision 36 is the true test and the kinematic test of BSA.F117 is wrong: a legal input can
  put a gap in the band `0 < n_wall·v < w_wall`, but only a clear gap at unequal weights, and that gap really is born.**
  (a read-only Opus investigation delegate under @D352, 2026-11-16, on 68a00b3; specimen and counts run through a
  logging copy of coincident-events.ts, the argument reasoned; scratch in apps/building-shell/experiments/facing-band/,
  uncommitted)
  - **The specimen, run and hand-checked:** outline [-300,300]x[0,300] with the bottom wall at weight 2 and the rest at
    1; two mirrored triangular holes, (70,60),(190,110),(190,150) and its mirror. At t = 10 both hole corners and the
    bottom front meet at P = (0,20), equidistant over weights from all five walls. The true node has degree 5: two
    arrivals and three departures, {bottom, hole 1 lower} at 15.1°, {hole tops} straight up to (0,170), and {hole 2
    lower, bottom}.
  - **Its two gaps:** the hole bottoms have `v = (0, -13/12)`, `n_wall·v = -1.083`, facing under both tests. The hole
    tops have `v = (0, 1.25)`, `n_wall·v = 1.25 < 2`, in the band: clear under the sign test, facing under the kinematic
    one.
  - **The built code solves it complete with exactly that node,** passing the delegate's independent check of every
    node's equidistance over weights and every edge's direction. The kinematic test refuses it under decision 44(c) as
    "2 of its 2 gaps face". Over bottom weights 1, 1.25, 1.5, 2 and 3, and on an asymmetric variant, the sign test is
    sound throughout and the kinematic test refuses wherever the band is entered.
  - **Why, from the state just before the event:** the runs' dead cones at P lie in the half-plane above the wall's
    front and do not overlap. The outer gap's cone contains the wall's dead side, so `-n_wall` lies in the cone of its
    two normals and `n_wall·v = -(λ·w_a + μ·w_b) < 0` at every positive weight. An inner gap's live sector lies above
    the front, so `n_wall` lies in the cone of its normals and `n_wall·v > 0`. The sign never depends on the weights.
  - **Where BSA.F117's kinematics fail:** after the wall is cut at P its two pieces bound only the two end sectors. No
    inner vertex is adjacent to the wall's front, so where the wall's extended line stands against an inner vertex
    decides nothing.
  - **At equal weights no gap enters the band:** `n_wall·v = λ + μ ≥ 1`, with equality only when a gap wall is parallel
    to the struck wall.
  - **The function-level walls in dispute are not gaps of any legal input.** In the review's examples and in the build's
    test at `holed-flat-and-third-front.test.ts:485`, neither `n_wall` nor `-n_wall` lies in the cone of the gap's
    normals. So decision 35's weight terms cannot change a facing verdict on a legal input; they move only the grazing
    margin, and that test convicts arithmetic on a configuration no solve reaches.
  - **Decision 44(c) has never fired:** 52 calls of `wallFacingGap` on grid 1, 2,064 on grid 2 and 4 on E′ and E′w, each
    with exactly one gap facing; none on the sweep's holed group. Under the premises the outer gap always faces, so "no
    gap faces" means a premise has failed. The grids are rectilinear at equal weights and could not have reached the
    band.
  - **The antiparallel exemption carries weight:** on two of BSA.F115's four V cases the clear antiparallel gap has
    `n_wall·v` of 0.99875 and 0.99955 at unit weights.
  - **Not established:** that the code's gap pairing is the pairing of neighbours in angle is measured on every logged
    call, not proved; the argument excludes flat and grazing geometry; runs of more than one arrival are argued, not
    tested; no suite run; the specimen is checked at skeleton level, not built in building-shell.
- **F119. Building-shell's holed roof path has a sound seam with core, one file with named refusal kinds, and its
  entropy sits around that seam: wall-line geometry copied three times, the refusal carried as a formatted string, and
  the deleted cut surviving in names, comments and two residue classes.** (a read-only Opus review under @D355,
  2026-11-16, on 1503dac; by reading and search, nothing run)
  - **R1, wall-line primitives in three copies:** `algoB.ts:23-94` (the originals), `rise.ts:62-118` and
    `storey.ts:266-275`, each marked "copied (it is not exported)", with a test in `rise.test.ts` holding them equal.
    The pin that forced the copies was released by the holed roof spec's decision 35. One module, `roof/wall-line.ts`.
  - **R2, the call to core is rebuilt outside the seam:** `loopWeights` lives in `algoB.ts:209`, and the grid fuzz test
    calls `solveSkeleton` by hand.
  - **R3, the cause tables mix two key spaces and are typed `string`** (`skeleton.ts:29-73`): core diagnostic kinds
    beside one refusal kind, with `refused()` special-casing it.
  - **R4, an island's refusal reaches callers only as a message** (`algoB.ts:233-236`, `storey.ts:58-66`), and
    `holed-roof.test.ts:153-171` reads it by regex. A typed `IslandRefusal` with the same text.
  - **R5, `facesOfStrips` mixes geometry with result assembly** (`skeleton.ts:110-165`).
  - **R6, dead exports:** `UPSTREAM_MAX_RATIO`, `NodeSet` and `makeNodeSet` in `skeleton.ts`; `storeyBuilding` in
    `storey.ts`; a stale core hash in the header of `skeleton.ts`.
  - **R7, loops traced twice and two ignored parameters on `buildingOf`** (`storey.ts:90-107`, `model.ts:254-276`). A
    further step, taking the selector DSL off the shell path, would remove it from the port's surface at a risk to
    ordering only.
  - **R8, hit counts passed through a type cast, and wall attributes typed `Partial<Wall>`** (`model.ts:142-154`,
    `:228-274`), so a spread could overwrite `id`, `loop` or `edge`.
  - **R9, "walls of loop k" written out four times,** and `compLoops` hand-rolled at three sites in `rise.ts`.
  - **R10, fixtures and catalogue:** production `viewer/main.ts:8` imports `HOLED_REFUSALS` from `tests/`; the viewer's
    listed roster is restated in four places that disagree, `viewer-defects.test.ts:28` omitting the holed fixtures and
    refusals; no one table tells a porter which holed layouts are oracle inputs, known refusals or legacy names.
  - **R11, history in comments and names:** about fifteen sites of "as before", "under the cut", "today's", "free cut",
    and the names `jutCutFixtures`, `JutCutName`, `JUT_CUT_DEFECTS`, none in any golden.
  - **R12, two residue classes that cannot occur** remain in the enum of `golden.ts:213-226`, their retirement recorded
    only in tests.
  - **R13 to R15, smaller:** `triangulate` duplicating `triangulateLoops` and two identical catch blocks in `storey.ts`;
    the per-island solve loop duplicated between `runB` and `solveRoofParts`; the research viewer re-implementing two
    private helpers of `ring-forms.ts`.
  - **Duplicated from core:** which diagnostic kinds are informational is restated in `skeleton.ts:58` because core
    exports no such set; core's refusals are classified by message substring (`skeleton.ts:63-70`, matching 'eight' for
    "weight") because core throws plain `Error`.
  - **Raised as possible defects, not pursued:** the holed roof spec's decision 25 says every hip solid's bottom is at
    the plate, and `storey.ts:241-253` stands holed hip solids from the floor, citing an issue note; `builtSurface` at
    `rise.ts:416` tests the outer loop only.
  - **Not examined:** `roof/cases.ts`, `measure.ts` and `surface.ts` beyond the diff; most of `rise.ts` and the gable
    functions of `storey.ts`. No golden-neutrality claim was run.
- **F120. Core's structure around the holed solver is one 2,393-line file doing five jobs in an import cycle with the
  n-gon handler, a boundary pipeline written three times, and diagnostics in several vocabularies that the dashboard and
  building-shell each restate.** (a read-only Opus review under @D355, 2026-11-16, on 1503dac; by reading and search,
  nothing run)
  - **S1, `algorithm-termination-cases.ts` holds the terminal ladder, the pair and triangle handlers, the step driver,
    the boundary stage and all four entry points,** and imports `handleInteriorNGon` from `algorithm-complex-cases.ts`,
    which imports the ladder back from it. Five modules, no cycle: `terminal-ladder.ts`, the handlers, `step-driver.ts`,
    `boundary-stage.ts`, `solve-entry.ts`; the option and result types to `types.ts`. Code moves only.
  - **S2, the boundary pipeline exists three times:** `runAlgorithmV5` (1803-1822) and `runAlgorithmV5Stepped`
    (2305-2327) carry the same single-loop sequence, and `solveSkeletonObserved` (2000-2116) its general form. The
    context is denormalised by hand twice. Folding `canonicaliseForSolve` in would make it refuse non-finite input,
    which it does not today.
  - **S3, diagnostics:** which kinds block is stated in `types.ts` prose, inline in the solver (2199-2210), in the
    dashboard's `holed-fixture-text.ts:55-81` and in building-shell's `skeleton.ts:58`. Input refusals are plain `Error`
    thrown from about ten sites and classified downstream by substring. A step refusal is pushed as a diagnostic,
    thrown, recorded again as a step failure with the same text, and removed in the dashboard by string equality
    (`skeleton-solve-boundary.ts:204-216`); a typed refusal that is not echoed would remove a diagnostic from the public
    list and move `firstFailedSnapshot`.
  - **S4, wall-time and node-dating primitives copied:** `distanceToSupportingLine` four times, bit-identical;
    `distanceToSegment` twice; dating a node by its first incident edge's clockwise parent twice; the gap on the faster
    wall three times.
  - **S5, the solver imports ring geometry from `random-polygon`, `stroke-spline` and `terrain`,** and
    `strip-decomposition.ts:315` keeps a private `signedArea`. One planar-geometry module makes the port's boundary the
    solver.
  - **S6, the step loop exists three times,** two in core and one in test-fixtures (`test-helpers.ts:61-98`), with two
    observation mechanisms at the same boundary, a per-call observer and the module-global probe.
  - **S7, loop naming and loop tables:** `loopName` in two files; one hole named in three index conventions across
    messages; loop-table validation twice with different messages; the weight-length refusal in three wordings.
  - **S8, `solveSkeletonObserved` is one function of about 225 lines and 12 phases,** and its post-solve checks run in
    three different spaces: causality per sub-polygon in unit space, causality on the simple path in caller space, the
    holed guard on the unit-space graph. Unifying the spaces would move verdicts.
  - **S9, tolerances:** two held `1e-8` bars live outside `constants.ts`, whose header says every tolerance lives there;
    two entries in it are not tolerances; `context.simultaneityWindow` is read by no production code; `constants.ts` is
    about 630 comment lines of 891, much of it measurement history.
  - **S10, `GraphHelpers`:** two members with no caller (`clockwiseVertexAtOffset`, `widdershinsVertexAtOffset`), two
    used by one debug test, and `makeMergedSolverContext` stubbing every member by hand for the legacy entry alone.
  - **S11, the public surface:** the holed API is spread over six sections of the barrel; internal step machinery is
    exported; the outline takes `(vertices, options.weights)` and a hole `{vertices, weights}`; the dashboard still
    calls the two legacy entries on every single-loop path; `AlgorithmStepOutput.errors` is optional and always set;
    per-edge solver state sits in six arrays over three index spaces with no one table saying so.
  - **S12, history in comments:** about a dozen blocks, the longest 70 and 64 lines of dated measurement on one
    predicate each.
  - **An overlap, not a duplication to merge:** the holed guard's time-order check and the causality oracle test one
    property and date nodes by different walls, so one backwards edge on a holed solve yields both diagnostics.
  - **Raised as possible defects, not pursued:** `canonicaliseForSolve` has no finiteness check; the catch in
    `runSimplePolygonStepped` is unreachable for step failures.
  - **Not examined:** `strip-decomposition.ts` beyond the diff; whether tests pin message strings S3 and S7 would touch.
- **F121. Core's event path is one 415-line driver of nine phases in a file of four jobs, a 1,130-line `wavefront.ts` of
  nine jobs, per-layer state held in module-level `WeakMap`s whose lifetime no signature shows, and verdicts typed four
  different ways.** (a read-only Opus review under @D355, 2026-11-16, on 1503dac; by reading and search, nothing run)
  - **E1, `multiRingRefusal` is two disjoint functions and decision 45's filter is vacuous**
    (`algorithm-complex-cases.ts:503-550`): with third fronts present its first two clauses cannot fire, because
    `asWholeEvents` already proved what they test. Split into a whole-layer and a pairwise refusal; delete `:509-510`.
  - **E2, the layer's link state has no visible owner:** pending tokens, successor maps and divisions live in a
    `WeakMap` keyed by the context (`wavefront.ts:86-177`), the step record in another (`:710-725`), the probe in a
    module global. `layerOf` creates a layer nobody settles if a link-writer runs outside `handleInteriorNGon`, and
    `handleCollisionEvent` is exported. An explicit `LayerLinks` and `StepScope`, passed.
  - **E3, the five link-writers are two primitives,** a gap and a cut (`wavefront.ts:450-698`). Each writer's order of
    read, retire and link is a hard constraint: on a ring of two a participant is its own neighbour's neighbour.
  - **E4, `handleInteriorNGon` (`:641-1055`) into seven named phases,** and its file into the driver, `event-order.ts`
    and `whole-events.ts`.
  - **E5, `WholeEvents` keeps two parallel arrays of which exactly one entry is defined,** joined to third fronts by
    index; a placement union removes three `!` and a nested ternary.
  - **E6, the event types are looser than every producer:** `collidingEdges` is always two, and every split carries its
    struck segment. Exact types delete four dead branches, among them `collision-handling.ts:41-44`, `:92-101` and
    `:122-124`.
  - **E7, refusals are `string | T` unions told apart by `typeof`** in `gapDirection`, `wallFacingGap`, `ThirdFront` and
    `multiRingRefusal`, with a fourth idiom in `flat-rings.ts`. One `Verdict<T>`.
  - **E8, ordering primitives written twice or more:** the lexicographic edge-id compare, the arrival comparator at five
    sites, the moment partition, the priority compare; `byEventPriority` only ever sorts splits, so its priority clause
    never decides.
  - **E9, `wavefront.ts` by job:** links, ring components, the checker and probe, the step scope.
  - **E10, ring reading duplicated across the layer's tail:** rings among a set three times, the degenerate-area test
    twice, the ordering of children twice, a polygon recomputed by its callee.
  - **E11, seven hand-rolled ring walks, each with its own cycle guard,** two of them the magic numbers 8 and 64.
  - **E12, `generate-split-event.ts` restates the split pricing and the event literal three times;** the distance from a
    wall's line is spelled three ways across three files.
  - **E13, `coincident-events.ts` is pure clustering in its first half and link mutation in its second.**
  - **E14, `levelFailure` in `flat-rings.ts:269-302` is a test that mutates the plan it tests.**
  - **E15, history in comments,** one stale outright: `wavefront.ts:71` says partitions are sorted by span, and they are
    sorted by `partitionArc`.
  - **E16, vestigial surface in `collision-helpers.ts`:** `NO_COLLISION_SENTINEL` is never written; the
    simultaneity-window trio has no production caller; `createCollisions` returns per-edge lists its one caller
    flattens.
  - **E17, the layer window's `bestArrival` update is unreachable on a consistent sort;** replacing it risks rounding on
    weighted input.
  - **The facing verdict cannot be read from the arrangement as a behaviour-preserving change:** `wallFacingGap` has
    three refusal outcomes an arrangement cannot reproduce, and the struck segment can lie on a ring neither run
    touches. It could stand as an assertion beside the velocity.
  - **`gapDirection` solves the kernel by Cramer's rule and `addBisectionEdge` by `makeWeightedBisectedBasis`,** whose
    doc rejects Cramer as 0 to 3 ulps off, so the verdict is taken on a direction not bit-for-bit the bisector's.
  - **Raised as possible defects, not pursued:** `flat-rings.ts:100` and `:155` cluster and cut at `<= floor` where the
    package rule is strictly below; the `arrivals.length < 2` test at `algorithm-complex-cases.ts:905` appears vacuous
    on a sound wavefront.
  - **Not examined:** the error-budget arithmetic of the collision and split files; no spec was consulted for the
    decision numbers cited in comments.
- **F122. The tree after the entropy pass verifies independently: every suite at the writers' figures, all ten sweep
  files byte-identical to the baseline taken on `1503dac`, and every mutation gate of the flat-ring spec's decision 55
  red on the restructured code.** (an independent Sonnet verifier on 07c9f41 (the code of ae63ed7), 2026-11-16; its own
  runs, mutations in its own copy)
  - **Suites:** core 6,714 passed, 8 failed, 10 skipped; building-shell 9,886 passed, 1 failed; dashboard 609. Typecheck
    clean on core, test-fixtures and building-shell; the dashboard's 4 errors are all in `DolProductionComposer.tsx`. No
    difference from the implementers' figures.
  - **The nine red tests are the nine of BSA.F116,** each named by an issue note whose status is open: five in
    `weighted-time-order.test.ts`, three in `straight-bisector.test.ts`, `uniform-1-129` in `holed-grid-fuzz.test.ts`.
    No failing test is without a note.
  - **Sweep:** the verifier re-hashed the baseline's own files against its README first, then regenerated; all ten match
    on the full SHA-256.
  - **Gates, each site found by what the code does:** one successor only in `cutSegment`, either one dropped, 3 grid
    tests red; choosing the clear gap, 10 red; refusing positive area, 4 red, and negative, 2 red; `n_wall·v < w_wall`
    for the sign test, with and without the grazing refusal, 5 red; each of the 12 clauses of `flat-rings.ts`, its own
    unit test red; dropping the weight from the front's offset, 3 red; refusing a third front in place of resolving it,
    8 red in core and 36 in building-shell's `holed-fixtures.test.ts`; running the flat rule on one-ring steps, 5 pinned
    digests red. No gate stayed green.
  - **Not separated:** with `stretch-cover-count` dropped, its test's red may be a `TypeError` thrown downstream and not
    a wrong verdict. The slow sound-roof tests of the grid fuzz were not run under the first gate's mutant.
  - **Structure, by a compiler-API pass over the 47 files of the solver, 211 imports:** no cycle between
    `algorithm-complex-cases.ts` and any of the five termination-side modules; one runtime cycle in the folder,
    `collision-helpers.ts` with `generate-split-event.ts`, which predates the pass; eight more closed only by type-only
    edges. No file of the solver imports from `random-polygon`, `stroke-spline` or `terrain`.
  - **One claim does not hold: building-shell's `src` still imports from `tests/` in six places,** all under
    `src/viewer/`: `GOLDEN_FIXTURES` in `main.ts`, the pin table, the residue pins and the robustness fixtures in
    `pinned-cases.ts`, a type in `defect-sources.ts`. R10 moved only `HOLED_REFUSALS`. Nothing outside the viewer does.
  - The tree's tracked files were unchanged by the run.
