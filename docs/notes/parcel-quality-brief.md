# Parcel quality brief — short-edge merging and corner idiom

**Status: shipped.** All decisions below (1–17, as amended) are implemented, reviewed,
render-validated, and merged to `main`; the reflex arm of decision 16 is parked with a proof,
and the trunk-with-branches follow-up is detailed in
[trunk-with-branches-direction.md](./trunk-with-branches-direction.md).

Written 2026-08-09, on `feature/parcel-quality` (stacked on `feature/elevation`). This brief steers
the next body of work: raising the *idiomatic quality* of sliced parcels. It is the persistence of
three review notes raised against the current slicer, plus the constraints the work must respect.

## The three defects, from specific to general

**1. The slicer ignores minimum area/frontage at short perimeter edges.** Every unique perimeter
edge is currently guaranteed at least one fronting parcel. Short edges therefore spawn
degenerate-tending triangular parcels. A reproducing input is below.

**2. The fix direction: merge, don't force.** Drop the every-edge-gets-a-parcel guarantee for short
edges; let the would-be parcel merge into a neighbour. Initial merge-target heuristic: the smallest
neighbour by area. A more nuanced heuristic may be needed — that choice is open, the merge mechanism
is not.

**3. The general case: un-idiomatic diagonal borders at convex corners.** Even amply-sized parcels
get diagonal side borders wherever adjacent frontage edges meet at an internal angle below ~120° —
the bisector-adjacent parcels tend toward wedges and read as machine-generated. This limitation is
acknowledged in Vanegas et al., *Procedural Generation of Parcels in Urban Modeling* (EG 2012,
https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf). Notes 1–2 are the extreme instance of
this phenomenon: the solution should be **one mechanism, not two** — a merge/reshape pass with
tunable thresholds, of which the short-edge case is the degenerate limit.

## Constraints

- **Tiling stays exact** — strips plus rings equal the polygon, parcels equal their strip, at the
  existing ~1e-15 against 1e-12 tolerance. A merge pass must not open gaps or overlaps.
- **Egress is amended, not weakened.** A merged parcel's frontage run may span multiple exterior
  edges, but every parcel still owns a non-degenerate, contiguous run of frontage.
- **Thresholds are tunable and exposed on `/parcels`** (minimum frontage length, minimum area,
  corner-angle threshold defaulting near 120°), so render-and-look validation is possible. The
  session that built this pipeline found four defects by looking that no test caught — keep that
  habit.
- **Decisions in [parcel-generation-handoff.md](./parcel-generation-handoff.md) are not
  re-litigated** — in particular "at full depth, lots may be triangular" still holds where the
  *strip structure* forces it; this work targets triangles the slicer *chooses*, not ones the
  skeleton forces.
- The dev server consumes `packages/core/dist` — rebuild core after changing it.

## Parked, with a recorded caveat

The trunk-with-branches (spine-as-road) interpretation and its recursive application are **not in
scope** pending a go/no-go. Caveat to carry: recursion feeds solver output back as solver input —
exactly-collinear, machine-generated polygons — the regime of items 2 and 3 in
[solver-hardening-backlog.md](./solver-hardening-backlog.md). Adopting recursion means budgeting to
revisit the reverted layer-partitioning fix (`0e2f233`, reverted by `872bc4c`).

## Design decisions (fixed, 2026-08-09)

Set after a code-level survey of the slicing machinery. Two load-bearing findings drove them:
"every perimeter edge gets a parcel" is not a rule but an emergent default (`sameLogicalStreet`
defaults to `() => false` in `computeStrips`, so `groupIntoRuns` yields one strip per exterior
edge); and a strip-level corner-correction machine (`classifyCorner` / `transferCorner` /
`applyCornerCorrection` in `strip-decomposition.ts`) already exists, already receives interior
angle and both edge lengths, and has no production consumer.

**Surface roster.** `StripOptions` gains `minEdgeLength?: number` (world units) and
`cornerAngleThreshold?: number` (radians); both `undefined` = off, preserving current behaviour
and test baselines. `useParcelStore` gains `cornerAngleDeg` (plain field beside
`splitIrregularity`, default 120, not polygon-scaled). `useParcelPipeline` threads both into
`computeStrips`. `ParcelControlsPanel` gains one corner-angle control. `@proc-geo/test-fixtures`
gains the repro polygon below.

Strip-level merging (notes 1–2):

1. Short-edge handling happens **at strip level, before slicing** — never by cross-strip parcel
   merging. `sliceStrips` keeps its `Parcel[][]` shape and every per-strip invariant test keeps
   its structure.
2. An exterior edge is *short* iff its length < `StripOptions.minEdgeLength`. The dashboard passes
   the effective `minWidth` as this value — an edge that cannot host a minimum-width parcel does
   not get its own strip. No new derivable knob for this.
3. A short edge merges into the neighbouring run whose junction interior angle is **closest to π**
   (straightest continuation), decided inside `computeStrips` where the solved graph is available.
   Chains of short edges merge transitively through the existing maximal-run grouping. This
   deviates deliberately from the review note's "smallest neighbour by area": pre-slicing there is
   no parcel area, and straightest-continuation directly serves the goal of frontage that reads as
   one street. Render-and-look arbitrates; revisit only on visual evidence.
4. Guard the all-merged degenerate branch: if merging would collapse every run into the single
   closed-loop `holes` strip (which `sliceStrip` refuses), leave unmerged the junction with the
   sharpest corner.
5. The strip-level invariant "each exterior edge appears in exactly one strip's
   `supportingEdgeIds`" is unchanged. The guarantee being dropped is only "one strip per edge".

Corner correction (note 3):

6. Activate the existing β-correction in production: when `cornerAngleThreshold` is set, corners
   with interior angle below it are corrected via the existing `classifyCorner` path. Core takes
   radians; the dashboard exposes degrees, default 120°.
7. Characterise before wiring: the machinery currently has only test consumers. Extend its unit
   tests first; surprising behaviour is a finding to report, not to silently fix.

Invariants and tests:

8. Tiling identities unchanged, green at existing tolerances across the full
   `ALL_TEST_POLYGONS` × depth sweep, with the new options both off and on.
9. Egress as amended: parcel frontage runs may span multiple exterior edges (merged-strip tests
   already exercise this). New assertion with merging active: every strip's frontage length
   ≥ `minEdgeLength`.
10. Corner correction is area-conserving by construction — assert tiling still holds with it
    enabled.
11. Add the repro polygon as a fixture; enrol it in `ALL_TEST_POLYGONS` (and the slicing tiling
    fixture list) provided all sweeps pass; otherwise keep it export-only and record why in the
    fixture file.

## Amendments after adversarial review (2026-08-09)

The review confirmed three defects with reproductions; these rulings amend the decisions above.

12. **Decision 9 is a post-correction guarantee, unified with the corner pass.** A corner transfer
    is refused when the donor strip's *current* surviving frontage would fall below
    `minEdgeLength` (or a scale-relative epsilon floor when unset). Sequential transfers see the
    already-shortened frontage, so cumulative double-donation cannot consume a strip (the needle
    polygon repro). The far-end fraction check gains a symmetric epsilon.
13. **The two-run floor's residual `holes` case is accepted as an envelope edge.** At extreme
    thresholds (e.g. `minEdgeLength` far above every edge) a two-run decomposition can still close
    a loop; `sliceStrip` degrades gracefully to a whole-strip parcel. Behaviour stands; docstrings
    and test titles must stop claiming the floor prevents it, and the pennant case gets a
    characterisation test.
14. **A near-degenerate corner-geometry fuzz is backlog, not this round.** The epsilon-free guard
    surfaces (`cutStaysInside` midpoint ray-cast, strict crossing tests) are made safe for the
    known cases by decision 12; systematic fuzzing is recorded in the hardening backlog.

## Amendments after render inspection (2026-08-09, second round)

Live driving of `/parcels` showed the <120° convex threshold is massively too selective: seam tilt
is half the deviation from straight, so junctions in the 120–150° band keep visibly diagonal
borders and typically only one or two corners per polygon qualify at all.

15. **The corner predicate is deviation-from-straight.** Correction fires when
    `|θ − 180°| > X`, with X the *mitre tolerance*, default 30°. This replaces the
    `cornerAngleThreshold` fire-below semantics and its `cornerAngleDeg` parametization; core takes
    the tolerance in radians, `undefined` (or ≥ π) = off.
16. **The reflex arm ships only through characterise-first.** θ > 180° + X points the existing
    β-correction at reflex junctions, where the wedge geometry inverts and skeleton split events
    live. Characterise `transferCorner` there before wiring: if cuts are valid, tiling conserved,
    and the guards behave, both arms enable together; any surprise means the convex arm ships
    alone and the reflex arm is parked with the findings.
17. **The wedge-award rule (longer frontage takes the corner) stands pending render evidence.**
    The deviation predicate fires at many more, gentler junctions; if whole-wedge awards read as
    land-grabby there, the fallback is blending (split the wedge or cap transferred area),
    arbitrated by render-and-look.

## Reproducing input for defect 1

Add as a fixture (exported individually; promote to `ALL_TEST_POLYGONS` only if it solves
completely under the sweeping suites).

```json
{
  "format": "proc-geo/geometry",
  "version": 1,
  "kind": "vertex-run",
  "closed": true,
  "vertices": [
    { "x": 755.7095794766699, "y": 86.07079347753358 },
    { "x": 289.1438878983182, "y": 132.98919477987982 },
    { "x": 255.1539350857047, "y": 384.0154841600986 },
    { "x": 257.06831608404616, "y": 442.50040482032244 },
    { "x": 361.1581017796838, "y": 405.996833106862 },
    { "x": 634.3943018555723, "y": 349.59755784784267 },
    { "x": 741.0289360381832, "y": 473.6045930561204 },
    { "x": 759.51904665229, "y": 437.7364643159455 },
    { "x": 788.2362486924904, "y": 412.62829528803013 },
    { "x": 986.8179497273193, "y": 317.8599048905803 },
    { "x": 992.6863691337453, "y": 311.6008921755559 },
    { "x": 978.4250246813748, "y": 302.5560034277609 },
    { "x": 895.3963646027089, "y": 275.8419174170277 },
    { "x": 710.5896793315917, "y": 256.39113601050616 },
    { "x": 748.5358573869659, "y": 124.77812439558917 },
    { "x": 785.2349529111951, "y": 64.0097246849636 }
  ]
}
```
