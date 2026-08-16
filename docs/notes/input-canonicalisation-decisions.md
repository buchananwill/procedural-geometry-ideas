---
title: "Input Canonicalisation: Fixed Design Decisions"
type: decision-spec
status: implementer-handoff
---

# Input canonicalisation

## Implementer's Brief

**You are running under the FSM review protocol.** Before any implementation, post your smoketest hello to the `general` channel, then drive the work through the mandated role transitions. **You may not self-certify completion**: a task is done only when the review cycle has posted approving verdicts and the server marks it integrated. Skipping the smoketest, the transitions, or the review cycle is a protocol violation, not a shortcut.

**This document is a design specification, not a sequenced plan — you have full discretion over implementation order.** **First, inspect `git log`** to determine which case you are in. **Greenfield** (no prior plan or work committed): derive your own phased implementation plan and **write it into the repository as your first action** — this committed plan is the recovery baseline that lets any later run (including your own, after an interruption) resume instead of restarting. **Resuming** an interrupted run (a committed plan and/or partial implementation already exists): read that plan, locate the last committed checkpoint, and continue from there — do not restart, and do not re-author the plan. **Do not commit manually** — in the container a manual commit stays local and is lost when the container exits; persistence to the remote happens *only* through the build flow, which auto-commits and pushes. So the moment your plan is written, **request a build to checkpoint it to the remote**, and trigger a build at every suitably-scoped milestone thereafter — each build-commit is the audit trail required to diagnose and resume from a failure mid-run. To keep your own context lean for steering the work, launch sub-agents whenever additional code-context is needed (existing systems, engine APIs, style references); you may write and edit directly, or delegate implementation to sub-agents to preserve that leanness. Reconcile everything against the project's established style practices and the existing code. Your work will be reviewed against the artefacts in this document — **the type roster and the decisions/specification** — treat them as the contract.

---

The solver gains a normalisation stage that removes boundary geometry too small to see, before the
skeleton sees it. A vertex whose perpendicular deviation from the chord between its neighbours falls
below a render-scale noise floor contributes nothing to the polygon's silhouette; it contributes only
numerical difficulty, and it is removed.

This is not hygiene. It **eliminates an input class the solver has a standing defect on** — backlog
item 3, exactly-subdivided reflex polygons, whose fix was written, landed, measured and reverted once
already for costing several hundred lines in the solver's most delicate function. Removing the input
is a better answer than handling it.

The stage exists because the recursive subdivision arc feeds solver output back as solver input at
every level. **Recursion is not allowed to accidentally introduce fractal complexity**, and this is the
mechanism that enforces it.

## 1. Type Roster

**New — [canonicalisation.ts](../../packages/core/src/straight-skeleton/canonicalisation.ts)**

```ts
export interface CanonicalPolygon {
    /** The surviving vertices, in input order, closed ring, no duplicated closing vertex. */
    vertices: Vector2[];
    /** How many input vertices were removed. Zero means the input was already canonical. */
    removedCount: number;
    /** The largest perpendicular deviation actually discarded. Zero when nothing was removed. */
    maxDeviation: number;
}

export function canonicalisePolygon(
    vertices: readonly Vector2[],
    noiseFloor: number,
): CanonicalPolygon;
```

- `SKELETON_NOISE_FLOOR: number` — the unit-space constant of decision 5.

**Changed**

- `SkeletonDiagnosticKind` ([types.ts](../../packages/core/src/straight-skeleton/types.ts)) — gains `'vertices-canonicalised'`.
- `SolveSkeletonOptions` ([algorithm-termination-cases.ts](../../packages/core/src/straight-skeleton/algorithm-termination-cases.ts)) — gains an optional override of the noise floor, defaulting to `SKELETON_NOISE_FLOOR`.
- `solveSkeleton`, `runAlgorithmV5`, `runAlgorithmV5Stepped` — canonicalise after normalising.

**Reused, not reimplemented**

- `distanceToSegment` ([vertex-budget.ts](../../packages/core/src/stroke-spline/vertex-budget.ts)) — the deviation predicate already exists and is already the one RDP uses.

## 2. Decisions / Specification

### What is removed

1. **The predicate is PERPENDICULAR DEVIATION FROM THE CHORD, never turn angle.** A needle spike has an
   invisible deviation and a large turn angle; a gently curving collinear run has the reverse.
   Deviation is what "cannot be seen" means geometrically. Use `distanceToSegment` rather than writing
   a second implementation of it — this codebase already has the predicate, and RDP is built on it.

2. **Removal is iterative to a fixed point, not a single pass.** Removing a vertex changes its
   neighbours' chords, which can bring a previously-surviving vertex under the floor. A single pass
   leaves a result that depends on iteration order; iterating to stability does not.

3. **A polygon is never reduced below three vertices**, whatever the floor says. A degenerate input
   stays degenerate and fails honestly downstream rather than being silently turned into something
   that is not a polygon at all.

4. **Canonicalisation runs AFTER unit-extent normalisation, inside unit space.** The floor is then a
   fixed constant that is relative by construction, and there is one tolerance system rather than two.
   The alternative — a caller-space floor scaled per polygon — reintroduces exactly the
   absolute-tolerance defect that normalisation was landed to remove.

### The floor

5. **`SKELETON_NOISE_FLOOR` is a unit-space constant, and it must be MEASURED against the fixture
   corpus rather than guessed.** Establishing it is the first work of this task, not a precondition of
   it. The measurement to run: sweep candidate floors across the corpus and record, at each, how many
   vertices are removed per fixture and whether the solve, the offset rings and the strips still
   succeed. **Report the sweep, not just the chosen value** — the number matters less than the evidence
   that it sits in a wide flat region rather than on a cliff edge.

6. **The floor must exceed `FLOATING_POINT_EPSILON` by orders of magnitude, and that gap is the entire
   point of the stage.** If the two are comparable the pass buys nothing: a vertex at 1.1× epsilon
   survives canonicalisation and is still sitting inside the solver's degenerate band. The gap is what
   makes every surviving vertex *comfortably* non-degenerate. **A candidate floor within one order of
   magnitude of the epsilon should be treated as evidence the measurement is wrong, not as a result.**

7. **The floor is relative to the ROOT region's extent, not to a sub-region's.** For a direct
   `solveSkeleton` call the root is that polygon, so this reduces to the normalisation already applied.
   It is stated here because the recursion driver will later pass sub-regions through this same stage,
   and normalising each to its own extent would scale a thin sliver up enormously and leave it holding
   every degenerate vertex it has — the opposite of the intent. **Take the floor as a parameter, do not
   recompute it from the polygon in hand.**

### Reporting

8. **Canonicalisation is reported through `diagnostics`, never silently.** A `vertices-canonicalised`
   diagnostic carries the removed count and the maximum deviation discarded. `solveSkeleton` already
   reports `winding-normalised` for precisely this class of silent input correction, and the
   established position in this repo is that a silent correction alongside `complete: true` is the
   worst thing a result type can do.

9. **A `vertices-canonicalised` diagnostic does NOT make a result incomplete.** It joins
   `winding-normalised` and `self-intersecting` as informational; `complete` continues to turn on
   `step-failure` and `unresolved-edges` alone.

### The invariant this creates

10. **Pipeline output is invariant under silhouette-preserving vertex insertion, and this is the
    metamorphic test that proves it.** Take a fixture, subdivide its edges — insert vertices that lie
    on the segments they subdivide — and assert the solved skeleton and the resulting parcels come back
    the same. It needs no expected coordinates, it is strictly stronger than "solves completely", and
    it transfers verbatim to the downstream C++ port.

11. **Subdivide at IRREGULAR parameters as well as regular ones.** Backlog item 3 records the reflex L
    failing at k = 5, 6, 8, 10 and passing at k = 1, 2, 3, 4, 7, 9 under equal subdivision — a pattern
    with no smooth explanation, which is exactly the signature of a test that only probes one family.
    Probe both.

12. **The observable is the TILING and the LOT SET. Nothing else.** Not the vertex list, not exterior
    edge ids, not the internal strip partition. Declaring the observable narrowly is what makes removal
    sound rather than merely plausible, and it must be stated in the test's own header so a later
    reader does not widen it by accident.

13. **Two mechanisms are keyed to edge COUNT or IDENTITY rather than to shape, and decision 10's test
    must be pointed at them specifically.** `sameLogicalStreet` is called once per adjacent exterior
    edge pair and `minEdgeLength` merges runs by frontage length
    ([strip-decomposition.ts](../../packages/core/src/straight-skeleton/strip-decomposition.ts)), so
    changing how many edges a silhouette is expressed in can change the strip partition and therefore
    everything downstream of it. **If the invariant fails, this is the first place to look, and a
    failure here is a genuine finding rather than a test defect.**

14. **Backlog item 3 is expected to be RETIRED by this change, and the measurement is part of the
    task.** `reflex-subdivision.test.ts` pins the failing set exactly so that drift in either direction
    is loud. Re-measure it and report the new set. If it does not go empty, say so plainly and report
    what remains — a partial result honestly reported is worth more than a gate quietly relaxed.

14a. **Three specific lists must go empty, and one of them is an OPEN REGRESSION this task is the
    scheduled fix for.** `REFLEX_L_KNOWN_FAILURES` is `[5, 6, 8, 10]`;
    `DOUBLE_REFLEX_PLUS_KNOWN_FAILURES` is `[9]`; and `failingSubdivisions(L_SHAPE)` in
    `stroke-derived-polygons.test.ts` is `[4, 6, 7, 8, 9, 10]`. **The plus's list was empty until the
    normalisation scale became a power of two**, and its header records the regression as open rather
    than settled.

    **Why this task is the fix, and the reasoning is the whole justification for the stage.** Those
    fixtures span exactly 300 units, so the pre-power-of-two scale was exactly their span — and
    dividing by exactly the span put uniformly subdivided vertices on exact fractions in unit space,
    on the bit. **The old scale was canonicalising that input by accident.** Subdividing an edge into
    k equal pieces adds exactly-collinear vertices and nothing else; removing them restores the
    unsubdivided fixture, which passes at every k. Measured and recorded at the power-of-two merge:
    taking the scale exponent by `Math.ceil` and by `Math.floor` — opposite directions of relative
    epsilon — reproduces the identical failure set, and rescaling a fixture to span exactly 256 shuffles
    the set's membership without changing its size. **It is not a tolerance-against-magnitude problem
    and must not be attacked as one.**

    **If these lists do not go empty, that is the headline result of the task**, not a footnote: it
    would mean the failures survive canonical input and the defect is structural after all, which
    reopens the reverted layer-partitioning fix rather than this stage.

15. **Backlog item 7 is NOT retired by this change and must not be expected to be.** The collinear
    dumbbell has no redundant vertices — every one of its twelve turns is 90° — so no vertex-local
    predicate can see it. Its degeneracy is that *non-adjacent* edges share a supporting line, making
    wall-to-wall distances exactly equal so the pinches land in one layer. **Its characterisation test
    should still fail in exactly the way it failed before.** A dumbbell that suddenly passes means
    something unintended changed.

### Verification

16. **Convict the gate by mutation before trusting it.** Disable the removal and show decision 10's
    metamorphic test goes red; a test that cannot fail is not a gate.

17. **The acceptance gate is the full suite twice with the failure sets intersected, plus the
    translation and scale envelope unmoved.** The envelope stands at 37 of 37 `ALL_TEST_POLYGONS` at
    every translate from native to 1e11 and every scale from 1e-6 to 1e8. Canonicalisation should not
    touch it; report the table and treat any regression as a failure of this task.

18. **Report which fixtures are canonicalised at all, and by how much.** Most of the corpus is expected
    to be untouched — a hand-authored fixture rarely carries invisible vertices. **A floor that removes
    vertices from most of the corpus is too high**, and this report is how that is caught before the
    value is committed to.

## 3. Deferred (explicitly out of scope)

- **The recursion driver, and passing sub-regions through this stage.** Decision 7 exists so the
  parameter is shaped correctly for it; wiring it is later work.
- **Fixing whatever decision 13's test may expose in the strip partition.** Finding it is in scope,
  fixing it is not — it is a separate defect with its own evidence.
- **Backlog item 7, the collinear dumbbell.** See decision 15: out of reach of this mechanism by
  construction.
- **Applying a floor to the offset contour or to strip boundaries.** This task canonicalises the input
  polygon at the solver entry points only.
- **Rejecting non-finite input vertices.** A lone NaN is invisible to a bounding-box scan and travels
  into the solve intact. A real gap, tracked separately, and not this.

## 4. Retirement

Nothing is deleted. `dropRepeatedVertices`
([strip-decomposition.ts](../../packages/core/src/straight-skeleton/strip-decomposition.ts)) handles
coincident vertices on offset contours and **stays exactly where it is** — it is a different predicate
at a different pipeline stage, and folding the two together would apply a render-scale floor to
machine-generated contour geometry that has not been measured for it.
