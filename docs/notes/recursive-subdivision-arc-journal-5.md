---
title: "Recursive Subdivision Arc: Session 5 Journal"
type: workflow
status: active
---

# Recursive subdivision arc — session 5 journal

**This is the head of the thread**, continuing
[the session-4 journal](./recursive-subdivision-arc-journal-4.md). Decisions continue at **139**
(111–138 in the session-4 journal, 53–110 in the session-3 journal, 1–52 in
[recursive-skeleton-subdivision.md](./recursive-skeleton-subdivision.md)); findings continue at
**F59** (F45–F58 in the session-4 journal, F10–F44 in the session-3 journal, F1–F9 in the
session-1 journal).

## Reading order for a fresh context

Read §2 (state), §5 (the register of known unknowns — this session's deliverable), then §4
(next work) and the Decisions and Findings below. For the angular package read
[angular-predicate-basis-decisions.md](./angular-predicate-basis-decisions.md) in full (193
lines; it is the contract). For any register entry's background, follow its citation into the
session-4 journal's decision or finding by number — **do not read the session-4 journal
(~840 lines), the session-3 journal (~1500 lines), the session-1 journal, the design doc or
the decisions files end to end.**

## 1. The arc's charter

Unchanged: recursive skeleton subdivision on branch `feature/recursive-skeleton-subdivision`.
This session's mandate from the user (2026-09-23): **the straight skeleton is nearly
air-tight; inventory what is still open — undefined behaviour, pinned defects and known
unknowns — as the arc lead, delegating to Opus.** The C++ port is now substantially through
its update to this solver's state (F59). See decision 139.

## 2. State as at bootstrap

- Branch `feature/recursive-skeleton-subdivision`, tip `cb43cef`, working tree clean.
  **The branch is now PUSHED**: it tracks `origin/feature/recursive-skeleton-subdivision`
  and is in sync with it (tip pushed 2026-09-11); it is 124 commits ahead of `origin/main`.
  The session-4 journal's "nothing has left this machine" no longer holds (F60).
- Core **5512/5512 (86 suites, 100 s) — measured by re-running at bootstrap**, identical to
  session 4's close. Dashboard **331/331 (24 suites, 7 s) — measured by re-running at
  bootstrap**, identical to session 4's close.
- Corpus 59 (53 clean + 6 defect-rostered), nine weighted fixtures and one recorded ring
  (`OFF_EDGE_JITTER_L_SEED_55433_R021`) outside the rosters — inherited from session 4, not
  re-counted.
- The C++ port's skeleton sources are at `59274a479` (2026-09-23) in the
  `resort_game/claude_work` worktree; its update packages P2, P3a, P3b and P4 have landed
  (F59).

## 3. Operational manual

Carried by reference from the session-4 journal §3 and the session-3 journal §3. Nothing
misled this session's bootstrap. One addition:

- The port's progress is legible from its commit log alone:
  `git -C D:/Coding/resort_game/claude_work log --oneline -- Source/PistePerfect/Private/Geometry/Skeleton`.
  Its package letters (P2, P3a, P3b, P4) are the port's own numbering, not this arc's.

## 4. Next work

To be ruled with the user against §5. The lead's recommended order, pending the user's
steer:

1. **The angular unification package** (§5 C1) — it is the only package whose contract is
   already written and ratified in part, it owns three register entries (A1 identical-source
   exit, A4 triangle/n-gon completion, B4 the `co-linear-from-1` sensitivity are all touched
   by it), and its instrument (the three causality oracles) is the one that can see the
   silent half of the jitter class.
2. ~~**Decision 98's pairing ruling** (§5 A1) — the user's call, outstanding since session 3,
   and the only thing standing between seed 55433 and promotion.~~ **STRUCK 2026-09-23 (F61):
   decision 98 was resolved by decision 102 and its residue cured by F44.** In its place: **the
   I2 promotion ruling** (§5 A1, C3) — whether a sub-floor node pair joined by a real,
   causally-ordered skeleton edge is admissible on the clean roster; that is what actually
   stands between seed 55433 and promotion.
3. **The canonicalisation rebuild** (§5 C2) — design debt with no live failure; it unblocks
   seed 15838 and the near-flat rectangle.
4. **The backlog reconciliation** (§5 D2) — cheap, and it closes an unknown about our own
   documentation.
5. *(added 2026-09-23, decision 143)* **The defect-signature completion package** (§5 C7)
   — run the five defect fixtures through the sixteen clean-only suites and pin what fails,
   so the next promotion is a table flipping. Small; can run alongside item 1.

## 5. Open items — THE REGISTER OF KNOWN UNKNOWNS, compiled 2026-09-23

Every entry names its evidence by journal citation. Four categories: **A** — live defects
with a pinned signature (the solver returns something wrong or refuses, and a test asserts
exactly that); **B** — unexplained observations (something was measured that the model does
not account for); **C** — ruled-but-unbuilt design debt (a decision exists, the code does
not); **D** — documentation and hygiene. The contract fences in §5.E are NOT unknowns; they
are listed so nobody re-opens them by accident.

### A. Live defects, pinned

**A1 — The near-floor off-edge jitter class: four fixtures enrolled, and as of F44 NONE of
them is a known-wrong root graph.** *AMENDED 2026-09-23 (F61): the first version of this
entry said seed 55433 waits on decision 98 and the plus carries three direction violations;
both claims were copied from in-code comments written the morning of 2026-08-29 and
overtaken by F44 that afternoon.* What each fixture is actually enrolled on, read from the
pin tables at the tip (`wavefront-causality.test.ts` `DEFECT_CAUSALITY_SIGNATURES`,
`graph-index-invariants.test.ts` `PINNED_SUB_FLOOR_PAIRS`, `recursive-subdivision.test.ts`
`CENSUS_SIGNATURES`, `along-edge-jitter-known-failures.test.ts`):
- Seed 55433: census 0; causality 0/0/0; I5 0; the boundary stage removes nothing from it, so
  the drift bound is trivially met; reflex-L sweep 0/80. **Enrolled on exactly two I2
  sub-floor node pairs, `[19,20]` and `[24,26]`**, each joined by a real skeleton edge
  (1.9e-7 and 2.8e-7 long in unit space) whose two ends are causally ordered — one event
  creates the bisector the next terminates. Decision 92 and F44 both read these as REAL
  micro-structure, not a solver defect; no event-layer rule can merge them, and node-level
  absorption is the F27-rejected mechanism. **What stands between it and promotion is a
  RULING, not a fix**: the clean roster's I2 bar admits no sub-floor pair at all (C3).
- Seed 55433 k=4: census 7, all decision-96 sliver declines; causality 0/0/0; one I2 pair
  `[27,29]`; an I3 lean of 8.34e-12 at the split-pass medoid (F44, handoff §6) — the one
  number in this class that is still an unexplained solver residue.
- Plus seed 7919: census 15, all decision-96 declines; causality 0/0/0 (the three direction
  violations went under F44, needing both of its changes); no I2 pair. **3 of 80 cells at the
  1e-3 magnitude sweep still fail to solve** (counts 3, 8, 10) — the only remaining
  refuse-to-solve residue of the class, characterised in the test as near-parallel facing
  walls a few epsilons off parallel, near-head-on pairs missing laterally, and n-gon
  partition failures. The coaxiality lane (F58) has not been re-measured against these
  three cells.
- Seed 15838: census 0; causality 0/0/0; one I2 pair `[19,21]`; blocked from promotion by
  the recursion's canonical-area drift bound (5.17e-7 against 1e-14, decision 79) — a
  ruling item (C2).
- **What detects a silent wrong answer if the class returns:** the causality oracles and
  the I2/I5 pins, never `complete`. Decision 138(a) measured what loosening a predicate
  does without those oracles as the instrument: twenty pins move to `complete: true` with
  EMPTY diagnostics while the oracles still count violations.

**A2 — The two large-coordinate cells: Circle 48 at translation 1e10, Rosette5 40 at 1e11.**
`large-coordinate-known-failures.test.ts`. One defect, not two: both die in
`handleInteriorEdgePair` because `intersectRays`' `identical-source` exit is an absolute
`FLOATING_POINT_EPSILON` against a source separation of 1.72e-8 and 5.99e-8 in unit space.
Signalled (`step-failure` + `unresolved-edges`), accepted by construction (decisions 66/81:
under two ulps of the quantised input, 5.6e-5 px on a 4K render). **Decision 138(a) reopened
the exit's bar under the angular package** with the causality oracles as the instrument —
moving it to the floor naively makes A1's silence worse. The port's own queue carries the
same cell (`NEAR_REGULAR_CIRCLE_48@1e9` in its arithmetic) as "a coincident-event degeneracy
rather than a tolerance problem" — a different diagnosis from ours, unreconciled (D4).

**A3 — The along-edge-jitter plateau cell (k=4, seed 47514, 1e-3, boundary stage off) now
completes with two direction violations where it was `unresolved-edges`.** Pinned as moved
2 → 1 and flagged at the site by decision 138(b): the configuration already carried the same
violation at k=7 before the coaxiality change, so it is not a clean baseline; no corpus
fixture moved.

**A4 — The triangle and n-gon handlers can reach "live edges, no event" and THROW; only the
pair handler has A19's completion.** Decision 138(d). Not observed on the corpus (the
completion fires nowhere, F58); the throw is the signalled failure, so this is a known hole
with no specimen. **RULED 2026-09-23, decision 145: the terminal ladder is edge-count
independent; lands in C1.** Candidate specimens: the plus seed's three failing sweep cells.

**A5 — ~~The four sub-floor node pairs (I2) and~~ decision 92's presentation contraction.**
*The I2 half CLOSED 2026-09-23 by decision 141/142: the pairs are admitted by the restated
invariant and the pin table is retired.* What remains is the optional presentation-layer
contraction for consumers that do not want sub-visible edges. Standing, optional.

**A6 — Seed 55433's skeleton topology depends on the scale it is solved at: four nodes
present at scale 1 are absent at scale 7, and the in-edge ordering differs (F62).** Found
by the refused promotion; unmeasured on it before because the scale sweeps run the clean
roster only (decision 143). Hypothesis in F62 (the two sub-floor pairs merging at scale 7)
is unmeasured. A6 gates 55433's promotion alongside C2. Likely the same class as B2.

### B. Unexplained observations

**B1 — r0.2.1's scale ladder: cells 1, 1e3 and 1e6 failed while 10 solved (F57; spec I8).**
Recorded before the coaxiality cure and never re-run after it. The spec says "moot if A15's
fix cures all four cells" — that has NOT been measured. If any cell still fails after
`7af0695`, it is a second mechanism.

**B2 — Four of 59 digest pins move under a power-of-two rescale (F49).** Shifting the
normalisation exponent by one moved exactly four fixtures; the finding attributes them to
"where the absolute 1e-8 / 1e-6 bars bite" but does not NAME the four or verify that each
carries a near-bar configuration. A solver whose predicates are stated in unit space should
be exponent-invariant except where a bar bites; the four are the census of where it does.

**B3 — F38a was cured "without anyone noticing" (F55).** Seed 55433's r0.3.1 region, the
exhibit that drove the root-floor package for two sessions, now solves raw and canonical. F55
attributes the cure to the F40/F44 causality work by elimination, not by bisect. An
unattributed cure is decision 72's other failure mode; the commit that cured it is
identifiable by bisecting the recorded region.

**B4 — W33's equi-time check, when built, fires on near-anti-parallel corridors at UNIT
weights and moves the failure register both ways (decision 126).** With the soft consequence
it produced an UNATTRIBUTED CURE (Rosette5 40 at 1e11, 2 → 1 unresolved) and shattered the
48-way cluster at 2e10 from 11 to 12 nodes. That two mid-lines of a corridor carry constant,
slightly DIFFERENT times at unit weight is itself the unexplained part: in exact arithmetic
they are equal. The branch is left as it was; the sensitivity stands.

**B5 — The A3 cross-product error constant `4u` is estimated, ±22% (spec I6).** The derived
angular resolution moves between 2.17e-5 and 3.07e-5 depending on whether it is 3u or 6u,
and A23 pins the derivation to the last ulp. It should be argued before it is pinned.

**B6 — Circle 48's non-monotone translation envelope (1e9 passes, 1e10 fails, 1e11 passes).**
The site is known (A2); the non-monotonicity is attributed to centring quantisation
(decision 81) but the specific arithmetic that makes 1e11 pass again has not been written
down.

### C. Ruled-but-unbuilt design debt

**C1 — The angular unification package**, spec A1–A8, A11–A14, A16–A18, A20–A22, with O2–O5
to rule at ratification; plus decision 138(a) (the identical-source exit re-measured with
the causality oracles) and 138(d) (triangle/n-gon completion). O2: does
`solveParallelClosure`'s parent gate follow the resolution or stay at 1e-8 (decision 107(a)
measured it load-bearing at a value that doesn't transfer). O3: `MIN_WEIGHT_TURN_SINE`
follows, re-derives, or freezes. O4: can the `ANTI_PARALLEL_CORRIDOR_*` family be a ring
alone (measured negative three times; a fourth construction via a deliberate
near-simultaneous coincidence is conceivable). O5: does the WHOLE positional epsilon follow
the floor — a census of `areEqual` default-epsilon sites decides (a) four sites or (b) all.
Falsification bars A25 1–5 stand. STOP 1 (r0.2.1 still failing after A15 alone) is already
discharged by F58 — the spec should say so.

**C2 — The canonicalisation rebuild under decisions 132/133.** Criterion in the region's
frame (predicate margin), licence at the root (perceptual floor, cumulative deviation),
postconditions per removal (no new sub-bar turn, sub-floor edge or C1 topology change; a
removal that would is declined), the monotonicity sweep as the standing conviction. **The
drift bound's exact form as the licence is the remaining RULING** (decisions 76/79's
exhibits). Acceptance fixtures: the near-flat rectangle (decision 76) enrols; seed 15838
promotes; F27's sliver-ratio table (ratios to 5e5) survives. No live failure drives it.

**C3 — ~~Decision 98's pairing rule.~~ ~~The I2 promotion ruling.~~ CLOSED 2026-09-23 by
decision 141 (ruled) and 142 (landed).** I2 admits a sub-floor pair joined by a
causally-ordered edge; the pin table is retired. Seed 55433 did NOT promote: it fails six
clean-only bars (F62), and its promotion now waits on C2 (the drift bound) and A6 (the scale
residue). Replaced by **C7 — the defect-signature completion package** (decision 143): run
the five defect fixtures through the sixteen clean-only suites and pin what fails.

**C4 — Weighted-offsets residue** (decisions 126, 128, 129; F53). The unequal-wall corridor
fixture that reaches `co-linear-from-1` (the only thing that can reopen W33); the
`MAX_WEIGHT_RATIO` discriminating fixture (two arrivals `~R·1e-8` apart on a fast edge — the
ladder moved nothing because no fixture can exhibit the hazard); W39(i), I3's weighted
restatement; W46's second landing (sub-region weights, behind C2); `findOffsetViaIncenter`
renamed for its linear-form body; spec residue (`arrivalsAreSimultaneous` →
`areSimultaneousArrivals`; W52(i) 4 ulps → 3; the digest header's W33 sentence).

**C5 — A dashboard defect specimen constructed on purpose** (decision 138(c)). The explorer's
failed-cell tour has no specimen since r0.1.3 went extinct; the specimen-dependent tests
assert the extinction. Design act.

**C6 — Unmeasured bars.** `FRONTAGE_VERTEX_FRACTION` and `RAY_SEGMENT_DETERMINANT_EPSILON`
(F42); `graph-merge.ts:110`'s caller-space epsilon (measure the residue). Decision 107(b)'s
discriminating fixture is DISCHARGED by the recorded ring `OFF_EDGE_JITTER_L_SEED_55433_R021`
(F55, F58) and can be closed.

**C7 — The defect-signature completion package** (decision 143). Run the five defect
fixtures through the sixteen clean-only suites; pin what fails with attribution. Small.

**C8 — The tolerance derivation package** (decision 144). *Gains four named sites from
F64, each with a measurement showing the floor is the WRONG derivation there and the
detector role must be kept or replaced: the identical-source exit, `makeOffsetDistance`'s
noGradient, `addBisectionEdge`'s zero-rate (D14 now open in reverse), and the two
point-on-ray sites.* Re-read
[tolerance-unification-audit.md](./tolerance-unification-audit.md) against the bar "derived
from δ or from u, and coherent across predicates"; produce the derivation per site as a
decision spec; retire `FLOATING_POINT_EPSILON`; re-derive `MAX_WEIGHT_RATIO`; the
simultaneity window is the site expected to move the digest most. Empirical contract per
decision 134. Sequenced AFTER the angular package's first dispatch and BEFORE its positional
sweep.

**C9 — The causality-diagnostics package** (decision 148). The three oracles move into
`solveSkeleton` as `causality-violation` diagnostics, always on, tolerance derived from the
context's floor; test tables assert solver and test-oracle counts agree; D7 resolves
inside it. Lands before dispatch 2 and before C8.

### D. Documentation and hygiene

**D1 — The C++ handoff's figures and boundary are stale.** §7 quotes core 5249/5249 at the
session-4 bootstrap (now 5512); its angular section predates the coaxiality lane (F58's
paragraph was to be added before sending); and the port has ALREADY consumed P2–P4 including
the coaxiality lane (F59), so the "send" item is overtaken — the live question is what the
port has NOT yet taken (weighted offsets §8, and whatever lands from C1/C2).

**D2 — `solver-hardening-backlog.md` has not been reconciled against the tip.** Item 1 is
annotated closed; items 2–9 carry 2026-08-09 measurements. Item 7 (strip overlap on
collinear input) was closed by decision 90; item 4 (terminal many-way projection) by F14;
item 2 IS A1. The file is the map and the map is a month stale.

**D3 — Demo lint: one pre-existing error and one warning** (`dol-system/page.tsx:51`,
`AppShellLayout.tsx`, F54). Trivial.

**D4 — Fixture index exports 67 constants against a corpus of 59; eight unenrolled where
decision 73 accounts for seven** (F46, handoff §9). One fixture unaccounted for. And the
port's diagnosis of the Circle 48 cell ("coincident-event degeneracy") differs from ours
(A2); the divergence register should say which is right.

**D6 — Two in-code comments still say seed 55433 waits on decision 98, and are wrong.**
`recursive-subdivision.test.ts` at the `CENSUS_SIGNATURES` entry ("Promotion waits on
decision 98's pairing rule") and the fold-fix paragraph above it ("its root still carries
the crossed pairing of decision 98") were written under decision 100 on the morning of
2026-08-29; F44 emptied I5 that afternoon and the I5 header in
`graph-index-invariants.test.ts` records the cure, but the census comment was never
re-pointed. This is how the lead's first register entry went wrong (F61). Trivial to fix,
worth fixing.

**D7 — The causality oracles exist twice in the test tree**: `causalityViolations` in
`wavefront-measurement-helpers.ts` (added under decision 147(h)) and the private originals
in `wavefront-causality.test.ts`, same definitions, same 1e-6 tolerance. Point the suite at
the helper. Trivial.

**D5 — The two journals' close-handoffs disagree on push state**: session 4 said nothing had
left the machine; the branch was pushed the same day after the close (F60).

### E. Contract fences — NOT open, listed so they stay closed

- Zero and infinite weights (decision 112(e)); `MAX_WEIGHT_RATIO = 100` (119, 128).
- A weight change at a vertex below `PARALLEL_GATE_SINE_BAR` is REFUSED (124(b)): weights
  may change only at a visible corner. No riser convention (121, 123 superseded).
- The roof base lies in a single plane; dormers and anything else that violates it are
  stitched features, not solver input (124).
- Decision-96 sliver declines are correct behaviour, not defects.
- The two large-coordinate cells are accepted by construction (66, 81) unless C1 cures them.
- Unit weights must reproduce the corpus bit-identically, no branch on unit weights (112(d),
  115, W36).

---
## Decisions

**139 — (user, 2026-09-23) Session-5 mandate: the solver is nearly air-tight; inventory
what is still open — undefined behaviour, pinned defects and known unknowns — from the
journal, as arc lead, with Opus as the delegate model.** The user's words, near-verbatim:
"The straight skeleton algorithm is nearly air-tight. Can you read up on what are still open
UB or defects according to the journal, AKA known unknowns. You will be arc lead. Use Opus
for delegates. The C++ port is now substantially through the update to the state of this
Typescript solver." Lead's reading: the deliverable is the register at §5, compiled from the
session-4 journal, the angular spec, the defect roster's own headers and the port's commit
log, every entry cited; no code is touched until the user picks from it.

**140 — §5 of this journal is THE register of open items for the arc, and supersedes the
scattered lists it was compiled from.** The session-3 §4/§5 lists, the session-4 §4/§5
lists and the handoff's §6/§7 each carried a partial view, and each has since been overtaken
by at least one cure (F38a, r0.1.3, r0.2.1) that the others did not record. From here an
item is open if and only if it is in §5, and it leaves §5 by a cited cure or a cited ruling,
struck in place. Decision 107(b)'s fixture is the first entry closed this way (C6).

**141 — (user, 2026-09-23) The precision floor is a BOUNDARY CONDITION on what the solver
cannot decide, not a filter on what it has well-definedly produced; a sub-floor node pair
joined by a causally-ordered skeleton edge is admissible on the clean roster, and I2 is
restated accordingly.** The user's words, near-verbatim: "The purpose of a precision floor
is to give the solver a well-bounded space that admits no UB, and produces sufficient
precision for the project's aims. It doesn't _require_ that we reject solution elements
which are well-defined through the solver's abstract contract, AND the operational precision
of the language; it gives us a boundary condition for things which aren't well-defined."
Lead's sharpening, agreed: the floor decides QUESTIONS (same event, same direction, same
line) where the arithmetic cannot; a node born of two separately-decidable events in
different offset layers is an ANSWER, and the spatial separation of two such nodes is an
output property, not an undecidable question. Consequences: (a) I2 becomes "no two nodes
inside the coincidence floor of each other UNLESS a skeleton edge joins them and its two ends
lie in different offset layers" — the exemption keeps a genuine doubled node (no joining
edge, or both in one layer) as a violation, so the detector loses nothing it was built for;
(b) `PINNED_SUB_FLOOR_PAIRS` is retired through the cure flow — each of the four pairs is
asserted to satisfy the exemption, then the table goes; (c) seed 55433 PROMOTES to
`CLEAN_TEST_POLYGONS` on its present numbers (F61), with every sweep that asserts "clean
means zero" applied to it and its census/causality/I2 signature rows deleted; seeds 15838
and k=4 stay enrolled on the drift bound and the I3 lean respectively; (d) decision 92's
presentation contraction is unchanged and stays optional. Convict by mutation: an unjoined
sub-floor pair, and a joined pair from one layer, must each fail the restated I2. Closes
register item C3.

**142 — The I2 package's STOP is RATIFIED: parts (a), (b) and (d) land (I2 restated with
the exemption, the sub-floor pin table retired through the cure flow, the stale decision-98
comments corrected); seed 55433 is NOT promoted, and its enrolment reason is re-attributed
from I2 to the six clean-only bars it was measured failing (F62).** Decision 141's
consequence (c) was conditional on the fixture passing every clean bar; it does not, and the
delegate correctly softened nothing and rolled the roster move back by inverse edit. The
delegate's seven interpretations are adopted, including the offset-layer primitive
(`compareArrivals` at the coordinate epsilon over unit-space arrival distances from the
causality suite's own oracle, now shared as `deriveNodeArrivals`) and the historical pairs
kept as a named list read only by the four history tests. Consequence (c) is re-gated:
55433 promotes when the drift bound is ruled (C2) AND its scale residue (A6) is cured or
ruled.

**143 — A defect fixture's SIGNATURE is incomplete by construction until every clean-only
sweep has been run over it, and that measurement is a package of its own.** Decision 72's
doctrine ("clean fixtures assert clean, defect fixtures assert exactly their signature")
was applied only to the twelve suites that sweep `FULL_CORPUS`; sixteen suites sweep
`CLEAN_TEST_POLYGONS` alone, so a defect fixture is simply absent from them and its
signature there is unmeasured, not zero. That is how F61 could say "the sole thing keeping
55433 enrolled is I2" and be wrong on six other bars. Ruled: the five remaining defect
fixtures are run through every clean-only suite's sweep, and whatever fails is pinned as
signature with attribution, exactly as the FULL_CORPUS suites do — so the next promotion
attempt is a table flipping, not a discovery. A small Opus package, dispatched on the user's GO after
the verification of 142's tree.

**144 — (user, 2026-09-23) `FLOATING_POINT_EPSILON = 1e-8` was a deliberate first
tolerance and is now UNIVERSALLY SUPERSEDED: retaining it anywhere would be a cargo cult,
not a Chesterton's fence; every tolerance in the solver is derived from a stated quantity
in a stated category, with the predicates coherent in what they call signal and noise.**
*Clarified by the user the same day: "1e-8 was a deliberate choice, and not a totally naive
one. Totally naive would have been magic numbers everywhere, or a threshold that didn't
work even for the simpler cases I started with. It is, nevertheless, a choice universally
superseded." The lead's first strike text called the choice itself a cargo cult; that was
the lead's misattribution, corrected in both journals.* The user's words, near-verbatim: "The raw 1e-8 epsilon was my scratch global
constant I carried in from UE when I started working on the solver. At the time, I hadn't
learned very much about the details of ulps and just how fiddly this algorithm can get,
especially when a madman like me wants it applied recursively. Retaining it anywhere is not
a Chesterton's Fence, it's a cargo cult. There should be a more rigorously-grounded
tolerance for every situation, and they should be coherent in the results the predicates
produce from them." Lead's reading, recorded as the consequence set: (a) two legitimate
sources for any tolerance — the client's perceptual floor δ for "visibly the same"
questions, the double's unit roundoff u = 2⁻⁵³ for "arithmetically distinguishable"
questions; a bar derived from either is grounded, a literal is not. (b) The constant is
RETIRED, not narrowed: spec A6's "1e-8 survives where it is a genuine coordinate-arithmetic
guard" is amended — those sites re-derive from u and say so; spec O5 is RULED as option (b),
sweep every site, but as its own package, not inside the angular one. (c) Constants derived
from the epsilon fall with it: `MAX_WEIGHT_RATIO = SKELETON_NOISE_FLOOR /
FLOATING_POINT_EPSILON` (decision 119) is re-derived. (d) Session-3 decision 54 ("1e-8 is a
deliberate choice — the Unreal Engine small-number constant") is SUPERSEDED, not struck:
the choice was deliberate and is now outgrown, noted in place; its "can you see it on a
screen" criterion stands as the perceptual source. (e) The empirical contract is decision 134's: every solving fixture keeps
solving; the digest may move with every pin attributed; no defect signature worsens. The
simultaneity window (`fp_compare` at 1e-8, ~1e8 ulps wide) is the site most likely to move
the digest broadly and is accepted under that discipline unless the user fences it. (f)
Sequence: the tolerance audit of decision 101
([tolerance-unification-audit.md](./tolerance-unification-audit.md)) is re-read against the
new bar — "named" was its bar, "derived and coherent" is this one — producing a derivation
per site BEFORE any code; then the angular package (C1) lands on the derived resolution;
then the positional sweep as its own package. Register: O5 closed as ruled; new entry **C8 —
the tolerance derivation package**.

**145 — (user, 2026-09-23) The terminal ladder is INDEPENDENT OF EDGE COUNT: an n-gon
whose live edges meet at a point is a generalisation of the triangle, and the solver refused
it the same handling only because the original characterisation of the terminal cases was
too simple.** The user's words, near-verbatim: "an n-gon that meets at a point is a
generalisation of a triangle. The current solver refuses to treat it as a candidate for what
is loosely a form of tie-break, only because my original characterisation of the terminal
cases was too simple." Lead's sharpening, agreed: the ladder has two rungs of different
character. The CLOSURES (`solveDegenerateClosure`: every live edge closes on one source at
one shared offset; `solveParallelClosure`: every live vertex travels the same way, no future
event) are statements about the whole live set and terminal solves; the COMPLETION (decision
136 / spec A19: a bounded wavefront with live vertices must have a next event, so a no-event
state is a predicate refusing one that exists — price the anti-parallel pointing-together
pair of smallest symmetric lateral offset as head-on and record `coaxial-completion`) is a
recovery from refusal. Today the pair handler runs both rungs, the triangle runs the
closures only, and the n-gon runs neither and throws on an empty collision list. Ruled:
every handler runs the same ladder — closures, then completion, then the throw ONLY when no
candidate pair exists. Decision 78's many-way clustering is unaffected: it handles arrivals
that are found and coincide; this ruling covers the state where no arrival is found at all.
Evidence to check at implementation: the plus seed's three failing sweep cells (counts 3, 8,
10) are characterised as near-parallel walls, near-head-on pairs missing laterally, and
n-gon partition failures — likely specimens of these throws, unverified. Convictions: the
completion and each closure fire on a constructed n-gon and a constructed triangle; the
corpus firing count is reported (expected zero, F58's pattern); decision 134's empirical
contract and the causality oracles apply. Lands inside the angular package (C1); closes
register item A4 and the 138(d) carry-over.

**146 — (user, 2026-09-23: "commit the work that is completed, then dispatch the next WU")
The I2 package is committed as `dce819b` and the record as `7faae16`; the angular package
is dispatched to Opus as DISPATCH 1 of two, with this scope.** IN: the derived resolution
(spec A1–A8) with the `4u` error constant ARGUED in the constant's doc comment and the
formula, not the number, pinned (I6); `DIRECTION_SINE_BAR` and `PARALLEL_GATE_SINE_BAR`
retired as constants, every production site in the roster taking the context's
`angularResolution` or a required parameter (A15's angular rows; `sineIsBelow` and
`directionsAreSame` lose their defaults); the ordering and partition (A11–A14) with the
sine-partition sweep; the four positional sites moving to `coaxialityFloor` — point-on-ray
in `tryAttachEdgeToNode` and `solveDegenerateClosure`, the split-event end classification,
and the identical-source exit ONLY under decision 138(a)'s instrument (all three causality
oracle counts stay at zero on every fixture, and no solve goes from a signalled failure to
`complete: true` with empty diagnostics — otherwise it stays and the measurement is
reported); `meetHeadOn`'s division-safety test re-derived from `u` per decision 144;
`MIN_WEIGHT_TURN_SINE` frozen as its own named constant at today's value with the alias
removed, tagged for C8 (O3 ruled (c) interim); O2 MEASURED both ways on the jitter cells
and ruled by the delegate's numbers (follow the resolution unless a cell worsens); decision
145's edge-count-independent ladder in the triangle and n-gon handlers, convicted on
constructed shapes, with the plus seed's three failing cells re-measured and attributed;
A23's instruments; A25's STOP conditions 2–4. OUT, for dispatch 2: A16's anti-parallel arm,
A24's fixture family, O4. OUT, for C8: every other positional epsilon site. OUT: C7.
Baseline `7faae16`, core 5519/5519, dashboard 331/331, digest 59 pins.

**147 — Rulings on dispatch 1's escalations.** (a) **The cross-product rounding constant
is k = 2, ADOPTED**, with the delegate's argument (two correctly rounded products, one
rounded subtraction, `|P| + |Q| ≤ 1` by Cauchy–Schwarz, so `|ĉ − sin θ| ≤ 2u + u²` at every
angle; the spec's 4u charged the operands' normalisation error, which a backward-error
bound on the division's amplification must not). Lead-checked line by line. The default
resolution is therefore `1.7721e-5` at δ = 1e-6 (was 2.506e-5 in the spec) and the
crossover `5.39e-6`; spec A3–A5 are amended to the derived constant. (b) **The stroke-derived
L at k = 10 with canonicalisation off is NOT an attributed cure**: it went from a signalled
failure to `complete: true` with empty diagnostics while its one direction violation (e163)
stands bit-unmoved — the loud-to-silent pattern decisions 72 and 138(a) name as a
worsening. The precedent the delegate cited (the plus root under decision 78) predates that
ruling. Ruled as decision 138(b) ruled the plateau cell: the cell is pinned as MOVED and
FLAGGED, and its direction count is pinned in the same test so the defect is loud through
the oracle instead of through `complete`. (c) The two unpinned oracle worsenings the
delegate reported (plus off-edge k=10 seed 23757 under the parent-gate move: +1 offset, +1
direction, still complete; Circle 32 jitter 1ε seed 5 under the `ensureBisectionIsInterior`
move: offset 1→2, clearance 6→4, direction 2→1) are PINNED as flagged moved cells with
their counts, for the same reason — an oracle count that moves and is not pinned is exactly
the silence the corpus doctrine exists to prevent. (d) The three STOP reverts
(`makeOffsetDistance` noGradient, `addBisectionEdge` zero-rate, the two point-on-ray sites)
and the identical-source revert under 138(a) are RATIFIED; each site keeps the coordinate
epsilon with the measurement in its comment, and each becomes a named C8 item (F64). (e)
Interpretation 3 — the `co-linear-from-1/2` exits at `angularResolution` where spec A15's
row says `coaxialityFloor` — spec A15 governs; it lands in DISPATCH 2, which owns the
anti-parallel arm that exercises those exits, not as a patch here. (f) O2 RULED by the
measurement: the parent gate follows the resolution (one cell moves, plus k=3, step failure
→ complete with all oracle counts zero — a clean cure; nothing worsens). (g) The other
interpretations (1, 2, 4–8, 10–14) are adopted; in particular the n-gon completion feeds the
priced pair into the normal event layer and the triangle terminates on it, and
`findCoaxialCompletion` needed no generalisation. (h) *Follow-up landed:* the three pins are
in place with their values (stroke L k=10: complete, empty diagnostics, direction violation
`[163]`; plus k=10 seed 23757: `{offset 1, clearance 0, direction 1}`; Circle 32 jitter 1ε
seed 5: 52 nodes, `{offset 2, clearance 4, direction 1}`), each convicted by reverting its
attributed site. The delegate's flag that the "shared oracle" named in the ruling did not
exist is accepted: it added `causalityViolations(graph)` to the measurement helpers with
the causality suite's definitions; the causality suite itself still uses its private copy —
register D7, a trivial de-duplication.

**148 — (user, 2026-09-23) The causality check moves INTO the solver's own diagnostics:
a solve can never report `complete: true` with empty diagnostics while violating wavefront
causality.** The user's words: "Yes, I approve moving the causality check into the solver's
own diagnostics." Lead's consequence set, ruled: (a) the three test-side oracles — offset
(a node's arrival is consistent with its parents), clearance (no node past its own
clearance), direction (no edge terminating behind its own source) — become a post-solve
check inside `solveSkeleton`, emitting one diagnostic per violation with a new kind
`causality-violation`, the oracle name, the offending node or edge id and the magnitude,
in unit space. (b) `complete` KEEPS its meaning (every exterior edge accepted); the
diagnostic is what carries the wrongness, and the doctrine's "signalled" now means "the
solver said so", not "a test happened to look". (c) The check is ALWAYS ON — it is the
contract, not an option; its cost is linear in the graph and is measured and reported
against the solve time. (d) Its tolerance is DERIVED per decision 144: the context's
perceptual floor in unit space, stated at the site; the delegate reports whether the
counts differ from the test oracles' current 1e-6 on any pinned cell, and any difference
is attributed before the test tables are re-pointed. (e) The test-side oracles are KEPT as
the independent conviction: every pinned table (`DEFECT_CAUSALITY_SIGNATURES`, the flagged
cells of decision 147) asserts the solver's diagnostic count AND the test oracle's, and
they must agree; register D7 resolves by making the shared helper the single test-side
copy. (f) The four F64 sites are re-measured under this instrument: a loosening that
converts a throw into a completion WITH a `causality-violation` diagnostic is no longer
silent, so the STOP-4 verdicts on them are re-opened for C8 to re-rule with the new
instrument — not re-ruled here. (g) The C++ handoff gains this as a stated contract; the
port inherits the diagnostic. Sequence: this package (register **C9**) lands BEFORE C8,
because it is C8's instrument, and BEFORE dispatch 2 of the angular package, because
dispatch 2 loosens the anti-parallel closure and should be measured under it. Convictions:
a constructed graph with a backwards edge yields exactly one direction diagnostic; the
corpus counts equal the test oracles' on every fixture; removing the check kills the
constructed test and every re-pointed pin.

---
## Findings

**F63 — Dispatch 1 of the angular package landed on the working tree: one derived angular
resolution replaces both sine bars at every production site, the digest did not move on a
single pin, and the terminal ladder is edge-count independent.** Delegate figures: core
5560/5560 (86 suites, up from 5519), dashboard 331/331, both builds green, 0 of 59 digest
pins moved (so A21's unit-weight bit-identity holds by measurement). What landed:
`perceptualBound`, `conditioningBound`, `angularResolution` and `CROSS_PRODUCT_ROUNDING_UNITS
= 2` in constants.ts, the resolution stored once on the context; `DIRECTION_SINE_BAR` and
`PARALLEL_GATE_SINE_BAR` deleted; `intersectRays` takes `angularResolution` as a second
required parameter at all ~65 sites; `sineIsBelow`/`directionsAreSame` lose their defaults;
the split-event end classification at `coaxialityFloor`; `meetHeadOn` re-derived from `u`
(`k·u·(wA+wB) + 2u·(|rA·wB|+|rB·wA|)`); `MIN_WEIGHT_TURN_SINE` frozen as its own constant;
the parent gate at the resolution (O2, one clean cure: plus k=3); the ladder (closures →
completion → throw) in all three handlers, with a new `priceHeadOnPair` for the
non-pair completion. The resolution ladder by floor rung: 1.7721e-5, 1.0231e-5, 1.4142e-5,
4.2426e-5, 1.4142e-4 at δ = 1e-6, 3e-6, 1e-5, 3e-5, 1e-4; crossover 5.39e-6. Sixteen
convictions by mutation, each killing named tests. Pins moved: the plus sweep 3 → 2 (counts
[8, 10] remain, both pair-handler throws with bit-identical mid-line bases and parent walls
at sine 1.13e-4 and 6.4e-5 — no candidate pair, so the completion cannot help them); the
stroke-derived L with canonicalisation off [4,7,8,10] → [4,7,8] (flagged, decision 147(b)).
Corpus completion count zero at both floors. **Lead verification on the merged tree, BEFORE the
follow-up edits of decision 147(b)(c): core 5560/5560 (86 suites, 124 s), dashboard 331/331
after a core rebuild — both match the delegate. AFTER the follow-up: core 5562/5562 (86 suites, 107
s), lead re-run — matches. Committed as the dispatch-1 code commit.**

**F64 — At four sites the coordinate epsilon is functioning as a DEFECT DETECTOR for the
large-coordinate and jitter classes, and moving any of them to the floor silences the
detector without curing the defect: every loosening converted signalled failures into
`complete: true` with empty diagnostics while the causality oracles kept counting.** The
delegate's STOP measurements, lead-read: (1) the identical-source exit at `coaxialityFloor`
(138(a) re-measured over 199 cells): corpus unchanged, 32 cells signalled → silent-complete,
68 cells grow an oracle count (Circle 48 at 4e10–6e10: offset 2→8, direction 1→8), 15
jitter cells that solved now fail; (2) `makeOffsetDistance`'s noGradient at the resolution:
seeds 15838, 55433 and k=4 stop solving; (3) `addBisectionEdge`'s zero-rate at the
resolution: orientation-blind, 55433 and the plus stop solving; anti-parallel-only, three
bisectors are born with NEGATIVE rate (plus e48 −8.8e-6, e52 −3.4e-6; k=4 e48 −7.8e-6) plus
direction violations — so D14's cross-site disagreement now stands in the REVERSE direction
(`ensureBisectionIsInterior` moved and held, `addBisectionEdge` could not); (4) the two
point-on-ray sites at `coaxialityFloor`: the snap grows 16 oracle counts and sends Circle 32
3@6 silent; the closure sends four cells silent including Circle 48 at 2e9, which would leave
the pinned failing list while keeping its clearance violation. Reading: these bars are not
laundered perceptual bars after all — at these sites the tight epsilon is what makes a
wrong terminal configuration FAIL LOUDLY instead of closing wrongly, and the floor admits
the wrong closure. Consequence for C8 (decision 144): each of these sites needs a derivation
that either keeps the detector role explicit (a bar derived from `u` because the question
really is "has arithmetic already lost this configuration") or moves the detection into the
solver's own diagnostics so that a solve can never report `complete` with empty diagnostics
while violating causality. The second is a design option for the user, not a ruling.

**F62 — Promotion of seed 55433 was MEASURED and REFUSED: with I2 admitting its two pairs
it fails six bars that only the clean roster runs, and every one of them was unmeasured on
it until now.** Delegate's measurement on the roster move, lead-read from its report (not
re-run; the move was rolled back): (1) the recursion's canonical-area drift bound of 1e-14
— drifts of 1.93e-12 up to 8.11e-6 at depth 0.6 / level 2, a sub-region canonicalised from
5 vertices to 4; the heterogeneous tree up to 1.05e-5 with the tiling identity off by
4.4e-12 and 6.1e-12 at level 1. This is decision 79's exhibit (seed 15838, 5.17e-7) again
at depth, so 55433 joins the drift-bound acceptance set (C2). (2) The pre-residue tree
reproduction differs at merge groups 2 and 3. (3) In-edge ordering differs between scale 1
and scale 7. (4) The skeleton tree at scale 7 is missing nodes 30–33 — four nodes fewer
than at scale 1. (5) The bit-exact normalisation round trip: two coordinates come back one
ulp off at scale 1 / translate 0 (99.99980784323206 → …208), and the per-scale inexact
counts exceed their pins by one at 0.01 and 1e6. (6) Canonicalisation floor insensitivity: 3
fixtures touched where 2 are pinned. Two count pins would also move (offset-event boundary
events 356 → 372, skeleton-tree diameter 30 → 31). Bars (3) and (4) are the sharp new
information: 55433's skeleton TOPOLOGY depends on the scale it is solved at, which no other
clean fixture's does — a scale-7 solve loses four nodes. Lead's hypothesis, labelled as
such and unmeasured: the four missing nodes are the two I2 sub-floor pairs merging at scale
7, where the mantissa change moves their arrivals (1.4e-7 and 2.0e-7 apart in unit-space
offset, 14–20× the 1e-8 window) into one layer or changes which of them the clustering
sees; this would put the residue in the same class as F49's four exponent-sensitive pins
(B2). Bars (1), (2) and (6) are the canonicalisation-at-depth class already owned by C2.
Bar (5) is the normalisation's own, pre-existing inexactness that the pins tolerate per
fixture. The delegate's tree: core 5519/5519 (86 suites), dashboard 331/331, digest unmoved
(pins keyed by name). **Lead re-run of the full core suite on the delegate's tree:
5519/5519 (86 suites, 91 s) — matches.** Uncommitted. **Register entry A6 opened for the
scale residue.**

**F59 — The C++ port has landed four update packages against the handoff and is at
`59274a479` (2026-09-23): P2 (division-free predicate basis, named tolerances, determinism,
non-finite door guards), P3a (bisector direction by offset rate, split through a vertex as a
legal strike, the n-gon partition fix), P3b (terminal closed forms, strict linear causality,
the COAXIALITY LANE), P4 (canonicalisation, the perceptual floor, power-of-two
normalisation, floor-level clustering) plus P4 review fixes (one floor for every production
solve; tie-break, solve-level and stepped-floor gates; NaN refusals).** Read from the port's
commit log and the P4 commit message only; the port's source was not opened. So the port has
already taken the coaxiality package that session 4's handoff item 1 said to add before
sending. Not yet taken, by the same evidence: weighted offsets (handoff §8) and the port's
own queue items W5g (offset projection) and W5h (strips and slicing), which its roadmap
deliberately orders AFTER its PIE loop.

**F61 — LEAD ERROR, corrected in place: seed 55433 does NOT wait on decision 98. Decision
98 was RESOLVED by decision 102 (user, 2026-08-29: earliest arrival wins, lexicographic order
only as the tie-break within tolerance), and the crossed pairing it named was CURED by F44's
two causality changes the same day — I5 went to zero on every fixture and its pin table was
deleted through the cure flow; 55433's two direction violations went with it.** The
register's first draft copied the "promotion waits on decision 98" sentence from the census
comment in `recursive-subdivision.test.ts`, which predates F44 by hours and was never
re-pointed (D6). Verified at the tip by reading the pin tables, not by re-running: 55433's
causality row is `{offset: 0, clearance: 0, direction: 0}`, its I2 row is `[[19,20],[24,26]]`,
its census row is 0, and the reflex-L sweep asserts `{failed: 0}`. The sole thing keeping it
in `KNOWN_DEFECT_POLYGONS` is the I2 bar, and whether that bar should admit causally-ordered
sub-floor pairs is a ruling (C3), not a defect. The user's question "tell me about this"
found the error; the register is only as good as its provenance, and the provenance here was
a stale comment, not a pin.

**F60 — The branch was pushed on 2026-09-11 after the session-4 close; it tracks
`origin/feature/recursive-skeleton-subdivision` and is in sync at `cb43cef`, 124 commits
ahead of `origin/main`.** `git status --short --branch` shows the tracking with no
ahead/behind count. Session 4's "no upstream configured, nothing has left this machine" was
true at its writing and is not now. **No PR exists for this branch**: the remote carries one pull ref (`refs/pull/1`), whose head `1b06abe` is an old commit on the parcel-era branches, not this one (`gh` is not on the Bash path; measured with `git ls-remote`).
