---
title: "A straight skeleton for footprints with holes"
type: design-vision
area: straight-skeleton
status: active
date: 2026-11-14
---

# A straight skeleton for footprints with holes

Written by the arc lead from the user's rulings in the building-shell arc (BSA.D280, BSA.D281, BSA.D282, BSA.D284).
The user approved it, and ruled it `active`, on 2026-11-14 (BSA.D286).

## What we want

A building that wraps a courtyard is an ordinary building. Its roof should follow from its walls and their pitches
alone, exactly as the roof of a plain rectangle does, and it should be the same roof however the footprint was drawn.

Today it is not. The skeleton takes one closed outline, so a footprint with a courtyard is first slit open along one
of its walls and solved as a single outline that doubles back on itself. The slit is a choice the geometry does not
contain. Which wall is cut decides what the roof looks like near it; some footprints have no wall that may be cut and
do not roof at all; and every rule added to pick a better cut has moved the failure somewhere else (BSA.F89, BSA.F90).

The skeleton of a region with holes is as well defined as the skeleton of a region without them. The walls of the
courtyard send their fronts into the building just as the outer walls do, and where two fronts meet a ridge forms. The
solver should take the region as it is: one outline, any number of holes in it, a pitch on every wall.

## Why here, in the solver

Every workaround outside the solver has to guess at something the solver would simply compute. Putting holes in the
solver removes the cut, the rules that qualify a cut, and the class of roof that depends on them, in one move. It also
gives every other consumer of the skeleton the same ability for nothing.

## What it must feel like

- A courtyard roofs with a ridge that runs all the way round it, with no seam and no preferred wall.
- Moving the courtyard, adding a wing beside it, or adding a second courtyard changes the roof smoothly and never
  turns a building that roofed into an error.
- A footprint with no hole solves exactly as it does today.
- A holed footprint can be looked at in the dashboard like any other fixture, because looking is how defects in this
  system have been found.

## What it is not

The TypeScript solver is the frontier. The C++ port follows when the shape of the answer is settled, and is not part
of this vision. Subdividing a holed footprint into lots is a separate question, since the skeleton of a holed region
is not a tree.
