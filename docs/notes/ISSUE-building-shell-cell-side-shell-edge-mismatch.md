---
title: "Building Shell: A Cell Side Reads a ShellEdge Its Neighbour Does Not"
type: issue
area: building-shell
status: open
date: 2026-11-14
---

# A Cell side reads a ShellEdge its neighbour does not

Cell laying refuses a shell where two Cell sides join the same pair of vertices and only one of them lies on a
ShellEdge of its face. This is the class the arc has called the Court25 class (BSA.F74, BSA.F84). Seven split-band
courtyards throw it since journal decision 264 removed the two-pitch sub-rule (BSA.D264, BSA.F84). Before that removal
five of them built clean, and two threw [the other Cell-laying class](./ISSUE-building-shell-two-cells-same-way-along-net-edge.md).

By the user's ruling BSA.D266, these cases are not pinned. Each has a test on the default run that asserts it builds,
and each of those tests is red until the cause is fixed.

## What throws

`assembleNetEdges` in [cells.ts](../../apps/building-shell/src/cells.ts) throws:

```
cell <id>: side <a>-<b> (<x>, <y>, <z>) to (<x>, <y>, <z>) reads ShellEdge <n>, its NetEdge <m>
```

The text needs care. `<n>` is the ShellEdge the current Cell's side lies on, or -1 for none. `<m>` is **not a NetEdge
id**: it is the ShellEdge of the NetEdge an earlier Cell already made on the same pair of vertices, or -1 for none. The
code allows two NetEdges on one pair of vertices only when they lie on two coincident ShellEdges (journal decision
110, C1). Here one side lies on a ShellEdge and the other lies on none, so the throw follows.

## The fixtures and their red tests

Every test is in [robustness.test.ts](../../apps/building-shell/tests/robustness.test.ts), in the `describe` block
`ISSUE-building-shell-cell-side-shell-edge-mismatch.md: red until a Cell side and its neighbour read the same ShellEdge`.
Each test is named `split-band courtyard <key> builds`. Every error text below was measured on the WP-C1 tree.

| Pin key | Red test | Error text |
|---|---|---|
| `s6h250/SplitCourt8` | `split-band courtyard s6h250/SplitCourt8 builds` | `cell 980: side 391-27 (450, 550, 550) to (450, 550, 500) reads ShellEdge 79, its NetEdge -1` |
| `s6h263/SplitCourt8` | `split-band courtyard s6h263/SplitCourt8 builds` | `cell 1169: side 425-27 (450, 550, 550) to (450, 550, 526) reads ShellEdge 79, its NetEdge -1` |
| `s6h300/SplitCourt8` | `split-band courtyard s6h300/SplitCourt8 builds` | `cell 1166: side 415-27 (450, 550, 650) to (450, 550, 600) reads ShellEdge 79, its NetEdge -1` |
| `s12h250/SplitCourt20` | `split-band courtyard s12h250/SplitCourt20 builds` | `cell 1428: side 553-24 (750, 750, 550) to (750, 750, 500) reads ShellEdge 79, its NetEdge -1` |
| `s12h300/SplitCourt20` | `split-band courtyard s12h300/SplitCourt20 builds` | `cell 1679: side 577-24 (750, 750, 650) to (750, 750, 600) reads ShellEdge 79, its NetEdge -1` |
| `s13h263/SplitCourt38` | `split-band courtyard s13h263/SplitCourt38 builds` | `cell 1188: side 456-27 (450, 600, 550) to (450, 600, 526) reads ShellEdge 79, its NetEdge -1` |
| `s13h300/SplitCourt11` | `split-band courtyard s13h300/SplitCourt11 builds` | `cell 1651: side 19-554 (400, 650, 600) to (400, 650, 650) reads ShellEdge 80, its NetEdge -1` |

A pin key `s<seed>h<height>/<name>` names a fixture of `randomSplitCourtyardFixtures(seed, 40, height)` in
[robustness-fixtures.ts](../../apps/building-shell/tests/robustness-fixtures.ts). The seeds are on the opt-in range
(`SHELL_COURT_SEEDS`), so the red tests build each case by name.

`s6h263/SplitCourt8` and `s6h300/SplitCourt8` threw the other class before decision 264, at
`vertex 310 at (104.8515625, 550, 650)` and `vertex 310 at (123.267578125, 550, 700)`. They were never recorded.

## What is known

- **The trigger.** Each of the seven has a line claimed gable at two pitches. Since decision 264 that line is built as
  two rises, one per pitch, where the sub-rule built algorithm B's one gable. With the sub-rule in place, five of the
  seven built clean (BSA.F84, measured by the WP-C1 delegate, not re-run here).
- **Where the throw lies.** In every case the side is vertical and lies on the line of the two-pitch split. It runs
  from the top plate of the two-storey Rings (500, 526 or 600 cm) to the next 50 cm lattice line. It stands at the end
  of a three-storey Ring's wall on that line: x = 450 on y = 550 (SplitCourt8), x = 750 on y = 750 (SplitCourt20),
  x = 450 on y = 600 (SplitCourt38) and x = 400 on y = 650 (SplitCourt11). It is not at the point where the two pitches
  meet, which is x = 350, 450, 400 and 600 in those four fixtures. This is read off the fixtures and the error texts,
  and no case has been reduced.
- **One example, located** (BSA.F84): `s6h250/SplitCourt8` builds rises [0, 350] at 52.5° and [350, 600] at 45° on
  y = 550, and throws at x = 450 under the three-storey Ring `[450, 250, 600, 550]`.
- **Other members of the class.** `s1h263/Court25` threw this text until WP-L2 cured it (BSA.F74, BSA.F81, BSA.D246). One of
  eight random ten-Ring layouts in the editor threw a Cell/ShellEdge mismatch (BSA.F64), unexamined. On the opt-in
  range, `s12h250/Court16` and `s12h300/Court16` throw the mirror form, `reads ShellEdge -1, its NetEdge 33`, with and
  without the sub-rule. They are not pinned and have no red test. Measured on the WP-C1 tree, and outside WP-C1's 9.

## What is not known

- Which two faces the two Cells belong to, and why one face's edge list holds the ShellEdge and the other's does not.
- Whether the fault is in the rise geometry, in the union's split of the shell's edges, or in Cell laying's reading
  of them.
- Whether the mirror form in `s12/Court16` has the same cause.
- Whether a smaller input reproduces it. No reproducer exists.

## Remedy

**No fix is queued for this class by name.** The arc's next fix is Cell laying (session 3 §4 item 1 in the
[session 3 journal](./building-shell-arc-journal-03.md), BSA.D267). That item names
[the other class](./ISSUE-building-shell-two-cells-same-way-along-net-edge.md), `s13/Court21`'s
`two Cells run the same way along one NetEdge`. This throw is raised in the same stage of
[cells.ts](../../apps/building-shell/src/cells.ts), but nothing yet shows that the fix for the other class reaches it.

This issue is resolved when every red test listed above builds. Production code does not guard or catch the throw.
