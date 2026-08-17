# Task 249 — Per-level recursion specs

Spec: `docs/notes/per-level-recursion-specs-decisions.md`
Ownership: `apps/demo/src/app/recursive/page.tsx`, `packages/core/src/index.ts`,
`packages/core/src/straight-skeleton/recursive-subdivision.ts`,
`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`,
`packages/dashboard/src/components/RecursiveControlsPanel.tsx`,
`packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx`,
`packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts`,
`packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts`,
`packages/dashboard/tests/fixtures/recursive-trees.ts`,
`packages/dashboard/tests/scene/recursiveSubdivisionToScene.test.ts`,
`packages/dashboard/tests/stores/useRecursiveSubdivisionStore.test.ts`.

## 1. Case: greenfield

`git log` tips at `38c336c Specify per-level recursion specs` with nothing after it — no plan, no
partial implementation. This plan is committed first as the recovery baseline, before any code moves.

## 2. Task Summary

`RecursiveOptions` carries `levels` (a count), `mergeGroupSize`, `depthFraction` and `residue` as
scalars applied uniformly to every level, and segments always recurse. That shape cannot express three
of the four segment/residue combinations, and cannot express a level treating its own two child streams
differently from the level above it. The change replaces the scalars with `levels: LevelSpec[]` whose
**length is the depth**, and threads that array through the driver, the store, the panel, the adapter
and the page.

No solver file is touched; the subdivision arithmetic is unchanged.

## 3. Phased plan

Each phase ends buildable and testable, and is committed on its own.

### Phase A — plan (this document)

Committed first as the recovery baseline.

### Phase B — core: the parameter shape (decisions 1, 2, 3, 4, 6, and retirement §4)

`packages/core/src/straight-skeleton/recursive-subdivision.ts`:

- New `SegmentTreatment = 'recurse' | 'leaf'` beside the existing `ResidueTreatment`, so neither union
  is written inline (project type discipline: named types in every signature). The roster spells both
  inline inside `LevelSpec`; the value sets are identical, so this is a surface adaptation only.
- New `LevelSpec { depthFraction; mergeGroupSize; segments; residue }`.
- `RecursiveOptions` becomes `{ levels: LevelSpec[] }`. The four scalar fields are **removed**, not
  deprecated (§4).
- `RecursiveRun` becomes `{ levels: LevelPolicy[]; rootNoiseFloor }`, where `LevelPolicy` is the
  clamped spec with `mergeGroupSize` already turned into a `SameLogicalStreetPredicate` — the run is
  still fixed before the first solve, it is just an array now.
- `clampLevelSpecs` clamps the array to `[MIN_RECURSION_LEVELS, MAX_RECURSION_LEVELS]` entries via the
  existing `clampLevels`, and each entry's `depthFraction`/`mergeGroupSize` via the existing clamps.
  An empty array falls back to one terminal full-depth level.
- `subdivideNode` reads `run.levels[level]` (decision 2: a level's spec governs the region it is
  handed) and recurses on a stream only when that spec says `recurse` **and** a next level exists
  (decision 3).
- `uniformLevelSpecs(input)` is decision 6's convenience constructor: the old scalars in, a uniform
  array out, `segments: 'recurse'` because that is what the old shape always did. A helper only — the
  driver reads `levels`.

`packages/core/src/index.ts`: export `LevelSpec`, `LevelPolicy`, `SegmentTreatment`,
`UniformLevelSpecsInput`, `uniformLevelSpecs`, `FALLBACK_LEVEL_SPEC`, `clampLevelSpecs`.

### Phase C — core tests (decisions 11, 12, 13)

`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`:

- The existing `options()` helper becomes `uniformLevelSpecs`-based, so every pre-existing property
  keeps running under the uniform reading — that is the regression gate for "no geometry changed".
- New suite: **all four combinations at more than one level**, asserting which nodes have segment
  children, which have residue children and which have neither. `leaf` + `recurse` gets its own
  named assertions (the only shape where a node has residue children and no segment children).
- New suite: **the heterogeneous tree**, with a different `depthFraction`, `mergeGroupSize` and stream
  pair at each of three levels, asserting each level's spec governed the level it was handed — segment
  counts per level pinned against the merge group of *that* level, and each node's residue re-derived
  at *its own* level's depth fraction. An off-by-one in decision 2 fails this and nothing else.
- The heterogeneous tree also runs the existing `tilingProblems`/`driftProblems` sweeps unchanged
  (decision 13).
- Decision 3's override is asserted directly: `recurse` on the last level produces no children.

### Phase D — dashboard store (decisions 7, 9)

`useRecursiveSubdivisionStore`: state becomes `levels: LevelSpec[]`; `updateLevel(level, patch)`,
`addLevel()`, `removeLevel(level)` replace the four scalar setters. `DEFAULT_RECURSIVE_LEVELS` becomes
the default array and stays deliberately **heterogeneous** (decision 7). `summariseRecursiveTree` takes
the specs alongside the tree and reports, per level, what each stream asked for, what it actually did,
and whether decision 3 overrode it (decision 9). `leafSegments` counts the segments of nodes with no
**segment** children, so a `leaf` + `recurse` node's ring is counted as final — the count decision 11
warns is the one quietly broken by the old reading.

The names `DEFAULT_MERGE_GROUP_SIZE`, `DEFAULT_RECURSIVE_FIXTURE`, `DEFAULT_RECURSIVE_LEVELS`,
`MAX_MERGE_GROUP_SIZE`, `RecursiveLevelSummary`, `RecursiveSubdivisionStoreState` and
`RecursiveTreeSummary` are all kept, because `packages/dashboard/src/index.ts` re-exports them by name
and that file is outside this task's ownership.

### Phase E — dashboard panel and adapter (decisions 3, 5, 8, 9, 10)

- `RecursiveControlsPanel`: one row per level, add/remove rows, and per row a depth slider, a merge
  group input, and two segmented controls. The stream controls are **disabled with a stated reason**
  on the last level (decision 3), and the residue control is disabled with a stated reason at full
  depth (decision 5). The readout gains the per-stream lines of decision 9.
- `recursiveSubdivisionToScene`: a segment whose node recursed is drawn at reduced stroke opacity, a
  terminal one at full strength (decision 10) — a lightness channel, so it survives greyscale and
  collides with neither the dash channel (holes, residue) nor the hue channel (layers).

### Phase F — the page

`apps/demo/src/app/recursive/page.tsx` reads `levels` from the store and hands it straight to
`subdivideRecursively`. Instructions updated to describe a list of levels.

### Phase G — acceptance (decision 14)

Core suite twice standalone with the failure sets intersected, dashboard suite green, `pnpm build`
clean across all four packages, actual counts reported here.

## 4. Design decisions

To be completed as the work lands.

## 5. Build & test results

Pending initial build.

## 6. Open questions / risks

- Decision 10 names no channel, so stroke opacity is a choice: it is the one free channel left on this
  page (hue is the layer, dash is holes-and-residue, width is the level).
- Decision 9's "overridden" report needs the specs as well as the tree, so `summariseRecursiveTree`
  gains a second parameter. Its name is re-exported from the dashboard barrel and unchanged.

## 7. Suggested follow-ups

Per §3 of the spec: spine labelling, radial promotion, merge objectives beyond `mergeGroupSize`, and
depth beyond three levels are all explicitly out of scope here.
