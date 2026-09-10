---
title: "C++ port handoff: bringing the skeleton solver up to date with e2544d4..HEAD"
type: handoff
status: draft
date: 2026-09-10
---

# C++ port handoff: bringing the skeleton solver up to date with `e2544d4..HEAD`

## 0. Scope and how to read

**Who you are.** The team that ported `@proc-geo/core`'s straight-skeleton solver to C++ at
`Source/PistePerfect/{Private,Public}/Geometry/Skeleton` (16 `.cpp`, 18 `.h`), working from a
read-only vendored snapshot at `Notes/technical-reference/proc-geo-ts/` and governed by
`Notes/buildables/procedural-settlement-roadmap.md`, whose §3b is your divergence register (D1–D6).

**What the fork is.** Your snapshot's README states the provenance: commit
`e2544d4729aaa6ccb4d880e71849d14acaf0a146` on `main`, vendored 2026-08-10. That commit is an
ancestor of this repository's current tip `e88da1f` on branch `feature/recursive-skeleton-subdivision`
(`git merge-base --is-ancestor` confirms it), and the tip is **109 commits** ahead of it
(`git rev-list --count e2544d4..HEAD`). The solver-relevant delta —
`packages/core/src` plus `packages/test-fixtures/src` — is **34 files, +5994/−303 lines**
(`git diff --shortstat`), and six source files under `packages/core/src/straight-skeleton/` did not exist
at the fork: `canonicalisation.ts`, `normalisation.ts`, `recursive-subdivision.ts`, `region.ts`,
`skeleton-tree.ts`, `spine.ts`.

**What this document is.** A mechanism-by-mechanism account of everything in that delta that a port
needs, keyed to the commit that landed it and to the current source, plus an entry-by-entry answer to
your divergence register, the invariant kit you can assert against, the tolerance model as a design you
can port first, and an honest statement of what is ready to send and what is not.

**What it is not.** It is not a journal. Every "decision N" and "F N" below is a citation into this
repository's arc journals (`recursive-subdivision-arc-journal*.md`, decisions 1–52 in
[recursive-skeleton-subdivision.md](./recursive-skeleton-subdivision.md)); each citation is stated in
place with enough of its content that you never need to open the journal. Where this document had to
interpret rather than read, §9 says so.

**How to verify.** Every claim about the delta can be checked with
`git log --format='%h %ad %s' --date=short e2544d4..HEAD -- packages/core/src packages/test-fixtures/src`
and `git diff e2544d4..HEAD -- <file>` against this repository. Every claim about your port is from a read
of your headers and a grep of your sources on 2026-09-10; §9 lists which verdicts rest on grep alone.

## 1. Corrections to what the port currently believes

### 1.1 Recursion: the substrate claim behind your decision 99, and what it still omits

Your `procedural-settlement-journal-06.md` decision 99 (Creative Director, 2026-08-16) rules that the
skeleton family is "recursive mode composition" — an ordered mode list, depth ≤ 3, each level
`Boundary | Spine`. Its original text rested on a substrate claim: "W5g's offset projection returns the
inner contour as an ordered ring, so a boundary pass's courtyard is a well-formed region for the next
level", and added that all-Boundary recursion "needs no new geometry — only the inner-ring recursion".
Both sentences are STRUCK in your journal the same day, corrected via this repository's session: "the
recursion unit is the PARCEL, not the interior residue … The parcel polygons are already well-formed
rings by the tiling identity, so the substrate claim survives with the correct input."

This repository's design doc records the correction it needs you to carry (decision 113 item 2 in
[recursive-subdivision-arc-journal-4.md](./recursive-subdivision-arc-journal-4.md); the text is
[recursive-skeleton-subdivision.md](./recursive-skeleton-subdivision.md) §"Downstream"): the
"courtyard is already a region" argument is **true of droste recursion and false of segment
recursion**. Droste recursion — peel the offset ring off, recurse into what is left — needs only the
offset contour. Segment recursion — recurse into the parcels/segments themselves — needs two things
the contour argument never supplies:

- **the merge pass** (design doc decisions 15–17): segments are merged toward an area target BEFORE
  they are recursed, expressed as run-fusion via `StripOptions.sameLogicalStreet` before any geometry is
  built, never as polygon union — [recursive-subdivision.ts](../../packages/core/src/straight-skeleton/recursive-subdivision.ts)
  header, "The strips tile the polygon they were DERIVED from";
- **the access-set generalisation** (design doc decisions 11–12): a child's boundary is entirely new
  geometry, and which runs of it carry access must be CARRIED as provenance at emission time, never
  recovered by proximity afterwards — [region.ts](../../packages/core/src/straight-skeleton/region.ts),
  `BoundaryProvenance` = `perimeter-access | perimeter-plain | ridge | cut | contour | lane | spine`.

Your struck-and-corrected text names the parcel as the unit but still says the substrate "survives with
the correct input". It does not survive without the two items above: a parcel handed to the next level
with all of its boundary treated as frontage produces lots fronting onto back fences, and the egress
invariant passes them (`region.ts` header, "Get this wrong in the obvious way"). Decision 99 also defers
trunk-and-branch and any recursion machinery to "the upstream port", so the correction costs nothing
now; it would cost a mode list once built. **Nothing in §1.1 is needed for rooflines** — see §7.

The word "droste" is this repository's; your journal does not use it. What your journal calls the
struck "residue model" is what this repository calls droste recursion, and the `leaf`+`recurse` stream
combination in `recursive-subdivision.ts` ("the droste reading proper") is the one implementation of it.

### 1.2 D1's "byte-identical" claim is withdrawn: the defensible claim is structural identity below 1e-13

Your register entry D1 says native results after normalisation are "byte-identical". Measured here
(session-1 journal F9, [recursive-subdivision-arc-journal.md](./recursive-subdivision-arc-journal.md)
lines 84–88): graph STRUCTURE is preserved exactly — node and edge counts, sources, targets,
completeness, diagnostics, `inEdges` as sets — but every derived quantity moves in the last ulps,
`basisVector` included, because it is computed FROM unit-space vertices. The claim to make in the
register is **structural identity with coordinates within 1e-13**, not byte-identity. Any golden you
record must be on denormalised output and compared structurally, with a coordinate tolerance.

### 1.3 The fixture rosters: `ALL_TEST_POLYGONS` no longer exists, and exclusion is retired

Your README says: 55 polygon constants, 37 in `ALL_TEST_POLYGONS`, 18 exported-but-excluded,
`SYMMETRICAL_OCTAGON` non-terminating, six of seven `NEAR_REGULAR_*` blocked, `SHORT_EDGE_PROMONTORY`
failing the 1e9 translation envelope. Every one of those statements is stale. What is true at `e88da1f`
([packages/test-fixtures/src/index.ts](../../packages/test-fixtures/src/index.ts), commit `f5039ea`):

- **`ALL_TEST_POLYGONS` is retired as a NAME, not re-pointed** (journal decision 74, user-ruled
  2026-08-28: "you're still laundering the meaning of 'ALL' in that name"). It was removed rather than
  renamed so that every stale reference — this port included — becomes a compile error instead of a
  silent semantic flip. Your `SkeletonFixtureCorpus.h` (`bSwept` = "member of the reference's
  ALL_TEST_POLYGONS") describes a set that no longer exists.
- **Three rosters:** `CLEAN_TEST_POLYGONS` (53 — every entry solves, tiles and subdivides; sweeps assert
  clean), `KNOWN_DEFECT_POLYGONS` (6 — each carries a measured, pinned signature), `FULL_CORPUS` (59,
  the concatenation). The sizes are asserted by
  [skeleton-containment.test.ts](../../packages/core/tests/straight-skeleton/skeleton-containment.test.ts)
  ("53 clean and 6 known-defect since 2026-08-28").
- **Exclusion is retired as a mechanism** (journal decision 72, user-ruled 2026-08-28: "That's still
  laundering though"). A defect fixture is ENROLLED and swept with everything else; clean fixtures
  assert clean, defect fixtures assert EXACTLY their pinned signature, so an unattributed failure and
  an unattributed cure both break the suite. A fixture leaves the defect roster by being fixed and
  promoted, never by a softened number.
- **The six defect fixtures and where each signature is pinned** (§4.3 has the numbers):
  `OFF_EDGE_JITTER_L_SEED_15838`, `OFF_EDGE_JITTER_L_SEED_55433`, `OFF_EDGE_JITTER_PLUS_SEED_7919`,
  `OFF_EDGE_JITTER_L_SEED_55433_K4` (near-floor off-edge jitter; census grid in
  `recursive-subdivision.test.ts`, causality in `wavefront-causality.test.ts`, sub-floor pairs in
  `graph-index-invariants.test.ts`, magnitude band in `along-edge-jitter-known-failures.test.ts`);
  `NEAR_REGULAR_CIRCLE_48`, `NEAR_REGULAR_ROSETTE5_40` (clean at native placement; each fails one
  translation regime in `large-coordinate-known-failures.test.ts`).
- **What happened to each fixture your README names:**
  - `SYMMETRICAL_OCTAGON` — PROMOTED to the clean roster 2026-08-28 (decision 73). Its "does not
    terminate in fuzz test" note was stale: re-measured, it solves with empty diagnostics and records no
    failed region on the census grid. Your `MaxSolveIterationsForVertexCount` comment cites it as the
    reason for the iteration cap; the cap is still a sound guard, but that example is dead.
  - `NEAR_REGULAR_CIRCLE_16`, `_CIRCLE_32`, `_PEANUT_32`, `_ELLIPSE_16`, `_ELLIPSE_32` — clean
    (promoted 2026-08-27/28 under decisions 64 and 65). `_CIRCLE_48` and `_ROSETTE5_40` — defect roster,
    on translation cells only. The two blockers your README cites (many-way-event offset projection;
    the 1e9 translation envelope) were re-measured dead on all eight historically excluded fixtures
    (journal F14, 2026-08-27).
  - `SHORT_EDGE_PROMONTORY` — PROMOTED 2026-08-27 (decision 64): its translation-to-1e9 blocker is dead
    and its normalisation round-trip drift is sub-ulp of extent.
  - `COLLINEAR_DUMBBELL` — added after your fork as an export-only pinned failure (`0616175`,
    2026-08-16: strips overlapped by a tenth of its area with `complete: true`), enrolled as a defect,
    then FIXED and promoted 2026-08-28 (decision 90, commit `c25c478`) with two variants,
    `ASYMMETRIC_DUMBBELL` and `THREE_GLOBE_CHAIN`.
- **Fixtures new since the fork** (all in `packages/test-fixtures/src/`): `rectilinear-shapes.ts`
  (`CROSS`, `T_SHAPE`, `GOLF_CART`, `ASYMMETRIC_DUMBBELL`, `THREE_GLOBE_CHAIN`),
  `slightly-deformed-peanut.ts` (two variants), `invisible-vertex-rectangle.ts`, `near-floor-jitter.ts`
  (four seeds), and `COLLINEAR_DUMBBELL` in `test-constants.ts`.
- By a hand count of `index.ts`'s exports there are now **67** exported polygon constants: 59 enrolled
  and 8 exported-but-unenrolled historical specimens (the three `CRAB_TEST_CASE*`, the three
  `loses-when-reflex-is-first-collision` constants, `SIMPLE_REFLEX`, `WHY_NO_COLLISION`) — clean today,
  with no defect signature to pin (decision 73 calls them "seven"; see §9).

### 1.4 The `fixtures.json` / `fixtures-manifest.json` sidecar is stale and must be regenerated

Your sidecar was parsed as text from the vendored `.ts` files at `e2544d4`. It is missing every fixture
in the "new since the fork" list above, its swept/excluded split encodes a roster that no longer exists,
and your `SkeletonFixtureCorpusSpec` asserts counts (55/37/18) that are wrong for the current package.
Regenerate it from the current `packages/test-fixtures/src` with THREE membership tags —
`clean`, `known-defect`, `unenrolled` — and carry the pinned signatures of §4.3 alongside the
known-defect entries, because a C++ sweep over the defect roster must assert those, not zero.

## 2. The divergence register, re-read against `e88da1f`

Your register's rule (roadmap decision 6 as amended): "a disagreement is a defect in the PORT unless it
appears in the divergence register". Read each entry against what the reference now does.

**D1 — Polygon normalised to unit extent per solve.** *The reference has caught up, and now differs
from you on one rule.* Normalisation landed here on 2026-08-16 (`789f790`), six days after your fork,
and was changed to a power-of-two scale the same day (`e057d2d`). Compare
[normalisation.ts](../../packages/core/src/straight-skeleton/normalisation.ts) with your
`SkeletonNormalisation.cpp`:

| | Reference (`e057d2d`) | Port (`SkeletonNormalisation.cpp:81-85`) |
|---|---|---|
| Measure | longest bounding-box side | longest bounding-box side — **same** |
| Centre | `min*0.5 + max*0.5`, halved before summing | same — **same** |
| Scale | `exponent = round(log2(side))`; `toUnitScale = 2**-exponent`, `fromUnitScale = 2**exponent`, both from the exponent | `ToUnitScale = 1/side`, `FromUnitScale = side` — **differs** |
| Normalised extent | in `[1/√2, √2]`, coordinates within about ±0.71 | exactly 1, coordinates in `[-0.5, +0.5]` |
| Degenerate guard | side must be a positive normal double; PLUS exponent clamped to `[-1022, 1022]` so both `2**e` and `2**-e` are normal | side must be a positive normal double — **same first half; no clamp** |
| Round trip | scaling exact unconditionally (power-of-two multiply touches only the exponent field); centring exact under Sterbenz (`c/2 ≤ p ≤ 2c`), i.e. away from the origin | your own header: "rounds once in each direction and is therefore NOT bit-exact" |

Why the reference moved to a power of two, in its own words (`normalisation.ts` header): "Scaling by an
arbitrary `1 / longestSide` rounds the mantissa twice — once going in, once coming out — and the two
roundings do not cancel"; and the reason it matters is recursion — "the recursive subdivision arc crosses
this seam once per level per sub-region … a round-trip error invisible in a single solve is injected at
every level boundary and compounds through the tree". Every tolerance argument you made survives the
change (the solver still never sees a magnitude outside order one). Adopt the exponent rule when you
port recursion; for single-level rooflines your rule is adequate but produces a different last bit, so
D1 must be re-worded: the two normalisations agree on measure and centring and differ on scale rule, and
the results are structurally identical, not byte-identical (§1.2).

**D2 — `FindOrAddNode` held-reference path.** *The register entry conflates two things; one was never a
divergence and the reference has since closed the other.* The dangling-`TArray`-reference half is a
property of C++ storage and is yours to guard (your D5 already says so). The NaN half — "a non-finite
position never matches even itself, so both implementations append" — was a real upstream hole at the
fork (`git show e2544d4:…/solver-context.ts`: `findOrAddNode` had no guard). It is closed:
[solver-context.ts](../../packages/core/src/straight-skeleton/solver-context.ts) `findOrAddNode` now
THROWS on a non-finite position (`d307547`, design-doc decision 24 — "a NaN position never compares equal
to itself under an absolute tolerance … appends a fresh node on every call"), and every entry point
rejects non-finite input at the door (`898538e`: `solveSkeleton` and `runAlgorithmV5` throw naming the
caller's vertex index; `runAlgorithmV5Stepped` reports it on `error`) — see
[algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts)
`nonFiniteVertexComplaint`. The epsilon inside `findOrAddNode` is FROZEN by measurement (journal F41,
audit constraint C1): widening it to the render floor "delivered every promised cure and broke four
independent axes at once" (F27), so it stays the arithmetic-equality backstop and geometric merging
happens at the event layer (§3.3). Your `SkeletonSolverContext.cpp:123-133` `FindOrAddNode` still has
no finite guard: add the `checkf` at the node and the input validation at the entry points.

**D3 — A failing sub-polygon ABORTS.** *Stands as a port choice; the set of conditions it fires on has
shrunk upstream.* Upstream semantics are unchanged since the fork: `stepAlgorithm` still catches per
sub-polygon and `solveSkeleton` folds the messages into `step-failure` diagnostics; `complete` is still
"no `step-failure`, no `unresolved-edges`, at least one interior edge". What changed is that three of
the throw sites you `checkf` on are now RESOLVED rather than thrown: an `identical-source` pair
terminates at the shared source (`d307547`), an all-parallel pair or triangle closes at its anchor
(`37aea38`, `a8ecbdf`), and the three-edge case is solved in closed form before any collision is
attempted (`35aed25`) — §3.4. Port those closures or your port will assert on inputs the reference now
solves, and `along-edge-jitter-known-failures.test.ts` records that the plus seed's ROOT solves only
because of them. One new diagnostic kind exists: `vertices-canonicalised` (informational; does not make a
result incomplete). Your `ESkeletonDiagnosticKind` lacks it.

**D4 — Self-intersecting input returns an empty graph with `complete: false`.** *Stands as a port
choice; no upstream change to that semantics.* Upstream still decomposes, solves, merges and returns
`context: null`, and `complete` can still be true on the merged path. Two mechanical changes you can
ignore under roadmap decision 9: the decomposition and merge now run in UNIT space (`789f790`), and
`makeMergedSolverContext` takes a `perceptualFloor` for shape only. One flagged item:
`graph-merge.ts:110`'s crossing-point deduplication is the ONE positional epsilon still evaluated in
caller space (F41), unmeasured — irrelevant to a port that refuses the path.

**D5 — Held references reduced to ids/values.** *Language-level; stands.* One upstream change is
adjacent to it: `inEdges` ORDER is now part of the value. `graph-helpers.ts` `addInEdges` (`898538e`)
sorts a node's `inEdges` ascending on every insertion, because `offset-projection.ts` dates a node from
the FIRST bisector incident to it and push order "moved under any arithmetic perturbation — 21 of 37
fixtures reordered a node's `inEdges` under a change of scale". Your `TerminateEdgesAtPoint`
(`SkeletonSolverContext.cpp:345`) and `CrossWireEdges` append unsorted. Not a divergence to register; a
delta to adopt (§3.10).

**D6 — `FMath::Sqrt(x²+y²)` for `Math.hypot` in `DistanceToSupportingLine`.** *Stands; still differs,
by the same argument.* Upstream `offset-projection.ts` still uses `Math.hypot` in its private
`distanceToSupportingLine` (lines 258–260 at `e88da1f`), and the new
`canonicalisation.ts` reuses `vertex-budget.ts`'s exported `distanceToSupportingLine`, also `Math.hypot`.
The unit-space argument that makes the two interchangeable is unchanged.

**An entry you carry in code rather than in the register:** your `SkeletonCoincidentEvents.h` records
that `ClusterCoincidentMerges` diverges from the reference by clustering on the TRANSITIVE CLOSURE with a
MEDOID representative (your journal-02 decision 30). The reference made the same change on 2026-08-16
(`b43bb5b`, design-doc decision 21), so that divergence is closed — but the reference then moved the
relation's BAR from `FLOATING_POINT_EPSILON` to the perceptual floor (`825ad19`, decision 78; §3.3), so
your "the relation and its tolerance are untouched" is now the entry that is behind.

## 3. The delta by mechanism

Grouped by mechanism, not by commit. Each block: what changed, the commit(s), the current source, and
whether your port has it (from the greps recorded in §9).

### 3.1 Unit-extent normalisation with a power-of-two scale — `789f790`, `e057d2d`

Covered in §2 D1. Source: [normalisation.ts](../../packages/core/src/straight-skeleton/normalisation.ts).
Applied exactly once at the boundary by all three entry points; `denormaliseGraph` walks nodes and
`maxOffset` only, never `basisVector`; `denormaliseCollisionCache` scales `offsetDistance`, `position` and
both `intersectionData` lengths; stepped snapshots are denormalised once each, deduplicated by object
identity because a single-sub-polygon merge returns its input by reference. The
`SkeletonSolveResult.normalisation` field carries the transform for downstream length inputs
(`normaliseLength` for depth/`minWidth`/`maxWidth`, `normaliseArea` for `minArea`/`maxArea`). **Port:
present, differs on scale rule.**

### 3.2 Input canonicalisation and the perceptual floor — `6ef6294`, `751d778`, `898538e`, `9008495`

New file [canonicalisation.ts](../../packages/core/src/straight-skeleton/canonicalisation.ts). After
normalisation and before winding/decomposition, every entry point removes boundary vertices whose
perpendicular deviation from the chord LINE between their neighbours is below a unit-space floor
(`SKELETON_NOISE_FLOOR = 1e-6`, the library default). The predicate is deviation, never turn angle; the
chord is the infinite line, never the segment (§3.11); removal is iterative to a fixed point, smallest
deviation first, ties to the lowest index; a ring is never reduced below three vertices; pinned indices
are exempt (for the recursion's access-run boundaries). Reported as a `vertices-canonicalised`
diagnostic with the removed count and the largest discarded deviation. `canonicaliseForSolve`
(`9008495`) returns the `indexRemap` so a caller can label the solved graph against its own input —
a dashboard inspection read a renumbered graph as "a primary bisector accepted with the wrong pair of
parent edges", and the graph was right every time.

Why it exists is not hygiene: "the solver has a standing defect on exactly-subdivided reflex polygons,
whose structural fix was written, landed, measured and then reverted" (your roadmap decision 22 records
the same fact). Removing the input class is the answer; it also stops recursion introducing fractal
complexity. **Port: absent.** For rooflines on player-drawn, RDP-reduced input this stage is what makes
the near-floor vertex classes go quiet (`along-edge-jitter-known-failures.test.ts` header table: 69/80
failing cells at magnitude 1e-6 with the stage off, 0/80 with it on).

### 3.3 Coincidence clustering: components, medoid, the render-floor bar, split positions — `b43bb5b`, `825ad19`, `a8ecbdf`

[coincident-events.ts](../../packages/core/src/straight-skeleton/coincident-events.ts).
`clusterCoincidentMerges` partitions one offset layer's interior-to-interior events into connected
components under "one event" and represents each by its MEDOID (member nearest the centroid, ties
lexicographic by position), ordered canonically by smallest edge id so node numbering never depends on
arrival order (`898538e`). **Your port already has the component/medoid half** (your journal-02
decision 30). Two things it does not have:

- **The bar is the perceptual floor, not the epsilon** (`825ad19`, journal decision 78, user-ruled on
  "can you see this on a screen?"): `isOneEvent(a, b, floor) = hypot(a−b) < floor`, a distance rather than
  a component box, with `floor` the client's (§5) carried on the solver context. The rejected first
  attempt widened `findOrAddNode` instead and put an edge running backwards in the wavefront clock (F27);
  merging at the event layer, before any node exists, is the whole mechanism.
  `assertMergePositionsAreDistinct` throws if two merges of one layer fall inside the floor of each other.
- **Splits get the same identity** (`a8ecbdf`, decision 85): `coincidentEventPositions` re-points the
  split/partition events of one layer at their component's medoid so `findOrAddNode` hands them one node
  — but only for components the epsilon does NOT already unify (touching the others moved a coordinate by
  one ulp on four clean fixtures for no gain).

### 3.4 The terminal closed forms — `35aed25`, `d307547`, `37aea38`, `a8ecbdf`, `4d12eac`

[algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts).

- **Three edges** (`solveTerminalTriangle`, design-doc decision 22): the meeting point and the wavefront
  clock are solved TOGETHER by Cramer's rule over the three distinct exterior parents' supporting lines
  (`n·P − t = n·A`, inward normal = `rotateCw90(basis)`), with no tolerance anywhere; falls through to the
  pairwise collision path only if the parents are not three, the determinant is zero (`areEqual`), or `t`
  is negative — each fall-through logged. "Across 785 measured terminals the determinant never fell
  below 0.106."
- **Two edges**: an `identical-source` verdict from `intersectRays` is a TERMINAL STATE — both edges
  terminate at the shared source (`d307547`, decision 23) instead of being discarded as "no collision"
  and throwing two lines later.
- **Degenerate closure** (`solveDegenerateClosure`, `37aea38`): a sub-polygon whose exterior parents are
  all parallel closes at the source of one surviving edge — the candidate stands only if every other ray
  passes through it travelling forward, no edge arrives before its own birth offset, and all arrival
  offsets agree. The anchor edge becomes a zero-length self-loop marked `culled` on `InteriorEdge` (new
  optional field), because edge ids are array indices and removal is not representable.
- **Parallel closure** (`solveParallelClosure`, `a8ecbdf`): same-direction parallel rays never meet, so a
  sub-polygon whose bisectors all point the same way has no future event and closes at its LEADING
  source, gated on the all-parents-parallel precondition ("without the gate this closes every
  large-coordinate cell … and reports them complete"). Both parallelism tests now sit at
  `DIRECTION_SINE_BAR` (`4d12eac`, decision 107(a), measured free: digest bit-identical on all 59).
- **`tryAttachEdgeToNode`** (the pair case's snap pre-pass) rejects a snap earlier than the bisector's
  birth offset and one whose node offset disagrees with the arrival offset, and asks point-on-ray of the
  RAW separation (§3.9).

**Port: none of these.** Your `HandleInteriorEdgeTriangle` collides the six ordered pairings and asserts
on no collision; your pair case cross-wires on `HeadOn` and on `CoLinearFrom1`. The second of those is
the F44 defect (§3.8).

### 3.5 Bisector direction is decided by the offset rate; the direction hint is deleted — `5bf7bda`, `c25c478`

[algorithm-helpers.ts](../../packages/core/src/straight-skeleton/algorithm-helpers.ts) `addBisectionEdge`.
Journal decision 70: "a wavefront bisector's offset rate is non-negative by definition". The rate is
`cross(basis, clockwiseParent.basis)` — the same factor `makeOffsetDistance` prices collisions with — so
the basis is `bisectedBasis` if the rate is positive, its negation if negative, and only where the rate
is zero (anti-parallel parents, a corridor) does `ensureBisectionIsInterior` decide. Before this, the
caller's `approximateDirection` could overrule the correct answer, and on `SLIGHTLY_DEFORMED_PEANUT_2` it
created a bisector with rate −0.0737 — running backwards in the wavefront clock. The hint was then
DELETED from `BisectionParams`, `collision-handling.ts` and `bisectionsForMerge` (`c25c478`, decision 90):
`bisectionsForMerge`'s hint was the bisection of the two ARRIVALS bracketing a gap, symmetric in them, so
a two-run event handed the same hint to both gaps, which face opposite ways — wrong for one by
construction. That is what fixed `COLLINEAR_DUMBBELL` (bar midline born pointing out of the bar, both
ends), `CROSS` (each arm's midline drawn along the opposite arm) and `T_SHAPE` (stem midline retired as
a self-loop). Where the rate is zero the ordered parent pair says which way the corridor runs: "`c` is the
answer, not a coin toss". The `parentsInverted` branch was collapsed to a log line: both branches
assigned identical values (mutation: an actual swap kills 559 tests).

**Port: absent** — your `FBisectionParams` still carries `TOptional<FVector2D> ApproximateDirection`
and `AddBisectionEdge` still takes it.

### 3.6 The n-gon partition fix (`GOLF_CART`) — `b7d5b63`

[algorithm-complex-cases.ts](../../packages/core/src/straight-skeleton/algorithm-complex-cases.ts),
`partitionSpan` and the same-start dedupe. Two simultaneous splits of ONE exterior edge at DIFFERENT
points (`GOLF_CART`: the T-shape with a slanted stem wall, both reflex bisectors striking the top edge at
the same offset) used to be deduped as nested re-reports of one split and threw `Partition sorting
failure`. Now: same-start events are re-reports only when they share the SPLIT NODE
(`keptSourcesByStart`); from different nodes they are distinct simultaneous splits and all survive;
events are sorted by span ascending then by clockwise index; and `partitionSpan` is
`(ws − cw + N) % N`. The old `(cw − ws + N) % N` was inverted, and "alone, either half of the fix converts
the loud failure into a silent wrong skeleton"
([golf-cart.test.ts](../../packages/core/tests/straight-skeleton/golf-cart.test.ts)).

**Port: absent** — `SkeletonAlgorithmComplexCases.cpp:81-84` has `(Clockwise − Widdershins + N) % N`,
sorts by clockwise index first, and keeps the first of each start with the `Partition sorting failure`
`checkf` (lines 361–389). This is the pre-fix code, and `GOLF_CART` is now in the clean roster: **the
port as it stands will hit that `checkf` on a fixture the reference solves.** Both halves of the fix
must land together — either half alone turns the loud failure into a silent wrong skeleton.

### 3.7 The split-event fix (deformed peanut) — `f442249`

[generate-split-event.ts](../../packages/core/src/straight-skeleton/generate-split-event.ts)
`reachesSupportingLine`. `intersectRays` reports `converging` only when both parameters are strictly
positive; the forward and reversed rays of the split edge share the edge's source vertex, so a bisector
aimed exactly at that vertex read `diverging` from both and the strike was discarded. It is now a legal
strike: `converging || (alongInstigator > 0 && areEqual(alongEdge, 0))`. Journal decision 69: both
`SLIGHTLY_DEFORMED_PEANUT` variants reported `complete: true` with empty diagnostics while a waist
bisector escaped the polygon (variant 2's terminal node 40 units outside a 410-unit shape). This is the
defect that motivated the containment sweep (§4.2). **Port: absent** (no `ReachesSupportingLine` or
`AreEqual(AlongEdge, 0)` in `SkeletonSplitEvents.cpp`).

### 3.8 Strict linear causality: arrival ordering, ulp moments, symmetric offsets, narrowing, leading-source closure — `cb7abfd`, `ae59a5f`

Journal decision 102 (user, 2026-08-29): "collision events are handled with a strict linear causality
(within the appropriate tolerance). Breaking that is a first-class bug." Five pieces:

1. **Arrival ordering** (`inArrivalOrder`, `algorithm-complex-cases.ts`): the pairwise fallback used to
   sort a layer by priority then edge id, which — because each event CONSUMES its edges — was a pairing
   rule that threw the offsets away. Events are now ordered by offset; the lexicographic tie-break
   (priority, then `collidingEdges`) applies only WITHIN one moment.
2. **Ulp moments** (`SIMULTANEOUS_ARRIVAL_ULPS = 64`): two arrivals are one moment if they differ by ≤64
   ulps of the larger — "a representation bar, not a geometric tolerance". The corpus's two live
   populations sit four orders either side: rounding noise at 1–few ulps, genuine separations at
   3.9e5–1.1e6 ulps (asserted as ratios in `arrival-ordering.test.ts`).
3. **`arrivalOffsetOfPair = max(offsetFromA, offsetFromB)`** (`collision-helpers.ts`): an event's offset
   was the INSTIGATOR's reading, so one physical arrival reached the solver as two events 9.03e-11 apart
   depending on which edge reported it, letting a ring's latest arrival present as earliest. Measured
   first that the walls are genuinely non-concurrent ("there is no truer offset to recover"), so the
   pair has met when the slower one arrives. Cost: five fixtures move a node coordinate by ≤2.3e-16 of
   extent; the other 54 are bit-identical.
4. **Earliest-arrival narrowing on refusal** (`earliestArrivalMoment`, `ae59a5f`): the layer window
   `collisionsToHandle` is an absolute `fp_compare` at 1e-8 on offsets of order 1e-1 — ~1e8 ulps wide —
   so when whole-event resolution REFUSED a layer (an edge claimed by two merges) the pairwise fallback
   consumed arrivals a million ulps apart as simultaneous. Now the refused layer is narrowed to its
   earliest 64-ulp moment and retried; at all four corpus refusal sites the narrowed set is one clean
   vertex event and the pairwise fallback is never entered. ONLY on refusal: narrowing unconditionally
   breaks the k-way hubs (30+ failures across ten suites — F27 restated).
5. **Leading-source closure of a collinear same-direction pair** (`handleInteriorEdgePair`,
   `ae59a5f`): a `co-linear-from-1` pair is NOT head-on — both rays run the same way along one line — so
   cross-wiring sent the leader BACKWARDS along its own basis and left two bisectors on a ridge that
   admits one (I5). The trailing edge now terminates at the leading source and the leader retires as a
   culled self-loop; no node moves. Reached exactly twice on the corpus at native placement (both on
   the plus seed), convicted by seven tests across five suites.

Results (F40, F44): all direction violations 0, I5 = 0 on every fixture (its pin table DELETED), folds
24 → 4, plus jitter 10/80 → 3/80, determinism sweeps green (1335/1335). **Port: none of the five** —
`SkeletonAlgorithmComplexCases.cpp:281-283` still `StableSort`s by priority alone;
`SkeletonCollisionHelpers.cpp:169-203` writes `OffsetDistance` from edge A only; the pair case
cross-wires `CoLinearFrom1` (`SkeletonAlgorithmTerminationCases.cpp:387`).

### 3.9 Named constants and the division-free predicate basis — `8fbf51c` (decisions 104, 105)

[constants.ts](../../packages/core/src/straight-skeleton/constants.ts),
[core-functions.ts](../../packages/core/src/straight-skeleton/core-functions.ts). Details in §5. The
mechanical delta: two new primitives `sineIsBelow(a, b, bar)` = `|cross(a,b)| < bar·|a|·|b|` and
`directionsAreSame(a, b, bar)` = `dot > 0 && sineIsBelow`, taking RAW vectors; two derived bars
`DIRECTION_SINE_BAR = ε` and `PARALLEL_GATE_SINE_BAR = sqrt(ε(2−ε))` = 1.4142e-4; `DEGENERATE_AREA_EPSILON`
hoisted to `constants.ts` from two duplicate declarations. Call sites converted: `intersectRays`' parallel
gate (was `areEqual(|dot|, 1)`) and BOTH collinearity exits (were a bare `1e-4` and the default `1e-8` on
normalised vectors — mirror images at bars four orders apart, F41's flagship find); `makeOffsetDistance`'s
no-gradient test; `ensureBisectionIsInterior`; `addBisectionEdge`'s zero-rate test; `tryAttachEdgeToNode`
and `solveDegenerateClosure`'s point-on-ray tests; `solveParallelClosure`. Strip and parcel literals named
(§3.13, §3.14). `sourceLiesAhead`'s `max(1, d)` hybrid is KEPT deliberately — the ruled relative form would
tighten it by eight orders on exactly the sub-unit pairs it exists for. Digest bit-identical on all 59.
**Port: absent** (no `SineIsBelow`/`DirectionsAreSame`; `SkeletonIntersection.cpp:44-48` has the
`SourceLiesAhead` hybrid, which is unchanged).

### 3.10 Determinism: sorted `inEdges`, canonical merge order, edge-id tie-breaks, input validation — `898538e`

`graph-helpers.ts` `addInEdges` (every insertion sorts ascending — §2 D5); `clusterCoincidentMerges`
returns merges ordered by smallest edge id with `edgeIds` ascending, so node ids are a function of the
polygon's vertex order (`NEAR_REGULAR_ELLIPSE_16/32` swapped two node ids between a polygon and the same
polygon scaled by 7 — decision 65); `compareEdgeIdLists` as the within-moment tie-break (`GOLF_CART`'s two
simultaneous splits swapped ids under a translation of 1e3); non-finite input rejected at entry (§2 D2);
the canonicalisation floor and the coincidence floor unified on one constant. **Port: absent** (no sort
in `SkeletonGraphHelpers.cpp`; `FCoincidentMerge.EdgeIds` "in FIRST-SEEN order").

### 3.11 The fold fix — `3ce94a7` (decision 100)

`canonicalisation.ts` measures deviation with the UNCLAMPED `distanceToSupportingLine` (added to
`vertex-budget.ts` beside the clamped `distanceToSegment`). The clamp measured a fold's LENGTH where the
stage's charter requires its WIDTH: a fold on `(seed 55433)`'s region `r0.10` measured 3.88× the floor
clamped and 3.3e-5× the floor unclamped. The root pairing defect was pinned loudly FIRST (the I5 sweep)
so the cure could not re-silence it. Census 55433 3 → 0, k4 11 → 7, plus 15 → 13; 39 surviving spikes on
the grid → 0. **Port: n/a until §3.2 is ported; then port the unclamped form from the start.**

### 3.12 Offset projection — `e30577a`, `331e0f4`, `d86602d`, `bb4ea8c`

[offset-projection.ts](../../packages/core/src/straight-skeleton/offset-projection.ts).
`computeNodeOffsets` now CANONICALISES the node-offset table: simultaneous mirror events on symmetric
input re-derive one instant as several offsets 7e-15 to 3.5e-13 apart (each node reads a different
parent's supporting line), and querying at the lowest left the others' bisectors alive by the table while
dead in the plane, dropping whole rings as `UnclosedChain`. Offsets are partitioned into connected
components in ONE dimension (sorted runs separated by a gap wider than
`SIMULTANEITY_RELATIVE_TOLERANCE = 1e-12` of the maximum offset — measured: widest within-instant gap
1.42e-15, narrowest genuine gap 1.23e-4, eleven orders apart) and each set collapses onto its member
nearest the mean. "No slack was added to any comparison, and none is admissible": every lifetime
comparison stays bit-exact, which is the birth-equals-death contract your D6 and your contraction pin
protect. `collectAliveBisectors` and `AliveBisector` are exported as the single derivation of "which
bisectors carry the wavefront at an offset". **Port: absent** (no simultaneity handling in
`SkeletonOffsetProjection.cpp`).

### 3.13 Strip decomposition — `9f38838`, `8fbf51c`

[strip-decomposition.ts](../../packages/core/src/straight-skeleton/strip-decomposition.ts) `traceFace`.
Faces are traced BY PARENTAGE FIRST (journal decision 77): the face of exterior edge `e` is bounded by
exactly the bisectors naming `e` as a parent (`faceIncidence`), and the angular sharpest-turn walk is only
the tie-break where two of the face's own edges leave one node, and the fallback where parentage does not
close. On `OFF_EDGE_JITTER_L_SEED_15838` a `[2,7]` bisector left node 24 **5.2e-6 radians** from the
`[1,7]` spine — the angular walk took the wrong branch, two walls' faces fused, and the strips covered
160% of the polygon with `complete: true` and zero causality violations. Self-loops (`culled` edges) are
excluded from incidence. The single `EPSILON = 1e-9` that served four spaces is split into
`CLIP_DEPTH_EPSILON`, `FRONTAGE_SCALE_FRACTION`, `CUT_FRACTION_EPSILON` and `SEGMENT_CROSS_SINE_EPSILON`,
values unchanged. **Port: absent** — `SkeletonStripDecomposition.cpp:230` `TraceFace(Adjacency, …)` is
the angular walk.

### 3.14 Parcel slicing — `8fbf51c`

[parcel-slicing.ts](../../packages/core/src/straight-skeleton/parcel-slicing.ts). Nine inline literals
became named constants with their space and claim written where they live; VALUES UNCHANGED. Two are
flagged as unmeasured: `FRONTAGE_VERTEX_FRACTION = 1e-7` (two orders looser than everything else, no
recorded reason) and `RAY_SEGMENT_DETERMINANT_EPSILON = 1e-15` (the one bar in the file that is not
scale-free). No behavioural delta for the port; adopt the names.

### 3.15 The six files new since the fork

- [normalisation.ts](../../packages/core/src/straight-skeleton/normalisation.ts) — §3.1. **Needed for
  rooflines; you have it** (differing scale rule).
- [canonicalisation.ts](../../packages/core/src/straight-skeleton/canonicalisation.ts) — §3.2, §5.
  **Needed for rooflines**: it is the front half of the tolerance model and the reason the near-floor
  jitter classes are quiet.
- [region.ts](../../packages/core/src/straight-skeleton/region.ts) — a region with its boundary
  PROVENANCE: `BoundaryRun`s partitioning the edge ring exactly, `makeRootRegion`, `remapRuns` (carries
  runs through canonicalisation's `indexRemap`), `runBoundaryVertexIndices` (the pinned vertices).
  Plain data plus free functions because values are `structuredClone`d to workers. **Recursion only;
  not needed for rooflines.**
- [skeleton-tree.ts](../../packages/core/src/straight-skeleton/skeleton-tree.ts) — the solved skeleton as
  a weighted undirected graph (`buildSkeletonTree`, `skeletonTreeDiameter`): adjacency, degree, leaves,
  lengths, per-node offsets copied from `computeNodeOffsets`, `isTree` reported rather than assumed;
  culled self-loops excluded, unmarked self-loops kept and flagged. **Spine/recursion substrate; not
  needed for rooflines.**
- [spine.ts](../../packages/core/src/straight-skeleton/spine.ts) — three candidate spine definitions over
  the tree (`diameter`, `wavefront-time` fraction, `whisker-prune` fraction), all kept, none privileged,
  `componentCount` reported never repaired (design-doc decisions 26–30). **Spine mode only — your
  decision 99 defers it to this repository; not needed for rooflines.**
- [recursive-subdivision.ts](../../packages/core/src/straight-skeleton/recursive-subdivision.ts) — the
  driver: `solveSkeleton → computeStrips at depthFraction × computeMaxOffset → recurse`, one `LevelSpec`
  per level, two child streams (segments and residue rings, plural), the root floor passed down in each
  region's unit space, failure recorded as data on the node, `canonicalAreaDrift` reported. **Deep
  recursion; waits on §7's open item; not needed for rooflines.**

### 3.16 File map

| TypeScript (`packages/core/src/straight-skeleton/`) | Port (`Geometry/Skeleton/`) |
|---|---|
| `types.ts` | `SkeletonTypes.h` |
| `constants.ts` | `SkeletonConstants.h` |
| `core-functions.ts` | `SkeletonCoreFunctions.h/.cpp` |
| `graph-helpers.ts` | `SkeletonGraphHelpers.h/.cpp` |
| `solver-context.ts` | `SkeletonSolverContext.h/.cpp` |
| `intersection-edges.ts` | `SkeletonIntersection.h/.cpp` |
| `algorithm-helpers.ts` | `SkeletonAlgorithmHelpers.h/.cpp` |
| `collision-helpers.ts` | `SkeletonCollisionHelpers.h/.cpp` |
| `collision-handling.ts` | `SkeletonCollisionHandling.h/.cpp` |
| `generate-split-event.ts` | `SkeletonSplitEvents.h/.cpp` |
| `coincident-events.ts` | `SkeletonCoincidentEvents.h/.cpp` |
| `algorithm-complex-cases.ts` | `SkeletonAlgorithmComplexCases.h/.cpp` |
| `algorithm-termination-cases.ts` | `SkeletonAlgorithmTerminationCases.h/.cpp` |
| `polygon-decomposition.ts` | `SkeletonPolygonDecomposition.h/.cpp` |
| `normalisation.ts` | `SkeletonNormalisation.h/.cpp` (+ `FSkeletonNormalisation` in `SkeletonTypes.h`) |
| `offset-projection.ts` | `SkeletonOffsetProjection.h/.cpp` |
| `strip-decomposition.ts` | `SkeletonStripDecomposition.h/.cpp` |
| `parcel-slicing.ts` | `SkeletonParcelSlicing.h/.cpp` |
| `graph-merge.ts` | no counterpart (roadmap decision 9, by design) |
| `canonicalisation.ts` | **no counterpart yet** (needed for rooflines) |
| `region.ts` | no counterpart yet (recursion) |
| `skeleton-tree.ts` | no counterpart yet (spine/recursion) |
| `spine.ts` | no counterpart yet (spine mode) |
| `recursive-subdivision.ts` | no counterpart yet (deep recursion) |
| `debug-helpers.ts`, `logger.ts` | no counterpart |
| `../stroke-spline/vertex-budget.ts` (`distanceToSupportingLine` added) | your stroke port, outside this directory |

## 4. The invariant conformance kit

Tests are in `packages/core/tests/straight-skeleton/`. Your README's principle stands: invariant tests
port across a reimplementation without translation; coordinate-literal tests are guidance. Two rosters
mean two bars: over `CLEAN_TEST_POLYGONS` an invariant is asserted at ZERO; over
`KNOWN_DEFECT_POLYGONS` each fixture asserts its PINNED signature, firing in both directions. Which
invariants are universal was MEASURED (decision 72(c)): containment, the bisector rate rule and
signalled-not-silent hold over `FULL_CORPUS`; wavefront causality (offset monotonicity), clearance and
edge direction do NOT hold over the defect roster as an asserted invariant, and their violation counts
are part of the signatures.

**Stated plainly: the wavefront-causality test is still the acceptance gate ONLY over the clean
roster.** Over the defect roster it is a signature table, not a gate — and as of `ae59a5f` (2026-08-29)
every row of that table reads `{offset: 0, clearance: 0, direction: 0}`, kept "because it is the
instrument that measured the cure and the one that will see a relapse". A C++ sweep must keep the two
bars separate exactly as the reference does.

### 4.1 Wavefront causality — [wavefront-causality.test.ts](../../packages/core/tests/straight-skeleton/wavefront-causality.test.ts)

Four checks, offsets RE-DERIVED from geometry (perpendicular distance from each node to the supporting
line of the clockwise parent of its first incident bisector, read off the SOLVED graph's exterior nodes —
never the caller's array, because canonicalisation renumbers; six pinned violations were the oracle's
own before that correction, decision 75):

1. **Offset never decreases along a skeleton edge** (`target ≥ source − 1e-6`). Clean: zero. Defect: pinned.
2. **Rate rule — `cross(basis, clockwiseParent.basis) ≥ 0` for every bisector.** UNIVERSAL: asserted at
   zero over `FULL_CORPUS`, both rosters, in one test. Decision 70's invariant.
3. **Clearance — no node lies beyond its own offset from any boundary edge.** Clean: zero. Defect: pinned.
4. **Direction — no edge terminates behind its own source.** Clean: zero. Defect: pinned.

Porting note: re-derive, never read the solver's bookkeeping; index the parent edge into the graph the
solver produced. Your `SkeletonCausalityAudit.h` already does the re-derivation; add the rate check and the
two-roster structure.

### 4.2 Containment — [skeleton-containment.test.ts](../../packages/core/tests/straight-skeleton/skeleton-containment.test.ts)

Every interior node lies inside the polygon it was solved from. `FULL_CORPUS`, one bar, and a second
test asserts the corpus needs NO tolerance band at all (zero nodes lean on it). Written for the deformed
peanut (§3.7). Weaker than causality (caught none of the causality damage) and kept universal for that
reason.

### 4.3 The graph-index invariants I1–I5 — [graph-index-invariants.test.ts](../../packages/core/tests/straight-skeleton/graph-index-invariants.test.ts)

All five sweep `FULL_CORPUS`.

- **I1 — a primary bisector's parents are its own vertex's two edges** (`[v, v−1]`), AND
  `interiorEdges[i].id === numExteriorNodes + i` (the shared index space your `SkeletonTypes.h` calls
  load-bearing). No pins.
- **I2 — no two nodes inside the coincidence floor (1e-6, unit space, as a DISTANCE) of each other.**
  Pinned pairs: seed 15838 `[[19,21]]`; seed 55433 `[[19,20],[24,26]]`; seed 55433 k=4 `[[27,29]]`;
  56 fixtures carry none. Each surviving pair is joined by a REAL skeleton edge (lengths 1.9e-7 to
  7.3e-7 in unit space) — causally ordered micro-structure, not a merge the clustering missed (decision
  92: contracting it is a presentation-layer job, parked).
- **I3 — every bisector's source is equidistant from its two named parents**, bar `1e-9` unit space.
  Clean roster holds below 1e-15; exactly one fixture leans on the headroom, k=4 at 8.34e-12 (the
  cost of resolving its split pair to the medoid), pinned as a set.
- **I4 — face-closure walkability** (user-ruled decision 93): from either end of every exterior edge, the
  other end is reachable walking only that edge's own bisectors. No pins; convicted by deleting a shaft
  midline, which reproduces the dumbbell's recorded signature.
- **I5 — two bisectors span the same node pair only where their parents are parallel** (a corridor
  midline legitimately carries two half-edges). No pins — the table was DELETED at zero (F44); 15
  legitimate mid-line pairs across nine fixtures are asserted seen, so the filter is not blindness.

Porting note: I1 is an index-space assertion you can run after every `AddBisectionEdge`; I2 needs the
solve's normalisation to measure in unit space; I3/I5 need `PARALLEL_PARENTS_BAR`-style sine tests
(§5); I4 is a graph walk over `faceIncidence` (§3.13).

### 4.4 Tiling — [strip-tiling.test.ts](../../packages/core/tests/straight-skeleton/strip-tiling.test.ts)

At depth fractions 0.2 and 0.5 of `computeMaxOffset`, strip areas plus residue ring areas equal the area
of the polygon THE SOLVER SOLVED (the graph's exterior ring, not the caller's — canonicalisation moves
5.17e-7 of area on seed 15838), to `1e-14` (ten times the corpus's worst, 8.52e-16). `FULL_CORPUS`. Two
pinned cells, both the medoid-displacement mechanism: seed 15838 `7.36e-13`, seed 55433 k=4 `1.78e-12`.
`UNMEASURABLE` is empty (the plus seed's root now solves and tiles at 1.46e-16). This is your roadmap
decision 7's numeric gate; the corpus achieves machine precision, so hold it there.

### 4.5 Folds — [region-boundary-folds.test.ts](../../packages/core/tests/straight-skeleton/region-boundary-folds.test.ts)

Recursion-only. No region handed to a solve retains a vertex whose unclamped chord-line deviation is
below the ROOT floor restated in the region's unit space; `FULL_CORPUS` over the census grid (depths
0.25/0.6/1.0 × merge groups 1–4 to `MAX_RECURSION_LEVELS`). Spikes: 39 → 0 under the fold fix. Folds
handed in by the cutter (kept above-floor-to-segment but below-floor-to-line): `FOLDS_HANDED_IN = 4`, all
on the plus seed, expected to fall. Not needed for rooflines.

### 4.6 The census and the translation envelope

- [recursive-subdivision.test.ts](../../packages/core/tests/straight-skeleton/recursive-subdivision.test.ts)
  `CENSUS_SIGNATURES` (failed regions on the grid): 15838 **0**, 55433 **0**, plus **15**, k=4 **7**,
  Circle 48 **0**, Rosette5 40 **0**. Every remaining count is a decision-96 `Degenerate region` decline
  of a 5e-8–8.5e-7-area sliver ("a sensible tiler knows not to try and slice a tile narrower than a
  certain size"), not a failed solve. Recursion-only.
- [large-coordinate-known-failures.test.ts](../../packages/core/tests/straight-skeleton/large-coordinate-known-failures.test.ts):
  Circle 48 survives translations `[1e5..1e9]` and none above (monotonic since decision 78); Rosette5
  40 survives all but `1e11`, dying LOUDLY (`step-failure` + `unresolved-edges`, two edges) in a two-edge
  base case whose sources sit 7.24e-8 apart in unit space. Both accepted by construction (decisions 66,
  81: the disputed geometry is under two ulps of the quantised input). Both survive every scale in
  `[1e-6..1e8]`. Your roadmap's "1e8 wrong-skeleton" (backlog item 1) is gone: everything below 1e10 on
  every fixture is clean.

### 4.7 Supporting sweeps worth porting

`silhouette-invariance.test.ts` (design-doc decision 8), `in-edge-ordering.test.ts`,
`arrival-ordering.test.ts`, `angular-predicate-basis.test.ts` (32 tests: derivation, scale-freedom,
isotropy, mirror symmetry), `perceptual-floor-option.test.ts` (omitting the option is byte-identical),
`terminal-cases.test.ts`, `coincident-events.test.ts`, `normalisation.test.ts`, `canonicalisation.test.ts`.

## 5. The tolerance model, as the port-first design

Ruled 2026-08-29 (decisions 101, 104, 105, 106), landed in `8fbf51c` and `4d12eac`. Port this as a
design, not as a diff, because it is what makes the rest of §3 mean one thing at every site.

**5.1 The premise (decision 101, user).** "The measure of a tolerance's value is whether it normalizes
minimum-perceptual-difference for the system it serves." Two skeleton nodes that do not visibly separate
at any zoom are a first-class numerical defect regardless of which pairing produced them; downstream
defects caused by two thresholds "that aren't conceptually agreeing on what is signal and what is noise"
are artefacts of having two.

**5.2 Exactly two geometric constants, two questions** (audit F39 found the epsilon applied at 22 sites
in six spaces):

- `FLOATING_POINT_EPSILON = 1e-8` answers "can the ARITHMETIC tell these apart?" — a property of
  doubles, never of a viewport. Still absolute; still relative by construction via unit extent.
- The perceptual floor (`SKELETON_NOISE_FLOOR = 1e-6` library default, unit space) answers "can anything
  that will ever look at the skeleton tell these apart?" It reaches exactly TWO production bars:
  canonicalisation's deviation bar and the coincidence-clustering `isOneEvent` bar. Everything else stays
  a module constant for a stated reason (`canonicalisation.ts` `PerceptualFloorOptions` doc).

**5.3 Magic numbers: none (decision 104).** Every inline tolerance either derives from one of the two
constants with its derivation written at the site, or is a named constant carrying its space and its
signal-vs-noise claim. The two that carry no measurement are flagged as such (§3.14).

**5.4 One predicate basis (decision 105, user).** "A single value must never receive different verdicts
depending on which code path reached the predicate." Mechanism: every angular comparison is restated in
division-free relative form, `|cross(a,b)| < bar·|a|·|b|`, never normalise-then-compare — because
"vector equality is subtraction (benign), while normalized-orthogonality requires division that explodes
zero-tending inputs". The two bars are DERIVED, not chosen: `DIRECTION_SINE_BAR = ε` (identity:
"does this point lie on that ray") and `PARALLEL_GATE_SINE_BAR = sqrt(ε(2−ε)) = 1.4142e-4`, the EXACT
sine-space restatement of the old `areEqual(|dot|, 1)` (a conditioning gate guarding `intersectRays`'
division by the sine). Collapsing them onto one number was tried both ways and refused by measurement:
gate→1e-8 moves every pinned large-coordinate signature; identity→1.41e-4 stops `(seed 55433, k=4)`
solving. Both are declared in `constants.ts` with the derivation; the four orders between them are
load-bearing and documented as an open disagreement.

**5.5 The client sets the floor (decision 106, user).** "The solver must not create geometry the client
will throw away." `PerceptualFloorOptions.perceptualFloor` on `SolveSkeletonOptions` (and on
`runAlgorithmV5`/`runAlgorithmV5Stepped`), resolved once by `resolvePerceptualFloor`, carried on the
solver context as `perceptualFloor`; the cluster functions take it as a REQUIRED parameter so a missed
call site cannot become a second tolerance system. The value is DERIVED, never picked. The demo's chain
([perceptual-floor.ts](../../packages/dashboard/src/scene/perceptual-floor.ts)): 2 CSS px (two 1px marks
with a 1px gap) ÷ zoom cap 100 = 0.02 world units ÷ reference world extent 2000 = **1e-5** of the shape's
extent, 10× coarser than the library default. At 1e-5 the four jitter fixtures collapse onto their
underlying clean shapes and the parcel numbers round exactly (75.00082 → 75; F43). Omitting the option is
byte-identical to the pre-option solver on all 59 fixtures (F42).

**Porting order.** (1) `SineIsBelow`/`DirectionsAreSame` and the two bars, converting the sites listed
in §3.9 — digest must stay bit-identical, which is your conformance gate for the step. (2) Canonicalisation
with the unclamped deviation (§3.2, §3.11). (3) The perceptual floor threaded to the two bars, with your
own derivation from your renderer's zoom cap and reference extent — a different client "runs this same
arithmetic and gets a different number". `SolveSkeletonOptions.noiseFloor` is the recursion driver's
region-space pass-down, not a second floor; leave it alone for rooflines.

## 6. The residual register

**Empty at the library floor** (F44, 2026-08-29): "Known-wrong root graphs at the library floor: ZERO.
The residual register for the C++ handoff is empty, and it emptied by causality, not by new machinery."
The two mechanisms, quoted:

1. "earliest-arrival narrowing — the fp_compare layer (~1e8 ulps wide) consumed arrivals a million ulps
   apart as simultaneous; the whole-event resolution now runs on the full layer first and, on refusal
   (an edge claimed twice), narrows to the earliest 64-ulp arrival moment and retries — at all four
   corpus refusal sites the narrowed set is one clean vertex event and the pairwise fallback is never
   entered";
2. "the `co-linear-from-1` cross-wiring corrected to the leading-source closure (same-direction rays
   are not head-on; cross-wiring sent the leader backwards by construction)".

Unmoved, honestly (F44): the recursion census's 22 decision-96 sliver declines, the four I2 sub-floor
pairs, k=4's 8.34e-12 I3 lean, the four folds handed in, and the two large-coordinate cells accepted
by construction. None is a wrong root graph.

## 7. What is send-ready and what waits

**Rooflines are send-ready.** Everything in §3.1–§3.14 and §5, plus the kit in §4.1–§4.4 and §4.6–§4.7,
applies to a single-level solve → offset projection → strips → parcels pipeline, and the corpus is
clean at the library floor: 53 clean fixtures at zero on every invariant, six defect fixtures whose
signatures are all either zero or accepted declines, all direction violations zero, I5 zero
everywhere, tiling at machine precision. Core suite 5249/5249 (83 suites) at the session-4 bootstrap
(`recursive-subdivision-arc-journal-4.md` §2).

**Deep recursion waits on the root-floor reconciliation package** — the last STRUCTURAL open item,
session-3 journal §4 item 1. Its four exhibits, quoted:

1. "the F38a inversion (a floor-removed vertex making a solvable region unsolvable — now seen three
   independent times, incl. r0.1.3 at the demo floor)";
2. "decision 76's near-flat rectangle (drift 2.3e-10 vs the 1e-14 bound)";
3. "decision 79's gate on seed 15838's promotion (5.17e-7 area drift vs the same bound)";
4. "F27's sliver-ratio table (any pass-down design must survive ratios to 5e5)".

"Acceptance criteria, pre-ruled: the near-flat rectangle enrolls, 15838 promotes, r0.1.3 resolves at
the demo floor, and the drift bound gets a ruled space." Until it lands, `recursive-subdivision.ts`,
`region.ts` and the per-level floor pass-down are reference material, not a contract, and your decision
99's "recursion arrives with the upstream port" stands. `skeleton-tree.ts` and `spine.ts` are stable
substrate but only useful once spine mode is wanted.

## 8. Weighted offsets (design ratified, implementation pending)

**Status, plainly: the design is ratified and NO implementation has landed.** The contract is
[weighted-offsets-decisions.md](./weighted-offsets-decisions.md) (rulings W1–W53), ratified as arc
decision 114 in [recursive-subdivision-arc-journal-4.md](./recursive-subdivision-arc-journal-4.md)
with decisions 115–119 resolving its open items. This section summarises it for a C++ reader; it will
be revised with measured results once the TypeScript lands and its digest and fixtures are pinned.
Nothing here is needed for unweighted rooflines.

**Input surface (W1–W4, decision 119).** `weights?: readonly number[]` on `SolveSkeletonOptions` (and
on `runAlgorithmV5`/`runAlgorithmV5Stepped`), one entry per input vertex: `weights[i]` is the speed of
exterior edge `i` (vertex `i` → `i+1`). Absent or empty means all ones. Checked at the door beside
`assertVerticesAreFinite`, each refusal a thrown `Error` naming the index: length must equal the vertex
count; every weight finite and strictly positive (zero/infinite weights are gables, a post-process,
never solver input); `max/min ≤ MAX_WEIGHT_RATIO`. Weights are then normalised so the minimum is
exactly `1` (all-ones divides by `1.0`, exact) and stored on the graph as `exteriorWeights`, plain data,
DIMENSIONLESS — the unit-extent transform never touches them (W47).

**Offset means time (W5–W8, W18, W22–W26).** Every field today called an offset — `offsetDistance`,
`maxOffset`, `computeNodeOffsets`, `computeOffsetRings`' argument, `StripOptions.depth` — becomes the
wavefront clock, `time = distance / weight`. `makeOffsetDistance` and `sourceOffsetDistance` are NOT
changed: they keep computing the perpendicular DISTANCE from the clockwise parent's line, and that
distance is paired with that parent's weight as `Arrival {distance, weight}`. Every tolerance decision
reads the PAIR, division-free: `compareArrivals(a, b, ε) = fp_compare(a.distance·b.weight,
b.distance·a.weight, ε·a.weight·b.weight)` — the exact restatement of `|a/wa − b/wb| < ε` — and the
single rule W26 covers the rest: an absolute epsilon applied to a weight-scaled quantity is multiplied
by the same weight product that scaled it (`meetHeadOn`'s cancellation test, the direct strike's
divisor, the phantom test, the layer window, the 64-ulp simultaneity bar). `arrivalOffsetOfPair`'s `max`
becomes `laterArrival` (the pair whose `distance·other.weight` is larger). Decision 102's linear
causality is restated over time unchanged.

**The kernel (W9–W11).** The vertex velocity solves `v·n₁ = w₁`, `v·n₂ = w₂` with `n = rotateCw90(basis)`
the inward normal, `c` the clockwise parent basis, `b` the widdershins parent basis:
`v = (w₂·c − w₁·b) / (c × b)`. The determinant is the sine of the turn; its two zeros are today's two
degenerate cases (straight vertex: consistent only at `w₁ = w₂`; anti-parallel: the corridor end,
direction `c` at constant time, W14). The rate along the trace is `1/|v|` against BOTH parents — the
equi-time property that replaces "equidistant"; at unit weights it is today's `bisectorOffsetRate`.
Decision 70's sign rule survives verbatim: the rate is `w_cw·(c × b)/|numerator|`, so convex keeps the
numerator, reflex negates it, and "a bisector's rate is non-negative" becomes a theorem (W13).

**The bisector spelling is prescribed (W12, W52(i)) — port it exactly:**
`normalize(w_ws · c − w_cw · b)`, i.e. the kernel's numerator normalised, with today's zero-length
fallback. At unit weights this is bit-identical to today's `makeBisectedBasis(c, −b)` by construction
(`1.0·c` is `c`; `c − b` is `c + (−b)` in IEEE-754) — measured 0 mismatches on 200 000 random vertices
and re-run by the lead (decision 114). **The Cramer spelling — divide by `det`, then normalise — is
PROHIBITED**: it is 0–3 ulps off today's bits (31 % bit-identical over 100 000), and only the scaled
difference matches the unit-weight reference bit for bit; the naive `normalize(rotateCw90(c + b))` is
catastrophic near a straight vertex (`4.2e11` ulps at a turn of `1e-6`). The three-line terminal solve
changes only its third column, `−1` → `−w` (W28, W52(iv)); a triangle over two same-facing parallel
parents is then REGULAR at unequal weights and returns the point where the faster wall overtakes the
slower (W29), which is the event that makes `solveParallelClosure`'s no-future-event premise false
under weights (W32).

**The two door guards (W48–W49, decision 119).** (1) `MAX_WEIGHT_RATIO = 100`, DERIVED, not picked:
after normalisation the fastest edge has weight `R`, so the solver's absolute time window
`FLOATING_POINT_EPSILON = 1e-8` is a distance window of `R·1e-8` on that edge; at `R = 100` that reaches
`SKELETON_NOISE_FLOOR = 1e-6`, beyond which the solver would fuse as one moment two arrivals the
client's floor calls two things. So `MAX_WEIGHT_RATIO = SKELETON_NOISE_FLOOR / FLOATING_POINT_EPSILON`.
The ladder `R ∈ {10, 30, 100, 300}` is run and reported so the runtime can move it with a measurement in
hand. (2) The ratio does NOT bound the vertex speed: at `w₁ ≠ w₂` and a vanishing turn `|v| →
|w₁ − w₂|/φ`, unbounded for any ratio (measured `|v| = 1.5e7` at a turn of `1e-6` with weights
`(1, 16)`). The guard is angular: a vertex whose two weights DIFFER and whose `|c × b|` is below
`PARALLEL_GATE_SINE_BAR` (1.4142e-4, the existing conditioning gate — §5.4) is refused by a thrown
`Error` naming the vertex, BEFORE canonicalisation runs (decision 124(b)). Unit weights never reach
either guard.

**Model invariant (decision 124, user-ruled 2026-09-10).** State this in the port, because the port's
runtime is where the stitched features will be built: **the base of the roof lies in a single plane;
no roof-perimeter vertex lies outside that plane; anything that must violate it — dormers are the
named example — is a separate feature stitched into the roof solution the skeleton produced, never a
skeleton input.** The user's reason, in one sentence: otherwise "we might as well take any arbitrary
3D polyline and try to make a straight skeleton from it, which is a manifestly more difficult
problem." Consequences for the contract: a weight change is permitted only at a VISIBLE corner — the
turn-sine guard above is a refusal, not a convention (a vertex whose two weights differ and whose
`|c × b|` is below `PARALLEL_GATE_SINE_BAR` is refused at the door with an error naming the vertex);
zero and infinite weights stay out of contract (gables are a post-process); there is no riser
convention, no zero-length edge, and no dormer solve — a configuration the weighted skeleton cannot
make well-posed without an extra convention is outside the contract, not inside it with a convention
bolted on. A weight-change vertex that passes the door has a visible turn, is structural, and is
pinned through canonicalisation's `pinnedIndices` so a sub-floor chord deviation never merges it in
either direction (decisions 120, 124(c)); the kernel there is conditioned by the turn, which the door
has already bounded. The "dormer square" fixture is a refusal conviction, not a solved shape.

**Root-only in the first landing (W46, decision 118).** Weights apply to the ROOT solve only;
sub-region solves run at unit weight, so the recursion census signatures are unmoved by
construction. When boundary provenance exists the policy is: perimeter and contour runs inherit the
parent edge's weight, ridge and cut runs take weight one.

**Port-first notes, carried from the spec's "C++ port notes" (W52).** (i) The kernel is the 2×2 solve
your `marchDirection` equivalent already has; the bisector direction is the scaled difference,
normalised, NOT the Cramer quotient. (ii) Store times as `distance / weight` but decide every tolerance
on the pair by cross-multiplication with the epsilon scaled by the weight product. (iii) Normalise
weights to minimum `1`. (iv) The three-line terminal solve replaces `−1` by `−w` in the third column and
nothing else. (v) The claim you can make against the reference stays structural identity below `1e-13`
(§1.2); the full-graph digest (W51, decision 116: a SHA-256 over the denormalised graph of all 59
fixtures, landing FIRST as its own commit before any weighted change) is the reference's bar, not the
port's. Two amendments to know: decision 115 replaces the incenter fallback of the split path (W21)
with the linear equi-time form even at unit weights — the one site whose unit-weight bits will move,
by ulps, attributed pin by pin — because branching on unit weights is forbidden (W36); and weighted
fixtures live in their own roster `WEIGHTED_TEST_POLYGONS` (W50), never in `FULL_CORPUS`.

## 9. Flags: what this document interpreted

- **§1.1** — "droste" is this repository's term; your journal's decision 99 never uses it. I read your
  same-day "recursion unit is the PARCEL" correction as partially discharging the substrate point and
  still omitting the merge pass and access provenance, on the strength of its own sentence "the
  substrate claim survives with the correct input". If you read your correction as already covering
  those, say so and the §1.1 item shrinks to a pointer at `region.ts`.
- **§1.3** — 67 exported polygon constants is a hand count of `packages/test-fixtures/src/index.ts`'s
  export statements; the 8 unenrolled specimens are 67 − 59. Journal decision 73 says "seven"; I count
  eight and have not reconciled the discrepancy.
- **§2, §3 "Port: absent/present" verdicts** — from a read of your public headers plus greps of your
  `.cpp` files for the reference's identifiers (`SineIsBelow`, `DirectionsAreSame`,
  `ArrivalOffsetOfPair`, `SolveTerminalPoint`, `DegenerateClosure`, `ParallelClosure`,
  `ReachesSupportingLine`, `Canonicalis`, `PerceptualFloor`, `CoincidentEventPositions`, `Simultane`,
  `Sort` in graph helpers), and a read of `SkeletonNormalisation.cpp`, `SkeletonSolverContext.cpp`
  `FindOrAddNode`, `SkeletonCollisionHelpers.cpp:167-205`, `SkeletonAlgorithmComplexCases.cpp:81-84` and
  `:355-389`, `SkeletonIntersection.cpp:44-48`. A mechanism ported under a different name would read as
  "absent" here.
- **§2 D5** — I did not re-verify the language-level entry; it stands on your own account.
- **§4 preamble** — CLAUDE.md and F44 say causality, clearance and direction "do not hold over the
  defect roster"; the current `DEFECT_CAUSALITY_SIGNATURES` table is all zeros. I have stated both: the
  structural distinction (gate vs. signature table) stands, and the measured signatures are currently
  zero.
- **§7** — "send-ready" is the user's assessment as recorded in the session-3 journal (§4 item 2) and
  decision 113 item 7; the suite figure is the session-4 bootstrap re-run, not a re-run by this document.
- **No targeted test was run** for this document; every number is read from source, tests or journals
  cited in place.
