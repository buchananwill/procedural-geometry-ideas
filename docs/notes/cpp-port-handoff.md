---
title: "C++ port handoff: bringing the skeleton solver up to date with e2544d4..HEAD"
type: handoff
status: active
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
ancestor of this repository's current tip `b1bb095` on branch `feature/recursive-skeleton-subdivision`
(`git merge-base --is-ancestor` confirms it), and the tip is **114 commits** ahead of it
(`git rev-list --count e2544d4..HEAD`). The solver-relevant delta —
`packages/core/src` plus `packages/test-fixtures/src` — is **36 files, +7632/−550 lines**
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

## 8. Weighted offsets — the port-first design, written from the landed code

**Status, plainly: weighted offsets are IMPLEMENTED in the TypeScript reference, and this section is
written from that code rather than from the spec's intentions.** Two commits carry it. `3dd467c` landed
the solver core: 13 source files, `WeightOptions`, `Arrival`, the kernel spelling, the door guards,
`weighted-fixtures.ts` and `weighted-offsets.test.ts`. `b1bb095` carried it through projection and
downstream — `offset-projection.ts`, `strip-decomposition.ts`, `parcel-slicing.ts`, `debug-helpers.ts` —
and restored `makeWeightedBisectedBasis`, which `3dd467c` shipped WITHOUT: a `git checkout --` revert of
a conviction mutation discarded the delegate's uncommitted change to `core-functions.ts`, so on that tip
every solve threw `makeWeightedBisectedBasis is not a function` (finding F51; the restoration is proved
by the digest, since all 59 pins pass and could not if one bit of the spelling differed).

The ratified contract is [weighted-offsets-decisions.md](./weighted-offsets-decisions.md) (rulings
W1–W53) with arc decisions 112, 114–120, 124, 126 and 128 in
[recursive-subdivision-arc-journal-4.md](./recursive-subdivision-arc-journal-4.md). **Where the spec and
the landed code differ, the code wins and this section says which.** Nothing here is needed for
unweighted rooflines: an unweighted caller passes nothing, every weighted site multiplies or divides by
exactly `1.0`, and the 59-fixture digest is the proof.

### 8.1 The contract

**Per-edge strictly positive weights, normalised to minimum one.** `WeightOptions { weights?: readonly
number[] }` is declared in `algorithm-termination-cases.ts` and mixed into `SolveSkeletonOptions`;
`runAlgorithmV5`, `runAlgorithmV5Stepped` and `canonicaliseForSolve` all take `PerceptualFloorOptions &
WeightOptions`. One entry per INPUT VERTEX: `weights[i]` is the speed of exterior edge `i`, the edge from
vertex `i` to vertex `(i + 1) % n`. Absent, or of length zero, means all ones. After the door the array
is divided once by its own minimum (`normaliseWeights`), stored on the graph as `exteriorWeights: number[]`
(plain data, indexed by exterior edge id, length `numExteriorNodes`) and read back through
`GraphHelpers.weightOf(exteriorEdgeId)`, which THROWS on an interior edge id rather than reading past the
end and turning every product into `NaN`. `SkeletonSolveResult.weights` reports the normalised,
boundary-stage-remapped array the solve actually ran on — so for a fixture with a removed vertex it is
SHORTER than the caller's. Weights are DIMENSIONLESS: the unit-extent transform never touches them (W47).

**Offset means time.** Every field the solver calls an offset is the wavefront clock, `time = distance /
weight`: `CollisionEvent.offsetDistance`, `InteriorEdge.maxOffset`, `SplitOffsetResult.offsetDistance`,
`TerminalSolution.offset`, the map `computeNodeOffsets` returns, `computeOffsetRings`' argument,
`StripOptions.depth`, `computeNodeOffsetDistances`. `makeOffsetDistance` and `sourceOffsetDistance` are
deliberately NOT changed (W6): they keep computing the perpendicular DISTANCE from the clockwise parent's
supporting line, and leaving their arithmetic alone is what makes every unit-weight number downstream
bit-identical. Decision 102's linear causality is restated over time unchanged. The physical setback of a
strip of depth `t` on edge `e` is `w_e · t` — that is what a weight IS.

**Gables are out of contract.** A zero or infinite weight has no well-posed vertex velocity (the trace
collapses onto that edge's own line), so it is refused at the door and a gable is a post-process on an
all-positive solve. This is the same class of fence as the turn guard.

**Both door guards, with their exact constants and messages.** All three refusals are THROWS, not
diagnostics — the reason `assertVerticesAreFinite` already gives: `diagnostics` reports a solve that ran
and came back degraded, these are inputs the solver cannot solve at all. All of them run BEFORE
canonicalisation and before winding reversal, so the index in the message is the caller's own.
`weightsAtTheDoor(unitVertices, weights)` runs them in this fixed order and returns the normalised array:

1. **Length** (`resolveWeightArray`) — `Weight array has {n} entries but the polygon has {m} vertices;
   there must be exactly one weight per vertex — the speed of the edge leaving it.`
2. **Finite and strictly positive** (`assertWeightsAreFinitePositive`) — `Weight {i} is {value}. Every
   edge weight must be a finite, strictly positive number: a zero or infinite weight has no well-posed
   vertex velocity, and gables are a post-process on an all-positive solve rather than a solver input.`
3. **`MAX_WEIGHT_RATIO = 100`** (`assertWeightRatioIsInContract`) — `Weight ratio {r} exceeds
   MAX_WEIGHT_RATIO (100): edge {fastest} has weight {wf} and edge {slowest} has weight {ws}. Beyond
   that ratio the solver's absolute time window is wider on the fastest edge than the client's own noise
   floor, so two arrivals the client can see as two things would be fused into one.` DERIVED, not picked:
   `MAX_WEIGHT_RATIO = SKELETON_NOISE_FLOOR / FLOATING_POINT_EPSILON = 1e-6 / 1e-8`. A test asserts that
   identity so the constant cannot drift from its derivation.
4. **`MIN_WEIGHT_TURN_SINE = PARALLEL_GATE_SINE_BAR`** (`assertWeightsChangeOnlyAtVisibleCorners`,
   exported) — `Vertex {i} carries a weight change ({wIn} to {wOut}) at a turn whose sine is {s}, below
   MIN_WEIGHT_TURN_SINE ({bar}). Weights may change only at a visible corner: a collinear or
   near-collinear weight change has no well-posed vertex velocity, and anything needing one — a dormer,
   for instance — is a separate feature stitched into the roof the skeleton produces.` The constant is
   `sqrt(FLOATING_POINT_EPSILON · (2 − FLOATING_POINT_EPSILON))` ≈ `1.4142e-4`, the existing conditioning
   gate (§5.4), reused rather than newly minted. The hazard is ANGULAR, not a ratio: `|v| = |w₁ − w₂| /
   sin(turn)`, unbounded for any ratio — measured `1.5e7` at a turn of `1e-6` with weights `(1, 16)`,
   where the `1e-8` time window becomes a spatial slack of `0.15`, a seventh of the unit extent. Above
   the bar `|v| ≤ |w₁ − w₂| / 1.41e-4`, at most `7.1e3 · |w₁ − w₂|`.

**Unit weights never reach guards 3 or 4.** Guard 4 tests `incomingWeight === outgoingWeight` FIRST and
`continue`s, so with every weight equal it looks at no geometry at all and the digest cannot move.

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

### 8.2 The kernel and the bisector spelling

**The kernel.** The vertex velocity solves `v·n₁ = w₁`, `v·n₂ = w₂` with `n = rotateCw90(basis)` the
inward normal, `c` the clockwise parent basis, `b` the widdershins parent basis:

```
det = n₁ × n₂ = c × b            (rotation preserves the cross product)
v   = (w₂·c − w₁·b) / det
```

The determinant is the sine of the turn. Its two zeros are today's two degenerate cases: a straight
vertex (consistent only at `w₁ = w₂`, and the unequal case is refused at the door, so
`addBisectionEdge` never sees it), and an anti-parallel pair — the corridor end, where the direction is
`c` at constant time (W14, `algorithm-helpers.ts`'s zero-rate branch, unchanged). The rate along the
trace is `1/|v|` against BOTH parents — the equi-time property that replaces "equidistant"; at unit
weights it is today's `bisectorOffsetRate`. Decision 70's sign rule survives verbatim: the rate against
the clockwise parent is `w_cw·(c × b)/|numerator|`, so its sign is the sign of `c × b`, convex keeps the
numerator, reflex negates it, and "a bisector's rate is non-negative" becomes a THEOREM rather than a
convention (W13). `addBisectionEdge`'s convex/reflex test is untouched.

**The bisector spelling — port it exactly.** `makeWeightedBisectedBasis` sits beside `makeBisectedBasis`
in `core-functions.ts` and is `normalize(w_ws · c − w_cw · b)` with today's zero-length fallback. The
landed code, operand for operand:

```ts
export function makeWeightedBisectedBasis(iBasis, jBasis, wCw, wWs): Vector2 {
    const added = addVectors(scaleVector(iBasis, wWs), scaleVector(jBasis, wCw));
    const [bisection, size] = normalize(added);
    if (areEqual(size, 0)) {
        return rotateCw90(iBasis);        // today's fallback, unchanged
    }
    return bisection;
}
```

`jBasis` arrives ALREADY NEGATED — it is the same pair `addBisectionEdge` handed `makeBisectedBasis` —
so the addition IS the spec's difference. Note the order: scale each operand, THEN add, THEN normalise.

**Bit-identity at unit weights is a THEOREM of the spelling, not a measurement that happened to pass.**
`x * 1.0` is `x` for every finite double, so at all-ones weights the two scalings are the identity on
their operands and the addition, the normalisation and the fallback are the ones the unweighted solver
performed, in the order it performed them. The measurement (W12, decision 114) confirms rather than
establishes it: **0 mismatching vertices in 200 000 random turns** in `(−(π − 1e-4), π − 1e-4)`, re-run by
the lead, and 0 ulps on the five named configurations.

**The Cramer spelling is PROHIBITED for the bisector direction.** Dividing by `det` and then normalising
is **0–3 ulps off today's bits, only 31 % bit-identical over 100 000** samples. Only the scaled difference
matches the unit-weight reference bit for bit, and the whole 112(d) bar rests on that. The naive
`normalize(rotateCw90(c + b))` is catastrophic near a straight vertex (`4.2e11` ulps at a turn of `1e-6`)
and is also not used. **The prohibition is on the normalised DIRECTION, not on the kernel quotient**:
`parcel-slicing.ts`'s `marchDirection` legitimately computes `v = (wA·b.y − wB·a.y, a.x·wB − b.x·wA)/det`
because it wants the VELOCITY, whose magnitude carries the clock, and its arithmetic is in caller space,
outside the digest.

**The terminal solve changes one column.** `solveTerminalPoint`'s rows become `[n.x, n.y, −w]` and the
third unknown is a time; each line contributes `n · P − w · t = n · A`. At unit weights the row is the
same double `−1`, so position and time are bit-identical by construction. The singularity bar is scaled
by the same weight (`|det| < FLOATING_POINT_EPSILON · max(w₁, w₂, w₃)`, W26). A triangle over two
same-facing parallel parents — singular today — is REGULAR at unequal weights (`det = (w₃ − w₁)·(n₁ × n₂)`)
and returns the point where the faster wall overtakes the slower (W29). No new branch: the existing
singular fall-through simply stops being taken. That event is what makes `solveParallelClosure`'s
no-future-event premise false under weights (W32); the function's own gate is unchanged, and the pair
resolves on the ordinary collision path because its two bisector rays are no longer parallel.

### 8.3 The `Arrival` pair and division-free comparison

`Arrival { distance: number; weight: number }` is a time carried as the pair it came from: `distance` is
`makeOffsetDistance`'s perpendicular distance from the CLOCKWISE parent's supporting line, `weight` is
that parent's weight, and `timeOf(a) = a.distance / a.weight` exists for reporting, sorting keys and
denormalisation ONLY. Every tolerance decision reads the undivided pair. The landed comparator:

```ts
export function compareArrivals(a: Arrival, b: Arrival, epsilon = FLOATING_POINT_EPSILON): -1 | 0 | 1 {
    const left = a.distance * b.weight;
    const right = b.distance * a.weight;
    const difference = left - right;
    if (difference === 0 || Math.abs(difference) < epsilon * a.weight * b.weight) {
        return 0;
    }
    return difference < 0 ? -1 : 1;
}

export const arrivalsAreEqual = (a, b, ε = FLOATING_POINT_EPSILON) => compareArrivals(a, b, ε) === 0;
export const laterArrival = (a, b) => (a.distance * b.weight >= b.distance * a.weight ? a : b);
export const arrivalOf = (edge, context, ray, alongRay) => ({
    distance: makeOffsetDistance(edge, context, ray, alongRay),
    weight: context.weightOf(context.clockwiseParent(edge).id),
});
```

Two details the port must copy, both load-bearing:

- **The `difference === 0` early return.** An exactly equal pair reports `0` even at `epsilon = 0`, where
  `fp_compare` reports `1` because its window is strict. This comparator is handed to three stable sorts
  where today's `a - b` returned `0` for a tie and left the order alone; preserving that is what keeps the
  layer sort bit-identical (decision 127(d)).
- **The epsilon scaling is the single rule (W26).** An absolute epsilon applied to a weight-scaled
  quantity is multiplied by the same weight product that scaled it, so no site derives its own. It appears
  at `meetHeadOn`'s cancellation test (`|r_A·w_B + r_B·w_A| < ε·w_A·w_B`), both split divisors
  (`< ε·w_e·w_cw`), the phantom test, the layer window, the terminal singularity bar (`ε·max(w)`) and the
  64-ulp simultaneity bar (`|d₁·w₂ − d₂·w₁| ≤ 64·DBL_EPSILON·max(|d₁·w₂|, |d₂·w₁|)`).

`arrivalOffsetOfPair`'s `Math.max` became `laterArrival`; `bestNonPhantomCollision`, `inArrivalOrder` and
`earliestArrivalMoment` all sort by `compareArrivals(a, b, 0)`.

### 8.4 The sites that changed

Port counterparts are §3.16's file map. "Identity" is the unit-weight claim: BIT means the site performs
today's operations on today's operands in today's order and the 59-fixture digest proves it.

| TypeScript function | What changed | Port counterpart | Unit-weight identity |
|---|---|---|---|
| `initBoundingPolygon` | takes `weights?`, fills `graph.exteriorWeights` (all ones when omitted), rejects a mismatched length | `SkeletonGraphHelpers` | BIT (data only) |
| `makeStraightSkeletonSolverContext` | third arg `weights`; adds `weightOf`, which throws on an interior id | `SkeletonSolverContext` | BIT (data only) |
| `makeWeightedBisectedBasis` (new) | `normalize(w_ws·c − w_cw·b)`, zero-length fallback kept | `SkeletonCoreFunctions` | BIT, by construction (§8.2) |
| `addBisectionEdge` | calls the weighted basis with both parents' weights; sign rule untouched | `SkeletonAlgorithmHelpers` | BIT |
| `createBisectionInteriorEdge` | `maxOffset` is a TIME: `timeOf(arrivalOf(...))` | `SkeletonAlgorithmHelpers` | BIT (`d / 1.0`) |
| `arrivalOf`, `birthArrivalOf`, `timeOf`, `compareArrivals`, `arrivalsAreEqual`, `laterArrival` (new) | the arrival vocabulary | `SkeletonCollisionHelpers` | BIT |
| `makeOffsetDistance`, `sourceOffsetDistance` | **unchanged, deliberately** (W6) | `SkeletonCollisionHelpers` | BIT (untouched) |
| `meetHeadOn` | `alongA = (s_B·w_A − s_A·w_B + sep·r_B·w_A) / (r_A·w_B + r_B·w_A)`, cancellation test scaled by `w_A·w_B` | `SkeletonCollisionHelpers` | BIT (same order; 0 mismatches in 100 000) |
| `collideInteriorEdges` | builds two `Arrival`s and reports `laterArrival`; phantom test is `!arrivalsAreEqual(...)`; `offsetDistance <= 0` becomes `arrival.distance <= 0` | `SkeletonCollisionHelpers` | BIT |
| `bestNonPhantomCollision` | sorts by `compareArrivals(…, 0)` | `SkeletonCollisionHelpers` | BIT (tie → 0 keeps stable order) |
| `inArrivalOrder`, `earliestArrivalMoment`, `areSimultaneousArrivals` | sort by arrival; 64-ulp bar cross-multiplied on the pair | `SkeletonAlgorithmComplexCases` | BIT |
| `handleInteriorNGon`'s layer window | `bestArrival` tracked by `compareArrivals(…, 0)`; window is `compareArrivals(event.arrival, bestArrival, ε) <= 0` | `SkeletonAlgorithmComplexCases` | BIT |
| `findOffsetByDirectStrike` | `s = L·negT·w_cw / (crossCw·w_t + negT·w_cw)`, `arrival = {s·crossCw, w_cw}` | `SkeletonSplitEvents` | BIT (0 mismatches in 100 000) |
| `findOffsetViaIncenter` | **replaced outright** by the linear equi-time form (§8.5) | `SkeletonSplitEvents` | **NOT identical — the one exception** |
| `solveTerminalPoint` | rows `[n.x, n.y, −w]`; singularity bar `ε·max(w)` | `SkeletonAlgorithmTerminationCases` | BIT (the row is the same double `−1`) |
| `solveDegenerateClosure` | simultaneity is `arrivalsAreEqual`; the not-before-birth test is `compareArrivals(arrival, birth, ε) >= 0` | `SkeletonAlgorithmTerminationCases` | BIT |
| the snap pre-pass / `nodeOffset` | return and compare `Arrival`s | `SkeletonAlgorithmTerminationCases` | BIT |
| `validateSplitReachesEdge` | takes an `Arrival`; the split edge's OWN weight converts the local time to travel along it | `SkeletonSolverContext` | BIT |
| `clockwiseVertexAtOffset`, `widdershinsVertexAtOffset` | argument is a local TIME, carried by `localTime · weightOf(edgeId)` | `SkeletonSolverContext` | BIT (`· 1.0`) |
| `weightsAtTheDoor` + its four checks + `normaliseWeights` (new) | the door (§8.1) | `SkeletonAlgorithmTerminationCases` | BIT (divides by `1.0`; angular test unreached) |
| `weightChangeVertexIndices` → `canonicalisePolygon(…, pinnedIndices)` | a weight-change vertex is pinned, never merged | `canonicalisation.ts` has **no port counterpart yet** | BIT (equal weights pin nothing) |
| `remapWeightsThroughCanonicalisation`, `reverseWeights` | W45's index remaps: `weights'[j] = weights[(n − 2 − j) mod n]` on reversal | `SkeletonAlgorithmTerminationCases` | BIT |
| `decomposePolygon` | carries `subPolygonWeights`; each piece of a split edge keeps its original edge's weight | `SkeletonPolygonDecomposition` | BIT |
| `mergeSkeletonGraphs` | `exteriorWeights` is the sub-graphs' arrays CONCATENATED in sub-graph order, NOT indexed by merged edge id; `weightOf` on a merged context is unsupported | no counterpart by design | n/a |
| `computeNodeOffsets` / `rederiveInteriorNodeOffsets` | divides by `graph.exteriorWeights[parentEdgeId]` — the whole of W40's node table | `SkeletonOffsetProjection` | BIT (`/ 1.0`) |
| `bisectorPositionAtOffset` | `perpendicular = localTime · exteriorWeights[cwParent]`, then the existing `projectFromPerpendicular` | `SkeletonOffsetProjection` | BIT (`· 1.0`) |
| `computeStrips`, `StripOptions.depth`, `Strip.supportingEdgeWeights` (new field) | depth is a time; the strip RECORDS its supporting edges' weights rather than looking them up, because `sliceStrip` is handed the strip alone | `SkeletonStripDecomposition` | BIT |
| `marchDirection`, `FaceEdge.weight` (new field) | solves `v·n_a = w_a`, `v·n_b = w_b`; the parallel-normals fallback scales by the first face's weight; the overtake and meeting tests are in the one clock | `SkeletonParcelSlicing` | BIT, but **outside the digest** (caller space; its bar is the strip-tiling identity) |
| `computeNodeOffsetDistances`, `computePrimaryInteriorEdges` | times; the primary-bisector overlay takes the solve's weights | no counterpart (debug/dashboard) | BIT |

### 8.5 The one non-identical site: the split fallback's linear form

`generate-split-event.ts` used to build a temporary node on whichever parent was more perpendicular to
the split edge, bisect there with `makeBisectedBasis`, and intersect two rays. That construction has no
weighted generalisation, and keeping it "when both weights are one" would be a BRANCH ON UNIT WEIGHTS,
which W36 forbids on decision 105's ground: the input `(1, …, 1 + 2⁻⁵²)` must not be solved by different
code from `(1, …, 1)`. Decision 115 therefore replaces it outright and amends 112(d) to make this the
single named exception to bit-identity. The landed form, with `D₀` the instigator's source distance from
its own clockwise parent's line, `E₀` its source distance from the split edge's line, `r = cross(d, c)`
and `q = −cross(d, e)`:

```
D(s) = D₀ + s·r        E(s) = E₀ − s·q        equi-time: D(s)/w_cw = E(s)/w_e
s       = (E₀·w_cw − D₀·w_e) / (r·w_e + q·w_cw)         [divisor guarded at ε·w_e·w_cw]
arrival = { distance: D₀ + s·r, weight: w_cw }
```

**The digest movement, so the port knows exactly what to expect.** Of the 59 pins, **45 were untouched and
14 moved, every one of them attributed to this site**. Worst movement anywhere in the corpus is **3 ulps**.
**Nothing structural moved on any fixture**: no node count, no edge target, no parent pair, no `culled`
flag, no `complete` flag. The per-fixture measurements are recorded above each moved entry in
`full-graph-digest.test.ts` — e.g. `Duck Octagon (fails)`: 3 node coordinates by 1 ulp, 2 `maxOffset`
values by 2 ulps; `V2 Double Reflex Spaceship (fails)`: 1 node coordinate by 1 ulp, 3 `maxOffset` values by
up to 3 ulps (the worst); `Failing Long Octagon`: 2 `maxOffset` values by 2 ulps, no node moved. Two further
instruments were re-pinned for the same reason: the region-tree decline area by `3.3e-11` relative, and the
offset-event boundary regression firing 176 → 172 with silent losses still empty.

**What this means for the port.** If you keep the incenter construction, you keep the PRE-WEIGHT bits at
unit weights, which means you will differ from the current reference by up to 3 ulps on 14 of the 59
fixtures and on those `maxOffset` values — structurally identical, numerically a few last bits apart, well
inside the `1e-13` structural-identity claim §1.2 licenses. Under actual weights the incenter construction
has no correct answer at all, so port the linear form if you port weights. Movement is bounded by ulps BY
CONSTRUCTION — the two routes reach the same point — so a pin that moves by more than a few ulps is a
defect in the linear form, not an attribution.

The function is still NAMED `findOffsetViaIncenter` in the reference; the name is residue, the body is the
linear equi-time solve.

### 8.6 What is NOT implemented, and why

**W33's equi-time check on the co-linear closure — not implemented, and that is a measured negative result
(decision 126).** W33 asked the `co-linear-from-1` leading-source closure to check that the trailer's
arrival at the leading source equals the leader's birth arrival. The check was written and run over the
whole corpus at unit weights. The digest does NOT move — all 59 native-placement pins survive — but the
branch is reached by near-anti-parallel corridors whose two mid-lines carry constant, slightly DIFFERENT
times, so the check fires there. With W33's own stated consequence (fall through to the throw) ten pinned
assertions across six suites move, including the recursion census reporting jitter-plus seed 7919 at 16
failed regions where 15 is pinned — a DEFECT GROWING, which the corpus doctrine treats as a regression,
not a re-pin. With the softest consequence (fall through to ordinary termination) four move, including an
UNATTRIBUTED CURE (`rosette5-40` at 1e11, 2 → 1 unresolved) and the 48-way cluster at 2e10 shattering 11 →
12 nodes. Neither rewrite of the failure register is justified by anything measured, because no weighted
fixture reaches the branch. The closure therefore stands on the raw separation exactly as it did before
weights, and the site carries a block comment holding the measurement. The discriminating fixture — a
corridor whose walls carry different weights and whose closure is reached through `co-linear-from-1` — is
an open roster entry. **Port the closure as it is.**

**Sub-region weights — root-only by ruling (W46, decision 118).** Weights apply to the ROOT solve only;
sub-region solves run at unit weight, so the recursion census signatures are unmoved by construction and
the digest pins that. When boundary provenance exists, the ruled policy is: perimeter and contour runs
inherit the parent edge's weight, ridge and cut runs take weight one. Nothing implements that yet.

**The ratio constant's discriminating fixture is OPEN (decision 128).** The ladder `R ∈ {10, 30, 100, 300}`
was run on the §4.4 square `[1,1,1,R]` and the §4.6 step and moved NOTHING at any rung — position, time
and equi-time errors `≤ 2.3e-16`, tiling `≤ 3e-15`. That is not evidence either way: W48's derivation is
about two arrivals separated by a distance of order `R · 1e-8` on the fast edge fusing into one time
moment, and neither fixture has near-coincident arrivals at all. Absence of movement on a fixture that
cannot exhibit the hazard is not a measurement of the hazard. `MAX_WEIGHT_RATIO` keeps its derived value
of 100; the fixture that would find the first mover is an open item, and the runtime may move the constant
on its own stated need without waiting for it.

**Two smaller items are open (decision 129).** W39(i)'s weighted restatement of I3 inside
`graph-index-invariants.test.ts` (the property is asserted in `weighted-offsets.test.ts` instead), and a
weights UI in the demo — the dashboard hook threads weights but no control passes any.

### 8.7 The conformance additions the port should carry

**1. A full-graph digest, as a bit-identity gate.** This is 112(d)'s instrument (W51, decision 116) and it
landed FIRST, as its own commit, before any weighted change. Build one like this: for every corpus fixture,
solve and serialise the DENORMALISED graph into a canonical big-endian byte stream, then SHA-256 it —

- (a) the `complete` flag as one byte;
- (b) node count, then nodes in id order: id as int32, `position.x` and `position.y` as raw float64 BIT
  PATTERNS (write through a byte view so `-0` and `NaN` survive);
- (c) exterior-edge count, then exterior edges in id order: id, source, target (`-1` sentinel), basis x/y bits;
- (d) interior-edge count, then interior edges in id order: id, source, target (`-1`), basis x/y bits,
  clockwise parent id, widdershins parent id, a PRESENCE BYTE then `maxOffset` bits (a presence byte, so
  "unresolved" is distinguishable from any legitimate value including `0` and `NaN`), the `culled` flag, and
  `InteriorEdge.length`;
- (e) a presence byte for the solver context, then `acceptedEdges` length and one byte per flag — the
  presence byte matters because a decompose-and-merge result has no single `acceptedEdges` array and must
  not serialise as "context present, zero exterior edges".

Node incidence lists are deliberately EXCLUDED: they are redundant with the source/target already on every
edge. `InteriorEdge.length` is included though it is a permanent `MAX_VALUE` sentinel — real state the type
exposes, no discriminative power. Put regeneration behind an env flag; never hand-edit a hex string; a
moved pin is an ATTRIBUTED decision in the commit that moves it, never a rubber stamp.

**Convict it by mutation before trusting it (F49).** The reference's suite is 123 tests — 59 pins, 59
determinism checks, 4 sensitivity checks, 1 coverage check. Two convictions were run: perturbing one node
coordinate by one ulp must kill the pin; collapsing `PARALLEL_GATE_SINE_BAR` onto `DIRECTION_SINE_BAR`
killed exactly the one pin its doc-comment predicts (jitter plus, seed 7919); and shifting the
normalisation exponent by one (solving at half the unit extent) killed only 4 of 59 — so 55 fixtures
produce IDENTICAL bits at half scale, which is what an exact power-of-two round trip plus scale-free
predicates should give, and the four movers are the fixtures where the absolute `1e-8` / `1e-6` bars bite.
That last result is a useful free property for the port to reproduce.

**2. The equi-time property at every interior node — the weighted I3.** This is the single most valuable
check in the weighted suite, because NO site in the solver computes it: the kernel direction, the collision
arrival, the terminal three-line solve and the degenerate closures each reach a node their own way, so it
is an independent re-derivation of what all of them claim. For each interior node, collect the exterior
faces of its incident non-culled bisectors (each bisector contributes its clockwise and widdershins
parent), compute `distanceToFace(face, position) / weights[face]` for each, and assert
`max − min < 1e-9`. Skip nodes with fewer than two faces, and skip culled bisectors — a culled edge is a
retired zero-length self-loop and its parents are not faces meeting at the node. The bar is `1e-9`, not the
analytic `1e-12`, because the quantity is DERIVED: the node comes out of a chain of intersections and the
distance to each supporting line is re-derived from the ring afterwards, so two independent constructions'
rounding accumulates. It is still three orders inside `SKELETON_NOISE_FLOOR`. **Run it over the unweighted
corpus too** — at all ones the division is by `1.0` and it IS I3's equidistance, so a failure there means
the predicate is measuring something else.

**3. The unit-weight identity test: an explicit all-ones array must equal no weights at all.** Over the
whole 59-fixture corpus, solve twice — `solve(vertices)` and `solve(vertices, {weights: all ones})` — and
assert the two graphs digest identically. This convicts the OPTION rather than the tip, which is why it is
separate from the pinned table. Also assert that the reported `weights` array is all ones and matches
between the two runs. Two companions: a uniform array `[3,3,3,3]` must normalise to `[1,1,1,1]` (the
skeleton is invariant under a common scaling of all weights), and a uniform non-unit array `[7,7,7,7]` must
give the unweighted skeleton's interior nodes exactly. **A failure here is a W36 violation to fix, never a
tolerance to widen.**

**4. The analytic weighted fixtures, with the values the reference asserts.** From
`packages/test-fixtures/src/weighted-fixtures.ts` (roster `WEIGHTED_TEST_POLYGONS`, NOT enrolled in
`CLEAN_TEST_POLYGONS` or `FULL_CORPUS`, because a weighted fixture is a `(ring, weights)` PAIR and those
rosters' sweeps assume unit weights and their count of 59 is the digest's). All rings are clockwise in a
y-up frame; every weight array is already at minimum 1. Node positions and times to `1e-12`:

| Fixture | Vertices | Weights | Expected |
|---|---|---|---|
| Weighted Rectangle (fast floor) | `(0,0) (0,2) (4,2) (4,0)` | `[1,1,1,2]` | nodes `(2/3, 4/3)` and `(10/3, 4/3)`, both at `t = 2/3`; corner velocities `(1,2) (1,−1) (−1,−1) (−1,2)`. The floor's front is `y = 2t`, the top's `y = 2 − t`, so they meet a THIRD of the way down; at unit weights the same ring gives `(1,1)` and `(3,1)` at `t = 1` |
| Weighted Corridor (fast ceiling) | `(0,0) (0,1) (10,1) (10,0)` | `[1,3,1,1]` | nodes `(1/4, 1/4)` and `(39/4, 1/4)` at `t = 1/4`; velocities `(1,1) (1,−3) (−1,−3) (−1,1)`. The corridor closes ALL AT ONCE at `t* = width/(w₁+w₂)`, on the line at `w_slow · t*` from the slow wall, NOT the midline |
| Weighted L (fast shelf beside slow riser) | `(0,0) (0,4) (2,4) (2,2) (6,2) (6,0)` | `[1,1,1,4,1,1]` | nodes `(8/5, 2/5)` and `(28/5, 2/5)` at `t = 2/5`. The reflex `(2,2)` traces `v = (−1,−4)`, speed `sqrt(17)` — the fast shelf drags it down the riser at four times the riser's own rate and the riser's wavefront segment LENGTHENS at rate 4 |
| Weighted Square (near-maximum ratio) | `(0,0) (0,2) (2,2) (2,0)` | `[1,1,1,100]` | nodes `(2/101, 200/101)` and `(2 − 2/101, 200/101)` at `t = 2/101` — ridge hard against the slow wall. Its companion at `R + 1` is refused |
| Weighted Step (fast low floor) | `(0,0) (0,10) (12,10) (12,2) (8,2) (8,0)` | `[1,1,1,1,1,2]` | node `(6, 4)` at `t = 2` — an edge-collapse node that DOES NOT EXIST in the unweighted skeleton. The reflex `(8,2)` traces `(−1,1)` and the convex `(8,0)` traces `(−1,2)`; at unit weights both trace `(−1,1)` and the riser never collapses. This is W29/W32's conviction |
| Weighted Square (alternating edge weights) | `(0,0) (0,2) (2,2) (2,0)` | `[1,2,1,2]` | nodes `(0.5, 1)` and `(1.5, 1)` at `t = 0.5`; velocities `(1,2) (1,−2) (−1,−2) (−1,2)`. Two-fold rotational and mirror-symmetric about both axes — NOT four-fold, because alternating weights on a four-cycle give opposite edges the same speed (the spec's §4.8 four-fold claim is arithmetically impossible and was corrected, decision 127(a)) |
| Weighted Pentagon House (asymmetric roof) | `PENTAGON_HOUSE` | `[2,1,1,1,1]` | no analytic table; the METAMORPHIC pair — the apex moves toward the SLOW roof so the solve is not mirror-symmetric, and mirroring the ring AND the weight array through W45's reversal map must yield the mirrored skeleton exactly |
| Weighted Square (weight change at a 1e-3 turn) | 10×10 square with a bottom-wall vertex `2.5e-3` inside it | `[1,1,1,4,1]` | turn sine exactly `1e-3` — SEVEN times `MIN_WEIGHT_TURN_SINE`, so the door ADMITS it. Kernel speed `3/1e-3 = 3e3` on a shape of extent 10: the approach to the bar, and the number that says why the bar is where it is |
| Weighted Bump (sub-floor weight change at a visible turn) | 10×10 square with a triangular bump `0.05` proud of the bottom wall, apex deviating `4e-6` from the chord | `[1,1,1,1,1,2,2]` | vertex 5 deviates `5e-7` in unit space — HALF the `1e-6` floor, so at equal weights it is removed as invisible — but its turn sine is `2e-4`, above the bar, so a weight change there passes the door and W44 PINS it. The pair of solves is the conviction: unit weights lose it, these weights keep it |

**5. The refusal tests.** Each asserts the throw AND that the message names the offender: a zero, negative,
`NaN` or infinite weight named by index; a wrong-length array naming both lengths; a ratio above
`MAX_WEIGHT_RATIO` naming both extreme edges and the constant (with the sibling assertion that
`MAX_WEIGHT_RATIO === SKELETON_NOISE_FLOOR / FLOATING_POINT_EPSILON`, and that `MIN_WEIGHT_TURN_SINE ===
PARALLEL_GATE_SINE_BAR`, so neither constant can drift from its derivation); the invisible-vertex rectangle
with a weight change at vertex 5, whose turn is exactly zero, refused BEFORE canonicalisation — which would
otherwise have removed the vertex and hidden the question; and **the dormer square**, a 2×2 square with an
exactly collinear vertex at the centre of each side and weights `[1,2,1,2,1,2,1,2]`, refused naming vertex 1
and the weights 1 and 2. That refusal IS the model invariant stated as a test. Two more that keep the guard
honest: the SAME ring with its midpoints removed (weights `[1,2,1,2]`) must SOLVE — the guard is angular, so
alternating weights that are refused on a subdivided ring are perfectly admissible on the silhouette's own
ring — and unit weights must never reach the angular test whatever the geometry.

### 8.8 Porting cautions specific to C++

**Use `double` throughout — `float` cannot carry this tolerance system.** The whole model is an ABSOLUTE
`1e-8` window in a unit-extent space; `float` has ~24 bits of mantissa, so `1e-8` is below the
representable resolution of a unit-magnitude operand and every epsilon test degenerates. Under weights it
is worse in a specific way: `compareArrivals` compares CROSS-MULTIPLIED products `d·w` against
`ε·w_a·w_b`, and at `MAX_WEIGHT_RATIO = 100` that epsilon reaches `1e-4` while the operands are products
of a unit-extent distance and a weight up to 100. The dynamic range is trivial for `double` and marginal
for `float`. Cross-multiplication is what buys the division-free ordering; do not undo it by widening the
epsilon to compensate for a narrow type.

**The weight normalisation must be EXACT — one division by a positive constant.** Take `min` over the
array and write `w / min` per element. Do NOT hoist a reciprocal (`w * (1.0 / min)`): that is two
roundings and it breaks the property the whole bit-identity claim leans on. All-ones divides by `1.0`,
which is exact for every finite double, so the unit-weight path is untouched bit for bit. Normalise once,
immediately after the positivity and ratio checks, before anything else reads the array.

**Preserve the order of operations in the bisector spelling.** `scale(c, w_ws)`, `scale(b_negated, w_cw)`,
THEN add, THEN normalise (`size = sqrt(x² + y²)`, then divide each component), with the `size == 0`
fallback returning `rotateCw90(c)`. Do not reassociate, do not let the compiler contract the multiply-add
into an FMA, and do not enable fast math: on MSVC keep `/fp:precise` and never `/fp:fast`; on Clang/GCC
avoid `-ffast-math` and set `-ffp-contract=off`. The same applies to `meetHeadOn`, the two split divisors
and the terminal rows — each was written so that its unit-weight evaluation performs today's operations on
today's operands in today's order, and a reassociation silently discards that.

**The door guards read the CALLER'S ORIGINAL weights, before normalisation, so the messages report the
numbers the client authored.** `weightsAtTheDoor` resolves the array, checks positivity, checks the ratio,
checks the turn, and only THEN normalises — so a `[2, 200]` input is refused naming 200 and 2, not 100 and
1. All three run before canonicalisation and before winding reversal, so the reported INDEX is the
caller's own, with nothing renumbered yet. Port that ordering exactly; a guard that runs after
normalisation reports numbers the client never wrote, and one that runs after canonicalisation reports an
index into a ring the client never sent.

**But the turn guard's GEOMETRY is evaluated in UNIT space.** `weightsAtTheDoor` is called with
`normalisePolygon(nodes, normalisation)`, not the caller's coordinates. The turn sine is scale-invariant,
so the verdict is the same in exact arithmetic, but the last bits are not — a vertex sitting within a few
ulps of the bar can be admitted in one space and refused in the other. Evaluate the sine on the
unit-extent ring, as the reference does.

**Two small API shapes worth copying.** `weightOf` THROWS on an interior edge id rather than reading past
the end of the array — a bisector has no speed of its own, it is priced against its parents' — because the
silent alternative turns every downstream product into `NaN`. And `Arrival` is a two-`double` POD: pass it
by value, keep it trivially copyable, and store `exteriorWeights` as an owned array on the graph (not a
view into caller memory) so it survives every graph copy the solver makes.

**Do not add a weight read to a merged graph.** On a merged graph `exteriorWeights` is the sub-graphs'
arrays concatenated in sub-graph order and is NOT indexed by merged edge id; `weightOf` on a merged context
is unsupported by design. The port does not port `graph-merge` (roadmap decision 9), so this costs nothing
— just do not introduce a merge path that prices anything.

**The claim you can make against the reference is unchanged.** It stays structural identity below
`1e-13` (§1.2), not byte identity. The full-graph digest is the REFERENCE's own bar; §8.7 tells you how
to build your own so that your port has the same tripwire against its own regressions.

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
- **§0's fork figures were re-measured** when §8 was rewritten from the landed code: 114 commits (was
  109), 36 files and +7632/−550 (was 34 and +5994/−303), tip `b1bb095` (was `e88da1f`), by
  `git rev-list --count e2544d4..HEAD` and `git diff --shortstat e2544d4..HEAD -- packages/core/src
  packages/test-fixtures/src`. The six new source files are unchanged: the weighted work added no new
  file under `packages/core/src/straight-skeleton/`. §2's heading still says "re-read against
  `e88da1f`" and that re-read has NOT been redone against the two weighted commits.
- **§8 is written from the code, not the spec, and four places where they differ are called out here.**
  (i) The split function is still NAMED `findOffsetViaIncenter` although its body is the linear
  equi-time solve; I describe it by behaviour and flag the name as residue. (ii) The spec's §2 roster
  lists `arrivalsAreSimultaneous` as an exported member of the arrival vocabulary; it does NOT exist.
  The simultaneity predicate is a module-private `areSimultaneousArrivals(first: Arrival, second:
  Arrival)` in `algorithm-complex-cases.ts`, and I have described it as internal. (iii) W52(i) says the
  Cramer spelling differs from the reference "by up to 4 ulps"; W12's own measurement says max 3 ulps
  over 100 000 with 31 % bit-identical. I used W12's figures because they are the measured ones; the
  disagreement is unreconciled. (iv) `MIN_WEIGHT_TURN_SINE` is quoted in the sources as both `1.41e-4`
  and `1.4142e-4`; the value is `sqrt(1e-8 · (2 − 1e-8))`, and I have written the derivation rather
  than pick between the two roundings.
- **§8.1's door ordering, and where the turn guard's geometry is evaluated** — read from
  `weightsAtTheDoor` and its three call sites (`solveSkeleton`, `runAlgorithmV5`,
  `runAlgorithmV5Stepped`), all of which pass `normalisePolygon(nodes, normalisation)`. The reported
  INDEX is the caller's own (nothing has been renumbered), the reported WEIGHTS are the caller's own
  (normalisation runs last), but the turn sine is computed on the unit-extent ring, not on the caller's
  coordinates. W49 says "the check reads the caller's ring in unit space", which I read as licensing
  exactly this; I state both halves because a port that evaluates the sine in caller space agrees in
  exact arithmetic and can disagree in the last bits within a few ulps of the bar.
- **§8.2's "the Cramer prohibition is on the DIRECTION, not the kernel quotient"** is my reading, not a
  sentence either the spec or the code states. `parcel-slicing.ts`'s `marchDirection` does divide by the
  determinant, and it is correct to: it wants the velocity, whose magnitude carries the clock, and its
  arithmetic is in caller space and outside the digest (W42 says so explicitly). If the port reads W52(i)
  as banning the quotient everywhere it will get `marchDirection` wrong.
- **§8.6's W33 account** follows arc decision 126 and the block comment at the site
  (`algorithm-termination-cases.ts`, the `co-linear-from-1` branch), which say the check FIRES on the
  near-anti-parallel corridors that reach the branch while all 59 NATIVE-PLACEMENT pins survive.
  `full-graph-digest.test.ts`'s header says instead that the check "PASSES" on the jitter-plus seed and
  the large-coordinate cells. I read the two as compatible — no native-placement pin moved either way —
  and have reported decision 126's wording, but the digest header's sentence is loose and I have not had
  it corrected.
- **§8.7's digest recipe is the landed `serialiseGraph`'s field list**, including two choices the port
  should copy for comparability and one absence it should know about: node incidence lists are excluded
  as redundant with per-edge source/target; `InteriorEdge.length` is included although it is a permanent
  `MAX_VALUE` sentinel with no discriminative power; and **`exteriorWeights` is NOT serialised**, so the
  pinned digest cannot see a weight difference directly — it sees only the geometry weights produce.
  That is why the unit-weight identity test in `weighted-offsets.test.ts` uses a SECOND, JSON-based
  digest (which does include incidence lists) computed over both solves of each fixture rather than
  against the stored table: it convicts the option, not the tip. A port with one digest should be
  deliberate about which of the two jobs it is doing.
- **§8.5's "if you keep the incenter construction" advice** is my inference from the measurement, not a
  ruling: the reference measured the movement between the two constructions and attributed it, so a port
  that keeps the old construction sits on the pre-change side of exactly that measured gap. Nobody has
  run the old construction against the current reference to confirm the gap is symmetric.
- **The test-count figures in §8** come from the journal (F49: 123 digest tests; F50: 94 weighted tests
  at `3dd467c`) and were not re-run here; `weighted-offsets.test.ts` has since grown by package 3's
  projection block (`b1bb095`, +232 lines), so its current case count is higher than 94.
- **No targeted test was run** for this document; every number is read from source, tests or journals
  cited in place.
