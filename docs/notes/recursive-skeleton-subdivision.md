---
title: "Recursive Skeleton Subdivision: Arc Design"
type: design-vision
area: subdivision
status: active
date: 2026-08-16
---

# Recursive skeleton subdivision — arc design

**This is the arc's design vision, not a dispatchable unit.** It spans five phases and carries a
build sequence, both of which a decision spec must not. Each phase's decision spec is **derived**
from this document at dispatch time, task-scale, with the implementer's hand-off brief prepended and
its own `files` ownership list. Cite decisions here by number from those specs rather than copying
them.

Written 2026-08-16. **Supersedes the "Recursion" section of
[trunk-with-branches-direction.md](./trunk-with-branches-direction.md)**, which described recursion
over *parcels*; that reading is withdrawn. Everything else in that note — spine extraction, frontage
retargeting, endpoints and caps, connection points — stands unchanged and is the input to this one.

Companions: [parcel-quality-brief.md](./parcel-quality-brief.md) (the shipped slicer's contract,
decisions 1–17), [solver-hardening-backlog.md](./solver-hardening-backlog.md) (items 2, 3 and 7),
[parcel-generation-handoff.md](./parcel-generation-handoff.md) (session history).

---

## Intent

One region, subdivided repeatedly by its own straight skeleton, producing a street network and a lot
set together. A level solves the skeleton of its region, partitions it, labels which boundary runs
carry access, and hands each part to the next level. Two or three levels are expected to suffice.
The interesting output is not any single level but the interleaving: a spine-led first level under a
boundary-led second gives lots branching off a trunk lane, each block ringed with frontage around a
courtyard, from one mechanism and two parameters.

The pipeline is a transformation, not a transport. It is entitled to normalise its input at every
level, and it does: geometry below the render-scale noise floor is removed on the way in. **Recursion
is not allowed to accidentally introduce fractal complexity.**

This is a TypeScript arc. It is proven here and ported afterwards — see §Downstream for what the C++
consumer currently believes and what needs correcting.

---

## Type and surface roster

New:

| Surface | Shape |
|---|---|
| `Region` | `{boundary: Vector2[], accessRuns: BoundaryRun[]}` — the recursive unit. A polygon plus the subset of its boundary that carries access. |
| `BoundaryRun` | `{startIndex: number, endIndex: number}` — a contiguous run of `boundary`, cyclic. |
| `canonicalisePolygon` | `(vertices: Vector2[], noiseFloor: number) => CanonicalPolygon` |
| `CanonicalPolygon` | `{vertices: Vector2[], removedCount: number, maxDeviation: number}` |
| `LevelSpec` | `{depth, labelling, spine?, merge?, segments?, residue?}` — see decisions 10–14. |
| `SpineStrategy` | `{kind: 'diameter'} \| {kind: 'wavefront-time', fraction: number} \| {kind: 'whisker-prune', fraction: number}` — see decisions 26–29. |
| `MergePolicy` | `(segments: Strip[]) => number[][]` — a partition of segment indices into groups to fuse. |
| `subdivideRecursively` | `(region: Region, levels: LevelSpec) => RecursiveResult` |
| `RecursiveResult` | `{leaves: Parcel[], lanes: Vector2[][], voids: Vector2[][], perLevel: LevelRecord[]}` |

Extended:

| Surface | Change |
|---|---|
| `SkeletonDiagnosticKind` ([types.ts:183](../../packages/core/src/straight-skeleton/types.ts)) | gains `'vertices-canonicalised'` |
| `StripOptions` ([strip-decomposition.ts:101](../../packages/core/src/straight-skeleton/strip-decomposition.ts)) | gains a tolerance-driven canonicalisation hook; `sameLogicalStreet` stays as-is |
| RDP entry points ([vertex-budget.ts](../../packages/core/src/stroke-spline/vertex-budget.ts)) | expose the tolerance-driven form alongside `reduceRingToVertexBudget`'s budget-driven one |

Reused unchanged: `solveSkeleton`, `computeStrips`, `computeOffsetRings`, `sliceStrip`, `Strip`,
`Parcel`, `SliceOptions`, `distanceToSegment`, `boundingDiagonal`.

---

## Decisions

### Canonicalisation

1. **Every level canonicalises its input polygon before solving.** A vertex whose perpendicular
   deviation from the chord between its neighbours is below the noise floor is removed. This is a
   normalisation stage with a name and a place in the pipeline, not cleanup at a call site.

2. **The predicate is perpendicular deviation from the chord, never turn angle.** A needle spike has
   an invisible deviation and a large turn angle; a gentle collinear run has the reverse. Deviation
   is what "cannot be seen" means geometrically, and it is RDP's own predicate —
   `distanceToSegment` already implements it.

3. **The noise floor is relative to the ROOT region's extent, not to the current level's.** A level-3
   block normalised to its own extent would scale up a thin sliver enormously and keep every
   degenerate vertex it has. Root extent keeps "invisible at render scale" a single physical
   statement across the whole recursion, and it is the rule that stops recursion manufacturing detail
   the player never drew.

4. **The noise floor and `FLOATING_POINT_EPSILON` are two different constants, and the noise floor is
   orders of magnitude larger.** If they are equal the pass buys nothing: a vertex at 1.1× epsilon
   survives canonicalisation and is still inside the solver's degenerate band. The gap is what makes
   every surviving vertex *comfortably* non-degenerate, and the gap is the whole point.

5. **Canonicalisation is reported, never silent.** A `vertices-canonicalised` diagnostic carries the
   removed count and the maximum deviation applied. `solveSkeleton` already reports
   `winding-normalised` for exactly this class of input correction, and the backlog's hardest lesson
   is that a silent correction alongside `complete: true` is the worst thing a result type can do.

6. **The client may not use degenerate or collinear vertices to steer the outcome.** Slicing is
   controlled by `SliceOptions` and by the merge policy; sub-noise-floor geometry is not an
   affordance. Inserting vertices that leave the silhouette unchanged is undefined behaviour, and
   removal is what makes it defined.

7. **Canonicalisation is applied after unit-extent normalisation, not before.** Once the solver works
   in unit space (see decision 20) the noise floor is a fixed constant in that space and is relative
   by construction, so there is one tolerance system rather than two.

### The invariant this creates

8. **Pipeline output is invariant under silhouette-preserving vertex insertion.** Subdivide any
   fixture's edges arbitrarily and the lot set must come back the same. This is a metamorphic
   property test needing no expected coordinates, it is strictly stronger than "solves completely",
   and it transfers verbatim to C++. It is also what stops backlog item 3 regressing — that fix was
   landed and reverted once already.

9. **The observable is the tiling and the lot set. Nothing else.** Not the vertex list, not exterior
   edge ids, not the internal strip partition. Anything outside the observable is free to change
   under canonicalisation, which is what makes removal sound rather than merely plausible. Two
   mechanisms are keyed to edge count or identity rather than to shape and must be checked against
   decision 8 specifically: the strip partition (`sameLogicalStreet` is called once per adjacent edge
   pair, `minEdgeLength` merges runs by frontage length) and any consumer of the seeded stream that
   walks edges rather than arc length.

### Levels and modes

10. **A level partitions its region into two child streams: SEGMENTS and, at partial depth, a
    RESIDUE.** Segments are the strips; the residue is the interior contour `computeOffsetRings`
    returns. At full depth the residue is empty because strips tile the region exactly. Droste-style
    and segment-style recursion are therefore not competing operators — they are what a level chooses
    to do with each of its two outputs, and doing both is the ordinary case rather than a special
    one.

11. **A level's labelling is `boundary` or `spine`, and it decides where the children's access runs
    come from.** Under `boundary`, children inherit the perimeter runs they touch. Under `spine`, the
    skeleton spine is extracted and children receive the spine-facing runs. Boundary mode and spine
    mode are one algorithm parameterised by the source of the access set, not two algorithms.

12. **`Strip` already half-encodes the access set and generalises to it.** `supportingEdgeIds` plus
    `frontage` is precisely "the road-bearing part of this region's boundary". The generalisation is
    that `frontage` stops being derived from exterior edges and becomes an input.

13. **Depth constrains which labelling is available, and the constraint is structural.** A full spine
    exists only at 100% depth; an interior residue exists only below it. A level is therefore a
    `(depth, labelling, child specs)` triple with a validity rule, not a mode flag. The parameter
    shape must carry this before the port freezes it.

14. **A child stream terminates in one of three ways: recurse into a further `LevelSpec`, slice into
    parcels, or stand as a void.** A sliced segment yields leaves; a void residue is the village green
    (under spine labelling) or the gated courtyard (under boundary labelling). Depth is capped at 3
    levels; 2 is expected to suffice.

### Merging segments

15. **Segments are merged toward an area target before being recursed, and the merge heuristic is
    the thing to iterate on.** Unmerged skeleton faces at full depth are wedges, and re-solving a
    wedge produces nothing worth having. Merging is what makes each recursed input well-conditioned,
    so it is a correctness mechanism before it is an aesthetic one.

16. **Merging is expressed as run-fusion before geometry is built, never as polygon union.**
    `sameLogicalStreet` fuses runs of adjacent exterior edges into one strip, upstream of any
    geometry. The shared ridge between adjacent faces is explicit in the graph, so there is nothing
    to union and no cut provenance to track.

17. **The merge policy is computed in a two-pass call, because `sameLogicalStreet` cannot see areas.**
    Its signature is `(edgeIdA, edgeIdB) => boolean` and it is evaluated before strips exist. Run
    `computeStrips` once per-edge to obtain face areas, compute the partition from those, then re-run
    with a predicate that consults the partition. Two calls, no new geometry, and the heuristic is
    then free to be arbitrarily clever. `minEdgeLength` is the working precedent for the
    merge-until-satisfied shape.

18. **Merging faces adjacent across the medial axis is out of scope, and OBB is the answer when it is
    wanted.** Two faces flanking the medial axis of a long thin region are the pair most worth
    fusing, and they are not neighbours in edge order, so run-fusion cannot express them. Rather than
    teach the merge pass to cross the axis, add OBB splitting as a third subdivision operator
    selectable per level: it cuts across the short axis by construction, has no event ordering,
    always terminates, and is immune to the degeneracy backlog — so an OBB level also serves as a
    numerical reset between skeleton levels. **Parked, not rejected.** Downstream already has it as
    Candidate A with `FitOrientedBox2SimplePolygon` doing the hard part.

19. **The tiling identity holds per level against that level's own input, with a separate conformance
    bound between a level's input and the parent face it came from.** Canonicalisation deliberately
    alters the boundary, so asserting the identity against the root polygon would assert it against
    a polygon that was intentionally changed. The existing check runs at ~1e-15 against a 1e-12
    tolerance and a noise-floor removal will exceed that; the two bounds are different quantities and
    must be stated separately.

### Numerical prerequisites

20. **Unit-extent normalisation lands before anything in this note is built.** The solver's `1e-8` is
    absolute, so the degeneracy test gets *stricter* as the region grows. The C++ port measured this:
    damage fell from 24 of 44 fixtures to 0 of 44, native results byte-identical, and backlog item 1's
    1e8 wrong-skeleton disappeared. It is also decision 7's precondition — without it the noise floor
    needs its own scaling machinery.

21. **`clusterCoincidentMerges` becomes connected components at the same unchanged tolerance, with
    each group sited at the MEMBER nearest its centroid, ties broken lexicographically by position.**
    First-match joining under an absolute tolerance is not transitive, so the partition depends on
    arrival order. The representative must be an actual member: a computed centroid can collide where
    no member does, fusing two independent vertex events into one junction, and the resulting skeleton
    is causally consistent so every wavefront invariant passes it.

22. **The three-edge terminal case is solved in closed form and needs no tolerance.** Each distinct
    exterior parent gives `n·P − t = n·A`; three parents give three equations in `(x, y, t)`. The
    wavefront clock is an unknown rather than a check applied afterwards, so the returned point is by
    construction where all three offset lines coincide at one common offset. Measured downstream
    across 785 terminals: agreement within 3.3e-15, determinant never below 0.106.

23. **The two-edge terminal case routes the `identical-source` verdict it already computes.**
    `intersectRays` classifies coincident sources first, before every other test, and
    `NO_COLLISION_RESULTS` then discards it as "no collision" — at which point the base case throws.
    Terminate both edges at the shared source instead. No new predicate and no new tolerance.

24. **`findOrAddNode` rejects non-finite positions rather than appending.** A NaN position never
    compares equal to itself under an absolute tolerance, so every call appends another node.

25. **Backlog item 7 survives all of the above and is the residual risk.** The collinear dumbbell has
    no redundant vertices — every turn is 90° — so canonicalisation cannot see it. Its degeneracy is
    that *non-adjacent* edges share a supporting line, making wall-to-wall distances exactly equal.
    It produces overlapping strips with `complete: true` and empty diagnostics. Add the fixture.

### Spine extraction

26. **All three candidate definitions are built, and all three are KEPT.** This is not a bake-off in
    which two are deleted. [trunk-with-branches-direction.md](./trunk-with-branches-direction.md)
    already argues on independent grounds for keeping spine extraction parameterisable rather than
    canonical — the spine has to be anchorable to a region's entrances, which is the seam where the
    geometric spine meets the routed road network. `SpineStrategy` is therefore a permanent field on
    `LevelSpec`, not a temporary experiment, and a fourth strategy later costs one variant.

27. **The three are: longest path through the skeleton tree (medial-axis diameter); interior edges
    whose wavefront time exceeds a threshold; degree-based pruning of leaf whiskers below a length
    fraction.** The first takes no parameter, is deterministic, stays connected, and terminates at two
    extremities — so it yields a through-road by construction and cannot yield a cul-de-sac. The
    second branches naturally and is the only one giving trunk-*and-branches* directly. The third
    stays connected by construction, because it only ever removes leaves.

28. **Both thresholds are dimensionless fractions, never absolute lengths.** Whisker pruning is
    already a length fraction. The wavefront-time threshold must be expressed as a fraction of
    `computeMaxOffset`, not as an absolute offset: an absolute slider means a different thing on every
    region, and it would join the list of length-dimensioned inputs that must be scaled across the
    normalisation seam alongside strip depth, `minWidth`/`maxWidth` and `minArea`/`maxArea` — where
    area scales as the square. A fraction crosses that seam untouched, which is one fewer place to
    get decision 20 wrong.

29. **The definition is settled by rendering all three on the `/parcels` page against drawn strokes,
    not by argument.** Both thresholds are sliders. This is the habit that found four defects no test
    caught, applied to the one decision in this note that is purely a matter of what looks right.

30. **The wavefront-time strategy can disconnect the spine, and that must be detected rather than
    discovered.** In a lobed region the lobe centres can survive the threshold while the thin neck
    between them does not, leaving two spines and no trunk. A disconnected spine is a disconnected
    access network, so it is an egress failure and not merely an odd-looking result. Detection is a
    connected-components count on the surviving sub-tree; the policy on detection is open below.

### Strategy composition

31. **Every axis below is strategy-polymorphic, and the AXES are fixed from the outset even where
    their variants are not.** There is no context-free right answer on any of them — each has a
    situation it is the best choice for — so the design commits to composition rather than to a
    default. Retrofitting an axis later means threading a parameter through the recursion driver, the
    dashboard and the port; retrofitting a *variant* into an existing axis costs an afternoon. Those
    two facts together are the whole argument for this shape.

    | Axis | Variants | Conditional on |
    |---|---|---|
    | Depth | continuous `[0, 1]` of max offset | — |
    | Labelling | `boundary`, `spine` | — |
    | Spine strategy | `diameter`, `wavefront-time(f)`, `whisker-prune(f)` | labelling = `spine` |
    | Segment stream | `recurse(LevelSpec)`, `slice`, `void` | — |
    | Residue stream | `recurse(LevelSpec)`, `slice`, `void` | depth < 1 |
    | Merge objective | `count`, `area`, `frontage`, `continuity`, `hybrid` | — |
    | Aspect constraint | continuous bounds | — |
    | Size ladder | `lot+depth`, `lot+branching`, `branching+depth`, `explicit` | see decisions 48–50 |
    | Promotion count | `k: 0 \| 1 \| 2 \| 3 \| …` | see decision 42 for when 0 is legal |
    | Promotion strategy | `longest`, `even-angular`, `largest-adjacent`, `nearest-entrance` | k ≥ 1 |
    | Subdivision operator | `skeleton`, `obb` | — (obb parked, decision 18) |

32. **The four substrates are the actual work; the variants are trivial given them.** The skeleton
    tree (edge lengths, node offsets, degree and leaf queries) carries all three spine strategies. The
    exact cyclic-partition DP carries every merge objective, each of which reduces to a cost function
    over one contiguous group. `Region` plus its access runs carries both labellings. The recursion
    driver carries every stream choice. **Build a variant before its substrate and it becomes a
    bespoke pipeline, at which point the cross-product genuinely does explode.**

33. **The parameter space is a tagged union with conditional branches, not a flat product.** Depth at
    1.0 makes the residue stream inert; spine strategy is meaningless under boundary labelling; a
    spine below full depth is clipped and degrades. Model those as unrepresentable rather than as
    validated-at-runtime. A TypeScript discriminated union maps one-to-one onto the port's
    `TInstancedStruct` variants, so the shape that is honest here is also the shape that ports
    mechanically.

34. **The cross-product matrix is GENERATED from the type definitions, never hand-written.** A
    hand-maintained enumeration of ~20 configurations per level drifts from the code within a week.
    Generation makes drift impossible.

35. **Every matrix cell carries a three-way verdict: `invalid`, `valid-but-poor`, `valid-but-broken`.**
    Invalid is refused at the type level. Valid-but-poor renders and looks wrong, which is *data* —
    the whole point of enumerating the space. Valid-but-broken is an invariant violation, which is a
    defect. **Conflating the last two is how a real bug gets written off as an ugly combination.**

36. **The cross-product is validated by invariant sweep, not by goldens.** Tiling, egress, causality,
    direction and silhouette-invariance are coordinate-free and indifferent to which cell produced the
    geometry, so ~400 two-level configurations are affordable to assert where no golden-file approach
    would survive. This is the pattern the port already runs at 44 fixtures × 7 placements × 3
    invariants.

37. **A generated contact sheet renders the matrix against reference strokes, and it is a deliverable
    rather than a debugging aid.** Invariants prove self-consistency and cannot report wrongness
    nobody thought to assert; the four defects this project's handoff records were all found by
    looking. The contact sheet is also the only instrument that lets a context be *chosen*, since no
    cell can be picked from its parameters alone.

38. **Variants land extremes-first within each axis, not evenly.** Pure target-driven against pure
    continuity-driven merging; `diameter` against `whisker-prune`. The extremes bound the space and
    reveal whether an axis is interesting at all, and the middle is cheap to fill in afterwards
    precisely because decision 32's substrates already exist.

### Spine strategy selection — ruled 2026-08-17 from the rendered comparison

30a. **`diameter` is the strategy to use wherever inner recursions must be REACHABLE; `whisker-prune`
    is a tuned alternative that gives good results when its fraction is chosen for the region.**
    Ruled after rendering all three on the same region, which is how
    [trunk-with-branches-direction.md](./trunk-with-branches-direction.md) always said this would be
    settled. The reasoning is connectivity: `diameter` is connected by construction and terminates at
    two extremities, so every sub-region hanging off it has a route out. `wavefront-time` fragments —
    measured, 8 of 37 corpus fixtures produce a disconnected spine somewhere in a 0.05-step sweep —
    and a fragmented spine cannot carry the access guarantee. **`wavefront-time` is not retired**: it
    is the only one that branches naturally, decision 26 keeps all three, and its fragmentation is
    exactly the diagnostic that made this ruling possible.

30b. **`whisker-prune` has an upper limit past which it returns nothing, and it is nearer than it
    looks.** Measured on a 4×2 rectangle: it converges on the ridge only in the band `(0.293, 0.414)`
    of diameter length, and above that the ridge is itself a whisker and the spine empties. Any tuning
    UI should make that ceiling visible rather than letting a slider run silently into it.

### Connectivity and radial promotion

39. **Any level that creates an inner void must promote at least one radial connector to an access
    route.** This is the general rule by which recursion maintains egress, not a fix for one case. It
    makes connectivity a CONSTRUCTION STEP rather than a property to be discovered: the oracle asserts
    that promotion happened and verifies the resulting network, instead of traversing geometry hoping
    to find that something reaches something.

40. **The candidate set is the strip seams, and it already exists in the data.** At partial depth each
    strip's side boundary is the skeleton bisector chain running inward from a perimeter vertex to the
    offset contour — precisely the edges connecting outer perimeter to inner perimeter. `CornerContext`
    ([strip-decomposition.ts:73](../../packages/core/src/straight-skeleton/strip-decomposition.ts))
    already names this seam; the work is exposing the set as a first-class list, not deriving it.

41. **The promotion count `k` is what expresses through-traffic, and it is a parameter rather than a
    consequence.** `k = 1` is a no-through residential pocket reached by a single lane; `k = 2` is a
    pass-through route; `k = 4` is a crossroads. Nothing about the geometry decides this and nothing
    should try to.

42. **`k = 0` is legal exactly when the void is not built on.** A courtyard that stays a shared garden
    needs no connector. The moment the residue stream is `slice` or `recurse`, `k ≥ 1` is mandatory
    and the type should refuse otherwise. **The "gated courtyard" and "village green" readings are the
    `k = 0` and `k ≥ 1` cases of one rule**, which is the strongest available evidence that the rule
    is the right one.

43. **Carve the lane corridor out of the strip's arena BEFORE slicing, never out of finished parcels.**
    Subtracting a corridor from two flanking lots can push them under `minArea`, which re-triggers
    `mergeUndersizedParcels`, which can dissolve a cut the slicer just made. Carving first means the
    slicer works on a slightly smaller arena and never creates the parcels that would have been eaten.

44. **The tiling identity gains a third term: strips + rings + lanes = polygon.** Lanes become a
    first-class accounted region. The check has two terms today and will silently under-account
    without this.

45. **Egress is restated for all levels: every leaf owns a non-degenerate frontage run on a street, a
    lane, or a void that a promoted lane reaches.** The reach is guaranteed by decision 39 rather than
    discovered, so the invariant stays checkable without a general reachability search.

46. **Length-dimensioned parameters divide into two classes and the spec labels which is which.**
    ABSOLUTE quantities are physical and must be scaled across the normalisation seam — lane width,
    spine width, `minWidth`/`maxWidth`, `minArea`/`maxArea` (as the square), strip depth in world
    units. FRACTIONAL quantities are dimensionless and cross the seam untouched — the spine thresholds
    of decision 28, depth as a fraction of max offset, aspect bounds. **A road is four metres wide
    however large the region is; a whisker threshold is not.** Mislabelling either way is the defect
    class decision 20 exists to prevent.

47. **Lane width must exceed the canonicalisation noise floor by the margin of decision 4.** A
    corridor narrower than the floor would be removed by the next level's canonicalisation, which is
    a contradiction the type system cannot catch and a validity check must.

### The size ladder

48. **The third quantity is a BRANCHING FACTOR, not a block size, and that is what makes the relation
    close.** Block size is not independent of region area, so `{lot size, block size, depth}` are not
    peers. Branching — how many pieces a level divides its region into — is dimensionless, and gives
    `L = A / b^D` for region area `A`. Block size at level *i* is `A / b^i`, **derived**. Being
    dimensionless, `b` sits on the fractional side of decision 46 and means the same thing on a
    courtyard as on a whole resort.

49. **Any two of `{lot size, branching, depth}` may be specified and the third is derived; the mode is
    a dropdown.** `lot+depth` guarantees the leaf size, which is what a dwelling footprint demands.
    `lot+branching` derives a depth that will not be an integer and must round, shifting the achieved
    lot size. `branching+depth` gives direct control of street-network density and lets lot size fall
    out. A fourth `explicit` mode specifies a per-level ladder directly and is what non-uniform tiers
    would use. **All four produce the same internal representation — a per-level size ladder — and the
    recursion driver consumes only that.**

50. **The ladder is geometric, never arithmetic**, because subdivision is multiplicative: each tier
    divides by roughly constant `b`.

51. **Derived quantities are displayed read-only beside the specified ones, and a ladder that cannot
    exist is reported through the same path as an unsubdividable block.** Lot size plus depth on a
    small region can derive a branching factor of 1.3 — a level that barely subdivides — and a large
    lot size at depth 3 in a small region has no ladder at all. Computing these silently makes the
    dropdown a trap.

52. **A specified size is a TARGET and never a guarantee.** The merge DP hits an area target
    approximately and `minArea`/`maxArea` bound the leaves independently, so the result carries the
    achieved size distribution alongside the requested ladder.

---

## Build sequence

Phases, in order. Each pauses for confirmation before the next.

1. **Solver numerical hardening** — decisions 20–25. No new architecture, unblocks everything, and
   recursion cannot proceed without it: feeding solver output back as input is the exact regime these
   close. Invisible; gated on the existing suites plus a measurable change at 1e8.
2. **Canonicalisation** — decisions 1–9, including the silhouette-invariance metamorphic test.
   Depends on phase 1 by decision 7. Invisible.
3. **Substrates and a walking skeleton** — decision 32's four substrates, plus exactly one end-to-end
   path (single level, boundary labelling, one merge objective) rendering on `/parcels`. **This is
   the architecture phase and the one not to rush**, but it ends with something on screen, because
   three invisible phases in a row contradicts the habit that found four defects no test caught.
4. **Widen the axes, extremes first** — decision 38.
5. **The generated matrix and contact sheet** — decisions 34, 37. The instrument the aesthetic
   decisions get made with.

## Downstream — what the C++ consumer currently believes

The port is at `Source/PistePerfect/{Private,Public}/Geometry/Skeleton` in the game repo, with this
repo vendored beside it as a read-only reference. Its journal decision 99, ruled 2026-08-16, commits
to recursive mode composition — and encodes the droste reading only, on the substrate argument that a
boundary pass's courtyard is already a well-formed region. It adds that all-Boundary recursion "needs
no new geometry — only the inner-ring recursion."

**That is true of droste recursion and false of segment recursion**, which needs the merge pass in
decisions 15–17 and the access-set generalisation in decisions 11–12. Decision 99 also defers
trunk-and-branch to this repo explicitly and will port whatever is proven here, so the correction is
cheap now and expensive once the mode list is built.

Their divergence register lists decisions 20 and 24 above as D1 and D2, and their
`ISSUE-skeleton-terminal-cases-no-coincidence-handling.md` is decisions 21–23. Decision 21 is already
fixed in the port; 22–25 are open in both.

## Open

- **Backlog item 4 — terminal many-way events cannot be projected — has moved from PARKED to ON THE
  CRITICAL PATH for this arc, and it got worse.** `computeOffsetRings` is how the residue stream of
  decision 10 obtains its region, and recursion produces symmetric machine-generated geometry, which
  produces many-way events by construction — precisely what the projection cannot close. Measured when
  the coincidence clustering landed: `unclosedChains` rose on four of seven near-regular fixtures
  (ellipse-16 1→4, ellipse-32 4→5, peanut-32 0→4, rosette5-40 6→22), attributed by isolation to the
  clustering alone. **That rise is correct behaviour**: connected components fuse events the
  first-match partition wrongly split, so there are genuinely more many-way arrivals and the known
  downstream limit is exercised at more of them. Every fixture still solves completely. **Droste
  recursion cannot be built on a projection that drops rings at exactly the events symmetry
  generates**, so this now precedes decision 10's residue stream rather than sitting behind it.
- **A POWER-OF-TWO normalisation scale would make the round trip bit-exact, and recursion is what
  makes that worth having.** Scaling by `2 ** Math.round(Math.log2(longestSide))` instead of by
  `longestSide` keeps the polygon within √2 of unit extent while making normalise/denormalise exactly
  invertible: a power-of-two multiply is exact, and for a translated polygon the centring subtraction
  is exact by Sterbenz. Measured after decision 20 landed, the current scale leaves ≤3.2e-14 relative
  movement at native. **One solve can absorb that; a three-level recursion crosses the seam at every
  level and compounds it, against a tiling identity asserted per level.** The upstream port had no
  reason to want this and we do. Two lines, but it moves the pass/fail boundary and needs the whole
  envelope re-measured, so it is its own task.
- **`inEdges` ordering is unstable under any arithmetic perturbation** — 21 of 37 fixtures reorder at
  native placement with identical sets. Anything downstream depending on that order is depending on a
  tie-break. Sort where the list is built, or establish that nothing reads it.
- **A lone NaN vertex is invisible to the bounding-box scan** and travels into the solve intact, because
  every comparison against NaN is false. Decision 24 rejects non-finite positions at `findOrAddNode`,
  which is downstream of this; the entry points do not validate their input polygon at all.
- **`collision-helpers.ts:213` treats a `maxOffset` of exactly 0 as absent**, via a truthy test rather
  than an `undefined` check. Latent, pre-existing, and a real difference from the ported version.
- **Post-solve debug recomputation still runs in caller space.** `generateCollisionSweep` and
  `useCollisionSweep` take a denormalised context and regenerate collisions against the absolute
  epsilon, so the dashboard's sweep overlay keeps the magnitude sensitivity the solve itself no longer
  has. The contact sheet of decision 37 will render through this path.
- **Assert and log text now reports unit-space coordinates**, because that is where the solver stands.
  A debuggability cost the upstream port recorded and also did not fix; the transform is not threaded
  into the context.
- **The merge cost functions, stated precisely.** Decision 31 fixes the objectives as an axis, which
  dissolves the question of which one is right, but each still needs defining before it can be
  implemented: whether the per-group cost is absolute, squared or relative deviation from target, and
  whether the DP minimises the sum, the maximum or the variance across groups. Those choices change
  the output materially and are not interchangeable.
- **The aspect-ratio bounds** (decision 15's constraint). Engineering's to pick, but unpicked.
- **Which two of {lot size, block size, depth} are specified and which is derived.** They are not
  independent — merge to 6 blocks yielding ~6 each gives 36 leaves — so one of the three must fall out
  of the other two, and which one is a design-intent call rather than a technical one.
- **What a disconnected wavefront-time spine should do** (decision 30). Take the largest component and
  report the loss, refuse the strategy at that threshold, or return every component and let the
  caller decide. Refusing is the most honest and the most annoying; the choice is best made once the
  slider exists and it is clear how often the threshold lands there.
- **Depth 3 as a cap or as a target** (decision 14). If a block is already at leaf size after level 1,
  does recursion stop or continue? Size-driven and depth-driven termination give different trees, and
  the original framing of merging "toward a target range of parcel size or parcel count" implies the
  first while decision 14 currently reads as the second.
- **`SliceOptions` per level, or one set throughout.** A level-1 slice and a level-3 slice presumably
  want different lot sizes, and nothing currently says whether the options are a level property.
- **The root region's access runs.** `Region` lets a caller supply a subset of the perimeter as
  access, which is the same mechanism a region's entrances would use — but nothing states whether the
  default is the whole perimeter or whether the caller must supply it. A region marked against a cliff
  or an existing piste has a perimeter that is not all street.
- **What a block that cannot be subdivided does.** Too small, too thin, aspect constraint
  unsatisfiable, or the solve fails. Emit as a single leaf, refuse, or report. Downstream has the OBB
  fallback for this; upstream has nothing.
- **Whether the spine has width.** At full depth under spine labelling, a zero-width spine means lots
  meet along it; a spine with width sets them back and consumes area. Same question as lane width,
  never resolved in [trunk-with-branches-direction.md](./trunk-with-branches-direction.md).
- **Whether lane CLASS varies by level.** A level-1 connector is plausibly a road and a level-3 one a
  footpath, and the consuming game distinguishes them. Nothing says whether class is a level property
  or uniform.
- **Seed derivation across levels.** `sliceStrip` guarantees bit-identical output for a given seed;
  recursion needs a rule deriving each block's seed from its parent, or the whole tree is
  irreproducible and the contact sheet is unstable.
