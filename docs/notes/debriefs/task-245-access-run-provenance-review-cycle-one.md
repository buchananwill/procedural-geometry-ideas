# Task 245 — Access run provenance and the Region type, review cycle one

Spec: [`docs/notes/access-run-provenance-decisions.md`](../access-run-provenance-decisions.md)
Prior debrief: [`task-245-access-run-provenance.md`](task-245-access-run-provenance.md)

## 1. Task Summary

Address review cycle one on task 245. Two reviews were filed against commit `392e4b9`:

- **decomposition (run 1293) — APPROVE.** No BLOCKING issues. Two NOTEs: a four-level nesting in
  `labelEdges`, and a duplicated integer/range guard the reviewer explicitly recommended leaving
  alone.
- **correctness (run 1294) — REQUEST CHANGES.** One BLOCKING issue: `remapRuns` threw on a
  whole-perimeter run whenever the arbitrary vertex it was spelled from was the one canonicalisation
  removed.

The BLOCKING finding is a genuine defect on the default path — `makeRootRegion(boundary)` builds
exactly the region that hits it — and it is fixed here, with tests that fail against the pre-fix
implementation. No spec decision was reinterpreted: the fix makes `remapRuns` agree with what
decision 7 and `runBoundaryVertexIndices` already said, rather than weakening either.

## 2. Changes Made

| File | Action | Change |
|------|--------|--------|
| `packages/core/src/straight-skeleton/region.ts` | modified | `remapRuns` exempts a whole-perimeter run from the survived-vertex requirement and carries it onto the entire surviving ring; the bounded-run arithmetic moved into a private `remapBoundedRun`. `labelEdges`'s inner loop body extracted to a private `claimEdge`. Docs on `remapRuns` state the exemption and why. |
| `packages/core/tests/straight-skeleton/region.test.ts` | modified | Three new cases in *runs are carried through the index remap*: the wrap vertex of a whole-perimeter run removed, the same for a run spelled from a non-zero edge, and the carried result checked as a partition of the shortened ring. |
| `packages/core/tests/straight-skeleton/canonicalisation.test.ts` | modified | New describe block *a whole-perimeter run survives losing the vertex it was spelled from*: end-to-end through `makeRootRegion` → `canonicalisePolygon` → `remapRuns` on a subdivided square rotated so index 0 is a collinear mid-edge vertex, so the stage genuinely removes vertex 0. Named `CanonicalisedRoot` result type; `Region` and `makeRootRegion` added to the import list. |

## 3. Finding-by-finding

### [B1] `remapRuns` threw when a whole-perimeter run's wrap vertex was culled — FIXED

The reviewer's trace was exact. `groupIntoRuns` spells a seamless ring as `{startIndex: 0, endIndex:
edgeCount - 1}`; `remapRuns` resolved both bounds through `indexRemap[0]`, and
`runBoundaryVertexIndices` returns `[]` for a single run, so nothing protected vertex 0 from being
removed. The two docs the reviewer quoted were the correct statement of intent and `remapRuns` was
the thing out of step with them.

`remapRuns` now tests `runEdgeCount(run, inputCount) === inputCount` — the run covers every edge —
and, when true, returns `{startIndex: 0, endIndex: survivingCount - 1}`. Choosing edge 0 is not an
invention: a seamless ring has no seam to anchor to, and edge 0 is `groupIntoRuns`'s own spelling of
that same ring, so a region round-tripped through canonicalisation is spelled the way the constructor
would have spelled it. The condition is local to a single run, so it cannot be reached by a
multi-run partition (the covered counts would not sum to `edgeCount`).

**What was deliberately NOT relaxed:** the throw for a bounded run whose start or far-bound vertex
was removed stays exactly as it was. That is decision 7's failure mode made loud, and the existing
test at `region.test.ts` ('throws rather than invent a run whose boundary vertex was removed') still
passes unchanged. The exemption applies only where the spec already said nothing is pinned because
nothing gives way.

New coverage, all of which fails against the pre-fix `region.ts` (verified by reverting the source
file alone and re-running: 5 failed, 81 passed):

- `region.test.ts` — `remap = [REMOVED, 0, 1, 2]` with `run(0, 3)`: does not throw, yields `run(0, 2)`.
- `region.test.ts` — `remap = [0, 1, REMOVED, 2]` with `run(2, 1)`: yields `run(0, 2)`, so a ring
  spelled from a non-zero edge is covered too.
- `region.test.ts` — the carried result passes `assertRunPartition` on the shortened ring.
- `canonicalisation.test.ts` — the geometric statement, which is the one the reviewer's fix note
  asked for at the level the stage actually runs at. The subdivided unit square rotated by one puts a
  collinear vertex at index 0; the premise test asserts `indexRemap[0] === REMOVED_VERTEX_INDEX` and
  `runBoundaryVertexIndices(region.runs) === []`, so the test is exercising the real path rather
  than a hand-built remap. The third case compares positions, not indices: every original boundary
  vertex still lies within `SKELETON_NOISE_FLOOR` of the carried run's polyline.

### [N1] Four-level nesting in `labelEdges` — FIXED

Extracted exactly the helper the reviewer suggested: `claimEdge(labels, claimedBy, edge, position,
provenance)`, which throws on a double claim. `labelEdges` drops to three levels and the overlap
error text is unchanged, so `region.test.ts`'s 'rejects two access runs that overlap' and 'rejects an
access run that overlaps itself by lapping the ring' still match on the same message.

### [N2] Bounds-check formula duplicated across `region.ts` and `canonicalisation.ts` — NO ACTION

Taken as filed: the reviewer's own recommendation was "No action recommended", on the grounds that
the two call sites want different messages and different collection semantics (throw-per-run vs.
dedupe-into-a-set), and that unifying them trades two obvious one-purpose guards for one indirection.
Nothing in this cycle added a third caller, so the extraction still does not clear the bar. Recorded
here so the next reader knows it was considered rather than missed.

## 4. Design Decisions

- **The exemption is expressed as a span test, not as `runs.length === 1`.** `remapRuns` takes a run
  list, not a `Region`, and does not assert the partition, so it cannot assume a single-element list
  is the only way to be handed a whole-ring run. `runEdgeCount(run, inputCount) === inputCount` is
  the property that actually matters — this run has no bound distinct from itself — and it reuses the
  module's existing span function rather than restating the modular arithmetic.
- **`remapBoundedRun` is a private helper, not an inlined branch.** Keeping the bounded case in its
  own function leaves the exemption legible as a one-line ternary in `remapRuns` and keeps the
  `remappedVertex` pair together with the comment explaining the far-bound offset.
- **The end-to-end test rotates the fixture rather than authoring a new one.** `insertRegularly(UNIT_SQUARE, 4)`
  is already the corpus this decision-12 block uses; rotating by one moves a collinear vertex to
  index 0 without introducing a second fixture whose deviations would need re-justifying against the
  floor.

## 5. Build & Test Results

- `pnpm --filter @proc-geo/core test` — **67 suites, 3403 tests, all passing.** Run twice (decision
  14's acceptance gate); both runs green, so the intersected failure set is empty. Previous cycle was
  3396 tests; the seven new cases account for the difference and no existing test changed state.
- `pnpm build` — **clean** across `core`, `test-fixtures`, `dashboard` and `demo`.
- Red-first check: with `packages/core/src/straight-skeleton/region.ts` reverted to `392e4b9` and both
  test files at their new state, the region + canonicalisation suites report 5 failed / 81 passed.
  The two that pass pre-fix are the premise assertions, which do not call `remapRuns`.
- `pnpm lint` not run: nothing under `apps/demo/` or `packages/dashboard/` was touched.

## 6. Open Questions / Risks

- A whole-perimeter run whose caller deliberately spelled it from a non-zero edge comes back spelled
  from edge 0. That is a respelling of the identical edge set, and no consumer exists yet that could
  observe the difference, but it is a visible change if one later compares `startIndex` across a
  canonicalisation. The alternative — preserving the original start when it survived and falling back
  to 0 when it did not — makes the output depend on which vertex the floor happened to take, which is
  worse.
- `remapRuns` still trusts that `survivingCount` matches the ring `indexRemap` describes. It is
  always passed `canonical.vertices.length` beside `canonical.indexRemap`, and both come from the one
  `CanonicalPolygon`, so the pairing is hard to get wrong at a call site; it is not defended against.

## 7. Suggested Follow-ups

- When `computeStrips` and `sliceStrip` become the provenance producers (explicitly deferred in the
  spec's §3), they will be the first callers to remap runs on regions that are neither the root nor
  whole-perimeter. That is the point at which the bounded-run throw earns its keep, and worth a test
  at that level then.
- The egress invariant re-expressed over access runs will need a region with zero access runs to be
  rejected at slice time rather than at construction (decision 5). Nothing here does that, by design.
