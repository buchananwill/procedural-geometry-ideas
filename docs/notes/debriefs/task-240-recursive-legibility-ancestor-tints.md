---
title: "Task 240 — Recursive page legibility: ancestor-tinted leaf fills"
type: workflow
area: subdivision
status: archived
date: 2026-08-17
# task: 240
# spec: docs/notes/recursive-subdivision-legibility-decisions.md
---

# Task Summary

Make `/recursive` communicate what its numbers already say: a few large territories, each visibly
subdivided, rather than a tangle of strokes. Rendering only — no geometry, no driver, no core code.
Implements decisions 1–9 of `recursive-subdivision-legibility-decisions.md`.

# Changes Made

| File | Change |
|------|--------|
| `packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts` | `leafTerritories` (ancestry walk), `ancestorTint` (the companion to `styleForLevel`), leaf fill primitives, `RecursiveSceneOptions`, reserved failure-hue arc, stronger level ramp, new draw order. |
| `packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts` | `DEFAULT_RECURSIVE_LEVELS` 2 → 3 (decision 9); `showLeafFills` state + `setShowLeafFills` + `DEFAULT_SHOW_LEAF_FILLS` (decision 6). |
| `packages/dashboard/src/components/RecursiveControlsPanel.tsx` | One new switch, "Leaf fills" (decision 6). |
| `packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx` | Reads `showLeafFills` from the store and passes the new options object to the adapter. |
| `packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts` | 19 new tests: defaults, ancestry, tinting, ramp, scene order, failure reservation. |

# Design Decisions

**Decision 1 — ancestry, not own level.** `leafTerritories` walks the tree crediting every leaf cell
to the level-0 segment at the head of its branch. The driver emits one child per merged group in
segment order, so child *i* of the root *is* level-0 segment *i* re-solved; that child order is the
ancestry. At one level the root has no children and each of its own segments is its own territory.
A failed node contributes no cells (it has none) and is drawn as a failure patch instead.

**Decision 2 — hues cut evenly from the wheel** by root index, starting clear of the reserved arc:
`hue = 340 + 30 + (index / count) × 300`. Four territories therefore land 75° apart.

**Decision 7 — reserved arc rather than a lucky miss.** `#e64980` (the failure colour, hue ≈ 340°)
gets a ±30° exclusion zone, and the territory hues are cut from the remaining 300°. This makes a
collision impossible at *any* territory count rather than merely unlikely at four. Verified on real
geometry: the driver's own census names **Pentagon House at merge group 3** as a fixture that stops
subdividing, and the test builds that tree, finds the failure patches (dashed, denser fill) and
asserts every tint around them is ≥ 30° away in hue and lower in alpha.

**Decisions 3 & 4 — fills at 0.2 alpha with no stroke of their own**, in groups emitted before every
stroke group. Lightness cycles over four values (0.5 / 0.64 / 0.57 / 0.71) at fixed hue and
saturation; the cycle is deliberately non-monotonic so two cells adjacent in traversal order are
never merely one step apart.

**Decision 5 — two changes were needed, not one.** The widths alone were already descending, so the
reason level 0 read no heavier than level 2 was the draw order: a child's boundary coincides with its
parent's wherever the parent was cut, so drawing children last let a thin grey stroke overdraw the
heaviest one in the picture. Levels are now drawn **deepest first**, and the ramp was widened to a
factor of four (3.2 → 0.8 segment, 4.0 → 1.0 skeleton). Colours are unchanged and still monotone in
greyscale luminance. This supersedes the "root first" comment from the previous task, which decision
5 explicitly reopens.

**Decision 6 — the toggle emits nothing rather than hiding something.** With the switch off, no fill
primitive is built at all, so the comparison against stroke-only rendering is honest. Note that the
decision-5 draw-order and ramp fix applies in both states; "exactly today's stroke-only rendering"
is read as "no fills", since decision 5 mandates the stroke change independently.

**Where the fills flag is read.** `RecursiveSubdivisionCanvas` reads `showLeafFills` from the store
directly, whereas `levelVisibility` remains a prop. `apps/demo/src/app/recursive/page.tsx` is outside
this task's file ownership, so a second prop could not be threaded through it; reading the one new
flag from the store keeps the switch working without the host page learning about it.

**`hslHex` is duplicated.** `parcelsToScene.ts` has an identical private helper, but that file is
outside this task's ownership so it could not be exported from there. See follow-ups.

**Test placement.** The only test file in this task's ownership is
`tests/stores/useRecursiveSubdivisionStore.test.ts`, so the adapter's tests were added there rather
than in a new `tests/scene/` file. Flagged in the file header and in follow-ups.

**Tolerance.** Hue read back from an eight-bit hex is quantised: two colours built from one hue at
different lightnesses return up to ~0.4° apart. Tests use a stated 1° noise floor
(`HUE_QUANTISATION_DEGREES`) for hue-equality assertions, and exact-value assertions everywhere the
quantisation does not apply. No solver tolerance was touched.

# Build & Test Results

- `pnpm --filter @proc-geo/dashboard test` — **169 passed / 169** (12 suites), including 19 new.
- `pnpm test` (core) — **2731 passed / 2731**, 63 suites. No regression.
- `pnpm build` — **SUCCESS** for core, test-fixtures, dashboard and the Next.js demo.
- `pnpm lint` — **fails with one pre-existing error**, `apps/demo/src/app/dol-system/page.tsx:51`
  (`no-explicit-any`) plus one pre-existing warning in `AppShellLayout.tsx`. Neither file is touched
  by this task and both errors reproduce on the unmodified tree; ESLint covers only the demo app, and
  no dashboard file is linted by it.

Two rounds of fixes were needed: the first run failed three assertions, all of them test-side —
hue quantisation (fixed by the stated 1° floor) and one count that had forgotten the failure patch is
also a filled shape (fixed by filtering the dashed patches out of the tint set). A mutation check was
run to confirm the reservation test bites: setting the reserved arc to 0° fails it, restoring 30°
passes.

# Open Questions / Risks

- **Holes in a leaf cell are tinted over.** The scene DSL draws one ring per primitive, so a cell
  wrapping an island gets its outer ring filled and the island's dashed ring drawn on top of the
  tint. The alternative — leaving hole-bearing cells untinted — would make them read as belonging to
  no territory, which seemed worse. No fixture on this page currently produces one.
- **Not visually verified in a browser.** The container has no display; correctness here rests on the
  scene-graph assertions (order, count, hue separation, alpha) rather than on a screenshot.
- **Territory hue at high counts.** With 24 territories, neighbours are 12.5° apart and will be hard
  to separate by eye. Duck Octagon at merge group 2 produces four, which is the case the page opens
  on.

# Suggested Follow-ups

- Move `hslHex` into a shared `scene/colour.ts` and have both `parcelsToScene` and
  `recursiveSubdivisionToScene` use it.
- Move the scene assertions from `tests/stores/useRecursiveSubdivisionStore.test.ts` into
  `tests/scene/recursiveSubdivisionToScene.test.ts`.
- Fix the pre-existing `no-explicit-any` in `apps/demo/src/app/dol-system/page.tsx`, which currently
  makes `pnpm lint` red for everyone.
- Consider a territory legend in the controls panel — the swatch column currently shows the level
  ramp only, and nothing on the page names the hues.
</content>
