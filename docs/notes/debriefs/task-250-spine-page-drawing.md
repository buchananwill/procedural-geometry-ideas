# Debrief 0002 — Spine extraction: the page

## Task Summary

Phase 2 of task 250 (`docs/notes/spine-extraction-decisions.md`): put the three spine definitions on
the `/recursive` page — selected per level, drawn over the existing rendering, and reported with
their component count and their share of the skeleton. Phase 1 (the core module) is debrief 0001.

## Changes Made

- **`packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts`** — `spineStrategies` state, one
  entry per level the driver can run; `setSpineStrategy`; `clampSpineFraction`, `spineFractionOf`,
  `withSpineKind`, `withSpineFraction`; `regionSpine` (one region's tree, spine, tree length and node
  positions); `SpineLevelSummary` and `summariseSpines`.
- **`packages/dashboard/src/components/recursive-readout-text.ts`** — `spineStrategyLabel` and
  `spineLine`, the sentences that carry decisions 11 and 12.
- **`packages/dashboard/src/components/RecursiveLevelRow.tsx`** — the per-level spine control: a
  three-way segmented control, and a threshold slider shown ONLY for the two definitions that have
  one.
- **`packages/dashboard/src/components/RecursiveLevelReadout.tsx`** — the spine line, in pink where
  a spine came apart.
- **`packages/dashboard/src/components/RecursiveControlsPanel.tsx`** — computes the spine summaries
  and hands one to each level's readout.
- **`packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts`** — `SPINE_COLOUR`,
  `SPINE_WIDTH_MULTIPLIER`, `spineEdges`, an optional `spineStrategies` scene option, and a spine
  group per level drawn over that level's layers.
- **`packages/dashboard/tests/fixtures/recursive-trees.ts`** — `LOBED_TREE` and
  `LOBED_SPLIT_STRATEGY`: a one-node tree over the isthmus region, at the measured fraction where
  its spine splits.
- **`packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts`** — +18 tests.
- **`packages/dashboard/tests/components/recursive-readout-text.test.ts`** — +7 tests.
- **`packages/dashboard/tests/scene/recursiveSubdivisionToScene.test.ts`** — +9 tests.

## Design Decisions

- **Strategy is per level (decision 8)**, held in the dashboard store rather than added to core's
  `LevelSpec`. `recursive-subdivision.ts` is outside this task's file ownership, and a spine is not
  an input to the subdivision — it is read off the result — so nothing about the driver needs it.
  The array is `MAX_RECURSION_LEVELS` long for the same reason `levelVisibility` is: a level removed
  and added back keeps its setting.
- **The slider appears only for the parameterised definitions (decision 9).** `diameter` gets a
  description and no control at all.
- **A threshold carries across a change of definition** rather than snapping to a default, because
  comparing two definitions at one setting is the use the control exists for. Only a switch out of
  `diameter`, which has no threshold to carry, falls back to a default.
- **Defaults put all three definitions on screen at once** (level 0 `diameter`, level 1
  `wavefront-time` at 0.5, level 2 `whisker-prune` at 0.15), following the existing "deliberately
  unlike each other" precedent in `DEFAULT_RECURSIVE_LEVELS`. A reader who changes nothing has
  already been shown the comparison the task exists to enable.
- **The spine reads as emphasis on two channels (decision 10)**: a violet that no other layer on the
  page uses, and 2.2× the level's own skeleton width — the weight being the half that survives the
  greyscale screenshot this page is usually read in. It is drawn over its level's groups, because a
  selection drawn under the layer it selects from is covered by it.
- **A disconnected spine is drawn disconnected (decision 11)**: one primitive per retained arc and
  nothing between them, so the gap is visible; and the readout says so in words and turns pink.
- **`regionSpine` returns `undefined` only for a region with NO EXTRACTABLE SPINE** — one that did
  not subdivide, whose solve did not complete, or whose skeleton is not a tree under a definition
  that needs the longest path. An empty spine and a severed spine are answers, not absences, and are
  reported as such. The only `catch` is around `solveSkeleton`; core's decision-7 assertion is
  deliberately left to propagate rather than being swallowed as "unavailable".
- **Length is reported as a fraction of the tree's total edge length (decision 12)**, with the
  denominator measured on the same region as the numerator.

## Scope Boundary — one line the picture still needs

**The canvas is not in this task's file ownership.** `RecursiveSceneOptions.spineStrategies` is
therefore OPTIONAL, and `RecursiveSubdivisionCanvas.tsx` — the only call site of
`recursiveTreeToScene`, and outside my scope — has not been changed. As committed:

- the store, the controls, the readout and the adapter are complete and tested;
- the panel's numbers respond to the per-level strategy immediately;
- **but the canvas passes no `spineStrategies`, so no spine layer is drawn on the page yet.**

The change needed is three lines in `packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx`,
exactly mirroring what that file already does for `showLeafFills`:

```tsx
const spineStrategies = useRecursiveSubdivisionStore((s) => s.spineStrategies);
const scene = useMemo(
    () => recursiveTreeToScene(tree, { levelVisibility, showLeafFills, spineStrategies }),
    [tree, levelVisibility, showLeafFills, spineStrategies],
);
```

I did not make it, and did not force a compile error that would have licensed making it under the
build-error exception. Scope extension or a follow-up task is needed to finish decision 10 on
screen; the adapter behaviour it depends on is implemented and covered by nine tests.

## Build & Test Results

The acceptance gate of decision 16, in the order it requires:

| step | result |
|---|---|
| `pnpm --filter @proc-geo/core test` (run 1) | **68 suites, 3464 tests, 0 failures** |
| `pnpm --filter @proc-geo/core test` (run 2) | **68 suites, 3464 tests, 0 failures** |
| intersection of the two failure sets | **empty** |
| `pnpm build` | **success** (core, test-fixtures, dashboard, demo — Next.js typecheck included) |
| `pnpm --filter @proc-geo/dashboard test` (run 1) | **14 suites, 255 tests, 0 failures** |
| `pnpm --filter @proc-geo/dashboard test` (run 2) | **14 suites, 255 tests, 0 failures** |

Against the baselines the spec quotes: core 67 → 68 suites and 3451 → 3464 tests; dashboard 14 → 14
suites and 219 → 255 tests.

`pnpm lint` fails on `apps/demo/src/app/dol-system/page.tsx:51` (`@typescript-eslint/no-explicit-any`).
**Pre-existing**: verified by stashing every change in this task and re-running, which fails
identically. That file is outside this task's scope and was not touched.

## Open Questions / Risks

- The canvas wiring above is the one gap between what is implemented and what decision 10 asks the
  page to show. It is flagged rather than fixed, on scope grounds.
- Each level's readout re-solves every region at that level to extract its spines, and the scene
  adapter does the same for the arcs it draws — so the page now solves each region three times per
  render (skeleton layer, spine layer, readout). It is memoised per tree and per strategy array, and
  it is the precedent the skeleton layer already set, but a single per-node solve cache is the
  obvious optimisation if the page ever feels slow on a large fixture.
- `LOBED_SPLIT_STRATEGY`'s 0.55 is a measured, narrow band. Core's suite pairs it with a broad-band
  fixture; the dashboard suite uses only the isthmus, since it needs a region whose spine is severed
  and a control that says the same region is whole under `diameter`.

## Suggested Follow-ups

- Wire `spineStrategies` through `RecursiveSubdivisionCanvas` (above).
- A per-node solve cache shared by the adapter and the readout.
- Nothing here retargets frontage or egress, per §3 of the spec; that belongs with leaf slicing.
