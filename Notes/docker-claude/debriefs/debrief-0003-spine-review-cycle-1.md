# Debrief 0003 — Spine extraction, review cycle 1

Task 250 · `docs/notes/spine-extraction-decisions.md` · revision cycle 1 (reviewRuns 1322 decomp,
1323 correctness). Both verdicts were `request_changes`.

## Task Summary

Address every BLOCKING and NOTE finding from cycle 0:

- **decomp B1 (BLOCKING)** — `regionSpine`/`RegionSpine`/`summariseSpines`/`SpineLevelSummary` are
  pure derivations sitting in the Zustand store, forcing `recursiveSubdivisionToScene.ts` to import a
  *runtime* value out of a store module. No other scene adapter in the package does that.
- **correctness B1 (BLOCKING)** — decisions 10 and 11 are undelivered on the running page: the store,
  adapter and readout all implement the spine layer, but `RecursiveSubdivisionCanvas.tsx` never reads
  `spineStrategies` and never passes it to `recursiveTreeToScene`, so nothing is drawn on `/recursive`.
- **decomp N1** — the `solveSkeleton` try/catch and its rationale duplicated in two places.
- **decomp N2** — `depthLabel` and `spineFractionLabel` are the same one-line formula twice.
- **correctness N1** — `extractSpine`'s documented `@throws` is untested at the public entry point.

## Changes Made

| File | Action | Change |
|---|---|---|
| `packages/core/tests/straight-skeleton/spine.test.ts` | modified | New `withCycleAdded` helper and a `describe('extractSpine on a graph that is not a tree')` block: `diameter` and `whisker-prune` throw `/requires a tree/`, `wavefront-time` still answers. (correctness N1) |
| `packages/dashboard/src/scene/adapters/regionSpine.ts` | **created** | `trySolveSkeleton`, `RegionSpine`, `regionSpine`, `SpineLevelSummary`, `summariseSpines`, moved verbatim out of the store. (decomp B1, N1) |
| `packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts` | modified | Those four symbols removed; `buildSkeletonTree`/`extractSpine`/`solveSkeleton` and four now-unused type imports dropped. The store keeps only what touches its state. |
| `packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts` | modified | Imports `regionSpine` + `trySolveSkeleton` from `./regionSpine` instead of from the store; `skeletonEdges` now uses `trySolveSkeleton` rather than its own try/catch. (decomp B1, N1) |
| `packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx` | modified | Reads `spineStrategies` from the store and passes it into `recursiveTreeToScene`. **This is the fix for correctness B1** — see the scope note below. |
| `packages/dashboard/src/components/RecursiveControlsPanel.tsx` | modified | `summariseSpines` imported from the new module. |
| `packages/dashboard/src/components/RecursiveLevelReadout.tsx` | modified | `SpineLevelSummary` type imported from the new module. |
| `packages/dashboard/src/components/recursive-readout-text.ts` | modified | Same import move. |
| `packages/dashboard/src/components/RecursiveLevelRow.tsx` | modified | `depthLabel` + `spineFractionLabel` merged into one `percentLabel`, used at all four call sites. (decomp N2) |
| `packages/dashboard/tests/scene/regionSpine.test.ts` | **created** | The `regionSpine` and `summariseSpines` suites moved here from the store test, plus two new `trySolveSkeleton` cases. |
| `packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts` | modified | Those suites and `SQUARE_SKELETON_LENGTH` removed; imports trimmed; header rewritten to say what the store still owns and where the rest went. |
| `packages/dashboard/tests/scene/recursiveSubdivisionToScene.test.ts` | modified | `regionSpine` imported from the new module. |
| `packages/dashboard/tests/components/recursive-readout-text.test.ts` | modified | `SpineLevelSummary` imported from the new module. |

## Design Decisions

**Where the extracted module went.** `scene/adapters/regionSpine.ts`, beside `leafTerritories.ts` —
the reviewer's first suggestion and the closest precedent in the package: both are pure walks over
the driver's tree that answer in the tree's own terms and are read by more than one consumer. The
store now imports nothing from it, and the adapter's "no store dependency" invariant is restored.
The move is mechanical; no behaviour changed, and the tests that covered these functions moved with
them unaltered apart from their import lines.

**`trySolveSkeleton` shape.** It returns `SkeletonSolveResult | undefined`, collapsing a throw and an
incomplete solve into one `undefined`, and leaves any further check to the caller — `regionSpine`
still tests `result.context === null` itself, because `skeletonEdges` only needs the graph and has no
business being refused a solve it can draw. The "cannot normally fire" rationale is now written once.
The `boundary.length < 3` guard moved into the helper, which is why `regionSpine` and `skeletonEdges`
both lost their own copy of it.

**`percentLabel`.** One formatter for the depth slider and both spine sliders. The three differ in
*which* scale the fraction is of, and that was already said in the text beside each slider rather
than in the number on it — so the number had no reason to be formatted in two places.

**`spineStrategies` stays optional on `RecursiveSceneOptions`.** Now that the only in-repo call site
passes it, the optionality is a genuine API decision rather than a workaround: `recursiveTreeToScene`
is exported from the package barrel, and a required field would be a breaking change for an external
host that draws the same picture without the emphasis layer. Its docstring already states that.

## Scope Note — file outside the declared ownership list

The task's file-ownership list did **not** include
`packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx`, and correctness B1 cannot be
fixed anywhere else: that component is the sole call site of `recursiveTreeToScene` on the running
page. Reviewer 1323 states the two valid responses as (a) pull the file into scope and wire it, or
(b) escalate the decision as undeliverable within the boundary. I took (a), on three grounds:

1. Spec §1's "Changed" list names "the `/recursive` page, its store, controls panel and scene
   adapter" — the page is part of the behaviour contract, so the ownership list was narrower than
   the spec it was derived from.
2. The reviewer explicitly authorises the extension.
3. No other agent branch exists on this repo, so there is no concurrent-edit hazard.

The change is the minimum viable one: one store selector, one option field, one dependency-array
entry. Nothing else in that file was touched.

The other two new files (`src/scene/adapters/regionSpine.ts`, `tests/scene/regionSpine.test.ts`) are
also strictly new paths rather than listed ones, but they hold code this task itself wrote, moved at
the decomp reviewer's direction.

## Build & Test Results

Decision 16's gate, in the order it prescribes:

1. **Core suite, run 1** — 68 suites, 3466 tests, all passing.
2. **Core suite, run 2** — 68 suites, 3466 tests, all passing. Intersection of the two failure sets
   is **empty**. (Cycle 0 stood at 68/3451; the +15 is `spine.test.ts` at its new size.)
3. **`pnpm build`** — clean across `core → test-fixtures → dashboard → demo`; the Next.js build
   compiled and prerendered all ten routes including `/recursive`.
4. **Dashboard suite, run 1** — 15 suites, 257 tests, all passing.
5. **Dashboard suite, run 2** — 15 suites, 257 tests, all passing. (Cycle 0 stood at 14/219; the new
   suite is `tests/scene/regionSpine.test.ts`, and its count includes the two `trySolveSkeleton`
   cases added on top of the moved ones.)

No test needed adjusting to accommodate a change. The stack traces visible in the dashboard and core
logs are `stepLog.warn` output from fixtures that deliberately contain unsolvable sub-polygons, not
failures.

**`pnpm lint`** reports 1 error and 1 warning, both in `apps/demo/src/app/` and both **pre-existing**
— verified by stashing this change and re-running against `405e240`, which reports exactly the same
two. Neither file is in scope and neither is touched here.

**`tsc --noEmit` on the dashboard** reports four errors in
`src/components/dol-system/DolProductionComposer.tsx` (a `@dnd-kit` signature drift), likewise
pre-existing and unrelated; `pnpm build` passes because tsup does not typecheck that file's route.

## Open Questions / Risks

- **The canvas wiring itself has no unit test.** The dashboard's Jest config is
  `testEnvironment: 'node'` with `testMatch: tests/**/*.test.ts` — no jsdom, no `.tsx` matching, no
  React Testing Library in the dependency tree. A component render test would mean changing
  `jest.config.cjs` and adding dependencies, which is well outside this task. What the wiring
  *enables* is covered directly: `recursiveSubdivisionToScene.test.ts` asserts that a
  `spineStrategies` array produces `group:recursive-spine-N` groups, that a severed spine is drawn as
  separate primitives, and that omitting the option draws no spine layer. The remaining uncovered
  step is the one line that reads the selector, and the compiler checks its type.
- Decision 14's disconnection evidence is unchanged from debrief 0001: `wavefront-time` splits
  `Convergence Towards Isthmus (succeeds)` at fraction 0.55 into 2 components, and
  `Premature Bisector Split (passes)` across the whole band 0.1–0.4.

## Suggested Follow-ups

- A jsdom + React Testing Library harness for the dashboard package would let the store→canvas wiring
  of `showLeafFills`, `levelVisibility` and now `spineStrategies` be asserted rather than reasoned
  about. Three options now travel that path with no render test between them.
- `packages/dashboard/src/scene/adapters/index.ts` does not re-export `regionSpine`/`summariseSpines`.
  Nothing outside the package needs them yet; if the readout ever moves to a host app it will.
- The pre-existing `DolProductionComposer.tsx` type errors and the `apps/demo` lint error are both
  live and unowned.
