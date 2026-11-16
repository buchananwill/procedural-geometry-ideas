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

**Session 5 was cut short on 2026-11-15 by the user's reboot, with the implementer of BSA.D348 still running and not yet
reported.** Branch `feature/skeleton-holes`, nothing pushed or merged.

**As at 2026-11-16: the build of BSA.D348 is verified on `68a00b3` (BSA.F116) and accepted for review (BSA.D350). An
independent Opus review of `6df75c3..68a00b3` has reported (BSA.F117) and its facing-test finding is disproved by a
specimen (BSA.F118), so the rule stands. The revision is in at `0bee318` and `ad8b323` (BSA.D354), and the build is
complete. Next: the close-out below, beginning with the entropy-reducing pass, on the user's word. The paragraph that
follows is the verification's brief as session 5 left it, now done.**

**First, on resuming: verify the build of BSA.D348, which has no report.**
- Its commits: `8e14378` (flat-ring termination and the third-front rule in core), `17a8d55` (dashboard specimen and
  headings), `3d546a4` (cured layouts into the holed fixtures and goldens), `add41b8` (grid fuzz, the `uniform-1-129`
  issue note, a test of the kernel's weight terms). The spec's status and the facts it settled were committed by the
  lead at wrap as the implementer left them, unreviewed.
- The implementer was waiting on its own last runs when the session ended. **No suite figure, sweep comparison, probe
  count or mutation gate has reached the lead.** Whether it had further uncommitted work is unknown: check `git status`
  and its scratch folder `apps/building-shell/experiments/flat-third-build/`.
- Dispatch a verifier on the tree as found: the suites of core, test-fixtures, dashboard and building-shell, with the
  named red tests; then check the spec's section 6 facts and decision 55's mutation gates against the code. Baseline
  before the build, at `9307395`: core 6,668 passed, 9 failed by design, 10 skipped; building-shell 9,728 passed, 0
  failed; dashboard 609.
- Then an independent review of `6df75c3..` for the build.

**Then the arc's close-out (BSA.D346, as amended):**
1. The entropy-reducing pass over the holed solver in `packages/core/src/straight-skeleton/` and building-shell's holed
   roof path: decomposition, architecture, readability, duplication. Its bar is the suites and oracles; a
   before-and-after comparison of sweep output and digests is its detector, each divergence diagnosed. No sweep output
   is committed (BSA.F114), so the pass generates its own "before" set.
2. Amendments owed to other documents by the build (the spec's section 5): node 5's spec, the three-front and
   zero-area-ring issue notes, the holed roof spec, the dashboard holed spec, CLAUDE.md. And the mixed-pitch issue note,
   whose four tests are green since `ec96bc4`: resolve it with `verified_by`.
3. The merge to `main`, with the user. The branch this one was cut from,
   `feature/building-shell-covered-storeys-and-sections`, is not on `main` either.
4. A handoff document for the C++ port: the delta in rules since the port's last sync, each tied to its decision and
   tests; the nine red-by-design core tests as known defects; the refusals that remain by name; the parity risk of the
   position-based tie-break (BSA.D347).

**Decided this session, by the user:** the nearer-first tie-break and the place order are kept (BSA.D335, BSA.D347); a
test is never green because it asserts a defect, now in CLAUDE.md (BSA.D336, BSA.D337); flat-ring termination with the
third-front rule is the solution for multi-ring steps (BSA.D345); review before merge is an entropy-reducing pass
(BSA.D346).

**Left for the user, none decided by the lead:**
- Converting the legacy pins of `KNOWN_DEFECT_POLYGONS` and core's remaining "still alive" tests (BSA.D337).
- ~~The flat rule on single-loop steps, and the 4-floor stretch bar.~~ Ruled by the user on 2026-11-16 (BSA.D349): the
  rule is extended in its shallow form as its own unit after the merge, the constant kept with a probe. Deriving the bar
  from position budgets stays open.
- The weighted defect, item 1 of session 4's list: BSA.F115 shows the primary-only rule can be relaxed narrowly, at zero
  offset, without the side effects of relaxing it generally.
- The along-edge class with canonicalisation off is still wrong below magnitude 0.1 (BSA.F110); why order matters for
  `plus k4 s47514` at 1e-3 is untraced.
- Node 8, contact between loops: approved spec, not built, no caller.
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
