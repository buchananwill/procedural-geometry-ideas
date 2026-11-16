---
title: "Task 239 — Recursive segment subdivision and its demo page"
type: workflow
area: subdivision
status: archived
date: 2026-08-16
# spec: ../recursive-segment-subdivision-decisions.md
---

# Task 239 debrief

## Task Summary

Implement the recursive segment subdivision driver specified in
`docs/notes/recursive-segment-subdivision-decisions.md` (decisions 1–17), and the `/recursive` demo
page that draws its output on first paint. The deliverable is a picture: a page that loads with a
recursive subdivision already drawn, levels visually distinguished, failed cells marked, counts
reported.

## Phased plan (recovery baseline)

The spec's implementer brief asks for a committed plan file. My task's declared file ownership is
eight named files and does not include `docs/notes/`, so the plan is recorded **here**, in the
debrief, rather than written as a separate document outside my scope. The phases:

1. **Core driver** — `packages/core/src/straight-skeleton/recursive-subdivision.ts` plus its barrel
   export and its Jest suite. Decisions 1–7, 14–16.
2. **Dashboard** — `useRecursiveSubdivisionStore`, `RecursiveSubdivisionCanvas`,
   `RecursiveControlsPanel`, barrel export. Decisions 10–13.
3. **Page** — `apps/demo/src/app/recursive/page.tsx`, modelled on `/parcels`. Decisions 8–9, 13.
4. **Gate** — full Jest suite twice, `pnpm build` across all four packages, `pnpm lint`.

## Changes Made

| File | Action | What changed |
|---|---|---|
| `packages/core/src/straight-skeleton/recursive-subdivision.ts` | created | The driver: `subdivideRecursively`, `RecursiveNode`, `RecursiveOptions`, `makeMergeGroupPredicate`, the two clamps, and the level bounds. |
| `packages/core/src/index.ts` | modified | Barrel export of the above. |
| `packages/core/tests/straight-skeleton/recursive-subdivision.test.ts` | created | 48 tests: grouping, clamping, recursion identity, failure-as-data, a per-fixture sweep at levels 1–3 (structure + tiling identity), and the failure census. |
| `packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts` | created | Fixture, `levels`, `mergeGroupSize`, per-level visibility. |
| `packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx` | created | Tree → scene adapter + `SceneCanvas`. |
| `packages/dashboard/src/components/RecursiveControlsPanel.tsx` | created | Fixture picker, levels, merge group size, per-level toggles. |
| `packages/dashboard/src/index.ts` | modified | Barrel exports for the three new dashboard modules. |
| `apps/demo/src/app/recursive/page.tsx` | created | The `/recursive` route. |

## Design Decisions

- **Full depth is `computeMaxOffset(result)` exactly** (decision 1). At that depth
  `computeOffsetRings` returns `[]` and the segments alone tile the region, so the per-node tiling
  identity is `Σ segment area = region area` with no ring term — which is the form decision 15 asks
  for.
- **Merging is a group-index predicate** (decision 2): `floor(a / size) === floor(b / size)`, handed
  to `computeStrips` as `sameLogicalStreet`. `computeStrips` asks once per adjacent pair including
  the wrap, so the wrap pair naturally answers false and the last group is a short one. No polygon
  union exists anywhere in this task.
- **`SameLogicalStreetPredicate` is derived, not restated**: `NonNullable<StripOptions['sameLogicalStreet']>`,
  so the driver cannot drift from `computeStrips`' own signature.
- **A node's `boundary` is its input forced clockwise** — the codebase's winding convention, and the
  same array the parent's segment carried (strips are already clockwise, so the forcing is the
  identity in the recursive case). This keeps `child.boundary === parent.segments[i].boundary`
  literally true, which is decision 3 stated as a test.
- **Degeneracy is checked before solving** (decision 5): `solveSkeleton` throws below three vertices,
  so the check has to come first; a zero-area region is rejected the same way. Both are reported as
  ordinary node failures, because to a caller they are the same event — this cell was not
  subdivided.
- **Failure strings carry a recognisable prefix** — `Degenerate region:`, `Incomplete solve:`,
  `Subdivision threw:` — so the census can classify them and the page can show them verbatim.
- **Clamps guard non-finite input.** `clampLevels(NaN)` is 1 rather than NaN, because
  `Math.max(1, NaN)` is NaN and a NaN level count would silently produce a one-node tree with no
  explanation.

## Measurement: the failure census (decision 14)

Reported rather than excluded, over all 37 `ALL_TEST_POLYGONS` at 3 levels and merge groups 1–4:

- **Merge groups 1 and 2 produce no failures at all** — at levels 3, every segment of every fixture
  re-solves completely and tiles. This is the first evidence that solver output is admissible solver
  input, and it is a stronger result than the spec anticipated.
- **Merge group 3** — `Rectangle` fails one level-1 child, and `Pentagon House` fails two level-2
  children. Every failure is `Incomplete solve: step-failure: Partition sorting failure: …`.
- **Merge group 4** — `Pentagon House` fails one level-2 child, same diagnostic.

So the only failure mode observed is the solver's *partition sorting* step failing on a merged
segment — never a `computeStrips` throw, and never decision 5's degenerate segment. The census is
printed by the suite rather than pinned as an expectation: it measures the solver, and pinning it
would turn a future solver improvement into a test failure.

Decision 16's escape hatch was measured and **not** needed: the whole of `ALL_TEST_POLYGONS` at
levels 1, 2 and 3 sweeps in about 1.5 s, and the four-group census in 2.7 s, because the regions
handed back down are small and the cubic cost is paid on ever-fewer vertices. Nothing was excluded.

`Rectangle` at `mergeGroupSize: 3` is used as the pinned demonstration of decision 6: one child
fails, its sibling still subdivides.

## The page (decisions 8–13)

- **Modelled on `/parcels`** — the same `AlgorithmPageLayout`, the same `SceneCanvas` with its wheel
  zoom and Alt/middle-drag pan, the same collapsible `Paper` panel idiom and instructions block. The
  canvas is loaded through `next/dynamic` with `ssr: false`, as every Konva canvas in this app is.
- **First paint draws a subdivision.** The store's defaults are `Duck Octagon (passes)` at two levels
  with a merge group of two — four segments becoming fifteen — and the canvas fits the polygon to the
  viewport on its first resize. Without the fit the page would open on empty canvas, because the
  fixtures sit two to five hundred units from the origin; the fit is keyed on the bounds and viewport
  numbers, so re-solving at a new level count leaves a pan or zoom the user has since made alone.
- **Levels survive greyscale** (decision 10). Two channels, both monotone in level: segment
  boundaries run a pure grey ramp (`#ffffff` → `#adb5bd` → `#6c757d`) at 2.6 → 1.6 → 1.0 stroke
  width, and each level's skeleton arcs run a warm ramp (`#ffd43b` → `#e8880c` → `#a04a06`) at
  3.4 → 2.0 → 1.2, root heaviest. Levels are drawn root-first so a deeper level's thin strokes land
  on top of the heavy ones they subdivide, and the input polygon is drawn last in blue.
- **Failed cells are reserved-colour** (decision 11): filled at 0.28 opacity and dash-outlined in
  `#e64980`, plus an `unsolved` label at the centroid. Nothing else on the page uses that colour, and
  the fill is what makes a failure read as a hole rather than a gap.
- **Skeleton arcs are recovered by re-solving.** `RecursiveNode`'s specified shape carries segments
  but not the solve, so the canvas asks `solveSkeleton` the same deterministic question again for
  drawing. The alternative was adding a graph field the spec's type roster does not have; keeping the
  roster exact was judged worth one repeated solve per node, on a canvas that already re-solves on
  every parameter change.
- **Counts** (decision 13) are text in the controls panel: per level, segments / regions / failures,
  next to that level's visibility switch and colour swatch; then totals for segments, leaf cells and
  failures, with the distinct failure reasons spelled out verbatim underneath.

## Build & Test Results

- `pnpm --filter @proc-geo/core test`, run twice (decision 17): **63 suites, 2727 tests, all passing
  both times** — the intersection of the two failure sets is empty. Baseline in the spec was 62 /
  2679; this task adds one suite and 48 tests.
- Mutation-checked the new suite rather than red-on-stub, and report it as such: cutting the depth
  to half the maximum offset breaks the tiling assertions on every fixture; shifting the leaf-level
  condition by one breaks 40 of 48; replacing the incomplete-solve branch with a throw breaks the
  sibling-continuation test. The suite is not vacuous.
- `pnpm build`: **green across all four packages**, and `/recursive` appears in the Next.js route
  table as a static route.
- `pnpm lint`: two problems, **both pre-existing and both outside this task's files** — an unused
  `openNavbar` warning in `AppShellLayout.tsx` and an `any` error in `dol-system/page.tsx`. Verified
  by stashing this task's changes and re-running: identical output. Nothing in the eight files this
  task owns is flagged.
- The built `/recursive` route was served and fetched (HTTP 200), and the scene adapter was exercised
  against the built packages outside React: the default fixture yields groups of 17 and 55 primitives
  plus the input outline, the fit transform centres the polygon, hiding level 0 sets exactly that
  group's `visible` to false, and `Rectangle` at a merge group of three renders its failed child in
  the reserved colour with the `unsolved` label while its sibling subdivides. No headless browser is
  available in the container, so the picture itself has not been screenshotted.

## Open Questions / Risks

- **No navigation entry.** `apps/demo/src/app/AppShellLayout.tsx` holds the `NavLink` list and is
  outside my declared file ownership, so `/recursive` is reachable by URL but not from the navbar.
  Flagged, not fixed.
- **The picture has not been seen.** There is no headless browser in the container, so the page is
  verified by build, by an HTTP 200 on the built route, and by exercising the scene adapter directly
  against the built packages — not by looking at it. A human should open `/recursive` once.
- **`mergeGroupSize >= edge count`** makes every pair of edges the same street, so `computeStrips`
  emits a single segment equal to the region and the child is the parent again. It terminates (the
  level clamp bounds it) and it is honest, but it is a picture of nothing happening. The UI clamps
  the control to a small range to keep it out of the way rather than special-casing it in the driver.

## Suggested Follow-ups

- Add `/recursive` to the navbar when a task owns `AppShellLayout.tsx`.
- The partition-sorting failure on merged rectangle/pentagon segments is a concrete, minimal
  reproduction for the solver hardening backlog.
- Merge heuristics beyond a fixed group size (area targets, the partition DP) are deferred by the
  spec and are the obvious next step now that the driver exists.
