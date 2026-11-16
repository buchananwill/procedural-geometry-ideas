---
title: "Task 245 — Access run provenance and the Region type"
type: workflow
area: subdivision
status: archived
date: 2026-08-17
---

# Task 245 — Access run provenance and the Region type

Spec: [`docs/notes/access-run-provenance-decisions.md`](../access-run-provenance-decisions.md)

## 0. Recovery baseline

`git log` showed **no prior work on task 245**: no `region.ts` in any reachable commit, no committed
plan, and `canonicalisePolygon` still on its two-argument signature from task 243. Greenfield. The
work is one new module, one extended function, one barrel entry and two suites — small enough that
the plan is the phase table below rather than a separate document, and it lands with the code in a
single commit.

| Phase | Content |
|-------|---------|
| A | `region.ts`: the vocabulary, `Region`, the partition assertion, `accessRuns`, `makeRootRegion` (decisions 1–5, 9, 10). |
| B | `canonicalisation.ts`: the index remap, pinned indices, the pinned report (decisions 6–8). |
| C | `region.test.ts` and the new blocks in `canonicalisation.test.ts` (decisions 11–13). |
| D | Full suite twice with the failure sets intersected, then `pnpm build` (decision 14). |

## 1. Task Summary

A region carries its polygon and the subset of its boundary that carries access, so a subdivided
child can know which of its own runs are roads without ever testing a child edge for coincidence
with a parent access run. This task fixes that vocabulary, builds the root region, and makes the
runs survive input canonicalisation. It builds no recursion driver, promotes no lanes, extracts no
spines, emits provenance from neither `computeStrips` nor `sliceStrip`, and re-expresses no egress
invariant — all five are explicitly deferred by section 3 of the spec and none is touched.

## 2. Changes Made

- **`packages/core/src/straight-skeleton/region.ts`** — created. `BoundaryProvenance`,
  `BoundaryRun`, `Region`, `ACCESS_PROVENANCES`, `isAccessProvenance`, `runEdgeCount`,
  `assertRunPartition`, `assertBoundaryPartition`, `accessRuns`, `makeRootRegion`,
  `runBoundaryVertexIndices`, `remapRuns`. Plain data plus free functions, no methods, matching
  `SkeletonNormalisation` and `SkeletonTree`.
- **`packages/core/src/straight-skeleton/canonicalisation.ts`** — `CanonicalPolygon` gains
  `indexRemap`, `pinnedCount` and `pinnedUnderFloorCount`; `REMOVED_VERTEX_INDEX` exported;
  `canonicalisePolygon` gains an optional third argument `pinnedIndices`. `findWeakestVertex` now
  skips pinned candidates and returns `null` when every remaining vertex is pinned.
- **`packages/core/src/index.ts`** — barrel entries for the region module and `REMOVED_VERTEX_INDEX`.
- **`packages/core/tests/straight-skeleton/region.test.ts`** — created, 37 tests.
- **`packages/core/tests/straight-skeleton/canonicalisation.test.ts`** — 18 tests added across five
  new blocks: the index remap, pinning, the pinned report, a run carried across a real removal, and
  the tangential lane mouth.

No solver file is touched, nothing is deleted, and `Strip.frontage` / `Strip.supportingEdgeIds` stay
exactly as they are, as section 4 requires.

## 3. Design Decisions

### 3.1 Runs index EDGES, and that is what makes decision 3 checkable

The roster gives `BoundaryRun` as `[startIndex, endIndex]` inclusive and decision 3 as "every
boundary **edge** belongs to exactly one run", so the indices are edge indices: edge `i` runs from
`boundary[i]` to `boundary[(i + 1) % n]`, and a closed ring of `n` vertices has exactly `n` edges.
Vertex indexing would have made the partition statement ambiguous at every seam. The two places the
distinction shows up are documented at the point of use: `runBoundaryVertexIndices` converts run
starts to the vertices they begin at, and `remapRuns` carries a run by its two bounding *vertices*.

### 3.2 The partition check is one function, and the constructor is one of its callers

`assertRunPartition(runs, edgeCount)` checks, in order: non-empty; every index an integer inside the
ring; each run beginning on the edge after its predecessor ends, cyclically; covered counts summing
to `edgeCount`; and no two adjacent runs sharing a provenance. The seam check is what catches
decision 11's one-edge gap and one-edge overlap; the count check is what catches a run list that
chains correctly and laps the ring twice. `makeRootRegion` calls it on its own output, so the
constructor cannot emit a partition the assertion would reject, and `remapRuns`' output is checked
through the same function in the suite.

A **single run covering the whole ring is exempt from the adjacency rule**, because it is adjacent
only to itself and the rule it would fail — two adjacent runs with one tag are one run — is already
true of it. That case is the default root region, so getting it wrong would have rejected every
polygon in the codebase.

### 3.3 A supplied subset is completed and canonicalised; only genuine malformation throws

Decision 10 names three obligations: indices in range, runs non-overlapping, complement filled with
`perimeter-plain`. Implemented as a per-edge labelling pass that reports an overlap by naming the two
runs and the edge, followed by a grouping pass that walks from the first **seam** rather than from
edge 0. Walking from the seam is what makes the answer canonical: a stretch that wraps past the seam
between edges `n − 1` and `0` comes back as one run rather than two, and a caller who spelled one
stretch as two adjacent runs of the same tag gets the single run they meant.

That merge is deliberately **not** treated as a silent correction. Two adjacent access runs are a
legal, equivalent spelling of one access run — not malformed input — so answering in canonical form
is the constructor doing its job, and it is pinned by its own test. What *is* malformed (an index
outside the ring, a non-integer index, two runs claiming one edge, a boundary of fewer than three
vertices) throws with the offending value in the message.

### 3.4 Where decision 8's report lands, and the file-ownership boundary it met

Decision 8 asks for a pinned vertex to be reported in the canonicalisation diagnostic, distinguished
from a removed one. The `vertices-canonicalised` diagnostic **string** is composed in
`solveSkeleton`, in `algorithm-termination-cases.ts`, which is **outside this task's declared file
ownership**. The report therefore lands on `CanonicalPolygon` — the value that diagnostic is
composed from — as two fields:

- `pinnedCount`: distinct pins honoured, which is decision 8's "mostly pinned is a signal the runs
  are fragmented" made countable;
- `pinnedUnderFloorCount`: how many of those are still under the floor in the ring that came back —
  the ones the pin, and only the pin, kept. This is what distinguishes a pinned vertex from a removed
  one, and it is measured on the result rather than tallied during the loop, so it answers the
  question about what the caller is holding.

`solveSkeleton` passes no pins today (it has no runs to derive them from), so no existing diagnostic
string could have differed even had the file been in scope. Flagged rather than quietly resolved:
if the reviewer wants the detail text extended, that is a one-line change in
`algorithm-termination-cases.ts` and needs the scope opened.

### 3.5 `remapRuns` and `runBoundaryVertexIndices` are surface the roster does not list

The roster's "Changed" section names only `canonicalisePolygon`, but decisions 6 and 7 require a
mechanism, not just a return value: runs must be *remapped through* the remap rather than recomputed,
and canonicalisation must be *told* which vertices bound a run. Leaving both to the call site would
have put the ±1 edge/vertex arithmetic in every future consumer and in the tests, which is the
"shape invented at the call site" the spec's section 3 says this task exists to prevent. Both are
small, both live in `region.ts` beside the type they serve, and both are exported.

`remapRuns` **throws** when a run-bounding vertex did not survive, rather than snapping to the
nearest survivor. A run whose boundary was canonicalised away has no honest image on the new ring,
and inventing one is exactly how a road quietly becomes a fence. That throw is what the unpinned half
of the decision-13 test asserts.

### 3.6 A pin skips a vertex as a *candidate*, not as a *neighbour*

A pinned vertex still contributes its position, so the chords either side of it are the chords the
surviving ring actually has. This is visible in the suite: pinning the first dip of `RIPPLED_EDGE`
leaves the middle ripple vertex standing 1.13 floors off its new chord, so it survives too — one pin
removes one removal *and* one cascade. Asserted as a measurement rather than described in a comment.

### 3.7 TDD sequence, stated plainly

`region.ts` was written as types plus `throw new Error('not implemented')` stubs, and the suite was
run red against them: **34 failed, 3 passed** (the three being `runEdgeCount` and
`isAccessProvenance`, which are one-liners with no stub). The canonicalisation change is an extension
of a function 3342 existing tests already exercise, so stubbing it would have broken the baseline
rather than produced a meaningful red. Its new behaviour is instead **convicted by mutation inside
the tests themselves**, which is stronger than a stub-red: every pinning test runs the same input
with and without the pin and asserts the two differ, and the decision-13 test shows the unpinned call
removing the seam and `remapRuns` refusing to carry the run across it.

## 4. Build & Test Results

Baseline before any change: **66 suites, 3342 tests, 0 failures**.

Decision 14's gate, the full suite twice with the failure sets intersected:

| Run | Suites | Tests | Failures |
|-----|--------|-------|----------|
| 1 | 67 passed / 67 | 3397 passed / 3397 | none |
| 2 | 67 passed / 67 | 3397 passed / 3397 | none |

Intersection of the two failure sets: **empty**. No existing test changed state; the canonicalisation
suite is green with the remap threaded through, and the +1 suite / +55 tests are exactly this task's
new coverage (37 in `region.test.ts`, 18 added to `canonicalisation.test.ts`).

`pnpm build` — clean across all four packages (`core`, `test-fixtures`, `dashboard`, `demo`,
including the Next.js static export).

One test expectation was corrected during the loop: `makeRootRegion`'s too-short-boundary message
says "at least 3 vertices", so the assertion now matches that rather than the word "three".

## 5. Open Questions / Risks

- **Decision 8's diagnostic string** — see 3.4. The fields exist and are tested; the sentence in
  `solveSkeleton`'s detail text does not mention pins, because that file is out of scope and cannot
  observe a non-zero pin count today.
- **Winding is documented, not enforced.** `Region.boundary` is specified clockwise;
  `makeRootRegion` does not test the winding and does not reverse it. Nothing in the spec asks it to,
  and adding an unrequested throw would be a behaviour the recursion driver has to work around. The
  producers that will emit regions inherit the solver's clockwise convention.
- **`ACCESS_PROVENANCES` is exported.** The suite deliberately does *not* read it — it writes all
  seven tags out by hand so it cannot agree with the implementation by reading the implementation's
  own list — but it is exported so a consumer can enumerate the road tags without duplicating them.

## 6. Suggested Follow-ups

- Thread `runBoundaryVertexIndices` into the recursion driver's canonicalisation call when the driver
  lands, and extend `solveSkeleton`'s `vertices-canonicalised` detail with the pinned counts at the
  same time (needs `algorithm-termination-cases.ts` in scope).
- Emit provenance from `computeStrips` and `sliceStrip` — the deferred producer change, which now has
  a fixed target to emit into.
- Re-express the egress invariant over `accessRuns` rather than over whole-boundary frontage, which
  is the check that stops a lot fronting onto a back fence.
