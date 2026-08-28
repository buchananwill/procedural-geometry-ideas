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

## 5. Open items

Carried unchanged from session-1 journal §4 (C++-team correction, radial promotion, leaf slicing,
merge heuristic, collinear dumbbell, size ladder).

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

## Findings

**F10 — The outstanding numerical-tolerance surface is twelve distinct items, not a vague cloud.**
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
dashboard **257/257**, all re-run by the lead. **Package 4 committed: see commit log.**

**F15c — The specimen debt reached the dashboard.** Arrival routine (core sweep → build →
dashboard sweep) caught it: `recursiveSubdivisionToScene.test.ts`'s "a failed cell among tinted
ones" block fails 2 tests because its specimen fixture now solves. Its own conviction gate ("is a
fixture that really does fail, or this proves nothing") is what fired — P2 vindicated. Dashboard
otherwise green: 255/257. Re-specimened by Opus delegate on the core precedent (dumbbell / built
region) before commit 1. **Resolved:** specimen is now `Broken Polygon` at merge group 5, full
depth (the dumbbell only fails below full depth, where residue rings render as dashed fills and
would poison the block's fill census — a constraint the core precedent didn't face). Dashboard
verified by the lead: 257/257. **Package 1 committed: `b7d5b63`.**
