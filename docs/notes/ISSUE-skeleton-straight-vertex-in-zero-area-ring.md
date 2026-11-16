---
title: "Skeleton: a straight vertex between collinear hole walls is left in a ring of zero area"
type: issue
area: straight-skeleton
status: resolved
date: 2026-11-15
verified_by:
  - packages/core/tests/straight-skeleton/holed-flat-and-third-front.test.ts
  - apps/building-shell/tests/holed-fixtures.test.ts
---

# Skeleton: a straight vertex between collinear hole walls is left in a ring of zero area

**RESOLVED 2026-11-16 for steps of several rings** by the build of
[the flat-ring and third-front spec](./skeleton-flat-ring-and-third-front-decisions.md) (BSA.D348; built `8e14378` to
`add41b8`, revised at `ad8b323`, BSA.D354). The first cure below is the one built, generalised: a ring a multi-ring
layer leaves that is flat by a positive test is a finished piece of skeleton and is closed in its step. `2h-int-1` is
sound with its node at `(5.5, 10)`, and `2h-int-86`, `2h-int-144` and `2h-int-371` are sound, in
`holed-flat-and-third-front.test.ts` (`flat-ring termination: the issue note's fuzz cases (decision 50)`); the five
layouts below are holed fixtures, each sound by the roof checker and the L∞ oracle in
`apps/building-shell/tests/holed-fixtures.test.ts`. Both files are green. The single-loop forms of the family stay
with [the umbrella note on collinear walls](./ISSUE-skeleton-straight-bisector-between-collinear-walls.md), and a flat
ring of a one-ring step is that spec's Deferred item. The text below is the record of the defect as it stood.

Found by the courtyard fuzz run during the work on
[the simultaneous-rings spec](./skeleton-simultaneous-rings-decisions.md) (roadmap node 5). Before that unit, the
input was refused at its root as `simultaneous-across-rings`. Now it passes its root and fails one step later. **Nothing
in the solver has been changed for it.** It is one form of the defect family recorded in
[the umbrella note on a straight bisector between collinear walls](./ISSUE-skeleton-straight-bisector-between-collinear-walls.md),
which holds the mechanisms, the single-loop reproducers and the measured rates (BSA.F103, BSA.D314).

The red test is `red by design: two holes with collinear walls`, case `2h-int-1`, in
[holed-simultaneous-rings.test.ts](../../packages/core/tests/straight-skeleton/holed-simultaneous-rings.test.ts). It
asserts join-and-divide decision 42's battery and a node at `(5.5, 10)`. It is red by design (BSA.D266) until a cure
lands.

## The input

The outline is `[0, 9] × [0, 11]`, clockwise. The holes are `[6, 7] × [8, 9]` and `[3, 5] × [8, 9]`, counter-clockwise.
The two holes' tops lie on one line, `y = 9`, 1 apart.

## What happens

1. **At `t = 0.5` the gap between the holes closes.** The corners `(5, 9)` and `(6, 9)` meet head-on at `(5.5, 9.5)`,
   and the corners `(5, 8)` and `(6, 8)` meet at `(5.5, 7.5)`. Both are vertex events across two rings, which node 5
   resolves. The midline `x = 5.5` between them closes as a corridor.
2. **The meeting at `(5.5, 9.5)` also bears `e27`, the bisector between the two collinear hole tops.** It has
   clockwise parent 10 and widdershins parent 6, and it moves straight up at speed 1. It is a *straight* vertex, with
   a turn of zero. This is correct: the two tops are separate walls, and the line `x = 5.5` divides their faces.
3. **At `t = 1` the strip between the hole tops and the outline's top closes along `y = 10`,** from `(2, 10)` to
   `(8, 10)`. Three things happen in the same layer:
   - the outline corner `(9, 11)` meets the hole corner `(7, 9)` at `(8, 10)`;
   - the corner `(3, 9)` strikes the top wall at `(2, 10)`;
   - `e27` reaches the top wall's front at `(5.5, 10)`.

   The true skeleton has a node at `(5.5, 10)` where `e27` ends, with the ridge `y = 10` running through it to `(2, 10)`
   and `(8, 10)`.
4. **`e27` has no event at `t = 1`.** `createCollisions` tests a bisector against exterior edges only when it is reflex
   and primary, and a straight vertex is not reflex. So `e27` survives the layer, and the layer leaves the ring
   `[27, 30, 31]`. That ring holds `e27` at `(5.5, 10)` and the two ridge bisectors born at `(2, 10)` and `(8, 10)`, and
   all three points lie on `y = 10`. `componentsOfRings` reads its area as 0 and refuses it:
   `multi-ring-step-refused: ... ring [27, 30, 31] has area 0 at time 0.125, at or under the 7.5e-7 degenerate-area bar`.
   The solve ends incomplete, and 12 edges are unresolved.

## Why it is not cured here

Two cures are visible, and neither is this unit's to make:

- **A zero-area ring of three left by a multi-ring layer could be its own child,** and the triangle handler could close
  it at `(5.5, 10)`. That amends simultaneous-rings decision 15, which keeps node 4's classification and its refusal
  for every ring of three or more. The amendment is the lead's.
- **A straight vertex could be tested for a strike.** That changes how splits are generated. Split generation is shared
  with every single-loop solve, so the change is the user's (BSA.D301). It is the same restriction that
  [the weighted defect](./ISSUE-skeleton-weighted-edge-runs-backwards-in-time.md) traces to: both split paths require a
  reflex, primary bisector.

## The building-shell specimens

Roadmap node 9 ([the holed roof spec](./building-shell-holed-roof-decisions.md), decisions 41 to 43) hands
`solveSkeleton` each island's outline and holes, and these layouts are refused as `multi-ring-step-refused`. Each is
one storey, every Ring hipped at 30°, Rings as `[x0, y0, x1, y1]` in cm. The first four built clean under the courtyard
cut and are the regression the spec states; in each, a jut's wall lies in line with a courtyard wall, facing the same
way. Each is an entry of `HOLED_REFUSALS` in `apps/building-shell/src/fixture.ts`, whose test in
`tests/holed-roof.test.ts` asserts the hard error naming the island and this kind; the guard is green, and a cure turns
it red.

| Layout | Rings |
|---|---|
| `JutAlignedS` | `[0,0,1000,300]`, `[0,300,300,700]`, `[-250,300,0,500]`, `[0,700,1000,1000]`, `[700,300,1000,700]` |
| `JutAlignedN` (also `JutAlignedS`'s y-mirror) | `[0,0,1000,300]`, `[0,300,300,700]`, `[-250,500,0,700]`, `[0,700,1000,1000]`, `[700,300,1000,700]` |
| `JutBelowWing` (was `JutBelowCutLine`) | `[0,0,1000,300]`, `[-250,100,0,300]`, `[0,300,300,700]`, `[0,700,1000,1000]`, `[700,300,1000,700]` |
| `JutBelowWingMirrorY` | `[0,700,1000,1000]`, `[-250,700,0,900]`, `[0,300,300,700]`, `[0,0,1000,300]`, `[700,300,1000,700]` |
| `TwoCourtyardsDraft` (two holes; the cut refused it too) | `[0,0,1600,300]`, `[0,700,1600,1000]`, `[0,300,300,700]`, `[700,300,900,700]`, `[1300,300,1600,700]` |

`JutAlignedS` is a layout a person would draw: a wing in line with a band (BSA.D321).

## How often, measured

In the courtyard fuzz (axis-aligned rectangles, 400 inputs per row), this was 4 of 400 with two holes at integer
positions, and 0 in every other row. Each case was two holes with a collinear wall and a gap between them closing
before a wider gap to the outline:

| Fuzz case | Outline | Holes |
|---|---|---|
| `2h-int-1` | `[0, 9] × [0, 11]` | `[6, 7] × [8, 9]`, `[3, 5] × [8, 9]` |
| `2h-int-86` | `[0, 19] × [0, 19]` | `[15, 16] × [11, 13]`, `[3, 16] × [14, 15]` |
| `2h-int-144` | `[0, 27] × [0, 10]` | `[18, 19] × [2, 5]`, `[4, 17] × [2, 6]` |
| `2h-int-371` | `[0, 27] × [0, 17]` | `[8, 20] × [3, 14]`, `[22, 23] × [9, 14]` |
