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
- **After package 3 (lead re-run on the merged tree, 2026-09-10):** dashboard **312/312 (22
  suites)** against a rebuilt core; core figure recorded in F52's follow-up line below.
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
- **Never `git checkout --` a file that a delegate may have uncommitted work in.** Undo a
  conviction mutation by the inverse edit, or run convictions only on a committed tree. F51 is
  the cost of ignoring this.
- The dashboard's jest resolves `@proc-geo/core` from `dist`, not `src` (no `moduleNameMapper`
  there): dashboard tests see a core change only after `--filter @proc-geo/core build`.
- The C++ port lives in the `resort_game/claude_work` worktree at
  `Source/PistePerfect/{Private,Public}/Geometry/Skeleton` (16 `.cpp`, 18 `.h`). Its vendored
  TypeScript reference is at `Notes/technical-reference/proc-geo-ts/` with a README stating the
  provenance; its governing document is `Notes/buildables/procedural-settlement-roadmap.md`,
  whose §3b is the divergence register (D1–D6). Read-only from this repository.

## 4. Next work — SESSION CLOSE HANDOFF, 2026-09-10

**State at close (2026-09-11), lead-verified on the merged tree:** tip = the docs commit after
`7af0695`, branch un-pushed, nothing has left this machine. Core **5512/5512 (86 suites)**,
dashboard **331/331 (24 suites)**, corpus 59 (53 clean + 6 defect) plus nine weighted
fixtures and one recorded ring (`OFF_EDGE_JITTER_L_SEED_55433_R021`) outside the rosters.
Digest: 59 pins, 45 native to `0c9c9cd` and 14 re-pinned with attribution (weights), none
moved by the coaxiality package. Delivered this session: weighted offsets end to end with a
demo UI (`0c9c9cd`, `3dd467c`, `b1bb095`, `8fa1e06`); the C++ handoff, active; the
canonicalisation contract re-founded (decisions 131–133) with F38a retired by measurement
(F55); the coaxiality lane (`7af0695`, decisions 136–138, F57–F58) — the dashboard now has NO
failing defect specimen at the explorer floor. The next session opens
`recursive-subdivision-arc-journal-5.md`, continuing decisions at **139** and findings at
**F59**; read THIS section, §2, decisions 131–138, and F55–F58 — do not read this journal end
to end.

**Next work, in the runtime's priority order:**

1. **Send the handoff** (unchanged; push/PR is the user's call). Its angular section should
   gain the coaxiality change before sending — one paragraph from F58.
2. **The angular unification package** on
   [angular-predicate-basis-decisions.md](./angular-predicate-basis-decisions.md): A1–A8,
   A11–A14, A16–A18, A20–A22 with O2–O5 ruled at ratification; it also owns (decision 138) the
   identical-source exit re-measured with the causality oracles, and the triangle/n-gon
   "live edges, no event" handlers considered for A19's completion.
3. **A dashboard defect specimen constructed on purpose** (decision 138(c)) — the explorer's
   failed-cell tour has no specimen; decision 108's comment anticipated this.
4. **The canonicalisation rebuild** under decisions 132/133 (criterion in the region frame,
   licence at the root; monotonicity sweep as the conviction) and the drift bound restated
   as the licence — no live failure drives it; the near-flat rectangle and seed 15838 are its
   acceptance fixtures.
5. Weighted-offsets residue and standing small items as listed in the previous close.

**The session's four commits and what each is:** `f3bc733` (the documents), `0c9c9cd` (the
digest gate), `3dd467c` (solver core — defective, F51), `b1bb095` (projection, downstream, and
the F51 restoration). The kernel function is present and proven from `b1bb095` onward; a
bisect that lands on `3dd467c` will see every solve throw.

**Remaining work, in the runtime's priority order (decision 111's lens):**

1. **Send the handoff.** It is send-ready. Push/PR is the user's call; the port team's first
   actions are named in its §1 (GOLF_CART will assert on their partition; their normalisation
   scale rule differs; their fixture sidecar is stale) and §8 (the weighted design).
2. **Weighted-offsets residue, all small and all open (decisions 126, 128, 129; F53):** the
   unequal-wall corridor fixture that reaches `co-linear-from-1` (the only thing that can reopen
   W33); the ratio constant's discriminating fixture (two arrivals `~R·1e-8` apart on a fast
   edge); W39(i), I3's weighted restatement in the invariants test; ~~a weights UI in the demo~~
   (landed, F54); `findOffsetViaIncenter` renamed for its linear-form body; the demo's two
   pre-existing lint findings (F54);
   spec residue (`arrivalsAreSimultaneous` → `areSimultaneousArrivals`; W52(i) 4 ulps → 3; the
   digest header's W33 sentence). W46's second landing (sub-region weights) waits on item 3.
3. **The root-floor reconciliation package** — still the one STRUCTURAL open item, carried
   unchanged from session 3 §4 item 1 with its four exhibits and pre-ruled acceptance criteria.
   It gates deep recursion, and therefore the handoff's "deep recursion waits" boundary.
4. **Standing small items** from session 3 §4 items 3–4 (decision 92's presentation
   contraction; decision 107(b)'s fixture; `graph-merge.ts:110`; the two F42 bars).

**Process learnings this session, for the operational manual:** F51's revert accident (the §3
rule); the scratchpad variable is unset; long heredocs fail through the Bash tool; the
dashboard tests read core from `dist`; the account's session limit can cut a delegate off
mid-edit, and every delegate this session had landed its edits before it died — verify with
`git status` and a grep for the expected anchors before re-dispatching.

## 5. Open items

Carried from session 3 §4 items 1, 3 and 4 unchanged: the root-floor reconciliation package
(structural, four exhibits), decision 92's presentation contraction, decision 107(b)'s fixture,
`graph-merge.ts:110`'s caller-space epsilon, the two unmeasured bars from F42, push/PR, and the
anchor-edit caution (re-append the heading in `new_string` when inserting before it). Added
this session: the unequal-wall corridor fixture that reaches `co-linear-from-1` (decision 126);
the ratio constant's discriminating fixture (decision 128); W39(i), I3's weighted restatement;
a weights UI in the demo (decision 129); W46's second landing (sub-region weights) behind the
root-floor reconciliation.

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

**130 — (user, 2026-09-10, after the close) Weights are exposed in the demo UI; session 4
reopens for this one package and session 5 continues at 131 / F54.** Ruled shape: weights live
in the polygon store as an array parallel to the vertices, default all ones; inserting a vertex
splits an edge and both halves inherit its weight; deleting a vertex merges two edges and the
surviving edge keeps the weight of the edge that ran INTO the deleted vertex (a user edit, not
canonicalisation, so decision 120 does not apply — stated at the site); loading a fixture or
generating a random polygon resets weights to ones. A per-edge editor lists every edge `i → i+1`
with a numeric weight and a reset-to-ones action. The two door refusals (ratio, visible corner)
are caught at the solve boundary and shown as a visible error with the solver's message, never
an uncaught throw; the primary-bisector overlay shows the weighted bisectors through the
threading package 3 landed. Visual verification per the session-3 manual: build, check port
3000, Playwright screenshot of a square with one edge at weight 2.

**131 — (user, 2026-09-11) CANONICALISATION MUST MAKE NO POLYGON LESS SOLVABLE; any
canonicalisation that introduces newly pathological geometry is defective per se, and F38a is
therefore a DEFECT to diagnose, not a tension to reconcile.** The user's words, near-verbatim,
disagreeing with the lead's framing that canonicalisation is "a deliberate change to the input
whose safety was assumed, not proven": "This is just badly written canonicalization. As I would
understand the purpose of the process, it should make no polygon less solvable. Any
canonicalization algorithm that introduces newly pathological geometry is defective, per se."
Lead's concession, recorded: the framing of the root-floor package as three defensible rules
in conflict was wrong for its F38a exhibit — solvability monotonicity is part of
canonicalisation's CONTRACT, and a solvable region that fails after a vertex removal is a
contract violation with a location, in one of exactly two places: (a) the canonicaliser
produced newly pathological geometry (the chord replacing the removed vertex crosses the
boundary, creates a sub-bar turn or a sub-floor edge, or collapses area — none of which the
current stage checks for), or (b) the canonicaliser produced a legitimately simpler polygon and
the SOLVER fails on it, in which case canonicalisation exposed a solver defect rather than
causing one. Either is a bug; neither is a tolerance choice. Consequences: the root-floor
package splits — F38a and the r0.3.1 region become a diagnosis task with the two-place question
above and a conviction test that canonicalisation never reduces solvability over the corpus at
every floor on the ladder; the drift bound (decisions 76/79's exhibits) remains the genuine
ruling item, to be stated in the floor's terms rather than at 1e-14. Session 5 continues at
**132** / F55.

**132 — (user, 2026-09-11) Canonicalisation's contract is (1) sub-perceptual simplification
CONSTRAINED BY (2) numerical predicate amplification; (2) is the goal and (1) is the licence,
and the current implementation was built on (1) when it should have been built on (2).** The
user's words, near-verbatim: "In my mental model now, the contract of canonicalization is one
of 1) sub-perceptual simplification, 2) constrained by numerical predicate amplification. #2
is the actual goal: we want to make the input more solvable. #1 is the justification to the
client: 'we didn't delete anything you can't trivially restore to the resulting skeleton'. My
intuition now is that #1 has been the basis of implementation, when it should have been #2."
Lead's reading, recorded as the consequence set: (a) the removal CRITERION is predicate
margin — a vertex or edge is a candidate because it sits inside one of the solver's resolution
bands (a turn whose sine is under the angular bar; an edge shorter than the floor; a vertex
within the floor of its chord), and the removal is made because it moves the configuration
clearly to one side of that band; the perceptual floor bounds what may be removed (cumulative
deviation of the original boundary from the canonical one ≤ floor) but never motivates a
removal on its own. (b) Every removal carries a postcondition in the same currency: it creates
no new sub-bar turn, no new sub-floor edge, no C1 topology change (crossing, pinch, ring
split, count/area degeneracy); a removal that would is declined and the vertex kept, since
keeping invisible geometry is free. (c) The pass-down question dissolves: the CRITERION is
evaluated in the region's own unit frame (that is where the region's predicates run), the
LICENCE is the root's floor carried down (that is the client's frame). The current pass-down
carried the licence as if it were the criterion — which is exactly F38a: a vertex removed with
licence but without purpose (no predicate hazard in the region's frame), whose removal then
manufactured one. (d) Falsifiable prediction of this model, to be measured before any code:
the vertex the root floor removed from r0.3.1 (55433, d0.5/m4) was NOT inside any predicate
band in the region's frame — its turn sine clears the angular bar and its edges clear the floor
— and the canonical ring contains a configuration that IS inside a band and that the raw ring
did not. If the measurement shows otherwise the model is wrong in a way we need to know.
(e) The monotonicity sweep (raw solves ⇒ canonical solves, over the corpus at every rung of the
floor ladder) is the standing conviction of the rebuilt stage.

**133 — (user, 2026-09-11) The combination rule: the LICENCE is the perceptual floor always
measured at the root (the client's frame); the PURPOSE is always measured in the region's
frame (the solver only cares about its normalised input); therefore at deeper recursion
canonicalisation is PERMITTED to be more aggressive but never REQUIRED to be — the client's
frame grows relatively looser with each level, and the solver never tries to simplify what it
was already able to solve.** The user's words, near-verbatim: "The licence: perceptual floor
always measured at the root, because that is the client's frame. The purpose: always measured
in the region frame, because the solver only cares about the normalized inputs. The
combination: at deeper recursion, canonicalization is permitted to be more aggressive, but
never required to be. The client's frame becomes in relative terms looser with each recursion,
but the solver never tries to simplify what it was already able to solve." This supersedes the
pass-down as designed (a root floor carried down as the removal criterion) and is the ruling
the root-floor package waited on for its F38a exhibit. Decisions 76 and 79's drift-bound
exhibits remain: the bound is restated as the licence (cumulative deviation of the original
boundary from the canonical one, measured in the root frame, ≤ the root floor), not as 1e-14 of
area — the exact form is the remaining ruling. Next: the decision-132(d) measurement on
r0.3.1, then a decision spec for the rebuilt stage.

**134 — (user, 2026-09-11) The angular predicates get ONE first-principles derivation
replacing the two laundered bars, under two contracts: the conceptual — "everything not
identical is priceable, or everything unpriceable is closed as parallel, and nothing is
neither" — and the empirical — no currently-solving fixture fails under the new predicate.**
The user's words, near-verbatim: "angular predicates need a unified, first-principle
derivation, to replace the naive 'laundering'." Background, F56: `DIRECTION_SINE_BAR` (1e-8) is
the coordinate epsilon applied to a sine as if a sine were a coordinate; `PARALLEL_GATE_SINE_BAR`
(1.41e-4) is the same epsilon carried through a cosine; the two are four decades apart and
r0.2.1's corridor walls (sine 6.65e-6) sit between them — "not the same direction" for identity
and closure, "too parallel to price" for collision. F41's refusal to converge the two NUMBERS
stands as measured; this ruling converges the QUESTION instead. Lead's rulings on the empirical
contract: (a) "currently-solving" means every fixture, census cell and recursion cell that
solves at the tip, at every floor rung and every pinned scale/translation cell — solvability is
the bar, not bit-identity; (b) the digest MAY move, and every moved pin is attributed to the
predicate change and re-pinned by a commit that says so (decision 116's rule); a clean-roster
digest that does not move is the stronger result and is reported either way; (c) the pinned
defect signatures may only improve, and an improvement is an attributed cure. Sequence: a
read-only trace of r0.2.1 confirming the between-the-bars mechanism, then a decision spec for
the derivation (the angular resolution stated in its own category — the smallest turn the
client can see over the region's extent, and the smallest sine at which the ray-intersection
division is well-conditioned in double — and the ordering of identity and priceability so no
sine falls between), then implementation against the two contracts. Session 5 continues at
**135** / F57.

**135 — The r0.2.1 defect is the coaxiality bar's CATEGORY, and it is fixed first as its own
small package; the angular unification of decision 134 follows as the principled package.**
(a) "Do these two anti-parallel rays share a line?" is a perceptual-identity question, and
F39/decision 105's doctrine already rules its bar: the floor is the sole perceptual-identity
bar, epsilon the sole arithmetic-equality bar. `sourceLiesAhead`'s lateral test therefore takes
the perceptual floor (in unit space, the context's `perceptualFloor`), not
`FLOATING_POINT_EPSILON` — the spec's OPEN O1 is RULED as "a distance at the floor". Its
conviction: r0.2.1's raw ring solves complete; the lateral-offset sweep's orphan band (1e-8,
1e-6] closes; the predicate-level test pins head-on for every δ ≤ floor. Its empirical
contract is decision 134's: every currently-solving fixture, census and recursion cell stays
solving at every rung and pinned cell; digest movement attributed; defect signatures may
only improve. (b) The angular unification proceeds on the draft spec after this lands, with
the derived resolution and the three-cell partition; O2–O5 are ruled at that spec's
ratification, and the spec is trimmed to its target before it is read for ratification.
(c) The F55 delegate's "sine 6.65e-6" was the lead's misreading (F56 amended in place); the
mechanism claim in F56 was inferred, labelled as inferred, and is now refuted by trace — the
labelling worked as intended. Session 5 continues at **136** / F58.

**136 — (with the user, 2026-09-11) O1 RULED: coaxiality is a LANE WIDTH equal to the
perceptual floor, evaluated SYMMETRICALLY, and an anti-parallel pair that points together
but lies outside the lane is an upstream inconsistency that keeps its throw.** The user's
four-scenario decomposition for anti-parallel rays r1 (from s1) and r2 (from s2): (A) r1
points away from s2 — decided correctly today by the exact forward sign; (B) r1 points at s2
but the lateral offset exceeds the lane width — they pass; (C) lateral within the lane — they
collide head-on; (D) r1 and r2 disagree about B/C. Rulings: the lane width is the floor
(`coaxialityFloor = δ` in unit space), so the band (1e-8, δ] moves from B to C — this is
r0.2.1's cure; B above the floor with predicate-parallel walls means the two mid-line sources
were placed off one line by more than the client can see, an upstream inconsistency, and the
throw at the end of the collision branch stays as its detector (spec A19). (D) IS possible,
today and after a naive O1: the two laterals differ by up to `separation × sine(b1, b2)`, and
the pair's sine is only bounded by the angular resolution (today 1.41e-4 against a 1e-8 bar;
after the fix 2.5e-5 against 1e-6, still crossable at separations above ~0.04); the ray
order is chosen by the winding sign of a near-zero cross product, so the verdict could flip on
the bases' last bits. Therefore the coaxiality test is SYMMETRIC by definition: both sources
within the lane of the other's line (conjunction), or one lateral measured against the mean
direction — the spec states the form and the identical-source exit (A15 row) takes the floor
in the same currency. Unit weights untouched: the test reads positions and bases, never
weights. *AMENDED the same day (user's challenge): the "throw for B above the floor" clause
is STRUCK.* The throw at the end of the collision branch is not a per-pair verdict — it fires
only when a sub-polygon with live interior edges produces NO event and no closure applies. A
pair that passes while other vertices still produce events is unproblematic and needs no
ruling. In the no-event state the model supplies the answer: a bounded wavefront with live
vertices MUST have a next event (a theorem of the exact geometry), so "live vertices, no
event" can only be a predicate rejecting, over-cautiously, an event that exists — logically r1
and r2 DO collide and the arithmetic could not see it within the lane. Ruled: on a no-event
refusal the solver COMPLETES rather than throws — among anti-parallel pointing-together pairs
it prices the one with the smallest lateral offset as head-on, recording the completion in
the diagnostics so it is signalled, never silent. This is F44's "narrow only on refusal"
pattern (F27's restraint gate) applied to coaxiality: the corpus pays nothing where the
normal lane succeeds. The throw remains ONLY for live vertices with no candidate pair at all.

**137 — (user, 2026-09-11) GO for the coaxiality package, as "something incrementally more
rigorous than what we have now".** Scope is exactly spec A9, A10 (symmetric lane at the
floor), the identical-source row of A15, and A19's completion-on-refusal; the angular
resolution unification (A1–A8, A11–A14, A16–A18, A20–A22) is the NEXT package and is not
touched. Bars: r0.2.1's raw ring solves complete through the normal lane; the lateral-offset
sweep pins head-on for every δ ≤ floor; the completion step fires NOWHERE on the corpus (a
firing is a second specimen, reported); decision 134's empirical contract; the recursion
census pin for seed 55433 moves as an attributed cure. Dispatched to Opus.

**138 — Rulings on the coaxiality package's four escalations.** (a) **The identical-source
exit STAYS at the coordinate epsilon.** The delegate measured the A15 row (distance ≤ floor)
and reverted it: twenty pinned assertions across four suites move, every one the same way —
a loudly-failing solve starts reporting `complete: true` with EMPTY diagnostics while the
causality oracles still count direction violations (Circle 32 jittered: 2 direction at
dot −0.98; Circle 48 at 1e10: 4 direction; Rosette5-40 at 1e11: 13 clearance). Nothing stops
solving, so the letter of the empirical contract holds, but a defect that stops announcing
itself has got worse (decisions 72 and 134(c)). Reopened under the angular package with the
three causality oracles as its instrument, not solvability alone. (b) **The along-edge-jitter
plateau cell (k=4, seed 47514, 1e-3, boundary stage off) is pinned as moved, 2 → 1, and
flagged**: it now completes with two direction violations where it was `unresolved-edges`; the
configuration already carried the same violation at k=7 before this change, so it is not a
clean baseline, and no corpus fixture moves — accepted with the flag at the site. (c) **The
dashboard's last defect specimen is EXTINCT** (r0.1.3 of the e38-e30 fixture, decision
108(a)'s exactly-anti-parallel pair, now solves at the explorer floor; a re-sweep of 59 × 6
merge groups × 6 depths at 1e-5 finds no failing region anywhere). The specimen-dependent
tests now assert the extinction (they fire the day a failing region returns) plus a cure pin;
the "successor fixture constructed on purpose" that decision 108's comment anticipated is a
design act and an open item. (d) The triangle and n-gon handlers present the same "live
edges, no event" state as the pair handler but are not the throw A19 names; they are
considered for the same completion in the angular package, not here.

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

**128 — `MAX_WEIGHT_RATIO` stays at 100, and the ladder is not evidence either way: the
constant's discriminating fixture is OPEN.** F52's ladder moved nothing at R = 300 on two
fixtures that have no near-coincident arrivals, and W48's derivation is about exactly such
arrivals (two events `~R·1e-8` apart in distance fusing into one time moment on the fast
edge). Absence of movement on a fixture that cannot exhibit the hazard is not a measurement of
the hazard. The constant keeps its derived value; the fixture that would find the first mover
— two arrivals on a fast edge separated by a distance of order `R · 1e-8` — is an open item,
and the user may move the constant on the runtime's stated need without waiting for it.

**129 — The package-3 delegate's eleven interpretations are ADOPTED; two items it could not
close are open: W39(i) (I3's weighted restatement in the invariants test) and a weights UI in
the demo.** Adopted in particular: `Strip.supportingEdgeWeights` as a recorded field rather than
a lookup (a collapsed frontage edge shifts the identity); the two `parcel-slicing.ts` epsilons
now compared against times are at least as strict as before because weights normalise to
minimum one; `marchDirection`'s parallel-normals fallback scales by the first face's weight
and says so at the site. The dashboard's hook threading is held by the type checker and the
build only (no React renderer in its test dependencies) — stated in the test header, accepted.

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

**F51 — LEAD ERROR: `3dd467c` shipped without `makeWeightedBisectedBasis`, because the lead's
`git checkout --` revert of a mutation in `core-functions.ts` discarded the package-2 delegate's
UNCOMMITTED changes to that same file.** Sequence: the delegate finished with the function in
place; the lead ran the full suite (5466/5466 — a true figure on that tree); the lead then
mutated the function's weight order to convict it, ran the weighted tests (14 died — also
true), and reverted with `git checkout -- core-functions.ts`, which restored the file to
`0c9c9cd`, not to the delegate's version; the commit followed. On the committed tip every
solve threw `makeWeightedBisectedBasis is not a function`. The package-3 delegate found it at
bootstrap, restored the function exactly as W12 spells it, and proved the restoration by the
digest: all 59 pins of `3dd467c` pass, which they could not if a single bit of the spelling
differed. F50's "lead-verified 5466/5466" is therefore a figure for the tree BEFORE the
revert, not for the commit; the correct figure lands with package 3. Operational rule added
to §3.

**F52 — Package 3 (projection and downstream) is delivered: offsets are TIMES end to end at
unit-weight bit-identity, and the ratio ladder moved NOTHING at any rung because the
fixtures cannot exercise the mechanism the constant was derived from.** W40: two arithmetic
changes only — the node table divides by the parent's weight and the ray position multiplies
by it — both by exactly one at unit weights; all 59 digest pins unmoved, the 1580
projection/strip/parcel tests unmoved, the recursion census unmoved, and a new test asserts
`computeOffsetRings` is `toEqual`-identical between a bare solve and an explicit all-ones solve.
W41/W42: `Strip` gains `supportingEdgeWeights`, `FaceEdge` gains `weight`, `marchDirection`
solves `v·n = w`. W37 landed with a hand-built conviction (every corpus duplicate ridge is a
mid-line, where equi-time forces equal weights, so the facing clause is only separable on
invented geometry). W15: the overlay takes weights; `useSkeletonAnimation` threads them; no
demo UI passes any yet. The ladder (§4.4 square `[1,1,1,R]` and §4.6 step, R ∈ {10, 30, 100,
300}): complete at every rung, position/time/equi-time errors ≤ 2.3e-16, tiling ≤ 3e-15 —
because both fixtures are free of near-coincident arrivals, and W48's hazard is the absolute
`1e-8` time window becoming an `R·1e-8` distance window between two CLOSE arrivals. Delegate
figures: core 5477/5477 (85 suites), dashboard 312/312 (22 suites), both builds green;
convictions W40 2/3/1, W37 1, W15 1. **Lead re-run on the merged tree: core 5477/5477 (85
suites, 87 s), dashboard 312/312 (22 suites) after a core rebuild — both match the delegate.**

**F53 — The C++ handoff is complete and leaves draft status: §8 is the port-first weighted
design written from the landed code, and its three sharpest claims were lead-checked against
the source.** Checked: the simultaneity predicate is a module-private
`areSimultaneousArrivals` in `algorithm-complex-cases.ts` (the spec's roster name
`arrivalsAreSimultaneous` does not exist — spec residue, §5); the door guards read the
caller's authored weights but compute the turn sine on the unit-extent ring at all three
`weightsAtTheDoor` call sites; the digest does not serialise `exteriorWeights`, so the
unit-weight identity test rightly uses a second, JSON-based digest. §8 now carries a 28-row
site table with the port counterpart and the unit-weight identity claim per row, the digest
build recipe, all nine analytic fixtures with expected values, and the C++-specific cautions
(double not float for cross-multiplied comparisons; exact normalisation by division; operation
order preserved for bit-identity). §0's fork figures re-measured by the delegate: 114 commits,
36 files, +7632/−550 against `e2544d4`. Residue the delegate flagged and the lead accepts as
open: `findOffsetViaIncenter` keeps its old name over a linear-form body; W52(i) says 4 ulps
where W12 measured 3; the digest header's sentence about W33 is loose.

**F54 — The edge-weights UI landed and the picture matches the analytic answer: a square with
its left wall at speed 2 puts the ridge two-thirds of the way across, spanning the middle third
of the height.** Lead-checked on the delegate's Playwright screenshots (a 400-unit square, edge
0 at weight 2; then edge 0 at 500 showing the ratio refusal as an inline alert with the
solver's verbatim message while the weight-2 skeleton stays on the canvas) and by re-running
the dashboard suite: 331/331 (24 suites). Shape: `weights` in the polygon store parallel to
the vertices with decision 130's insert/delete/reset semantics; `EdgeWeightsPanel`; a new
`skeleton-solve-boundary.ts` that runs the weight door BEFORE canonicalisation so both
refusals are caught per keystroke without a solve; `useSkeletonAnimation` exposes `solveError`
and retains the last good context — which now covers EVERY solver failure, not only the two
refusals (previously any failure blanked the canvas; delegate's judgement, adopted). Coverage
boundary, stated in the test headers: the store and both refusal paths are convicted; the
hook's own routing rests on the type checker, the build and the Playwright pass, because the
dashboard has no React renderer. Demo lint carries one pre-existing error and one warning in
untouched files (`dol-system/page.tsx:51`, `AppShellLayout.tsx`) — open, trivial.

**F55 — Decision 132(d)'s prediction FAILED in both halves, and F38a no longer reproduces:
the vertex the root floor removed from r0.3.1 WAS inside the angular band, the canonical ring
gained no in-band configuration the raw ring lacked, and both rings now solve.** Measured at
the tip on seed 55433, d0.5, every merge group 1–6, floors 1e-6 and 1e-5. The removed vertex
(index 6): turn sine 2.81e-5, five-fold inside `PARALLEL_GATE_SINE_BAR` (1.41e-4) and three
decades clear of `DIRECTION_SINE_BAR`; both incident edges ≥ 3e4× the floor; chord deviation
1.69e-6 in region units — below the passed-down floor (2e-6, the root's 1e-6 carried into a
region of half the root's extent) and ABOVE the region's own floor (1e-6). So the
licence/criterion split of decision 133 is real in numbers, but the decision-132 criterion
would have removed this vertex too (it is an angular hazard), and the removal manufactured
nothing: the only sub-gate turn in the canonical ring is present in the raw ring, and the
near-parallel non-adjacent pairs it carries are inherited. Raw and canonical both solve
complete at both floors. **F38a was therefore place (b) of decision 131 — a solver defect
exposed by a legitimately simpler ring — and the causality work of F40/F44 cured it without
anyone noticing the exhibit had gone.** The one live non-degenerate failure on the fixture is
r0.2.1 at m6/d0.5/1e-6, whose RAW ring fails identically (4 unaccepted edges, two anti-parallel
corridor walls at sine 6.65e-6, two interior edges that never acquire a target): angular
class, canonicalisation exonerated — and it is the discriminating fixture decision 107(b) has
wanted since session 3. Consequences: F38a is retired as an exhibit; the root-floor package is
now (i) the drift bound restated as the licence (decisions 76/79's exhibits — still live) and
(ii) the criterion rebuild of decisions 132/133, which is a design correction with no live
failure driving it; r0.2.1 moves to the solver's angular-class backlog. The delegate's scratch
test was created, run and deleted; tree clean apart from this journal.

**F56 — AMENDED BY F57: the mechanism inferred here is REFUTED; the two-bars observation
stands as a principled defect but is not r0.2.1's failure.** ~~The live angular failure sits
BETWEEN the solver's two angular bars~~ — the walls of r0.2.1 are anti-parallel to one ulp
(sine 1.7e-16), and the "6.65e-6" was the corridor direction's y-component, misread by the lead
from the F55 delegate's report. What stands: the two angular bars ARE the coordinate epsilon
laundered into sine space two different ways. Original text follows for the record. Measured:
r0.2.1's corridor walls have sine 6.65e-6; `DIRECTION_SINE_BAR` = 1e-8 (the coordinate epsilon on a sine);
`PARALLEL_GATE_SINE_BAR` = 1.41e-4 (`sqrt(ε(2−ε))`, the same epsilon through `areEqual(|dot|,1)`).
Inferred, not yet traced: the pricing path refuses to intersect the mid-line bisectors because
the gate says parallel, and the closure path refuses to close them because identity says not —
two interior edges of unbounded length that never acquire a target. The bisector code's own
comment (algorithm-helpers.ts, `ensureBisectionIsInterior`) names this hole and records that
the corpus never fell into it at 2026-08-29; r0.2.1 (seed 55433, m6/d0.5/1e-6) has. Decision
134 is the consequence.

**F57 — r0.2.1 TRACED: the refusal is a third, unnamed bar — the head-on coaxiality test at
the coordinate epsilon — and the hole is POSITIONAL, between 1e-8 and the floor, not angular.**
The two orphan interior edges are the corridor's two mid-lines (one wall pair in swapped parent
roles), anti-parallel to one ulp. Site verdicts in unit space: the parallel gate correctly says
parallel and opens the anti-parallel arm; `sourceLiesAhead` (`intersection-edges.ts:37–41`)
finds the two rays' sources laterally offset by 2.754e-8 against a bar of
`FLOATING_POINT_EPSILON · max(1, separation)` = 1e-8 — ratio 2.75, REFUSED — so `intersectRays`
returns `'parallel'` rather than `'head-on'` and no collision is priced; `solveDegenerateClosure`
finds no anchor (point-on-ray sine 1.05e-7 vs 1e-8); `solveParallelClosure`'s parent gate PASSES
but its bisector test is an exact sign test that excludes anti-parallel pairs at any bar; then
the throw. Predicate-level sweep of the lateral offset δ on r0.2.1's own rays: head-on for δ ≤
1e-8, orphan for every δ > 1e-8 with no upper bound — practically the band (1e-8, 1e-6], a
hundred-fold, entirely sub-perceptual. The lateral offset is produced UPSTREAM (a near-
simultaneous event placing the two mid-line sources 2.75e-8 apart); no exactly-built corridor
ring reproduces it (20 cells over three synthetic families all solve), so the ring-level
fixture is r0.2.1 itself and the predicate-level sweep is the conviction. Corroboration: the
floor ladder on the raw ring fails at 1e-6 only; scale 1/1e3/1e6 fail and 10 solves
(unexplained — flagged). Also delivered: the first-principles angular derivation —
perceptual bound `√2·δ` (1.41e-6 at δ = 1e-6), conditioning bound `sqrt(4√2·u/δ)` (2.51e-5
at δ = 1e-6, `u` the double's unit roundoff, the 4u cross-product error an estimate ±22%),
conditioning governs below the crossover δ ≈ 6.8e-6, so one resolution ≈ 2.5e-5 sits between
today's two bars and 5.6× inside the gate — and the draft spec at
[angular-predicate-basis-decisions.md](./angular-predicate-basis-decisions.md) (601 lines,
A1–A54, five OPENs), recommending identity bar = priceability bar with a three-cell partition
(priced above the resolution; same-orientation below → existing closure; opposed-orientation
below → coaxial-and-approaching priced head-on, else closed at the leading source by a new
anti-parallel arm).

**F58 — The coaxiality package landed: the lane is the perceptual floor, symmetric as the
conjunction of both laterals, and r0.2.1 solves through the normal lane with the completion
step firing NOWHERE on the corpus; the full-graph digest did not move on a single pin.**
`intersectRays` takes `coaxialityFloor` as a required parameter, threaded from the context at
all eleven production sites; `symmetricLateralOffset` both tests and ranks; `coaxialityFloor(δ)
= δ` is a named identity so the currency is stated at every site. A19's completion
(`findCoaxialCompletion`, before the pair handler's throw) carries a new informational
diagnostic `coaxial-completion` on a context diagnostics channel drained by `solveSkeleton`;
it fires zero times over FULL_CORPUS at 1e-6 and 1e-5. The firing case was constructed by
mutation (lane at 1e-8 with the completion on: r0.2.1 completes `[28, 31]` at 2.754e-8 —
F57's exact pair and offset); with both off it fails as the tip did. Convictions: lane to
1e-8 kills 9 tests; one-sided lane kills the straddling-pair conviction (laterals 0 and 1e-5
across a 1e-6 lane); the delegate notes argument-order swapping is nearly vacuous because
the winding sort is swap-invariant — scenario D turns on the bases' last bits, which is what
the straddling pair pins. The whole seed-55433 tree at m6/d0.5 has zero failed nodes (was
one); the ring is recorded as `OFF_EDGE_JITTER_L_SEED_55433_R021`, exported, enrolled in no
roster. Three pins moved, all attributed at the site (two specimen re-pointings to seed
7919's r0.4.1; the along-edge plateau of decision 138(b)). Delegate figures: core 5512/5512
(86 suites), dashboard 331/331, both builds green. **Lead re-run on the merged tree: core
5512/5512 (86 suites); lead conviction: lane forced to 1e-8 with the completion left ON kills
4 of 35 coaxial-lane tests (the sweep cells above 1e-8 and the zero-firing pin — r0.2.1 then
solves through the completion, which is the mechanism working as designed); reverted by
inverse edit, never by checkout.**

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
