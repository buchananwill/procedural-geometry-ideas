---
title: "Skeleton: grid draw uniform-1-129 ends on a ring of two straight bisectors the pair handler cannot close"
type: issue
area: straight-skeleton
status: open
date: 2026-11-15
part_of: [ISSUE-skeleton-straight-bisector-between-collinear-walls.md]
---

# Skeleton: grid draw uniform-1-129 ends on a ring of two straight bisectors the pair handler cannot close

Found by the two-courtyard grid fuzz of BSA.F111 to F113, and recorded by the build of
[the flat-ring and third-front spec](./skeleton-flat-ring-and-third-front-decisions.md) (§6 item 8, BSA.D266). **The
solver fails a step on this input and leaves two interior edges unresolved, before that spec's rules and after them;
neither rule fires on it.** It is one form, K3, of the defect family recorded in
[the umbrella note on a straight bisector between collinear walls](./ISSUE-skeleton-straight-bisector-between-collinear-walls.md),
which holds the mechanisms and the other reproducers.

The red test is `red by design: grid draw uniform-1-129, a ring of two straight bisectors` in
[holed-grid-fuzz.test.ts](../../apps/building-shell/tests/holed-grid-fuzz.test.ts). It asserts a complete solve and a
sound roof: the roof checker clean, the L-infinity oracle `250 + tan 30° · d∞` within the shell tolerance over a 10 cm
grid, and the shell invariants at genus 2. It is red by design until a cure lands.

## The input

Draw 129 of grid 1, seed 1, of the fuzz's draw law (the test ports it, mulberry32). One storey, every Ring hipped at
30°, in cm. The island is the block `[0, 900] × [0, 1300]` with a wing `[900, 1100] × [200, 500]` on its E side, round
two holes, `[100, 600] × [200, 500]` and `[350, 600] × [650, 750]`. The outline's two walls on `x = 900`, from
`(900, 1300)` to `(900, 500)` and from `(900, 200)` to `(900, 0)`, lie on one line and face the same way, west, with the
wing between them.

## What happens

The solve runs to its last step, a ring of two bisectors: `e44`, between the S wall on `x = 900` and the N one, sourced
at `(750, 350)`, and `e49`, between the same two walls the other way round, sourced at `(750, 575)`, in cm. Both are
straight vertices: their two walls are collinear and face the same way, so each moves west at the walls' speed, and
the two do not meet. The pair handler finds no collision between them and the step throws "Unable to generate any
collision from last two edges". The result is `complete: false` with `step-failure` and `unresolved-edges`.

This is K3 of the umbrella note: a ring of two straight bisectors with mirrored parents travelling the same way, the
form of that note's fuzz seed 10. Here it is reached from a holed solve whose steps of several rings all resolve; the
failure is in a one-ring step, which neither rule of the flat-ring and third-front spec touches (its decision 1).

## What is not established

The true skeleton near `(750, 350)` to `(750, 575)` has not been derived here, nor whether the two bisectors should
have been born at all: the umbrella note's cures (testing a straight vertex for a strike, or closing such a ring at the
layer that leaves it) are the candidates, and both change one-ring steps, which are the user's to rule on (BSA.D301).
How often the form arises: 1 of 2,000 draws of grid 1, 0 of 1,000 of grid 2.
