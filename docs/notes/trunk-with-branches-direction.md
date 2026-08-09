# Trunk-with-branches — direction note for a follow-up session

Written 2026-08-09 at the close of the parcel-quality session. Status: **approved direction,
deliberately deferred** — picked up when it rises through triage. This note exists so the
follow-up session starts with the full picture instead of re-deriving it.

Companions: [parcel-quality-brief.md](./parcel-quality-brief.md) (the shipped slicer's design
contract, decisions 1–17), [solver-hardening-backlog.md](./solver-hardening-backlog.md) (items
2, 3, and 7 gate the recursive variant), [parcel-generation-handoff.md](./parcel-generation-handoff.md)
(session history), and in the game repo `Notes/buildables/procedural-accommodation-parcels-research.md`
(§5.6 and §9 — the hybrid this converges with).

---

## The two interpretations of the straight skeleton as a lot-division tool

**Interpretation 1 — perimeter-as-road.** The polygon's perimeter is the street; frontages face
outward; at partial depth the interior void is a *shared urban space* (courtyard, garden, park).
This is the shipped model. Everything on `main` implements it, and the C++ port can proceed on it
without waiting for anything in this note.

**Interpretation 2 — trunk-with-branches.** Solve the skeleton to 100% depth and treat its
**spine** as the trunk road or path. Frontages face *inward*: every parcel's egress is via the
spine, not the perimeter. The egress invariant survives intact but re-targeted — every parcel
still owns a non-degenerate, contiguous frontage run, now measured against the spine.

The convergence that makes this more than an aesthetic alternative: the game repo's approved
roadmap (Candidate G via the §5.6 hybrid) already says **"seed the primary lane along the
skeleton spine."** Interpretation 2 is the geometric version of that lane — derived rather than
routed — so proving it in TypeScript directly de-risks the hybrid's road step.

---

## Mechanics, mapped onto the existing machinery

**Spine extraction.** At full depth every strip's inner boundary lies along the skeleton, so the
spine is already *present* in the data — what's missing is its definition as a road. An open
design decision with real consequences: the full interior skeleton is a tree (for simple
polygons), and a "trunk" needs pruning. Candidate definitions: the longest path through the
skeleton tree (medial-axis diameter); interior edges whose wavefront time exceeds a threshold;
or degree-based pruning of leaf whiskers below a length fraction. The pen's input is smoothed
and budgeted, so whisker noise is bounded — but the definition should be settled by rendering
all three against drawn strokes, not by argument.

**Frontage retargeting.** Strips currently carry `supportingEdgeIds` (exterior) and a
perimeter-side `frontage` polyline. In this model the frontage flips to the strip's
skeleton-side run. The slicing machinery (cut lists, `sampleOrigins`, the merge pass) is
frontage-relative and should transfer with the flip — but the parcel-quality issues recur on
the new frontage: **short spine segments** are the analogue of short perimeter edges (merge
them — decision 2's mechanism, re-aimed), and **spine junctions** (skeleton nodes of degree ≥ 3)
are the analogue of mitred corners. The mitre-tolerance machinery (deviation predicate,
epsilon-aware guards, frontage floor) is the starting point, but junction geometry at skeleton
nodes differs from perimeter corners — expect a characterisation pass, not free reuse.

**Endpoints and caps.** The spine's endpoints terminate at (or near) polygon vertices. Parcels
at the caps have no natural side-neighbour on one flank — decide whether caps get wedge parcels
(accepted, like the full-depth triangle ruling) or merge into their neighbour (the note-2
mechanism again).

**The partial-depth hybrid worth exploring.** At depth < 100% the two interpretations compose:
ring parcels front the perimeter (interpretation 1) while the interior core — currently a void —
is spine-divided (interpretation 2). That yields double-loaded blocks: outer lots on the
perimeter street, inner lots on the spine lane, back-to-back. No literature precedent required;
the tiling invariant (strips + rings = polygon) already accounts every region.

**Connection points.** The game's regions carry entrances (Emilien's Ψ). The spine should be
anchored to them — either by choosing the spine path that terminates nearest the entrances, or
by extending spine endpoints to the boundary at the entrance points. This is the seam where the
geometric spine meets the routed road network, and it is the argument for keeping spine
extraction *parameterisable* rather than canonical.

---

## Recursion — and the caveat that gates it

The recursive form: first pass divides the region into 4–8 large parcels (merging along the
perimeter as usual); each parcel is then re-solved and re-sliced, recursing to the desired leaf
size. Two levels are expected to suffice. Each level chooses its spine topology — **through-road**
(spine connects two boundary points of the parent parcel) or **cul-de-sac** (spine terminates
interior) — and the choice per level produces distinct street-network morphologies from one
mechanism.

**The gate, recorded at the moment of decision:** recursion feeds the solver's own output back
as input — exactly-collinear, machine-generated polygons. That is precisely the regime of
backlog items 2 (near-degenerate reflex unreliability), 3 (exactly-subdivided reflex failures),
and 7 (strip overlap on the collinear dumbbell with `complete: true`). The reverted
layer-partitioning fix (`0e2f233`, reverted by `872bc4c`) was parked *because* no input this
project produced reached that regime; recursion produces it by construction. **Before building
the recursion driver: add the dumbbell fixture (backlog 7), then revisit `0e2f233` — budget for
un-reverting or re-deriving it.** Single-level trunk-with-branches does not need this and can
ship first.

---

## Why this stays a TypeScript arc

It is flat-plan skeleton geometry — the delicate machinery the TS corpus, invariants, and
render-and-look loop exist to protect. It should be proven here before the C++ port freezes a
frontage model. The port is *not blocked*: it proceeds on interpretation 1, and the spine model
lands later as an additive port whose property tests (egress-via-spine is the same invariant
with a different reference polyline) transfer the same way.

## Suggested shape of the follow-up session

Not a plan — a triage-ready sketch. (1) Spine extraction with the three candidate definitions
behind a switch, rendered on `/parcels` against drawn strokes; settle the definition visually.
(2) Frontage flip + egress-via-spine invariant + slicing against the spine, single level, no
recursion. (3) Quality pass re-aimed at spine junctions and short spine segments,
characterise-first. (4) The partial-depth hybrid as a layer toggle. (5) Recursion only after
the backlog gate clears, as its own arc. Each step is independently renderable and
independently shippable.
