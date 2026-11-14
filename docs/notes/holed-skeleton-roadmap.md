---
title: "Holed skeleton: roadmap"
type: roadmap
area: straight-skeleton
status: approved
date: 2026-11-14
part_of: [holed-skeleton-vision.md]
---

# Holed skeleton: roadmap

The route from the single-outline V5 solver to [a skeleton for footprints with holes](./holed-skeleton-vision.md).
It expands the four stages of BSA.D282 with the rulings of BSA.D284. The node order is an estimate; the binding order
is `depends_on` between specs.

## Nodes

1. **Wavefront order.** The order of the wavefront becomes a stored, linked structure and the arithmetic on exterior
   edge ids leaves the event path, with no change to any solve. Spec:
   [skeleton-wavefront-order-decisions.md](./skeleton-wavefront-order-decisions.md).
2. **Input surface and loop table.** The solve takes one outline and any number of holes, each with its own weights.
   Exterior ids run the outline first and then each hole in order, and the graph says where each loop starts and ends.
   The first wavefront is one ring per loop.
3. **The boundary stage for loops.** Winding is set per loop, so that the building lies on the same side of every
   wall. Canonicalisation runs per loop. Loops that cross, a hole outside its outline, a hole inside another hole, and a
   self-crossing holed input are refused, each with a message naming the place. A helper groups any set of closed, simple, non-crossing loops into outline-and-holes
   inputs by nesting depth.
4. **Join and divide.** A strike within one ring divides it; a strike across two rings joins them. When a ring divides
   while other rings share its step, each of those rings goes to the child that contains it. First fixture: a hole set
   off-centre and turned, so that no two events coincide.
5. **Simultaneous events across rings.** The concentric courtyard, where every corner of the hole meets a corner of
   the outline head-on at one moment and every front meets its opposite along a whole line. This node opens with a
   measurement of what the head-on, corridor and coincident-event machinery does with it, before its spec is written.
   Fixtures: the concentric square, an off-centre rectangle with parallel walls, unequal pitches, and the courtyard
   with a wing on both sides (BSA.F90).
6. **Loop-aware consumers and the holed roster.** Offset projection, the solver's causality check and strip
   decomposition read the loop table. A roster of holed fixtures is swept for containment, tiling against the true
   area, clearance, the rate rule and direction. The tree-based consumers (the skeleton tree, the spine, recursive
   subdivision, parcel slicing) refuse a holed input with a clear message.
7. **Holed fixtures in the dashboard.** The fixture loader lists and draws holed fixtures and their skeletons. No
   editing of holes.
8. **Contact between loops.** Loops that share a length of wall are merged into one loop before the solve. Loops that
   share a single point are joined into one loop that visits the point twice. This node opens by measuring whether the
   solver takes a loop with a repeated vertex. Until it lands, contact is refused with a diagnostic.
9. **Building-shell on the holed solve.** It opens with a read-only account of what the roof's piece builder does for
   a holed footprint with no cut walls. Then the roof's skeleton call passes the outline and its holes, the courtyard
   cut and its rules are deleted, the limit of one hole per island goes, and the courtyard goldens are re-exported
   with the diff reported. The pin on the copied roof files is released for the files this touches (BSA.D282).

## Standing rules for every node

- **A footprint with no hole solves as it does today.** Byte-identical graphs are the working test of that. A
  divergence is diagnosed, and is then either fixed or accepted with a written reason; it is never waved through and
  never a reason to stop without diagnosis (BSA.D284).
- **A holed fixture that fails is a red test with an issue note,** never a pinned defect (BSA.D266, BSA.D284).
- **These come back to the user:** evidence that today's solver is wrong on the existing corpus; any tolerance or
  constant that must move; a clean fixture whose answer changes; and a design for node 5 that changes how single-loop
  events resolve.
- **The C++ port is not a consideration** in any node (BSA.D281).
