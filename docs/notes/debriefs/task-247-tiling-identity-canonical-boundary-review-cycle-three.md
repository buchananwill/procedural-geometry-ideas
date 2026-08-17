# Task 247 — Tiling identity against the canonical boundary (review cycle 3)

## Task Summary

Cycle-2 review returned one BLOCKING finding and no NOTEs:

- **decomp (run 1312) [B1]** — the new corpus sweep `'reports the canonicalisation its own solve was
  set up with, at every failed node'` inlined its per-node check inside three nested `for` loops
  (nesting depth 4), reintroducing the shape cycle 1 already blocked and that was fixed there by
  extracting `exactnessProblems`/`CanonicalExactness`. `unsolvableRegion` duplicated the *identical*
  `fixture × depth → tree → failed node` traversal with the same options call and the same failure
  filter, differing only in what it did with a qualifying node.
- **correctness (run 1313)** — APPROVE, no findings.

Goal: extract the shared traversal once and give the sweep the same named-collector shape the file
already uses, without changing what either consumer asserts.

## Changes Made

All in `packages/core/tests/straight-skeleton/recursive-subdivision.test.ts`; no production code was
touched this cycle.

- **`FailedRegion` (new interface)** — a failed corpus region as a value: the node, the caller-space
  `rootFloor` its solve was set up with, and the `where` label for problem messages. Named and
  exported-shape per type discipline rather than an inline object type on the helper's return.
- **`failedNodesOf(root)` (new)** — the failed, non-degenerate nodes of one tree. Owns the filter
  (`failure !== undefined && failureKind(failure) !== 'degenerate'`) that both consumers were
  spelling out separately.
- **`failedRegions()` (new)** — the single place the `ALL_TEST_POLYGONS × SWEPT_DEPTH_FRACTIONS →
  subdivideRecursively(MAX_RECURSION_LEVELS, FAILING_REGION_MERGE_GROUP_SIZE) → failed node`
  traversal is written. `rootFloor` is still measured once per fixture, outside the depth loop,
  exactly as before. Max nesting: function + two loops, with the per-tree collection delegated.
- **`unsolvableRegion()` (rewritten)** — now a `find`-style consumer with no loop nesting of its own:
  `failedRegions().map(…boundary).find(boundary => re-solve fails)`, throwing the same message when
  the corpus yields none. Same filter, same re-solve condition, same first-match result.
- **`FailedCanonicalisation` (new interface)** — `{problems, reduced}`, mirroring
  `CanonicalExactness`, with the same justification for carrying the count alongside the problems.
- **`failedCanonicalisation(failed)` (new)** — the per-node body lifted verbatim out of the sweep:
  the `canonicalRingOf` comparison, the exact-equality drift comparison, and the same two problem
  strings. `reduced` is returned per node instead of incremented in place.
- **The corpus sweep test (rewritten body)** — three lines: `failedRegions().map(failedCanonicalisation)`,
  `flatMap` the problems, `filter` the reduced count. Both assertions (`problems` empty, `reduced > 0`)
  and both comments are unchanged.

## Design Decisions

- **`failedNodesOf` as a separate helper rather than an inline `.filter` inside `failedRegions`.**
  Chaining the filter into the loop body would have put the predicate back at the depth the finding
  objected to and would have hidden the degenerate-exclusion rule — which is a stated reason, not a
  mechanical detail — inside a loop. It now carries that reason in one doc comment.
- **Assertion semantics deliberately unchanged.** `node.canonicalAreaDrift !== drift` stays an exact
  equality (cycle 2's correctness review explicitly justified it: both sides run bit-identical
  arithmetic over the same deterministic inputs). No tolerance was introduced, relaxed, or reused.
- **`unsolvableRegion` no longer short-circuits the sweep itself**, only the re-solve. Building the
  full `failedRegions()` list before searching costs one corpus sweep the file already performs
  elsewhere; measured, the test that consumes it runs in 3.4 s, in line with its neighbour at 3.3 s.
  Trading that for one traversal instead of two duplicated ones is the point of the finding.
- **No spec decision was reinterpreted.** This cycle is a decomposition-only change; decisions 1, 2,
  3, 4, 6 and 7 are asserted by exactly the same code, now called from named helpers.

## Build & Test Results

- `pnpm --filter @proc-geo/core exec jest --testPathPatterns=recursive-subdivision` — 76/76 pass.
- `pnpm --filter @proc-geo/core test` — **67 suites, 3427 tests, all passing** (unchanged from cycle 2).
- `pnpm build` — clean across core, test-fixtures, dashboard and demo.
- `pnpm --filter @proc-geo/dashboard test` — 13 suites, 195 tests, all passing.

No failures to resolve; the extraction was behaviour-preserving on the first run.

## Open Questions / Risks

- The non-vacuity floor (`reduced > 0`) still depends on the corpus containing failed nodes that lost
  a vertex to the floor — five of them today. The comment above the assertion still records what to
  do if a future solver improvement drives that to zero; the metamorphic pair above it remains the
  standing pin.

## Suggested Follow-ups

- `structuralProblems`, `tilingProblems` and `driftProblems` each open with their own
  `for (const node of flattenRecursiveTree(root))`. They assert different things and read fine, but if
  a fourth sweep appears, the same per-node-collector shape (`(node, where) => problems[]` mapped over
  the flattened tree) would fold all of them the way `exactnessProblems` and `failedCanonicalisation`
  are now folded. Out of scope here.
