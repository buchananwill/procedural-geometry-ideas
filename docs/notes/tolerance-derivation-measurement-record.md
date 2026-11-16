---
title: "Tolerance derivation: measurement record"
type: technical-reference
area: straight-skeleton
status: active
date: 2026-11-16
---

# Tolerance derivation: measurement record

The measurement record of the [tolerance derivation spec](./tolerance-derivation-decisions.md), moved out of that
spec by the entropy pass (P8b, BSA.D365) to keep the spec within the schema's review length. The decisions it
measures are the spec's; this note holds only the record.

## Measurement record

The measurements behind rules the code states, moved here from the code's comments by the entropy pass (P8a, BSA.D356) so that each site states its rule and its reason and points here. Each subsection is named exactly as its site's pointer names it (`Measured: tolerance-derivation-measurement-record.md, "Measurement record", "<subsection>"`). The text is the record as the comment held it, with its dates, dispatches and the state of the tree it was measured on; it is history, and the code's comment is the current rule.

### degenerateAreaBar: O3's settling measurement

*Moved from constants.ts, `degenerateAreaBar`.*

Measured before the bar moved from `DEGENERATE_AREA_EPSILON = 1e-6` (C8 dispatches 1 and 2, 2026-09-24). Of the recursion census's 22 decision-96 declines (all at full depth, on `Off-edge Jitter Plus (seed 7919)` and `Off-edge Jitter Reflex L (seed 55433, k=4)`, root floor 2.56e-4 in caller units), the form `floor · perimeter / 2` keeps 16 and releases 6 (areas 4.6e-7..8.5e-7 against bars 4.0e-7..5.5e-7); `δ²` would have kept 1. Decision 159(b) ruled that the six be SOLVED before the bar moved: all six solve complete, with zero causality violations on every oracle, I2 and I5 clean, and their strips tiling the canonical region to ≤ 1.25e-16. The decomposition's sub-polygon verdicts over the self-intersecting fixtures agree under the old and the new bar.

The constant it replaced, `DEGENERATE_AREA_EPSILON = 1e-6`, was an absolute area with no derivation, read in two spaces (I3): a caller-space area in the recursion, and a unit-space area in the decomposition, where it was a square 1e-3 on a side — 1000δ.

### The window and the box: register C12's measurement

*Moved from constants.ts, the section "THE WINDOW AND THE BOX".*

F74 traced what the pair does: the box absorbs genuinely later or earlier events 1e-10 to 4e-7 away in time (41 of C11's 44 joins), and if the window moves alone to its per-pair bar, the held box re-joins a later layer's merge onto an orphan edge's own source and leaves a one-edge ring (which the step dropped silently at the time, and now reports as a `step-failure`). Decision 162 rules a perceptual window wrong in principle, and decision 167 chose to move both, together, to the arithmetic bar: the window to each pair's own, the moment bar widened by the two arrivals' complete first-order error budgets, capped at `simultaneityWindow`; the box to exact coordinate equality at S1, S2, S4 and S5.

**Register C12 measured that move and it stopped; both were held by inverse edit (2026-09-25).** The complete model was landed on every `Arrival` and every node (`Arrival.uncertainty`, `positionUncertainties`) and convicted against exact arithmetic, and left unspent, as the division-only budget was after C8 dispatch 2. Measured over 642 cells (`FULL_CORPUS` at 1e-6 and 1e-5, Circle 48 and Rosette5 40 at the 46 fine translations, the off-edge 1e-3 and along-edge 1.0 jitter grids, the jittered Circle 32 ladder, the 62 regular circles of the vertex-count sweep):

- **Decision 167's conviction held.** `Near Regular Circle 48` (native), `Near Regular Peanut 32` and `Slightly Deformed Peanut 2` did not move; every regular circle solved, digest unmoved.
- **The window stopped.** The complete model is honest and it is wide where a bisector is ill-conditioned: a unit-weight bisector's direction error is `5u + 4u·cot(φ/2)` (the parents `φ` apart), so a near-straight jittered vertex carries budgets of up to 2.9e13 moment bars on the corpus (median 1.5, 99th percentile 2.1e4) and reaches the δ cap — the perceptual window again, locally. An anchored per-pair layer then resolves a wide-budget arrival with the earliest while leaving out a narrow-budget arrival of the same edges that is unorderable against it: `Off-edge Jitter Plus`, k = 9, seed 23757, strips 1.1% short with every oracle clean (F73's class); k = 7, seed 31676, an offset and a direction violation; four cells off machine-precision tiling (1.7e-13 to 3.6e-10). Filtering the whole list rather than cutting at the first refusal also gave `Off-edge Jitter Plus (seed 7919)` a direction violation and stopped two off-edge cells solving.
- **The box, exact, is mostly what decision 167 said** — sub-floor fans become separate nodes, trees and tilings improve on the translated circles — but alone it gives `Near Regular Circle 48` at 2e11 an offset and a direction violation (while curing that cell's 57% tiling miss), and at S5 the offset projection's two ends of a zero-length segment are computed independently and differ by ulps, so an exact S5 keeps a repeated vertex (`offset-event-boundary-regression.test.ts`, two tests).

The package's own report carries every table; the lead rules on the next mechanism.

### HELD_SIMULTANEITY_WINDOW: the three measured moves

*Moved from constants.ts, `HELD_SIMULTANEITY_WINDOW`.*

Held at `1e-8` as a measured STOP three times (T14, T16, T37; register C12).

- **Dispatch 1 (the flat δ window, F70):** S22 alone moved the four predicted defect digests and stopped fixtures solving, grew a direction violation and a diagnostic on `(seed 55433)`, moved the recursion census and `Offset Cross Junction`'s ladder; S28 alone stopped one plus cell solving — STOPs 1, 2, 3, 6.
- **Dispatch 2 (T12 as amended by journal decision 160, the per-pair window `pairSimultaneityWindow` in collision-helpers.ts, capped at δ, division-only budget):** with all seven sites at it, 211 of 580 sweep cells move and 45 core tests fail — `Near Regular Circle 48` and the vertex-count sweep's regular circles stop solving, and two clean digests move (`Near Regular Peanut 32`, `Slightly Deformed Peanut 2`).
- **Register C12 (the per-pair window with the complete first-order model, beside an exact box):** the three fixtures dispatch 2 split are gathered and unmoved, and the move stops elsewhere — see "The window and the box: register C12's measurement".

### ARITHMETIC_SAME_POINT_BOX: O1's histogram and the exact box

*Moved from constants.ts, `ARITHMETIC_SAME_POINT_BOX`.*

O1's settling histogram (dispatch 1, 2026-09-24) found joins above 64 ulps — 43 of them at 5e5 to 5.2e7 ulps of the unit extent (7e-10 to 1.16e-8), on Circle 48 and Rosette5 40 at fine translations, one off-edge jitter cell and eight cells of the jittered Circle 32 ladder — that do not correlate with the pricing's conditioning. F74 traced them: 41 of 44 are this box absorbing a genuinely later or earlier event (1e-10 to 4e-7 away in time), which decision 141 would admit as a distinct node.

Register C12 measured the box at the arithmetic bar beside the per-pair window and the move stopped (see "The window and the box: register C12's measurement"). At S2, coordinate equality alone (without "or one instigator") moved seven clean digests by at most 1.93 ulps.

### POINT_ON_RAY_SINE_BAR (held)

*Moved from constants.ts, `POINT_ON_RAY_SINE_BAR`.*

T32 moves the snap's point-on-ray sine (S10) to the coaxial form, as the closure's (S11) moved. Measured in dispatch 2, and again in dispatch 3 on a tree with S6, S11 and S20 landed: at the lane the snap gives `Off-edge Jitter Plus`, k = 3, seed 47514 (the off-edge 1e-3 grid) an offset violation of its own, diagnosed as a `causality-violation` on a cell that had none — T37 STOP 3 — and moves 39 of the 580 sweep cells by digest (15 of Circle 48's fine translations, 5e9..1e11; 18 off-edge plus cells and one L cell; 5 cells of the jittered Circle 32 ladder, one of which, 1 × 1e-8 seed 2, loses a node). So it stays at `1e-8`. `tolerance-derivation.test.ts` asserts the held state on that cell. The site's own record is "pointLiesOnRay: the snap's measurements".

### ZERO_RATE_SINE_BAR (held)

*Moved from constants.ts, `ZERO_RATE_SINE_BAR`.*

`addBisectionEdge`'s zero-rate sine (census S19) is held at `1e-8`. Three re-derivations were measured and refused: T17's ρ (dispatch 2, decision 161(b)), `k·u` and the forward bound 8u (dispatch 3, decision 164). The measurements are under "addBisectionEdge: the zero-rate bar's re-derivations".

### pointLiesOnRay: the snap's measurements

*Moved from algorithm-termination-cases.ts, `pointLiesOnRay` doc comment.*

`pointLiesOnRay` was the predicate of BOTH point-on-ray sites until C8 dispatch 3, when the closure's (S11) moved to
the coaxial form (`anchorLiesOnRay`); the snap's did not (see `POINT_ON_RAY_SINE_BAR`).

It stayed at the scratch epsilon, as a sine — a measured STOP, not an omission (spec A15's point-on-ray row, A25
STOP 4; journal decision 146). The spec moves it into the floor's category: forward by the exact sign and LATERAL
within the coaxiality floor, the form `sourceLiesAhead` uses, so a node the coincidence merge displaced by a sub-floor
distance is recognised on the ray it sits on. That form was written and measured on 2026-09-23, each site alone and
all other sites at their old bars, over `FULL_CORPUS`, Circle 48 and Rosette5 40 at the forty-six fine translations
1e8..1e13, and `NEAR_REGULAR_CIRCLE_32` jittered at 1..100 epsilons over eight seeds:

- the corpus is untouched at both sites;
- at the SNAP (`tryAttachEdgeToNode`) 16 cells grow a causality count — Circle 48 at 5e9..8e9 gains an offset and a
  clearance violation, at 2e10..1e11 an offset violation — and the jittered circle at 3 epsilons, seed 6, goes from a
  signalled failure to `complete: true` with empty diagnostics while carrying 3 offset and 1 direction violations;
- at the CLOSURE (`solveDegenerateClosure`) four cells go from a signalled failure to complete with empty
  diagnostics: Circle 48 at 2e9 — leaving the pinned failing list of `large-coordinate-known-failures.test.ts` while
  still carrying its clearance violation — and three jittered circles, one of which gains an offset violation it did
  not have. One of the four (30 epsilons, seed 7) comes out clean.

A defect that stops announcing itself is a defect that got worse (journal decisions 72 and 134(c)): the same failure
mode decision 138(a) measured at `intersectRays`' identical-source exit. Both sites therefore kept the arithmetic bar
they had, `directionsAreSame` at the epsilon, until the tolerance package (register C8) moved the half-merge windows
these displaced nodes come from.

### anchorLiesOnRay: the closure's point-on-ray at the lane

*Moved from terminal-ladder.ts, `anchorLiesOnRay` doc comment, and `solveDegenerateClosure`'s exact-separation note.*

`anchorLiesOnRay` was `pointLiesOnRay`'s sine at `1e-8` — the sine form on a raw separation is a lateral bar that
grows with the separation (spec A9). MEASURED over dispatch 2's 580 cells, and again on landing (C8 dispatch 3): the
verdict flips 45 times on 26 cells (Circle 48 and Rosette5 40 at fine translations, one off-edge plus cell, five
Circle 32 ladder cells) and 0 cells move — node positions, edge targets and bases, verdict, node count and all four
oracles — and no full-graph digest pin moves.

In `solveDegenerateClosure`, the zero-separation test (census S12, C8 spec T9) was `areEqual(distance, 0)` at the
scratch 1e-8; measured before it moved to exact, no separation on the corpus, the fine translations or the jitter
sweeps fell in the band (0, 1e-8).

### addBisectionEdge: the zero-rate bar's re-derivations

*Moved from algorithm-helpers.ts, `addBisectionEdge`, the zero-rate test (census S19).*

THE ZERO TEST IS IN THE ONE ANGULAR FORM; ONLY THE SIGN COMES FROM THE RATE ITSELF. The rate is
`cross(bisectedBasis, clockwiseParent)` and both operands are unit, so `sineIsBelow` is the same bar and the same
number as the `areEqual(offsetRate, 0)` it replaced — but it names the space, which `areEqual` on a cross product never
did (journal decision 105). HELD at 1e-8 (census S19): three re-derivations were measured and each refused — see the
last three paragraphs.

HISTORY: IT STAYED AT THE SCRATCH EPSILON, ON THE RATE'S OWN OPERANDS — A MEASURED STOP, NOT AN OMISSION (spec A15's
`addBisectionEdge` row, A25 STOPs 3 and 4; journal decision 146). The spec moves it to the angular resolution on the
RAW PARENT directions `(cw, ws)`, the operands `ensureBisectionIsInterior` reads, to close D14. Both readings of that
row were measured on 2026-09-23 and both were refused by the corpus:

- LITERALLY, orientation-blind — `sineIsBelow(cw, ws, angularResolution)`: a near-STRAIGHT vertex (parents pointing
  the same way, sine under the bar) then takes this branch, where `ensureBisectionIsInterior` calls it straight and
  never flips a bisector that `normalize(c − b)` pointed out of the polygon. `Off-edge Jitter Reflex L (seed 55433)`
  and `Off-edge Jitter Plus (seed 7919)` STOP SOLVING (STOP 3), and four clean fixtures (T-Shape, both dumbbells, Three
  Globe Chain) reach the branch they never reached.
- ORIENTATION-AWARE — `directionsAreSame(cw, −ws, angularResolution)`, anti-parallel parents only, which is what "a
  zero rate" means: three bisectors are born with a NEGATIVE offset rate — `Off-edge Jitter Plus (seed 7919)` e48 at
  −8.8e-6 and e52 at −3.4e-6, `Off-edge Jitter Reflex L (seed 55433, k=4)` e48 at −7.8e-6, every one below the angular
  resolution — breaking the bisector rate rule, which `wavefront-causality.test.ts` holds universal over `FULL_CORPUS`
  (STOP 4). Re-measured 2026-09-23 under the solver's own causality check (journal-5 decisions 148, 149): both fixtures
  stay complete, the offset, clearance and direction counts do not move on either instrument, and NO diagnostic is
  raised — the negative rates are seen ONLY by the test-side rate check, which the solver does not run.

A rate of a few parts in 1e6 is a real, if slow, wavefront direction: pricing it as zero hands the direction to the
parent ordering, which disagrees with the rate's sign. So the rate's own zero test keeps the arithmetic bar it had, and
D14 stays open — now with `ensureBisectionIsInterior` at the resolution, where the rate's zero is reached only below
`1e-8` and every such vertex reads straight. The tolerance package (register C8) owns this site's re-derivation.

C8 DISPATCH 2 MEASURED T17 AND IT STOPS (2026-09-24, T37 STOPs 1 and 3). `directionsAreSame(cw, −ws, ρ)` on the raw
parents, with the fourth oracle landed at T18: the three sub-ρ negative rates appear as F65 found them and the oracle
correctly leaves them unflagged, three off-edge jitter cells lose a direction violation (the L at k = 2 seed 55433, the
plus at k = 4 seed 47514 and k = 6 seed 15838) — but the jittered Circle 32 at 3 × 1e-8, seed 7, STOPS SOLVING (a
pair-handler step failure on e71/e76), and the plus at k = 2, seed 23757 gains an offset violation of 1.77e-6 with its
`causality-violation` diagnostic. The fourth oracle stands on its own (causality-check.ts).

C8 DISPATCH 3 MEASURED `|rate| ≤ k·u` (decision 161(b)) AND IT MOVES A CLEAN FIXTURE. Over dispatch 2's 580 cells five
births have a rate in (k·u, 1e-8): `Golf Cart` e16 (−7.28e-16) and e21 (+7.28e-16) at 1e-6 and at 1e-5, and the
jittered Circle 32 at 1 × 1e-8, seed 5, e70 (−6.22e-9). The two negative ones are flipped by the sign rule where the
parent ordering kept them, and the clean `Golf Cart` became a SILENT wrong answer — complete, empty diagnostics, all
four oracles clean, but its skeleton no longer a tree and its strips 3.2% short of the canonical area.

C8 DISPATCH 3 THEN MEASURED THE FORWARD BOUND, 8u (`offsetRateIsArithmeticZero`, journal-5 decision 164), AND IT
MOVES THE SAME FIXTURE ONE LEVEL DOWN. At the ROOT it does what decision 164 asked: `Golf Cart`'s 3.3u rates are
zeroed, and over the 580 cells ONE cell moves — the Circle 32 cell above, 52 → 53 nodes, e70 a true negative priced by
its sign, still complete and clean on all four oracles; no digest pin moves. But in the recursion, `Golf Cart`'s
LEVEL-1 regions carry the same corridor at rates of 5.2u to 24u (±1.16e-15, ±1.53e-15, ±4.32e-15, ±5.35e-15, on walls
tilted 2.3e-15 to 1.07e-14 in the region's own unit space), above 8u; priced by sign, a level-1 region's strips cover
3.2% less than its canonical area — the root's failure again — and `recursive-subdivision.test.ts` fails (2 tests).
Attributed by toggle: this site back at 1e-8, the recursion passes. So the site stays HELD (journal-5 decision 164's
instruction). NOTE, MEASURED: `Golf Cart`'s root rate is NOT rounding. Its vertex 3 sits at y = 399.99999999999994,
one ulp below 400, so wall e2 is tilted by 1.456e-15 and the exact rate is ±7.28e-16, the computed value; the regions'
larger tilts are that same ulp read on shorter, re-normalised walls. The rates this site must not price by sign are
TRUE rates of a sub-perceptual tilt, which no rounding bound on the rate separates from e70's −6.22e-9.

REGISTER C12 MEASURED IT AGAIN, AS THE THIRD MEMBER OF THE WINDOW/BOX SET (journal-5 decisions 165, 167(d)), at the
forward bound 8u on the tree with the per-pair window and the exact box: at the root 0 of 642 sweep cells move; in the
recursion `Golf Cart`'s level-1 regions still cover 3.23% less than their canonical area and `Golf Cart` throws in
"subdivides without throwing". The window and box moving did not change it. HELD by inverse edit, and the window and
the box are held beside it (constants.ts, "THE WINDOW AND THE BOX").

### The per-pair layer window, filtered and as a prefix

*Moved from algorithm-complex-cases.ts, `layerWindow`.*

Register C12 measured the per-pair form of the layer window with the complete error model (journal-5 decision 167),
and it stopped (see "The window and the box" for the whole move). Two readings of "every arrival within the per-pair
window of the earliest" were measured.

- **Filtering the whole list** admits a later arrival with a wide budget while refusing an earlier one of the same
  edge with a narrow budget. On `Off-edge Jitter Plus (seed 7919)` the ring [22, 25, 26, 43, 45] took 26 × 43
  (4.07e-11 after the earliest, budget 2.79e-11) into the layer with 25 × 45 (budget 1.52e-11) and left 22 × 43
  (2.29e-11 after it, budget 2.2e-15) out, and a direction violation appeared.
- **The prefix form** — `layerWindow`'s own shape, cut at the first refusal — removes that, but still resolves a
  wide-budget arrival with the earliest while a narrow-budget arrival of the same edges, unorderable against it, is
  left out: `Off-edge Jitter Plus`, k = 9, seed 23757 took 164 × 229 (8.6e-11 after a split, budget 9.5e-10) with the
  split and left 164 × 237 (2.8e-12 later still, budget 1.1e-11), and its strips came out 1.1% short.

The window the layer reads is therefore the held `HELD_SIMULTANEITY_WINDOW`, applied as a prefix.

### The component-diameter census of the coincidence clustering

*Moved from coincident-events.ts, `clusterCoincidentMerges`.*

The clustering used to be CONNECTED COMPONENTS under `isOneEvent` — single linkage, so a run of events each within the
floor of the next became one group however far its extremes lay apart. Journal decision 155(b) (C8 dispatch 1) made it
anchored.

**Measured before it moved** (C8 dispatch 1, the component-diameter census): over `FULL_CORPUS` at 1e-6 and 1e-5,
Circle 48 and Rosette5 40 at the 46 fine translations, and the jitter sweeps (the 160-cell off-edge 1e-3 grid, the
160-cell along-edge stage-off grid, the 48-cell jittered Circle 32 ladder), 23 421 components were formed. On the corpus
the widest was 5.44e-7 at 1e-6 and 4.42e-6 at 1e-5 — inside the floor, so there the anchored partition IS the
component partition and nothing moves. Off it, 15 components were wider than the floor (Circle 48 at 4e10, 5e10, 6e10
and 2e11; eleven off-edge jitter cells; widest 1.906e-6), and those are the cells the anchored restatement moved.

The oldest form of the function joined each event to the first group already within tolerance of it in the order the
layer happened to list them, which made the partition depend on list order (a 48-gon fan left it as four groups).

### The split sites' same-point bar read exact

*Moved from coincident-events.ts, `coincidentEventPositions`.*

Register C12 measured this bar (census S2) exact, with the box, and it is held with it (journal-5 decision 167; see
"The window and the box"). Read as coordinate equality alone it re-points the re-report groups of seven CLEAN fixtures
(`Failing Long Octagon`, `Not Solvable Heptagon`, `Long Unbroken Side Then Extreme Acute Angle`, `Incorrect Ordering
e38-e30 Collision`, both `Premature Bisector Split`s, `Short Edge Promontory`) — every one a group of reports of ONE
split, one instigator, 0.03 to 1.93 ulps apart — and moves their digests by that much. The exact form that moved no
clean digest also left alone any group whose members all name one instigator, which acceptance already resolves to one
node (the first resolved consumes the instigator; the rest place nothing).

Re-pointing a group the box already unifies at its medoid was also measured: it moves one coordinate by one ulp on four
CLEAN fixtures, for no gain at all — they were one node before and one node after.

### The per-pair simultaneity window spent at the seven sites

*Moved from collision-helpers.ts, `pairSimultaneityWindow` (and the matching notes at `compareArrivals`, `compareArrivalsAtPairWindow` and the S23 phantom test in `collideInteriorEdges`).*

Landed and measured twice, not spent — a measured STOP both times (T16, T37).

**C8 dispatch 2, the division-only budget.** This window, with the DIVISION-ONLY budget, STOPPED: 211 of 580 sweep cells
moved, `Near Regular Circle 48` and the regular circles stopped solving, and two CLEAN digests moved (`Near Regular
Peanut 32`: `e37 × e57`, readings 5.0e-15 apart against a moment bar of 2.9e-15 and budgets of 6.4e-16 each; `Slightly
Deformed Peanut 2`). F71 read the gap as the rounding of the bases, the rates and the source offsets that budget did not
charge; F74 found the circles' failure was the held BOX re-joining a later layer's merge onto an orphan's own source.

**Register C12, the complete model.** Register C12 (journal-5 decision 167) spent it at all seven sites S22–S28, through
`compareArrivalsAtPairWindow`, each passing the solve's `simultaneityWindow` (δ) as the cap, with the budgets of the
COMPLETE first-order model and the same-point box exact beside it: the three fixtures dispatch 2 split were gathered and
unmoved, and the move STOPPED elsewhere (see "The window and the box"). The S23 phantom test's window was held with the
other six through C8 dispatches 1 and 2 and register C12.

### The offset-rate zero test (S20)

*Moved from collision-helpers.ts, `offsetDistanceWithBudget` (the `noGradient` bar), and the `meetHeadOn` division guard.*

**The move to the angular resolution, refused.** The bar stayed at the scratch epsilon — a measured STOP, not an
omission (spec A15's `makeOffsetDistance` row, A25 STOP 3; journal decision 146). Moved to the angular resolution, on
its own and with every other site at its old bar, and RE-MEASURED 2026-09-23 under the solver's own causality check
(journal-5 decisions 148, 149): ONE defect fixture stops solving — `Off-edge Jitter Reflex L (seed 55433, k=4)`, with
step failures and unresolved edges — and three stay complete while gaining violations, every one of them diagnosed as
a `causality-violation` (offset/clearance/direction): `(seed 15838)` 0/0/0 → 1/1/1, `(seed 55433)` 0/0/0 → 1/0/1,
`Off-edge Jitter Plus (seed 7919)` 0/0/0 → 0/1/0. (An earlier measurement had all three reflex-L fixtures stop solving;
it no longer held at that date.) The mechanism is inferred rather than traced: a ray whose rate against its parent is a
few parts in 1e6 — a slightly skewed corridor mid-line — is then priced as travelling at CONSTANT offset while its
partner's arrival is priced at its true rate, and the equi-time check that follows (`arrivalsAreEqual`, at the scratch
epsilon) reads the pair as phantom.

**The forward bound, 8u, since C8 dispatch 3** (census S20; spec T2, T30; journal decisions 161(e) and 164). The bar was
held at a named sine literal `1e-8` through dispatches 1 and 2 (T33's precondition, dissolved by decision 161(e)).
Measured on dispatch 2's 580 cells: at the retired 1e-8, 37 evaluations of a rate in (2u, 1e-8) were zeroed, on three
cells: `Golf Cart` at 1e-6 and at 1e-5 (e16 and e21, |rate| 7.28e-16 = 3.3u) and the jittered Circle 32 at 1 × 1e-8,
seed 5 (e70, 6.22e-9). `k·u`, landed first in dispatch 3, priced all of them and moved the `Golf Cart` digest pin (e16
and e21's `maxOffset` by tens of ulps); at 8u the `Golf Cart` rates are zeroed again and its pin is back to native.
What 8u prices that 1e-8 zeroed is e70 alone — one bisector on one cell, 19 evaluations — and the site moves no cell:
geometry, verdict, node count, every oracle and every digest pin unmoved.

**`meetHeadOn`'s division guard** was `FLOATING_POINT_EPSILON·wA·wB` before it was re-derived from the unit roundoff
(spec A6 as amended, journal decision 144). At unit weights the new bound is at most 8u ≈ 8.9e-16, seven orders inside
the old 1e-8; measured 2026-09-23, no evaluation on `FULL_CORPUS` falls between the two.

### The identical-source exit (S6)

*Moved from intersection-edges.ts, `intersectRays` (the identical-source exit), and the forward test of `sourceLiesAhead`.*

**The exit stayed at the arithmetic bar, a measured negative result rather than an omission** — spec A15's
identical-source row, measured 2026-09-11 and referred back to the lead. The spec's argument for moving it is sound on
its face: "are these two sources one point?" is the degenerate case of "are these two sources on one line?", so asking
the first at `1e-8` while the second is answered at the floor leaves a band in which a pair is one line and not one
point, decided by nothing. The row was therefore written as `distanceToRay2 <= coaxialityFloor` and run over the whole
corpus at the library floor.

What it did is not a cure. Twenty pinned assertions across four suites moved, and every one of them moved the same
way: a solve that FAILED LOUDLY started reporting `complete: true` with an empty diagnostics list, while still carrying
the violations that made it a defect. Audited with `wavefront-causality.test.ts`'s own three oracles, re-derived from
geometry:

- `NEAR_REGULAR_CIRCLE_32` jittered 15 epsilons at seed 2 — the cell `near-regular-polygons.test.ts` pins expressly as
  "a signalled failure rather than a backwards-bisector pass" — came back complete with 2 offset violations, 2
  DIRECTION violations (one at `dot = -0.98`, a bisector wired essentially straight backwards) and 2 clearance
  violations;
- `NEAR_REGULAR_CIRCLE_48` at translation 1e10: complete, with 2 offset, 4 direction and 5 clearance violations;
- `NEAR_REGULAR_ROSETTE5_40` at translation 1e11: complete, with 1 offset and 13 clearance violations.

A defect that stops announcing itself is a defect that got WORSE (journal decision 72's doctrine, decision 134(c), spec
A25's STOP 4), and rewriting the corpus's failure register was the lead's call and not a delegate's — the precedent is
journal decision 126, which left W-spec W33 unimplemented on exactly this reasoning. The mechanism: these fixtures fail
because a k-way convergence half-merges into hubs a few times `1e-8` apart, and a `1e-6` identical-source exit swallows
the whole half-merge, terminating pairs that should have collided and reporting the wreck as finished. The coaxiality
lane itself (`sourceLiesAhead`) was untouched by this; it is a different site with a different measurement.

**Re-measured 2026-09-23 under journal decision 138(a)'s instrument, and reverted again** (journal decisions 144 and
146, dispatch 1 of the angular package). The move was made again on top of the derived angular resolution, to STAND
only if every causality oracle count (offset, clearance, direction) was zero or unchanged on every cell AND no solve
went from a signalled failure to `complete: true` with empty diagnostics. Measured over `FULL_CORPUS`, Circle 48 and
Rosette5 40 at the forty-six fine translations 1e8..1e13, and `NEAR_REGULAR_CIRCLE_32` jittered at 1/3/10/15/30/100
epsilons of its span over seeds 0..7 (199 cells):

- the corpus itself was untouched — every fixture's verdict and oracle counts identical;
- 32 cells went from a signalled failure to complete with empty diagnostics — 12 of Circle 48 (2e9, 5e9..1e10,
  2e10..6e10), 13 of Rosette5 40 (7e10..1e12) and 7 jittered circles, among them 15@2 again (offset 0→2, clearance
  0→2, direction 0→2);
- 68 cells grew an oracle count — Circle 48 at 4e10..6e10 went to 8 offset and 8 direction violations from 2 and 1 —
  and 15 jittered-circle cells that solved then failed.

Both halves of the instrument failed, so the exit stayed at the arithmetic bar until the tolerance package (register
C8) moved the half-merge windows that feed it.

**Exact since C8 dispatch 3.** Held at a named literal `1e-8` through dispatches 1 and 2 while T33 waited on the window;
decision 161(e) dissolved that precondition (the held window IS the tree these sites live on). The band (0, 1e-8) was
measured EMPTY in dispatch 2 over its 580 cells — `FULL_CORPUS` at 1e-6 and 1e-5, Circle 48 and Rosette5 40 at the 46
fine translations, the off-edge 1e-3 and along-edge 1.0 jitter grids, the jittered Circle 32 ladder — with 0 cells
moving, and RE-MEASURED on landing: still empty, 0 of 580 cells moving. Until then, a pair of distinct sources closer
than δ left `intersectRays` by this exit before reaching `sourceLiesAhead`'s forward test; with the exit exact, such a
pair reaches the forward test and its exact sign decides — on the 580 measured cells, with no verdict moving.

### The near-parallel gate at the angular resolution

*Moved from intersection-edges.ts, `intersectRays` (the near-parallel guard).*

The gate was the retired `PARALLEL_GATE_SINE_BAR` (1.4142e-4), the scratch epsilon read through `areEqual(|dot|, 1)`.
Measured 2026-09-23 on the move to the angular resolution: the full-graph digest is bit-identical across all 59
fixtures, and on the off-edge jitter sweeps the move re-pairs four cells structurally (node counts ±1, no oracle
moves) and gives ONE unpinned cell — the plus at k = 10, seed 23757 — one offset and one direction violation it did not
have, while it still completes. Reported, not pinned.

The coaxiality lane (`sourceLiesAhead`) was formerly answered at `FLOATING_POINT_EPSILON`, hybridised with a
`Math.max(1, separation)` that made it relative above unit separation and absolute below; that is the defect journal
finding F57 traced (the reading of `r0.2.1` stays at the site). The collinearity exits were formerly asked as a sine at
the angular resolution on the raw separation.
