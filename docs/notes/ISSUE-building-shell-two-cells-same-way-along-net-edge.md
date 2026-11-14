---
title: "Building Shell: Two Cells Run the Same Way Along One NetEdge"
type: issue
area: building-shell
status: open
date: 2026-11-14
---

# Two Cells run the same way along one NetEdge

Cell laying refuses a shell where two Cells meet at a vertex and both leave it by the same NetEdge, or both arrive by
the same NetEdge. This is the class of `s13/Court21` (BSA.D247) and of its reproducer `COVERED_RISE_CELL_CLASH`. Its
pins carry the cause name of the U8 class, `edge contact between opposite coplanar faces`, because their error text
matches U8's. Nobody has shown that the mechanism is the same (BSA.D247).

Two split-band courtyards throw it since journal decision 264 removed the two-pitch sub-rule (BSA.D264, BSA.F84). By
the user's ruling BSA.D266 they are not pinned. Each has a test on the default run that asserts it builds, and each of
those tests is red until the cause is fixed.

## What throws

`vertexRecords` in [cells.ts](../../apps/building-shell/src/cells.ts) throws:

```
vertex <id> at (<x>, <y>, <z>): two Cells run the same way along one NetEdge
```

Every Cell is wound counter-clockwise seen from outside. So around one vertex, each NetEdge should be left by at most
one Cell and arrived at by at most one Cell. The throw means two Cell corners at the vertex share a leaving side or an
arriving side. Then two Cells lie on the same side of that NetEdge with the same winding.

## The fixtures and their red tests

Both tests are in [robustness.test.ts](../../apps/building-shell/tests/robustness.test.ts), in the `describe` block
`ISSUE-building-shell-two-cells-same-way-along-net-edge.md: red until no two Cells run the same way along one NetEdge`.
Each is named `split-band courtyard <key> builds`. Both error texts were measured on the WP-C1 tree.

| Pin key | Red test | Error text |
|---|---|---|
| `s13h250/SplitCourt38` | `split-band courtyard s13h250/SplitCourt38 builds` | `vertex 343 at (500, 600, 538.609375): two Cells run the same way along one NetEdge` |
| `s13h300/SplitCourt38` | `split-band courtyard s13h300/SplitCourt38 builds` | `vertex 359 at (500, 600, 638.609375): two Cells run the same way along one NetEdge` |

A pin key `s<seed>h<height>/<name>` names a fixture of `randomSplitCourtyardFixtures(seed, 40, height)` in
[robustness-fixtures.ts](../../apps/building-shell/tests/robustness-fixtures.ts). Seed 13 is on the opt-in range
(`SHELL_COURT_SEEDS`), so the red tests build each case by name.

## What is known

- **The trigger.** SplitCourt38's line y = 600 is claimed gable at two pitches. Since decision 264 it is built as two
  rises on storeys 0 and 1: [50, 400] at 52.5° and [400, 750] at 30°. With the sub-rule in place it built clean at
  250 and 300 cm (BSA.F84, measured by the WP-C1 delegate, not re-run here).
- **Where the throw lies.** At x = 500 on y = 600, 38.609375 cm above the top plate of the two-storey Rings (500 cm at
  250, 600 cm at 300). That point is inside the 30° rise's band. The same fixture at 263 cm throws
  [the other Cell-laying class](./ISSUE-building-shell-cell-side-shell-edge-mismatch.md) instead.
- **No covered rise is involved.** SplitCourt38 builds no covered rise on any storey at any of the three heights
  (measured on the WP-C1 tree with `storeyForms`). `s13/Court21`'s throw is created by covered rises: its reproducer
  throws with only the covered rises and builds with them removed (BSA.D247). This class is therefore reached by at
  least two routes, or its cause is not the covered rise itself.
- **Other members with the same error text, all pinned before WP-C1 and left as they are.** Whether pins of a throw
  are converted is not ruled (BSA.D266).
  - `s13h250/Court21` and `s13h300/Court21` in `COURTYARD_DEFECTS` in
    [residue-pins.ts](../../apps/building-shell/tests/residue-pins.ts).
  - `s6h263/U8` and `s6h300/U8` in `U_DEFECTS`, the U8 class.
  - `COVERED_RISE_CELL_CLASH` in `COVERED_RISE_REPRODUCERS` in
    [robustness.test.ts](../../apps/building-shell/tests/robustness.test.ts).
- **Unrecorded members on the opt-in range.** `s6h263/Court8`, `s6h300/Court8` and `s12h263/Court16` throw this text,
  with and without the sub-rule. They are not pinned and have no red test. Measured on the WP-C1 tree, and outside
  WP-C1's 9. `s6h263/SplitCourt8` and `s6h300/SplitCourt8` threw it before decision 264, at the same points as
  `s6/U8`, and now throw the other class.

## What is not known

- Which Cells clash at the vertex, and on which faces.
- Whether SplitCourt38, Court21 and U8 share one mechanism. They share only the error text.
- Whether a smaller input reproduces SplitCourt38's throw. `COVERED_RISE_CELL_CLASH` reproduces Court21's, and it
  needs a covered rise, which SplitCourt38 does not build.

## Remedy

**Queued as the arc's next fix: Cell laying** (session 3 §4 item 1 in the
[session 3 journal](./building-shell-arc-journal-03.md), BSA.D267). That item names `s13/Court21` and its reproducer
`COVERED_RISE_CELL_CLASH`. A fix proven on that reproducer alone may not reach SplitCourt38, which throws without a
covered rise, so the fix is complete for this issue only when the red tests listed above build.

Production code does not guard or catch the throw.
