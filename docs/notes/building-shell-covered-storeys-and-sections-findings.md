---
title: "Building Shell: Covered Storeys and Sections Findings"
type: technical-reference
area: building-shell
status: active
date: 2026-11-09
---

# Covered storeys and sections

Measurements taken on 2026-11-09 at `1b415fb`, on the TypeScript prototype only. They follow a defect found in the C++
port: two identical stacked rings get a hidden 45° roof on the covered storey, and it stands above the storey over it.
Nothing here has been adopted. The probes, patches and raw outputs are in
[experiments/covered-storeys-and-sections](../../apps/building-shell/experiments/covered-storeys-and-sections/), which
sits outside `tsconfig`, vitest and the golden set.

## Rulings so far (user, 2026-11-09)

1. A building will be partitioned into sections that solve independently and are stitched together.
2. Sections are **authored explicitly**, because construction history cannot be recovered from geometry.
3. A later section's ridge that stands higher than the older wall it abuts **continues into the older roof slope**.
4. A ridge that fits below the wall runs into the wall, with no extraneous valley.
5. **The TypeScript viewport gains editing first**, so edge cases can be explored directly. Sections wait for that.
6. The C++ takes a short-term fix for the current content in the meantime.

**Raised and not yet ruled:**

- Whether a setback that swallows the upper storey is refused or clamped. The lead's recommendation is to refuse.
- Whether to drop the roof of a wholly covered island (see [The roof drop](#the-roof-drop)).
- Test reporting. The user's rule is that green must never mean failing, and a waived defect is documented. Today's pin
  tests pass while a known defect exists. The proposal: every case asserts clean and reports red; one waiver register
  lists each waived case with cause and journal decision, counted as `waived` and never as passed; a separate audit goes
  red when a waived case no longer matches its entry.

## The claims about the prototype

| Claim | Verdict |
|---|---|
| The prototype refuses a side with no form that wins a wall | True. The reported input gets four refusals (`noneWinnerRefusals`). |
| Its fixtures never contain one | True. `writeInput` always writes a form, and the committed JSON holds no `None` and no empty runs. Only tests build one, by mutating valid input. |
| A wholly covered Ring has no plate runs in the game's net | C++ only. It matches `CellNetDerivation.cpp`; not run. |
| Every storey gets a hip solid | True (`buildStoreyParts`, spec decisions 4 and 5). |
| Ring 0 falls back to 45° | The constant exists (`WIRE_GABLE_ONLY_DEG`), but the prototype refuses first. Only the C++ builds it (MB.D627). |

## When a lower roof breaks through

A union can only add material, so build-then-union needs a precondition: **a lower roof must stay beneath the top of the
storey over it.** Spec decision 4 says the union removes what lies inside the storey above, and says nothing about what
does not. Measured on square plans at 250 cm storeys; L-shapes and courtyards are unmeasured.

| Case | Leaks when | Thresholds, measured either side |
|---|---|---|
| Same plan, same pitch | Never | Clean at 22.5°, 30°, 45° and 60° |
| Same plan, lower roof steeper | Span > 2h / (tan lower − tan upper) | 45° over 22.5°: 853 cm. 45° over 30°: 1183 cm. 30° over 22.5°: 3065 cm |
| Same pitch, centred upper storey set back | Setback > h / tan pitch | 45°: 250 cm. 30°: 433 cm. 22.5°: 604 cm |
| Lower gable under a flush upper hip, same pitch | Half-span × tan pitch > h | 30°, 1000 cm: 38.7 cm above the upper eave |

- **Past the setback threshold the upper storey vanishes**: its wall and roof area both measure 0.
  `NarrowUpperStorey` pins this as "stays buried".
- **The exposed fraction does not matter**, because the whole island is roofed. A 50 cm exposed strip with 45° under
  22.5° still stands 53 cm above the upper ridge.
- **A covered wall's pitch still shapes the visible roof on a partly covered storey.** With a 200 cm strip above the W
  wall, that wall's visible face measures 492,185 cm² at 7°, 103,923 cm² at 30° and 425 cm² at 60°.
- **Treating a covered wall as a gable is not a clean answer.** Its pitch becomes inert, but the ridge stands 38.7 cm
  above the upper eave at 30°.
- **A frame of Rings above** covers every wall top and leaves the plate open. At 45° that builds a pyramid in the well,
  four faces of 75,921 cm² each. The C++ `IsCoveredBy` probes 1 cm inside each wall, so it reads this as covered.

## The church: the fault is the plan merge

A 2000×800 nave with three storeys inset 100 cm per side, gabled at both ends, plus a 400 cm deep ground-storey extension
along its whole length, at 45°.

| Top surface at | Nave alone (correct) | Merged, one solve | Solved separately, then unioned |
|---|---|---|---|
| y = 650, over the nave | 550 | **800** | 550 |
| y = 750, over the nave | 300 | **700** | 300 |
| y = 1000, extension ridge | n/a | 450 | 450 |

The separate solve needed no code change: both sets of storey plans go to the existing `unionPlans`. The result is closed,
genus 0, with no surviving Internal faces, no cheeks and no new conflicts. **The boolean union is sound as the joiner of
finished sections. The per-storey plan merge before the roof solve is what has to go.**

**The stitch is unsolved.** Two independent solves leave a valley at y = 800. Gabling the abutting side does not fix it:
at 45° the section at x = 1000 becomes one slope and x = 25 stays two-sloped. The wire reader refuses Monopitch, so a
lean-to needs a real new form.

## Proposed section model

Not ruled beyond the rulings above.

1. A building is a list of sections, each a group of Rings, ordered oldest first.
2. Each section solves alone, and storey plans never merge across sections.
3. A later section treats earlier ones as fixed, so older work is never altered.
4. A side lying on an earlier section's wall is a party side: no eave, and its ridge runs into that wall.
5. Finished sections join with the existing union.
6. One section per connected plan as the default should leave today's outputs unchanged. Not measured.

**Unknown:** `input@1` has no section field, and how much of the C++ roof solve assumes merged plans has not been checked.

## The roof drop

The candidate rule ([roof-drop.patch](../../apps/building-shell/experiments/covered-storeys-and-sections/roof-drop.patch)):
an island whose plan lies wholly inside the next storey's plan builds its wall prism and no roof parts, and the wire
refusal skips that storey. The test must be plate area per island: wall tops alone pass the frame case, and a Ring has no
roof of its own to drop. The patch's adapter change is simplified and skips only a storey whose every island is covered.

- **The reported input** is accepted and builds correctly: apex 707.11, closed, genus 0, no Internal or Unclassified.
- **The test suite goes from 8,275 passing to 130 failing (2 courtyard, 8 golden, 120 robustness).**
  - 109 are one invariant, "no raw face lies on its cut's plane", which assumes a covered courtyard still has roof parts.
    [A diagnostic patch](../../apps/building-shell/experiments/covered-storeys-and-sections/roof-drop-diagnostic-exemption.patch)
    exempts it to expose what lies beneath. That is not a proposal: if the drop is adopted, the invariant needs its own
    ruling.
  - The other 21: 20 are cured defects (`Court15`, `Court22`, `U8`, `SplitCourt9`) or the manifest entries tied to them;
    `Court34` improves from 4 cheeks to 2 at 250 cm.
- **Goldens:** 192 of 201 byte-identical. The 3 bridge fixtures keep identical geometry and change only in part numbers
  and raw parts. `SplitCourt9Seed7h250` loses 2 Unclassified Edges and 3 conflicts.
- **The cheek objection** (a steep outer roof slamming into a shallower covered island) was not reproduced. The `proud`
  sweep, 1,152 stacks with wide covered roofs: 935 change shape, none gains a cheek, none has a cheek either way.
  The `buried` sweep, 1,728 stacks, shows no difference, and is expected to, since its covered roofs never rise above
  the storey over them. A specific layout from the user is still wanted.
- **The `proud` sweep adds 16 hard errors at Cell laying** ("lies on ShellEdges", "reads ShellEdge -1"), all with a
  22.5° whole-footprint lower roof gabled E and W, and a gabled top storey grown 50 cm. Undiagnosed.

## The C++ short-term fix

At the time of writing it is uncommitted in `claude_work` (`AssignDefaultPitches`, content journal 07, CF70). A formless
side takes its Ring's first Pitched pitch, then its first GableEnd pitch, then the document's first formed side. This was
read, not built or run. It should remove the reported defect, because a covered Ring then matches the pitch above it.

It leaves open: mixed pitches across Rings, since the last fallback takes the first formed side in model order rather than
the covering Ring; the frame case, since `IsCoveredBy` is unchanged; and setbacks.

## Reproduce

From the repo root, with `E` as `apps/building-shell/experiments/covered-storeys-and-sections`:

```bash
node $E/run.mjs formless-walls     # also: partial-cover, nesting-limits, church-sections
```

The `roof-drop-*` probes compare this tree with a patched one. Make a git worktree, run
`git apply $E/roof-drop.patch` and `pnpm install` in it, then:

```bash
node $E/run.mjs roof-drop-endtoend --candidate <worktree>/apps/building-shell
node $E/run.mjs roof-drop-residues --candidate <worktree>/apps/building-shell
node $E/run.mjs roof-drop-sweep --candidate <worktree>/apps/building-shell proud   # or buried
```

Probes write to stdout, except the sweeps, which also write a log to `results/`. Saved outputs are in
[results](../../apps/building-shell/experiments/covered-storeys-and-sections/results/). The suite figures come from running
vitest in a patched copy; `results/roof-drop-failures-after-exemption.txt` lists the 21, and `roof-drop-golden-geometry.txt`
compares the changed goldens.
