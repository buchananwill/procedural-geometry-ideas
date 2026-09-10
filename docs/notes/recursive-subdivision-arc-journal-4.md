---
title: "Recursive Subdivision Arc: Session 4 Journal"
type: workflow
status: active
---

# Recursive subdivision arc — session 4 journal

**This is the head of the thread**, continuing
[the session-3 journal](./recursive-subdivision-arc-journal-3.md). Decisions continue at **111**
(53–110 in the session-3 journal, 1–52 in
[recursive-skeleton-subdivision.md](./recursive-skeleton-subdivision.md)); findings continue at
**F45** (F10–F44 in the session-3 journal, F1–F9 in the session-1 journal).

## Reading order for a fresh context

Read §2 (state), §4 (next work), then the Decisions and Findings below — they are short this
session. For the weighted-offsets background read the session-3 journal's §4 item 5 only; for
the C++ handoff background read its §4 item 2 and F44 only. **Do not read the session-3 journal
(~1500 lines), the session-1 journal, the design doc, or the decisions files end to end.**

## 1. The arc's charter

Unchanged: recursive skeleton subdivision on branch `feature/recursive-skeleton-subdivision`.
This session's mandate from the user (2026-09-10): **(1) implement weighted offsets; (2) author
the handoff document that brings the C++ team's straight-skeleton solver up to date with every
addition since their fork last looked at this repository.** The session-3 lead's priority order
(root-floor reconciliation first) is not overruled — the user is stating the priorities as seen
from the game runtime that drives this work. See decision 111.

## 2. State as at bootstrap

- Branch `feature/recursive-skeleton-subdivision`, tip `e88da1f`, working tree clean, **no
  upstream configured** (nothing has left this machine — carried from session 3).
- Core **5249/5249 (83 suites, 121 s) — measured by re-running at bootstrap**, identical to
  session 3's close. Dashboard **308/308 (21 suites) — measured by re-running at bootstrap.**
  Corpus 59 (53 clean + 6 defect-rostered) inherited from session 3.
- The C++ port's fork point is **commit `e2544d4` on `main`, vendored 2026-08-10** (F45). That
  commit is an ancestor of the current tip; the tip is 109 commits ahead of it.

## 3. Operational manual

Carried by reference from the session-3 journal §3 (pnpm invocation, `--testPathPatterns`
without an inner `--`, never pipe the dev server through `head`, Playwright as a standing
visual-verification tool) and the session-1 journal's process learnings. Additions this session:

- `$CLAUDE_SCRATCHPAD` is **not set** in the Bash tool's environment; a redirect to
  `"$CLAUDE_SCRATCHPAD/x.log"` writes to `/x.log` and fails. Use the literal scratchpad path.
- A quoted heredoc (`<<'EOF'`) of more than ~100 lines through the Bash tool failed with an
  unmatched-quote parse error; write long files with the Write tool.
- The C++ port lives in the `resort_game/claude_work` worktree at
  `Source/PistePerfect/{Private,Public}/Geometry/Skeleton` (16 `.cpp`, 18 `.h`). Its vendored
  TypeScript reference is at `Notes/technical-reference/proc-geo-ts/` with a README stating the
  provenance; its governing document is `Notes/buildables/procedural-settlement-roadmap.md`,
  whose §3b is the divergence register (D1–D6). Read-only from this repository.

## 4. Next work

**Phase 1 (bootstrap, design, handoff draft) is complete and committed at `f3bc733`; Phase 2
is GO (decision 125).** Package 1 (digest) landed at `0c9c9cd` (F49). Package 2 (solver core)
dispatched to Opus 2026-09-10 against that pin table; package 3 waits on it.

Phase 2, the implementation packages, in the order the spec's falsification bars require:

1. **Digest first** (decision 116): `full-graph-digest.test.ts` pinning all 59 fixtures on the
   pre-weight tip, convicted by a one-ulp mutation, committed alone.
2. **Weighted core** (W-spec input surface through terminal cases, the kernel, the bisector
   spelling, the `{distance, weight}` arrival pair, both door guards of decision 119): digest
   unchanged on all 59 except the attributed incenter-fallback movement (decision 115); the
   spec's §4 analytic fixtures land in the same package as its conviction.
3. **Degenerate machinery and downstream** (W-spec degenerate closures, I5's weight condition,
   offset projection, canonicalisation's merged-edge rule of decision 117, normalisation's
   enumeration, the dashboard overlay of decision 114(ii)); the ratio ladder `R ∈ {10, 30, 100,
   300}` measured and reported for the user's ruling on the constant.
4. **Handoff §8 revised with measured results**, then the handoff leaves draft status. Push/PR
   remains the user's call.

Carried open (session-3 §4 item 1): the root-floor reconciliation package, which gates deep
recursion and therefore W-spec W46's second landing.

## 5. Open items

Carried from session 3 §4 items 1, 3 and 4 unchanged: the root-floor reconciliation package
(structural, four exhibits), decision 92's presentation contraction, decision 107(b)'s fixture,
`graph-merge.ts:110`'s caller-space epsilon, the two unmeasured bars from F42, push/PR, and the
anchor-edit caution (re-append the heading in `new_string` when inserting before it).

---
## Decisions

**111 — (user, 2026-09-10) Session-4 priorities, as seen from the game runtime: weighted
offsets first, the C++ handoff document second.** The user's words, near-verbatim: "my principle
objectives of this arc are to implement weighted offsets, and author the hand-off document for
the C++ team to bring their straight skeleton solver up to date with the additions since the
fork last looked at this version. The previous Arc Lead has given a different priority order;
I'm not overruling that but giving you the priorities from my perspective. The other issues are
important, but not necessarily visible from the view of the game runtime that is driving this."
Lead's reading, recorded: the two objectives are coupled, not sequential — the handoff is the
port's channel and the port is what the runtime executes, so the weighted-offsets design must
land in the handoff as a port-first section (the pattern decision 106 set for the tolerance
model). Therefore the handoff drafts NOW against the fork delta and the already-ruled contents,
and gains its weighted-offsets section when that design is ruled. Session 3's item 1 (root-floor
reconciliation) is carried as an open item, not dropped, and the handoff states plainly that
deep recursion waits on it.

**112 — The weighted-offsets contract, elevated from the session-3 assessment (its §4 item 5)
to rulings.** (a) **A weight is a per-exterior-edge, strictly positive scalar speed**; edge
`i` runs from input vertex `i` to `i+1`, and the weights enter as an optional array parallel to
the input vertices on `SolveSkeletonOptions`, default all ones. (b) **Offset means TIME.** Every
quantity today called an offset is the arrival time of a wavefront moving at unit speed; under
weights the same quantity is `distance / weight`, and decision 102's linear-causality invariant
is restated over time unchanged. (c) **Weights enter predicates division-free**, by
cross-multiplication on decision 105's single basis — `d₁·w₂` versus `d₂·w₁`, never a divided
rate compared against a divided rate. (d) **Unit weights must reproduce the current corpus
BIT-IDENTICALLY** — the full-graph digest over all 59 fixtures is the extension's first
falsification bar and is run before any weighted fixture is believed. (e) **Zero and infinite
weights are out of scope by contract**: the vertex velocity is the solution of `v·n₁ = w₁`,
`v·n₂ = w₂`, and as a weight tends to zero the trace collapses onto that edge's own line and
well-posedness dies; gables are a post-process on an all-positive solve, not a solver input. A
maximum weight ratio is a named, stated constant and the solver refuses inputs outside it
loudly. (f) **The degenerate machinery is the real work and is fixtured first**: parallel walls
at unequal speeds DO meet (`solveParallelClosure`'s no-future-event premise is false under
weights), I5's static-midline discriminator gains a weight condition, mirror symmetries weaken,
and the fast-beside-slow reflex configuration is the conditioning hazard to fixture before any
of it is coded. (g) The design is authored as a decision spec at
[weighted-offsets-decisions.md](./weighted-offsets-decisions.md), drafted by a delegate from a
verified site roster and ratified by the lead; **no production code changes until it is
ratified**.

**113 — The C++ handoff is keyed to the fork commit `e2544d4` and answers the port's own
divergence register entry by entry.** It lives at
[cpp-port-handoff.md](./cpp-port-handoff.md). Contents, as ruled in session 3 (§4 item 2) and
extended: (1) the fork delta — every solver-relevant change in `e2544d4..HEAD`, grouped by
mechanism, not by commit; (2) the decision-99 correction from the design doc's "Downstream"
section (droste-only recursion rests on a substrate claim that is false for segment recursion)
and the F9 correction (the defensible D1 claim is structural identity below 1e-13, not
byte-identity); (3) the port's divergence register D1–D6 re-read against the current tip —
which entries the reference has since caught up on, which stand; (4) the invariant conformance
kit (I1–I5, containment, causality, tiling, folds, walkability) with the 59-fixture pinned
signatures and porting notes; (5) the tolerance model (decisions 101, 104–106) as the
port-first design; (6) the residual register, empty by F44; (7) the honest boundary: rooflines
send-ready, deep recursion waits on the root-floor reconciliation; (8) a weighted-offsets
section appended when decision 112(g)'s spec is ratified. The document is written for a reader
who has the vendored snapshot and the port, not this journal.

**114 — The weighted-offsets decision spec at
[weighted-offsets-decisions.md](./weighted-offsets-decisions.md) is RATIFIED with the rulings
115–119 below applied in place; its numbered series W1–W53 is cited as "W-spec Wn" and is the
implementation contract.** Lead verification on the merged result: the kernel closed form
`v = (w₂·c − w₁·b) / (c × b)` re-run from the delegate's scripts; the scaled-difference bisector
spelling `normalize(w_ws·c − w_cw·b)` reproduces today's `makeBisectedBasis(c, −b)` bits on
200 000 random vertices and every named configuration (0 mismatches, re-run by the lead); the
Cramer spelling is 0–3 ulps off and is prohibited by W-spec W52. Standing amendments: (i) the
delegate's step-configuration scratch printed `t = −1 (expected 1)` — a sign slip in the scratch
script, not in the spec, whose W32 states the riser collapses at `t = h / |w_low − w_high|`
correctly; (ii) W15's dashboard overlay of primary bisectors GAINS the weights parameter — an
overlay that shows unweighted bisectors over a weighted solve is a wrong picture.

**115 — Decision 112(d) AMENDED: bit-identity at unit weights is the bar at every site where
today's operations can be performed in today's order, and the ONE site where it cannot — the
incenter fallback of `generate-split-event.ts` (W-spec W21) — is replaced by the linear equi-time
form with its digest movement measured and attributed pin by pin.** The alternative, keeping
today's construction when both weights are exactly one, is a branch on unit weights, which
W-spec W36 forbids on decision 105's ground (the input `(1, …, 1 + 2⁻⁵²)` must not be solved by
different code from `(1, …, 1)`). One predicate basis outranks the preservation of historical
arithmetic. The movement is bounded by ulps by construction (same point, different arithmetic)
and any pin that moves by more than ulps is a defect in the linear form, not an attribution.

**116 — The full-graph digest test (W-spec W51) lands FIRST, as its own commit on the current
tip, before any weighted change.** F47 records that no committed digest exists; every "digest
bit-identical on all 59" claim in the session-3 journal (F41, F42, F43) was a scratch measurement
by a delegate. 112(d)'s instrument must exist and be pinned on the pre-weight tip so the weighted
branch is measured against a committed baseline, not a re-derived one. Contents as the spec
states: SHA-256 over the denormalised graph of every `FULL_CORPUS` fixture — node positions as
64-bit patterns, edge source/target/basis bits, interior-edge parents and `maxOffset` bits, in id
order. Convict it by mutation before trusting it: perturb one node coordinate by one ulp and
watch the pin die.

**117 — STRUCK AND REVERSED by decision 120 (user, 2026-09-10).** The ruling below removed a
weight-change vertex as if it were invisible; under weights such a vertex is structural (a
dormer boundary on a straight wall), and removing it destroys the client's intent silently. The
original text is kept for the record. ~~W-spec W44 RULED: a vertex removed by canonicalisation
that separated two unequal weights hands the merged edge the weight of its LONGER constituent,
with a diagnostic naming the vertex and both weights.~~ Reason as originally given: a vertex the client cannot see cannot carry a weight
change the client can see; the longer constituent is the silhouette the floor kept. Pinning the
vertex instead (option a) keeps exactly the near-straight weight-change vertex whose speed is
`|w₁ − w₂| / sin(turn)` — W49's conditioning hazard — in the solve; refusing (option c) makes a
sub-floor authoring accident fatal for a runtime. The spec's settling measurement (the §4
fixtures under all three options, tiling identity and fold sweep at level 1) still runs and is
reported; if (b) fails the tiling identity on any fixture this ruling is reopened.

**118 — W-spec W46 RULED: the first landing applies weights to the ROOT solve only; sub-region
solves run at unit weight, and when the boundary-provenance plumbing exists the policy is option
(a) — perimeter and contour runs inherit the parent edge's weight, ridge and cut runs take weight
one.** The runtime's need is rooflines at the root (decision 111); recursion is behind the
root-floor reconciliation anyway (session-3 §4 item 1). The recursion census signatures are
unmoved by construction under this ruling and the digest of decision 116 pins that.

**119 — W-spec W48 and W49 RULED: `MAX_WEIGHT_RATIO = 100` as derived
(`SKELETON_NOISE_FLOOR / FLOATING_POINT_EPSILON`), weights normalised to minimum one (W-spec N9
ratified), and the angular guard is option (a) — a vertex whose two weights differ and whose
`|c × b|` is below `PARALLEL_GATE_SINE_BAR` is refused.** Both refusals are thrown `Error`s
naming the offending edge or vertex, matching `assertVerticesAreFinite`. Reasons: the ratio
value is derived from the two ruled constants, not picked, and stays open to the runtime's
stated need — the spec's ladder `R ∈ {10, 30, 100, 300}` is run and reported so the user can move
it with a measurement in hand; the angular guard reuses an existing named bar (decision 104's
discipline) rather than minting a new one, and it is the same question — "is this turn too
small to price?" — that the bar already answers for intersections. Unit weights never reach
either guard. *~~AMENDED by decision 121 (2026-09-10): the turn-sine guard is a CLASSIFIER, not a
refusal — a weight-changing vertex below the bar is resolved as a straight vertex by the riser
convention.~~ Amendment STRUCK by decision 124: the guard is a REFUSAL as originally ruled, and
its contract statement is "weights may change only at a visible corner".*

**120 — (user, 2026-09-10) Under weights, a vertex whose two incident edges carry different
weights is STRUCTURAL and is never removed by canonicalisation, whatever its deviation from
the chord.** The user's thought experiment, recorded: a perfect square building with an
exactly collinear vertex at the centre of each edge, placed there because the building has
dormer windows. Without weights the straight skeleton gives no control over how a dormer
interjects into the surrounding roofline; with weights, "the varying edge weights manifestly
make the collinear vertices no longer trivial (i.e. they now have an effect)" — so the
definition of canonicalisation changes under weights. Consequences: decision 55's rule
("a vertex collinear with the direct edge between its two neighbours contributes nothing") is
amended to "collinear AND equal-weighted contributes nothing"; W-spec W44 is re-ruled to
option (a) — every vertex whose incident weights differ is pinned through the existing
`pinnedIndices` mechanism, no diagnostic, no merge; the settling measurement is retired
because there is nothing to settle. Decision 117 is struck. Unit weights are untouched: with
every weight equal no vertex is pinned by this rule and the digest cannot move.

**121 — SUPERSEDED by decision 124 (user, 2026-09-10): no riser convention is implemented;
the straight weight-change vertex is REFUSED at the door.** The text below is kept as the
design record of what a riser would be, should a stitched dormer feature ever want it.
~~A straight (or sub-bar) vertex with a weight change is resolved by a RISER
CONVENTION, and decision 119's turn-sine guard becomes the classifier that routes to it.~~
The kernel `v·n₁ = w₁`, `v·n₂ = w₂` is inconsistent when `c × b = 0` and `w₁ ≠ w₂` (W-spec
W10): the two offset lines are parallel at different distances for every `t > 0`, and the
wavefront has a step of height `|w₁ − w₂|·t` at the vertex. The step is a riser — a zero-length
edge inserted at the vertex, perpendicular to the wall, whose own weight `w_r` decides the trace
of the two vertices it creates: each is the ordinary kernel of (wall, riser). This is the
literature's resolution (Biedl, Held, Huber, Kaaser, Palfrader, *Weighted straight skeletons in
the plane*), where the skeleton is well-defined only once the riser's direction and weight are
fixed. Ruled now: (a) the riser is perpendicular to the wall — the only direction with no free
parameter; (b) a weight-changing vertex whose `|c × b|` is below `PARALLEL_GATE_SINE_BAR` is
classified STRAIGHT and takes the riser, which is what dissolves W49's `|w₁ − w₂| / sin(turn)`
hazard — below the bar the ill-conditioned kernel is never evaluated; above it the kernel is
well-conditioned by the bar's own derivation; (c) the riser's two vertices are ordinary
wavefront vertices thereafter — they collide, split and terminate like any other, and the riser
itself is a wavefront edge whose collapse is an ordinary edge event. **OPEN, the user's call —
the riser weight `w_r`:** (i) `w_r = 0`, a stationary riser — the vertices move straight inward
at their own wall speeds and the step is a vertical dormer cheek in the roof reading; this is a
zero-weight edge inside decision 112(e)'s fence and would need the fence reopened for risers
specifically; (ii) `w_r = min(w₁, w₂)` or the mean — a positive riser, inside the contract, the
cheek leans; (iii) `w_r` as an explicit per-vertex input beside the edge weights, default one of
the above. The measurement that informs it: the dormer square of decision 122 solved under (i)
and (ii), rendered, and compared against what a dormer roof looks like.

**122 — AMENDED by decision 124: the dormer square stays in the W-spec roster as a REFUSAL
conviction, not a solved fixture.** ~~The user's dormer square is a named fixture in the W-spec
roster: a square with an exactly collinear vertex at the centre of each edge and unequal
weights either side of it. Its analytic expectation under each riser convention is stated in
the spec before the fixture is believed, and it is the conviction of decisions 120 and 121
together: with the vertices canonicalised away it solves as a plain square, which is the wrong
answer made visible.~~ As amended: the fixture is refused at the door with an error naming the
vertex, and the test asserts that refusal; the negative control (canonicalised away, it solves
as a plain square) is retired because the door is reached first.

**123 — SUPERSEDED by decision 124: not implemented. Kept as the design record.** ~~The riser
is implemented as a REAL zero-length exterior edge~~ inserted by a boundary-stage
rewrite that runs last — after canonicalisation, winding normalisation and decomposition,
immediately before the simple-polygon solve — with its basis supplied explicitly because a basis
made from coincident endpoints is the zero vector.** Ruled on the delegate's evaluation of both
implementations (W-spec W53): inserting the riser as an edge keeps the solver's load-bearing
identity "exterior edge id = vertex index = node index" intact, whereas emitting two bisectors
plus a synthetic wavefront edge inside `initInteriorEdges` would need a separate exterior-edge
count at every `numExteriorNodes` site (`edgeRank`, `getInteriorWithId`, `span`,
`activeExteriorEdgeSegments`, the n-gon partition arithmetic). The delegate's three flagged
interpretations are adopted: the riser's inward normal faces the SLOWER wall (lead-checked: the
strip between the two offset heights on the slow side is unswept interior); insertion after
canonicalisation because both riser twins have zero chord deviation and would otherwise be
removed; and the `identical-source` terminal branch needs a riser exclusion. The solve result
reports the inserted riser indices so a consumer can map nodes back to input vertices.

**124 — (user, 2026-09-10) MODEL INVARIANT: the base of the roof lies in a single plane, no
roof-perimeter vertex lies outside it, and anything that must violate this is a separate
feature stitched into the skeleton's roof solution — dormers included.** The user's words,
near-verbatim: "I think dormers are best modelled entirely separately from the straight
skeleton. I think our model invariants need to draw a line somewhere, and that line is: the
base of the roof lies in a single plane. No roof perimeter vertices lie outside this plane.
Anything that needs to violate this needs to be modelled as a separate feature and stitched
into the roof solution produced by the skeleton. Otherwise we might as well take any arbitrary
3D polyline and try to make a straight skeleton from it, which is a manifestly more difficult
problem." Consequences, ruled: (a) decisions 121, 122 and 123 are superseded — no riser
convention, no zero-length edges, no dormer solve; their text stays as the design record. (b)
Decision 119's turn-sine guard is a REFUSAL again, and its contract statement is **weights may
change only at a visible corner**: a vertex whose two weights differ and whose `|c × b|` is
below `PARALLEL_GATE_SINE_BAR` is refused with an error naming the vertex, before
canonicalisation runs. This is the same class of fence as 112(e)'s zero weights — a
configuration the weighted skeleton cannot make well-posed without an extra convention is
outside the contract, not inside it with a convention bolted on. (c) Decision 120 STANDS as
narrowed: a weight-change vertex that passes the door has a visible turn, is structural, and is
pinned through `pinnedIndices` so a sub-floor chord deviation never merges it — the kernel there
is conditioned by the turn, which the door has already bounded, not by the deviation. Decision
117 stays struck: a weight-change vertex is never silently merged in either direction. (d) The
invariant is a stated model invariant in the C++ handoff, because the port's runtime is where
the stitched features will be built.

**125 — (user, 2026-09-10) Phase 2 is GO; the documents commit first; delegates default to
Opus, with Sonnet for work that is mechanical in execution.** Applied: the digest test (decision
116) is dispatched to Sonnet because its content is fully specified and its gate is convicted by
mutation and re-run by the lead; the weighted core and the degenerate machinery go to Opus.

**126 — W-spec W33 (the equi-time check on the `co-linear-from-1` leading-source closure) is
NOT implemented; the closure stands on the raw separation, and the check is re-opened only
with a weighted fixture that reaches the branch.** The package-2 delegate wrote and measured
it over the whole corpus at unit weights: the digest does not move (all 59 native pins
survive), but the branch is reached by near-anti-parallel corridors whose two mid-lines carry
constant, slightly different times, so the check FIRES there. With W33's stated consequence
(fall through to the throw) ten pinned assertions across six suites move, including the
recursion census reporting jitter-plus seed 7919 at 16 failed regions where 15 is pinned — a
defect growing, which the corpus doctrine (decision 72) treats as a regression. With the
softest consequence (fall through to the ordinary termination) four move, including an
UNATTRIBUTED CURE (rosette5-40 at 1e11, 2 → 1 unresolved) and the 48-way cluster at 2e10
shattering 11 → 12 nodes. Neither rewrite of the failure register is justified by anything
measured: no §4 weighted fixture reaches the branch, so nothing shows what the check buys.
Ruled: leave the site as it is, with the delegate's block comment recording the measurement;
the discriminating weighted fixture — a corridor whose walls carry different weights and whose
closure is reached through `co-linear-from-1` — is an open item (§5).

**127 — The package-2 delegate's sixteen interpretations are ADOPTED, and the spec's §4.8
companion corner velocities are corrected to the delegate's derivation.** Of note: (a) the
spec's §4.8 four-cycle claim (four-fold rotational symmetry with no mirror) is arithmetically
impossible — alternating weights give opposite edges the same speed, so the shape is
mirror-symmetric about both axes; the derived velocities `(1,2), (1,−2), (−1,−2), (−1,2)` are
what the fixture asserts, and the spec is amended to say so; (b) §4.3's second variant is
re-authored as a 10×10 square with a bottom-wall vertex at turn sine exactly 1e-3, weights 4
and 1, kernel speed 3e3 — the same number for the same reason; (c) W44's pin needed a new
fixture (a sub-floor bump with a super-bar turn), which only exists when the incident edges
are short — the delegate's addition is right and the spec's roster gains it; (d)
`compareArrivals` returns 0 for an exactly equal pair even at ε = 0, where `fp_compare`
returns 1, because three stable sorts rely on it — stated at the function; (e) the merged
graph's `exteriorWeights` is the concatenation in sub-graph order and `weightOf` on a merged
context is unsupported, consistent with the port's decision not to port `graph-merge`. The
consequence the delegate flagged for package 3 is binding: `computeNodeOffsets` still returns
DISTANCES while `maxOffset` and `offsetDistance` are now TIMES — identical at unit weights,
divergent the moment a weight is not one — so package 3 lands W40 before any weighted solve is
projected.

---
## Findings

**F47 — No committed full-graph digest test exists; the session-3 "bit-identical on all 59"
claims were scratch measurements.** `digest` appears in `packages/core/tests` only in the
angular-predicate-basis test's prose, and in three source comments; the measurements behind
F41, F42 and F43 were delegate scratch scripts that did not survive their sessions. Decision 116
is the consequence.

**F48 — The weighted kernel's conditioning hazard is ANGULAR, not a ratio: at unequal weights the
vertex speed is `|w₁ − w₂| / sin(turn)`, unbounded for any weight ratio.** Measured by the
delegate and re-run by the lead: speed `1.5e7` at a turn of `1e-6` with weights (1, 16), where
the solver's `1e-8` time window becomes a spatial slack of `0.15` of the unit extent. This is the
user's fast-beside-slow reflex reading from session 3, quantified, and it is why decision 119
adds a turn-sine guard on weight-changing vertices rather than tightening the ratio.

**F49 — The digest gate is live and convicted, and the solver is nearly bit-exactly invariant
under a power-of-two rescale: shifting the normalisation exponent by one moved only 4 of 59
pins.** `full-graph-digest.test.ts` (123 tests: 59 pins, 59 determinism, 4 sensitivity, 1
coverage) measured on `f3bc733`. Convictions: the delegate's mutation (collapsing
`PARALLEL_GATE_SINE_BAR` onto `DIRECTION_SINE_BAR`) killed exactly the one pin its doc-comment
predicts (jitter plus, seed 7919); the lead's mutation (`exponent + 1` in `normalisation.ts`,
i.e. solving at half the unit extent) killed 4 — so 55 fixtures produce identical bits at half
scale, which is what an exact power-of-two round trip plus scale-free predicates should give,
and the four movers are the fixtures where the absolute `1e-8` / `1e-6` bars bite. Delegate
interpretations adopted: node incidence lists are not serialised (redundant with edge
source/target); `InteriorEdge.length` is serialised though it is a constant sentinel; the
`context === null` branch is written but unexercised by the corpus. Full core suite 5372/5372
(84 suites) reported by the delegate; the digest suite re-run by the lead.

**F50 — Weighted offsets landed in the solver core at `3dd467c`, lead-verified: core 5466/5466
(85 suites, 86 s) re-run on the merged tree, the digest's 14 movers all attributed to the
incenter replacement at ≤ 3 ulps with nothing structural moved, and the kernel-spelling
conviction re-run by the lead (swapping the two weights kills 14 of 94 weighted tests).**
Surface: `WeightOptions.weights` on `SolveSkeletonOptions`; `Arrival {distance, weight}`;
`exteriorWeights` on the graph with `weightOf` on the context; `MAX_WEIGHT_RATIO`,
`MIN_WEIGHT_TURN_SINE`; `makeWeightedBisectedBasis`, `compareArrivals`, `arrivalsAreEqual`,
`arrivalOf`, `assertWeightsChangeOnlyAtVisibleCorners`. Fixtures: `weighted-fixtures.ts` (not
enrolled — weights are an option, not a polygon property) and `weighted-offsets.test.ts` (94
tests) including the equi-time property at every interior node, the weighted generalisation of
I3. Delegate figures: dashboard 308/308 and dashboard build green (not re-run by the lead).
Binding for package 3: `computeNodeOffsets` still returns distances while `maxOffset` and
`offsetDistance` are now times — W40 must land before any weighted solve is projected.

**F45 — The fork point is located and measured: the port was vendored from `main` at
`e2544d4` on 2026-08-10, and the current tip is 109 commits ahead of it.** Evidence: the
vendored reference's README in the game repository states the commit, branch and date; `git
merge-base --is-ancestor` confirms the commit is on this branch's history. The solver-relevant
delta (`packages/core/src` and `packages/test-fixtures/src`) is 34 files, +5994/−303 lines, and
includes six source files that did not exist at the fork: `canonicalisation.ts`,
`normalisation.ts`, `recursive-subdivision.ts`, `region.ts`, `skeleton-tree.ts`, `spine.ts`.
Observed from the commit log, to be verified by the handoff delegate: unit-extent normalisation
landed here on 2026-08-16 (`789f790`, "Solve the skeleton in unit extent, denormalising on
output"), six days AFTER the fork — so the port's divergence entry D1 describes a gap the
reference has since closed, and the handoff must say whether the two normalisations agree
(power-of-two scale, `e057d2d`).

**F46 — The C++ handoff draft is delivered at
[cpp-port-handoff.md](./cpp-port-handoff.md) (803 lines, status draft), and its sharpest claims
survive lead verification.** Delegate verdicts, each provenance-checked by the lead on the
current tree: (1) the port's droste-only ruling is its own journal decision 99 in
`procedural-settlement-journal-06.md` (lines 111–145, 2026-08-16), struck the same day to "the
recursion unit is the PARCEL" — a correction that still omits the merge pass (design decisions
15–17) and access provenance (11–12), which is exactly the design doc's "Downstream" correction;
the word "droste" is ours, not theirs. (2) D1: the reference caught up on normalisation six days
after the fork but the SCALE RULES DIFFER — upstream `2**round(log2(side))` with exact
reciprocals, the port `1/side`; byte-identity withdrawn per F9. (3) D2: `findOrAddNode` throws on
a non-finite position (`solver-context.ts:150–152`) and `solveSkeleton` validates input first
(`algorithm-termination-cases.ts:830`); the port's `FindOrAddNode` still lacks the guard. (4) D3,
D4, D5 stand as port choices; three of the throw sites the port asserts on are now solved
upstream. (5) D6 stands — `offset-projection.ts:258–260` still uses `Math.hypot`. (6) **The port
will assert on `GOLF_CART`**: its `PartitionSpan` is the pre-`b7d5b63` inverted form with the
`Partition sorting failure` checkf (verified in `SkeletonAlgorithmComplexCases.cpp:81,368,381`),
and `GOLF_CART` is now in the clean roster. Unreconciled and carried in the draft's §9: the
fixture index exports 67 constants against a corpus of 59, eight unenrolled where decision 73
accounts for seven. No targeted test was run by the delegate; every number is read from source
or the journals, and the 5249/5249 figure is this session's bootstrap re-run.
