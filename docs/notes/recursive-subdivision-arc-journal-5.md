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

**Refreshed 2026-09-23 after dispatch 2 (tip `75e7fa9`, core 5726/5726, dashboard 331/331,
corpus 60 = 53 clean + 7 defect, digest 60).** Done this session: the register; I2
restated (141/142); C9 the causality instrument (148/149); the angular package in two
dispatches (146/147, 150/151). Remaining, in the lead's recommended order:

1. **C8, the tolerance derivation package** — as a DECISION SPEC first (decision 144(f)):
   re-read the tolerance audit at the "derived and coherent" bar, one derivation per site,
   the four F64/F65 sites and the fourth oracle's bar included, the identical-source /
   co-linear asymmetry of F66 read before ruling, B7's cancelling-rates case as the first
   fixture. No code until ratified.
2. **C7, the defect-signature completion** — small, independent, can run beside item 1.
3. **C2, the canonicalisation rebuild** — waits on the drift bound's form (the user's
   remaining ruling); acceptance fixtures 15838, the near-flat rectangle, 55433 at depth.
4. **D2, the backlog reconciliation**, and **C5** (a demo-floor specimen) — small.

*The original list, superseded, follows.* To be ruled with the user against §5. The
lead's recommended order, pending the user's steer:

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
  violations went under F44, needing both of its changes); no I2 pair. **~~3 of 80 cells at
  the 1e-3 magnitude sweep still fail to solve~~ 0 of 80 as of F66 (k=3 by the parent gate,
  F63; k=8 and k=10 by the coaxial co-linear exits, F66); its census rows re-pinned with
  the recursion specimens extinct.** Original: 3 of 80 (counts 3, 8, 10) — the only remaining
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

**A2 — *AMENDED by F66 (2026-09-23): both decade cells are CURED by the coaxial co-linear
exits; the scatter lists are empty; what keeps the two fixtures enrolled is now a set of
fine-translation cells (Circle 48: 10, Rosette5 40: 9) carrying DIAGNOSED clearance
violations — signalled by the solver, pinned as flagged. The original entry follows.*
The two large-coordinate cells: Circle 48 at translation 1e10, Rosette5 40 at 1e11.**
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

**B7 — `Offset Cross Junction` fails at floors ≤ 3e-6 and solves from 1e-5 up (F67).**
*Re-pointed 2026-09-24 (F68):* NOT a tolerance — a collapsed zero-width corridor whose
meetings all sit at existing sources with zero travel, priced by the completion at the
midpoint, then a partition throw. C8's control fixture (its ladder rows stay pinned). Cure
candidate: C10.

**C10 — The snap pre-pass is a missing rung of the triangle/n-gon ladder** (F68). The pair
handler runs `resolveEdgesPointingAtNodes` before its closures; decision 145's ladder in
the other two handlers does not. Add it, measure B7, and then rule the level opposed pair
that spec A16 leaves to the throw. Small, after C8.

### C. Ruled-but-unbuilt design debt

**C1 — ~~The angular unification package~~ LANDED in two dispatches (decisions 146/147,
150/151; F63, F66). O2 ruled by measurement, O3 frozen for C8, O4 negative with a
construction, O5 ruled to C8. Residue: the three STOP sites and the identical-source exit
(C8).** Original entry: spec A1–A8, A11–A14, A16–A18, A20–A22, with O2–O5
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

**C5 — A dashboard defect specimen at the DEMO floor.** *Narrowed 2026-09-23:*
`OFFSET_CROSS_JUNCTION` (decision 151(d), F67) is the corpus specimen but fails only at
floors ≤ 3e-6; the explorer runs at 1e-5, where it solves. Options: let the tour run at
the library floor for this fixture, or construct a specimen that fails at 1e-5. Small.

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

**C9 — ~~The causality-diagnostics package~~ LANDED (decision 148, F65, decision 149).**
Residue moved to C8: the fourth oracle (backwards offset rate) joins the solver check once
its bar is derived; the four F64 sites re-ruled with F65's numbers, the point-on-ray
closure first since it now looks movable.

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

**D7 — ~~The causality oracles exist twice in the test tree.~~ CLOSED by C9 (F65): the
helper is the only test-side copy, and its bar is the unit-space floor (decision 149(a)).**

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

**149 — Rulings on the C9 package.** (a) **The test-side oracles' `1e-6` was in CALLER units,
not unit space — a literal in the wrong currency, the exact disease decision 144 names — and
the solver's floor-based bar is the derived one.** The brief's premise that the two "coincide
at the library floor" was the lead's error: for a 300-unit fixture the caller-unit bar is
256× tighter than the floor. Ruled: the test-side oracle takes the SAME currency (the
context's perceptual floor, unit space) so that solver and oracle agree by construction and
the oracle's independence lies in its implementation, not its bar; the three cells that
differed (Circle 32 jitter 5×/seed 12 and 1×/seed 5, Rosette5 40 at 2e11) keep their
caller-unit counts as HISTORY in the site comment, not as pins. Consequence under decision
141: a causality "violation" below the floor is arithmetic noise the client cannot see, not
a wrong answer, so Circle 32 1×/seed 5 reporting `complete: true` with no diagnostic is
CORRECT behaviour, and decision 148's contract is discharged in the floor's sense. (b)
`findBackwardsRateViolations` is a DISTINCT fourth oracle (a bisector born with negative
offset rate, which the three positional oracles cannot see), at the retired 1e-8; it joins
the solver check once C8 derives its bar — the angular resolution is the obvious candidate,
since a rate is a sine. Register C8 gains it. (c) The F64 re-measurement under the
instrument is recorded in F65 and the four sites stay reverted; C8 re-rules them with the
numbers. Two site comments are corrected now: `makeOffsetDistance`'s (only k=4 stops
solving at the tip, not three fixtures) and `algorithm-helpers.ts`'s anti-parallel note
(negative rates, not direction violations). (d) Interpretations 1–9 adopted: the check runs
per sub-polygon on the merged path (uncovered by mutation, stated), `runAlgorithmV5` stays
channel-less, causality diagnostics precede `unresolved-edges`, the diagnostic is a typed
union member, cost ~3% of solve time accepted, no dashboard change needed.

**150 — (user, 2026-09-23: "Proceed with the next package") DISPATCH 2 of the angular
package goes to Opus on baseline `85f45a8`, with this scope.** IN: spec A16 — the
anti-parallel arm of `solveParallelClosure` (every pair of bases parallel within the
resolution, opposed orientations present: classify each opposed pair with `intersectRays`;
coaxial-and-approaching is `head-on` and PRICED, everything else CLOSED at the leading
source by `applyDegenerateClosure`), which slots into decision 145's ladder as a closure
rung and is measured under decision 148's instrument; the `co-linear-from-1/2` exits moved
to spec A15's coaxial form (forward sign + symmetric lateral ≤ `coaxialityFloor`),
deferred from dispatch 1 by decision 147(e); spec A24 — the `ANTI_PARALLEL_CORRIDOR_*`
family (`_COAXIAL`, `_SUB_EPSILON`, `_IN_BAND`, `_ABOVE_FLOOR`) with the swept band pinned
BEFORE the arm lands and asserted flipped after; O4 — one timeboxed attempt at a plain-ring
construction via a deliberate near-simultaneous coincidence, the negative recorded in the
fixture header if it fails; the dispatch-2 table in `angular-predicate-basis.test.ts`
(cell (c) rows) re-pinned from "reaches the completion or the throw" to "closed at the
leading source" or "priced head-on", each row saying which. Bars: decision 134's
contract, A25's STOPs 2–4, digest movement attributed per pin, no `causality-violation`
diagnostic may APPEAR on a cell that had none (the instrument's own STOP), the completion's
corpus firing count reported. OUT: C8, C7, the port.

**151 — Rulings on dispatch 2's escalations.** (a) **The A15/A17 overlap is RESOLVED BY THE
INSTRUMENT, and the 78 cells the coaxial co-linear exits move are CURES (69) and
FLAGGED-MOVED (8), not a cover-up.** Spec A17's fear — "without the parent gate every
large-coordinate cell closes and reports complete" — was written when `complete` was the
only signal. Under decisions 148/149 a closure is judged by the solver's own causality
check: 69 of the 78 are clean on every oracle at the floor with node counts unchanged, and
the 8 Circle 48 fine-translation cells keep exactly the clearance counts they carried while
failing, now as `causality-violation` diagnostics — signalled, therefore pinned as moved
and flagged, as decision 147(b) did. The parent gate STAYS on `solveParallelClosure`
(conviction 4 shows it still load-bearing for the arm); the co-linear exits carry no gate
because they are `intersectRays`' verdict on ONE pair, not a closure over a set. (b)
**Retreating opposed pairs have no leading source and keep the throw**; spec A16's
"coaxial-and-retreating is CLOSED" is amended in place — wiring either edge would run it
backwards (decision 70), no solver-produced state reaches it, and the delegate's control
pins that. (c) Interpretations 3–9 adopted (head-on inside the arm at the triangle/n-gon
arities means "decline to the completion, which prices it"; lower edge id breaks the tie
when both sources lead; the family is in no roster because its displacement is not solver
input; the recursion specimens' extinction re-pinned on the constructed specimen). (d)
**`OFFSET_CROSS_JUNCTION` (η = 1e-4), the O4 attempt's by-product, IS the constructed
defect specimen decision 138(c) wanted (register C5): a real ring on which the completion
fires on an exactly coaxial pair whose offset rates cancel, then a step failure.** Ruled:
it is ENROLLED in `KNOWN_DEFECT_POLYGONS` with its signature measured over every
`FULL_CORPUS` sweep and pinned (decision 72's doctrine; decision 143's completeness bar
applied at enrolment), ~~and the dashboard's failed-cell tour takes it as its specimen~~ — *AMENDED on the
delegate's flag: it fails at floors 1e-6 and 3e-6 only and solves complete from 1e-5 up,
so at the demo floor it appears in the defect list and solves; it is the CORPUS specimen,
and the dashboard tour's specimen stays open unless the tour can run at the library floor
(C5 re-opened, narrower)*. (e)
Circle 48 and Rosette5 40 stay enrolled on their fine-translation clearance signatures (10
and 9 cells); the decision-66/81 decade cells are now clean.

**152 — (user, 2026-09-24: "Link me the C8 spec") The C8 decision spec is DRAFTED by an
Opus delegate at [tolerance-derivation-decisions.md](./tolerance-derivation-decisions.md),
status draft, for the lead's ratification; no production code moves until it is
ratified (decision 144(f)).** Inputs named: the tolerance audit (1120 lines, §3 inventory
and §4 disagreement map at the "named" bar), decision 144's two sources (δ and u), decisions
147–151, F64–F67, the angular spec's A1–A10 as the pattern of a derivation, and the 42
epsilon-family call sites in `packages/core/src` at `2ef58d8`. Required contents: one
derivation per site in the audit's inventory plus every site added since (the F64 four,
the fourth oracle, `MAX_WEIGHT_RATIO`, `MIN_WEIGHT_TURN_SINE`, the simultaneity window);
each site classified by the question it asks, its category (perceptual, arithmetic,
detector), its operands and its expected digest effect; the identical-source / co-linear
asymmetry of F66 stated as a decision; B7's cancelling-rates case as the first fixture;
falsification bars in decision 134's form; OPEN items with settling measurements. The
user's plan-writing style governs: a decision spec, not a phased plan.

**153 — Lead review of the C8 spec
([tolerance-derivation-decisions.md](./tolerance-derivation-decisions.md), 296 lines, 65
census rows against the audit's 41, T1–T40, O1–O5): read in full; three items go to the
user for ratification, the rest is ruled here.** (a) **I4 RULED for T18**: the fourth
oracle's bar is the complement of the zero-rate predicate at ρ on the raw parents, per
decision 149(b) and coherence; F65's phrase "which the fourth oracle will catch" is
AMENDED in place — the three sub-ρ negative rates are below the resolution and are not
violations. (b) **I10 RULED for T7**: the three landed `≤` sites go to `<` so the package
has one inequality; a boundary of measure zero is not worth a second convention. (c) T9
(identical-source exact) is accepted on its premise — every production ray source is a
stored node position — with the band (0, 1e-8) population as its conviction; if the band
is non-empty the premise is false and T9 reopens. (d) T34 is assigned **F68** and labelled
delegate-traced, not lead-re-run; register B7 is re-pointed to its mechanism. (e) O1, O2,
O3 and O5 are lead-level and are ruled by their settling measurements, which run FIRST in
the implementation dispatch, before any bar moves. (f) The census's I2 (graph-merge's
dedupe runs in unit space, its comment stale) corrects register C6's premise, and I3
(`DEGENERATE_AREA_EPSILON` read as a unit-space area in the decomposition, 1000δ on a side)
is a live finding folded into O3. (g) **To the user:** T2, the category rule ("a comparison
that decides a question before any node exists takes δ; one whose acceptance discards or
substitutes a produced answer takes u; a division guard takes its own rounding bound") —
a sharpening of decision 141 that explains F66 and should be confirmed as principle; T12,
the simultaneity window at δ, with T15's prediction that at the library floor it widens
layers on exactly the four jitter defect fixtures and no clean fixture; and O4, whether
`MAX_WEIGHT_RATIO = 100` survives as a PRODUCT ceiling now that no derivation yields it
(the derived coherence bound is ~1e8). Spec status stays draft until those three are
ruled.

**154 — (user, 2026-09-24) O1 of the C8 spec is RULED BY ITS HISTOGRAM: the arithmetic
same-point bar is decided by the settling measurement, run FIRST in the implementation
dispatch, and not in advance.** The measurement: every non-zero distance at which
`findOrAddNode` currently joins a position to an existing node, over `FULL_CORPUS`, the 46
fine translations of Circle 48 and Rosette5 40, and the jitter sweeps. Ruling rule: if
every join is exact or within `ARRIVAL_MOMENT_ULPS` (64) ulps, option (a) — one
representation bar coherent with the moment bar — is taken as free; if joins exist above
that AND correlate with poorly conditioned pricings (the conditioning quantity
|sep|·2u/sin²θ at the pricing site), option (b) is taken in its cheap form — one error
budget per event, set at pricing, carried on the event type; a join above 64 ulps that does
NOT correlate with conditioning names a path bypassing event resolution and is fixed there,
never absorbed by a bar. What (b) buys, recorded so the choice is legible: no multiple to
argue, correctness where positional error is non-uniform, and a principled bypass
detector; what it does not buy: any reduction of error, and the doubled-node case it
guards is already caught by the clustering before a node exists and by the causality check
and I2 after. T2, T12 and O4 remain the user's open rulings.

**155 — (user, 2026-09-24) O2 of the C8 spec is RULED (a), ANCHORED: "approximately
equals" is not an equivalence relation and the solver must never claim transitivity; the
perceptual floor sits ABOVE the computational floor precisely so that every answer is more
precise than the client can perceive, and a transitive layer breaks that guarantee.** The
user's words, near-verbatim: "We have a computational limit on testing simultaneity, and
for pragmatism we're opting to use a more permissive perceptual threshold for some
predicates. Neither of these imply that 'approximately equals' IS equals, and the point of
having a perceptual floor above the computational floor is that we're always guaranteed a
more precise answer than the client can perceive, which respects the client's needs.
Transitive equality breaks that. A ≈ B and B ≈ C does not guarantee A ≈ C, so we must not
claim that. If that results in two nodes that are within the perceptual threshold, because
transitive equality didn't hold, we are still above the computational floor and still
producing something that is arithmetically sound. Reality might be that A ≠ B ≠ C, but the
perceptual contract allows the computational contract to decline trying to decide, if it
can't." Consequences: (a) the simultaneity window is anchored on the earliest arrival and
its width never exceeds δ; a many-way meeting split across two layers yields two nodes
inside the floor, which decision 141 admits as a well-defined answer. (b) The same
principle reaches the SPATIAL axis: decision 78's coincidence clustering groups positions
by connected components, which is transitive. The C8 dispatch measures the diameter of
every component the clustering forms over the corpus, the fine translations and the jitter
sweeps; a component wider than δ is a transitivity claim this ruling forbids, and the
clustering is then restated as anchored or diameter-bounded, attributed. If no component
exceeds δ the form is moot in practice and is restated anyway for coherence, with the
digest expected not to move. (c) The gated form (c) of O2 stays in reserve only as a
STOP response, not as a design. Remaining user rulings: T2, T12, O4.

**156 — (user, 2026-09-24) O4 of the C8 spec is RULED: `MAX_WEIGHT_RATIO = 100` is
replaced by the derived coherence bound `maxWeightRatio(δ) = δ / (64·√2·u)`, about 1e8
at the library floor; the door refuses only where the narrowest simultaneity window
would fall inside the arithmetic moment bar.** The user's words: "Guards pathological,
doesn't insist on a concrete product opinion." Lead's confirmation of legitimacy: the
ceiling's two former jobs are both discharged elsewhere — the W48 fusing hazard by the
per-pair window on the faster participant (T13), the F48 conditioning hazard by the
per-vertex turn guard `minWeightTurnSine(δ, Δw)` (T21), which at a weight difference of
1e8 admits a weight change only at a corner with sine ≥ ~0.125 — so what remains is
exactly the coherence constraint the derived bound states. Consequences: the bound is a
function of δ (~1e9 at the demo floor) and ports as one; decision 119's constant and
decision 128's ladder are superseded on this point, noted in place; the zero/infinite
fence of decision 112(e) and the visible-corner refusal of 124(b) are untouched; register
C4's "discriminating fixture for the ratio constant" is CLOSED as moot. Remaining user
rulings: T2, T12.

---
## Findings

**F68 — (delegate-traced for the C8 spec, T34; not re-run by the lead) `Offset Cross
Junction` fails at the library floor because its two junction closures land 6.25δ apart
and hand the n-gon a zero-width, fully collapsed corridor whose every meeting sits AT an
existing source with zero travel; the completion then prices the exactly-zero-rate
mid-lines at their midpoint, and the partition throws.** The rates are exact zeros, so no
derived tolerance touches it (spec I9): B7 is C8's CONTROL fixture, its ladder rows must
stay bit-pinned through the package. The transition to solving lies between δ = 4e-6 and
4.5e-6, where the coaxiality lane admits two reflex bisectors at a lateral of 6.25e-6/√2;
a second independent route is the coincidence floor merging the two junction nodes above
6.25e-6. The cure lives in the terminal ladder: the pair handler runs a snap pre-pass
(`resolveEdgesPointingAtNodes`) that the triangle and n-gon ladders LACK — decision 145's
"same ladder" is incomplete by one rung — and, by reasoning only, the level opposed pair
e26/e27 would still fall to spec A16's retreating-pair throw after it. Register: B7
re-pointed; new **C10** (the snap rung in the triangle/n-gon ladder, with B7 as its
fixture).

**F67 — `Offset Cross Junction` is enrolled as the seventh defect fixture with a COMPLETE
signature at enrolment (decision 143's bar applied for the first time): corpus 60, digest
60 pins, no clean-only suite touched.** Its signature: census 12 (root `Incomplete solve`
in every cell of the 3×4 grid, the driver never recurses); causality 0/0/0 on solver and
oracle, rate check clean; containment holds (every node strictly inside) with 3 stranded
edges (26, 27, 32) all reported; strip tiling unmeasurable (`computeMaxOffset` throws);
I1, I2, I3, I5 hold, I4 fails on two exterior edges with no interior walk (e0 n0→n1, e4
n4→n5) — the only weak-form violator in the corpus; 2 licensed head-on mid-line pairs
(15 → 17 corpus-wide); the completion fires ONCE on it at floor 1e-6 and nowhere at 1e-5;
floor ladder — incomplete at 1e-6 and 3e-6 (18 nodes, 33 edges), complete from 1e-5 up
(19 nodes, 30 edges); no fold; both region-tree identities hold; all-ones weights
bit-identical. **Mechanism, as reported, unverified by the lead:** at η ≥ 3e-5 both
mid-lines land exactly on their own lines, the n-gon [26,27,28,30] produces no event, the
completion prices the exactly coaxial vertical-corridor pair whose offset rates CANCEL,
and a step failure follows — so the specimen is a `priceHeadOnPair` cancelling-rates case,
which a looser floor (1e-5) avoids by a different route. Register **B7** opened for the
mechanism. Delegate figures: core 5726/5726 (87 suites), dashboard 331/331, builds green. **Lead
verification on the merged tree: core 5726/5726 (87 suites, 92 s), dashboard 331/331 after
core and test-fixtures rebuilds, all three builds green — match. Committed as the
dispatch-2 code commit.**

**F66 — Dispatch 2 landed the anti-parallel arm and the coaxial co-linear exits, and the
EXITS, not the arm, cured 77 cells that had been signalled failures since the arc began:
both large-coordinate scatter lists are EMPTY, the plus seed's off-edge sweep is 0 of 80,
and no region anywhere in the recursion census fails a solve.** Delegate figures before
the enrolment follow-up: core 5707/5707 (87 suites), dashboard 331/331, builds green,
digest 0 of 59 moved, `coaxial-completion` firing 0 over 649 cells, no causality diagnostic
appeared anywhere, STOPs 2–4 untriggered. The A/B toggle attributes the movement: the arm
alone moves 0 of 649 cells; the co-linear exits at the coaxial form (forward sign +
symmetric lateral ≤ floor, replacing `directionsAreSame` at the resolution) move 78 — 77
signalled → complete, one 4 → 1 step failures; across all 78 the node counts are unchanged,
the rate oracle is zero, solver and test oracle agree, 69 are clean on every oracle and 8
(Circle 48 at 4e10, 5e10, 6e10, 2e11, 5e12–8e12) keep exactly their failing-time clearance
counts as diagnostics. Re-pinned with attribution: Circle 48's 29 and Rosette5 40's 15
scatter cells → none; both survive every decade translation; the Circle 32 1e10/1e11
exception table emptied; the hub in-degrees at 2e9/1e10/2e10 moved as recorded at the site;
the plus 2 → 0 of 80; the near-regular seed-2 cell clean; the recursion specimens extinct
and replaced by the constructed `OFFSET_CROSS_JUNCTION`. The pre/post sweep: every δ ≤ 1e-6
head-on before and after; 5e-6 and 1e-4 orphan-to-completion before, closed at the leading
source after (at the 1e-5 floor 5e-6 is inside the lane and head-on both times); no cell
reaches the throw either time. O4 NEGATIVE, with a construction: an offset cross (a corridor
with two bars, one raised by η) displaces the mid-line source by η/8, at most 7.8e-8 — a
single coincidence merge cannot move a source by a whole floor, so no plain ring reaches the
band, and the ring-plus-displacement form stands; at η ≥ 3e-5 the ring fails a DIFFERENT
way (the completion fires on an exactly coaxial pair whose rates cancel, then a step
failure) and is exported as `OFFSET_CROSS_JUNCTION`. Convictions: arm removed kills 5; head-
on closed instead of priced kills 5; exits reverted kills 26 in 8 suites; the parent gate
removed no longer reproduces spec A17's cover-up on the large-coordinate cells (they no
longer reach the closure) but kills the pair-ladder completion test, so the gate is still
load-bearing for the arm. **Reading, lead's:** the identical-source exit at the floor was
refused twice (138(a), F64/F65) for making cells silent and jitter cells fail, while the
co-linear exits at the floor — the same coaxiality question asked from each end — cure 77
with zero regressions. The difference is what each exit DOES on acceptance: identical-source
terminates the pair as one point, co-linear closes at the leading source with the geometry
kept. C8 should read that asymmetry before re-ruling the identical-source site.

**F65 — The causality instrument landed inside the solver, and under it the "silent wrong
answer" residue of the jitter and large-coordinate classes is almost entirely SUB-FLOOR:
at the floor the solver finds zero violations on the whole corpus at 1e-6 and 1e-5, and
on every pinned cell except the two flagged by decision 147.** Delegate figures: core
5690/5690 (86 suites), dashboard 331/331, builds green, digest unmoved, cost 2.9–3.1% of
corpus solve time (11–12 ms of ~380 ms, 20 passes). The definitions agree exactly: at the
oracle's own caller-unit bar the solver returns the oracle's ids on every cell. The F64
re-measurement under the instrument (199 cells, every site reverted after): the
identical-source exit at the floor — 3 cells signalled → diagnosed, 29 signalled → complete
with only sub-floor oracle counts, and 14 jitter cells that solved STOP solving (STOP 3
regardless); `makeOffsetDistance` noGradient at the resolution — only seed 55433 k=4 stops
solving (the site comment's "three fixtures" is stale), the other three stay complete and
every new violation is diagnosed; `addBisectionEdge` zero-rate — parent-blind: 55433, the
plus and one jitter cell stop solving; anti-parallel-only: three bisectors born with
negative rate (−8.8e-6, −3.4e-6, −7.8e-6 — all BELOW the angular resolution 1.77e-5) while
complete and clean on all three positional oracles, seen only by the rate check; point-on-
ray snap — one cell complete with sub-floor counts only; point-on-ray closure — four cells
complete, three with sub-floor counts only and ONE (Circle 32 30×/seed 7) clean on every
measure, a cure. Reading: with the bar in the right currency, "silent" has narrowed to
(i) fixtures that stop solving (STOP 3, unchanged), (ii) sub-resolution negative rates,
which the fourth oracle was expected to catch — AMENDED by decision 153(a): they are below the angular resolution and are NOT violations under T18, and (iii) nothing else. The four sites
remain C8's to re-rule; the point-on-ray closure now looks movable. **Lead verification on
the merged tree after decision 149's follow-up: core 5690/5690 (86 suites, 115 s),
dashboard 331/331 after a core rebuild, both builds green — all match the delegate.
Committed as the C9 code commit.**

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
