---
title: "Task 239 — Recursive segment subdivision and its demo page"
type: debrief
spec: ../recursive-segment-subdivision-decisions.md
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

## Build & Test Results

- `pnpm --filter @proc-geo/core test`: **63 suites, 2727 tests, all passing** (baseline in the spec
  was 62 / 2679; this task adds one suite and 48 tests).
- Mutation-checked the new suite rather than red-on-stub, and report it as such: cutting the depth
  to half the maximum offset breaks the tiling assertions on every fixture; shifting the leaf-level
  condition by one breaks 40 of 48; replacing the incomplete-solve branch with a throw breaks the
  sibling-continuation test. The suite is not vacuous.
- `pnpm build` and `pnpm lint`: pending, see the closing section.

## Open Questions / Risks

- **No navigation entry.** `apps/demo/src/app/AppShellLayout.tsx` holds the `NavLink` list and is
  outside my declared file ownership, so `/recursive` is reachable by URL but not from the navbar.
  Flagged, not fixed.
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
