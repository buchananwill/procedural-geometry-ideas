---
title: "Building Shell: Gable Rises on a Hipped Wall (Proposal)"
type: decision-spec
status: proposed
---

# Gable rises on a hipped wall

**Status: a proposal by the arc lead (2026-11-12), for the user's ruling. Nothing here is adopted.** It answers the
second item of the [session 2 charter](./building-shell-arc-journal-02.md#1-the-arcs-charter). The evidence is
findings F57 to F61 in that journal.

## Intent

A straight wall may be hipped along most of its length and carry one or more **gable rises**: stretches where the
wall continues up into a gable triangle, whose ridge runs back, perpendicular to the wall, and dies into the main
roof. No step-out in plan is needed.

The straight skeleton cannot express this, and must not be asked to. A weight change at a straight vertex has no
well-posed vertex velocity, and `@proc-geo/core` refuses it by design (F58). Algorithm B's partial-line gable is
the wrong shape (F59). **The rise is therefore not part of the roof solve. The storey is solved fully hipped along
that wall, and each rise is one more raw solid handed to the union.** This is the four-step model used as intended:
build parts alone, union raw geometry, classify the final faces. A first measurement is clean (F60).

## Vocabulary

| Term | Meaning |
|---|---|
| **Run** | A stretch `[from, to]` of one Ring side, in cm from the side's start, with one form and one pitch. A side with no authored runs is one whole run. |
| **Extent** | A stretch of a union wall won by one run. |
| **Whole-wall gable** | A union wall whose every extent is a gable. Today's gable, unchanged. |
| **Gable rise** | A gable extent on a union wall that also has at least one hip extent. New. |
| **Rake** | One of the two sloped planes of a rise. It contains a horizontal line at plate height, perpendicular to the wall, through one end of the extent, and climbs towards the extent's middle. |

## Surface roster

| File | Change |
|---|---|
| [fixture.ts](../../apps/building-shell/src/fixture.ts) | `SideForm` gains optional `runs`. |
| [ring-forms.ts](../../apps/building-shell/src/ring-forms.ts) | `unionWallForms` decides form per extent, and returns each wall's hip pitch plus its rises. |
| [storey.ts](../../apps/building-shell/src/storey.ts) | Builds one synthetic gable piece per rise and passes it to the existing `gablePiece`. |
| [wire/input-adapter.ts](../../apps/building-shell/src/wire/input-adapter.ts) | The "runs disagree" refusal narrows. `readInput` and `writeInput` carry runs. |
| `src/roof/`, `packages/core/` | **No change.** The copy-integrity test and core's weight assertion both stand. |
| `input@1` schema, defaults, refinement | **No change.** The schema already carries runs with a form and a pitch each. |
| `EModularEdgeKind`, [edges.ts](../../apps/building-shell/src/edges.ts), [cells.ts](../../apps/building-shell/src/cells.ts), [tags.ts](../../apps/building-shell/src/tags.ts) | **No change expected** (F60). A change found necessary is a stop-and-report. |
| `golden/` | The Ring-conflict goldens change shape by decision 3. New goldens are added for rises. Every other golden stays byte-identical. |

## Decisions

Numbers are for citation. They are not an order of work.

### Authoring

1. **A Ring side carries runs.** `SideForm` becomes `{form, deg?, runs?}`, where `runs` is a list of
   `{from, to, form, deg?}` that lie inside the side, do not overlap, and are in order. A stretch of the side that
   no run covers takes the side's own `form` and `deg`. A side without `runs` means exactly what it means today.
2. **A run's `deg` on a gable run is the rise's rake pitch.** On a hip run it is the wall's hip pitch.

### Derivation

3. **Form is decided per extent, not per union wall.** At each point of a union wall, the lowest-index Ring whose
   side lies there wins, and its run at that point gives the form. **This amends spec 3 and journal decision 116**,
   which gave the whole wall to one winner. The consequence is deliberate: a Ring with a gabled side lying flush on
   another Ring's hipped wall now produces a rise over its own width, where today its gable is either dropped or
   spread along the entire wall. **CORRECTED 2026-11-12 (journal F65)**: this holds where the gabled Ring wins its
   stretch. Where a lower-index Ring's hipped side covers the same stretch, as in a T whose crossbar has the lower
   index, the hip wins there and no rise is built (decision 7).
4. **A union wall has one hip pitch.** It is the pitch of the lowest-index hip extent on that wall. Hip extents
   that disagree in pitch do not refuse: the lowest index wins the wall's pitch, as decision 116 has it today.
   This is the skeleton's constraint (F58) and is not negotiable.
5. **A union wall whose every extent is a gable is a whole-wall gable**, built by algorithm B exactly as today,
   with the lowest-index extent's pitch as the wall's weight. No rise is built for it.
6. **Every other gable extent is a rise.** The wall enters the roof solve as a hip at decision 4's pitch. Adjacent
   gable extents merge into one rise when their pitch and limits all agree, across Rings as well as within one.
   Adjacent gable extents that differ stay separate rises. **CORRECTED 2026-11-12 (journal F65)**: they meet at a
   point on the plate with the hip slope between them. The original said "in a valley", which was wrong.
7. **Determinism stays the lowest-index rule** (decision 128). There is no "gable beats hip" rule. To make a rise
   win on a wall another Ring also claims, the author gives its Ring the lower index.

### Geometry

8. **A rise is one synthetic gable piece**: wall = the union wall, band = the extent, far distance = the existing
   piece rule, planes = its two rakes plus the limit planes of decisions 11 and 12 (AMENDED 2026-11-12: the original
   said "plus the far wall's hip plane where that wall is a hip", which decision 11 strikes). It is built by the
   unchanged `gablePiece`, so it is a prism trimmed under those planes, above the plate, inside the footprint. The
   union does the rest: the ridge stops where it meets the main roof.
9. **Rake planes are canonicalised against the storey's existing planes before a piece is made.** A rake that
   coincides with an existing roof plane takes that plane's id, because roof-face identity is the plane id (F61).
10. **A rise that ends at a convex corner of the footprint takes the adjacent wall's hip plane as its rake at that
    end**, and ignores its own pitch there. This is what a whole-wall gable already does at its ends, so a rise
    widened to the whole wall becomes the whole-wall gable.
11. **AMENDED 2026-11-12 by the user's ruling (journal decision 194). How a rise is limited is chosen by data, and
    the default limit is the far slope.** Each rise carries a `limit`, a named policy that decides which planes
    bound the rise besides its two rakes. The pipeline takes the policy as a function from a rise to its bounding
    planes, so a second policy is an addition and never a rewrite.
    - **`ridgeSlope`, the default and the only policy built first. AMENDED AGAIN 2026-11-12 (journal decision
      203).** The apex may stand above the main ridge. No point of the rise may stand above the roof slope just
      beyond the main ridge that the rise's own ridge runs into, extended back towards the wall the rise stands
      on. A rise tall enough to meet that plane at its own wall has its front truncated by it.
    - **STRUCK: `farSlope`.** The first amendment named the limit `farSlope` and defined it as "the far wall's hip
      plane of decision 8". That was the lead's mis-reading of the user's words. The two agree on a rectangle. Off
      a rectangle the far wall is the wrong slope, and where it is a courtyard cut or a gable it gives no plane at
      all (journal F66). Decision 8's "far wall's hip plane" is replaced by this limit.
    - **DEFINED 2026-11-13 (journal decision 204, F70), provisional until the user confirms.** Take the storey's
      solved hip roof with no rise added: the skeleton's faces, one per wall, gabled and cut walls included. Walk
      inward from the middle of the rise's band, square to its wall. **The limit is the plane of the first face
      entered whose slope falls in the walking direction.** One plane serves the whole band. The walk is an exact
      intersection of the line with the face polygons, never a sampling.
    - **Where the walk finds no such face, the limit is the plane of the built roof's first falling face on the
      same walk.** Measured, this happens only where the walk runs along a courtyard cut.
    - **Rises do not limit each other.** The walk never reads another rise.
    - **Known shape, accepted**: on a hip end or a wing end the walk runs along the main ridge, so a rise taller
      than that ridge rides along it to the far end's hip plane. `maxHeight` of decision 12 is the author's remedy.
    - Other policies the user can imagine are not designed here. Each is added with its own decision.
    - `limit` is an in-memory field on a gable run. `input@1` gains a field for it only when a second policy
      exists, and that is a wire change with its own ruling.
    - The original text read: "A rise's apex is not capped. A rise taller than the main ridge crosses it and comes
      down under the far wall's hip plane." The geometry is the same. What changed is that it is now one named
      policy among several, selected by data.
12. **AMENDED 2026-11-12 by the user's ruling (journal decision 195). A rise is clamped beneath an overhanging
    storey, and may carry a maximum height of its own.** Both are horizontal caps, and both are bounding planes
    under decision 11's policy mechanism, so data can choose otherwise later.
    - **The floor cap, on by default.** The rise's ridge may not pass up through the floor of a storey that
      overhangs it. The cap is a horizontal plane at that floor's height, applied to the whole rise.
    - **The rise's own `maxHeight`, optional.** When authored, it is a horizontal cap at that height above the
      plate. The lower of the two caps applies.
    - **The lead's reading of "overhanging", to be confirmed by the user**: a storey whose floor is above the
      rise's plate and whose plan overlaps the rise's plan. The storey directly above the rise's own storey has
      its floor at the plate, so it is not an overhang in this sense. A rise that runs back into that storey's
      wall is still the open question of the
      [covered-storeys findings](./building-shell-covered-storeys-and-sections-findings.md), and inherits its
      ruling.
    - **A capped rise has a flat top. MEASURED 2026-11-12 (journal F65)**: it is a `Roof` face on its own
      horizontal plane, bounded by Ridge, Valley, Verge, and RingJunction against a wall, with Roof Cells of null
      source. Nothing is Unclassified and no new kind is needed, so decision 13 holds for capped rises too.
    - **AMENDED 2026-11-13 (journal decision 204), provisional until the user confirms. The floor cap sits 1 cm
      below the overhanging floor.** The cap is one named constant. STRUCK: "a rise that reaches the floor cap
      fuses with the overhang". Fused contact gives an `Unclassified` Gable–Underside Edge (journal F71). It can
      return as a policy once that Edge has a kind.
    - **AMENDED 2026-11-13 (journal decision 204), provisional until the user confirms. A rise is also capped at
      the wall top of the storey directly above its own**, where that storey's plan overlaps the rise's reach.
      This closes the breakthrough of journal F68. A rise under a flush upper wall is then buried whole.
    - **The three caps (`maxHeight`, the floor cap, the wall-top cap) are horizontal planes over the whole rise,
      and the lowest applies.** A rise whose lowest cap is at or below its plate builds no piece.
    - The original text read: "A rise under a storey above obeys the same precondition as every lower roof: it
      must stay beneath the top of the storey over it. This proposal does not solve that precondition."

### Classification

13. **A rise adds no new face kind, Edge kind or Cell rule.** Its front is a `Gable` face over the wall's `Wall`
    face, met at a `WallPlate` edge. Its rakes are `Roof` faces that meet the main roof in `Valley` edges and the
    front in `Verge` edges. Measured in F60.
14. **Cell provenance on a rise names the winning Ring and side of its extent**, not the wall's hip winner.

### Wire and port

15. **`input@1` is unchanged.** The adapter's refusal "side j's runs disagree" narrows to: the hip runs of one side
    must agree in pitch. A side with a gable run and a hip run is accepted. **This amends journal decision 149.**
16. **`writeInput` writes a side's runs as authored.** A fixture with no authored runs writes byte-identical
    output, so no existing golden input or playtest seed changes on the wire.
17. **`isOneWholeRun` stays as the seventh C++-replay condition** until the port builds rises. A document with a
    rise is exported as a golden and marked not yet replayable.
18. **The port mirrors decisions 3 to 14 with no change to its skeleton.** The port lead is consulted before this
    proposal is accepted, on one question: whether game content can request a form on part of a side, or only
    reach a rise through a flush Ring (decision 3).

### Verification

19. **The oracle for a rise is its height function.** Over the rise's band the roof top is
    `max(hip surface, min(rake A, rake B, far hip plane))`. A test samples the built shell against it. Algorithm
    B's `runB` knows nothing of rises, so `roof-parts-agreement.test.ts` keeps its present scope.
20. **Every storey with a rise satisfies spec 32's invariants**: closed, genus as the roster says, no surviving
    Internal face, no Unclassified Edge. A rise that produces a Cheek is a defect to enrol by the project's
    enrolment rule, never to tolerate silently.
21. **Gates, each convicted by mutation**: dropping the canonicalisation of decision 9 fails a test; reverting
    decision 3 to whole-wall winners fails a test; removing decision 10's corner rule fails a test **on a fixture
    with unequal pitches** (added 2026-11-12: at equal pitch decision 9 alone gives the same shell, journal F65);
    widening a rise to the whole wall yields the whole-wall gable's shell.
22. **The first work package is measurement, before any production code.** It moves the F60 probe into
    `apps/building-shell/experiments/` and sweeps the cases F60 did not reach, listed below. It stops and reports
    if any class is not clean.

## Unmeasured, and owed by decision 22

**Measured 2026-11-12 by WP-G1**: see [the gable rise findings](./building-shell-gable-rise-findings.md) and journal
F65 to F69. The list below is kept as the sweep's original scope.

- A rise on a non-convex footprint, where the prism passes over a reflex corner or another wing.
- A rise that ends at a reflex corner.
- Decision 10's corner rule with unequal pitches.
- Two rises on one wall, adjacent and apart. Two rises on adjacent walls that cross near a corner.
- A rise on a courtyard wall, and on a wall the courtyard cut is spliced through.
- A rise beneath a flush upper wall and beneath a set-back upper storey (decision 12).
- A rise capped by an overhanging storey's floor, and by its own `maxHeight`: the flat top's face tag and its Edge
  kinds (decision 12).
- A rise taller than the main ridge, and one tall enough to be truncated at its own wall (decision 11).
- Which wall is "the far side" on a footprint that is not a rectangle, where the existing piece rule's far wall may
  not be the slope a person would name.
- Pitches near the wire limits of 7° and 75°.

## Rejected

- **Collinear edges with different forms inside the roof solve.** Core refuses the weight change by design, and
  equal pitches give algorithm B's slab with two Cheeks (F58, F59). It would also mean editing the pinned
  `src/roof/` copy.
- **A free-standing dormer solid with its own tagging.** It is decision 8 with the tagging written twice.
- **The narrow step-out.** Ruled unsatisfactory by the user (2026-11-12).
