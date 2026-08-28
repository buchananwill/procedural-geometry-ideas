---
title: "Recursive Subdivision Arc: Session 3 Journal"
type: workflow
status: active
---

# Recursive subdivision arc — session 3 journal

**This is the head of the thread**, continuing
[the session-1 journal](./recursive-subdivision-arc-journal.md). Session 2 (2026-08-26) terminated
prematurely on token budget and **left no journal**; its record is commits `e618735..1ab785c` and is
reconstructed in §2 below. Decisions continue at **53** (1–52 live in
[recursive-skeleton-subdivision.md](./recursive-skeleton-subdivision.md)); findings continue at
**F10** (F1–F9 in the session-1 journal).

## Reading order for a fresh context

Read §2 (state), §4 (next work) and the Findings below. For solver-degeneracy background read the
session-1 journal's §2 findings and §4 outstanding items only. **Do not read the session-1 journal,
the design doc, or the decisions files end to end.**

## 1. The arc's charter

Unchanged from session 1: recursive skeleton subdivision on branch
`feature/recursive-skeleton-subdivision`. This session's mandate from the user (2026-08-27):
investigate the cause of the new failing `GOLF_CART` fixture in
[rectilinear-shapes.ts](../../packages/test-fixtures/src/rectilinear-shapes.ts), plus outstanding
numerical-tolerance issues.

## 2. State as at bootstrap

- Branch `feature/recursive-skeleton-subdivision`, tip `1ab785c`, working tree clean at bootstrap.
- Core: **3567 tests, 68 suites, all green** — measured by re-running, not inherited.
- Session 2 (unjournaled, from commits): added `packages/test-fixtures/src/rectilinear-shapes.ts`
  (`CROSS`, `T_SHAPE` — both in `ALL_TEST_POLYGONS` and solving); fixed the all-parallel-parent
  degenerate-closure class in `algorithm-termination-cases.ts` (`solveDegenerateClosure` /
  `applyDegenerateClosure`, `InteriorEdge.culled`, self-loops counted degree-two in the tree);
  pinned T-Shape end-to-end in `terminal-cases.test.ts`. Final commit added `GOLF_CART`, failing,
  **not exported from the fixtures index and with no characterisation test**.
- `GOLF_CART` failure reproduced this session: `runAlgorithmV5` leaves 5+ edges unaccepted with
  `Partition sorting failure: start: 0, end: 5, event end: 2` (the >3-edge partition path in
  `algorithm-complex-cases.ts`).

## 3. Operational manual

Carried by reference from the session-1 journal §"Process learnings" (P3 build-before-dashboard, P4
orphan port 3000, P8 debrief relocation). Additions this session:

- `pnpm --filter @proc-geo/core test -- --testPathPatterns=x` passes the literal `--` through to
  jest and matches nothing; drop the inner `--`: `pnpm --filter @proc-geo/core test
  --testPathPatterns=x`.
- The full-suite console block listing per-fixture level-2 subdivision failures is a **logged
  diagnostic** from `recursive-subdivision.test.ts`, not a failure — the suite is green around it.
- (user, 2026-08-27) **Playwright against the demo dashboard is a standing verification tool for
  visualising skeleton solutions** — build first (P3), check port 3000 for an orphan server (P4),
  then screenshot. Use it to eyeball a fixed fixture's skeleton, not only its test verdict.

## 4. Next work — morning handoff, 2026-08-28

The overnight queue (decision 63) completed in full: five commits, every item verified by the lead
on the merged tree. Read the night in the Findings (F12–F21) and Decisions (56–68).

**State at close: corpus 46 (every historical exclusion promoted or pinned), core 4119/4119
across 73 suites in 73 s, dashboard 257/257, recursive-subdivision census 0 failures throughout,
branch un-pushed.**

What needs the user:

1. **The two live solver defects, both pinned, both awaiting a design ruling** (decision 67):
   the collinear dumbbell (non-adjacent supporting-line degeneracy, silent overlap — the only
   silent-wrong-answer defect known) and the near-floor off-edge jitter class (22/80 L, 46/80
   plus at jitter a few × the noise floor — the hand-drawn regime; F20). These are the
   production-hardening frontier now.
2. **Decision 66's accept-by-construction** for the two translation cells — review if the
   operating envelope ever approaches 2e9 units.
3. **The root-floor pass-down reconciliation** (decisions 19–20 vs F4/F5) — still the one F10
   item unruled.
4. **The C++-team correction** (session-1 outstanding item 1, F9) — still unsent, still
   cheap-now-expensive-later.
5. Push/PR when the user is ready — nothing has left this machine.

## 5. Open items

Carried from session 1: C++-team correction (above), radial promotion, leaf slicing, merge
heuristic, size ladder. Added this session: F15a specimen debt (recursive-subdivision tests and
the dashboard scene test lean on the dumbbell and Broken Polygon as failing specimens — both lose
their specimen when their defect is fixed); the caller-space debug overlay and unit-space assert
text (F10, documented-risk tier); corner-correction fuzzing (parked unless symptoms).

## Decisions

**53 — (user, 2026-08-27) A failing fixture is never laundered out of the corpus; the production
code gets fixed.** The user's words: "I'm not happy that any fixtures were ever laundered out from
the tests. The production code should have been fixed." Standing policy: exclusion from
`ALL_TEST_POLYGONS` is legitimate only as a *visible, pinned* characterisation of a defect awaiting
its fix (the dumbbell precedent), never as a quiet route to a green suite. Consequences: the F14
promotions rise to mandated work, both stale exclusion headers are rewritten as defect records or
retired, and `GOLF_CART`'s endpoint is a solver fix plus promotion — not a permanent exclusion.

**54 — (user, 2026-08-27) `FLOATING_POINT_EPSILON = 1e-8` is a deliberate choice — the Unreal
Engine "small number" constant — and the precision bar is pragmatic, not analytic.** The criterion
in the user's words: "can you see this on a screen?" This is a practical solver for practical
geometry; an infinitely small roof section can no more be built than rendered. F10's "the absolute
epsilon has never been revisited" item is hereby re-ruled: revisiting it is **not** an open
obligation. What remains open from that item is only the specific measured regime where the
terminal ring becomes finer than the tolerance — to be judged against visibility, not first
principles. *(F10 amended in place below.)*

**55 — (user, 2026-08-27, restating a prior ruling) A vertex collinear with the direct edge
between its two neighbours contributes nothing and is normalised out of the input.** The core
recursive actions are finding the medial line and dropping chords to it from the perimeter (chords
possibly repositioned after segment merging); a collinear vertex changes neither. This is the
rationale already embodied in input canonicalisation (design-doc decisions 1–9, perpendicular
deviation against the pragmatic floor). Recorded limit, so it is not over-read: the predicate is
**vertex-local by design**, and therefore does not and cannot address the collinear dumbbell
(F10 item), whose degeneracy is *non-adjacent* edges sharing a supporting line with no removable
vertex — that one stays a solver defect under decision 53.

**56 — The partition layer must represent multiple simultaneous splits of one exterior edge; the
one-split-per-start dedupe is replaced, not patched.** Two same-start partition events whose spans
cross (F12) are distinct simultaneous splits, and the layer's correct output partitions the polygon
at *every* split point, with a child sub-polygon legitimately bounded by split bisectors from two
different source nodes. Same-start events at the *same* split point remain nested re-reports and
keep the smallest-span dedupe. The crossing-throw at `algorithm-complex-cases.ts:170` becomes the
double-split path, not an error.

**57 — The `partitionSpan` inversion (F13) is corrected only inside the decision-56 change, never
in isolation.** Corrected alone it converts `GOLF_CART`'s loud failure into a silent wrong
skeleton.

**58 — `GOLF_CART`'s endpoint: exported from the fixtures index, pinned end-to-end as solving, and
promoted into `ALL_TEST_POLYGONS`, with the variant matrix converted from logging to asserting.**
The variants that solve today (perturbation-only, tilted-edge d2/d3) are asserted solving now so
the fix cannot regress them; the failing variants (slant-only, mild-slant) assert solving after
decision 56 lands.

**59 — (user, 2026-08-27) Delegate model policy: split by difficulty.** Mechanical, verifiable
work (fixture promotions, header rewrites, hygiene fixes) is dispatched on **Opus**; design-heavy
solver work (e.g. the decision-56 double-split fix) inherits the session model. Motivated by the
session-2 token-budget termination. The in-flight decision-56 task, already launched on the
session model, stands — it is the design-heavy kind the split assigns there anyway.

**60 — (user, 2026-08-27) No multiple-choice question prompts.** Questions to the user are asked
in plain prose; where something is merely undecided rather than genuinely ambiguous, the lead
rules, records, and moves on.

**61 — (user, 2026-08-27, overnight handoff) The lead steers the remainder of the arc
autonomously toward production-hardening the solver, budget-conservative.** Two other sessions run
concurrently on the same token budget. **Amends decision 59:** Opus is now the default for ALL
delegated work, not just mechanical work; the session model is reserved for the absolutely
critical — nothing currently queued qualifies. The in-flight decision-56 task (already on the
session model) is the last of its kind tonight.

**62 — Landed work is committed locally per work package, never pushed.** An overnight multi-task
run without commits would leave an unreviewable blob and successive tasks would trample each
other's diffs. Each verified arrival gets one local commit with a plain message; pushing and PRs
wait for the user. The four pre-existing untracked debug/journal files ride with the package that
subsumes them.

**63 — The overnight queue, in order, each gated on my own verification of the previous:**
(1) decision-56 fix lands → verify → commit; (2) promotions + honest exclusion headers + backlog
corrections per decisions 53/F14 (Opus); (3) hygiene: `inEdges` sort-or-prove-unread, unify the
duplicated 1e-6 floors, NaN validation at the entry points (Opus); (4) investigation-only (Opus):
the two surviving narrow large-coordinate failures (Circle-48 @1e10, Rosette5-40 @1e11) and the
along-edge-jitter reflex class (backlog item 2 — fixture it, characterise it, no fix without a
design ruling). The collinear dumbbell fix and any double-split-scale design work are OUT of
overnight scope: they are critical-tier and wait for a ruling with the user awake.

**64 — The normalisation exact-cell table is corpus-scoped bookkeeping, not a designed invariant;
`SHORT_EDGE_PROMONTORY` and `NEAR_REGULAR_PEANUT_32` promote.** The package-2 delegate correctly
escalated this instead of ruling it. The authored invariant in `normalisation.test.ts` is "exact in
the SCALING everywhere" — untouched and green. The five-exact-cells list is a *measured record* of
which scales the corpus happens to round-trip bit-exactly in the **centring** subtraction, which F6
already established is not exactly invertible in general (Sterbenz covers scaling only). Both
fixtures' drift is sub-ulp of extent (worst 3.47e-16 absolute, 3e-17 relative to extent; the peanut
under `Number.EPSILON` in every cell) — invisible under decision 54's bar. Re-measure the table
over the grown corpus, date the update, attribute the moved cells per fixture, promote both, and
delete the corresponding blocker block from `corpus-enrolment-blockers.test.ts`. This is
re-measurement, not weakening: the tripwire's job is to catch *unexplained* movement, and this
movement is explained, attributed, and ruled.

**65 — The ellipse hold-out blocker joins the determinism package (queue item 3), which is
promoted from "hygiene" to "determinism": simultaneous-event tie-breaks must be canonical, not
creation-ordered.** `NEAR_REGULAR_ELLIPSE_16/32` fail only scale-invariance of node *ids*: exact
mirror symmetry makes two events simultaneous, and which node is created first turns on an ulp —
same defect family as the `inEdges` ordering instability (F10). The package therefore owns:
canonical ordering for simultaneous event sets (node-id assignment), the `inEdges` sort (or proof
nothing reads the order), the duplicated 1e-6 floors, and NaN entry validation. Ellipse promotion
is that package's acceptance test.

**66 — The two surviving translation failures are accepted by construction; the pinned records
stand, widened.** Ratifies the package-4 recommendation on the decision-54 bar: the disputed
geometry is 5.6e-5 px (Circle 48 @1e10) and 3.2e-4 px (Rosette5 40 @1e11) on a 4K render of the
whole shape, and **under two ulps of the quantised input itself** — no better answer exists to
lose. All 12 failing cells across the widened grid are signalled, never silent. The measured
candidate fix (absolute-units lateral test in `solveDegenerateClosure`) flips one cell of twelve
and is not landed.

**67 — The near-floor off-edge jitter class is the standing live solver defect, joining the
collinear dumbbell; both await a design ruling with the user awake.** Package 4's re-measurement
found the backlog's along-edge class dead by construction under default config, but its "off-edge
passes 80/80" control false near the noise floor: at jitter ≈ a few × the 1e-6 floor, the reflex L
fails 22/80 and the double-reflex plus 46/80 with default options — the genuinely hand-drawn
regime. Pinned per decision 53; no fix without a ruling.

**68 — The closed-class jitter sweep is slimmed to a representative regression gate; the 80-cell
record lives in prose, not in CI.** The full sweep (222 s) made the core suite 223 s — a 4× tax to
re-prove a number already recorded. The historical-comparability measurement is done and written
down (F20, test headers); the regression gate's job is detection, and the class when alive failed
34–56/80, so a reduced sweep (~2 seeds × 3 k-values per cell, target well under 30 s) detects any
revival with near-certainty. The known-failures pins (live defect) keep running in full. The full
sweep is preserved in the file as documented construction, not deleted history.

**69 — (user, 2026-08-28) New mandate: investigate AND fix the escaping-bisector defect shown by
the two `SlightlyDeformedPeanut` fixtures.** User-added file
[slightly-deformed-peanut.ts](../../packages/test-fixtures/src/slightly-deformed-peanut.ts), two
32-vertex variants deforming the regular peanut's waist (vertex 6 moved to (317.35, 189.72) in
both; vertex 23 additionally moved in variant 2). User's observed mechanism: the translated
vertex 6 creates an early collision (node 32) and the bisectors of vertices 7 and 23 no longer
point at each other; vertex 23's bisector (edge 55) then finds no collision in the waist and
**escapes the perimeter, forming a skeleton node outside the polygon** — a
silent-wrong-geometry symptom. User relates it to the same defect family as the prior head-on /
near-miss collision classification work. Fix mandated, not just diagnosis — the first fix mandate
since the overnight queue closed.

**70 — The latent backwards-bisector defect is fixed now, as its own package: the offset rate
decides a bisector's direction; `approximateDirection` is demoted to a tie-break for the
anti-parallel ambiguity.** The peanut trace exposed it: `addBisectionEdge`
(`algorithm-helpers.ts:84-88`) computes the correct interior direction and then lets
`approximateDirection` override it, which on variant 2 pre-fix created a bisector with **negative
offset rate** (−0.0737) — running backwards in the wavefront clock, which is geometrically
impossible. ~~There is also a param-order inversion when `parentsInverted` is true.~~ *AMENDED
2026-08-28: the inversion does not exist — both branches used shorthand property names and
assigned identical values; the delegate withdrew its own finding and convicted the correction
both ways (collapse reverted: 0 deaths; an actual swap introduced: 559 tests die, census 0 → 298
— the branch is live and load-bearing, and "do not swap" is correct). See F23.* The delegate
correctly stopped rather than choosing: a new invariant at bisector creation can alter results
corpus-wide. Ruling: the invariant is not a taste question — a wavefront bisector's offset rate is
non-negative by definition — so the correction proceeds, with the hard bar that the corpus stays
green and any moved pin is attributed per fixture; results moving in a way whose correctness
cannot be argued from the invariant itself is a STOP. Currently latent, guarded by
`wavefront-causality.test.ts` on all 48 fixtures — the fix converts a standing hazard into a
non-property.

**71 — Two rulings on the decision-70 outcome.** (a) The 17 silent→signalled withdrawals are
**ratified**: every flipped cell carried at least one negative-rate bisector on the baseline, so
`complete: true` there was never a true pass — the rate invariant is strictly sharper than
containment (which caught none of them), and converting silent to loud is the direction decision
53 exists for. (b) The two `OFF_EDGE_JITTER_L` fixtures, which now solve as roots, **stay held
out of `ALL_TEST_POLYGONS`**: on the census's own grid they still yield 5 and 10 failed regions
in the recursive driver, and the census-0 invariant is the corpus's strongest property. They
remain visibly pinned with the measured hold-out reason asserted (nothing laundered); they
promote when the driver-level residue of decision 67 is fixed. The known-failures file's
"promote when it solves" rule is amended to "promote when it solves AND survives the census
grid".

**72 — (user, 2026-08-28) Exclusion is retired as a mechanism entirely; every fixture enrolls,
and known defects become expected-failure pins inside the sweeps. SUPERSEDES the exclusion half
of decision 71b and the exclusion-as-pinned-record form of decision 53.** The user's words: "That's
still laundering though" — a held-out fixture, however visibly pinned, still shapes the corpus
around the defect, and it is invisible to the dashboard, blocking the user's own inspection loop.
New structure: (a) a second exported roster, `KNOWN_DEFECT_POLYGONS`, carrying every currently
held-out fixture with its measured defect signature; (b) sweeping suites run the full corpus —
clean fixtures assert clean, defect fixtures assert **exactly their pinned signature**, so the
census bar becomes "no unattributed failure and no unattributed cure" (a cure is loud and triggers
promotion to the clean roster); (c) which invariants are universal (containment, rate,
signalled-not-silent) versus clean-only is **measured, not assumed** — swept over the defect
roster and pinned at whatever actually holds; (d) the dashboard's fixture loader lists the full
corpus with defect fixtures labelled, so the user can load and inspect them. Applies to the whole
held-out roster: both `OFF_EDGE_JITTER_L` seeds, the plus seed, the K4 specimen,
`COLLINEAR_DUMBBELL`, `NEAR_REGULAR_CIRCLE_48`, `NEAR_REGULAR_ROSETTE5_40`.

**73 — `SYMMETRICAL_OCTAGON` promotes to the clean roster; the other seven strays stay
unenrolled as historical debugging specimens.** The enrolment package found eight
individually-exported polygons in neither roster, all measuring clean today. The octagon's
`DOES NOT TERMINATE IN FUZZ TEST` comment is stale — it solves with empty diagnostics and
censuses 0 — so it enrolls clean with the comment corrected. The seven named-historical-bug
specimens (crabs, reflex cases) remain as they are: clean today, no defect signature to pin,
enrolment would only widen sweep cost without adding conviction.

**74 — (user, 2026-08-28) `ALL_TEST_POLYGONS` is retired as a name: a roster called ALL that
excludes the defect fixtures launders the meaning of the word.** The user's words: "you're still
laundering the meaning of 'ALL' in that name." The name is **removed, not re-pointed** — silently
making it mean the full corpus would flip the semantics under every existing reference, including
any stale branch and the downstream C++ port; a compile error at every site forces a conscious
choice instead. New names: `CLEAN_TEST_POLYGONS` (solves clean, sweeps assert clean),
`KNOWN_DEFECT_POLYGONS` (enrolled with pinned signatures), `FULL_CORPUS` (their union — the only
roster whose name claims totality, and the only one that has it). *User ratified the structure
2026-08-28: "I approve of hav[ing] a named constant of clean polygons. It was the laundering that
I disapproved of."*

**75 — (user, 2026-08-28) Six-point defect observation set from dashboard inspection of a first
solve; investigate-and-fix mandated, pointed by these.** Screenshot at
`examples/several things wrong with first solve.png` (rectangle-like shape, subdivided edges,
exterior vertices 2–8 visible). The user's notes, condensed: (1) vertex 5's bisector failed to
join the 3-way collision at node 17 (offset 50) with vertices 6 and 7's bisectors; (2) e32
carries parents [6,4], a downstream corruption — should be [7,4]; (3) two overlapping nodes where
e17 and e22 meet — label 25 overwrites another (24?), and the node underneath is unselectable in
the UI; (4) **e22 carries parents [7,6], strictly impossible for a bisector originating at vertex
8 — must be [8,7]** — "a very serious defect to allow a primary bisector to be accepted with the
wrong pair of parent edges"; (5) e21 carries [6,5], should be [6,7]; (6) e20 carries [5,4],
should be [6,5]. Points 4–6 form a systematic down-by-one parent shift on consecutive primary
bisectors. Two new sweepable invariants fall out: **I1 — every initial bisector's stored parent
pair equals its source vertex's two adjacent exterior edges** (points 4–6); **I2 — no two
distinct graph nodes lie within merge tolerance of each other** (point 3's solver half; the UI
unselectability of coincident nodes is the dashboard half).

**76 — The near-flat rectangle variant becomes the acceptance fixture of the root-floor
reconciliation package; it is not enrolled today.** F25's faithful near-flat reconstruction
(vertices 0.01 off their chords) is degenerate five unrelated ways — headline:
`canonicalAreaDrift` 2.3e-10 against the 1e-14 bound at level 1, fresh direct evidence for the
one still-unruled F10 item (decisions 19–20 vs F4/F5: sub-regions canonicalise against their own
extent, and a near-flat boundary is where that bites). Ruling: that package, when dispatched,
adds the variant to `KNOWN_DEFECT_POLYGONS` with its measured signature and must move it to the
clean roster to close — the ellipse-promotion pattern from decision 65. Recording rather than
enrolling now keeps decision 72 honest (the shape is not yet a fixture) without losing the
evidence.

**77 — (user, 2026-08-28) The F25 provenance story is corrected and the solver question
reopened: the screenshot was `OFF_EDGE_JITTER_L_SEED_15838` exactly as loaded, unedited.** The
user's words: "This doesn't fix the solver defect... I hadn't made any edits to the polygon...
Keep working." Mandate continues with the corrected premise. The live questions, to be resolved
by measurement: (a) which of the fixture's own vertices canonicalisation removes and their true
perpendicular deviations against the floor — an above-floor removal is a canonicalisation defect;
(b) whether the solve of the canonicalised polygon is itself geometrically correct — the user's
offset-50 three-way expectation and the e32 parentage, re-evaluated against the shape the solver
actually solved; (c) whether e22's geometry — an interior bisector lying along the exterior top
edge — is legitimate; (d) node-for-node comparison of the true fixture's solve against the
screenshot, which the F25 reconstruction only approximated; (e) *(added same day)* second user
screenshot, `examples/solver fails to merge overlapping nodes.png`: two red-circled node clusters
(around ids 29 and 25/22) that "by eye should have been merged by the solver" — the user's
hypothesis: narrow tolerance escape, structural degeneracy, or both. This challenges F25's
"distinct nodes are correct geometry" verdict: nodes that close may be a single true skeleton
node split by unclustered simultaneous events, even when each half is internally consistent. To
be settled against the true skeleton of the canonicalised polygon, not against internal
consistency alone. *(Same day, user):* at maximum UI zoom the two nodes cannot be discerned
separating — under decision 54's own criterion ("can you see this on a screen?") an
indistinguishable-at-max-zoom pair is one point, so the split is a defect by the arc's standing
bar whichever gate caused it.

**78 — The node-merge bar is restated at the render-scale floor: two skeleton nodes within
`SKELETON_NOISE_FLOOR` (1e-6 unit space) of each other are one node.** Ruled on the user's own
criterion, twice stated: decision 54's "can you see this on a screen?", and their 2026-08-28
observation that maximum UI zoom cannot separate the circled pair (measured: 3209× / 7480× zoom
would be needed). The delegate's sizing makes the change safe to rule: the clean roster contains
**zero** node pairs inside that floor — only the three jitter-L defect fixtures carry any (6
pairs total), so clean-corpus results cannot move. F5-style exact coincidence is not achievable
here (the separation is input geometry, not accounting), so the widened bar is the only fix. The
I2 distinctness invariant is restated at the same floor. Implementation follows as its own
package with the standing bar: clean corpus green, every moved pin attributed, STOP if any solve
result moves in a way the floor argument cannot justify.

**79 — `OFF_EDGE_JITTER_L_SEED_15838`'s promotion is gated on the root-floor package, joining
its acceptance set.** Cured on the census grid (5 → 0) but blocked from the clean roster by the
recursion's `canonicalAreaDrift < 1e-14` bound: canonicalisation removes three *jittered* (not
exactly-collinear) samples, costing 5.17e-7 of area — every other floor-touched fixture loses
only zero-area vertices. Whether that bound admits a near-floor exemption IS the still-unruled
root-floor question (decisions 19–20 vs F4/F5; decision 76). Ruling: not decided ad hoc — the
root-floor package now closes on three acceptance criteria: the near-flat rectangle enrolment
(76), this promotion, and the reconciliation itself. Until then the fixture stays
defect-rostered, census signature 0, reason pinned — visible, not laundered.

## Findings

**F26 — The user's circled clusters led to a silent 160%-of-area tiling defect in face tracing,
invisible to every prior invariant.** `traceFace` walked faces by sharpest-turn geometry; at the
circled node the two candidate branches leave 5.2e-6 radians apart (4.8e-10 transversely — not
decidable in doubles), the walk took the wrong branch, and the faces of two opposing walls fused:
`OFF_EDGE_JITTER_L_SEED_15838`'s strips covered **160% of its own area** while reporting
`complete: true`, zero causality violations, zero escaped nodes, every node within 1e-11 of
truth. Three fixtures failed the tiling identity by 50–67%. Fix: **faces are ordered by
parentage — combinatorial and exact — with geometry only a tie-break**; the dumbbell (whose face
genuinely cannot close under parentage — its shared-supporting-line defect from a new angle)
falls back to the geometric walk, keeping its pinned signature bit-exact. Post-fix tiling error
on all three: machine precision, with the residual **exactly** the canonicalisation area drift
(5.174571e-7 vs 5.174570653682168e-7). New corpus-wide invariant `strip-tiling.test.ts` (bar
1e-14, 10× the measured worst 8.52e-16; dumbbell pinned at 0.1). Census 41 → 26 (15838 5→0,
55433 10→3, k4 14→11; the plus bit-unmoved — its root never solves, isolating the cure to the
face walk). Mutation: parentage off → 129 tests die; fallback off → exactly the dumbbell's 5.

**F26a — Verdicts on the reopened questions.** The canonicalisation removals are **legitimate**:
every removed vertex was below the floor in the original ring (the ~3.9e-6 figure is the jitter
*amplitude*; realised chord deviations straddle the floor, ~¼ under). Notes 1/2/4/5/6 were label
artifacts or legitimate-removal effects (fixed in package 8); note 3 was real with the real
downstream consequence above; e22 is a legitimate corridor bisector (the "rectangle top edge"
reading in F25 was wrong — the frame is the L's lower-left); "[2,2]" and "29" are stacked labels
([2,7]/[7,2] and 19/21). **The circled pairs measured**: true separations 1.87e-4 and 8.02e-5
(6.2e-7 and 2.7e-7 of extent; 3209× and 7480× zoom to separate) — sub-visible, and **no
tolerance gate split them**: the events are truly 31–73× epsilon apart in space (one pair even
shares an offset layer at Δt = 5e-5 of epsilon), a property of the input geometry. Hence
decision 78. Both nodes sit equidistant from four walls within 2e-9 — a near-degenerate ridge
from the nearly-collinear jittered walls.

**F25 — All six of the user's observations trace to ONE defect, and it was not in the solver:
the dashboard overlay drew two index spaces at once.** Both new invariants (I1 parentage, I2
distinctness) sweep FULL_CORPUS clean *before* any fix — the solver graph was consistent all
along. The screenshot's own geometry proves it: e20's drawn 45° diagonal matches its *stored*
parents, not the caller's numbering. ~~Cause: the user's click-inserted vertex is projected exactly
onto the segment (~1e-16 deviation), `canonicalisePolygon` removes it silently at the 1e-6 floor~~
*CORRECTED 2026-08-28 (user): no edit was made — the polygon was `OFF_EDGE_JITTER_L_SEED_15838`
exactly as loaded from the dropdown, so the removed vertices were the fixture's own, eaten by
canonicalisation. The click-insertion account was a wrong provenance reconstruction; the
index-shift mechanism and every fix stand, but whether those removals were legitimate (the
fixture's jitter is nominally above the floor) and whether the canonicalised polygon's solve is
itself correct are reopened as live solver questions — decision 77.* The index shift means
every exterior index downstream moves by one — while `skeletonToScene` drew caller-space
labels beside graph-space parents. Reproduced and pinned as `INVISIBLE_VERTEX_RECTANGLE` (clean
roster; with `noiseFloor: 0` the same polygon produces exactly the labels the user expected).
The user's note-3 "overlapping nodes" are genuinely distinct geometry (four nodes over 0.04 units
on a 175-unit shape — correct, sub-pixel); the UI now cycles through stacked nodes on repeated
click. **A test oracle had the same defect class**: `deriveNodeOffsets` indexed the caller array
with solver indices, fabricating the offset/clearance halves of three jitter signatures — F24
amended in place; the direction violations survive on two fixtures, so the silent-wrong family
still stands. Fixes: `canonicaliseForSolve` exported (one shared spelling + remap);
scene labels off the solved graph with removed vertices marked `x`; `DebugPanel` red notice
naming removals; oracle re-indexed. Deprecated `PolygonCanvas` carries the same pattern,
flagged not fixed (unused, slated for removal). Delegate figures: core 4648/4648 (77 suites),
dashboard 268/268, census 57 fixtures (50 clean + 7 defect) / 41 attributed / 0 unattributed
either way; five-way mutation conviction including the noise-floor exhibit. Pins moved only for
the new fixture and the withdrawn oracle fabrications, all attributed. Lead verification: core
**4648/4648 (77 suites)**, build clean, dashboard **268/268**, all re-run by the lead.
**Package 8 committed: `9008495`** (includes the user's screenshot under `examples/` as the
referenced evidence). The outstanding numerical-tolerance surface is twelve distinct items, not a vague cloud.**
Swept 2026-08-27 from the backlog, journal, decisions files, debriefs and source. With known failing
cases: near-degenerate reflex shapes with jitter *along* the edge line (48/80 and 25/80 fail,
[backlog item 2](./solver-hardening-backlog.md), no fixture in repo yet); the collinear dumbbell
(item 7, pinned in `collinear-dumbbell.test.ts`); `inEdges` ordering instability (21/37 fixtures,
no order assertion anywhere). Documented-risk only: caller-space debug recomputation
(`debug-helpers.ts:20`, dashboard sweep overlay); unit-space assert text; unfuzzed corner-correction
guards (item 8); NaN vertices invisible to the bounding-box scan; the un-revisited absolute
`FLOATING_POINT_EPSILON = 1e-8` itself (four defect classes implicate it); duplicated 1e-6 area
floors (`polygon-decomposition.ts:5` vs `recursive-subdivision.ts:103`, review-flagged twice).
*AMENDED 2026-08-27: the "un-revisited absolute epsilon" entry is re-ruled by decision 54 — the
constant is a deliberate pragmatic choice (UE small number) and revisiting it is not an
obligation; only the terminal-ring-finer-than-tolerance regime stays open, judged by visibility.*
Communication, not code: F9's structural-identity-below-1e-13 correction still hasn't travelled
upstream. Needs a ruling: decision 19–20 of
[input-canonicalisation-decisions.md](./input-canonicalisation-decisions.md) (root floor pass-down)
is unreconciled with F4/F5's measurement that the band reopened the other way.

**F11 — Two fixture-exclusion headers carry stale evidence.** `SHORT_EDGE_PROMONTORY` and the three
near-regular fixtures are held out of `ALL_TEST_POLYGONS` for large-coordinate failures written
2026-08-08/09 — before unit-extent normalisation, which now asserts 37/37 out to 1e11, and before
mirror-event canonicalisation closed the many-way-event blocker the near-regular header also cites.
Neither exclusion has been re-measured since. The backlog file itself (dated 2026-08-09) still lists
items 1, 3 and 4 as open though the arc closed them.

**F12 — `GOLF_CART` fails on a structural gap in the n-gon partition, not on tolerance: two
simultaneous split events at distinct points on the same exterior edge are unrepresentable.** The
dedupe loop in `algorithm-complex-cases.ts:164-179` assumes all partition events sharing a
`clockwiseExteriorEdgeIndex` in one layer are nested re-reports of a single split (the clover-leaf
comment); it keeps the smallest and throws when a same-start event *crosses* the kept one — the
observed `start: 0, end: 5, event end: 2`. In `GOLF_CART`, both reflex bisectors (from vertices 3
and 6) split top edge 0 at the same offset (forced exactly, because edges 2 and 6 lie on y=400,
parallel to edge 0 at distance 200) but at *different points*, because the slanted stem side tilts
vertex 3's bisector. The correct partition — three children, the middle bounded by bisectors from
two different source nodes — is inexpressible in a single `BisectionParams`. The clean `T_SHAPE`
survives because its mirror-symmetric bisectors meet *at* the shared split point and the
`interiorNonAdjacent` collision outranks the splits; the slant pushes that intersection past
`maxOffset` (`outOfBounds`, `collision-helpers.ts:212-217`), so nothing pre-empts the two splits.
Tolerance is ruled out by the variant matrix, **re-run and confirmed by the lead**: slant-only with
exact y=400 fails, mild slant (500,400) with bit-exact coordinates fails, perturbation-only
(400, 399.99999999999994) solves, and tilting edge 2 off y=400 (380 or 420) solves by separating
the splits into different layers. The 6e-14 perturbation in the committed fixture is inert — neither
necessary nor sufficient. Matrix lives in `golf-cart-variants-debug.test.ts` (logs verdicts, does
not assert); reproduction in `golf-cart-debug.test.ts` (asserts, fails).

**F13 — `partitionSpan` is inverted against its own specification, verified by the lead reading the
code.** `algorithm-complex-cases.ts:139` computes `(cw − ws + N) % N` while the governing comment
(line 152) and the dedupe loop's own variable roles (`cw` = start, `ws` = end) require
`(ws − cw + N) % N`. On `GOLF_CART` the inversion sorted (0,5) ahead of (0,2) and hit the throw;
under the documented formula the loop would instead **silently** keep a crossing set with spans
totalling more than the polygon — overlapping children, wrong skeleton. The inversion only chooses
between loud and silent failure; it is not the root cause, but it is a latent defect to fix
alongside any partition rework.

**F14 — Both stale exclusion blockers are dead as stated, re-measured 2026-08-27.** Replicating the
two sweeping suites' own assertions against the eight excluded fixtures
(`stale-exclusions-debug.test.ts`, 17 tests): the event-boundary projection blocker no longer
reproduces on *any* of the four fixtures blamed on it — including `NEAR_REGULAR_ELLIPSE_16`, whose
header claims an unclosed chain that survived every fix; and the translation-to-1e9 blocker no
longer reproduces on *any* of the eight, so `SHORT_EDGE_PROMONTORY`'s "promote once that envelope
is fixed" condition is met. What survives is narrower and different: `NEAR_REGULAR_CIRCLE_48` fails
at translation 1e10 only (non-monotonically — 1e9 and 1e11 pass) and `NEAR_REGULAR_ROSETTE5_40` at
1e11 only, both as signalled step-failures, not silent wrong answers. Promotion bookkeeping: the
pinned event-offset count 271 in `offset-event-boundary-regression.test.ts` moves +1 for Circle 16
alone, to 312 for all eight; the scale sweeps and strip-face sweeps were out of measurement scope
and should be run before an actual promotion.

**F15 — The double-split defect was the entire remaining recursive-subdivision failure class.**
Decision 56/57 landed (2026-08-27, uncommitted at first verification) without type changes: the
dedupe key became (start edge, split-source node), sort span-ascending so the narrowest claim wins,
shadowed wide spans become empty children the existing filter drops. Collateral cure, verified by
the lead re-running the full suite on the merged tree (**3594 tests, 3592 green; only the two F14
baseline pins in the scratch stale-exclusions file fail, byte-identical names**): the
recursive-subdivision corpus census went **156 recorded failures → 0** (15266 nodes subdivided,
zero residue rings unsubdivided), and with canonicalisation off the reflex L's failure set
[5,6,8,10] and the plus's [9] are now empty — the solver handles the collinear-subdivision regime
itself. The plus still fails 4/10 irregular seeds with the stage off (F3's measurement stands; the
canonicalisation stage retains that conviction). Mutation-convicted both ways by the implementer
(span inversion re-introduced → 7 tests fail; throw path restored → exactly the four historically
failing variants fail while the four passing ones stay green).

**F15a — Specimen debt created knowingly:** four recursive-subdivision tests that needed a failing
region lost their specimens to the cure and were re-specimened on `COLLINEAR_DUMBBELL`'s still-open
silent-overlap defect (plus one *built* unsolvable region). When decision 53 eventually fixes the
dumbbell, those tests lose their specimen again — flagged in their comments, carried here as an
open item.

**F15b — Rosette5-40 @1e11's failure mode shifted under the fix** (still failing, as pinned):
now dies in a two-edge base case with two source nodes 6e-8 apart at (-0.032224,0) — direct
evidence for F10's terminal-ring-finer-than-tolerance regime, to feed the investigation task.

**F15d — Visual verification passed.** Golf Cart rendered on the `/straight-skeleton` page
(0.75-scaled to fit the fixed canvas; clipboard paste stubbed via `readText` override — the real
clipboard read is permission-blocked under Playwright). Both double-split junctions land at the
F12-predicted positions ((300,500)/(493.4,500) unscaled), the head ridge lies on the medial line,
the slanted stem's spine drifts with the narrowing, no crossings or disconnected spokes.
Screenshot delivered to the user; dev server left running for the near-regular visual pass after
promotion.

**F16 — Package 2 (promotions) landed 3 of 7, and the four hold-outs are two new measured defect
classes, both invisible to F14's scoped replication.** Promoted: `GOLF_CART` (+ index export),
`NEAR_REGULAR_CIRCLE_16`, `NEAR_REGULAR_CIRCLE_32` — corpus 39 → 42. Held out and pinned in
`corpus-enrolment-blockers.test.ts`: (a) `NEAR_REGULAR_ELLIPSE_16/32` — geometry bit-identical
under scale 7 but the two interior nodes of an exact mirror pair **swap ids** (simultaneity
resolved by creation order on an ulp; decision 65); (b) `SHORT_EDGE_PROMONTORY` /
`NEAR_REGULAR_PEANUT_32` — centring subtraction breaks bit-exactness in 4 of 5 recorded
exact-scale cells, sub-ulp of extent (decision 64 promotes them). The two mandated hold-outs
pinned in `large-coordinate-known-failures.test.ts` exactly as F14/F15b measured. Pinned counts
moved honestly per their own rules (event offsets 271→276, mutated 232→237, fired 101→103, corpus
39→42, hop-count offenders 23→24 — Golf Cart joining for the T-Shape's reason); doc counts
unified at 42 (they had disagreed with each other, 35 vs 37, before this). Backlog items 1/3/4
annotated CLOSED; item 5 rewritten to two remaining cells. Delegate figures: core 3747/3747,
dashboard 257/257, census 42 fixtures / 17302 nodes / **0 failures** — the cure holds over the
grown corpus. Mutation conviction: 18/18 inverted assertions failed. Lead verification of the merged tree:
core **3747/3747 (71 suites)**, build clean, dashboard **257/257** — all re-run by the lead.
Visual pass on the promoted `NEAR_REGULAR_CIRCLE_32`: 32 spokes to a single central hub, the
32-way simultaneous event resolving cleanly. **Package 2 committed: `98bbeb4`.**

**F17 — Decision 64 executed: corpus 42 → 44, and the exact-scale list collapsed to `[1]` with
every moved cell attributed.** `SHORT_EDGE_PROMONTORY` and `NEAR_REGULAR_PEANUT_32` promoted. The
normalisation table re-measured over 946 coordinates/cell: four cells (1e-2, 1e2, 1e6, 1e8) left
the exact list, all owned by the two new fixtures — the old 42 re-run alone reproduces the prior
row bit-exactly, and the authored "exact in the SCALING everywhere" invariant measured 0 violations
independently. The sub-ulp bar was restated against polygon EXTENT (worst 5.17e-17) with the
coordinate-relative maximum still pinned loud at 3.469e-16 — the delegate's interpretation,
ratified: it is the form decision 64's own figures use. Translation cells 0…1e11 unmoved at 0
inexact. Pins moved per their own rules (events 276→298, mutated 237→263, fired 103→124, corpus
42→44, offenders 24→26, `touchedAt(1e-2)` 10→12); census 44 fixtures / 19136 nodes / **0
failures**. Delegate: core 3835/3835, dashboard 257/257, mutation conviction 10/10. Lead verification:
core **3835/3835 (71 suites)**, build clean, dashboard **257/257**, all re-run by the lead.
**Package 2b committed: `fdf864e`.**

**F18 — The determinism package landed all four items; simultaneity tie-breaks needed TWO sites,
and the second was caught by the new stability test, not the acceptance test.** Mechanism:
canonical ordering of the simultaneous event set before processing — label-only by construction
(merges in a layer are edge-disjoint, so order changes names, never results; verified bit-unmoved
counts under three-way toggles). Site 1: `clusterCoincidentMerges` orders merges by smallest
interior-edge id. Site 2: `byEventPriority` gains a lexicographic edge-id-list tie-break — without
it, **Golf Cart's own double-split nodes still swapped ids under a translation of 1e3**. The
ellipses promoted (corpus 44 → 46 — every original candidate is now enrolled);
`corpus-enrolment-blockers.test.ts` emptied and deleted. `inEdges` now sorted ascending-edge-id at
construction via `addInEdges` (five push sites routed); the reader audit found exactly one
order-dependent consumer, `firstIncidentParentEdge` (`offset-projection.ts:355`), and the sort
moved `fired` 124→133 through it — more mutations reported, `silentLosses` still empty,
`mutated` bit-unmoved. Degeneracy floor unified as `DEGENERATE_AREA_EPSILON` in `constants.ts` —
the delegate correctly flagged that my brief's "relative area floor" was wrong: both call sites
compare **absolute** signed area in the polygon's own units, and the comment now says so
(ratified). NaN validation at all three public doors (throw for the two solve entries, `error`
for stepped — matching each door's existing idiom), vertex index named pre-canonicalisation.
Delegate figures: core 4081/4081 (71 suites), dashboard 257/257, census 46 fixtures / 20906 nodes
/ 0 failures; mutation convictions 4/1/2/13, with the honest note that the placement sweeps now
convict the tie-breaks, not the `inEdges` sort — recorded in the test header. The delegate's
session died mid-run on an API error and was resumed with context intact; the resume re-audited
the tree before continuing. Lead verification: core **4081/4081 (71 suites)**, build clean,
dashboard **257/257**, all re-run by the lead. **Package 3 committed: `898538e`.**

**F19 — The two pinned translation failures are ONE defect class: sub-epsilon node scatter from a
non-transitive layer window, and the brief's "edge 109" symptom was stale.** Both die in the
two-edge base case (`intersection-edges.ts:46`): the terminal `identical-source` close needs node
separation under the absolute 1e-8, and translation-quantisation scatter lands at 1.7×/6× that.
Upstream, the offset-layer window (`algorithm-complex-cases.ts:80-90`) is not transitive while the
in-layer clustering is, so a convergence straddling the window is cut across layers and partially
merged — Circle 48 @1e10 resolves its 48-way centre as 14 nodes (hubs of 8 and 13 beside pairs).
Non-monotonicity is a rounding lottery, not a band: the widened grid shows Circle 48 failing
{2e9, 9e9, 1e10} and Rosette5 40 failing 9 cells including 3e12/4e12 — **no safe upper threshold
exists**. `solveDegenerateClosure`'s direction test (`algorithm-termination-cases.ts:232`)
normalises a sub-tolerance separation — the exact flaw `sourceLiesAhead` was fixed for. Caveat on
the record: mid-band the *symptom* can be macroscopic (Rosette @5e10: two nodes 22% of extent
apart) though the root mis-merge is sub-epsilon and everything is signalled. Ruled in decision 66.

**F20 — Backlog item 2 re-measured: the along-edge class is dead by construction; the live defect
moved to just above the noise floor.** Under default config every on-line jittered sample deviates
from its chord by ~5e-16 unit space — ten orders under the 1e-6 floor — so canonicalisation
removes the jitter at any magnitude and the class cannot reach the solver (0/80 everywhere; with
the stage off it is alive and slightly worse than 2026-08-09: 90/160 vs 73/160). The new finding:
off-edge jitter at ~a few × the floor fails 22/80 (L) and 46/80 (plus) with default options — the
backlog's control claim is false near the floor. Three literal fixtures pinned
(`OFF_EDGE_JITTER_*`, out of `ALL_TEST_POLYGONS`), with the middle specimen constructed so nothing
sits under the floor — foreclosing the partial-canonicalisation-debris reading. Reconstruction
caveats recorded by the delegate: no 2026-08-09 script survives; magnitude was unrecorded and 1.0
chosen as the only value reproducing the record's control anchor; along-edge counts saturate
across three decades so both plateau ends are pinned. Ruled in decisions 67/68.

**F21 — Decision 68 executed: the closed-class sweep runs in 7.5 s (suite 223 s → 74 s) without
losing conviction.** The subset's k-values `[2,4,7]` are drawn from the counts the full grid
actually fails on with the stage off, and stage-off sampled cells still assert non-zero failures —
so the canonicalisation conviction cannot lapse silently, and a subset drifting off the recorded
grid is caught by a membership guard. The full 80-cell tables live as dated header prose with
`jitterSweep` accepting the full grid as optional parameters for re-measurement. Backlog item 2
annotated with the dated two-point correction (history preserved above it). Delegate: 4119/4119,
mutation conviction 18/18. Two delegate flags ruled: the 7.5 s headroom is declined (coverage
argument suffices; speed is the point), and the one recorded-but-not-run cell (plus off-edge
stage-on m=1.0, measured 0/6, slowest column) is accepted as flagged. Lead verification: core **4119/4119 (73 suites, 73 s)**, build clean,
dashboard **257/257**, all re-run by the lead. **Package 4 committed: `9011260`.**

**F22 — The deformed-peanut defect was a SILENT wrong answer in split-event generation: the
strict `'converging'` guard excluded exactly one point of the split edge's supporting line — its
own source vertex.** Both variants returned `complete: true`, empty diagnostics, with a skeleton
node 29.5 / 40.2 units outside a 410-unit polygon. Mechanism (user's account confirmed in outline,
corrected in detail — the loss is in *split generation*, upstream of collision selection): edge
55's ray runs exactly through vertex 7, the shared endpoint of the forward/reversed test rays in
`generate-split-event.ts:221-224`; both classify `'diverging'` with `alongEdge` exactly 0, so the
legitimate split at t = 91.545 was never generated. The wavefront then reached a later event
(t = 93.85) that should have been shadowed, which emitted a bisector with **negative offset rate**
via the `approximateDirection` override (see decision 70), consumed the waist crossing backwards,
and left edge 55 to walk the polygon and terminate outside. Fix: `reachesSupportingLine` — accept
`alongInstigator > 0` with `areEqual(alongEdge, 0)` — the standing epsilon, no new tolerance;
same defect family as F12's `outOfBounds` discard (a legitimate event lost at a guard boundary
nobody meant to draw). **The fix moved nothing in the pre-existing corpus** (all pins bit-unmoved
at 46, verified by reduction). Corpus 46 → 48; a **containment invariant** landed corpus-wide
(zero interior nodes outside, strictly, no tolerance needed — `skeleton-containment.test.ts`);
pins moved only for the two new fixtures (events 310→334, mutated 283→316, fired 150→171,
offenders 28→30, `touchedAt` 13→15 / 2→3, normalisation inexact cells +1..+3, error bars
unmoved). Mutation conviction: reverting the predicate killed **76 tests across 11 suites** and
drove the census to 57 failures — including the causality sweep, independently confirming the
mechanism. Delegate figures: core 4284/4284 (75 suites, 57 s), dashboard 257/257, census 48
fixtures / 23285 nodes / 0 failures. Lead verification: core **4284/4284 (75 suites)**, build
clean, dashboard **257/257**, all re-run by the lead. **Package 5 committed: `f442249`.**
User visually confirmed the fixed peanut on the dev server, 2026-08-28: "looking very promising."

**F22a — The peanut fix also cured the collinear dumbbell's self-intersecting sub-regions, and
the specimen debt fired for the second time in two days.** The dumbbell's own silent-overlap
defect is untouched and still pinned, but it no longer yields failed regions at any measured
depth/merge-group — so the failing-region specimens in `recursive-subdivision.test.ts` and the
dashboard scene test died again, caught by their own gates, and were re-specimened on the
decision-67 live defect: new export-only fixture `OFF_EDGE_JITTER_L_SEED_55433_K4`, the one
polygon whose root solves while the driver still cuts an invalid region from it. Perishable like
its predecessors and headed as such — when decision 67's defect is fixed, this specimen dies too.

**F23 — The rate-decides-direction fix landed with the corpus bit-identical, and it cured most
of the decision-67 live defect while converting 17 silent wrong answers to signalled failures.**
`bisectorOffsetRate` (the same cross-product `makeOffsetDistance` prices collisions with, read
from the edge's stored parent) now decides direction whenever it clears the standing tolerance;
`approximateDirection` survives only as the anti-parallel tie-break. Corpus verified bit-identical
by a 1931-line full-graph digest diff; baseline had 0 negative-rate bisectors among the corpus's
923 (why it was latent). Outside the corpus it was live: off-edge jitter cures L 22/80 → **1/80**
and plus 46/80 → **13/80** — most of F20's class; both pinned `OFF_EDGE_JITTER_L` fixtures now
solve as roots with zero escaped nodes (held out per decision 71b — they still defeat the
recursive driver). The 17 flipped cells (16 in the circle-32 jitter band + Rosette5 @2e11) each
had negative-rate bisectors before — ruled never-a-pass, decision 71a. New pins: the rate
invariant sweeps corpus + hold-outs plus three discriminator cells where the old code actually
broke it. **The parentsInverted-inversion finding is withdrawn** (see the D70 amendment) — the
delegate corrected its own record and convicted the correction both ways. **F19 wrinkle for the
record:** Rosette5 @1e11's terminal-ring separation moved from 6e-8 (1.7–6× epsilon, too wide for
the `identical-source` close) to **4.7e-9 — under the epsilon — and the close still does not
fire**, so F19's mechanism account is now incomplete for that cell; decision 66's
accept-by-construction stands, but any future fixer starts there. Delegate figures: core
4345/4345 (75 suites, 57 s), dashboard 257/257, census 0 → 0. Mutation convictions: direction
rule off → 15 tests / 4 suites die; collapse reverted → 0 die; actual swap → 559 die. Lead
verification: core **4345/4345 (75 suites)**, build clean, dashboard **257/257**, all re-run by
the lead. **Package 6 committed: `5bf7bda`.**

**F24 — Enrolment restructure landed (decisions 72–74): the full corpus is 56 (49 clean + 7
known-defect), nothing is outside the sweeps, and enrolment immediately exposed three more silent
wrong answers.** `ALL_TEST_POLYGONS` removed at 164 sites across 33 files (grep-zero outside
history notes and two deliberate migration notices); clean roster is `CLEAN_TEST_POLYGONS`,
defects `KNOWN_DEFECT_POLYGONS` with per-fixture pinned signatures, union `FULL_CORPUS`. The
census sweeps everything: 41 attributed failures, an unattributed failure OR cure fails the suite
(cure says PROMOTE IT). Universal invariants measured over the defect roster, not assumed:
containment, rate, and signalled-not-silent all hold and are widened to FULL_CORPUS — but the
~~**causality signature table shows three of four jitter fixtures are silent wrong answers**
(`complete: true` with swept-past nodes and edges ending behind their sources)~~ *PART-WITHDRAWN
2026-08-28 (F25): the offset/clearance halves of those signatures were fabricated by a
caller-indexed test oracle — the same index-space defect class F25 fixed. What survives:
direction violations on two jitter fixtures, both still `complete: true`, so the
silent-wrong-answer family remains represented* — which every sweep
missed while they were held out — the user's anti-laundering ruling was materially, not just
philosophically, right. The dumbbell's headers now state its own test is the only sweep that sees
its defect. Dashboard: grouped picker (`Corpus` / `Known defects`, ⚠-labelled) on both pages, demo
page resolution fixed (it would have silently drawn Triangle for a defect fixture).
`SYMMETRICAL_OCTAGON` promoted (stale non-termination comment re-measured dead). Delegate figures:
core 4463/4463 (75 suites), dashboard 263/263, census 41 attributed / 0 unattributed; mutation
convictions include the laundering move itself (removing a defect fixture from its roster: two
suites die). Lead verification: core **4463/4463 (75 suites)**, build clean, dashboard
**263/263**, all re-run by the lead. **Package 7 committed: `f5039ea`.**

**F24a — Two pre-existing prose drifts and a typecheck gap surfaced by the re-measurement,
carried as open items.** (1) `CORPUS_CANONICAL_AREA_DRIFT_BOUND`'s narrative was three corpus
growths stale; re-measured 17120 nodes / 110 reduced / max drift 5.19e-15 — **the 1e-14 bound is
under 2× the measured maximum**, thin for a bound written as headroom. (2) `propagatedFloors`
prose likewise re-measured (1111 of 1339). (3) **No pipeline typechecks `packages/core/tests`**
(`tsconfig include: ["src"]`, ts-jest without diagnostics) — the decision-74 loudness guarantee is
build-enforced for src but only runtime-enforced for tests; a candidate ruling for next session.

**F15c — The specimen debt reached the dashboard.** Arrival routine (core sweep → build →
dashboard sweep) caught it: `recursiveSubdivisionToScene.test.ts`'s "a failed cell among tinted
ones" block fails 2 tests because its specimen fixture now solves. Its own conviction gate ("is a
fixture that really does fail, or this proves nothing") is what fired — P2 vindicated. Dashboard
otherwise green: 255/257. Re-specimened by Opus delegate on the core precedent (dumbbell / built
region) before commit 1. **Resolved:** specimen is now `Broken Polygon` at merge group 5, full
depth (the dumbbell only fails below full depth, where residue rings render as dashed fills and
would poison the block's fill census — a constraint the core precedent didn't face). Dashboard
verified by the lead: 257/257. **Package 1 committed: `b7d5b63`.**
