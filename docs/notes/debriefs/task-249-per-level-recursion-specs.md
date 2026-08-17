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

## 3. Phased plan (as committed at the start of the run)

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

## 4. Changes made

- **`packages/core/src/straight-skeleton/recursive-subdivision.ts`**
  - `LevelSpec` and `SegmentTreatment` added; `RecursiveOptions` is now `{ levels: LevelSpec[] }` and
    the four scalar fields are gone (decisions 1, 4, §4).
  - `RecursiveRun` holds `LevelPolicy[]` — a clamped spec with its merge predicate already built, one
    per level — plus the unchanged `rootNoiseFloor`.
  - `clampLevelSpecs` clamps the array's length through the existing `clampLevels` and each entry
    through the existing `clampDepthFraction`/`clampMergeGroupSize`. `FALLBACK_LEVEL_SPEC` answers the
    empty array.
  - `divideRegion` takes the policy for the level the region belongs to; `subdivideNode` reads
    `run.levels[level]` and recurses on a stream only when that spec says `recurse` and a next level
    exists (decisions 2, 3).
  - `uniformLevelSpecs` is decision 6's constructor.
- **`packages/core/src/index.ts`** — exports `LevelSpec`, `LevelPolicy`, `SegmentTreatment`,
  `UniformLevelSpecsInput`, `uniformLevelSpecs`, `clampLevelSpecs`, `FALLBACK_LEVEL_SPEC`.
- **`packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`** — `options()` now builds
  its array through `uniformLevelSpecs`, so every property that predates this change still runs;
  `structuralProblems` reads every expectation off the spec for the node's own level. New: the levels
  array as the depth, all four combinations at two level positions each, the droste suite, and the
  heterogeneous tree (decisions 11, 12, 13).
- **`packages/dashboard/src/stores/useRecursiveSubdivisionStore.ts`** — state holds `levels:
  LevelSpec[]`; `updateLevel`/`addLevel`/`removeLevel` replace the four scalar setters;
  `DEFAULT_RECURSIVE_LEVELS` is a heterogeneous three-level default; `summariseRecursiveTree(tree,
  specs)` reports per-stream requested/recursed/overridden plus `residueInert`; `leafSegments` counts
  nodes with no segment children.
- **`packages/dashboard/src/components/RecursiveControlsPanel.tsx`** — one `RecursiveLevelRow` per
  level with add/remove, disabled-with-reason stream controls, and a `RecursiveLevelReadout` per level.
- **`packages/dashboard/src/scene/adapters/recursiveSubdivisionToScene.ts`** —
  `RECURSED_SEGMENT_OPACITY`; a node's segments (and their holes) are stroked as hints when the node
  recursed and at full strength when its cells are final.
- **`apps/demo/src/app/recursive/page.tsx`** — reads `levels` from the store, hands it straight to
  `subdivideRecursively`, instructions rewritten around a list of levels.
- **`packages/dashboard/tests/fixtures/recursive-trees.ts`** — `TREE_LEVELS` and
  `RESIDUE_TREE_LEVELS`, the spec arrays the two hand-built trees are trees of. `RESIDUE_TREE` was
  already the droste shape (residue children, no segment children) and is now documented as such.
- **`packages/dashboard/tests/*`** — updated for the two-argument summary, plus new suites for
  decision 9's stream reports and decision 10's rendering distinction.
- **`packages/dashboard/src/components/RecursiveSubdivisionCanvas.tsx`** — unchanged in the end: it
  passes `levelVisibility` and reads `showLeafFills`, neither of which moved.

## 5. Design decisions

1. **Named unions instead of the roster's inline ones.** The type roster spells `'recurse' | 'leaf'`
   and `'recurse' | 'void'` inline inside `LevelSpec`. `ResidueTreatment` already existed as a named
   type for exactly the reason the project's type discipline gives, so `SegmentTreatment` was added
   beside it and both fields are typed by name. The value sets are identical, so nothing about what a
   spec can express changed. They are two types rather than one shared union because `void` and `leaf`
   describe different things and a `void` ring of segments means nothing.
2. **`LevelPolicy` is `Omit<LevelSpec, 'mergeGroupSize'>` plus the predicate.** The merge predicate is
   built once per level before the first solve, as it was once per run before. Derived rather than
   restated so a fifth field on a spec has to be answered.
3. **`clampLevels` was kept.** Decision 1 retires the level count as a FIELD ON THE OPTIONS. The
   arithmetic that bounds the depth is still needed in one place, and `clampLevelSpecs` calls it, so
   the array's length and a UI counting rows are bounded by the same formula.
4. **`FALLBACK_LEVEL_SPEC` is terminal and full-depth.** An empty array asks for a recursion of no
   depth, which this driver cannot return — every call yields a root. One level's streams are terminal
   anyway, so `leaf`/`void` is the only setting that is not immediately overridden, and full depth with
   a group of one are the readings `clampDepthFraction` and `clampMergeGroupSize` already publish for
   "nothing usable was asked for".
5. **Decision 10's channel is stroke opacity.** The spec asks that rendering distinguish a recursed
   stream from a terminal one and names no channel. Hue is already the layer (grey segments, warm
   skeleton, green residue), dash is already "this ring is not the outside of a cell" (holes, residue
   rings), and width is already the level. Opacity is what is left, and being a lightness channel it
   survives the greyscale screenshot this page is usually read in. It is applied per NODE, because a
   node's segments all recursed or none did, and it is applied to a segment's holes too.
6. **`summariseRecursiveTree` takes the specs.** Decision 9 requires the readout to show a level whose
   setting decision 3 overrode, and that is unrecoverable from a tree: an overridden level is shaped
   exactly like a level that asked to stop. One row per spec, which is one row per level the driver can
   produce.
7. **`leafSegments` counts nodes with no SEGMENT children.** Previously nodes with no children of
   either kind. Under `leaf` + `recurse` a node's ring really is final while its courtyard goes deeper,
   so the old reading undercounted exactly the case decision 11 flags — and it disagreed with
   `leafTerritories`, which already keyed on segment children alone, so panel and canvas now agree.
8. **The store's public constant names were preserved.** `DEFAULT_RECURSIVE_LEVELS` is now the default
   spec ARRAY rather than the number 3, because `packages/dashboard/src/index.ts` re-exports it by name
   and that file is outside this task's ownership. Renaming it would have been a scope violation for no
   behavioural gain.

## 6. Build & test results

Decision 14's gate, run standalone rather than chained:

| Gate | Result |
|---|---|
| `@proc-geo/core` suite, run 1 | **67 suites, 3450 tests, all passing** |
| `@proc-geo/core` suite, run 2 | **67 suites, 3450 tests, all passing** |
| Failure sets intersected | **empty** — neither run failed anything |
| `@proc-geo/dashboard` suite | **13 suites, 209 tests, all passing** |
| `pnpm build` | **clean across all four packages** (core, test-fixtures, dashboard, demo) |

The spec's stated baseline of 67 suites and 3427 tests was verified rather than assumed: the suite was
run at the spec commit `38c336c` in a throwaway worktree and reported exactly 67/3427, with 76 of those
in `recursive-subdivision.test.ts`. That file now holds 99, so the +23 in the total is entirely the new
coverage and no existing test was dropped — confirmed against the diff, which removes no `it`.

`pnpm lint` reports one pre-existing error and one pre-existing warning, both in files this task does
not own and does not touch: `apps/demo/src/app/dol-system/page.tsx:51` (`no-explicit-any`) and
`apps/demo/src/app/AppShellLayout.tsx:17` (`no-unused-vars`). They are unchanged from the seed commit
and were left alone rather than fixed out of scope.

## 7. Open questions / risks

- **The default composition is measured on one fixture.** `DEFAULT_RECURSIVE_LEVELS` is asserted to
  solve with no failures, reach all three levels and show more than one residue ring on
  `Duck Octagon (passes)`. Another fixture selected from the panel may fail at some level; that is the
  standing behaviour of this page — failures are drawn and reported — and the corpus sweeps in the core
  suite cover the heterogeneous case across every fixture.
- **Level rows are keyed by index.** Removing a middle row shifts the rows below it up, so React
  remounts them. That is correct for a list whose position IS its meaning (level 0 is the root), but it
  means a row's transient UI state — a slider mid-drag — does not follow the spec it belonged to.
- **`leafTerritories` still does not walk residue subtrees**, so cells inside a courtyard get strokes
  but no territory tint. That predates this task and was left as it stands; the file is outside this
  task's ownership.

## 7. Suggested follow-ups

Per §3 of the spec: spine labelling, radial promotion, merge objectives beyond `mergeGroupSize`, and
depth beyond three levels are all explicitly out of scope here.
